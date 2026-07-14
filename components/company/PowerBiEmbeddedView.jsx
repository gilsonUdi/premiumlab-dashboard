'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { PowerBIEmbed } from 'powerbi-client-react'
import { models } from 'powerbi-client'
import { ArrowLeft, ChevronRight, Maximize2, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { getPortalAuthHeaders } from '@/lib/portal-store'

const TOKEN_REFRESH_INTERVAL_MS = 30 * 1000
const TOKEN_REFRESH_MARGIN_MS = 10 * 60 * 1000

export default function PowerBiEmbeddedView({ company, reportKey }) {
  const [config, setConfig] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [activePageName, setActivePageName] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isMobileLayout, setIsMobileLayout] = useState(false)
  const [isMobileDevice, setIsMobileDevice] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const reportRef = useRef(null)
  const embedShellRef = useRef(null)
  const tokenRefreshPromiseRef = useRef(null)
  const reportLoadedRef = useRef(false)
  const pendingPageNameRef = useRef('')
  const pageNavigationRunningRef = useRef(false)

  const fetchEmbedConfig = useCallback(async () => {
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
    return payload
  }, [company.slug, reportKey])

  const refreshEmbedToken = useCallback(async () => {
    if (tokenRefreshPromiseRef.current) return tokenRefreshPromiseRef.current

    const refreshPromise = (async () => {
      const payload = await fetchEmbedConfig()

      if (reportRef.current && payload.accessToken) {
        await reportRef.current.setAccessToken(payload.accessToken)
      }

      setConfig(previous => ({
        ...(previous || payload),
        accessToken: payload.accessToken,
        tokenExpiration: payload.tokenExpiration,
      }))
      setError('')
      return payload
    })()

    tokenRefreshPromiseRef.current = refreshPromise
    try {
      return await refreshPromise
    } finally {
      tokenRefreshPromiseRef.current = null
    }
  }, [fetchEmbedConfig])

  useEffect(() => {
    const mobilePortraitQuery = window.matchMedia('(max-width: 767px) and (orientation: portrait)')
    const syncLayout = () => {
      const isPortrait = window.innerHeight >= window.innerWidth
      setIsMobileLayout(mobilePortraitQuery.matches || (window.innerWidth <= 767 && isPortrait))
    }
    const syncLayoutAfterViewportSettles = () => {
      syncLayout()
      window.setTimeout(syncLayout, 250)
    }

    syncLayout()
    mobilePortraitQuery.addEventListener('change', syncLayoutAfterViewportSettles)
    window.addEventListener('resize', syncLayoutAfterViewportSettles)
    window.addEventListener('orientationchange', syncLayoutAfterViewportSettles)

    return () => {
      mobilePortraitQuery.removeEventListener('change', syncLayoutAfterViewportSettles)
      window.removeEventListener('resize', syncLayoutAfterViewportSettles)
      window.removeEventListener('orientationchange', syncLayoutAfterViewportSettles)
    }
  }, [])

  useEffect(() => {
    const coarsePointerQuery = window.matchMedia('(hover: none) and (pointer: coarse)')
    const syncMobileDevice = () => {
      setIsMobileDevice(coarsePointerQuery.matches || navigator.maxTouchPoints > 0)
    }

    syncMobileDevice()
    coarsePointerQuery.addEventListener('change', syncMobileDevice)
    window.addEventListener('orientationchange', syncMobileDevice)

    return () => {
      coarsePointerQuery.removeEventListener('change', syncMobileDevice)
      window.removeEventListener('orientationchange', syncMobileDevice)
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

  useEffect(() => {
    if (!config?.tokenExpiration) return undefined

    let active = true

    const checkTokenExpiration = async () => {
      const expirationTime = Date.parse(config.tokenExpiration)
      if (!Number.isFinite(expirationTime)) return
      if (expirationTime - Date.now() > TOKEN_REFRESH_MARGIN_MS) return

      try {
        await refreshEmbedToken()
      } catch (refreshError) {
        if (active) console.error('[power-bi:token-refresh]', refreshError)
      }
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) checkTokenExpiration()
    }

    checkTokenExpiration()
    const intervalId = window.setInterval(checkTokenExpiration, TOKEN_REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      active = false
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [config?.tokenExpiration, refreshEmbedToken])

  const handlePowerBiError = useCallback(event => {
    const detail = event?.detail || event || {}
    console.error(detail)

    const errorText = [detail.errorCode, detail.message, detail.detailedMessage]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    if (/token|expired|unauthorized|forbidden|403/.test(errorText)) {
      refreshEmbedToken().catch(refreshError => {
        console.error('[power-bi:token-refresh-after-error]', refreshError)
      })
    }
  }, [refreshEmbedToken])

  const pageMap = useMemo(() => new Map((config?.pages || []).map(page => [page.name, page])), [config?.pages])
  const powerBiLayoutType = isMobileLayout ? models.LayoutType.MobilePortrait : models.LayoutType.Master
  const powerBiLayoutKey = isMobileLayout ? 'mobile-portrait' : 'web-master'

  const runPendingPageNavigation = useCallback(async () => {
    if (pageNavigationRunningRef.current || !reportLoadedRef.current || !reportRef.current) return

    pageNavigationRunningRef.current = true
    try {
      while (pendingPageNameRef.current && reportLoadedRef.current && reportRef.current) {
        const pageName = pendingPageNameRef.current
        pendingPageNameRef.current = ''

        try {
          await reportRef.current.setPage(pageName)
          if (!pendingPageNameRef.current) setActivePageName(pageName)
        } catch (pageError) {
          console.error(pageError)
        }
      }
    } finally {
      pageNavigationRunningRef.current = false
      if (pendingPageNameRef.current) runPendingPageNavigation()
    }
  }, [])

  const handleSelectPage = useCallback(pageName => {
    if (!pageName || (pageMap.size > 0 && !pageMap.has(pageName))) return
    pendingPageNameRef.current = pageName
    setActivePageName(pageName)
    runPendingPageNavigation()
  }, [pageMap, runPendingPageNavigation])

  const embedConfig = useMemo(() => {
    if (!config) return null

    return {
      type: 'report',
      id: config.reportId,
      embedUrl: config.embedUrl,
      accessToken: config.accessToken,
      tokenType: models.TokenType.Embed,
      pageName: config.initialPageName || undefined,
      settings: {
        panes: {
          filters: { visible: false },
          pageNavigation: { visible: false },
        },
        navContentPaneEnabled: false,
        background: models.BackgroundType.Default,
        layoutType: powerBiLayoutType,
      },
      filters: Array.isArray(config.filters) ? config.filters : [],
    }
  }, [config, powerBiLayoutType])

  useEffect(() => {
    if (!reportRef.current) return

    async function updateLayout() {
      try {
        await reportRef.current.updateSettings({
          layoutType: powerBiLayoutType,
        })
      } catch (layoutError) {
        console.error(layoutError)
      }
    }

    updateLayout()
  }, [powerBiLayoutType])

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
    <main className="portal-page relative h-[100dvh] overflow-hidden">
      <Link
        href={`/empresa/${company.slug}/power-bi`}
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

      <section className={`grid h-[100dvh] grid-cols-1 ${sidebarCollapsed ? 'lg:grid-cols-[64px_minmax(0,1fr)]' : 'lg:grid-cols-[272px_minmax(0,1fr)]'}`}>
        <aside
          className="hidden pt-20 lg:flex lg:min-h-0 lg:flex-col"
          style={{ background: 'var(--portal-sidebar)', borderRight: '1px solid var(--portal-border)' }}
        >
          <div className={`${sidebarCollapsed ? 'px-2 pb-4' : 'px-5 pb-5'}`}>
            <div className={`flex items-start ${sidebarCollapsed ? 'justify-center' : 'justify-between gap-3'}`}>
              {sidebarCollapsed ? null : (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: '#C9A45C' }}>Power BI</p>
                  <h1 className="mt-1 text-lg font-semibold text-white leading-tight">{config?.reportName || company.powerBiLabel || company.name}</h1>
                </div>
              )}
              <button
                type="button"
                aria-label={sidebarCollapsed ? 'Expandir páginas' : 'Recolher páginas'}
                className={`${sidebarCollapsed ? 'h-9 w-9' : 'h-9 w-9'} inline-flex shrink-0 items-center justify-center rounded-xl transition`}
                style={{ background: 'rgba(255,255,255,0.05)', color: '#7E97BC' }}
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
                style={{ background: 'rgba(255,255,255,0.03)', color: '#AEC3DF' }}
              >
                Carregando páginas...
              </div>
            ) : error ? (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{ background: 'rgba(244, 124, 116,0.07)', color: '#F8B4AE' }}
              >
                {error}
              </div>
            ) : sidebarPages.length === 0 ? (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{ background: 'rgba(255,255,255,0.03)', color: '#AEC3DF' }}
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
                              background: 'rgba(201, 164, 92,0.12)',
                              border: '1px solid rgba(201, 164, 92,0.22)',
                              color: '#DAB975',
                            }
                          : {
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid transparent',
                              color: '#7E97BC',
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
                          <ChevronRight size={14} style={{ color: isActive ? '#DAB975' : '#28497E', flexShrink: 0 }} />
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
          <div className="h-full w-full" style={{ background: 'var(--portal-bg)' }}>
            {loading ? (
              <div className="flex h-full items-center justify-center px-6 text-sm" style={{ color: '#AEC3DF' }}>
                Preparando Power BI...
              </div>
            ) : error ? (
              <div className="flex h-full items-center justify-center px-6">
                <div
                  className="max-w-[600px] rounded-2xl p-8"
                  style={{ background: '#112345', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: '#C9A45C' }}>Falha no Power BI</p>
                  <p className="mt-4 text-sm leading-7" style={{ color: '#7E97BC' }}>{error}</p>
                </div>
              </div>
            ) : embedConfig ? (
              <div
                ref={embedShellRef}
                className={`relative h-full w-full overflow-hidden ${isFullscreen ? 'fixed inset-0 z-[80] h-[100dvh]' : ''}`}
                style={{ background: '#0A162B' }}
              >
                <div
                  className="absolute inset-x-0 top-0 z-20 backdrop-blur"
                  style={{
                    paddingTop: 'env(safe-area-inset-top, 0px)',
                    background: 'rgba(13,29,56,0.9)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    boxShadow: '0 4px 20px rgba(3, 8, 20, 0.3)',
                  }}
                >
                  <div className="flex h-10 items-center justify-between gap-2 px-3 sm:px-4">
                    <div className="flex min-w-0 items-center gap-2">
                      <Link
                        href={`/empresa/${company.slug}`}
                        aria-label="Voltar ao portal"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white transition md:hidden"
                        style={{ background: 'rgba(255,255,255,0.05)', color: '#7E97BC' }}
                      >
                        <ArrowLeft size={14} />
                      </Link>
                      <span className="truncate text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: '#C9A45C' }}>
                        Axis
                      </span>
                    </div>
                    {!isMobileDevice ? (
                      <button
                        type="button"
                        className="portal-ghost-button h-7 gap-1.5 px-2.5 text-xs"
                        onClick={toggleFullscreen}
                      >
                        <Maximize2 size={12} />
                        {isFullscreen ? 'Sair' : 'Tela cheia'}
                      </button>
                    ) : null}
                  </div>
                </div>
                <PowerBIEmbed
                  key={powerBiLayoutKey}
                  embedConfig={embedConfig}
                  cssClassName="h-full w-full"
                  getEmbeddedComponent={embeddedReport => {
                    reportRef.current = embeddedReport
                    reportLoadedRef.current = false
                  }}
                  eventHandlers={
                    new Map([
                      [
                        'loaded',
                        async () => {
                          if (!reportRef.current) return
                          reportLoadedRef.current = true
                          try {
                            await reportRef.current.updateSettings({
                              layoutType: powerBiLayoutType,
                            })
                            if (pendingPageNameRef.current) {
                              await runPendingPageNavigation()
                            }
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
                            if (!pendingPageNameRef.current) handleSelectPage(config.initialPageName)
                            return
                          }
                          if (pendingPageNameRef.current && pendingPageNameRef.current !== nextName) return
                          setActivePageName(nextName)
                        },
                      ],
                      ['error', handlePowerBiError],
                    ])
                  }
                />
                {isMobileLayout && sidebarPages.length > 0 ? (
                  <div
                    className="absolute inset-x-0 bottom-0 z-20 px-3 py-2 backdrop-blur"
                    style={{
                      paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))',
                      background: 'rgba(13,29,56,0.92)',
                      borderTop: '1px solid rgba(255,255,255,0.05)',
                      boxShadow: '0 -4px 20px rgba(3, 8, 20, 0.3)',
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
                                ? { background: 'rgba(201, 164, 92,0.15)', color: '#DAB975', border: '1px solid rgba(201, 164, 92,0.25)' }
                                : { background: 'rgba(255,255,255,0.05)', color: '#7E97BC', border: '1px solid transparent' }
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
