'use client'
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const STATUS_MAP = {
  completed: { label: 'Concluido', cls: 'badge-success' },
  delayed_completed: { label: 'Entregue (atraso)', cls: 'badge-warning' },
  delayed: { label: 'Em Producao (atraso)', cls: 'badge-danger' },
  in_progress: { label: 'Em Producao', cls: 'badge-blue' },
  pending: { label: 'Aguardando', cls: 'badge-gray' },
}

const STATUS_SORT_WEIGHT = {
  delayed: 4,
  in_progress: 3,
  pending: 3,
  delayed_completed: 2,
  completed: 1,
}

const ROW_STYLES = {
  danger: {
    background: 'rgba(127, 29, 29, 0.34)',
    boxShadow: 'inset 4px 0 0 #ef4444',
  },
  warning: {
    background: 'rgba(120, 53, 15, 0.28)',
    boxShadow: 'inset 4px 0 0 #f59e0b',
  },
  success: {
    background: 'rgba(20, 83, 45, 0.22)',
    boxShadow: 'inset 4px 0 0 #22c55e',
  },
}

function StatusBadge({ status }) {
  const item = STATUS_MAP[status] || { label: status, cls: 'badge-gray' }
  const dotColors = {
    'badge-success': '#22c55e',
    'badge-warning': '#fbbf24',
    'badge-danger': '#f87171',
    'badge-blue': '#60a5fa',
    'badge-gray': '#94a3b8',
  }

  return (
    <span className={`badge ${item.cls}`}>
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: dotColors[item.cls] || '#94a3b8' }} />
      {item.label}
    </span>
  )
}

function SortIcon({ col, sort }) {
  if (sort.col !== col) return <ChevronsUpDown size={12} style={{ opacity: 0.4 }} />
  return sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
}

function fmtDt(value) {
  if (!value) return '-'
  try {
    return format(parseISO(value), 'dd/MM/yyyy HH:mm', { locale: ptBR })
  } catch {
    return value
  }
}

function fmtDelayDays(delayRank, status) {
  if (!['delayed', 'delayed_completed'].includes(status)) return '-'

  const minutes = Number(delayRank || 0)
  if (minutes <= 0) return '-'

  const days = minutes / 1440
  const text = days.toLocaleString('pt-BR', {
    minimumFractionDigits: days >= 10 ? 0 : 1,
    maximumFractionDigits: 1,
  })

  return `${text} dia${days >= 2 ? 's' : ''}`
}

