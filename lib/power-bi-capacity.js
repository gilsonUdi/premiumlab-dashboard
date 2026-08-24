import { FieldValue } from 'firebase-admin/firestore'
import { randomUUID } from 'node:crypto'
import { getFirebaseAdminDb } from '@/lib/firebase-admin'

const AZURE_API_VERSION = '2021-01-01'
const AZURE_MANAGEMENT_SCOPE = 'https://management.azure.com//.default'
const AZURE_MANAGEMENT_BASE = 'https://management.azure.com'

const CONTROL_COLLECTION = 'powerBiCapacityControl'
const CONTROL_DOCUMENT = 'shared-a1'
const SESSION_COLLECTION = 'powerBiDashboardSessions'
const EVENT_COLLECTION = 'powerBiCapacityEvents'
const MONTHLY_COLLECTION = 'powerBiCapacityMonthly'

const DEFAULT_SESSION_TIMEOUT_MINUTES = 10
const DEFAULT_CAPACITY_IDLE_MINUTES = 30
const DEFAULT_OPERATION_LOCK_SECONDS = 180

function env(name, fallback = '') {
  return String(process.env[name] || fallback).trim()
}

function asPositiveNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function asDate(value) {
  if (!value) return null
  if (typeof value?.toDate === 'function') return value.toDate()
  if (value instanceof Date) return value
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000)
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function iso(value) {
  return asDate(value)?.toISOString() || null
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000)
}

function monthKey(date) {
  return date.toISOString().slice(0, 7)
}

function normalizeAzureState(value) {
  const state = String(value || '').trim().toLowerCase()
  // A API do Power BI (`api.powerbi.com`) usa `Active`, enquanto a API ARM
  // usada para Resume/Suspend informa `Succeeded` quando a capacidade está
  // provisionada e pronta. Ambos representam uma capacidade disponível.
  if (state === 'active' || state === 'succeeded') return 'active'
  if (state === 'paused' || state === 'suspended') return 'suspended'
  if (['provisioning', 'resuming', 'suspending', 'scaling'].includes(state)) return 'transitioning'
  if (state.includes('fail')) return 'failed'
  return state || 'unknown'
}

function getAzureConfig() {
  return {
    tenantId: env('AZURE_TENANT_ID', env('POWER_BI_TENANT_ID')),
    clientId: env('AZURE_CLIENT_ID', env('POWER_BI_CLIENT_ID')),
    clientSecret: env('AZURE_CLIENT_SECRET', env('POWER_BI_CLIENT_SECRET')),
    subscriptionId: env('AZURE_SUBSCRIPTION_ID'),
    resourceGroup: env('AZURE_RESOURCE_GROUP', 'rg-powerbi-embedded'),
    capacityName: env('AZURE_CAPACITY_NAME', 'axispowerbiembedded'),
    hourlyCost: asPositiveNumber(env('AZURE_POWER_BI_A1_HOURLY_COST'), 0),
    costCurrency: env('AZURE_POWER_BI_COST_CURRENCY', 'BRL'),
  }
}

export function getPowerBiCapacitySettings() {
  return {
    sessionTimeoutMinutes: asPositiveNumber(
      env('POWER_BI_DASHBOARD_SESSION_TIMEOUT_MINUTES'),
      DEFAULT_SESSION_TIMEOUT_MINUTES
    ),
    idleMinutes: asPositiveNumber(
      env('POWER_BI_CAPACITY_IDLE_MINUTES'),
      DEFAULT_CAPACITY_IDLE_MINUTES
    ),
    lockSeconds: asPositiveNumber(
      env('POWER_BI_CAPACITY_OPERATION_LOCK_SECONDS'),
      DEFAULT_OPERATION_LOCK_SECONDS
    ),
  }
}

export function isPowerBiCapacityManagementConfigured() {
  const config = getAzureConfig()
  return Boolean(
    config.tenantId &&
      config.clientId &&
      config.clientSecret &&
      config.subscriptionId &&
      config.resourceGroup &&
      config.capacityName
  )
}

