import { differenceInDays, differenceInMinutes, format, parseISO, startOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const DEFAULT_SCAN_WINDOW = 1500
const DEFAULT_LIMIT = 500

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeDateTime(value) {
  if (!value) return ''
  const text = String(value).trim()
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00:00`
  return text
}

function parseDateTime(value) {
  const text = normalizeDateTime(value)
  if (!text) return null

  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

function asSqlDate(value, fallback) {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback
}

function parseCsvParam(searchParams, key) {
  return [...new Set(
    String(searchParams.get(key) || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
  )]
}

function parseList(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean)
  }

  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function normalizeOrderCode(value) {
  const text = String(value || '').trim()
  return text.replace(/\.0+$/, '')
}

function resolveStatus(expected, delivered, now) {
  if (delivered) return expected && delivered > expected ? 'delayed_completed' : 'completed'
  return expected && now > expected ? 'delayed' : 'in_progress'
}

function normalizePermissionFilterValue(value) {
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

function matchesFilter(rawValue, filter = {}) {
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
    const key = String(order.clicodigo || '')
    if (!customerMap[key]) {
      customerMap[key] = {
        clicodigo: key,
        clinome: order.clinome || `Cliente ${key}`,
        total: 0,
        onTime: 0,
        daysTotal: 0,
        daysCount: 0,
        gclcodigo: order.gclcodigo || '',
      }
    }

    const customer = customerMap[key]
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
      gclcodigo: customer.gclcodigo,
      indice: customer.total > 0 ? Math.round((customer.onTime / customer.total) * 100) : 0,
      mediaDias: customer.daysCount > 0 ? Number((customer.daysTotal / customer.daysCount).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.indice - a.indice)
}

function buildSellerRowsFromOrders(sourceOrders = []) {
  const sellerMap = {}

  for (const order of sourceOrders) {
    const sellerCode = String(order.vendedorCodigo || '')
    if (!sellerMap[sellerCode]) {
      sellerMap[sellerCode] = {
        vendedorCodigo: sellerCode,
        vendedorNome: normalizeText(order.vendedorNome) || 'Nao informado',
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

function resolveAllowedOrderIdsFromFilters(filters = [], orders = [], products = [], traceability = []) {
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
        if (!matchesFilter(row[filter.column], filter)) continue
        for (const orderId of ordersByCustomer.get(String(row.clicodigo || '')) || []) matchingOrderIds.add(orderId)
      }
    } else if (filter.table === 'sellers') {
      for (const row of sourceRows) {
        if (!matchesFilter(row[filter.column], filter)) continue
        for (const orderId of ordersBySeller.get(String(row.vendedorCodigo || '')) || []) matchingOrderIds.add(orderId)
      }
    } else {
      for (const row of sourceRows) {
        if (!matchesFilter(row[filter.column], filter)) continue
        if (row.pedidoId != null) matchingOrderIds.add(String(row.pedidoId))
      }
    }

    allowedOrderIds = intersectSets(allowedOrderIds, matchingOrderIds)
  }

  return allowedOrderIds
}

function resolveRouteSteps(routes = [], expected, now) {
  return (routes || []).map((route, index) => {
    const labelSource = normalizeText(
      route.warehouseDescription ||
      route.locationDescription ||
      route.currentCell ||
      route.location ||
      route.warehouseCode ||
      route.locationCode ||
      `ETP${index + 1}`
    )
    const label = labelSource || `ETP${index + 1}`
    const finishedAt = parseDateTime(route.finishedAt || route.finishDate)
    const startedAt = parseDateTime(route.startedAt || route.initialDate)
    const state = finishedAt ? 'completed' : expected && now > expected ? 'delayed' : 'pending'

    return {
      ordem: index + 1,
      label: label.slice(0, 8).toUpperCase(),
      descricao: normalizeText(route.warehouseDescription || route.locationDescription || label),
      state,
      startedAt: startedAt ? startedAt.toISOString() : '',
      finishedAt: finishedAt ? finishedAt.toISOString() : '',
    }
  })
}

function normalizeOrderRow(order = {}, routesByOrderId = new Map(), now = new Date()) {
  const pedidoId = String(order.pedidoId || order.id || order.orderId || order.pedcodigo || '').trim()
  const pedcodigo = normalizeOrderCode(order.pedcodigo || order.code || pedidoId)
  const emittedDate = parseDateTime(order.emissao || order.issueDate)
  const expectedDate = parseDateTime(order.previsto || order.deliveryDate || order.deliveryDateSystem)
  const deliveredDate = parseDateTime(order.saida || order.expeditionDate || order.closedDate)
  const status = resolveStatus(expectedDate, deliveredDate, now)
  const indice = expectedDate && deliveredDate
    ? deliveredDate <= expectedDate ? 100 : 0
    : status === 'in_progress' ? 100 : 0
  const roteiro = resolveRouteSteps(routesByOrderId.get(pedidoId) || [], expectedDate, now)

  const customerInfo = order.customer || {}
  const customerCode = String(
    order.clicodigo ||
    order.customerId ||
    customerInfo.code ||
    customerInfo.id ||
    customerInfo.customerId ||
    ''
  ).trim()
  const customerName = normalizeText(
    order.clinome ||
    order.customerName ||
    customerInfo.name ||
    customerInfo.fullName ||
    customerInfo.tradeName ||
    customerInfo.companyName ||
    customerInfo.socialName ||
    ''
  )

  return {
    pedidoId,
    pedcodigo,
    emissao: emittedDate ? emittedDate.toISOString() : '',
    indice,
    previsto: expectedDate ? expectedDate.toISOString() : '',
    saida: deliveredDate ? deliveredDate.toISOString() : '',
    quantidade: Number(order.quantidade ?? order.totalQuantity ?? 0) || 0,
    status,
    currentCell: normalizeText(order.currentCell || order.currentLocation || order.location || '-') || '-',
    caixa: normalizeText(order.caixa || order.box || '0') || '0',
    roteiro,
    roteiroResumo: roteiro.map(step => step.label).join(' | '),
    delayRank: expectedDate ? Math.max(0, differenceInMinutes(now, deliveredDate || expectedDate)) : 0,
    statusPriority: status === 'delayed' ? 4 : status === 'in_progress' ? 3 : status === 'delayed_completed' ? 2 : 1,
    rowTone: status === 'delayed' || status === 'delayed_completed' ? 'danger' : 'success',
    clicodigo: customerCode,
    clinome: customerName || 'Cliente nao informado',
    gclcodigo: String(order.gclcodigo || order.customerGroupId || ''),
    vendedorCodigo: String(order.vendedorCodigo || order.sellerId || ''),
    vendedorNome: normalizeText(order.vendedorNome || order.sellerName || 'Nao informado'),
    emittedDate,
    deliveredDate,
  }
}

function normalizeProductRow(item = {}, orderById = new Map()) {
  const pedidoId = String(item.pedidoId || item.orderId || '').trim()
  const order = orderById.get(pedidoId) || {}

  return {
    pedidoId,
    pedcodigo: normalizeOrderCode(item.pedcodigo || order.pedcodigo || pedidoId),
    procodigo: String(item.procodigo || item.code || item.productCode || '').trim(),
    procodigo2: String(item.procodigo2 || item.externalCode || '').trim(),
    prodescricao: normalizeText(item.prodescricao || item.description || 'Produto sem descricao'),
    status: normalizeText(item.status || item.type || ''),
    quantidade: Number(item.quantidade ?? item.quantity ?? 0) || 0,
    missingQuantity: Number(item.missingQuantity ?? item.lossQuantity ?? 0) || 0,
    clinome: order.clinome || '',
    clicodigo: order.clicodigo || '',
    linha: String(item.productLineId || item.linha || ''),
    linhaDescricao: normalizeText(item.productLineDescription || item.linhaDescricao || ''),
  }
}

function normalizeTraceabilityRow(row = {}, orderById = new Map(), type = 'tracking') {
  const pedidoId = String(row.pedidoId || row.orderId || '').trim()
  const order = orderById.get(pedidoId) || {}
  const dateTime = normalizeDateTime(row.dataHora || row.dateTime || row.startedAt || row.finishedAt || row.date || '')

  return {
    pedidoId,
    pedcodigo: normalizeOrderCode(row.pedcodigo || order.pedcodigo || pedidoId),
    estoque: normalizeText(row.warehouseDescription || row.locationDescription || row.location || row.warehouseCode || ''),
    celula: normalizeText(row.locationDescription || row.warehouseDescription || row.currentCell || ''),
    usuario: normalizeText(row.userName || row.user || row.operator || type),
    dataHora: dateTime,
    observacao: normalizeText(row.observation || row.description || row.occurrence || ''),
  }
}

function applyDirectFilters({ orders, products, traceability, searchParams }) {
  const filters = [
    ['pedcodigo', parseCsvParam(searchParams, 'pedcodigo')],
    ['status', parseCsvParam(searchParams, 'status')],
    ['clicodigo', parseCsvParam(searchParams, 'clicodigo')],
    ['clinome', parseCsvParam(searchParams, 'clinome')],
    ['gclcodigo', parseCsvParam(searchParams, 'gclcodigo')],
    ['currentCell', parseCsvParam(searchParams, 'currentCell')],
  ].filter(([, values]) => values.length > 0)

  let filteredOrders = orders
  for (const [field, values] of filters) {
    filteredOrders = filteredOrders.filter(order => values.some(value => matchesFilter(order[field], { operator: 'is', value })))
  }

  const finalOrderIds = new Set(filteredOrders.map(order => order.pedidoId))
  return {
    orders: filteredOrders,
    products: products.filter(row => finalOrderIds.has(row.pedidoId)),
    traceability: traceability.filter(row => finalOrderIds.has(row.pedidoId)),
  }
}

function buildApiUrl(settings, searchParams) {
  const baseUrl = String(settings.gradualApiUrl || '').trim().replace(/\/+$/, '')
  if (!baseUrl) {
    throw new Error('URL da API Gradual nao configurada para esta empresa.')
  }

  const fallbackEnd = format(new Date(), 'yyyy-MM-dd')
  const fallbackStart = format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
  const dateStart = asSqlDate(searchParams.get('dateStart'), fallbackStart)
  const dateEnd = asSqlDate(searchParams.get('dateEnd'), fallbackEnd)
  const url = new URL('/api/pps/orders', baseUrl)

  url.searchParams.set('start', dateStart)
  url.searchParams.set('end', dateEnd)
  url.searchParams.set('limit', String(Number(settings.gradualApiLimit) || DEFAULT_LIMIT))
  url.searchParams.set('scanWindow', String(Number(settings.gradualApiScanWindow) || DEFAULT_SCAN_WINDOW))

  const companyIds = parseList(settings.gradualApiCompanyIds)
  const source = String(settings.gradualApiSource || '').trim()
  if (source) url.searchParams.set('source', source)
  if (companyIds.length > 0) url.searchParams.set('companies', companyIds.join(','))
  if (settings.gradualApiStartOrderId) url.searchParams.set('startOrderId', String(settings.gradualApiStartOrderId).trim())

  return url
}

export async function buildGradualApiDashboardPayload({
  companySettings,
  searchParams,
  dashboardScopedFilters = [],
  dashboardVisualFilters = {},
}) {
  const url = buildApiUrl(companySettings, searchParams)
  const gradualApiKey = String(companySettings.gradualApiKey || '').trim()
  const response = await fetch(url, {
    cache: 'no-store',
    headers: gradualApiKey ? { 'x-gs-api-key': gradualApiKey } : {},
  })

  const responseText = await response.text().catch(() => '')
  if (!response.ok) {
    throw new Error(`API Gradual respondeu ${response.status}: ${responseText || response.statusText}`)
  }

  let payload
  try {
    payload = responseText ? JSON.parse(responseText) : {}
  } catch (error) {
    const preview = responseText ? responseText.slice(0, 180) : response.statusText
    throw new Error(`API Gradual retornou uma resposta invalida: ${preview}`)
  }
  const datasets = payload.datasets || {}
  const rawOrders = Array.isArray(datasets.orders) ? datasets.orders : Array.isArray(payload.orders) ? payload.orders : []
  const rawItems = Array.isArray(datasets.items) ? datasets.items : []
  const rawRoutes = Array.isArray(datasets.routes) ? datasets.routes : []
  const rawTracking = Array.isArray(datasets.tracking) ? datasets.tracking : []
  const rawOccurrences = Array.isArray(datasets.occurrences) ? datasets.occurrences : []
  const now = new Date()

  const routesByOrderId = new Map()
  for (const route of rawRoutes) {
    const pedidoId = String(route.pedidoId || route.orderId || '').trim()
    if (!routesByOrderId.has(pedidoId)) routesByOrderId.set(pedidoId, [])
    routesByOrderId.get(pedidoId).push(route)
  }

  const orders = rawOrders
    .map(order => normalizeOrderRow(order, routesByOrderId, now))
    .filter(order => order.pedidoId && order.emissao)
  const orderById = new Map(orders.map(order => [order.pedidoId, order]))
  const products = rawItems.map(item => normalizeProductRow(item, orderById)).filter(row => row.pedidoId)
  const traceability = [
    ...rawRoutes.map(row => normalizeTraceabilityRow(row, orderById, 'rota')),
    ...rawTracking.map(row => normalizeTraceabilityRow(row, orderById, 'tracking')),
    ...rawOccurrences.map(row => normalizeTraceabilityRow(row, orderById, 'ocorrencia')),
  ].filter(row => row.pedidoId)

  const directFiltered = applyDirectFilters({ orders, products, traceability, searchParams })
  const scopedOrderIds = resolveAllowedOrderIdsFromFilters(
    dashboardScopedFilters,
    directFiltered.orders,
    directFiltered.products,
    directFiltered.traceability
  )

  const scopedOrders = directFiltered.orders.filter(row => scopedOrderIds.has(row.pedidoId))
  const scopedProducts = directFiltered.products.filter(row => scopedOrderIds.has(row.pedidoId))
  const scopedTraceability = directFiltered.traceability.filter(row => scopedOrderIds.has(row.pedidoId))
  const customers = buildCustomerRowsFromOrders(scopedOrders)
  const sellerRanking = buildSellerRowsFromOrders(scopedOrders)

  const getVisualFilters = sectionKey => dashboardVisualFilters?.[sectionKey] || []
  const getVisualOrderIds = sectionKey => resolveAllowedOrderIdsFromFilters(
    getVisualFilters(sectionKey),
    scopedOrders,
    scopedProducts,
    scopedTraceability
  )
  const getVisualOrders = sectionKey => {
    const ids = getVisualOrderIds(sectionKey)
    return scopedOrders.filter(row => ids.has(row.pedidoId))
  }

  const kpiOrders = getVisualOrders('kpis')
  const pontualidadeOrders = getVisualOrders('pontualidadeChart')
  const historyOrders = getVisualOrders('history')
  const productOrderIds = getVisualOrderIds('products')
  const traceabilityOrderIds = getVisualOrderIds('traceability')
  const perdasOrderIds = getVisualOrderIds('perdasChart')

  const visualProducts = scopedProducts.filter(row => productOrderIds.has(row.pedidoId))
  const visualTraceability = scopedTraceability.filter(row => traceabilityOrderIds.has(row.pedidoId))
  const lossProducts = scopedProducts.filter(row => perdasOrderIds.has(row.pedidoId))

  const weekMap = {}
  for (const order of pontualidadeOrders) {
    const week = format(startOfWeek(parseISO(order.emissao), { locale: ptBR }), 'dd/MM', { locale: ptBR })
    if (!weekMap[week]) weekMap[week] = { period: week, noPrazo: 0, atrasado: 0, producao: 0 }
    if (order.status === 'completed') weekMap[week].noPrazo += 1
    else if (order.status === 'delayed' || order.status === 'delayed_completed') weekMap[week].atrasado += 1
    else weekMap[week].producao += 1
  }

  const totalQuantity = lossProducts.reduce((total, item) => total + (Number(item.quantidade) || 0), 0)
  const lossQuantity = lossProducts.reduce((total, item) => total + (Number(item.missingQuantity) || 0), 0)
  const completed = kpiOrders.filter(row => row.status === 'completed' || row.status === 'delayed_completed').length
  const deliveredOnTime = kpiOrders.filter(row => row.status === 'completed').length
  const onTime = kpiOrders.filter(row => row.status === 'completed' || row.status === 'in_progress').length
  const inProduction = kpiOrders.filter(row => row.status === 'in_progress').length
  const inProductionDelayed = kpiOrders.filter(row => row.status === 'delayed').length
  const deliveredDelayed = kpiOrders.filter(row => row.status === 'delayed_completed').length

  return {
    kpis: {
      totalOrders: kpiOrders.length,
      pontualidade: kpiOrders.length > 0 ? Number(((onTime / kpiOrders.length) * 100).toFixed(1)) : 0,
      emProducao: inProduction,
      emProducaoAtraso: inProductionDelayed,
      perdas: totalQuantity > 0 ? Number(((lossQuantity / totalQuantity) * 100).toFixed(2)) : 0,
      atrasados: deliveredDelayed,
      entregueAtraso: deliveredDelayed,
      entregueNoPrazo: deliveredOnTime,
      concluidos: completed,
    },
    pontualidade: Object.values(weekMap).slice(-8),
    perdas: {
      total: totalQuantity,
      withLoss: lossQuantity,
      percentage: totalQuantity > 0 ? Number(((lossQuantity / totalQuantity) * 100).toFixed(2)) : 0,
      semPerda: Math.max(0, totalQuantity - lossQuantity),
      errorCode: '',
      errorMessage: '',
    },
    orders: historyOrders,
    products: visualProducts.slice(0, 200),
    traceability: parseCsvParam(searchParams, 'pedcodigo').length > 0 ? visualTraceability : visualTraceability.slice(0, 150),
    customers: customers.slice(0, 100),
    sellerRanking,
    sourceMeta: {
      source: 'gradualApi',
      apiUrl: url.toString(),
      collectedOrders: rawOrders.length,
      collectedItems: rawItems.length,
      meta: payload.meta || {},
    },
  }
}
