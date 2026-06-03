import { getPowerBiReportCatalog } from '@/lib/power-bi'

export const PORTAL_PAGE_KEYS = {
  ANALYSIS: 'analysis',
  PPS: 'pps',
  EXTERNAL_DASHBOARD: 'externalDashboard',
  POWER_BI: 'powerBi',
}

export const POWER_BI_FILTER_OPERATORS = [
  { value: 'is', label: 'É igual a' },
  { value: 'isNot', label: 'É diferente de' },
  { value: 'in', label: 'Está em' },
  { value: 'contains', label: 'Contém' },
  { value: 'notContains', label: 'Não contém' },
  { value: 'startsWith', label: 'Começa com' },
  { value: 'endsWith', label: 'Termina com' },
  { value: 'greaterThan', label: 'Maior que' },
  { value: 'greaterThanOrEqual', label: 'Maior ou igual a' },
  { value: 'lessThan', label: 'Menor que' },
  { value: 'lessThanOrEqual', label: 'Menor ou igual a' },
]

export const DASHBOARD_SECTION_GROUPS = {
  analysis: [
    { key: 'kpis', label: 'Cards principais' },
    { key: 'pontualidadeChart', label: 'Gráfico de pontualidade' },
    { key: 'perdasChart', label: 'Gráfico de perdas' },
    { key: 'history', label: 'Histórico de pedidos' },
    { key: 'products', label: 'Detalhes dos produtos' },
    { key: 'traceability', label: 'Rastreabilidade do pedido' },
    { key: 'customerService', label: 'Índice de atendimento' },
    { key: 'sellerRanking', label: 'Ranking de vendedores' },
  ],
  pps: [
    { key: 'kpis', label: 'Cards principais' },
    { key: 'history', label: 'Histórico de pedidos' },
  ],
}

export const DASHBOARD_FILTER_TABLES = [
  {
    name: 'orders',
    label: 'Pedidos',
    columns: [
      { name: 'pedcodigo', label: 'Código do pedido' },
      { name: 'pedidoId', label: 'ID do pedido' },
      { name: 'clicodigo', label: 'Código do cliente' },
      { name: 'clinome', label: 'Nome do cliente' },
      { name: 'gclcodigo', label: 'Grupo do cliente' },
      { name: 'status', label: 'Status' },
      { name: 'currentCell', label: 'Célula atual' },
      { name: 'caixa', label: 'Caixa' },
      { name: 'quantidade', label: 'Quantidade' },
      { name: 'emissao', label: 'Data de emissão' },
      { name: 'previsto', label: 'Data prevista' },
      { name: 'saida', label: 'Data de saída' },
      { name: 'vendedorCodigo', label: 'Código do vendedor' },
      { name: 'vendedorNome', label: 'Nome do vendedor' },
    ],
  },
  {
    name: 'products',
    label: 'Produtos',
    columns: [
      { name: 'procodigo', label: 'Código do produto' },
      { name: 'prodescricao', label: 'Descrição' },
      { name: 'status', label: 'Status' },
      { name: 'quantidade', label: 'Quantidade' },
      { name: 'clinome', label: 'Nome do cliente' },
    ],
  },
  {
    name: 'traceability',
    label: 'Rastreabilidade',
    columns: [
      { name: 'estoque', label: 'Estoque' },
      { name: 'celula', label: 'Célula' },
      { name: 'usuario', label: 'Usuário' },
      { name: 'dataHora', label: 'Data e hora' },
    ],
  },
  {
    name: 'customers',
    label: 'Clientes',
    columns: [
      { name: 'clicodigo', label: 'Código do cliente' },
      { name: 'clinome', label: 'Nome do cliente' },
      { name: 'gclcodigo', label: 'Grupo do cliente' },
      { name: 'indice', label: 'Índice de atendimento' },
      { name: 'mediaDias', label: 'Média de dias' },
    ],
  },
  {
    name: 'sellers',
    label: 'Vendedores',
    columns: [
      { name: 'vendedorCodigo', label: 'Código do vendedor' },
      { name: 'vendedorNome', label: 'Nome do vendedor' },
      { name: 'totalVendas', label: 'Total de vendas' },
      { name: 'totalPecas', label: 'Total de peças' },
    ],
  },
]

