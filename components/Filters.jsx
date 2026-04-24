'use client'
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, RotateCcw, Search } from 'lucide-react'

const VISIBLE_FILTER_FIELDS = ['dptcodigo', 'clicodigo', 'clinome', 'pedcodigo', 'gclcodigo', 'status']

export default function Filters({
  filters,
  options,
  onChange,
  onReset,
  defaultOpen = true,
  compact = false,
  showDateFilters = true,
}) {
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    setOpen(defaultOpen)
  }, [defaultOpen])

  const set = (field, value) => onChange(prev => ({ ...prev, [field]: value }))

  const cells = options?.cells || []
  const clients = options?.clients || []
  const groups = options?.clientGroups || []
  const statuses = options?.statuses || []

  const activeCount = Object.entries(filters).filter(([key, value]) => {
    if (!VISIBLE_FILTER_FIELDS.includes(key)) return false
    return value !== ''
  }).length

  return (
    <div className="card mb-4">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        style={{ borderBottom: open ? '1px solid #1a3355' : 'none' }}
        onClick={() => setOpen(previous => !previous)}
      >
        <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#e2e8f0' }}>
          <Search size={15} style={{ color: '#3b9fd4' }} />
          Filtros
          {activeCount > 0 ? (
            <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: '#1d6fa4', color: '#e2e8f0' }}>
              {activeCount}
            </span>
          ) : null}
        </span>
        <span style={{ color: '#4a6b8a' }}>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {open ? (
        <div className="p-4">
          <div className={`grid gap-3 ${compact ? 'grid-cols-2 lg:grid-cols-4 xl:grid-cols-6' : 'grid-cols-2 md:grid-cols-4 xl:grid-cols-8'}`}>
            {showDateFilters ? (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: '#7ba3cc' }}>Data Inicio</label>
                  <input
                    type="date"
                    className="dashboard-input"
                    value={filters.dateStart}
                    onChange={event => set('dateStart', event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={{ color: '#7ba3cc' }}>Data Fim</label>
                  <input
                    type="date"
                    className="dashboard-input"
                    value={filters.dateEnd}
                    onChange={event => set('dateEnd', event.target.value)}
                  />
                </div>
              </>
            ) : null}

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#7ba3cc' }}>Celula</label>
              <select className="dashboard-input" value={filters.dptcodigo} onChange={event => set('dptcodigo', event.target.value)}>
                <option value="">Todas</option>
                {cells.map(cell => (
                  <option key={cell.value} value={cell.value}>{cell.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#7ba3cc' }}>Cod. Cliente</label>
              <input
                type="text"
                placeholder="Codigo..."
                className="dashboard-input"
                value={filters.clicodigo}
                onChange={event => set('clicodigo', event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#7ba3cc' }}>Nome Cliente</label>
              <select
                className="dashboard-input"
                value={filters.clinome}
                onChange={event => {
                  const client = clients.find(item => item.label === event.target.value)
                  set('clinome', event.target.value)
                  if (client) set('clicodigo', String(client.clicodigo))
                }}
              >
                <option value="">Todos</option>
                {clients.map(client => (
                  <option key={client.clicodigo} value={client.label}>{client.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#7ba3cc' }}>Cod. Pedido</label>
              <input
                type="text"
                placeholder="Pedido..."
                className="dashboard-input"
                value={filters.pedcodigo}
                onChange={event => set('pedcodigo', event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#7ba3cc' }}>Grupo Cliente</label>
              <select className="dashboard-input" value={filters.gclcodigo} onChange={event => set('gclcodigo', event.target.value)}>
                <option value="">Todos</option>
                {groups.map(group => (
                  <option key={group.value} value={group.value}>{group.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#7ba3cc' }}>Status</label>
              <select className="dashboard-input" value={filters.status} onChange={event => set('status', event.target.value)}>
                <option value="">Todos</option>
                {statuses.map(status => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </div>
          </div>

          {activeCount > 0 ? (
            <div className="mt-3 flex items-center gap-2 pt-3" style={{ borderTop: '1px solid #1a3355' }}>
              <button
                className="flex items-center gap-1 rounded px-3 py-1.5 text-xs"
                style={{ background: '#1a3355', color: '#7ba3cc', border: '1px solid #2a4f7a' }}
                onClick={onReset}
              >
                <RotateCcw size={12} />
                Limpar filtros
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
