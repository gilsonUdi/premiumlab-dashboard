import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getFirebaseAdminDb } from '@/lib/firebase-admin'
import { resolveAuthorizedCompany } from '@/lib/server-auth'

const FEEDBACK_COLLECTION = 'portalFeedback'

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

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant nao informado.' }, { status: 400 })
    }

    if (!message) {
      return NextResponse.json({ error: 'Digite sua solicitacao ou sugestao.' }, { status: 400 })
    }

    if (message.length > 3000) {
      return NextResponse.json({ error: 'Mensagem muito longa (maximo de 3000 caracteres).' }, { status: 400 })
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
      viewedByAdmin: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[company-feedback:post]', error)
    return NextResponse.json({ error: error?.message || 'Falha ao registrar sugestao.' }, { status: getErrorStatus(error) })
  }
}
