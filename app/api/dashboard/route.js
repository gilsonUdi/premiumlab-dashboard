import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { addDays, differenceInDays, format, parseISO, startOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const dynamic = 'force-dynamic'

const LEAD_DAYS = 5
const PAGE_SIZE = 1000
const MAX_REQUI_ROWS = 20000
const MAX_SALES_ROWS = 20000
const LOSS_REQ_TYPES = new Set(['B', 'C'])
const PRODUCTION_TIME_ZONE = 'America/Sao_Paulo'
const EXPECTED_TIME_SQL = `(date_trunc('hour', ped.pedhrentre::time) - interval '3 hours')::time`
const ACTUAL_TIME_SQL = `(ped.pedhrsaida::time - interval '3 hours')::time`

function calcStatus(emissao, exitDate, now) {
  const expected = addDays(parseISO(emissao), LEAD_DAYS)
  if (exitDate) {
    return new Date(exitDate) <= expected ? 'completed' : 'delayed_completed'
  }
  return now > expected ? 'delayed' : 'in_progress'
}

function combineDateTime(dateValue, timeValue) {
  if (!dateValue) return null
  if (!timeValue) return dateValue

  const datePart = String(dateValue).slice(0, 10)
  const timePart = String(timeValue).slice(0, 8)
  return `${datePart}T${timePart}`
}

function parseLocalDateTime(value) {
  if (!value) return null
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate(), value.getHours(), value.getMinutes(), value.getSeconds())

  const text = String(value).trim()
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!match) {
    const parsed = new Date(text)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const [, y, m, d, hh = '00', mm = '00', ss = '00'] = match
  return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss))
}

function localDateTimeText(value) {
  const parsed = parseLocalDateTime(value)
  if (!parsed) return null
  const pad = (number) => String(number).padStart(2, '0')
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`
}

function orderIsDelayed(expected, delivered, now) {
  if (!expected) return false
  return (delivered && delivered > expected) || (!delivered && now > expected)
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
  if (
    message.includes('Could not find the table') ||
    message.includes('relation') ||
    message.includes('does not exist')
  ) {
    return { data: [], error: null }
  }

  return result
}

function asSqlDate(value, fallback) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : fallback
}

function asSqlNumber(value) {
  if (value === '' || value == null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function parseColumnFilters(value) {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== '' && v != null))
  } catch {
    return {}
  }
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

function splitColumnFilters(columnFilters) {
  const scoped = { orders: {}, products: {}, customers: {}, global: {} }

  for (const [rawField, value] of Object.entries(columnFilters)) {
    const [scope, field] = rawField.includes('.') ? rawField.split('.', 2) : ['global', rawField]
    if (scoped[scope]) scoped[scope][field] = value
    else scoped.global[rawField] = value
  }

  return scoped
}

async function execSql(supabase, sql) {
  const compactSql = sql.replace(/\s+/g, ' ').trim()
  const { data, error } = await supabase.rpc('exec_sql', { sql: compactSql })
  if (error) throw new Error(`exec_sql: ${error.message}`)
  return data || []
}

function buildSalesSql({ dateStart, dateEnd, pedcodigo, clicodigo, gclcodigo, kind = 'products' }) {
  const clauses = [
    `ped.peddtemis >= '${dateStart}T00:00:00'`,
    `ped.peddtemis < ('${dateEnd}'::date + interval '1 day')`,
    `ped.pedsitped <> 'C'`,
  ]

  const pedido = asSqlNumber(pedcodigo)
  const cliente = asSqlNumber(clicodigo)
  const grupo = asSqlNumber(gclcodigo)

  if (pedido != null) clauses.push(`ped.id_pedido = ${pedido}`)
  if (cliente != null) clauses.push(`ped.clicodigo = ${cliente}`)
  if (grupo != null) clauses.push(`cli.gclcodigo = ${grupo}`)

  const where = clauses.join('\n      and ')

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
        (ped.peddtsaida::date + ${ACTUAL_TIME_SQL}) as data_hora_saida,
        (ped.pedpzentre::date + ${EXPECTED_TIME_SQL}) as data_hora_prevista,
        floor(extract(epoch from (
          coalesce((ped.peddtsaida::date + ${ACTUAL_TIME_SQL}), current_timestamp)
          - (ped.pedpzentre::date + ${EXPECTED_TIME_SQL})
        )) / 60)::integer as atraso_minutos,
        case
          when coalesce((ped.peddtsaida::date + ${ACTUAL_TIME_SQL}), current_timestamp)
            <= (ped.pedpzentre::date + ${EXPECTED_TIME_SQL})
          then 1 else 0
        end as no_prazo,
        ped.clicodigo as codigo_cliente,
        coalesce(cli.clinomefant, cli.clirazsocial) as cliente,
        cli.gclcodigo as gclcodigo,
        ped.pedcodigo as numero_venda,
        ped.id_pedido as pedido,
        ped.pdfcodigo as finalidade,
        ped.fiscodigo1 as cfop,
        ${itemAlias}.${joinColumn}::text as codigo_produto,
        ${itemAlias}.${descriptionColumn}::text as descricao_produto,
        ${itemAlias}.${quantityColumn}::numeric as qtde_produtos,
        ped.pedsitped::text as status,
        tbf.fistpnatop::text as tpoperacao,
        '${productService}'::text as produto_servico
      from pedid ped
      join ${itemTable} ${itemAlias} on ped.id_pedido = ${itemAlias}.id_pedido
      left join tbfis tbf on tbf.fiscodigo = ${itemAlias}.fiscodigo
      left join clien cli on ped.clicodigo = cli.clicodigo
      where ${where}
    order by data_venda desc, pedido desc
    limit ${MAX_SALES_ROWS}
  `
}

