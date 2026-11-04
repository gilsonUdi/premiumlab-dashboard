import test from 'node:test'
import assert from 'node:assert/strict'
import { NFSE_ISSUER, normalizeFiscalCustomer, normalizeInvoiceDraft, normalizeIssuerSettings, validTaxId, requireDraftRevision } from '../../lib/nfse-drafts.mjs'

const customerId = 'a'.repeat(64)
const draft = { customerId, amount: '1500,05', competence: '2026-11-04', description: 'Serviço' }

test('valida CPF/CNPJ e rejeita documentos fictícios ou dígitos verificadores incorretos', () => {
  assert.equal(validTaxId(NFSE_ISSUER.taxId), true)
  assert.equal(validTaxId('529.982.247-25'), true)
  for (const value of ['11111111111', '00000000000000', '52998224724', '48519335000148', '123']) assert.equal(validTaxId(value), false)
})
test('salva apenas os campos fiscais permitidos do cliente', () => {
  const customer = normalizeFiscalCustomer({ name: ' Cliente ', taxId: '48.519.335/0001-47', email: 'teste@example.com', state: 'mt', role: 'admin', password: 'não salvar' })
  assert.equal(customer.name, 'Cliente'); assert.equal(customer.taxId, NFSE_ISSUER.taxId); assert.equal(customer.state, 'MT')
  assert.equal(customer.role, undefined); assert.equal(customer.password, undefined)
})
test('rejeita cadastro incompleto ou campos inválidos', () => {
  for (const data of [{}, { name: 'Nome', taxId: '123' }, { name: 'Nome', taxId: NFSE_ISSUER.taxId, email: 'email' }, { name: 'Nome', taxId: NFSE_ISSUER.taxId, state: 'XX' }]) {
    assert.throws(() => normalizeFiscalCustomer(data))
  }
})
test('emitente único não aceita alteração de CNPJ, município ou regime pelo navegador', () => {
  assert.equal(normalizeIssuerSettings({}).municipalRegistration, '240541')
  assert.equal(normalizeIssuerSettings({}).sendMunicipalRegistration, false)
  assert.equal(normalizeIssuerSettings({ sendMunicipalRegistration: true }).sendMunicipalRegistration, true)
  assert.equal(normalizeIssuerSettings({ sendMunicipalRegistration: 'true' }).sendMunicipalRegistration, false)
  const issuer = normalizeIssuerSettings({ taxId: '111', municipality: 'Outra', taxRegime: 'Outro', municipalRegistration: '123', certificate: 'secret', password: 'secret', emissionEnabled: true })
  assert.equal(issuer.taxId, NFSE_ISSUER.taxId); assert.equal(issuer.municipality, 'Cuiabá'); assert.equal(issuer.taxRegime, 'Simples Nacional')
  assert.equal(issuer.municipalRegistration, '123'); assert.equal(issuer.certificate, undefined); assert.equal(issuer.password, undefined); assert.equal(issuer.emissionEnabled, undefined)
})
test('rascunho usa centavos inteiros e não aceita status emitido ou identificação fiscal do cliente adulterada', () => {
  const result = normalizeInvoiceDraft({ ...draft, status: 'authorized', customer: { name: 'Forjado' }, issuerTaxId: 'outro' })
  assert.equal(result.amountCents, 150005); assert.equal(result.status, 'draft'); assert.equal(result.customer, undefined); assert.equal(result.issuerTaxId, undefined)
  assert.equal(normalizeInvoiceDraft({ ...draft, amount: '0.01' }).amountCents, 1)
})
test('não aceita valores negativos, arredondamento implícito, milhar ambíguo ou datas impossíveis', () => {
  for (const amount of ['0', '-1', '1.005', '1.500,00', '1e3', 'Infinity', '999999999']) assert.throws(() => normalizeInvoiceDraft({ ...draft, amount }))
  for (const competence of ['2026-02-30', '2026-13-01', '04/11/2026', '']) assert.throws(() => normalizeInvoiceDraft({ ...draft, competence }))
  assert.throws(() => normalizeInvoiceDraft({ ...draft, customerId: '../outro' }))
})
test('impede sobrescrever alterações de outra sessão e alterar uma nota não rascunho', () => {
  assert.doesNotThrow(() => requireDraftRevision({ status: 'draft', revision: 2 }, 2))
  assert.throws(() => requireDraftRevision({ status: 'draft', revision: 2 }, 1))
  assert.throws(() => requireDraftRevision({ status: 'authorized', revision: 2 }, 2))
})
