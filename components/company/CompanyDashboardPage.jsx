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

function PlaceholderTool({ company }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#141216] px-6 text-white">
      <div className="max-w-[720px] rounded-[30px] border border-white/8 bg-[#1c191d] p-8">
        <p className="text-sm uppercase tracking-[0.22em] text-[#bca27a]">Ferramenta em configuracao</p>
        <h1 className="mt-4 text-4xl font-semibold">{company.name}</h1>
        <p className="mt-4 text-base leading-8 text-[#c6c0b7]">
          O tenant ja esta preparado para receber o dashboard, mas a troca dinamica de banco por empresa ainda nao foi
          conectada para este modulo. O fluxo administrativo ja guarda os dados da empresa para os proximos passos.
        </p>
      </div>
    </main>
  )
}

export default function CompanyDashboardPage({ slug }) {
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
          router.replace(`/empresa/${currentSession.companySlug}/dashboard`)
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
  }, [router, slug])

  const company = useMemo(() => {
    if (!state) return null
    return getCompanyBySlug(state, slug) || (session?.companyId ? getCompanyById(state, session.companyId) : null)
  }, [session?.companyId, slug, state])

  if (!state || !session || !company) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#171416] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-5 text-sm text-[#d8d2c8]">
          Carregando dashboard...
        </div>
      </main>
    )
  }

  if (!company.isPremiumLab) {
    return <PlaceholderTool company={company} />
  }

  return (
    <ProductionDashboard
      companyName={company.name}
      companySubtitle="Dashboard de Producao"
      backHref={`/empresa/${company.slug}`}
    />
  )
}
