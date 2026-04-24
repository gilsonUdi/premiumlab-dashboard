import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Building2, ShieldCheck } from 'lucide-react'

function DashboardMock() {
  return (
    <div className="relative mx-auto w-full max-w-[760px]">
      <div className="absolute -left-10 top-14 h-40 w-40 rounded-full bg-[#e3ad5a]/15 blur-3xl" />
      <div className="absolute -right-8 bottom-0 h-48 w-48 rounded-full bg-[#e3ad5a]/20 blur-3xl" />

      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0d0d11] shadow-[0_32px_100px_rgba(0,0,0,0.45)]">
        <div className="grid min-h-[430px] grid-cols-[110px_1fr]">
          <aside className="border-r border-white/6 bg-[#111216] p-5">
            <div className="mb-7 h-9 w-9 rounded-lg bg-[#1d1f25]" />
            <div className="space-y-3">
              {[72, 60, 68, 54, 46].map((width, index) => (
                <div key={index} className="h-3 rounded-full bg-[#1f2229]" style={{ width }} />
              ))}
            </div>
          </aside>

          <div className="p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="mb-2 h-3 w-20 rounded-full bg-[#2a2f39]" />
                <div className="h-6 w-40 rounded-full bg-[#ece7dd]" />
              </div>
              <div className="flex gap-3">
                <div className="h-10 w-24 rounded-2xl bg-[#1c1f27]" />
                <div className="h-10 w-24 rounded-2xl bg-[#1c1f27]" />
              </div>
            </div>

            <div className="mb-5 grid gap-4 md:grid-cols-4">
              {['#e3ad5a', '#23c17e', '#60a5fa', '#a78bfa'].map((color, index) => (
                <div key={index} className="rounded-2xl border border-white/6 bg-[#14171d] p-4">
                  <div className="mb-3 h-3 w-20 rounded-full bg-[#2b313d]" />
                  <div className="mb-2 h-7 w-16 rounded-full" style={{ background: color }} />
                  <div className="h-3 w-14 rounded-full bg-[#262c37]" />
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-3xl border border-white/6 bg-[#14171d] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="h-4 w-36 rounded-full bg-[#2a303b]" />
                  <div className="h-3 w-16 rounded-full bg-[#232934]" />
                </div>
                <div className="flex h-[210px] items-end gap-3">
                  {[52, 86, 64, 118, 78, 138, 112].map((height, index) => (
                    <div
                      key={index}
                      className="flex-1 rounded-t-2xl bg-gradient-to-t from-[#e3ad5a]/35 to-[#e3ad5a]"
                      style={{ height }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-white/6 bg-[#14171d] p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <div className="h-4 w-28 rounded-full bg-[#2a303b]" />
                    <div className="h-8 w-8 rounded-full border border-white/8 bg-[#1a1e25]" />
                  </div>
                  <div className="mx-auto mb-5 flex h-36 w-36 items-center justify-center rounded-full border-[12px] border-[#e3ad5a] border-r-[#2f343e] border-b-[#2f343e]">
                    <span className="text-4xl font-semibold text-white">25%</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="mb-2 h-3 w-16 rounded-full bg-[#2a303b]" />
                      <div className="h-5 w-12 rounded-full bg-[#e3ad5a]" />
                    </div>
                    <div>
                      <div className="mb-2 h-3 w-16 rounded-full bg-[#2a303b]" />
                      <div className="h-5 w-12 rounded-full bg-[#e3ad5a]" />
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/6 bg-[#14171d] p-5">
                  <div className="mb-4 h-4 w-24 rounded-full bg-[#2a303b]" />
                  <div className="space-y-3">
                    {[88, 76, 68, 82].map((width, index) => (
                      <div key={index} className="space-y-2">
                        <div className="h-2 w-16 rounded-full bg-[#20252d]" />
                        <div className="h-2 rounded-full bg-[#2b313d]">
                          <div className="h-2 rounded-full bg-[#e3ad5a]" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-8 left-6 right-10 flex items-center gap-4 rounded-[26px] border border-white/8 bg-[#1a1818]/90 px-5 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#e3ad5a] text-[#1b1612]">
          <Building2 size={24} />
        </div>
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-[#8e887d]">Portal GS</p>
          <p className="text-2xl font-semibold text-[#f1b867]">Visao unificada das empresas</p>
        </div>
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#171416] text-white">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col px-6 pb-12 pt-6 lg:px-12">
        <header className="flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-4">
            <Image
              src="/gs-logo.png"
              alt="GS Consultoria & Gestao"
              width={220}
              height={124}
              className="h-14 w-auto md:h-16"
              priority
            />
          </Link>

          <nav className="hidden items-center gap-10 text-sm font-medium uppercase tracking-[0.16em] text-[#e7e1d9]/80 lg:flex">
            <span>Inicio</span>
            <span>Empresas</span>
            <span>Ferramentas</span>
            <span>Controle</span>
          </nav>

          <Link
            href="/login"
            className="inline-flex h-14 items-center gap-3 rounded-full bg-[#e3ad5a] px-7 text-sm font-semibold text-[#201814] shadow-[0_18px_35px_rgba(227,173,90,0.22)] transition hover:brightness-105"
          >
            Fazer login
            <ArrowRight size={16} />
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-16 py-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="max-w-[640px]">
            <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[#e7e1d9]/80">
              <ShieldCheck size={16} className="text-[#e3ad5a]" />
              Multi-tenant para operacao, dashboards e gestao
            </div>

            <h1 className="mb-8 text-[48px] font-semibold leading-[0.96] tracking-tight text-[#f7f5f2] md:text-[72px]">
              Voce controla suas empresas ou so organiza tudo em planilhas?
            </h1>

            <p className="mb-10 max-w-[560px] text-lg leading-8 text-[#c3bfb7] md:text-[30px]/[1.45]">
              A plataforma GS centraliza ferramentas, acessos e operacao por empresa. Comecamos com o dashboard da
              Premium Lab e uma base pronta para crescer com novos modulos.
            </p>

            <div className="flex flex-wrap items-center gap-5">
              <Link
                href="/login"
                className="inline-flex h-16 items-center rounded-full bg-[#e3ad5a] px-10 text-lg font-semibold text-[#221a15] shadow-[0_18px_40px_rgba(227,173,90,0.25)] transition hover:brightness-105"
              >
                Entrar no portal
              </Link>
              <div className="text-base font-medium text-[#e7e1d9]/85">
                Login corporativo e acesso administrativo em um unico lugar
              </div>
            </div>
          </div>

          <div className="relative px-2 pb-14 lg:px-0">
            <div className="absolute left-20 top-10 h-[420px] w-[420px] rounded-full bg-[#e3ad5a]/10 blur-3xl" />
            <DashboardMock />
          </div>
        </section>
      </div>
    </main>
  )
}
