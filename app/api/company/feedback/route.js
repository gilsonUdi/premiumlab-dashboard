import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getFirebaseAdminDb } from '@/lib/firebase-admin'
import { resolveAuthorizedCompany } from '@/lib/server-auth'

const FEEDBACK_COLLECTION = 'portalFeedback'
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
])

function normalizeAttachments(rawList) {
  if (!Array.isArray(rawList)) return []
  return rawList
    .map(item => ({
      name: String(item?.name || '').trim(),
      type: String(item?.type || '').trim().toLowerCase(),
      size: Number(item?.size) || 0,
      url: String(item?.url || '').trim(),
      path: String(item?.path || '').trim(),
    }))
    .filter(item => item.name && item.url)
}

function getErrorStatus(error) {
  const message = String(error?.message || '')
  if (message.includes('Nao autorizado')) return 401
  if (message.includes('Acesso negado')) return 403
  if (message.includes('nao encontrada')) return 404
  if (message.includes('Tenant nao informado')) return 400
  return 500
}

export async function POST(request) {
  try {
    const payload = await request.json()
    const tenant = String(payload?.tenant || '').trim()
    const message = String(payload?.message || '').trim()
    const attachments = normalizeAttachments(payload?.attachments)

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant não informado.' }, { status: 400 })
    }

    if (!message) {
      return NextResponse.json({ error: 'Digite sua solicitação ou sugestão.' }, { status: 400 })
    }

    if (message.length > 3000) {
      return NextResponse.json({ error: 'Mensagem muito longa (máximo de 3000 caracteres).' }, { status: 400 })
    }
    if (attachments.length > 4) {
      return NextResponse.json({ error: 'Anexe no máximo 4 arquivos por sugestão.' }, { status: 400 })
    }
    for (const file of attachments) {
      if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
        return NextResponse.json({ error: `Tipo de arquivo não permitido: ${file.name}` }, { status: 400 })
      }
      if (file.size <= 0 || file.size > 30 * 1024 * 1024) {
        return NextResponse.json({ error: `Arquivo fora do limite (30MB): ${file.name}` }, { status: 400 })
      }
      if (!/^https?:\/\//i.test(file.url)) {
        return NextResponse.json({ error: `URL invalida no anexo: ${file.name}` }, { status: 400 })
      }
    }

    const { decoded, profile, company } = await resolveAuthorizedCompany(request, tenant)
    const db = getFirebaseAdminDb()

    await db.collection(FEEDBACK_COLLECTION).add({
      tenantSlug: company.slug,
      companyId: company.id,
      companyName: company.name,
      userUid: decoded.uid,
      userEmail: String(profile?.email || decoded?.email || '').trim().toLowerCase(),
      userName: String(profile?.name || '').trim() || String(profile?.email || decoded?.email || '').trim().toLowerCase(),
      message,
      attachments,
      status: 'new',
      viewedByAdmin: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[company-feedback:post]', error)
    return NextResponse.json({ error: error?.message || 'Falha ao registrar sugestão.' }, { status: getErrorStatus(error) })
  }
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
    const { searchParams } = new URL(request.url)
    const tenant = String(searchParams.get('tenant') || '').trim()
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant não informado.' }, { status: 400 })
    }

    const { decoded, company } = await resolveAuthorizedCompany(request, tenant)
    const db = getFirebaseAdminDb()
    const snapshot = await db
      .collection(FEEDBACK_COLLECTION)
      .where('tenantSlug', '==', company.slug)
      .where('userUid', '==', decoded.uid)
      .limit(400)
      .get()

    const rows = snapshot.docs
      .map(document => ({ id: document.id, ...document.data() }))
      .sort((left, right) => {
        const leftTs = new Date(normalizeTimestamp(left.createdAt) || 0).getTime()
        const rightTs = new Date(normalizeTimestamp(right.createdAt) || 0).getTime()
        return rightTs - leftTs
      })
    return NextResponse.json({
      feedback: rows.map(row => ({
        id: row.id,
        message: row.message || '',
        attachments: Array.isArray(row.attachments) ? row.attachments : [],
        status: String(row.status || (row.viewedByAdmin ? 'lido' : 'new')),
        createdAt: normalizeTimestamp(row.createdAt),
        updatedAt: normalizeTimestamp(row.updatedAt),
      })),
    })
  } catch (error) {
    console.error('[company-feedback:get]', error)
    return NextResponse.json({ error: error?.message || 'Falha ao carregar histórico.' }, { status: getErrorStatus(error) })
  }
}
