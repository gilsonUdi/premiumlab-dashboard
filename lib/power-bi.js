const POWER_BI_SCOPE = 'https://analysis.windows.net/powerbi/api/.default'
const POWER_BI_API_BASE = 'https://api.powerbi.com/v1.0/myorg'

const HIDDEN_PAGE_VISIBILITY = 1
const TOOLTIP_PAGE_PATTERN = /tool\s*tip|tooltip/i

const BASIC_FILTER_SCHEMA = 'http://powerbi.com/product/schema#basic'
const ADVANCED_FILTER_SCHEMA = 'http://powerbi.com/product/schema#advanced'
const POWER_BI_SCAN_POLL_INTERVAL_MS = 1200
const POWER_BI_SCAN_POLL_MAX_ATTEMPTS = 10

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
  const effectiveIdentityUsername = String(report.effectiveIdentityUsername || report.powerBiEffectiveIdentityUsername || '').trim()
  const effectiveIdentityRoles = Array.isArray(report.effectiveIdentityRoles || report.rlsRoles)
    ? [...new Set((report.effectiveIdentityRoles || report.rlsRoles).map(role => String(role || '').trim()).filter(Boolean))]
    : String(report.effectiveIdentityRoles || report.rlsRoles || '')
        .split(',')
        .map(role => String(role || '').trim())
        .filter(Boolean)

  return {
    id,
    label: label || `Relatorio ${index + 1}`,
    workspaceId,
    reportId,
    datasetId,
    embedUrl,
    effectiveIdentityUsername,
    effectiveIdentityRoles,
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
      effectiveIdentityUsername: company.powerBiEffectiveIdentityUsername,
      effectiveIdentityRoles: company.powerBiEffectiveIdentityRoles,
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

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizePowerBiSchemaTable(table = {}) {
  const name = String(table.name || '').trim()
  const columns = Array.isArray(table.columns)
    ? table.columns
        .map(column => ({
          name: String(column.name || '').trim(),
          dataType: String(column.dataType || '').trim(),
          isHidden: Boolean(column.isHidden),
        }))
        .filter(column => column.name && !column.isHidden)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    : []

  return {
    name,
    isHidden: Boolean(table.isHidden),
    columns,
  }
}

async function getPowerBiDatasetSchema(accessToken, workspaceId, datasetId) {
  if (!workspaceId || !datasetId) return []

  try {
    const scanRequest = await powerBiApiRequest(
      accessToken,
      '/admin/workspaces/getInfo?datasetSchema=true',
      {
        method: 'POST',
        body: JSON.stringify({
          workspaces: [workspaceId],
        }),
      }
    )

    const scanId = String(scanRequest?.id || '').trim()
    if (!scanId) return []

    for (let attempt = 0; attempt < POWER_BI_SCAN_POLL_MAX_ATTEMPTS; attempt += 1) {
      await wait(POWER_BI_SCAN_POLL_INTERVAL_MS)

      const statusPayload = await powerBiApiRequest(accessToken, `/admin/workspaces/scanStatus/${scanId}`)
      const status = String(statusPayload?.status || '').trim().toLowerCase()

      if (status === 'succeeded') {
        const resultPayload = await powerBiApiRequest(accessToken, `/admin/workspaces/scanResult/${scanId}`)
        const workspaces = Array.isArray(resultPayload?.workspaces) ? resultPayload.workspaces : []
        const matchedWorkspace = workspaces.find(workspace => String(workspace.id || '').trim() === workspaceId)
        const datasets = Array.isArray(matchedWorkspace?.datasets) ? matchedWorkspace.datasets : []
        const matchedDataset = datasets.find(dataset => String(dataset.id || '').trim() === datasetId)
        const tables = Array.isArray(matchedDataset?.tables) ? matchedDataset.tables : []

        return tables
          .map(normalizePowerBiSchemaTable)
          .filter(table => table.name && !table.isHidden && table.columns.length > 0)
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      }

      if (status === 'failed') {
        return []
      }
    }
  } catch (error) {
    console.warn('[power-bi:schema-scan]', error?.message || error)
  }

  return []
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

export async function getPowerBiCatalogMetadata(company, options = {}) {
  const reports = getPowerBiReportCatalog(company)
  if (reports.length === 0) return []

  const accessToken = await getPowerBiAccessToken()
  const includeSchema = options.includeSchema === true

  return Promise.all(
    reports.map(async report => {
      const [reportPayload, pagesPayload, refreshPayload, tables] = await Promise.all([
        report.workspaceId && report.reportId
          ? powerBiApiRequest(accessToken, `/groups/${report.workspaceId}/reports/${report.reportId}`)
          : Promise.resolve(null),
        report.workspaceId && report.reportId
          ? powerBiApiRequest(accessToken, `/groups/${report.workspaceId}/reports/${report.reportId}/pages`)
          : Promise.resolve({ value: [] }),
        report.workspaceId && report.datasetId
          ? powerBiApiRequest(accessToken, `/groups/${report.workspaceId}/datasets/${report.datasetId}/refreshes?$top=1`).catch(() => ({ value: [] }))
          : Promise.resolve({ value: [] }),
        includeSchema && report.workspaceId && report.datasetId
          ? getPowerBiDatasetSchema(accessToken, report.workspaceId, report.datasetId)
          : Promise.resolve([]),
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
        tables,
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

function buildFilterValues(value, valueType = '') {
  if (Array.isArray(value)) {
    return value
      .map(item => normalizeFilterValue(item, valueType))
      .filter(item => item !== '' && item != null)
  }

  return String(value || '')
    .split(/[\n,;]+/)
    .map(item => normalizeFilterValue(item, valueType))
    .filter(item => item !== '' && item != null)
}

function normalizeFilterValue(value, valueType = '') {
  const text = String(value ?? '').trim()
  if (!text) return ''

  if (valueType === 'number') {
    const number = Number(text)
    return Number.isFinite(number) ? number : ''
  }

  return text
}

export function buildPowerBiEmbedFilters(filters = []) {
  const embedFilters = filters
    .map(filter => {
      const target = buildBasicFilterTarget(filter)
      if (!target.table || !target.column) return null

      const operator = String(filter.operator || 'is').trim()
      const rawValue = String(filter.value || '').trim()
      if (!rawValue) return null

      if (operator === 'is' || operator === 'in') {
        const values = buildFilterValues(rawValue, filter.valueType)
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
        const values = buildFilterValues(rawValue, filter.valueType)
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

  return embedFilters.reduce((mergedFilters, filter) => {
    if (filter.$schema !== BASIC_FILTER_SCHEMA) {
      mergedFilters.push(filter)
      return mergedFilters
    }

    const matchingFilter = mergedFilters.find(
      candidate =>
        candidate.$schema === BASIC_FILTER_SCHEMA &&
        candidate.operator === filter.operator &&
        candidate.target?.table === filter.target?.table &&
        candidate.target?.column === filter.target?.column
    )

    if (!matchingFilter) {
      mergedFilters.push(filter)
      return mergedFilters
    }

    const existingValues = new Set(
      matchingFilter.values.map(value => `${typeof value}:${JSON.stringify(value)}`)
    )

    filter.values.forEach(value => {
      const valueKey = `${typeof value}:${JSON.stringify(value)}`
      if (existingValues.has(valueKey)) return
      matchingFilter.values.push(value)
      existingValues.add(valueKey)
    })

    return mergedFilters
  }, [])
}

function shouldRetryWithEffectiveIdentity(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return message.includes('effective identity') || message.includes('effectiveidentity')
}

function buildEffectiveIdentity(config, identityContext = {}) {
  if (!config.datasetId) return null

  const username = String(
    config.effectiveIdentityUsername ||
      identityContext.email ||
      identityContext.username ||
      identityContext.companyEmail ||
      ''
  ).trim()

  if (!username) return null

  const identity = {
    username,
    datasets: [config.datasetId],
  }

  if (Array.isArray(config.effectiveIdentityRoles) && config.effectiveIdentityRoles.length > 0) {
    identity.roles = config.effectiveIdentityRoles
  }

  return identity
}

export async function generatePowerBiEmbedConfig(company, reportKey = '', filters = [], identityContext = {}) {
  const metadata = await getPowerBiReportMetadata(company, reportKey)
  const { config, accessToken, report, pages } = metadata

  const body = {
    accessLevel: 'View',
  }

  if (config.datasetId) {
    body.datasets = [{ id: config.datasetId }]
  }

  const generateTokenPath = `/groups/${config.workspaceId}/reports/${config.reportId}/GenerateToken`
  let tokenPayload

  try {
    tokenPayload = await powerBiApiRequest(accessToken, generateTokenPath, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  } catch (error) {
    const effectiveIdentity = buildEffectiveIdentity(config, {
      ...identityContext,
      companyEmail: company?.email,
      username: company?.email,
    })

    if (!shouldRetryWithEffectiveIdentity(error) || !effectiveIdentity) {
      throw error
    }

    tokenPayload = await powerBiApiRequest(accessToken, generateTokenPath, {
      method: 'POST',
      body: JSON.stringify({
        ...body,
        identities: [effectiveIdentity],
      }),
    })
  }

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
