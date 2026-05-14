'use client'
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

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

const ROUTE_STEP_STYLES = {
  completed: {
    background: 'rgba(34, 197, 94, 0.22)',
    border: '1px solid rgba(34, 197, 94, 0.65)',
    color: '#dcfce7',
  },
  delayed: {
    background: 'rgba(239, 68, 68, 0.22)',
    border: '1px solid rgba(239, 68, 68, 0.65)',
    color: '#fee2e2',
  },
  pending: {
    background: 'rgba(248, 250, 252, 0.08)',
    border: '1px solid rgba(226, 232, 240, 0.18)',
    color: '#e2e8f0',
  },
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

function RouteSteps({ steps }) {
  if (!Array.isArray(steps) || steps.length === 0) return <span style={{ color: '#4a6b8a' }}>-</span>

  return (
    <div
      className="grid gap-1.5"
      style={{
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        minWidth: 216,
      }}
    >
      {steps.map((step, index) => {
        const tone = ROUTE_STEP_STYLES[step.state] || ROUTE_STEP_STYLES.pending
        return (
          <span
            key={`${step.label}-${step.ordem}-${index}`}
            className="rounded px-1.5 py-1 text-center text-[10px] font-semibold"
            style={{
              ...tone,
              lineHeight: 1.1,
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
            title={step.descricao || step.label}
          >
            {step.label}
          </span>
        )
      })}
    </div>
  )
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
    { key: 'pedidoId', label: 'ID Pedido' },
    { key: 'currentCell', label: 'Celula' },
    { key: 'caixa', label: 'Caixa' },
    { key: 'previsto', label: 'Dt. Prevista' },
    ...(showDelayDays ? [{ key: 'diasAtraso', label: 'Dias em Atraso' }] : []),
    ...(!hideDeliveredColumn ? [{ key: 'saida', label: 'Dt. Saida' }] : []),
    { key: 'roteiroResumo', label: 'Roteiro' },
  ]

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
            ID Pedido: {selectedOrder} x
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
                  style={{
                    color: sort.col === col.key ? '#3b9fd4' : '#7ba3cc',
                    whiteSpace: 'nowrap',
                    width:
                      col.key === 'previsto'
                        ? 132
                        : col.key === 'diasAtraso'
                          ? 106
                          : col.key === 'roteiroResumo'
                            ? 228
                            : undefined,
                  }}
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
                      <div className="skeleton h-4 w-full" style={{ maxWidth: 90 }} />
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
                  key={`${row.pedidoId}-${index}`}
                  className={selectedOrder && String(row.pedidoId) === String(selectedOrder) ? 'table-row-active' : 'table-row-hover'}
                  style={{
                    borderTop: '1px solid #0d1f38',
                    ...(ROW_STYLES[row.rowTone] || {}),
                  }}
                >
                  <td onClick={event => filterBy(event, 'orders.emissao', row.emissao)} className="px-4 py-2.5 font-mono" style={{ color: '#d7e9ff' }}>
                    {fmtDt(row.emissao)}
                  </td>
                  <td
                    onClick={event => filterBy(event, 'pedcodigo', row.pedidoId)}
                    className="px-4 py-2.5 font-mono font-medium"
                    style={{ color: '#7dd3fc' }}
                    title={`ID_PEDIDO: ${row.pedidoId} | PEDCODIGO: ${row.pedcodigo}`}
                  >
                    {row.pedidoId}
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
                    <td className="px-4 py-2.5 font-mono" style={{ color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                      {fmtDelayDays(row.delayRank, row.status)}
                    </td>
                  ) : null}
                  {!hideDeliveredColumn ? (
                    <td onClick={event => filterBy(event, 'orders.saida', row.saida)} className="px-4 py-2.5 font-mono" style={{ color: '#d7e9ff' }}>
                      {fmtDt(row.saida)}
                    </td>
                  ) : null}
                  <td className="px-4 py-2.5" style={{ width: 228 }}>
                    <RouteSteps steps={row.roteiro} />
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
