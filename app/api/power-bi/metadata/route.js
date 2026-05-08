import { NextResponse } from 'next/server'
import { getAllowedPowerBiPages, normalizeUserPermissions, PORTAL_PAGE_KEYS } from '@/lib/portal-config'
import { getPowerBiReportMetadata, hasEmbeddedPowerBiConfig, isPowerBiNavigablePage } from '@/lib/power-bi'
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
      return NextResponse.json({ pages: [], reportName: company.powerBiLabel || '' })
    }

    const permissions = normalizeUserPermissions(profile.permissions, company)
    if (profile.role !== 'admin' && !permissions.pages[PORTAL_PAGE_KEYS.POWER_BI]) {
      return NextResponse.json({ error: 'Usuario sem acesso ao Power BI desta empresa.' }, { status: 403 })
    }

    const metadata = await getPowerBiReportMetadata(company)
    const navigablePages = metadata.pages.filter(isPowerBiNavigablePage)
    const allowedPageNames = getAllowedPowerBiPages(company, permissions)
    const visiblePages =
      profile.role === 'admin' || allowedPageNames.length === 0
        ? navigablePages
        : navigablePages.filter(page => allowedPageNames.includes(page.name))

    return NextResponse.json({
      reportName: company.powerBiLabel || metadata.report.name,
      pages: visiblePages,
      allPages: navigablePages,
    })
  } catch (error) {
    console.error('[power-bi-metadata:get]', error)
    return NextResponse.json({ error: error.message || 'Falha ao carregar paginas do Power BI.' }, { status: getErrorStatus(error) })
  }
}
