import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'
import { DOMParser } from '@xmldom/xmldom'
import { readAuthorizedXml, NFSE_NAMESPACE } from './xml.mjs'

const money = value => value === '' ? '-' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value))
const percent = value => value === '' ? '-' : `${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`
const civilDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : '-'
const dateTime = value => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Cuiaba', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)) : '-'
const mapped = (value, labels) => value ? (labels[value] || `Código ${value}`) : '-'

// Somente XML já autorizado e correspondente à operação. Não consulta nem transmite ao governo.
export function readDanfseData(xml, expected) {
  const authorized = readAuthorizedXml(xml, expected)
  if (expected.key && authorized.key !== expected.key) throw new Error('Chave divergente no XML armazenado. Use a consulta oficial.')
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const info = doc.getElementsByTagNameNS(NFSE_NAMESPACE, 'infNFSe')[0]
  const node = (base, path) => path.split('/').reduce((parent, name) => Array.from(parent?.childNodes || [])
    .find(child => child.nodeType === 1 && child.namespaceURI === NFSE_NAMESPACE && child.localName === name), base)
  const at = path => node(info, path)?.textContent?.trim() || ''
  const d = path => at(`DPS/infDPS/${path}`)
  if (at('cStat') !== '100') throw new Error('PDF disponível somente para XML de NFS-e autorizada (cStat 100). Confira a consulta oficial.')
  if (d('prest/regTrib/opSimpNac') !== '3' || d('prest/regTrib/regApTribSN') !== '1' || d('prest/regTrib/regEspTrib') !== '0'
    || node(info, 'DPS/infDPS/valores/trib/tribFed') || node(info, 'DPS/infDPS/valores/vDedRed')
    || node(info, 'DPS/infDPS/valores/trib/tribMun/exigSusp') || node(info, 'DPS/infDPS/valores/trib/tribMun/BM')) {
    throw new Error('O PDF local suporta o perfil atual do emitente: ME/EPP com tributos pelo Simples, sem regime especial, retenções federais ou deduções. Use a consulta oficial para este XML.')
  }
  // O emissor atual suporta somente este perfil. Não imprimir grupos futuros omitindo tributos.
  if (node(info, 'IBSCBS') || node(info, 'DPS/infDPS/IBSCBS') || d('subst/chSubstda') || d('serv/obra/cObra') || d('serv/atvEvento/idAtvEvt')) {
    throw new Error('Este XML possui grupos fiscais ainda não suportados pelo PDF local. Baixe o XML e use a consulta oficial / DANFSe.')
  }
  const party = (base, addressBase) => ({
    name: at(`${base}/xNome`), taxId: at(`${base}/CNPJ`) || at(`${base}/CPF`) || at(`${base}/NIF`),
    im: at(`${base}/IM`), phone: at(`${base}/fone`), email: at(`${base}/email`),
    address: ['xLgr', 'nro', 'xCpl', 'xBairro'].map(key => at(`${addressBase}/${key}`)).filter(Boolean).join(', '),
    city: at(`${addressBase}/xMun`), state: at(`${addressBase}/UF`), ibge: at(`${addressBase}/cMun`) || at(`${addressBase}/endNac/cMun`),
    postalCode: at(`${addressBase}/CEP`) || at(`${addressBase}/endNac/CEP`),
  })
  const provider = party('emit', 'emit/enderNac')
  provider.city ||= at('xLocEmi')
  const customer = party('DPS/infDPS/toma', 'DPS/infDPS/toma/end')
  const intermediary = party('DPS/infDPS/interm', 'DPS/infDPS/interm/end')
  return { ...authorized, test: d('tpAmb') === '2', at, d, provider, customer, intermediary,
    consultationUrl: `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${authorized.key}` }
}

