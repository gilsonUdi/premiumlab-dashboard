'use client'
import { useState } from 'react'
import { ChevronDown, ChevronUp, Search, X, RotateCcw } from 'lucide-react'

export default function Filters({ filters, options, onChange, onReset }) {
  const [open, setOpen] = useState(true)

  const set = (field, value) => onChange(prev => ({ ...prev, [field]: value }))

  const cells    = options?.cells    || []
  const clients  = options?.clients  || []
  const groups   = options?.clientGroups || []
  const statuses = options?.statuses || []

  const activeCount = Object.entries(filters).filter(([k, v]) => {
    if (k === 'dateStart' || k === 'dateEnd') return false
    return v !== ''
  }).length

  return (
    <div className="card mb-4">
      <button
        className="flex items-center justify-between w-full px-4 py-3 text-left"
        style={{ borderBottom: open ? '1px solid #1a3355' : 'none' }}
        onClick={() => setOpen(o => !o)}
      >
        <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#e2e8f0' }}>
          <Search size={15} style={{ color: '#3b9fd4' }} />
          Filtros
          {activeCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: '#1d6fa4', color: '#e2e8f0' }}>
              {activeCount}
            </span>
          )}
        </span>
        <span style={{ color: '#4a6b8a' }}>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {open && (
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">

            {/* Date Start */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#7ba3cc' }}>Data Início</label>
              <input
                type="date"
                className="dashboard-input"
                value={filters.dateStart}
                onChange={e => set('dateStart', e.target.value)}
              />
            </div>

            {/* Date End */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#7ba3cc' }}>Data Fim</label>
              <input
                type="date"
                className="dashboard-input"
                value={filters.dateEnd}
                onChange={e => set('dateEnd', e.target.value)}
              />
            </div>

            {/* Cell */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#7ba3cc' }}>Célula</label>
              <select className="dashboard-input" value={filters.dptcodigo} onChange={e => set('dptcodigo', e.target.value)}>
                <option value="">Todas</option>
                {cells.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Client Code */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#7ba3cc' }}>Cód. Cliente</label>
              <input
                type="text"
                placeholder="Código..."
                className="dashboard-input"
                value={filters.clicodigo}
                onChange={e => set('clicodigo', e.target.value)}
              />
            </div>

            {/* Client Name */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#7ba3cc' }}>Nome Cliente</label>
              <select className="dashboard-input" value={filters.clinome} onChange={e => {
                const cli = clients.find(c => c.label === e.target.value)
                set('clinome', e.target.value)
                if (cli) set('clicodigo', String(cli.clicodigo))
              }}>
                <option value="">Todos</option>
                {clients.map(c => (
                  <option key={c.clicodigo} value={c.label}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Order Code */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#7ba3cc' }}>Cód. Pedido</label>
              <input
                type="text"
                placeholder="Pedido..."
                className="dashboard-input"
                value={filters.pedcodigo}
                onChange={e => set('pedcodigo', e.target.value)}
              />
            </div>

            {/* Client Group */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#7ba3cc' }}>Grupo Cliente</label>
              <select className="dashboard-input" value={filters.gclcodigo} onChange={e => set('gclcodigo', e.target.value)}>
                <option value="">Todos</option>
                {groups.map(g => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#7ba3cc' }}>Status</label>
              <select className="dashboard-input" value={filters.status} onChange={e => set('status', e.target.value)}>
                <option value="">Todos</option>
                {statuses.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {activeCount > 0 && (
            <div className="mt-3 pt-3 flex items-center gap-2" style={{ borderTop: '1px solid #1a3355' }}>
              <button
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded"
                style={{ background: '#1a3355', color: '#7ba3cc', border: '1px solid #2a4f7a' }}
                onClick={onReset}
              >
                <RotateCcw size={12} /> Limpar filtros
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
