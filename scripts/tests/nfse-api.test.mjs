// Executar com node --experimental-vm-modules --test scripts/tests/nfse-api.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as domain from '../../lib/nfse-drafts.mjs'

async function api({ role = 'admin', active = true, revoked = false, authTime, emitError } = {}) {
  const docs = new Map()
  let writes = 0
  let checkedRevocation = false
  const emissions = []
  const snapshot = path => ({ exists: docs.has(path), data: () => docs.get(path) })
  const collection = path => ({
    doc: id => ({ path: `${path}/${id}`, get: async () => snapshot(`${path}/${id}`),
      set: async data => { writes++; docs.set(`${path}/${id}`, data) }, collection: name => collection(`${path}/${id}/${name}`) }),
    orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [], size: 0 }) }) }),
  })
  docs.set('users/admin', { role, active })
  const db = { collection, runTransaction: async callback => callback({ get: ref => ref.get(), set: (ref, data) => { writes++; docs.set(ref.path, data) } }) }
  const context = vm.createContext({ console, Date, JSON, Promise })
  const mocks = {
    'next/server': { NextResponse: { json: (data, options = {}) => ({ status: options.status || 200, data, headers: options.headers }) } },
    '@/lib/firebase-admin': {
      getFirebaseAdminAuth: () => ({ verifyIdToken: async (_token, checkRevoked) => { checkedRevocation = checkRevoked; if (revoked) throw new Error('revoked'); return { uid: 'admin', auth_time: authTime } } }),
      getFirebaseAdminDb: () => db,
    },
    '@/lib/nfse-drafts.mjs': domain,
    '@/lib/nfse/service.mjs': { createNfseService: () => ({ readiness: async () => ({ enabled: false, environment: 'test', blockers: ['Sem configuração de homologação'] }),
      emit: async args => { emissions.push(args); if (emitError) throw emitError; return { id: 'mock-operation', environment: args.environment, state: 'uncertain' } },
      documents: async (id, type) => ({ id, type, pdfBase64: 'JVBERi0=', fileName: 'DANFSe.pdf' }) }), publicOperation: value => value },
  }
  const module = new vm.SourceTextModule(readFileSync(new URL('../../app/api/admin/nfse/route.js', import.meta.url), 'utf8'), { context })
  await module.link(async name => {
    const exports = name === 'node:crypto' ? await import('node:crypto') : mocks[name]
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const key of Object.keys(exports)) this.setExport(key, exports[key]) }, { context })
  })
  await module.evaluate()
  const request = (body, token = 'token') => ({ headers: new Headers(token ? { Authorization: `Bearer ${token}` } : {}), text: async () => JSON.stringify(body) })
  return { post: (body, token) => module.namespace.POST(request(body, token)), get: token => module.namespace.GET(request(null, token)), docs, emissions, writes: () => writes, revocation: () => checkedRevocation }
}
test('API nega anônimos, empresas, administradores inativos e tokens revogados sem gravar', async () => {
  const anonymous = await api(); assert.equal((await anonymous.get('')).status, 401); assert.equal(anonymous.writes(), 0)
  for (const options of [{ role: 'company' }, { active: false }, { active: undefined, role: 'unknown' }, { revoked: true }]) {
    const instance = await api(options)
    assert.ok([401, 403].includes((await instance.post({ action: 'saveIssuer', data: {} })).status)); assert.equal(instance.writes(), 0)
  }
})
test('GET indica emissão bloqueada, sem cache e verifica revogação', async () => {
  const instance = await api(); const response = await instance.get()
  assert.equal(response.status, 200); assert.equal(response.data.emissionEnabled, false)
  assert.equal(response.headers['Cache-Control'], 'private, no-store'); assert.equal(instance.revocation(), true)
})

test('ação de PDF exige administrador ativo e delega apenas download sem cache', async () => {
  for (const role of ['company', 'professional']) {
    assert.equal((await (await api({ role })).post({ action: 'downloadPdf', id: 'test-id' })).status, 403)
  }
  const instance = await api()
  const result = await instance.post({ action: 'downloadPdf', id: 'test-id' })
  assert.equal(result.status, 200)
  assert.equal(result.data.type, 'pdf')
  assert.equal(result.headers['Cache-Control'], 'private, no-store')
  assert.equal(instance.writes(), 0)
})
test('emissão continua exigindo confirmação explícita', async () => {
  const instance = await api()
  assert.equal((await instance.post({ action: 'emit' })).status, 400)
  assert.equal((await instance.post({ action: 'emit', confirmed: false })).status, 400)
  assert.equal(instance.emissions.length, 0)
  assert.equal(instance.writes(), 0)
})

