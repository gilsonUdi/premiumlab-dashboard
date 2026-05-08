'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Clock3, PieChart, RefreshCw } from 'lucide-react'
import {
  getCompanyById,
  getCompanyBySlug,
  getCurrentPortalSession,
  getPortalAccessToken,
  loadCompanyState,
} from '@/lib/portal-store'
import { canAccessPortalPage, PORTAL_PAGE_KEYS } from '@/lib/portal-config'

function formatRefreshDate(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return 'Atualizacao nao informada'

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return 'Atualizacao nao informada'

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
        const token = await getPortalAccessToken()
        const response = await fetch(`/api/power-bi/metadata?slug=${encodeURIComponent(company.slug)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
        })
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error || 'Nao foi possivel carregar os modelos do Power BI.')
        }
        if (!active) return
        setReports(Array.isArray(payload.reports) ? payload.reports : [])
      } catch (catalogError) {
        console.error(catalogError)
        if (!active) return
        setError(catalogError.message || 'Nao foi possivel carregar os modelos do Power BI.')
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
      <main className="flex min-h-screen items-center justify-center bg-[#141216] text-white">
        <div className="rounded-[28px] border border-white/8 bg-[#1c191d] px-6 py-5 text-sm text-[#d8d2c8]">
          Carregando modelos do Power BI...
        </div>
      </main>
    )
  }

  if (!canAccessPortalPage(company, session.permissions, PORTAL_PAGE_KEYS.POWER_BI)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#141216] px-6 text-white">
        <div className="max-w-[720px] rounded-[30px] border border-white/8 bg-[#1c191d] p-8">
          <p className="text-sm uppercase tracking-[0.22em] text-[#bca27a]">Acesso restrito</p>
          <h1 className="mt-4 text-4xl font-semibold">{company.name}</h1>
          <p className="mt-4 text-base leading-8 text-[#c6c0b7]">
            Este usuario nao possui permissao para acessar os modelos de Power BI desta empresa.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#141216] px-6 py-6 text-white">
      <div className="mx-auto max-w-[1380px]">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href={`/empresa/${company.slug}`}
              className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.05] text-white transition hover:bg-white/[0.1]"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <p className="text-sm uppercase tracking-[0.22em] text-[#bca27a]">Power BI</p>
              <h1 className="mt-1 text-3xl font-semibold">{company.name}</h1>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-[28px] border border-white/8 bg-[#1c191d] px-6 py-10 text-sm text-[#d8d2c8]">
            Carregando modelos do Power BI...
          </div>
        ) : error ? (
          <div className="rounded-[28px] border border-red-500/20 bg-red-500/10 px-6 py-10 text-sm text-[#f0c3c3]">{error}</div>
        ) : !hasReports ? (
          <div className="rounded-[28px] border border-white/8 bg-[#1c191d] px-6 py-10 text-sm text-[#d8d2c8]">
            Nenhum modelo de Power BI foi configurado para esta empresa ainda.
          </div>
        ) : (
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {reports.map(report => (
              <div key={report.id} className="rounded-[28px] border border-white/8 bg-[#1c191d] p-6">
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e3ad5a]/15 text-[#e3ad5a]">
                  <PieChart size={22} />
                </div>

                <h2 className="text-2xl font-semibold">{report.label || report.reportName}</h2>
                <p className="mt-2 line-clamp-2 text-sm text-[#bdb7ae]">{report.reportName || 'Relatorio Power BI incorporado no portal.'}</p>

                <div className="mt-5 rounded-[22px] bg-white/[0.04] p-4 text-sm text-[#d8d2c8]">
                  <div className="flex items-center gap-2 text-[#e8ddcf]">
                    <Clock3 size={15} className="text-[#e3ad5a]" />
                    <span>Ultima atualizacao</span>
                  </div>
                  <p className="mt-2">{formatRefreshDate(report.lastRefreshAt)}</p>
                  {report.lastRefreshStatus ? (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1 text-xs uppercase tracking-[0.16em] text-[#bca27a]">
                      <RefreshCw size={12} />
                      {report.lastRefreshStatus}
                    </div>
                  ) : null}
                </div>

                <Link
                  href={`/empresa/${company.slug}/power-bi/${report.id}`}
                  className="mt-6 inline-flex h-12 items-center justify-center rounded-2xl bg-[#e3ad5a] px-5 text-sm font-semibold text-[#1a140f] transition hover:brightness-105"
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
