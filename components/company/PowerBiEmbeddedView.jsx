'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { PowerBIEmbed } from 'powerbi-client-react'
import { models } from 'powerbi-client'
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

  const pageMap = useMemo(() => {
    return new Map((config?.pages || []).map(page => [page.name, page]))
  }, [config?.pages])

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

  return (
    <main className="relative min-h-screen bg-[#0f0d11] text-white">
      <Link
        href={`/empresa/${company.slug}`}
        aria-label="Voltar ao portal"
        className="absolute left-4 top-4 z-30 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#1f1b20]/88 text-2xl text-white shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur transition hover:bg-[#2a242b] sm:left-6 sm:top-6"
      >
        <span aria-hidden="true">{'\u2190'}</span>
      </Link>

      <section className="flex min-h-screen flex-col">
        <div className="border-b border-white/6 bg-[#141216]/92 px-20 py-4 backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[#bca27a]">Power BI Embedded</p>
              <h1 className="mt-2 text-2xl font-semibold text-white">{config?.reportName || company.powerBiLabel || company.name}</h1>
            </div>

            {config?.pages?.length ? (
              <div className="flex flex-wrap gap-2">
                {config.pages.map(page => (
                  <button
                    key={page.name}
                    type="button"
                    onClick={() => handleSelectPage(page.name)}
                    className={`rounded-full px-4 py-2 text-sm transition ${
                      activePageName === page.name
                        ? 'bg-[#e3ad5a] text-[#1a1510]'
                        : 'bg-white/[0.06] text-[#ddd5c8] hover:bg-white/[0.1]'
                    }`}
                  >
                    {page.displayName || page.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex-1">
          {loading ? (
            <div className="flex h-[calc(100vh-88px)] items-center justify-center text-sm text-[#d8d2c8]">
              Preparando Power BI...
            </div>
          ) : error ? (
            <div className="flex h-[calc(100vh-88px)] items-center justify-center px-6">
              <div className="max-w-[720px] rounded-[30px] border border-white/8 bg-[#1c191d] p-8">
                <p className="text-sm uppercase tracking-[0.22em] text-[#bca27a]">Falha no Power BI</p>
                <p className="mt-4 text-base leading-8 text-[#c6c0b7]">{error}</p>
              </div>
            </div>
          ) : embedConfig ? (
            <div className="h-[calc(100vh-88px)] w-full bg-[#0f0d11]">
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
            </div>
          ) : null}
        </div>
      </section>
    </main>
  )
}

