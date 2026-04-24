'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Building2,
  Database,
  LogOut,
  Plus,
  UserPlus,
  Users,
  ShieldCheck,
  SquareArrowOutUpRight,
  Trash2,
} from 'lucide-react'
import {
  ADMIN_CREDENTIALS,
  clearPortalSession,
  createCompanyUser,
  deleteCompany,
  ensurePremiumLabTenant,
  getCurrentPortalSession,
  slugifyCompanyName,
  upsertCompany,
} from '@/lib/portal-store'

const emptyForm = {
  name: '',
  slug: '',
  email: '',
  password: '',
  supabaseUrl: '',
  supabaseServiceRoleKey: '',
  supabaseLabel: '',
  tools: ['dashboard'],
  isPremiumLab: false,
}

const emptyUserForm = {
  name: '',
  email: '',
  password: '',
}

export default function AdminPage() {
  const router = useRouter()
  const [state, setState] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [userForms, setUserForms] = useState({})
  const [message, setMessage] = useState('')
  const [deletingCompanyId, setDeletingCompanyId] = useState('')

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

  const handleSaveCompany = async event => {
    event.preventDefault()
    if (!state) return

    try {
      const slug = slugifyCompanyName(form.slug || form.name)
      const nextState = await upsertCompany(state, {
        ...form,
        id: slug,
        slug,
        tools: form.tools.includes('dashboard') ? ['dashboard'] : [],
      })

      setState(nextState)
      setForm(emptyForm)
      setMessage('Empresa registrada com sucesso.')
      window.setTimeout(() => setMessage(''), 2500)
    } catch (error) {
      console.error(error)
      setMessage('Nao foi possivel registrar a empresa. Verifique se o email ja existe no Firebase Auth.')
      window.setTimeout(() => setMessage(''), 3500)
    }
  }

  const handleLogout = async () => {
    await clearPortalSession()
    router.push('/login')
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

  const handleCompanyUserFormChange = (companyId, field, value) => {
    setUserForms(previous => ({
      ...previous,
      [companyId]: {
        ...(previous[companyId] || emptyUserForm),
        [field]: value,
      },
    }))
  }

  const handleCreateCompanyUser = async (event, company) => {
    event.preventDefault()
    if (!state) return

    const formState = userForms[company.id] || emptyUserForm

    try {
      const nextState = await createCompanyUser(company, formState)
      setState(nextState)
      setUserForms(previous => ({
        ...previous,
        [company.id]: emptyUserForm,
      }))
      setMessage(`Usuario adicionado em ${company.name}.`)
      window.setTimeout(() => setMessage(''), 2500)
    } catch (error) {
      console.error(error)
      setMessage('Nao foi possivel criar o usuario da empresa.')
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
            <h1 className="mt-2 text-3xl font-semibold">Controle de empresas e ferramentas</h1>
            <p className="mt-2 text-sm text-[#b7b0a6]">
              Logado como {ADMIN_CREDENTIALS.email}. Cadastre tenants, vincule os bancos sincronizados e abra o portal
              de cada empresa.
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
              <p className="text-sm text-[#cfc7bc]">Ferramentas liberadas</p>
              <h2 className="mt-1 text-3xl font-semibold">
                {state.companies.filter(company => company.tools.includes('dashboard')).length}
              </h2>
            </div>
          </div>
          <div className="portal-summary-card">
            <ShieldCheck size={20} className="text-[#e3ad5a]" />
            <div>
              <p className="text-sm text-[#cfc7bc]">Tenant Premium</p>
              <h2 className="mt-1 text-3xl font-semibold">
                {state.companies.find(company => company.isPremiumLab)?.name || 'Nao definido'}
              </h2>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[30px] border border-white/8 bg-[#1a171b] p-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e3ad5a]/15 text-[#e3ad5a]">
                <Plus size={18} />
              </div>
              <div>
                <h2 className="text-2xl font-semibold">Registrar empresa</h2>
                <p className="text-sm text-[#b7b0a6]">
                  Cadastre login, tenant e identificacao do banco no Supabase. Com a service role configurada, o
                  dashboard ja pode operar no tenant da empresa.
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
                  <label className="portal-label">Email de login</label>
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
                  <label className="portal-label">Senha</label>
                  <input
                    className="portal-input"
                    type="text"
                    value={form.password}
                    onChange={event => setForm(previous => ({ ...previous, password: event.target.value }))}
                    placeholder="Senha de acesso"
                    required
                  />
                </div>

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
                    placeholder="Cole a service_role_key do tenant"
                  />
                  <p className="text-xs text-[#9f9a90]">
                    Essa chave vai para o backend seguro do portal e nao fica exposta nas telas das empresas.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="portal-checkbox">
                  <input
                    type="checkbox"
                    checked={form.tools.includes('dashboard')}
                    onChange={event =>
                      setForm(previous => ({
                        ...previous,
                        tools: event.target.checked ? ['dashboard'] : [],
                      }))
                    }
                  />
                  <span>Liberar ferramenta Dashboard</span>
                </label>

                {!hasPremiumLab ? (
                  <label className="portal-checkbox">
                    <input
                      type="checkbox"
                      checked={form.isPremiumLab}
                      onChange={event => setForm(previous => ({ ...previous, isPremiumLab: event.target.checked }))}
                    />
                    <span>Marcar este primeiro cadastro como Premium Lab</span>
                  </label>
                ) : (
                  <div className="rounded-2xl border border-[#e3ad5a]/18 bg-[#e3ad5a]/8 px-4 py-3 text-sm text-[#e6d5b7]">
                    Premium Lab ja esta definida como tenant do dashboard operacional.
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button type="submit" className="portal-primary-button">
                  <Plus size={16} />
                  Salvar empresa
                </button>
                {message ? <span className="text-sm text-[#9ed3a9]">{message}</span> : null}
              </div>
            </form>
          </section>

          <section className="rounded-[30px] border border-white/8 bg-[#1a171b] p-6">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold">Empresas registradas</h2>
              <p className="mt-2 text-sm text-[#b7b0a6]">
                Abra o portal da empresa, confira as credenciais configuradas e valide qual tenant usa o dashboard
                atual.
              </p>
            </div>

            <div className="space-y-4">
              {state.companies.map(company => (
                <article key={company.id} className="rounded-[26px] border border-white/8 bg-[#121015] p-5">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-semibold">{company.name}</h3>
                        {company.isPremiumLab ? <span className="portal-pill">Premium Lab</span> : null}
                        {company.tools.includes('dashboard') ? <span className="portal-pill">Dashboard</span> : null}
                      </div>
                      <p className="mt-2 text-sm text-[#b7b0a6]">
                        {company.email} • {company.slug}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Link href={`/empresa/${company.slug}`} className="portal-ghost-button">
                        Abrir portal
                        <ArrowRight size={15} />
                      </Link>
                      <Link href={`/empresa/${company.slug}/dashboard`} className="portal-ghost-button">
                        Dashboard
                        <SquareArrowOutUpRight size={15} />
                      </Link>
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
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#9f9a90]">Banco</p>
                      <p className="mt-2 text-sm text-white">{company.supabaseLabel || 'Aguardando configuracao'}</p>
                    </div>
                    <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#9f9a90]">Supabase URL</p>
                      <p className="mt-2 break-all text-sm text-white/85">{company.supabaseUrl || 'Nao informado'}</p>
                    </div>
                    <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#9f9a90]">Ferramentas</p>
                      <p className="mt-2 text-sm text-white">{company.tools.join(', ') || 'Nenhuma ferramenta liberada'}</p>
                    </div>
                    <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#9f9a90]">Credencial Supabase</p>
                      <p className="mt-2 text-sm text-white">{company.hasServiceRoleKey ? 'Configurada' : 'Nao configurada'}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                    <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <Users size={16} className="text-[#e3ad5a]" />
                        <p className="text-sm font-semibold text-white">Usuarios da empresa</p>
                      </div>
                      <div className="space-y-3">
                        {(companyUsers[company.id] || [])
                          .sort((a, b) => {
                            if (a.uid === company.authUid) return -1
                            if (b.uid === company.authUid) return 1
                            return a.email.localeCompare(b.email)
                          })
                          .map(user => (
                            <div key={user.uid} className="rounded-2xl border border-white/6 bg-[#15131a] px-4 py-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-white">{user.name || user.email}</span>
                                {user.uid === company.authUid ? <span className="portal-pill">Principal</span> : null}
                              </div>
                              <p className="mt-1 text-sm text-[#b7b0a6]">{user.email}</p>
                            </div>
                          ))}
                        {(companyUsers[company.id] || []).length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-[#15131a] px-4 py-3 text-sm text-[#b7b0a6]">
                            Nenhum usuario extra cadastrado.
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <form
                      onSubmit={event => handleCreateCompanyUser(event, company)}
                      className="rounded-2xl border border-white/6 bg-white/[0.03] p-4"
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <UserPlus size={16} className="text-[#e3ad5a]" />
                        <p className="text-sm font-semibold text-white">Adicionar usuario</p>
                      </div>
                      <div className="grid gap-3">
                        <input
                          className="portal-input"
                          placeholder="Nome do usuario"
                          value={(userForms[company.id] || emptyUserForm).name}
                          onChange={event => handleCompanyUserFormChange(company.id, 'name', event.target.value)}
                          required
                        />
                        <input
                          className="portal-input"
                          type="email"
                          placeholder="usuario@empresa.com"
                          value={(userForms[company.id] || emptyUserForm).email}
                          onChange={event => handleCompanyUserFormChange(company.id, 'email', event.target.value)}
                          required
                        />
                        <input
                          className="portal-input"
                          type="text"
                          placeholder="Senha de acesso"
                          value={(userForms[company.id] || emptyUserForm).password}
                          onChange={event => handleCompanyUserFormChange(company.id, 'password', event.target.value)}
                          required
                        />
                        <button type="submit" className="portal-primary-button justify-center">
                          <UserPlus size={16} />
                          Salvar usuario
                        </button>
                      </div>
                    </form>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
