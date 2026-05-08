import { NextResponse } from 'next/server'
import { getAllowedPowerBiPages, normalizeUserPermissions, PORTAL_PAGE_KEYS } from '@/lib/portal-config'
import { generatePowerBiEmbedConfig, hasEmbeddedPowerBiConfig, isPowerBiNavigablePage } from '@/lib/power-bi'
import { resolveAuthorizedCompany } from '@/lib/server-auth'

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
    const { profile, company } = await resolveAuthorizedCompany(request, slug)

    if (!hasEmbeddedPowerBiConfig(company)) {
      return NextResponse.json({ error: 'Power BI Embedded ainda nao configurado para esta empresa.' }, { status: 400 })
    }

    const permissions = normalizeUserPermissions(profile.permissions, company)
    if (profile.role !== 'admin' && !permissions.pages[PORTAL_PAGE_KEYS.POWER_BI]) {
      return NextResponse.json({ error: 'Usuario sem acesso ao Power BI desta empresa.' }, { status: 403 })
    }

    const embedConfig = await generatePowerBiEmbedConfig(company)
    const navigablePages = embedConfig.pages.filter(isPowerBiNavigablePage)
    const allowedPageNames = getAllowedPowerBiPages(company, permissions)
    const visiblePages =
      profile.role === 'admin' || allowedPageNames.length === 0
        ? navigablePages
        : navigablePages.filter(page => allowedPageNames.includes(page.name))

    if (profile.role !== 'admin' && allowedPageNames.length > 0 && visiblePages.length === 0) {
      return NextResponse.json({ error: 'Nenhuma pagina do Power BI foi liberada para este usuario.' }, { status: 403 })
    }

    return NextResponse.json({
      reportId: embedConfig.reportId,
      reportName: company.powerBiLabel || embedConfig.reportName,
      embedUrl: embedConfig.embedUrl,
      accessToken: embedConfig.embedToken,
      tokenExpiration: embedConfig.tokenExpiration,
      pages: visiblePages,
      initialPageName: visiblePages[0]?.name || navigablePages[0]?.name || null,
    })
  } catch (error) {
    console.error('[power-bi-embed:get]', error)
    return NextResponse.json({ error: error.message || 'Falha ao gerar configuracao do Power BI Embedded.' }, { status: getErrorStatus(error) })
  }
}
