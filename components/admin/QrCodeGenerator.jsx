'use client'

import { useState } from 'react'
import QRCode from 'qrcode'
import { Contact, Download, Link2, QrCode } from 'lucide-react'

const CONTATO_INICIAL = { nome: '', empresa: '', cargo: '', telefone: '', email: '', site: '', site2: '', instagram: '', linkedin: '', endereco: '' }
const QR_MARGIN = 4
const QR_DARK = '#07152B'
const QR_LIGHT = '#FFFFFF'
const LOGO_URL = '/axis-logo.png'

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

function normalizarInstagram(valor) {
  const texto = String(valor || '').trim()
  if (!texto) return ''
  if (/^https?:\/\//i.test(texto)) return validarUrl(texto) ? texto : ''
  const usuario = texto.replace(/^@/, '').replace(/^instagram\.com\//i, '').replace(/\/+$/, '')
  return /^[a-zA-Z0-9._]+$/.test(usuario) ? `https://instagram.com/${usuario}` : ''
}

function normalizarLinkedin(valor) {
  const texto = String(valor || '').trim()
  if (!texto) return ''
  if (/^https?:\/\//i.test(texto)) return validarUrl(texto) ? texto : ''
  if (/^(?:www\.)?linkedin\.com\//i.test(texto)) return `https://${texto}`
  const usuario = texto.replace(/^@/, '').replace(/^in\//i, '').replace(/\/+$/, '')
  return /^[a-zA-Z0-9._-]+$/.test(usuario) ? `https://www.linkedin.com/in/${usuario}` : ''
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
  const instagram = normalizarInstagram(contato.instagram)
  if (instagram) linhas.push(`X-SOCIALPROFILE;TYPE=instagram:${escaparVcard(instagram)}`)
  const linkedin = normalizarLinkedin(contato.linkedin)
  if (linkedin) linhas.push(`X-SOCIALPROFILE;TYPE=linkedin:${escaparVcard(linkedin)}`)
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

function lerComoDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onload = () => resolve(leitor.result)
    leitor.onerror = () => reject(new Error('Falha ao ler a logo.'))
    leitor.readAsDataURL(blob)
  })
}

async function carregarLogoDataUrl() {
  const resposta = await fetch(LOGO_URL)
  if (!resposta.ok) throw new Error('Falha ao carregar a logo.')
  return lerComoDataUrl(await resposta.blob())
}

function carregarImagem(origem) {
  return new Promise((resolve, reject) => {
    const imagem = new Image()
    imagem.onload = () => resolve(imagem)
    imagem.onerror = () => reject(new Error('Falha ao preparar a imagem.'))
    imagem.src = origem
  })
}

function retanguloArredondado(ctx, x, y, largura, altura, raio) {
  const r = Math.min(raio, largura / 2, altura / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + largura, y, x + largura, y + altura, r)
  ctx.arcTo(x + largura, y + altura, x, y + altura, r)
  ctx.arcTo(x, y + altura, x, y, r)
  ctx.arcTo(x, y, x + largura, y, r)
  ctx.closePath()
}

function medidasLogo(lado, modulo) {
  const larguraExterna = Math.max(11 * modulo, Math.round(lado * 0.24 / modulo) * modulo)
  const alturaExterna = Math.max(5 * modulo, Math.round(lado * 0.11 / modulo) * modulo)
  return {
    x: Math.round((lado - larguraExterna) / (2 * modulo)) * modulo,
    y: Math.round((lado - alturaExterna) / (2 * modulo)) * modulo,
    larguraExterna,
    alturaExterna,
  }
}

async function aplicarLogoNoPng(qrDataUrl, logoDataUrl, modulo) {
  const [qr, logo] = await Promise.all([carregarImagem(qrDataUrl), carregarImagem(logoDataUrl)])
  const canvas = document.createElement('canvas')
  canvas.width = qr.naturalWidth
  canvas.height = qr.naturalHeight
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(qr, 0, 0)

  const caixa = medidasLogo(canvas.width, modulo)
  retanguloArredondado(ctx, caixa.x, caixa.y, caixa.larguraExterna, caixa.alturaExterna, modulo * 1.35)
  ctx.fillStyle = QR_LIGHT
  ctx.fill()

  const borda = modulo
  const xInterno = caixa.x + borda
  const yInterno = caixa.y + borda
  const larguraInterna = caixa.larguraExterna - borda * 2
  const alturaInterna = caixa.alturaExterna - borda * 2
  retanguloArredondado(ctx, xInterno, yInterno, larguraInterna, alturaInterna, modulo * 0.75)
  ctx.fillStyle = QR_DARK
  ctx.fill()

  // A arte original e quadrada e possui respiro vertical. O recorte central
  // preserva a assinatura AXIS Governance dentro do selo horizontal.
  const recorteY = logo.naturalHeight * 0.28
  const recorteAltura = logo.naturalHeight * 0.44
  const respiro = modulo * 0.45
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(
    logo,
    0,
    recorteY,
    logo.naturalWidth,
    recorteAltura,
    xInterno + respiro,
    yInterno + respiro,
    larguraInterna - respiro * 2,
    alturaInterna - respiro * 2,
  )
  return canvas.toDataURL('image/png')
}

function aplicarLogoNoSvg(svg, logoDataUrl, totalModulos) {
  const modulo = 1
  const caixa = medidasLogo(totalModulos, modulo)
  const borda = 1
  const xInterno = caixa.x + borda
  const yInterno = caixa.y + borda
  const larguraInterna = caixa.larguraExterna - borda * 2
  const alturaInterna = caixa.alturaExterna - borda * 2
  const selo = `<g aria-label="Logo Axis"><rect x="${caixa.x}" y="${caixa.y}" width="${caixa.larguraExterna}" height="${caixa.alturaExterna}" rx="1.35" fill="${QR_LIGHT}"/><rect x="${xInterno}" y="${yInterno}" width="${larguraInterna}" height="${alturaInterna}" rx="0.75" fill="${QR_DARK}"/><image href="${logoDataUrl}" x="${xInterno + 0.45}" y="${yInterno + 0.45}" width="${larguraInterna - 0.9}" height="${alturaInterna - 0.9}" preserveAspectRatio="xMidYMid slice"/></g>`
  return svg.replace('</svg>', `${selo}</svg>`)
}

export default function QrCodeGenerator() {
  const [tipo, setTipo] = useState('contato')
  const [url, setUrl] = useState('')
  const [contato, setContato] = useState(CONTATO_INICIAL)
  const [tamanho, setTamanho] = useState(1024)
  const [usarLogo, setUsarLogo] = useState(true)
  const [png, setPng] = useState('')
  const [svg, setSvg] = useState('')
  const [resumo, setResumo] = useState('')
  const [detalhes, setDetalhes] = useState(null)
  const [erro, setErro] = useState('')
  const [gerando, setGerando] = useState(false)

  function alterarTipo(proximo) {
    setTipo(proximo); setPng(''); setSvg(''); setResumo(''); setDetalhes(null); setErro('')
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
      if (contato.instagram.trim() && !normalizarInstagram(contato.instagram)) {
        setErro('Informe um usuário do Instagram, como @axisgovernance, ou a URL completa do perfil.'); setPng(''); setSvg(''); return
      }
      if (contato.linkedin.trim() && !normalizarLinkedin(contato.linkedin)) {
        setErro('Informe o identificador ou a URL completa do perfil no LinkedIn.'); setPng(''); setSvg(''); return
      }
      conteudo = montarVcard(contato)
    }

    setGerando(true)
    try {
      const errorCorrectionLevel = tipo === 'contato' ? 'M' : 'H'
      const qr = QRCode.create(conteudo, { errorCorrectionLevel })
      const totalModulos = qr.modules.size + QR_MARGIN * 2
      // Escala inteira evita antialiasing entre os módulos. Arredondar para cima
      // garante quadrados maiores e um arquivo final pelo menos do tamanho escolhido.
      const escala = Math.max(1, Math.ceil(tamanho / totalModulos))
      const opcoes = { errorCorrectionLevel, margin: QR_MARGIN, scale: escala, color: { dark: QR_DARK, light: QR_LIGHT } }
      const [pngBase, svgBase, logoDataUrl] = await Promise.all([
        QRCode.toDataURL(conteudo, { ...opcoes, type: 'image/png' }),
        QRCode.toString(conteudo, { ...opcoes, type: 'svg' }),
        usarLogo ? carregarLogoDataUrl() : Promise.resolve(''),
      ])
      const [imagemPng, imagemSvg] = usarLogo
        ? await Promise.all([
            aplicarLogoNoPng(pngBase, logoDataUrl, escala),
            Promise.resolve(aplicarLogoNoSvg(svgBase, logoDataUrl, totalModulos)),
          ])
        : [pngBase, svgBase]
      setPng(imagemPng); setSvg(imagemSvg); setResumo(tipo === 'contato' ? contato.nome.trim() : url.trim()); setErro('')
      setDetalhes({ modulos: qr.modules.size, moduloPx: escala, ladoPx: totalModulos * escala, minimoMm: Math.ceil(totalModulos * 0.5) })
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
          <Campo label="Instagram" valor={contato.instagram} aoMudar={valor => atualizarContato('instagram', valor)} placeholder="@axisgovernance" />
          <Campo label="LinkedIn" valor={contato.linkedin} aoMudar={valor => atualizarContato('linkedin', valor)} placeholder="https://linkedin.com/in/usuario" />
          <label className="block sm:col-span-2"><span className="text-sm font-semibold text-white">Endereço</span><textarea value={contato.endereco} onChange={event => atualizarContato('endereco', event.target.value)} rows={3} placeholder="Rua, número, bairro, cidade - UF, CEP" className="mt-2 w-full rounded-xl px-4 py-3 text-sm text-white outline-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} /></label>
        </div>}

        <label className="mt-5 block text-sm font-semibold text-white" htmlFor="qr-size">Tamanho aproximado do PNG</label>
        <select id="qr-size" value={tamanho} onChange={event => setTamanho(Number(event.target.value))} className="mt-2 h-12 w-full rounded-xl px-4 text-sm text-white outline-none" style={{ background: '#0D1D38', border: '1px solid rgba(255,255,255,0.08)' }}><option value={512}>Aproximadamente 512 px</option><option value={1024}>Aproximadamente 1024 px</option><option value={2048}>Aproximadamente 2048 px</option></select>
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <input type="checkbox" checked={usarLogo} onChange={event => setUsarLogo(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#C9A45C]" />
          <span><strong className="block text-sm text-white">Logo Axis no centro</strong><small className="mt-1 block text-xs leading-5" style={{ color: '#7E97BC' }}>Inclui a marca com área de proteção dimensionada para preservar a leitura.</small></span>
        </label>
        {erro ? <div className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(244,124,116,0.08)', color: '#F7A29D', border: '1px solid rgba(244,124,116,0.15)' }}>{erro}</div> : null}
        <button type="submit" className="portal-primary-button mt-6 w-full justify-center" disabled={gerando}>{gerando ? 'Gerando...' : 'Gerar QR Code'}<QrCode size={16} /></button>
        <p className="mt-4 text-xs leading-5" style={{ color: '#7E97BC' }}>{tipo === 'contato' ? 'Os dados ficam dentro do QR Code. Ao escanear, celulares compatíveis exibem a ficha para criar ou adicionar o contato.' : 'O QR Code abrirá a URL informada.'} Nenhuma informação é armazenada pelo portal.</p>
      </form>

      <section className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl p-5 sm:p-6" style={{ background: '#0A162B', border: '1px solid rgba(255,255,255,0.05)' }}>
        {png ? <><div className="w-full max-w-[360px] overflow-hidden rounded-2xl bg-white p-4"><img src={png} alt="Prévia do QR Code gerado" className="h-auto w-full" style={{ imageRendering: 'pixelated' }} /></div><p className="mt-4 max-w-full truncate text-center text-xs" style={{ color: '#7E97BC' }}>{resumo}</p>{detalhes ? <div className="mt-3 w-full rounded-xl px-4 py-3 text-center text-xs leading-5" style={{ background: 'rgba(201,164,92,0.07)', color: '#AEC3DF', border: '1px solid rgba(201,164,92,0.15)' }}><strong className="text-white">Módulos nítidos de {detalhes.moduloPx} px</strong><br />Arquivo: {detalhes.ladoPx} × {detalhes.ladoPx} px · Para impressão, use o QR com pelo menos {detalhes.minimoMm} × {detalhes.minimoMm} mm.</div> : null}<div className="mt-5 grid w-full grid-cols-2 gap-3"><button type="button" className="portal-ghost-button justify-center" onClick={() => baixar(png, 'qrcode.png')}><Download size={14} />Baixar PNG</button><button type="button" className="portal-ghost-button justify-center" onClick={baixarSvg}><Download size={14} />Baixar SVG</button></div></> : <div className="text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', color: '#28497E', border: '1px dashed rgba(126,151,188,0.2)' }}><QrCode size={34} /></div><p className="mt-4 text-sm font-medium text-white">A prévia aparecerá aqui</p><p className="mt-1 text-xs" style={{ color: '#7E97BC' }}>Preencha os dados e clique em gerar.</p></div>}
      </section>
    </div>
  </>
}

function Campo({ label, obrigatorio = false, valor, aoMudar, placeholder, type = 'text' }) {
  return <label className="block"><span className="text-sm font-semibold text-white">{label}{obrigatorio ? ' *' : ''}</span><input type={type} required={obrigatorio} value={valor} onChange={event => aoMudar(event.target.value)} placeholder={placeholder} className="mt-2 h-12 w-full rounded-xl px-4 text-sm text-white outline-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} /></label>
}
