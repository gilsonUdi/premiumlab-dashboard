'use client'
import { Package, TrendingUp, AlertTriangle, CheckCircle2, Activity, Truck } from 'lucide-react'

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
    <div className="grid grid-cols-2 gap-3 mb-4 md:grid-cols-4 xl:grid-cols-8">
      <KPICard icon={Package} label="Total de Pedidos" value={d.totalOrders ?? '-'} sub="no periodo" color="#3b82f6" loading={loading} />
      <KPICard icon={TrendingUp} label="Pontualidade" value={d.pontualidade != null ? `${d.pontualidade}%` : '-'} sub="no prazo" color="#22c55e" loading={loading} />
      <KPICard icon={Activity} label="Em Producao" value={d.emProducao ?? '-'} sub="pedidos ativos" color="#06b6d4" loading={loading} />
      <KPICard icon={AlertTriangle} label="Em Producao (atraso)" value={d.emProducaoAtraso ?? '-'} sub="ainda em aberto" color="#f59e0b" loading={loading} />
      <KPICard icon={CheckCircle2} label="Concluidos" value={d.concluidos ?? '-'} sub="no periodo" color="#a78bfa" loading={loading} />
      <KPICard icon={CheckCircle2} label="Entregue no Prazo" value={d.entregueNoPrazo ?? '-'} sub="entregues no prazo" color="#22c55e" loading={loading} />
      <KPICard icon={Truck} label="Entregue (atraso)" value={d.entregueAtraso ?? d.atrasados ?? '-'} sub="entregues fora do prazo" color="#fb7185" loading={loading} />
      <KPICard icon={TrendingUp} label="% Perdas" value={d.perdas != null ? `${d.perdas}%` : '-'} sub="em quantidade" color="#ef4444" loading={loading} />
    </div>
  )
}

export function CompactPpsKpis({ data, loading }) {
  const d = data || {}
  const lossColor = d.perdas > 10 ? '#ef4444' : d.perdas > 5 ? '#f59e0b' : '#22c55e'
  const lossAngle = Math.max(0, Math.min(360, Number(d.perdas || 0) * 3.6))

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6 xl:grid-cols-7">
      <KPICard icon={Package} label="Total" value={d.totalOrders ?? '-'} sub="pedidos" color="#3b82f6" loading={loading} />
      <KPICard icon={TrendingUp} label="Pontualidade" value={d.pontualidade != null ? `${d.pontualidade}%` : '-'} sub="no prazo" color="#22c55e" loading={loading} />
      <KPICard icon={Activity} label="Em Producao" value={d.emProducao ?? '-'} sub="ativos" color="#06b6d4" loading={loading} />
      <KPICard icon={AlertTriangle} label="Prod. atraso" value={d.emProducaoAtraso ?? '-'} sub="em aberto" color="#f59e0b" loading={loading} />
      <KPICard icon={CheckCircle2} label="Entregue no Prazo" value={d.entregueNoPrazo ?? '-'} sub="no prazo" color="#22c55e" loading={loading} />
      <KPICard icon={Truck} label="Entregue atraso" value={d.entregueAtraso ?? d.atrasados ?? '-'} sub="fora do prazo" color="#fb7185" loading={loading} />
      <div className="card flex items-center gap-4 p-4" style={{ borderColor: `${lossColor}33` }}>
        {loading ? (
          <div className="skeleton h-14 w-14 rounded-full" />
        ) : (
          <div
            className="relative flex h-14 w-14 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(${lossColor} ${lossAngle}deg, #1a3355 ${lossAngle}deg 360deg)`,
            }}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#081423] text-[10px] font-bold text-[#e2e8f0]">
              {d.perdas ?? 0}%
            </div>
          </div>
        )}
        <div>
          <p className="text-xs font-medium text-[#7ba3cc]">% Perdas</p>
          <p className="text-2xl font-bold text-[#e2e8f0]">{loading ? '-' : `${d.perdas ?? 0}%`}</p>
          <p className="text-xs text-[#4a6b8a]">em quantidade</p>
        </div>
      </div>
    </div>
  )
}
