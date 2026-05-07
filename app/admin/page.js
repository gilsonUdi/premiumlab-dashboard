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
  slugifyCompanyName,
  updateCompanyUser,
  upsertCompany,
} from '@/lib/portal-store'
import { DASHBOARD_SECTION_GROUPS, normalizeUserPermissions, PORTAL_PAGE_KEYS } from '@/lib/portal-config'

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

function formatToolsLabel(company) {
  if (!company.supabaseEnabled) return 'Dashboard externo'
  return 'PPS e Analise de Dados'
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
  return company.supabaseEnabled ? 'Portal interno' : 'Dashboard externo'
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
      [company.name, company.slug, company.email, company.supabaseLabel, company.externalDashboardUrl]
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
      const nextState = await upsertCompany(state, {
        ...form,
        id: form.id || slug,
        slug,
        tools: ['dashboard'],
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
      <main className="flex min-h-screen items-center justify-center bg-[#171416] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-5 text-sm text-[#d8d2c8]">
          Carregando administracao...
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#131114] text-white">
      <div className="grid min-h-screen xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="flex flex-col border-r border-white/8 bg-[#171418]">
          <div className="border-b border-white/8 px-7 py-8">
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
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] text-sm font-medium text-[#d6cfc3] transition hover:bg-white/[0.06]"
            >
              <LogOut size={16} />
              Sair
            </button>
          </div>
        </aside>

        <section className="px-4 py-5 sm:px-6 lg:px-8">
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
              <div className="mb-4 rounded-2xl border border-[#9ed3a9]/20 bg-[#9ed3a9]/10 px-4 py-3 text-sm text-[#c8f0d0]">
                {message}
              </div>
            ) : null}

            <section className="rounded-[28px] border border-white/8 bg-[#171418]">
              <div className="border-b border-white/8 px-5 py-5 sm:px-6">
                <div className="relative w-full max-w-lg">
                  <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#81796f]" />
                  <input
                    className="h-12 w-full rounded-2xl border border-white/8 bg-[#121015] pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-[#7e776f] focus:border-[#e3ad5a]/35"
                    value={searchTerm}
                    onChange={event => setSearchTerm(event.target.value)}
                    placeholder="Buscar empresa..."
                  />
                </div>
              </div>

              <div className="hidden border-b border-white/8 px-6 py-4 text-[11px] uppercase tracking-[0.2em] text-[#8d867c] lg:grid lg:grid-cols-[2fr_1.2fr_1fr_1fr_140px]">
                <span>Empresa</span>
                <span>Slug</span>
                <span>Status</span>
                <span>Criada em</span>
                <span className="text-right">Acoes</span>
              </div>

              <div className="divide-y divide-white/6">
                {filteredCompanies.length === 0 ? (
                  <div className="px-6 py-16 text-center text-sm text-[#b7b0a6]">
                    Nenhuma empresa encontrada para esse termo.
                  </div>
                ) : null}

                {filteredCompanies.map(company => (
                  <div key={company.id} className="px-5 py-5 sm:px-6">
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
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 text-sm font-medium text-red-200 transition hover:border-red-400/35 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
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
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-8">
          <div className="w-full max-w-[880px] rounded-[28px] border border-white/10 bg-[#171418] shadow-[0_28px_120px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between border-b border-white/8 px-6 py-5">
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

            <form className="space-y-5 px-6 py-6" onSubmit={handleSaveCompany}>
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

              <div className="rounded-[24px] border border-white/8 bg-[#121015] p-4">
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
                <div className="rounded-2xl border border-[#e3ad5a]/18 bg-[#e3ad5a]/8 px-4 py-3 text-sm text-[#e6d5b7]">
                  Premium Lab ja esta definida como tenant principal.
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-5">
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
          <div className="flex max-h-[92vh] w-full max-w-[1360px] flex-col overflow-hidden rounded-[32px] border border-white/10 bg-[#171418] shadow-[0_32px_120px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between border-b border-white/8 px-6 py-5">
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
              <div className="overflow-y-auto border-r border-white/8 bg-[#121015] p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">Lista de usuarios</h3>
                  <button type="button" className="portal-primary-button" onClick={startCreateUser}>
                    <UserPlus size={16} />
                    Novo usuario
                  </button>
                </div>

                <div className="space-y-3">
                  {getCompanyUserList(companyUsers, managingCompany).map(user => (
                    <div key={user.uid} className="rounded-[22px] border border-white/8 bg-[#171418] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
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

                  <div className="rounded-[24px] border border-white/8 bg-[#121015] p-4">
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
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    {Object.entries(DASHBOARD_SECTION_GROUPS).map(([mode, sections]) => (
                      <div key={mode} className="rounded-[24px] border border-white/8 bg-[#121015] p-4">
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
