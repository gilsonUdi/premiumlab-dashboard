'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, RotateCcw, Search } from 'lucide-react'

const VISIBLE_FILTER_FIELDS = ['currentCell', 'clicodigo', 'clinome', 'pedcodigo', 'gclcodigo', 'status']

function MultiSelectField({ label, value = [], options = [], onChange, placeholder = 'Selecione' }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  const selectedValues = Array.isArray(value) ? value : []
  const selectedLabels = useMemo(() => {
    const selectedSet = new Set(selectedValues)
    return options.filter(option => selectedSet.has(String(option.value))).map(option => option.label)
  }, [options, selectedValues])

  const toggleValue = nextValue => {
    const normalized = String(nextValue)
    const next = selectedValues.includes(normalized)
      ? selectedValues.filter(item => item !== normalized)
      : [...selectedValues, normalized]
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-1" ref={containerRef}>
      <label className="text-xs font-medium" style={{ color: '#7ba3cc' }}>{label}</label>
      <div className="relative">
        <button
          type="button"
          className="dashboard-input flex w-full items-center justify-between gap-2 text-left"
          onClick={() => setOpen(previous => !previous)}
        >
          <span className="truncate" style={{ color: selectedLabels.length > 0 ? '#e2e8f0' : '#7ba3cc' }}>
            {selectedLabels.length > 0 ? selectedLabels.join(', ') : placeholder}
          </span>
          <ChevronDown size={14} style={{ color: '#4a6b8a' }} />
        </button>

        {open ? (
          <div
            className="absolute left-0 top-[calc(100%+6px)] z-30 w-full rounded-lg border bg-[#081423] p-2 shadow-2xl"
            style={{ borderColor: '#1a3355' }}
          >
            <div className="max-h-56 overflow-auto">
              {options.map(option => {
                const optionValue = String(option.value)
                const checked = selectedValues.includes(optionValue)

                return (
                  <button
                    key={optionValue}
                    type="button"
                    className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs transition hover:bg-[#0d1f38]"
                    onClick={() => toggleValue(optionValue)}
                  >
                    <span className="pr-3" style={{ color: '#e2e8f0' }}>{option.label}</span>
                    <span
                      className="flex h-4 w-4 items-center justify-center rounded border"
                      style={{
                        borderColor: checked ? '#3b9fd4' : '#2a4f7a',
                        background: checked ? '#1d6fa4' : 'transparent',
                      }}
                    >
                      {checked ? <Check size={11} color="#fff" /> : null}
                    </span>
                  </button>
                )
              })}
            </div>

            {selectedLabels.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1 border-t border-[#1a3355] pt-2">
                {selectedLabels.map(labelText => (
                  <span key={labelText} className="rounded-full border border-[#2a4f7a] bg-[#0d1f38] px-2 py-0.5 text-[11px] text-[#7dd3fc]">
                    {labelText}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

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

  const stages = [
    ...(options?.stages || []).map(stage => ({ value: stage.label, label: stage.label })),
    { value: 'PEDIDO FATURADO', label: 'PEDIDO FATURADO' },
  ].filter((stage, index, array) => array.findIndex(item => item.value === stage.value) === index)
  const clients = options?.clients || []
  const groups = options?.clientGroups || []
  const statuses = options?.statuses || []

  const activeCount = Object.entries(filters).filter(([key, value]) => {
    if (!VISIBLE_FILTER_FIELDS.includes(key)) return false
    return Array.isArray(value) ? value.length > 0 : value !== ''
  }).length

  const joinValues = values => (Array.isArray(values) ? values.join(', ') : '')
  const splitValues = text =>
    [...new Set(String(text || '').split(',').map(item => item.trim()).filter(Boolean))]

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

            <MultiSelectField
              label="Celula"
              value={filters.currentCell}
              options={stages}
              onChange={value => set('currentCell', value)}
              placeholder="Todas"
            />

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#7ba3cc' }}>Cod. Cliente</label>
              <input
                type="text"
                placeholder="Codigos separados por virgula"
                className="dashboard-input"
                value={joinValues(filters.clicodigo)}
                onChange={event => set('clicodigo', splitValues(event.target.value))}
              />
            </div>

            <MultiSelectField
              label="Nome Cliente"
              value={filters.clinome}
              options={clients.map(client => ({ value: String(client.clicodigo), label: client.label }))}
              onChange={value => set('clinome', value)}
              placeholder="Todos"
            />

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#7ba3cc' }}>Cod. Pedido</label>
              <input
                type="text"
                placeholder="Pedidos separados por virgula"
                className="dashboard-input"
                value={joinValues(filters.pedcodigo)}
                onChange={event => set('pedcodigo', splitValues(event.target.value))}
              />
            </div>

            <MultiSelectField
              label="Grupo Cliente"
              value={filters.gclcodigo}
              options={groups.map(group => ({ value: String(group.value), label: group.label }))}
              onChange={value => set('gclcodigo', value)}
              placeholder="Todos"
            />

            <MultiSelectField
              label="Status"
              value={filters.status}
              options={statuses.map(status => ({ value: status.value, label: status.label }))}
              onChange={value => set('status', value)}
              placeholder="Todos"
            />
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
