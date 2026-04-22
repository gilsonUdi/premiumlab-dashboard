'use client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#0a1628', border: '1px solid #1a3355', borderRadius: 8, padding: '10px 14px' }}>
      <p style={{ color: '#7ba3cc', marginBottom: 4, fontSize: 12 }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color, fontSize: 13, fontWeight: 500 }}>
          {p.name}: <span style={{ color: '#e2e8f0' }}>{p.value}</span>
        </p>
      ))}
    </div>
  )
}

export default function PontualidadeChart({ data, loading }) {
  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold mb-4" style={{ color: '#e2e8f0' }}>
        Pontualidade de Entrega
        <span className="ml-2 text-xs font-normal" style={{ color: '#4a6b8a' }}>por semana</span>
      </h2>
      {loading ? (
        <div className="skeleton h-48 w-full" />
      ) : !data?.length ? (
        <div className="flex items-center justify-center h-48" style={{ color: '#4a6b8a', fontSize: 13 }}>
          Sem dados no período
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a3355" />
            <XAxis dataKey="period" tick={{ fill: '#7ba3cc', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#7ba3cc', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, color: '#7ba3cc', paddingTop: 8 }}
              formatter={v => <span style={{ color: '#7ba3cc' }}>{v}</span>}
            />
            <Bar dataKey="noPrazo"  name="No Prazo"    fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="atrasado" name="Atrasado"    fill="#ef4444" radius={[4, 4, 0, 0]} />
            <Bar dataKey="producao" name="Em Produção" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
