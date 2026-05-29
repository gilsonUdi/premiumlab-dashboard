import { NextResponse } from 'next/server'
import { createTenantSupabase } from '@/lib/supabase'
import { resolveAuthorizedCompany } from '@/lib/server-auth'
import { getCompanyDashboardFeedingModel } from '@/lib/portal-config'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
}

function getErrorStatus(error) {
  const message = String(error?.message || '')
  if (message.includes('Nao autorizado')) return 401
  if (message.includes('Acesso negado')) return 403
  if (message.includes('nao encontrada')) return 404
  return 500
}

function countEncodingArtifacts(text) {
  if (!text) return 0
  const matches = text.match(/[�ÃÂ]/g)
  return matches ? matches.length : 0
}

function normalizeText(value) {
  if (value == null) return ''

  const original = String(value).trim()
  if (!original) return ''

  let best = original

  try {
    const repaired = Buffer.from(original, 'latin1').toString('utf8').trim()
    const repairedLooksBetter =
      repaired &&
      countEncodingArtifacts(repaired) < countEncodingArtifacts(best) &&
      /[A-Za-zÀ-ÿ]/.test(repaired)

    if (repairedLooksBetter) best = repaired
  } catch {
    // ignore best-effort decoding failures
  }

  return best.replace(/\uFFFD/g, '').trim()
}

