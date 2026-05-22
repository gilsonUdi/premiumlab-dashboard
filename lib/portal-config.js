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

export const DASHBOARD_FILTER_TABLES = [
  {
    name: 'orders',
    label: 'Pedidos',
    columns: [
      { name: 'pedcodigo', label: 'Codigo do pedido' },
      { name: 'pedidoId', label: 'ID do pedido' },
      { name: 'clicodigo', label: 'Codigo do cliente' },
      { name: 'clinome', label: 'Nome do cliente' },
      { name: 'gclcodigo', label: 'Grupo do cliente' },
      { name: 'status', label: 'Status' },
      { name: 'currentCell', label: 'Celula atual' },
      { name: 'caixa', label: 'Caixa' },
      { name: 'quantidade', label: 'Quantidade' },
      { name: 'emissao', label: 'Data de emissao' },
      { name: 'previsto', label: 'Data prevista' },
      { name: 'saida', label: 'Data de saida' },
      { name: 'vendedorCodigo', label: 'Codigo do vendedor' },
      { name: 'vendedorNome', label: 'Nome do vendedor' },
    ],
  },
  {
    name: 'products',
    label: 'Produtos',
    columns: [
      { name: 'procodigo', label: 'Codigo do produto' },
      { name: 'prodescricao', label: 'Descricao' },
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
      { name: 'celula', label: 'Celula' },
      { name: 'usuario', label: 'Usuario' },
      { name: 'dataHora', label: 'Data e hora' },
    ],
  },
  {
    name: 'customers',
    label: 'Clientes',
    columns: [
      { name: 'clicodigo', label: 'Codigo do cliente' },
      { name: 'clinome', label: 'Nome do cliente' },
      { name: 'gclcodigo', label: 'Grupo do cliente' },
      { name: 'indice', label: 'Indice de atendimento' },
      { name: 'mediaDias', label: 'Media de dias' },
    ],
  },
  {
    name: 'sellers',
    label: 'Vendedores',
    columns: [
      { name: 'vendedorCodigo', label: 'Codigo do vendedor' },
      { name: 'vendedorNome', label: 'Nome do vendedor' },
      { name: 'totalVendas', label: 'Total de vendas' },
      { name: 'totalPecas', label: 'Total de pecas' },
    ],
  },
]

export const DASHBOARD_FILTER_FIELDS = [
  {
    name: 'currentCell',
    label: 'Celula',
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

export const DASHBOARD_DATA_SOURCE_TYPES = [
  { value: 'supabase', label: 'Supabase' },
  { value: 'gradualApi', label: 'API Gradual' },
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

function normalizePositiveInteger(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback
}

function normalizeDashboardDataSource(company = {}) {
  const sourceType = String(company.dashboardDataSource || company.dashboardDataSourceType || 'supabase').trim()
  const type = sourceType === 'gradualApi' ? 'gradualApi' : 'supabase'

  return {
    type,
    gradualApiUrl: String(company.gradualApiUrl || '').trim(),
    gradualApiCompanyIds: Array.isArray(company.gradualApiCompanyIds)
      ? company.gradualApiCompanyIds.map(value => String(value || '').trim()).filter(Boolean)
      : String(company.gradualApiCompanyIds || '')
          .split(',')
          .map(value => value.trim())
          .filter(Boolean),
    gradualApiScanWindow: normalizePositiveInteger(company.gradualApiScanWindow, 1500),
    gradualApiStartOrderId: String(company.gradualApiStartOrderId || '').trim(),
    gradualApiLimit: normalizePositiveInteger(company.gradualApiLimit, 500),
  }
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
  const externalDashboardUrl = String(company.externalDashboardUrl || '').trim()
  const powerBiEnabled = company.powerBiEnabled === true
  const powerBiEmbedUrl = String(company.powerBiEmbedUrl || '').trim()
  const powerBiLabel = String(company.powerBiLabel || '').trim()
  const powerBiWorkspaceId = String(company.powerBiWorkspaceId || '').trim()
  const powerBiReportId = String(company.powerBiReportId || '').trim()
  const powerBiDatasetId = String(company.powerBiDatasetId || '').trim()
  const powerBiReports = getPowerBiReportCatalog(company)
  const dashboardFilters = normalizeDashboardFiltersByMode(company.dashboardFilters)
  const dashboardVisualFilters = normalizeDashboardVisualFilters(company.dashboardVisualFilters)
  const dashboardDataSource = normalizeDashboardDataSource(company)
  const orderCompletionRules = Array.isArray(company.orderCompletionRules)
    ? company.orderCompletionRules.map(normalizeOrderCompletionRule).filter(rule => rule.table && rule.column && rule.value)
    : []
  const companyCodeFilter = normalizeCompanyCodeFilter(company)

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
    dashboardFilters,
    dashboardVisualFilters,
    dashboardDataSource: dashboardDataSource.type,
    dashboardDataSourceType: dashboardDataSource.type,
    gradualApiUrl: dashboardDataSource.gradualApiUrl,
    gradualApiCompanyIds: dashboardDataSource.gradualApiCompanyIds,
    gradualApiScanWindow: dashboardDataSource.gradualApiScanWindow,
    gradualApiStartOrderId: dashboardDataSource.gradualApiStartOrderId,
    gradualApiLimit: dashboardDataSource.gradualApiLimit,
    orderCompletionRules,
    limitByCompanyCodeEnabled: companyCodeFilter.enabled,
    companyCodeFilter: companyCodeFilter.code,
  }
}

export function getCompanyDashboardDataSource(company = {}) {
  const settings = normalizeCompanyPortalSettings(company)

  return {
    type: settings.dashboardDataSourceType || settings.dashboardDataSource || 'supabase',
    gradualApiUrl: settings.gradualApiUrl,
    gradualApiCompanyIds: settings.gradualApiCompanyIds,
    gradualApiScanWindow: settings.gradualApiScanWindow,
    gradualApiStartOrderId: settings.gradualApiStartOrderId,
    gradualApiLimit: settings.gradualApiLimit,
  }
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
