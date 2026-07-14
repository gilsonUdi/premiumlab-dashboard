'use client'
import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'

function fmtDt(value) {
  if (!value) return '-'
  try {
    return format(parseISO(value), 'dd/MM/yyyy HH:mm', { locale: ptBR })
  } catch {
    return value
  }
}

function SortIcon({ col, sort }) {
  if (sort.col !== col) return <ChevronsUpDown size={12} style={{ opacity: 0.4 }} />
  return sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
}

export default function RastreabilidadePedido({ data, selectedOrder, onColumnClick, loading }) {
  const [sort, setSort] = useState({ col: 'dataHora', dir: 'asc' })

  const rows = useMemo(() => {
    return [...(data || [])].sort((a, b) => {
      let valueA = a[sort.col]
      let valueB = b[sort.col]
      if (typeof valueA === 'string') valueA = valueA.toLowerCase()
      if (typeof valueB === 'string') valueB = valueB.toLowerCase()
      if (valueA < valueB) return sort.dir === 'asc' ? -1 : 1
      if (valueA > valueB) return sort.dir === 'asc' ? 1 : -1
      return 0
    })
  }, [data, sort])

  const cols = [
    { key: 'estoque', label: 'Estoque' },
    { key: 'celula', label: 'Célula' },
    { key: 'dataHora', label: 'Data e Hora' },
    { key: 'usuario', label: 'Usuário' },
  ]

  return (
    <div className="card">
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #1E3A66' }}>
        <h2 className="text-sm font-semibold" style={{ color: '#EAF1FA' }}>
          Rastreabilidade do Pedido
        </h2>
        {selectedOrder ? <span className="filter-chip">Pedido #{selectedOrder}</span> : null}
      </div>

      <div className="overflow-auto" style={{ maxHeight: 420 }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr style={{ background: '#0D1D38' }}>
              {cols.map(col => (
                <th
                  key={col.key}
                  className="col-sortable px-4 py-3 text-left font-medium"
                  style={{ color: sort.col === col.key ? '#DAB975' : '#AEC3DF', whiteSpace: 'nowrap' }}
                  onClick={() => setSort(previous => ({ col: col.key, dir: previous.col === col.key && previous.dir === 'asc' ? 'desc' : 'asc' }))}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    <SortIcon col={col.key} sort={sort} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <tr key={index} style={{ borderTop: '1px solid #0D1D38' }}>
                  {cols.map(col => (
                    <td key={col.key} className="px-4 py-3">
                      <div className="skeleton h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="px-4 py-10 text-center" style={{ color: '#7E97BC' }}>
                  {selectedOrder ? `Sem rastreamento para pedido #${selectedOrder}` : 'Clique em um pedido para ver a rastreabilidade'}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr
                  key={`${row.pedcodigo || 'trace'}-${index}`}
                  className="table-row-hover"
                  style={{ borderTop: '1px solid #0D1D38' }}
                  onClick={() => row.pedcodigo && onColumnClick('pedcodigo', row.pedcodigo)}
                >
                  <td className="px-4 py-2.5">
                    <span className="badge badge-purple">{row.estoque}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="badge"
                      style={{
                        background: row.celula === 'Saida' ? 'rgba(63, 207, 142,0.1)' : 'rgba(111, 175, 240,0.1)',
                        color: row.celula === 'Saida' ? '#3FCF8E' : '#6FAFF0',
                        border: `1px solid ${row.celula === 'Saida' ? '#3FCF8E40' : '#6FAFF040'}`,
                      }}
                    >
                      {row.celula}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: '#AEC3DF' }}>{fmtDt(row.dataHora)}</td>
                  <td className="px-4 py-2.5" style={{ color: '#EAF1FA' }}>{row.usuario || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
