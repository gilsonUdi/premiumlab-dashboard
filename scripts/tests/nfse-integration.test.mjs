import test from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { EventEmitter } from 'node:events'
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import forge from 'node-forge'
import { SignedXml } from 'xml-crypto'
import { DOMParser } from '@xmldom/xmldom'
import { normalizeIssuerSettings, NFSE_ISSUER } from '../../lib/nfse-drafts.mjs'
import { buildDpsXml, dpsId, formatDpsEmissionTime, readAuthorizedXml, NFSE_XML_LAYOUTS } from '../../lib/nfse/xml.mjs'
import { loadCertificate, signDps } from '../../lib/nfse/certificate.mjs'
import { createNfseService } from '../../lib/nfse/service.mjs'
import { createSefinClient, sefinBase, packDps, unpackFiscalXml } from '../../lib/nfse/sefin.mjs'

const now = new Date('2026-11-04T12:00:00Z')
const issuer = normalizeIssuerSettings({ fiscalProfileConfirmed: true, totalTaxPercentSN: '6' })
const draftId = '12345678-1234-4234-8234-123456789012'
const draft = { status: 'draft', revision: 1, customerId: 'a'.repeat(64),
  customer: { name: 'Cliente & Companhia', taxId: '52998224725', municipalityCode: '5103403', postalCode: '78025300', street: 'Rua', number: '1', district: 'Porto' },
  serviceCode: '170201', description: 'Controladoria & processos <mensal>', amountCents: 250000, competence: '2026-11-04' }
const env = { NFSE_ENABLED: 'true', NFSE_ENVIRONMENT: 'test', NFSE_DPS_SERIES_TEST: '1', NFSE_DPS_SERIES_PRODUCTION: '2' }
const built = (environment = 'test') => buildDpsXml({ issuer, draft, environment, series: '1', number: '1', emittedAt: '2026-11-04T12:00:00Z' })
const authorizedResponse = (xml, environment = 'test', key = '1'.repeat(50)) => ({ status: 201, payload: { chaveAcesso: key,
  nfseXmlGZipB64: gzipSync(Buffer.from(`<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${key}"><nNFSe>999</nNFSe><cStat>100</cStat><dhProc>2026-11-04T09:00:00-03:00</dhProc><valores><vLiq>2500.00</vLiq></valores>${xml.replace(/<\?xml[^>]*\?>/, '')}</infNFSe></NFSe>`)).toString('base64') } })

