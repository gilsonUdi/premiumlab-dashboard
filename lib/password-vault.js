import crypto from 'crypto'

function getVaultKey() {
  const raw = String(process.env.PASSWORD_VAULT_KEY || '').trim()
  if (!raw) {
    throw new Error('PASSWORD_VAULT_KEY nao configurada.')
  }

  let keyBuffer
  try {
    keyBuffer = Buffer.from(raw, 'base64')
  } catch {
    throw new Error('PASSWORD_VAULT_KEY invalida (base64).')
  }

  if (keyBuffer.length !== 32) {
    throw new Error('PASSWORD_VAULT_KEY deve ter 32 bytes em base64.')
  }

  return keyBuffer
}

export function encryptUserPassword(email, password) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const plainPassword = String(password || '')
  if (!normalizedEmail || !plainPassword) return null

  const key = getVaultKey()
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
}

export function decryptUserPassword(email, vault = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail || !vault?.data || !vault?.iv || !vault?.tag) return ''

  const expectedHash = crypto.createHash('sha256').update(normalizedEmail).digest('hex')
  if (vault.emailHash && vault.emailHash !== expectedHash) {
    throw new Error('Cofre de senha invalido para este usuario.')
  }

  const key = getVaultKey()
  const iv = Buffer.from(vault.iv, 'base64')
  const tag = Buffer.from(vault.tag, 'base64')
  const encrypted = Buffer.from(vault.data, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)

  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  const parsed = JSON.parse(plain)
  if (String(parsed.email || '').trim().toLowerCase() !== normalizedEmail) {
    throw new Error('Email do cofre nao confere.')
  }

  return String(parsed.password || '')
}
