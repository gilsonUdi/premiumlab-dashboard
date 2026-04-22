import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { addDays, differenceInDays, format, parseISO, startOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const dynamic = 'force-dynamic'

const LEAD_DAYS = 5

function calcStatus(emissao, exitDate, now) {
  const expected = addDays(parseISO(emissao), LEAD_DAYS)
  if (exitDate) {
    return new Date(exitDate) <= expected ? 'completed' : 'delayed_completed'
  }
  return now > expected ? 'delayed' : 'in_progress'
}

export async function GET(request) {
  try {
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
    const [requiRes, cellsRes, empRes, rastreabRes, clientsRes] = await Promise.all([
      (() => {
        let q = supabase
          .from('requi')
          .select('reqcodigo, reqdata, reqhora, pdccodigo, funcodigo, dptcodigo, reqentsai, reqtipo, reqvrtotal')
          .gte('reqdata', dateStart + 'T00:00:00')
          .lte('reqdata', dateEnd + 'T23:59:59')
          .order('reqdata', { ascending: false })
          .limit(5000)
        if (pedcodigo) q = q.eq('pdccodigo', Number(pedcodigo))
        if (dptcodigo) q = q.eq('dptcodigo', Number(dptcodigo))
        return q
      })(),
      supabase.from('almox').select('alxcodigo, alxdescricao, dptcodigo, alxperda').order('alxordem'),
      supabase.from('funcio').select('funcodigo, funnome').limit(300),
      supabase.from('rastreab').select('*').order('rascodigo', { ascending: false }).limit(2000),
      (() => {
        let q = supabase.from('clien').select('clicodigo, clirazsocial, clinomefant, gclcodigo, clidiasatraso').eq('clicliente', 'S').limit(500)
        if (clicodigo) q = q.eq('clicodigo', Number(clicodigo))
        if (gclcodigo) q = q.eq('gclcodigo', Number(gclcodigo))
        return q
      })(),
    ])

    const requiData  = requiRes.data  || []
    const cellsData  = cellsRes.data  || []
    const empData    = empRes.data    || []
    const rastreab   = rastreabRes.data || []
    const clientsData = clientsRes.data || []

    // Build lookup maps
    const cellByDpt = Object.fromEntries(cellsData.map(c => [c.dptcodigo, c]))
    const empMap    = Object.fromEntries(empData.map(e => [e.funcodigo, e.funnome]))
    const lossaDpts = new Set(cellsData.filter(c => c.alxperda === 'S').map(c => c.dptcodigo))

    // ─── ORDER HISTORY ────────────────────────────────────────────────
    const orderMap = {}
    for (const r of requiData) {
      const key = String(r.pdccodigo)
      if (!orderMap[key]) {
        orderMap[key] = { pdccodigo: key, emissao: r.reqdata, exitDate: null, steps: [], lossSteps: 0 }
      }
      const o = orderMap[key]
      o.steps.push(r)
      if (r.reqdata < o.emissao) o.emissao = r.reqdata
      if (r.reqentsai === 'S') {
        if (!o.exitDate || r.reqdata > o.exitDate) o.exitDate = r.reqdata
      }
      if (lossaDpts.has(r.dptcodigo)) o.lossSteps++
    }

    let orders = Object.values(orderMap).map(o => {
      const completedSteps = o.steps.filter(s => s.reqentsai === 'S').length
      const indice = o.steps.length > 0 ? Math.round((completedSteps / o.steps.length) * 100) : 0
      const s = calcStatus(o.emissao, o.exitDate, now)
      const expected = addDays(parseISO(o.emissao), LEAD_DAYS)
      return {
        pedcodigo: o.pdccodigo,
        emissao: o.emissao,
        indice,
        previsto: expected.toISOString(),
        saida: o.exitDate,
        quantidade: o.steps.length,
        status: s,
        hasLoss: o.lossSteps > 0,
        lastCell: cellByDpt[o.steps[0]?.dptcodigo]?.alxdescricao || '—',
      }
    })

    // Filter by status
    if (status) orders = orders.filter(o => o.status === status || (status === 'completed' && o.status === 'delayed_completed'))

    orders.sort((a, b) => new Date(b.emissao) - new Date(a.emissao))

    // ─── PRODUCT DETAILS ─────────────────────────────────────────────
    // Use rastreab if available, else build from requi
    let products = []
    if (rastreab.length > 0) {
      products = rastreab.slice(0, 200).map(r => ({
        pedcodigo: String(r.pedcodigo),
        status: r.pedsitped || '—',
        procodigo: String(r.rascodigo),
        prodescricao: cellByDpt[r.setcodigo]?.alxdescricao || `Etapa ${r.lpcodigo || ''}`,
        quantidade: r.peddias || 1,
        clinome: r.clinome,
      }))
    } else {
      const latestSteps = requiData.slice(0, 300).map(r => ({
        pedcodigo: String(r.pdccodigo),
        status: r.reqentsai === 'S' ? 'Saída' : 'Entrada',
        procodigo: String(r.reqcodigo),
        prodescricao: cellByDpt[r.dptcodigo]?.alxdescricao || `Depto ${r.dptcodigo}`,
        quantidade: Math.round(r.reqvrtotal) || 1,
        clinome: '—',
      }))
      if (pedcodigo) {
        products = latestSteps.filter(p => p.pedcodigo === pedcodigo)
      } else {
        products = latestSteps
      }
    }

    // ─── TRACEABILITY ─────────────────────────────────────────────────
    let traceability = []
    if (rastreab.length > 0) {
      const traceData = pedcodigo
        ? rastreab.filter(r => String(r.pedcodigo) === pedcodigo)
        : rastreab.slice(0, 100)
      traceability = traceData.map(r => ({
        estoque: cellByDpt[r.setcodigo]?.alxdescricao || `Estoque ${r.setcodigo || ''}`,
        celula: `Etapa ${r.lpcodigo || ''}`,
        dataHora: r.reqdata || null,
        usuario: empMap[r.funcodigo] || `Func ${r.funcodigo}`,
        pedcodigo: String(r.pedcodigo),
        clicodigo: r.clicodigo,
        clinome: r.clinome,
      }))
    } else {
      const traceSource = pedcodigo
        ? requiData.filter(r => String(r.pdccodigo) === pedcodigo)
        : requiData.slice(0, 100)
      traceability = traceSource.map(r => ({
        estoque: cellByDpt[r.dptcodigo]?.alxdescricao || `Depto ${r.dptcodigo}`,
        celula: r.reqentsai === 'S' ? 'Saída' : 'Entrada',
        dataHora: r.reqdata,
        usuario: empMap[r.funcodigo] || `Func ${r.funcodigo}`,
        pedcodigo: String(r.pdccodigo),
        clicodigo: null,
        clinome: '—',
      }))
    }

    // ─── CUSTOMER INDEX ───────────────────────────────────────────────
    const customers = clientsData.map(c => {
      const delay = c.clidiasatraso || 0
      const indice = Math.max(0, Math.round(100 - delay * 10))
      return {
        clicodigo: c.clicodigo,
        clinome: c.clinomefant || c.clirazsocial,
        indice,
        mediaDias: LEAD_DAYS + delay,
        gclcodigo: c.gclcodigo,
      }
    }).sort((a, b) => b.indice - a.indice)

    // ─── PONTUALIDADE CHART ───────────────────────────────────────────
    const weekMap = {}
    for (const o of orders) {
      const week = format(startOfWeek(parseISO(o.emissao), { locale: ptBR }), 'dd/MM', { locale: ptBR })
      if (!weekMap[week]) weekMap[week] = { period: week, noPrazo: 0, atrasado: 0, producao: 0 }
      if (o.status === 'completed') weekMap[week].noPrazo++
      else if (o.status === 'delayed' || o.status === 'delayed_completed') weekMap[week].atrasado++
      else weekMap[week].producao++
    }
    const pontualidade = Object.values(weekMap).slice(-8)

    // ─── PERDAS CHART ─────────────────────────────────────────────────
    const totalOrders = orders.length
    const ordersWithLoss = orders.filter(o => o.hasLoss).length
    const perdas = {
      total: totalOrders,
      withLoss: ordersWithLoss,
      percentage: totalOrders > 0 ? Number(((ordersWithLoss / totalOrders) * 100).toFixed(1)) : 0,
      semPerda: totalOrders - ordersWithLoss,
    }

    // ─── KPIs ─────────────────────────────────────────────────────────
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

    return NextResponse.json({ kpis, pontualidade, perdas, orders: orders.slice(0, 200), products: products.slice(0, 200), traceability: traceability.slice(0, 100), customers: customers.slice(0, 100) })
  } catch (err) {
    console.error('[dashboard]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