test('administrador com token válido emite sem restrição pela idade do login', async () => {
  for (const authTime of [undefined, Math.floor(Date.now() / 1000) - 660, Math.floor(Date.now() / 1000) - 86400]) {
    const instance = await api({ authTime })
    const response = await instance.post({ action: 'emit', confirmed: true, id: 'saved-draft', revision: 3, environment: 'test' })
    assert.equal(response.status, 200)
    assert.equal(instance.emissions.length, 1)
    assert.equal(instance.emissions[0].draftId, 'saved-draft')
    assert.equal(instance.emissions[0].uid, 'admin')
    assert.equal(instance.emissions[0].confirmed, true)
    assert.equal(instance.revocation(), true)
  }
})

test('API mostra validação fiscal controlada e mantém detalhes de falhas internas ocultos', async () => {
  const message = 'Endereço do cliente fiscal incompleto. Preencha os campos obrigatórios: Número.'
  const validation = await api({ emitError: new domain.NfseValidationError(message) })
  const rejected = await validation.post({ action: 'emit', confirmed: true })
  assert.equal(rejected.status, 400)
  assert.equal(rejected.data.error, message)
  const internal = await api({ emitError: new Error('private_key=SEGREDO /app/internal/path') })
  const failed = await internal.post({ action: 'emit', confirmed: true })
  assert.equal(failed.status, 500)
  assert.match(failed.data.error, /falha interna/)
  assert.doesNotMatch(failed.data.error, /Firebase|SEGREDO|private_key|internal\/path/)
})

test('remoção do limite de 10 minutos não permite emissão por anônimos, perfis não admin ou tokens inválidos', async () => {
  const body = { action: 'emit', confirmed: true, environment: 'production' }
  const anonymous = await api()
  assert.equal((await anonymous.post(body, '')).status, 401)
  assert.equal(anonymous.emissions.length, 0)
  for (const options of [{ role: 'company' }, { role: 'professional' }, { active: false }, { revoked: true }]) {
    const instance = await api(options)
    assert.ok([401, 403].includes((await instance.post(body)).status))
    assert.equal(instance.emissions.length, 0)
  }
})
test('cliente é salvo sem segredos e com ID estável pelo documento', async () => {
  const instance = await api()
  const response = await instance.post({ action: 'saveCustomer', data: { name: 'Cliente', taxId: domain.NFSE_ISSUER.taxId, certificate: 'secret' } })
  assert.equal(response.status, 200); assert.equal(response.data.customer.certificate, undefined)
  const again = await instance.post({ action: 'saveCustomer', data: { name: 'Cliente atualizado', taxId: domain.NFSE_ISSUER.taxId } })
  assert.equal(response.data.customer.id, again.data.customer.id)
})
test('rascunhos exigem cliente existente, usam cópia confiável e protegem revisão', async () => {
  const instance = await api()
  const customer = (await instance.post({ action: 'saveCustomer', data: { name: 'Cliente', taxId: domain.NFSE_ISSUER.taxId } })).data.customer
  const body = { action: 'saveDraft', id: '12345678-1234-4234-8234-123456789012', revision: 0,
    data: { customerId: customer.id, customer: { name: 'Falso' }, amount: '100,01', competence: '2026-11-04', status: 'authorized' } }
  const first = await instance.post(body)
  assert.equal(first.status, 200); assert.equal(first.data.draft.customer.name, 'Cliente'); assert.equal(first.data.draft.status, 'draft')
  assert.equal(first.data.draft.revision, 1)
  assert.equal((await instance.post(body)).status, 409)
  assert.equal((await instance.post({ ...body, revision: 1 })).data.draft.revision, 2)
  assert.equal((await instance.post({ ...body, id: '22345678-1234-4234-8234-123456789012', data: { ...body.data, customerId: 'a'.repeat(64) } })).status, 400)
})
