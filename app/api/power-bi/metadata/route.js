import {
  canAccessPowerBiReport,
  getAllowedPowerBiPages,
  normalizeUserPermissions,
  PORTAL_PAGE_KEYS,
} from '@/lib/portal-config'
import {
  getPowerBiCatalogMetadata,
  getPowerBiReportMetadata,
  hasAnyPowerBiConfig,
  isPowerBiNavigablePage,
} from '@/lib/power-bi'
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
    const includeSchema = String(searchParams.get('includeSchema') || '').trim() === '1'
    const { profile, company } = await resolveAuthorizedCompany(request, slug)

    if (!hasAnyPowerBiConfig(company)) {
      return NextResponse.json({ reports: [], reportName: '' })
    }

    const permissions = normalizeUserPermissions(profile.permissions, company)
    if (profile.role !== 'admin' && !permissions.pages[PORTAL_PAGE_KEYS.POWER_BI]) {
      return NextResponse.json({ error: 'Usuario sem acesso ao Power BI desta empresa.' }, { status: 403 })
    }

    if (!reportKey) {
      const catalog = await getPowerBiCatalogMetadata(company, { includeSchema })
      const visibleReports =
        profile.role === 'admin'
          ? catalog
          : catalog.filter(report => canAccessPowerBiReport(company, permissions, report.id))

      return NextResponse.json({
        reports: visibleReports.map(report => ({
          id: report.id,
          label: report.label || report.reportName,
          reportName: report.reportName,
          pages: report.pages,
          tables: includeSchema ? report.tables || [] : undefined,
          lastRefreshAt: report.lastRefreshAt || '',
          lastRefreshStatus: report.lastRefreshStatus || '',
        })),
      })
    }

    if (profile.role !== 'admin' && !canAccessPowerBiReport(company, permissions, reportKey)) {
      return NextResponse.json({ error: 'Usuario sem acesso a este modelo de Power BI.' }, { status: 403 })
    }

    const metadata = await getPowerBiReportMetadata(company, reportKey)
    const navigablePages = metadata.pages.filter(isPowerBiNavigablePage)
    const allowedPageNames = getAllowedPowerBiPages(company, permissions, reportKey)
    const visiblePages =
      profile.role === 'admin' || allowedPageNames.length === 0
        ? navigablePages
        : navigablePages.filter(page => allowedPageNames.includes(page.name))

    return NextResponse.json({
      reportId: metadata.config.id,
      reportName: metadata.config.label || metadata.report.name,
      pages: visiblePages,
      allPages: navigablePages,
    })
  } catch (error) {
    console.error('[power-bi-metadata:get]', error)
    return NextResponse.json({ error: error.message || 'Falha ao carregar paginas do Power BI.' }, { status: getErrorStatus(error) })
  }
}
