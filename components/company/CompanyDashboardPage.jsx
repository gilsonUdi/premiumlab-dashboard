'use client'
import { useEffect, useMemo, useState } from 'react'
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

  const pageKey = mode === 'pps' ? PORTAL_PAGE_KEYS.PPS : PORTAL_PAGE_KEYS.ANALYSIS

  if (!state || !session || !company) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#171416] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-5 text-sm text-[#d8d2c8]">
          Carregando dashboard...
        </div>
      </main>
    )
  }

  if (!company.supabaseEnabled && company.externalDashboardUrl) {
    return <PlaceholderTool company={company} />
  }

  if (!canAccessPortalPage(company, session?.permissions, pageKey)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#141216] px-6 text-white">
        <div className="max-w-[720px] rounded-[30px] border border-white/8 bg-[#1c191d] p-8">
          <p className="text-sm uppercase tracking-[0.22em] text-[#bca27a]">Acesso restrito</p>
          <h1 className="mt-4 text-4xl font-semibold">{company.name}</h1>
          <p className="mt-4 text-base leading-8 text-[#c6c0b7]">
            Este usuario nao possui permissao para acessar {mode === 'pps' ? 'o PPS' : 'a Analise de Dados'} desta empresa.
          </p>
        </div>
      </main>
    )
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
