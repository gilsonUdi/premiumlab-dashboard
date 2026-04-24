import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { createSecondaryFirebaseServices, getFirebaseServices } from '@/lib/firebase-client'

export const ADMIN_CREDENTIALS = {
  email: 'gilson@gsgestao.com.br',
  password: 'Deia@3234',
  name: 'GS Consultoria & Gestao',
}

export const SESSION_STORAGE_KEY = 'gs-portal-session-v1'

const COMPANIES_COLLECTION = 'companies'
const USERS_COLLECTION = 'users'

const PREMIUM_COMPANY = {
  id: 'premium-lab',
  name: 'Premium Lab',
  slug: 'premium-lab',
  email: 'jhonatan@premiumlaboratorio.com.br',
  password: 'Vendas@2026',
  supabaseUrl: 'https://iifasgnbudrxofgezihw.supabase.co',
  supabaseLabel: 'Projeto Premium Lab sincronizado',
  tools: ['dashboard'],
  isPremiumLab: true,
  dashboardMode: 'premium',
}

export function slugifyCompanyName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

function normalizeCompany(company) {
  const slug = slugifyCompanyName(company.slug || company.name || company.id)

  return {
    id: company.id || slug,
    name: company.name || 'Empresa',
    slug,
    email: String(company.email || '').trim().toLowerCase(),
    supabaseUrl: String(company.supabaseUrl || ''),
    supabaseLabel: String(company.supabaseLabel || ''),
    tools: Array.isArray(company.tools) && company.tools.length > 0 ? [...new Set(company.tools)] : ['dashboard'],
    isPremiumLab: Boolean(company.isPremiumLab),
    dashboardMode: company.dashboardMode || (company.isPremiumLab ? 'premium' : 'external'),
    authUid: company.authUid || '',
    createdAt: company.createdAt || new Date().toISOString(),
  }
}

function savePortalSession(session) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

function waitForAuthUser(auth) {
  return new Promise(resolve => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      unsubscribe()
      resolve(user)
    })
  })
}

async function getAuthUser() {
  const { auth } = getFirebaseServices()
  if (auth.currentUser) return auth.currentUser
  return waitForAuthUser(auth)
}

async function readUserProfile(uid) {
  const { db } = getFirebaseServices()
  const snapshot = await getDoc(doc(db, USERS_COLLECTION, uid))
  return snapshot.exists() ? snapshot.data() : null
}

function buildSession(profile, authUser) {
  if (!profile) return null

  if (profile.role === 'admin') {
    return {
      type: 'admin',
      email: profile.email || authUser.email,
      name: profile.name || ADMIN_CREDENTIALS.name,
      uid: authUser.uid,
    }
  }

  return {
    type: 'company',
    uid: authUser.uid,
    email: profile.email || authUser.email,
    name: profile.name || profile.companyName || 'Empresa',
    companyId: profile.companyId,
    companySlug: profile.companySlug,
  }
}