function capacityResourceUrl(config, action = '') {
  const resource = [
    'subscriptions',
    encodeURIComponent(config.subscriptionId),
    'resourceGroups',
    encodeURIComponent(config.resourceGroup),
    'providers',
    'Microsoft.PowerBIDedicated',
    'capacities',
    encodeURIComponent(config.capacityName),
  ].join('/')
  return `${AZURE_MANAGEMENT_BASE}/${resource}${action ? `/${action}` : ''}?api-version=${AZURE_API_VERSION}`
}

async function getAzureManagementToken(config) {
  const response = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: AZURE_MANAGEMENT_SCOPE,
      grant_type: 'client_credentials',
    }),
    cache: 'no-store',
  })
  const payload = await response.json()
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || payload?.error || 'Nao foi possivel autenticar no Azure Resource Manager.')
  }
  return payload.access_token
}

async function azureRequest(config, pathAction = '', method = 'GET') {
  const token = await getAzureManagementToken(config)
  const response = await fetch(capacityResourceUrl(config, pathAction), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })
  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }
  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : payload?.error?.message || payload?.message
    throw new Error(message || `Falha na operacao ${method} da capacidade Power BI.`)
  }
  return { payload, status: response.status, retryAfter: Number(response.headers.get('retry-after') || 0) }
}

export async function getAzurePowerBiCapacityStatus() {
  const config = getAzureConfig()
  if (!isPowerBiCapacityManagementConfigured()) {
    return { configured: false, state: 'unmanaged', rawState: '', provisioningState: '' }
  }
  const { payload } = await azureRequest(config)
  const rawState = String(payload?.properties?.state || '').trim()
  return {
    configured: true,
    state: normalizeAzureState(rawState),
    rawState,
    provisioningState: String(payload?.properties?.provisioningState || '').trim(),
    sku: String(payload?.sku?.name || '').trim(),
    location: String(payload?.location || '').trim(),
  }
}

function controlRef(db) {
  return db.collection(CONTROL_COLLECTION).doc(CONTROL_DOCUMENT)
}

function sessionRef(db, sessionId) {
  return db.collection(SESSION_COLLECTION).doc(sessionId)
}

function eventRef(db) {
  return db.collection(EVENT_COLLECTION).doc()
}

function isLiveSession(session, now) {
  if (!session || !['starting', 'active'].includes(String(session.status || ''))) return false
  const expiresAt = asDate(session.expiresAt)
  return Boolean(expiresAt && expiresAt.getTime() > now.getTime())
}

function operationIsLocked(control, now, action = '') {
  const operation = control?.operation || null
  const expiresAt = asDate(operation?.expiresAt)
  if (!operation || !expiresAt || expiresAt.getTime() <= now.getTime()) return false
  return !action || operation.action === action
}

async function writeCapacityEvent(type, payload = {}) {
  const db = getFirebaseAdminDb()
  await eventRef(db).set({
    type,
    ...payload,
    createdAt: FieldValue.serverTimestamp(),
  })
}

async function createOrTouchSession({ sessionId, user, company, reportKey }) {
  const db = getFirebaseAdminDb()
  const now = new Date()
  const settings = getPowerBiCapacitySettings()
  const id = String(sessionId || '').trim() || randomUUID()
  const ref = sessionRef(db, id)

  await db.runTransaction(async transaction => {
    const [snapshot, controlSnapshot] = await Promise.all([
      transaction.get(ref),
      transaction.get(controlRef(db)),
    ])
    const existing = snapshot.exists ? snapshot.data() : null

    if (existing) {
      if (existing.userId !== user.uid || existing.companyId !== company.id || existing.reportKey !== reportKey) {
        throw new Error('Sessao de dashboard invalida para este usuario.')
      }
      if (String(existing.status || '') === 'ended') {
        throw new Error('Sessao de dashboard ja encerrada.')
      }
    }

    const control = controlSnapshot.exists ? controlSnapshot.data() : {}
    const suspendInProgress = operationIsLocked(control, now, 'suspend')
    transaction.set(
      ref,
      {
        userId: user.uid,
        userEmail: String(user.email || ''),
        userName: String(user.name || user.email || 'Usuario'),
        companyId: company.id,
        companySlug: company.slug,
        companyName: company.name,
        reportKey,
        status: suspendInProgress ? 'starting' : existing?.status || 'starting',
        startedAt: existing?.startedAt || now,
        lastActivityAt: now,
        expiresAt: addMinutes(now, settings.sessionTimeoutMinutes),
        endedAt: null,
        updatedAt: now,
      },
      { merge: true }
    )
    transaction.set(
      controlRef(db),
      {
        idleSince: null,
        updatedAt: now,
      },
      { merge: true }
    )
  })

  return id
}

