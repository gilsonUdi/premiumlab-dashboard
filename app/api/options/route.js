import { NextResponse } from 'next/server'
import { createTenantSupabase } from '@/lib/supabase'
import { resolveAuthorizedCompany } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

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
    const supabase = await getTenantSupabase(request, tenantSlug)

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
    if (clienColumns.has('clicliente')) clientsQuery = clientsQuery.eq('clicliente', 'S')
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
      endcliQuery = supabase.from('endcli').select(endcliSelect).eq('endcodigo', 1).limit(5000)
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

    const clientZoneMap = new Map(
      (endcliRes.data || [])
        .filter(row => row?.clicodigo != null && row?.zocodigo != null)
        .map(row => [String(row.clicodigo), row.zocodigo])
    )
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

    return NextResponse.json({ cells, clients, clientGroups, zones, stages, employees, statuses }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    console.error('[options]', error)
    return NextResponse.json({ error: error.message }, { status: getErrorStatus(error), headers: NO_STORE_HEADERS })
  }
}