async function writeUserProfile(uid, payload) {
  const { db } = getFirebaseServices()
  await setDoc(
    doc(db, USERS_COLLECTION, uid),
    {
      ...payload,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}

async function ensureAdminProfile(user) {
  const profile = {
    role: 'admin',
    email: ADMIN_CREDENTIALS.email,
    name: ADMIN_CREDENTIALS.name,
    active: true,
  }

  await writeUserProfile(user.uid, profile)
  return profile
}

async function ensureCompanyProfileFromEmail(user) {
  const company = await getCompanyByEmail(user.email)
  if (!company) return null

  const profile = {
    role: 'company',
    email: company.email,
    name: company.name,
    companyId: company.id,
    companySlug: company.slug,
    active: true,
  }

  await writeUserProfile(user.uid, profile)
  return profile
}

async function createOrSignInSecondary(email, password) {
  const secondary = await createSecondaryFirebaseServices()

  try {
    try {
      const created = await createUserWithEmailAndPassword(secondary.auth, email, password)
      return { uid: created.user.uid, dispose: secondary.dispose }
    } catch (error) {
      if (error.code !== 'auth/email-already-in-use') throw error
      const signedIn = await signInWithEmailAndPassword(secondary.auth, email, password)
      return { uid: signedIn.user.uid, dispose: secondary.dispose }
    }
  } catch (error) {
    await secondary.dispose()
    throw error
  }
}

async function upsertCompanyRecord(payload, authUid) {
  const { db } = getFirebaseServices()
  const company = normalizeCompany({
    ...payload,
    authUid,
  })

  await setDoc(
    doc(db, COMPANIES_COLLECTION, company.id),
    {
      ...company,
      updatedAt: serverTimestamp(),
      createdAt: company.createdAt,
    },
    { merge: true }
  )

  await setDoc(
    doc(db, USERS_COLLECTION, authUid),
    {
      role: 'company',
      email: company.email,
      name: company.name,
      companyId: company.id,
      companySlug: company.slug,
      active: true,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )

  return company
}

export async function getCurrentPortalSession() {
  const authUser = await getAuthUser()
  if (!authUser) return null

  let profile = await readUserProfile(authUser.uid)
  if (!profile && authUser.email?.toLowerCase() === ADMIN_CREDENTIALS.email.toLowerCase()) {
    profile = await ensureAdminProfile(authUser)
  }
  if (!profile) {
    profile = await ensureCompanyProfileFromEmail(authUser)
  }

  const session = buildSession(profile, authUser)
  if (session) savePortalSession(session)
  return session
}

export function loadPortalSession() {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function clearPortalSession() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(SESSION_STORAGE_KEY)
  const { auth } = getFirebaseServices()
  await signOut(auth)
}

export async function authenticatePortalUser(email, password) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const normalizedPassword = String(password || '')
  const { auth } = getFirebaseServices()

  await setPersistence(auth, browserLocalPersistence)

  let credential

  try {
    credential = await signInWithEmailAndPassword(auth, normalizedEmail, normalizedPassword)
  } catch (error) {
    const isAdminBootstrap =
      normalizedEmail === ADMIN_CREDENTIALS.email.toLowerCase() &&
      normalizedPassword === ADMIN_CREDENTIALS.password &&
      ['auth/invalid-credential', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(error.code)

    if (!isAdminBootstrap) throw error

    credential = await createUserWithEmailAndPassword(auth, normalizedEmail, normalizedPassword)
  }

  let profile = await readUserProfile(credential.user.uid)

  if (!profile && normalizedEmail === ADMIN_CREDENTIALS.email.toLowerCase()) {
    profile = await ensureAdminProfile(credential.user)
  }
  if (!profile) {
    profile = await ensureCompanyProfileFromEmail(credential.user)
  }

  if (!profile) {
    throw new Error('Usuario autenticado, mas sem perfil no Firestore.')
  }

  const session = buildSession(profile, credential.user)
  savePortalSession(session)
  return session
}

export async function loadPortalState() {
  const { db } = getFirebaseServices()
  const snapshot = await getDocs(collection(db, COMPANIES_COLLECTION))
  const companies = snapshot.docs.map(document => normalizeCompany({ id: document.id, ...document.data() }))

  return {
    companies,
    updatedAt: new Date().toISOString(),
  }
}

export async function loadCompanyState(slug) {
  const { db } = getFirebaseServices()
  const snapshot = await getDoc(doc(db, COMPANIES_COLLECTION, slug))
  if (!snapshot.exists()) {
    return { companies: [], updatedAt: new Date().toISOString() }
  }

  return {
    companies: [normalizeCompany({ id: snapshot.id, ...snapshot.data() })],
    updatedAt: new Date().toISOString(),
  }
}

export function getCompanyBySlug(state, slug) {
  return (state.companies || []).find(company => company.slug === slug) || null
}

export function getCompanyById(state, id) {
  return (state.companies || []).find(company => company.id === id) || null
}

export async function ensurePremiumLabTenant() {
  const state = await loadPortalState()
  const existing = state.companies.find(company => company.isPremiumLab || company.slug === PREMIUM_COMPANY.slug)

  const premiumPayload = {
    ...PREMIUM_COMPANY,
    createdAt: existing?.createdAt || PREMIUM_COMPANY.createdAt,
  }

  const needsSync =
    !existing ||
    existing.email !== PREMIUM_COMPANY.email ||
    existing.supabaseUrl !== PREMIUM_COMPANY.supabaseUrl ||
    existing.dashboardMode !== PREMIUM_COMPANY.dashboardMode ||
    !existing.isPremiumLab

  if (!needsSync) return state

  const { uid, dispose } = await createOrSignInSecondary(PREMIUM_COMPANY.email, PREMIUM_COMPANY.password)

  try {
    await upsertCompanyRecord(premiumPayload, uid)
  } finally {
    await dispose()
  }

  return loadPortalState()
}

export async function upsertCompany(state, payload) {
  const hasPremiumLab = (state?.companies || []).some(company => company.isPremiumLab && company.id !== payload.id)
  const normalized = normalizeCompany({
    ...payload,
    isPremiumLab: payload.isPremiumLab && !hasPremiumLab,
    dashboardMode: payload.isPremiumLab && !hasPremiumLab ? 'premium' : 'external',
  })

  const { uid, dispose } = await createOrSignInSecondary(normalized.email, payload.password)

  try {
    await upsertCompanyRecord(normalized, uid)
  } finally {
    await dispose()
  }

  return loadPortalState()
}

export async function deleteCompany(state, companyId) {
  const company = getCompanyById(state, companyId)
  if (!company) {
    throw new Error('Empresa nao encontrada.')
  }

  if (company.isPremiumLab) {
    throw new Error('A Premium Lab nao pode ser excluida por esta tela.')
  }

  const { db } = getFirebaseServices()

  await deleteDoc(doc(db, COMPANIES_COLLECTION, company.id))

  if (company.authUid) {
    await deleteDoc(doc(db, USERS_COLLECTION, company.authUid))
  }

  return loadPortalState()
}

export async function getCompanyByEmail(email) {
  const { db } = getFirebaseServices()
  const companiesQuery = query(collection(db, COMPANIES_COLLECTION), where('email', '==', String(email || '').trim().toLowerCase()))
  const snapshot = await getDocs(companiesQuery)
  return snapshot.empty ? null : normalizeCompany({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() })
}
