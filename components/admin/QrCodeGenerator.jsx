'use client'

import { useState } from 'react'
import QRCode from 'qrcode'
import { Contact, Download, Link2, QrCode } from 'lucide-react'

const CONTATO_INICIAL = { nome: '', empresa: '', cargo: '', telefone: '', email: '', site: '', site2: '', endereco: '' }

function validarUrl(valor) {
  try {
    const url = new URL(valor)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function escaparVcard(valor) {
  return String(valor || '').trim().replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replace(/\r?\n/g, '\\n')
}

function nomeEstruturado(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean)
  if (partes.length < 2) return `${escaparVcard(partes[0] || '')};;;;`
  const sobrenome = partes.pop()
  return `${escaparVcard(sobrenome)};${escaparVcard(partes.join(' '))};;;`
}

function montarVcard(contato) {
  const linhas = [
    'BEGIN:VCARD', 'VERSION:3.0', `N:${nomeEstruturado(contato.nome)}`, `FN:${escaparVcard(contato.nome)}`,
  ]
  if (contato.empresa.trim()) linhas.push(`ORG:${escaparVcard(contato.empresa)}`)
  if (contato.cargo.trim()) linhas.push(`TITLE:${escaparVcard(contato.cargo)}`)
  if (contato.telefone.trim()) linhas.push(`TEL;TYPE=CELL,VOICE:${escaparVcard(contato.telefone)}`)
  if (contato.email.trim()) linhas.push(`EMAIL;TYPE=INTERNET,WORK:${escaparVcard(contato.email)}`)
  if (contato.site.trim()) linhas.push(`URL:${escaparVcard(contato.site)}`)
  if (contato.site2.trim()) linhas.push(`URL:${escaparVcard(contato.site2)}`)
  if (contato.endereco.trim()) linhas.push(`ADR;TYPE=WORK:;;${escaparVcard(contato.endereco)};;;;`)
  linhas.push('END:VCARD')
  return linhas.join('\r\n')
}

function baixar(conteudo, nome) {
  const link = document.createElement('a')
  link.href = conteudo instanceof Blob ? URL.createObjectURL(conteudo) : conteudo
  link.download = nome
  document.body.appendChild(link)
  link.click()
  link.remove()
  if (conteudo instanceof Blob) URL.revokeObjectURL(link.href)
}

export default function QrCodeGenerator() {
  const [tipo, setTipo] = useState('contato')
  const [url, setUrl] = useState('')
  const [contato, setContato] = useState(CONTATO_INICIAL)
  const [tamanho, setTamanho] = useState(1024)
  const [png, setPng] = useState('')
  const [svg, setSvg] = useState('')
  const [resumo, setResumo] = useState('')
  const [erro, setErro] = useState('')
  const [gerando, setGerando] = useState(false)

  function alterarTipo(proximo) {
    setTipo(proximo); setPng(''); setSvg(''); setResumo(''); setErro('')
  }

  function atualizarContato(campo, valor) {
    setContato(atual => ({ ...atual, [campo]: valor }))
  }

  async function gerar(event) {
    event.preventDefault()
    let conteudo
    if (tipo === 'url') {
      const valor = url.trim()
      if (!validarUrl(valor)) {
        setErro('Informe uma URL completa, começando com http:// ou https://.'); setPng(''); setSvg(''); return
      }
      conteudo = valor
    } else {
      if (!contato.nome.trim() || !contato.telefone.trim()) {
        setErro('Informe pelo menos o nome e o telefone do contato.'); setPng(''); setSvg(''); return
      }
      if (contato.email.trim() && !/^\S+@\S+\.\S+$/.test(contato.email.trim())) {
        setErro('Informe um e-mail válido.'); setPng(''); setSvg(''); return
      }
      if (contato.site.trim() && !validarUrl(contato.site.trim())) {
        setErro('Informe o site principal completo, começando com http:// ou https://.'); setPng(''); setSvg(''); return
      }
      if (contato.site2.trim() && !validarUrl(contato.site2.trim())) {
        setErro('Informe o segundo site completo, começando com http:// ou https://.'); setPng(''); setSvg(''); return
      }
      conteudo = montarVcard(contato)
    }

    setGerando(true)
    try {
      const opcoes = { errorCorrectionLevel: tipo === 'contato' ? 'M' : 'H', margin: 3, width: tamanho, color: { dark: '#07152B', light: '#FFFFFF' } }
      const [imagemPng, imagemSvg] = await Promise.all([
        QRCode.toDataURL(conteudo, { ...opcoes, type: 'image/png' }), QRCode.toString(conteudo, { ...opcoes, type: 'svg' }),
      ])
      setPng(imagemPng); setSvg(imagemSvg); setResumo(tipo === 'contato' ? contato.nome.trim() : url.trim()); setErro('')
    } catch {
      setErro('Não foi possível gerar o QR Code. Reduza a quantidade de dados e tente novamente.')
    } finally { setGerando(false) }
  }

  function baixarSvg() { baixar(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), 'qrcode.svg') }

  return <>
    <header className="mb-6">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#28497E' }}>Ferramentas</p>
      <h2 className="text-2xl font-bold tracking-tight text-white">Gerador de QR Code</h2>
      <p className="mt-1 text-sm" style={{ color: '#AEC3DF' }}>Gere um QR para abrir um contato diretamente no celular ou acessar uma URL.</p>
    </header>

    <div className="mb-5 inline-flex rounded-xl p-1" style={{ background: '#0A162B', border: '1px solid rgba(255,255,255,0.06)' }}>
      {[['contato', 'Contato', Contact], ['url', 'URL', Link2]].map(([valor, rotulo, Icone]) => <button key={valor} type="button" onClick={() => alterarTipo(valor)} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition" style={tipo === valor ? { background: 'rgba(201,164,92,0.12)', color: '#DAB975' } : { color: '#7E97BC' }}><Icone size={15} />{rotulo}</button>)}
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <form onSubmit={gerar} className="rounded-2xl p-5 sm:p-6" style={{ background: '#0A162B', border: '1px solid rgba(255,255,255,0.05)' }}>
        {tipo === 'url' ? <>
          <label className="block text-sm font-semibold text-white" htmlFor="qr-url">URL de destino</label>
          <input id="qr-url" type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://exemplo.com.br" className="mt-2 h-12 w-full rounded-xl px-4 text-sm text-white outline-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} />
        </> : <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Nome completo" obrigatorio valor={contato.nome} aoMudar={valor => atualizarContato('nome', valor)} placeholder="Wagner Paiva" />
          <Campo label="Telefone" obrigatorio valor={contato.telefone} aoMudar={valor => atualizarContato('telefone', valor)} placeholder="+55 34 99779-5100" type="tel" />
          <Campo label="Empresa" valor={contato.empresa} aoMudar={valor => atualizarContato('empresa', valor)} placeholder="Axis Governance" />
          <Campo label="Cargo" valor={contato.cargo} aoMudar={valor => atualizarContato('cargo', valor)} placeholder="Diretor" />
          <Campo label="E-mail" valor={contato.email} aoMudar={valor => atualizarContato('email', valor)} placeholder="nome@empresa.com.br" type="email" />
          <Campo label="Site principal" valor={contato.site} aoMudar={valor => atualizarContato('site', valor)} placeholder="https://empresa.com.br" type="url" />
          <Campo label="Segundo site" valor={contato.site2} aoMudar={valor => atualizarContato('site2', valor)} placeholder="https://outrosite.com.br" type="url" />
          <label className="block sm:col-span-2"><span className="text-sm font-semibold text-white">Endereço</span><textarea value={contato.endereco} onChange={event => atualizarContato('endereco', event.target.value)} rows={3} placeholder="Rua, número, bairro, cidade - UF, CEP" className="mt-2 w-full rounded-xl px-4 py-3 text-sm text-white outline-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} /></label>
        </div>}

        <label className="mt-5 block text-sm font-semibold text-white" htmlFor="qr-size">Tamanho do PNG</label>
        <select id="qr-size" value={tamanho} onChange={event => setTamanho(Number(event.target.value))} className="mt-2 h-12 w-full rounded-xl px-4 text-sm text-white outline-none" style={{ background: '#0D1D38', border: '1px solid rgba(255,255,255,0.08)' }}><option value={512}>512 × 512 px</option><option value={1024}>1024 × 1024 px</option><option value={2048}>2048 × 2048 px</option></select>
        {erro ? <div className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(244,124,116,0.08)', color: '#F7A29D', border: '1px solid rgba(244,124,116,0.15)' }}>{erro}</div> : null}
        <button type="submit" className="portal-primary-button mt-6 w-full justify-center" disabled={gerando}>{gerando ? 'Gerando...' : 'Gerar QR Code'}<QrCode size={16} /></button>
        <p className="mt-4 text-xs leading-5" style={{ color: '#7E97BC' }}>{tipo === 'contato' ? 'Os dados ficam dentro do QR Code. Ao escanear, celulares compatíveis exibem a ficha para criar ou adicionar o contato.' : 'O QR Code abrirá a URL informada.'} Nenhuma informação é armazenada pelo portal.</p>
      </form>

      <section className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl p-5 sm:p-6" style={{ background: '#0A162B', border: '1px solid rgba(255,255,255,0.05)' }}>
        {png ? <><div className="w-full max-w-[300px] overflow-hidden rounded-2xl bg-white p-3"><img src={png} alt="Prévia do QR Code gerado" className="h-auto w-full" /></div><p className="mt-4 max-w-full truncate text-center text-xs" style={{ color: '#7E97BC' }}>{resumo}</p><div className="mt-5 grid w-full grid-cols-2 gap-3"><button type="button" className="portal-ghost-button justify-center" onClick={() => baixar(png, 'qrcode.png')}><Download size={14} />Baixar PNG</button><button type="button" className="portal-ghost-button justify-center" onClick={baixarSvg}><Download size={14} />Baixar SVG</button></div></> : <div className="text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', color: '#28497E', border: '1px dashed rgba(126,151,188,0.2)' }}><QrCode size={34} /></div><p className="mt-4 text-sm font-medium text-white">A prévia aparecerá aqui</p><p className="mt-1 text-xs" style={{ color: '#7E97BC' }}>Preencha os dados e clique em gerar.</p></div>}
      </section>
    </div>
  </>
}

function Campo({ label, obrigatorio = false, valor, aoMudar, placeholder, type = 'text' }) {
  return <label className="block"><span className="text-sm font-semibold text-white">{label}{obrigatorio ? ' *' : ''}</span><input type={type} required={obrigatorio} value={valor} onChange={event => aoMudar(event.target.value)} placeholder={placeholder} className="mt-2 h-12 w-full rounded-xl px-4 text-sm text-white outline-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} /></label>
}
