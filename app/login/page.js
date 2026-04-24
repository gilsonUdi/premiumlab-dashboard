'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { LockKeyhole } from 'lucide-react'
import { authenticatePortalUser, getCurrentPortalSession } from '@/lib/portal-store'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function hydrate() {
      try {
        const session = await getCurrentPortalSession()
        if (!active) return

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
    <main className="flex min-h-screen items-center justify-center bg-[#171416] px-6 py-8 text-white">
      <div className="w-full max-w-[520px]">
        <section className="mx-auto w-full">
          <div className="rounded-[32px] border border-white/8 bg-[#0f1014] p-8 shadow-[0_30px_90px_rgba(0,0,0,0.35)] md:p-10">
            <div className="mb-8 flex items-center justify-center">
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
          </div>
        </section>
      </div>
    </main>
  )
}
