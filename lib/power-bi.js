const POWER_BI_SCOPE = 'https://analysis.windows.net/powerbi/api/.default'
const POWER_BI_API_BASE = 'https://api.powerbi.com/v1.0/myorg'

const HIDDEN_PAGE_VISIBILITY = 1
const TOOLTIP_PAGE_PATTERN = /tool\s*tip|tooltip/i

const BASIC_FILTER_SCHEMA = 'http://powerbi.com/product/schema#basic'
const ADVANCED_FILTER_SCHEMA = 'http://powerbi.com/product/schema#advanced'

function requireEnv(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) {
    throw new Error(`Variavel ${name} nao configurada.`)
  }
  return value
}

function normalizeBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function buildReportKey(value, fallbackIndex = 0) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || `relatorio-${fallbackIndex + 1}`
}

export function normalizePowerBiReportModel(report = {}, index = 0) {
  const workspaceId = String(report.workspaceId || report.powerBiWorkspaceId || '').trim()
  const reportId = String(report.reportId || report.powerBiReportId || '').trim()
  const datasetId = String(report.datasetId || report.powerBiDatasetId || '').trim()
  const label = String(report.label || report.powerBiLabel || report.name || '').trim()
  const embedUrl = String(report.embedUrl || report.powerBiEmbedUrl || '').trim()
  const id = buildReportKey(report.id || report.key || report.reportId || report.label || report.name, index)

  return {
    id,
    label: label || `Relatorio ${index + 1}`,
    workspaceId,
    reportId,
    datasetId,
    embedUrl,
    enabled: normalizeBoolean(report.enabled, true),
  }
}

export function getPowerBiReportCatalog(company = {}) {
  const configuredReports = Array.isArray(company.powerBiReports) ? company.powerBiReports : []
  const normalizedReports = configuredReports
    .map((report, index) => normalizePowerBiReportModel(report, index))
    .filter(report => report.enabled && ((report.workspaceId && report.reportId) || report.embedUrl))

  if (normalizedReports.length > 0) {
    return normalizedReports
  }

  const legacyReport = normalizePowerBiReportModel(
    {
      id: company.powerBiReportId || company.powerBiLabel || company.slug || company.id || 'power-bi',
      label: company.powerBiLabel || company.name || 'Power BI',
      workspaceId: company.powerBiWorkspaceId,
      reportId: company.powerBiReportId,
      datasetId: company.powerBiDatasetId,
      embedUrl: company.powerBiEmbedUrl,
      enabled: company.powerBiEnabled === true,
    },
    0
  )

  return legacyReport.enabled && ((legacyReport.workspaceId && legacyReport.reportId) || legacyReport.embedUrl) ? [legacyReport] : []
}

export function getPowerBiConfigFromCompany(company = {}, reportKey = '') {
  const reportCatalog = getPowerBiReportCatalog(company)
  if (reportCatalog.length === 0) {
    return {
      id: '',
      label: '',
      workspaceId: '',
      reportId: '',
      datasetId: '',
      embedUrl: '',
      enabled: false,
    }
  }

  if (!reportKey) return reportCatalog[0]
  return reportCatalog.find(report => report.id === reportKey) || reportCatalog[0]
}

export function hasEmbeddedPowerBiConfig(company = {}, reportKey = '') {
  const config = getPowerBiConfigFromCompany(company, reportKey)
  return Boolean(config.enabled && config.workspaceId && config.reportId)
}

export function hasAnyPowerBiConfig(company = {}) {
  return getPowerBiReportCatalog(company).length > 0
}

export function isPowerBiNavigablePage(page = {}) {
  const name = String(page.name || '').trim()
  const displayName = String(page.displayName || '').trim()
  const visibility = Number(page.visibility ?? 0)

  if (!name) return false
  if (visibility === HIDDEN_PAGE_VISIBILITY) return false
  if (TOOLTIP_PAGE_PATTERN.test(name) || TOOLTIP_PAGE_PATTERN.test(displayName)) return false

  return true
}

export async function getPowerBiAccessToken() {
  const tenantId = requireEnv('POWER_BI_TENANT_ID')
  const clientId = requireEnv('POWER_BI_CLIENT_ID')
  const clientSecret = requireEnv('POWER_BI_CLIENT_SECRET')

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: POWER_BI_SCOPE,
      grant_type: 'client_credentials',
    }),
    cache: 'no-store',
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || 'Nao foi possivel autenticar no Power BI.')
  }

  return payload.access_token
}

