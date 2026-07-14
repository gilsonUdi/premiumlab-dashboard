'use client'
import { Trophy, Medal, Award } from 'lucide-react'

const ICONS = {
  1: { icon: Trophy, color: '#F2C14E', bg: 'rgba(242, 193, 78, 0.12)' },
  2: { icon: Medal, color: '#EAF1FA', bg: 'rgba(203, 213, 225, 0.12)' },
  3: { icon: Award, color: '#F2C14E', bg: 'rgba(242, 193, 78, 0.12)' },
}

function PositionBadge({ value }) {
  const item = ICONS[value]
  const label = `${value}º`

  if (!item) {
    return <span className="text-sm font-semibold text-[#AEC3DF]">{label}</span>
  }

  const Icon = item.icon
  return (
    <div className="inline-flex items-center gap-2 rounded-full px-2.5 py-1" style={{ background: item.bg, color: item.color }}>
      <Icon size={14} />
      <span className="text-sm font-semibold">{label}</span>
    </div>
  )
}

export default function RankingVendedores({ data, loading }) {
  const rows = data || []

  return (
    <div className="card">
      <div className="px-4 py-3" style={{ borderBottom: '1px solid #1E3A66' }}>
        <h2 className="text-sm font-semibold text-[#EAF1FA]">Ranking de Vendedor por Venda</h2>
      </div>

      <div className="overflow-auto" style={{ maxHeight: 420 }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr style={{ background: '#0D1D38' }}>
              <th className="px-4 py-3 text-left font-medium text-[#AEC3DF]">Posição</th>
              <th className="px-4 py-3 text-left font-medium text-[#AEC3DF]">Vendedor</th>
              <th className="px-4 py-3 text-right font-medium text-[#AEC3DF]">Vendas</th>
              <th className="px-4 py-3 text-right font-medium text-[#AEC3DF]">Peças</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <tr key={index} style={{ borderTop: '1px solid #0D1D38' }}>
                  <td className="px-4 py-3"><div className="skeleton h-4 w-12" /></td>
                  <td className="px-4 py-3"><div className="skeleton h-4 w-44" /></td>
                  <td className="px-4 py-3"><div className="ml-auto skeleton h-4 w-12" /></td>
                  <td className="px-4 py-3"><div className="ml-auto skeleton h-4 w-12" /></td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-[#7E97BC]">
                  Nenhum vendedor encontrado
                </td>
              </tr>
            ) : (
              rows.map(row => (
                <tr key={`${row.vendedorCodigo}-${row.posicao}`} className="table-row-hover" style={{ borderTop: '1px solid #0D1D38' }}>
                  <td className="px-4 py-2.5">
                    <PositionBadge value={row.posicao} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col">
                      <span className="font-medium text-[#EAF1FA]">{row.vendedorNome}</span>
                      <span className="text-[11px] text-[#7E97BC]">Cód. {row.vendedorCodigo || '-'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[#6FAFF0]">{row.totalVendas}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-[#EAF1FA]">{row.totalPecas}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