export const DASHBOARD_FILTER_FIELDS = [
  {
    name: 'currentCell',
    label: 'Célula',
    table: 'orders',
    column: 'currentCell',
    inputType: 'select',
    optionsKey: 'stages',
  },
  {
    name: 'clicodigo',
    label: 'Cod. Cliente',
    table: 'orders',
    column: 'clicodigo',
    inputType: 'text',
  },
  {
    name: 'clinome',
    label: 'Nome Cliente',
    table: 'orders',
    column: 'clicodigo',
    inputType: 'select',
    optionsKey: 'clients',
  },
  {
    name: 'pedcodigo',
    label: 'ID Pedido',
    table: 'orders',
    column: 'pedcodigo',
    inputType: 'text',
  },
  {
    name: 'gclcodigo',
    label: 'Grupo Cliente',
    table: 'orders',
    column: 'gclcodigo',
    inputType: 'select',
    optionsKey: 'clientGroups',
  },
  {
    name: 'clicliente',
    label: 'Tipo Cliente',
    table: 'customers',
    column: 'clicliente',
    inputType: 'text',
  },
  {
    name: 'endcodigo',
    label: 'Codigo Endereco',
    table: 'customers',
    column: 'endcodigo',
    inputType: 'text',
  },
  {
    name: 'zocodigo',
    label: 'Zona',
    table: 'orders',
    column: 'zocodigo',
    inputType: 'select',
    optionsKey: 'zones',
  },
  {
    name: 'status',
    label: 'Status',
    table: 'orders',
    column: 'status',
    inputType: 'select',
    optionsKey: 'statuses',
  },
]

export const DASHBOARD_FEEDING_MODE_TYPES = [
  { value: 'firebird_legacy', label: 'Firebird (legado)' },
  { value: 'api_cache', label: 'API Cache (Supabase)' },
]

export function buildDefaultDashboardVisualFilters() {
  return Object.fromEntries(
    Object.entries(DASHBOARD_SECTION_GROUPS).map(([mode, sections]) => [
      mode,
      Object.fromEntries(sections.map(section => [section.key, []])),
    ])
  )
}

function findDashboardFieldByStorage(table, column) {
  return DASHBOARD_FILTER_FIELDS.find(field => field.table === table && field.column === column) || null
}

export function getDashboardFilterDefinition(fieldName) {
  return DASHBOARD_FILTER_FIELDS.find(field => field.name === String(fieldName || '').trim()) || null
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

function normalizeDashboardFilter(filter = {}) {
  const source = ['standard', 'table'].includes(filter.source) ? filter.source : 'standard'

  if (source === 'table') {
    return {
      id: String(filter.id || `${filter.table || 'filtro'}-${filter.column || 'coluna'}-${filter.operator || 'is'}`).trim(),
      source: 'table',
      field: '',
      table: String(filter.table || '').trim(),
      column: String(filter.column || '').trim(),
      operator: String(filter.operator || 'is').trim(),
      value: String(filter.value || '').trim(),
    }
  }

  // source === 'standard' — comportamento original preservado
  const fieldName = String(filter.field || '').trim()
  const directField = getDashboardFilterDefinition(fieldName)
  const fallbackField = findDashboardFieldByStorage(
    String(filter.table || '').trim(),
    String(filter.column || '').trim()
  )
  const resolvedField = directField || fallbackField

  return {
    id: String(filter.id || `${filter.table || 'filtro'}-${filter.column || 'coluna'}-${filter.operator || 'is'}`).trim(),
    source: 'standard',
    field: resolvedField?.name || fieldName,
    table: resolvedField?.table || String(filter.table || '').trim(),
    column: resolvedField?.column || String(filter.column || '').trim(),
    operator: String(filter.operator || 'is').trim(),
    value: String(filter.value || '').trim(),
  }
}

function normalizeOrderCompletionRule(rule = {}) {
  return {
    id: String(rule.id || `${rule.table || 'tabela'}-${rule.column || 'coluna'}`).trim(),
    table: String(rule.table || '').trim(),
    column: String(rule.column || '').trim(),
    value: String(rule.value || '').trim(),
  }
}

function normalizeCompanyCodeFilter(company = {}) {
  const code = String(company.companyCodeFilter || company.companyCode || '').trim()
  return {
    enabled: normalizeBoolean(company.limitByCompanyCodeEnabled, false) && Boolean(code),
    code,
  }
}

function normalizeDashboardFeedingModel(company = {}) {
  const rawModel = String(
    company.dashboardFeedingModel ||
    company.dashboardDataSource ||
    company.dashboardDataSourceType ||
    'firebird_legacy'
  ).trim()

  if (rawModel === 'api_cache' || rawModel === 'gradualApi') return 'api_cache'
  if (rawModel === 'supabase') return 'firebird_legacy'
  return 'firebird_legacy'
}

function normalizeExternalDashboard(dashboard = {}, index = 0) {
  const url = String(dashboard.url || dashboard.embedUrl || dashboard.externalDashboardUrl || '').trim()
  const label = String(dashboard.label || dashboard.name || '').trim()
  const id = String(dashboard.id || label || `dashboard-externo-${index + 1}`)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)

  return {
    id: id || `dashboard-externo-${index + 1}`,
    label: label || `Dashboard externo ${index + 1}`,
    url,
    enabled: normalizeBoolean(dashboard.enabled, true),
  }
}

