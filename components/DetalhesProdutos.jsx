'use client'
import { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

function SortIcon({ col, sort }) {
  if (sort.col !== col) return <ChevronsUpDown size={12} style={{ opacity: 0.4 }} />
  return sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
}

const STATUS_COLORS = {
  'Saída':   { bg: 'rgba(34,197,94,0.1)',   color: '#22c55e' },
  'Entrada': { bg: 'rgba(59,130,246,0.1)',  color: '#60a5fa' },
}

export default function DetalhesProdutos({ data, selectedOrder, onColumnClick, loading }) {
  const [sort, setSort] = useState({ col: 'pedcodigo', dir: 'asc' })

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
    { key: 'pedcodigo',   label: 'Cód. Pedido'   },
    { key: 'status',      label: 'Status'         },
    { key: 'procodigo',   label: 'Cód. Produto'   },
    { key: 'prodescricao',label: 'Descrição'      },
    { key: 'quantidade',  label: 'Qtd.'            },
  ]

  const filterBy = (event, field, value) => {
    event.stopPropagation()
    onColumnClick(field, value)
  }

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #1a3355' }}>
        <h2 className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>
          Detalhes dos Produtos
          {data?.length != null && (
            <span className="ml-2 text-xs font-normal" style={{ color: '#4a6b8a' }}>({data.length} registros)</span>
          )}
        </h2>
        {selectedOrder && (
          <span className="filter-chip" style={{ cursor: 'default' }}>
            Pedido: {selectedOrder}
          </span>
        )}
      </div>

      <div className="overflow-auto" style={{ maxHeight: 460 }}>
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
                  {selectedOrder ? `Selecione um pedido ou nenhum produto encontrado para #${selectedOrder}` : 'Nenhum produto encontrado'}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const sc = STATUS_COLORS[row.status] || { bg: 'rgba(74,107,138,0.1)', color: '#94a3b8' }
                return (
                  <tr
                    key={row.procodigo + i}
                    className={`table-row-hover ${selectedOrder === row.pedcodigo ? 'table-row-active' : ''}`}
                    style={{ borderTop: '1px solid #0d1f38' }}
                  >
                    <td onClick={(event) => filterBy(event, 'pedcodigo', row.pedcodigo)} className="px-4 py-2.5 font-mono font-medium" style={{ color: '#60a5fa' }}>{row.pedcodigo}</td>
                    <td onClick={(event) => filterBy(event, 'status', row.status)} className="px-4 py-2.5">
                      <span className="badge" style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.color}40` }}>
                        {row.status}
                      </span>
                    </td>
                    <td onClick={(event) => filterBy(event, 'procodigo', row.procodigo)} className="px-4 py-2.5 font-mono" style={{ color: '#7ba3cc' }}>{row.procodigo}</td>
                    <td onClick={(event) => filterBy(event, 'prodescricao', row.prodescricao)} className="px-4 py-2.5" style={{ color: '#e2e8f0' }}>{row.prodescricao}</td>
                    <td onClick={(event) => filterBy(event, 'quantidade', row.quantidade)} className="px-4 py-2.5 text-right" style={{ color: '#e2e8f0' }}>{row.quantidade}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
