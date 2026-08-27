import { FieldValue } from 'firebase-admin/firestore'
import { getFirebaseAdminDb } from '@/lib/firebase-admin'

export const PORTAL_ACTIVITY_COLLECTION = 'portalAccessEvents'

function clean(value, fallback = '') {
  return String(value || fallback).trim()
}

export async function recordPortalToolAccess({ profile, company, accessContext, toolKey, toolLabel }) {
  const normalizedToolKey = clean(toolKey).slice(0, 120)
  if (!normalizedToolKey) throw new Error('Ferramenta nao informada.')

  const db = getFirebaseAdminDb()
  await db.collection(PORTAL_ACTIVITY_COLLECTION).add({
    userId: clean(accessContext?.effectiveUserId),
    userName: clean(profile?.name, profile?.email || 'Usuario'),
    userEmail: clean(profile?.email),
    companyId: clean(company?.id),
    companySlug: clean(company?.slug),
    companyName: clean(company?.name),
    toolKey: normalizedToolKey,
    toolLabel: clean(toolLabel, normalizedToolKey).slice(0, 160),
    isAdminAccess: Boolean(accessContext?.isAdminAccess),
    isAdminPreview: Boolean(accessContext?.isAdminPreview),
    excludeFromUsageMetrics: Boolean(accessContext?.isAdminAccess),
    adminUserId: clean(accessContext?.adminUserId),
    adminUserName: clean(accessContext?.adminUserName),
    adminUserEmail: clean(accessContext?.adminUserEmail),
    accessedAt: FieldValue.serverTimestamp(),
  })
}
