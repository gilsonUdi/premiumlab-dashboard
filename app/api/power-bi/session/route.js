import {
  endPowerBiDashboardSession,
  heartbeatPowerBiDashboardSession,
} from '@/lib/power-bi-capacity'
import { canAccessPowerBiReport, normalizeUserPermissions, PORTAL_PAGE_KEYS } from '@/lib/portal-config'
import { resolveAuthorizedCompany } from '@/lib/server-auth'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function getErrorStatus(error) {
  const message = String(error?.message || '')
  if (message.includes('Nao autorizado')) return 401
  if (message.includes('Acesso negado')) return 403
  if (message.includes('nao encontrada')) return 404
  return 500
}

async function authorizeSessionRequest(request, payload) {
  const slug = String(payload?.slug || '').trim()
  const reportKey = String(payload?.reportKey || '').trim()
  const sessionId = String(payload?.sessionId || '').trim()
  if (!slug || !reportKey || !sessionId) throw new Error('Sessao de dashboard nao informada.')

  const { decoded, profile, company, accessContext } = await resolveAuthorizedCompany(request, slug)
  const permissions = normalizeUserPermissions(profile.permissions, company)
  if (profile.role !== 'admin' && !permissions.pages[PORTAL_PAGE_KEYS.POWER_BI]) {
    throw new Error('Acesso negado ao Power BI desta empresa.')
  }
  if (profile.role !== 'admin' && !canAccessPowerBiReport(company, permissions, reportKey)) {
    throw new Error('Acesso negado a este modelo de Power BI.')
  }

  return {
    sessionId,
    reportKey,
    company,
    user: {
      uid: accessContext.effectiveUserId || decoded.uid,
      email: profile.email || decoded.email || '',
      name: profile.name || profile.email || decoded.email || 'Usuario',
      isAdminAccess: accessContext.isAdminAccess,
      isAdminPreview: accessContext.isAdminPreview,
      adminUserId: accessContext.adminUserId,
      adminUserEmail: accessContext.adminUserEmail,
      adminUserName: accessContext.adminUserName,
    },
  }
}

export async function POST(request) {
  try {
    const payload = await request.json()
    const context = await authorizeSessionRequest(request, payload)
    const result = await heartbeatPowerBiDashboardSession({
      ...context,
      pageName: String(payload?.pageName || '').trim(),
      pageLabel: String(payload?.pageLabel || '').trim(),
      pageSequence: Number(payload?.pageSequence || 0),
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[power-bi-session:heartbeat]', error)
    return NextResponse.json({ error: error?.message || 'Falha ao atualizar a sessao do dashboard.' }, { status: getErrorStatus(error) })
  }
}

export async function DELETE(request) {
  try {
    const payload = await request.json()
    const context = await authorizeSessionRequest(request, payload)
    const result = await endPowerBiDashboardSession({
      ...context,
      reason: String(payload?.reason || 'closed').trim() || 'closed',
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[power-bi-session:end]', error)
    return NextResponse.json({ error: error?.message || 'Falha ao encerrar a sessao do dashboard.' }, { status: getErrorStatus(error) })
  }
}