async function powerBiApiRequest(accessToken, path, options = {}) {
  const response = await fetch(`${POWER_BI_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    cache: 'no-store',
  })

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : await response.text()

  if (!response.ok) {
    const message =
      typeof payload === 'string'
        ? payload
        : payload?.error?.message || payload?.message || 'Falha ao consultar o Power BI.'
    throw new Error(message)
  }

  return payload
}

function normalizePowerBiPage(page = {}) {
  return {
    name: String(page.name || '').trim(),
    displayName: String(page.displayName || page.name || '').trim(),
    order: Number(page.order ?? 0),
    isActive: Boolean(page.isActive),
    visibility: Number(page.visibility ?? 0),
  }
}

function formatRefreshTimestamp(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  return normalized
}

export async function getPowerBiReportMetadata(company, reportKey = '') {
  const config = getPowerBiConfigFromCompany(company, reportKey)
  const accessToken = await getPowerBiAccessToken()

  const [reportPayload, pagesPayload] = await Promise.all([
    powerBiApiRequest(accessToken, `/groups/${config.workspaceId}/reports/${config.reportId}`),
    powerBiApiRequest(accessToken, `/groups/${config.workspaceId}/reports/${config.reportId}/pages`),
  ])

  return {
    accessToken,
    config,
    report: {
      id: reportPayload.id,
      name: reportPayload.name,
      embedUrl: reportPayload.embedUrl,
      webUrl: reportPayload.webUrl,
    },
    pages: Array.isArray(pagesPayload?.value)
      ? pagesPayload.value.map(normalizePowerBiPage).filter(page => page.name).sort((a, b) => a.order - b.order)
      : [],
  }
}

export async function getPowerBiCatalogMetadata(company) {
  const reports = getPowerBiReportCatalog(company)
  if (reports.length === 0) return []

  const accessToken = await getPowerBiAccessToken()

  return Promise.all(
    reports.map(async report => {
      const [reportPayload, pagesPayload, refreshPayload] = await Promise.all([
        report.workspaceId && report.reportId
          ? powerBiApiRequest(accessToken, `/groups/${report.workspaceId}/reports/${report.reportId}`)
          : Promise.resolve(null),
        report.workspaceId && report.reportId
          ? powerBiApiRequest(accessToken, `/groups/${report.workspaceId}/reports/${report.reportId}/pages`)
          : Promise.resolve({ value: [] }),
        report.workspaceId && report.datasetId
          ? powerBiApiRequest(accessToken, `/groups/${report.workspaceId}/datasets/${report.datasetId}/refreshes?$top=1`).catch(() => ({ value: [] }))
          : Promise.resolve({ value: [] }),
      ])

      const pages = Array.isArray(pagesPayload?.value)
        ? pagesPayload.value.map(normalizePowerBiPage).filter(isPowerBiNavigablePage).sort((a, b) => a.order - b.order)
        : []

      const latestRefresh = Array.isArray(refreshPayload?.value) ? refreshPayload.value[0] || null : null

      return {
        ...report,
        reportName: String(reportPayload?.name || report.label || '').trim(),
        embedUrl: String(reportPayload?.embedUrl || report.embedUrl || '').trim(),
        webUrl: String(reportPayload?.webUrl || '').trim(),
        pages,
        lastRefreshAt: formatRefreshTimestamp(
          latestRefresh?.endTime || latestRefresh?.startTime || latestRefresh?.requestTime || latestRefresh?.createdDateTime || ''
        ),
        lastRefreshStatus: String(latestRefresh?.status || '').trim(),
      }
    })
  )
}

function buildBasicFilterTarget(filter = {}) {
  return {
    table: String(filter.table || '').trim(),
    column: String(filter.column || '').trim(),
  }
}

function buildFilterValues(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean)
  }

  return String(value || '')
    .split(/[\n,;]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

export function buildPowerBiEmbedFilters(filters = []) {
  return filters
    .map(filter => {
      const target = buildBasicFilterTarget(filter)
      if (!target.table || !target.column) return null

      const operator = String(filter.operator || 'is').trim()
      const rawValue = String(filter.value || '').trim()
      if (!rawValue) return null

      if (operator === 'is' || operator === 'in') {
        const values = buildFilterValues(rawValue)
        if (values.length === 0) return null
        return {
          $schema: BASIC_FILTER_SCHEMA,
          target,
          filterType: 1,
          operator: 'In',
          values,
        }
      }

      if (operator === 'isNot') {
        const values = buildFilterValues(rawValue)
        if (values.length === 0) return null
        return {
          $schema: BASIC_FILTER_SCHEMA,
          target,
          filterType: 1,
          operator: 'NotIn',
          values,
        }
      }

      const operatorMap = {
        contains: 'Contains',
        notContains: 'DoesNotContain',
        startsWith: 'StartsWith',
        endsWith: 'EndsWith',
        greaterThan: 'GreaterThan',
        greaterThanOrEqual: 'GreaterThanOrEqual',
        lessThan: 'LessThan',
        lessThanOrEqual: 'LessThanOrEqual',
      }

      const mappedOperator = operatorMap[operator]
      if (!mappedOperator) return null

      return {
        $schema: ADVANCED_FILTER_SCHEMA,
        target,
        filterType: 0,
        logicalOperator: 'And',
        conditions: [
          {
            operator: mappedOperator,
            value: rawValue,
          },
        ],
      }
    })
    .filter(Boolean)
}

export async function generatePowerBiEmbedConfig(company, reportKey = '', filters = []) {
  const metadata = await getPowerBiReportMetadata(company, reportKey)
  const { config, accessToken, report, pages } = metadata

  const body = {
    accessLevel: 'View',
  }

  if (config.datasetId) {
    body.datasets = [{ id: config.datasetId }]
  }

  const tokenPayload = await powerBiApiRequest(accessToken, `/groups/${config.workspaceId}/reports/${config.reportId}/GenerateToken`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

  return {
    reportKey: config.id,
    reportId: report.id,
    reportName: config.label || report.name,
    embedUrl: report.embedUrl,
    embedToken: tokenPayload.token,
    tokenExpiration: tokenPayload.expiration,
    pages,
    filters: buildPowerBiEmbedFilters(filters),
  }
}
