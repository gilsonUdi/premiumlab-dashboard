'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { format, startOfMonth } from 'date-fns'
import { ArrowLeft, Building2, RefreshCw, X } from 'lucide-react'
import Filters from '@/components/Filters'
import KPICards from '@/components/KPICards'
import HistoricoPedidos from '@/components/HistoricoPedidos'
import DetalhesProdutos from '@/components/DetalhesProdutos'
import RastreabilidadePedido from '@/components/RastreabilidadePedido'
import IndiceAtendimento from '@/components/IndiceAtendimento'

const PontualidadeChart = dynamic(() => import('@/components/PontualidadeChart'), { ssr: false })
const PerdasChart = dynamic(() => import('@/components/PerdasChart'), { ssr: false })

const defaultFilters = () => ({
  dateStart: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  dateEnd: format(new Date(), 'yyyy-MM-dd'),
  dptcodigo: '',
  clicodigo: '',
  clinome: '',
  pedcodigo: '',
  gclcodigo: '',
  status: '',
})

export default function ProductionDashboard({
  companyName = 'Premium Lab',
  companySubtitle = 'Dashboard de Producao',
  backHref = null,
}) {
  const [filters, setFilters] = useState(defaultFilters)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [selectedClient, setSelectedClient] = useState(null)
  const [columnFilters, setColumnFilters] = useState({})
  const [data, setData] = useState(null)
  const [options, setOptions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    fetch('/api/options')
      .then(response => response.json())
      .then(setOptions)
      .catch(console.error)
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
    if (Object.keys(columnFilters).length > 0) params.set('columnFilters', JSON.stringify(columnFilters))
    if (selectedOrder) params.set('pedcodigo', selectedOrder)
    if (selectedClient) params.set('clicodigo', selectedClient)

    try {
      const response = await fetch(`/api/dashboard?${params}`)
      const payload = await response.json()
      setData(payload)
      setLastUpdated(new Date())
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [filters, selectedOrder, selectedClient, columnFilters])

  const handleFiltersChange = useCallback(updater => {
    setFilters(previous => (typeof updater === 'function' ? updater(previous) : updater))
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
      setSelectedOrder(previous => (previous === value || value === null ? null : value))
      setColumnFilters(previous => {
        const next = { ...previous }
        delete next.pedcodigo
        return next
      })
      return
    }

    if (field === 'clicodigo') {
      setSelectedClient(previous => (previous === value || value === null ? null : value))
      setColumnFilters(previous => {
        const next = { ...previous }
        delete next.clicodigo
        return next
      })
      return
    }

    setColumnFilters(previous => {
      const normalized = value == null ? '' : String(value)
      if (String(previous[field] || '') === normalized) {
        const next = { ...previous }
        delete next[field]
        return next
      }
      return { ...previous, [field]: normalized }
    })
  }

  const handleReset = () => {
    setFilters(defaultFilters())
    setSelectedOrder(null)
    setSelectedClient(null)
    setColumnFilters({})
  }

  const activeChips = [
    selectedOrder && { label: `Pedido: ${selectedOrder}`, onRemove: () => setSelectedOrder(null) },
    selectedClient && { label: `Cliente: ${selectedClient}`, onRemove: () => setSelectedClient(null) },
    ...Object.entries(columnFilters).map(([field, value]) => ({
      label: `${field}: ${value}`,
      onRemove: () =>
        setColumnFilters(previous => {
          const next = { ...previous }
          delete next[field]
          return next
        }),
    })),
  ].filter(Boolean)

  return (
    <div className="min-h-screen bg-[#030b1a]">
      <header style={{ background: '#050f1e', borderBottom: '1px solid #1a3355' }}>
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            {backHref ? (
              <Link
                href={backHref}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#1a3355] bg-[#0d1f38] text-[#7ba3cc] transition hover:border-[#2a4f7a] hover:text-white"
              >
                <ArrowLeft size={16} />
              </Link>
            ) : null}
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#1d6fa4,#0891b2)]">
              <Building2 size={18} color="#fff" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-wide text-[#e2e8f0]">{companyName}</h1>
              <p className="text-xs text-[#4a6b8a]">{companySubtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {lastUpdated ? (
              <span className="hidden text-xs text-[#4a6b8a] md:block">Atualizado as {format(lastUpdated, 'HH:mm:ss')}</span>
            ) : null}
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-[#1a3355] bg-[#0d1f38] px-3 py-1.5 text-xs font-medium text-[#7ba3cc] transition-all"
              title="Atualizar dados"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span className="hidden md:inline">Atualizar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl px-4 py-4">
        <Filters filters={filters} options={options} onChange={handleFiltersChange} onReset={handleReset} />

        {activeChips.length > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#4a6b8a]">Filtros ativos:</span>
            {activeChips.map((chip, index) => (
              <button key={index} className="filter-chip" onClick={chip.onRemove}>
                {chip.label}
                <X size={10} />
              </button>
            ))}
          </div>
        ) : null}

        <KPICards data={data?.kpis} loading={loading} />

        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PontualidadeChart data={data?.pontualidade} loading={loading} />
          <PerdasChart data={data?.perdas} loading={loading} />
        </div>

        <HistoricoPedidos
          data={data?.orders}
          selectedOrder={selectedOrder}
          onColumnClick={handleColumnClick}
          loading={loading}
        />

        <DetalhesProdutos
          data={data?.products}
          selectedOrder={selectedOrder}
          onColumnClick={handleColumnClick}
          loading={loading}
        />

        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
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

        <div className="py-4 text-center text-[11px] text-[#1a3355]">
          {companyName} © {new Date().getFullYear()} - Dashboard de Producao
        </div>
      </main>
    </div>
  )
}
