import { NextResponse } from 'next/server'
import { createTenantSupabase } from '@/lib/supabase'
import { resolveAuthorizedCompany } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

function getErrorStatus(error) {
  const message = String(error?.message || '')
  if (message.includes('Nao autorizado')) return 401
  if (message.includes('Acesso negado')) return 403
  if (message.includes('nao encontrada')) return 404
  return 500
}

async function getTenantSupabase(request, tenantSlug) {
  const { company, companySecrets } = await resolveAuthorizedCompany(request, tenantSlug)
  const supabaseUrl = companySecrets.supabaseUrl || company.supabaseUrl || (company.isPremiumLab ? process.env.SUPABASE_URL : '')
  const supabaseServiceRoleKey =
    companySecrets.supabaseServiceRoleKey || (company.isPremiumLab ? process.env.SUPABASE_SERVICE_ROLE_KEY : '')

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
    const [cellsRes, clientsRes, groupsRes, localPedRes, empRes] = await Promise.all([
      supabase.from('almox').select('alxcodigo, alxdescricao, dptcodigo, alxperda').order('alxordem'),
      supabase.from('clien').select('clicodigo, clirazsocial, clinomefant, gclcodigo').eq('clicliente', 'S').order('clirazsocial').limit(500),
      supabase.from('clien').select('gclcodigo').not('gclcodigo', 'is', null),
      supabase.from('localped').select('lpcodigo, lpdescricao, lpfimprocesso, lpiniprocesso').order('lpordem'),
      supabase.from('funcio').select('funcodigo, funnome').order('funnome').limit(200),
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
    return NextResponse.json({ error: err.message }, { status: getErrorStatus(err) })
  }
}
