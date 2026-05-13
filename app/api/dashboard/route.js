import { NextResponse } from 'next/server'
import { addDays, differenceInDays, differenceInMinutes, format, parseISO, startOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { createTenantSupabase } from '@/lib/supabase'
import { resolveAuthorizedCompany } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
}

const PAGE_SIZE = 1000
const MAX_REQUI_ROWS = 20000
const MAX_SALES_ROWS = 20000
const PRODUCTION_TIME_ZONE = 'America/Sao_Paulo'
const EXPECTED_TIME_SQL = `(date_trunc('hour', ped.pedhrentre::time) - interval '3 hours')::time`
const ACTUAL_TIME_SQL = `(ped.pedhrsaida::time - interval '3 hours')::time`
const ACTUAL_DATETIME_SQL = `coalesce((ped.peddtsaida::date + ${ACTUAL_TIME_SQL}), ped.peddtsaida::timestamp)`
const NORMALIZED_PEDCODIGO_SQL = `coalesce(nullif(ltrim(replace(ped.pedcodigo::text, '.000', ''), '0'), ''), '0')`
const EXCLUDED_CLIENT_CODES = [489]
const EXCLUDED_COMPANY_CODES = [2]

function getErrorStatus(error) {
  const message = String(error?.message || '')
  if (message.includes('Nao autorizado')) return 401
  if (message.includes('Acesso negado')) return 403
  if (message.includes('nao encontrada')) return 404
  return 500
}

function combineDateTime(dateValue, timeValue) {
  const datePart = extractDatePart(dateValue)
  if (!datePart) return null

  const timePart = extractTimePart(timeValue)
  if (!timePart) return datePart

  return `${datePart}T${timePart}`
}