function memoryDb() {
  const documents = new Map([['axisFiscal/issuer', issuer], [`axisFiscal/issuer/drafts/${draftId}`, draft]])
  const snapshot = path => ({ exists: documents.has(path), data: () => documents.get(path) })
  const ref = path => ({ id: path.split('/').at(-1), path, get: async () => snapshot(path),
    set: async (data, options) => documents.set(path, options?.merge ? { ...documents.get(path), ...data } : data),
    collection: name => collection(`${path}/${name}`) })
  const collection = path => ({ doc: id => ref(`${path}/${id}`) })
  let lock = Promise.resolve()
  return { documents, collection, runTransaction: callback => {
    const result = lock.then(async () => {
      const pending = []
      const value = await callback({ get: async target => snapshot(target.path), set: (target, data, options) => pending.push([target, data, options]) })
      for (const [target, data, options] of pending) await target.set(data, options)
      return value
    })
    lock = result.catch(() => {})
    return result
  } }
}
function fixture({ failure = false, rejection = false, rejectionCode = 'E0123', rejectionMessage = 'Campo inválido para emissão', processingTime, environment = 'test', initialEnv = {} } = {}) {
  const db = memoryDb()
  let submissions = 0; let reads = 0; let sentXml
  const certificate = { fingerprint: 'certificate-fingerprint', taxId: NFSE_ISSUER.taxId, expiresAt: '2027-01-01T00:00:00Z' }
  const runtimeEnv = { ...env, NFSE_ENVIRONMENT: environment, ...initialEnv }
  const service = createNfseService({ db, env: runtimeEnv, clock: () => now,
    loadCertificate: async () => certificate, signDps: xml => xml,
    createClient: () => ({ close() {}, submit: async xml => { submissions++; sentXml = xml; if (failure) throw new Error('Timeout simulado'); if (rejection && submissions === 1) return { status: 400, payload: { dataHoraProcessamento: processingTime, erros: [{ Codigo: rejectionCode, Descricao: rejectionMessage }] } }; const response = authorizedResponse(xml); if (processingTime !== undefined) response.payload.dataHoraProcessamento = processingTime; return response },
      lookupDps: async () => { reads++; return rejection && submissions === 1 ? { status: 404, payload: {} } : { status: 200, payload: { chaveAcesso: '1'.repeat(50) } } },
      lookupInvoice: async () => { reads++; return { ...authorizedResponse(sentXml), status: 200 } } }),
  })
  return { db, service, runtimeEnv, submissions: () => submissions, reads: () => reads,
    emit: () => service.emit({ draftId, revision: 1, environment, confirmed: true, uid: 'admin' }) }
}
test('DPS usa ambiente separado, identificação determinística e XML escapado, sem impostos históricos automáticos', () => {
  const { xml, id } = built()
  assert.equal(id, 'DPS510340324851933500014700001000000000000001')
  assert.ok(xml.includes('<tpAmb>2</tpAmb>')); assert.ok(xml.includes('&amp;')); assert.ok(xml.includes('&lt;mensal&gt;'))
  assert.ok(xml.includes('<cTribNac>170201</cTribNac>')); assert.ok(xml.includes('<cNBS>118065300</cNBS>'))
  assert.ok(!xml.includes('<pAliq>')); assert.ok(!xml.includes('2.33'))
  assert.throws(() => buildDpsXml({ issuer: normalizeIssuerSettings({}), draft, environment: 'test', series: 1, number: 1, emittedAt: '2026-11-04T12:00:00Z' }))
  assert.throws(() => dpsId('x', '1'))
})
test('IM permanece cadastrada e só aparece no prestador do XML quando explicitamente habilitada', () => {
  assert.equal(issuer.municipalRegistration, '240541')
  assert.equal(issuer.sendMunicipalRegistration, false)
  for (const environment of ['test', 'production']) {
    for (const sendMunicipalRegistration of [false, true]) {
      const { xml } = buildDpsXml({ issuer: { ...issuer, sendMunicipalRegistration }, draft, environment, series: '1', number: '1', emittedAt: now.toISOString().replace('.000Z', 'Z') })
      const doc = new DOMParser().parseFromString(xml, 'text/xml')
      const provider = doc.getElementsByTagName('prest')[0]
      assert.equal(provider.getElementsByTagName('IM').length, sendMunicipalRegistration ? 1 : 0)
    }
  }
})

test('dhEmi usa Cuiabá preservando o instante, inclusive virada de dia e entrada com outro fuso', () => {
  for (const [input, expected] of [
    ['2026-11-04T22:06:13Z', '2026-11-04T18:06:13-04:00'],
    ['2026-11-04T19:06:13-03:00', '2026-11-04T18:06:13-04:00'],
    ['2026-11-04T18:06:13-04:00', '2026-11-04T18:06:13-04:00'],
    ['2026-11-05T02:30:00+00:00', '2026-11-04T22:30:00-04:00'],
    ['2026-11-04T04:00:00Z', '2026-11-04T00:00:00-04:00'],
  ]) {
    assert.equal(formatDpsEmissionTime(input), expected)
    assert.equal(Date.parse(formatDpsEmissionTime(input)), Date.parse(input))
    for (const environment of ['test', 'production']) {
      const { xml } = buildDpsXml({ issuer, draft, environment, series: '1', number: '1', emittedAt: input })
      assert.ok(xml.includes(`<dhEmi>${expected}</dhEmi>`))
    }
  }
  for (const value of ['invalid', '2026-11-04T22:06:13', '2026-99-99T22:06:13Z']) assert.throws(() => formatDpsEmissionTime(value), /Data de emissão inválida/)
})

