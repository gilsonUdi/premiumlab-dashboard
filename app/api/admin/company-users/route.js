import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getFirebaseAdminAuth, getFirebaseAdminDb } from '@/lib/firebase-admin'
import { USERS_COLLECTION, requireAdmin } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

function getErrorStatus(error) {
  const message = String(error?.message || '')
  if (message.includes('Nao autorizado')) return 401
  if (message.includes('Acesso administrativo necessario')) return 403
  if (message.includes('nao encontrado')) return 404
  if (message.includes('ja cadastrado')) return 409
  return 500
}

function normalizePayload(payload = {}) {
  return {
    companyId: String(payload.companyId || '').trim(),
    companySlug: String(payload.companySlug || '').trim(),
    companyName: String(payload.companyName || '').trim(),
    email: String(payload.email || '').trim().toLowerCase(),
    password: String(payload.password || ''),
    name: String(payload.name || '').trim(),
  }
}

export async function POST(request) {
  try {
    await requireAdmin(request)
    const payload = normalizePayload(await request.json())

    if (!payload.companyId || !payload.companySlug || !payload.email || !payload.password || !payload.name) {
      return NextResponse.json({ error: 'Empresa, nome, email e senha sao obrigatorios.' }, { status: 400 })
    }

    const auth = getFirebaseAdminAuth()

    try {
      await auth.getUserByEmail(payload.email)
      return NextResponse.json({ error: 'Email ja cadastrado no Firebase Auth.' }, { status: 409 })
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error
    }

    const authUser = await auth.createUser({
      email: payload.email,
      password: payload.password,
      displayName: payload.name,
    })

    await getFirebaseAdminDb().collection(USERS_COLLECTION).doc(authUser.uid).set(
      {
        role: 'company',
        email: payload.email,
        name: payload.name,
        companyId: payload.companyId,
        companySlug: payload.companySlug,
        companyName: payload.companyName,
        active: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    return NextResponse.json({ ok: true, uid: authUser.uid })
  } catch (error) {
    console.error('[admin-company-users:post]', error)
    return NextResponse.json({ error: error.message || 'Falha ao criar usuario.' }, { status: getErrorStatus(error) })
  }
}
