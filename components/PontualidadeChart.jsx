'use client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1B3260', border: '1px solid #1E3A66', borderRadius: 8, padding: '10px 14px' }}>
      <p style={{ color: '#AEC3DF', marginBottom: 4, fontSize: 12 }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color, fontSize: 13, fontWeight: 500 }}>
          {p.name}: <span style={{ color: '#EAF1FA' }}>{p.value}</span>
        </p>
      ))}
    </div>
  )
}

export default function PontualidadeChart({ data, loading }) {
  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold mb-4" style={{ color: '#EAF1FA' }}>
        Pontualidade de Entrega
        <span className="ml-2 text-xs font-normal" style={{ color: '#7E97BC' }}>por semana</span>
      </h2>
      {loading ? (
        <div className="skeleton h-48 w-full" />
      ) : !data?.length ? (
        <div className="flex items-center justify-center h-48" style={{ color: '#7E97BC', fontSize: 13 }}>
          Sem dados no período
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E3A66" />
            <XAxis dataKey="period" tick={{ fill: '#AEC3DF', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#AEC3DF', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, color: '#AEC3DF', paddingTop: 8 }}
              formatter={v => <span style={{ color: '#AEC3DF' }}>{v}</span>}
            />
            <Bar dataKey="noPrazo"  name="No Prazo"    fill="#3FCF8E" radius={[4, 4, 0, 0]} />
            <Bar dataKey="atrasado" name="Atrasado"    fill="#F47C74" radius={[4, 4, 0, 0]} />
            <Bar dataKey="producao" name="Em Produção" fill="#6FAFF0" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