test('NT009 R1 só na homologação: finalidade regular e NBS antes da descrição, mantendo versao 1.01', () => {
  const testXml = built('test')
  const productionXml = built('production')
  assert.equal(testXml.layout, 'nt009-r1-20261020')
  assert.equal(productionXml.layout, 'nt004-007-20260209')
  assert.ok(testXml.xml.includes('<tpEmit>1</tpEmit><finNFSe>0</finNFSe><cLocEmi>'))
  assert.ok(!productionXml.xml.includes('<finNFSe>'))
  assert.ok(testXml.xml.indexOf('<cNBS>') < testXml.xml.indexOf('<xDescServ>'))
  assert.ok(productionXml.xml.indexOf('<cNBS>') > productionXml.xml.indexOf('<xDescServ>'))
  for (const { xml } of [testXml, productionXml]) {
    assert.ok(xml.includes('versao="1.01"'))
    assert.ok(!xml.includes('<cMotivoEmisTI>'))
    assert.ok(!xml.includes('<IBSCBS>')) // Não inventar CST, classificações ou tributos fora do perfil SN suportado.
  }
})
test('POST único e reserva transacional impedem duplicação em cliques concorrentes', async () => {
  const f = fixture()
  const results = await Promise.allSettled([f.emit(), f.emit()])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(f.submissions(), 1)
  assert.equal(f.db.documents.get('axisFiscal/issuer/counters/test-1').lastNumber, '1')
  assert.equal(f.db.documents.get(`axisFiscal/issuer/drafts/${draftId}`).status, 'authorized')
  assert.equal(f.db.documents.get(`axisFiscal/issuer/operations/test-${draftId}`).xmlLayout, 'nt009-r1-20261020')
  assert.equal(f.db.documents.get(`axisFiscal/issuer/operations/test-${draftId}/attempts/1`).xmlLayout, 'nt009-r1-20261020')
  assert.ok(Array.from(f.db.documents.keys()).some(key => key.includes('/approvals/')))
})

test('validação antes da reserva identifica o campo inválido, sem criar DPS ou transmitir', async () => {
  const cases = [
    [{ number: '', street: 'Avenida Brasil, 4493' }, /campos obrigatórios: Número/],
    [{ street: '', district: '' }, /campos obrigatórios: Logradouro, Bairro/],
    [{ municipalityCode: '' }, /código IBGE de 7 dígitos/],
    [{ postalCode: '123' }, /CEP do cliente fiscal deve conter 8 dígitos/],
    [{ email: 'inválido' }, /e-mail válido do cliente fiscal/],
    [{ email: 'a'.repeat(72) + '@teste.com' }, /campo E-mail deve ter no máximo 80/],
  ]
  for (const [customerPatch, expected] of cases) {
    const f = fixture()
    f.db.documents.set(`axisFiscal/issuer/drafts/${draftId}`, { ...draft, customer: { ...draft.customer, ...customerPatch } })
    await assert.rejects(f.emit(), err => { assert.equal(err.status, 400); assert.match(err.message, expected); return true })
    assert.equal(f.submissions(), 0)
    assert.equal(f.db.documents.has(`axisFiscal/issuer/operations/test-${draftId}`), false)
    assert.equal(f.db.documents.has('axisFiscal/issuer/counters/test-1'), false)
    assert.equal(f.db.documents.get(`axisFiscal/issuer/drafts/${draftId}`).status, 'draft')
  }
})
test('timeout mantém mesma DPS; recuperação somente GET, sem novo POST ou numeração', async () => {
  const f = fixture({ failure: true })
  const first = await f.emit()
  assert.equal(first.state, 'uncertain'); assert.equal(f.submissions(), 1)
  await assert.rejects(f.emit())
  const recovered = await f.service.reconcile(first.id)
  assert.equal(recovered.state, 'authorized'); assert.equal(f.reads(), 2); assert.equal(f.submissions(), 1)
  assert.equal(f.db.documents.get('axisFiscal/issuer/counters/test-1').lastNumber, '1')
})

