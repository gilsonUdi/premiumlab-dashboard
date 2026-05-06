export const PORTAL_PAGE_KEYS = {
  ANALYSIS: 'analysis',
  PPS: 'pps',
  EXTERNAL_DASHBOARD: 'externalDashboard',
}

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

export function getDefaultSectionVisibility(mode) {
  return Object.fromEntries((DASHBOARD_SECTION_GROUPS[mode] || []).map(section => [section.key, true]))
}

export function buildDefaultUserPermissions(company = {}) {
  const supabaseEnabled = company.supabaseEnabled !== false

  return {
    pages: {
      [PORTAL_PAGE_KEYS.ANALYSIS]: supabaseEnabled,
      [PORTAL_PAGE_KEYS.PPS]: supabaseEnabled,
      [PORTAL_PAGE_KEYS.EXTERNAL_DASHBOARD]: !supabaseEnabled && Boolean(company.externalDashboardUrl),
    },
    sections: {
      analysis: getDefaultSectionVisibility('analysis'),
      pps: getDefaultSectionVisibility('pps'),
    },
  }
}

export function normalizeUserPermissions(permissions, company = {}) {
  const defaults = buildDefaultUserPermissions(company)
  const pages = permissions?.pages || {}
  const sections = permissions?.sections || {}

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
  }
}

export function normalizeCompanyPortalSettings(company = {}) {
  const supabaseEnabled = company.supabaseEnabled !== false
  const externalDashboardUrl = String(company.externalDashboardUrl || '').trim()

  return {
    supabaseEnabled,
    externalDashboardUrl,
  }
}

export function canAccessPortalPage(company, permissions, pageKey) {
  const normalizedPermissions = normalizeUserPermissions(permissions, company)
  return Boolean(normalizedPermissions.pages[pageKey])
}

export function getSectionVisibility(company, permissions, mode) {
  return normalizeUserPermissions(permissions, company).sections[mode] || getDefaultSectionVisibility(mode)
}
