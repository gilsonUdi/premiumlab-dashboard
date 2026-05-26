'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Building2,
  Copy,
  Eye,
  FileDown,
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
  startAdminCompanyPreview,
  slugifyCompanyName,
  updateCompanyUser,
  upsertCompany,
} from '@/lib/portal-store'
import {
  DASHBOARD_FILTER_FIELDS,
  DASHBOARD_DATA_SOURCE_TYPES,
  DASHBOARD_SECTION_GROUPS,
  buildDefaultDashboardVisualFilters,
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
    effectiveIdentityUsername: '',
    effectiveIdentityRolesText: '',
    enabled: true,
  }
}

function buildDefaultDashboardFilters() {
  return { analysis: [], pps: [] }
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
  dashboardDataSource: 'supabase',
  gradualApiUrl: '',
  gradualApiKey: '',
  gradualApiSource: '',
  gradualApiCompanyIdsText: '',
  gradualApiScanWindow: 1500,
  gradualApiStartOrderId: '',
  gradualApiLimit: 500,
  externalDashboardUrl: '',
  powerBiEnabled: false,
  powerBiEmbedUrl: '',
  powerBiLabel: '',
  powerBiWorkspaceId: '',
  powerBiReportId: '',
  powerBiDatasetId: '',
  powerBiReports: [],
  dashboardFilters: buildDefaultDashboardFilters(),
  dashboardVisualFilters: buildDefaultDashboardVisualFilters(),
  orderCompletionRules: [],
  limitByCompanyCodeEnabled: false,
  companyCodeFilter: '',
  lossFinalityCodesText: '',
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
  const [portalPreviewCompanyId, setPortalPreviewCompanyId] = useState('')
  const [userForm, setUserForm] = useState(buildEmptyUserForm({ supabaseEnabled: true }))
  const [editingUserId, setEditingUserId] = useState('')
  const [powerBiCatalog, setPowerBiCatalog] = useState([])
  const [powerBiCatalogLoading, setPowerBiCatalogLoading] = useState(false)
  const [powerBiCatalogError, setPowerBiCatalogError] = useState('')
  const [dashboardFilterOptions, setDashboardFilterOptions] = useState(null)
  const [dashboardFilterOptionsLoading, setDashboardFilterOptionsLoading] = useState(false)
  const [dashboardFilterOptionsError, setDashboardFilterOptionsError] = useState('')
  const [isPasswordListModalOpen, setIsPasswordListModalOpen] = useState(false)
  const [passwordBatchMap, setPasswordBatchMap] = useState({})
  const [isGeneratingPasswordList, setIsGeneratingPasswordList] = useState(false)

  useEffect(() => {
    let active = true

    async function hydrate() {
      try {
        const session = await getCurrentPortalSession()
        const normalizedSessionEmail = String(session?.email || '').trim().toLowerCase()
        const normalizedAdminEmail = String(ADMIN_CREDENTIALS.email || '').trim().toLowerCase()

        if (!session || session.type !== 'admin' || normalizedSessionEmail !== normalizedAdminEmail) {
          router.replace('/login')
          return
        }

        const seededState = await ensurePremiumLabTenant()
        if (!active) return
        setState(seededState)
      } catch (error) {
        console.error(error)
        if (active) {
          setMessage(error?.message || 'Falha ao carregar dados administrativos.')
          setState({ companies: [], users: [] })
        }
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

  const portalPreviewCompany = useMemo(
    () => (state?.companies || []).find(company => company.id === portalPreviewCompanyId) || null,
    [portalPreviewCompanyId, state?.companies]
  )

  const dashboardOptionsCompany = isUserModalOpen
    ? managingCompany
    : isCompanyModalOpen && form.supabaseEnabled
      ? editingCompany
      : null

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
      if (!dashboardOptionsCompany || !dashboardOptionsCompany.supabaseEnabled) {
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
        const response = await fetch(`/api/options?tenant=${encodeURIComponent(dashboardOptionsCompany.slug)}`, {
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
  }, [dashboardOptionsCompany])

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

  const openPortalPreviewModal = company => {
    setPortalPreviewCompanyId(company.id)
  }

  const closePortalPreviewModal = () => {
    setPortalPreviewCompanyId('')
  }

  const enterCompanyPortal = user => {
    if (!portalPreviewCompany) return
    startAdminCompanyPreview(portalPreviewCompany, user || null)
    router.push(`/empresa/${portalPreviewCompany.slug}`)
    closePortalPreviewModal()
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
              effectiveIdentityUsername: String(report.effectiveIdentityUsername || '').trim(),
              effectiveIdentityRoles: String(report.effectiveIdentityRolesText || report.effectiveIdentityRoles || '')
                .split(',')
                .map(role => String(role || '').trim())
                .filter(Boolean),
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
        lossFinalityCodes: String(form.lossFinalityCodesText || '')
          .split(',')
          .map(code => String(code || '').trim())
          .filter(Boolean),
        dashboardFilters: form.dashboardFilters,
        dashboardVisualFilters: form.dashboardVisualFilters,
        dashboardDataSource: form.dashboardDataSource,
        gradualApiUrl: form.gradualApiUrl,
        gradualApiKey: form.gradualApiKey,
        gradualApiSource: form.gradualApiSource,
        gradualApiCompanyIds: String(form.gradualApiCompanyIdsText || '')
          .split(',')
          .map(value => String(value || '').trim())
          .filter(Boolean),
        gradualApiScanWindow: form.gradualApiScanWindow,
        gradualApiStartOrderId: form.gradualApiStartOrderId,
        gradualApiLimit: form.gradualApiLimit,
        orderCompletionRules: form.orderCompletionRules,
        limitByCompanyCodeEnabled: form.limitByCompanyCodeEnabled,
        companyCodeFilter: form.companyCodeFilter,
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
      dashboardDataSource: company.dashboardDataSource || company.dashboardDataSourceType || 'supabase',
      gradualApiUrl: company.gradualApiUrl || '',
      gradualApiKey: '',
      gradualApiSource: company.gradualApiSource || '',
      gradualApiCompanyIdsText: Array.isArray(company.gradualApiCompanyIds)
        ? company.gradualApiCompanyIds.join(', ')
        : String(company.gradualApiCompanyIds || ''),
      gradualApiScanWindow: company.gradualApiScanWindow || 1500,
      gradualApiStartOrderId: company.gradualApiStartOrderId || '',
      gradualApiLimit: company.gradualApiLimit || 500,
      externalDashboardUrl: company.externalDashboardUrl || '',
      powerBiEnabled: company.powerBiEnabled === true,
      powerBiEmbedUrl: company.powerBiEmbedUrl || '',
      powerBiLabel: company.powerBiLabel || '',
      powerBiWorkspaceId: company.powerBiWorkspaceId || '',
      powerBiReportId: company.powerBiReportId || '',
      powerBiDatasetId: company.powerBiDatasetId || '',
      powerBiReports: getPowerBiReportCatalog(company),
      dashboardFilters: company.dashboardFilters || buildDefaultDashboardFilters(),
      dashboardVisualFilters: company.dashboardVisualFilters || buildDefaultDashboardVisualFilters(),
      orderCompletionRules: Array.isArray(company.orderCompletionRules) ? company.orderCompletionRules : [],
      limitByCompanyCodeEnabled: company.limitByCompanyCodeEnabled === true,
      companyCodeFilter: company.companyCodeFilter || '',
      lossFinalityCodesText: Array.isArray(company.lossFinalityCodes) ? company.lossFinalityCodes.join(', ') : '',
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
    setIsPasswordListModalOpen(false)
    setPasswordBatchMap({})
    setIsGeneratingPasswordList(false)
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

  const copyUserConfiguration = user => {
    if (!managingCompany) return
    const copiedPermissions = normalizeUserPermissions(user.permissions, managingCompany)

    setUserForm(previous => ({
      ...previous,
      permissions: JSON.parse(JSON.stringify(copiedPermissions)),
    }))
    setMessage(`Configuracao copiada de ${user.name || user.email}.`)
    window.setTimeout(() => setMessage(''), 2500)
  }

  const openPasswordListModal = () => {
    if (!managingCompany) return
    const users = getCompanyUserList(companyUsers, managingCompany)
    if (users.length === 0) {
      setMessage('Nao existem usuarios cadastrados para gerar a lista.')
      window.setTimeout(() => setMessage(''), 2500)
      return
    }

    const nextPasswordMap = users.reduce((acc, user) => {
      acc[user.uid] = ''
      return acc
    }, {})
    setPasswordBatchMap(nextPasswordMap)
    setIsPasswordListModalOpen(true)
  }

  const closePasswordListModal = () => {
    setIsPasswordListModalOpen(false)
    setPasswordBatchMap({})
    setIsGeneratingPasswordList(false)
  }

  const updatePasswordBatchValue = (uid, value) => {
    setPasswordBatchMap(previous => ({
      ...previous,
      [uid]: value,
    }))
  }

  const handleGeneratePasswordList = async () => {
    if (!state || !managingCompany) return

    const users = getCompanyUserList(companyUsers, managingCompany)
    if (users.length === 0) {
      setMessage('Nao existem usuarios cadastrados para gerar a lista.')
      window.setTimeout(() => setMessage(''), 2500)
      return
    }

    for (const user of users) {
      const password = String(passwordBatchMap[user.uid] || '')
      if (password.length < 6) {
        setMessage(`Defina senha com ao menos 6 caracteres para ${user.name || user.email}.`)
        window.setTimeout(() => setMessage(''), 3200)
        return
      }
    }

    try {
      setIsGeneratingPasswordList(true)
      let nextState = state

      for (const user of users) {
        const nextPassword = String(passwordBatchMap[user.uid] || '')
        nextState = await updateCompanyUser(
          managingCompany,
          { uid: user.uid },
          {
            name: user.name || '',
            email: user.email || '',
            password: nextPassword,
            permissions: user.permissions || getDefaultPermissionsForCompany(managingCompany),
          }
        )
      }

      const lines = users.map(user => {
        const name = user.name || 'Nao informado'
        const email = user.email || 'Nao informado'
        const password = String(passwordBatchMap[user.uid] || '')
        return `Nome: ${name}\nEmail: ${email}\nSenha: ${password}\n`
      })

      const now = new Date()
      const stamp = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
      const filename = `usuarios-${managingCompany.slug}-${stamp}.txt`
      const content = `Empresa: ${managingCompany.name}\nGerado em: ${now.toLocaleString('pt-BR')}\n\n${lines.join('\n')}`
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
      const href = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(href)

      setState(nextState)
      setMessage('Lista gerada e senhas atualizadas com sucesso.')
      window.setTimeout(() => setMessage(''), 3000)
      closePasswordListModal()
    } catch (error) {
      console.error(error)
      setMessage(error.message || 'Falha ao gerar lista e atualizar senhas.')
      window.setTimeout(() => setMessage(''), 3500)
      setIsGeneratingPasswordList(false)
    }
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

  const addCompanyDashboardFilter = mode => {
    setForm(previous => ({
      ...previous,
      dashboardFilters: {
        ...previous.dashboardFilters,
        [mode]: [
          ...(previous.dashboardFilters?.[mode] || []),
          {
            id: `company-dashboard-filter-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            field: '',
            table: '',
            column: '',
            operator: 'is',
            value: '',
          },
        ],
      },
    }))
  }

  const updateCompanyDashboardFilter = (mode, filterId, field, value) => {
    setForm(previous => ({
      ...previous,
      dashboardFilters: {
        ...previous.dashboardFilters,
        [mode]: (previous.dashboardFilters?.[mode] || []).map(filter =>
          filter.id === filterId ? { ...filter, [field]: value } : filter
        ),
      },
    }))
  }

  const updateCompanyDashboardFilterField = (mode, filterId, fieldName) => {
    const definition = getDashboardFilterDefinition(fieldName)

    setForm(previous => ({
      ...previous,
      dashboardFilters: {
        ...previous.dashboardFilters,
        [mode]: (previous.dashboardFilters?.[mode] || []).map(filter => {
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

  const addCompanyVisualFilter = (mode, sectionKey) => {
    setForm(previous => ({
      ...previous,
      dashboardVisualFilters: {
        ...previous.dashboardVisualFilters,
        [mode]: {
          ...(previous.dashboardVisualFilters?.[mode] || {}),
          [sectionKey]: [
            ...(previous.dashboardVisualFilters?.[mode]?.[sectionKey] || []),
            {
              id: `visual-filter-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              source: 'standard',
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

  const updateCompanyVisualFilter = (mode, sectionKey, filterId, field, value) => {
    setForm(previous => ({
      ...previous,
      dashboardVisualFilters: {
        ...previous.dashboardVisualFilters,
        [mode]: {
          ...(previous.dashboardVisualFilters?.[mode] || {}),
          [sectionKey]: (previous.dashboardVisualFilters?.[mode]?.[sectionKey] || []).map(filter =>
            filter.id === filterId ? { ...filter, [field]: value } : filter
          ),
        },
      },
    }))
  }

  const updateCompanyVisualFilterSource = (mode, sectionKey, filterId, source) => {
    setForm(previous => ({
      ...previous,
      dashboardVisualFilters: {
        ...previous.dashboardVisualFilters,
        [mode]: {
          ...(previous.dashboardVisualFilters?.[mode] || {}),
          [sectionKey]: (previous.dashboardVisualFilters?.[mode]?.[sectionKey] || []).map(filter =>
            filter.id === filterId
              ? {
                  ...filter,
                  source,
                  field: '',
                  table: '',
                  column: '',
                  value: '',
                }
              : filter
          ),
        },
      },
    }))
  }

  const updateCompanyVisualFilterField = (mode, sectionKey, filterId, fieldName) => {
    const definition = getDashboardFilterDefinition(fieldName)

    setForm(previous => ({
      ...previous,
      dashboardVisualFilters: {
        ...previous.dashboardVisualFilters,
        [mode]: {
          ...(previous.dashboardVisualFilters?.[mode] || {}),
          [sectionKey]: (previous.dashboardVisualFilters?.[mode]?.[sectionKey] || []).map(filter => {
            if (filter.id !== filterId) return filter
            return {
              ...filter,
              source: 'standard',
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

  const updateCompanyVisualFilterTable = (mode, sectionKey, filterId, tableName) => {
    const supabaseTables = dashboardFilterOptions?.supabaseTables || []
    const table = supabaseTables.find(item => item.name === tableName)

    setForm(previous => ({
      ...previous,
      dashboardVisualFilters: {
        ...previous.dashboardVisualFilters,
        [mode]: {
          ...(previous.dashboardVisualFilters?.[mode] || {}),
          [sectionKey]: (previous.dashboardVisualFilters?.[mode]?.[sectionKey] || []).map(filter => {
            if (filter.id !== filterId) return filter
            const shouldKeepColumn = table?.columns?.includes(filter.column)
            return {
              ...filter,
              source: 'table',
              field: '',
              table: tableName,
              column: shouldKeepColumn ? filter.column : '',
              value: '',
            }
          }),
        },
      },
    }))
  }

  const removeCompanyVisualFilter = (mode, sectionKey, filterId) => {
    setForm(previous => ({
      ...previous,
      dashboardVisualFilters: {
        ...previous.dashboardVisualFilters,
        [mode]: {
          ...(previous.dashboardVisualFilters?.[mode] || {}),
          [sectionKey]: (previous.dashboardVisualFilters?.[mode]?.[sectionKey] || []).filter(filter => filter.id !== filterId),
        },
      },
    }))
  }

  const addOrderCompletionRule = () => {
    setForm(previous => ({
      ...previous,
      orderCompletionRules: [
        ...(previous.orderCompletionRules || []),
        {
          id: `order-completion-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          table: '',
          column: '',
          value: '',
        },
      ],
    }))
  }

  const updateOrderCompletionRule = (ruleId, field, value) => {
    setForm(previous => ({
      ...previous,
      orderCompletionRules: (previous.orderCompletionRules || []).map(rule => {
        if (rule.id !== ruleId) return rule
        if (field === 'table') {
          const supabaseTable = (dashboardFilterOptions?.supabaseTables || []).find(table => table.name === value)
          const shouldKeepColumn = supabaseTable?.columns?.includes(rule.column)
          return {
            ...rule,
            table: value,
            column: shouldKeepColumn ? rule.column : '',
            value: '',
          }
        }

        return { ...rule, [field]: value }
      }),
    }))
  }

  const removeOrderCompletionRule = ruleId => {
    setForm(previous => ({
      ...previous,
      orderCompletionRules: (previous.orderCompletionRules || []).filter(rule => rule.id !== ruleId),
    }))
  }

  const removeCompanyDashboardFilter = (mode, filterId) => {
    setForm(previous => ({
      ...previous,
      dashboardFilters: {
        ...previous.dashboardFilters,
        [mode]: (previous.dashboardFilters?.[mode] || []).filter(filter => filter.id !== filterId),
      },
    }))
  }

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

  const toggleUserPowerBiReportPage = (reportId, pageName, allPageNames = []) => {
    setUserForm(previous => {
      const current = previous.permissions.powerBiReports?.[reportId] || { enabled: true, pages: [], filters: [] }
      const pages = current.pages || []
      let nextPages = []

      if (pages.length === 0) {
        // Modo "Todas": ao clicar em uma pagina, vira selecao manual removendo apenas a pagina clicada.
        nextPages = allPageNames
          .map(value => String(value || '').trim())
          .filter(Boolean)
          .filter(value => value !== pageName)
      } else {
        nextPages = pages.includes(pageName) ? pages.filter(value => value !== pageName) : [...pages, pageName]
      }

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

              <div className="hidden px-6 py-4 text-[11px] uppercase tracking-[0.2em] text-[#8d867c] lg:grid lg:grid-cols-[2fr_1.2fr_1fr_1fr_240px]">
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
                    <div className="grid gap-4 lg:grid-cols-[2fr_1.2fr_1fr_1fr_240px] lg:items-center">
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
                        <button type="button" className="portal-ghost-button" onClick={() => openPortalPreviewModal(company)}>
                          Portal
                          <SquareArrowOutUpRight size={15} />
                        </button>
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

                {form.supabaseEnabled ? (
                  <details className="rounded-[24px] bg-white/[0.05] p-4">
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-white">Filtros gerais dos dashboards</h4>
                          <p className="mt-1 text-sm text-[#b7b0a6]">
                            Aplique filtros fixos para toda a empresa no PPS e na Analise de Dados.
                          </p>
                        </div>
                        <span className="portal-pill">Retraivel</span>
                      </div>
                    </summary>

                    <div className="mt-4 space-y-4">
                      {dashboardFilterOptionsLoading ? (
                        <p className="text-sm text-[#b7b0a6]">Carregando filtros disponiveis...</p>
                      ) : null}
                      {dashboardFilterOptionsError ? (
                        <p className="text-sm text-amber-200">{dashboardFilterOptionsError}</p>
                      ) : null}

                      {Object.entries(DASHBOARD_SECTION_GROUPS).map(([mode]) => {
                        const filters = form.dashboardFilters?.[mode] || []

                        return (
                          <div key={mode} className="rounded-[20px] bg-white/[0.04] p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <h5 className="text-sm font-semibold text-white">
                                  {mode === 'pps' ? 'PPS' : 'Analise de Dados'}
                                </h5>
                                <p className="mt-1 text-xs text-[#8d867c]">
                                  {filters.length === 0 ? 'Sem filtro geral neste modulo.' : `${filters.length} filtro(s) aplicado(s).`}
                                </p>
                              </div>
                              <button type="button" className="portal-ghost-button" onClick={() => addCompanyDashboardFilter(mode)}>
                                <Plus size={14} />
                                Adicionar filtro
                              </button>
                            </div>

                            <div className="mt-4 space-y-3">
                              {filters.length === 0 ? (
                                <p className="text-sm text-[#b7b0a6]">Nenhum filtro configurado para este modulo.</p>
                              ) : (
                                filters.map(filter => {
                                  const filterDefinition = getDashboardFilterDefinition(filter.field)
                                  const fieldOptions = getDashboardFieldOptions(filter.field)

                                  return (
                                    <div key={filter.id} className="rounded-[16px] bg-[#141216] p-3">
                                      <div className="mb-3 flex justify-end">
                                        <button
                                          type="button"
                                          className="inline-flex h-9 items-center rounded-xl bg-red-500/10 px-3 text-xs font-medium text-red-200 transition hover:bg-red-500/15"
                                          onClick={() => removeCompanyDashboardFilter(mode, filter.id)}
                                        >
                                          Remover
                                        </button>
                                      </div>
                                      <div className="grid gap-3 md:grid-cols-2">
                                        <select
                                          className="portal-input"
                                          value={filter.field || ''}
                                          onChange={event => updateCompanyDashboardFilterField(mode, filter.id, event.target.value)}
                                        >
                                          <option value="">Selecione o filtro</option>
                                          {getAvailableDashboardFields().map(field => (
                                            <option key={field.name} value={field.name}>
                                              {field.label}
                                            </option>
                                          ))}
                                        </select>

                                        {filterDefinition?.inputType === 'select' ? (
                                          <select
                                            className="portal-input"
                                            value={filter.value}
                                            onChange={event => updateCompanyDashboardFilter(mode, filter.id, 'value', event.target.value)}
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
                                        ) : (
                                          <input
                                            className="portal-input"
                                            value={filter.value}
                                            onChange={event => updateCompanyDashboardFilter(mode, filter.id, 'value', event.target.value)}
                                            placeholder="Valor ou lista separada por virgula"
                                            disabled={!filter.field}
                                          />
                                        )}

                                        <select
                                          className="portal-input"
                                          value={filter.operator}
                                          onChange={event => updateCompanyDashboardFilter(mode, filter.id, 'operator', event.target.value)}
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
                                  )
                                })
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </details>
                ) : null}

                {form.supabaseEnabled ? (
                  <details className="rounded-[24px] bg-white/[0.05] p-4">
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-white">Filtros por visual</h4>
                          <p className="mt-1 text-sm text-[#b7b0a6]">
                            Aplique filtros fixos em graficos ou tabelas especificas do PPS e da Analise de Dados.
                          </p>
                        </div>
                        <span className="portal-pill">Retraivel</span>
                      </div>
                    </summary>

                    <div className="mt-4 space-y-4">
                      {dashboardFilterOptionsLoading ? (
                        <p className="text-sm text-[#b7b0a6]">Carregando valores dos filtros padrao...</p>
                      ) : null}
                      {dashboardFilterOptionsError ? (
                        <p className="text-sm text-amber-200">{dashboardFilterOptionsError}</p>
                      ) : null}

                      {Object.entries(DASHBOARD_SECTION_GROUPS).map(([mode, sections]) => (
                        <div key={mode} className="rounded-[20px] bg-white/[0.04] p-4">
                          <h5 className="text-sm font-semibold text-white">
                            {mode === 'pps' ? 'PPS' : 'Analise de Dados'}
                          </h5>

                          <div className="mt-4 space-y-3">
                            {sections.map(section => {
                              const filters = form.dashboardVisualFilters?.[mode]?.[section.key] || []

                              return (
                                <div key={section.key} className="rounded-[18px] bg-[#141216] p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-semibold text-white">{section.label}</p>
                                      <p className="mt-1 text-xs text-[#8d867c]">
                                        {filters.length === 0 ? 'Sem filtro exclusivo para este visual.' : `${filters.length} filtro(s) aplicado(s).`}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      className="portal-ghost-button"
                                      onClick={() => addCompanyVisualFilter(mode, section.key)}
                                    >
                                      <Plus size={14} />
                                      Adicionar
                                    </button>
                                  </div>

                                  {filters.length > 0 ? (
                                    <div className="mt-3 space-y-3">
                                      {filters.map(filter => {
                                        const source = filter.source || (filter.field ? 'standard' : 'table')
                                        const filterDefinition = getDashboardFilterDefinition(filter.field)
                                        const fieldOptions = getDashboardFieldOptions(filter.field)

                                        return (
                                          <div key={filter.id} className="rounded-[16px] bg-white/[0.04] p-3">
                                            <div className="mb-3 flex justify-end">
                                              <button
                                                type="button"
                                                className="inline-flex h-9 items-center rounded-xl bg-red-500/10 px-3 text-xs font-medium text-red-200 transition hover:bg-red-500/15"
                                                onClick={() => removeCompanyVisualFilter(mode, section.key, filter.id)}
                                              >
                                                Remover
                                              </button>
                                            </div>

                                            <div className="grid gap-3 md:grid-cols-2">
                                              <select
                                                className="portal-input"
                                                value={source}
                                                onChange={event => updateCompanyVisualFilterSource(mode, section.key, filter.id, event.target.value)}
                                              >
                                                <option value="standard">Filtro padrao do site</option>
                                                <option value="table">Tabela e coluna</option>
                                              </select>

                                              {source === 'standard' ? (
                                                <select
                                                  className="portal-input"
                                                  value={filter.field || ''}
                                                  onChange={event => updateCompanyVisualFilterField(mode, section.key, filter.id, event.target.value)}
                                                >
                                                  <option value="">Selecione o filtro</option>
                                                  {getAvailableDashboardFields().map(field => (
                                                    <option key={field.name} value={field.name}>
                                                      {field.label}
                                                    </option>
                                                  ))}
                                                </select>
                                              ) : (
                                                <select
                                                  className="portal-input"
                                                  value={filter.table || ''}
                                                  onChange={event => updateCompanyVisualFilterTable(mode, section.key, filter.id, event.target.value)}
                                                >
                                                  <option value="">Selecione a tabela</option>
                                                  {(dashboardFilterOptions?.supabaseTables || []).map(table => (
                                                    <option key={table.name} value={table.name}>
                                                      {table.name}
                                                    </option>
                                                  ))}
                                                </select>
                                              )}

                                              {source === 'table' ? (
                                                <select
                                                  className="portal-input"
                                                  value={filter.column || ''}
                                                  onChange={event => updateCompanyVisualFilter(mode, section.key, filter.id, 'column', event.target.value)}
                                                  disabled={!filter.table}
                                                >
                                                  <option value="">{filter.table ? 'Selecione a coluna' : 'Escolha a tabela primeiro'}</option>
                                                  {(() => {
                                                 const supabaseTable = (dashboardFilterOptions?.supabaseTables || []).find(t => t.name === filter.table)
                                                 return (supabaseTable?.columns || []).map(col => (
                                                   <option key={col} value={col}>{col}</option>
                                                  ))
                                              })()}
                                                </select>
                                              ) : null}

                                              <select
                                                className="portal-input"
                                                value={filter.operator}
                                                onChange={event => updateCompanyVisualFilter(mode, section.key, filter.id, 'operator', event.target.value)}
                                              >
                                                {POWER_BI_FILTER_OPERATORS.map(option => (
                                                  <option key={option.value} value={option.value}>
                                                    {option.label}
                                                  </option>
                                                ))}
                                              </select>

                                              {source === 'standard' && filterDefinition?.inputType === 'select' ? (
                                                <select
                                                  className="portal-input"
                                                  value={filter.value}
                                                  onChange={event => updateCompanyVisualFilter(mode, section.key, filter.id, 'value', event.target.value)}
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
                                              ) : (
                                                <input
                                                  className="portal-input"
                                                  value={filter.value}
                                                  onChange={event => updateCompanyVisualFilter(mode, section.key, filter.id, 'value', event.target.value)}
                                                  placeholder="Valor ou lista separada por virgula"
                                                  disabled={source === 'standard' ? !filter.field : !filter.table || !filter.column}
                                                />
                                              )}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  ) : null}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}

                <div className="rounded-[24px] bg-white/[0.05] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-white">Tipo de portal</h4>
                      <p className="mt-1 text-sm text-[#b7b0a6]">
                        Defina se a empresa usa o portal interno ou um dashboard externo.
                      </p>
                    </div>

                    <label className="portal-checkbox shrink-0">
                      <input
                        type="checkbox"
                        checked={form.supabaseEnabled}
                        onChange={event => setForm(previous => ({ ...previous, supabaseEnabled: event.target.checked }))}
                      />
                      <span>Portal interno</span>
                    </label>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {form.supabaseEnabled ? (
                      <>
                        <div className="space-y-3 md:col-span-2">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <label className="portal-label">Fonte de dados do dashboard</label>
                              <select
                                className="portal-input"
                                value={form.dashboardDataSource}
                                onChange={event => setForm(previous => ({ ...previous, dashboardDataSource: event.target.value }))}
                              >
                                {DASHBOARD_DATA_SOURCE_TYPES.map(source => (
                                  <option key={source.value} value={source.value}>
                                    {source.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-2">
                              <label className="portal-label">Limite por busca da API</label>
                              <input
                                className="portal-input"
                                type="number"
                                min="1"
                                value={form.gradualApiLimit}
                                onChange={event => setForm(previous => ({ ...previous, gradualApiLimit: event.target.value }))}
                                disabled={form.dashboardDataSource !== 'gradualApi'}
                              />
                            </div>
                          </div>

                          {form.dashboardDataSource === 'supabase' ? (
                            <div className="grid gap-4 md:grid-cols-2">
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
                            </div>
                          ) : null}

                          {form.dashboardDataSource === 'gradualApi' ? (
                            <div className="rounded-[16px] bg-white/[0.04] p-3">
                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-2 md:col-span-2">
                                  <label className="portal-label">URL da API Gradual</label>
                                  <input
                                    className="portal-input"
                                    value={form.gradualApiUrl}
                                    onChange={event => setForm(previous => ({ ...previous, gradualApiUrl: event.target.value }))}
                                    placeholder="http://127.0.0.1:5001"
                                  />
                                </div>

                                <div className="space-y-2 md:col-span-2">
                                  <label className="portal-label">Chave da API Gradual</label>
                                  <input
                                    className="portal-input"
                                    type="password"
                                    value={form.gradualApiKey}
                                    onChange={event => setForm(previous => ({ ...previous, gradualApiKey: event.target.value }))}
                                    placeholder={form.id ? 'Preencha so se quiser trocar a chave' : 'Cole a chave PPS_API_KEY'}
                                  />
                                </div>

                                <div className="space-y-2">
                                  <label className="portal-label">Fonte na API</label>
                                  <input
                                    className="portal-input"
                                    value={form.gradualApiSource}
                                    onChange={event => setForm(previous => ({ ...previous, gradualApiSource: event.target.value }))}
                                    placeholder="Ex.: lentes-gradual"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <label className="portal-label">Empresas na API</label>
                                  <input
                                    className="portal-input"
                                    value={form.gradualApiCompanyIdsText}
                                    onChange={event => setForm(previous => ({ ...previous, gradualApiCompanyIdsText: event.target.value }))}
                                    placeholder="Ex.: 6, 7"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <label className="portal-label">Janela de varredura</label>
                                  <input
                                    className="portal-input"
                                    type="number"
                                    min="1"
                                    value={form.gradualApiScanWindow}
                                    onChange={event => setForm(previous => ({ ...previous, gradualApiScanWindow: event.target.value }))}
                                    placeholder="1500"
                                  />
                                </div>

                                <div className="space-y-2 md:col-span-2">
                                  <label className="portal-label">ID inicial opcional</label>
                                  <input
                                    className="portal-input"
                                    value={form.gradualApiStartOrderId}
                                    onChange={event => setForm(previous => ({ ...previous, gradualApiStartOrderId: event.target.value }))}
                                    placeholder="Deixe vazio para a API usar o estado salvo"
                                  />
                                </div>
                              </div>

                              <p className="mt-3 text-xs text-[#8d867c]">
                                A resposta sera convertida para o formato atual do portal: pedidos, produtos, rastreabilidade, clientes e vendedores.
                              </p>
                            </div>
                          ) : null}
                        </div>

                        <div className="space-y-3 md:col-span-2">
                          <label className="flex items-center gap-2 text-sm font-medium text-[#efe9df]">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[#5aa7ff]"
                              checked={form.limitByCompanyCodeEnabled}
                              onChange={event => setForm(previous => ({ ...previous, limitByCompanyCodeEnabled: event.target.checked }))}
                            />
                            <span>Limitar dashboard por codigo da empresa</span>
                          </label>
                          {form.limitByCompanyCodeEnabled ? (
                            <div className="space-y-2">
                              <label className="portal-label">Codigo da empresa</label>
                              <input
                                className="portal-input"
                                value={form.companyCodeFilter}
                                onChange={event => setForm(previous => ({ ...previous, companyCodeFilter: event.target.value }))}
                                placeholder="Ex.: 1"
                              />
                            </div>
                          ) : null}
                          <p className="text-xs text-[#8d867c]">
                            Quando ligado, o portal filtra PPS e Analise de Dados por PEDID.EMPCODIGO.
                          </p>
                        </div>

                        <div className="space-y-2 md:col-span-2">
                          <label className="portal-label">Codigos de perda</label>
                          <input
                            className="portal-input"
                            value={form.lossFinalityCodesText}
                            onChange={event => setForm(previous => ({ ...previous, lossFinalityCodesText: event.target.value }))}
                            placeholder="Ex.: 2, 4, 30"
                          />
                          <p className="text-xs text-[#8d867c]">
                            Informe os codigos da PEDFINALIDADE que representam perda nesta empresa, separados por virgula.
                          </p>
                        </div>

                        <div className="space-y-3 md:col-span-2">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <label className="portal-label">Pedido concluido quando</label>
                              <p className="mt-1 text-xs text-[#8d867c]">
                                O pedido tambem sera tratado como concluido quando bater qualquer condicao abaixo.
                              </p>
                            </div>
                            <button
                              type="button"
                              className="portal-ghost-button"
                              onClick={addOrderCompletionRule}
                            >
                              <Plus size={14} />
                              Adicionar
                            </button>
                          </div>

                          {(form.orderCompletionRules || []).length > 0 ? (
                            <div className="space-y-3">
                              {(form.orderCompletionRules || []).map(rule => {
                                const supabaseTable = (dashboardFilterOptions?.supabaseTables || []).find(table => table.name === rule.table)

                                return (
                                  <div key={rule.id} className="rounded-[16px] bg-white/[0.04] p-3">
                                    <div className="mb-3 flex justify-end">
                                      <button
                                        type="button"
                                        className="inline-flex h-9 items-center rounded-xl bg-red-500/10 px-3 text-xs font-medium text-red-200 transition hover:bg-red-500/15"
                                        onClick={() => removeOrderCompletionRule(rule.id)}
                                      >
                                        Remover
                                      </button>
                                    </div>

                                    <div className="grid gap-3 md:grid-cols-3">
                                      <select
                                        className="portal-input"
                                        value={rule.table || ''}
                                        onChange={event => updateOrderCompletionRule(rule.id, 'table', event.target.value)}
                                      >
                                        <option value="">Selecione a tabela</option>
                                        {(dashboardFilterOptions?.supabaseTables || []).map(table => (
                                          <option key={table.name} value={table.name}>
                                            {table.name}
                                          </option>
                                        ))}
                                      </select>

                                      <select
                                        className="portal-input"
                                        value={rule.column || ''}
                                        onChange={event => updateOrderCompletionRule(rule.id, 'column', event.target.value)}
                                        disabled={!rule.table}
                                      >
                                        <option value="">{rule.table ? 'Selecione a coluna' : 'Escolha a tabela primeiro'}</option>
                                        {(supabaseTable?.columns || []).map(column => (
                                          <option key={column} value={column}>
                                            {column}
                                          </option>
                                        ))}
                                      </select>

                                      <input
                                        className="portal-input"
                                        value={rule.value || ''}
                                        onChange={event => updateOrderCompletionRule(rule.id, 'value', event.target.value)}
                                        placeholder="Valor ou lista separada por virgula"
                                        disabled={!rule.table || !rule.column}
                                      />
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="rounded-[16px] border border-dashed border-white/10 px-4 py-3 text-sm text-[#8d867c]">
                              Sem condicao adicional. A data de saida continua concluindo o pedido normalmente.
                            </div>
                          )}
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

                            <div className="space-y-2">
                              <label className="portal-label">Effective identity username</label>
                              <input
                                className="portal-input"
                                value={report.effectiveIdentityUsername || ''}
                                onChange={event => updatePowerBiReportField(report.id, 'effectiveIdentityUsername', event.target.value)}
                                placeholder="Opcional: email, usuario ou object id"
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="portal-label">Papeis RLS</label>
                              <input
                                className="portal-input"
                                value={report.effectiveIdentityRolesText ?? (Array.isArray(report.effectiveIdentityRoles) ? report.effectiveIdentityRoles.join(', ') : '')}
                                onChange={event => updatePowerBiReportField(report.id, 'effectiveIdentityRolesText', event.target.value)}
                                placeholder="Opcional: Geral, VndAdilson"
                              />
                              <p className="text-xs text-[#8d867c]">Separe varios papeis por virgula.</p>
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
                      <button type="button" className="portal-ghost-button" onClick={() => editingCompany && openPortalPreviewModal(editingCompany)}>
                        Portal
                        <SquareArrowOutUpRight size={15} />
                      </button>
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

      {portalPreviewCompany ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#09080b]/80 px-4 py-8 backdrop-blur-sm">
          <div className="flex max-h-[78vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[26px] bg-[#171418] shadow-[0_32px_120px_rgba(0,0,0,0.45)]">
            <div className="flex shrink-0 items-start justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.22em] text-[#bca27a]">Entrar no portal</p>
                <h3 className="mt-2 truncate text-xl font-semibold">{portalPreviewCompany.name}</h3>
                <p className="mt-1 text-sm leading-6 text-[#b7b0a6]">
                  Escolha como deseja visualizar esta empresa. A opcao de usuario replica paginas, visuais e filtros liberados para ele.
                </p>
              </div>
              <button type="button" className="portal-ghost-button" onClick={closePortalPreviewModal}>
                <X size={16} />
                Fechar
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-[#121015] px-5 py-4">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 rounded-[18px] border border-[#e3ad5a]/25 bg-[#e3ad5a]/10 px-4 py-3 text-left transition hover:border-[#e3ad5a]/45 hover:bg-[#e3ad5a]/15"
                onClick={() => enterCompanyPortal(null)}
              >
                <div>
                  <p className="text-sm font-semibold text-white">Entrar como admin</p>
                  <p className="mt-1 text-xs text-[#b7b0a6]">Visualiza a empresa sem restricoes de usuario.</p>
                </div>
                <Eye size={18} className="text-[#e3ad5a]" />
              </button>

              {getCompanyUserList(companyUsers, portalPreviewCompany).length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-white/10 px-4 py-3 text-sm text-[#b7b0a6]">
                  Nenhum usuario cadastrado para esta empresa.
                </div>
              ) : (
                getCompanyUserList(companyUsers, portalPreviewCompany).map(user => (
                  <button
                    key={user.uid}
                    type="button"
                    className="flex w-full items-center justify-between gap-4 rounded-[18px] bg-white/[0.05] px-4 py-3 text-left transition hover:bg-white/[0.08]"
                    onClick={() => enterCompanyPortal(user)}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-white">{user.name || user.email}</p>
                        {user.uid === portalPreviewCompany.authUid ? <span className="portal-pill">Principal</span> : null}
                      </div>
                      <p className="mt-1 truncate text-sm text-[#b7b0a6]">{user.email}</p>
                    </div>
                    <SquareArrowOutUpRight size={16} className="shrink-0 text-[#8f877d]" />
                  </button>
                ))
              )}
            </div>
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
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button type="button" className="portal-ghost-button" onClick={openPasswordListModal}>
                      <FileDown size={14} />
                      Gerar lista
                    </button>
                    <button type="button" className="portal-primary-button" onClick={startCreateUser}>
                      <UserPlus size={16} />
                      Novo usuario
                    </button>
                  </div>
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
                        <div className="flex flex-wrap justify-end gap-2">
                          <button type="button" className="portal-ghost-button" onClick={() => copyUserConfiguration(user)}>
                            <Copy size={14} />
                            Copiar config.
                          </button>
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
                                              onChange={() =>
                                                toggleUserPowerBiReportPage(
                                                  report.id,
                                                  page.name,
                                                  (report.pages || []).map(item => item.name)
                                                )
                                              }
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
          {isPasswordListModalOpen ? (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#09080b]/75 px-4 py-8 backdrop-blur-sm">
              <div className="flex max-h-[88vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[28px] bg-[#19161c] shadow-[0_32px_120px_rgba(0,0,0,0.55)]">
                <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
                  <div>
                    <h3 className="text-xl font-semibold text-white">Gerar lista de usuarios</h3>
                    <p className="mt-1 text-sm text-[#b7b0a6]">
                      Informe a nova senha de cada usuario. Ao concluir, o portal atualiza as senhas e baixa um TXT com nome, email e senha.
                    </p>
                  </div>
                  <button type="button" className="portal-ghost-button" onClick={closePasswordListModal} disabled={isGeneratingPasswordList}>
                    <X size={14} />
                    Fechar
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                  <div className="space-y-3">
                    {getCompanyUserList(companyUsers, managingCompany).map(user => (
                      <div key={user.uid} className="rounded-2xl bg-white/[0.04] p-4">
                        <p className="text-sm font-semibold text-white">{user.name || 'Sem nome'}</p>
                        <p className="mt-1 text-sm text-[#b7b0a6]">{user.email}</p>
                        <div className="mt-3 space-y-2">
                          <label className="portal-label">Nova senha</label>
                          <input
                            className="portal-input"
                            type="text"
                            value={passwordBatchMap[user.uid] || ''}
                            onChange={event => updatePasswordBatchValue(user.uid, event.target.value)}
                            placeholder="Minimo 6 caracteres"
                            disabled={isGeneratingPasswordList}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 px-6 py-5">
                  <button type="button" className="portal-ghost-button" onClick={closePasswordListModal} disabled={isGeneratingPasswordList}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="portal-primary-button"
                    onClick={handleGeneratePasswordList}
                    disabled={isGeneratingPasswordList}
                  >
                    {isGeneratingPasswordList ? 'Processando...' : 'Concluir e gerar TXT'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </main>
  )
}
