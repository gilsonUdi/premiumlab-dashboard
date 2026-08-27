import { NextResponse } from 'next/server'
import { getFirebaseAdminDb } from '@/lib/firebase-admin'
import { PORTAL_ACTIVITY_COLLECTION } from '@/lib/portal-activity'
import { getPowerBiReportCatalog } from '@/lib/power-bi'
import { COMPANIES_COLLECTION, requireAdmin, USERS_COLLECTION } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

const POWER_BI_SESSION_COLLECTION = 'powerBiDashboardSessions'

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

function durationMs(session, now = new Date()) {
  const start = asDate(session.activatedAt || session.startedAt)
  const end = asDate(session.endedAt || session.lastActivityAt) || (session.status === 'active' ? now : null)
  return start && end ? Math.max(0, end.getTime() - start.getTime()) : 0
}

function serializeActivity(document, adminIds) {
  const row = document.data()
  const isAdminAccess = Boolean(row.isAdminAccess || row.excludeFromUsageMetrics || adminIds.has(String(row.userId || '')))
  return {
    id: document.id,
    kind: 'tool',
    userId: String(row.userId || ''),
    userName: String(row.userName || row.userEmail || 'Usuario'),
    userEmail: String(row.userEmail || ''),
    companyId: String(row.companyId || ''),
    companySlug: String(row.companySlug || ''),
    companyName: String(row.companyName || ''),
    toolKey: String(row.toolKey || ''),
    toolLabel: String(row.toolLabel || row.toolKey || 'Ferramenta'),
    accessedAt: iso(row.accessedAt),
    isAdminAccess,
    isAdminPreview: Boolean(row.isAdminPreview),
    adminUserName: String(row.adminUserName || ''),
    adminUserEmail: String(row.adminUserEmail || ''),
  }
}

function serializeSession(document, adminIds, now, reportLabels) {
  const row = document.data()
  const isAdminAccess = Boolean(row.isAdminAccess || row.excludeFromUsageMetrics || adminIds.has(String(row.userId || '')))
  const reportKey = String(row.reportKey || '')
  const configuredLabel = reportLabels.get(`${String(row.companyId || '')}:${reportKey}`) || ''
  return {
    id: document.id,
    kind: 'power-bi',
    userId: String(row.userId || ''),
    userName: String(row.userName || row.userEmail || 'Usuario'),
    userEmail: String(row.userEmail || ''),
    companyId: String(row.companyId || ''),
    companySlug: String(row.companySlug || ''),
    companyName: String(row.companyName || ''),
    toolKey: `power-bi:${reportKey}`,
    toolLabel: configuredLabel || String(row.reportLabel || reportKey || 'Power BI'),
    reportKey,
    status: String(row.status || ''),
    startAt: iso(row.activatedAt || row.startedAt),
    lastActivityAt: iso(row.lastActivityAt),
    endedAt: iso(row.endedAt),
    endReason: String(row.endReason || ''),
    durationMs: durationMs(row, now),
    isAdminAccess,
    isAdminPreview: Boolean(row.isAdminPreview),
    adminUserName: String(row.adminUserName || ''),
    adminUserEmail: String(row.adminUserEmail || ''),
  }
}

export async function GET(request) {
  try {
    await requireAdmin(request)
    const { searchParams } = new URL(request.url)
    const requestedDays = Number(searchParams.get('days') || 30)
    const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30
    const now = new Date()
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    const db = getFirebaseAdminDb()

    const [activitySnapshot, sessionSnapshot, adminSnapshot, companySnapshot] = await Promise.all([
      db.collection(PORTAL_ACTIVITY_COLLECTION).orderBy('accessedAt', 'desc').limit(800).get(),
      db.collection(POWER_BI_SESSION_COLLECTION).orderBy('startedAt', 'desc').limit(800).get(),
      db.collection(USERS_COLLECTION).where('role', '==', 'admin').get(),
      db.collection(COMPANIES_COLLECTION).get(),
    ])

    const adminIds = new Set(adminSnapshot.docs.map(document => document.id))
    const reportLabels = new Map()
    companySnapshot.docs.forEach(document => {
      getPowerBiReportCatalog({ id: document.id, ...document.data() }).forEach(report => {
        reportLabels.set(`${document.id}:${report.id}`, report.label || report.reportName || report.id)
      })
    })
    const activities = activitySnapshot.docs
      .map(document => serializeActivity(document, adminIds))
      .filter(row => row.accessedAt && new Date(row.accessedAt) >= cutoff)
    const powerBiSessions = sessionSnapshot.docs
      .map(document => serializeSession(document, adminIds, now, reportLabels))
      .filter(row => row.startAt && new Date(row.startAt) >= cutoff)

    const users = new Map()
    const touchUser = row => {
      if (row.isAdminAccess) return
      const key = `${row.companyId}:${row.userId || row.userEmail}`
      const timestamp = row.kind === 'power-bi' ? row.startAt : row.accessedAt
      const current = users.get(key) || {
        id: key,
        userId: row.userId,
        userName: row.userName,
        userEmail: row.userEmail,
        companyId: row.companyId,
        companyName: row.companyName,
        lastAccessAt: timestamp,
        accessCount: 0,
        powerBiDurationMs: 0,
        powerBiSessions: 0,
        tools: new Map(),
      }
      current.accessCount += 1
      if (timestamp && (!current.lastAccessAt || timestamp > current.lastAccessAt)) current.lastAccessAt = timestamp
      current.tools.set(row.toolKey, row.toolLabel)
      if (row.kind === 'power-bi') {
        current.powerBiDurationMs += row.durationMs
        current.powerBiSessions += 1
      }
      users.set(key, current)
    }

    activities.forEach(touchUser)
    powerBiSessions.forEach(touchUser)

    const userRows = [...users.values()]
      .map(row => ({ ...row, tools: [...row.tools.values()] }))
      .sort((left, right) => String(right.lastAccessAt || '').localeCompare(String(left.lastAccessAt || '')))
    const regularSessions = powerBiSessions.filter(row => !row.isAdminAccess)
    const adminAccesses = [
      ...activities.filter(row => row.isAdminAccess),
      ...powerBiSessions.filter(row => row.isAdminAccess),
    ].length
    const timeline = [...activities, ...powerBiSessions]
      .sort((left, right) => String(right.accessedAt || right.startAt || '').localeCompare(String(left.accessedAt || left.startAt || '')))
      .slice(0, 300)

    return NextResponse.json({
      generatedAt: now.toISOString(),
      days,
      summary: {
        recentUsers: userRows.length,
        toolAccesses: activities.filter(row => !row.isAdminAccess).length,
        powerBiSessions: regularSessions.length,
        powerBiDurationMs: regularSessions.reduce((sum, row) => sum + row.durationMs, 0),
        adminAccesses,
      },
      users: userRows,
      powerBiSessions,
      timeline,
    })
  } catch (error) {
    const message = String(error?.message || 'Falha ao carregar acessos.')
    const status = message.includes('Nao autorizado') ? 401 : message.includes('administrativo') ? 403 : 500
    console.error('[admin-access-analytics:get]', error)
    return NextResponse.json({ error: message }, { status })
  }
}