function normalizeExternalDashboardsForStorage(company = {}) {
  const dashboards = Array.isArray(company.externalDashboards)
    ? company.externalDashboards
    : []

  const normalized = dashboards
    .map(normalizeExternalDashboard)
    .filter(dashboard => dashboard.url)

  const legacyUrl = String(company.externalDashboardUrl || '').trim()
  if (legacyUrl && !normalized.some(dashboard => dashboard.url === legacyUrl)) {
    normalized.unshift({
      id: 'dashboard-externo',
      label: 'Dashboard externo',
      url: legacyUrl,
      enabled: true,
    })
  }

  return normalized
}

export function getExternalDashboardCatalog(company = {}) {
  return normalizeExternalDashboardsForStorage(company).filter(dashboard => dashboard.enabled !== false)
}

export function hasAnyExternalDashboardConfig(company = {}) {
  return getExternalDashboardCatalog(company).length > 0
}

export function getExternalDashboardConfigFromCompany(company = {}, dashboardKey = '') {
  const catalog = getExternalDashboardCatalog(company)
  if (!dashboardKey) return catalog[0] || null
  const key = String(dashboardKey || '').trim()
  return catalog.find(dashboard => dashboard.id === key) || null
}

function normalizeDashboardVisualFilters(filters = {}) {
  const defaults = buildDefaultDashboardVisualFilters()

  return Object.fromEntries(
    Object.entries(defaults).map(([mode, sections]) => [
      mode,
      Object.fromEntries(
        Object.keys(sections).map(sectionKey => {
          const sectionFilters = filters?.[mode]?.[sectionKey]
          return [
            sectionKey,
            Array.isArray(sectionFilters)
              ? sectionFilters.map(normalizeDashboardFilter).filter(filter => filter.table && filter.column && filter.value)
              : [],
          ]
        })
      ),
    ])
  )
}

function normalizeDashboardFiltersByMode(filters = {}) {
  return {
    analysis: Array.isArray(filters.analysis)
      ? filters.analysis.map(normalizeDashboardFilter).filter(filter => filter.table && filter.column && filter.value)
      : [],
    pps: Array.isArray(filters.pps)
      ? filters.pps.map(normalizeDashboardFilter).filter(filter => filter.table && filter.column && filter.value)
      : [],
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
  const externalDashboardEnabled = hasAnyExternalDashboardConfig(company)

  return {
    pages: {
      [PORTAL_PAGE_KEYS.ANALYSIS]: supabaseEnabled,
      [PORTAL_PAGE_KEYS.PPS]: supabaseEnabled,
      [PORTAL_PAGE_KEYS.EXTERNAL_DASHBOARD]: externalDashboardEnabled,
      [PORTAL_PAGE_KEYS.POWER_BI]: powerBiEnabled,
    },
    sections: {
      analysis: getDefaultSectionVisibility('analysis'),
      pps: getDefaultSectionVisibility('pps'),
    },
    dashboardFilters: {
      analysis: [],
      pps: [],
    },
    powerBiPages: [],
    powerBiReports: buildDefaultPowerBiReportPermissions(company),
  }
}

export function normalizeUserPermissions(permissions, company = {}) {
  const defaults = buildDefaultUserPermissions(company)
  const pages = permissions?.pages || {}
  const sections = permissions?.sections || {}
  const dashboardFilters = permissions?.dashboardFilters || {}
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
    dashboardFilters: normalizeDashboardFiltersByMode(dashboardFilters),
    powerBiPages,
    powerBiReports,
  }
}

