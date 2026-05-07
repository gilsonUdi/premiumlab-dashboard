'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ProductionDashboard from '@/components/ProductionDashboard'
import {
  getCompanyById,
  getCompanyBySlug,
  getCurrentPortalSession,
  loadCompanyState,
} from '@/lib/portal-store'
import { canAccessPortalPage, getSectionVisibility, PORTAL_PAGE_KEYS } from '@/lib/portal-config'

function PlaceholderTool({ company }) {
  const usesExternalDashboard = !company.supabaseEnabled && company.externalDashboardUrl
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#141216] px-6 text-white">
      <div className="max-w-[720px] rounded-[30px] border border-white/8 bg-[#1c191d] p-8">
        <p className="text-sm uppercase tracking-[0.22em] text-[#bca27a]">
          {usesExternalDashboard ? 'Dashboard externo configurado' : 'Ferramenta em configuracao'}
        </p>
        <h1 className="mt-4 text-4xl font-semibold">{company.name}</h1>
        <p className="mt-4 text-base leading-8 text-[#c6c0b7]">
          {usesExternalDashboard
            ? 'Esta empresa usa um dashboard externo. Volte para o portal da empresa e abra o botao de Dashboard para seguir pelo link configurado.'
            : 'O tenant ja esta pronto, mas ainda falta cadastrar a service role do Supabase para este banco. Depois disso, o dashboard passa a operar normalmente para a empresa.'}
        </p>
      </div>
    </main>
  )
}

function ExternalDashboardFrame({ company }) {
  return (
    <main className="min-h-screen bg-[#141216] px-4 py-4 text-white sm:px-6 sm:py-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1480px] flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-white/8 bg-[#1c191d] px-5 py-4">
          <div>
            <p className="text-sm uppercase tracking-[0.22em] text-[#bca27a]">Dashboard externo</p>
            <h1 className="mt-1 text-2xl font-semibold">{company.name}</h1>
            <p className="mt-2 text-sm text-[#bdb7ae]">
              O dashboard esta sendo exibido dentro do portal da empresa. Se o fornecedor bloquear exibicao em iframe, sera necessario liberar o dominio do portal.
            </p>
          </div>

          <Link href={`/empresa/${company.slug}`} className="portal-ghost-button">
            Voltar ao portal
          </Link>
        </header>

        <section className="min-h-[78vh] overflow-hidden rounded-[30px] border border-white/8 bg-[#0f0d11] shadow-[0_30px_90px_rgba(0,0,0,0.32)]">
          <iframe
            title={`Dashboard externo de ${company.name}`}
            src={company.externalDashboardUrl}
            className="h-[78vh] w-full bg-white"
            referrerPolicy="no-referrer"
            allow="fullscreen"
          />
        </section>
      </div>
    </main>
  )
}

export default function CompanyDashboardPage({ slug, mode = 'analysis' }) {
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
          router.replace(`/empresa/${currentSession.companySlug}/${mode === 'pps' ? 'pps' : 'dashboard'}`)
          return
        }

        const portalState = await loadCompanyState(slug)

        if (!active) return
        setSession(currentSession)
        setState(portalState)
      } catch (error) {
        console.error(error)
        if (active) router.replace('/login')
      }
    }

    hydrate()

    return () => {
      active = false
    }
  }, [mode, router, slug])

  const company = useMemo(() => {
    if (!state) return null
    return getCompanyBySlug(state, slug) || (session?.companyId ? getCompanyById(state, session.companyId) : null)
  }, [session?.companyId, slug, state])

  const isExternalDashboard = !company?.supabaseEnabled && Boolean(company?.externalDashboardUrl)
  const pageKey = isExternalDashboard
    ? PORTAL_PAGE_KEYS.EXTERNAL_DASHBOARD
    : mode === 'pps'
      ? PORTAL_PAGE_KEYS.PPS
      : PORTAL_PAGE_KEYS.ANALYSIS

  if (!state || !session || !company) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#171416] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-5 text-sm text-[#d8d2c8]">
          Carregando dashboard...
        </div>
      </main>
    )
  }

  if (!canAccessPortalPage(company, session?.permissions, pageKey)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#141216] px-6 text-white">
        <div className="max-w-[720px] rounded-[30px] border border-white/8 bg-[#1c191d] p-8">
          <p className="text-sm uppercase tracking-[0.22em] text-[#bca27a]">Acesso restrito</p>
          <h1 className="mt-4 text-4xl font-semibold">{company.name}</h1>
          <p className="mt-4 text-base leading-8 text-[#c6c0b7]">
            Este usuario nao possui permissao para acessar {isExternalDashboard ? 'o dashboard externo' : mode === 'pps' ? 'o PPS' : 'a Analise de Dados'} desta empresa.
          </p>
        </div>
      </main>
    )
  }

  if (isExternalDashboard) {
    return <ExternalDashboardFrame company={company} />
  }

  if (!company.hasServiceRoleKey && !company.isPremiumLab) {
    return <PlaceholderTool company={company} />
  }

  const backHref = `/empresa/${company.slug}`

  return (
    <ProductionDashboard
      companyName={company.name}
      companySubtitle={mode === 'pps' ? 'PPS' : 'Analise de Dados'}
      backHref={backHref}
      tenantSlug={company.slug}
      mode={mode}
      sectionVisibility={getSectionVisibility(company, session?.permissions, mode === 'pps' ? 'pps' : 'analysis')}
    />
  )
}
