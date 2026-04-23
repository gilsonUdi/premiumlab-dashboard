'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { format, startOfMonth } from 'date-fns'
import { RefreshCw, Microscope, X } from 'lucide-react'
import Filters from '@/components/Filters'
import KPICards from '@/components/KPICards'
import HistoricoPedidos from '@/components/HistoricoPedidos'
import DetalhesProdutos from '@/components/DetalhesProdutos'
import RastreabilidadePedido from '@/components/RastreabilidadePedido'
import IndiceAtendimento from '@/components/IndiceAtendimento'

// Dynamic import for chart components (browser-only)
const PontualidadeChart = dynamic(() => import('@/components/PontualidadeChart'), { ssr: false })
const PerdasChart = dynamic(() => import('@/components/PerdasChart'), { ssr: false })

const defaultFilters = () => ({
  dateStart: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  dateEnd:   format(new Date(), 'yyyy-MM-dd'),
  dptcodigo: '',
  clicodigo: '',
  clinome:   '',
  pedcodigo: '',
  gclcodigo: '',
  status:    '',
})

export default function Dashboard() {
  const [filters, setFilters]           = useState(defaultFilters)
  const [selectedOrder, setSelectedOrder]   = useState(null)
  const [selectedClient, setSelectedClient] = useState(null)
  const [columnFilters, setColumnFilters] = useState({})
  const [data, setData]     = useState(null)
  const [options, setOptions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const debounceRef = useRef(null)

  // Fetch filter options once on mount
  useEffect(() => {
    fetch('/api/options')
      .then(r => r.json())
      .then(setOptions)
      .catch(console.error)
  }, [])

  // Fetch dashboard data (debounced)
  const fetchData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
    if (Object.keys(columnFilters).length > 0) params.set('columnFilters', JSON.stringify(columnFilters))
    if (selectedOrder)  params.set('pedcodigo', selectedOrder)
    if (selectedClient) params.set('clicodigo', selectedClient)
    try {
      const res = await fetch(`/api/dashboard?${params}`)
      const json = await res.json()
      setData(json)
      setLastUpdated(new Date())
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [filters, selectedOrder, selectedClient, columnFilters])

  const handleFiltersChange = useCallback((updater) => {
    setFilters(prev => (typeof updater === 'function' ? updater(prev) : updater))
    setSelectedOrder(null)
    setSelectedClient(null)
    setColumnFilters({})
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(fetchData, 350)
    return () => clearTimeout(debounceRef.current)
  }, [fetchData])

  const handleColumnClick = (field, value) => {
    if (field === 'pedcodigo') {
      setSelectedOrder(prev => prev === value || value === null ? null : value)
      setColumnFilters(prev => {
        const next = { ...prev }
        delete next.pedcodigo
        return next
      })
    } else if (field === 'clicodigo') {
      setSelectedClient(prev => prev === value || value === null ? null : value)
      setColumnFilters(prev => {
        const next = { ...prev }
        delete next.clicodigo
        return next
      })
    } else {
      setColumnFilters(prev => {
        const normalized = value == null ? '' : String(value)
        if (String(prev[field] || '') === normalized) {
          const next = { ...prev }
          delete next[field]
          return next
        }
        return { ...prev, [field]: normalized }
      })
    }
  }

  const handleReset = () => {
    setFilters(defaultFilters())
    setSelectedOrder(null)
    setSelectedClient(null)
    setColumnFilters({})
  }

  const activeChips = [
    selectedOrder  && { label: `Pedido: ${selectedOrder}`,     onRemove: () => setSelectedOrder(null)  },
    selectedClient && { label: `Cliente: ${selectedClient}`,   onRemove: () => setSelectedClient(null) },
    ...Object.entries(columnFilters).map(([field, value]) => ({
      label: `${field}: ${value}`,
      onRemove: () => setColumnFilters(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      }),
    })),
  ].filter(Boolean)

  return (
    <div className="min-h-screen" style={{ background: '#030b1a' }}>
      {/* ─── HEADER ────────────────────────────────────────────────── */}
      <header style={{ background: '#050f1e', borderBottom: '1px solid #1a3355' }}>
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1d6fa4, #0891b2)' }}>
              <Microscope size={18} color="#fff" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-wide" style={{ color: '#e2e8f0' }}>
                Premium Lab
              </h1>
              <p className="text-xs" style={{ color: '#4a6b8a' }}>Dashboard de Produção</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs hidden md:block" style={{ color: '#4a6b8a' }}>
                Atualizado às {format(lastUpdated, 'HH:mm:ss')}
              </span>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: '#0d1f38', border: '1px solid #1a3355', color: '#7ba3cc' }}
              title="Atualizar dados"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span className="hidden md:inline">Atualizar</span>
            </button>
          </div>
        </div>
      </header>

      {/* ─── CONTENT ───────────────────────────────────────────────── */}
      <main className="max-w-screen-2xl mx-auto px-4 py-4">

        {/* Filters */}
        <Filters
          filters={filters}
          options={options}
          onChange={handleFiltersChange}
          onReset={handleReset}
        />

        {/* Active interactive filter chips */}
        {activeChips.length > 0 && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-xs" style={{ color: '#4a6b8a' }}>Filtros ativos:</span>
            {activeChips.map((chip, i) => (
              <button
                key={i}
                className="filter-chip"
                onClick={chip.onRemove}
              >
                {chip.label}
                <X size={10} />
              </button>
            ))}
          </div>
        )}

        {/* KPIs */}
        <KPICards data={data?.kpis} loading={loading} />

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <PontualidadeChart data={data?.pontualidade} loading={loading} />
          <PerdasChart data={data?.perdas} loading={loading} />
        </div>

        {/* Order History */}
        <HistoricoPedidos
          data={data?.orders}
          selectedOrder={selectedOrder}
          onColumnClick={handleColumnClick}
          loading={loading}
        />

        {/* Product Details */}
        <DetalhesProdutos
          data={data?.products}
          selectedOrder={selectedOrder}
          onColumnClick={handleColumnClick}
          loading={loading}
        />

        {/* Traceability + Customer Index */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <RastreabilidadePedido
            data={data?.traceability}
            selectedOrder={selectedOrder}
            onColumnClick={handleColumnClick}
            loading={loading}
          />
          <IndiceAtendimento
            data={data?.customers}
            selectedClient={selectedClient}
            onColumnClick={handleColumnClick}
            loading={loading}
          />
        </div>

        {/* Footer */}
        <div className="text-center py-4" style={{ color: '#1a3355', fontSize: 11 }}>
          Premium Lab © {new Date().getFullYear()} — Dashboard de Produção
        </div>
      </main>
    </div>
  )
}
