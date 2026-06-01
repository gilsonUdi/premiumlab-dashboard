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

function getSortDataKey(columnKey) {
  if (columnKey === 'diasAtraso') return 'delayRank'
  return columnKey
}

function isDelayedStatus(status) {
  return status === 'delayed' || status === 'delayed_completed'
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

function fmtDelayDays(delayRank) {
  const minutes = Number(delayRank || 0)
  if (minutes < 0) return '-'
  return String(Math.floor(minutes / 1440))
}

function RouteSteps({ steps }) {
  if (!Array.isArray(steps) || steps.length === 0) return <span style={{ color: '#4a6b8a' }}>-</span>

  return (
    <div
      className="grid gap-1.5"
      style={{
        gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
        minWidth: 0,
      }}
    >
      {steps.map((step, index) => {
        const tone = ROUTE_STEP_STYLES[step.state] || ROUTE_STEP_STYLES.pending
        return (
          <span
            key={`${step.label}-${step.ordem}-${index}`}
            className="rounded px-1 py-[3px] text-center text-[9px] font-semibold"
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
  largerText = false,
}) {
  const [sort, setSort] = useState({ col: 'delayRank', dir: 'desc' })

  const toggleSort = col => {
    setSort(previous => ({ col, dir: previous.col === col && previous.dir === 'asc' ? 'desc' : 'asc' }))
  }

  const rows = useMemo(() => {
    return [...(data || [])].sort((a, b) => {
      const sortDataKey = getSortDataKey(sort.col)

      if (sort.col === 'diasAtraso') {
        const delayedDiff = Number(isDelayedStatus(b.status)) - Number(isDelayedStatus(a.status))
        if (delayedDiff !== 0) return delayedDiff
        const delayDiff =
          sort.dir === 'asc'
            ? Number(a.delayRank || 0) - Number(b.delayRank || 0)
            : Number(b.delayRank || 0) - Number(a.delayRank || 0)
        if (delayDiff !== 0) return delayDiff

        const emissaoA = String(a.emissao || '')
        const emissaoB = String(b.emissao || '')
        if (emissaoA < emissaoB) return sort.dir === 'asc' ? -1 : 1
        if (emissaoA > emissaoB) return sort.dir === 'asc' ? 1 : -1
        return 0
      }

      if (sortDataKey === 'delayRank') {
        const statusDiff = (STATUS_SORT_WEIGHT[b.status] || 0) - (STATUS_SORT_WEIGHT[a.status] || 0)
        if (statusDiff !== 0) return statusDiff

        const delayDiff =
          sort.dir === 'asc'
            ? Number(a.delayRank || 0) - Number(b.delayRank || 0)
            : Number(b.delayRank || 0) - Number(a.delayRank || 0)
        if (delayDiff !== 0) return delayDiff
      }

      let valueA = a[sortDataKey]
      let valueB = b[sortDataKey]

      if (typeof valueA === 'string') valueA = valueA.toLowerCase()
      if (typeof valueB === 'string') valueB = valueB.toLowerCase()

      if (valueA < valueB) return sort.dir === 'asc' ? -1 : 1
      if (valueA > valueB) return sort.dir === 'asc' ? 1 : -1
      return 0
    })
  }, [data, sort])

  const cols = [
    { key: 'emissao', label: 'Data Emissao' },
    { key: 'caixa', label: 'Caixa' },
    { key: 'pedidoId', label: 'ID Pedido' },
    { key: 'clinome', label: 'Cliente' },
    { key: 'currentCell', label: 'Celula' },
    { key: 'previsto', label: 'Data Prevista' },
    ...(showDelayDays ? [{ key: 'diasAtraso', label: 'Dias no Lab' }] : []),
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
        <table className={`w-full ${largerText ? 'text-sm' : 'text-xs'}`}>
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
                      col.key === 'emissao'
                        ? 136
                        : col.key === 'caixa'
                          ? 72
                        : col.key === 'pedidoId'
                          ? 104
                          : col.key === 'clinome'
                            ? 196
                          : col.key === 'currentCell'
                            ? 164
                            : col.key === 'previsto'
                                ? 124
                                : col.key === 'saida'
                                  ? 152
                                : col.key === 'diasAtraso'
                                  ? 64
                                  : col.key === 'roteiroResumo'
                                    ? 424
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
                  <td
                    onClick={event => filterBy(event, 'orders.emissao', row.emissao)}
                    className="px-4 py-2.5 font-mono"
                    style={{ color: '#d7e9ff', fontSize: largerText ? '13px' : undefined }}
                  >
                    {fmtDt(row.emissao)}
                  </td>
                  <td className="px-4 py-2.5" style={{ color: '#e2e8f0' }}>
                    {row.caixa || '-'}
                  </td>
                  <td
                    onClick={event => filterBy(event, 'pedcodigo', row.pedidoId)}
                    className="px-4 py-2.5 font-mono font-medium"
                    style={{ color: '#7dd3fc' }}
                    title={`ID_PEDIDO: ${row.pedidoId} | PEDCODIGO: ${row.pedcodigo}`}
                  >
                    {row.pedidoId}
                  </td>
                  <td
                    onClick={event => filterBy(event, 'clicodigo', row.clicodigo)}
                    className="px-4 py-2.5"
                    style={{ color: '#e2e8f0', maxWidth: 196, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    title={row.clicodigo != null || row.clinome ? `${row.clicodigo ?? '-'} - ${row.clinome || '-'}` : '-'}
                  >
                    {row.clicodigo != null || row.clinome ? `${row.clicodigo ?? '-'} - ${row.clinome || '-'}` : '-'}
                  </td>
                  <td onClick={event => filterBy(event, 'orders.currentCell', row.currentCell)} className="px-4 py-2.5" style={{ color: '#e2e8f0' }}>
                    {row.currentCell || '-'}
                  </td>
                  <td
                    onClick={event => filterBy(event, 'orders.previsto', row.previsto)}
                    className="px-4 py-2.5 font-mono"
                    style={{ color: '#d7e9ff', fontSize: largerText ? '13px' : undefined }}
                  >
                    {fmtDt(row.previsto)}
                  </td>
                  {showDelayDays ? (
                    <td className="px-4 py-2.5 font-mono" style={{ color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                      {fmtDelayDays(row.delayRank)}
                    </td>
                  ) : null}
                  {!hideDeliveredColumn ? (
                    <td
                      onClick={event => filterBy(event, 'orders.saida', row.saida)}
                      className="px-4 py-2.5 font-mono"
                      style={{ color: '#d7e9ff', fontSize: largerText ? '13px' : undefined }}
                    >
                      {fmtDt(row.saida)}
                    </td>
                  ) : null}
                  <td className="px-4 py-2.5" style={{ width: 188 }}>
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