export async function buildDanfsePdf(xml, expected) {
  const data = readDanfseData(xml, expected)
  const { at, d } = data
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${data.test ? 'SEM VALOR FISCAL - ' : ''}DANFSe ${data.number}`)
  pdf.setAuthor('Axis - Portal do Cliente')
  pdf.setSubject('Representação do XML autorizado da NFS-e Nacional')
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const page = pdf.addPage([595.28, 841.89])
  const H = page.getHeight(), M = 5.67, W = page.getWidth() - M * 2
  const ink = rgb(0, 0, 0), gray = rgb(0.95, 0.95, 0.95)
  // Nunca substitua caracteres fiscais silenciosamente. O XML original permanece disponível.
  const clean = value => Array.from(String(value || '-').replace(/[\r\n\t]+/g, ' ')).map(char => {
    try { regular.encodeText(char); return char } catch { throw new Error('O XML contém caracteres não suportados pela fonte do PDF local. Use o XML autorizado e a consulta oficial / DANFSe.') }
  }).join('')
  function line(x1, top1, x2, top2, thickness = 0.5) {
    page.drawLine({ start: { x: x1, y: H - top1 }, end: { x: x2, y: H - top2 }, thickness, color: ink })
  }
  function text(value, x, top, width, { size = 7, font = regular, maxLines = 1, color = ink } = {}) {
    const words = clean(value).split(/\s+/), lines = []; let current = ''
    for (const word of words) {
      // Também quebra chaves ou tokens longos sem espaços.
      for (const chunk of word.match(/.{1,60}/gu) || ['']) {
        if (font.widthOfTextAtSize(current ? `${current} ${chunk}` : chunk, size) <= width) current = current ? `${current} ${chunk}` : chunk
        else { if (current) lines.push(current); current = chunk }
        while (font.widthOfTextAtSize(current, size) > width && current.length > 1) {
          let cut = current.length - 1
          while (cut > 1 && font.widthOfTextAtSize(current.slice(0, cut), size) > width) cut--
          lines.push(current.slice(0, cut)); current = current.slice(cut)
        }
      }
    }
    if (current) lines.push(current)
    if (lines.length > maxLines) {
      let last = lines[maxLines - 1] || ''
      while (last && font.widthOfTextAtSize(`${last}...`, size) > width) last = last.slice(0, -1)
      lines[maxLines - 1] = `${last}...`
    }
    lines.slice(0, maxLines).forEach((value, index) => page.drawText(value, { x, y: H - top - size - index * (size + 2), size, font, color }))
  }
  let y = M
  function row(cells, height = 27) {
    let x = M
    for (const cell of cells) {
      const width = W * (cell.span || 1) / 4
      if (cell.title || cell.shaded) page.drawRectangle({ x, y: H - y - height, width, height, color: gray })
      text(cell.label, x + 4, y + 3, width - 8, { size: cell.title ? 7 : 6, font: bold, maxLines: cell.title ? 2 : 1 })
      if (!cell.title) text(cell.value || '-', x + 4, y + 13, width - 8, { maxLines: Math.max(1, Math.floor((height - 14) / 9)) })
      x += width
    }
    y += height
  }
  const field = (label, value, span = 1) => ({ label, value, span })
  const section = label => { line(M, y, M + W, y); row([{ label, title: true, span: 4 }], 15) }
  const pair = (a, b) => [a, b].filter(Boolean).join(' / ') || '-'
  const cash = path => money(at(path))
  const dcash = path => money(d(path))
  page.drawRectangle({ x: M, y: H - y - 42, width: W, height: 42, color: gray })
  const logo = await pdf.embedPng(await readFile(join(process.cwd(), 'public/nfse/logo-nfse.png')))
  const logoSize = logo.scaleToFit(112, 28)
  page.drawImage(logo, { x: M + 7, y: H - y - 32, ...logoSize })
  text('DANFSe v2.0', M + 153, y + 3, 260, { size: 9, font: bold })
  text('Documento Auxiliar da NFS-e', M + 153, y + 15, 260, { size: 9, font: bold })
  if (data.test) text('NFS-e SEM VALIDADE JURÍDICA', M + 153, y + 28, 260, { size: 9, font: bold, color: rgb(1, 0, 0) })
  text(`Município: ${pair(data.provider.city, data.provider.state)}`, M + W * 0.77, y + 4, W * 0.23 - 5, { size: 8, maxLines: 2 })
  text(`Gerador: ${mapped(at('ambGer'), { 1: 'Municipal', 2: 'Nacional' })}`, M + W * 0.77, y + 25, W * 0.23 - 5, { size: 6 })
  text(data.test ? 'Homologação - sem valor fiscal' : 'Produção', M + W * 0.77, y + 33, W * 0.23 - 5, { size: 6 })
  y += 44
  const qrTop = y
  const qr = await pdf.embedPng(await QRCode.toBuffer(data.consultationUrl, { type: 'png', width: 240, margin: 4, errorCorrectionLevel: 'M' }))
  page.drawImage(qr, { x: M + W * 0.83, y: H - qrTop - 57, width: 57, height: 57 })
  text('A autenticidade desta NFS-e pode ser verificada pelo QR Code ou pela chave no portal nacional.', M + W * 0.76, qrTop + 58, W * 0.24 - 5, { size: 6, maxLines: 4 })
  row([field('CHAVE DE ACESSO DA NFS-e', data.key, 3)], 27)
  row([field('NÚMERO DA NFS-e', data.number), field('COMPETÊNCIA DA NFS-e', civilDate(d('dCompet'))), field('EMISSÃO DA NFS-e (CUIABÁ)', dateTime(at('dhProc')))], 27)
  row([field('NÚMERO DA DPS', d('nDPS')), field('SÉRIE DA DPS', d('serie')), field('EMISSÃO DA DPS (CUIABÁ)', dateTime(d('dhEmi')))], 27)
  row([{ ...field('EMITENTE DA NFS-e', mapped(d('tpEmit'), { 1: 'Prestador', 2: 'Tomador', 3: 'Intermediário' })), shaded: true }, field('SITUAÇÃO DA NFS-e', 'Autorizada (100)'), field('FINALIDADE', mapped(d('finNFSe') || '0', { 0: 'Regular' }))], 27)
  function partyBlock(label, party, provider = false) {
    line(M, y, M + W, y)
    row([{ label, title: true }, field('CNPJ / CPF / NIF', party.taxId), field('Inscrição Municipal', party.im), field('Telefone', party.phone)])
    row([field('Nome / Nome Empresarial', party.name, 2), field('Município / UF', pair(party.city, party.state)), field('Código IBGE / CEP', pair(party.ibge, party.postalCode))], 32)
    row([field('Endereço', party.address, 2), field('E-mail', party.email, 2)], 32)
    if (provider) row([field('Simples Nacional Na Competência', mapped(d('prest/regTrib/opSimpNac'), { 1: 'Não optante', 2: 'Optante - MEI', 3: 'Optante - ME/EPP' }), 2), field('Regime De Apuração Pelo SN', mapped(d('prest/regTrib/regApTribSN'), { 1: 'Tributos federais e ISS pelo Simples Nacional', 2: 'Tributos federais pelo SN e ISS fora do SN', 3: 'Tributos federais e ISS fora do SN' }), 2)], 27)
  }
  partyBlock('PRESTADOR / FORNECEDOR', data.provider, true)
  partyBlock('TOMADOR / ADQUIRENTE', data.customer)
  section('DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e')
  if (data.intermediary.taxId) partyBlock('INTERMEDIÁRIO DA OPERAÇÃO', data.intermediary)
  else section('INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e')
  line(M, y, M + W, y)
  row([{ label: 'SERVIÇO PRESTADO', title: true }, field('Tributação Nacional / Municipal', pair(d('serv/cServ/cTribNac'), d('serv/cServ/cTribMun'))), field('Código Da NBS', d('serv/cServ/cNBS')), field('Local Da Prestação', pair(at('xLocPrestacao'), d('serv/locPrest/cPaisPrestacao')))], 27)
  text(at('xTribMun') || at('xTribNac'), M + 4, y + 2, W - 8, { maxLines: 2 }); y += 20
  text('Descrição Do Serviço', M + 4, y, W - 8, { size: 6, font: bold }); y += 10
  text(d('serv/cServ/xDescServ').slice(0, 1297) + (d('serv/cServ/xDescServ').length > 1297 ? '...' : ''), M + 4, y, W - 8, { maxLines: 10 }); y += 94
  line(M, y, M + W, y)
  row([{ label: 'TRIBUTAÇÃO MUNICIPAL (ISSQN)', title: true }, field('Tipo De Tributação', mapped(d('valores/trib/tribMun/tribISSQN'), { 1: 'Operação tributável', 2: 'Imunidade', 3: 'Exportação', 4: 'Não incidência' })), field('Município De Incidência', at('xLocIncid'), 2)])
  row([field('BC ISSQN', cash('valores/vBC')), field('Alíquota Aplicada', percent(at('valores/pAliqAplic'))), field('Retenção Do ISSQN', mapped(d('valores/trib/tribMun/tpRetISSQN'), { 1: 'Não retido', 2: 'Retido pelo tomador', 3: 'Retido pelo intermediário' })), field('ISSQN Apurado', cash('valores/vISSQN'))])
  line(M, y, M + W, y)
  row([{ label: 'TRIBUTAÇÃO FEDERAL (EXCETO CBS)', title: true }, field('IRRF', dcash('valores/trib/tribFed/vRetIRRF')), field('Contribuição Previdenciária Retida', dcash('valores/trib/tribFed/vRetCP')), field('Contribuições Sociais Retidas', dcash('valores/trib/tribFed/vRetCSLL'))])
  section('TRIBUTAÇÃO IBS / CBS')
  row([field('CST / Classificação Tributária', ''), field('Total IBS', ''), field('Total CBS', ''), field('Base De Cálculo IBS / CBS', '')])
  line(M, y, M + W, y)
  row([{ label: 'VALOR TOTAL DA NFS-e', title: true }, field('Valor Da Operação / Serviço', dcash('valores/vServPrest/vServ')), field('Desconto Incondicionado', dcash('valores/vDescCondIncond/vDescIncond')), field('Desconto Condicionado', dcash('valores/vDescCondIncond/vDescCond'))])
  row([field('Total Das Retenções', cash('valores/vTotalRet')), field('Valor Líquido Da NFS-e', cash('valores/vLiq')), field('Total IBS / CBS', ''), { ...field('Valor Líquido Da NFS-e + IBS/CBS', ''), shaded: true }])
  section('INFORMAÇÕES COMPLEMENTARES')
  const additional = [d('serv/infoCompl/xInfComp'), at('xOutInf'), d('valores/trib/totTrib/pTotTribSN') ? `Tributos aproximados pelo Simples Nacional: ${percent(d('valores/trib/totTrib/pTotTribSN'))}.` : ''].filter(Boolean).join(' ')
  text(additional, M + 4, y + 3, W - 8, { maxLines: 4 }); y += 43
  text('Dados conforme XML autorizado armazenado. Consulte a situação atual pelo QR Code ou no portal nacional.', M + 4, H - M - 12, W - 8, { size: 6 })
  if (y > H - M) throw new Error('Os dados excedem o espaço do PDF local. Use a consulta oficial / DANFSe e o XML autorizado.')
  page.drawRectangle({ x: M, y: M, width: W, height: H - 2 * M, borderColor: ink, borderWidth: 1 })
  return { bytes: await pdf.save(), fileName: `${data.test ? 'SEM-VALOR-FISCAL-' : ''}DANFSe-${data.key}.pdf` }
}