async function acquireOperationLock(action, context = {}) {
  const db = getFirebaseAdminDb()
  const now = new Date()
  const settings = getPowerBiCapacitySettings()
  const token = randomUUID()
  let acquired = false

  await db.runTransaction(async transaction => {
    const ref = controlRef(db)
    const snapshot = await transaction.get(ref)
    const control = snapshot.exists ? snapshot.data() : {}
    if (operationIsLocked(control, now)) return

    transaction.set(
      ref,
      {
        operation: {
          action,
          token,
          startedAt: now,
          expiresAt: addSeconds(now, settings.lockSeconds),
          triggerCompanyId: context.companyId || '',
          triggerCompanyName: context.companyName || '',
          triggerUserId: context.userId || '',
        },
        updatedAt: now,
      },
      { merge: true }
    )
    acquired = true
  })

  return { acquired, token }
}

async function releaseOperationLock(token, updates = {}) {
  const db = getFirebaseAdminDb()
  const ref = controlRef(db)
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref)
    const control = snapshot.exists ? snapshot.data() : {}
    if (control?.operation?.token !== token) return
    transaction.set(
      ref,
      {
        ...updates,
        operation: FieldValue.delete(),
        updatedAt: new Date(),
      },
      { merge: true }
    )
  })
}

async function hasCapacityOperationLock(action) {
  const snapshot = await controlRef(getFirebaseAdminDb()).get()
  return snapshot.exists && operationIsLocked(snapshot.data(), new Date(), action)
}

async function markCapacityActive(status, context = {}) {
  const db = getFirebaseAdminDb()
  const now = new Date()
  const ref = controlRef(db)
  let becameActive = false
  let trigger = context

  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref)
    const control = snapshot.exists ? snapshot.data() : {}
    trigger = {
      companyId: control?.operation?.triggerCompanyId || context.companyId || '',
      companyName: control?.operation?.triggerCompanyName || context.companyName || '',
      userId: control?.operation?.triggerUserId || context.userId || '',
    }
    becameActive = !asDate(control.activeSince)
    const updates = {
      observedState: 'active',
      azureState: status.rawState || 'Active',
      provisioningState: status.provisioningState || '',
      activeSince: asDate(control.activeSince) || now,
      lastActiveAt: now,
      lastResumeCompletedAt: becameActive ? now : control.lastResumeCompletedAt || null,
      updatedAt: now,
    }
    if (!operationIsLocked(control, now, 'suspend')) updates.operation = FieldValue.delete()
    transaction.set(ref, updates, { merge: true })
  })

  if (becameActive) {
    await writeCapacityEvent('resume_completed', {
      azureState: status.rawState || 'Active',
      triggerCompanyId: trigger.companyId,
      triggerCompanyName: trigger.companyName,
      triggerUserId: trigger.userId,
    })
  }
}

async function markSessionActive(sessionId) {
  const db = getFirebaseAdminDb()
  const now = new Date()
  const settings = getPowerBiCapacitySettings()
  await sessionRef(db, sessionId).set(
    {
      status: 'active',
      activatedAt: now,
      lastHeartbeatAt: now,
      lastActivityAt: now,
      expiresAt: addMinutes(now, settings.sessionTimeoutMinutes),
      updatedAt: now,
    },
    { merge: true }
  )
  const liveSessions = await getLiveSessions(now)
  const monthlyRef = db.collection(MONTHLY_COLLECTION).doc(monthKey(now))
  await db.runTransaction(async transaction => {
    const monthlySnapshot = await transaction.get(monthlyRef)
    const monthly = monthlySnapshot.exists ? monthlySnapshot.data() : {}
    transaction.set(
      monthlyRef,
      {
        month: monthKey(now),
        peakSimultaneousSessions: Math.max(Number(monthly.peakSimultaneousSessions || 0), liveSessions.length),
        updatedAt: now,
      },
      { merge: true }
    )
    transaction.set(controlRef(db), { activeSessions: liveSessions.length, idleSince: null, updatedAt: now }, { merge: true })
  })
}

