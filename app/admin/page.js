'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Building2,
  LogOut,
  Pencil,
  Plus,
  Search,
  SquareArrowOutUpRight,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import {
  ADMIN_CREDENTIALS,
  clearPortalSession,
  createCompanyUser,
  deleteCompany,
  deleteCompanyUser,
  ensurePremiumLabTenant,
  getCurrentPortalSession,
  getDefaultPermissionsForCompany,
  getPortalAccessToken,
  slugifyCompanyName,
  updateCompanyUser,
  upsertCompany,
} from '@/lib/portal-store'
import {
  DASHBOARD_FILTER_FIELDS,
  DASHBOARD_SECTION_GROUPS,
  getDashboardFilterDefinition,
  normalizeUserPermissions,
  PORTAL_PAGE_KEYS,
  POWER_BI_FILTER_OPERATORS,
} from '@/lib/portal-config'
import { getPowerBiReportCatalog } from '@/lib/power-bi'

function createEmptyPowerBiReport() {
  return {
    id: `power-bi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: '',
    workspaceId: '',
    reportId: '',
    datasetId: '',
    enabled: true,
  }
}

const emptyForm = {
  id: '',
  name: '',
  slug: '',
  email: '',
  password: '',
  supabaseEnabled: true,
  supabaseUrl: '',
  supabaseServiceRoleKey: '',
  supabaseLabel: '',
  externalDashboardUrl: '',
  powerBiEnabled: false,
  powerBiEmbedUrl: '',
  powerBiLabel: '',
  powerBiWorkspaceId: '',
  powerBiReportId: '',
  powerBiDatasetId: '',
  powerBiReports: [],
  tools: ['dashboard'],
  isPremiumLab: false,
}

function buildEmptyUserForm(company) {
  return {
    uid: '',
    name: '',
    email: '',
    password: '',
    permissions: getDefaultPermissionsForCompany(company),
  }
}

function cloneUserForm(user, company) {
  return {
    uid: user.uid,
    name: user.name || '',
    email: user.email || '',
    password: '',
    permissions: JSON.parse(
      JSON.stringify(normalizeUserPermissions(user.permissions, company) || getDefaultPermissionsForCompany(company))
    ),
  }
}

function getCompanyUserList(companyUsers, company) {
  return [...(companyUsers[company.id] || [])].sort((a, b) => {
    if (a.uid === company.authUid) return -1
    if (b.uid === company.authUid) return 1
    return a.email.localeCompare(b.email)
  })
}

function formatCompanyDate(value) {
  if (!value) return 'Nao informado'

  const parsed =
    typeof value?.toDate === 'function'
      ? value.toDate()
      : value?.seconds
        ? new Date(value.seconds * 1000)
        : new Date(value)

  if (Number.isNaN(parsed.getTime())) return 'Nao informado'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed)
}

function formatCompanyStatus(company) {
  if (company.supabaseEnabled && company.powerBiEnabled) return 'Portal interno + Power BI'
  if (!company.supabaseEnabled && company.powerBiEnabled) return 'Dashboard externo + Power BI'
  return company.supabaseEnabled ? 'Portal interno' : 'Dashboard externo'
}

function hasConfiguredPowerBi(company) {
  return getPowerBiReportCatalog(company).length > 0
}

function getReportSchemaTables(report = {}) {
  return Array.isArray(report.tables) ? report.tables.filter(table => table?.name) : []
}

export default function AdminPage() {
  const router = useRouter()
  const [state, setState] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [message, setMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [deletingCompanyId, setDeletingCompanyId] = useState('')
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false)
  const [isUserModalOpen, setIsUserModalOpen] = useState(false)
  const [managingCompanyId, setManagingCompanyId] = useState('')
  const [userForm, setUserForm] = useState(buildEmptyUserForm({ supabaseEnabled: true }))
  const [editingUserId, setEditingUserId] = useState('')
  const [powerBiCatalog, setPowerBiCatalog] = useState([])
  const [powerBiCatalogLoading, setPowerBiCatalogLoading] = useState(false)
  const [powerBiCatalogError, setPowerBiCatalogError] = useState('')
  const [dashboardFilterOptions, setDashboardFilterOptions] = useState(null)
  const [dashboardFilterOptionsLoading, setDashboardFilterOptionsLoading] = useState(false)
  const [dashboardFilterOptionsError, setDashboardFilterOptionsError] = useState('')

  useEffect(() => {
    let active = true

    async function hydrate() {
      try {
        const session = await getCurrentPortalSession()
        if (!session || session.type !== 'admin' || session.email !== ADMIN_CREDENTIALS.email) {
          router.replace('/login')
          return
        }

        const seededState = await ensurePremiumLabTenant()
        if (!active) return
        setState(seededState)
      } catch (error) {
        console.error(error)
        if (active) router.replace('/login')
      }
    }

    hydrate()
    return () => {
      active = false
    }
  }, [router])

  const hasPremiumLab = useMemo(
    () => (state?.companies || []).some(company => company.isPremiumLab),
    [state]
  )

  const companyUsers = useMemo(() => {
    const grouped = {}
    for (const user of state?.users || []) {
      if (!user.companyId) continue
      if (!grouped[user.companyId]) grouped[user.companyId] = []
      grouped[user.companyId].push(user)
    }
    return grouped
  }, [state?.users])

  const filteredCompanies = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return state?.companies || []

    return (state?.companies || []).filter(company =>
      [
        company.name,
        company.slug,
        company.email,
        company.supabaseLabel,
        company.externalDashboardUrl,
        company.powerBiEmbedUrl,
        company.powerBiLabel,
        company.powerBiWorkspaceId,
        company.powerBiReportId,
      ]
        .filter(Boolean)
        .some(value => value.toLowerCase().includes(query))
    )
  }, [searchTerm, state?.companies])

  const managingCompany = useMemo(
    () => (state?.companies || []).find(company => company.id === managingCompanyId) || null,
    [managingCompanyId, state?.companies]
  )

  const editingCompany = useMemo(
    () => (state?.companies || []).find(company => company.id === form.id) || null,
    [form.id, state?.companies]
  )

  useEffect(() => {
    let active = true

    async function loadPowerBiCatalog() {
      if (!isUserModalOpen || !managingCompany || !hasConfiguredPowerBi(managingCompany)) {
        if (active) {
          setPowerBiCatalog([])
          setPowerBiCatalogError('')
          setPowerBiCatalogLoading(false)
        }
        return
      }

      try {
        setPowerBiCatalogLoading(true)
        setPowerBiCatalogError('')
        const token = await getPortalAccessToken()
        const response = await fetch(`/api/power-bi/metadata?slug=${encodeURIComponent(managingCompany.slug)}&includeSchema=1`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
        })
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error || 'Nao foi possivel carregar as paginas do Power BI.')
        }
        if (!active) return
        setPowerBiCatalog(Array.isArray(payload.reports) ? payload.reports : [])
      } catch (error) {
        console.error(error)
        if (!active) return
        setPowerBiCatalog([])
        setPowerBiCatalogError(error.message || 'Nao foi possivel carregar as paginas do Power BI.')
      } finally {
        if (active) setPowerBiCatalogLoading(false)
      }
    }

    loadPowerBiCatalog()

    return () => {
      active = false
    }
  }, [isUserModalOpen, managingCompany])

  useEffect(() => {
    let active = true

    async function loadDashboardFilterOptions() {
      if (!isUserModalOpen || !managingCompany || !managingCompany.supabaseEnabled) {
        if (active) {
          setDashboardFilterOptions(null)
          setDashboardFilterOptionsError('')
          setDashboardFilterOptionsLoading(false)
        }
        return
      }

      try {
        setDashboardFilterOptionsLoading(true)
        setDashboardFilterOptionsError('')
        const token = await getPortalAccessToken()
        const response = await fetch(`/api/options?tenant=${encodeURIComponent(managingCompany.slug)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
        })
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error || 'Nao foi possivel carregar os filtros do dashboard.')
        }
        if (!active) return
        setDashboardFilterOptions(payload || {})
      } catch (error) {
        console.error(error)
        if (!active) return
        setDashboardFilterOptions(null)
        setDashboardFilterOptionsError(error.message || 'Nao foi possivel carregar os filtros do dashboard.')
      } finally {
        if (active) setDashboardFilterOptionsLoading(false)
      }
    }

    loadDashboardFilterOptions()

    return () => {
      active = false
    }
  }, [isUserModalOpen, managingCompany])

  const handleLogout = async () => {
    await clearPortalSession()
    router.push('/login')
  }

  const closeCompanyModal = () => {
    setIsCompanyModalOpen(false)
    setForm(emptyForm)
  }

  const openCreateCompanyModal = () => {
    setForm(emptyForm)
    setIsCompanyModalOpen(true)
  }

  const handleSaveCompany = async event => {
    event.preventDefault()
    if (!state) return

    try {
      const slug = slugifyCompanyName(form.slug || form.name)
      const normalizedReports = form.powerBiEnabled
        ? form.powerBiReports
            .map(report => ({
              ...report,
              label: String(report.label || '').trim(),
              workspaceId: String(report.workspaceId || '').trim(),
              reportId: String(report.reportId || '').trim(),
              datasetId: String(report.datasetId || '').trim(),
              enabled: report.enabled !== false,
            }))
            .filter(report => report.workspaceId && report.reportId)
        : []
      const primaryReport = normalizedReports[0] || null
      const nextState = await upsertCompany(state, {
        ...form,
        id: form.id || slug,
        slug,
        tools: ['dashboard'],
        powerBiReports: normalizedReports,
        powerBiEnabled: form.powerBiEnabled && normalizedReports.length > 0,
        powerBiLabel: primaryReport?.label || '',
        powerBiWorkspaceId: primaryReport?.workspaceId || '',
        powerBiReportId: primaryReport?.reportId || '',
        powerBiDatasetId: primaryReport?.datasetId || '',
      })

      setState(nextState)
      setForm(emptyForm)
      setIsCompanyModalOpen(false)
      setMessage(form.id ? 'Empresa atualizada com sucesso.' : 'Empresa registrada com sucesso.')
      window.setTimeout(() => setMessage(''), 2500)
    } catch (error) {
      console.error(error)
      setMessage(error.message || 'Nao foi possivel salvar a empresa.')
      window.setTimeout(() => setMessage(''), 3500)
    }
  }

  const handleEditCompany = company => {
    setForm({
      id: company.id,
      name: company.name,
      slug: company.slug,
      email: company.email,
      password: '',
      supabaseEnabled: company.supabaseEnabled,
      supabaseUrl: company.supabaseUrl || '',
      supabaseServiceRoleKey: '',
      supabaseLabel: company.supabaseLabel || '',
      externalDashboardUrl: company.externalDashboardUrl || '',
      powerBiEnabled: company.powerBiEnabled === true,
      powerBiEmbedUrl: company.powerBiEmbedUrl || '',
      powerBiLabel: company.powerBiLabel || '',
      powerBiWorkspaceId: company.powerBiWorkspaceId || '',
      powerBiReportId: company.powerBiReportId || '',
      powerBiDatasetId: company.powerBiDatasetId || '',
      powerBiReports: getPowerBiReportCatalog(company),
      tools: company.tools || ['dashboard'],
      isPremiumLab: company.isPremiumLab,
    })
    setIsCompanyModalOpen(true)
  }

  const handleDeleteCompany = async company => {
    if (!state || company.isPremiumLab) return

    const confirmed = window.confirm(`Excluir a empresa ${company.name}? Essa acao remove o tenant do portal.`)
    if (!confirmed) return

    try {
      setDeletingCompanyId(company.id)
      const nextState = await deleteCompany(state, company.id)
      setState(nextState)
      setMessage('Empresa excluida com sucesso.')
      window.setTimeout(() => setMessage(''), 2500)
    } catch (error) {
      console.error(error)
      setMessage('Nao foi possivel excluir a empresa.')
      window.setTimeout(() => setMessage(''), 3500)
    } finally {
      setDeletingCompanyId('')
    }
  }

  const openUserModal = company => {
    setManagingCompanyId(company.id)
    setEditingUserId('')
    setUserForm(buildEmptyUserForm(company))
    setIsUserModalOpen(true)
  }

  const closeUserModal = () => {
    setIsUserModalOpen(false)
    setManagingCompanyId('')
    setEditingUserId('')
    setPowerBiCatalog([])
    setPowerBiCatalogError('')
    setPowerBiCatalogLoading(false)
  }

  const startCreateUser = () => {
    if (!managingCompany) return
    setEditingUserId('')
    setUserForm(buildEmptyUserForm(managingCompany))
  }

  const startEditUser = user => {
    if (!managingCompany) return
    setEditingUserId(user.uid)
    setUserForm(cloneUserForm(user, managingCompany))
  }

  const updateUserFormField = (field, value) => {
    setUserForm(previous => ({ ...previous, [field]: value }))
  }

  const toggleUserPagePermission = pageKey => {
    setUserForm(previous => ({
      ...previous,
      permissions: {
        ...previous.permissions,
        pages: {
          ...previous.permissions.pages,
          [pageKey]: !previous.permissions.pages[pageKey],
        },
      },
    }))
  }

  const toggleUserSectionPermission = (mode, sectionKey) => {
    setUserForm(previous => ({
      ...previous,
      permissions: {
        ...previous.permissions,
        sections: {
          ...previous.permissions.sections,
          [mode]: {
            ...previous.permissions.sections[mode],
            [sectionKey]: !previous.permissions.sections[mode][sectionKey],
          },
        },
      },
    }))
  }

  const addUserDashboardFilter = mode => {
    setUserForm(previous => ({
      ...previous,
      permissions: {
        ...previous.permissions,
        dashboardFilters: {
          ...previous.permissions.dashboardFilters,
          [mode]: [
            ...(previous.permissions.dashboardFilters?.[mode] || []),
            {
              id: `dashboard-filter-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              field: '',
              table: '',
              column: '',
              operator: 'is',
              value: '',
            },
          ],
        },
      },
    }))
  }

  const updateUserDashboardFilter = (mode, filterId, field, value) => {
    setUserForm(previous => ({
      ...previous,
      permissions: {
        ...previous.permissions,
        dashboardFilters: {
          ...previous.permissions.dashboardFilters,
          [mode]: (previous.permissions.dashboardFilters?.[mode] || []).map(filter =>
            filter.id === filterId ? { ...filter, [field]: value } : filter
          ),
        },
      },
    }))
  }

  const updateUserDashboardFilterField = (mode, filterId, fieldName) => {
    const definition = getDashboardFilterDefinition(fieldName)

    setUserForm(previous => ({
      ...previous,
      permissions: {
        ...previous.permissions,
        dashboardFilters: {
          ...previous.permissions.dashboardFilters,
          [mode]: (previous.permissions.dashboardFilters?.[mode] || []).map(filter => {
            if (filter.id !== filterId) return filter
            return {
              ...filter,
              field: definition?.name || '',
              table: definition?.table || '',
              column: definition?.column || '',
              value: '',
            }
          }),
        },
      },
    }))
  }

  const getDashboardFieldOptions = fieldName => {
    const definition = getDashboardFilterDefinition(fieldName)
    if (!definition?.optionsKey || !dashboardFilterOptions) return []

    switch (definition.optionsKey) {
      case 'stages':
        return [
          ...((dashboardFilterOptions.stages || []).map(stage => ({ value: String(stage.label), label: stage.label }))),
          { value: 'PEDIDO FATURADO', label: 'PEDIDO FATURADO' },
        ].filter((option, index, array) => array.findIndex(item => item.value === option.value) === index)
      case 'clients':
        return (dashboardFilterOptions.clients || []).map(client => ({
          value: String(client.clicodigo),
          label: client.label,
        }))
      case 'clientGroups':
        return (dashboardFilterOptions.clientGroups || []).map(group => ({
          value: String(group.value),
          label: group.label,
        }))
      case 'zones':
        return (dashboardFilterOptions.zones || []).map(zone => ({
          value: String(zone.value),
          label: zone.label,
        }))
      case 'statuses':
        return (dashboardFilterOptions.statuses || []).map(status => ({
          value: String(status.value),
          label: status.label,
        }))
      default:
        return []
    }
  }

  const getAvailableDashboardFields = () =>
    DASHBOARD_FILTER_FIELDS.filter(field => {
      if (field.optionsKey === 'zones') {
        return (dashboardFilterOptions?.zones || []).length > 0
      }
      return true
    })

  const removeUserDashboardFilter = (mode, filterId) => {
    setUserForm(previous => ({
      ...previous,
      permissions: {
        ...previous.permissions,
        dashboardFilters: {
          ...previous.permissions.dashboardFilters,
          [mode]: (previous.permissions.dashboardFilters?.[mode] || []).filter(filter => filter.id !== filterId),
        },
      },
    }))
  }

  const updatePowerBiReportField = (reportId, field, value) => {
    setForm(previous => ({
      ...previous,
      powerBiReports: previous.powerBiReports.map(report => (report.id === reportId ? { ...report, [field]: value } : report)),
    }))
  }

  const addPowerBiReport = () => {
    setForm(previous => ({
      ...previous,
      powerBiReports: [...previous.powerBiReports, createEmptyPowerBiReport()],
    }))
  }

  const removePowerBiReport = reportId => {
    setForm(previous => ({
      ...previous,
      powerBiReports: previous.powerBiReports.filter(report => report.id !== reportId),
    }))
  }

  const toggleUserPowerBiReport = reportId => {
    setUserForm(previous => {
      const current = previous.permissions.powerBiReports?.[reportId] || { enabled: true, pages: [], filters: [] }
      return {
        ...previous,
        permissions: {
          ...previous.permissions,
          powerBiReports: {
            ...previous.permissions.powerBiReports,
            [reportId]: {
              ...current,
              enabled: !current.enabled,
            },
          },
        },
      }
    })
  }

  const toggleUserPowerBiReportPage = (reportId, pageName) => {
    setUserForm(previous => {
      const current = previous.permissions.powerBiReports?.[reportId] || { enabled: true, pages: [], filters: [] }
      const pages = current.pages || []
      const nextPages = pages.includes(pageName) ? pages.filter(value => value !== pageName) : [...pages, pageName]
      return {
        ...previous,
        permissions: {
          ...previous.permissions,
          powerBiReports: {
            ...previous.permissions.powerBiReports,
            [reportId]: {
              ...current,
              pages: nextPages,
            },
          },
        },
      }
    })
  }

  const addUserPowerBiFilter = reportId => {
    setUserForm(previous => {
      const current = previous.permissions.powerBiReports?.[reportId] || { enabled: true, pages: [], filters: [] }
      return {
        ...previous,
        permissions: {
          ...previous.permissions,
          powerBiReports: {
            ...previous.permissions.powerBiReports,
            [reportId]: {
              ...current,
              filters: [
                ...(current.filters || []),
                {
                  id: `filter-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  table: '',
                  column: '',
                  operator: 'is',
                  value: '',
                },
              ],
            },
          },
        },
      }
    })
  }

  const updateUserPowerBiFilter = (reportId, filterId, field, value) => {
    setUserForm(previous => {
      const current = previous.permissions.powerBiReports?.[reportId] || { enabled: true, pages: [], filters: [] }
      return {
        ...previous,
        permissions: {
          ...previous.permissions,
          powerBiReports: {
            ...previous.permissions.powerBiReports,
            [reportId]: {
              ...current,
              filters: (current.filters || []).map(filter => (filter.id === filterId ? { ...filter, [field]: value } : filter)),
            },
          },
        },
      }
    })
  }

  const updateUserPowerBiFilterTable = (reportId, filterId, tableName, availableTables = []) => {
    const normalizedTable = String(tableName || '').trim()
    const matchedTable = availableTables.find(table => table.name === normalizedTable)

    setUserForm(previous => {
      const current = previous.permissions.powerBiReports?.[reportId] || { enabled: true, pages: [], filters: [] }
      return {
        ...previous,
        permissions: {
          ...previous.permissions,
          powerBiReports: {
            ...previous.permissions.powerBiReports,
            [reportId]: {
              ...current,
              filters: (current.filters || []).map(filter => {
                if (filter.id !== filterId) return filter
                const shouldKeepColumn =
                  matchedTable &&
                  Array.isArray(matchedTable.columns) &&
                  matchedTable.columns.some(column => column.name === filter.column)

                return {
                  ...filter,
                  table: normalizedTable,
                  column: shouldKeepColumn ? filter.column : '',
                }
              }),
            },
          },
        },
      }
    })
  }

  const removeUserPowerBiFilter = (reportId, filterId) => {
    setUserForm(previous => {
      const current = previous.permissions.powerBiReports?.[reportId] || { enabled: true, pages: [], filters: [] }
      return {
        ...previous,
        permissions: {
          ...previous.permissions,
          powerBiReports: {
            ...previous.permissions.powerBiReports,
            [reportId]: {
              ...current,
              filters: (current.filters || []).filter(filter => filter.id !== filterId),
            },
          },
        },
      }
    })
  }

  const handleSaveUser = async event => {
    event.preventDefault()
    if (!state || !managingCompany) return

    try {
      const nextState = editingUserId
        ? await updateCompanyUser(managingCompany, { uid: editingUserId }, userForm)
        : await createCompanyUser(managingCompany, userForm)

      setState(nextState)
      setMessage(editingUserId ? 'Usuario atualizado com sucesso.' : 'Usuario criado com sucesso.')
      window.setTimeout(() => setMessage(''), 2500)
      setEditingUserId('')
      setUserForm(buildEmptyUserForm(managingCompany))
    } catch (error) {
      console.error(error)
      setMessage(error.message || 'Nao foi possivel salvar o usuario.')
      window.setTimeout(() => setMessage(''), 3500)
    }
  }

  const handleDeleteUser = async user => {
    if (!state || !managingCompany || user.uid === managingCompany.authUid) return
    const confirmed = window.confirm(`Excluir o usuario ${user.email}?`)
    if (!confirmed) return

    try {
      const nextState = await deleteCompanyUser(managingCompany, user)
      setState(nextState)
      if (editingUserId === user.uid) {
        setEditingUserId('')
        setUserForm(buildEmptyUserForm(managingCompany))
      }
      setMessage('Usuario excluido com sucesso.')
      window.setTimeout(() => setMessage(''), 2500)
    } catch (error) {
      console.error(error)
      setMessage(error.message || 'Nao foi possivel excluir o usuario.')
      window.setTimeout(() => setMessage(''), 3500)
    }
  }

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#1b1713] text-white">
        <div className="rounded-3xl bg-white/[0.05] px-6 py-5 text-sm text-[#d8d2c8] shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
          Carregando administracao...
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#1b1713] text-white">
      <div className="grid min-h-screen xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="flex flex-col bg-[#171418]">
          <div className="px-7 py-8">
            <p className="text-[11px] uppercase tracking-[0.26em] text-[#bca27a]">GSGestao</p>
            <h1 className="mt-2 text-2xl font-semibold">Admin</h1>
            <p className="mt-2 text-sm text-[#a79f93]">{ADMIN_CREDENTIALS.email}</p>
          </div>

          <div className="px-5 py-5">
            <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-4 py-3 text-sm font-medium text-white">
              <Building2 size={16} className="text-[#e3ad5a]" />
              <span>Empresas</span>
            </div>
          </div>

          <div className="mt-auto px-5 pb-5">
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white/[0.06] text-sm font-medium text-[#d6cfc3] transition hover:bg-white/[0.1]"
            >
              <LogOut size={16} />
              Sair
            </button>
          </div>
        </aside>

        <section className="bg-[#1e1914] px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1320px]">
            <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-3xl font-semibold">Empresas</h2>
                <p className="mt-2 text-sm text-[#b7b0a6]">{state.companies.length} empresas cadastradas no portal.</p>
              </div>

              <button type="button" className="portal-primary-button" onClick={openCreateCompanyModal}>
                <Plus size={16} />
                Nova empresa
              </button>
            </header>

            {message ? (
              <div className="mb-4 rounded-2xl bg-[#9ed3a9]/12 px-4 py-3 text-sm text-[#c8f0d0]">
                {message}
              </div>
            ) : null}

            <section className="rounded-[28px] bg-[#171418] shadow-[0_18px_60px_rgba(0,0,0,0.2)]">
              <div className="px-5 py-5 sm:px-6">
                <div className="relative w-full max-w-lg">
                  <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#81796f]" />
                  <input
                    className="h-12 w-full rounded-2xl bg-white/[0.06] pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-[#7e776f] focus:bg-white/[0.09]"
                    value={searchTerm}
                    onChange={event => setSearchTerm(event.target.value)}
                    placeholder="Buscar empresa..."
                  />
                </div>
              </div>

              <div className="hidden px-6 py-4 text-[11px] uppercase tracking-[0.2em] text-[#8d867c] lg:grid lg:grid-cols-[2fr_1.2fr_1fr_1fr_140px]">
                <span>Empresa</span>
                <span>Slug</span>
                <span>Status</span>
                <span>Criada em</span>
                <span className="text-right">Acoes</span>
              </div>

              <div className="space-y-3 px-3 pb-3">
                {filteredCompanies.length === 0 ? (
                  <div className="mx-3 mb-3 rounded-[24px] bg-white/[0.045] px-6 py-16 text-center text-sm text-[#b7b0a6]">
                    Nenhuma empresa encontrada para esse termo.
                  </div>
                ) : null}

                {filteredCompanies.map(company => (
                  <div key={company.id} className="rounded-[24px] bg-white/[0.04] px-5 py-5 sm:px-6">
                    <div className="grid gap-4 lg:grid-cols-[2fr_1.2fr_1fr_1fr_140px] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-base font-semibold text-white">{company.name}</p>
                          {company.isPremiumLab ? <span className="portal-pill">Premium Lab</span> : null}
                        </div>
                        <p className="mt-1 truncate text-sm text-[#a79f93]">{company.email}</p>
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm text-white">/{company.slug}</p>
                      </div>

                      <div>
                        <span className="portal-pill">{formatCompanyStatus(company)}</span>
                      </div>

                      <div>
                        <p className="text-sm text-[#d6cfc3]">{formatCompanyDate(company.createdAt)}</p>
                      </div>

                      <div className="flex justify-start gap-2 lg:justify-end">
                        <button type="button" className="portal-ghost-button" onClick={() => handleEditCompany(company)}>
                          <Pencil size={15} />
                          Editar
                        </button>
                        {!company.isPremiumLab ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteCompany(company)}
                            disabled={deletingCompanyId === company.id}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-red-500/12 px-4 text-sm font-medium text-red-200 transition hover:bg-red-500/18 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Trash2 size={15} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>

      {isCompanyModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-4 sm:items-center sm:py-8">
          <div className="my-auto flex max-h-[calc(100vh-2rem)] w-full max-w-[880px] flex-col overflow-hidden rounded-[28px] bg-[#171418] shadow-[0_28px_120px_rgba(0,0,0,0.45)] sm:max-h-[92vh]">
            <div className="flex items-center justify-between px-6 py-5">
              <div>
                <h3 className="text-2xl font-semibold">{form.id ? 'Editar empresa' : 'Nova empresa'}</h3>
                <p className="mt-1 text-sm text-[#b7b0a6]">
                  Ajuste os dados principais da empresa e o comportamento do portal a partir daqui.
                </p>
              </div>

              <button type="button" className="portal-ghost-button" onClick={closeCompanyModal}>
                <X size={16} />
                Fechar
              </button>
            </div>

            <form className="flex min-h-0 flex-1 flex-col bg-[#191510]" onSubmit={handleSaveCompany}>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 py-6">
                <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <label className="portal-label">Nome da empresa</label>
                  <input
                    className="portal-input"
                    value={form.name}
                    onChange={event => {
                      const name = event.target.value
                      setForm(previous => ({ ...previous, name, slug: slugifyCompanyName(name) }))
                    }}
                    placeholder="Ex.: Premium Lab"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="portal-label">Slug</label>
                  <input
                    className="portal-input"
                    value={form.slug}
                    onChange={event => setForm(previous => ({ ...previous, slug: slugifyCompanyName(event.target.value) }))}
                    placeholder="premium-lab"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="portal-label">Email principal</label>
                  <input
                    className="portal-input"
                    type="email"
                    value={form.email}
                    onChange={event => setForm(previous => ({ ...previous, email: event.target.value }))}
                    placeholder="empresa@dominio.com"
                    required
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="portal-label">{form.id ? 'Nova senha (opcional)' : 'Senha'}</label>
                  <input
                    className="portal-input"
                    type="text"
                    value={form.password}
                    onChange={event => setForm(previous => ({ ...previous, password: event.target.value }))}
                    placeholder={form.id ? 'Preencha so se quiser trocar' : 'Senha de acesso'}
                    required={!form.id}
                  />
                </div>
                </div>

                <div className="rounded-[24px] bg-white/[0.05] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-white">Tipo de portal</h4>
                      <p className="mt-1 text-sm text-[#b7b0a6]">
                        Defina se a empresa usa o portal interno com Supabase ou um dashboard externo.
                      </p>
                    </div>

                    <label className="portal-checkbox shrink-0">
                      <input
                        type="checkbox"
                        checked={form.supabaseEnabled}
                        onChange={event => setForm(previous => ({ ...previous, supabaseEnabled: event.target.checked }))}
                      />
                      <span>Supabase</span>
                    </label>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {form.supabaseEnabled ? (
                      <>
                        <div className="space-y-2">
                          <label className="portal-label">Supabase URL</label>
                          <input
                            className="portal-input"
                            value={form.supabaseUrl}
                            onChange={event => setForm(previous => ({ ...previous, supabaseUrl: event.target.value }))}
                            placeholder="https://projeto.supabase.co"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="portal-label">Identificacao do banco</label>
                          <input
                            className="portal-input"
                            value={form.supabaseLabel}
                            onChange={event => setForm(previous => ({ ...previous, supabaseLabel: event.target.value }))}
                            placeholder="Ex.: sincronizado em Supabase producao"
                          />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                          <label className="portal-label">Supabase Service Role Key</label>
                          <input
                            className="portal-input"
                            type="password"
                            value={form.supabaseServiceRoleKey}
                            onChange={event => setForm(previous => ({ ...previous, supabaseServiceRoleKey: event.target.value }))}
                            placeholder={form.id ? 'Preencha so se quiser trocar a chave' : 'Cole a service_role_key do tenant'}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2 md:col-span-2">
                        <label className="portal-label">Link do dashboard externo</label>
                        <input
                          className="portal-input"
                          value={form.externalDashboardUrl}
                          onChange={event => setForm(previous => ({ ...previous, externalDashboardUrl: event.target.value }))}
                          placeholder="https://dashboard-da-empresa.com.br"
                          required={!form.supabaseEnabled}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-[24px] bg-white/[0.05] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-white">Power BI hospedado no portal</h4>
                      <p className="mt-1 text-sm text-[#b7b0a6]">
                        Cadastre um ou mais modelos de Power BI para esta empresa e controle os acessos por usuario.
                      </p>
                    </div>

                    <label className="portal-checkbox shrink-0">
                      <input
                        type="checkbox"
                        checked={form.powerBiEnabled}
                        onChange={event =>
                          setForm(previous => ({
                            ...previous,
                            powerBiEnabled: event.target.checked,
                            powerBiReports:
                              event.target.checked && previous.powerBiReports.length === 0
                                ? [createEmptyPowerBiReport()]
                                : previous.powerBiReports,
                          }))
                        }
                      />
                      <span>Power BI</span>
                    </label>
                  </div>

                  {form.powerBiEnabled ? (
                    <div className="mt-4 space-y-4">
                      {form.powerBiReports.length === 0 ? (
                        <div className="rounded-2xl bg-white/[0.04] px-4 py-4 text-sm text-[#b7b0a6]">
                          Nenhum modelo cadastrado ainda. Adicione o primeiro para liberar o catalogo de Power BI.
                        </div>
                      ) : null}

                      {form.powerBiReports.map((report, index) => (
                        <div key={report.id} className="rounded-[22px] bg-white/[0.04] p-4">
                          <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-white">Modelo {index + 1}</p>
                              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#8d867c]">Power BI Embedded</p>
                            </div>

                            <div className="flex items-center gap-2">
                              <label className="portal-checkbox">
                                <input
                                  type="checkbox"
                                  checked={report.enabled !== false}
                                  onChange={event => updatePowerBiReportField(report.id, 'enabled', event.target.checked)}
                                />
                                <span>Ativo</span>
                              </label>
                              <button
                                type="button"
                                className="inline-flex h-11 items-center justify-center rounded-2xl bg-red-500/10 px-4 text-sm font-medium text-red-200 transition hover:bg-red-500/15"
                                onClick={() => removePowerBiReport(report.id)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2 md:col-span-2">
                              <label className="portal-label">Nome do modelo</label>
                              <input
                                className="portal-input"
                                value={report.label}
                                onChange={event => updatePowerBiReportField(report.id, 'label', event.target.value)}
                                placeholder="Ex.: Performance em Vendas"
                                required={form.powerBiEnabled}
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="portal-label">Workspace ID</label>
                              <input
                                className="portal-input"
                                value={report.workspaceId}
                                onChange={event => updatePowerBiReportField(report.id, 'workspaceId', event.target.value)}
                                placeholder="a4f4dbd4-d6ef-43d7-ad10-c7d9426ea112"
                                required={form.powerBiEnabled}
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="portal-label">Report ID</label>
                              <input
                                className="portal-input"
                                value={report.reportId}
                                onChange={event => updatePowerBiReportField(report.id, 'reportId', event.target.value)}
                                placeholder="37daae5a-d2f3-4237-8fc8-c176a3518d21"
                                required={form.powerBiEnabled}
                              />
                            </div>

                            <div className="space-y-2 md:col-span-2">
                              <label className="portal-label">Dataset ID</label>
                              <input
                                className="portal-input"
                                value={report.datasetId}
                                onChange={event => updatePowerBiReportField(report.id, 'datasetId', event.target.value)}
                                placeholder="17301e64-6e62-4c66-ad24-ee7d3e68e21b"
                                required={form.powerBiEnabled}
                              />
                            </div>
                          </div>
                        </div>
                      ))}

                      <button type="button" className="portal-ghost-button" onClick={addPowerBiReport}>
                        <Plus size={15} />
                        Adicionar modelo
                      </button>
                    </div>
                  ) : null}
                </div>

                {!hasPremiumLab || form.isPremiumLab ? (
                  <label className="portal-checkbox">
                    <input
                      type="checkbox"
                      checked={form.isPremiumLab}
                      onChange={event => setForm(previous => ({ ...previous, isPremiumLab: event.target.checked }))}
                    />
                    <span>Marcar como Premium Lab</span>
                  </label>
                ) : (
                  <div className="rounded-2xl bg-[#e3ad5a]/10 px-4 py-3 text-sm text-[#e6d5b7]">
                    Premium Lab ja esta definida como tenant principal.
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 px-6 py-5">
                <div className="flex flex-wrap gap-2">
                  {form.id ? (
                    <>
                      <button type="button" className="portal-ghost-button" onClick={() => editingCompany && openUserModal(editingCompany)}>
                        <Users size={15} />
                        Gerenciar usuarios
                      </button>
                      <Link href={`/empresa/${form.slug}`} className="portal-ghost-button">
                        Portal
                        <SquareArrowOutUpRight size={15} />
                      </Link>
                    </>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-3">
                  <button type="button" className="portal-ghost-button" onClick={closeCompanyModal}>
                    Cancelar
                  </button>
                  <button type="submit" className="portal-primary-button">
                    {form.id ? 'Salvar alteracoes' : 'Salvar empresa'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isUserModalOpen && managingCompany ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#09080b]/80 px-4 py-8 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-[1360px] flex-col overflow-hidden rounded-[32px] bg-[#171418] shadow-[0_32px_120px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between px-6 py-5">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-[#bca27a]">Usuarios da empresa</p>
                <h2 className="mt-2 text-2xl font-semibold">{managingCompany.name}</h2>
                <p className="mt-1 text-sm text-[#b7b0a6]">
                  Edite paginas liberadas, esconda visuais especificos e mantenha o acesso principal da empresa sob controle.
                </p>
              </div>
              <button type="button" className="portal-ghost-button" onClick={closeUserModal}>
                <X size={16} />
                Fechar
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="overflow-y-auto bg-[#121015] p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">Lista de usuarios</h3>
                  <button type="button" className="portal-primary-button" onClick={startCreateUser}>
                    <UserPlus size={16} />
                    Novo usuario
                  </button>
                </div>

                <div className="space-y-3">
                  {getCompanyUserList(companyUsers, managingCompany).map(user => (
                    <div key={user.uid} className="rounded-[22px] bg-white/[0.05] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-white">{user.name || user.email}</p>
                            {user.uid === managingCompany.authUid ? <span className="portal-pill">Principal</span> : null}
                          </div>
                          <p className="mt-1 text-sm text-[#b7b0a6]">{user.email}</p>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" className="portal-ghost-button" onClick={() => startEditUser(user)}>
                            <Pencil size={14} />
                            Editar
                          </button>
                          {user.uid !== managingCompany.authUid ? (
                            <button
                              type="button"
                              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 text-sm font-medium text-red-200 transition hover:border-red-400/35 hover:bg-red-500/15"
                              onClick={() => handleDeleteUser(user)}
                            >
                              <Trash2 size={14} />
                              Excluir
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="overflow-y-auto p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold">{editingUserId ? 'Editar usuario' : 'Novo usuario'}</h3>
                  <p className="mt-1 text-sm text-[#b7b0a6]">
                    Controle quais paginas ele acessa e quais blocos de PPS ou Analise de Dados ficam visiveis para esse usuario.
                  </p>
                </div>

                <form className="space-y-5" onSubmit={handleSaveUser}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="portal-label">Nome</label>
                      <input
                        className="portal-input"
                        value={userForm.name}
                        onChange={event => updateUserFormField('name', event.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="portal-label">Email</label>
                      <input
                        className="portal-input"
                        type="email"
                        value={userForm.email}
                        onChange={event => updateUserFormField('email', event.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="portal-label">{editingUserId ? 'Nova senha (opcional)' : 'Senha'}</label>
                      <input
                        className="portal-input"
                        type="text"
                        value={userForm.password}
                        onChange={event => updateUserFormField('password', event.target.value)}
                        required={!editingUserId}
                        placeholder={editingUserId ? 'Preencha so se quiser trocar a senha' : 'Senha de acesso'}
                      />
                    </div>
                  </div>

                  <div className="rounded-[24px] bg-white/[0.05] p-4">
                    <h4 className="text-sm font-semibold text-white">Paginas liberadas</h4>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <label className="portal-checkbox">
                        <input
                          type="checkbox"
                          checked={userForm.permissions.pages[PORTAL_PAGE_KEYS.ANALYSIS]}
                          onChange={() => toggleUserPagePermission(PORTAL_PAGE_KEYS.ANALYSIS)}
                          disabled={!managingCompany.supabaseEnabled}
                        />
                        <span>Analise de Dados</span>
                      </label>
                      <label className="portal-checkbox">
                        <input
                          type="checkbox"
                          checked={userForm.permissions.pages[PORTAL_PAGE_KEYS.PPS]}
                          onChange={() => toggleUserPagePermission(PORTAL_PAGE_KEYS.PPS)}
                          disabled={!managingCompany.supabaseEnabled}
                        />
                        <span>PPS</span>
                      </label>
                      <label className="portal-checkbox">
                        <input
                          type="checkbox"
                          checked={userForm.permissions.pages[PORTAL_PAGE_KEYS.EXTERNAL_DASHBOARD]}
                          onChange={() => toggleUserPagePermission(PORTAL_PAGE_KEYS.EXTERNAL_DASHBOARD)}
                          disabled={managingCompany.supabaseEnabled || !managingCompany.externalDashboardUrl}
                        />
                        <span>Dashboard externo</span>
                      </label>
                      <label className="portal-checkbox">
                        <input
                          type="checkbox"
                          checked={userForm.permissions.pages[PORTAL_PAGE_KEYS.POWER_BI]}
                          onChange={() => toggleUserPagePermission(PORTAL_PAGE_KEYS.POWER_BI)}
                          disabled={!hasConfiguredPowerBi(managingCompany)}
                        />
                        <span>Power BI</span>
                      </label>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    {hasConfiguredPowerBi(managingCompany) ? (
                      <div className="rounded-[24px] bg-white/[0.05] p-4 xl:col-span-2">
                        <div>
                          <h4 className="text-sm font-semibold text-white">Modelos de Power BI</h4>
                          <p className="mt-1 text-sm text-[#b7b0a6]">
                            Controle quais modelos o usuario enxerga, quais paginas de cada relatorio ficam acessiveis e quais filtros devem ser aplicados.
                          </p>
                        </div>

                        {powerBiCatalogLoading ? (
                          <p className="mt-4 text-sm text-[#b7b0a6]">Carregando modelos do relatorio...</p>
                        ) : powerBiCatalogError ? (
                          <p className="mt-4 text-sm text-[#f0b8b8]">{powerBiCatalogError}</p>
                        ) : powerBiCatalog.length === 0 ? (
                          <p className="mt-4 text-sm text-[#b7b0a6]">Nenhum modelo foi encontrado para esta empresa ainda.</p>
                        ) : (
                          <div className="mt-4 space-y-4">
                            {powerBiCatalog.map(report => {
                              const reportPermission = userForm.permissions.powerBiReports?.[report.id] || {
                                enabled: true,
                                pages: [],
                                filters: [],
                              }
                              const allowAllPages = !reportPermission.pages || reportPermission.pages.length === 0
                              const schemaTables = getReportSchemaTables(report)
                              const hasSchemaTables = schemaTables.length > 0

                              return (
                                <div key={report.id} className="rounded-[22px] bg-white/[0.04] p-4">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-semibold text-white">{report.label || report.reportName}</p>
                                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#8d867c]">{report.reportName || 'Relatorio Power BI'}</p>
                                    </div>

                                    <label className="portal-checkbox">
                                      <input
                                        type="checkbox"
                                        checked={reportPermission.enabled !== false}
                                        onChange={() => toggleUserPowerBiReport(report.id)}
                                      />
                                      <span>Mostrar modelo</span>
                                    </label>
                                  </div>

                                  <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
                                    <div className="rounded-[18px] bg-white/[0.04] p-4">
                                      <div className="flex items-center justify-between gap-3">
                                        <div>
                                          <p className="text-sm font-semibold text-white">Paginas liberadas</p>
                                          <p className="mt-1 text-sm text-[#b7b0a6]">
                                            Deixe sem marcar para liberar todas ou selecione somente as paginas permitidas.
                                          </p>
                                        </div>
                                        <button
                                          type="button"
                                          className="portal-ghost-button"
                                          onClick={() =>
                                            setUserForm(previous => ({
                                              ...previous,
                                              permissions: {
                                                ...previous.permissions,
                                                powerBiReports: {
                                                  ...previous.permissions.powerBiReports,
                                                  [report.id]: {
                                                    ...reportPermission,
                                                    pages: [],
                                                  },
                                                },
                                              },
                                            }))
                                          }
                                        >
                                          Todas
                                        </button>
                                      </div>

                                      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[#8d867c]">
                                        {allowAllPages ? 'Todas as paginas estao liberadas.' : 'Paginas escolhidas manualmente.'}
                                      </p>

                                      <div className="mt-4 grid gap-2 md:grid-cols-2">
                                        {(report.pages || []).map(page => (
                                          <label key={page.name} className="portal-checkbox">
                                            <input
                                              type="checkbox"
                                              checked={allowAllPages ? true : reportPermission.pages.includes(page.name)}
                                              onChange={() => toggleUserPowerBiReportPage(report.id, page.name)}
                                              disabled={allowAllPages}
                                            />
                                            <span>{page.displayName || page.name}</span>
                                          </label>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="rounded-[18px] bg-white/[0.04] p-4">
                                      <div className="flex items-center justify-between gap-3">
                                        <div>
                                          <p className="text-sm font-semibold text-white">Filtros do usuario</p>
                                          <p className="mt-1 text-sm text-[#b7b0a6]">
                                            Aplique filtros permanentes neste modelo para restringir dados por tabela, coluna e valor.
                                          </p>
                                        </div>
                                        <button type="button" className="portal-ghost-button" onClick={() => addUserPowerBiFilter(report.id)}>
                                          <Plus size={14} />
                                          Adicionar filtro
                                        </button>
                                      </div>

                                      <div className="mt-4 space-y-3">
                                        {(reportPermission.filters || []).length === 0 ? (
                                          <p className="text-sm text-[#b7b0a6]">Nenhum filtro configurado para este modelo.</p>
                                        ) : (
                                          (reportPermission.filters || []).map(filter => (
                                            <div key={filter.id} className="rounded-[16px] bg-[#141216] p-3">
                                              <div className="mb-3 flex justify-end">
                                                <button
                                                  type="button"
                                                  className="inline-flex h-9 items-center rounded-xl bg-red-500/10 px-3 text-xs font-medium text-red-200 transition hover:bg-red-500/15"
                                                  onClick={() => removeUserPowerBiFilter(report.id, filter.id)}
                                                >
                                                  Remover
                                                </button>
                                              </div>
                                              {!hasSchemaTables ? (
                                                <p className="mb-3 text-xs text-[#b7b0a6]">
                                                  Este modelo ainda nao expôs a estrutura de tabelas e colunas. Você pode preencher manualmente por enquanto.
                                                </p>
                                              ) : null}
                                              <div className="grid gap-3 md:grid-cols-2">
                                                {hasSchemaTables ? (
                                                  <select
                                                    className="portal-input"
                                                    value={filter.table}
                                                    onChange={event =>
                                                      updateUserPowerBiFilterTable(report.id, filter.id, event.target.value, schemaTables)
                                                    }
                                                  >
                                                    <option value="">Selecione a tabela</option>
                                                    {schemaTables.map(table => (
                                                      <option key={table.name} value={table.name}>
                                                        {table.name}
                                                      </option>
                                                    ))}
                                                  </select>
                                                ) : (
                                                  <input
                                                    className="portal-input"
                                                    value={filter.table}
                                                    onChange={event => updateUserPowerBiFilter(report.id, filter.id, 'table', event.target.value)}
                                                    placeholder="Tabela"
                                                  />
                                                )}
                                                {hasSchemaTables ? (
                                                  <select
                                                    className="portal-input"
                                                    value={filter.column}
                                                    onChange={event => updateUserPowerBiFilter(report.id, filter.id, 'column', event.target.value)}
                                                    disabled={!filter.table}
                                                  >
                                                    <option value="">{filter.table ? 'Selecione a coluna' : 'Escolha a tabela primeiro'}</option>
                                                    {(schemaTables.find(table => table.name === filter.table)?.columns || []).map(column => (
                                                      <option key={column.name} value={column.name}>
                                                        {column.name}
                                                      </option>
                                                    ))}
                                                  </select>
                                                ) : (
                                                  <input
                                                    className="portal-input"
                                                    value={filter.column}
                                                    onChange={event => updateUserPowerBiFilter(report.id, filter.id, 'column', event.target.value)}
                                                    placeholder="Coluna"
                                                  />
                                                )}
                                                <select
                                                  className="portal-input"
                                                  value={filter.operator}
                                                  onChange={event => updateUserPowerBiFilter(report.id, filter.id, 'operator', event.target.value)}
                                                >
                                                  {POWER_BI_FILTER_OPERATORS.map(option => (
                                                    <option key={option.value} value={option.value}>
                                                      {option.label}
                                                    </option>
                                                  ))}
                                                </select>
                                                <input
                                                  className="portal-input"
                                                  value={filter.value}
                                                  onChange={event => updateUserPowerBiFilter(report.id, filter.id, 'value', event.target.value)}
                                                  placeholder="Valor ou lista separada por virgula"
                                                />
                                              </div>
                                            </div>
                                          ))
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {Object.entries(DASHBOARD_SECTION_GROUPS).map(([mode, sections]) => (
                      <div key={mode} className="rounded-[24px] bg-white/[0.05] p-4">
                        <h4 className="text-sm font-semibold text-white">
                          {mode === 'pps' ? 'Visuais do PPS' : 'Visuais da Analise de Dados'}
                        </h4>
                        <div className="mt-3 space-y-2">
                          {sections.map(section => (
                            <label key={section.key} className="portal-checkbox">
                              <input
                                type="checkbox"
                                checked={Boolean(userForm.permissions.sections[mode]?.[section.key])}
                                onChange={() => toggleUserSectionPermission(mode, section.key)}
                                disabled={mode !== 'pps' && !managingCompany.supabaseEnabled}
                              />
                              <span>{section.label}</span>
                            </label>
                          ))}
                        </div>

                        <div className="mt-5 rounded-[18px] bg-white/[0.04] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-white">Filtros do usuario</p>
                              <p className="mt-1 text-sm text-[#b7b0a6]">
                                Aplique filtros permanentes usando os mesmos campos visiveis no dashboard deste modulo.
                              </p>
                            </div>
                            <button type="button" className="portal-ghost-button" onClick={() => addUserDashboardFilter(mode)}>
                              <Plus size={14} />
                              Adicionar filtro
                            </button>
                          </div>

                          {dashboardFilterOptionsLoading ? (
                            <p className="mt-3 text-sm text-[#b7b0a6]">Carregando filtros disponiveis...</p>
                          ) : null}
                          {dashboardFilterOptionsError ? (
                            <p className="mt-3 text-sm text-amber-200">{dashboardFilterOptionsError}</p>
                          ) : null}

                          <div className="mt-4 space-y-3">
                            {(userForm.permissions.dashboardFilters?.[mode] || []).length === 0 ? (
                              <p className="text-sm text-[#b7b0a6]">Nenhum filtro configurado para este modulo.</p>
                            ) : (
                              (userForm.permissions.dashboardFilters?.[mode] || []).map(filter => (
                                <div key={filter.id} className="rounded-[16px] bg-[#141216] p-3">
                                  <div className="mb-3 flex justify-end">
                                    <button
                                      type="button"
                                      className="inline-flex h-9 items-center rounded-xl bg-red-500/10 px-3 text-xs font-medium text-red-200 transition hover:bg-red-500/15"
                                      onClick={() => removeUserDashboardFilter(mode, filter.id)}
                                    >
                                      Remover
                                    </button>
                                  </div>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <select
                                      className="portal-input"
                                      value={filter.field || ''}
                                      onChange={event => updateUserDashboardFilterField(mode, filter.id, event.target.value)}
                                    >
                                      <option value="">Selecione o filtro</option>
                                      {getAvailableDashboardFields().map(field => (
                                        <option key={field.name} value={field.name}>
                                          {field.label}
                                        </option>
                                      ))}
                                    </select>
                                    {(() => {
                                      const filterDefinition = getDashboardFilterDefinition(filter.field)
                                      const fieldOptions = getDashboardFieldOptions(filter.field)

                                      if (filterDefinition?.inputType === 'select') {
                                        return (
                                          <select
                                            className="portal-input"
                                            value={filter.value}
                                            onChange={event => updateUserDashboardFilter(mode, filter.id, 'value', event.target.value)}
                                            disabled={!filter.field || fieldOptions.length === 0}
                                          >
                                            <option value="">
                                              {!filter.field
                                                ? 'Escolha o filtro primeiro'
                                                : fieldOptions.length === 0
                                                  ? 'Sem opcoes disponiveis'
                                                  : 'Selecione um valor'}
                                            </option>
                                            {fieldOptions.map(option => (
                                              <option key={option.value} value={option.value}>
                                                {option.label}
                                              </option>
                                            ))}
                                          </select>
                                        )
                                      }

                                      return (
                                        <input
                                          className="portal-input"
                                          value={filter.value}
                                          onChange={event => updateUserDashboardFilter(mode, filter.id, 'value', event.target.value)}
                                          placeholder="Valor ou lista separada por virgula"
                                          disabled={!filter.field}
                                        />
                                      )
                                    })()}
                                    <select
                                      className="portal-input"
                                      value={filter.operator}
                                      onChange={event => updateUserDashboardFilter(mode, filter.id, 'operator', event.target.value)}
                                    >
                                      {POWER_BI_FILTER_OPERATORS.map(option => (
                                        <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                    <div className="portal-input flex items-center border-dashed text-sm text-[#b7b0a6]">
                                      {getDashboardFilterDefinition(filter.field)?.inputType === 'select'
                                        ? 'Valor definido por selecao'
                                        : 'Valor digitado livremente'}
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button type="submit" className="portal-primary-button">
                      <UserPlus size={16} />
                      {editingUserId ? 'Salvar usuario' : 'Criar usuario'}
                    </button>
                    {editingUserId ? (
                      <button type="button" className="portal-ghost-button" onClick={startCreateUser}>
                        Novo cadastro
                      </button>
                    ) : null}
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
