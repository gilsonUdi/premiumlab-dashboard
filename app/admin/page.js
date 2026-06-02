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
  MessageSquareText,
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
  DASHBOARD_FEEDING_MODE_TYPES,
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
  dashboardFeedingModel: 'firebird_legacy',
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
  if (!value) return 'Não informado'

  const parsed =
    typeof value?.toDate === 'function'
      ? value.toDate()
      : value?.seconds
        ? new Date(value.seconds * 1000)
        : new Date(value)

  if (Number.isNaN(parsed.getTime())) return 'Não informado'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed)
}

function formatCompanyStatus(company) {
  const enabled = []
  if (company.supabaseEnabled) enabled.push('Portal interno')
  if (company.externalDashboardUrl) enabled.push('Dashboard externo')
  if (company.powerBiEnabled) enabled.push('Power BI')
  return enabled.length > 0 ? enabled.join(' + ') : 'Sem ferramenta ativa'
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
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false)
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
  const [activePanel, setActivePanel] = useState('companies')
  const [activeCompanyTab, setActiveCompanyTab] = useState('basic')
  const [activeUserTab, setActiveUserTab] = useState('data')
  const [feedbackItems, setFeedbackItems] = useState([])
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [feedbackError, setFeedbackError] = useState('')
  const [feedbackNewCount, setFeedbackNewCount] = useState(0)
  const [feedbackFilterStatus, setFeedbackFilterStatus] = useState('all')

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

  useEffect(() => {
    loadFeedbackNewCount()
  }, [])

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
          throw new Error(payload.error || 'Não foi possível carregar as páginas do Power BI.')
        }
        if (!active) return
        setPowerBiCatalog(Array.isArray(payload.reports) ? payload.reports : [])
      } catch (error) {
        console.error(error)
        if (!active) return
        setPowerBiCatalog([])
        setPowerBiCatalogError(error.message || 'Não foi possível carregar as páginas do Power BI.')
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
          throw new Error(payload.error || 'Não foi possível carregar os filtros do dashboard.')
        }
        if (!active) return
        setDashboardFilterOptions(payload || {})
      } catch (error) {
        console.error(error)
        if (!active) return
        setDashboardFilterOptions(null)
        setDashboardFilterOptionsError(error.message || 'Não foi possível carregar os filtros do dashboard.')
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

  const loadFeedbackItems = async () => {
    setFeedbackLoading(true)
    setFeedbackError('')
    try {
      const token = await getPortalAccessToken()
      const response = await fetch('/api/admin/feedback', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Falha ao carregar sugestões.')
      }
      setFeedbackItems(Array.isArray(payload.feedback) ? payload.feedback : [])
      setFeedbackNewCount(0)
    } catch (error) {
      console.error(error)
      setFeedbackError(error?.message || 'Falha ao carregar sugestões.')
      setFeedbackItems([])
    } finally {
      setFeedbackLoading(false)
    }
  }

  const loadFeedbackNewCount = async () => {
    try {
      const token = await getPortalAccessToken()
      const response = await fetch('/api/admin/feedback?countOnly=1', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) return
      setFeedbackNewCount(Number(payload?.newCount) || 0)
    } catch (error) {
      console.error(error)
    }
  }

  const updateFeedbackStatus = async (id, status) => {
    try {
      const token = await getPortalAccessToken()
      const response = await fetch('/api/admin/feedback', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, status }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Falha ao atualizar status.')
      }
      setFeedbackItems(previous =>
        previous.map(item =>
          item.id === id
            ? {
                ...item,
                status,
                viewedByAdmin: true,
              }
            : item
        )
      )
    } catch (error) {
      console.error(error)
      setFeedbackError(error?.message || 'Falha ao atualizar status.')
    }
  }

  const formatDateTime = value => {
    if (!value) return 'Não informado'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return 'Não informado'
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed)
  }

  const getFeedbackStatusRank = status => {
    if (status === 'lido') return 0
    if (status === 'em_progresso') return 1
    if (status === 'concluido') return 2
    return 3
  }

  const getFeedbackCardClassName = status => {
    if (status === 'concluido') return 'bg-white/[0.04] border border-emerald-400/35'
    if (status === 'em_progresso') return 'bg-white/[0.04] border border-sky-400/35'
    return 'bg-white/[0.04] border border-white/12'
  }

  const getFeedbackStatusButtonClassName = (currentStatus, targetStatus) => {
    const isActive = currentStatus === targetStatus
    if (!isActive) return 'portal-ghost-button h-9 px-3 py-1 text-xs'

    if (targetStatus === 'concluido') {
      return 'portal-ghost-button h-9 px-3 py-1 text-xs font-semibold text-emerald-200'
    }

    if (targetStatus === 'em_progresso') {
      return 'portal-ghost-button h-9 px-3 py-1 text-xs font-semibold text-sky-200'
    }

    return 'portal-ghost-button h-9 px-3 py-1 text-xs font-semibold text-[#f3cb89]'
  }

  const getFeedbackStatusButtonStyle = (currentStatus, targetStatus) => {
    if (currentStatus !== targetStatus) return undefined

    if (targetStatus === 'concluido') {
      return {
        borderColor: 'rgba(52, 211, 153, 0.55)',
        backgroundColor: 'rgba(16, 185, 129, 0.18)',
        boxShadow: '0 0 0 1px rgba(16, 185, 129, 0.22) inset',
      }
    }

    if (targetStatus === 'em_progresso') {
      return {
        borderColor: 'rgba(56, 189, 248, 0.55)',
        backgroundColor: 'rgba(14, 165, 233, 0.18)',
        boxShadow: '0 0 0 1px rgba(14, 165, 233, 0.22) inset',
      }
    }

    return {
      borderColor: 'rgba(227, 173, 90, 0.55)',
      backgroundColor: 'rgba(227, 173, 90, 0.16)',
      boxShadow: '0 0 0 1px rgba(227, 173, 90, 0.2) inset',
    }
  }

  const closeCompanyModal = () => {
    setIsCompanyModalOpen(false)
    setForm(emptyForm)
    setActiveCompanyTab('basic')
  }

  const openCreateCompanyModal = () => {
    setForm(emptyForm)
    setActiveCompanyTab('basic')
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
        dashboardFeedingModel: form.dashboardFeedingModel,
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
      setMessage(error.message || 'Não foi possível salvar a empresa.')
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
      dashboardFeedingModel: company.dashboardFeedingModel || company.dashboardDataSource || company.dashboardDataSourceType || 'firebird_legacy',
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
    setActiveCompanyTab('basic')
    setIsCompanyModalOpen(true)
  }

  const handleDeleteCompany = async company => {
    if (!state || company.isPremiumLab) return

    const confirmed = window.confirm(`Excluir a empresa ${company.name}? Essa ação remove o tenant do portal.`)
    if (!confirmed) return

    try {
      setDeletingCompanyId(company.id)
      const nextState = await deleteCompany(state, company.id)
      setState(nextState)
      setMessage('Empresa excluída com sucesso.')
      window.setTimeout(() => setMessage(''), 2500)
    } catch (error) {
      console.error(error)
      setMessage('Não foi possível excluir a empresa.')
      window.setTimeout(() => setMessage(''), 3500)
    } finally {
      setDeletingCompanyId('')
    }
  }

  const openUserModal = company => {
    setManagingCompanyId(company.id)
    setEditingUserId('')
    setActiveUserTab('data')
    setUserForm(buildEmptyUserForm(company))
    setIsUserModalOpen(true)
  }

  const closeUserModal = () => {
    setIsUserModalOpen(false)
    setIsCreateUserModalOpen(false)
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
    setIsCreateUserModalOpen(true)
  }

  const closeCreateUserModal = () => {
    if (!managingCompany) return
    setIsCreateUserModalOpen(false)
    setUserForm(buildEmptyUserForm(managingCompany))
  }

  const startEditUser = user => {
    if (!managingCompany) return
    setIsCreateUserModalOpen(false)
    setEditingUserId(user.uid)
    setActiveUserTab('data')
    setUserForm(cloneUserForm(user, managingCompany))
  }

  const copyUserConfiguration = user => {
    if (!managingCompany) return
    const copiedPermissions = normalizeUserPermissions(user.permissions, managingCompany)

    setUserForm(previous => ({
      ...previous,
      permissions: JSON.parse(JSON.stringify(copiedPermissions)),
    }))
    setMessage(`Configuração copiada de ${user.name || user.email}.`)
    window.setTimeout(() => setMessage(''), 2500)
  }

  const openPasswordListModal = () => {
    if (!managingCompany) return
    const users = getCompanyUserList(companyUsers, managingCompany)
    if (users.length === 0) {
      setMessage('Não existem usuários cadastrados para gerar a lista.')
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
      setMessage('Não existem usuários cadastrados para gerar a lista.')
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
        const name = user.name || 'Não informado'
        const email = user.email || 'Não informado'
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
        // Modo "Todas": ao clicar em uma página, vira seleção manual removendo apenas a página clicada.
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
      setMessage(editingUserId ? 'Usuário atualizado com sucesso.' : 'Usuário criado com sucesso.')
      window.setTimeout(() => setMessage(''), 2500)
      setEditingUserId('')
      setIsCreateUserModalOpen(false)
      setUserForm(buildEmptyUserForm(managingCompany))
    } catch (error) {
      console.error(error)
      setMessage(error.message || 'Não foi possível salvar o usuário.')
      window.setTimeout(() => setMessage(''), 3500)
    }
  }

  const handleDeleteUser = async user => {
    if (!state || !managingCompany || user.uid === managingCompany.authUid) return
    const confirmed = window.confirm(`Excluir o usuário ${user.email}?`)
    if (!confirmed) return

    try {
      const nextState = await deleteCompanyUser(managingCompany, user)
      setState(nextState)
      if (editingUserId === user.uid) {
        setEditingUserId('')
        setUserForm(buildEmptyUserForm(managingCompany))
      }
      setMessage('Usuário excluído com sucesso.')
      window.setTimeout(() => setMessage(''), 2500)
    } catch (error) {
      console.error(error)
      setMessage(error.message || 'Não foi possível excluir o usuário.')
      window.setTimeout(() => setMessage(''), 3500)
    }
  }

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center text-white" style={{ background: '#0d0b09' }}>
        <div
          className="rounded-2xl px-6 py-4 text-sm"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: '#8a8278' }}
        >
          Carregando administração...
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen text-white" style={{ background: '#0f0d0b' }}>
      <div className="grid min-h-screen xl:grid-cols-[280px_minmax(0,1fr)]">

        {/* Sidebar */}
        <aside
          className="flex flex-col"
          style={{ background: '#0c0a08', borderRight: '1px solid rgba(255,255,255,0.05)' }}
        >
          {/* Brand */}
          <div className="px-6 py-7" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black"
                style={{ background: 'rgba(227,173,90,0.12)', color: '#c9924a', border: '1px solid rgba(227,173,90,0.18)' }}
              >
                GS
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: '#4a4238' }}>Portal</p>
                <p className="text-sm font-semibold text-white">Administração</p>
              </div>
            </div>
            <p className="mt-3 text-xs" style={{ color: '#3d3630' }}>{ADMIN_CREDENTIALS.email}</p>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-4 py-5">
            <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#3a332c' }}>Menu</p>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setActivePanel('companies')}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all"
                style={
                  activePanel === 'companies'
                    ? { background: 'rgba(227,173,90,0.08)', color: '#e3ad5a', border: '1px solid rgba(227,173,90,0.15)' }
                    : { color: '#6b6358', border: '1px solid transparent' }
                }
              >
                <Building2 size={15} />
                <span>Empresas</span>
                {activePanel === 'companies' ? null : null}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivePanel('feedback')
                  loadFeedbackItems()
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all"
                style={
                  activePanel === 'feedback'
                    ? { background: 'rgba(227,173,90,0.08)', color: '#e3ad5a', border: '1px solid rgba(227,173,90,0.15)' }
                    : { color: '#6b6358', border: '1px solid transparent' }
                }
              >
                <MessageSquareText size={15} />
                <span className="flex flex-1 items-center justify-between">
                  Sugestões
                  {feedbackNewCount > 0 ? (
                    <span
                      className="inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ background: 'rgba(227,173,90,0.18)', color: '#e3ad5a' }}
                    >
                      {feedbackNewCount}
                    </span>
                  ) : null}
                </span>
              </button>
            </div>
          </nav>

          {/* Logout */}
          <div className="px-4 py-5" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', color: '#5c554e', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <LogOut size={14} />
              Sair
            </button>
          </div>
        </aside>

        {/* Main content */}
        <section
          className="px-5 py-6 sm:px-7 lg:px-10"
          style={{ background: '#110e0c' }}
        >
          <div className="mx-auto max-w-[1280px]">
            {activePanel === 'companies' ? (
              <>
                <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#4a4238' }}>Gestão</p>
                    <h2 className="text-2xl font-bold tracking-tight text-white">Empresas</h2>
                    <p className="mt-1 text-sm" style={{ color: '#5c554e' }}>{state.companies.length} empresas cadastradas no portal.</p>
                  </div>
                  <button type="button" className="portal-primary-button" onClick={openCreateCompanyModal}>
                    <Plus size={15} />
                    Nova empresa
                  </button>
                </header>

                {message ? (
                  <div
                    className="mb-4 rounded-xl px-4 py-3 text-sm"
                    style={{ background: 'rgba(158,211,169,0.08)', color: '#a8e6b4', border: '1px solid rgba(158,211,169,0.15)' }}
                  >
                    {message}
                  </div>
                ) : null}

                <section
                  className="rounded-2xl overflow-hidden"
                  style={{ background: '#0c0a08', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
                >
                  {/* Search bar */}
                  <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="relative w-full max-w-sm">
                      <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#4a4238' }} />
                      <input
                        className="h-10 w-full rounded-xl pl-9 pr-4 text-sm text-white outline-none transition"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', '::placeholder': { color: '#4a4238' } }}
                        value={searchTerm}
                        onChange={event => setSearchTerm(event.target.value)}
                        placeholder="Buscar empresa..."
                      />
                    </div>
                  </div>

                  {/* Table header */}
                  <div
                    className="hidden px-5 py-3 text-[10px] font-bold uppercase tracking-[0.18em] lg:grid lg:grid-cols-[2fr_1.2fr_1fr_1fr_240px]"
                    style={{ color: '#3a332c', borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                  >
                    <span>Empresa</span>
                    <span>Slug</span>
                    <span>Status</span>
                    <span>Criada em</span>
                    <span className="text-right">Ações</span>
                  </div>

                  {/* Company rows */}
                  <div>
                    {filteredCompanies.length === 0 ? (
                      <div className="px-5 py-16 text-center text-sm" style={{ color: '#4a4238' }}>
                        Nenhuma empresa encontrada para esse termo.
                      </div>
                    ) : null}

                    {filteredCompanies.map((company, idx) => (
                      <div
                        key={company.id}
                        className="px-5 py-4 transition-colors"
                        style={{
                          borderBottom: idx < filteredCompanies.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                        }}
                      >
                        <div className="grid gap-4 lg:grid-cols-[2fr_1.2fr_1fr_1fr_240px] lg:items-center">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold text-white">{company.name}</p>
                              {company.isPremiumLab ? <span className="portal-pill">Premium Lab</span> : null}
                            </div>
                            <p className="mt-0.5 truncate text-xs" style={{ color: '#4a4238' }}>{company.email}</p>
                          </div>

                          <div className="min-w-0">
                            <p className="truncate text-sm" style={{ color: '#6b6358' }}>/{company.slug}</p>
                          </div>

                          <div>
                            <span className="portal-pill">{formatCompanyStatus(company)}</span>
                          </div>

                          <div>
                            <p className="text-sm" style={{ color: '#5c554e' }}>{formatCompanyDate(company.createdAt)}</p>
                          </div>

                          <div className="flex justify-start gap-2 lg:justify-end">
                            <button type="button" className="portal-ghost-button" onClick={() => openPortalPreviewModal(company)}>
                              Portal
                              <SquareArrowOutUpRight size={13} />
                            </button>
                            <button type="button" className="portal-ghost-button" onClick={() => handleEditCompany(company)}>
                              <Pencil size={13} />
                              Editar
                            </button>
                            {!company.isPremiumLab ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteCompany(company)}
                                disabled={deletingCompanyId === company.id}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
                                style={{ background: 'rgba(220,38,38,0.08)', color: '#f87171', border: '1px solid rgba(220,38,38,0.15)' }}
                              >
                                <Trash2 size={13} />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <>
                <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#4a4238' }}>Feedback</p>
                    <h2 className="text-2xl font-bold tracking-tight text-white">Sugestões</h2>
                    <p className="mt-1 text-sm" style={{ color: '#5c554e' }}>Solicitações enviadas pelos usuários das empresas.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {['all', 'lido', 'em_progresso', 'concluido'].map(status => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setFeedbackFilterStatus(status)}
                        className="portal-ghost-button h-9 px-4 text-xs"
                        style={feedbackFilterStatus === status ? { borderColor: 'rgba(227,173,90,0.35)', color: '#e3ad5a' } : {}}
                      >
                        {status === 'all' ? 'Todas' : status === 'lido' ? 'Lido' : status === 'em_progresso' ? 'Em progresso' : 'Concluído'}
                      </button>
                    ))}
                    <button type="button" className="portal-ghost-button h-9 px-4 text-xs" onClick={loadFeedbackItems} disabled={feedbackLoading}>
                      Atualizar
                    </button>
                  </div>
                </header>

                {feedbackError ? (
                  <div className="mb-4 rounded-xl px-4 py-3 text-sm text-red-300" style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.15)' }}>{feedbackError}</div>
                ) : null}

                <section className="rounded-2xl p-4" style={{ background: '#0c0a08', border: '1px solid rgba(255,255,255,0.05)' }}>
                  {feedbackLoading ? (
                    <div className="rounded-xl px-5 py-10 text-center text-sm" style={{ background: 'rgba(255,255,255,0.03)', color: '#5c554e' }}>
                      Carregando sugestões...
                    </div>
                  ) : feedbackItems.filter(item => feedbackFilterStatus === 'all' || item.status === feedbackFilterStatus).length === 0 ? (
                    <div className="rounded-xl px-5 py-10 text-center text-sm" style={{ background: 'rgba(255,255,255,0.03)', color: '#5c554e' }}>
                      Nenhuma sugestão nesse grupo.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {[...feedbackItems]
                        .filter(item => feedbackFilterStatus === 'all' || item.status === feedbackFilterStatus)
                        .sort((left, right) => {
                          const statusOrder = getFeedbackStatusRank(left.status) - getFeedbackStatusRank(right.status)
                          if (statusOrder !== 0) return statusOrder
                          const leftTs = new Date(left.createdAt || 0).getTime()
                          const rightTs = new Date(right.createdAt || 0).getTime()
                          return rightTs - leftTs
                        })
                        .map(item => (
                        <article key={item.id} className={`rounded-2xl p-4 ${getFeedbackCardClassName(item.status)}`}>
                          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[#b8b0a6]">
                            <span className="portal-pill">{item.companyName || item.tenantSlug}</span>
                            <span>{item.userName || item.userEmail}</span>
                            <span>•</span>
                            <span>{formatDateTime(item.createdAt)}</span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-6 text-[#e8e1d8]">{item.message}</p>
                          {Array.isArray(item.attachments) && item.attachments.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {item.attachments.map((attachment, index) => {
                                const url = String(attachment?.url || '')
                                const type = String(attachment?.type || '').toLowerCase()
                                const name = String(attachment?.name || `Anexo ${index + 1}`)
                                if (!url) return null
                                return (
                                  <a
                                    key={`${item.id}-${index}`}
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="portal-pill max-w-[360px] truncate"
                                    title={name}
                                  >
                                    {type.startsWith('video/') ? 'Video: ' : 'Foto: '}
                                    {name}
                                  </a>
                                )
                              })}
                            </div>
                          ) : null}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="text-xs text-[#b8b0a6]">Status:</span>
                            <button
                              type="button"
                              onClick={() => updateFeedbackStatus(item.id, 'lido')}
                              className={getFeedbackStatusButtonClassName(item.status, 'lido')}
                              style={getFeedbackStatusButtonStyle(item.status, 'lido')}
                            >
                              Lido
                            </button>
                            <button
                              type="button"
                              onClick={() => updateFeedbackStatus(item.id, 'em_progresso')}
                              className={getFeedbackStatusButtonClassName(item.status, 'em_progresso')}
                              style={getFeedbackStatusButtonStyle(item.status, 'em_progresso')}
                            >
                              Em progresso
                            </button>
                            <button
                              type="button"
                              onClick={() => updateFeedbackStatus(item.id, 'concluido')}
                              className={getFeedbackStatusButtonClassName(item.status, 'concluido')}
                              style={getFeedbackStatusButtonStyle(item.status, 'concluido')}
                            >
                              Concluído
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </section>
      </div>

      {isCompanyModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto px-4 py-4 sm:items-center sm:py-8" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div
            className="my-auto flex max-h-[calc(100vh-2rem)] w-full max-w-[1100px] flex-col overflow-hidden rounded-2xl sm:max-h-[92vh]"
            style={{ background: '#141210', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 40px 120px rgba(0,0,0,0.6)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <h3 className="text-xl font-bold text-white">{form.id ? (form.name || 'Editar empresa') : 'Nova empresa'}</h3>
                <p className="mt-1 text-sm" style={{ color: '#5c554e' }}>
                  Ajuste os dados principais da empresa e o comportamento do portal a partir daqui.
                </p>
              </div>
              <button type="button" className="portal-ghost-button" onClick={closeCompanyModal}>
                <X size={15} />
                Fechar
              </button>
            </div>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSaveCompany}>
              {/* Body: sidebar + content */}
              <div className="flex min-h-0 flex-1 overflow-hidden">
                {/* Left sidebar */}
                <div className="flex w-[240px] shrink-0 flex-col gap-1 p-4" style={{ background: '#0c0a08', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#4a433c' }}>Seções</p>
                  {[
                    { key: 'basic', label: 'Dados básicos' },
                    { key: 'connection', label: 'Conexão' },
                    { key: 'filters', label: 'Filtros' },
                    { key: 'powerbi', label: 'Power BI' },
                    { key: 'rules', label: 'Regras' },
                  ].map(tab => (
                    <button
                      key={tab.key}
                      type="button"
                      className="rounded-xl px-4 py-2.5 text-sm font-medium w-full text-left transition"
                      style={
                        activeCompanyTab === tab.key
                          ? { background: 'rgba(227,173,90,0.1)', border: '1px solid rgba(227,173,90,0.2)', color: '#e3ad5a' }
                          : { color: '#6b6358', border: '1px solid transparent' }
                      }
                      onClick={() => setActiveCompanyTab(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Right content */}
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 space-y-5" style={{ background: '#0f0d0b' }}>

                  {/* TAB: basic */}
                  {activeCompanyTab === 'basic' && (
                    <div className="space-y-5">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#c9924a' }}>Dados básicos</p>
                      <div className="rounded-2xl p-5 space-y-4" style={{ background: '#181410', border: '1px solid rgba(255,255,255,0.06)' }}>
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
                              placeholder={form.id ? 'Preencha só se quiser trocar' : 'Senha de acesso'}
                              required={!form.id}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl p-5" style={{ background: '#181410', border: '1px solid rgba(255,255,255,0.06)' }}>
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
                    </div>
                  )}

                  {/* TAB: connection */}
                  {activeCompanyTab === 'connection' && (
                    <div className="space-y-5">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#c9924a' }}>Conexão</p>

                      <div className="rounded-2xl p-5" style={{ background: '#181410', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-semibold text-white">Portal interno (Supabase)</h4>
                            <p className="mt-1 text-sm text-[#b7b0a6]">
                              Defina se a empresa usa o portal interno. O dashboard externo pode ser configurado separadamente.
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

                        {form.supabaseEnabled ? (
                          <div className="mt-5 space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-2">
                                <label className="portal-label">Modelo de alimentação do dashboard</label>
                                <select
                                  className="portal-input"
                                  value={form.dashboardFeedingModel}
                                  onChange={event => setForm(previous => ({ ...previous, dashboardFeedingModel: event.target.value }))}
                                >
                                  {DASHBOARD_FEEDING_MODE_TYPES.map(model => (
                                    <option key={model.value} value={model.value}>
                                      {model.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="space-y-2">
                                <label className="portal-label">Identificação do banco</label>
                                <input
                                  className="portal-input"
                                  value={form.supabaseLabel}
                                  onChange={event => setForm(previous => ({ ...previous, supabaseLabel: event.target.value }))}
                                  placeholder="Ex.: sincronizado em Supabase produção"
                                />
                              </div>

                              <div className="space-y-2 md:col-span-2">
                                <label className="portal-label">Supabase URL</label>
                                <input
                                  className="portal-input"
                                  value={form.supabaseUrl}
                                  onChange={event => setForm(previous => ({ ...previous, supabaseUrl: event.target.value }))}
                                  placeholder="https://projeto.supabase.co"
                                />
                              </div>

                              <div className="space-y-2 md:col-span-2">
                                <label className="portal-label">Supabase Service Role Key</label>
                                <input
                                  className="portal-input"
                                  type="password"
                                  value={form.supabaseServiceRoleKey}
                                  onChange={event => setForm(previous => ({ ...previous, supabaseServiceRoleKey: event.target.value }))}
                                  placeholder={form.id ? 'Preencha só se quiser trocar a chave' : 'Cole a service_role_key do tenant'}
                                />
                              </div>
                            </div>

                            <div className="space-y-3">
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
                                Quando ligado, o portal filtra PPS e Análise de Dados por PEDID.EMPCODIGO.
                              </p>
                            </div>

                            <div className="space-y-2">
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
                          </div>
                        ) : null}

                        <div className="mt-5 space-y-2">
                          <label className="portal-label">Link do dashboard externo</label>
                          <input
                            className="portal-input"
                            value={form.externalDashboardUrl}
                            onChange={event => setForm(previous => ({ ...previous, externalDashboardUrl: event.target.value }))}
                            placeholder="https://dashboard-da-empresa.com.br"
                          />
                          <p className="text-xs text-[#8d867c]">
                            Opcional. Quando preenchido, o portal mostra o dashboard externo mesmo se o portal interno tambem estiver ativo.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB: filters */}
                  {activeCompanyTab === 'filters' && (
                    <div className="space-y-5">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#c9924a' }}>Filtros</p>

                      {!form.supabaseEnabled ? (
                        <div className="rounded-2xl px-5 py-4 text-sm text-[#b7b0a6]" style={{ background: '#181410', border: '1px solid rgba(255,255,255,0.06)' }}>
                          Esta seção está disponível apenas quando o portal interno (Supabase) está habilitado. Ative na aba Conexão.
                        </div>
                      ) : (
                        <>
                          {/* General filters */}
                          <div className="rounded-2xl p-5 space-y-4" style={{ background: '#181410', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div>
                              <h4 className="text-sm font-semibold text-white">Filtros gerais dos dashboards</h4>
                              <p className="mt-1 text-sm text-[#b7b0a6]">
                                Aplique filtros fixos para toda a empresa no PPS e na Análise de Dados.
                              </p>
                            </div>

                            {dashboardFilterOptionsLoading ? (
                              <p className="text-sm text-[#b7b0a6]">Carregando filtros disponíveis...</p>
                            ) : null}
                            {dashboardFilterOptionsError ? (
                              <p className="text-sm text-amber-200">{dashboardFilterOptionsError}</p>
                            ) : null}

                            {Object.entries(DASHBOARD_SECTION_GROUPS).map(([mode]) => {
                              const filters = form.dashboardFilters?.[mode] || []

                              return (
                                <div key={mode} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <h5 className="text-sm font-semibold text-white">
                                        {mode === 'pps' ? 'PPS' : 'Análise de Dados'}
                                      </h5>
                                      <p className="mt-1 text-xs text-[#8d867c]">
                                        {filters.length === 0 ? 'Sem filtro geral neste módulo.' : `${filters.length} filtro(s) aplicado(s).`}
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
                                          <div key={filter.id} className="rounded-xl p-3" style={{ background: '#110f0d', border: '1px solid rgba(255,255,255,0.05)' }}>
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
                                                        ? 'Sem opções disponíveis'
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
                                                  ? 'Valor definido por seleção'
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

                          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }} />

                          {/* Visual filters */}
                          <div className="rounded-2xl p-5 space-y-4" style={{ background: '#181410', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div>
                              <h4 className="text-sm font-semibold text-white">Filtros por visual</h4>
                              <p className="mt-1 text-sm text-[#b7b0a6]">
                                Aplique filtros fixos em gráficos ou tabelas específicas do PPS e da Análise de Dados.
                              </p>
                            </div>

                            {dashboardFilterOptionsLoading ? (
                              <p className="text-sm text-[#b7b0a6]">Carregando valores dos filtros padrão...</p>
                            ) : null}
                            {dashboardFilterOptionsError ? (
                              <p className="text-sm text-amber-200">{dashboardFilterOptionsError}</p>
                            ) : null}

                            {Object.entries(DASHBOARD_SECTION_GROUPS).map(([mode, sections]) => (
                              <div key={mode} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <h5 className="text-sm font-semibold text-white">
                                  {mode === 'pps' ? 'PPS' : 'Análise de Dados'}
                                </h5>

                                <div className="mt-4 space-y-3">
                                  {sections.map(section => {
                                    const filters = form.dashboardVisualFilters?.[mode]?.[section.key] || []

                                    return (
                                      <div key={section.key} className="rounded-xl p-3" style={{ background: '#110f0d', border: '1px solid rgba(255,255,255,0.05)' }}>
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
                                                <div key={filter.id} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
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
                                                      <option value="standard">Filtro padrão do site</option>
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
                                                              ? 'Sem opções disponíveis'
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
                        </>
                      )}
                    </div>
                  )}

                  {/* TAB: powerbi */}
                  {activeCompanyTab === 'powerbi' && (
                    <div className="space-y-5">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#c9924a' }}>Power BI</p>

                      <div className="rounded-2xl p-5" style={{ background: '#181410', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-semibold text-white">Power BI hospedado no portal</h4>
                            <p className="mt-1 text-sm text-[#b7b0a6]">
                              Cadastre um ou mais modelos de Power BI para esta empresa e controle os acessos por usuário.
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
                              <div className="rounded-xl px-4 py-4 text-sm" style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.07)', color: '#5c554e' }}>
                                Nenhum modelo cadastrado ainda. Adicione o primeiro para liberar o catálogo de Power BI.
                              </div>
                            ) : null}

                            {form.powerBiReports.map((report, index) => (
                              <div key={report.id} className="rounded-xl p-4" style={{ background: '#181410', border: '1px solid rgba(255,255,255,0.06)' }}>
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
                                      className="inline-flex h-9 items-center justify-center rounded-xl bg-red-500/10 px-3 text-xs font-medium text-red-200 transition hover:bg-red-500/15"
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
                                      placeholder="Opcional: email, usuário ou object id"
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
                    </div>
                  )}

                  {/* TAB: rules */}
                  {activeCompanyTab === 'rules' && (
                    <div className="space-y-5">
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#c9924a' }}>Regras</p>

                      <div className="rounded-2xl p-5 space-y-4" style={{ background: '#181410', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <label className="portal-label">Pedido concluído quando</label>
                            <p className="mt-1 text-xs text-[#8d867c]">
                              O pedido também será tratado como concluído quando bater qualquer condição abaixo.
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
                                <div key={rule.id} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
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
                          <div className="rounded-xl px-4 py-3 text-sm" style={{ border: '1px dashed rgba(255,255,255,0.07)', color: '#5c554e' }}>
                            Sem condição adicional. A data de saída continua concluindo o pedido normalmente.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* Footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex flex-wrap gap-2">
                  {form.id ? (
                    <>
                      <button type="button" className="portal-ghost-button" onClick={() => editingCompany && openUserModal(editingCompany)}>
                        <Users size={15} />
                        Gerenciar usuários
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
                    {form.id ? 'Salvar alterações' : 'Salvar empresa'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {portalPreviewCompany ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" style={{ background: 'rgba(0,0,0,0.8)' }}>
          <div
            className="flex max-h-[78vh] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl"
            style={{ background: '#141210', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 40px 120px rgba(0,0,0,0.7)' }}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 px-5 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: '#4a4238' }}>Entrar no portal</p>
                <h3 className="mt-2 truncate text-lg font-bold text-white">{portalPreviewCompany.name}</h3>
                <p className="mt-1 text-sm" style={{ color: '#5c554e' }}>
                  Escolha como deseja visualizar esta empresa.
                </p>
              </div>
              <button type="button" className="portal-ghost-button" onClick={closePortalPreviewModal}>
                <X size={14} />
                Fechar
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-4" style={{ background: '#110f0d' }}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 rounded-xl px-4 py-3 text-left transition"
                style={{ background: 'rgba(227,173,90,0.07)', border: '1px solid rgba(227,173,90,0.2)', color: '#e3ad5a' }}
                onClick={() => enterCompanyPortal(null)}
              >
                <div>
                  <p className="text-sm font-semibold text-white">Entrar como admin</p>
                  <p className="mt-0.5 text-xs" style={{ color: '#5c554e' }}>Visualiza a empresa sem restrições de usuário.</p>
                </div>
                <Eye size={16} />
              </button>

              {getCompanyUserList(companyUsers, portalPreviewCompany).length === 0 ? (
                <div className="rounded-xl px-4 py-3 text-sm" style={{ border: '1px dashed rgba(255,255,255,0.07)', color: '#4a4238' }}>
                  Nenhum usuário cadastrado para esta empresa.
                </div>
              ) : (
                getCompanyUserList(companyUsers, portalPreviewCompany).map(user => (
                  <button
                    key={user.uid}
                    type="button"
                    className="flex w-full items-center justify-between gap-4 rounded-xl px-4 py-3 text-left transition"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.05)' }}
                    onClick={() => enterCompanyPortal(user)}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-white">{user.name || user.email}</p>
                        {user.uid === portalPreviewCompany.authUid ? <span className="portal-pill">Principal</span> : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs" style={{ color: '#4a4238' }}>{user.email}</p>
                    </div>
                    <SquareArrowOutUpRight size={14} style={{ color: '#4a4238' }} />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isUserModalOpen && managingCompany ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" style={{ background: 'rgba(0,0,0,0.8)' }}>
          <div
            className="flex max-h-[92vh] w-full max-w-[1360px] flex-col overflow-hidden rounded-2xl"
            style={{ background: '#141210', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 40px 120px rgba(0,0,0,0.7)' }}
          >
            <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: '#4a4238' }}>Usuários da empresa</p>
                <h2 className="mt-2 text-xl font-bold text-white">{managingCompany.name}</h2>
                <p className="mt-1 text-sm" style={{ color: '#5c554e' }}>
                  Edite páginas liberadas, esconda visuais específicos e mantenha o acesso principal da empresa sob controle.
                </p>
              </div>
              <button type="button" className="portal-ghost-button" onClick={closeUserModal}>
                <X size={14} />
                Fechar
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="overflow-y-auto p-6" style={{ background: '#0f0d0b' }}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">Lista de usuários</h3>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button type="button" className="portal-ghost-button" onClick={openPasswordListModal}>
                      <FileDown size={14} />
                      Gerar lista
                    </button>
                    <button type="button" className="portal-primary-button" onClick={startCreateUser}>
                      <UserPlus size={16} />
                      Novo usuário
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {getCompanyUserList(companyUsers, managingCompany).map(user => (
                    <div key={user.uid} className="rounded-xl p-4" style={{ background: '#181410', border: '1px solid rgba(255,255,255,0.06)' }}>
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
                              className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 text-xs font-medium text-red-200 transition hover:border-red-400/35 hover:bg-red-500/15"
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

              <div className="flex min-h-0 flex-col" style={{ background: '#110f0d', borderLeft: '1px solid rgba(255,255,255,0.04)' }}>
                {!editingUserId ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-2xl"
                      style={{ background: 'rgba(227,173,90,0.07)', border: '1px solid rgba(227,173,90,0.12)' }}
                    >
                      <Pencil size={22} style={{ color: '#c9924a' }} />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-white">Selecione um usuário</h3>
                      <p className="mt-1.5 text-sm" style={{ color: '#5c554e' }}>
                        Clique em <strong className="text-white">Editar</strong> em qualquer usuário da lista para configurar acessos, filtros e permissões.
                      </p>
                    </div>
                  </div>
                ) : null}

                {editingUserId ? (
                <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSaveUser}>
                  {/* User header */}
                  <div className="shrink-0 px-6 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: '#4a4238' }}>Editando usuário</p>
                    <h3 className="mt-1 text-base font-semibold text-white truncate">{userForm.name || userForm.email || '—'}</h3>
                    <p className="mt-0.5 text-xs truncate" style={{ color: '#4a4238' }}>{userForm.email}</p>
                  </div>

                  {/* Tab nav */}
                  <div className="flex shrink-0 gap-1 px-5 pt-3 pb-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    {[
                      { key: 'data', label: 'Dados' },
                      { key: 'access', label: 'Acessos' },
                      { key: 'filters', label: 'Filtros' },
                      ...(hasConfiguredPowerBi(managingCompany) ? [{ key: 'powerbi', label: 'Power BI' }] : []),
                    ].map(tab => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveUserTab(tab.key)}
                        className="px-4 py-2 text-sm font-medium transition"
                        style={
                          activeUserTab === tab.key
                            ? { color: '#e3ad5a', borderBottom: '2px solid #e3ad5a', marginBottom: '-1px' }
                            : { color: '#6b6358', borderBottom: '2px solid transparent', marginBottom: '-1px' }
                        }
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Tab content */}
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">

                    {/* TAB: data */}
                    {activeUserTab === 'data' && (
                      <div className="space-y-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#c9924a' }}>Dados do usuário</p>
                        <div className="rounded-2xl p-5 space-y-4" style={{ background: '#181410', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div className="space-y-2">
                            <label className="portal-label">Nome</label>
                            <input className="portal-input" value={userForm.name} onChange={event => updateUserFormField('name', event.target.value)} required />
                          </div>
                          <div className="space-y-2">
                            <label className="portal-label">Email</label>
                            <input className="portal-input" type="email" value={userForm.email} onChange={event => updateUserFormField('email', event.target.value)} required />
                          </div>
                          <div className="space-y-2">
                            <label className="portal-label">Nova senha (opcional)</label>
                            <input
                              className="portal-input"
                              type="text"
                              value={userForm.password}
                              onChange={event => updateUserFormField('password', event.target.value)}
                              required={!editingUserId}
                              placeholder="Preencha só se quiser trocar a senha"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB: access */}
                    {activeUserTab === 'access' && (
                      <div className="space-y-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#c9924a' }}>Acessos e visibilidade</p>
                        <div className="rounded-2xl p-5" style={{ background: '#181410', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <h4 className="text-sm font-semibold text-white">Páginas liberadas</h4>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <label className="portal-checkbox">
                              <input type="checkbox" checked={userForm.permissions.pages[PORTAL_PAGE_KEYS.ANALYSIS]} onChange={() => toggleUserPagePermission(PORTAL_PAGE_KEYS.ANALYSIS)} disabled={!managingCompany.supabaseEnabled} />
                              <span>Análise de Dados</span>
                            </label>
                            <label className="portal-checkbox">
                              <input type="checkbox" checked={userForm.permissions.pages[PORTAL_PAGE_KEYS.PPS]} onChange={() => toggleUserPagePermission(PORTAL_PAGE_KEYS.PPS)} disabled={!managingCompany.supabaseEnabled} />
                              <span>PPS</span>
                            </label>
                            <label className="portal-checkbox">
                              <input type="checkbox" checked={userForm.permissions.pages[PORTAL_PAGE_KEYS.EXTERNAL_DASHBOARD]} onChange={() => toggleUserPagePermission(PORTAL_PAGE_KEYS.EXTERNAL_DASHBOARD)} disabled={!managingCompany.externalDashboardUrl} />
                              <span>Dashboard externo</span>
                            </label>
                            <label className="portal-checkbox">
                              <input type="checkbox" checked={userForm.permissions.pages[PORTAL_PAGE_KEYS.POWER_BI]} onChange={() => toggleUserPagePermission(PORTAL_PAGE_KEYS.POWER_BI)} disabled={!hasConfiguredPowerBi(managingCompany)} />
                              <span>Power BI</span>
                            </label>
                          </div>
                        </div>

                        {Object.entries(DASHBOARD_SECTION_GROUPS).map(([mode, sections]) => (
                          <div key={mode} className="rounded-2xl p-5" style={{ background: '#181410', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <h4 className="text-sm font-semibold text-white">
                              {mode === 'pps' ? 'Visuais do PPS' : 'Visuais da Análise de Dados'}
                            </h4>
                            <div className="mt-3 grid gap-2 md:grid-cols-2">
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
                          </div>
                        ))}
                      </div>
                    )}

                    {/* TAB: filters */}
                    {activeUserTab === 'filters' && (
                      <div className="space-y-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#c9924a' }}>Filtros do usuário</p>
                        {dashboardFilterOptionsLoading ? <p className="text-sm" style={{ color: '#5c554e' }}>Carregando filtros disponíveis...</p> : null}
                        {dashboardFilterOptionsError ? <p className="text-sm text-amber-200">{dashboardFilterOptionsError}</p> : null}

                        {Object.entries(DASHBOARD_SECTION_GROUPS).map(([mode]) => (
                          <div key={mode} className="rounded-2xl p-5 space-y-3" style={{ background: '#181410', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div className="flex items-center justify-between gap-3">
                              <h4 className="text-sm font-semibold text-white">{mode === 'pps' ? 'PPS' : 'Análise de Dados'}</h4>
                              <button type="button" className="portal-ghost-button" onClick={() => addUserDashboardFilter(mode)}>
                                <Plus size={14} />
                                Adicionar filtro
                              </button>
                            </div>
                            {(userForm.permissions.dashboardFilters?.[mode] || []).length === 0 ? (
                              <p className="text-sm" style={{ color: '#5c554e' }}>Nenhum filtro configurado para este módulo.</p>
                            ) : (
                              (userForm.permissions.dashboardFilters?.[mode] || []).map(filter => (
                                <div key={filter.id} className="rounded-xl p-3" style={{ background: '#110f0d', border: '1px solid rgba(255,255,255,0.05)' }}>
                                  <div className="mb-3 flex justify-end">
                                    <button type="button" className="inline-flex h-9 items-center rounded-xl bg-red-500/10 px-3 text-xs font-medium text-red-200 transition hover:bg-red-500/15" onClick={() => removeUserDashboardFilter(mode, filter.id)}>
                                      Remover
                                    </button>
                                  </div>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <select className="portal-input" value={filter.field || ''} onChange={event => updateUserDashboardFilterField(mode, filter.id, event.target.value)}>
                                      <option value="">Selecione o filtro</option>
                                      {getAvailableDashboardFields().map(field => (
                                        <option key={field.name} value={field.name}>{field.label}</option>
                                      ))}
                                    </select>
                                    {(() => {
                                      const filterDefinition = getDashboardFilterDefinition(filter.field)
                                      const fieldOptions = getDashboardFieldOptions(filter.field)
                                      if (filterDefinition?.inputType === 'select') {
                                        return (
                                          <select className="portal-input" value={filter.value} onChange={event => updateUserDashboardFilter(mode, filter.id, 'value', event.target.value)} disabled={!filter.field || fieldOptions.length === 0}>
                                            <option value="">{!filter.field ? 'Escolha o filtro primeiro' : fieldOptions.length === 0 ? 'Sem opções disponíveis' : 'Selecione um valor'}</option>
                                            {fieldOptions.map(option => (<option key={option.value} value={option.value}>{option.label}</option>))}
                                          </select>
                                        )
                                      }
                                      return (
                                        <input className="portal-input" value={filter.value} onChange={event => updateUserDashboardFilter(mode, filter.id, 'value', event.target.value)} placeholder="Valor ou lista separada por vírgula" disabled={!filter.field} />
                                      )
                                    })()}
                                    <select className="portal-input" value={filter.operator} onChange={event => updateUserDashboardFilter(mode, filter.id, 'operator', event.target.value)}>
                                      {POWER_BI_FILTER_OPERATORS.map(option => (<option key={option.value} value={option.value}>{option.label}</option>))}
                                    </select>
                                    <div className="portal-input flex items-center border-dashed text-sm" style={{ color: '#6b6358' }}>
                                      {getDashboardFilterDefinition(filter.field)?.inputType === 'select' ? 'Valor definido por seleção' : 'Valor digitado livremente'}
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* TAB: powerbi */}
                    {activeUserTab === 'powerbi' && hasConfiguredPowerBi(managingCompany) && (
                      <div className="space-y-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#c9924a' }}>Power BI</p>
                        {powerBiCatalogLoading ? <p className="text-sm" style={{ color: '#5c554e' }}>Carregando modelos do relatório...</p> : null}
                        {powerBiCatalogError ? <p className="text-sm text-red-300">{powerBiCatalogError}</p> : null}
                        {!powerBiCatalogLoading && !powerBiCatalogError && powerBiCatalog.length === 0 ? (
                          <p className="text-sm" style={{ color: '#5c554e' }}>Nenhum modelo encontrado para esta empresa.</p>
                        ) : null}
                        {powerBiCatalog.map(report => {
                          const reportPermission = userForm.permissions.powerBiReports?.[report.id] || { enabled: true, pages: [], filters: [] }
                          const allowAllPages = !reportPermission.pages || reportPermission.pages.length === 0
                          const schemaTables = getReportSchemaTables(report)
                          const hasSchemaTables = schemaTables.length > 0
                          return (
                            <div key={report.id} className="rounded-2xl p-5 space-y-4" style={{ background: '#181410', border: '1px solid rgba(255,255,255,0.06)' }}>
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-white">{report.label || report.reportName}</p>
                                  <p className="mt-0.5 text-xs uppercase tracking-[0.16em]" style={{ color: '#6b6358' }}>{report.reportName || 'Relatório Power BI'}</p>
                                </div>
                                <label className="portal-checkbox">
                                  <input type="checkbox" checked={reportPermission.enabled !== false} onChange={() => toggleUserPowerBiReport(report.id)} />
                                  <span>Mostrar modelo</span>
                                </label>
                              </div>

                              <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-semibold text-white">Páginas liberadas</p>
                                  <button type="button" className="portal-ghost-button" onClick={() => setUserForm(previous => ({ ...previous, permissions: { ...previous.permissions, powerBiReports: { ...previous.permissions.powerBiReports, [report.id]: { ...reportPermission, pages: [] } } } }))}>
                                    Todas
                                  </button>
                                </div>
                                <p className="mt-2 text-xs uppercase tracking-[0.18em]" style={{ color: '#6b6358' }}>
                                  {allowAllPages ? 'Todas as páginas estão liberadas.' : 'Páginas escolhidas manualmente.'}
                                </p>
                                <div className="mt-3 grid gap-2 md:grid-cols-2">
                                  {(report.pages || []).map(page => (
                                    <label key={page.name} className="portal-checkbox">
                                      <input
                                        type="checkbox"
                                        checked={allowAllPages ? true : reportPermission.pages.includes(page.name)}
                                        onChange={() => toggleUserPowerBiReportPage(report.id, page.name, (report.pages || []).map(item => item.name))}
                                      />
                                      <span>{page.displayName || page.name}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>

                              <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-semibold text-white">Filtros do usuário</p>
                                  <button type="button" className="portal-ghost-button" onClick={() => addUserPowerBiFilter(report.id)}>
                                    <Plus size={14} />
                                    Adicionar filtro
                                  </button>
                                </div>
                                <div className="mt-4 space-y-3">
                                  {(reportPermission.filters || []).length === 0 ? (
                                    <p className="text-sm" style={{ color: '#5c554e' }}>Nenhum filtro configurado para este modelo.</p>
                                  ) : (
                                    (reportPermission.filters || []).map(filter => (
                                      <div key={filter.id} className="rounded-xl p-3" style={{ background: '#110f0d', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div className="mb-3 flex justify-end">
                                          <button type="button" className="inline-flex h-9 items-center rounded-xl bg-red-500/10 px-3 text-xs font-medium text-red-200 transition hover:bg-red-500/15" onClick={() => removeUserPowerBiFilter(report.id, filter.id)}>
                                            Remover
                                          </button>
                                        </div>
                                        {!hasSchemaTables ? (
                                          <p className="mb-3 text-xs" style={{ color: '#6b6358' }}>
                                            Este modelo ainda não expôs a estrutura de tabelas e colunas. Você pode preencher manualmente por enquanto.
                                          </p>
                                        ) : null}
                                        <div className="grid gap-3 md:grid-cols-2">
                                          {hasSchemaTables ? (
                                            <select className="portal-input" value={filter.table} onChange={event => updateUserPowerBiFilterTable(report.id, filter.id, event.target.value, schemaTables)}>
                                              <option value="">Selecione a tabela</option>
                                              {schemaTables.map(table => (<option key={table.name} value={table.name}>{table.name}</option>))}
                                            </select>
                                          ) : (
                                            <input className="portal-input" value={filter.table} onChange={event => updateUserPowerBiFilter(report.id, filter.id, 'table', event.target.value)} placeholder="Tabela" />
                                          )}
                                          {hasSchemaTables ? (
                                            <select className="portal-input" value={filter.column} onChange={event => updateUserPowerBiFilter(report.id, filter.id, 'column', event.target.value)} disabled={!filter.table}>
                                              <option value="">{filter.table ? 'Selecione a coluna' : 'Escolha a tabela primeiro'}</option>
                                              {(schemaTables.find(table => table.name === filter.table)?.columns || []).map(column => (<option key={column.name} value={column.name}>{column.name}</option>))}
                                            </select>
                                          ) : (
                                            <input className="portal-input" value={filter.column} onChange={event => updateUserPowerBiFilter(report.id, filter.id, 'column', event.target.value)} placeholder="Coluna" />
                                          )}
                                          <select className="portal-input" value={filter.operator} onChange={event => updateUserPowerBiFilter(report.id, filter.id, 'operator', event.target.value)}>
                                            {POWER_BI_FILTER_OPERATORS.map(option => (<option key={option.value} value={option.value}>{option.label}</option>))}
                                          </select>
                                          <input className="portal-input" value={filter.value} onChange={event => updateUserPowerBiFilter(report.id, filter.id, 'value', event.target.value)} placeholder="Valor ou lista separada por vírgula" />
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                  </div>

                  {/* Footer */}
                  <div className="shrink-0 flex items-center justify-end gap-3 px-5 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <button type="button" className="portal-ghost-button" onClick={() => { setEditingUserId(''); setUserForm(buildEmptyUserForm(managingCompany)) }}>
                      Cancelar
                    </button>
                    <button type="submit" className="portal-primary-button">
                      <UserPlus size={15} />
                      Salvar usuário
                    </button>
                  </div>
                </form>
                ) : null}
              </div>
            </div>
          </div>
          {isCreateUserModalOpen ? (
            <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-8" style={{ background: 'rgba(0,0,0,0.82)' }}>
              <div
                className="flex max-h-[90vh] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl"
                style={{ background: '#141210', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 40px 120px rgba(0,0,0,0.7)' }}
              >
                <div className="flex items-start justify-between gap-4 px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div>
                    <h3 className="text-lg font-bold text-white">Novo usuário</h3>
                    <p className="mt-1 text-sm" style={{ color: '#5c554e' }}>
                      Crie o usuário e defina os acessos principais.
                    </p>
                  </div>
                  <button type="button" className="portal-ghost-button" onClick={closeCreateUserModal}>
                    <X size={14} />
                    Fechar
                  </button>
                </div>

                <form className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-5" onSubmit={handleSaveUser} style={{ background: '#110f0d' }}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="portal-label">Nome</label>
                      <input className="portal-input" value={userForm.name} onChange={event => updateUserFormField('name', event.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <label className="portal-label">Email</label>
                      <input className="portal-input" type="email" value={userForm.email} onChange={event => updateUserFormField('email', event.target.value)} required />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="portal-label">Senha</label>
                      <input className="portal-input" type="text" value={userForm.password} onChange={event => updateUserFormField('password', event.target.value)} required placeholder="Senha de acesso" />
                    </div>
                  </div>

                  <div className="rounded-2xl p-5" style={{ background: '#181410', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <h4 className="text-sm font-semibold text-white">Páginas liberadas</h4>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="portal-checkbox">
                        <input type="checkbox" checked={userForm.permissions.pages[PORTAL_PAGE_KEYS.ANALYSIS]} onChange={() => toggleUserPagePermission(PORTAL_PAGE_KEYS.ANALYSIS)} disabled={!managingCompany.supabaseEnabled} />
                        <span>Análise de Dados</span>
                      </label>
                      <label className="portal-checkbox">
                        <input type="checkbox" checked={userForm.permissions.pages[PORTAL_PAGE_KEYS.PPS]} onChange={() => toggleUserPagePermission(PORTAL_PAGE_KEYS.PPS)} disabled={!managingCompany.supabaseEnabled} />
                        <span>PPS</span>
                      </label>
                      <label className="portal-checkbox">
                        <input type="checkbox" checked={userForm.permissions.pages[PORTAL_PAGE_KEYS.EXTERNAL_DASHBOARD]} onChange={() => toggleUserPagePermission(PORTAL_PAGE_KEYS.EXTERNAL_DASHBOARD)} disabled={!managingCompany.externalDashboardUrl} />
                        <span>Dashboard externo</span>
                      </label>
                      <label className="portal-checkbox">
                        <input type="checkbox" checked={userForm.permissions.pages[PORTAL_PAGE_KEYS.POWER_BI]} onChange={() => toggleUserPagePermission(PORTAL_PAGE_KEYS.POWER_BI)} disabled={!hasConfiguredPowerBi(managingCompany)} />
                        <span>Power BI</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3">
                    <button type="button" className="portal-ghost-button" onClick={closeCreateUserModal}>Cancelar</button>
                    <button type="submit" className="portal-primary-button">
                      <UserPlus size={16} />
                      Criar usuário
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
          {isPasswordListModalOpen ? (
            <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-8" style={{ background: 'rgba(0,0,0,0.82)' }}>
              <div
                className="flex max-h-[88vh] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl"
                style={{ background: '#141210', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 40px 120px rgba(0,0,0,0.7)' }}
              >
                <div className="flex items-start justify-between gap-4 px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div>
                    <h3 className="text-lg font-bold text-white">Gerar lista de usuários</h3>
                    <p className="mt-1 text-sm" style={{ color: '#5c554e' }}>
                      Informe a nova senha de cada usuário. Ao concluir, o portal atualiza as senhas e baixa um TXT com nome, email e senha.
                    </p>
                  </div>
                  <button type="button" className="portal-ghost-button" onClick={closePasswordListModal} disabled={isGeneratingPasswordList}>
                    <X size={14} />
                    Fechar
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5" style={{ background: '#110f0d' }}>
                  <div className="space-y-3">
                    {getCompanyUserList(companyUsers, managingCompany).map(user => (
                      <div key={user.uid} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <p className="text-sm font-semibold text-white">{user.name || 'Sem nome'}</p>
                        <p className="mt-0.5 text-xs" style={{ color: '#4a4238' }}>{user.email}</p>
                        <div className="mt-3 space-y-1.5">
                          <label className="portal-label">Nova senha</label>
                          <input
                            className="portal-input"
                            type="text"
                            value={passwordBatchMap[user.uid] || ''}
                            onChange={event => updatePasswordBatchValue(user.uid, event.target.value)}
                            placeholder="Mínimo 6 caracteres"
                            disabled={isGeneratingPasswordList}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
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
