'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, Clock3, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import { getPortalAccessToken } from '@/lib/portal-store'

function formatDateTime(value) {
  if (!value) return 'Não informado'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Não informado'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function formatDuration(value) {
  const totalMinutes = Math.max(0, Math.round(Number(value || 0) / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} min`
  return `${hours}h ${String(minutes).padStart(2, '0')}min`
}

function statusLabel(status, endReason) {
  if (status === 'active' || status === 'starting') return 'Em uso'
  if (endReason === 'inactivity' || status === 'expired') return 'Inatividade'
  return 'Encerrada'
}

export default function AccessAnalyticsPanel() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [days, setDays] = useState(30)
  const [company, setCompany] = useState('')
  const [search, setSearch] = useState('')
  const [showAdmin, setShowAdmin] = useState(true)

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const token = await getPortalAccessToken()
      const response = await fetch(`/api/admin/access-analytics?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar os acessos.')
      setData(payload)
    } catch (loadError) {
      console.error(loadError)
      setError(loadError.message || 'Não foi possível carregar os acessos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  const companies = useMemo(() => {
    const rows = [...(data?.users || []), ...(data?.timeline || [])]
    return [...new Map(rows.filter(row => row.companyId).map(row => [row.companyId, row.companyName || row.companyId])).entries()]
      .sort((left, right) => left[1].localeCompare(right[1], 'pt-BR'))
  }, [data])

  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR')
  const users = useMemo(() => (data?.users || []).filter(row => {
    if (company && row.companyId !== company) return false
    if (!normalizedSearch) return true
    return `${row.userName} ${row.userEmail} ${row.companyName} ${(row.tools || []).join(' ')}`
      .toLocaleLowerCase('pt-BR').includes(normalizedSearch)
  }), [company, data, normalizedSearch])

  const sessions = useMemo(() => (data?.powerBiSessions || []).filter(row => {
    if (company && row.companyId !== company) return false
    if (!showAdmin && row.isAdminAccess) return false
    if (!normalizedSearch) return true
    return `${row.userName} ${row.userEmail} ${row.companyName} ${row.toolLabel}`
      .toLocaleLowerCase('pt-BR').includes(normalizedSearch)
  }), [company, data, normalizedSearch, showAdmin])

  const timeline = useMemo(() => (data?.timeline || []).filter(row => {
    if (company && row.companyId !== company) return false
    if (!showAdmin && row.isAdminAccess) return false
    if (!normalizedSearch) return true
    return `${row.userName} ${row.userEmail} ${row.companyName} ${row.toolLabel}`
      .toLocaleLowerCase('pt-BR').includes(normalizedSearch)
  }), [company, data, normalizedSearch, showAdmin])

  const summaryCards = [
    { label: 'Usuários recentes', value: data?.summary?.recentUsers || 0, note: `Últimos ${days} dias`, icon: Users },
    { label: 'Acessos às ferramentas', value: data?.summary?.toolAccesses || 0, note: 'Sem acessos administrativos', icon: Activity },
    { label: 'Sessões Power BI', value: data?.summary?.powerBiSessions || 0, note: 'Sessões reais de usuários', icon: ShieldCheck },
    { label: 'Tempo no Power BI', value: formatDuration(data?.summary?.powerBiDurationMs), note: 'Total sem administração', icon: Clock3 },
  ]

  return (
    <div>
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#28497E' }}>Auditoria</p>
          <h2 className="text-2xl font-bold tracking-tight text-white">Acessos recentes</h2>
          <p className="mt-1 text-sm" style={{ color: '#AEC3DF' }}>Usuários, ferramentas utilizadas e duração das sessões do Power BI.</p>
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(card => {
          const Icon = card.icon
          return (
            <article key={card.label} className="rounded-2xl p-5" style={{ background: '#0A162B', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs uppercase tracking-[0.14em] text-[#7E97BC]">{card.label}</p><p className="mt-3 text-2xl font-bold text-white">{card.value}</p></div>
                <span className="rounded-xl p-2.5 text-[#DAB975]" style={{ background: 'rgba(201,164,92,.1)' }}><Icon size={18} /></span>
              </div>
              <p className="mt-3 text-xs text-[#7E97BC]">{card.note}</p>
            </article>
          )
        })}
      </section>

      <section className="mt-5 rounded-2xl p-4" style={{ background: '#0A162B', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="grid gap-3 md:grid-cols-[1fr_240px_auto]">
          <input className="portal-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar usuário, empresa ou ferramenta" />
          <select className="portal-input" value={company} onChange={event => setCompany(event.target.value)}>
            <option value="">Todas as empresas</option>
            {companies.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <label className="portal-checkbox min-h-10 px-3"><input type="checkbox" checked={showAdmin} onChange={event => setShowAdmin(event.target.checked)} /><span>Mostrar administração</span></label>
        </div>
        {data?.summary?.adminAccesses > 0 ? (
          <p className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/5 px-4 py-3 text-xs text-amber-200">
            {data.summary.adminAccesses} acesso(s) administrativo(s) estão identificados nas listas e não entram nos totais de utilização dos clientes.
          </p>
        ) : null}
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl" style={{ background: '#0A162B', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="border-b border-white/5 px-5 py-4"><h3 className="font-semibold text-white">Usuários e ferramentas</h3></div>
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="text-[10px] uppercase tracking-[0.16em] text-[#7E97BC]"><tr><th className="px-5 py-3">Usuário</th><th className="px-5 py-3">Empresa</th><th className="px-5 py-3">Último acesso</th><th className="px-5 py-3">Ferramentas</th><th className="px-5 py-3 text-right">Acessos</th><th className="px-5 py-3 text-right">Tempo no Power BI</th></tr></thead>
            <tbody>
              {users.map(row => (
                <tr key={row.id} className="border-t border-white/5 text-[#AEC3DF]"><td className="px-5 py-4"><p className="font-medium text-white">{row.userName}</p><p className="mt-1 text-xs text-[#7E97BC]">{row.userEmail}</p></td><td className="px-5 py-4">{row.companyName}</td><td className="px-5 py-4">{formatDateTime(row.lastAccessAt)}</td><td className="px-5 py-4"><div className="flex flex-wrap gap-1.5">{row.tools.map(tool => <span key={tool} className="portal-pill">{tool}</span>)}</div></td><td className="px-5 py-4 text-right">{row.accessCount}</td><td className="px-5 py-4 text-right font-semibold text-white">{formatDuration(row.powerBiDurationMs)}</td></tr>
              ))}
            </tbody>
          </table>
          {!loading && users.length === 0 ? <p className="px-5 py-10 text-center text-sm text-[#7E97BC]">Nenhum usuário encontrado neste período.</p> : null}
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl" style={{ background: '#0A162B', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="border-b border-white/5 px-5 py-4"><h3 className="font-semibold text-white">Sessões do Power BI</h3></div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="text-[10px] uppercase tracking-[0.16em] text-[#7E97BC]"><tr><th className="px-5 py-3">Usuário</th><th className="px-5 py-3">Empresa</th><th className="px-5 py-3">Modelo</th><th className="px-5 py-3">Início</th><th className="px-5 py-3">Situação</th><th className="px-5 py-3 text-right">Duração</th></tr></thead>
            <tbody>
              {sessions.map(row => (
                <tr key={row.id} className="border-t border-white/5 text-[#AEC3DF]"><td className="px-5 py-4"><div className="flex items-center gap-2"><div><p className="font-medium text-white">{row.userName}</p><p className="mt-1 text-xs text-[#7E97BC]">{row.userEmail}</p></div>{row.isAdminAccess ? <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[10px] font-semibold text-amber-200">ADMIN</span> : null}</div>{row.isAdminAccess ? <p className="mt-1 text-[11px] text-amber-200/70">Acesso feito pela administração{row.adminUserName ? `: ${row.adminUserName}` : ''}</p> : null}</td><td className="px-5 py-4">{row.companyName}</td><td className="px-5 py-4">{row.toolLabel}</td><td className="px-5 py-4">{formatDateTime(row.startAt)}</td><td className="px-5 py-4">{statusLabel(row.status, row.endReason)}</td><td className="px-5 py-4 text-right font-semibold text-white">{formatDuration(row.durationMs)}</td></tr>
              ))}
            </tbody>
          </table>
          {!loading && sessions.length === 0 ? <p className="px-5 py-10 text-center text-sm text-[#7E97BC]">Nenhuma sessão de Power BI encontrada.</p> : null}
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl" style={{ background: '#0A162B', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="border-b border-white/5 px-5 py-4"><h3 className="font-semibold text-white">Atividade recente</h3></div>
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="text-[10px] uppercase tracking-[0.16em] text-[#7E97BC]"><tr><th className="px-5 py-3">Horário</th><th className="px-5 py-3">Usuário</th><th className="px-5 py-3">Empresa</th><th className="px-5 py-3">Ferramenta</th><th className="px-5 py-3">Tipo</th></tr></thead>
            <tbody>
              {timeline.map(row => (
                <tr key={`${row.kind}-${row.id}`} className="border-t border-white/5 text-[#AEC3DF]"><td className="px-5 py-4">{formatDateTime(row.accessedAt || row.startAt)}</td><td className="px-5 py-4"><div className="flex items-center gap-2"><div><p className="font-medium text-white">{row.userName}</p><p className="mt-1 text-xs text-[#7E97BC]">{row.userEmail}</p></div>{row.isAdminAccess ? <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[10px] font-semibold text-amber-200">ADMIN</span> : null}</div></td><td className="px-5 py-4">{row.companyName}</td><td className="px-5 py-4">{row.toolLabel}</td><td className="px-5 py-4">{row.kind === 'power-bi' ? `Power BI · ${formatDuration(row.durationMs)}` : 'Ferramenta do portal'}</td></tr>
              ))}
            </tbody>
          </table>
          {!loading && timeline.length === 0 ? <p className="px-5 py-10 text-center text-sm text-[#7E97BC]">Nenhuma atividade encontrada neste período.</p> : null}
        </div>
      </section>
    </div>
  )
}
