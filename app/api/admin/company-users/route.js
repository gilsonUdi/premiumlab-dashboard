import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getFirebaseAdminAuth, getFirebaseAdminDb } from '@/lib/firebase-admin'
import { USERS_COLLECTION, requireAdmin } from '@/lib/server-auth'
import { normalizeCompanyPortalSettings, normalizeUserPermissions } from '@/lib/portal-config'
import { decryptUserPassword, encryptUserPassword, isPasswordVaultEnabled } from '@/lib/password-vault'

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
  const companySettings = normalizeCompanyPortalSettings(payload)
  return {
    uid: String(payload.uid || '').trim(),
    companyId: String(payload.companyId || '').trim(),
    companySlug: String(payload.companySlug || '').trim(),
    companyName: String(payload.companyName || '').trim(),
    externalDashboardUrl: String(payload.externalDashboardUrl || '').trim(),
    powerBiEnabled: companySettings.powerBiEnabled,
    powerBiEmbedUrl: String(payload.powerBiEmbedUrl || '').trim(),
    powerBiWorkspaceId: String(payload.powerBiWorkspaceId || '').trim(),
    powerBiReportId: String(payload.powerBiReportId || '').trim(),
    powerBiReports: Array.isArray(payload.powerBiReports) ? payload.powerBiReports : [],
    supabaseEnabled: companySettings.supabaseEnabled,
    email: String(payload.email || '').trim().toLowerCase(),
    password: String(payload.password || ''),
    name: String(payload.name || '').trim(),
    permissions: normalizeUserPermissions(payload.permissions, {
      id: payload.companyId,
      slug: payload.companySlug,
      name: payload.companyName,
      supabaseEnabled: companySettings.supabaseEnabled,
      externalDashboardUrl: payload.externalDashboardUrl,
      powerBiEnabled: companySettings.powerBiEnabled,
      powerBiEmbedUrl: payload.powerBiEmbedUrl,
      powerBiWorkspaceId: payload.powerBiWorkspaceId,
      powerBiReportId: payload.powerBiReportId,
      powerBiReports: payload.powerBiReports,
    }),
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

    const encryptedPasswordVault = encryptUserPassword(payload.email, payload.password)

    await getFirebaseAdminDb().collection(USERS_COLLECTION).doc(authUser.uid).set(
      {
        role: 'company',
        email: payload.email,
        name: payload.name,
        companyId: payload.companyId,
        companySlug: payload.companySlug,
        companyName: payload.companyName,
        permissions: payload.permissions,
        ...(encryptedPasswordVault ? { passwordVault: encryptedPasswordVault } : {}),
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

export async function PUT(request) {
  try {
    await requireAdmin(request)
    const payload = normalizePayload(await request.json())

    if (!payload.uid || !payload.companyId || !payload.companySlug || !payload.email || !payload.name) {
      return NextResponse.json({ error: 'Usuario, empresa, nome e email sao obrigatorios.' }, { status: 400 })
    }

    const auth = getFirebaseAdminAuth()
    const authUpdates = {
      email: payload.email,
      displayName: payload.name,
    }
    if (payload.password) authUpdates.password = payload.password
    await auth.updateUser(payload.uid, authUpdates)

    const profileUpdates = {
      email: payload.email,
      name: payload.name,
      companyId: payload.companyId,
      companySlug: payload.companySlug,
      companyName: payload.companyName,
      permissions: payload.permissions,
      active: true,
      updatedAt: FieldValue.serverTimestamp(),
    }
    if (payload.password) {
      const encrypted = encryptUserPassword(payload.email, payload.password)
      if (encrypted) profileUpdates.passwordVault = encrypted
    }

    await getFirebaseAdminDb().collection(USERS_COLLECTION).doc(payload.uid).set(profileUpdates, { merge: true })

    return NextResponse.json({ ok: true, uid: payload.uid })
  } catch (error) {
    console.error('[admin-company-users:put]', error)
    return NextResponse.json({ error: error.message || 'Falha ao atualizar usuario.' }, { status: getErrorStatus(error) })
  }
}

export async function PATCH(request) {
  try {
    await requireAdmin(request)
    if (!isPasswordVaultEnabled()) {
      return NextResponse.json({ error: 'Cofre de senha desabilitado neste ambiente.' }, { status: 503 })
    }

    const body = await request.json()
    const uid = String(body.uid || '').trim()
    const companyId = String(body.companyId || '').trim()

    if (!uid || !companyId) {
      return NextResponse.json({ error: 'Usuario nao informado.' }, { status: 400 })
    }

    const snapshot = await getFirebaseAdminDb().collection(USERS_COLLECTION).doc(uid).get()
    if (!snapshot.exists) {
      return NextResponse.json({ error: 'Usuario nao encontrado.' }, { status: 404 })
    }

    const user = snapshot.data()
    if (String(user.companyId || '') !== companyId) {
      return NextResponse.json({ error: 'Usuario nao pertence a esta empresa.' }, { status: 400 })
    }

    const password = decryptUserPassword(user.email, user.passwordVault)
    if (!password) {
      return NextResponse.json({ error: 'Senha nao disponivel para este usuario.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, password })
  } catch (error) {
    console.error('[admin-company-users:patch]', error)
    return NextResponse.json({ error: error.message || 'Falha ao revelar senha.' }, { status: getErrorStatus(error) })
  }
}

export async function DELETE(request) {
  try {
    await requireAdmin(request)
    const { searchParams } = new URL(request.url)
    const uid = String(searchParams.get('uid') || '').trim()
    const companyId = String(searchParams.get('companyId') || '').trim()

    if (!uid || !companyId) {
      return NextResponse.json({ error: 'Usuario nao informado.' }, { status: 400 })
    }

    const db = getFirebaseAdminDb()
    const snapshot = await db.collection(USERS_COLLECTION).doc(uid).get()

    if (!snapshot.exists) {
      return NextResponse.json({ error: 'Usuario nao encontrado.' }, { status: 404 })
    }

    const user = snapshot.data()
    if (user.companyId !== companyId) {
      return NextResponse.json({ error: 'Usuario nao pertence a esta empresa.' }, { status: 400 })
    }

    await db.collection(USERS_COLLECTION).doc(uid).delete()
    try {
      await getFirebaseAdminAuth().deleteUser(uid)
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[admin-company-users:delete]', error)
    return NextResponse.json({ error: error.message || 'Falha ao excluir usuario.' }, { status: getErrorStatus(error) })
  }
}
