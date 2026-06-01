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
    <main className="relative flex min-h-screen overflow-hidden text-white" style={{ background: '#0d0b09' }}>

      {/* Ambient bottom glow */}
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2"
        style={{
          width: '900px',
          height: '400px',
          background: 'radial-gradient(ellipse, rgba(227,173,90,0.09) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      {/* Subtle grid texture */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
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
            style={{ opacity: 0.85 }}
          />
        </div>

        {/* Login card */}
        <div
          className="w-full max-w-[400px] rounded-2xl p-7"
          style={{
            background: 'linear-gradient(150deg, #1b1814 0%, #131109 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 40px 100px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          {/* Card header */}
          <div className="mb-6 pb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
              style={{
                background: 'rgba(227,173,90,0.1)',
                color: '#c9924a',
                border: '1px solid rgba(227,173,90,0.18)',
              }}
            >
              GS Gestão
            </span>
            <h1 className="mt-3 text-xl font-bold tracking-tight text-white">Entrar no portal</h1>
            <p className="mt-1 text-sm" style={{ color: '#5c554e' }}>
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
                style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.18)' }}
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

        <p className="mt-6 text-xs" style={{ color: '#302b25' }}>
          Acesso restrito — use as credenciais fornecidas pela GS Gestão.
        </p>
      </div>
    </main>
  )
}
