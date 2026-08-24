import {
  canAccessPowerBiReport,
  getAllowedPowerBiPages,
  getPowerBiReportFilters,
  normalizeUserPermissions,
  PORTAL_PAGE_KEYS,
} from '@/lib/portal-config'
import { generatePowerBiEmbedConfig, hasEmbeddedPowerBiConfig, isPowerBiNavigablePage } from '@/lib/power-bi'
import { preparePowerBiDashboardAccess } from '@/lib/power-bi-capacity'
import { resolveAuthorizedCompany } from '@/lib/server-auth'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function getErrorStatus(error) {
  const message = String(error?.message || '')
  if (message.includes('Nao autorizado')) return 401
  if (message.includes('Acesso negado')) return 403
  if (message.includes('Empresa nao encontrada')) return 404
  return 500
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const slug = String(searchParams.get('slug') || '').trim()
    const reportKey = String(searchParams.get('report') || '').trim()
    const requestedSessionId = String(searchParams.get('session') || '').trim()
    const { decoded, profile, company } = await resolveAuthorizedCompany(request, slug)

    if (!hasEmbeddedPowerBiConfig(company, reportKey)) {
      return NextResponse.json({ error: 'Power BI Embedded ainda nao configurado para este modelo.' }, { status: 400 })
    }

    const permissions = normalizeUserPermissions(profile.permissions, company)
    if (profile.role !== 'admin' && !permissions.pages[PORTAL_PAGE_KEYS.POWER_BI]) {
      return NextResponse.json({ error: 'Usuário sem acesso ao Power BI desta empresa.' }, { status: 403 })
    }

    if (profile.role !== 'admin' && !canAccessPowerBiReport(company, permissions, reportKey)) {
      return NextResponse.json({ error: 'Usuário sem acesso a este modelo de Power BI.' }, { status: 403 })
    }

    const capacity = await preparePowerBiDashboardAccess({
      sessionId: requestedSessionId,
      company,
      reportKey,
      user: {
        uid: decoded.uid,
        email: profile.email || decoded.email || '',
        name: profile.name || profile.email || decoded.email || 'Usuario',
      },
    })

    if (!capacity.ready) {
      return NextResponse.json(
        {
          status: 'preparing',
          message: 'Preparando seu painel de indicadores. Aguarde alguns instantes...',
          dashboardSessionId: capacity.sessionId,
          capacityState: capacity.capacityState,
          retryAfterMs: capacity.retryAfterMs || 5000,
        },
        { status: 202 }
      )
    }

    const embedConfig = await generatePowerBiEmbedConfig(
      company,
      reportKey,
      getPowerBiReportFilters(company, permissions, reportKey),
      {
        email: profile.email,
        username: profile.email,
      }
    )
    const navigablePages = embedConfig.pages.filter(isPowerBiNavigablePage)
    const allowedPageNames = getAllowedPowerBiPages(company, permissions, reportKey)
    const visiblePages =
      profile.role === 'admin' || allowedPageNames.length === 0
        ? navigablePages
        : navigablePages.filter(page => allowedPageNames.includes(page.name))

    if (profile.role !== 'admin' && allowedPageNames.length > 0 && visiblePages.length === 0) {
      return NextResponse.json({ error: 'Nenhuma página do Power BI foi liberada para este usuário.' }, { status: 403 })
    }

    return NextResponse.json({
      reportId: embedConfig.reportId,
      reportKey: embedConfig.reportKey,
      reportName: embedConfig.reportName,
      embedUrl: embedConfig.embedUrl,
      accessToken: embedConfig.embedToken,
      tokenExpiration: embedConfig.tokenExpiration,
      pages: visiblePages,
      initialPageName: visiblePages[0]?.name || navigablePages[0]?.name || null,
      filters: embedConfig.filters || [],
      dashboardSessionId: capacity.sessionId || '',
      capacityManaged: capacity.enabled,
    })
  } catch (error) {
    console.error('[power-bi-embed:get]', error)
    return NextResponse.json({ error: error.message || 'Falha ao gerar configuração do Power BI Embedded.' }, { status: getErrorStatus(error) })
  }
}
