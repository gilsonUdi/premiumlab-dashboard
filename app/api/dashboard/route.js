import { NextResponse } from 'next/server'
import { addDays, differenceInDays, differenceInMinutes, format, parseISO, startOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  getCompanyCodeFilter,
  getCompanyDashboardFilters,
  getCompanyDashboardVisualFilters,
  getCompanyOrderCompletionRules,
  getDashboardFilters,
  normalizeUserPermissions,
  PORTAL_PAGE_KEYS,
} from '@/lib/portal-config'
import { createTenantSupabase } from '@/lib/supabase'
import { resolveAuthorizedCompany } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
}

const PAGE_SIZE = 1000
const DASHBOARD_MAX_ROWS = Math.max(Number(process.env.DASHBOARD_MAX_ROWS || 100000), PAGE_SIZE)
const MAX_REQUI_ROWS = DASHBOARD_MAX_ROWS
const MAX_SALES_ROWS = DASHBOARD_MAX_ROWS
const PRODUCTION_TIME_ZONE = 'America/Sao_Paulo'
const EXPECTED_TIME_SQL = `(date_trunc('hour', ped.pedhrentre::time) - interval '3 hours')::time`
const ACTUAL_TIME_SQL = `(ped.pedhrsaida::time - interval '3 hours')::time`
const ACTUAL_DATETIME_SQL = `coalesce((ped.peddtsaida::date + ${ACTUAL_TIME_SQL}), ped.peddtsaida::timestamp)`
const NORMALIZED_PEDCODIGO_SQL = `coalesce(nullif(ltrim(replace(ped.pedcodigo::text, '.000', ''), '0'), ''), '0')`

function getErrorStatus(error) {
  const message = String(error?.message || '')
  if (message.includes('Nao autorizado')) return 401
  if (message.includes('Acesso negado')) return 403
  if (message.includes('nao encontrada')) return 404
  return 500
}

function sanitizeErrorMessage(error) {
  const raw = String(error?.message || error || '').trim()
  if (!raw) return 'Falha ao carregar dados do dashboard.'

  const withoutTags = raw
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (/cloudflare|connection timed out|error code 52\d|doctype html/i.test(raw)) {
    return 'O provedor de dados demorou para responder. Tente atualizar em instantes.'
  }

  if (!withoutTags) {
    return 'Falha ao carregar dados do dashboard.'
  }

  return withoutTags.length > 220 ? `${withoutTags.slice(0, 217)}...` : withoutTags
}

