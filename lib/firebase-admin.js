import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function getFirebaseAdminConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY
  const privateKey = normalizePrivateKey(rawPrivateKey)

  const missing = [
    !projectId && 'FIREBASE_PROJECT_ID ou NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    !clientEmail && 'FIREBASE_CLIENT_EMAIL',
    !privateKey && 'FIREBASE_PRIVATE_KEY',
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new Error(`Firebase Admin nao configurado. Variaveis faltando: ${missing.join(', ')}`)
  }

  return { projectId, clientEmail, privateKey }
}

function normalizePrivateKey(value) {
  if (!value) return ''

  let key = String(value).trim()

  // Alguns provedores salvam com aspas envolvendo todo o conteúdo
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1)
  }

  // Converte "\n" literal para quebra real de linha
  key = key.replace(/\\n/g, '\n')

  return key
}

function getFirebaseAdminApp() {
  if (getApps().length > 0) return getApp()

  const { projectId, clientEmail, privateKey } = getFirebaseAdminConfig()

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  })
}

export function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp())
}

export function getFirebaseAdminDb() {
  return getFirestore(getFirebaseAdminApp())
}