test('download PDF só lê XML autorizado íntegro, não emite nem consulta o governo', async () => {
  const f = fixture()
  const op = await f.emit()
  const result = await f.service.documents(op.id, 'pdf')
  assert.equal(Buffer.from(result.pdfBase64, 'base64').subarray(0, 5).toString(), '%PDF-')
  assert.equal(f.submissions(), 1)
  assert.equal(f.reads(), 0)
  const path = `axisFiscal/issuer/operations/${op.id}/documents/authorized`
  f.db.documents.set(path, { ...f.db.documents.get(path), sha256: 'adulterado' })
  await assert.rejects(f.service.documents(op.id, 'pdf'), /integridade/)
  const uncertain = fixture({ failure: true })
  const pending = await uncertain.emit()
  await assert.rejects(uncertain.service.documents(pending.id, 'pdf'), /Ainda não há XML autorizado/)
})
test('produção permanece bloqueada sem liberação explícita e evidência válida de homologação', async () => {
  for (const initialEnv of [{}, { NFSE_PRODUCTION_ENABLED: 'true' }]) {
    const f = fixture({ environment: 'production', initialEnv })
    const readiness = await f.service.readiness(issuer)
    assert.equal(readiness.enabled, false); assert.equal(readiness.homologated, false)
    await assert.rejects(f.emit()); assert.equal(f.submissions(), 0)
  }
})
test('registra horário original SEFIN na tentativa e no histórico, inclusive em rejeição', async () => {
  for (const rejection of [false, true]) {
    const processedAt = '2026-11-04T08:59:59.1234567-03:00'
    const f = fixture({ rejection, processingTime: processedAt })
    const result = await f.emit()
    const timing = { emittedAt: '2026-11-04T08:00:00-04:00', processedAt, receivedAt: now.toISOString() }
    assert.deepEqual(result.emissionTiming, timing)
    const path = `axisFiscal/issuer/operations/test-${draftId}`
    assert.deepEqual(f.db.documents.get(path).emissionTiming, timing)
    assert.equal(f.db.documents.get(`${path}/attempts/1`).processedAt, processedAt)
    assert.ok(f.db.documents.get(`${path}/attempts/1`).xml.includes(`<dhEmi>${timing.emittedAt}</dhEmi>`))
    assert.equal(f.submissions(), 1)
    if (rejection) {
      await assert.rejects(f.service.reconcile(`test-${draftId}`), /DPS ainda não encontrada/)
      assert.deepEqual(f.db.documents.get(path).emissionTiming, timing)
    }
  }
})

test('horário ausente, inválido ou sem fuso não é inventado nem impede processamento da resposta', async () => {
  for (const processingTime of [undefined, null, 'inválido', '2026-11-04T12:00:00', '<script>']) {
    const f = fixture({ processingTime })
    const result = await f.emit()
    assert.equal(result.state, 'authorized')
    assert.equal(result.emissionTiming.processedAt, '')
  }
})

const imRejection = 'IM do prestador não deve ser informado, pois não existem informações complementares registradas no CNC NFS-e do município emissor informado na DPS.'
test('E0120 é rejeição corrigível apesar das palavras existem/registradas; novo POST exige GET e confirmação', async () => {
  const f = fixture({ rejection: true, rejectionCode: 'E0120', rejectionMessage: imRejection })
  const rejected = await f.emit()
  assert.equal(rejected.state, 'rejected')
  assert.equal(f.submissions(), 1)
  const next = await f.service.emit({ draftId, revision: 2, environment: 'test', confirmed: true, uid: 'admin' })
  assert.equal(next.state, 'authorized')
  assert.equal(next.dpsId, rejected.dpsId)
  assert.equal(f.reads(), 1)
  assert.equal(f.submissions(), 2)
})

test('consulta recupera E0120 legado somente com prova HTTP 400 da tentativa e GET 404, sem transmitir', async () => {
  for (const proofStatus of [400, 500, undefined]) {
    const f = fixture({ rejection: true, rejectionCode: 'E0120', rejectionMessage: imRejection })
    const rejected = await f.emit()
    const path = `axisFiscal/issuer/operations/${rejected.id}`
    const stored = f.db.documents.get(path)
    f.db.documents.set(path, { ...stored, state: 'uncertain', rejectedBySefin: false })
    const draftPath = `axisFiscal/issuer/drafts/${draftId}`
    f.db.documents.set(draftPath, { ...draft, status: 'processing', operationId: rejected.id })
    const attemptPath = `${path}/attempts/1`
    f.db.documents.set(attemptPath, { ...f.db.documents.get(attemptPath), responseStatus: proofStatus })
    if (proofStatus === 400) {
      assert.equal((await f.service.reconcile(rejected.id, 'reviewing-admin')).state, 'rejected')
      assert.equal(f.db.documents.get(draftPath).status, 'draft')
      assert.equal(f.db.documents.get(draftPath).updatedBy, 'reviewing-admin')
      assert.ok(f.db.documents.get(path).rejectionRecoveredAt)
    } else {
      await assert.rejects(f.service.reconcile(rejected.id), /não encontrada/)
      assert.equal(f.db.documents.get(draftPath).status, 'processing')
    }
    assert.equal(f.submissions(), 1)
    assert.equal(f.reads(), 1)
  }
})