export function normalizeCompanyPortalSettings(company = {}) {
  const supabaseEnabled = company.supabaseEnabled !== false
  const externalDashboards = normalizeExternalDashboardsForStorage(company)
  const externalDashboardUrl = externalDashboards.find(dashboard => dashboard.enabled !== false)?.url || String(company.externalDashboardUrl || '').trim()
  const powerBiEnabled = company.powerBiEnabled === true
  const powerBiEmbedUrl = String(company.powerBiEmbedUrl || '').trim()
  const powerBiLabel = String(company.powerBiLabel || '').trim()
  const powerBiWorkspaceId = String(company.powerBiWorkspaceId || '').trim()
  const powerBiReportId = String(company.powerBiReportId || '').trim()
  const powerBiDatasetId = String(company.powerBiDatasetId || '').trim()
  const powerBiReports = getPowerBiReportCatalog(company)
  const dashboardFilters = normalizeDashboardFiltersByMode(company.dashboardFilters)
  const dashboardVisualFilters = normalizeDashboardVisualFilters(company.dashboardVisualFilters)
  const dashboardFeedingModel = normalizeDashboardFeedingModel(company)
  const orderCompletionRules = Array.isArray(company.orderCompletionRules)
    ? company.orderCompletionRules.map(normalizeOrderCompletionRule).filter(rule => rule.table && rule.column && rule.value)
    : []
  const companyCodeFilter = normalizeCompanyCodeFilter(company)
  const apiCancellationCodes = Array.isArray(company.apiCancellationCodes)
    ? company.apiCancellationCodes
    : String(company.apiCancellationCodes || '')
        .split(',')
        .map(code => String(code || '').trim())
        .filter(Boolean)

  return {
    supabaseEnabled,
    externalDashboardUrl,
    externalDashboards,
    powerBiEnabled,
    powerBiEmbedUrl,
    powerBiLabel,
    powerBiWorkspaceId,
    powerBiReportId,
    powerBiDatasetId,
    powerBiReports,
    dashboardFilters,
    dashboardVisualFilters,
    dashboardFeedingModel,
    // Compatibilidade com registros antigos ainda lidos em outras camadas
    dashboardDataSource: dashboardFeedingModel,
    dashboardDataSourceType: dashboardFeedingModel,
    orderCompletionRules,
    limitByCompanyCodeEnabled: companyCodeFilter.enabled,
    companyCodeFilter: companyCodeFilter.code,
    apiCancellationCodes: [...new Set(apiCancellationCodes)],
  }
}

export function getCompanyDashboardFeedingModel(company = {}) {
  const settings = normalizeCompanyPortalSettings(company)
  return settings.dashboardFeedingModel || 'firebird_legacy'
}

export function canAccessPortalPage(company, permissions, pageKey) {
  const normalizedPermissions = normalizeUserPermissions(permissions, company)
  return Boolean(normalizedPermissions.pages[pageKey])
}

export function getSectionVisibility(company, permissions, mode) {
  return normalizeUserPermissions(permissions, company).sections[mode] || getDefaultSectionVisibility(mode)
}

export function getDashboardFilters(company, permissions, mode = 'analysis') {
  return normalizeUserPermissions(permissions, company).dashboardFilters?.[mode] || []
}

export function getCompanyDashboardFilters(company, mode = 'analysis') {
  return normalizeCompanyPortalSettings(company).dashboardFilters?.[mode] || []
}

export function getCompanyDashboardVisualFilters(company, mode = 'analysis', sectionKey = '') {
  const dashboardVisualFilters = normalizeCompanyPortalSettings(company).dashboardVisualFilters
  if (sectionKey) return dashboardVisualFilters?.[mode]?.[sectionKey] || []
  return dashboardVisualFilters?.[mode] || {}
}

export function getCompanyOrderCompletionRules(company) {
  return normalizeCompanyPortalSettings(company).orderCompletionRules
}

export function getCompanyCodeFilter(company) {
  const settings = normalizeCompanyPortalSettings(company)
  return {
    enabled: settings.limitByCompanyCodeEnabled,
    code: settings.companyCodeFilter,
  }
}

export function getCompanyApiCancellationCodes(company) {
  return normalizeCompanyPortalSettings(company).apiCancellationCodes
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
