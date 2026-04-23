'use client'
import { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const STATUS_MAP = {
  completed:         { label: 'Concluído',        cls: 'badge-success' },
  delayed_completed: { label: 'Entregue (atraso)', cls: 'badge-warning' },
  delayed:           { label: 'Em Produção (atraso)', cls: 'badge-danger'  },
  in_progress:       { label: 'Em Produção',       cls: 'badge-blue'    },
  pending:           { label: 'Aguardando',         cls: 'badge-gray'    },
}

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || { label: status, cls: 'badge-gray' }
  const dotColors = { 'badge-success': '#22c55e', 'badge-warning': '#fbbf24', 'badge-danger': '#f87171', 'badge-blue': '#60a5fa', 'badge-gray': '#94a3b8' }
  return (
    <span className={`badge ${s.cls}`}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dotColors[s.cls] || '#94a3b8' }} />
      {s.label}
    </span>
  )
}

function SortIcon({ col, sort }) {
  if (sort.col !== col) return <ChevronsUpDown size={12} style={{ opacity: 0.4 }} />
  return sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
}

const fmtDt = (v) => {
  if (!v) return '—'
  try { return format(parseISO(v), 'dd/MM/yy HH:mm', { locale: ptBR }) }
  catch { return v }
}

export default function HistoricoPedidos({ data, selectedOrder, onColumnClick, loading }) {
  const [sort, setSort] = useState({ col: 'emissao', dir: 'desc' })

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
    { key: 'emissao',   label: 'Data Emissão' },
    { key: 'pedcodigo', label: 'Cód. Pedido'  },
    { key: 'indice',    label: '% Índice'     },
    { key: 'previsto',  label: 'Dt. Prevista' },
    { key: 'saida',     label: 'Dt. Saída'    },
    { key: 'quantidade',label: 'Qtd.'          },
    { key: 'status',    label: 'Status'        },
  ]

  const filterBy = (event, field, value) => {
    event.stopPropagation()
    onColumnClick(field, value)
  }

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #1a3355' }}>
        <h2 className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>
          Histórico de Pedidos
          {data?.length != null && (
            <span className="ml-2 text-xs font-normal" style={{ color: '#4a6b8a' }}>({data.length} registros)</span>
          )}
        </h2>
        {selectedOrder && (
          <button
            className="filter-chip"
            onClick={() => onColumnClick('pedcodigo', null)}
          >
            Pedido: {selectedOrder} ✕
          </button>
        )}
      </div>

      <div className="overflow-auto" style={{ maxHeight: 560 }}>
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
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} style={{ borderTop: '1px solid #0d1f38' }}>
                  {cols.map(c => (
                    <td key={c.key} className="px-4 py-3">
                      <div className="skeleton h-4 w-full" style={{ maxWidth: c.key === 'status' ? 100 : 80 }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="px-4 py-10 text-center" style={{ color: '#4a6b8a' }}>
                  Nenhum pedido encontrado
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={row.pedcodigo + i}
                  className={`table-row-hover ${selectedOrder === row.pedcodigo ? 'table-row-active' : ''}`}
                  style={{ borderTop: '1px solid #0d1f38' }}
                >
                  <td onClick={(event) => filterBy(event, 'orders.emissao', row.emissao)} className="px-4 py-2.5 font-mono" style={{ color: '#7ba3cc' }}>{fmtDt(row.emissao)}</td>
                  <td onClick={(event) => filterBy(event, 'pedcodigo', row.pedcodigo)} className="px-4 py-2.5 font-mono font-medium" style={{ color: '#60a5fa' }}>{row.pedcodigo}</td>
                  <td onClick={(event) => filterBy(event, 'orders.indice', row.indice)} className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 rounded-full flex-1" style={{ background: '#1a3355', maxWidth: 60 }}>
                        <div
                          className="h-1.5 rounded-full"
                          style={{
                            width: `${row.indice}%`,
                            background: row.indice >= 80 ? '#22c55e' : row.indice >= 50 ? '#f59e0b' : '#ef4444',
                          }}
                        />
                      </div>
                      <span style={{ color: '#e2e8f0', minWidth: 32, textAlign: 'right' }}>{row.indice}%</span>
                    </div>
                  </td>
                  <td onClick={(event) => filterBy(event, 'orders.previsto', row.previsto)} className="px-4 py-2.5 font-mono" style={{ color: '#7ba3cc' }}>{fmtDt(row.previsto)}</td>
                  <td onClick={(event) => filterBy(event, 'orders.saida', row.saida)} className="px-4 py-2.5 font-mono" style={{ color: '#7ba3cc' }}>{fmtDt(row.saida)}</td>
                  <td onClick={(event) => filterBy(event, 'orders.quantidade', row.quantidade)} className="px-4 py-2.5 text-right" style={{ color: '#e2e8f0' }}>{row.quantidade}</td>
                  <td onClick={(event) => filterBy(event, 'orders.status', row.status)} className="px-4 py-2.5"><StatusBadge status={row.status} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
