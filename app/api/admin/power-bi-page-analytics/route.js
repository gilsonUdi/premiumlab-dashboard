import { NextResponse } from 'next/server'
import { getFirebaseAdminDb } from '@/lib/firebase-admin'
import { POWER_BI_PAGE_VISIT_COLLECTION } from '@/lib/power-bi-capacity'
import { COMPANIES_COLLECTION, requireAdmin } from '@/lib/server-auth'
import { getPowerBiReportCatalog } from '@/lib/power-bi'

export const dynamic = 'force-dynamic'

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

function visitDurationMs(visit, now) {
  const startedAt = asDate(visit.startedAt)
  const endedAt = asDate(visit.endedAt || visit.lastSeenAt) || now
  if (!startedAt) return 0
  return Math.max(0, endedAt.getTime() - startedAt.getTime())
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

    const [visitSnapshot, companySnapshot] = await Promise.all([
      db.collection(POWER_BI_PAGE_VISIT_COLLECTION)
        .where('startedAt', '>=', cutoff)
        .orderBy('startedAt', 'desc')
        .limit(10000)
        .get(),
      db.collection(COMPANIES_COLLECTION).get(),
    ])

    const companyNames = new Map()
    const reportLabels = new Map()
    companySnapshot.docs.forEach(document => {
      const company = { id: document.id, ...document.data() }
      companyNames.set(document.id, company.name || document.id)
      getPowerBiReportCatalog(company).forEach(report => {
        reportLabels.set(`${document.id}:${report.id}`, report.label || report.id)
      })
    })

    const visits = visitSnapshot.docs
      .map(document => ({ id: document.id, ...document.data() }))
      .filter(visit => {
        const startedAt = asDate(visit.startedAt)
        return startedAt && startedAt >= cutoff && !visit.isAdminAccess && !visit.excludeFromUsageMetrics
      })

    const groups = new Map()
    visits.forEach(visit => {
      const companyId = String(visit.companyId || '')
      const reportKey = String(visit.reportKey || '')
      const pageName = String(visit.pageName || '')
      if (!companyId || !pageName) return
      const key = `${companyId}:${reportKey}:${pageName}`
      const startedAt = iso(visit.startedAt)
      const current = groups.get(key) || {
        id: key,
        companyId,
        companyName: companyNames.get(companyId) || String(visit.companyName || companyId),
        reportKey,
        reportLabel: reportLabels.get(`${companyId}:${reportKey}`) || String(visit.reportLabel || reportKey || 'Power BI'),
        pageName,
        pageLabel: String(visit.pageLabel || pageName),
        accesses: 0,
        durationMs: 0,
        lastAccessAt: startedAt,
        sessionIds: new Set(),
        userIds: new Set(),
      }

      current.accesses += 1
      current.durationMs += visitDurationMs(visit, now)
      if (visit.sessionId) current.sessionIds.add(String(visit.sessionId))
      if (visit.userId || visit.userEmail) current.userIds.add(String(visit.userId || visit.userEmail))
      if (startedAt && (!current.lastAccessAt || startedAt > current.lastAccessAt)) current.lastAccessAt = startedAt
      if (visit.pageLabel) current.pageLabel = String(visit.pageLabel)
      groups.set(key, current)
    })

    const groupedRows = [...groups.values()]
    const maximumsByCompany = new Map()
    groupedRows.forEach(row => {
      const maximums = maximumsByCompany.get(row.companyId) || { accesses: 0, durationMs: 0 }
      maximums.accesses = Math.max(maximums.accesses, row.accesses)
      maximums.durationMs = Math.max(maximums.durationMs, row.durationMs)
      maximumsByCompany.set(row.companyId, maximums)
    })

    const pages = groupedRows
      .map(row => {
        const maximums = maximumsByCompany.get(row.companyId)
        const accessScore = maximums.accesses > 0 ? row.accesses / maximums.accesses : 0
        const durationScore = maximums.durationMs > 0 ? row.durationMs / maximums.durationMs : 0
        return {
          ...row,
          sessionIds: undefined,
          userIds: undefined,
          sessions: row.sessionIds.size,
          users: row.userIds.size,
          averageDurationMs: row.accesses > 0 ? Math.round(row.durationMs / row.accesses) : 0,
          usageScore: Math.round((accessScore * 0.5 + durationScore * 0.5) * 100),
        }
      })
      .sort((left, right) => right.usageScore - left.usageScore || right.durationMs - left.durationMs)

    const companies = [...new Set(pages.map(row => row.companyId))]
      .map(companyId => {
        const companyPages = pages.filter(row => row.companyId === companyId)
        return {
          id: companyId,
          name: companyNames.get(companyId) || companyPages[0]?.companyName || companyId,
          accesses: companyPages.reduce((sum, row) => sum + row.accesses, 0),
          durationMs: companyPages.reduce((sum, row) => sum + row.durationMs, 0),
          pages: companyPages.length,
        }
      })
      .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))

    return NextResponse.json({
      generatedAt: now.toISOString(),
      days,
      methodology: {
        accessWeight: 0.5,
        durationWeight: 0.5,
        description: 'O indice combina 50% do volume de acessos e 50% do tempo acumulado, normalizados dentro de cada empresa.',
      },
      summary: {
        companies: companies.length,
        pages: pages.length,
        accesses: visits.length,
        durationMs: pages.reduce((sum, row) => sum + row.durationMs, 0),
      },
      companies,
      pages,
    })
  } catch (error) {
    const message = String(error?.message || 'Falha ao carregar o uso das paginas do Power BI.')
    const status = message.includes('Nao autorizado') ? 401 : message.includes('administrativo') ? 403 : 500
    console.error('[admin-power-bi-page-analytics:get]', error)
    return NextResponse.json({ error: message }, { status })
  }
}
