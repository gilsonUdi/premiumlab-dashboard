'use client'

import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Building2, Clock3, Eye, RefreshCw } from 'lucide-react'
import { getPortalAccessToken } from '@/lib/portal-store'

function formatDuration(value) {
  const totalMinutes = Math.max(0, Math.round(Number(value || 0) / 60_000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h ${String(minutes).padStart(2, '0')}min`
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}min`
  return `${minutes} min`
}

function formatDateTime(value) {
  if (!value) return 'Não informado'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Não informado'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

export default function PowerBiPageAnalyticsPanel() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [days, setDays] = useState(30)
  const [companyId, setCompanyId] = useState('')
  const [reportKey, setReportKey] = useState('')
  const [sortBy, setSortBy] = useState('combined')

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const token = await getPortalAccessToken()
      const response = await fetch(`/api/admin/power-bi-page-analytics?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o uso das páginas.')
      setData(payload)
      setCompanyId(current => payload.companies?.some(company => company.id === current) ? current : payload.companies?.[0]?.id || '')
    } catch (loadError) {
      console.error(loadError)
      setError(loadError.message || 'Não foi possível carregar o uso das páginas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  const companyPages = useMemo(
    () => (data?.pages || []).filter(page => page.companyId === companyId),
    [companyId, data]
  )
  const reports = useMemo(
    () => [...new Map(companyPages.map(page => [page.reportKey, page.reportLabel])).entries()]
      .sort((left, right) => left[1].localeCompare(right[1], 'pt-BR')),
    [companyPages]
  )
  const pages = useMemo(
    () => {
      const rows = companyPages.filter(page => !reportKey || page.reportKey === reportKey)
      return rows.sort((left, right) => {
        if (sortBy === 'duration') return right.durationMs - left.durationMs || right.accesses - left.accesses
        if (sortBy === 'accesses') return right.accesses - left.accesses || right.durationMs - left.durationMs
        return right.usageScore - left.usageScore || right.durationMs - left.durationMs
      })
    },
    [companyPages, reportKey, sortBy]
  )

  useEffect(() => {
    if (reportKey && !reports.some(([key]) => key === reportKey)) setReportKey('')
  }, [reportKey, reports])

  const selectedCompany = (data?.companies || []).find(company => company.id === companyId)
  const filteredAccesses = pages.reduce((sum, page) => sum + page.accesses, 0)
  const filteredDuration = pages.reduce((sum, page) => sum + page.durationMs, 0)
  const topPage = pages[0]
  const sortLabel = sortBy === 'duration' ? 'tempo no BI' : sortBy === 'accesses' ? 'número de acessos' : 'média de acessos e tempo'

  const cards = [
    { label: 'Páginas utilizadas', value: pages.length, note: reportKey ? 'No modelo selecionado' : 'Em todos os modelos', icon: BarChart3 },
    { label: 'Acessos às páginas', value: filteredAccesses, note: `Últimos ${days} dias`, icon: Eye },
    { label: 'Tempo acumulado', value: formatDuration(filteredDuration), note: 'Somente usuários das empresas', icon: Clock3 },
    { label: 'Página mais usada', value: topPage?.pageLabel || 'Sem dados', note: topPage ? `Por ${sortLabel}` : 'Aguardando novos acessos', icon: Building2 },
  ]

  return (
    <div>
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#28497E' }}>Power BI</p>
          <h2 className="text-2xl font-bold tracking-tight text-white">Páginas mais acessadas</h2>
          <p className="mt-1 text-sm" style={{ color: '#AEC3DF' }}>Ranking por empresa baseado no número de acessos e no tempo de permanência em cada página.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="portal-input h-10 min-w-[150px]" value={days} onChange={event => setDays(Number(event.target.value))}>
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>
          <button type="button" className="portal-ghost-button" onClick={loadData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
      </header>

      {error ? <div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}

      <section className="mb-5 rounded-2xl p-4" style={{ background: '#0A162B', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs font-medium text-[#7E97BC]">
            <span className="mb-2 block uppercase tracking-[0.14em]">Empresa</span>
            <select className="portal-input w-full" value={companyId} onChange={event => setCompanyId(event.target.value)}>
              {(data?.companies || []).length === 0 ? <option value="">Nenhuma empresa com dados</option> : null}
              {(data?.companies || []).map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-[#7E97BC]">
            <span className="mb-2 block uppercase tracking-[0.14em]">Modelo Power BI</span>
            <select className="portal-input w-full" value={reportKey} onChange={event => setReportKey(event.target.value)} disabled={reports.length === 0}>
              <option value="">Todos os modelos</option>
              {reports.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-[#7E97BC]">
            <span className="mb-2 block uppercase tracking-[0.14em]">Ordenar por</span>
            <select className="portal-input w-full" value={sortBy} onChange={event => setSortBy(event.target.value)}>
              <option value="combined">Média de acessos e tempo</option>
              <option value="duration">Maior tempo no BI</option>
              <option value="accesses">Maior número de acessos</option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs leading-5 text-[#7E97BC]">
          Índice de uso: 50% do volume de acessos + 50% do tempo acumulado, comparados entre as páginas da mesma empresa. Acessos administrativos não entram no cálculo.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(card => {
          const Icon = card.icon
          return (
            <article key={card.label} className="rounded-2xl p-5" style={{ background: '#0A162B', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="text-xs uppercase tracking-[0.14em] text-[#7E97BC]">{card.label}</p><p className="mt-3 truncate text-2xl font-bold text-white" title={String(card.value)}>{card.value}</p></div>
                <span className="shrink-0 rounded-xl p-2.5 text-[#DAB975]" style={{ background: 'rgba(201,164,92,.1)' }}><Icon size={18} /></span>
              </div>
              <p className="mt-3 text-xs text-[#7E97BC]">{card.note}</p>
            </article>
          )
        })}
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl" style={{ background: '#0A162B', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex flex-col gap-1 border-b border-white/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-semibold text-white">Ranking de páginas</h3>
          {selectedCompany ? <span className="text-xs text-[#7E97BC]">{selectedCompany.name} · ordenado por {sortLabel}</span> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="text-[10px] uppercase tracking-[0.16em] text-[#7E97BC]">
              <tr><th className="px-5 py-3">Posição</th><th className="px-5 py-3">Página</th><th className="px-5 py-3">Modelo</th><th className="px-5 py-3 text-right">Índice médio</th><th className="px-5 py-3 text-right">Acessos</th><th className="px-5 py-3 text-right">Usuários</th><th className="px-5 py-3 text-right">Tempo total</th><th className="px-5 py-3 text-right">Média por acesso</th><th className="px-5 py-3">Último acesso</th></tr>
            </thead>
            <tbody>
              {pages.map((page, index) => (
                <tr key={page.id} className="border-t border-white/5 text-[#AEC3DF]">
                  <td className="px-5 py-4"><span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-white/5 px-2 font-semibold text-white">{index + 1}</span></td>
                  <td className="px-5 py-4"><p className="font-semibold text-white">{page.pageLabel}</p><p className="mt-1 text-xs text-[#7E97BC]">{page.pageName}</p></td>
                  <td className="px-5 py-4">{page.reportLabel}</td>
                  <td className="px-5 py-4 text-right"><div className="ml-auto w-28"><div className="mb-1 text-xs font-semibold text-[#DAB975]">{page.usageScore}</div><div className="h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-[#C9A45C]" style={{ width: `${page.usageScore}%` }} /></div></div></td>
                  <td className="px-5 py-4 text-right font-semibold text-white">{page.accesses}</td>
                  <td className="px-5 py-4 text-right">{page.users}</td>
                  <td className="px-5 py-4 text-right font-semibold text-white">{formatDuration(page.durationMs)}</td>
                  <td className="px-5 py-4 text-right">{formatDuration(page.averageDurationMs)}</td>
                  <td className="px-5 py-4">{formatDateTime(page.lastAccessAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && pages.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-medium text-white">Ainda não existem dados de páginas para este filtro.</p>
              <p className="mt-2 text-xs text-[#7E97BC]">A telemetria começa a ser preenchida conforme os usuários navegarem pelos relatórios após esta atualização.</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
