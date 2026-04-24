'use client'
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Building2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { authenticatePortalUser, getCurrentPortalSession, loadPortalState } from '@/lib/portal-store'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [state, setState] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function hydrate() {
      try {
        const [portalState, session] = await Promise.all([loadPortalState(), getCurrentPortalSession()])
        if (!active) return
        setState(portalState)

        if (session?.type === 'admin') router.replace('/admin')
        if (session?.type === 'company' && session.companySlug) router.replace(`/empresa/${session.companySlug}`)
      } catch (error) {
        if (!active) return
        console.error(error)
      }
    }

    hydrate()

    return () => {
      active = false
    }
  }, [router])

  const premiumCompany = useMemo(
    () => (state?.companies || []).find(company => company.isPremiumLab),
    [state]
  )

  const handleSubmit = async event => {
    event.preventDefault()
    setError('')

    try {
      const session = await authenticatePortalUser(email, password)

      if (session.type === 'admin') {
        router.push('/admin')
        return
      }

      router.push(`/empresa/${session.companySlug}`)
    } catch (error) {
      console.error(error)
      setError('Email ou senha invalidos.')
    }
  }

  return (
    <main className="min-h-screen bg-[#171416] px-6 py-8 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1280px] items-center gap-10 lg:grid lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden h-full flex-col justify-between rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,#221c19,#171416)] p-10 shadow-[0_30px_90px_rgba(0,0,0,0.35)] lg:flex">
          <div>
            <Link href="/" className="inline-flex items-center gap-3 text-sm text-[#d8d2c8] transition hover:text-white">
              <ArrowLeft size={16} />
              Voltar para a home
            </Link>

            <div className="mt-10 flex items-center gap-4">
              <Image src="/gs-logo.png" alt="GS Consultoria & Gestao" width={220} height={124} className="h-16 w-auto" />
            </div>

            <div className="mt-16 max-w-[520px]">
              <p className="mb-4 text-sm uppercase tracking-[0.24em] text-[#b8aa98]">Portal multi-tenant</p>
              <h1 className="text-5xl font-semibold leading-tight text-[#f7f5f2]">
                Um unico acesso para operacao das empresas que a consultoria acompanha.
              </h1>
              <p className="mt-6 text-lg leading-8 text-[#c4bdb2]">
                Empresas entram com email e senha. A administracao da GS controla cadastros, ferramentas liberadas e
                qual tenant usa o dashboard operacional da Premium Lab.
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="portal-stat-card">
              <ShieldCheck size={20} className="text-[#e3ad5a]" />
              <div>
                <h2 className="text-sm font-semibold text-white">Acesso administrativo</h2>
                <p className="mt-1 text-sm text-[#bdb7ae]">
                  Gestao de empresas, bancos sincronizados e atalhos para cada tenant.
                </p>
              </div>
            </div>
            <div className="portal-stat-card">
              <Building2 size={20} className="text-[#e3ad5a]" />
              <div>
                <h2 className="text-sm font-semibold text-white">Tenant inicial pronto</h2>
                <p className="mt-1 text-sm text-[#bdb7ae]">
                  {premiumCompany
                    ? 'Premium Lab ja cadastrada com o dashboard operacional ativo.'
                    : 'O primeiro tenant pode ser marcado como Premium Lab.'}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[520px]">
          <div className="rounded-[32px] border border-white/8 bg-[#0f1014] p-8 shadow-[0_30px_90px_rgba(0,0,0,0.35)] md:p-10">
            <div className="mb-8 flex items-center gap-4 lg:hidden">
              <Image src="/gs-logo.png" alt="GS Consultoria & Gestao" width={180} height={100} className="h-14 w-auto" />
            </div>

            <div className="mb-8">
              <p className="text-sm uppercase tracking-[0.24em] text-[#b8aa98]">Login</p>
              <h2 className="mt-3 text-4xl font-semibold text-[#f7f5f2]">Entrar no portal</h2>
              <p className="mt-3 text-base leading-7 text-[#bdb7ae]">
                Use o acesso da empresa ou o login administrativo da GS para entrar nas telas de gestao.
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#d9d3ca]">Email</label>
                <input
                  type="email"
                  className="portal-input"
                  placeholder="voce@empresa.com.br"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-[#d9d3ca]">Senha</label>
                <input
                  type="password"
                  className="portal-input"
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  required
                />
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
              ) : null}

              <button type="submit" className="portal-primary-button w-full justify-center">
                <LockKeyhole size={16} />
                Entrar
              </button>
            </form>

            <div className="mt-8 rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
              <p className="text-sm font-semibold text-white">Primeiro tenant configurado</p>
              <p className="mt-2 text-sm leading-6 text-[#bdb7ae]">
                Premium Lab ja entra no portal com o dashboard operacional ativo. A administracao pode cadastrar novas
                empresas e preparar os proximos bancos sincronizados.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