export async function preparePowerBiDashboardAccess({ sessionId, user, company, reportKey }) {
  if (!isPowerBiCapacityManagementConfigured()) {
    return { enabled: false, ready: true, sessionId: '' }
  }

  const id = await createOrTouchSession({ sessionId, user, company, reportKey })
  const context = {
    companyId: company.id,
    companyName: company.name,
    userId: user.uid,
  }
  const status = await getAzurePowerBiCapacityStatus()

  if (status.state === 'active') {
    if (await hasCapacityOperationLock('suspend')) {
      return {
        enabled: true,
        ready: false,
        sessionId: id,
        capacityState: 'transitioning',
        retryAfterMs: 5000,
      }
    }
    await markCapacityActive(status, context)
    await markSessionActive(id)
    return { enabled: true, ready: true, sessionId: id, capacityState: status.state }
  }

  if (status.state === 'failed') {
    throw new Error(`A capacidade Power BI apresentou falha: ${status.rawState || status.provisioningState || 'estado desconhecido'}.`)
  }

  if (status.state === 'suspended') {
    const lock = await acquireOperationLock('resume', context)
    if (lock.acquired) {
      try {
        const config = getAzureConfig()
        const result = await azureRequest(config, 'resume', 'POST')
        const now = new Date()
        await getFirebaseAdminDb().collection(EVENT_COLLECTION).doc().set({
          type: 'resume_requested',
          triggerCompanyId: company.id,
          triggerCompanyName: company.name,
          triggerUserId: user.uid,
          triggerUserEmail: user.email || '',
          azureHttpStatus: result.status,
          createdAt: now,
        })
        await getFirebaseAdminDb().collection(CONTROL_COLLECTION).doc(CONTROL_DOCUMENT).set(
          {
            observedState: 'transitioning',
            azureState: status.rawState,
            lastResumeRequestedAt: now,
            updatedAt: now,
          },
          { merge: true }
        )
      } catch (error) {
        await releaseOperationLock(lock.token, { lastError: String(error?.message || error), lastErrorAt: new Date() })
        throw error
      }
    }
  }

  return {
    enabled: true,
    ready: false,
    sessionId: id,
    capacityState: status.state,
    retryAfterMs: 5000,
  }
}

async function getAuthorizedSession({ sessionId, user, company, reportKey }) {
  const db = getFirebaseAdminDb()
  const ref = sessionRef(db, sessionId)
  const snapshot = await ref.get()
  if (!snapshot.exists) throw new Error('Sessao de dashboard nao encontrada.')
  const session = snapshot.data()
  if (session.userId !== user.uid || session.companyId !== company.id || session.reportKey !== reportKey) {
    throw new Error('Acesso negado a esta sessao de dashboard.')
  }
  return { db, ref, session }
}

export async function heartbeatPowerBiDashboardSession({ sessionId, user, company, reportKey }) {
  if (!isPowerBiCapacityManagementConfigured()) return { enabled: false, active: true }
  const { ref, session } = await getAuthorizedSession({ sessionId, user, company, reportKey })
  if (!['starting', 'active'].includes(String(session.status || ''))) {
    return { enabled: true, active: false, status: session.status || 'ended' }
  }
  const now = new Date()
  const settings = getPowerBiCapacitySettings()
  await ref.set(
    {
      status: 'active',
      lastHeartbeatAt: now,
      lastActivityAt: now,
      expiresAt: addMinutes(now, settings.sessionTimeoutMinutes),
      updatedAt: now,
    },
    { merge: true }
  )
  await controlRef(getFirebaseAdminDb()).set({ idleSince: null, lastSessionActivityAt: now, updatedAt: now }, { merge: true })
  return { enabled: true, active: true, expiresAt: addMinutes(now, settings.sessionTimeoutMinutes).toISOString() }
}

