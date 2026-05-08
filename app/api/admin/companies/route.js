import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getFirebaseAdminAuth, getFirebaseAdminDb } from '@/lib/firebase-admin'
import {
  COMPANIES_COLLECTION,
  COMPANY_SECRETS_COLLECTION,
  USERS_COLLECTION,
  requireAdmin,
} from '@/lib/server-auth'
import {
  buildDefaultUserPermissions,
  normalizeCompanyPortalSettings,
  normalizeUserPermissions,
  PORTAL_PAGE_KEYS,
} from '@/lib/portal-config'

export const dynamic = 'force-dynamic'

function getErrorStatus(error) {
  const message = String(error?.message || '')
  if (message.includes('Nao autorizado')) return 401
  if (message.includes('Acesso administrativo necessario')) return 403
  if (message.includes('nao encontrada')) return 404
  return 500
}

function slugifyCompanyName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

function normalizeCompanyPayload(payload = {}) {
  const slug = slugifyCompanyName(payload.slug || payload.name || payload.id)
  const portalSettings = normalizeCompanyPortalSettings(payload)

  return {
    id: payload.id || slug,
    name: String(payload.name || 'Empresa').trim(),
    slug,
    email: String(payload.email || '').trim().toLowerCase(),
    password: String(payload.password || ''),
    supabaseUrl: String(payload.supabaseUrl || '').trim(),
    supabaseLabel: String(payload.supabaseLabel || '').trim(),
    supabaseServiceRoleKey: String(payload.supabaseServiceRoleKey || '').trim(),
    tools: Array.isArray(payload.tools) && payload.tools.length > 0 ? [...new Set(payload.tools)] : ['dashboard'],
    isPremiumLab: Boolean(payload.isPremiumLab),
    dashboardMode: payload.dashboardMode || (payload.isPremiumLab ? 'premium' : 'external'),
    supabaseEnabled: portalSettings.supabaseEnabled,
    externalDashboardUrl: portalSettings.externalDashboardUrl,
    powerBiEnabled: portalSettings.powerBiEnabled,
    powerBiEmbedUrl: portalSettings.powerBiEmbedUrl,
    powerBiLabel: portalSettings.powerBiLabel,
    createdAt: payload.createdAt || new Date().toISOString(),
  }
}

async function upsertAuthUser(company, existingCompany) {
  const auth = getFirebaseAdminAuth()
  const authPayload = {
    email: company.email,
    displayName: company.name,
  }
  if (company.password) authPayload.password = company.password

  if (existingCompany?.authUid) {
    return auth.updateUser(existingCompany.authUid, authPayload)
  }

  try {
    const existingAuthUser = await auth.getUserByEmail(company.email)
    return auth.updateUser(existingAuthUser.uid, authPayload)
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error

    return auth.createUser({
      email: company.email,
      password: company.password,
      displayName: company.name,
    })
  }
}

