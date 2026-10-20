'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { PowerBIEmbed } from 'powerbi-client-react'
import { models } from 'powerbi-client'
import { ArrowLeft, ChevronRight, Maximize2, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { getPortalAuthHeaders } from '@/lib/portal-store'
import { resolveCompanyChrome } from '@/lib/company-appearance'
import { observeReportViewport, readReportViewport, reportLayoutSettings, reportCanvasWidth, createReportLayoutUpdater } from '@/lib/power-bi-viewport.mjs'

import { attachReportGestures, clampReportZoom } from '@/lib/power-bi-gestures.mjs'

const TOKEN_REFRESH_INTERVAL_MS = 30 * 1000
const TOKEN_REFRESH_MARGIN_MS = 10 * 60 * 1000
const CAPACITY_POLL_MAX_ATTEMPTS = 72
const DASHBOARD_HEARTBEAT_INTERVAL_MS = 60 * 1000

function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

export default function PowerBiEmbeddedView({ company, reportKey }) {
  const companyChrome = useMemo(() => resolveCompanyChrome(company), [company])
  const [config, setConfig] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [activePageName, setActivePageName] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [viewport, setViewport] = useState({ mode: 'desktop', touch: false, compactPages: false })
  const isMobileDevice = viewport.touch
  const isLandscape = viewport.mode === 'landscape'
  const [reportZoom, setReportZoom] = useState(1)
  const [reportInteraction, setReportInteraction] = useState(false)
  const reportZoomRef = useRef(1)
  const zoomAnchorRef = useRef(null)
  const gestureSurfaceRef = useRef(null)
  const changeReportZoom = useCallback((value, anchor) => {
    const scroller = reportViewportRef.current
    if (!anchor && scroller) {
      const x = scroller.clientWidth / 2; const y = scroller.clientHeight / 2
      anchor = { x, y, contentX: (scroller.scrollLeft + x) / reportZoomRef.current,
        contentY: (scroller.scrollTop + y) / reportZoomRef.current }
    }
    zoomAnchorRef.current = anchor
    reportZoomRef.current = clampReportZoom(value)
    setReportZoom(reportZoomRef.current)
  }, [])
  const [tokenExpiration, setTokenExpiration] = useState('')
  const [pageAspectRatio, setPageAspectRatio] = useState(16 / 9)
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })
  const [scrollLeft, setScrollLeft] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [capacityMessage, setCapacityMessage] = useState('Preparando seu painel de indicadores. Aguarde alguns instantes...')
  const [sessionExpired, setSessionExpired] = useState(false)
  const reportRef = useRef(null)
  const reportLoadedRef = useRef(false)
  const embedShellRef = useRef(null)
  const reportViewportRef = useRef(null)
  const initialLayoutSettingsRef = useRef(null)
  const layoutSettingsRef = useRef(null)
  layoutSettingsRef.current = reportLayoutSettings(viewport.mode, models)
  const layoutUpdaterRef = useRef(null)
  if (!layoutUpdaterRef.current) {
    layoutUpdaterRef.current = createReportLayoutUpdater(
      () => reportRef.current,
      () => reportLoadedRef.current,
      () => layoutSettingsRef.current,
      layoutError => console.error('[power-bi:layout]', layoutError),
    )
  }
  const captureReport = useCallback(embeddedReport => {
    reportRef.current = embeddedReport
    reportLoadedRef.current = false
  }, [])
  const syncReportPageSize = useCallback(async () => {
    try {
      const page = await reportRef.current?.getActivePage()
      const { width, height } = page?.defaultSize || {}
      setPageAspectRatio(width > 0 && height > 0 ? width / height : 16 / 9)
    } catch (pageError) { console.error('[power-bi:page-size]', pageError) }
  }, [])
  const tokenRefreshPromiseRef = useRef(null)
  const pendingPageNameRef = useRef('')
  const pageNavigationRunningRef = useRef(false)
  const dashboardSessionIdRef = useRef('')
  const dashboardAuthHeadersRef = useRef(null)
  const dashboardSessionEndedRef = useRef(false)
  const dashboardPageRef = useRef({ name: '', label: '', sequence: 0 })
  const dashboardHeartbeatRef = useRef(null)

  const fetchEmbedConfig = useCallback(async () => {
    const headers = await getPortalAuthHeaders()
    dashboardAuthHeadersRef.current = headers

    for (let attempt = 0; attempt < CAPACITY_POLL_MAX_ATTEMPTS; attempt += 1) {
      const sessionQuery = dashboardSessionIdRef.current
        ? `&session=${encodeURIComponent(dashboardSessionIdRef.current)}`
        : ''
      const response = await fetch(
        `/api/power-bi/embed?slug=${encodeURIComponent(company.slug)}&report=${encodeURIComponent(reportKey)}${sessionQuery}`,
        { headers, cache: 'no-store' }
      )
      const payload = await response.json()

      if (payload.dashboardSessionId) dashboardSessionIdRef.current = payload.dashboardSessionId

      if (response.status === 202 && payload.status === 'preparing') {
        setCapacityMessage(payload.message || 'Preparando seu painel de indicadores. Aguarde alguns instantes...')
        await wait(Math.max(2000, Number(payload.retryAfterMs || 5000)))
        continue
      }
      if (!response.ok) {
        throw new Error(payload.error || 'Nao foi possivel preparar o Power BI.')
      }

      setCapacityMessage('')
      return payload
    }

    throw new Error('A capacidade do Power BI demorou mais que o esperado para iniciar. Tente novamente em alguns instantes.')
  }, [company.slug, reportKey])

  const endDashboardSession = useCallback(async reason => {
    const sessionId = dashboardSessionIdRef.current
    if (!sessionId || dashboardSessionEndedRef.current) return
    dashboardSessionEndedRef.current = true

    try {
      const headers = dashboardAuthHeadersRef.current || (await getPortalAuthHeaders())
      await fetch('/api/power-bi/session', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          sessionId,
          slug: company.slug,
          reportKey,
          reason,
        }),
        keepalive: true,
      })
    } catch (sessionError) {
      console.error('[power-bi:session-end]', sessionError)
    }
  }, [company.slug, reportKey])

  const refreshEmbedToken = useCallback(async () => {
    if (tokenRefreshPromiseRef.current) return tokenRefreshPromiseRef.current

    const refreshPromise = (async () => {
      const payload = await fetchEmbedConfig()

      if (reportRef.current && payload.accessToken) {
        await reportRef.current.setAccessToken(payload.accessToken)
      }

      // Updating embedConfig makes powerbi-client-react embed the report again.
      // Renew the running instance only; preserve page, filters and zoom.
      setTokenExpiration(payload.tokenExpiration || '')
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

  useEffect(() => observeReportViewport(window, setViewport), [])

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
        dashboardSessionEndedRef.current = false
        dashboardSessionIdRef.current = ''
        setSessionExpired(false)
        setCapacityMessage('Preparando seu painel de indicadores. Aguarde alguns instantes...')
        const payload = await fetchEmbedConfig()
        if (!active) return
        const initialPage = (payload.pages || []).find(page => page.name === payload.initialPageName)
        dashboardPageRef.current = {
          name: String(payload.initialPageName || ''),
          label: String(initialPage?.displayName || payload.initialPageName || ''),
          sequence: payload.initialPageName ? 1 : 0,
        }
        // Start with a mobile-capable layout even if opened in landscape.
        // The SDK can then switch orientation without resetting its iframe.
        const initialViewport = readReportViewport(window)
        initialLayoutSettingsRef.current = reportLayoutSettings(
          initialViewport.mode === 'desktop' ? 'landscape' : initialViewport.mode, models,
        )
        setTokenExpiration(payload.tokenExpiration || '')
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
  }, [fetchEmbedConfig])

  useEffect(() => {
    const sessionId = config?.dashboardSessionId || dashboardSessionIdRef.current
    if (!config?.capacityManaged || !sessionId) return undefined

    dashboardSessionIdRef.current = sessionId
    dashboardSessionEndedRef.current = false

    const heartbeat = async () => {
      if (dashboardSessionEndedRef.current) return

      try {
        const headers = dashboardAuthHeadersRef.current || (await getPortalAuthHeaders())
        const response = await fetch('/api/power-bi/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({
            sessionId,
            slug: company.slug,
            reportKey,
            pageName: dashboardPageRef.current.name,
            pageLabel: dashboardPageRef.current.label,
            pageSequence: dashboardPageRef.current.sequence,
          }),
          cache: 'no-store',
        })
        const payload = await response.json()
        if (!response.ok || payload.active === false) {
          setSessionExpired(true)
          dashboardSessionEndedRef.current = true
        }
      } catch (heartbeatError) {
        console.error('[power-bi:heartbeat]', heartbeatError)
      }
    }

    dashboardHeartbeatRef.current = heartbeat
    const handlePageHide = () => {
      endDashboardSession('closed')
    }

    heartbeat()
    const intervalId = window.setInterval(heartbeat, DASHBOARD_HEARTBEAT_INTERVAL_MS)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('pagehide', handlePageHide)
      if (dashboardHeartbeatRef.current === heartbeat) dashboardHeartbeatRef.current = null
      endDashboardSession('closed')
    }
  }, [company.slug, config?.capacityManaged, config?.dashboardSessionId, endDashboardSession, reportKey])

  useEffect(() => {
    if (!tokenExpiration) return undefined

    let active = true

    const checkTokenExpiration = async () => {
      const expirationTime = Date.parse(tokenExpiration)
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
  }, [tokenExpiration, refreshEmbedToken])

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
        ...initialLayoutSettingsRef.current,
      },
      filters: Array.isArray(config.filters) ? config.filters : [],
    }
  }, [config])
  const embedAvailable = Boolean(embedConfig)

  useEffect(() => {
    layoutUpdaterRef.current()
  }, [viewport.mode])

  useEffect(() => {
    const container = reportViewportRef.current
    if (!container) return undefined
    const measure = () => setFrameSize({ width: container.clientWidth, height: container.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [loading, error, sessionExpired, embedAvailable])

  const canvasWidth = reportCanvasWidth(frameSize.width, frameSize.height, viewport.mode, pageAspectRatio)
  const effectiveZoom = isLandscape ? reportZoom : 1
  const maxHorizontalScroll = Math.max(0, canvasWidth * effectiveZoom - frameSize.width)
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current
    const scroller = reportViewportRef.current
    if (!anchor || !scroller || !isLandscape) return
    scroller.scrollLeft = anchor.contentX * reportZoom - anchor.x
    scroller.scrollTop = anchor.contentY * reportZoom - anchor.y
    zoomAnchorRef.current = null
  }, [reportZoom, isLandscape])
  useEffect(() => {
    const surface = gestureSurfaceRef.current
    const scroller = reportViewportRef.current
    if (!isLandscape || reportInteraction || !surface || !scroller) return undefined
    return attachReportGestures(surface, scroller, () => reportZoomRef.current, changeReportZoom)
  }, [isLandscape, reportInteraction, changeReportZoom, embedAvailable, loading, error, sessionExpired])
  useEffect(() => {
    if (reportViewportRef.current) {
      reportViewportRef.current.scrollLeft = 0
      reportViewportRef.current.scrollTop = 0
    }
    reportZoomRef.current = 1
    zoomAnchorRef.current = null
    setReportZoom(1)
    setReportInteraction(false)
    setScrollLeft(0)
  }, [viewport.mode, activePageName])

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
    <main className={`portal-page relative h-[100dvh] overflow-hidden ${isLandscape ? 'power-bi-landscape' : ''}`}>
      <Link
        href={`/empresa/${company.slug}/power-bi`}
        aria-label="Voltar ao portal"
        className={`absolute left-4 top-4 z-30 hidden h-11 w-11 items-center justify-center rounded-full text-white transition ${isLandscape ? '' : 'md:inline-flex md:left-6 md:top-6'}`}
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.07)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <ArrowLeft size={18} />
      </Link>

      <section className={`grid h-[100dvh] min-h-0 grid-cols-1 ${sidebarCollapsed ? 'lg:grid-cols-[64px_minmax(0,1fr)]' : 'lg:grid-cols-[272px_minmax(0,1fr)]'}`}
        style={isLandscape ? { gridTemplateColumns: `${sidebarCollapsed ? 52 : 160}px minmax(0, 1fr)` } : undefined}>
        <aside
          className={isLandscape ? 'power-bi-pages-sidebar flex min-h-0 flex-col pt-2' : 'hidden pt-20 lg:flex lg:min-h-0 lg:flex-col'}
          aria-label="Páginas do relatório"
          style={{ background: companyChrome.background, borderRight: `1px solid ${companyChrome.border}`, color: companyChrome.foreground }}
        >
          <div className={`shrink-0 ${sidebarCollapsed ? 'px-2 pb-2' : isLandscape ? 'px-3 pb-2' : 'px-5 pb-5'}`}>
            <div className={`flex items-start ${sidebarCollapsed ? 'justify-center' : 'justify-between gap-3'}`}>
              {sidebarCollapsed ? null : (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: companyChrome.muted }}>Power BI</p>
                  <h1 className={`mt-1 font-semibold leading-tight ${isLandscape ? 'text-xs' : 'text-lg'}`} style={{ color: companyChrome.foreground }}>{config?.reportName || company.powerBiLabel || company.name}</h1>
                </div>
              )}
              <button
                type="button"
                aria-label={sidebarCollapsed ? 'Expandir páginas' : 'Recolher páginas'}
                className={`${sidebarCollapsed ? 'h-9 w-9' : 'h-9 w-9'} inline-flex shrink-0 items-center justify-center rounded-xl transition`}
                style={{ background: companyChrome.subtle, color: companyChrome.muted }}
                onClick={() => setSidebarCollapsed(previous => !previous)}
              >
                {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </button>
            </div>
          </div>

          <div className={`power-bi-pages-scroll min-h-0 flex-1 overflow-y-auto ${sidebarCollapsed ? 'px-2 pb-3' : 'px-3 pb-3'}`}
            tabIndex={0} aria-label="Lista de páginas do relatório">
            {loading ? (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{ background: companyChrome.subtle, color: companyChrome.muted }}
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
                style={{ background: companyChrome.subtle, color: companyChrome.muted }}
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
                      className={`flex w-full items-center ${sidebarCollapsed ? 'justify-center px-1 py-3' : isLandscape ? 'justify-between px-2 py-2' : 'justify-between px-4 py-3'} rounded-xl text-left ${isLandscape ? 'text-xs' : 'text-sm'} transition`}
                      style={
                        isActive
                          ? {
                              background: companyChrome.subtle,
                              border: `1px solid ${companyChrome.border}`,
                              color: companyChrome.foreground,
                            }
                          : {
                              background: companyChrome.subtle,
                              border: '1px solid transparent',
                              color: companyChrome.muted,
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
                          <ChevronRight size={14} style={{ color: isActive ? companyChrome.foreground : companyChrome.muted, flexShrink: 0 }} />
                        </>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </aside>

        <div className="min-h-0 min-w-0">
          <div className="h-full min-h-0 w-full" style={{ background: 'var(--portal-bg)' }}>
            {loading ? (
              <div className="flex h-full items-center justify-center px-6 text-sm" style={{ color: '#AEC3DF' }}>
                {capacityMessage || 'Preparando seu painel de indicadores. Aguarde alguns instantes...'}
              </div>
            ) : sessionExpired ? (
              <div className="flex h-full items-center justify-center px-6">
                <div
                  className="max-w-[600px] rounded-2xl p-8 text-center"
                  style={{ background: '#112345', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: '#C9A45C' }}>Sessão encerrada</p>
                  <p className="mt-4 text-sm leading-7" style={{ color: '#7E97BC' }}>
                    Esta janela perdeu a sessão ativa do Power BI. Reabra o painel para continuar.
                  </p>
                  <button
                    type="button"
                    className="portal-primary-button mt-6 h-10 px-5 text-sm"
                    onClick={() => window.location.reload()}
                  >
                    Abrir painel novamente
                  </button>
                </div>
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
                className={`relative flex h-full w-full flex-col overflow-hidden ${isFullscreen ? 'fixed inset-0 z-[80] h-[100dvh]' : ''}`}
                style={{ background: '#0A162B', paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }}
              >
                <div
                  className="z-20 shrink-0 backdrop-blur"
                  style={{
                    paddingTop: 'env(safe-area-inset-top, 0px)',
                    background: companyChrome.background,
                    borderBottom: `1px solid ${companyChrome.border}`,
                    boxShadow: '0 4px 20px rgba(3, 8, 20, 0.3)',
                  }}
                >
                  <div className="flex h-10 items-center justify-between gap-2 px-3 sm:px-4">
                    <div className="flex min-w-0 items-center gap-2">
                      <Link
                        href={`/empresa/${company.slug}`}
                        aria-label="Voltar ao portal"
                        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition ${isLandscape ? '' : 'md:hidden'}`}
                        style={{ background: companyChrome.subtle, color: companyChrome.foreground }}
                      >
                        <ArrowLeft size={14} />
                      </Link>
                      <span className="truncate text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: companyChrome.foreground }}>
                        Axis
                      </span>
                    </div>
                    {isLandscape ? (
                      <div className="flex shrink-0 items-center gap-1" aria-label="Zoom do BI">
                        <button type="button" className="portal-ghost-button h-8 px-2 text-xs"
                          aria-pressed={reportInteraction} onClick={() => setReportInteraction(value => !value)}>
                          {reportInteraction ? 'Interagir' : 'Mover/zoom'}
                        </button>
                        <button type="button" className="portal-ghost-button h-8 px-2" aria-label="Diminuir zoom do BI"
                          disabled={reportZoom <= 1} onClick={() => changeReportZoom(reportZoom - 0.25)}>−</button>
                        <button type="button" className="portal-ghost-button h-8 px-2 text-xs" aria-label="Ajustar BI à tela"
                          onClick={() => changeReportZoom(1)}>{Math.round(reportZoom * 100)}%</button>
                        <button type="button" className="portal-ghost-button h-8 px-2" aria-label="Aumentar zoom do BI"
                          disabled={reportZoom >= 3} onClick={() => changeReportZoom(reportZoom + 0.25)}>+</button>
                      </div>
                    ) : null}
                    {!isMobileDevice ? (
                      <button
                        type="button"
                        className="portal-ghost-button h-7 gap-1.5 px-2.5 text-xs"
                        style={{ background: companyChrome.subtle, borderColor: companyChrome.border, color: companyChrome.foreground }}
                        onClick={toggleFullscreen}
                      >
                        <Maximize2 size={12} />
                        {isFullscreen ? 'Sair' : 'Tela cheia'}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="flex min-h-0 w-full flex-1 flex-col">
                  <div className="relative min-h-0 min-w-0 flex-1">
                  <div ref={reportViewportRef} className="power-bi-report-viewport h-full w-full overflow-auto"
                    onScroll={event => setScrollLeft(event.currentTarget.scrollLeft)}>
                    <div className="relative" style={{ width: canvasWidth ? canvasWidth * effectiveZoom : '100%',
                      height: frameSize.height ? frameSize.height * effectiveZoom : '100%', minWidth: '100%' }}>
                    <div className="absolute left-0 top-0" style={{ width: canvasWidth || '100%', height: frameSize.height || '100%',
                      transform: `scale(${effectiveZoom})`, transformOrigin: '0 0' }}>
                <PowerBIEmbed
                  embedConfig={embedConfig}
                  cssClassName="power-bi-report-frame h-full w-full"
                  getEmbeddedComponent={captureReport}
                  eventHandlers={
                    new Map([
                      [
                        'loaded',
                        async () => {
                          if (!reportRef.current) return
                          reportLoadedRef.current = true
                          try {
                            const currentPage = await reportRef.current.getActivePage()
                            if (currentPage?.name) {
                              const configuredPage = pageMap.get(currentPage.name)
                              const previousPage = dashboardPageRef.current
                              dashboardPageRef.current = {
                                name: currentPage.name,
                                label: configuredPage?.displayName || currentPage.displayName || currentPage.name,
                                sequence: previousPage.name === currentPage.name ? Math.max(1, previousPage.sequence) : previousPage.sequence + 1,
                              }
                              setActivePageName(currentPage.name)
                              dashboardHeartbeatRef.current?.()
                            }
                            await layoutUpdaterRef.current()
                            await syncReportPageSize()
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
                          const configuredPage = pageMap.get(nextName)
                          const previousPage = dashboardPageRef.current
                          dashboardPageRef.current = {
                            name: nextName,
                            label: configuredPage?.displayName || event?.detail?.newPage?.displayName || nextName,
                            sequence: previousPage.name === nextName ? Math.max(1, previousPage.sequence) : previousPage.sequence + 1,
                          }
                          setActivePageName(nextName)
                          syncReportPageSize()
                          dashboardHeartbeatRef.current?.()
                        },
                      ],
                      ['error', handlePowerBiError],
                    ])
                  }
                />
                    </div>
                    </div>
                  </div>
                  {isLandscape && !reportInteraction ? (
                    <div ref={gestureSurfaceRef} className="power-bi-gesture-surface absolute inset-0 z-10"
                      role="region" tabIndex={0} aria-label="BI: use pinça para ampliar e arraste para mover. Alterne para Interagir para usar filtros."
                      onKeyDown={event => {
                        const scroller = reportViewportRef.current
                        if (!scroller) return
                        if (event.key === '+' || event.key === '=') changeReportZoom(reportZoom + 0.25)
                        else if (event.key === '-') changeReportZoom(reportZoom - 0.25)
                        else if (event.key === 'ArrowRight') scroller.scrollLeft += 60
                        else if (event.key === 'ArrowLeft') scroller.scrollLeft -= 60
                        else if (event.key === 'ArrowDown') scroller.scrollTop += 60
                        else if (event.key === 'ArrowUp') scroller.scrollTop -= 60
                        else return
                        event.preventDefault()
                      }}>
                      <span className="pointer-events-none absolute bottom-1 left-2 rounded bg-black/70 px-2 py-1 text-[10px] text-white">
                        Pinça para zoom · arraste para mover · alterne para Interagir para usar filtros
                      </span>
                    </div>
                  ) : null}
                  </div>
                  {isLandscape ? (
                    <label className="flex h-8 shrink-0 items-center gap-2 px-3 text-[10px]" style={{ color: companyChrome.muted }}>
                      <span className="shrink-0">Mover painel</span>
                      <input type="range" min={0} max={maxHorizontalScroll} step={1}
                        aria-label="Mover relatório horizontalmente" className="min-w-0 flex-1"
                        disabled={maxHorizontalScroll <= 0} value={Math.min(scrollLeft, maxHorizontalScroll)}
                        onChange={event => {
                          if (reportViewportRef.current) reportViewportRef.current.scrollLeft = Number(event.target.value)
                        }} />
                    </label>
                  ) : null}
                {viewport.mode === 'portrait' && viewport.compactPages && sidebarPages.length > 0 ? (
                  <div
                    className="z-20 shrink-0 px-3 py-2 backdrop-blur"
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
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  )
}
                                                                                                                                                                                                                                                                                                                                                                                                                             