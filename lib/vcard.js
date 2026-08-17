export function escaparVcard(valor) {
  return String(valor || '')
    .trim()
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replace(/\r?\n/g, '\\n')
}

function nomeEstruturado(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean)
  if (partes.length < 2) return `${escaparVcard(partes[0] || '')};;;;`
  const sobrenome = partes.pop()
  return `${escaparVcard(sobrenome)};${escaparVcard(partes.join(' '))};;;`
}

export function normalizarInstagram(valor) {
  const texto = String(valor || '').trim()
  if (!texto) return ''
  if (/^https?:\/\//i.test(texto)) {
    try {
      return ['http:', 'https:'].includes(new URL(texto).protocol) ? texto : ''
    } catch {
      return ''
    }
  }
  const usuario = texto.replace(/^@/, '').replace(/^instagram\.com\//i, '').replace(/\/+$/, '')
  return /^[a-zA-Z0-9._]+$/.test(usuario) ? `https://instagram.com/${usuario}` : ''
}

export function normalizarLinkedin(valor) {
  const texto = String(valor || '').trim()
  if (!texto) return ''
  if (/^https?:\/\//i.test(texto)) {
    try {
      return ['http:', 'https:'].includes(new URL(texto).protocol) ? texto : ''
    } catch {
      return ''
    }
  }
  if (/^(?:www\.)?linkedin\.com\//i.test(texto)) return `https://${texto}`
  const usuario = texto.replace(/^@/, '').replace(/^in\//i, '').replace(/\/+$/, '')
  return /^[a-zA-Z0-9._-]+$/.test(usuario) ? `https://www.linkedin.com/in/${usuario}` : ''
}

export function montarVcard(contato) {
  const linhas = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${nomeEstruturado(contato.nome)}`,
    `FN:${escaparVcard(contato.nome)}`,
  ]
  if (contato.empresa) linhas.push(`ORG:${escaparVcard(contato.empresa)}`)
  if (contato.cargo) linhas.push(`TITLE:${escaparVcard(contato.cargo)}`)
  if (contato.telefone) linhas.push(`TEL;TYPE=CELL,VOICE:${escaparVcard(contato.telefone)}`)
  if (contato.email) linhas.push(`EMAIL;TYPE=INTERNET,WORK:${escaparVcard(contato.email)}`)
  if (contato.site) linhas.push(`URL:${escaparVcard(contato.site)}`)
  if (contato.site2) linhas.push(`URL:${escaparVcard(contato.site2)}`)
  const instagram = normalizarInstagram(contato.instagram)
  if (instagram) linhas.push(`X-SOCIALPROFILE;TYPE=instagram:${escaparVcard(instagram)}`)
  const linkedin = normalizarLinkedin(contato.linkedin)
  if (linkedin) linhas.push(`X-SOCIALPROFILE;TYPE=linkedin:${escaparVcard(linkedin)}`)
  if (contato.endereco) linhas.push(`ADR;TYPE=WORK:;;${escaparVcard(contato.endereco)};;;;`)
  const foto = String(contato.foto || '').match(/^data:image\/(jpeg|png|webp);base64,(.+)$/i)
  if (foto) {
    const tipo = foto[1].toUpperCase() === 'JPG' ? 'JPEG' : foto[1].toUpperCase()
    const linhaFoto = `PHOTO;ENCODING=b;TYPE=${tipo}:${foto[2]}`
    linhas.push(linhaFoto.match(/.{1,74}/g).join('\r\n '))
  }
  linhas.push('END:VCARD')
  return linhas.join('\r\n')
}
