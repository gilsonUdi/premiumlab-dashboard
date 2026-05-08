'use client'
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BarChart3, LayoutPanelTop, LogOut, PieChart, Settings2, SquareArrowOutUpRight } from 'lucide-react'
import {
  clearPortalSession,
  getCompanyById,
  getCompanyBySlug,
  getCurrentPortalSession,
  loadCompanyState,
} from '@/lib/portal-store'
import { canAccessPortalPage, PORTAL_PAGE_KEYS } from '@/lib/portal-config'

const TOOL_CARDS = [
  {
    key: 'analysis',
    href: slug => `/empresa/${slug}/dashboard`,
    title: 'Analise de Dados',
    description: 'Indicadores, historico, rastreabilidade e exportacao das tabelas em Excel.',
    icon: BarChart3,
  },
  {
    key: 'pps',
    href: slug => `/empresa/${slug}/pps`,
    title: 'PPS',
    description: 'Modo enxuto com foco operacional no historico de pedidos e leitura rapida da producao.',
    icon: LayoutPanelTop,
  },
  {
    key: 'powerBi',
    href: slug => `/empresa/${slug}/power-bi`,
    title: 'Power BI',
    description: 'Acesso interno ao painel Power BI publicado para esta empresa dentro do proprio portal.',
    icon: PieChart,
  },
]

export default function CompanyHomePage({ slug }) {
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
          router.replace(`/empresa/${currentSession.companySlug}`)
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

  const userPermissions = session?.permissions || null

  const handleLogout = async () => {
    await clearPortalSession()
    router.push('/login')
  }

  if (!state || !session || !company) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#171416] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-5 text-sm text-[#d8d2c8]">
          Carregando portal da empresa...
        </div>
      </main>
    )
  }

  const enabledInternalTools =
    company.tools.includes('dashboard')
      ? TOOL_CARDS.filter(tool =>
          canAccessPortalPage(
            company,
            userPermissions,
            tool.key === 'analysis'
              ? PORTAL_PAGE_KEYS.ANALYSIS
              : tool.key === 'pps'
                ? PORTAL_PAGE_KEYS.PPS
                : PORTAL_PAGE_KEYS.POWER_BI
          )
        )
          .filter(tool => {
            if (tool.key === 'powerBi') return company.powerBiEnabled && Boolean(company.powerBiEmbedUrl)
            return company.supabaseEnabled
          })
      : []
  const canUseExternalDashboard =
    !company.supabaseEnabled &&
    company.externalDashboardUrl &&
    canAccessPortalPage(company, userPermissions, PORTAL_PAGE_KEYS.EXTERNAL_DASHBOARD)

  return (
    <main className="min-h-screen bg-[#141216] px-6 py-6 text-white">
      <div className="mx-auto max-w-[1380px]">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[30px] border border-white/8 bg-[#1c191d] px-6 py-5">
          <div className="flex items-center gap-4">
            <Image src="/gs-logo.png" alt="GS Consultoria & Gestao" width={220} height={124} className="h-14 w-auto" />
            <div className="h-12 w-px bg-white/10" />
            <div>
              <p className="text-sm uppercase tracking-[0.22em] text-[#bca27a]">Portal da empresa</p>
              <h1 className="mt-1 text-3xl font-semibold">{company.name}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/" className="portal-ghost-button">
              <ArrowLeft size={16} />
              Home
            </Link>
            {session.type === 'admin' ? (
              <Link href="/admin" className="portal-ghost-button">
                <Settings2 size={16} />
                Administracao
              </Link>
            ) : null}
            <button onClick={handleLogout} className="portal-ghost-button">
              <LogOut size={16} />
              Sair
            </button>
          </div>
        </header>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {enabledInternalTools.length > 0 || canUseExternalDashboard ? (
            <>
              {canUseExternalDashboard ? (
                <Link
                  href={`/empresa/${company.slug}/dashboard`}
                  className="group rounded-[28px] border border-white/8 bg-[#1c191d] p-6 transition hover:border-[#e3ad5a]/40 hover:bg-[#221e22]"
                >
                  <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e3ad5a]/15 text-[#e3ad5a]">
                    <SquareArrowOutUpRight size={22} />
                  </div>
                  <h3 className="text-2xl font-semibold">Dashboard</h3>
                  <p className="mt-3 text-sm leading-7 text-[#bdb7ae]">
                    Acesso ao dashboard externo encapsulado dentro do portal desta empresa.
                  </p>
                  <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[#f1b867]">
                    Abrir dashboard
                    <ArrowLeft size={15} className="rotate-180 transition group-hover:translate-x-1" />
                  </div>
                </Link>
              ) : null}

              {enabledInternalTools.map(tool => {
              const Icon = tool.icon
              return (
                <Link
                  key={tool.key}
                  href={tool.href(company.slug)}
                  className="group rounded-[28px] border border-white/8 bg-[#1c191d] p-6 transition hover:border-[#e3ad5a]/40 hover:bg-[#221e22]"
                >
                  <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e3ad5a]/15 text-[#e3ad5a]">
                    <Icon size={22} />
                  </div>
                  <h3 className="text-2xl font-semibold">{tool.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#bdb7ae]">{tool.description}</p>
                  <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[#f1b867]">
                    Abrir ferramenta
                    <ArrowLeft size={15} className="rotate-180 transition group-hover:translate-x-1" />
                  </div>
                </Link>
              )
            })}
            </>
          ) : (
            <div className="rounded-[28px] border border-dashed border-white/10 bg-[#1c191d] p-6">
              <h3 className="text-2xl font-semibold">Sem ferramentas liberadas</h3>
              <p className="mt-3 text-sm leading-7 text-[#bdb7ae]">
                A administracao da GS ainda nao liberou modulos para este tenant.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
