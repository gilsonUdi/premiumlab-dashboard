import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [cellsRes, clientsRes, groupsRes, localPedRes, empRes] = await Promise.all([
      getSupabase().from('almox').select('alxcodigo, alxdescricao, dptcodigo, alxperda').order('alxordem'),
      getSupabase().from('clien').select('clicodigo, clirazsocial, clinomefant, gclcodigo').eq('clicliente', 'S').order('clirazsocial').limit(500),
      getSupabase().from('clien').select('gclcodigo').not('gclcodigo', 'is', null),
      getSupabase().from('localped').select('lpcodigo, lpdescricao, lpfimprocesso, lpiniprocesso').order('lpordem'),
      getSupabase().from('funcio').select('funcodigo, funnome').order('funnome').limit(200),
    ])

    const cells = (cellsRes.data || []).map(c => ({
      value: c.dptcodigo,
      label: c.alxdescricao,
      alxcodigo: c.alxcodigo,
      alxperda: c.alxperda,
    }))

    const clients = (clientsRes.data || []).map(c => ({
      clicodigo: c.clicodigo,
      label: c.clinomefant || c.clirazsocial,
      razaoSocial: c.clirazsocial,
      gclcodigo: c.gclcodigo,
    }))

    const groupCodes = [...new Set((groupsRes.data || []).map(r => r.gclcodigo).filter(Boolean))]
    const clientGroups = groupCodes.map(g => ({ value: g, label: `Grupo ${g}` }))

    const stages = (localPedRes.data || []).map(l => ({
      value: l.lpcodigo,
      label: l.lpdescricao,
      isFinal: l.lpfimprocesso === 'S',
      isStart: l.lpiniprocesso === 'S',
    }))

    const employees = (empRes.data || [])
      .filter(e => !e.funnome?.includes('INATIVO'))
      .map(e => ({ value: e.funcodigo, label: e.funnome }))

    const statuses = [
      { value: 'in_progress', label: 'Em Produção' },
      { value: 'delayed', label: 'Em Produção (atraso)' },
      { value: 'completed', label: 'Concluído' },
      { value: 'delayed_completed', label: 'Entregue (atraso)' },
      { value: 'pending', label: 'Aguardando' },
    ]

    return NextResponse.json({ cells, clients, clientGroups, stages, employees, statuses })
  } catch (err) {
    console.error('[options]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
