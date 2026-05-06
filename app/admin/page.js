'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Building2,
  ChevronDown,
  Database,
  LogOut,
  Pencil,
  Plus,
  Settings2,
  ShieldCheck,
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

export default function AdminPage() {
  const router = useRouter()
  const [state, setState] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [message, setMessage] = useState('')
  const [deletingCompanyId, setDeletingCompanyId] = useState('')
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
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
        setSelectedCompanyId(previous => previous || seededState.companies[0]?.id || '')
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

  const selectedCompany = useMemo(
    () => (state?.companies || []).find(company => company.id === selectedCompanyId) || null,
    [selectedCompanyId, state?.companies]
  )

  const managingCompany = useMemo(
    () => (state?.companies || []).find(company => company.id === managingCompanyId) || null,
    [managingCompanyId, state?.companies]
  )

  const handleLogout = async () => {
    await clearPortalSession()
    router.push('/login')
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
      setSelectedCompanyId(form.id || slug)
      setForm(emptyForm)
      setMessage(form.id ? 'Empresa atualizada com sucesso.' : 'Empresa registrada com sucesso.')
      window.setTimeout(() => setMessage(''), 2500)
    } catch (error) {
      console.error(error)
      setMessage(error.message || 'Nao foi possivel salvar a empresa.')
      window.setTimeout(() => setMessage(''), 3500)
    }
  }

  const handleEditCompany = company => {
    setSelectedCompanyId(company.id)
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
  }

  const handleDeleteCompany = async company => {
    if (!state || company.isPremiumLab) return

    const confirmed = window.confirm(`Excluir a empresa ${company.name}? Essa acao remove o tenant do portal.`)
    if (!confirmed) return

    try {
      setDeletingCompanyId(company.id)
      const nextState = await deleteCompany(state, company.id)
      setState(nextState)
      if (selectedCompanyId === company.id) setSelectedCompanyId(nextState.companies[0]?.id || '')
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
    <main className="min-h-screen bg-[#131114] px-6 py-6 text-white">
      <div className="mx-auto max-w-[1480px]">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-white/8 bg-[#1a171b] px-6 py-5">
          <div>
            <p className="text-sm uppercase tracking-[0.22em] text-[#bca27a]">Administracao GS</p>
            <h1 className="mt-2 text-3xl font-semibold">Controle de empresas e acessos</h1>
            <p className="mt-2 text-sm text-[#b7b0a6]">
              Logado como {ADMIN_CREDENTIALS.email}. Cadastre empresas, escolha entre portal com Supabase ou dashboard externo e controle o que cada usuario pode ver.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/" className="portal-ghost-button">
              Voltar para a home
            </Link>
            <button onClick={handleLogout} className="portal-ghost-button">
              <LogOut size={16} />
              Sair
            </button>
          </div>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="portal-summary-card">
            <Building2 size={20} className="text-[#e3ad5a]" />
            <div>
              <p className="text-sm text-[#cfc7bc]">Empresas cadastradas</p>
              <h2 className="mt-1 text-3xl font-semibold">{state.companies.length}</h2>
            </div>
          </div>
          <div className="portal-summary-card">
            <Database size={20} className="text-[#e3ad5a]" />
            <div>
              <p className="text-sm text-[#cfc7bc]">Portais com Supabase</p>
              <h2 className="mt-1 text-3xl font-semibold">{state.companies.filter(company => company.supabaseEnabled).length}</h2>
            </div>
          </div>
          <div className="portal-summary-card">
            <ShieldCheck size={20} className="text-[#e3ad5a]" />
            <div>
              <p className="text-sm text-[#cfc7bc]">Tenant Premium</p>
              <h2 className="mt-1 text-3xl font-semibold">{state.companies.find(company => company.isPremiumLab)?.name || 'Nao definido'}</h2>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[30px] border border-white/8 bg-[#1a171b] p-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e3ad5a]/15 text-[#e3ad5a]">
                <Plus size={18} />
              </div>
              <div>
                <h2 className="text-2xl font-semibold">{form.id ? 'Editar empresa' : 'Registrar empresa'}</h2>
                <p className="text-sm text-[#b7b0a6]">
                  Configure o portal interno com Supabase ou registre um dashboard externo quando a empresa usar um site separado.
                </p>
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleSaveCompany}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
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

                <div className="space-y-2">
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

              <div className="rounded-[24px] border border-white/8 bg-[#151217] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">Tipo de portal</h3>
                    <p className="text-sm text-[#b7b0a6]">
                      Com Supabase habilitado, a empresa usa PPS e Analise de Dados internos. Sem Supabase, o portal mostra apenas um botao de dashboard externo.
                    </p>
                  </div>
                  <label className="portal-checkbox">
                    <input
                      type="checkbox"
                      checked={form.supabaseEnabled}
                      onChange={event => setForm(previous => ({ ...previous, supabaseEnabled: event.target.checked }))}
                    />
                    <span>Habilitar Supabase</span>
                  </label>
                </div>

                {form.supabaseEnabled ? (
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
                ) : (
                  <div className="space-y-2">
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

              <div className="grid gap-4 md:grid-cols-2">
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
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button type="submit" className="portal-primary-button">
                  <Plus size={16} />
                  {form.id ? 'Salvar alteracoes' : 'Salvar empresa'}
                </button>
                {form.id ? (
                  <button type="button" className="portal-ghost-button" onClick={() => setForm(emptyForm)}>
                    Limpar edicao
                  </button>
                ) : null}
                {message ? <span className="text-sm text-[#9ed3a9]">{message}</span> : null}
              </div>
            </form>
          </section>

          <section className="rounded-[30px] border border-white/8 bg-[#1a171b] p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold">Empresas registradas</h2>
              <p className="mt-2 text-sm text-[#b7b0a6]">
                A lista fica recolhida por padrao. Abra uma empresa para ver os detalhes, configurar usuarios e editar o comportamento do portal.
              </p>
            </div>

            <div className="space-y-3">
              {state.companies.map(company => {
                const isOpen = selectedCompanyId === company.id
                const users = getCompanyUserList(companyUsers, company)
                return (
                  <article key={company.id} className="overflow-hidden rounded-[24px] border border-white/8 bg-[#121015]">
                    <button
                      type="button"
                      onClick={() => setSelectedCompanyId(previous => (previous === company.id ? '' : company.id))}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-white/[0.02]"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold">{company.name}</h3>
                          {company.isPremiumLab ? <span className="portal-pill">Premium Lab</span> : null}
                          <span className="portal-pill">{company.supabaseEnabled ? 'Portal interno' : 'Dashboard externo'}</span>
                        </div>
                        <p className="mt-1 text-sm text-[#b7b0a6]">{company.email} • {company.slug}</p>
                      </div>
                      <ChevronDown size={18} className={`transition ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isOpen ? (
                      <div className="border-t border-white/6 px-5 py-5">
                        <div className="mb-4 flex flex-wrap gap-2">
                          <button type="button" onClick={() => handleEditCompany(company)} className="portal-ghost-button">
                            <Pencil size={15} />
                            Editar empresa
                          </button>
                          <button type="button" onClick={() => openUserModal(company)} className="portal-primary-button">
                            <Users size={16} />
                            Gerenciar usuarios
                          </button>
                          <Link href={`/empresa/${company.slug}`} className="portal-ghost-button">
                            Abrir portal
                            <ArrowRight size={15} />
                          </Link>
                          {company.supabaseEnabled ? (
                            <>
                              <Link href={`/empresa/${company.slug}/dashboard`} className="portal-ghost-button">
                                Analise de Dados
                                <SquareArrowOutUpRight size={15} />
                              </Link>
                              <Link href={`/empresa/${company.slug}/pps`} className="portal-ghost-button">
                                PPS
                                <SquareArrowOutUpRight size={15} />
                              </Link>
                            </>
                          ) : company.externalDashboardUrl ? (
                            <a href={company.externalDashboardUrl} target="_blank" rel="noreferrer" className="portal-ghost-button">
                              Dashboard externo
                              <SquareArrowOutUpRight size={15} />
                            </a>
                          ) : null}
                          {!company.isPremiumLab ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteCompany(company)}
                              disabled={deletingCompanyId === company.id}
                              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 text-sm font-medium text-red-200 transition hover:border-red-400/35 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Trash2 size={15} />
                              {deletingCompanyId === company.id ? 'Excluindo...' : 'Excluir'}
                            </button>
                          ) : null}
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
                            <p className="text-xs uppercase tracking-[0.18em] text-[#9f9a90]">Modo</p>
                            <p className="mt-2 text-sm text-white">{company.supabaseEnabled ? 'Supabase habilitado' : 'Dashboard externo'}</p>
                          </div>
                          <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
                            <p className="text-xs uppercase tracking-[0.18em] text-[#9f9a90]">Banco</p>
                            <p className="mt-2 text-sm text-white">{company.supabaseLabel || 'Nao informado'}</p>
                          </div>
                          <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
                            <p className="text-xs uppercase tracking-[0.18em] text-[#9f9a90]">Acesso principal</p>
                            <p className="mt-2 text-sm text-white">{formatToolsLabel(company)}</p>
                          </div>
                          <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
                            <p className="text-xs uppercase tracking-[0.18em] text-[#9f9a90]">Usuarios</p>
                            <p className="mt-2 text-sm text-white">{users.length} usuario(s)</p>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
                          <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
                            <div className="mb-3 flex items-center gap-2">
                              <Users size={16} className="text-[#e3ad5a]" />
                              <p className="text-sm font-semibold text-white">Usuarios cadastrados</p>
                            </div>
                            <div className="space-y-3">
                              {users.map(user => (
                                <div key={user.uid} className="rounded-2xl border border-white/6 bg-[#15131a] px-4 py-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-white">{user.name || user.email}</span>
                                    {user.uid === company.authUid ? <span className="portal-pill">Principal</span> : null}
                                  </div>
                                  <p className="mt-1 text-sm text-[#b7b0a6]">{user.email}</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
                            <div className="mb-3 flex items-center gap-2">
                              <Settings2 size={16} className="text-[#e3ad5a]" />
                              <p className="text-sm font-semibold text-white">Comportamento do portal</p>
                            </div>
                            <div className="space-y-3 text-sm text-[#c8c2b8]">
                              <p>
                                <span className="font-medium text-white">Supabase:</span> {company.supabaseEnabled ? 'habilitado' : 'desabilitado'}
                              </p>
                              <p>
                                <span className="font-medium text-white">URL do Supabase:</span> {company.supabaseUrl || 'Nao informado'}
                              </p>
                              <p>
                                <span className="font-medium text-white">Service role:</span> {company.hasServiceRoleKey ? 'configurada' : 'nao configurada'}
                              </p>
                              <p>
                                <span className="font-medium text-white">Link externo:</span> {company.externalDashboardUrl || 'Nao configurado'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </article>
                )
              })}
            </div>
          </section>
        </div>
      </div>

      {isUserModalOpen && managingCompany ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
          <div className="flex max-h-[92vh] w-full max-w-[1320px] flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#171418] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/8 px-6 py-5">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-[#bca27a]">Usuarios da empresa</p>
                <h2 className="mt-2 text-2xl font-semibold">{managingCompany.name}</h2>
              </div>
              <button type="button" className="portal-ghost-button" onClick={closeUserModal}>
                <X size={16} />
                Fechar
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="overflow-y-auto border-r border-white/8 p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">Lista de usuarios</h3>
                  <button type="button" className="portal-primary-button" onClick={startCreateUser}>
                    <UserPlus size={16} />
                    Novo usuario
                  </button>
                </div>

                <div className="space-y-3">
                  {getCompanyUserList(companyUsers, managingCompany).map(user => (
                    <div key={user.uid} className="rounded-[22px] border border-white/8 bg-[#121015] p-4">
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
                      <input className="portal-input" value={userForm.name} onChange={event => updateUserFormField('name', event.target.value)} required />
                    </div>
                    <div className="space-y-2">
                      <label className="portal-label">Email</label>
                      <input className="portal-input" type="email" value={userForm.email} onChange={event => updateUserFormField('email', event.target.value)} required />
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
                        <h4 className="text-sm font-semibold text-white">{mode === 'pps' ? 'Visuais do PPS' : 'Visuais da Analise de Dados'}</h4>
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