test('rejeição definitiva permite correção manual, reaproveitando DPS após confirmar ausência por GET', async () => {
  const f = fixture({ rejection: true })
  assert.equal((await f.emit()).state, 'rejected')
  const corrected = f.db.documents.get(`axisFiscal/issuer/drafts/${draftId}`)
  assert.equal(corrected.status, 'draft'); assert.equal(corrected.revision, 2)
  const result = await f.service.emit({ draftId, revision: 2, environment: 'test', confirmed: true, uid: 'admin' })
  assert.equal(result.state, 'authorized'); assert.equal(result.attempt, 2)
  assert.equal(f.reads(), 1); assert.equal(f.submissions(), 2)
  assert.equal(f.db.documents.get('axisFiscal/issuer/counters/test-1').lastNumber, '1')
})
test('GET 404 não converte rejeição definitiva em tentativa incerta nem apaga o motivo original', async () => {
  const f = fixture({ rejection: true })
  const rejected = await f.emit()
  await assert.rejects(f.service.reconcile(rejected.id), /não encontrada/)
  const stored = f.db.documents.get(`axisFiscal/issuer/operations/${rejected.id}`)
  assert.equal(stored.state, 'rejected')
  assert.equal(stored.message, rejected.message)
  assert.match(stored.lastConsultationMessage, /não encontrada/)
  assert.equal(f.submissions(), 1)
})
test('registro antigo tornado incerto por consulta 404 pode ser corrigido somente com prova de rejeição e novo GET 404', async () => {
  const f = fixture({ rejection: true })
  const rejected = await f.emit()
  const key = `axisFiscal/issuer/operations/${rejected.id}`
  f.db.documents.set(key, { ...f.db.documents.get(key), state: 'uncertain' })
  const corrected = await f.service.emit({ draftId, revision: 2, environment: 'test', confirmed: true, uid: 'admin' })
  assert.equal(corrected.state, 'authorized'); assert.equal(corrected.attempt, 2)
  assert.equal(f.reads(), 1); assert.equal(f.submissions(), 2)
  assert.equal(f.db.documents.get('axisFiscal/issuer/counters/test-1').lastNumber, '1')
})
test('registro incerto sem rejeição definitiva comprovada continua impedido de reenviar', async () => {
  const f = fixture({ failure: true })
  await f.emit()
  const key = `axisFiscal/issuer/drafts/${draftId}`
  // Defesa adicional mesmo se um cadastro legado deixasse o rascunho editável.
  f.db.documents.set(key, { ...f.db.documents.get(key), status: 'draft' })
  await assert.rejects(f.emit(), /não teve rejeição definitiva/)
  assert.equal(f.submissions(), 1); assert.equal(f.reads(), 0)
})
test('homologação autorizada libera elegibilidade da produção somente com a chave de ambiente e perfil idêntico', async () => {
  const f = fixture()
  await f.emit()
  f.runtimeEnv.NFSE_ENVIRONMENT = 'production'
  assert.equal((await f.service.readiness(issuer)).enabled, false)
  f.runtimeEnv.NFSE_PRODUCTION_ENABLED = 'true'
  assert.equal((await f.service.readiness(issuer)).enabled, true)
  assert.equal((await f.service.readiness({ ...issuer, totalTaxPercentSN: '7' })).enabled, false)
})
test('consultas não aceitam XML de outra DPS/ambiente, DTD ou XML malformado', () => {
  const response = authorizedResponse(built().xml)
  const xml = unpackFiscalXml(response.payload.nfseXmlGZipB64)
  const expected = { dpsId: built().id, environment: 'test', amountCents: 250000 }
  assert.equal(readAuthorizedXml(xml, expected).number, '999')
  assert.throws(() => readAuthorizedXml(xml, { ...expected, environment: 'production' }))
  assert.throws(() => readAuthorizedXml(xml, { ...expected, dpsId: dpsId(1, 2) }))
  assert.throws(() => readAuthorizedXml(xml, { ...expected, customerTaxId: NFSE_ISSUER.taxId }))
  assert.throws(() => readAuthorizedXml(xml, { ...expected, competence: '2026-11-03' }))
  assert.throws(() => readAuthorizedXml('<!DOCTYPE NFSe><NFSe/>', expected))
  assert.throws(() => readAuthorizedXml('<NFSe><broken>', expected))
})
test('URL permitida não pode ser desviada para host externo ou produção no modo teste', () => {
  assert.throws(() => sefinBase('test', { NFSE_SEFIN_TEST_BASE_URL: 'https://evil.example' }))
  assert.throws(() => sefinBase('test', { NFSE_SEFIN_TEST_BASE_URL: 'https://sefin.nfse.gov.br/SefinNacional' }))
  assert.throws(() => sefinBase('unknown'))
  assert.equal(unpackFiscalXml(packDps(built().xml).dpsXmlGZipB64), built().xml)
})
test('transporte exige mTLS/TLS e envia dpsXmlGZipB64 sem redirects ou retries', async () => {
  let calls = 0
  const request = (url, options, callback) => {
    calls++; assert.equal(options.agent.options.rejectUnauthorized, true); assert.equal(options.agent.options.minVersion, 'TLSv1.2')
    assert.ok(url.endsWith('/nfse')); assert.equal(options.method, 'POST')
    const req = new EventEmitter(); let body = ''
    req.write = value => { body += value }
    req.destroy = value => req.emit('error', value)
    req.end = () => { const res = new EventEmitter(); res.statusCode = 500; callback(res)
      assert.ok(JSON.parse(body).dpsXmlGZipB64)
      queueMicrotask(() => { res.emit('data', Buffer.from('{"erros":[]}')); res.emit('end'); req.emit('close') }) }
    return req
  }
  const client = createSefinClient({ privateKeyPem: 'test', certificatePem: 'test' }, 'test', { request, env: {} })
  assert.equal((await client.submit(built().xml)).status, 500); assert.equal(calls, 1); client.close()
})

