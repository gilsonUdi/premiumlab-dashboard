'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { ArrowRight, LockKeyhole } from 'lucide-react'
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
      setError('Email ou senha inválidos.')
    }
  }

  return (
    <main className="portal-page relative flex min-h-screen overflow-hidden">

      {/* Ambient bottom glow */}
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2"
        style={{
          width: '900px',
          height: '400px',
          background: 'radial-gradient(ellipse, var(--portal-gold-soft) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      {/* Subtle grid texture */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(var(--portal-grid) 1px, transparent 1px), linear-gradient(90deg, var(--portal-grid) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex w-full flex-col items-center justify-center px-5 py-14">

        {/* Logo */}
        <div className="mb-10">
          <Image
            src="/gs-logo.png"
            alt="GS Consultoria & Gestao"
            width={160}
            height={90}
            className="h-10 w-auto"
            style={{ opacity: 'var(--portal-logo-opacity)' }}
          />
        </div>

        {/* Login card */}
        <div
          className="portal-panel w-full max-w-[400px] rounded-lg p-7"
          style={{
            background: 'var(--portal-surface)',
          }}
        >
          {/* Card header */}
          <div className="mb-6 border-b pb-5 portal-divider">
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
              style={{
                background: 'var(--portal-gold-soft)',
                color: 'var(--accent-bright)',
                border: '1px solid var(--portal-gold-border)',
              }}
            >
              GS Gestão
            </span>
            <h1 className="portal-title mt-3 text-xl font-bold tracking-tight">Entrar no portal</h1>
            <p className="portal-muted mt-1 text-sm">
              Use as credenciais fornecidas para o seu acesso.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label className="portal-label">Email</label>
              <input
                type="email"
                className="portal-input"
                placeholder="voce@empresa.com.br"
                value={email}
                onChange={event => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="portal-label">Senha</label>
              <input
                type="password"
                className="portal-input"
                placeholder="••••••••"
                value={password}
                onChange={event => setPassword(event.target.value)}
                required
              />
            </div>

            {error ? (
              <div
                className="rounded-xl px-4 py-3 text-sm text-red-300"
                style={{ background: 'rgba(244, 124, 116,0.08)', border: '1px solid rgba(244, 124, 116,0.18)' }}
              >
                {error}
              </div>
            ) : null}

            <button type="submit" className="portal-primary-button mt-1 w-full justify-center">
              <LockKeyhole size={14} />
              Entrar
              <ArrowRight size={13} className="ml-auto" />
            </button>
          </form>
        </div>

        <p className="portal-muted mt-6 text-xs">
          Acesso restrito — use as credenciais fornecidas pela GS Gestão.
        </p>
      </div>
    </main>
  )
}
