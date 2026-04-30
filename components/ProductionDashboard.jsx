'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { format, startOfMonth } from 'date-fns'
import { ArrowLeft, Building2, Download, RefreshCw, X } from 'lucide-react'
import Filters from '@/components/Filters'
import KPICards, { CompactPpsKpis } from '@/components/KPICards'
import HistoricoPedidos from '@/components/HistoricoPedidos'
import DetalhesProdutos from '@/components/DetalhesProdutos'
import RastreabilidadePedido from '@/components/RastreabilidadePedido'
import IndiceAtendimento from '@/components/IndiceAtendimento'
import RankingVendedores from '@/components/RankingVendedores'
import { getFirebaseServices } from '@/lib/firebase-client'

const PontualidadeChart = dynamic(() => import('@/components/PontualidadeChart'), { ssr: false })
const PerdasChart = dynamic(() => import('@/components/PerdasChart'), { ssr: false })

const defaultFilters = () => ({
  dateStart: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  dateEnd: format(new Date(), 'yyyy-MM-dd'),
  clicodigo: [],
  clinome: [],
  pedcodigo: [],
  gclcodigo: [],
  status: [],
  emissao: [],
  indice: [],
  previsto: [],
  saida: [],
  quantidade: [],
  currentCell: [],
  productStatus: [],
  procodigo: [],
  prodescricao: [],
  productQuantidade: [],
  customerIndice: [],
  customerMediaDias: [],
})

const FILTER_LABELS = {
  pedcodigo: 'Pedido',
  clicodigo: 'Cliente',
  clinome: 'Nome Cliente',
  gclcodigo: 'Grupo Cliente',
  status: 'Status',
  emissao: 'Emissao',
  indice: 'Indice',
  previsto: 'Dt. Prevista',
  saida: 'Dt. Saida',
  quantidade: 'Quantidade',
  currentCell: 'Celula',
  productStatus: 'Status Produto',
  procodigo: 'Cod. Produto',
  prodescricao: 'Descricao',
  productQuantidade: 'Qtd. Produto',
  customerIndice: 'Indice Cliente',
  customerMediaDias: 'Media Dias',
}

const INTERACTIVE_FIELD_MAP = {
  pedcodigo: 'pedcodigo',
  clicodigo: 'clicodigo',
  'orders.emissao': 'emissao',
  'orders.indice': 'indice',
  'orders.previsto': 'previsto',
  'orders.saida': 'saida',
  'orders.quantidade': 'quantidade',
  'orders.status': 'status',
  'orders.currentCell': 'currentCell',
  'products.status': 'productStatus',
  'products.procodigo': 'procodigo',
  'products.prodescricao': 'prodescricao',
  'products.quantidade': 'productQuantidade',
  'customers.indice': 'customerIndice',
  'customers.mediaDias': 'customerMediaDias',
}

const STATUS_LABELS = {
  completed: 'Concluido',
  delayed_completed: 'Entregue (atraso)',
  delayed: 'Em Producao (atraso)',
  in_progress: 'Em Producao',
  pending: 'Aguardando',
}

function formatDateTimeLabel(value) {
  if (!value) return ''
  try {
    return format(new Date(value), 'dd/MM/yyyy HH:mm')
  } catch {
    return String(value)
  }
}