function cleanConfigValue(value) {
  let text = String(value || '').trim()
  if (!text) return ''

  while (true) {
    const next = text
      .replace(/^\\?"/, '')
      .replace(/\\?"$/, '')
      .replace(/^\\?'/, '')
      .replace(/\\?'$/, '')
      .trim()

    if (next === text) break
    text = next
  }

  return text
}

function resolveSupabaseConfig(company, companySecrets) {
  const url = cleanConfigValue(
    companySecrets?.supabaseUrl ||
      companySecrets?.supabase_url ||
      company?.supabaseUrl ||
      company?.supabase_url ||
      (company?.isPremiumLab ? process.env.SUPABASE_URL : '')
  )

  const serviceRoleKey = cleanConfigValue(
    companySecrets?.supabaseServiceRoleKey ||
      companySecrets?.serviceRoleKey ||
      companySecrets?.supabase_service_role_key ||
      company?.supabaseServiceRoleKey ||
      company?.serviceRoleKey ||
      company?.supabase_service_role_key ||
      (company?.isPremiumLab ? process.env.SUPABASE_SERVICE_ROLE_KEY : '')
  )

  return { url, serviceRoleKey }
}

async function getTenantSupabase(request, tenantSlug) {
  const { company, companySecrets } = await resolveAuthorizedCompany(request, tenantSlug)
  const { url: supabaseUrl, serviceRoleKey: supabaseServiceRoleKey } = resolveSupabaseConfig(company, companySecrets)

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(`Supabase nao configurado para o tenant ${company.slug}.`)
  }

  return createTenantSupabase(supabaseUrl, supabaseServiceRoleKey)
}

function uniqueBy(items, keySelector) {
  const seen = new Set()
  const result = []
  for (const item of items) {
    const key = keySelector(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

function normalizeTenantCandidate(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function resolveApiCacheTenantSlug(supabase, company) {
  const { data, error } = await supabase
    .from('gradual_cache_orders')
    .select('tenant_slug')
    .order('tenant_slug', { ascending: true })
    .limit(2000)

  if (error) throw new Error(`gradual_cache_orders: ${error.message}`)

  const available = [...new Set((data || []).map(row => String(row.tenant_slug || '').trim()).filter(Boolean))]
  if (available.length === 0) return ''

  const candidates = [
    company?.dashboardApiCacheTenantSlug,
    company?.apiCacheTenantSlug,
    company?.slug,
    company?.id,
    company?.name,
  ].map(normalizeTenantCandidate).filter(Boolean)

  const byNormalized = new Map(available.map(value => [normalizeTenantCandidate(value), value]))
  for (const candidate of candidates) {
    const found = byNormalized.get(candidate)
    if (found) return found
  }

  return available.length === 1 ? available[0] : ''
}

function asSqlDate(value, fallback) {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback
}

function pickPayloadValue(payload = {}, ...paths) {
  for (const path of paths) {
    const parts = String(path).split('.')
    let current = payload
    for (const part of parts) {
      current = current?.[part]
      if (current == null) break
    }
    if (current != null && String(current).trim() !== '') return current
  }
  return null
}

async function buildApiCacheOptions(supabase, company, searchParams) {
  const tenantSlug = await resolveApiCacheTenantSlug(supabase, company)
  if (!tenantSlug) {
    return { cells: [], clients: [], clientGroups: [], zones: [], stages: [], employees: [], statuses: [], supabaseTables: [] }
  }

  const fallbackEnd = new Date().toISOString().slice(0, 10)
  const fallbackStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const dateStart = asSqlDate(searchParams.get('dateStart'), fallbackStart)
  const dateEnd = asSqlDate(searchParams.get('dateEnd'), fallbackEnd)

  const [ordersRes, eventsRes] = await Promise.all([
    supabase
      .from('gradual_cache_orders')
      .select('order_id,payload,issue_date')
      .eq('tenant_slug', tenantSlug)
      .gte('issue_date', dateStart)
      .lte('issue_date', dateEnd)
      .limit(5000),
    supabase
      .from('gradual_cache_events')
      .select('payload,event_type')
      .eq('tenant_slug', tenantSlug)
      .limit(10000),
  ])

  if (ordersRes.error) throw new Error(`gradual_cache_orders: ${ordersRes.error.message}`)
  if (eventsRes.error) throw new Error(`gradual_cache_events: ${eventsRes.error.message}`)

  const orders = ordersRes.data || []
  const events = eventsRes.data || []

  const clients = uniqueBy(
    orders.map(row => {
      const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
      const clicodigo = String(pickPayloadValue(payload, 'customerId', 'clicodigo') || '').trim()
      const label = normalizeText(pickPayloadValue(payload, 'customerName', 'clinome') || (clicodigo ? `Cliente ${clicodigo}` : ''))
      return {
        clicodigo,
        label,
        razaoSocial: label,
        gclcodigo: pickPayloadValue(payload, 'gclcodigo', 'customerGroupId') || null,
        zocodigo: pickPayloadValue(payload, 'zocodigo') || null,
      }
    }).filter(client => client.clicodigo),
    client => client.clicodigo
  )

  const groupCodeSet = new Set(clients.map(client => client.gclcodigo).filter(Boolean))
  const clientGroups = [...groupCodeSet]
    .map(code => ({ value: code, label: `Grupo ${code}` }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label), 'pt-BR'))

  const zoneCodeSet = new Set(clients.map(client => client.zocodigo).filter(Boolean))
  const zones = [...zoneCodeSet]
    .map(code => ({ value: code, label: `Zona ${code}` }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label), 'pt-BR'))

  const cells = uniqueBy(
    [
      ...orders.map(row => {
        const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
        const value = String(pickPayloadValue(payload, 'currentCell', 'currentLocation') || '').trim()
        return { value, label: normalizeText(value) }
      }),
      ...events.map(row => {
        const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
        const value = String(pickPayloadValue(payload, 'warehouseDescription', 'locationDescription', 'location', 'currentCell') || '').trim()
        return { value, label: normalizeText(value) }
      }),
    ].filter(cell => cell.value),
    cell => cell.value
  )

  const stages = uniqueBy(
    events.map(row => {
      const payload = row.payload && typeof row.payload === 'object' ? row.payload : {}
      const value = String(pickPayloadValue(payload, 'locationCode', 'warehouseCode', 'code') || '').trim()
      const label = normalizeText(pickPayloadValue(payload, 'locationDescription', 'warehouseDescription', 'currentCell') || value)
      return { value: value || label, label, isFinal: false, isStart: false }
    }).filter(stage => stage.value),
    stage => stage.value
  )

  const employees = []
  const statuses = [
    { value: 'in_progress', label: 'Em Producao' },
    { value: 'delayed', label: 'Em Producao (atraso)' },
    { value: 'completed', label: 'Concluido' },
    { value: 'delayed_completed', label: 'Entregue (atraso)' },
    { value: 'pending', label: 'Aguardando' },
  ]

  return { cells, clients, clientGroups, zones, stages, employees, statuses, supabaseTables: [] }
}

async function execSql(supabase, sql) {
  const compactSql = sql.replace(/\s+/g, ' ').trim()
  const { data, error } = await supabase.rpc('exec_sql', { sql: compactSql })
  if (error) throw new Error(`exec_sql: ${error.message}`)
  return data || []
}

async function getTableColumns(supabase, tableName) {
  const rows = await execSql(
    supabase,
    `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = '${String(tableName || '').replace(/'/g, "''")}'
      order by ordinal_position
    `
  )

  return new Set(
    rows
      .map(row => String(row.column_name || '').trim().toLowerCase())
      .filter(Boolean)
  )
}

function pickFirstAvailable(columns, candidates) {
  for (const candidate of candidates) {
    if (columns.has(candidate)) return candidate
  }
  return null
}

function buildSelect(columns, candidates) {
  return candidates.filter(column => columns.has(column)).join(', ')
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const tenantSlug = searchParams.get('tenant') || ''
    const { company } = await resolveAuthorizedCompany(request, tenantSlug)

    const supabase = await getTenantSupabase(request, tenantSlug)
    if (getCompanyDashboardFeedingModel(company) === 'api_cache') {
      const options = await buildApiCacheOptions(supabase, company, searchParams)
      return NextResponse.json(options, { headers: NO_STORE_HEADERS })
    }

    const allTablesRows = await execSql(
      supabase,
      `select table_name, column_name
       from information_schema.columns
       where table_schema = 'public'
       order by table_name, ordinal_position`
    ).catch(() => [])

    const supabaseTablesMap = {}
    for (const row of allTablesRows) {
      const tbl = String(row.table_name || '').trim()
      const col = String(row.column_name || '').trim()
      if (!tbl || !col) continue
      if (!supabaseTablesMap[tbl]) supabaseTablesMap[tbl] = []
      supabaseTablesMap[tbl].push(col)
    }
    const supabaseTables = Object.entries(supabaseTablesMap).map(([name, columns]) => ({ name, columns }))

    const [almoxColumns, clienColumns, localPedColumns, funcioColumns, grupocliColumns, endcliColumns, zonaColumns] = await Promise.all([
      getTableColumns(supabase, 'almox'),
      getTableColumns(supabase, 'clien'),
      getTableColumns(supabase, 'localped'),
      getTableColumns(supabase, 'funcio'),
      getTableColumns(supabase, 'grupocli'),
      getTableColumns(supabase, 'endcli'),
      getTableColumns(supabase, 'zona'),
    ])

    const almoxOrderColumn = pickFirstAvailable(almoxColumns, ['alxordem', 'alxcodigo'])
    const clienLabelOrderColumn = pickFirstAvailable(clienColumns, ['clirazsocial', 'clinomefant', 'clicodigo'])
    const localPedOrderColumn = pickFirstAvailable(localPedColumns, ['lpordem', 'lpcodigo'])
    const funcioOrderColumn = pickFirstAvailable(funcioColumns, ['funnome', 'funcodigo'])
    const grupocliOrderColumn = pickFirstAvailable(grupocliColumns, ['nome_grupo', 'cod_grupo'])

    const clienSelect = buildSelect(clienColumns, ['clicodigo', 'clirazsocial', 'clinomefant', 'gclcodigo', 'clicliente'])
    const almoxSelect = buildSelect(almoxColumns, ['alxcodigo', 'alxdescricao', 'dptcodigo', 'alxperda'])
    const localPedSelect = buildSelect(localPedColumns, ['lpcodigo', 'lpdescricao', 'lpfimprocesso', 'lpiniprocesso'])
    const funcioSelect = buildSelect(funcioColumns, ['funcodigo', 'funnome'])
    const grupocliSelect = buildSelect(grupocliColumns, ['cod_grupo', 'nome_grupo'])
    const endcliSelect = buildSelect(endcliColumns, ['clicodigo', 'endcodigo', 'zocodigo'])
    const zonaSelect = buildSelect(zonaColumns, ['zocodigo', 'zodescricao'])

    let cellsQuery = supabase.from('almox').select(almoxSelect)
    if (almoxOrderColumn) cellsQuery = cellsQuery.order(almoxOrderColumn)

    let clientsQuery = supabase.from('clien').select(clienSelect).limit(500)
    if (clienLabelOrderColumn) clientsQuery = clientsQuery.order(clienLabelOrderColumn)

    let localPedQuery = supabase.from('localped').select(localPedSelect)
    if (localPedOrderColumn) localPedQuery = localPedQuery.order(localPedOrderColumn)

    let employeesQuery = supabase.from('funcio').select(funcioSelect).limit(200)
    if (funcioOrderColumn) employeesQuery = employeesQuery.order(funcioOrderColumn)

    let grupocliQuery = null
    if (grupocliSelect) {
      grupocliQuery = supabase.from('grupocli').select(grupocliSelect)
      if (grupocliOrderColumn) grupocliQuery = grupocliQuery.order(grupocliOrderColumn)
    }

    let endcliQuery = null
    if (endcliSelect && endcliColumns.has('clicodigo') && endcliColumns.has('endcodigo') && endcliColumns.has('zocodigo')) {
      endcliQuery = supabase.from('endcli').select(endcliSelect).order('endcodigo').limit(5000)
    }

    let zonaQuery = null
    if (zonaSelect) {
      zonaQuery = supabase.from('zona').select(zonaSelect).order('zocodigo')
    }

    const [cellsRes, clientsRes, localPedRes, empRes, grupocliRes, endcliRes, zonaRes] = await Promise.all([
      cellsQuery,
      clientsQuery,
      localPedQuery,
      employeesQuery,
      grupocliQuery || Promise.resolve({ data: [], error: null }),
      endcliQuery || Promise.resolve({ data: [], error: null }),
      zonaQuery || Promise.resolve({ data: [], error: null }),
    ])

    const cells = (cellsRes.data || []).map(cell => ({
      value: cell.dptcodigo ?? cell.alxcodigo,
      label: normalizeText(cell.alxdescricao),
      alxcodigo: cell.alxcodigo,
      alxperda: cell.alxperda,
    }))

    const clientZoneMap = new Map()
    for (const row of endcliRes.data || []) {
      if (row?.clicodigo == null || row?.zocodigo == null) continue
      const clientKey = String(row.clicodigo)
      if (!clientZoneMap.has(clientKey)) clientZoneMap.set(clientKey, row.zocodigo)
    }
    const zonaNameMap = new Map(
      (zonaRes.data || [])
        .filter(row => row?.zocodigo != null)
        .map(row => [String(row.zocodigo), normalizeText(row.zodescricao)])
    )

    const clients = (clientsRes.data || []).map(client => ({
      clicodigo: client.clicodigo,
      label: normalizeText(client.clinomefant || client.clirazsocial),
      razaoSocial: normalizeText(client.clirazsocial),
      gclcodigo: client.gclcodigo,
      zocodigo: clientZoneMap.get(String(client.clicodigo)) ?? null,
    }))

    const groupCodeSet = new Set((clientsRes.data || []).map(row => row.gclcodigo).filter(value => value != null && value !== ''))
    const groupNameMap = new Map(
      (grupocliRes.data || [])
        .filter(group => group?.cod_grupo != null)
        .map(group => [String(group.cod_grupo), normalizeText(group.nome_grupo)])
    )
    const clientGroups = [...groupCodeSet]
      .map(groupCode => ({
        value: groupCode,
        label: groupNameMap.get(String(groupCode)) || `Grupo ${groupCode}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))

    const zoneCodeSet = new Set(clients.map(client => client.zocodigo).filter(value => value != null && value !== ''))
    const zones = [...zoneCodeSet]
      .map(zoneCode => ({
        value: zoneCode,
        label: zonaNameMap.get(String(zoneCode)) || `Zona ${zoneCode}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))

    const stages = (localPedRes.data || []).map(stage => ({
      value: stage.lpcodigo,
      label: normalizeText(stage.lpdescricao),
      isFinal: stage.lpfimprocesso === 'S',
      isStart: stage.lpiniprocesso === 'S',
    }))

    const employees = (empRes.data || [])
      .filter(employee => !normalizeText(employee.funnome).includes('INATIVO'))
      .map(employee => ({ value: employee.funcodigo, label: normalizeText(employee.funnome || employee.funcodigo) }))

    const statuses = [
      { value: 'in_progress', label: 'Em Producao' },
      { value: 'delayed', label: 'Em Producao (atraso)' },
      { value: 'completed', label: 'Concluido' },
      { value: 'delayed_completed', label: 'Entregue (atraso)' },
      { value: 'pending', label: 'Aguardando' },
    ]

    return NextResponse.json({ cells, clients, clientGroups, zones, stages, employees, statuses, supabaseTables }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    console.error('[options]', error)
    return NextResponse.json({ error: error.message }, { status: getErrorStatus(error), headers: NO_STORE_HEADERS })
  }
}