export default function HistoricoPedidos({
  data,
  selectedOrder,
  onColumnClick,
  loading,
  compact = false,
  fillHeight = false,
  hideDeliveredColumn = false,
  showDelayDays = false,
}) {
  const [sort, setSort] = useState({ col: 'delayRank', dir: 'desc' })

  const toggleSort = col => {
    setSort(previous => ({ col, dir: previous.col === col && previous.dir === 'asc' ? 'desc' : 'asc' }))
  }

  const rows = useMemo(() => {
    return [...(data || [])].sort((a, b) => {
      if (sort.col === 'delayRank') {
        const statusDiff = (STATUS_SORT_WEIGHT[b.status] || 0) - (STATUS_SORT_WEIGHT[a.status] || 0)
        if (statusDiff !== 0) return statusDiff

        const delayDiff = Number(b.delayRank || 0) - Number(a.delayRank || 0)
        if (delayDiff !== 0) return delayDiff
      }

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
    { key: 'emissao', label: 'Data Emissao' },
    { key: 'pedcodigo', label: 'Cod. Pedido' },
    { key: 'indice', label: '% Indice' },
    { key: 'currentCell', label: 'Celula' },
    { key: 'caixa', label: 'Caixa' },
    { key: 'previsto', label: 'Dt. Prevista' },
    { key: 'quantidade', label: 'Qtd.' },
    { key: 'status', label: 'Status' },
  ]

  if (showDelayDays) {
    cols.splice(6, 0, { key: 'diasAtraso', label: 'Dias Atraso' })
  }

  if (!hideDeliveredColumn) {
    cols.splice(showDelayDays ? 7 : 6, 0, { key: 'saida', label: 'Dt. Saida' })
  }

  const filterBy = (event, field, value) => {
    event.stopPropagation()
    onColumnClick(field, value)
  }

  const tableHeight = fillHeight ? 'calc(100vh - 282px)' : compact ? 640 : 560

  return (
    <div className={`card ${compact ? 'mb-0 h-full' : 'mb-4'}`}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #1a3355' }}>
        <h2 className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>
          Historico de Pedidos
          {data?.length != null ? (
            <span className="ml-2 text-xs font-normal" style={{ color: '#4a6b8a' }}>({data.length} registros)</span>
          ) : null}
        </h2>
        {selectedOrder ? (
          <button className="filter-chip" onClick={() => onColumnClick('pedcodigo', null)}>
            Pedido: {selectedOrder} x
          </button>
        ) : null}
      </div>

      <div className="overflow-auto" style={{ maxHeight: tableHeight }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr style={{ background: '#0d1f38' }}>
              {cols.map(col => (
                <th
                  key={col.key}
                  className="col-sortable px-4 py-3 text-left font-medium"
                  style={{ color: sort.col === col.key ? '#3b9fd4' : '#7ba3cc', whiteSpace: 'nowrap' }}
                  onClick={() => toggleSort(col.key)}
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
              Array.from({ length: compact ? 10 : 6 }).map((_, index) => (
                <tr key={index} style={{ borderTop: '1px solid #0d1f38' }}>
                  {cols.map(col => (
                    <td key={col.key} className="px-4 py-3">
                      <div className="skeleton h-4 w-full" style={{ maxWidth: col.key === 'status' ? 100 : 90 }} />
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
              rows.map((row, index) => (
                <tr
                  key={`${row.pedcodigo}-${index}`}
                  className={selectedOrder && row.pedcodigo === selectedOrder ? 'table-row-active' : 'table-row-hover'}
                  style={{
                    borderTop: '1px solid #0d1f38',
                    ...(ROW_STYLES[row.rowTone] || {}),
                  }}
                >
                  <td onClick={event => filterBy(event, 'orders.emissao', row.emissao)} className="px-4 py-2.5 font-mono" style={{ color: '#d7e9ff' }}>
                    {fmtDt(row.emissao)}
                  </td>
                  <td onClick={event => filterBy(event, 'pedcodigo', row.pedcodigo)} className="px-4 py-2.5 font-mono font-medium" style={{ color: '#7dd3fc' }}>
                    {row.pedcodigo}
                  </td>
                  <td onClick={event => filterBy(event, 'orders.indice', row.indice)} className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full" style={{ background: '#1a3355', maxWidth: 60 }}>
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
                  <td onClick={event => filterBy(event, 'orders.currentCell', row.currentCell)} className="px-4 py-2.5" style={{ color: '#e2e8f0' }}>
                    {row.currentCell || '-'}
                  </td>
                  <td className="px-4 py-2.5" style={{ color: '#e2e8f0' }}>
                    {row.caixa || '-'}
                  </td>
                  <td onClick={event => filterBy(event, 'orders.previsto', row.previsto)} className="px-4 py-2.5 font-mono" style={{ color: '#d7e9ff' }}>
                    {fmtDt(row.previsto)}
                  </td>
                  {showDelayDays ? (
                    <td className="px-4 py-2.5 font-mono" style={{ color: '#e2e8f0' }}>
                      {fmtDelayDays(row.delayRank, row.status)}
                    </td>
                  ) : null}
                  {!hideDeliveredColumn ? (
                    <td onClick={event => filterBy(event, 'orders.saida', row.saida)} className="px-4 py-2.5 font-mono" style={{ color: '#d7e9ff' }}>
                      {fmtDt(row.saida)}
                    </td>
                  ) : null}
                  <td onClick={event => filterBy(event, 'orders.quantidade', row.quantidade)} className="px-4 py-2.5 text-right" style={{ color: '#e2e8f0' }}>
                    {row.quantidade}
                  </td>
                  <td onClick={event => filterBy(event, 'orders.status', row.status)} className="px-4 py-2.5">
                    <StatusBadge status={row.status} />
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
