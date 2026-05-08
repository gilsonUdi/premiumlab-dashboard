'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { PowerBIEmbed } from 'powerbi-client-react'
import { models } from 'powerbi-client'
import { ChevronRight } from 'lucide-react'
import { getPortalAccessToken } from '@/lib/portal-store'

export default function PowerBiEmbeddedView({ company }) {
  const [config, setConfig] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [activePageName, setActivePageName] = useState('')
  const reportRef = useRef(null)

  useEffect(() => {
    let active = true

    async function loadConfig() {
      try {
        setLoading(true)
        setError('')
        const token = await getPortalAccessToken()
        const response = await fetch(`/api/power-bi/embed?slug=${encodeURIComponent(company.slug)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
        })
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
  }, [company.slug])

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
        background: models.BackgroundType.Transparent,
      },
    }
  }, [activePageName, config])

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

      <section className="grid h-screen grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden border-r border-white/6 bg-[#141216] pt-24 lg:flex lg:flex-col">
          <div className="px-6 pb-5">
            <p className="text-xs uppercase tracking-[0.24em] text-[#bca27a]">Power BI Embedded</p>
            <h1 className="mt-3 text-2xl font-semibold text-white">{config?.reportName || company.powerBiLabel || company.name}</h1>
            <p className="mt-2 text-sm leading-6 text-[#bcb5aa]">
              Navegue entre as paginas liberadas para este usuario.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
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
                      className={`flex w-full items-center justify-between rounded-[18px] px-4 py-3 text-left text-sm transition ${
                        isActive
                          ? 'bg-[#e3ad5a] text-[#17120c] shadow-[0_12px_30px_rgba(227,173,90,0.24)]'
                          : 'bg-white/[0.04] text-[#ddd5c8] hover:bg-white/[0.08]'
                      }`}
                    >
                      <span className="pr-3">{page.displayName || page.name}</span>
                      <ChevronRight size={16} className={isActive ? 'text-[#17120c]' : 'text-[#8f877d]'} />
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
                        if (!reportRef.current || !activePageName) return
                        try {
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
            ) : null}
          </div>
        </div>
      </section>
    </main>
  )
}
