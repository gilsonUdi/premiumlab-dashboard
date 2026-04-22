'use client'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const COLORS = ['#22c55e', '#ef4444']

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#0a1628', border: '1px solid #1a3355', borderRadius: 8, padding: '10px 14px' }}>
      <p style={{ color: payload[0].color, fontWeight: 600, fontSize: 13 }}>{payload[0].name}</p>
      <p style={{ color: '#e2e8f0', fontSize: 13 }}>{payload[0].value} movimentos</p>
    </div>
  )
}

const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  const RADIAN = Math.PI / 180
  const r = innerRadius + (outerRadius - innerRadius) * 0.55
  const x = cx + r * Math.cos(-midAngle * RADIAN)
  const y = cy + r * Math.sin(-midAngle * RADIAN)
  return percent > 0.04 ? (
    <text x={x} y={y} fill="#e2e8f0" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  ) : null
}

export default function PerdasChart({ data, loading }) {
  const chartData = data
    ? [
        { name: 'Sem Perda', value: data.semPerda || 0 },
        { name: 'Com Perda', value: data.withLoss || 0 },
      ]
    : []

  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold mb-1" style={{ color: '#e2e8f0' }}>
        Índice de Perdas em Quantidade
      </h2>
      {loading ? (
        <div className="skeleton h-48 w-full mt-3" />
      ) : !data || data.total === 0 ? (
        <div className="flex items-center justify-center h-48" style={{ color: '#4a6b8a', fontSize: 13 }}>
          Sem dados no período
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="55%" height={200}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                dataKey="value"
                labelLine={false}
                label={renderLabel}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-col gap-4" style={{ flex: 1 }}>
            <div>
              <p className="text-xs mb-1" style={{ color: '#7ba3cc' }}>% de Perdas</p>
              <p className="text-3xl font-bold" style={{ color: data.percentage > 10 ? '#ef4444' : data.percentage > 5 ? '#f59e0b' : '#22c55e' }}>
                {data.percentage}%
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {chartData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: COLORS[i] }} />
                  <span className="text-xs" style={{ color: '#7ba3cc' }}>{d.name}</span>
                  <span className="text-xs font-medium ml-auto" style={{ color: '#e2e8f0' }}>{d.value}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 mt-1 pt-2" style={{ borderTop: '1px solid #1a3355' }}>
                <span className="text-xs" style={{ color: '#4a6b8a' }}>Total</span>
                <span className="text-xs font-bold ml-auto" style={{ color: '#e2e8f0' }}>{data.total}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
