import { getPowerBiReportCatalog } from '@/lib/power-bi'

export const PORTAL_PAGE_KEYS = {
  ANALYSIS: 'analysis',
  PPS: 'pps',
  EXTERNAL_DASHBOARD: 'externalDashboard',
  POWER_BI: 'powerBi',
}

export const POWER_BI_FILTER_OPERATORS = [
  { value: 'is', label: 'E igual a' },
  { value: 'isNot', label: 'E diferente de' },
  { value: 'in', label: 'Esta em' },
  { value: 'contains', label: 'Contem' },
  { value: 'notContains', label: 'Nao contem' },
  { value: 'startsWith', label: 'Comeca com' },
  { value: 'endsWith', label: 'Termina com' },
  { value: 'greaterThan', label: 'Maior que' },
  { value: 'greaterThanOrEqual', label: 'Maior ou igual a' },
  { value: 'lessThan', label: 'Menor que' },
  { value: 'lessThanOrEqual', label: 'Menor ou igual a' },
]

export const DASHBOARD_SECTION_GROUPS = {
  analysis: [
    { key: 'kpis', label: 'Cards principais' },
    { key: 'pontualidadeChart', label: 'Grafico de pontualidade' },
    { key: 'perdasChart', label: 'Grafico de perdas' },
    { key: 'history', label: 'Historico de pedidos' },
    { key: 'products', label: 'Detalhes dos produtos' },
    { key: 'traceability', label: 'Rastreabilidade do pedido' },
    { key: 'customerService', label: 'Indice de atendimento' },
    { key: 'sellerRanking', label: 'Ranking de vendedores' },
  ],
  pps: [
    { key: 'kpis', label: 'Cards principais' },
    { key: 'history', label: 'Historico de pedidos' },
  ],
}

function normalizeBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function normalizePowerBiFilter(filter = {}) {
  return {
    id: String(filter.id || `${filter.table || 'filtro'}-${filter.column || 'coluna'}-${filter.operator || 'is'}`).trim(),
    table: String(filter.table || '').trim(),
    column: String(filter.column || '').trim(),
    operator: String(filter.operator || 'is').trim(),
    value: String(filter.value || '').trim(),
  }
}

function normalizePowerBiReportPermission(report = {}, fallbackEnabled = true) {
  const pages = Array.isArray(report.pages)
    ? [...new Set(report.pages.map(value => String(value || '').trim()).filter(Boolean))]
    : []

  const filters = Array.isArray(report.filters) ? report.filters.map(normalizePowerBiFilter).filter(filter => filter.table && filter.column && filter.value) : []

  return {
    enabled: normalizeBoolean(report.enabled, fallbackEnabled),
    pages,
    filters,
  }
}

export function getDefaultSectionVisibility(mode) {
  return Object.fromEntries((DASHBOARD_SECTION_GROUPS[mode] || []).map(section => [section.key, true]))
}

function buildDefaultPowerBiReportPermissions(company = {}) {
  return Object.fromEntries(
    getPowerBiReportCatalog(company).map(report => [
      report.id,
      {
        enabled: true,
        pages: [],
        filters: [],
      },
    ])
  )
}

export function buildDefaultUserPermissions(company = {}) {
  const supabaseEnabled = company.supabaseEnabled !== false
  const powerBiReports = getPowerBiReportCatalog(company)
  const powerBiEnabled = powerBiReports.length > 0

  return {
    pages: {
      [PORTAL_PAGE_KEYS.ANALYSIS]: supabaseEnabled,
      [PORTAL_PAGE_KEYS.PPS]: supabaseEnabled,
      [PORTAL_PAGE_KEYS.EXTERNAL_DASHBOARD]: !supabaseEnabled && Boolean(company.externalDashboardUrl),
      [PORTAL_PAGE_KEYS.POWER_BI]: powerBiEnabled,
    },
    sections: {
      analysis: getDefaultSectionVisibility('analysis'),
      pps: getDefaultSectionVisibility('pps'),
    },
    powerBiPages: [],
    powerBiReports: buildDefaultPowerBiReportPermissions(company),
  }
}