function buildOrdersSql({ dateStart, dateEnd, pedcodigo, clicodigo, gclcodigo }) {
  const clauses = [
    `ped.peddtemis >= '${dateStart}T00:00:00'`,
    `ped.peddtemis < ('${dateEnd}'::date + interval '1 day')`,
    `ped.pedsitped <> 'C'`,
  ]

  const pedido = asSqlNumber(pedcodigo)
  const cliente = asSqlNumber(clicodigo)
  const grupo = asSqlNumber(gclcodigo)

  if (pedido != null) clauses.push(`ped.id_pedido = ${pedido}`)
  if (cliente != null) clauses.push(`ped.clicodigo = ${cliente}`)
  if (grupo != null) clauses.push(`cli.gclcodigo = ${grupo}`)

  const where = clauses.join(' and ')

  return `
    select
      ped.empcodigo as cod_empresa,
      ped.peddtemis::date as data_venda,
      ped.peddtsaida::date as data_saida,
      ${ACTUAL_TIME_SQL} as hora_saida,
      ped.pedpzentre::date as data_prazo,
      ${EXPECTED_TIME_SQL} as hora_prev,
      (ped.peddtsaida::date + ${ACTUAL_TIME_SQL}) as data_hora_saida,
      (ped.pedpzentre::date + ${EXPECTED_TIME_SQL}) as data_hora_prevista,
      floor(extract(epoch from (
        coalesce((ped.peddtsaida::date + ${ACTUAL_TIME_SQL}), current_timestamp)
        - (ped.pedpzentre::date + ${EXPECTED_TIME_SQL})
      )) / 60)::integer as atraso_minutos,
      ped.clicodigo as codigo_cliente,
      coalesce(cli.clinomefant, cli.clirazsocial) as cliente,
      cli.gclcodigo as gclcodigo,
      ped.pedcodigo as numero_venda,
      ped.id_pedido as pedido,
      ped.pedsitped::text as status
    from pedid ped
    left join clien cli on ped.clicodigo = cli.clicodigo
    where ${where}
    order by data_venda desc, pedido desc
    limit ${MAX_SALES_ROWS}
  `
}

