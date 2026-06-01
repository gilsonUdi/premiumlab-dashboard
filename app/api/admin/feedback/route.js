import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getFirebaseAdminDb } from '@/lib/firebase-admin'
import { requireAdmin } from '@/lib/server-auth'

const FEEDBACK_COLLECTION = 'portalFeedback'

function getErrorStatus(error) {
  const message = String(error?.message || '')
  if (message.includes('Nao autorizado')) return 401
  if (message.includes('Acesso administrativo necessario')) return 403
  return 500
}

function normalizeTimestamp(value) {
  if (!value) return null
  if (typeof value?.toDate === 'function') return value.toDate().toISOString()
  if (value?.seconds) return new Date(value.seconds * 1000).toISOString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export async function GET(request) {
  try {
    await requireAdmin(request)
    const db = getFirebaseAdminDb()
    const snapshot = await db.collection(FEEDBACK_COLLECTION).orderBy('createdAt', 'desc').limit(500).get()

    const rows = snapshot.docs.map(document => ({ id: document.id, ...document.data() }))
    const unreadIds = rows.filter(row => row.viewedByAdmin === false).map(row => row.id)

    if (unreadIds.length > 0) {
      const batch = db.batch()
      for (const id of unreadIds) {
        batch.update(db.collection(FEEDBACK_COLLECTION).doc(id), {
          viewedByAdmin: true,
          viewedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
      await batch.commit()
    }

    return NextResponse.json({
      feedback: rows.map(row => ({
        id: row.id,
        companyName: row.companyName || '',
        tenantSlug: row.tenantSlug || '',
        userName: row.userName || '',
        userEmail: row.userEmail || '',
        message: row.message || '',
        viewedByAdmin: Boolean(row.viewedByAdmin),
        createdAt: normalizeTimestamp(row.createdAt),
        viewedAt: normalizeTimestamp(row.viewedAt),
      })),
    })
  } catch (error) {
    console.error('[admin-feedback:get]', error)
    return NextResponse.json({ error: error?.message || 'Falha ao carregar sugestoes.' }, { status: getErrorStatus(error) })
  }
}