function extractDatePart(value) {
  if (!value) return null
  if (value instanceof Date) {
    const pad = number => String(number).padStart(2, '0')
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }

  const text = String(value).trim()
  const match = text.match(/(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

function extractTimePart(value) {
  if (!value) return null
  if (value instanceof Date) {
    const pad = number => String(number).padStart(2, '0')
    return `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
  }

  const text = String(value).trim()
  const fullMatch = text.match(/(\d{2}:\d{2}:\d{2})/)
  if (fullMatch) return fullMatch[1]

  const shortMatch = text.match(/(\d{2}:\d{2})(?!:)/)
  return shortMatch ? `${shortMatch[1]}:00` : null
}

function parseLocalDateTime(value) {
  if (!value) return null
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), value.getHours(), value.getMinutes(), value.getSeconds())
  }

  const text = String(value).trim()
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!match) {
    const parsed = new Date(text)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
}

function localDateTimeText(value) {
  const parsed = parseLocalDateTime(value)
  if (!parsed) return null
  const pad = number => String(number).padStart(2, '0')
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`
}

function countEncodingArtifacts(text) {
  if (!text) return 0
  const matches = text.match(/[�ÃÂ]/g)
  return matches ? matches.length : 0
}

function normalizeText(value) {
  if (value == null) return ''

  const original = String(value).trim()
  if (!original) return ''

  let best = original

  try {
    const repaired = Buffer.from(original, 'latin1').toString('utf8').trim()
    const repairedLooksBetter =
      repaired &&
      countEncodingArtifacts(repaired) < countEncodingArtifacts(best) &&
      /[A-Za-zÀ-ÿ]/.test(repaired)

    if (repairedLooksBetter) best = repaired
  } catch {
    // ignore best-effort decoding failures
  }

  return best.replace(/\uFFFD/g, '').trim()
}

function cleanConfigValue(value) {
  let text = String(value || '').trim()
  if (!text) return ''

  while (true) {
    const next = text
      .replace(/^\\?"/, '')
      .replace(/\\?"$/, '')
      .replace(/^\\?'/, '')
      .replace(/\\?'$/, '')
      .trim()

    if (next === text) break
    text = next
  }

  return text
}

function resolveSupabaseConfig(company, companySecrets) {
  const url = cleanConfigValue(
    companySecrets?.supabaseUrl ||
      companySecrets?.supabase_url ||
      company?.supabaseUrl ||
      company?.supabase_url ||
      (company?.isPremiumLab ? process.env.SUPABASE_URL : '')
  )

  const serviceRoleKey = cleanConfigValue(
    companySecrets?.supabaseServiceRoleKey ||
      companySecrets?.serviceRoleKey ||
      companySecrets?.supabase_service_role_key ||
      company?.supabaseServiceRoleKey ||
      company?.serviceRoleKey ||
      company?.supabase_service_role_key ||
      (company?.isPremiumLab ? process.env.SUPABASE_SERVICE_ROLE_KEY : '')
  )

  return { url, serviceRoleKey }
}

function normalizeOrderCode(value) {
  if (value == null) return ''

  const text = String(value).trim()
  if (!text) return ''

  if (/^\d+\.0+$/.test(text)) {
    return text.replace(/\.0+$/, '')
  }

  const number = Number(text)
  if (Number.isFinite(number) && Number.isInteger(number)) {
    return String(number)
  }

  return text
}

function nowInProductionTimeZone() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PRODUCTION_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date())

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return new Date(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  )
}

function orderIsDelayed(expected, delivered, now) {
  if (!expected) return false
  return (delivered && delivered > expected) || (!delivered && now > expected)
}

function resolveStatus(expected, delivered, now) {
  if (delivered) return delivered > expected ? 'delayed_completed' : 'completed'
  return now > expected ? 'delayed' : 'in_progress'
}

function normalizeFilterValue(value, field) {
  if (value == null) return ''
  const text = String(value)
  if (['emissao', 'previsto', 'saida', 'dataHora'].includes(field)) return text.slice(0, 10)
  return text.trim().toLowerCase()
}

function rowMatchesFilter(row, field, value) {
  if (!(field in row)) return true
  return normalizeFilterValue(row[field], field) === normalizeFilterValue(value, field)
}

function rowMatchesAnyFilter(row, field, values) {
  if (!Array.isArray(values) || values.length === 0) return true
  return values.some(value => rowMatchesFilter(row, field, value))
}

function parseCsvParam(searchParams, key) {
  return [...new Set(
    String(searchParams.get(key) || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
  )]
}

function minutesUntil(dateValue, now) {
  if (!dateValue) return null
  return differenceInMinutes(dateValue, now)
}

function resolveRowTone(status, expected, delivered, now) {
  if (status === 'delayed' || status === 'delayed_completed') return 'danger'
  if (!delivered) {
    const remainingMinutes = minutesUntil(expected, now)
    if (remainingMinutes != null && remainingMinutes >= 0 && remainingMinutes <= 24 * 60) return 'warning'
  }
  return 'success'
}

function buildDelayRank(expected, delivered, now) {
  if (!expected) return Number.MIN_SAFE_INTEGER
  return differenceInMinutes(delivered || now, expected)
}

function buildStatusPriority(status) {
  if (status === 'delayed') return 4
  if (status === 'in_progress' || status === 'pending') return 3
  if (status === 'delayed_completed') return 2
  if (status === 'completed') return 1
  return 0
}

function buildRouteStepLabel(alxcodigo, descricao) {
  const normalizedDescription = normalizeText(descricao)
  const ascii = normalizedDescription
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .trim()
  const firstToken = ascii.split(/\s+/).find(Boolean) || ''
  const shortCode = firstToken.slice(0, 3).toUpperCase()
  const prefix = alxcodigo != null ? `${alxcodigo}` : ''
  if (prefix && shortCode) return `${prefix}-${shortCode}`
  return prefix || shortCode || '-'
}

function normalizeCachedRouteStep(step) {
  const rawLabel = String(step?.label || '').trim()
  const rawCode = step?.alxcodigo == null ? '' : String(step.alxcodigo).trim()
  const normalizedLabel =
    !rawLabel || /^\d+$/.test(rawLabel)
      ? buildRouteStepLabel(rawCode || rawLabel, step?.descricao)
      : rawLabel

  return {
    ...step,
    alxcodigo: rawCode || rawLabel,
    label: normalizedLabel,
  }
}

async function fetchAllPages(queryFactory, { pageSize = PAGE_SIZE, maxRows = MAX_REQUI_ROWS } = {}) {
  const rows = []

  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize - 1, maxRows - 1)
    const { data, error } = await queryFactory().range(from, to)
    if (error) return { data: rows, error }

    const page = data || []
    rows.push(...page)
    if (page.length < pageSize) break
  }

  return { data: rows, error: null }
}

async function fetchOptionalPages(queryFactory, options) {
  const result = await fetchAllPages(queryFactory, options)
  if (!result.error) return result

  const message = result.error.message || ''
  if (message.includes('Could not find the table') || message.includes('relation') || message.includes('does not exist')) {
    return { data: [], error: null }
  }

  return result
}

async function fetchClientLookup(supabase, clientIds = []) {
  const ids = [...new Set((clientIds || []).map(asSqlNumber).filter(Number.isFinite))]
  if (ids.length === 0) return new Map()

  const chunks = chunkArray(ids, 500)
  const rows = []

  for (const chunk of chunks) {
    const result = await fetchOptionalPages(
      () =>
        supabase
          .from('clien')
          .select('clicodigo, clinomefant, clirazsocial')
          .in('clicodigo', chunk),
      { maxRows: 2000 }
    )

    if (result.error) throw new Error(result.error.message || 'Falha ao carregar clientes.')
    rows.push(...(result.data || []))
  }

  return new Map(
    rows.map(row => [
      String(row.clicodigo),
      normalizeText(row.clinomefant || row.clirazsocial),
    ])
  )
}

async function fetchSellerLookup(supabase, sellerIds = []) {
  const ids = [...new Set((sellerIds || []).map(asSqlNumber).filter(Number.isFinite))]
  if (ids.length === 0) return new Map()

  const chunks = chunkArray(ids, 500)
  const rows = []

  for (const chunk of chunks) {
    const result = await fetchOptionalPages(
      () =>
        supabase
          .from('funcio')
          .select('funcodigo, funnome')
          .in('funcodigo', chunk),
      { maxRows: 2000 }
    )

    if (result.error) throw new Error(result.error.message || 'Falha ao carregar vendedores.')
    rows.push(...(result.data || []))
  }

  return new Map(
    rows.map(row => [
      String(row.funcodigo),
      normalizeText(row.funnome),
    ])
  )
}

async function fetchOrderBaseRows(supabase, { dateStart, dateEnd, pedcodigos = [], clicodigos = [], gclcodigos = [] }) {
  const pedidoIds = [...new Set((pedcodigos || []).map(asSqlNumber).filter(Number.isFinite))]
  const pedidoCodes = [...new Set((pedcodigos || []).map(value => String(value || '').trim()).filter(Boolean))]
  const clienteList = [...new Set((clicodigos || []).map(asSqlNumber).filter(Number.isFinite))]

  const result = await fetchAllPages(() => {
    let query = supabase
      .from('pedid')
      .select('peddtemis,pedpzentre,pedhrentre,peddtsaida,pedhrsaida,clicodigo,funcodigo,pedcodigo,id_pedido,pedsitped,empcodigo')
      .gte('peddtemis', `${dateStart}T00:00:00`)
      .lt('peddtemis', `${dateEnd}T23:59:59`)
      .neq('pedsitped', 'C')
      .order('peddtemis', { ascending: false })

    for (const code of EXCLUDED_CLIENT_CODES) {
      query = query.neq('clicodigo', code)
    }

    for (const code of EXCLUDED_COMPANY_CODES) {
      query = query.neq('empcodigo', code)
    }

    if (clienteList.length > 0) {
      query = query.in('clicodigo', clienteList)
    }

    if (pedidoIds.length > 0) {
      query = query.in('id_pedido', pedidoIds)
    } else if (pedidoCodes.length > 0) {
      query = query.in('pedcodigo', pedidoCodes)
    }

    return query
  }, { maxRows: MAX_SALES_ROWS })

  if (result.error) return result

  const rows = (result.data || []).filter(row => {
    if (!Array.isArray(gclcodigos) || gclcodigos.length === 0) return true
    return true
  })

  return { data: rows, error: null }
}

async function fetchDashboardCacheRows(supabase, { dateStart, dateEnd, clicodigos = [], gclcodigos = [] }) {
  const clientIds = [...new Set((clicodigos || []).map(asSqlNumber).filter(Number.isFinite))]
  const groupIds = [...new Set((gclcodigos || []).map(asSqlNumber).filter(Number.isFinite))]

  try {
    const result = await fetchAllPages(() => {
      let query = supabase
        .from('pedido_dashboard_cache')
        .select('id_pedido,pedcodigo,clicodigo,clinome,gclcodigo,vendedor_codigo,vendedor_nome,emissao,previsto,saida,quantidade,status,current_cell,caixa,indice,delay_rank,status_priority,row_tone,roteiro_resumo,roteiro_json')
        .gte('emissao', `${dateStart}T00:00:00`)
        .lt('emissao', `${dateEnd}T23:59:59`)
        .order('emissao', { ascending: false })

      if (clientIds.length > 0) {
        query = query.in('clicodigo', clientIds)
      }

      if (groupIds.length > 0) {
        query = query.in('gclcodigo', groupIds)
      }

      return query
    }, { maxRows: MAX_SALES_ROWS })

    if (result.error && String(result.error.message || '').includes("Could not find the table 'public.pedido_dashboard_cache'")) {
      return { data: [], error: null, missingCacheTable: true }
    }

    return result
  } catch (error) {
    if (String(error?.message || '').includes("Could not find the table 'public.pedido_dashboard_cache'")) {
      return { data: [], error: null, missingCacheTable: true }
    }
    throw error
  }
}

function asSqlDate(value, fallback) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : fallback
}

function asSqlNumber(value) {
  if (value === '' || value == null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function asSqlOrderCode(value) {
  if (value === '' || value == null) return null
  const normalized = normalizeOrderCode(value).replace(/^0+/, '')
  return normalized || '0'
}

function buildOrderSearchClauses(values) {
  const rawValues = [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))]
  if (rawValues.length === 0) return []

  const pedidoIds = [...new Set(rawValues.map(asSqlNumber).filter(Number.isFinite))]
  const pedidoCodes = [...new Set(rawValues.map(asSqlOrderCode).filter(Boolean))]
  const clauses = []

  if (pedidoIds.length > 0) clauses.push(`ped.id_pedido in (${pedidoIds.join(', ')})`)
  if (pedidoCodes.length > 0) clauses.push(`${NORMALIZED_PEDCODIGO_SQL} in (${pedidoCodes.map(code => `'${code}'`).join(', ')})`)

  return clauses.length > 0 ? [`(${clauses.join(' or ')})`] : []
}

function asSqlIdList(values) {
  const ids = [...new Set((values || []).map(value => Number(value)).filter(Number.isFinite))]
  return ids.length > 0 ? ids.join(',') : null
}

function chunkArray(values, size) {
  const chunks = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

async function execSql(supabase, sql) {
  const compactSql = sql.replace(/\s+/g, ' ').trim()
  const { data, error } = await supabase.rpc('exec_sql', { sql: compactSql })
  if (error) throw new Error(`exec_sql: ${error.message}`)
  return data || []
}

async function execOptionalSql(supabase, sql) {
  try {
    return await execSql(supabase, sql)
  } catch (error) {
    const message = String(error?.message || '')
    if (
      message.includes('Could not find the table') ||
      message.includes('relation') ||
      message.includes('does not exist') ||
      message.includes('column') ||
      message.includes('schema cache')
    ) {
      return []
    }

    throw error
  }
}

function buildSalesSql({ dateStart, dateEnd, pedcodigos = [], clicodigos = [], gclcodigos = [], kind = 'products' }) {
  const clauses = [
    `ped.peddtemis >= '${dateStart}T00:00:00'`,
    `ped.peddtemis < ('${dateEnd}'::date + interval '1 day')`,
    `ped.pedsitped <> 'C'`,
    ...EXCLUDED_CLIENT_CODES.map(code => `ped.clicodigo <> ${code}`),
    ...EXCLUDED_COMPANY_CODES.map(code => `ped.empcodigo <> ${code}`),
  ]

  const clienteList = [...new Set((clicodigos || []).map(asSqlNumber).filter(Number.isFinite))]
  const grupoList = [...new Set((gclcodigos || []).map(asSqlNumber).filter(Number.isFinite))]

  clauses.push(...buildOrderSearchClauses(pedcodigos))
  if (clienteList.length > 0) clauses.push(`ped.clicodigo in (${clienteList.join(', ')})`)
  if (grupoList.length > 0) clauses.push(`cli.gclcodigo in (${grupoList.join(', ')})`)

  const isService = kind === 'services'
  const itemTable = isService ? 'pdser' : 'pdprd'
  const itemAlias = isService ? 'pds' : 'prd'
  const joinColumn = isService ? 'sercodigo' : 'procodigo'
  const descriptionColumn = isService ? 'pdsdescricao' : 'pdpdescricao'
  const quantityColumn = isService ? 'pdsqtdade' : 'pdpqtdade'
  const productService = isService ? 'S' : 'P'

  return `
    select
      ped.empcodigo as cod_empresa,
      ped.peddtemis::date as data_venda,
      ped.peddtsaida::date as data_saida,
      ${ACTUAL_TIME_SQL} as hora_saida,
      ped.pedpzentre::date as data_prazo,
      ${EXPECTED_TIME_SQL} as hora_prev,
      ${ACTUAL_DATETIME_SQL} as data_hora_saida,
      (ped.pedpzentre::date + ${EXPECTED_TIME_SQL}) as data_hora_prevista,
      floor(extract(epoch from (
        coalesce(${ACTUAL_DATETIME_SQL}, current_timestamp)
        - (ped.pedpzentre::date + ${EXPECTED_TIME_SQL})
      )) / 60)::integer as atraso_minutos,
      ped.clicodigo as codigo_cliente,
      coalesce(cli.clinomefant, cli.clirazsocial) as cliente,
      cli.gclcodigo as gclcodigo,
      ped.funcodigo as vendedor_codigo,
      ped.pedcodigo as numero_venda,
      ped.id_pedido as pedido,
      ${itemAlias}.${joinColumn}::text as codigo_produto,
      ${itemAlias}.${descriptionColumn}::text as descricao_produto,
      ${itemAlias}.${quantityColumn}::numeric as qtde_produtos,
      ped.pedsitped::text as status,
      '${productService}'::text as produto_servico
    from pedid ped
    join ${itemTable} ${itemAlias} on ped.id_pedido = ${itemAlias}.id_pedido
    left join clien cli on ped.clicodigo = cli.clicodigo
    where ${clauses.join('\n      and ')}
    order by data_venda desc, pedido desc
    limit ${MAX_SALES_ROWS}
  `
}

function buildOrdersSql({ dateStart, dateEnd, pedcodigos = [], clicodigos = [], gclcodigos = [] }) {
  const clauses = [
    `ped.peddtemis >= '${dateStart}T00:00:00'`,
    `ped.peddtemis < ('${dateEnd}'::date + interval '1 day')`,
    `ped.pedsitped <> 'C'`,
    ...EXCLUDED_CLIENT_CODES.map(code => `ped.clicodigo <> ${code}`),
    ...EXCLUDED_COMPANY_CODES.map(code => `ped.empcodigo <> ${code}`),
  ]

  const clienteList = [...new Set((clicodigos || []).map(asSqlNumber).filter(Number.isFinite))]
  const grupoList = [...new Set((gclcodigos || []).map(asSqlNumber).filter(Number.isFinite))]

  clauses.push(...buildOrderSearchClauses(pedcodigos))
  if (clienteList.length > 0) clauses.push(`ped.clicodigo in (${clienteList.join(', ')})`)
  if (grupoList.length > 0) clauses.push(`cli.gclcodigo in (${grupoList.join(', ')})`)

  return `
    select
      ped.peddtemis::date as data_venda,
      (ped.pedpzentre::date + ${EXPECTED_TIME_SQL}) as data_hora_prevista,
      ${ACTUAL_DATETIME_SQL} as data_hora_saida,
      floor(extract(epoch from (
        coalesce(${ACTUAL_DATETIME_SQL}, current_timestamp)
        - (ped.pedpzentre::date + ${EXPECTED_TIME_SQL})
      )) / 60)::integer as atraso_minutos,
      ped.clicodigo as codigo_cliente,
      coalesce(cli.clinomefant, cli.clirazsocial) as cliente,
      cli.gclcodigo as gclcodigo,
      ped.funcodigo as vendedor_codigo,
      ped.pedcodigo as numero_venda,
      ped.id_pedido as pedido,
      ped.pedsitped::text as status
    from pedid ped
    left join clien cli on ped.clicodigo = cli.clicodigo
    where ${clauses.join(' and ')}
    order by data_venda desc, pedido desc
    limit ${MAX_SALES_ROWS}
  `
}

function buildOrderQuantitiesSql(orderIds, kind = 'products') {
  const ids = asSqlIdList(orderIds)
  if (!ids) return null

  const isService = kind === 'services'
  const itemTable = isService ? 'pdser' : 'pdprd'
  const quantityColumn = isService ? 'pdsqtdade' : 'pdpqtdade'

  return `
    select
      id_pedido,
      coalesce(sum(${quantityColumn})::numeric, 0) as quantidade_total
    from ${itemTable}
    where id_pedido in (${ids})
    group by id_pedido
  `
}

function resolveLossFinalityCodes(finalityData) {
  const codes = (finalityData || [])
    .filter(item => normalizeText(item.pdfdescricao).trim().toUpperCase() === 'PERDA')
    .map(item => String(item.pdfcodigo || '').trim())
    .filter(Boolean)

  return codes.length > 0 ? [...new Set(codes)] : ['2']
}

function buildLossMetricsSql({ dateStart, dateEnd, pedcodigos = [], clicodigos = [], gclcodigos = [], lossFinalityCodes = ['2'] }) {
  const clauses = [
    `ped.peddtemis >= '${dateStart}T00:00:00'`,
    `ped.peddtemis < ('${dateEnd}'::date + interval '1 day')`,
    `ped.pedsitped <> 'C'`,
    ...EXCLUDED_CLIENT_CODES.map(code => `ped.clicodigo <> ${code}`),
    ...EXCLUDED_COMPANY_CODES.map(code => `ped.empcodigo <> ${code}`),
  ]

  const clienteList = [...new Set((clicodigos || []).map(asSqlNumber).filter(Number.isFinite))]
  const grupoList = [...new Set((gclcodigos || []).map(asSqlNumber).filter(Number.isFinite))]

  clauses.push(...buildOrderSearchClauses(pedcodigos))
  if (clienteList.length > 0) clauses.push(`ped.clicodigo in (${clienteList.join(', ')})`)
  if (grupoList.length > 0) clauses.push(`cli.gclcodigo in (${grupoList.join(', ')})`)

  const normalizedLossCodes = [...new Set(
    (lossFinalityCodes || [])
      .map(code => String(code || '').trim())
      .filter(Boolean)
  )]

  const lossCodesSql = normalizedLossCodes.length > 0
    ? normalizedLossCodes.map(code => `'${code.replace(/'/g, "''")}'`).join(', ')
    : `'2'`

  return `
    select
      coalesce(sum(case when vendas.finalidade in (${lossCodesSql}) then vendas.qtde_produtos else 0 end), 0) as qtd_perdas,
      coalesce(sum(case when vendas.lanca_financeiro = 'S' then vendas.qtde_produtos else 0 end), 0) as qtd_lanca_financeiro,
      coalesce(sum(case when vendas.finalidade in (${lossCodesSql}) then vendas.qtde_produtos else 0 end), 0)
        + coalesce(sum(case when vendas.lanca_financeiro = 'S' then vendas.qtde_produtos else 0 end), 0) as qtd_perda_produz
    from (
      select
        ped.pdfcodigo::text as finalidade,
        prd.pdpqtdade::numeric as qtde_produtos,
        coalesce(prd.pdplcfinan, '')::text as lanca_financeiro
      from pedid ped
      join pdprd prd on ped.id_pedido = prd.id_pedido
      left join clien cli on ped.clicodigo = cli.clicodigo
      where ${clauses.join('\n        and ')}

      union all

      select
        ped.pdfcodigo::text as finalidade,
        pds.pdsqtdade::numeric as qtde_produtos,
        coalesce(pds.pdslcfinan, '')::text as lanca_financeiro
      from pedid ped
      join pdser pds on ped.id_pedido = pds.id_pedido
      left join clien cli on ped.clicodigo = cli.clicodigo
      where ${clauses.join('\n        and ')}
    ) vendas
  `
}

function buildProductDetailsSql(orderIds, kind = 'products') {
  const ids = asSqlIdList(orderIds)
  if (!ids) return null

  const isService = kind === 'services'
  const itemTable = isService ? 'pdser' : 'pdprd'
  const itemAlias = isService ? 'pds' : 'prd'
  const joinColumn = isService ? 'sercodigo' : 'procodigo'
  const descriptionColumn = isService ? 'pdsdescricao' : 'pdpdescricao'
  const quantityColumn = isService ? 'pdsqtdade' : 'pdpqtdade'

  return `
    select
      ped.pedcodigo as numero_venda,
      ped.id_pedido as pedido,
      ${itemAlias}.${joinColumn}::text as codigo_produto,
      ${itemAlias}.${descriptionColumn}::text as descricao_produto,
      ${itemAlias}.${quantityColumn}::numeric as qtde_produtos,
      ${ACTUAL_DATETIME_SQL} as data_hora_saida,
      coalesce(cli.clinomefant, cli.clirazsocial) as cliente
    from pedid ped
    join ${itemTable} ${itemAlias} on ped.id_pedido = ${itemAlias}.id_pedido
    left join clien cli on ped.clicodigo = cli.clicodigo
    where ped.id_pedido in (${ids})
    order by ped.pedcodigo, pedido
  `
}

function buildLatestCellsSql(orderIds) {
  const ids = asSqlIdList(orderIds)
  if (!ids) return null

  return `
    select distinct on (ac.id_pedido)
      ac.id_pedido,
      lp.lpdescricao::text as celula,
      ac.jbcodigo::text as caixa
    from acoped ac
    left join localped lp on lp.lpcodigo = ac.lpcodigo
    where ac.id_pedido in (${ids})
    order by ac.id_pedido, ac.apdata desc nulls last, ac.aphora desc nulls last
  `
}

function buildRoteiroSql(orderIds) {
  const ids = asSqlIdList(orderIds)
  if (!ids) return null

  return `
    select
      jr.id_pedido,
      jr.jbcodigo,
      jr.jbrordem,
      jr.alxcodigo,
      a.alxdescricao::text as celula_descricao
    from jbxroteiro jr
    left join almox a on a.alxcodigo = jr.alxcodigo and a.empcodigo = jr.empcodigo
    where jr.id_pedido in (${ids})
    order by jr.id_pedido, jr.jbrordem asc, jr.alxcodigo asc
  `
}

function buildRoutePassSql(orderIds) {
  const ids = asSqlIdList(orderIds)
  if (!ids) return null

  return `
    select distinct on (ac.id_pedido, ac.alxcodigo)
      ac.id_pedido,
      ac.alxcodigo,
      ac.apdata,
      ac.aphora
    from acoped ac
    where ac.id_pedido in (${ids})
      and ac.alxcodigo is not null
    order by ac.id_pedido, ac.alxcodigo, ac.apdata asc nulls last, ac.aphora asc nulls last
  `
}

function buildRouteCacheSql(orderIds) {
  const ids = asSqlIdList(orderIds)
  if (!ids) return null

  return `
    select
      id_pedido,
      pedcodigo,
      roteiro_resumo,
      roteiro_json
    from pedido_roteiro_cache
    where id_pedido in (${ids})
  `
}

function buildTraceabilitySql(orderIds) {
  const ids = asSqlIdList(orderIds)
  if (!ids) return null

  return `
    select
      ac.id_pedido,
      ped.pedcodigo as numero_venda,
      ac.alxcodigo,
      a.alxdescricao::text as estoque_descricao,
      lp.lpdescricao::text as celula,
      ac.apdata,
      ac.aphora,
      u.usunome::text as usuario
    from acoped ac
    join pedid ped on ped.id_pedido = ac.id_pedido
    left join almox a on a.alxcodigo = ac.alxcodigo and a.empcodigo = ac.empcodigo
    left join localped lp on lp.lpcodigo = ac.lpcodigo
    left join usuario u on u.usucodigo = ac.usucodigo
    where ac.id_pedido in (${ids})
    order by ac.apdata asc nulls last, ac.aphora asc nulls last
  `
}

function buildRequiTraceabilitySql(orderIds, dateStart, dateEnd) {
  const ids = asSqlIdList(orderIds)
  if (!ids) return null

  return `
    select
      reqcodigo,
      reqdata,
      reqhora,
      pdccodigo,
      funcodigo,
      dptcodigo,
      reqentsai,
      reqtipo
    from requi
    where pdccodigo in (${ids})
      and reqdata >= '${dateStart}T00:00:00'
      and reqdata < ('${dateEnd}'::date + interval '1 day')
    order by reqdata desc, reqcodigo desc
  `
}

async function execSqlBatches(supabase, values, sqlBuilder, chunkSize = 500) {
  const chunks = chunkArray(values, chunkSize)
  const rows = []

  for (const chunk of chunks) {
    const sql = sqlBuilder(chunk)
    if (!sql) continue
    const batchRows = await execSql(supabase, sql)
    rows.push(...batchRows)
  }

  return rows
}

async function execOptionalSqlBatches(supabase, values, sqlBuilder, chunkSize = 500) {
  const chunks = chunkArray(values, chunkSize)
  const rows = []

  for (const chunk of chunks) {
    const sql = sqlBuilder(chunk)
    if (!sql) continue
    const batchRows = await execOptionalSql(supabase, sql)
    rows.push(...batchRows)
  }

  return rows
}

async function getTenantSupabase(request, tenantSlug) {
  const { company, companySecrets } = await resolveAuthorizedCompany(request, tenantSlug)
  const { url: supabaseUrl, serviceRoleKey: supabaseServiceRoleKey } = resolveSupabaseConfig(company, companySecrets)

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(`Supabase nao configurado para o tenant ${company.slug}.`)
  }

  return createTenantSupabase(supabaseUrl, supabaseServiceRoleKey)
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const tenantSlug = searchParams.get('tenant') || ''
    const supabase = await getTenantSupabase(request, tenantSlug)

    const fallbackStart = format(addDays(new Date(), -30), 'yyyy-MM-dd')
    const fallbackEnd = format(new Date(), 'yyyy-MM-dd')
    const dateStart = asSqlDate(searchParams.get('dateStart'), fallbackStart)
    const dateEnd = asSqlDate(searchParams.get('dateEnd'), fallbackEnd)
    const pedcodigoValues = parseCsvParam(searchParams, 'pedcodigo').map(normalizeOrderCode)
    const statusFilters = parseCsvParam(searchParams, 'status')
    const clicodigoValues = parseCsvParam(searchParams, 'clicodigo')
    const clinomeFilters = parseCsvParam(searchParams, 'clinome')
    const gclcodigoValues = parseCsvParam(searchParams, 'gclcodigo')
    const emissaoFilters = parseCsvParam(searchParams, 'emissao')
    const indiceFilters = parseCsvParam(searchParams, 'indice')
    const previstoFilters = parseCsvParam(searchParams, 'previsto')
    const saidaFilters = parseCsvParam(searchParams, 'saida')
    const quantidadeFilters = parseCsvParam(searchParams, 'quantidade')
    const currentCellFilters = parseCsvParam(searchParams, 'currentCell').map(normalizeText)
    const productStatusFilters = parseCsvParam(searchParams, 'productStatus')
    const procodigoFilters = parseCsvParam(searchParams, 'procodigo')
    const prodescricaoFilters = parseCsvParam(searchParams, 'prodescricao')
    const productQuantidadeFilters = parseCsvParam(searchParams, 'productQuantidade')
    const customerIndiceFilters = parseCsvParam(searchParams, 'customerIndice')
    const customerMediaDiasFilters = parseCsvParam(searchParams, 'customerMediaDias')
    const clientCodeFilters = [...new Set([...clicodigoValues, ...clinomeFilters])]

    const now = nowInProductionTimeZone()
    const shouldLoadTraceability = pedcodigoValues.length > 0
    const shouldLoadProductDetails = pedcodigoValues.length > 0
    const groupCodeFilterSet = new Set(gclcodigoValues.map(Number).filter(Number.isFinite))

    const [finalityRes, dashboardCacheRes] = await Promise.all([
      fetchOptionalPages(() => supabase.from('pedfinalidade').select('pdfcodigo, pdfdescricao').order('pdfcodigo'), { maxRows: 200 }),
      fetchDashboardCacheRows(
        supabase,
        { dateStart, dateEnd, pedcodigos: pedcodigoValues, clicodigos: clientCodeFilters, gclcodigos: gclcodigoValues }
      ),
    ])

    for (const [name, res] of Object.entries({ pedfinalidade: finalityRes, pedido_dashboard_cache: dashboardCacheRes })) {
      if (res.error) throw new Error(`${name}: ${res.error.message}`)
    }

    if (dashboardCacheRes.missingCacheTable) {
      throw new Error('pedido_dashboard_cache ainda nao foi criada/populada. Rode o sync novamente para inicializar o cache do dashboard.')
    }

    const finalityData = finalityRes.data || []
    const lossFinalityCodes = resolveLossFinalityCodes(finalityData)

    let lossMetricsRows = []
    try {
      lossMetricsRows = await execOptionalSql(
        supabase,
        buildLossMetricsSql({ dateStart, dateEnd, pedcodigos: pedcodigoValues, clicodigos: clientCodeFilters, gclcodigos: gclcodigoValues, lossFinalityCodes })
      )
    } catch (error) {
      console.error('[dashboard][loss-metrics]', error)
      lossMetricsRows = []
    }

    let cachedOrders = (dashboardCacheRes.data || []).map(row => {
      let roteiro = row.roteiro_json
      if (typeof roteiro === 'string') {
        try {
          roteiro = JSON.parse(roteiro)
        } catch {
          roteiro = []
        }
      }

      const normalizedRoute = (Array.isArray(roteiro) ? roteiro : []).map(normalizeCachedRouteStep)

      return {
        pedcodigo: normalizeOrderCode(row.pedcodigo || row.id_pedido),
        pedidoId: String(row.id_pedido),
        emissao: localDateTimeText(row.emissao),
        indice: Number(row.indice) || 0,
        previsto: localDateTimeText(row.previsto),
        saida: localDateTimeText(row.saida),
        quantidade: Number(row.quantidade) || 0,
        status: String(row.status || '').trim(),
        currentCell: normalizeText(row.current_cell) || '-',
        caixa: normalizeText(row.caixa) || '-',
        roteiro: normalizedRoute,
        roteiroResumo:
          normalizedRoute.length > 0
            ? normalizedRoute.map(step => step.label).join(' | ')
            : String(row.roteiro_resumo || '').trim(),
        delayRank: Number(row.delay_rank) || 0,
        statusPriority: Number(row.status_priority) || 0,
        rowTone: String(row.row_tone || '').trim() || 'success',
        clicodigo: row.clicodigo,
        clinome: normalizeText(row.clinome),
        gclcodigo: row.gclcodigo,
        vendedorCodigo: row.vendedor_codigo,
        vendedorNome: normalizeText(row.vendedor_nome),
        emittedDate: parseLocalDateTime(row.emissao),
        expectedDate: parseLocalDateTime(row.previsto),
        deliveredDate: parseLocalDateTime(row.saida),
      }
    })

    const clientLookup = await fetchClientLookup(
      supabase,
      cachedOrders.map(order => order.clicodigo)
    )
    const sellerLookup = await fetchSellerLookup(
      supabase,
      cachedOrders.map(order => order.vendedorCodigo)
    )

    cachedOrders = cachedOrders.map(order => ({
      ...order,
      clinome: order.clinome || clientLookup.get(String(order.clicodigo)) || '',
      vendedorNome:
        order.vendedorNome ||
        sellerLookup.get(String(order.vendedorCodigo)) ||
        '',
    }))

    if (pedcodigoValues.length > 0) {
      const wanted = new Set(pedcodigoValues.map(value => String(value || '').trim()))
      cachedOrders = cachedOrders.filter(row => wanted.has(String(row.pedidoId)) || wanted.has(String(row.pedcodigo)))
    }

    let orders = cachedOrders.map(order => ({
      pedcodigo: order.pedcodigo,
      pedidoId: order.pedidoId,
      emissao: order.emissao,
      indice: order.indice,
      previsto: order.previsto,
      saida: order.saida,
      quantidade: order.quantidade,
      status: order.status,
      currentCell: order.currentCell,
      caixa: order.caixa,
      roteiro: order.roteiro,
      roteiroResumo: order.roteiroResumo,
      delayRank: order.delayRank,
      statusPriority: order.statusPriority,
      rowTone: order.rowTone,
      clicodigo: order.clicodigo,
      clinome: order.clinome,
    }))

    if (statusFilters.length > 0) orders = orders.filter(row => rowMatchesAnyFilter(row, 'status', statusFilters))
    if (emissaoFilters.length > 0) orders = orders.filter(row => rowMatchesAnyFilter(row, 'emissao', emissaoFilters))
    if (indiceFilters.length > 0) orders = orders.filter(row => rowMatchesAnyFilter(row, 'indice', indiceFilters))
    if (previstoFilters.length > 0) orders = orders.filter(row => rowMatchesAnyFilter(row, 'previsto', previstoFilters))
    if (saidaFilters.length > 0) orders = orders.filter(row => rowMatchesAnyFilter(row, 'saida', saidaFilters))
    if (quantidadeFilters.length > 0) orders = orders.filter(row => rowMatchesAnyFilter(row, 'quantidade', quantidadeFilters))
    if (currentCellFilters.length > 0) orders = orders.filter(row => rowMatchesAnyFilter(row, 'currentCell', currentCellFilters))

    orders.sort((a, b) => {
      if (b.statusPriority !== a.statusPriority) return b.statusPriority - a.statusPriority
      return b.delayRank - a.delayRank
    })

    const visibleOrderIds = new Set(orders.map(row => row.pedidoId))
    const selectedCachedOrders = cachedOrders.filter(order => visibleOrderIds.has(order.pedidoId))
    const orderIds = selectedCachedOrders.map(order => Number(order.pedidoId)).filter(Number.isFinite)
    const orderNumberById = Object.fromEntries(selectedCachedOrders.map(order => [order.pedidoId, order.pedcodigo]))

    const [productSalesRows, serviceSalesRows, traceabilityRows] = await Promise.all([
      shouldLoadProductDetails && orderIds.length > 0 ? execSqlBatches(supabase, orderIds, ids => buildProductDetailsSql(ids, 'products')) : Promise.resolve([]),
      shouldLoadProductDetails && orderIds.length > 0 ? execSqlBatches(supabase, orderIds, ids => buildProductDetailsSql(ids, 'services')) : Promise.resolve([]),
      shouldLoadTraceability && orderIds.length > 0 ? execSqlBatches(supabase, orderIds, buildTraceabilitySql) : Promise.resolve([]),
    ])

    const normalizedSalesRows = [...productSalesRows, ...serviceSalesRows].map(row => ({
      ...row,
      cliente: normalizeText(row.cliente),
      descricao_produto: normalizeText(row.descricao_produto),
    }))

    let products = normalizedSalesRows.map(row => ({
      pedcodigo: normalizeOrderCode(row.numero_venda || row.pedido),
      pedidoId: String(row.pedido),
      status: row.data_hora_saida ? 'Saida' : 'Em Producao',
      procodigo: String(row.codigo_produto || '').trim(),
      prodescricao: normalizeText(row.descricao_produto),
      quantidade: Number(row.qtde_produtos) || 0,
      clinome: normalizeText(row.cliente),
    }))

    let traceability = shouldLoadTraceability
      ? traceabilityRows.map(row => ({
          estoque: row.alxcodigo != null
            ? `${row.alxcodigo} - ${normalizeText(row.estoque_descricao) || '-'}`
            : normalizeText(row.estoque_descricao) || '-',
          celula: normalizeText(row.celula) || `Etapa ${row.lpcodigo || ''}`,
          dataHora: combineDateTime(row.apdata, row.aphora),
          usuario: normalizeText(row.usuario) || '-',
          pedcodigo: normalizeOrderCode(orderNumberById[String(row.id_pedido)] || row.numero_venda || row.id_pedido),
          pedidoId: String(row.id_pedido),
          clicodigo: null,
          clinome: '-',
        }))
      : []

    traceability.sort((a, b) => {
      if (!a.dataHora && !b.dataHora) return 0
      if (!a.dataHora) return 1
      if (!b.dataHora) return -1
      return new Date(a.dataHora) - new Date(b.dataHora)
    })

    if (productStatusFilters.length > 0) products = products.filter(row => rowMatchesAnyFilter(row, 'status', productStatusFilters))
    if (procodigoFilters.length > 0) products = products.filter(row => rowMatchesAnyFilter(row, 'procodigo', procodigoFilters))
    if (prodescricaoFilters.length > 0) products = products.filter(row => rowMatchesAnyFilter(row, 'prodescricao', prodescricaoFilters))
    if (productQuantidadeFilters.length > 0) products = products.filter(row => rowMatchesAnyFilter(row, 'quantidade', productQuantidadeFilters))
    products = products.filter(row => visibleOrderIds.has(row.pedidoId))
    traceability = traceability.filter(row => visibleOrderIds.has(row.pedidoId))

    let customerMap = {}
    for (const order of selectedCachedOrders) {
      if (!customerMap[order.clicodigo]) {
        customerMap[order.clicodigo] = {
          clicodigo: order.clicodigo,
          clinome: order.clinome || `Cliente ${order.clicodigo}`,
          total: 0,
          onTime: 0,
          daysTotal: 0,
          daysCount: 0,
          gclcodigo: order.gclcodigo,
        }
      }

      const customer = customerMap[order.clicodigo]
      customer.total += 1
      customer.onTime += order.indice >= 100 ? 1 : 0
      if (order.emittedDate && order.deliveredDate) {
        customer.daysTotal += Math.max(0, differenceInDays(order.deliveredDate, order.emittedDate))
        customer.daysCount += 1
      }
    }

    let customers = Object.values(customerMap)
      .map(customer => ({
        clicodigo: customer.clicodigo,
        clinome: customer.clinome,
        indice: customer.total > 0 ? Math.round((customer.onTime / customer.total) * 100) : 0,
        mediaDias: customer.daysCount > 0 ? Number((customer.daysTotal / customer.daysCount).toFixed(1)) : 0,
        gclcodigo: customer.gclcodigo,
      }))
      .sort((a, b) => b.indice - a.indice)

    if (customerIndiceFilters.length > 0) customers = customers.filter(row => rowMatchesAnyFilter(row, 'indice', customerIndiceFilters))
    if (customerMediaDiasFilters.length > 0) customers = customers.filter(row => rowMatchesAnyFilter(row, 'mediaDias', customerMediaDiasFilters))

    if (customers.length > 0 && (customerIndiceFilters.length > 0 || customerMediaDiasFilters.length > 0)) {
      const filteredClientIds = new Set(customers.map(row => String(row.clicodigo)))
      orders = orders.filter(row => filteredClientIds.has(String(row.clicodigo)))
    }

    const finalOrderIds = new Set(orders.map(row => row.pedidoId))
    products = products.filter(row => finalOrderIds.has(row.pedidoId))
    traceability = traceability.filter(row => finalOrderIds.has(row.pedidoId))

    const finalCachedOrders = selectedCachedOrders.filter(order => finalOrderIds.has(order.pedidoId))
    const sellerMap = {}
    for (const order of finalCachedOrders) {
      const sellerCode = String(order.vendedorCodigo || '')
      const sellerName = normalizeText(order.vendedorNome)

      if (!sellerMap[sellerCode]) {
        sellerMap[sellerCode] = {
          vendedorCodigo: sellerCode,
          vendedorNome: sellerName || 'Nao informado',
          totalVendas: 0,
          totalPecas: 0,
        }
      }

      sellerMap[sellerCode].totalVendas += 1
      sellerMap[sellerCode].totalPecas += Number(order.quantidade) || 0
    }

    const sellerRanking = Object.values(sellerMap)
      .sort((a, b) => {
        if (b.totalVendas !== a.totalVendas) return b.totalVendas - a.totalVendas
        if (b.totalPecas !== a.totalPecas) return b.totalPecas - a.totalPecas
        return a.vendedorNome.localeCompare(b.vendedorNome)
      })
      .map((seller, index) => ({
        posicao: index + 1,
        vendedorCodigo: seller.vendedorCodigo,
        vendedorNome: seller.vendedorNome,
        totalVendas: seller.totalVendas,
        totalPecas: seller.totalPecas,
      }))

    const weekMap = {}
    for (const order of orders) {
      const week = format(startOfWeek(parseISO(order.emissao), { locale: ptBR }), 'dd/MM', { locale: ptBR })
      if (!weekMap[week]) weekMap[week] = { period: week, noPrazo: 0, atrasado: 0, producao: 0 }
      if (order.status === 'completed') weekMap[week].noPrazo += 1
      else if (order.status === 'delayed' || order.status === 'delayed_completed') weekMap[week].atrasado += 1
      else weekMap[week].producao += 1
    }

    const pontualidade = Object.values(weekMap).slice(-8)
    const lossMetrics = lossMetricsRows?.[0] || {}
    const lossQuantity = Number(lossMetrics.qtd_perdas) || 0
    const financiallyLaunchedQuantity = Number(lossMetrics.qtd_lanca_financeiro) || 0
    const totalQuantity = Number(lossMetrics.qtd_perda_produz) || (lossQuantity + financiallyLaunchedQuantity)

    if (cachedOrders.length === 0 && totalQuantity > 0) {
      throw new Error('pedido_dashboard_cache ainda nao foi populada para este periodo. A base de perdas respondeu, mas o cache principal do dashboard ainda nao foi preenchido.')
    }

    const perdas = {
      total: totalQuantity,
      withLoss: lossQuantity,
      percentage: totalQuantity > 0 ? Number(((lossQuantity / totalQuantity) * 100).toFixed(2)) : 0,
      semPerda: financiallyLaunchedQuantity,
    }

    const totalOrders = orders.length
    const completed = orders.filter(row => row.status === 'completed' || row.status === 'delayed_completed').length
    const deliveredOnTime = orders.filter(row => row.status === 'completed').length
    const onTime = orders.filter(row => row.status === 'completed' || row.status === 'in_progress').length
    const inProduction = orders.filter(row => row.status === 'in_progress').length
    const inProductionDelayed = orders.filter(row => row.status === 'delayed').length
    const deliveredDelayed = orders.filter(row => row.status === 'delayed_completed').length

    const kpis = {
      totalOrders,
      pontualidade: totalOrders > 0 ? Number(((onTime / totalOrders) * 100).toFixed(1)) : 0,
      emProducao: inProduction,
      emProducaoAtraso: inProductionDelayed,
      perdas: perdas.percentage,
      atrasados: deliveredDelayed,
      entregueAtraso: deliveredDelayed,
      entregueNoPrazo: deliveredOnTime,
      concluidos: completed,
    }

    return NextResponse.json(
      {
        kpis,
        pontualidade,
        perdas,
        orders,
        products: products.slice(0, 200),
        traceability: pedcodigoValues.length > 0 ? traceability : traceability.slice(0, 150),
        customers: customers.slice(0, 100),
        sellerRanking,
      },
      { headers: NO_STORE_HEADERS }
    )
  } catch (error) {
    console.error('[dashboard]', error)
    return NextResponse.json({ error: error.message }, { status: getErrorStatus(error), headers: NO_STORE_HEADERS })
  }
}