async function recordEndedSessionMetrics(transaction, db, session, endedAt) {
  if (session.metricsRecordedAt) return
  const startedAt = asDate(session.activatedAt || session.startedAt) || endedAt
  const durationMs = Math.max(0, endedAt.getTime() - startedAt.getTime())
  const monthlyRef = db.collection(MONTHLY_COLLECTION).doc(monthKey(endedAt))
  const monthlySnapshot = await transaction.get(monthlyRef)
  const monthly = monthlySnapshot.exists ? monthlySnapshot.data() : {}
  transaction.set(
    monthlyRef,
    {
      month: monthKey(endedAt),
      totalSessionMs: Number(monthly.totalSessionMs || 0) + durationMs,
      completedSessions: Number(monthly.completedSessions || 0) + 1,
      updatedAt: endedAt,
    },
    { merge: true }
  )
}

export async function endPowerBiDashboardSession({ sessionId, user, company, reportKey, reason = 'closed' }) {
  if (!isPowerBiCapacityManagementConfigured()) return { enabled: false, ended: true }
  const { db, ref } = await getAuthorizedSession({ sessionId, user, company, reportKey })
  const now = new Date()
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists) return
    const session = snapshot.data()
    if (['ended', 'expired'].includes(String(session.status || '')) && session.metricsRecordedAt) return
    await recordEndedSessionMetrics(transaction, db, session, now)
    transaction.set(
      ref,
      {
        status: reason === 'inactivity' ? 'expired' : 'ended',
        endReason: reason,
        endedAt: now,
        expiresAt: now,
        metricsRecordedAt: now,
        updatedAt: now,
      },
      { merge: true }
    )
  })
  return { enabled: true, ended: true }
}

async function expireStaleSessions(now) {
  const db = getFirebaseAdminDb()
  const snapshot = await db.collection(SESSION_COLLECTION).where('status', 'in', ['starting', 'active']).get()
  let expired = 0
  for (const document of snapshot.docs) {
    const session = document.data()
    if (!isLiveSession(session, now)) {
      await db.runTransaction(async transaction => {
        const current = await transaction.get(document.ref)
        if (!current.exists || isLiveSession(current.data(), now)) return
        const data = current.data()
        await recordEndedSessionMetrics(transaction, db, data, now)
        transaction.set(
          document.ref,
          {
            status: 'expired',
            endReason: 'inactivity',
            endedAt: now,
            metricsRecordedAt: now,
            updatedAt: now,
          },
          { merge: true }
        )
        expired += 1
      })
    }
  }
  return expired
}

async function getLiveSessions(now = new Date()) {
  const snapshot = await getFirebaseAdminDb()
    .collection(SESSION_COLLECTION)
    .where('status', 'in', ['starting', 'active'])
    .get()
  return snapshot.docs
    .map(document => ({ id: document.id, ...document.data() }))
    .filter(session => isLiveSession(session, now))
}

function splitDurationByMonth(start, end) {
  const segments = []
  let cursor = new Date(start)
  while (cursor < end) {
    const nextMonth = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
    const segmentEnd = nextMonth < end ? nextMonth : end
    segments.push({ month: monthKey(cursor), durationMs: segmentEnd.getTime() - cursor.getTime() })
    cursor = segmentEnd
  }
  return segments
}

