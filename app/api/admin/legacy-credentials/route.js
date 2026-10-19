import { NextResponse } from 'next/server'
import { getFirebaseAdminAuth, getFirebaseAdminDb } from '@/lib/firebase-admin'
import { requireAdmin } from '@/lib/server-auth'

const PREMIUM_COMPANY_ID = 'premium-lab'

async function authorizeCredentialManager(request, requireRecentLogin = false) {
  const { decoded, profile } = await requireAdmin(request)
  const bearer = String(request.headers.get('authorization') || '').slice('Bearer '.length)
  await getFirebaseAdminAuth().verifyIdToken(bearer, true)
  const allowedUid = String(process.env.PORTAL_CREDENTIALS_ADMIN_UID || '').trim()
  if (!allowedUid || decoded.uid !== allowedUid || profile.active === false) {
    throw new Error('Gestão de credenciais indisponível. Configure o UID do administrador no servidor.')
  }
  if (requireRecentLogin && Date.now() / 1000 - Number(decoded.auth_time || 0) > 600) {
    throw new Error('Entre novamente no portal antes de alterar credenciais.')
  }
  return { decoded, profile }
}

async function premiumAccount() {
  const db = getFirebaseAdminDb()
  const companySnapshot = await db.collection('companies').doc(PREMIUM_COMPANY_ID).get()
  if (!companySnapshot.exists) return null
  const company = companySnapshot.data()
  let authUser
  try {
    authUser = company.authUid ? await getFirebaseAdminAuth().getUser(company.authUid) : null
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error
  }
  if (!authUser && company.email) {
    try {
      authUser = await getFirebaseAdminAuth().getUserByEmail(company.email)
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error
    }
  }
  return { companySnapshot, authUser }
}

function responseError(error) {
  const message = String(error?.message || '')
  if (message.startsWith('Gestão de credenciais') || message.startsWith('Entre novamente') || message === 'Acesso administrativo necessario.' || message === 'Nao autorizado.') {
    return NextResponse.json({ error: message }, { status: 403 })
  }
  if (error.code === 'auth/id-token-revoked' || error.code === 'auth/id-token-expired') {
    return NextResponse.json({ error: 'Sessão expirada. Entre novamente no portal.' }, { status: 401 })
  }
  if (error.code?.startsWith('auth/')) {
    return NextResponse.json({ error: 'Não foi possível atualizar a conta no Firebase Authentication.' }, { status: 400 })
  }
  console.error('Falha na gestão de credenciais', error)
  return NextResponse.json({ error: 'Não foi possível concluir a operação.' }, { status: 500 })
}

export async function GET(request) {
  try {
    const { decoded } = await authorizeCredentialManager(request)
    const admin = await getFirebaseAdminAuth().getUser(decoded.uid)
    const premium = await premiumAccount()
    return NextResponse.json({
      adminEmailEditable: process.env.PORTAL_ALLOW_ADMIN_EMAIL_CHANGE === 'true',
      accounts: [
        { id: 'admin', label: 'Administrador', email: admin.email || '', available: true },
        { id: 'premium', label: 'Premium Lab', email: premium?.authUser?.email || premium?.companySnapshot?.data()?.email || '', available: Boolean(premium?.authUser) },
      ],
    })
  } catch (error) {
    return responseError(error)
  }
}

export async function PATCH(request) {
  try {
    const { decoded } = await authorizeCredentialManager(request, true)
    const body = await request.json()
    const target = String(body?.target || '')
    const email = String(body?.email || '').trim().toLowerCase()
    const password = String(body?.password || '')
    if (!['admin', 'premium'].includes(target) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 128) {
      return NextResponse.json({ error: 'Informe um e-mail válido e uma senha de 12 a 128 caracteres.' }, { status: 400 })
    }

    const auth = getFirebaseAdminAuth()
    const db = getFirebaseAdminDb()
    const premium = target === 'premium' ? await premiumAccount() : null
    if (target === 'premium' && !premium?.authUser) {
      return NextResponse.json({ error: 'Conta Premium não encontrada no Firebase Authentication.' }, { status: 404 })
    }
    const uid = target === 'admin' ? decoded.uid : premium.authUser.uid
    if (target === 'admin') {
      const currentAdmin = await auth.getUser(uid)
      if (currentAdmin.email?.toLowerCase() !== email && process.env.PORTAL_ALLOW_ADMIN_EMAIL_CHANGE !== 'true') {
        return NextResponse.json({ error: 'Publique e valide as novas regras do Firestore antes de alterar o e-mail administrativo.' }, { status: 409 })
      }
    }
    if (target === 'premium') {
      const profileSnapshot = await db.collection('users').doc(uid).get()
      if (!profileSnapshot.exists || profileSnapshot.data()?.role !== 'company' || profileSnapshot.data()?.companyId !== PREMIUM_COMPANY_ID) {
        return NextResponse.json({ error: 'O perfil da conta Premium precisa ser conferido antes da troca de credenciais.' }, { status: 409 })
      }
    }
    await auth.updateUser(uid, { email, password })

    const batch = db.batch()
    batch.update(db.collection('users').doc(uid), { email, updatedAt: new Date().toISOString() })
    if (target === 'premium') {
      batch.update(premium.companySnapshot.ref, { email, authUid: uid, updatedAt: new Date().toISOString() })
    }
    batch.create(db.collection('credentialChangeAudit').doc(), {
      actorUid: decoded.uid,
      targetUid: uid,
      target,
      email,
      changedAt: new Date().toISOString(),
    })
    try {
      await batch.commit()
    } catch (error) {
      console.error('Firebase Auth alterado, mas atualização dos metadados falhou', { target, uid, error })
      return NextResponse.json({ error: 'A conta foi alterada no Firebase Authentication, mas os metadados não foram atualizados. Não repita a troca antes de verificar o cadastro.' }, { status: 500 })
    }
    try {
      await auth.revokeRefreshTokens(uid)
    } catch (error) {
      console.error('Credenciais alteradas, mas revogação de sessões falhou', { target, uid, error })
      return NextResponse.json({ error: 'Credenciais atualizadas, mas não foi possível revogar as sessões antigas. Revogue-as no Firebase antes de considerar a troca concluída.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, email, requiresLogin: target === 'admin' })
  } catch (error) {
    return responseError(error)
  }
}