export async function GET(request) {
  try {
    const supabase = getSupabase()
    const { searchParams } = new URL(request.url)
    const fallbackStart = format(addDays(new Date(), -30), 'yyyy-MM-dd')
    const fallbackEnd = format(new Date(), 'yyyy-MM-dd')
    const dateStart = asSqlDate(searchParams.get('dateStart'), fallbackStart)
    const dateEnd = asSqlDate(searchParams.get('dateEnd'), fallbackEnd)
    const pedcodigo = searchParams.get('pedcodigo') || ''
    const dptcodigo = searchParams.get('dptcodigo') || ''
    const status    = searchParams.get('status')    || ''
    const clicodigo = searchParams.get('clicodigo') || ''
    const gclcodigo = searchParams.get('gclcodigo') || ''
    const columnFilters = parseColumnFilters(searchParams.get('columnFilters'))
    const scopedColumnFilters = splitColumnFilters(columnFilters)

    const now = nowInProductionTimeZone()

    // Parallel fetches
    const acopedQuery = () => {
      let q = supabase
        .from('acoped')
        .select('alxcodigo, apdata, empcodigo, aphora, usucodigo, id_pedido, id_roteiro, lpcodigo')
        .order('apdata', { ascending: true })
        .order('aphora', { ascending: true })
      if (pedcodigo) return q.eq('id_pedido', Number(pedcodigo))
      return q.gte('apdata', dateStart).lte('apdata', dateEnd)
    }

    const rastreabQuery = () => {
      let q = supabase
        .from('rastreab')
        .select('*')
        .order('apdata', { ascending: true })
        .order('aphora', { ascending: true })
      if (pedcodigo) return q.eq('id_pedido', Number(pedcodigo))
      return q.gte('peddtemis', dateStart + 'T00:00:00').lte('peddtemis', dateEnd + 'T23:59:59')
    }

    const [requiRes, cellsRes, empRes, userRes, acopedRes, rastreabRes, clientsRes, pedfoRes, localPedRes] = await Promise.all([
      fetchAllPages(() => {
        let q = supabase
          .from('requi')
          .select('reqcodigo, reqdata, reqhora, pdccodigo, funcodigo, dptcodigo, reqentsai, reqtipo, reqvrtotal')
          .gte('reqdata', dateStart + 'T00:00:00')
          .lte('reqdata', dateEnd + 'T23:59:59')
          .order('reqdata', { ascending: false })
        if (pedcodigo) q = q.eq('pdccodigo', Number(pedcodigo))
        if (dptcodigo) q = q.eq('dptcodigo', Number(dptcodigo))
        return q
      }),
      supabase.from('almox').select('empcodigo, alxcodigo, alxdescricao, dptcodigo, alxordem, alxtipocel, alxperda').order('alxordem'),
      supabase.from('funcio').select('funcodigo, funnome').limit(300),
      supabase.from('usuario').select('usucodigo, usunome').limit(300),
      fetchOptionalPages(acopedQuery, { maxRows: pedcodigo ? 10000 : 2000 }),
      fetchOptionalPages(rastreabQuery, { maxRows: pedcodigo ? 10000 : 2000 }),
      fetchAllPages(() => {
        let q = supabase.from('clien').select('clicodigo, clirazsocial, clinomefant, gclcodigo, clidiasatraso').eq('clicliente', 'S').order('clicodigo')
        if (clicodigo) q = q.eq('clicodigo', Number(clicodigo))
        if (gclcodigo) q = q.eq('gclcodigo', Number(gclcodigo))
        return q
      }, { maxRows: 10000 }),
      fetchAllPages(() => {
        let q = supabase
          .from('pedfo')
          .select('pefcodigo, pefdtemis, pefpzentre, pefdtent, pefdtbaixa, pefsit, clicodigo')
          .gte('pefdtemis', dateStart + 'T00:00:00')
          .lte('pefdtemis', dateEnd + 'T23:59:59')
          .order('pefdtemis', { ascending: false })
        if (clicodigo) q = q.eq('clicodigo', Number(clicodigo))
        return q
      }, { maxRows: 10000 }),
      supabase.from('localped').select('lpcodigo, lpdescricao').order('lpcodigo'),
    ])

    for (const [name, res] of Object.entries({ requi: requiRes, almox: cellsRes, funcio: empRes, usuario: userRes, acoped: acopedRes, rastreab: rastreabRes, clien: clientsRes, pedfo: pedfoRes, localped: localPedRes })) {
      if (res.error) throw new Error(`${name}: ${res.error.message}`)
    }

    const requiData  = requiRes.data  || []
    const cellsData  = cellsRes.data  || []
    const empData    = empRes.data    || []
    const userData   = userRes.data   || []
    const acoped     = acopedRes.data || []
    const rastreab   = rastreabRes.data || []
    const clientsData = clientsRes.data || []
    const pedfoData = pedfoRes.data || []
    const localPedData = localPedRes.data || []
    const [salesOrdersRaw, productSalesRows, serviceSalesRows] = await Promise.all([
      execSql(supabase, buildOrdersSql({ dateStart, dateEnd, pedcodigo, clicodigo, gclcodigo })),
      execSql(supabase, buildSalesSql({ dateStart, dateEnd, pedcodigo, clicodigo, gclcodigo, kind: 'products' })),
      execSql(supabase, buildSalesSql({ dateStart, dateEnd, pedcodigo, clicodigo, gclcodigo, kind: 'services' })),
    ])
    const salesRows = [...productSalesRows, ...serviceSalesRows]

    let traceRequiData = requiData
    if (pedcodigo) {
      const selectedTraceRes = await fetchAllPages(() => supabase
        .from('requi')
        .select('reqcodigo, reqdata, reqhora, pdccodigo, funcodigo, dptcodigo, reqentsai, reqtipo, reqvrtotal')
        .eq('pdccodigo', Number(pedcodigo))
        .order('reqdata', { ascending: true })
        .order('reqcodigo', { ascending: true })
      )
      if (selectedTraceRes.error) throw new Error(`requi rastreabilidade: ${selectedTraceRes.error.message}`)
      traceRequiData = selectedTraceRes.data || []
    }

    // Build lookup maps
    const cellByDpt = Object.fromEntries(cellsData.map(c => [c.dptcodigo, c]))
    const cellByAlx = new Map()
    for (const cell of cellsData) {
      if (cell.alxcodigo == null) continue
      cellByAlx.set(String(cell.alxcodigo), cell)
      if (cell.empcodigo != null) cellByAlx.set(`${cell.empcodigo}:${cell.alxcodigo}`, cell)
    }
    const empMap    = Object.fromEntries(empData.map(e => [e.funcodigo, e.funnome]))
    const userMap   = Object.fromEntries(userData.map(u => [u.usucodigo, u.usunome]))
    const clientsByCode = Object.fromEntries(clientsData.map(c => [c.clicodigo, c]))
    const localPedByCode = Object.fromEntries(localPedData.map(l => [l.lpcodigo, l.lpdescricao]))
    const fallbackLocalPedByDpt = {
      4: { E: 4, S: 5 },
      5: { E: 2, S: 3 },
      6: { E: 11, S: 12 },
      7: { E: 9, S: 10 },
      8: { E: 7, S: 8 },
    }
    const getFallbackStepDescription = (movement) => {
      const code = fallbackLocalPedByDpt[movement.dptcodigo]?.[movement.reqentsai]
      return localPedByCode[code] || (movement.reqentsai === 'S' ? 'Saida' : 'Entrada')
    }
    const productionFlow = [...cellsData
      .filter(c => c.dptcodigo != null && c.alxtipocel !== 'E')
      .reduce((map, cell) => {
        const current = map.get(cell.dptcodigo)
        if (!current || (cell.alxordem || 0) > (current.alxordem || 0)) map.set(cell.dptcodigo, cell)
        return map
      }, new Map())
      .values()]
      .sort((a, b) => (a.alxordem || 0) - (b.alxordem || 0))
    const rankByDpt = Object.fromEntries(productionFlow.map((cell, index) => [cell.dptcodigo, index + 1]))

    const calcProductionIndex = (steps) => {
      if (productionFlow.length === 0) return 0
      const maxRank = steps.reduce((max, step) => Math.max(max, rankByDpt[step.dptcodigo] || 0), 0)
      return Math.min(100, Math.round((maxRank / productionFlow.length) * 100))
    }

    const salesOrderMap = {}
    for (const row of salesOrdersRaw) {
      if (!row.pedido) continue
      const key = String(row.pedido)
      const emitted = parseLocalDateTime(row.data_venda)
      const expected = parseLocalDateTime(row.data_hora_prevista)
      const delivered = parseLocalDateTime(row.data_hora_saida)

      salesOrderMap[key] = {
        pedido: key,
        clicodigo: row.codigo_cliente,
        clinome: row.cliente,
        gclcodigo: row.gclcodigo,
        emitted,
        emittedText: localDateTimeText(row.data_venda),
        expected,
        expectedText: localDateTimeText(row.data_hora_prevista),
        delivered,
        deliveredText: localDateTimeText(row.data_hora_saida),
        atrasoMinutos: Number(row.atraso_minutos) || 0,
        deliveredForAverage: delivered,
        quantidade: 0,
        products: [],
        statusRaw: row.status,
      }
    }

    for (const row of salesRows) {
      const item = salesOrderMap[String(row.pedido)]
      if (item) {
        item.products.push(row)
        item.quantidade += Number(row.qtde_produtos) || 0
      }
    }
    const salesOrders = Object.values(salesOrderMap)

    // â”€â”€â”€ ORDER HISTORY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let orders = salesOrders.map(o => {
      const expected = o.expected || (o.emitted ? addDays(o.emitted, LEAD_DAYS) : null)
      const delivered = o.delivered
      const isDelayed = orderIsDelayed(expected, delivered, now)
      let s = 'in_progress'
      if (delivered) s = isDelayed ? 'delayed_completed' : 'completed'
      else if (isDelayed) s = 'delayed'

      return {
        pedcodigo: o.pedido,
        emissao: o.emittedText,
        indice: isDelayed ? 0 : 100,
        previsto: o.expectedText,
        saida: o.deliveredText,
        quantidade: o.quantidade || o.products.length,
        status: s,
        lastCell: o.statusRaw || '-',
        clicodigo: o.clicodigo,
        clinome: o.clinome,
      }
    })

    // Filter by status
    if (status) orders = orders.filter(o => o.status === status)

    orders.sort((a, b) => new Date(b.emissao) - new Date(a.emissao))

    // â”€â”€â”€ PRODUCT DETAILS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let products = salesRows.map(row => ({
      pedcodigo: String(row.pedido),
      status: row.data_hora_saida ? 'Saida' : 'Em Producao',
      procodigo: String(row.codigo_produto || '').trim(),
      prodescricao: String(row.descricao_produto || '').trim(),
      quantidade: Number(row.qtde_produtos) || 0,
      clinome: row.cliente,
    }))

    // â”€â”€â”€ TRACEABILITY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let traceability = []
    if (acoped.length > 0) {
      const traceData = pedcodigo
        ? acoped.filter(r => String(r.id_pedido) === pedcodigo)
        : acoped.slice(0, 100)
      traceability = traceData.map(r => {
        const stock = cellByAlx.get(`${r.empcodigo}:${r.alxcodigo}`) || cellByAlx.get(String(r.alxcodigo))

        return {
          estoque: stock ? `${r.alxcodigo} - ${stock.alxdescricao}` : `Estoque ${r.alxcodigo || ''}`,
          celula: localPedByCode[r.lpcodigo] || `Etapa ${r.lpcodigo || ''}`,
          dataHora: combineDateTime(r.apdata, r.aphora),
          usuario: userMap[r.usucodigo] || `Usuario ${r.usucodigo || ''}`,
          pedcodigo: String(r.id_pedido),
          clicodigo: null,
          clinome: '-',
        }
      })
    } else if (rastreab.length > 0) {
      const traceData = pedcodigo
        ? rastreab.filter(r => String(r.id_pedido || r.pedcodigo) === pedcodigo)
        : rastreab.slice(0, 100)
      traceability = traceData.map(r => ({
        estoque: r.setdescricao || cellByDpt[r.setcodigo]?.alxdescricao || `Estoque ${r.setcodigo || ''}`,
        celula: r.lpdescricao || `Etapa ${r.lpcodigo || ''}`,
        dataHora: combineDateTime(r.apdata || r.peddtemis, r.aphora) || r.peddtemis || null,
        usuario: r.usunome || r.funnome || empMap[r.funcodigo] || `Func ${r.funcodigo || ''}`,
        pedcodigo: String(r.id_pedido || r.pedcodigo),
        clicodigo: r.clicodigo,
        clinome: r.clinome,
      }))
    } else {
      const traceSource = pedcodigo
        ? traceRequiData.filter(r => String(r.pdccodigo) === pedcodigo)
        : traceRequiData.filter(r => r.pdccodigo).slice(0, 100)
      traceability = traceSource.map(r => ({
        estoque: cellByDpt[r.dptcodigo]?.alxdescricao || `Depto ${r.dptcodigo}`,
        celula: getFallbackStepDescription(r),
        dataHora: r.reqdata,
        usuario: empMap[r.funcodigo] || `Func ${r.funcodigo}`,
        pedcodigo: String(r.pdccodigo),
        clicodigo: null,
        clinome: '-',
      }))
    }
    traceability.sort((a, b) => {
      if (!a.dataHora && !b.dataHora) return 0
      if (!a.dataHora) return 1
      if (!b.dataHora) return -1
      return new Date(a.dataHora) - new Date(b.dataHora)
    })

    for (const [field, value] of Object.entries(scopedColumnFilters.global)) {
      if (field === 'pedcodigo') {
        orders = orders.filter(row => rowMatchesFilter(row, field, value))
        products = products.filter(row => rowMatchesFilter(row, field, value))
        traceability = traceability.filter(row => rowMatchesFilter(row, field, value))
        continue
      }

      if (orders.some(row => field in row)) {
        orders = orders.filter(row => rowMatchesFilter(row, field, value))
      }

      if (products.some(row => field in row)) {
        products = products.filter(row => rowMatchesFilter(row, field, value))
        const orderIds = new Set(products.map(row => row.pedcodigo))
        orders = orders.filter(row => orderIds.has(row.pedcodigo))
      }
    }

    for (const [field, value] of Object.entries(scopedColumnFilters.orders)) {
      orders = orders.filter(row => rowMatchesFilter(row, field, value))
    }

    for (const [field, value] of Object.entries(scopedColumnFilters.products)) {
      products = products.filter(row => rowMatchesFilter(row, field, value))
      const orderIds = new Set(products.map(row => row.pedcodigo))
      orders = orders.filter(row => orderIds.has(row.pedcodigo))
    }

    const visibleOrderIds = new Set(orders.map(row => row.pedcodigo))

    // â”€â”€â”€ CUSTOMER INDEX â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const customerMap = {}
    for (const p of salesOrders.filter(order => visibleOrderIds.has(order.pedido))) {
      const client = clientsByCode[p.clicodigo]
      const groupCode = p.gclcodigo ?? client?.gclcodigo
      if (gclcodigo && groupCode !== Number(gclcodigo)) continue
      if (!customerMap[p.clicodigo]) {
        customerMap[p.clicodigo] = { clicodigo: p.clicodigo, client, clinome: p.clinome, gclcodigo: groupCode, total: 0, onTime: 0, daysTotal: 0, daysCount: 0 }
      }

      const item = customerMap[p.clicodigo]
      item.total++
      item.onTime += orderIsDelayed(p.expected, p.delivered, now) ? 0 : 1

      if (p.emitted && p.deliveredForAverage) {
        item.daysTotal += Math.max(0, differenceInDays(p.deliveredForAverage, p.emitted))
        item.daysCount++
      }
    }

    let customers = Object.values(customerMap).map(c => ({
      clicodigo: c.clicodigo,
      clinome: c.clinome || c.client?.clinomefant || c.client?.clirazsocial || `Cliente ${c.clicodigo}`,
      indice: c.total > 0 ? Math.round((c.onTime / c.total) * 100) : 0,
      mediaDias: c.daysCount > 0 ? Number((c.daysTotal / c.daysCount).toFixed(1)) : 0,
      gclcodigo: c.gclcodigo,
    })).sort((a, b) => b.indice - a.indice)

    for (const [field, value] of Object.entries(scopedColumnFilters.customers)) {
      customers = customers.filter(row => rowMatchesFilter(row, field, value))
      const clientIds = new Set(customers.map(row => String(row.clicodigo)))
      orders = orders.filter(row => clientIds.has(String(row.clicodigo)))
    }

    const finalOrderIds = new Set(orders.map(row => row.pedcodigo))
    products = products.filter(row => finalOrderIds.has(row.pedcodigo))

    // â”€â”€â”€ PONTUALIDADE CHART â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const weekMap = {}
    for (const o of orders) {
      const week = format(startOfWeek(parseISO(o.emissao), { locale: ptBR }), 'dd/MM', { locale: ptBR })
      if (!weekMap[week]) weekMap[week] = { period: week, noPrazo: 0, atrasado: 0, producao: 0 }
      if (o.status === 'completed') weekMap[week].noPrazo++
      else if (o.status === 'delayed' || o.status === 'delayed_completed') weekMap[week].atrasado++
      else weekMap[week].producao++
    }
    const pontualidade = Object.values(weekMap).slice(-8)

    // â”€â”€â”€ PERDAS CHART â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const productionMovements = requiData.filter(r => r.pdccodigo && r.reqtipo === 'P').length
    const lossMovements = requiData.filter(r => LOSS_REQ_TYPES.has(r.reqtipo)).length
    const totalQuantity = productionMovements + lossMovements
    const perdas = {
      total: totalQuantity,
      withLoss: lossMovements,
      percentage: totalQuantity > 0 ? Number(((lossMovements / totalQuantity) * 100).toFixed(1)) : 0,
      semPerda: productionMovements,
    }

    // â”€â”€â”€ KPIs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const totalOrders = orders.length
    const completed = orders.filter(o => o.status === 'completed' || o.status === 'delayed_completed').length
    const onTime = orders.filter(o => o.status === 'completed' || o.status === 'in_progress').length
    const pontRate = totalOrders > 0 ? Number(((onTime / totalOrders) * 100).toFixed(1)) : 0
    const inProd = orders.filter(o => o.status === 'in_progress').length

    const kpis = {
      totalOrders,
      pontualidade: pontRate,
      emProducao: inProd,
      perdas: perdas.percentage,
      atrasados: orders.filter(o => o.status === 'delayed' || o.status === 'delayed_completed').length,
      concluidos: completed,
    }

    return NextResponse.json({
      kpis,
      pontualidade,
      perdas,
      orders,
      products: products.slice(0, 200),
      traceability: pedcodigo ? traceability : traceability.slice(0, 100),
      customers: customers.slice(0, 100),
    })
  } catch (err) {
    console.error('[dashboard]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
