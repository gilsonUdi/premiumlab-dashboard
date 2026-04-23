'use client'
import { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

function SortIcon({ col, sort }) {
  if (sort.col !== col) return <ChevronsUpDown size={12} style={{ opacity: 0.4 }} />
  return sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
}

function IndiceBar({ value }) {
  const color = value >= 80 ? '#22c55e' : value >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: '#1a3355', maxWidth: 80 }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="font-medium text-xs" style={{ color, minWidth: 36, textAlign: 'right' }}>{value}%</span>
    </div>
  )
}

export default function IndiceAtendimento({ data, selectedClient, onColumnClick, loading }) {
  const [sort, setSort] = useState({ col: 'indice', dir: 'desc' })

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
    { key: 'clinome',   label: 'Nome do Cliente'  },
    { key: 'indice',    label: 'Índice'            },
    { key: 'mediaDias', label: 'Média Dias'        },
  ]

  const filterBy = (event, field, value) => {
    event.stopPropagation()
    onColumnClick(field, value)
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #1a3355' }}>
        <h2 className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>
          Índice de Atendimento por Cliente
        </h2>
        {selectedClient && (
          <button
            className="filter-chip"
            onClick={() => onColumnClick('clicodigo', null)}
          >
            Cliente filtrado ✕
          </button>
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
                  Nenhum cliente encontrado
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={row.clicodigo + i}
                  className={`table-row-hover ${selectedClient === String(row.clicodigo) ? 'table-row-active' : ''}`}
                  style={{ borderTop: '1px solid #0d1f38' }}
                >
                  <td onClick={(event) => filterBy(event, 'clicodigo', String(row.clicodigo))} className="px-4 py-2.5" style={{ color: '#e2e8f0', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.clinome}
                  </td>
                  <td onClick={(event) => filterBy(event, 'customers.indice', row.indice)} className="px-4 py-2.5" style={{ minWidth: 140 }}>
                    <IndiceBar value={row.indice} />
                  </td>
                  <td onClick={(event) => filterBy(event, 'customers.mediaDias', row.mediaDias)} className="px-4 py-2.5 text-right font-mono" style={{ color: '#7ba3cc' }}>
                    {row.mediaDias} dias
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
