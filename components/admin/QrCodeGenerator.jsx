'use client'

import { useState } from 'react'
import QRCode from 'qrcode'
import { Download, Link2, QrCode } from 'lucide-react'

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

export default function QrCodeGenerator() {
  const [url, setUrl] = useState('')
  const [tamanho, setTamanho] = useState(1024)
  const [png, setPng] = useState('')
  const [svg, setSvg] = useState('')
  const [erro, setErro] = useState('')
  const [gerando, setGerando] = useState(false)

  async function gerar(event) {
    event.preventDefault()
    const valor = url.trim()
    if (!validarUrl(valor)) {
      setErro('Informe uma URL completa, começando com http:// ou https://.')
      setPng('')
      setSvg('')
      return
    }
    setGerando(true)
    try {
      const opcoes = { errorCorrectionLevel: 'H', margin: 3, width: tamanho, color: { dark: '#07152B', light: '#FFFFFF' } }
      const [imagemPng, imagemSvg] = await Promise.all([
        QRCode.toDataURL(valor, { ...opcoes, type: 'image/png' }),
        QRCode.toString(valor, { ...opcoes, type: 'svg' }),
      ])
      setPng(imagemPng)
      setSvg(imagemSvg)
      setErro('')
    } catch {
      setErro('Não foi possível gerar o QR Code. Verifique a URL e tente novamente.')
    } finally {
      setGerando(false)
    }
  }

  function baixarSvg() {
    baixar(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), 'qrcode.svg')
  }

  return <>
    <header className="mb-6">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: '#28497E' }}>Ferramentas</p>
      <h2 className="text-2xl font-bold tracking-tight text-white">Gerador de QR Code</h2>
      <p className="mt-1 text-sm" style={{ color: '#AEC3DF' }}>Cole uma URL para gerar arquivos prontos para uso digital ou impressão.</p>
    </header>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <form onSubmit={gerar} className="rounded-2xl p-5 sm:p-6" style={{ background: '#0A162B', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: 'rgba(201,164,92,0.1)', color: '#DAB975', border: '1px solid rgba(201,164,92,0.16)' }}><Link2 size={20} /></div>
        <label className="block text-sm font-semibold text-white" htmlFor="qr-url">URL de destino</label>
        <input id="qr-url" type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://exemplo.com.br/arquivo.vcf" className="mt-2 h-12 w-full rounded-xl px-4 text-sm text-white outline-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} autoComplete="url" />

        <label className="mt-5 block text-sm font-semibold text-white" htmlFor="qr-size">Tamanho do PNG</label>
        <select id="qr-size" value={tamanho} onChange={event => setTamanho(Number(event.target.value))} className="mt-2 h-12 w-full rounded-xl px-4 text-sm text-white outline-none" style={{ background: '#0D1D38', border: '1px solid rgba(255,255,255,0.08)' }}>
          <option value={512}>512 × 512 px</option><option value={1024}>1024 × 1024 px</option><option value={2048}>2048 × 2048 px</option>
        </select>

        {erro ? <div className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(244,124,116,0.08)', color: '#F7A29D', border: '1px solid rgba(244,124,116,0.15)' }}>{erro}</div> : null}
        <button type="submit" className="portal-primary-button mt-6 w-full justify-center" disabled={gerando}>{gerando ? 'Gerando...' : 'Gerar QR Code'}<QrCode size={16} /></button>
        <p className="mt-4 text-xs leading-5" style={{ color: '#7E97BC' }}>O QR Code é gerado no seu navegador. A URL informada não é armazenada nem enviada para serviços externos.</p>
      </form>

      <section className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl p-5 sm:p-6" style={{ background: '#0A162B', border: '1px solid rgba(255,255,255,0.05)' }}>
        {png ? <>
          <div className="w-full max-w-[300px] overflow-hidden rounded-2xl bg-white p-3"><img src={png} alt="Prévia do QR Code gerado" className="h-auto w-full" /></div>
          <p className="mt-4 max-w-full truncate text-center text-xs" style={{ color: '#7E97BC' }} title={url}>{url}</p>
          <div className="mt-5 grid w-full grid-cols-2 gap-3">
            <button type="button" className="portal-ghost-button justify-center" onClick={() => baixar(png, 'qrcode.png')}><Download size={14} />Baixar PNG</button>
            <button type="button" className="portal-ghost-button justify-center" onClick={baixarSvg}><Download size={14} />Baixar SVG</button>
          </div>
        </> : <div className="text-center"><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', color: '#28497E', border: '1px dashed rgba(126,151,188,0.2)' }}><QrCode size={34} /></div><p className="mt-4 text-sm font-medium text-white">A prévia aparecerá aqui</p><p className="mt-1 text-xs" style={{ color: '#7E97BC' }}>Informe uma URL e clique em gerar.</p></div>}
      </section>
    </div>
  </>
}
