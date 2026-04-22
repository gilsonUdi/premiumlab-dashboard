'use client'
import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

const fmtDt = (v) => {
  if (!v) return '—'
  try { return format(parseISO(v), 'dd/MM/yy HH:mm', { locale: ptBR }) }
  catch { return v }
}

function SortIcon({ col, sort }) {
  if (sort.col !== col) return <ChevronsUpDown size={12} style={{ opacity: 0.4 }} />
  return sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
}

export default function RastreabilidadePedido({ data, selectedOrder, onColumnClick, loading }) {
  const [sort, setSort] = useState({ col: 'dataHora', dir: 'asc' })

  const toggleSort = (col) => {
    setSort(prev => ({ col, dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc' }))
  }

  const rows = [...(data || [])].sort((a, b) => {
    let va = a[sort.col], vb = b[sort.col]
    if (typeof va === 'string') va = va.toLowerCase()
    if (typeof vb === 'string') vb = vb.toLowerCase()
    if (va < vb) return sort.dir === 'asc' ? -1 : 1
    if (va > vb) return sort.dir === 'asc' ? 1 : -1
    return 0
  })

  const cols = [
    { key: 'estoque', label: 'Estoque'     },
    { key: 'celula',  label: 'Célula'      },
    { key: 'dataHora',label: 'Data e Hora' },
    { key: 'usuario', label: 'Usuário'     },
  ]

  return (
    <div className="card">
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #1a3355' }}>
        <h2 className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>
          Rastreabilidade do Pedido
        </h2>
        {selectedOrder && (
          <span className="filter-chip" style={{ cursor: 'default' }}>Pedido #{selectedOrder}</span>
        )}
      </div>

      <div className="overflow-auto" style={{ maxHeight: 420 }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr style={{ background: '#0d1f38' }}>
              {cols.map(c => (
                <th
                  key={c.key}
                  className="col-sortable px-4 py-3 text-left font-medium"
                  style={{ color: sort.col === c.key ? '#3b9fd4' : '#7ba3cc', whiteSpace: 'nowrap' }}
                  onClick={() => toggleSort(c.key)}
                >
                  <span className="flex items-center gap-1">
                    {c.label}
                    <SortIcon col={c.key} sort={sort} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} style={{ borderTop: '1px solid #0d1f38' }}>
                  {cols.map(c => (
                    <td key={c.key} className="px-4 py-3">
                      <div className="skeleton h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="px-4 py-10 text-center" style={{ color: '#4a6b8a' }}>
                  {selectedOrder ? `Sem rastreamento para pedido #${selectedOrder}` : 'Clique em um pedido para ver a rastreabilidade'}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={i}
                  className="table-row-hover"
                  style={{ borderTop: '1px solid #0d1f38' }}
                  onClick={() => row.pedcodigo && onColumnClick('pedcodigo', row.pedcodigo)}
                >
                  <td className="px-4 py-2.5">
                    <span className="badge badge-purple">{row.estoque}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="badge"
                      style={{
                        background: row.celula === 'Saída' ? 'rgba(34,197,94,0.1)' : 'rgba(59,130,246,0.1)',
                        color: row.celula === 'Saída' ? '#22c55e' : '#60a5fa',
                        border: `1px solid ${row.celula === 'Saída' ? '#22c55e40' : '#60a5fa40'}`,
                      }}
                    >
                      {row.celula}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: '#7ba3cc' }}>{fmtDt(row.dataHora)}</td>
                  <td className="px-4 py-2.5" style={{ color: '#e2e8f0' }}>{row.usuario || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
