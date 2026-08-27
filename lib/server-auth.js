import { getFirebaseAdminAuth, getFirebaseAdminDb } from '@/lib/firebase-admin'

const USERS_COLLECTION = 'users'
const COMPANIES_COLLECTION = 'companies'
const COMPANY_SECRETS_COLLECTION = 'companySecrets'
const ADMIN_PREVIEW_USER_HEADER = 'x-gs-admin-preview-user'

function getBearerToken(request) {
  const authorization = request.headers.get('authorization') || ''
  if (!authorization.startsWith('Bearer ')) {
    throw new Error('Nao autorizado.')
  }

  return authorization.slice('Bearer '.length)
}

export async function getRequestProfile(request) {
  const token = getBearerToken(request)
  const decoded = await getFirebaseAdminAuth().verifyIdToken(token)
  const snapshot = await getFirebaseAdminDb().collection(USERS_COLLECTION).doc(decoded.uid).get()
  if (!snapshot.exists) {
    throw new Error('Perfil do usuario nao encontrado.')
  }

  return {
    decoded,
    profile: snapshot.data(),
  }
}

export async function requireAdmin(request) {
  const { decoded, profile } = await getRequestProfile(request)
  if (profile.role !== 'admin') {
    throw new Error('Acesso administrativo necessario.')
  }

  return { decoded, profile }
}

export async function resolveAuthorizedCompany(request, tenantSlug) {
  const { decoded, profile } = await getRequestProfile(request)
  const requestedSlug = String(tenantSlug || '').trim()
  if (!requestedSlug) {
    throw new Error('Tenant nao informado.')
  }

  if (profile.role === 'company' && profile.companySlug !== requestedSlug) {
    throw new Error('Acesso negado a este tenant.')
  }

  const db = getFirebaseAdminDb()
  const companySnapshot = await db.collection(COMPANIES_COLLECTION).doc(requestedSlug).get()
  if (!companySnapshot.exists) {
    throw new Error('Empresa nao encontrada.')
  }

  const company = { id: companySnapshot.id, ...companySnapshot.data() }
  const secretSnapshot = await db.collection(COMPANY_SECRETS_COLLECTION).doc(company.id).get()
  const companySecrets = secretSnapshot.exists ? secretSnapshot.data() : {}
  let effectiveProfile = profile
  let previewUserId = ''

  if (profile.role === 'admin') {
    const requestedPreviewUserId = String(request.headers.get(ADMIN_PREVIEW_USER_HEADER) || '').trim()
    if (requestedPreviewUserId) {
      const previewSnapshot = await db.collection(USERS_COLLECTION).doc(requestedPreviewUserId).get()
      const previewProfile = previewSnapshot.exists ? previewSnapshot.data() : null

      if (
        previewProfile?.role === 'company' &&
        previewProfile.companySlug === requestedSlug &&
        previewProfile.companyId === company.id &&
        previewProfile.active !== false
      ) {
        previewUserId = previewSnapshot.id
        effectiveProfile = {
          ...previewProfile,
          role: 'company',
          adminPreview: true,
          adminUid: decoded.uid,
          previewUserId,
        }
      }
    }
  }

  return {
    decoded,
    profile: effectiveProfile,
    company,
    companySecrets,
    accessContext: {
      isAdminAccess: profile.role === 'admin',
      isAdminPreview: Boolean(previewUserId),
      adminUserId: profile.role === 'admin' ? decoded.uid : '',
      adminUserEmail: profile.role === 'admin' ? profile.email || decoded.email || '' : '',
      adminUserName: profile.role === 'admin' ? profile.name || profile.email || decoded.email || 'Administrador' : '',
      effectiveUserId: previewUserId || decoded.uid,
    },
  }
}

export { COMPANIES_COLLECTION, COMPANY_SECRETS_COLLECTION, USERS_COLLECTION }
