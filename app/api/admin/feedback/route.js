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
    const { searchParams } = new URL(request.url)
    const countOnly = searchParams.get('countOnly') === '1'
    const db = getFirebaseAdminDb()
    const snapshot = await db.collection(FEEDBACK_COLLECTION).orderBy('createdAt', 'desc').limit(500).get()

    const rows = snapshot.docs.map(document => ({ id: document.id, ...document.data() }))
    const newIds = rows.filter(row => String(row.status || 'new') === 'new').map(row => row.id)

    if (countOnly) {
      return NextResponse.json({ newCount: newIds.length })
    }

    if (newIds.length > 0) {
      const batch = db.batch()
      for (const id of newIds) {
        batch.update(db.collection(FEEDBACK_COLLECTION).doc(id), {
          status: 'lido',
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
        attachments: Array.isArray(row.attachments) ? row.attachments : [],
        status: String(row.status || (row.viewedByAdmin ? 'lido' : 'new')),
        viewedByAdmin: Boolean(row.viewedByAdmin),
        createdAt: normalizeTimestamp(row.createdAt),
        viewedAt: normalizeTimestamp(row.viewedAt),
      })),
    })
  } catch (error) {
    console.error('[admin-feedback:get]', error)
    return NextResponse.json({ error: error?.message || 'Falha ao carregar sugestões.' }, { status: getErrorStatus(error) })
  }
}

export async function PUT(request) {
  try {
    await requireAdmin(request)
    const payload = await request.json()
    const id = String(payload?.id || '').trim()
    const status = String(payload?.status || '').trim()
    const allowed = new Set(['lido', 'em_progresso', 'concluido'])

    if (!id) {
      return NextResponse.json({ error: 'ID da sugestão não informado.' }, { status: 400 })
    }
    if (!allowed.has(status)) {
      return NextResponse.json({ error: 'Status invalido.' }, { status: 400 })
    }

    const db = getFirebaseAdminDb()
    await db.collection(FEEDBACK_COLLECTION).doc(id).set(
      {
        status,
        viewedByAdmin: true,
        viewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[admin-feedback:put]', error)
    return NextResponse.json({ error: error?.message || 'Falha ao atualizar status.' }, { status: getErrorStatus(error) })
  }
}
