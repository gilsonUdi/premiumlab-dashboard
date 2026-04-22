import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { addDays, differenceInDays, format, parseISO, startOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const dynamic = 'force-dynamic'

const LEAD_DAYS = 5
const PAGE_SIZE = 1000
const MAX_REQUI_ROWS = 20000
const LOSS_REQ_TYPES = new Set(['B', 'C'])

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

export async function GET(request) {
  try {
    const supabase = getSupabase()
    const { searchParams } = new URL(request.url)
    const dateStart = searchParams.get('dateStart') || format(addDays(new Date(), -30), 'yyyy-MM-dd')
    const dateEnd   = searchParams.get('dateEnd')   || format(new Date(), 'yyyy-MM-dd')
    const pedcodigo = searchParams.get('pedcodigo') || ''
    const dptcodigo = searchParams.get('dptcodigo') || ''
    const status    = searchParams.get('status')    || ''
    const clicodigo = searchParams.get('clicodigo') || ''
    const gclcodigo = searchParams.get('gclcodigo') || ''

    const now = new Date()

    // Parallel fetches
    const [requiRes, cellsRes, empRes, rastreabRes, clientsRes, pedfoRes, localPedRes] = await Promise.all([
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
      supabase.from('almox').select('alxcodigo, alxdescricao, dptcodigo, alxordem, alxtipocel, alxperda').order('alxordem'),
      supabase.from('funcio').select('funcodigo, funnome').limit(300),
      supabase.from('rastreab').select('*').order('rascodigo', { ascending: false }).limit(2000),
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

    for (const [name, res] of Object.entries({ requi: requiRes, almox: cellsRes, funcio: empRes, rastreab: rastreabRes, clien: clientsRes, pedfo: pedfoRes, localped: localPedRes })) {
      if (res.error) throw new Error(`${name}: ${res.error.message}`)
    }

    const requiData  = requiRes.data  || []
    const cellsData  = cellsRes.data  || []
    const empData    = empRes.data    || []
    const rastreab   = rastreabRes.data || []
    const clientsData = clientsRes.data || []
    const pedfoData = pedfoRes.data || []
    const localPedData = localPedRes.data || []

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
    const empMap    = Object.fromEntries(empData.map(e => [e.funcodigo, e.funnome]))
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
    for (const p of pedfoData) {
      if (!p.pefcodigo) continue
      const emitted = p.pefdtemis ? parseISO(p.pefdtemis) : null
      const expected = p.pefpzentre ? parseISO(p.pefpzentre) : (emitted ? addDays(emitted, LEAD_DAYS) : null)
      const deliveredValue = p.pefdtbaixa || p.pefdtent
      const delivered = deliveredValue ? parseISO(deliveredValue) : null
      const compareDate = delivered || now
      const atrasoMinutos = expected ? Math.round((compareDate.getTime() - expected.getTime()) / 60000) : 0
      const lineOnTime = atrasoMinutos <= 0 ? 1 : 0

      if (!salesOrderMap[p.pefcodigo]) {
        salesOrderMap[p.pefcodigo] = {
          pedido: p.pefcodigo,
          clicodigo: p.clicodigo,
          emitted,
          delivered,
          noPrazo: lineOnTime,
          deliveredForAverage: delivered,
        }
      } else {
        const item = salesOrderMap[p.pefcodigo]
        item.noPrazo = Math.min(item.noPrazo, lineOnTime)
        if (emitted && (!item.emitted || emitted < item.emitted)) item.emitted = emitted
        if (delivered && (!item.delivered || delivered > item.delivered)) item.delivered = delivered
        if (delivered && (!item.deliveredForAverage || delivered > item.deliveredForAverage)) item.deliveredForAverage = delivered
      }
    }
    const salesOrders = Object.values(salesOrderMap)

    // â”€â”€â”€ ORDER HISTORY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const orderMap = {}
    for (const r of requiData) {
      if (!r.pdccodigo) continue
      const key = String(r.pdccodigo)
      if (!orderMap[key]) {
        orderMap[key] = { pdccodigo: key, emissao: r.reqdata, exitDate: null, steps: [] }
      }
      const o = orderMap[key]
      o.steps.push(r)
      if (r.reqdata < o.emissao) o.emissao = r.reqdata
      if (r.reqentsai === 'S') {
        if (!o.exitDate || r.reqdata > o.exitDate) o.exitDate = r.reqdata
      }
    }

    let orders = Object.values(orderMap).map(o => {
      const indice = calcProductionIndex(o.steps)
      const expected = addDays(parseISO(o.emissao), LEAD_DAYS)
      const s = indice >= 100 ? calcStatus(o.emissao, o.exitDate, now) : (now > expected ? 'delayed' : 'in_progress')
      const latestStep = o.steps.reduce((latest, step) => !latest || step.reqdata > latest.reqdata ? step : latest, null)
      return {
        pedcodigo: o.pdccodigo,
        emissao: o.emissao,
        indice,
        previsto: expected.toISOString(),
        saida: latestStep?.reqdata || o.exitDate,
        quantidade: o.steps.length,
        status: s,
        lastCell: cellByDpt[latestStep?.dptcodigo]?.alxdescricao || '-',
      }
    })

    // Filter by status
    if (status) orders = orders.filter(o => o.status === status || (status === 'completed' && o.status === 'delayed_completed'))

    orders.sort((a, b) => new Date(b.emissao) - new Date(a.emissao))

    // â”€â”€â”€ PRODUCT DETAILS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Use rastreab if available, else build from requi
    let products = []
    if (rastreab.length > 0) {
      products = rastreab.slice(0, 200).map(r => ({
        pedcodigo: String(r.pedcodigo),
        status: r.pedsitped || 'â€”',
        procodigo: String(r.rascodigo),
        prodescricao: cellByDpt[r.setcodigo]?.alxdescricao || `Etapa ${r.lpcodigo || ''}`,
        quantidade: r.peddias || 1,
        clinome: r.clinome,
      }))
    } else {
      const latestSteps = requiData.slice(0, 300).map(r => ({
        pedcodigo: String(r.pdccodigo),
        status: r.reqentsai === 'S' ? 'SaÃ­da' : 'Entrada',
        procodigo: String(r.reqcodigo),
        prodescricao: cellByDpt[r.dptcodigo]?.alxdescricao || `Depto ${r.dptcodigo}`,
        quantidade: Math.round(r.reqvrtotal) || 1,
        clinome: 'â€”',
      }))
      if (pedcodigo) {
        products = latestSteps.filter(p => p.pedcodigo === pedcodigo)
      } else {
        products = latestSteps
      }
    }

    // â”€â”€â”€ TRACEABILITY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let traceability = []
    if (rastreab.length > 0) {
      const traceData = pedcodigo
        ? rastreab.filter(r => String(r.pedcodigo) === pedcodigo)
        : rastreab.slice(0, 100)
      traceability = traceData.map(r => ({
        estoque: r.setdescricao || cellByDpt[r.setcodigo]?.alxdescricao || `Estoque ${r.setcodigo || ''}`,
        celula: r.lpdescricao || `Etapa ${r.lpcodigo || ''}`,
        dataHora: combineDateTime(r.apdata || r.peddtemis, r.aphora) || r.peddtemis || null,
        usuario: r.usunome || r.funnome || empMap[r.funcodigo] || `Func ${r.funcodigo || ''}`,
        pedcodigo: String(r.pedcodigo),
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

    // â”€â”€â”€ CUSTOMER INDEX â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const customerMap = {}
    for (const p of salesOrders) {
      const client = clientsByCode[p.clicodigo]
      if (gclcodigo && client?.gclcodigo !== Number(gclcodigo)) continue
      if (!customerMap[p.clicodigo]) {
        customerMap[p.clicodigo] = { clicodigo: p.clicodigo, client, total: 0, onTime: 0, daysTotal: 0, daysCount: 0 }
      }

      const item = customerMap[p.clicodigo]
      item.total++
      item.onTime += p.noPrazo

      if (p.emitted && p.deliveredForAverage) {
        item.daysTotal += Math.max(0, differenceInDays(p.deliveredForAverage, p.emitted))
        item.daysCount++
      }
    }

    const customers = Object.values(customerMap).map(c => ({
      clicodigo: c.clicodigo,
      clinome: c.client?.clinomefant || c.client?.clirazsocial || `Cliente ${c.clicodigo}`,
      indice: c.total > 0 ? Math.round((c.onTime / c.total) * 100) : 0,
      mediaDias: c.daysCount > 0 ? Number((c.daysTotal / c.daysCount).toFixed(1)) : 0,
      gclcodigo: c.client?.gclcodigo,
    })).sort((a, b) => b.indice - a.indice)

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
    const onTime = orders.filter(o => o.status === 'completed').length
    const pontRate = completed > 0 ? Number(((onTime / completed) * 100).toFixed(1)) : 0
    const inProd = orders.filter(o => o.status === 'in_progress').length

    const kpis = {
      totalOrders,
      pontualidade: pontRate,
      emProducao: inProd,
      perdas: perdas.percentage,
      atrasados: orders.filter(o => o.status === 'delayed').length,
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
