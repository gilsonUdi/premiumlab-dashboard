import { DOMParser } from '@xmldom/xmldom'
import { NFSE_ISSUER, normalizeFiscalCustomer } from '../nfse-drafts.mjs'

export const NFSE_NAMESPACE = 'http://www.sped.fazenda.gov.br/nfse'
export const NFSE_CONNECTOR_VERSION = 'axis-nfse-1.01-v1'
export const escapeXml = value => String(value ?? '').replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]))
const tag = (name, value) => `<${name}>${escapeXml(value)}</${name}>`
const optional = (name, value) => value ? tag(name, value) : ''
function requireValue(condition, message) { if (!condition) throw new Error(message) }

export function dpsId(series, number) {
  requireValue(/^\d{1,5}$/.test(String(series)), 'Série da DPS inválida.')
  requireValue(/^[1-9]\d{0,14}$/.test(String(number)), 'Número da DPS inválido.')
  return `DPS${NFSE_ISSUER.municipalityCode}2${NFSE_ISSUER.taxId}${String(series).padStart(5, '0')}${String(number).padStart(15, '0')}`
}
export function fiscalProfileIssues(issuer) {
  const issues = []
  if (issuer.serviceCode !== '170201' || issuer.nbsCode !== '118065300') issues.push('Confira os códigos contábeis aprovados: 170201 e NBS 118065300.')
  if (!issuer.municipalRegistration) issues.push('Informe a inscrição municipal.')
  if (issuer.fiscalProfileConfirmed !== true) issues.push('Confirme o perfil: ME/EPP no Simples (tributos federais e ISS pelo SN), sem regime especial e sem retenções, deduções ou descontos.')
  if (!/^(?:0|[1-9]\d?)(?:\.\d{1,2})?$/.test(issuer.totalTaxPercentSN || '') || Number(issuer.totalTaxPercentSN) > 99.99) issues.push('Informe o percentual aproximado de tributos do Simples validado para a emissão. Não usamos 6% nem 2,33% automaticamente.')
  return issues
}
export function buildDpsXml({ issuer, draft, environment, series, number, emittedAt }) {
  requireValue(['test', 'production'].includes(environment), 'Ambiente fiscal inválido.')
  const issues = fiscalProfileIssues(issuer)
  requireValue(!issues.length, issues.join(' '))
  requireValue(draft.serviceCode === '170201', 'Este conector inicial suporta somente o serviço contábil aprovado 170201.')
  requireValue(typeof draft.description === 'string' && draft.description.trim().length >= 1 && draft.description.length <= 2000 && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(draft.description), 'Descrição obrigatória: até 2.000 caracteres válidos para XML.')
  requireValue(Number.isSafeInteger(draft.amountCents) && draft.amountCents > 0, 'Valor do serviço inválido.')
  const customer = normalizeFiscalCustomer(draft.customer)
  requireValue(/^\d{7}$/.test(draft.customer.municipalityCode || ''), 'Informe o código IBGE de 7 dígitos do município do cliente.')
  requireValue(customer.postalCode && customer.street && customer.number && customer.district, 'Complete CEP, logradouro, número e bairro do cliente fiscal.')
  requireValue(customer.name.length <= 150 && customer.street.length <= 255 && customer.number.length <= 60 && customer.complement.length <= 156 && customer.district.length <= 60 && customer.email.length <= 80, 'Revise o comprimento dos campos do cliente conforme o leiaute fiscal.')
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(draft.competence || '') && new Date(`${draft.competence}T12:00:00Z`).toISOString().slice(0, 10) === draft.competence, 'Competência inválida.')
  requireValue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(emittedAt || ''), 'Data de emissão inválida.')
  const issuedAt = emittedAt.replace(/Z$/, '+00:00') // XSD nacional exige offset explícito, não o sufixo Z.
  const id = dpsId(series, number)
  const address = `<end><endNac>${tag('cMun', draft.customer.municipalityCode)}${tag('CEP', customer.postalCode)}</endNac>${tag('xLgr', customer.street)}${tag('nro', customer.number)}${optional('xCpl', customer.complement)}${tag('xBairro', customer.district)}</end>`
  // Prestador tpEmit=1: identificação e regime; nome/endereço recuperados do cadastro nacional.
  const provider = `<prest>${tag('CNPJ', NFSE_ISSUER.taxId)}${optional('IM', issuer.municipalRegistration)}<regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib></prest>`
  const taker = `<toma>${tag(customer.taxId.length === 14 ? 'CNPJ' : 'CPF', customer.taxId)}${optional('IM', customer.municipalRegistration)}${tag('xNome', customer.name)}${address}${optional('email', customer.email)}</toma>`
  const service = `<serv><locPrest>${tag('cLocPrestacao', NFSE_ISSUER.municipalityCode)}</locPrest><cServ><cTribNac>170201</cTribNac>${optional('cTribMun', issuer.municipalServiceCode)}${tag('xDescServ', draft.description.trim())}<cNBS>118065300</cNBS></cServ></serv>`
  // O ISS é parametrizado pelo Sistema Nacional; não replicar alíquota histórica em pAliq.
  const values = `<valores><vServPrest>${tag('vServ', (draft.amountCents / 100).toFixed(2))}</vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib>${tag('pTotTribSN', Number(issuer.totalTaxPercentSN).toFixed(2))}</totTrib></trib></valores>`
  return { id, xml: `<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="${NFSE_NAMESPACE}" versao="1.01"><infDPS Id="${id}">${tag('tpAmb', environment === 'production' ? 1 : 2)}${tag('dhEmi', issuedAt)}<verAplic>AxisNfse1.0</verAplic>${tag('serie', Number(series))}${tag('nDPS', number)}${tag('dCompet', draft.competence)}<tpEmit>1</tpEmit><cLocEmi>5103403</cLocEmi>${provider}${taker}${service}${values}</infDPS></DPS>` }
}

