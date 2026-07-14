'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, SquareArrowOutUpRight } from 'lucide-react'
import {
  getCompanyById,
  getCompanyBySlug,
  getCurrentPortalSession,
  loadCompanyState,
} from '@/lib/portal-store'
import {
  canAccessPortalPage,
  getExternalDashboardCatalog,
  PORTAL_PAGE_KEYS,
} from '@/lib/portal-config'

export default function ExternalDashboardCatalogPage({ slug }) {
  const router = useRouter()
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
          router.replace(`/empresa/${currentSession.companySlug}/externo`)
          return
        }

        const portalState = await loadCompanyState(slug)
        if (!active) return
        setState(portalState)
        setSession(currentSession)
      } catch (error) {
        console.error(error)
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

  const dashboards = useMemo(() => getExternalDashboardCatalog(company || {}), [company])

  if (!state || !session || !company) {
    return (
      <main className="portal-page flex min-h-screen items-center justify-center">
        <div className="rounded-2xl px-6 py-4 text-sm" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#6b6358' }}>
          Carregando dashboards externos...
        </div>
      </main>
    )
  }

  if (!canAccessPortalPage(company, session.permissions, PORTAL_PAGE_KEYS.EXTERNAL_DASHBOARD)) {
    return (
      <main className="portal-page flex min-h-screen items-center justify-center px-6">
        <div className="portal-panel max-w-[600px] rounded-lg p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--accent-bright)' }}>Acesso restrito</p>
          <h1 className="mt-3 text-3xl font-bold text-white">{company.name}</h1>
          <p className="mt-3 text-sm leading-7" style={{ color: '#5c554e' }}>
            Este usuario nao possui permissao para acessar os dashboards externos desta empresa.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="portal-page">
      <div className="mx-auto max-w-[1380px] px-5 py-5">
        <header className="mb-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href={`/empresa/${company.slug}`} className="inline-flex h-9 w-9 items-center justify-center rounded-xl transition" style={{ background: 'rgba(255,255,255,0.05)', color: '#6b6358' }}>
              <ArrowLeft size={16} />
            </Link>
            <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: 'var(--accent-bright)' }}>Dashboard externo</p>
              <h1 className="text-xl font-bold text-white">{company.name}</h1>
            </div>
          </div>
        </header>

        {dashboards.length === 0 ? (
          <div className="portal-card rounded-lg border-dashed px-6 py-10 text-sm portal-muted">
            Nenhum dashboard externo foi configurado para esta empresa ainda.
          </div>
        ) : (
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {dashboards.map(dashboard => (
              <div
                key={dashboard.id}
                className="portal-card relative overflow-hidden rounded-lg p-6"
                style={{
                  background: 'var(--portal-surface)',
                }}
              >
                <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(227,173,90,0.45) 50%, transparent 100%)' }} />

                <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--portal-gold-soft)', color: 'var(--accent-bright)' }}>
                  <SquareArrowOutUpRight size={18} />
                </div>

                <h2 className="portal-title text-base font-semibold">{dashboard.label}</h2>
                <p className="portal-copy mt-1.5 line-clamp-2 text-sm">
                  Painel externo incorporado no portal desta empresa.
                </p>

                <Link href={`/empresa/${company.slug}/externo/${dashboard.id}`} className="portal-primary-button mt-5 w-full justify-center">
                  Acessar dashboard
                </Link>
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  )
}
