const POWER_BI_SCOPE = 'https://analysis.windows.net/powerbi/api/.default'
const POWER_BI_API_BASE = 'https://api.powerbi.com/v1.0/myorg'

function requireEnv(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) {
    throw new Error(`Variavel ${name} nao configurada.`)
  }
  return value
}

export function getPowerBiConfigFromCompany(company = {}) {
  return {
    workspaceId: String(company.powerBiWorkspaceId || '').trim(),
    reportId: String(company.powerBiReportId || '').trim(),
    datasetId: String(company.powerBiDatasetId || '').trim(),
    label: String(company.powerBiLabel || '').trim(),
    enabled: company.powerBiEnabled === true,
  }
}

export function hasEmbeddedPowerBiConfig(company = {}) {
  const config = getPowerBiConfigFromCompany(company)
  return Boolean(config.enabled && config.workspaceId && config.reportId)
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

export async function getPowerBiReportMetadata(company) {
  const { workspaceId, reportId } = getPowerBiConfigFromCompany(company)
  const accessToken = await getPowerBiAccessToken()

  const [reportPayload, pagesPayload] = await Promise.all([
    powerBiApiRequest(accessToken, `/groups/${workspaceId}/reports/${reportId}`),
    powerBiApiRequest(accessToken, `/groups/${workspaceId}/reports/${reportId}/pages`),
  ])

  return {
    accessToken,
    report: {
      id: reportPayload.id,
      name: reportPayload.name,
      embedUrl: reportPayload.embedUrl,
      webUrl: reportPayload.webUrl,
    },
    pages: Array.isArray(pagesPayload?.value)
      ? pagesPayload.value
          .map(page => ({
            name: String(page.name || '').trim(),
            displayName: String(page.displayName || page.name || '').trim(),
            order: Number(page.order ?? 0),
            isActive: Boolean(page.isActive),
          }))
          .filter(page => page.name)
          .sort((a, b) => a.order - b.order)
      : [],
  }
}

export async function generatePowerBiEmbedConfig(company) {
  const config = getPowerBiConfigFromCompany(company)
  const { accessToken, report, pages } = await getPowerBiReportMetadata(company)

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
    reportId: report.id,
    reportName: report.name,
    embedUrl: report.embedUrl,
    embedToken: tokenPayload.token,
    tokenExpiration: tokenPayload.expiration,
    pages,
  }
}