function buildLossError(stage, error) {
  const rawMessage = String(error?.message || error || '').trim()
  const sanitizedMessage = sanitizeErrorMessage(error)

  if (!rawMessage) {
    return {
      code: `LOSS_${stage}_FAILED`,
      message: 'Falha ao calcular perdas.',
    }
  }

  if (/timeout|timed out|statement timeout/i.test(rawMessage)) {
    return {
      code: `LOSS_${stage}_TIMEOUT`,
      message: 'A consulta de perdas excedeu o tempo limite.',
    }
  }

  if (/exec_sql/i.test(rawMessage)) {
    return {
      code: `LOSS_${stage}_EXEC_SQL`,
      message: sanitizedMessage,
    }
  }

  if (/relation|does not exist|Could not find the table|column/i.test(rawMessage)) {
    return {
      code: `LOSS_${stage}_MISSING_SOURCE`,
      message: sanitizedMessage,
    }
  }

  return {
    code: `LOSS_${stage}_FAILED`,
    message: sanitizedMessage,
  }
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

function normalizeProductCode(value) {
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
  if (delivered) return expected && delivered > expected ? 'delayed_completed' : 'completed'
  return expected && now > expected ? 'delayed' : 'in_progress'
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

function normalizePermissionFilterValue(value) {
  if (value == null) return ''
  return normalizeText(value).toLowerCase()
}

function parsePermissionFilterValues(value) {
  return String(value || '')
    .split(',')
    .map(item => normalizePermissionFilterValue(item))
    .filter(Boolean)
}

function coerceComparableValue(value) {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  const text = String(value).trim()
  if (!text) return ''

  const numeric = Number(text.replace(',', '.'))
  if (Number.isFinite(numeric) && /^-?\d+(?:[.,]\d+)?$/.test(text)) return numeric

  const date = Date.parse(text)
  if (!Number.isNaN(date) && /^\d{4}-\d{2}-\d{2}/.test(text)) return date

  return normalizePermissionFilterValue(text)
}

function matchesPermissionFilter(rawValue, filter = {}) {
  const operator = String(filter.operator || 'is').trim()
  const rawFilterValue = String(filter.value || '').trim()
  const normalizedLeft = normalizePermissionFilterValue(rawValue)
  const normalizedRight = normalizePermissionFilterValue(rawFilterValue)
  const listValues = parsePermissionFilterValues(rawFilterValue)
  const comparableLeft = coerceComparableValue(rawValue)
  const comparableRight = coerceComparableValue(rawFilterValue)

  switch (operator) {
    case 'is':
      return listValues.length > 1 ? listValues.includes(normalizedLeft) : normalizedLeft === normalizedRight
    case 'isNot':
      return listValues.length > 1 ? !listValues.includes(normalizedLeft) : normalizedLeft !== normalizedRight
    case 'in':
      return listValues.includes(normalizedLeft)
    case 'contains':
      return normalizedLeft.includes(normalizedRight)
    case 'notContains':
      return !normalizedLeft.includes(normalizedRight)
    case 'startsWith':
      return normalizedLeft.startsWith(normalizedRight)
    case 'endsWith':
      return normalizedLeft.endsWith(normalizedRight)
    case 'greaterThan':
      return comparableLeft != null && comparableRight != null && comparableLeft > comparableRight
    case 'greaterThanOrEqual':
      return comparableLeft != null && comparableRight != null && comparableLeft >= comparableRight
    case 'lessThan':
      return comparableLeft != null && comparableRight != null && comparableLeft < comparableRight
    case 'lessThanOrEqual':
      return comparableLeft != null && comparableRight != null && comparableLeft <= comparableRight
    default:
      return normalizedLeft === normalizedRight
  }
}

function intersectSets(left, right) {
  const result = new Set()
  for (const value of left) {
    if (right.has(value)) result.add(value)
  }
  return result
}

function buildCustomerRowsFromOrders(sourceOrders = []) {
  const customerMap = {}

  for (const order of sourceOrders) {
    if (!customerMap[order.clicodigo]) {
      customerMap[order.clicodigo] = {
        clicodigo: order.clicodigo,
        clinome: order.clinome || `Cliente ${order.clicodigo}`,
        total: 0,
        onTime: 0,
        daysTotal: 0,
        daysCount: 0,
        gclcodigo: order.gclcodigo,
        clicliente: order.clicliente,
        endcodigo: order.endcodigo,
        zocodigo: order.zocodigo,
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

  return Object.values(customerMap)
    .map(customer => ({
      clicodigo: customer.clicodigo,
      clinome: customer.clinome,
      indice: customer.total > 0 ? Math.round((customer.onTime / customer.total) * 100) : 0,
      mediaDias: customer.daysCount > 0 ? Number((customer.daysTotal / customer.daysCount).toFixed(1)) : 0,
      gclcodigo: customer.gclcodigo,
      clicliente: customer.clicliente,
      endcodigo: customer.endcodigo,
      zocodigo: customer.zocodigo,
    }))
    .sort((a, b) => b.indice - a.indice)
}

function buildSellerRowsFromOrders(sourceOrders = []) {
  const sellerMap = {}

  for (const order of sourceOrders) {
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

  return Object.values(sellerMap)
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
}

function buildDashboardFilterContext(orders = [], products = [], traceability = []) {
  const ordersByCustomer = new Map()
  const ordersBySeller = new Map()

  for (const order of orders) {
    const orderId = order.pedidoId
    const customerKey = String(order.clicodigo || '')
    const sellerKey = String(order.vendedorCodigo || '')

    if (!ordersByCustomer.has(customerKey)) ordersByCustomer.set(customerKey, new Set())
    ordersByCustomer.get(customerKey).add(orderId)

    if (!ordersBySeller.has(sellerKey)) ordersBySeller.set(sellerKey, new Set())
    ordersBySeller.get(sellerKey).add(orderId)
  }

  return {
    tableSources: {
      orders,
      products,
      traceability,
      customers: buildCustomerRowsFromOrders(orders),
      sellers: buildSellerRowsFromOrders(orders),
    },
    ordersByCustomer,
    ordersBySeller,
  }
}

function resolveAllowedOrderIdsFromDashboardFilters(filters = [], orders = [], products = [], traceability = []) {
  const normalizedFilters = Array.isArray(filters) ? filters.filter(filter => filter?.table && filter?.column && filter?.value) : []
  let allowedOrderIds = new Set(orders.map(row => row.pedidoId))
  if (normalizedFilters.length === 0) return allowedOrderIds

  const { tableSources, ordersByCustomer, ordersBySeller } = buildDashboardFilterContext(orders, products, traceability)

  for (const filter of normalizedFilters) {
    const sourceRows = tableSources[filter.table]
    if (!Array.isArray(sourceRows) || sourceRows.length === 0) continue

    const matchingOrderIds = new Set()

    if (filter.table === 'customers') {
      for (const row of sourceRows) {
        if (!matchesPermissionFilter(row[filter.column], filter)) continue
        for (const orderId of ordersByCustomer.get(String(row.clicodigo || '')) || []) matchingOrderIds.add(orderId)
      }
    } else if (filter.table === 'sellers') {
      for (const row of sourceRows) {
        if (!matchesPermissionFilter(row[filter.column], filter)) continue
        for (const orderId of ordersBySeller.get(String(row.vendedorCodigo || '')) || []) matchingOrderIds.add(orderId)
      }
    } else {
      for (const row of sourceRows) {
        if (!matchesPermissionFilter(row[filter.column], filter)) continue
        if (row.pedidoId != null) matchingOrderIds.add(String(row.pedidoId))
      }
    }

    allowedOrderIds = intersectSets(allowedOrderIds, matchingOrderIds)
  }

  return allowedOrderIds
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

function buildDelayRank(emitted, delivered, now) {
  if (!emitted) return Number.MIN_SAFE_INTEGER
  return differenceInMinutes(delivered || now, emitted)
}

function buildStatusPriority(status) {
  if (status === 'delayed') return 4
  if (status === 'in_progress' || status === 'pending') return 3
  if (status === 'delayed_completed') return 2
  if (status === 'completed') return 1
  return 0
}

function resolveOrderOperationalState(order, now, completedByRule = false) {
  const emittedDate = order.emittedDate || parseLocalDateTime(order.emissao)
  const expectedDate = order.expectedDate || parseLocalDateTime(order.previsto)
  const deliveredDate = order.deliveredDate || parseLocalDateTime(order.saida)
  const effectiveCompletionDate = deliveredDate || (completedByRule ? now : null)
  const status = resolveStatus(expectedDate, effectiveCompletionDate, now)

  return {
    ...order,
    status,
    indice: orderIsDelayed(expectedDate, effectiveCompletionDate, now) ? 0 : 100,
    delayRank: buildDelayRank(emittedDate, effectiveCompletionDate, now),
    statusPriority: buildStatusPriority(status),
    rowTone: resolveRowTone(status, expectedDate, effectiveCompletionDate, now),
    emittedDate,
    expectedDate,
    deliveredDate,
    completedByRule: Boolean(completedByRule && !deliveredDate),
  }
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
          .select('clicodigo, clinomefant, clirazsocial, gclcodigo, clicliente')
          .in('clicodigo', chunk),
      { maxRows: 2000 }
    )

    if (result.error) throw new Error(result.error.message || 'Falha ao carregar clientes.')
    rows.push(...(result.data || []))
  }

  const endCliResult = await fetchOptionalPages(
    () => supabase.from('endcli').select('clicodigo, endcodigo, zocodigo').in('clicodigo', ids).order('endcodigo'),
    { maxRows: 5000 }
  )

  if (endCliResult.error) throw new Error(endCliResult.error.message || 'Falha ao carregar enderecos de clientes.')

  const clientAddressMap = new Map()
  for (const row of endCliResult.data || []) {
    if (row?.clicodigo == null) continue
    const clientKey = String(row.clicodigo)
    if (!clientAddressMap.has(clientKey)) {
      clientAddressMap.set(clientKey, {
        endcodigo: row.endcodigo ?? null,
        zocodigo: row.zocodigo ?? null,
      })
    }
  }

  return new Map(
    rows.map(row => {
      const address = clientAddressMap.get(String(row.clicodigo)) || {}
      return [
        String(row.clicodigo),
        {
          clinome: normalizeText(row.clinomefant || row.clirazsocial),
          gclcodigo: row.gclcodigo != null ? Number(row.gclcodigo) : null,
          clicliente: row.clicliente ?? null,
          endcodigo: address.endcodigo ?? null,
          zocodigo: address.zocodigo ?? null,
        },
      ]
    })
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

async function fetchAlmoxLookup(supabase, almoxCodes = []) {
  const ids = [...new Set((almoxCodes || []).map(asSqlNumber).filter(Number.isFinite))]
  if (ids.length === 0) return new Map()

  const chunks = chunkArray(ids, 500)
  const rows = []

  for (const chunk of chunks) {
    const result = await fetchOptionalPages(
      () =>
        supabase
          .from('almox')
          .select('alxcodigo, alxdescricao')
          .in('alxcodigo', chunk),
      { maxRows: 2000 }
    )

    if (result.error) throw new Error(result.error.message || 'Falha ao carregar celulas do roteiro.')
    rows.push(...(result.data || []))
  }

  return new Map(
    rows.map(row => [
      String(row.alxcodigo),
      normalizeText(row.alxdescricao),
    ])
  )
}

async function fetchOrderBaseRows(supabase, { dateStart, dateEnd, pedcodigos = [], clicodigos = [], gclcodigos = [], companyCodeFilter = null }) {
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

    const companyCode = asSqlNumber(companyCodeFilter?.code)
    if (companyCodeFilter?.enabled && Number.isFinite(companyCode)) {
      query = query.eq('empcodigo', companyCode)
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

async function fetchLossMetricsFallback(
  supabase,
  orderIds,
  lossFinalityCodes = ['2'],
  excludedFinalityCodes = [],
  productCodeFilters = []
) {
  const ids = [...new Set((orderIds || []).map(asSqlNumber).filter(Number.isFinite))]
  if (ids.length === 0) {
    return { qtd_perdas: 0, qtd_lanca_financeiro: 0, qtd_perda_produz: 0 }
  }

  const lossCodeSet = new Set(
    (lossFinalityCodes || [])
      .map(code => String(code || '').trim())
      .filter(Boolean)
  )
  const excludedCodeSet = new Set(
    (excludedFinalityCodes || [])
      .map(code => String(code || '').trim())
      .filter(Boolean)
  )
  const productCodeFilterSet = new Set(
    (productCodeFilters || [])
      .map(normalizeProductCode)
      .filter(Boolean)
  )

  const orderChunks = chunkArray(ids, 500)
  const validOrderMetaById = new Map()
  const validProductCodeSet = new Set()

  for (const chunk of orderChunks) {
    const result = await fetchOptionalPages(
      () => supabase.from('pedid').select('id_pedido,pdfcodigo,pedsitped').in('id_pedido', chunk),
      { maxRows: chunk.length }
    )

    for (const row of result.data || []) {
      const status = String(row.pedsitped || '').trim().toUpperCase()
      if (status === 'C') continue

      validOrderMetaById.set(String(row.id_pedido), {
        finalityCode: String(row.pdfcodigo || '').trim(),
      })
    }
  }

  const produResult = await fetchOptionalPages(
    () => supabase.from('produ').select('procodigo'),
    { maxRows: 500000 }
  )

  for (const row of produResult.data || []) {
    const productCode = normalizeProductCode(row.procodigo)
    if (productCode) validProductCodeSet.add(productCode)
  }

  let qtdPerdas = 0
  let qtdBaseValida = 0

  const accumulateItems = (rows, validProductCodeSet) => {
    for (const row of rows || []) {
      const orderId = String(row.id_pedido)
      const orderMeta = validOrderMetaById.get(orderId)
      if (!orderMeta) continue

      const productCode = normalizeProductCode(row.procodigo)
      if (!productCode || !validProductCodeSet.has(productCode)) continue
      if (productCodeFilterSet.size > 0 && !productCodeFilterSet.has(productCode)) continue

      const finalityCode = orderMeta.finalityCode || ''
      const quantity = Number(row.quantidade) || 0
      if (!quantity || excludedCodeSet.has(finalityCode)) continue

      if (lossCodeSet.has(finalityCode)) qtdPerdas += quantity
      qtdBaseValida += quantity
    }
  }

  for (const chunk of orderChunks) {
    const productsResult = await fetchOptionalPages(
      () => supabase.from('pdprd').select('id_pedido,procodigo,pdpqtdade').in('id_pedido', chunk),
      { maxRows: 200000 }
    )

    accumulateItems((productsResult.data || []).map(row => ({
      id_pedido: row.id_pedido,
      procodigo: row.procodigo,
      quantidade: row.pdpqtdade,
    })), validProductCodeSet)
  }

  return {
    qtd_perdas: qtdPerdas,
    qtd_lanca_financeiro: Math.max(0, qtdBaseValida - qtdPerdas),
    qtd_perda_produz: qtdBaseValida,
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

function buildCompanyCodeClauses(companyCodeFilter, alias = 'ped') {
  if (!companyCodeFilter?.enabled) return []
  const code = asSqlNumber(companyCodeFilter.code)
  return Number.isFinite(code) ? [`${alias}.empcodigo = ${code}`] : []
}

async function filterDashboardCacheRowsByCompanyCode(supabase, rows = [], companyCodeFilter) {
  if (!companyCodeFilter?.enabled) return rows

  const code = asSqlNumber(companyCodeFilter.code)
  if (!Number.isFinite(code) || rows.length === 0) return rows

  const ids = [...new Set(rows.map(row => asSqlNumber(row.id_pedido)).filter(Number.isFinite))]
  if (ids.length === 0) return []

  const allowedIds = new Set()
  for (const chunk of chunkArray(ids, 500)) {
    const data = await execOptionalSql(
      supabase,
      `
        select id_pedido
        from pedid
        where id_pedido in (${chunk.join(', ')})
          and empcodigo = ${code}
      `
    )

    for (const row of data || []) {
      if (row.id_pedido != null) allowedIds.add(String(row.id_pedido))
    }
  }

  return rows.filter(row => allowedIds.has(String(row.id_pedido)))
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

function buildSalesSql({ dateStart, dateEnd, pedcodigos = [], clicodigos = [], gclcodigos = [], companyCodeFilter = null, kind = 'products' }) {
  const clauses = [
    `ped.peddtemis >= '${dateStart}T00:00:00'`,
    `ped.peddtemis < ('${dateEnd}'::date + interval '1 day')`,
    `ped.pedsitped <> 'C'`,
    ...buildCompanyCodeClauses(companyCodeFilter),
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

function buildOrdersSql({ dateStart, dateEnd, pedcodigos = [], clicodigos = [], gclcodigos = [], companyCodeFilter = null }) {
  const clauses = [
    `ped.peddtemis >= '${dateStart}T00:00:00'`,
    `ped.peddtemis < ('${dateEnd}'::date + interval '1 day')`,
    `ped.pedsitped <> 'C'`,
    ...buildCompanyCodeClauses(companyCodeFilter),
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

function normalizeLossFinalityCodes(value) {
  if (Array.isArray(value)) {
    return [...new Set(
      value.map(code => String(code || '').trim()).filter(Boolean)
    )]
  }

  return [...new Set(
    String(value || '')
      .split(',')
      .map(code => String(code || '').trim())
      .filter(Boolean)
  )]
}

function resolveLossFinalityCodes(company, finalityData) {
  const configuredCodes = normalizeLossFinalityCodes(company?.lossFinalityCodes)
  if (configuredCodes.length > 0) return configuredCodes

  const codes = (finalityData || [])
    .filter(item => normalizeText(item.pdfdescricao).trim().toUpperCase() === 'PERDA')
    .map(item => String(item.pdfcodigo || '').trim())
    .filter(Boolean)

  return codes.length > 0 ? [...new Set(codes)] : ['4', '2']
}

function resolveExcludedLossFinalityCodes(finalityData) {
  return []
}

function buildLossMetricsSql({ dateStart, dateEnd, pedcodigos = [], clicodigos = [], gclcodigos = [], companyCodeFilter = null, lossFinalityCodes = ['2'], productCodeFilters = [], excludedFinalityCodes = [], includeOperationTypeFilter = false }) {
  const clauses = [
    `ped.peddtemis >= '${dateStart}T00:00:00'`,
    `ped.peddtemis < ('${dateEnd}'::date + interval '1 day')`,
    `ped.pedsitped <> 'C'`,
    ...buildCompanyCodeClauses(companyCodeFilter),
  ]

  const clienteList = [...new Set((clicodigos || []).map(asSqlNumber).filter(Number.isFinite))]
  const grupoList = [...new Set((gclcodigos || []).map(asSqlNumber).filter(Number.isFinite))]

  clauses.push(...buildOrderSearchClauses(pedcodigos))
  if (clienteList.length > 0) clauses.push(`ped.clicodigo in (${clienteList.join(', ')})`)
  if (grupoList.length > 0) clauses.push(`cli.gclcodigo in (${grupoList.join(', ')})`)

  const normalizedProductCodes = [...new Set(
    (productCodeFilters || [])
      .map(normalizeProductCode)
      .filter(Boolean)
  )]

  if (normalizedProductCodes.length > 0) {
    clauses.push(`${buildNormalizedProductSqlExpression('prd.procodigo')} in (${normalizedProductCodes.map(sqlLiteral).join(', ')})`)
  }

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
      coalesce(sum(case when base.finalidade in (${lossCodesSql}) then base.qtde_produtos else 0 end), 0) as qtd_perdas,
      greatest(coalesce(sum(base.qtde_produtos), 0) - coalesce(sum(case when base.finalidade in (${lossCodesSql}) then base.qtde_produtos else 0 end), 0), 0) as qtd_lanca_financeiro,
      coalesce(sum(base.qtde_produtos), 0) as qtd_perda_produz
    from (
      select
        ped.pdfcodigo::text as finalidade,
        prd.pdpqtdade::numeric as qtde_produtos
      from pedid ped
      join pdprd prd on ped.id_pedido = prd.id_pedido
      join produ pro on ${buildNormalizedProductSqlExpression('prd.procodigo')} = ${buildNormalizedProductSqlExpression('pro.procodigo')}
      left join clien cli on ped.clicodigo = cli.clicodigo
      where ${clauses.join('\n        and ')}
    ) base
  `
}

function buildLossMetricsByOrderIdsSql({ orderIds = [], lossFinalityCodes = ['2'], productCodeFilters = null, productGroupFilters = null }) {
  const ids = asSqlIdList(orderIds)
  if (!ids) return null

  const normalizedLossCodes = [...new Set(
    (lossFinalityCodes || [])
      .map(code => String(code || '').trim())
      .filter(Boolean)
  )]
  const lossCodesSql = normalizedLossCodes.length > 0
    ? normalizedLossCodes.map(code => `'${code.replace(/'/g, "''")}'`).join(', ')
    : `'2'`

  const hasProductCodeFilter = productCodeFilters != null
  const hasProductGroupFilter = productGroupFilters != null
  const normalizedProductCodes = productCodeFilters == null
    ? []
    : [...new Set(
        [...productCodeFilters]
          .map(normalizeProductCode)
          .filter(Boolean)
      )]
  const normalizedProductGroups = productGroupFilters == null
    ? []
    : [...new Set(
        [...productGroupFilters]
          .map(normalizePermissionFilterValue)
          .filter(Boolean)
      )]

  if (
    (hasProductCodeFilter || hasProductGroupFilter) &&
    normalizedProductCodes.length === 0 &&
    normalizedProductGroups.length === 0
  ) {
    return `
      select
        0::numeric as qtd_perdas,
        0::numeric as qtd_lanca_financeiro,
        0::numeric as qtd_perda_produz
    `
  }

  const productClause = normalizedProductCodes.length > 0
    ? `and ${buildNormalizedProductSqlExpression('prd.procodigo')} in (${normalizedProductCodes.map(sqlLiteral).join(', ')})`
    : ''
  const productGroupClause = normalizedProductGroups.length > 0
    ? `and ${buildNormalizedCodeSqlExpression('pro.gr1codigo')} in (${normalizedProductGroups.map(sqlLiteral).join(', ')})`
    : ''

  return `
    select
      coalesce(sum(case when base.finalidade in (${lossCodesSql}) then base.qtde_produtos else 0 end), 0) as qtd_perdas,
      greatest(coalesce(sum(base.qtde_produtos), 0) - coalesce(sum(case when base.finalidade in (${lossCodesSql}) then base.qtde_produtos else 0 end), 0), 0) as qtd_lanca_financeiro,
      coalesce(sum(base.qtde_produtos), 0) as qtd_perda_produz
    from (
      select
        ped.pdfcodigo::text as finalidade,
        prd.pdpqtdade::numeric as qtde_produtos
      from pedid ped
      join pdprd prd on ped.id_pedido = prd.id_pedido
      join produ pro on ${buildNormalizedProductSqlExpression('prd.procodigo')} = ${buildNormalizedProductSqlExpression('pro.procodigo')}
      where ped.id_pedido in (${ids})
        and ped.pedsitped <> 'C'
        ${productClause}
        ${productGroupClause}
    ) base
  `
}

async function tableExists(supabase, tableName, sampleColumn = '*') {
  try {
    const { error } = await supabase
      .from(tableName)
      .select(sampleColumn, { head: true, count: 'exact' })
      .limit(1)

    return !error
  } catch {
    return false
  }
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

// Nível do módulo — adicionar aqui, antes de getTenantSupabase
function isSafeSqlIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value || '').trim())
}

async function getSupabaseTableColumnSet(supabase, tableName) {
  if (!isSafeSqlIdentifier(tableName)) return new Set()

  const rows = await execOptionalSql(
    supabase,
    `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = '${String(tableName).replace(/'/g, "''")}'
      order by ordinal_position
    `
  )

  return new Set(rows.map(row => String(row.column_name || '').trim()).filter(Boolean))
}

function getFirstExistingColumn(columns, candidates) {
  return candidates.find(column => columns.has(column)) || ''
}

function quoteSqlIdentifier(value) {
  return String(value)
    .split('.')
    .map(part => `"${part.replace(/"/g, '""')}"`)
    .join('.')
}

function sqlLiteral(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`
}

function parseSqlFilterValues(value) {
  return String(value || '')
    .split(',')
    .map(item => normalizeText(item).trim())
    .filter(Boolean)
}

function buildSqlTextExpression(column) {
  return `lower(trim(coalesce(${quoteSqlIdentifier(column)}::text, '')))`
}

function buildNormalizedProductSqlExpression(column) {
  return `coalesce(nullif(ltrim(regexp_replace(trim(coalesce(${quoteSqlIdentifier(column)}::text, '')), '\\.0+$', ''), '0'), ''), '0')`
}

function buildNormalizedCodeSqlExpression(column) {
  return `lower(coalesce(nullif(ltrim(regexp_replace(trim(coalesce(${quoteSqlIdentifier(column)}::text, '')), '\\.0+$', ''), '0'), ''), '0'))`
}

function buildSqlFilterCondition(filter = {}) {
  const operator = String(filter.operator || 'is').trim()
  const values = parseSqlFilterValues(filter.value)
  if (values.length === 0) return null

  const columnText = buildSqlTextExpression(filter.column)
  const normalizedValues = values.map(value => normalizePermissionFilterValue(value)).filter(Boolean)
  if (normalizedValues.length === 0) return null
  const valuesSql = normalizedValues.map(sqlLiteral).join(', ')
  const singleValueSql = sqlLiteral(normalizedValues[0])

  switch (operator) {
    case 'is':
    case 'in':
      return `${columnText} in (${valuesSql})`
    case 'isNot':
      return `${columnText} not in (${valuesSql})`
    case 'contains':
      return `${columnText} like '%' || ${singleValueSql} || '%'`
    case 'notContains':
      return `${columnText} not like '%' || ${singleValueSql} || '%'`
    case 'startsWith':
      return `${columnText} like ${singleValueSql} || '%'`
    case 'endsWith':
      return `${columnText} like '%' || ${singleValueSql}`
    case 'greaterThan':
      return `case when ${quoteSqlIdentifier(filter.column)}::text ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(${quoteSqlIdentifier(filter.column)}::text, ',', '.')::numeric > ${Number(values[0].replace(',', '.')) || 0} else ${columnText} > ${singleValueSql} end`
    case 'greaterThanOrEqual':
      return `case when ${quoteSqlIdentifier(filter.column)}::text ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(${quoteSqlIdentifier(filter.column)}::text, ',', '.')::numeric >= ${Number(values[0].replace(',', '.')) || 0} else ${columnText} >= ${singleValueSql} end`
    case 'lessThan':
      return `case when ${quoteSqlIdentifier(filter.column)}::text ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(${quoteSqlIdentifier(filter.column)}::text, ',', '.')::numeric < ${Number(values[0].replace(',', '.')) || 0} else ${columnText} < ${singleValueSql} end`
    case 'lessThanOrEqual':
      return `case when ${quoteSqlIdentifier(filter.column)}::text ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(${quoteSqlIdentifier(filter.column)}::text, ',', '.')::numeric <= ${Number(values[0].replace(',', '.')) || 0} else ${columnText} <= ${singleValueSql} end`
    default:
      return `${columnText} in (${valuesSql})`
  }
}

function addToOrderMap(map, key, orderId) {
  const normalizedKey = String(key ?? '').trim()
  const normalizedOrderId = String(orderId ?? '').trim()
  if (!normalizedKey || !normalizedOrderId) return
  if (!map.has(normalizedKey)) map.set(normalizedKey, new Set())
  map.get(normalizedKey).add(normalizedOrderId)
}

function buildSupabaseFilterContext(orders = [], products = []) {
  const context = {
    orderIdsByPedcodigo: new Map(),
    orderIdsByClient: new Map(),
    orderIdsBySeller: new Map(),
    orderIdsByProduct: new Map(),
  }

  for (const order of orders || []) {
    addToOrderMap(context.orderIdsByPedcodigo, normalizeOrderCode(order.pedcodigo), order.pedidoId)
    addToOrderMap(context.orderIdsByPedcodigo, normalizeOrderCode(order.pedidoId), order.pedidoId)
    addToOrderMap(context.orderIdsByClient, order.clicodigo, order.pedidoId)
    addToOrderMap(context.orderIdsBySeller, order.vendedorCodigo, order.pedidoId)
  }

  for (const product of products || []) {
    addToOrderMap(context.orderIdsByProduct, normalizeProductCode(product.procodigo), product.pedidoId)
  }

  return context
}

function intersectOrderIdsFromRows(currentIds, rows, linkColumn, context) {
  const matchingIds = new Set()

  for (const row of rows || []) {
    const rawValue = row?.[linkColumn]
    if (rawValue == null) continue
    const key = String(rawValue).trim()
    if (!key) continue

    if (linkColumn === 'id_pedido') {
      matchingIds.add(key)
    } else if (linkColumn === 'pedcodigo') {
      for (const orderId of context.orderIdsByPedcodigo.get(normalizeOrderCode(key)) || []) matchingIds.add(orderId)
    } else if (linkColumn === 'clicodigo') {
      for (const orderId of context.orderIdsByClient.get(key) || []) matchingIds.add(orderId)
    } else if (linkColumn === 'funcodigo') {
      for (const orderId of context.orderIdsBySeller.get(key) || []) matchingIds.add(orderId)
    } else if (linkColumn === 'procodigo') {
      for (const orderId of context.orderIdsByProduct.get(normalizeProductCode(key)) || []) matchingIds.add(orderId)
    }
  }

  return intersectSets(currentIds, matchingIds)
}

async function resolveOrderIdsByProductCodes(supabase, currentIds, productCodes) {
  const codes = [...new Set(productCodes.map(normalizeProductCode).filter(Boolean))]
  const numericOrderIds = [...new Set([...currentIds].map(Number).filter(Number.isFinite))]
  if (codes.length === 0 || numericOrderIds.length === 0) return new Set()

  const matchingIds = new Set()
  const orderChunks = chunkArray(numericOrderIds, 500)
  const codeChunks = chunkArray(codes, 500)

  for (const orderChunk of orderChunks) {
    for (const codeChunk of codeChunks) {
      const data = await execOptionalSql(
        supabase,
        `
          select id_pedido, procodigo
          from pdprd
          where id_pedido in (${orderChunk.join(', ')})
            and ${buildNormalizedProductSqlExpression('procodigo')} in (${codeChunk.map(sqlLiteral).join(', ')})
        `
      )

      for (const row of data || []) {
        if (row.id_pedido != null) matchingIds.add(String(row.id_pedido))
      }
    }
  }

  return intersectSets(currentIds, matchingIds)
}

async function resolveOrderIdsByGroupCodes(supabase, currentIds, groupCodes) {
  const codes = [...new Set((groupCodes || []).map(normalizePermissionFilterValue).filter(Boolean))]
  const numericOrderIds = [...new Set([...currentIds].map(Number).filter(Number.isFinite))]
  if (codes.length === 0 || numericOrderIds.length === 0) return new Set()

  const matchingIds = new Set()
  const orderChunks = chunkArray(numericOrderIds, 500)
  const codeChunks = chunkArray(codes, 500)

  for (const orderChunk of orderChunks) {
    for (const codeChunk of codeChunks) {
      const data = await execOptionalSql(
        supabase,
        `
          select distinct prd.id_pedido
          from pdprd prd
          join produ pro on ${buildNormalizedProductSqlExpression('prd.procodigo')} = ${buildNormalizedProductSqlExpression('pro.procodigo')}
          where prd.id_pedido in (${orderChunk.join(', ')})
            and ${buildNormalizedCodeSqlExpression('pro.gr1codigo')} in (${codeChunk.map(sqlLiteral).join(', ')})
        `
      )

      for (const row of data || []) {
        if (row.id_pedido != null) matchingIds.add(String(row.id_pedido))
      }
    }
  }

  return intersectSets(currentIds, matchingIds)
}

async function resolveSupabaseProductFilterScopeForFilters(supabase, filters = []) {
  const productFilters = filters.filter(filter => filter.source === 'table' && filter.table && filter.column && filter.value)
  if (productFilters.length === 0) return null

  let productCodes = null
  let productGroups = null
  let appliedProductFilter = false

  for (const filter of productFilters) {
    try {
      if (!isSafeSqlIdentifier(filter.table) || !isSafeSqlIdentifier(filter.column)) continue

      const columns = await getSupabaseTableColumnSet(supabase, filter.table)
      if (!columns.has(filter.column)) continue

      const hasProductLink = columns.has('procodigo')
      const hasGroupLink = columns.has('gr1codigo')
      if (!hasProductLink && !hasGroupLink) continue

      const filterCondition = buildSqlFilterCondition(filter)
      if (!filterCondition) continue
      appliedProductFilter = true

      if (hasGroupLink && (filter.column === 'gr1codigo' || !hasProductLink)) {
        const rows = await execOptionalSql(
          supabase,
          `
            select distinct ${buildNormalizedCodeSqlExpression('gr1codigo')} as gr1codigo
            from ${quoteSqlIdentifier(filter.table)}
            where ${filterCondition}
            limit 200000
          `
        )

        const currentGroups = new Set(
          (rows || [])
            .map(row => normalizePermissionFilterValue(row.gr1codigo))
            .filter(Boolean)
        )

        productGroups = productGroups == null ? currentGroups : intersectSets(productGroups, currentGroups)
        continue
      }

      const rows = await execOptionalSql(
        supabase,
        `
          select distinct ${buildNormalizedProductSqlExpression('procodigo')} as procodigo
          from ${quoteSqlIdentifier(filter.table)}
          where ${filterCondition}
          limit 200000
        `
      )

      const currentCodes = new Set(
        (rows || [])
          .map(row => normalizeProductCode(row.procodigo))
          .filter(Boolean)
      )

      productCodes = productCodes == null ? currentCodes : intersectSets(productCodes, currentCodes)
    } catch (error) {
      console.warn('[dashboard][visual-filter] escopo de produtos ignorado', filter.table, filter.column, error?.message || error)
    }
  }

  return appliedProductFilter
    ? {
        productCodes: productCodes || null,
        productGroups: productGroups || null,
      }
    : null
}

async function resolveSupabaseTableFilterIds(supabase, filters = [], orderIds = [], context = {}) {
  const supabaseFilters = filters.filter(f => f.source === 'table' && f.table && f.column && f.value)
  if (supabaseFilters.length === 0) return null

  const ids = [...new Set(orderIds.map(Number).filter(Number.isFinite))]
  if (ids.length === 0) return new Set()

  let allowedIds = new Set(orderIds.map(String))

  for (const filter of supabaseFilters) {
    try {
      if (!isSafeSqlIdentifier(filter.table) || !isSafeSqlIdentifier(filter.column)) {
        console.warn('[dashboard][visual-filter] identificador invalido', filter.table, filter.column)
        continue
      }

      const columns = await getSupabaseTableColumnSet(supabase, filter.table)
      if (!columns.has(filter.column)) {
        console.warn('[dashboard][visual-filter] coluna nao encontrada', filter.table, filter.column)
        continue
      }

      const linkCandidates = filter.column === 'gr1codigo'
        ? ['gr1codigo', 'id_pedido', 'pedcodigo', 'clicodigo', 'funcodigo', 'procodigo']
        : ['id_pedido', 'pedcodigo', 'clicodigo', 'funcodigo', 'procodigo', 'gr1codigo']
      const linkColumn = getFirstExistingColumn(columns, linkCandidates)
      if (!linkColumn) {
        console.warn('[dashboard][visual-filter] tabela sem coluna de vinculo com pedidos', filter.table)
        continue
      }

      const filterCondition = buildSqlFilterCondition(filter)
      if (!filterCondition) {
        console.warn('[dashboard][visual-filter] condicao invalida', filter.table, filter.column)
        continue
      }

      const matchingOrderIds = new Set()
      const selectColumns = [...new Set([linkColumn, filter.column])].map(quoteSqlIdentifier).join(', ')
      const tableSql = quoteSqlIdentifier(filter.table)

      if (linkColumn === 'id_pedido') {
        const chunks = chunkArray(ids, 500)

        for (const chunk of chunks) {
          const data = await execOptionalSql(
            supabase,
            `
              select ${selectColumns}
              from ${tableSql}
              where ${quoteSqlIdentifier('id_pedido')} in (${chunk.join(', ')})
                and (${filterCondition})
            `
          )

          for (const row of data || []) {
            if (row.id_pedido != null) matchingOrderIds.add(String(row.id_pedido))
          }
        }

        allowedIds = intersectSets(allowedIds, matchingOrderIds)
        continue
      }

      const data = await execOptionalSql(
        supabase,
        `
          select ${selectColumns}
          from ${tableSql}
          where ${filterCondition}
          limit 200000
        `
      )

      const matchingRows = data || []
      if (linkColumn === 'gr1codigo') {
        const groupCodes = matchingRows.map(row => row.gr1codigo)
        allowedIds = await resolveOrderIdsByGroupCodes(
          supabase,
          allowedIds,
          groupCodes
        )
        continue
      }

      const linkedIds = intersectOrderIdsFromRows(allowedIds, matchingRows, linkColumn, context)
      if (linkColumn === 'procodigo' && linkedIds.size === 0) {
        allowedIds = await resolveOrderIdsByProductCodes(
          supabase,
          allowedIds,
          matchingRows.map(row => row.procodigo)
        )
      } else {
        allowedIds = linkedIds
      }
    } catch (error) {
      console.warn('[dashboard][visual-filter] filtro ignorado', filter.table, filter.column, error?.message || error)
    }
  }

  return allowedIds
}

async function resolveOrderCompletionRuleIds(supabase, rules = [], orders = []) {
  const validRules = (rules || []).filter(rule => rule.table && rule.column && rule.value)
  if (validRules.length === 0 || orders.length === 0) return new Set()

  const baseOrderIds = [...new Set(orders.map(order => String(order.pedidoId)).filter(Boolean))]
  const context = buildSupabaseFilterContext(orders, [])
  const completedIds = new Set()

  for (const rule of validRules) {
    const resolvedIds = await resolveSupabaseTableFilterIds(
      supabase,
      [{
        ...rule,
        source: 'table',
        operator: 'is',
      }],
      baseOrderIds,
      context
    )

    for (const orderId of resolvedIds || []) {
      completedIds.add(String(orderId))
    }
  }

  return completedIds
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
    const requestedMode = String(searchParams.get('mode') || 'analysis').trim().toLowerCase()
    const dashboardMode = requestedMode === 'pps' ? 'pps' : 'analysis'
    const pageKey = dashboardMode === 'pps' ? PORTAL_PAGE_KEYS.PPS : PORTAL_PAGE_KEYS.ANALYSIS
    const { company, companySecrets, profile } = await resolveAuthorizedCompany(request, tenantSlug)
    const supabase = (() => {
      const { url: supabaseUrl, serviceRoleKey: supabaseServiceRoleKey } = resolveSupabaseConfig(company, companySecrets)

      if (!supabaseUrl || !supabaseServiceRoleKey) {
        throw new Error(`Supabase nao configurado para o tenant ${company.slug}.`)
      }

      return createTenantSupabase(supabaseUrl, supabaseServiceRoleKey)
    })()
    const permissions = normalizeUserPermissions(profile.permissions, company)

    if (profile.role !== 'admin' && !permissions.pages[pageKey]) {
      throw new Error('Acesso negado a este modulo.')
    }

    const dashboardCompanyFilters = getCompanyDashboardFilters(company, dashboardMode)
    const dashboardPermissionFilters = profile.role === 'admin' ? [] : getDashboardFilters(company, permissions, dashboardMode)
    const dashboardScopedFilters = [...dashboardCompanyFilters, ...dashboardPermissionFilters]
    const dashboardVisualFilters = getCompanyDashboardVisualFilters(company, dashboardMode)
    const orderCompletionRules = getCompanyOrderCompletionRules(company)
    const companyCodeFilter = getCompanyCodeFilter(company)

    const fallbackStart = format(addDays(new Date(), -30), 'yyyy-MM-dd')
    const fallbackEnd = format(new Date(), 'yyyy-MM-dd')
    const dateStart = asSqlDate(searchParams.get('dateStart'), fallbackStart)
    const dateEnd = asSqlDate(searchParams.get('dateEnd'), fallbackEnd)
    const pedcodigoValues = parseCsvParam(searchParams, 'pedcodigo').map(normalizeOrderCode)
    const statusFilters = parseCsvParam(searchParams, 'status')
    const clicodigoValues = parseCsvParam(searchParams, 'clicodigo')
    const clinomeFilters = parseCsvParam(searchParams, 'clinome')
    const gclcodigoValues = parseCsvParam(searchParams, 'gclcodigo')
    const zocodigoValues = parseCsvParam(searchParams, 'zocodigo')
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

    if (dashboardCacheRes.error) {
      throw new Error(`pedido_dashboard_cache: ${dashboardCacheRes.error.message}`)
    }

    if (dashboardCacheRes.missingCacheTable) {
      throw new Error('pedido_dashboard_cache ainda nao foi criada/populada. Rode o sync novamente para inicializar o cache do dashboard.')
    }

    const finalityData = finalityRes.error ? [] : (finalityRes.data || [])
    const lossFinalityCodes = resolveLossFinalityCodes(company, finalityData)
    const excludedLossFinalityCodes = resolveExcludedLossFinalityCodes(finalityData)
    const dashboardCacheRows = await filterDashboardCacheRowsByCompanyCode(
      supabase,
      dashboardCacheRes.data || [],
      companyCodeFilter
    )
    if (finalityRes.error) {
      console.warn('[dashboard][pedfinalidade]', sanitizeErrorMessage(finalityRes.error))
    }

    let lossMetricsRows = []
    let lossMetricsError = null
    try {
      const sqlRows = await execSql(
        supabase,
        buildLossMetricsSql({
          dateStart,
          dateEnd,
          pedcodigos: pedcodigoValues,
          clicodigos: clientCodeFilters,
          gclcodigos: gclcodigoValues,
          companyCodeFilter,
          lossFinalityCodes,
          excludedFinalityCodes: excludedLossFinalityCodes,
        })
      )

      if (Array.isArray(sqlRows) && sqlRows.length > 0) {
        lossMetricsRows = sqlRows
      } else {
        throw new Error('A SQL de perdas nao retornou nenhuma linha agregada.')
      }
    } catch (sqlError) {
      console.error('[dashboard][loss-metrics-sql]', sqlError)
      lossMetricsError = buildLossError('SQL', sqlError)

      try {
        const fallbackMetrics = await fetchLossMetricsFallback(
          supabase,
          dashboardCacheRows.map(row => row.id_pedido),
          lossFinalityCodes,
          excludedLossFinalityCodes
        )
        lossMetricsRows = [fallbackMetrics]
      } catch (fallbackError) {
        console.error('[dashboard][loss-metrics-fallback]', fallbackError)
        lossMetricsRows = []
        lossMetricsError = buildLossError('FALLBACK', fallbackError)
      }
    }

    let cachedOrders = dashboardCacheRows.map(row => {
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
        delayRank: buildDelayRank(parseLocalDateTime(row.emissao), parseLocalDateTime(row.saida), now),
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

    const [clientLookup, sellerLookup, almoxLookup] = await Promise.all([
      fetchClientLookup(
        supabase,
        cachedOrders.map(order => order.clicodigo)
      ),
      fetchSellerLookup(
        supabase,
        cachedOrders.map(order => order.vendedorCodigo)
      ),
      fetchAlmoxLookup(
        supabase,
        cachedOrders.flatMap(order => (order.roteiro || []).map(step => step.alxcodigo))
      ),
    ])

    cachedOrders = cachedOrders.map(order => {
      const clientDetails = clientLookup.get(String(order.clicodigo)) || null

      return {
      ...order,
      roteiro: (order.roteiro || []).map(step => {
        const descricao = normalizeText(step.descricao) || almoxLookup.get(String(step.alxcodigo || '')) || ''
        const normalizedLabel =
          !String(step.label || '').trim() || /^\d+$/.test(String(step.label || '').trim())
            ? buildRouteStepLabel(step.alxcodigo || step.label, descricao)
            : String(step.label || '').trim()

        return {
          ...step,
          descricao,
          label: normalizedLabel,
        }
      }),
      clinome: order.clinome || clientDetails?.clinome || '',
      gclcodigo: order.gclcodigo ?? clientDetails?.gclcodigo ?? null,
      clicliente: clientDetails?.clicliente ?? null,
      endcodigo: clientDetails?.endcodigo ?? null,
      zocodigo: clientDetails?.zocodigo ?? null,
      vendedorNome:
        order.vendedorNome ||
        sellerLookup.get(String(order.vendedorCodigo)) ||
        '',
    }}).map(order => ({
      ...order,
      roteiroResumo:
        (order.roteiro || []).length > 0
          ? order.roteiro.map(step => step.label).join(' | ')
          : order.roteiroResumo,
    }))

    const completionRuleIds = await resolveOrderCompletionRuleIds(supabase, orderCompletionRules, cachedOrders)
    cachedOrders = cachedOrders.map(order =>
      resolveOrderOperationalState(order, now, completionRuleIds.has(String(order.pedidoId)))
    )

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
      gclcodigo: order.gclcodigo,
      clicliente: order.clicliente,
      endcodigo: order.endcodigo,
      zocodigo: order.zocodigo,
      vendedorCodigo: order.vendedorCodigo,
      vendedorNome: order.vendedorNome,
    }))

    if (statusFilters.length > 0) orders = orders.filter(row => rowMatchesAnyFilter(row, 'status', statusFilters))
    if (emissaoFilters.length > 0) orders = orders.filter(row => rowMatchesAnyFilter(row, 'emissao', emissaoFilters))
    if (indiceFilters.length > 0) orders = orders.filter(row => rowMatchesAnyFilter(row, 'indice', indiceFilters))
    if (previstoFilters.length > 0) orders = orders.filter(row => rowMatchesAnyFilter(row, 'previsto', previstoFilters))
    if (saidaFilters.length > 0) orders = orders.filter(row => rowMatchesAnyFilter(row, 'saida', saidaFilters))
    if (quantidadeFilters.length > 0) orders = orders.filter(row => rowMatchesAnyFilter(row, 'quantidade', quantidadeFilters))
    if (currentCellFilters.length > 0) orders = orders.filter(row => rowMatchesAnyFilter(row, 'currentCell', currentCellFilters))
    if (zocodigoValues.length > 0) orders = orders.filter(row => rowMatchesAnyFilter(row, 'zocodigo', zocodigoValues))

    orders.sort((a, b) => {
      if (b.statusPriority !== a.statusPriority) return b.statusPriority - a.statusPriority
      return b.delayRank - a.delayRank
    })

    const visibleOrderIds = new Set(orders.map(row => row.pedidoId))
    let selectedCachedOrders = cachedOrders.filter(order => visibleOrderIds.has(order.pedidoId))
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

    if (dashboardScopedFilters.length > 0) {
      let allowedOrderIds = new Set(orders.map(row => row.pedidoId))
      const ordersByCustomer = new Map()
      const ordersBySeller = new Map()

      for (const order of selectedCachedOrders) {
        const orderId = order.pedidoId
        const customerKey = String(order.clicodigo || '')
        const sellerKey = String(order.vendedorCodigo || '')

        if (!ordersByCustomer.has(customerKey)) ordersByCustomer.set(customerKey, new Set())
        ordersByCustomer.get(customerKey).add(orderId)

        if (!ordersBySeller.has(sellerKey)) ordersBySeller.set(sellerKey, new Set())
        ordersBySeller.get(sellerKey).add(orderId)
      }

      const customerSummaryRows = Object.values(
        selectedCachedOrders.reduce((accumulator, order) => {
          const key = String(order.clicodigo || '')
          if (!accumulator[key]) {
            accumulator[key] = {
              clicodigo: order.clicodigo,
              clinome: order.clinome || `Cliente ${order.clicodigo}`,
              gclcodigo: order.gclcodigo,
              clicliente: order.clicliente,
              endcodigo: order.endcodigo,
              zocodigo: order.zocodigo,
              total: 0,
              onTime: 0,
              daysTotal: 0,
              daysCount: 0,
            }
          }

          accumulator[key].total += 1
          accumulator[key].onTime += order.indice >= 100 ? 1 : 0
          if (order.emittedDate && order.deliveredDate) {
            accumulator[key].daysTotal += Math.max(0, differenceInDays(order.deliveredDate, order.emittedDate))
            accumulator[key].daysCount += 1
          }
          return accumulator
        }, {})
      ).map(customer => ({
        clicodigo: customer.clicodigo,
        clinome: customer.clinome,
        gclcodigo: customer.gclcodigo,
        clicliente: customer.clicliente,
        endcodigo: customer.endcodigo,
        zocodigo: customer.zocodigo,
        indice: customer.total > 0 ? Math.round((customer.onTime / customer.total) * 100) : 0,
        mediaDias: customer.daysCount > 0 ? Number((customer.daysTotal / customer.daysCount).toFixed(1)) : 0,
      }))

      const sellerSummaryRows = Object.values(
        selectedCachedOrders.reduce((accumulator, order) => {
          const key = String(order.vendedorCodigo || '')
          if (!accumulator[key]) {
            accumulator[key] = {
              vendedorCodigo: key,
              vendedorNome: normalizeText(order.vendedorNome) || 'Nao informado',
              totalVendas: 0,
              totalPecas: 0,
            }
          }

          accumulator[key].totalVendas += 1
          accumulator[key].totalPecas += Number(order.quantidade) || 0
          return accumulator
        }, {})
      )

      const tableSources = {
        orders,
        products,
        traceability,
        customers: customerSummaryRows,
        sellers: sellerSummaryRows,
      }

      for (const filter of dashboardScopedFilters) {
        const sourceRows = tableSources[filter.table]
        if (!Array.isArray(sourceRows) || sourceRows.length === 0) continue

        const matchingOrderIds = new Set()

        if (filter.table === 'customers') {
          for (const row of sourceRows) {
            if (!matchesPermissionFilter(row[filter.column], filter)) continue
            for (const orderId of ordersByCustomer.get(String(row.clicodigo || '')) || []) matchingOrderIds.add(orderId)
          }
        } else if (filter.table === 'sellers') {
          for (const row of sourceRows) {
            if (!matchesPermissionFilter(row[filter.column], filter)) continue
            for (const orderId of ordersBySeller.get(String(row.vendedorCodigo || '')) || []) matchingOrderIds.add(orderId)
          }
        } else {
          for (const row of sourceRows) {
            if (!matchesPermissionFilter(row[filter.column], filter)) continue
            if (row.pedidoId != null) matchingOrderIds.add(String(row.pedidoId))
          }
        }

        allowedOrderIds = intersectSets(allowedOrderIds, matchingOrderIds)
      }

      orders = orders.filter(row => allowedOrderIds.has(row.pedidoId))
      products = products.filter(row => allowedOrderIds.has(row.pedidoId))
      traceability = traceability.filter(row => allowedOrderIds.has(row.pedidoId))
      selectedCachedOrders = selectedCachedOrders.filter(row => allowedOrderIds.has(row.pedidoId))
    }

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
          clicliente: order.clicliente,
          endcodigo: order.endcodigo,
          zocodigo: order.zocodigo,
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
        clicliente: customer.clicliente,
        endcodigo: customer.endcodigo,
        zocodigo: customer.zocodigo,
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

    const getVisualFilters = sectionKey => dashboardVisualFilters?.[sectionKey] || []

    const getVisualOrderIds = async sectionKey => {
      const sectionFilters = getVisualFilters(sectionKey)
      const memoryFilters = sectionFilters.filter(f => f.source !== 'table')
      const supabaseFilterList = sectionFilters.filter(f => f.source === 'table')
      const supabaseFilterContext = buildSupabaseFilterContext(finalCachedOrders, products)

      const baseIds = resolveAllowedOrderIdsFromDashboardFilters(
        memoryFilters, finalCachedOrders, products, traceability
      )

      if (supabaseFilterList.length === 0) return baseIds

      const supabaseIds = await resolveSupabaseTableFilterIds(
        supabase, supabaseFilterList, [...baseIds], supabaseFilterContext
      )

      return supabaseIds ?? baseIds
    }

    const getVisualOrders = async sectionKey => {
      const allowedOrderIds = await getVisualOrderIds(sectionKey)
      return orders.filter(row => allowedOrderIds.has(row.pedidoId))
    }

    const getVisualCachedOrders = async sectionKey => {
      const allowedOrderIds = await getVisualOrderIds(sectionKey)
      return finalCachedOrders.filter(row => allowedOrderIds.has(row.pedidoId))
    }

    const [
      kpiOrders,
      pontualidadeOrders,
      historyOrders,
      productOrderIds,
      traceabilityOrderIds,
    ] = await Promise.all([
      getVisualOrders('kpis'),
      getVisualOrders('pontualidadeChart'),
      getVisualOrders('history'),
      getVisualOrderIds('products'),
      getVisualOrderIds('traceability'),
    ])

    const visualProducts = products.filter(row => productOrderIds.has(row.pedidoId))
    const visualTraceability = traceability.filter(row => traceabilityOrderIds.has(row.pedidoId))

    const visualCustomers = getVisualFilters('customerService').length > 0
      ? buildCustomerRowsFromOrders(await getVisualCachedOrders('customerService'))
      : customers

    const visualSellerRanking = getVisualFilters('sellerRanking').length > 0
      ? buildSellerRowsFromOrders(await getVisualCachedOrders('sellerRanking'))
      : sellerRanking

    const weekMap = {}
    for (const order of pontualidadeOrders) {
      const week = format(startOfWeek(parseISO(order.emissao), { locale: ptBR }), 'dd/MM', { locale: ptBR })
      if (!weekMap[week]) weekMap[week] = { period: week, noPrazo: 0, atrasado: 0, producao: 0 }
      if (order.status === 'completed') weekMap[week].noPrazo += 1
      else if (order.status === 'delayed' || order.status === 'delayed_completed') weekMap[week].atrasado += 1
      else weekMap[week].producao += 1
    }

    const pontualidade = Object.values(weekMap).slice(-8)
    let visualLossMetricsRows = lossMetricsRows
    let visualLossMetricsError = lossMetricsError
    const perdasVisualFilters = getVisualFilters('perdasChart')

    if (dashboardScopedFilters.length > 0 || perdasVisualFilters.length > 0) {
      try {
        const lossOrderIds = perdasVisualFilters.length > 0
          ? [...await getVisualOrderIds('perdasChart')]
          : [...finalOrderIds]
        const perdasTableFilters = perdasVisualFilters.filter(filter => filter.source === 'table')
        const lossProductScope = await resolveSupabaseProductFilterScopeForFilters(supabase, perdasTableFilters)
        const lossSql = buildLossMetricsByOrderIdsSql({
          orderIds: lossOrderIds,
          lossFinalityCodes,
          productCodeFilters: lossProductScope?.productCodes ?? null,
          productGroupFilters: lossProductScope?.productGroups ?? null,
        })

        visualLossMetricsRows = lossSql ? await execSql(supabase, lossSql) : [{ qtd_perdas: 0, qtd_lanca_financeiro: 0, qtd_perda_produz: 0 }]
        visualLossMetricsError = null
      } catch (fallbackError) {
        console.error('[dashboard][loss-metrics-visual-fallback]', fallbackError)
        visualLossMetricsRows = []
        visualLossMetricsError = buildLossError('VISUAL_FILTER', fallbackError)
      }
    }

    const lossMetrics = visualLossMetricsRows?.[0] || {}
    const lossQuantity = Number(lossMetrics.qtd_perdas) || 0
    const baseWithoutLossQuantity = Number(lossMetrics.qtd_lanca_financeiro) || 0
    const totalQuantity = Number(lossMetrics.qtd_perda_produz) || (lossQuantity + baseWithoutLossQuantity)

    if (!visualLossMetricsError && cachedOrders.length > 0 && totalQuantity === 0) {
      visualLossMetricsError = {
        code: 'LOSS_EMPTY_BASE',
        message: `A base de perdas retornou zero pecas validas apesar de existirem ${cachedOrders.length} pedidos no periodo. Verifique PDPRD, PRODU e os codigos de perda configurados (${lossFinalityCodes.join(', ') || 'nenhum'}).`,
      }
    }

    if (cachedOrders.length === 0 && totalQuantity > 0) {
      throw new Error('pedido_dashboard_cache ainda nao foi populada para este periodo. A base de perdas respondeu, mas o cache principal do dashboard ainda nao foi preenchido.')
    }

    const perdas = {
      total: totalQuantity,
      withLoss: lossQuantity,
      percentage: totalQuantity > 0 ? Number(((lossQuantity / totalQuantity) * 100).toFixed(2)) : 0,
      semPerda: Math.max(0, totalQuantity - lossQuantity),
      errorCode: visualLossMetricsError?.code || '',
      errorMessage: visualLossMetricsError?.message || '',
    }

    const totalOrders = kpiOrders.length
    const completed = kpiOrders.filter(row => row.status === 'completed' || row.status === 'delayed_completed').length
    const deliveredOnTime = kpiOrders.filter(row => row.status === 'completed').length
    const onTime = kpiOrders.filter(row => row.status === 'completed' || row.status === 'in_progress').length
    const inProduction = kpiOrders.filter(row => row.status === 'in_progress').length
    const inProductionDelayed = kpiOrders.filter(row => row.status === 'delayed').length
    const deliveredDelayed = kpiOrders.filter(row => row.status === 'delayed_completed').length

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
        orders: historyOrders,
        products: visualProducts.slice(0, 200),
        traceability: pedcodigoValues.length > 0 ? visualTraceability : visualTraceability.slice(0, 150),
        customers: visualCustomers.slice(0, 100),
        sellerRanking: visualSellerRanking,
      },
      { headers: NO_STORE_HEADERS }
    )
  } catch (error) {
    console.error('[dashboard]', error)
    return NextResponse.json({ error: sanitizeErrorMessage(error) }, { status: getErrorStatus(error), headers: NO_STORE_HEADERS })
  }
}
