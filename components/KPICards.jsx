'use client'
import { Package, Clock, TrendingUp, AlertTriangle, CheckCircle2, Activity } from 'lucide-react'

function KPICard({ icon: Icon, label, value, sub, color, loading }) {
  return (
    <div className="card p-4 flex gap-4 items-start" style={{ borderColor: `${color}33` }}>
      <div className="rounded-lg p-2 flex-shrink-0" style={{ background: `${color}1a` }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium mb-1" style={{ color: '#7ba3cc' }}>{label}</p>
        {loading ? (
          <div className="skeleton h-7 w-20 mb-1" />
        ) : (
          <p className="text-2xl font-bold" style={{ color: '#e2e8f0' }}>{value}</p>
        )}
        {sub && <p className="text-xs mt-0.5" style={{ color: '#4a6b8a' }}>{sub}</p>}
      </div>
    </div>
  )
}

export default function KPICards({ data, loading }) {
  const d = data || {}
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
      <KPICard icon={Package}       label="Total de Pedidos"  value={d.totalOrders ?? '—'}   sub="no período"                           color="#3b82f6" loading={loading} />
      <KPICard icon={TrendingUp}    label="Pontualidade"      value={d.pontualidade != null ? `${d.pontualidade}%` : '—'} sub="no prazo"          color="#22c55e" loading={loading} />
      <KPICard icon={Activity}      label="Em Produção"       value={d.emProducao ?? '—'}     sub="pedidos ativos"                        color="#06b6d4" loading={loading} />
      <KPICard icon={CheckCircle2}  label="Concluídos"        value={d.concluidos ?? '—'}     sub="no período"                           color="#a78bfa" loading={loading} />
      <KPICard icon={AlertTriangle} label="Atrasados"         value={d.atrasados ?? '—'}      sub="fora do prazo"                        color="#f59e0b" loading={loading} />
      <KPICard icon={TrendingUp}    label="% Perdas"          value={d.perdas != null ? `${d.perdas}%` : '—'} sub="em quantidade"          color="#ef4444" loading={loading} />
    </div>
  )
}