function makePfx({ taxId = NFSE_ISSUER.taxId, expired = false } = {}) {
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate(); cert.publicKey = keys.publicKey; cert.serialNumber = '01'
  cert.validity.notBefore = new Date('2025-01-01'); cert.validity.notAfter = new Date(expired ? '2026-01-01' : '2027-01-01')
  cert.setSubject([{ name: 'commonName', value: 'Certificado sintético de teste' }]); cert.setIssuer(cert.subject.attributes)
  const asn = forge.asn1
  const san = asn.create(asn.Class.UNIVERSAL, asn.Type.SEQUENCE, true, [asn.create(asn.Class.CONTEXT_SPECIFIC, 0, true, [
    asn.create(asn.Class.UNIVERSAL, asn.Type.OID, false, asn.oidToDer('2.16.76.1.3.3').getBytes()),
    asn.create(asn.Class.CONTEXT_SPECIFIC, 0, true, [asn.create(asn.Class.UNIVERSAL, asn.Type.UTF8, false, taxId)]),
  ])])
  cert.setExtensions([{ id: '2.5.29.17', value: asn.toDer(san).getBytes() }]); cert.sign(keys.privateKey, forge.md.sha256.create())
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'synthetic-password', { algorithm: '3des' })
  return { NFSE_A1_PFX_BASE64: Buffer.from(asn.toDer(p12).getBytes(), 'binary').toString('base64'), NFSE_A1_PASSWORD: 'synthetic-password' }
}
let syntheticCertificate
test('A1 sintético é aberto e assina DPS verificável com a chave pública confiável', async () => {
  syntheticCertificate = await loadCertificate(makePfx(), now)
  assert.equal(syntheticCertificate.taxId, NFSE_ISSUER.taxId)
  const xml = signDps(built().xml, syntheticCertificate)
  const signature = new DOMParser().parseFromString(xml, 'text/xml').getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0]
  const verifier = new SignedXml({ publicCert: syntheticCertificate.certificatePem, getCertFromKeyInfo: () => undefined })
  verifier.loadSignature(signature)
  assert.equal(verifier.checkSignature(xml), true)
  assert.equal(xml.includes('synthetic-password'), false)
})
test('certificado vencido, CNPJ divergente, senha errada e falta de segredos são bloqueados', async () => {
  await assert.rejects(loadCertificate({}, now))
  await assert.rejects(loadCertificate(makePfx({ expired: true }), now), /vencido/)
  await assert.rejects(loadCertificate(makePfx({ taxId: '11111111000191' }), now), /CNPJ/)
  await assert.rejects(loadCertificate({ ...makePfx(), NFSE_A1_PASSWORD: 'wrong' }, now), /senha/)
})
test('DPS de cada ambiente, assinada e não assinada, valida no respectivo XSD oficial sem modificar esquemas', { skip: process.platform !== 'win32' && !process.env.NFSE_TEST_POWERSHELL }, async () => {
  const cert = syntheticCertificate || await loadCertificate(makePfx(), now)
  const root = mkdtempSync(join(tmpdir(), 'nfse-xsd-check-'))
  for (const environment of ['test', 'production']) for (const [name, xml] of [['unsigned', built(environment).xml], ['signed', signDps(built(environment).xml, cert)]]) {
    const file = join(root, `${name}.xml`); writeFileSync(file, xml)
    // XmlSchema .NET interpreta o pattern com ^/$ de TSSerieDPS da forma usada pela SEFIN.
    // libxml2 interpreta os anchors como literais e rejeita qualquer série; não alterar o XSD oficial.
    const result = spawnSync(process.env.NFSE_TEST_POWERSHELL || 'powershell.exe', ['-NoProfile', '-File', resolve('scripts/tests/nfse-xsd-check.ps1'), '-SchemaPath', resolve(NFSE_XML_LAYOUTS[environment].schemaPath), '-XmlPath', file], { encoding: 'utf8' })
    assert.equal(result.status, 0, `${environment}/${name}: ${result.stderr || result.stdout}`)
  }
})
test('regressão E1235: XML antigo é rejeitado pelo XSD de homologação, e não misturamos contratos', { skip: process.platform !== 'win32' && !process.env.NFSE_TEST_POWERSHELL }, () => {
  const root = mkdtempSync(join(tmpdir(), 'nfse-schema-regression-'))
  const testXml = built('test').xml
  const nbs = '<cNBS>118065300</cNBS>'
  const cases = [
    { name: 'legacy-in-test', xml: built('production').xml.replace('<tpAmb>1</tpAmb>', '<tpAmb>2</tpAmb>'), schema: NFSE_XML_LAYOUTS.test.schemaPath, expected: /finNFSe/ },
    { name: 'new-in-production', xml: testXml.replace('<tpAmb>2</tpAmb>', '<tpAmb>1</tpAmb>'), schema: NFSE_XML_LAYOUTS.production.schemaPath, expected: /finNFSe/ },
    { name: 'wrong-nbs-order', xml: testXml.replace(nbs, '').replace('</xDescServ>', `</xDescServ>${nbs}`), schema: NFSE_XML_LAYOUTS.test.schemaPath, expected: /cNBS/ },
  ]
  for (const item of cases) {
    const path = join(root, `${item.name}.xml`); writeFileSync(path, item.xml)
    const result = spawnSync(process.env.NFSE_TEST_POWERSHELL || 'powershell.exe', ['-NoProfile', '-File', resolve('scripts/tests/nfse-xsd-check.ps1'), '-SchemaPath', resolve(item.schema), '-XmlPath', path], { encoding: 'utf8' })
    assert.notEqual(result.status, 0, item.name)
    assert.match(`${result.stderr}${result.stdout}`, item.expected, item.name)
  }
})
