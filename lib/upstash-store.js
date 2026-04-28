import crypto from 'crypto'

const DEFAULT_PREFIX = 'premium:premium-lab'

function cleanEnvValue(value) {
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

function getUpstashConfig() {
  const url = cleanEnvValue(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)
  const token = cleanEnvValue(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)

  if (!url || !token) {
    throw new Error('Upstash nao configurado. Defina UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN.')
  }

  return {
    url: url.replace(/\/+$/, ''),
    token,
    prefix: cleanEnvValue(process.env.UPSTASH_KEY_PREFIX || DEFAULT_PREFIX).replace(/:+$/, ''),
  }
}

async function upstashPipeline(commands) {
  if (commands.length === 0) return []

  const { url, token } = getUpstashConfig()
  const response = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
    cache: 'no-store',
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Upstash HTTP ${response.status}: ${text}`)
  }

  const payload = await response.json()
  for (const item of payload) {
    if (item?.error) throw new Error(`Upstash: ${item.error}`)
  }

  return payload.map(item => item.result)
}

function tableKey(table) {
  const { prefix } = getUpstashConfig()
  return `${prefix}:table:${table}`
}

function parseJson(value, fallback = null) {
  if (!value) return fallback
  try {
    return typeof value === 'string' ? JSON.parse(value) : value
  } catch {
    return fallback
  }
}

function normalizeTableName(table) {
  return String(table || '').trim().toLowerCase()
}

export async function getUpstashTableMeta(table) {
  const key = tableKey(normalizeTableName(table))
  const [meta] = await upstashPipeline([['GET', `${key}:meta`]])
  return parseJson(meta, null)
}

export async function getUpstashTable(table) {
  const normalized = normalizeTableName(table)
  const key = tableKey(normalized)
  const meta = await getUpstashTableMeta(normalized)
  if (!meta) return []

  if (meta.storageMode === 'hash-merge-buckets') {
    const bucketCount = Number(meta.bucketCount || 64)
    const commands = Array.from({ length: bucketCount }, (_, index) => ['HVALS', `${key}:rows:${index}`])
    const bucketValues = await upstashPipeline(commands)
    return bucketValues
      .flatMap(values => values || [])
      .map(value => parseJson(value, null))
      .filter(Boolean)
  }

  if (meta.storageMode === 'hash-merge') {
    const [values] = await upstashPipeline([['HVALS', `${key}:rows`]])
    return (values || []).map(value => parseJson(value, null)).filter(Boolean)
  }

  const chunkCount = Number(meta.chunkCount || 0)
  const commands = Array.from({ length: chunkCount }, (_, index) => ['GET', `${key}:chunk:${index}`])
  const chunks = await upstashPipeline(commands)
  return chunks.flatMap(chunk => parseJson(chunk, []) || [])
}

export async function getUpstashTables(tables) {
  const entries = await Promise.all(tables.map(async table => [normalizeTableName(table), await getUpstashTable(table)]))
  return Object.fromEntries(entries)
}

function bucketIndex(identity, bucketCount) {
  const digest = crypto.createHash('sha1').update(String(identity)).digest('hex')
  return parseInt(digest.slice(0, 8), 16) % bucketCount
}

export async function getUpstashRowsByIndex(table, column, value) {
  const normalized = normalizeTableName(table)
  if (value == null || value === '') return []

  const key = tableKey(normalized)
  const meta = await getUpstashTableMeta(normalized)
  if (!meta || meta.storageMode !== 'hash-merge-buckets') return []

  const [ids] = await upstashPipeline([['SMEMBERS', `${key}:index:${column}:${value}`]])
  const rowIds = ids || []
  if (rowIds.length === 0) return []

  const bucketCount = Number(meta.bucketCount || 64)
  const commands = rowIds.map(id => ['HGET', `${key}:rows:${bucketIndex(id, bucketCount)}`, id])
  const rows = await upstashPipeline(commands)
  return rows.map(row => parseJson(row, null)).filter(Boolean)
}