export default function ProductionDashboard({
  companyName = 'Premium Lab',
  companySubtitle = 'Dashboard de Producao',
  backHref = null,
  tenantSlug,
  mode = 'analysis',
}) {
  const isPpsMode = mode === 'pps'
  const [filters, setFilters] = useState(defaultFilters)
  const [data, setData] = useState(null)
  const [options, setOptions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const debounceRef = useRef(null)

  const selectedOrder = filters.pedcodigo.length === 1 ? filters.pedcodigo[0] : null
  const selectedOrderLabel = filters.pedcodigo.length > 1 ? `${filters.pedcodigo.length} pedidos` : selectedOrder
  const selectedClient = filters.clicodigo.length === 1 ? filters.clicodigo[0] : null

  const getAuthorizedHeaders = useCallback(async () => {
    const { auth } = getFirebaseServices()
    const authUser = auth.currentUser
    if (!authUser) return {}

    const token = await authUser.getIdToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }, [])

  useEffect(() => {
    async function fetchOptions() {
      try {
        const params = new URLSearchParams()
        if (tenantSlug) params.set('tenant', tenantSlug)

        const response = await fetch(`/api/options?${params}`, {
          headers: await getAuthorizedHeaders(),
        })
        const payload = await response.json()
        setOptions(payload)
      } catch (error) {
        console.error(error)
      }
    }

    fetchOptions()
  }, [getAuthorizedHeaders, tenantSlug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        if (value.length > 0) params.set(key, value.join(','))
        return
      }

      if (value) params.set(key, value)
    })
    if (tenantSlug) params.set('tenant', tenantSlug)

    try {
      const response = await fetch(`/api/dashboard?${params}`, {
        headers: await getAuthorizedHeaders(),
      })
      const payload = await response.json()
      setData(payload)
      setLastUpdated(new Date())
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [filters, getAuthorizedHeaders, tenantSlug])

  const handleFiltersChange = useCallback(updater => {
    setFilters(previous => (typeof updater === 'function' ? updater(previous) : updater))
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(fetchData, 350)
    return () => clearTimeout(debounceRef.current)
  }, [fetchData])

  const handleColumnClick = useCallback((field, value) => {
    const filterKey = INTERACTIVE_FIELD_MAP[field]
    if (!filterKey) return

    setFilters(previous => {
      const normalized = value == null ? '' : String(value)
      const currentValues = Array.isArray(previous[filterKey]) ? previous[filterKey] : []
      const nextValues = !normalized
        ? []
        : currentValues.includes(normalized)
          ? currentValues.filter(item => item !== normalized)
          : [...currentValues, normalized]

      return {
        ...previous,
        [filterKey]: nextValues,
      }
    })
  }, [])

  const handleReset = () => {
    setFilters(defaultFilters())
  }

  const activeChips = useMemo(() => {
    const currentCellLabels = new Map(
      [ ...(options?.stages || []).map(stage => [String(stage.label), stage.label]), ['PEDIDO FATURADO', 'PEDIDO FATURADO'] ]
    )
    const clientNameLabels = new Map((options?.clients || []).map(client => [String(client.clicodigo), client.label]))
    const groupLabels = new Map((options?.clientGroups || []).map(group => [String(group.value), group.label]))
    const statusLabels = new Map((options?.statuses || []).map(status => [String(status.value), status.label]))

    const resolveChipValue = (key, value) => {
      if (key === 'clinome') return clientNameLabels.get(String(value)) || value
      if (key === 'gclcodigo') return groupLabels.get(String(value)) || value
      if (key === 'status') return statusLabels.get(String(value)) || value
      if (key === 'currentCell') return currentCellLabels.get(String(value)) || value
      return value
    }

    return Object.entries(filters)
      .filter(([key, value]) => !['dateStart', 'dateEnd'].includes(key) && Array.isArray(value) && value.length > 0)
      .flatMap(([key, value]) =>
        value.map(item => ({
          key: `${key}-${item}`,
          label: `${FILTER_LABELS[key] || key}: ${resolveChipValue(key, item)}`,
          onRemove: () =>
            setFilters(previous => ({
              ...previous,
              [key]: previous[key].filter(current => current !== item),
            })),
        }))
      )
      .concat(
        []
      )
  }, [filters, options])

  const handleExport = useCallback(async () => {
    if (!data) return

    try {
      setExporting(true)
      const XLSX = await import('xlsx')
      const workbook = XLSX.utils.book_new()

      const orderRows = (data.orders || []).map(row => ({
        'Data Emissao': formatDateTimeLabel(row.emissao),
        'Cod. Pedido': row.pedcodigo,
        'Indice %': row.indice,
        Celula: row.currentCell || '-',
        Caixa: row.caixa || '-',
        'Dt. Prevista': formatDateTimeLabel(row.previsto),
        'Dt. Saida': formatDateTimeLabel(row.saida),
        Quantidade: row.quantidade,
        Status: STATUS_LABELS[row.status] || row.status,
      }))

      const productRows = (data.products || []).map(row => ({
        'Cod. Pedido': row.pedcodigo,
        Status: row.status,
        'Cod. Produto': row.procodigo,
        Descricao: row.prodescricao,
        Quantidade: row.quantidade,
      }))

      const traceRows = (data.traceability || []).map(row => ({
        Estoque: row.estoque,
        Celula: row.celula,
        'Data e Hora': formatDateTimeLabel(row.dataHora),
        Usuario: row.usuario,
        Pedido: row.pedcodigo,
      }))

      const customerRows = (data.customers || []).map(row => ({
        Cliente: row.clinome,
        Indice: row.indice,
        'Media Dias': row.mediaDias,
      }))

      const sellerRows = (data.sellerRanking || []).map(row => ({
        Posicao: `${row.posicao}º`,
        'Cod. Vendedor': row.vendedorCodigo,
        Vendedor: row.vendedorNome,
        Vendas: row.totalVendas,
        Pecas: row.totalPecas,
      }))

      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(orderRows), 'Historico')
      if (!isPpsMode) {
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(productRows), 'Produtos')
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(traceRows), 'Rastreabilidade')
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(customerRows), 'Clientes')
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sellerRows), 'Vendedores')
      }

      XLSX.writeFile(workbook, `${companyName.replace(/\s+/g, '-').toLowerCase()}-${isPpsMode ? 'pps' : 'analise'}-${format(new Date(), 'yyyyMMdd-HHmm')}.xlsx`)
    } catch (error) {
      console.error(error)
    } finally {
      setExporting(false)
    }
  }, [companyName, data, isPpsMode])

  return (
    <div className={`bg-[#030b1a] ${isPpsMode ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
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
              onClick={handleExport}
              disabled={loading || exporting}
              className="flex items-center gap-1.5 rounded-lg border border-[#1a3355] bg-[#0d1f38] px-3 py-1.5 text-xs font-medium text-[#7ba3cc] transition-all disabled:opacity-60"
              title="Exportar tabelas"
            >
              <Download size={13} />
              <span className="hidden md:inline">{exporting ? 'Exportando' : 'Excel'}</span>
            </button>
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

      <main className={`mx-auto max-w-screen-2xl px-4 py-4 ${isPpsMode ? 'flex h-[calc(100vh-72px)] flex-col overflow-hidden' : ''}`}>
        <Filters
          filters={filters}
          options={options}
          onChange={handleFiltersChange}
          onReset={handleReset}
          defaultOpen={!isPpsMode}
          compact={isPpsMode}
          showDateFilters={!isPpsMode}
        />

        {activeChips.length > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#4a6b8a]">Filtros ativos:</span>
            {activeChips.map(chip => (
              <button key={chip.key} className="filter-chip" onClick={chip.onRemove}>
                {chip.label}
                <X size={10} />
              </button>
            ))}
          </div>
        ) : null}

        {isPpsMode ? <CompactPpsKpis data={data?.kpis} loading={loading} /> : <KPICards data={data?.kpis} loading={loading} />}

        {isPpsMode ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <HistoricoPedidos
              data={data?.orders}
              selectedOrder={selectedOrderLabel}
              onColumnClick={handleColumnClick}
              loading={loading}
              compact
              fillHeight
            />
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <PontualidadeChart data={data?.pontualidade} loading={loading} />
              <PerdasChart data={data?.perdas} loading={loading} />
            </div>

            <HistoricoPedidos
              data={data?.orders}
              selectedOrder={selectedOrderLabel}
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
                selectedOrder={selectedOrderLabel}
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

            <RankingVendedores data={data?.sellerRanking} loading={loading} />
          </>
        )}

        {!isPpsMode ? (
          <div className="py-4 text-center text-[11px] text-[#1a3355]">
            {companyName} © {new Date().getFullYear()} - {companySubtitle}
          </div>
        ) : null}
      </main>
    </div>
  )
}
