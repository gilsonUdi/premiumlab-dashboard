'use client'

import { useState } from 'react'
import QRCode from 'qrcode'
import { Check, Contact, Copy, Download, ImagePlus, Link2, QrCode } from 'lucide-react'
import { getPortalAuthHeaders } from '@/lib/portal-store'
import { normalizarInstagram, normalizarLinkedin } from '@/lib/vcard'

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

async function otimizarFoto(arquivo) {
  if (!arquivo?.type?.startsWith('image/')) throw new Error('Selecione uma imagem válida.')
  if (arquivo.size > 12 * 1024 * 1024) throw new Error('A foto deve ter no máximo 12 MB.')
  const origem = URL.createObjectURL(arquivo)
  try {
    const imagem = await carregarImagem(origem)
    const ladoOrigem = Math.min(imagem.naturalWidth, imagem.naturalHeight)
    const sx = (imagem.naturalWidth - ladoOrigem) / 2
    const sy = (imagem.naturalHeight - ladoOrigem) / 2
    const canvas = document.createElement('canvas')
    canvas.width = 720
    canvas.height = 720
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, 720, 720)
    ctx.drawImage(imagem, sx, sy, ladoOrigem, ladoOrigem, 0, 0, 720, 720)
    return canvas.toDataURL('image/jpeg', 0.82)
  } finally {
    URL.revokeObjectURL(origem)
  }
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
  const [foto, setFoto] = useState('')
  const [paginaPublica, setPaginaPublica] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [tamanho, setTamanho] = useState(1024)
  const [usarLogo, setUsarLogo] = useState(true)
  const [png, setPng] = useState('')
  const [svg, setSvg] = useState('')
  const [resumo, setResumo] = useState('')
  const [detalhes, setDetalhes] = useState(null)
  const [erro, setErro] = useState('')
  const [gerando, setGerando] = useState(false)

  function alterarTipo(proximo) {
    setTipo(proximo); setPng(''); setSvg(''); setResumo(''); setDetalhes(null); setPaginaPublica(''); setCopiado(false); setErro('')
  }

  function atualizarContato(campo, valor) {
    setContato(atual => ({ ...atual, [campo]: valor }))
  }

  async function selecionarFoto(event) {
    const arquivo = event.target.files?.[0]
    if (!arquivo) return
    try {
      setFoto(await otimizarFoto(arquivo))
      setErro('')
    } catch (error) {
      setFoto('')
      setErro(error.message)
    }
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
      setGerando(true)
      try {
        const headers = await getPortalAuthHeaders()
        const response = await fetch('/api/admin/contact-cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ ...contato, foto }),
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload?.error || 'Não foi possível publicar o cartão de contato.')
        conteudo = `${window.location.origin}/contato/${payload.id}`
        setPaginaPublica(conteudo)
      } catch (error) {
        setErro(error.message); setPng(''); setSvg(''); setGerando(false); return
      }
    }

    setGerando(true)
    try {
      const errorCorrectionLevel = 'H'
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
      setPng(imagemPng); setSvg(imagemSvg); setResumo(tipo === 'contato' ? contato.nome.trim() : url.trim()); setErro(''); setCopiado(false)
      setDetalhes({ modulos: qr.modules.size, moduloPx: escala, ladoPx: totalModulos * escala, minimoMm: Math.ceil(totalModulos * 0.5) })
    } catch {
      setErro('Não foi possível gerar o QR Code. Reduza a quantidade de dados e tente novamente.')
    } finally { setGerando(false) }
  }

  function baixarSvg() { baixar(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), 'qrcode.svg') }

  async function copiarPagina() {
    await navigator.clipboard.writeText(paginaPublica)
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 2000)
  }

  return <>
    <header className="mb-6">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#28497E' }}>Ferramentas</p>
      <h2 className="text-2xl font-bold tracking-tight text-white">Gerador de QR Code</h2>
      <p className="mt-1 text-sm" style={{ color: '#AEC3DF' }}>Gere um QR para uma página pública de contato ou para acessar uma URL.</p>
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
          <label className="block sm:col-span-2">
            <span className="text-sm font-semibold text-white">Foto da pessoa</span>
            <span className="relative mt-2 flex cursor-pointer items-center gap-4 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {foto ? <img src={foto} alt="Prévia da foto" className="h-16 w-16 rounded-full object-cover" /> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full" style={{ background: 'rgba(201,164,92,0.1)', color: '#DAB975' }}><ImagePlus size={24} /></span>}
              <span className="min-w-0 flex-1"><strong className="block text-sm text-white">{foto ? 'Trocar foto' : 'Selecionar foto'}</strong><small className="mt-1 block text-xs leading-5" style={{ color: '#7E97BC' }}>JPG, PNG ou WebP. A imagem será recortada e otimizada automaticamente.</small></span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selecionarFoto} className="absolute inset-0 cursor-pointer opacity-0" />
            </span>
          </label>
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
        <p className="mt-4 text-xs leading-5" style={{ color: '#7E97BC' }}>{tipo === 'contato' ? 'O cartão será publicado no portal e o QR abrirá essa página. Nela, a pessoa poderá visualizar os dados e salvar o contato no celular.' : 'O QR Code abrirá a URL informada.'}</p>
      </form>

      <section className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl p-5 sm:p-6" style={{ background: '#0A162B', border: '1px solid rgba(255,255,255,0.05)' }}>
        {png ? <>
          <div className="w-full max-w-[360px] overflow-hidden rounded-2xl bg-white p-4"><img src={png} alt="Prévia do QR Code gerado" className="h-auto w-full" style={{ imageRendering: 'pixelated' }} /></div>
          <p className="mt-4 max-w-full truncate text-center text-xs" style={{ color: '#7E97BC' }}>{resumo}</p>
          {paginaPublica ? <div className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <a href={paginaPublica} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-xs" style={{ color: '#AEC3DF' }}>{paginaPublica}</a>
            <button type="button" onClick={copiarPagina} className="shrink-0 p-2" style={{ color: copiado ? '#77D5A3' : '#DAB975' }} aria-label="Copiar link">{copiado ? <Check size={15} /> : <Copy size={15} />}</button>
          </div> : null}
          {detalhes ? <div className="mt-3 w-full rounded-xl px-4 py-3 text-center text-xs leading-5" style={{ background: 'rgba(201,164,92,0.07)', color: '#AEC3DF', border: '1px solid rgba(201,164,92,0.15)' }}><strong className="text-white">Módulos nítidos de {detalhes.moduloPx} px</strong><br />Arquivo: {detalhes.ladoPx} × {detalhes.ladoPx} px · Para impressão, use o QR com pelo menos {detalhes.minimoMm} × {detalhes.minimoMm} mm.</div> : null}
          <div className="mt-5 grid w-full grid-cols-2 gap-3"><button type="button" className="portal-ghost-button justify-center" onClick={() => baixar(png, 'qrcode.png')}><Download size={14} />Baixar PNG</button><button type="button" className="portal-ghost-button justify-center" onClick={baixarSvg}><Download size={14} />Baixar SVG</button></div>
        </> : <div className="text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', color: '#28497E', border: '1px dashed rgba(126,151,188,0.2)' }}><QrCode size={34} /></div><p className="mt-4 text-sm font-medium text-white">A prévia aparecerá aqui</p><p className="mt-1 text-xs" style={{ color: '#7E97BC' }}>Preencha os dados e clique em gerar.</p></div>}
      </section>
    </div>
  </>
}

function Campo({ label, obrigatorio = false, valor, aoMudar, placeholder, type = 'text' }) {
  return <label className="block"><span className="text-sm font-semibold text-white">{label}{obrigatorio ? ' *' : ''}</span><input type={type} required={obrigatorio} value={valor} onChange={event => aoMudar(event.target.value)} placeholder={placeholder} className="mt-2 h-12 w-full rounded-xl px-4 text-sm text-white outline-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} /></label>
}
