// Apenas preparação de NFS-e: não assina DPS, não transmite e não gera nota fiscal.
export const NFSE_ISSUER = Object.freeze({
  taxId: '48519335000147', legalName: 'GS GESTAO E CONTROLADORIA LTDA',
  municipality: 'Cuiabá', state: 'MT', municipalityCode: '5103403', taxRegime: 'Simples Nacional',
})
export const NFSE_BLOCK_REASON = 'Emissão indisponível: integração fiscal e certificado ainda não configurados e homologados. Salvar um rascunho não emite uma nota fiscal.'

function text(value, max = 200) {
  if (typeof value !== 'string') return ''
  if (value.length > max) throw new Error(`Campo excede o limite de ${max} caracteres.`)
  return value.trim()
}
export function validTaxId(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!/^\d{11}$|^\d{14}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false
  const size = digits.length === 11 ? 9 : 12
  for (let step = 0; step < 2; step++) {
    const base = digits.slice(0, size + step)
    let sum = 0
    for (let i = 0; i < base.length; i++) {
      const weight = size === 9 ? base.length + 1 - i : (base.length - 1 - i) % 8 + 2
      sum += Number(base[i]) * weight
    }
    const digit = sum % 11 < 2 ? 0 : 11 - sum % 11
    if (digit !== Number(digits[size + step])) return false
  }
  return true
}
export function normalizeFiscalCustomer(body = {}) {
  const name = text(body.name)
  const taxId = text(body.taxId, 25).replace(/\D/g, '')
  const email = text(body.email)
  const state = text(body.state, 2).toUpperCase()
  if (!name || !validTaxId(taxId)) throw new Error('Informe nome/razão social e CPF ou CNPJ válido.')
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.')
  if (state && !'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').includes(state)) throw new Error('UF inválida.')
  const postalCode = text(body.postalCode, 10).replace(/\D/g, '')
  if (postalCode && postalCode.length !== 8) throw new Error('CEP deve conter 8 dígitos.')
  return { name, taxId, email, postalCode, state, municipality: text(body.municipality),
    street: text(body.street), number: text(body.number, 30), complement: text(body.complement), district: text(body.district),
    municipalRegistration: text(body.municipalRegistration, 40) }
}
export function normalizeIssuerSettings(body = {}) {
  // CNPJ, município e regime são fixos; valores enviados pelo navegador são ignorados.
  return { ...NFSE_ISSUER, municipalRegistration: text(body.municipalRegistration ?? '240541', 40),
    postalCode: text(body.postalCode, 10), street: text(body.street), number: text(body.number, 30), district: text(body.district),
    complement: text(body.complement), defaultDescription: text(body.defaultDescription, 4000),
    serviceCode: text(body.serviceCode, 30), municipalServiceCode: text(body.municipalServiceCode, 30),
    accountantNotes: text(body.accountantNotes, 2000) }
}
export function normalizeInvoiceDraft(body = {}) {
  const customerId = text(body.customerId, 80)
  if (!/^[a-f0-9]{64}$/.test(customerId)) throw new Error('Selecione um cliente fiscal cadastrado.')
  const amount = text(body.amount, 15).replace(',', '.')
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(amount)) throw new Error('Informe um valor válido, com no máximo duas casas decimais, sem separador de milhar.')
  const [whole, fraction = ''] = amount.split('.')
  const amountCents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (amountCents <= 0) throw new Error('O valor deve ser maior que zero.')
  const competence = text(body.competence, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competence) || !Number.isFinite(Date.parse(`${competence}T12:00:00Z`)) || new Date(`${competence}T12:00:00Z`).toISOString().slice(0, 10) !== competence) {
    throw new Error('Informe uma data de competência válida.')
  }
  return { customerId, amountCents, competence, description: text(body.description, 4000),
    serviceCode: text(body.serviceCode, 30), notes: text(body.notes, 2000), status: 'draft' }
}
export function requireDraftRevision(current, revision) {
  if (current.status !== 'draft') throw new Error('Somente rascunhos podem ser alterados.')
  if (!Number.isInteger(revision) || revision !== current.revision) throw new Error('Este rascunho foi alterado em outra sessão. Reabra-o antes de salvar.')
}