async function markCapacitySuspended(status) {
  const db = getFirebaseAdminDb()
  const now = new Date()
  const ref = controlRef(db)
  let durationMs = 0
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref)
    const control = snapshot.exists ? snapshot.data() : {}
    const activeSince = asDate(control.activeSince)
    const segments = activeSince ? splitDurationByMonth(activeSince, now) : []
    const monthlySnapshots = []
    for (const segment of segments) {
      const monthlyRef = db.collection(MONTHLY_COLLECTION).doc(segment.month)
      monthlySnapshots.push({ segment, ref: monthlyRef, snapshot: await transaction.get(monthlyRef) })
    }
    for (const item of monthlySnapshots) {
      const monthly = item.snapshot.exists ? item.snapshot.data() : {}
      transaction.set(
        item.ref,
        {
          month: item.segment.month,
          totalActiveMs: Number(monthly.totalActiveMs || 0) + item.segment.durationMs,
          updatedAt: now,
        },
        { merge: true }
      )
      durationMs += item.segment.durationMs
    }
    transaction.set(
      ref,
      {
        observedState: 'suspended',
        azureState: status.rawState || 'Suspended',
        provisioningState: status.provisioningState || '',
        activeSince: null,
        idleSince: null,
        lastSuspendCompletedAt: now,
        operation: FieldValue.delete(),
        updatedAt: now,
      },
      { merge: true }
    )
  })
  await writeCapacityEvent('suspend_completed', {
    azureState: status.rawState || 'Suspended',
    activeDurationMs: durationMs,
  })
}

export async function reconcilePowerBiCapacity() {
  if (!isPowerBiCapacityManagementConfigured()) {
    return { configured: false, action: 'unmanaged' }
  }

  const db = getFirebaseAdminDb()
  const now = new Date()
  const settings = getPowerBiCapacitySettings()
  const expiredSessions = await expireStaleSessions(now)
  let liveSessions = await getLiveSessions(now)
  let status = await getAzurePowerBiCapacityStatus()

  if (status.state === 'suspended') {
    const controlSnapshot = await controlRef(db).get()
    const control = controlSnapshot.exists ? controlSnapshot.data() : {}
    if (asDate(control.activeSince)) await markCapacitySuspended(status)
    return { configured: true, action: 'already-suspended', state: status.state, activeSessions: liveSessions.length, expiredSessions }
  }

  if (status.state === 'active') await markCapacityActive(status)

  if (liveSessions.length > 0) {
    await controlRef(db).set(
      {
        idleSince: null,
        observedState: status.state,
        azureState: status.rawState,
        activeSessions: liveSessions.length,
        updatedAt: now,
      },
      { merge: true }
    )
    return { configured: true, action: 'kept-active', state: status.state, activeSessions: liveSessions.length, expiredSessions }
  }

  const controlSnapshot = await controlRef(db).get()
  const control = controlSnapshot.exists ? controlSnapshot.data() : {}
  const idleSince = asDate(control.idleSince)
  if (!idleSince) {
    await controlRef(db).set({ idleSince: now, activeSessions: 0, updatedAt: now }, { merge: true })
    return { configured: true, action: 'idle-timer-started', state: status.state, activeSessions: 0, expiredSessions }
  }

  const idleMs = now.getTime() - idleSince.getTime()
  if (idleMs < settings.idleMinutes * 60 * 1000 || status.state !== 'active') {
    return { configured: true, action: 'waiting-idle-timeout', state: status.state, activeSessions: 0, expiredSessions }
  }

  const lock = await acquireOperationLock('suspend')
  if (!lock.acquired) {
    return { configured: true, action: 'operation-in-progress', state: status.state, activeSessions: 0, expiredSessions }
  }

  try {
    liveSessions = await getLiveSessions(new Date())
    if (liveSessions.length > 0) {
      await releaseOperationLock(lock.token, { idleSince: null, activeSessions: liveSessions.length })
      return { configured: true, action: 'suspend-cancelled-active-session', state: status.state, activeSessions: liveSessions.length, expiredSessions }
    }

    status = await getAzurePowerBiCapacityStatus()
    if (status.state !== 'active') {
      await releaseOperationLock(lock.token, { observedState: status.state, azureState: status.rawState })
      return { configured: true, action: 'suspend-not-required', state: status.state, activeSessions: 0, expiredSessions }
    }

    const result = await azureRequest(getAzureConfig(), 'suspend', 'POST')
    await writeCapacityEvent('suspend_requested', {
      azureHttpStatus: result.status,
      idleSince,
      idleDurationMs: idleMs,
    })
    await controlRef(db).set(
      {
        observedState: 'transitioning',
        lastSuspendRequestedAt: new Date(),
        activeSessions: 0,
        updatedAt: new Date(),
      },
      { merge: true }
    )
    return { configured: true, action: 'suspend-requested', state: 'transitioning', activeSessions: 0, expiredSessions }
  } catch (error) {
    await releaseOperationLock(lock.token, { lastError: String(error?.message || error), lastErrorAt: new Date() })
    throw error
  }
}

