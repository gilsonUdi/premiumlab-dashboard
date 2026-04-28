import { NextResponse } from 'next/server'
import { resolveAuthorizedCompany } from '@/lib/server-auth'
import { getUpstashTables } from '@/lib/upstash-store'

export const dynamic = 'force-dynamic'

function getErrorStatus(error) {
  const message = String(error?.message || '')
  if (message.includes('Nao autorizado')) return 401
  if (message.includes('Acesso negado')) return 403
  if (message.includes('nao encontrada')) return 404
  return 500
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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const tenantSlug = searchParams.get('tenant') || ''
    await resolveAuthorizedCompany(request, tenantSlug)

    const { almox = [], clien = [], localped = [], funcio = [] } = await getUpstashTables(['almox', 'clien', 'localped', 'funcio'])

    const cells = almox
      .slice()
      .sort((a, b) => Number(a.alxordem || 0) - Number(b.alxordem || 0))
      .map(cell => ({
      value: cell.dptcodigo,
      label: normalizeText(cell.alxdescricao),
      alxcodigo: cell.alxcodigo,
      alxperda: cell.alxperda,
    }))

    const clients = clien
      .filter(client => client.clicliente === 'S')
      .sort((a, b) => normalizeText(a.clirazsocial).localeCompare(normalizeText(b.clirazsocial)))
      .slice(0, 500)
      .map(client => ({
      clicodigo: client.clicodigo,
      label: normalizeText(client.clinomefant || client.clirazsocial),
      razaoSocial: normalizeText(client.clirazsocial),
      gclcodigo: client.gclcodigo,
    }))

    const groupCodes = [...new Set(clien.map(row => row.gclcodigo).filter(Boolean))]
    const clientGroups = groupCodes.map(groupCode => ({ value: groupCode, label: `Grupo ${groupCode}` }))

    const stages = localped
      .slice()
      .sort((a, b) => Number(a.lpordem || a.lpcodigo || 0) - Number(b.lpordem || b.lpcodigo || 0))
      .map(stage => ({
      value: stage.lpcodigo,
      label: normalizeText(stage.lpdescricao),
      isFinal: stage.lpfimprocesso === 'S',
      isStart: stage.lpiniprocesso === 'S',
    }))

    const employees = funcio
      .filter(employee => !normalizeText(employee.funnome).includes('INATIVO'))
      .sort((a, b) => normalizeText(a.funnome).localeCompare(normalizeText(b.funnome)))
      .slice(0, 200)
      .map(employee => ({ value: employee.funcodigo, label: normalizeText(employee.funnome) }))

    const statuses = [
      { value: 'in_progress', label: 'Em Producao' },
      { value: 'delayed', label: 'Em Producao (atraso)' },
      { value: 'completed', label: 'Concluido' },
      { value: 'delayed_completed', label: 'Entregue (atraso)' },
      { value: 'pending', label: 'Aguardando' },
    ]

    return NextResponse.json({ cells, clients, clientGroups, stages, employees, statuses })
  } catch (error) {
    console.error('[options]', error)
    return NextResponse.json({ error: error.message }, { status: getErrorStatus(error) })
  }
}
