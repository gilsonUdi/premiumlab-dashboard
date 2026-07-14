'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Clock3, PieChart, RefreshCw } from 'lucide-react'
import {
  getCompanyById,
  getCompanyBySlug,
  getCurrentPortalSession,
  getPortalAuthHeaders,
  loadCompanyState,
} from '@/lib/portal-store'
import { canAccessPortalPage, PORTAL_PAGE_KEYS } from '@/lib/portal-config'

function formatRefreshDate(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return 'Atualização não informada'

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return 'Atualização não informada'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

export default function PowerBiCatalogPage({ slug }) {
  const router = useRouter()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [state, setState] = useState(null)
  const [session, setSession] = useState(null)

  useEffect(() => {
    let active = true

    async function hydrate() {
      try {
        const currentSession = await getCurrentPortalSession()
        if (!currentSession) {
          router.replace('/login')
          return
        }

        if (currentSession.type === 'company' && currentSession.companySlug !== slug) {
          router.replace(`/empresa/${currentSession.companySlug}/power-bi`)
          return
        }

        const portalState = await loadCompanyState(slug)
        if (!active) return
        setState(portalState)
        setSession(currentSession)
      } catch (hydrateError) {
        console.error(hydrateError)
        if (active) router.replace('/login')
      }
    }

    hydrate()
    return () => {
      active = false
    }
  }, [router, slug])

  const company = useMemo(() => {
    if (!state) return null
    return getCompanyBySlug(state, slug) || (session?.companyId ? getCompanyById(state, session.companyId) : null)
  }, [session?.companyId, slug, state])

  useEffect(() => {
    let active = true

    async function loadCatalog() {
      if (!company || !session) return
      try {
        setLoading(true)
        setError('')
        const response = await fetch(`/api/power-bi/metadata?slug=${encodeURIComponent(company.slug)}`, {
          headers: await getPortalAuthHeaders(),
          cache: 'no-store',
        })
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error || 'Não foi possível carregar os modelos do Power BI.')
        }
        if (!active) return
        setReports(Array.isArray(payload.reports) ? payload.reports : [])
      } catch (catalogError) {
        console.error(catalogError)
        if (!active) return
        setError(catalogError.message || 'Não foi possível carregar os modelos do Power BI.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadCatalog()

    return () => {
      active = false
    }
  }, [company, session])

  const hasReports = useMemo(() => reports.length > 0, [reports])

  if (!state || !session || !company) {
    return (
      <main className="portal-page flex min-h-screen items-center justify-center">
        <div
          className="rounded-2xl px-6 py-4 text-sm"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#7E97BC' }}
        >
          Carregando modelos do Power BI...
        </div>
      </main>
    )
  }

  if (!canAccessPortalPage(company, session.permissions, PORTAL_PAGE_KEYS.POWER_BI)) {
    return (
      <main className="portal-page flex min-h-screen items-center justify-center px-6">
        <div
          className="max-w-[600px] rounded-2xl p-8"
          style={{ background: 'var(--portal-surface)', border: '1px solid var(--portal-border)' }}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--accent-bright)' }}>Acesso restrito</p>
          <h1 className="mt-3 text-3xl font-bold text-white">{company.name}</h1>
          <p className="mt-3 text-sm leading-7" style={{ color: '#AEC3DF' }}>
            Este usuário não possui permissão para acessar os modelos de Power BI desta empresa.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="portal-page">
      <div className="mx-auto max-w-[1380px] px-5 py-5">

        {/* Top bar */}
        <header className="mb-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href={`/empresa/${company.slug}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl transition"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#7E97BC' }}
            >
              <ArrowLeft size={16} />
            </Link>
            <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: 'var(--accent-bright)' }}>Power BI</p>
              <h1 className="text-xl font-bold text-white">{company.name}</h1>
            </div>
          </div>
        </header>

        {loading ? (
          <div
            className="rounded-2xl px-6 py-10 text-sm"
            style={{ background: 'var(--portal-surface)', border: '1px solid var(--portal-border)', color: 'var(--text-muted)' }}
          >
            Carregando modelos do Power BI...
          </div>
        ) : error ? (
          <div
            className="rounded-2xl px-6 py-10 text-sm"
            style={{ background: 'rgba(244, 124, 116,0.07)', border: '1px solid rgba(244, 124, 116,0.15)', color: '#F8B4AE' }}
          >
            {error}
          </div>
        ) : !hasReports ? (
          <div
            className="rounded-2xl px-6 py-10 text-sm"
            style={{ background: 'var(--portal-surface)', border: '1px dashed var(--portal-border)', color: 'var(--text-muted)' }}
          >
            Nenhum modelo de Power BI foi configurado para esta empresa ainda.
          </div>
        ) : (
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {reports.map(report => (
              <div
                key={report.id}
                className="portal-card relative overflow-hidden rounded-lg p-6"
                style={{
                  background: 'var(--portal-surface)',
                }}
              >
                <div
                  className="absolute inset-x-0 top-0 h-px"
                  style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(201, 164, 92,0.45) 50%, transparent 100%)' }}
                />

                <div
                  className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: 'var(--portal-gold-soft)', color: 'var(--accent-bright)' }}
                >
                  <PieChart size={18} />
                </div>

                <h2 className="portal-title text-base font-semibold">{report.label || report.reportName}</h2>
                <p className="portal-copy mt-1.5 line-clamp-2 text-sm">
                  {report.reportName || 'Relatório Power BI incorporado no portal.'}
                </p>

                <div
                  className="mt-4 rounded-xl p-3 text-sm"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div className="flex items-center gap-2" style={{ color: '#7E97BC' }}>
                    <Clock3 size={13} style={{ color: '#C9A45C' }} />
                    <span className="text-xs">Última atualização</span>
                  </div>
                  <p className="mt-1.5 text-xs" style={{ color: '#7E97BC' }}>{formatRefreshDate(report.lastRefreshAt)}</p>
                  {report.lastRefreshStatus ? (
                    <div
                      className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
                      style={{ background: 'rgba(201, 164, 92,0.08)', color: '#C9A45C' }}
                    >
                      <RefreshCw size={10} />
                      {report.lastRefreshStatus}
                    </div>
                  ) : null}
                </div>

                <Link
                  href={`/empresa/${company.slug}/power-bi/${report.id}`}
                  className="portal-primary-button mt-5 w-full justify-center"
                >
                  Acessar modelo
                </Link>
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  )
}
