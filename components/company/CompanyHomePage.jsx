'use client'
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BarChart3, LayoutPanelTop, LogOut, MessageSquareText, PieChart, Settings2, SquareArrowOutUpRight } from 'lucide-react'
import {
  clearPortalSession,
  getCompanyById,
  getCompanyBySlug,
  getCurrentPortalSession,
  getPortalAuthHeaders,
  loadCompanyState,
} from '@/lib/portal-store'
import { canAccessPortalPage, PORTAL_PAGE_KEYS } from '@/lib/portal-config'
import { hasAnyPowerBiConfig } from '@/lib/power-bi'

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
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [feedbackStatus, setFeedbackStatus] = useState('')
  const [isSendingFeedback, setIsSendingFeedback] = useState(false)
  const [feedbackHistory, setFeedbackHistory] = useState([])
  const [feedbackHistoryLoading, setFeedbackHistoryLoading] = useState(false)
  const [isFeedbackPopupOpen, setIsFeedbackPopupOpen] = useState(false)

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

  const handleSendFeedback = async event => {
    event.preventDefault()
    setFeedbackStatus('')

    const text = String(feedbackMessage || '').trim()
    if (!text) {
      setFeedbackStatus('Digite uma sugestao antes de enviar.')
      return
    }

    setIsSendingFeedback(true)

    try {
      const response = await fetch('/api/company/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await getPortalAuthHeaders()),
        },
        body: JSON.stringify({
          tenant: company.slug,
          message: text,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Falha ao registrar sua sugestao.')
      }

      setFeedbackMessage('')
      setFeedbackStatus('Sugestao enviada com sucesso. Obrigado!')
      await loadFeedbackHistory()
    } catch (error) {
      console.error(error)
      setFeedbackStatus(error?.message || 'Falha ao enviar sugestao.')
    } finally {
      setIsSendingFeedback(false)
    }
  }

  const getFeedbackStatusLabel = status => {
    if (status === 'new') return 'Novo'
    if (status === 'concluido') return 'Concluido'
    if (status === 'em_progresso') return 'Em progresso'
    return 'Lido'
  }

  const getFeedbackCardClassName = status => {
    if (status === 'concluido') return 'border border-emerald-400/35 bg-white/[0.03]'
    if (status === 'em_progresso') return 'border border-sky-400/35 bg-white/[0.03]'
    return 'border border-white/8 bg-white/[0.03]'
  }

  const formatDateTime = value => {
    if (!value) return 'Nao informado'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return 'Nao informado'
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed)
  }

  const loadFeedbackHistory = async () => {
    setFeedbackHistoryLoading(true)
    try {
      const response = await fetch(`/api/company/feedback?tenant=${encodeURIComponent(company.slug)}`, {
        method: 'GET',
        headers: {
          ...(await getPortalAuthHeaders()),
        },
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Falha ao carregar historico.')
      }
      setFeedbackHistory(Array.isArray(payload.feedback) ? payload.feedback : [])
    } catch (error) {
      console.error(error)
    } finally {
      setFeedbackHistoryLoading(false)
    }
  }

  useEffect(() => {
    if (!company?.slug) return
    loadFeedbackHistory()
  }, [company?.slug])

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
            if (tool.key === 'powerBi') {
              return hasAnyPowerBiConfig(company)
            }
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

      <button
        type="button"
        aria-label="Abrir chat de sugestoes"
        onClick={() => setIsFeedbackPopupOpen(true)}
        className="fixed bottom-5 right-5 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full border border-[#e3ad5a]/45 bg-[#1c191d] text-[#e3ad5a] shadow-[0_10px_25px_rgba(0,0,0,0.35)] transition hover:bg-[#252026]"
      >
        <MessageSquareText size={21} />
      </button>

      {isFeedbackPopupOpen ? (
        <div className="fixed inset-0 z-40 flex items-end justify-end bg-black/40 p-4 sm:items-center sm:justify-center">
          <div className="w-full max-w-[860px] rounded-[28px] border border-white/10 bg-[#1c191d] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e3ad5a]/15 text-[#e3ad5a]">
                  <MessageSquareText size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Solicitar melhoria</h2>
                  <p className="text-sm text-[#bdb7ae]">Envie sugestoes ou necessidades para a equipe da GS.</p>
                </div>
              </div>
              <button type="button" className="portal-ghost-button h-10 px-3 py-1 text-xs" onClick={() => setIsFeedbackPopupOpen(false)}>
                Fechar
              </button>
            </div>

            <form className="space-y-3" onSubmit={handleSendFeedback}>
              <textarea
                className="portal-input min-h-[120px] w-full resize-y"
                placeholder="Descreva sua solicitacao ou sugestao..."
                value={feedbackMessage}
                onChange={event => setFeedbackMessage(event.target.value)}
                maxLength={3000}
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-[#9f968a]">{feedbackMessage.length}/3000</p>
                <button type="submit" className="portal-primary-button" disabled={isSendingFeedback}>
                  {isSendingFeedback ? 'Enviando...' : 'Enviar sugestao'}
                </button>
              </div>
              {feedbackStatus ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-[#d6cfc3]">{feedbackStatus}</div>
              ) : null}
            </form>

            <div className="mt-5 rounded-[22px] bg-white/[0.03] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-white">Historico de sugestoes</h3>
                <button type="button" className="portal-ghost-button h-9 px-3 py-1 text-xs" onClick={loadFeedbackHistory} disabled={feedbackHistoryLoading}>
                  Atualizar
                </button>
              </div>

              {feedbackHistoryLoading ? (
                <p className="text-sm text-[#bdb7ae]">Carregando...</p>
              ) : feedbackHistory.length === 0 ? (
                <p className="text-sm text-[#bdb7ae]">Voce ainda nao enviou sugestoes.</p>
              ) : (
                <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
                  {feedbackHistory.map(item => (
                    <article key={item.id} className={`rounded-xl p-3 ${getFeedbackCardClassName(item.status)}`}>
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-[#b8b0a6]">
                        <span className="portal-pill">{getFeedbackStatusLabel(item.status)}</span>
                        <span>{formatDateTime(item.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-[#e8e1d8]">{item.message}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
