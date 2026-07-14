'use client'
import { Package, TrendingUp, AlertTriangle, CheckCircle2, Activity, Truck } from 'lucide-react'

function formatPercentage(value) {
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))}%`
}

function KPICard({ icon: Icon, label, value, sub, color, loading }) {
  return (
    <div className="card p-4 flex gap-4 items-start" style={{ borderColor: `${color}33` }}>
      <div className="rounded-lg p-2 flex-shrink-0" style={{ background: `${color}1a` }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium mb-1" style={{ color: '#AEC3DF' }}>{label}</p>
        {loading ? (
          <div className="skeleton h-7 w-20 mb-1" />
        ) : (
          <p className="text-2xl font-bold" style={{ color: '#EAF1FA' }}>{value}</p>
        )}
        {sub && <p className="text-xs mt-0.5" style={{ color: '#7E97BC' }}>{sub}</p>}
      </div>
    </div>
  )
}

export default function KPICards({ data, loading }) {
  const d = data || {}

  return (
    <div className="grid grid-cols-2 gap-3 mb-4 md:grid-cols-4 xl:grid-cols-8">
      <KPICard icon={Package} label="Total de Pedidos" value={d.totalOrders ?? '-'} sub="no periodo" color="#6FAFF0" loading={loading} />
      <KPICard icon={TrendingUp} label="Pontualidade" value={d.pontualidade != null ? formatPercentage(d.pontualidade) : '-'} sub="no prazo" color="#3FCF8E" loading={loading} />
      <KPICard icon={Activity} label="Em Produção" value={d.emProducao ?? '-'} sub="pedidos ativos" color="#6FAFF0" loading={loading} />
      <KPICard icon={AlertTriangle} label="Em Produção (atraso)" value={d.emProducaoAtraso ?? '-'} sub="ainda em aberto" color="#F2C14E" loading={loading} />
      <KPICard icon={CheckCircle2} label="Concluídos" value={d.concluidos ?? '-'} sub="no periodo" color="#a78bfa" loading={loading} />
      <KPICard icon={CheckCircle2} label="Entregue no Prazo" value={d.entregueNoPrazo ?? '-'} sub="entregues no prazo" color="#3FCF8E" loading={loading} />
      <KPICard icon={Truck} label="Entregue (atraso)" value={d.entregueAtraso ?? d.atrasados ?? '-'} sub="entregues fora do prazo" color="#F47C74" loading={loading} />
      <KPICard icon={TrendingUp} label="% Perdas" value={d.perdas != null ? formatPercentage(d.perdas) : '-'} sub="em quantidade" color="#F47C74" loading={loading} />
    </div>
  )
}

export function CompactPpsKpis({ data, loading }) {
  const d = data || {}
  const lossColor = d.perdas > 10 ? '#F47C74' : d.perdas > 5 ? '#F2C14E' : '#3FCF8E'
  const lossAngle = Math.max(0, Math.min(360, Number(d.perdas || 0) * 3.6))

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6 xl:grid-cols-7">
      <KPICard icon={Package} label="Total" value={d.totalOrders ?? '-'} sub="pedidos" color="#6FAFF0" loading={loading} />
      <KPICard icon={TrendingUp} label="Pontualidade" value={d.pontualidade != null ? formatPercentage(d.pontualidade) : '-'} sub="no prazo" color="#3FCF8E" loading={loading} />
      <KPICard icon={Activity} label="Em Produção" value={d.emProducao ?? '-'} sub="ativos" color="#6FAFF0" loading={loading} />
      <KPICard icon={AlertTriangle} label="Prod. atraso" value={d.emProducaoAtraso ?? '-'} sub="em aberto" color="#F2C14E" loading={loading} />
      <KPICard icon={CheckCircle2} label="Entregue no Prazo" value={d.entregueNoPrazo ?? '-'} sub="no prazo" color="#3FCF8E" loading={loading} />
      <KPICard icon={Truck} label="Entregue atraso" value={d.entregueAtraso ?? d.atrasados ?? '-'} sub="fora do prazo" color="#F47C74" loading={loading} />
      <div className="card flex items-center gap-4 p-4" style={{ borderColor: `${lossColor}33` }}>
        {loading ? (
          <div className="skeleton h-14 w-14 rounded-full" />
        ) : (
          <div
            className="relative flex h-14 w-14 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(${lossColor} ${lossAngle}deg, #1E3A66 ${lossAngle}deg 360deg)`,
            }}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#16294F] text-[10px] font-bold text-[#EAF1FA]">
              {formatPercentage(d.perdas ?? 0)}
            </div>
          </div>
        )}
        <div>
          <p className="text-xs font-medium text-[#AEC3DF]">% Perdas</p>
          <p className="text-2xl font-bold text-[#EAF1FA]">{loading ? '-' : formatPercentage(d.perdas ?? 0)}</p>
          <p className="text-xs text-[#7E97BC]">em quantidade</p>
        </div>
      </div>
    </div>
  )
}
