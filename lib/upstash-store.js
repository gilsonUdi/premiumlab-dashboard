import crypto from 'crypto'

const DEFAULT_PREFIX = 'premium:premium-lab'
const ROW_FETCH_BATCH = 500

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

function normalizeColumnName(column) {
  return String(column || '').trim().toLowerCase()
}

function extractDateToken(value) {
  if (!value) return ''

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }

  const match = String(value).trim().match(/(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ''
}

function normalizeIntegerToken(value) {
  if (value == null) return ''

  const text = String(value).trim()
  if (!text) return ''

  if (/^\d+\.0+$/.test(text)) {
    return text.replace(/\.0+$/, '').replace(/^0+/, '') || '0'
  }

  const numeric = Number(text)
  if (Number.isFinite(numeric) && Number.isInteger(numeric)) {
    return String(numeric).replace(/^0+/, '') || '0'
  }

  return text.replace(/^0+/, '') || '0'
}

function normalizeIndexValue(value, mode = 'raw') {
  switch (String(mode || 'raw').trim().toLowerCase()) {
    case 'date':
      return extractDateToken(value)
    case 'number':
    case 'ordercode':
      return normalizeIntegerToken(value)
    default:
      return String(value ?? '').trim()
  }
}

function chunkArray(values, size) {
  const chunks = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

function daysBetween(dateStart, dateEnd) {
  const start = new Date(`${dateStart}T00:00:00`)
  const end = new Date(`${dateEnd}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return []

  const dates = []
  const cursor = new Date(start)
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
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

export async function getUpstashRowsByIds(table, ids) {
  const normalized = normalizeTableName(table)
  const meta = await getUpstashTableMeta(normalized)
  if (!meta || meta.storageMode !== 'hash-merge-buckets') return []

  const rowIds = [...new Set((ids || []).map(id => String(id)).filter(Boolean))]
  if (rowIds.length === 0) return []

  const bucketCount = Number(meta.bucketCount || 64)
  const key = tableKey(normalized)
  const rows = []

  for (const batch of chunkArray(rowIds, ROW_FETCH_BATCH)) {
    const commands = batch.map(id => ['HGET', `${key}:rows:${bucketIndex(id, bucketCount)}`, id])
    const batchRows = await upstashPipeline(commands)
    rows.push(...batchRows.map(row => parseJson(row, null)).filter(Boolean))
  }

  return rows
}

export async function getUpstashRowIdsByIndex(table, column, value, mode = 'raw') {
  const normalizedTable = normalizeTableName(table)
  const normalizedColumn = normalizeColumnName(column)
  const normalizedValue = normalizeIndexValue(value, mode)
  if (!normalizedValue) return []

  const key = tableKey(normalizedTable)
  const [ids] = await upstashPipeline([['SMEMBERS', `${key}:index:${normalizedColumn}:${normalizedValue}`]])
  return [...new Set((ids || []).map(id => String(id)).filter(Boolean))]
}

export async function getUpstashRowsByIndex(table, column, value, mode = 'raw') {
  const ids = await getUpstashRowIdsByIndex(table, column, value, mode)
  return getUpstashRowsByIds(table, ids)
}

export async function getUpstashRowsByDateRange(table, column, dateStart, dateEnd) {
  const dates = daysBetween(dateStart, dateEnd)
  if (dates.length === 0) return []

  const rowIds = new Set()
  for (const batch of chunkArray(dates, 31)) {
    const commands = batch.map(dateValue => ['SMEMBERS', `${tableKey(normalizeTableName(table))}:index:${normalizeColumnName(column)}:${dateValue}`])
    const results = await upstashPipeline(commands)
    for (const ids of results) {
      for (const id of ids || []) rowIds.add(String(id))
    }
  }

  return getUpstashRowsByIds(table, [...rowIds])
}