export function normalizeUserPermissions(permissions, company = {}) {
  const defaults = buildDefaultUserPermissions(company)
  const pages = permissions?.pages || {}
  const sections = permissions?.sections || {}
  const powerBiPages = Array.isArray(permissions?.powerBiPages)
    ? [...new Set(permissions.powerBiPages.map(value => String(value || '').trim()).filter(Boolean))]
    : defaults.powerBiPages

  const powerBiReports = { ...defaults.powerBiReports }
  const permissionReports = permissions?.powerBiReports || {}

  Object.entries(permissionReports).forEach(([reportKey, reportPermission]) => {
    powerBiReports[String(reportKey || '').trim()] = normalizePowerBiReportPermission(
      reportPermission,
      defaults.powerBiReports[reportKey]?.enabled ?? true
    )
  })

  return {
    pages: {
      [PORTAL_PAGE_KEYS.ANALYSIS]: normalizeBoolean(
        pages[PORTAL_PAGE_KEYS.ANALYSIS],
        defaults.pages[PORTAL_PAGE_KEYS.ANALYSIS]
      ),
      [PORTAL_PAGE_KEYS.PPS]: normalizeBoolean(
        pages[PORTAL_PAGE_KEYS.PPS],
        defaults.pages[PORTAL_PAGE_KEYS.PPS]
      ),
      [PORTAL_PAGE_KEYS.EXTERNAL_DASHBOARD]: normalizeBoolean(
        pages[PORTAL_PAGE_KEYS.EXTERNAL_DASHBOARD],
        defaults.pages[PORTAL_PAGE_KEYS.EXTERNAL_DASHBOARD]
      ),
      [PORTAL_PAGE_KEYS.POWER_BI]: normalizeBoolean(
        pages[PORTAL_PAGE_KEYS.POWER_BI],
        defaults.pages[PORTAL_PAGE_KEYS.POWER_BI]
      ),
    },
    sections: {
      analysis: {
        ...defaults.sections.analysis,
        ...Object.fromEntries(
          Object.entries(sections.analysis || {}).map(([key, value]) => [key, normalizeBoolean(value, true)])
        ),
      },
      pps: {
        ...defaults.sections.pps,
        ...Object.fromEntries(
          Object.entries(sections.pps || {}).map(([key, value]) => [key, normalizeBoolean(value, true)])
        ),
      },
    },
    powerBiPages,
    powerBiReports,
  }
}

export function normalizeCompanyPortalSettings(company = {}) {
  const supabaseEnabled = company.supabaseEnabled !== false
  const externalDashboardUrl = String(company.externalDashboardUrl || '').trim()
  const powerBiEnabled = company.powerBiEnabled === true
  const powerBiEmbedUrl = String(company.powerBiEmbedUrl || '').trim()
  const powerBiLabel = String(company.powerBiLabel || '').trim()
  const powerBiWorkspaceId = String(company.powerBiWorkspaceId || '').trim()
  const powerBiReportId = String(company.powerBiReportId || '').trim()
  const powerBiDatasetId = String(company.powerBiDatasetId || '').trim()
  const powerBiReports = getPowerBiReportCatalog(company)

  return {
    supabaseEnabled,
    externalDashboardUrl,
    powerBiEnabled,
    powerBiEmbedUrl,
    powerBiLabel,
    powerBiWorkspaceId,
    powerBiReportId,
    powerBiDatasetId,
    powerBiReports,
  }
}

export function canAccessPortalPage(company, permissions, pageKey) {
  const normalizedPermissions = normalizeUserPermissions(permissions, company)
  return Boolean(normalizedPermissions.pages[pageKey])
}

export function getSectionVisibility(company, permissions, mode) {
  return normalizeUserPermissions(permissions, company).sections[mode] || getDefaultSectionVisibility(mode)
}

export function getAllowedPowerBiPages(company, permissions, reportKey = '') {
  const normalizedPermissions = normalizeUserPermissions(permissions, company)
  if (reportKey) {
    return normalizedPermissions.powerBiReports?.[reportKey]?.pages || []
  }
  return normalizedPermissions.powerBiPages || []
}

export function canAccessPowerBiReport(company, permissions, reportKey = '') {
  const normalizedPermissions = normalizeUserPermissions(permissions, company)
  if (!normalizedPermissions.pages[PORTAL_PAGE_KEYS.POWER_BI]) return false
  if (!reportKey) return true
  return normalizedPermissions.powerBiReports?.[reportKey]?.enabled !== false
}

export function getPowerBiReportFilters(company, permissions, reportKey = '') {
  const normalizedPermissions = normalizeUserPermissions(permissions, company)
  return normalizedPermissions.powerBiReports?.[reportKey]?.filters || []
}