export function readAuthorizedXml(xml, expected) {
  requireValue(typeof xml === 'string' && xml.length < 600000 && !/<!DOCTYPE|<!ENTITY/i.test(xml), 'XML fiscal inválido ou acima do limite suportado.')
  const doc = new DOMParser({ onError: level => { if (level !== 'warning') throw new Error('XML fiscal malformado.') } }).parseFromString(xml, 'text/xml')
  requireValue(doc.documentElement.localName === 'NFSe' && doc.documentElement.namespaceURI === NFSE_NAMESPACE, 'O retorno não contém uma NFS-e nacional autorizada.')
  const elements = (node, name) => Array.from(node.getElementsByTagNameNS(NFSE_NAMESPACE, name))
  const one = (node, name) => { const list = elements(node, name); requireValue(list.length === 1, `Retorno fiscal ambíguo: ${name}.`); return list[0] }
  const info = one(doc, 'infNFSe')
  const infDps = one(info, 'infDPS')
  const key = info.getAttribute('Id').replace(/^NFS/, '')
  requireValue(/^\d{50}$/.test(key), 'Chave fiscal inválida no retorno.')
  requireValue(infDps.getAttribute('Id') === expected.dpsId, 'A DPS retornada não corresponde à solicitação.')
  requireValue(one(one(infDps, 'prest'), 'CNPJ').textContent === NFSE_ISSUER.taxId, 'Emitente divergente no XML autorizado.')
  requireValue(one(infDps, 'tpAmb').textContent === (expected.environment === 'production' ? '1' : '2'), 'Ambiente divergente no retorno.')
  requireValue(Math.round(Number(one(one(infDps, 'vServPrest'), 'vServ').textContent) * 100) === expected.amountCents, 'Valor divergente no retorno fiscal.')
  if (expected.customerTaxId) requireValue(one(one(infDps, 'toma'), expected.customerTaxId.length === 14 ? 'CNPJ' : 'CPF').textContent === expected.customerTaxId, 'Tomador divergente no retorno fiscal; a série pode ter sido usada por outro emissor.')
  if (expected.competence) requireValue(one(infDps, 'dCompet').textContent === expected.competence, 'Competência divergente no retorno fiscal.')
  if (expected.serviceCode) requireValue(one(infDps, 'cTribNac').textContent === expected.serviceCode, 'Serviço divergente no retorno fiscal.')
  return { key, number: one(info, 'nNFSe').textContent, xml }
}
