import { NextResponse } from 'next/server'
import { addDays, differenceInDays, differenceInMinutes, format, parseISO, startOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { resolveAuthorizedCompany } from '@/lib/server-auth'
import { getUpstashRowsByIndex, getUpstashTables } from '@/lib/upstash-store'

export const dynamic = 'force-dynamic'

const MAX_REQUI_ROWS = 20000
const MAX_SALES_ROWS = 20000
const LOSS_REQ_TYPES = new Set(['B', 'C'])
const PRODUCTION_TIME_ZONE = 'America/Sao_Paulo'

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

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function sameNumber(left, right) {
  const a = toNumber(left)
  const b = toNumber(right)
  return a != null && b != null && a === b
}

function dateInRange(value, dateStart, dateEnd) {
  const date = extractDatePart(value)
  return Boolean(date && date >= dateStart && date <= dateEnd)
}

function dateTimeInRange(value, dateStart, dateEnd) {
  const date = extractDatePart(value)
  return Boolean(date && date >= dateStart && date <= dateEnd)
}

function combineOrderDateTime(dateValue, timeValue) {
  const datePart = extractDatePart(dateValue)
  if (!datePart) return null

  const timePart = extractTimePart(timeValue)
  if (!timePart) return datePart

  const parsed = parseLocalDateTime(`${datePart}T${timePart}`)
  if (!parsed) return `${datePart}T${timePart}`
  parsed.setHours(parsed.getHours() - 3)
  return localDateTimeText(parsed)
}

function orderMatchesFilters(order, client, { dateStart, dateEnd, pedcodigo, clicodigo, gclcodigo }) {
  if (!dateInRange(order.peddtemis, dateStart, dateEnd)) return false
  if (normalizeText(order.pedsitped) === 'C') return false

  const pedido = asSqlOrderCode(pedcodigo)
  const cliente = asSqlNumber(clicodigo)
  const grupo = asSqlNumber(gclcodigo)

  if (pedido != null && normalizeOrderCode(order.pedcodigo).replace(/^0+/, '') !== pedido) return false
  if (cliente != null && !sameNumber(order.clicodigo, cliente)) return false
  if (grupo != null && !sameNumber(client?.gclcodigo, grupo)) return false

  return true
}

function compareDateDesc(a, b, field) {
  const left = parseLocalDateTime(a[field])?.getTime() || 0
  const right = parseLocalDateTime(b[field])?.getTime() || 0
  return right - left
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const tenantSlug = searchParams.get('tenant') || ''
    await resolveAuthorizedCompany(request, tenantSlug)

    const fallbackStart = format(addDays(new Date(), -30), 'yyyy-MM-dd')
    const fallbackEnd = format(new Date(), 'yyyy-MM-dd')
    const dateStart = asSqlDate(searchParams.get('dateStart'), fallbackStart)
    const dateEnd = asSqlDate(searchParams.get('dateEnd'), fallbackEnd)
    const pedcodigo = searchParams.get('pedcodigo') || ''
    const dptcodigo = searchParams.get('dptcodigo') || ''
    const statusFilter = searchParams.get('status') || ''
    const clicodigo = searchParams.get('clicodigo') || ''
    const gclcodigo = searchParams.get('gclcodigo') || ''
    const emissaoFilter = searchParams.get('emissao') || ''
    const indiceFilter = searchParams.get('indice') || ''
    const previstoFilter = searchParams.get('previsto') || ''
    const saidaFilter = searchParams.get('saida') || ''
    const quantidadeFilter = searchParams.get('quantidade') || ''
    const currentCellFilter = searchParams.get('currentCell') || ''
    const productStatusFilter = searchParams.get('productStatus') || ''
    const procodigoFilter = searchParams.get('procodigo') || ''
    const prodescricaoFilter = searchParams.get('prodescricao') || ''
    const productQuantidadeFilter = searchParams.get('productQuantidade') || ''
    const customerIndiceFilter = searchParams.get('customerIndice') || ''
    const customerMediaDiasFilter = searchParams.get('customerMediaDias') || ''

    const now = nowInProductionTimeZone()
    const shouldLoadProductDetails = Boolean(pedcodigo)

    const {
      requi = [],
      almox = [],
      funcio = [],
      usuario = [],
      clien = [],
      localped = [],
      pedid = [],
    } = await getUpstashTables(['requi', 'almox', 'funcio', 'usuario', 'clien', 'localped', 'pedid'])

    const clientsByCodeRaw = Object.fromEntries(clien.map(client => [String(client.clicodigo), client]))
    const orderFilters = { dateStart, dateEnd, pedcodigo, clicodigo, gclcodigo }
    const filteredPedid = pedid
      .filter(order => orderMatchesFilters(order, clientsByCodeRaw[String(order.clicodigo)], orderFilters))
      .sort((a, b) => compareDateDesc(a, b, 'peddtemis'))
      .slice(0, MAX_SALES_ROWS)
    const filteredOrderIds = new Set(filteredPedid.map(order => String(order.id_pedido)))
    const filteredOrderById = Object.fromEntries(filteredPedid.map(order => [String(order.id_pedido), order]))

    const requiData = requi
      .filter(row => dateTimeInRange(row.reqdata, dateStart, dateEnd))
      .filter(row => !pedcodigo || normalizeOrderCode(row.pdccodigo) === normalizeOrderCode(pedcodigo))
      .filter(row => !dptcodigo || sameNumber(row.dptcodigo, dptcodigo))
      .sort((a, b) => compareDateDesc(a, b, 'reqdata'))
      .slice(0, MAX_REQUI_ROWS)
    const cellsData = almox.slice().sort((a, b) => Number(a.alxordem || 0) - Number(b.alxordem || 0))
    const empData = funcio.slice(0, 300)
    const userData = usuario.slice(0, 300)
    const indexedOrderIds = shouldLoadProductDetails ? [...filteredOrderIds].slice(0, 20) : []
    const [indexedAcopedRows, indexedProductRows, indexedServiceRows] = await Promise.all([
      shouldLoadProductDetails
        ? Promise.all(indexedOrderIds.map(orderId => getUpstashRowsByIndex('acoped', 'id_pedido', orderId))).then(results => results.flat())
        : Promise.resolve([]),
      shouldLoadProductDetails
        ? Promise.all(indexedOrderIds.map(orderId => getUpstashRowsByIndex('pdprd', 'id_pedido', orderId))).then(results => results.flat())
        : Promise.resolve([]),
      shouldLoadProductDetails
        ? Promise.all(indexedOrderIds.map(orderId => getUpstashRowsByIndex('pdser', 'id_pedido', orderId))).then(results => results.flat())
        : Promise.resolve([]),
    ])
    const acoped = indexedAcopedRows
      .filter(row => dateInRange(row.apdata, dateStart, dateEnd))
      .sort((a, b) => `${extractDatePart(a.apdata) || ''} ${extractTimePart(a.aphora) || ''}`.localeCompare(`${extractDatePart(b.apdata) || ''} ${extractTimePart(b.aphora) || ''}`))
      .slice(0, 10000)
    const rastreab = []
    const clientsData = clien
      .filter(client => client.clicliente === 'S')
      .filter(client => !clicodigo || sameNumber(client.clicodigo, clicodigo))
      .filter(client => !gclcodigo || sameNumber(client.gclcodigo, gclcodigo))
      .sort((a, b) => Number(a.clicodigo || 0) - Number(b.clicodigo || 0))
      .slice(0, 10000)
    const localPedData = localped.slice().sort((a, b) => Number(a.lpcodigo || 0) - Number(b.lpcodigo || 0))

    const productRowsForOrders = indexedProductRows
    const serviceRowsForOrders = indexedServiceRows
    const quantityByOrder = {}
    for (const row of [...productRowsForOrders, ...serviceRowsForOrders]) {
      const orderId = String(row.id_pedido)
      const quantity = Number(row.pdpqtdade ?? row.pdsqtdade ?? 0) || 0
      quantityByOrder[orderId] = (quantityByOrder[orderId] || 0) + quantity
    }

    const salesOrdersRaw = filteredPedid.map(order => {
      const client = clientsByCodeRaw[String(order.clicodigo)] || {}
      return {
        data_venda: extractDatePart(order.peddtemis),
        data_hora_prevista: combineOrderDateTime(order.pedpzentre, order.pedhrentre),
        data_hora_saida: combineOrderDateTime(order.peddtsaida, order.pedhrsaida),
        codigo_cliente: order.clicodigo,
        cliente: client.clinomefant || client.clirazsocial,
        gclcodigo: client.gclcodigo,
        vendedor_codigo: order.funcodigo,
        numero_venda: order.pedcodigo,
        pedido: order.id_pedido,
        quantidade_total: quantityByOrder[String(order.id_pedido)] || 0,
        status: order.pedsitped,
      }
    })

    const productSalesRows = shouldLoadProductDetails
      ? productRowsForOrders.map(row => {
          const order = filteredOrderById[String(row.id_pedido)] || {}
          const client = clientsByCodeRaw[String(order.clicodigo)] || {}
          return {
            cod_empresa: order.empcodigo,
            data_venda: extractDatePart(order.peddtemis),
            data_hora_saida: combineOrderDateTime(order.peddtsaida, order.pedhrsaida),
            data_hora_prevista: combineOrderDateTime(order.pedpzentre, order.pedhrentre),
            codigo_cliente: order.clicodigo,
            cliente: client.clinomefant || client.clirazsocial,
            gclcodigo: client.gclcodigo,
            vendedor_codigo: order.funcodigo,
            numero_venda: order.pedcodigo,
            pedido: order.id_pedido,
            codigo_produto: row.procodigo,
            descricao_produto: row.pdpdescricao,
            qtde_produtos: row.pdpqtdade,
            status: order.pedsitped,
            produto_servico: 'P',
          }
        })
      : []
    const serviceSalesRows = shouldLoadProductDetails
      ? serviceRowsForOrders.map(row => {
          const order = filteredOrderById[String(row.id_pedido)] || {}
          const client = clientsByCodeRaw[String(order.clicodigo)] || {}
          return {
            cod_empresa: order.empcodigo,
            data_venda: extractDatePart(order.peddtemis),
            data_hora_saida: combineOrderDateTime(order.peddtsaida, order.pedhrsaida),
            data_hora_prevista: combineOrderDateTime(order.pedpzentre, order.pedhrentre),
            codigo_cliente: order.clicodigo,
            cliente: client.clinomefant || client.clirazsocial,
            gclcodigo: client.gclcodigo,
            vendedor_codigo: order.funcodigo,
            numero_venda: order.pedcodigo,
            pedido: order.id_pedido,
            codigo_produto: row.sercodigo,
            descricao_produto: row.pdsdescricao,
            qtde_produtos: row.pdsqtdade,
            status: order.pedsitped,
            produto_servico: 'S',
          }
        })
      : []

    const normalizedCellsData = cellsData.map(cell => ({
      ...cell,
      alxdescricao: normalizeText(cell.alxdescricao),
    }))
    const normalizedEmpData = empData.map(employee => ({
      ...employee,
      funnome: normalizeText(employee.funnome),
    }))
    const normalizedUserData = userData.map(user => ({
      ...user,
      usunome: normalizeText(user.usunome),
    }))
    const normalizedClientsData = clientsData.map(client => ({
      ...client,
      clirazsocial: normalizeText(client.clirazsocial),
      clinomefant: normalizeText(client.clinomefant),
    }))
    const normalizedLocalPedData = localPedData.map(step => ({
      ...step,
      lpdescricao: normalizeText(step.lpdescricao),
    }))
    const normalizedSalesRows = [...productSalesRows, ...serviceSalesRows].map(row => ({
      ...row,
      cliente: normalizeText(row.cliente),
      descricao_produto: normalizeText(row.descricao_produto),
      status: normalizeText(row.status),
    }))
    const normalizedSalesOrdersRaw = salesOrdersRaw.map(row => ({
      ...row,
      cliente: normalizeText(row.cliente),
      status: normalizeText(row.status),
    }))

    const salesRows = normalizedSalesRows
    const cellByDpt = Object.fromEntries(normalizedCellsData.map(cell => [cell.dptcodigo, cell]))
    const cellByAlx = new Map()
    for (const cell of normalizedCellsData) {
      if (cell.alxcodigo == null) continue
      cellByAlx.set(String(cell.alxcodigo), cell)
      if (cell.empcodigo != null) cellByAlx.set(`${cell.empcodigo}:${cell.alxcodigo}`, cell)
    }
    const empMap = Object.fromEntries(normalizedEmpData.map(employee => [employee.funcodigo, employee.funnome]))
    const userMap = Object.fromEntries(normalizedUserData.map(user => [user.usucodigo, user.usunome]))
    const clientsByCode = Object.fromEntries(normalizedClientsData.map(client => [client.clicodigo, client]))
    const localPedByCode = Object.fromEntries(normalizedLocalPedData.map(step => [step.lpcodigo, step.lpdescricao]))

    const fallbackLocalPedByDpt = {
      4: { E: 4, S: 5 },
      5: { E: 2, S: 3 },
      6: { E: 11, S: 12 },
      7: { E: 9, S: 10 },
      8: { E: 7, S: 8 },
    }

    const getFallbackStepDescription = movement => {
      const code = fallbackLocalPedByDpt[movement.dptcodigo]?.[movement.reqentsai]
      return localPedByCode[code] || (movement.reqentsai === 'S' ? 'Saida' : 'Entrada')
    }

    const salesOrderMap = {}
    for (const row of normalizedSalesOrdersRaw) {
      if (!row.pedido) continue
      salesOrderMap[String(row.pedido)] = {
        pedido: String(row.pedido),
        numeroVenda: normalizeOrderCode(row.numero_venda),
        clicodigo: row.codigo_cliente,
        clinome: row.cliente,
        gclcodigo: row.gclcodigo,
        vendedorCodigo: row.vendedor_codigo,
        vendedorNome: normalizeText(empMap[row.vendedor_codigo]) || `Vendedor ${row.vendedor_codigo || '-'}`,
        emitted: parseLocalDateTime(row.data_venda),
        emittedText: localDateTimeText(row.data_venda),
        expected: parseLocalDateTime(row.data_hora_prevista),
        expectedText: localDateTimeText(row.data_hora_prevista),
        delivered: parseLocalDateTime(row.data_hora_saida),
        deliveredText: localDateTimeText(row.data_hora_saida),
        quantidade: Number(row.quantidade_total) || 0,
        products: [],
        statusRaw: row.status,
      }
    }

    for (const row of salesRows) {
      const order = salesOrderMap[String(row.pedido)]
      if (!order) continue
      order.products.push(row)
    }

    const salesOrders = Object.values(salesOrderMap)
    const orderNumberById = Object.fromEntries(salesOrders.map(order => [order.pedido, order.numeroVenda]))

    let products = salesRows.map(row => ({
      pedcodigo: normalizeOrderCode(row.numero_venda || row.pedido),
      pedidoId: String(row.pedido),
      status: row.data_hora_saida ? 'Saida' : 'Em Producao',
      procodigo: String(row.codigo_produto || '').trim(),
      prodescricao: normalizeText(row.descricao_produto),
      quantidade: Number(row.qtde_produtos) || 0,
      clinome: normalizeText(row.cliente),
    }))

    let traceability = []
    if (acoped.length > 0) {
      traceability = acoped.map(row => {
        const stock = cellByAlx.get(`${row.empcodigo}:${row.alxcodigo}`) || cellByAlx.get(String(row.alxcodigo))
        return {
          estoque: stock ? `${row.alxcodigo} - ${normalizeText(stock.alxdescricao)}` : `Estoque ${row.alxcodigo || ''}`,
          celula: normalizeText(localPedByCode[row.lpcodigo]) || `Etapa ${row.lpcodigo || ''}`,
          dataHora: combineDateTime(row.apdata, row.aphora),
          usuario: normalizeText(userMap[row.usucodigo]) || `Usuario ${row.usucodigo || ''}`,
          pedcodigo: normalizeOrderCode(orderNumberById[String(row.id_pedido)] || row.id_pedido),
          pedidoId: String(row.id_pedido),
          clicodigo: null,
          clinome: '-',
        }
      })
    } else if (rastreab.length > 0) {
      traceability = rastreab.map(row => ({
        estoque: normalizeText(row.setdescricao) || normalizeText(cellByDpt[row.setcodigo]?.alxdescricao) || `Estoque ${row.setcodigo || ''}`,
        celula: normalizeText(row.lpdescricao) || `Etapa ${row.lpcodigo || ''}`,
        dataHora: combineDateTime(row.apdata || row.peddtemis, row.aphora) || row.peddtemis || null,
        usuario: normalizeText(row.usunome) || normalizeText(row.funnome) || normalizeText(empMap[row.funcodigo]) || `Func ${row.funcodigo || ''}`,
        pedcodigo: normalizeOrderCode(orderNumberById[String(row.id_pedido || row.pedcodigo)] || row.id_pedido || row.pedcodigo),
        pedidoId: String(row.id_pedido || row.pedcodigo),
        clicodigo: row.clicodigo,
        clinome: normalizeText(row.clinome),
      }))
    } else {
      traceability = requiData
        .filter(row => row.pdccodigo)
        .map(row => ({
          estoque: normalizeText(cellByDpt[row.dptcodigo]?.alxdescricao) || `Depto ${row.dptcodigo}`,
          celula: normalizeText(getFallbackStepDescription(row)),
          dataHora: combineDateTime(row.reqdata, row.reqhora),
          usuario: normalizeText(empMap[row.funcodigo]) || `Func ${row.funcodigo}`,
          pedcodigo: normalizeOrderCode(orderNumberById[String(row.pdccodigo)] || row.pdccodigo),
          pedidoId: String(row.pdccodigo),
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

    const latestTraceByOrder = {}
    for (const row of traceability) {
      if (!row.pedidoId) continue
      latestTraceByOrder[row.pedidoId] = row
    }

    let orders = salesOrders.map(order => {
      const expected = order.expected || (order.emitted ? addDays(order.emitted, 5) : null)
      const delivered = order.delivered
      const resolvedStatus = resolveStatus(expected, delivered, now)
      const currentTrace = latestTraceByOrder[order.pedido]

      return {
        pedcodigo: order.numeroVenda,
        pedidoId: order.pedido,
        emissao: order.emittedText,
        indice: orderIsDelayed(expected, delivered, now) ? 0 : 100,
        previsto: order.expectedText,
        saida: order.deliveredText,
        quantidade: order.quantidade || order.products.length,
        status: resolvedStatus,
        currentCell: normalizeText(currentTrace?.celula) || '-',
        delayRank: buildDelayRank(expected, delivered, now),
        rowTone: resolveRowTone(resolvedStatus, expected, delivered, now),
        clicodigo: order.clicodigo,
        clinome: normalizeText(order.clinome),
      }
    })

    if (statusFilter) orders = orders.filter(row => row.status === statusFilter)
    if (emissaoFilter) orders = orders.filter(row => rowMatchesFilter(row, 'emissao', emissaoFilter))
    if (indiceFilter) orders = orders.filter(row => rowMatchesFilter(row, 'indice', indiceFilter))
    if (previstoFilter) orders = orders.filter(row => rowMatchesFilter(row, 'previsto', previstoFilter))
    if (saidaFilter) orders = orders.filter(row => rowMatchesFilter(row, 'saida', saidaFilter))
    if (quantidadeFilter) orders = orders.filter(row => rowMatchesFilter(row, 'quantidade', quantidadeFilter))
    if (currentCellFilter) orders = orders.filter(row => rowMatchesFilter(row, 'currentCell', currentCellFilter))

    if (productStatusFilter) products = products.filter(row => rowMatchesFilter(row, 'status', productStatusFilter))
    if (procodigoFilter) products = products.filter(row => rowMatchesFilter(row, 'procodigo', procodigoFilter))
    if (prodescricaoFilter) products = products.filter(row => rowMatchesFilter(row, 'prodescricao', prodescricaoFilter))
    if (productQuantidadeFilter) products = products.filter(row => rowMatchesFilter(row, 'quantidade', productQuantidadeFilter))

    orders.sort((a, b) => b.delayRank - a.delayRank)

    let customerMap = {}
    const visibleOrderIds = new Set(orders.map(row => row.pedidoId))
    products = products.filter(row => visibleOrderIds.has(row.pedidoId))
    traceability = traceability.filter(row => visibleOrderIds.has(row.pedidoId))

    for (const order of salesOrders.filter(item => visibleOrderIds.has(item.pedido))) {
      const client = clientsByCode[order.clicodigo]
      const groupCode = order.gclcodigo ?? client?.gclcodigo
      if (gclcodigo && groupCode !== Number(gclcodigo)) continue

      if (!customerMap[order.clicodigo]) {
        customerMap[order.clicodigo] = {
          clicodigo: order.clicodigo,
          clinome: order.clinome || client?.clinomefant || client?.clirazsocial || `Cliente ${order.clicodigo}`,
          total: 0,
          onTime: 0,
          daysTotal: 0,
          daysCount: 0,
          gclcodigo: groupCode,
        }
      }

      const customer = customerMap[order.clicodigo]
      customer.total += 1
      customer.onTime += orderIsDelayed(order.expected, order.delivered, now) ? 0 : 1
      if (order.emitted && order.delivered) {
        customer.daysTotal += Math.max(0, differenceInDays(order.delivered, order.emitted))
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

    if (customerIndiceFilter) customers = customers.filter(row => rowMatchesFilter(row, 'indice', customerIndiceFilter))
    if (customerMediaDiasFilter) customers = customers.filter(row => rowMatchesFilter(row, 'mediaDias', customerMediaDiasFilter))

    if (customers.length > 0 && (customerIndiceFilter || customerMediaDiasFilter)) {
      const filteredClientIds = new Set(customers.map(row => String(row.clicodigo)))
      orders = orders.filter(row => filteredClientIds.has(String(row.clicodigo)))
    }

    const finalOrderIds = new Set(orders.map(row => row.pedidoId))
    products = products.filter(row => finalOrderIds.has(row.pedidoId))
    traceability = traceability.filter(row => finalOrderIds.has(row.pedidoId))

    const sellerMap = {}
    for (const order of salesOrders.filter(item => finalOrderIds.has(item.pedido))) {
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
    const productionMovements = requiData.filter(row => row.pdccodigo && row.reqtipo === 'P').length
    const lossMovements = requiData.filter(row => LOSS_REQ_TYPES.has(row.reqtipo)).length
    const totalQuantity = productionMovements + lossMovements
    const perdas = {
      total: totalQuantity,
      withLoss: lossMovements,
      percentage: totalQuantity > 0 ? Number(((lossMovements / totalQuantity) * 100).toFixed(1)) : 0,
      semPerda: productionMovements,
    }

    const totalOrders = orders.length
    const completed = orders.filter(row => row.status === 'completed' || row.status === 'delayed_completed').length
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
      concluidos: completed,
    }

    return NextResponse.json({
      kpis,
      pontualidade,
      perdas,
      orders,
      products: products.slice(0, 200),
      traceability: pedcodigo ? traceability : traceability.slice(0, 150),
      customers: customers.slice(0, 100),
      sellerRanking,
    })
  } catch (error) {
    console.error('[dashboard]', error)
    return NextResponse.json({ error: error.message }, { status: getErrorStatus(error) })
  }
}
