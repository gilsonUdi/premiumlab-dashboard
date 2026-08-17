import { BriefcaseBusiness, Building2, Download, ExternalLink, Globe2, Instagram, Linkedin, Mail, MapPin, Phone } from 'lucide-react'
import { normalizarInstagram, normalizarLinkedin } from '@/lib/vcard'

function somenteDigitos(valor) {
  return String(valor || '').replace(/\D/g, '')
}

function iniciais(nome) {
  return String(nome || '').split(/\s+/).filter(Boolean).slice(0, 2).map(parte => parte[0]).join('').toUpperCase()
}

function Linha({ icon: Icone, rotulo, valor, href }) {
  if (!valor) return null
  const conteudo = <div className="flex min-w-0 items-start gap-4 border-b border-slate-200 py-5">
    <Icone className="mt-0.5 shrink-0 text-slate-400" size={20} />
    <div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-800">{valor}</p><p className="mt-1 text-xs text-slate-500">{rotulo}</p></div>
    {href ? <ExternalLink className="ml-auto mt-0.5 shrink-0 text-slate-300" size={15} /> : null}
  </div>
  return href ? <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="block">{conteudo}</a> : conteudo
}

export default function PublicContactCard({ contato }) {
  const telefone = somenteDigitos(contato.telefone)
  const instagram = normalizarInstagram(contato.instagram)
  const linkedin = normalizarLinkedin(contato.linkedin)
  const mapa = contato.endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contato.endereco)}` : ''

  return <main className="min-h-screen bg-slate-100 px-0 py-0 sm:px-5 sm:py-8">
    <article className="mx-auto min-h-screen max-w-md overflow-hidden bg-white shadow-xl sm:min-h-0 sm:rounded-3xl">
      <header className="bg-[#071B3A] px-6 pb-6 pt-10 text-center text-white">
        {contato.foto
          ? <img src={contato.foto} alt={`Foto de ${contato.nome}`} className="mx-auto h-28 w-28 rounded-full border-4 border-white/15 object-cover shadow-lg" />
          : <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full border-4 border-white/15 bg-[#C9A45C] text-3xl font-bold">{iniciais(contato.nome)}</div>}
        <h1 className="mt-5 text-2xl font-bold">{contato.nome}</h1>
        {contato.cargo ? <p className="mt-1 text-sm text-slate-300">{contato.cargo}</p> : null}
        {contato.empresa ? <p className="mt-1 text-xs uppercase tracking-[0.15em] text-[#DAB975]">{contato.empresa}</p> : null}
      </header>

      <nav className="grid grid-cols-3 divide-x divide-white/15 bg-[#0B244A] text-white">
        <a href={`tel:${telefone}`} className="flex flex-col items-center gap-1 py-4 text-[10px] font-bold uppercase"><Phone size={19} />Ligar</a>
        <a href={contato.email ? `mailto:${contato.email}` : '#informacoes'} className="flex flex-col items-center gap-1 py-4 text-[10px] font-bold uppercase"><Mail size={19} />E-mail</a>
        <a href={mapa || '#informacoes'} target={mapa ? '_blank' : undefined} rel="noreferrer" className="flex flex-col items-center gap-1 py-4 text-[10px] font-bold uppercase"><MapPin size={19} />Localização</a>
      </nav>

      <section id="informacoes" className="px-7 py-3">
        <Linha icon={Phone} rotulo="Celular" valor={contato.telefone} href={`tel:${telefone}`} />
        <Linha icon={Mail} rotulo="E-mail" valor={contato.email} href={contato.email ? `mailto:${contato.email}` : ''} />
        <Linha icon={Building2} rotulo="Empresa" valor={contato.empresa} />
        <Linha icon={BriefcaseBusiness} rotulo="Cargo" valor={contato.cargo} />
        <Linha icon={MapPin} rotulo="Endereço" valor={contato.endereco} href={mapa} />
        <Linha icon={Globe2} rotulo="Website" valor={contato.site} href={contato.site} />
        <Linha icon={Globe2} rotulo="Website" valor={contato.site2} href={contato.site2} />

        {(instagram || linkedin) ? <div className="py-6">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Redes sociais</p>
          <div className="flex gap-3">
            {instagram ? <a href={instagram} target="_blank" rel="noreferrer" aria-label="Instagram" className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 text-white"><Instagram size={21} /></a> : null}
            {linkedin ? <a href={linkedin} target="_blank" rel="noreferrer" aria-label="LinkedIn" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0A66C2] text-white"><Linkedin size={21} /></a> : null}
          </div>
        </div> : null}

        <a href={`/api/public/contact-cards/${contato.id}/vcard`} className="mb-8 mt-3 flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#C29B5B] text-sm font-bold uppercase tracking-wide text-white shadow-lg transition hover:bg-[#B38C4D]">
          <Download size={19} />Salvar contato
        </a>
      </section>
    </article>
  </main>
}