function serializeSession(session) {
  return {
    id: session.id,
    status: session.status || '',
    companyId: session.companyId || '',
    companyName: session.companyName || '',
    reportKey: session.reportKey || '',
    userName: session.userName || '',
    userEmail: session.userEmail || '',
    startedAt: iso(session.startedAt),
    activatedAt: iso(session.activatedAt),
    lastActivityAt: iso(session.lastActivityAt),
    expiresAt: iso(session.expiresAt),
  }
}

function serializeCapacityEvent(event) {
  return {
    id: event.id,
    type: event.type || '',
    createdAt: iso(event.createdAt),
    triggerCompanyId: event.triggerCompanyId || '',
    triggerCompanyName: event.triggerCompanyName || '',
    triggerUserId: event.triggerUserId || '',
    triggerUserEmail: event.triggerUserEmail || '',
    azureHttpStatus: Number(event.azureHttpStatus || 0) || null,
    activeDurationMs: Number(event.activeDurationMs || 0),
    idleDurationMs: Number(event.idleDurationMs || 0),
  }
}

export async function getPowerBiCapacityMetrics(date = new Date()) {
  const db = getFirebaseAdminDb()
  const config = getAzureConfig()
  const key = monthKey(date)
  const [controlSnapshot, monthlySnapshot, liveSessions, status, eventSnapshot] = await Promise.all([
    controlRef(db).get(),
    db.collection(MONTHLY_COLLECTION).doc(key).get(),
    getLiveSessions(date),
    isPowerBiCapacityManagementConfigured()
      ? getAzurePowerBiCapacityStatus().catch(error => ({ state: 'error', rawState: '', error: error.message }))
      : Promise.resolve({ state: 'unmanaged', rawState: '' }),
    db.collection(EVENT_COLLECTION).orderBy('createdAt', 'desc').limit(100).get(),
  ])
  const control = controlSnapshot.exists ? controlSnapshot.data() : {}
  const monthly = monthlySnapshot.exists ? monthlySnapshot.data() : {}
  const currentActiveMs = asDate(control.activeSince) ? Math.max(0, date.getTime() - asDate(control.activeSince).getTime()) : 0
  const totalActiveMs = Number(monthly.totalActiveMs || 0) + currentActiveMs
  const totalSessionMs = Number(monthly.totalSessionMs || 0)
  const completedSessions = Number(monthly.completedSessions || 0)
  const activeHours = totalActiveMs / 3_600_000

  return {
    configured: isPowerBiCapacityManagementConfigured(),
    capacity: {
      name: config.capacityName,
      resourceGroup: config.resourceGroup,
      state: status.state,
      rawState: status.rawState || '',
      activeSince: iso(control.activeSince),
      idleSince: iso(control.idleSince),
      lastResumeRequestedAt: iso(control.lastResumeRequestedAt),
      lastResumeCompletedAt: iso(control.lastResumeCompletedAt),
      lastSuspendRequestedAt: iso(control.lastSuspendRequestedAt),
      lastSuspendCompletedAt: iso(control.lastSuspendCompletedAt),
    },
    month: key,
    activeSessions: liveSessions.map(serializeSession),
    simultaneousSessions: liveSessions.length,
    activeHours,
    averageSessionMinutes: completedSessions > 0 ? totalSessionMs / completedSessions / 60_000 : 0,
    completedSessions,
    peakSimultaneousSessions: Number(monthly.peakSimultaneousSessions || 0),
    estimatedCost: config.hourlyCost > 0 ? activeHours * config.hourlyCost : null,
    hourlyCost: config.hourlyCost || null,
    costCurrency: config.costCurrency,
    recentEvents: eventSnapshot.docs.map(document => serializeCapacityEvent({ id: document.id, ...document.data() })),
  }
}
