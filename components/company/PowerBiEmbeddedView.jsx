'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { PowerBIEmbed } from 'powerbi-client-react'
import { models } from 'powerbi-client'
import { ArrowLeft, ChevronRight, Maximize2, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { getPortalAuthHeaders } from '@/lib/portal-store'

export default function PowerBiEmbeddedView({ company, reportKey }) {
  const [config, setConfig] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [activePageName, setActivePageName] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isMobileLayout, setIsMobileLayout] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
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
    const syncFullscreen = () => {
      setIsFullscreen(Boolean(document.fullscreenElement) || document.body.classList.contains('power-bi-mobile-fullscreen'))
    }

    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen)
      document.body.classList.remove('power-bi-mobile-fullscreen')
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
          throw new Error(payload.error || 'Não foi possível preparar o Power BI.')
        }
        if (!active) return
        setConfig(payload)
        setActivePageName(payload.initialPageName || '')
      } catch (embedError) {
        console.error(embedError)
        if (!active) return
        setError(embedError.message || 'Não foi possível carregar o Power BI.')
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

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        setIsFullscreen(false)
        return
      }

      if (isFullscreen) {
        if (reportRef.current?.exitFullscreen) await reportRef.current.exitFullscreen()
        document.body.classList.remove('power-bi-mobile-fullscreen')
        setIsFullscreen(false)
        return
      }

      if (embedShellRef.current?.requestFullscreen) {
        await embedShellRef.current.requestFullscreen()
        setIsFullscreen(true)
        return
      }

      if (reportRef.current?.fullscreen) {
        await reportRef.current.fullscreen()
        setIsFullscreen(true)
        return
      }

      document.body.classList.add('power-bi-mobile-fullscreen')
      setIsFullscreen(true)
    } catch (fullscreenError) {
      console.error(fullscreenError)
      document.body.classList.add('power-bi-mobile-fullscreen')
      setIsFullscreen(true)
    }
  }

  const sidebarPages = config?.pages || []

  return (
    <main className="relative h-screen overflow-hidden text-white" style={{ background: '#0c0a08' }}>
      <Link
        href={`/empresa/${company.slug}`}
        aria-label="Voltar ao portal"
        className="absolute left-4 top-4 z-30 hidden h-11 w-11 items-center justify-center rounded-full text-white transition md:inline-flex md:left-6 md:top-6"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.07)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <ArrowLeft size={18} />
      </Link>

      <section className={`grid h-screen grid-cols-1 ${sidebarCollapsed ? 'lg:grid-cols-[64px_minmax(0,1fr)]' : 'lg:grid-cols-[272px_minmax(0,1fr)]'}`}>
        <aside
          className="hidden pt-20 lg:flex lg:min-h-0 lg:flex-col"
          style={{ background: '#0f0d0b', borderRight: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className={`${sidebarCollapsed ? 'px-2 pb-4' : 'px-5 pb-5'}`}>
            <div className={`flex items-start ${sidebarCollapsed ? 'justify-center' : 'justify-between gap-3'}`}>
              {sidebarCollapsed ? null : (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: '#c9924a' }}>Power BI</p>
                  <h1 className="mt-1 text-lg font-semibold text-white leading-tight">{config?.reportName || company.powerBiLabel || company.name}</h1>
                </div>
              )}
              <button
                type="button"
                aria-label={sidebarCollapsed ? 'Expandir páginas' : 'Recolher páginas'}
                className={`${sidebarCollapsed ? 'h-9 w-9' : 'h-9 w-9'} inline-flex shrink-0 items-center justify-center rounded-xl transition`}
                style={{ background: 'rgba(255,255,255,0.05)', color: '#8a8278' }}
                onClick={() => setSidebarCollapsed(previous => !previous)}
              >
                {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </button>
            </div>
          </div>

          <div className={`min-h-0 flex-1 overflow-y-auto ${sidebarCollapsed ? 'px-2 pb-6' : 'px-3 pb-6'}`}>
            {loading ? (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{ background: 'rgba(255,255,255,0.03)', color: '#5c554e' }}
              >
                Carregando páginas...
              </div>
            ) : error ? (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{ background: 'rgba(220,38,38,0.07)', color: '#f0c3c3' }}
              >
                {error}
              </div>
            ) : sidebarPages.length === 0 ? (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{ background: 'rgba(255,255,255,0.03)', color: '#5c554e' }}
              >
                Nenhuma página disponível neste relatório.
              </div>
            ) : (
              <div className="space-y-1.5">
                {sidebarPages.map(page => {
                  const isActive = activePageName === page.name
                  return (
                    <button
                      key={page.name}
                      type="button"
                      onClick={() => handleSelectPage(page.name)}
                      title={page.displayName || page.name}
                      className={`flex w-full items-center ${sidebarCollapsed ? 'justify-center px-1 py-3' : 'justify-between px-4 py-3'} rounded-xl text-left text-sm transition`}
                      style={
                        isActive
                          ? {
                              background: 'rgba(227,173,90,0.12)',
                              border: '1px solid rgba(227,173,90,0.22)',
                              color: '#e3ad5a',
                            }
                          : {
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid transparent',
                              color: '#8a8278',
                            }
                      }
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
                          <span className="pr-3 font-medium">{page.displayName || page.name}</span>
                          <ChevronRight size={14} style={{ color: isActive ? '#e3ad5a' : '#4a4238', flexShrink: 0 }} />
                        </>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </aside>

        <div className="min-w-0">
          <div className="h-full w-full" style={{ background: '#0c0a08' }}>
            {loading ? (
              <div className="flex h-full items-center justify-center px-6 text-sm" style={{ color: '#5c554e' }}>
                Preparando Power BI...
              </div>
            ) : error ? (
              <div className="flex h-full items-center justify-center px-6">
                <div
                  className="max-w-[600px] rounded-2xl p-8"
                  style={{ background: '#181410', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: '#c9924a' }}>Falha no Power BI</p>
                  <p className="mt-4 text-sm leading-7" style={{ color: '#6b6358' }}>{error}</p>
                </div>
              </div>
            ) : embedConfig ? (
              <div
                ref={embedShellRef}
                className={`relative h-full w-full overflow-hidden ${isFullscreen ? 'fixed inset-0 z-[80] h-[100dvh]' : ''}`}
                style={{ background: '#0c0a08' }}
              >
                <div
                  className="absolute inset-x-0 top-0 z-20 backdrop-blur"
                  style={{
                    background: 'rgba(12,10,8,0.9)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                  }}
                >
                  <div className="flex h-12 items-center justify-between gap-3 px-3 sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <Link
                        href={`/empresa/${company.slug}`}
                        aria-label="Voltar ao portal"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white transition md:hidden"
                        style={{ background: 'rgba(255,255,255,0.05)', color: '#8a8278' }}
                      >
                        <ArrowLeft size={16} />
                      </Link>
                      <span className="truncate text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: '#c9924a' }}>
                        GSControladoria
                      </span>
                    </div>
                    <button
                      type="button"
                      className="portal-ghost-button h-8 gap-1.5 px-3 text-xs"
                      onClick={toggleFullscreen}
                    >
                      <Maximize2 size={13} />
                      {isFullscreen ? 'Sair' : 'Tela cheia'}
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
                {isMobileLayout && sidebarPages.length > 0 ? (
                  <div
                    className="absolute inset-x-0 bottom-0 z-20 px-3 py-2 backdrop-blur"
                    style={{
                      background: 'rgba(12,10,8,0.92)',
                      borderTop: '1px solid rgba(255,255,255,0.05)',
                      boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
                    }}
                  >
                    <div className="flex gap-2 overflow-x-auto overscroll-x-contain">
                      {sidebarPages.map(page => {
                        const isActive = activePageName === page.name
                        return (
                          <button
                            key={page.name}
                            type="button"
                            onClick={() => handleSelectPage(page.name)}
                            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition"
                            style={
                              isActive
                                ? { background: 'rgba(227,173,90,0.15)', color: '#e3ad5a', border: '1px solid rgba(227,173,90,0.25)' }
                                : { background: 'rgba(255,255,255,0.05)', color: '#8a8278', border: '1px solid transparent' }
                            }
                          >
                            {page.displayName || page.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  )
}