function getPremiumFallbackSecret(company) {
  if (!company.isPremiumLab && company.slug !== 'premium-lab') return ''
  return process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function getPremiumFallbackUrl(company) {
  if (!company.isPremiumLab && company.slug !== 'premium-lab') return ''
  return process.env.SUPABASE_URL || ''
}

export async function POST(request) {
  try {
    await requireAdmin(request)
    const payload = await request.json()
    const company = normalizeCompanyPayload(payload)

    if (!company.name || !company.slug || !company.email) {
      return NextResponse.json({ error: 'Nome, slug e email sao obrigatorios.' }, { status: 400 })
    }

    const db = getFirebaseAdminDb()
    const companyRef = db.collection(COMPANIES_COLLECTION).doc(company.id)
    const existingSnapshot = await companyRef.get()
    const existingCompany = existingSnapshot.exists ? { id: existingSnapshot.id, ...existingSnapshot.data() } : null
    if (!existingCompany && !company.password) {
      return NextResponse.json({ error: 'Senha obrigatoria para novas empresas.' }, { status: 400 })
    }
    const authUser = await upsertAuthUser(company, existingCompany)
    const mainUserRef = db.collection(USERS_COLLECTION).doc(authUser.uid)
    const mainUserSnapshot = await mainUserRef.get()

    const supabaseUrl = company.supabaseUrl || existingCompany?.supabaseUrl || getPremiumFallbackUrl(company)
    const supabaseServiceRoleKey =
      company.supabaseServiceRoleKey ||
      (await db.collection(COMPANY_SECRETS_COLLECTION).doc(company.id).get()).data()?.supabaseServiceRoleKey ||
      getPremiumFallbackSecret(company)

    await companyRef.set(
      {
        id: company.id,
        name: company.name,
        slug: company.slug,
        email: company.email,
        supabaseUrl,
        supabaseLabel: company.supabaseLabel || existingCompany?.supabaseLabel || '',
        tools: company.tools,
        isPremiumLab: company.isPremiumLab,
        dashboardMode: company.dashboardMode,
        supabaseEnabled: company.supabaseEnabled,
        externalDashboardUrl: company.externalDashboardUrl,
        powerBiEnabled: company.powerBiEnabled,
        powerBiEmbedUrl: company.powerBiEmbedUrl,
        powerBiLabel: company.powerBiLabel,
        authUid: authUser.uid,
        hasServiceRoleKey: Boolean(supabaseServiceRoleKey),
        createdAt: existingCompany?.createdAt || company.createdAt,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    const ownerPermissions = normalizeUserPermissions(
      mainUserSnapshot.exists ? mainUserSnapshot.data()?.permissions || buildDefaultUserPermissions(company) : buildDefaultUserPermissions(company),
      company
    )

    ownerPermissions.pages[PORTAL_PAGE_KEYS.ANALYSIS] = company.supabaseEnabled
    ownerPermissions.pages[PORTAL_PAGE_KEYS.PPS] = company.supabaseEnabled
    ownerPermissions.pages[PORTAL_PAGE_KEYS.EXTERNAL_DASHBOARD] =
      !company.supabaseEnabled && Boolean(company.externalDashboardUrl)
    ownerPermissions.pages[PORTAL_PAGE_KEYS.POWER_BI] = company.powerBiEnabled && Boolean(company.powerBiEmbedUrl)

    await mainUserRef.set(
      {
        role: 'company',
        email: company.email,
        name: company.name,
        companyId: company.id,
        companySlug: company.slug,
        companyName: company.name,
        permissions: ownerPermissions,
        active: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    if (supabaseUrl || supabaseServiceRoleKey) {
      await db.collection(COMPANY_SECRETS_COLLECTION).doc(company.id).set(
        {
          supabaseUrl,
          supabaseServiceRoleKey,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    }

    return NextResponse.json({ ok: true, companyId: company.id })
  } catch (error) {
    console.error('[admin-companies:post]', error)
    return NextResponse.json({ error: error.message || 'Falha ao salvar empresa.' }, { status: getErrorStatus(error) })
  }
}

export async function DELETE(request) {
  try {
    await requireAdmin(request)
    const { searchParams } = new URL(request.url)
    const companyId = String(searchParams.get('id') || '').trim()
    if (!companyId) {
      return NextResponse.json({ error: 'Empresa nao informada.' }, { status: 400 })
    }

    const db = getFirebaseAdminDb()
    const companyRef = db.collection(COMPANIES_COLLECTION).doc(companyId)
    const companySnapshot = await companyRef.get()

    if (!companySnapshot.exists) {
      return NextResponse.json({ error: 'Empresa nao encontrada.' }, { status: 404 })
    }

    const company = companySnapshot.data()
    if (company.isPremiumLab) {
      return NextResponse.json({ error: 'A Premium Lab nao pode ser excluida por esta tela.' }, { status: 400 })
    }

    const usersSnapshot = await db.collection(USERS_COLLECTION).where('companyId', '==', companyId).get()
    const auth = getFirebaseAdminAuth()

    for (const userDoc of usersSnapshot.docs) {
      await db.collection(USERS_COLLECTION).doc(userDoc.id).delete()
      try {
        await auth.deleteUser(userDoc.id)
      } catch (error) {
        if (error.code !== 'auth/user-not-found') throw error
      }
    }

    await db.collection(COMPANY_SECRETS_COLLECTION).doc(companyId).delete()
    await companyRef.delete()

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[admin-companies:delete]', error)
    return NextResponse.json({ error: error.message || 'Falha ao excluir empresa.' }, { status: getErrorStatus(error) })
  }
}
