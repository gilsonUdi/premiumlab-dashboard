'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { PowerBIEmbed } from 'powerbi-client-react'
import { models } from 'powerbi-client'
import { ChevronRight, Maximize2, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { getPortalAuthHeaders } from '@/lib/portal-store'

export default function PowerBiEmbeddedView({ company, reportKey }) {
  const [config, setConfig] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [activePageName, setActivePageName] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isMobileLayout, setIsMobileLayout] = useState(false)
  const reportRef = useRef(null)
  const embedShellRef = useRef(null)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)')
    const syncLayout = () => setIsMobileLayout(mediaQuery.matches)

    syncLayout()
    mediaQuery.addEventListener('change', syncLayout)

    return () => {
      mediaQuery.removeEventListener('change', syncLayout)
    }
  }, [])

  useEffect(() => {
    let active = true

    async function loadConfig() {
      try {
        setLoading(true)
        setError('')
        const response = await fetch(
          `/api/power-bi/embed?slug=${encodeURIComponent(company.slug)}&report=${encodeURIComponent(reportKey)}`,
          {
            headers: await getPortalAuthHeaders(),
            cache: 'no-store',
          }
        )
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error || 'Nao foi possivel preparar o Power BI.')
        }
        if (!active) return
        setConfig(payload)
        setActivePageName(payload.initialPageName || '')
      } catch (embedError) {
        console.error(embedError)
        if (!active) return
        setError(embedError.message || 'Nao foi possivel carregar o Power BI.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadConfig()

    return () => {
      active = false
    }
  }, [company.slug, reportKey])

  const pageMap = useMemo(() => new Map((config?.pages || []).map(page => [page.name, page])), [config?.pages])

  const embedConfig = useMemo(() => {
    if (!config) return null

    return {
      type: 'report',
      id: config.reportId,
      embedUrl: config.embedUrl,
      accessToken: config.accessToken,
      tokenType: models.TokenType.Embed,
      pageName: activePageName || config.initialPageName || undefined,
      settings: {
        panes: {
          filters: { visible: false },
          pageNavigation: { visible: false },
        },
        navContentPaneEnabled: false,
        background: models.BackgroundType.Default,
        layoutType: isMobileLayout ? models.LayoutType.MobilePortrait : models.LayoutType.Master,
      },
      filters: Array.isArray(config.filters) ? config.filters : [],
    }
  }, [activePageName, config, isMobileLayout])

  useEffect(() => {
    if (!reportRef.current) return

    async function updateLayout() {
      try {
        await reportRef.current.updateSettings({
          layoutType: isMobileLayout ? models.LayoutType.MobilePortrait : models.LayoutType.Master,
        })
      } catch (layoutError) {
        console.error(layoutError)
      }
    }

    updateLayout()
  }, [isMobileLayout])

  const handleSelectPage = async pageName => {
    setActivePageName(pageName)
    if (!reportRef.current) return
    try {
      const pages = await reportRef.current.getPages()
      const nextPage = pages.find(page => page.name === pageName)
      if (nextPage) await nextPage.setActive()
    } catch (pageError) {
      console.error(pageError)
    }
  }

  const enterFullscreen = async () => {
    try {
      if (embedShellRef.current?.requestFullscreen) {
        await embedShellRef.current.requestFullscreen()
        return
      }
      if (reportRef.current?.fullscreen) await reportRef.current.fullscreen()
    } catch (fullscreenError) {
      console.error(fullscreenError)
    }
  }

  const sidebarPages = config?.pages || []

  return (
    <main className="relative h-screen overflow-hidden bg-[#0f0d11] text-white">
      <Link
        href={`/empresa/${company.slug}`}
        aria-label="Voltar ao portal"
        className="absolute left-4 top-4 z-30 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#1f1b20]/88 text-2xl text-white shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur transition hover:bg-[#2a242b] sm:left-6 sm:top-6"
      >
        <span aria-hidden="true">{'\u2190'}</span>
      </Link>

      <section className={`grid h-screen grid-cols-1 ${sidebarCollapsed ? 'lg:grid-cols-[72px_minmax(0,1fr)]' : 'lg:grid-cols-[290px_minmax(0,1fr)]'}`}>
        <aside className="hidden bg-[#141216] pt-24 lg:flex lg:min-h-0 lg:flex-col">
          <div className={`${sidebarCollapsed ? 'px-2 pb-4' : 'px-6 pb-5'}`}>
            <div className={`flex items-start ${sidebarCollapsed ? 'justify-center' : 'justify-between gap-3'}`}>
              {sidebarCollapsed ? null : (
                <h1 className="text-2xl font-semibold text-white">{config?.reportName || company.powerBiLabel || company.name}</h1>
              )}
              <button
                type="button"
                aria-label={sidebarCollapsed ? 'Expandir paginas' : 'Recolher paginas'}
                className={`${sidebarCollapsed ? 'h-10 w-10' : 'h-11 w-11'} inline-flex items-center justify-center rounded-full bg-white/[0.05] text-[#d9d1c7] transition hover:bg-white/[0.1]`}
                onClick={() => setSidebarCollapsed(previous => !previous)}
              >
                {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              </button>
            </div>
          </div>

          <div className={`min-h-0 flex-1 overflow-y-auto ${sidebarCollapsed ? 'px-2 pb-6' : 'px-4 pb-6'}`}>
            {loading ? (
              <div className="rounded-[22px] bg-white/[0.05] px-4 py-4 text-sm text-[#d8d2c8]">Carregando paginas...</div>
            ) : error ? (
              <div className="rounded-[22px] bg-red-500/10 px-4 py-4 text-sm text-[#f3c6c6]">{error}</div>
            ) : sidebarPages.length === 0 ? (
              <div className="rounded-[22px] bg-white/[0.05] px-4 py-4 text-sm text-[#d8d2c8]">
                Nenhuma pagina disponivel neste relatorio.
              </div>
            ) : (
              <div className="space-y-2">
                {sidebarPages.map(page => {
                  const isActive = activePageName === page.name
                  return (
                    <button
                      key={page.name}
                      type="button"
                      onClick={() => handleSelectPage(page.name)}
                      title={page.displayName || page.name}
                      className={`flex w-full items-center ${sidebarCollapsed ? 'justify-center px-1 py-3' : 'justify-between px-4 py-3'} rounded-[18px] text-left text-sm transition ${
                        isActive
                          ? 'bg-[#e3ad5a] text-[#17120c] shadow-[0_12px_30px_rgba(227,173,90,0.24)]'
                          : 'bg-white/[0.04] text-[#ddd5c8] hover:bg-white/[0.08]'
                      }`}
                    >
                      {sidebarCollapsed ? (
                        <span className="text-[11px] font-medium uppercase tracking-[0.18em]">
                          {String(page.displayName || page.name)
                            .split(/\s+/)
                            .map(word => word[0] || '')
                            .join('')
                            .slice(0, 3)}
                        </span>
                      ) : (
                        <>
                          <span className="pr-3">{page.displayName || page.name}</span>
                          <ChevronRight size={16} className={isActive ? 'text-[#17120c]' : 'text-[#8f877d]'} />
                        </>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </aside>

        <div className="min-w-0 pt-20 lg:pt-0">
          <div className="h-full w-full bg-[#0f0d11]">
            {loading ? (
              <div className="flex h-full items-center justify-center px-6 text-sm text-[#d8d2c8]">Preparando Power BI...</div>
            ) : error ? (
              <div className="flex h-full items-center justify-center px-6">
                <div className="max-w-[720px] rounded-[30px] border border-white/8 bg-[#1c191d] p-8">
                  <p className="text-sm uppercase tracking-[0.22em] text-[#bca27a]">Falha no Power BI</p>
                  <p className="mt-4 text-base leading-8 text-[#c6c0b7]">{error}</p>
                </div>
              </div>
            ) : embedConfig ? (
              <div ref={embedShellRef} className="relative h-full w-full overflow-hidden">
                <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-11 bg-[#141216]">
                  <div className="flex h-full items-center justify-between gap-3 px-4 sm:px-5">
                    <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-[#e3ad5a]">GSControladoria</span>
                    <button
                      type="button"
                      className="pointer-events-auto inline-flex h-8 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs font-medium text-[#efe9df] transition hover:border-white/20 hover:bg-white/[0.1]"
                      onClick={enterFullscreen}
                    >
                      <Maximize2 size={14} />
                      Tela cheia
                    </button>
                  </div>
                </div>
                <PowerBIEmbed
                  embedConfig={embedConfig}
                  cssClassName="h-full w-full"
                  getEmbeddedComponent={embeddedReport => {
                    reportRef.current = embeddedReport
                  }}
                  eventHandlers={
                    new Map([
                      [
                        'loaded',
                        async () => {
                          if (!reportRef.current) return
                          try {
                            await reportRef.current.updateSettings({
                              layoutType: isMobileLayout ? models.LayoutType.MobilePortrait : models.LayoutType.Master,
                            })
                            if (!activePageName) return
                            const pages = await reportRef.current.getPages()
                            const selectedPage = pages.find(page => page.name === activePageName)
                            if (selectedPage) await selectedPage.setActive()
                          } catch (loadError) {
                            console.error(loadError)
                          }
                        },
                      ],
                      [
                        'pageChanged',
                        event => {
                          const nextName = event?.detail?.newPage?.name || ''
                          if (!nextName) return
                          if (pageMap.size > 0 && !pageMap.has(nextName)) {
                            handleSelectPage(config.initialPageName)
                            return
                          }
                          setActivePageName(nextName)
                        },
                      ],
                      ['error', event => console.error(event?.detail || event)],
                    ])
                  }
                />
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  )
}
