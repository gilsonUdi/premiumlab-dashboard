import crypto from 'crypto'

function normalizeRawEnv(value) {
  if (!value) return ''
  let normalized = String(value).trim()
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1)
  }
  return normalized.trim()
}

function decodeBase64OrUrlSafe(value) {
  const raw = normalizeRawEnv(value)
  if (!raw) return null

  const normalizedBase64 = raw.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalizedBase64.length % 4
  const withPadding = padding === 0 ? normalizedBase64 : normalizedBase64 + '='.repeat(4 - padding)

  try {
    return Buffer.from(withPadding, 'base64')
  } catch {
    return null
  }
}

function getVaultKey() {
  const rawHex = normalizeRawEnv(process.env.PASSWORD_VAULT_KEY_HEX)
  if (rawHex) {
    if (/^[a-fA-F0-9]{64}$/.test(rawHex)) {
      try {
        const keyBuffer = Buffer.from(rawHex, 'hex')
        if (keyBuffer.length === 32) return keyBuffer
      } catch {
        // ignore
      }
    }
    return null
  }

  const rawBase64 =
    normalizeRawEnv(process.env.PASSWORD_VAULT_KEY_BASE64) ||
    normalizeRawEnv(process.env.PASSWORD_VAULT_KEY)
  if (!rawBase64) return null

  const keyBuffer = decodeBase64OrUrlSafe(rawBase64)
  if (!keyBuffer || keyBuffer.length !== 32) return null
  return keyBuffer
}

export function isPasswordVaultEnabled() {
  return Boolean(getVaultKey())
}

export function encryptUserPassword(email, password) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const plainPassword = String(password || '')
  if (!normalizedEmail || !plainPassword) return null

  const key = getVaultKey()
  if (!key) return null

  try {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const payload = JSON.stringify({
      email: normalizedEmail,
      password: plainPassword,
      v: 1,
      createdAt: new Date().toISOString(),
    })

    const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()

    return {
      alg: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: encrypted.toString('base64'),
      emailHash: crypto.createHash('sha256').update(normalizedEmail).digest('hex'),
      updatedAt: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function decryptUserPassword(email, vault = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail || !vault?.data || !vault?.iv || !vault?.tag) return ''

  const key = getVaultKey()
  if (!key) return ''

  try {
    const expectedHash = crypto.createHash('sha256').update(normalizedEmail).digest('hex')
    if (vault.emailHash && vault.emailHash !== expectedHash) return ''

    const iv = Buffer.from(vault.iv, 'base64')
    const tag = Buffer.from(vault.tag, 'base64')
    const encrypted = Buffer.from(vault.data, 'base64')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)

    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    const parsed = JSON.parse(plain)
    if (String(parsed.email || '').trim().toLowerCase() !== normalizedEmail) return ''

    return String(parsed.password || '')
  } catch {
    return ''
  }
}
