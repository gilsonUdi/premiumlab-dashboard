import { createHash } from 'node:crypto'
import { NFSE_ISSUER, normalizeIssuerSettings } from '../nfse-drafts.mjs'
import { buildDpsXml, dpsId, fiscalProfileIssues, formatDpsEmissionTime, readAuthorizedXml, NFSE_CONNECTOR_VERSION, NFSE_XML_LAYOUTS } from './xml.mjs'
import { loadCertificate as defaultLoadCertificate, signDps as defaultSignDps } from './certificate.mjs'
import { createSefinClient, fiscalResponseError, unpackFiscalXml } from './sefin.mjs'

const digest = value => createHash('sha256').update(value).digest('hex')
const error = (message, status = 409) => Object.assign(new Error(message), { status })
// Preserve o valor/fuso informado pela SEFIN; não substitua pelo relógio local.
function processingTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value)) ? value : ''
}
// Versões anteriores podiam trocar o estado para uncertain após um GET 404, mas
// mantinham a prova da rejeição definitiva. Um novo POST continua exigindo GET 404.
const correctableRejection = op => op?.rejectedBySefin === true && ['rejected', 'uncertain'].includes(op.state)
export function profileHash(issuer, certificate) { return digest(JSON.stringify({ version: NFSE_CONNECTOR_VERSION, issuer: normalizeIssuerSettings(issuer), certificate: certificate.fingerprint })) }
export function publicOperation(op, id) {
  return { id, environment: op.environment, state: op.state, dpsId: op.dpsId, series: op.series, dpsNumber: op.dpsNumber,
    invoiceNumber: op.invoiceNumber || '', key: op.key || '', customerName: op.draft.customer.name,
    amountCents: op.draft.amountCents, competence: op.draft.competence, attempt: op.attempt || 1, xmlLayout: op.xmlLayout || 'Legado (sem registro de leiaute)', createdAt: op.createdAt, updatedAt: op.updatedAt,
    emittedAt: op.emittedAt || '', emissionTiming: op.emissionTiming || null,
    message: op.message || '', consultationUrl: op.key ? `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${op.key}` : '' }
}
export function createNfseService({ db, env = process.env, clock = () => new Date(),
  loadCertificate = defaultLoadCertificate, signDps = defaultSignDps, createClient = createSefinClient }) {
  const root = db.collection('axisFiscal').doc('issuer')
  const stamp = () => clock().toISOString()
  async function readiness(issuer) {
    const environment = env.NFSE_ENVIRONMENT || 'test'
    const series = environment === 'production' ? env.NFSE_DPS_SERIES_PRODUCTION : env.NFSE_DPS_SERIES_TEST
    const blockers = fiscalProfileIssues(issuer)
    if (!['test', 'production'].includes(environment)) blockers.push('NFSE_ENVIRONMENT deve ser test ou production.')
    if (env.NFSE_ENABLED !== 'true') blockers.push('Integração desabilitada no servidor (NFSE_ENABLED).')
    if (!/^\d{1,5}$/.test(series || '') || Number(series) < 1 || Number(series) > 49999) blockers.push('Configure uma série exclusiva para este aplicativo (1 a 49999), diferente da série municipal antiga. Não copiamos a série 70013 das notas de referência.')
    let certificate
    try { certificate = await loadCertificate(env, clock()) } catch (err) { blockers.push(err.message) }
    let homologated = false
    if (certificate && ['test', 'production'].includes(environment)) {
      const approval = await root.collection('approvals').doc(profileHash(issuer, certificate)).get()
      homologated = approval.exists && approval.data().certificateFingerprint === certificate.fingerprint && approval.data().connectorVersion === NFSE_CONNECTOR_VERSION
    }
    if (environment === 'production') {
      if (env.NFSE_PRODUCTION_ENABLED !== 'true') blockers.push('Produção não autorizada no servidor (NFSE_PRODUCTION_ENABLED).')
      if (!homologated) blockers.push('É necessária uma emissão autorizada em homologação com o mesmo certificado, conector e configuração fiscal antes de liberar produção.')
    }
    return { enabled: !blockers.length, environment, series: series || '', blockers, homologated,
      xmlLayout: NFSE_XML_LAYOUTS[environment]?.id || '', xmlLayoutLabel: NFSE_XML_LAYOUTS[environment]?.label || '',
      certificate: certificate ? { taxId: certificate.taxId, expiresAt: certificate.expiresAt, fingerprintSuffix: certificate.fingerprint.slice(-8) } : null }
  }
  async function getOperation(id) {
    if (typeof id !== 'string' || !/^(test|production)-[a-f0-9-]{36}$/.test(id)) throw error('Operação fiscal inválida.', 400)
    const ref = root.collection('operations').doc(id)
    const snapshot = await ref.get()
    if (!snapshot.exists) throw error('Operação fiscal não encontrada.', 404)
    return { ref, op: snapshot.data() }
  }
  async function finish(ref, op, response, certificate) {
    let xml = response.payload?.nfseXmlGZipB64
    if (!xml) throw error(fiscalResponseError(response))
    xml = unpackFiscalXml(xml)
    const authorized = readAuthorizedXml(xml, { dpsId: op.dpsId, environment: op.environment, amountCents: op.draft.amountCents,
      customerTaxId: op.draft.customer.taxId, competence: op.draft.competence, serviceCode: op.draft.serviceCode })
    if (response.payload.chaveAcesso && response.payload.chaveAcesso !== authorized.key) throw error('Chaves divergentes no retorno da SEFIN.')
    const next = { ...op, state: 'authorized', key: authorized.key, invoiceNumber: authorized.number,
      updatedAt: stamp(), message: op.environment === 'test' ? 'AUTORIZADA EM HOMOLOGAÇÃO — SEM VALOR FISCAL.' : 'Nota autorizada pela SEFIN Nacional.' }
    await db.runTransaction(async tx => {
      const current = await tx.get(ref)
      if (current.data()?.state === 'authorized') {
        if (current.data().key !== authorized.key) throw error('A operação já possui outra chave autorizada.')
        return
      }
      tx.set(ref, next)
      tx.set(ref.collection('documents').doc('authorized'), { xml, sha256: digest(xml), createdAt: stamp() })
      tx.set(root.collection('drafts').doc(op.draftId), { status: 'authorized', updatedAt: stamp(), operationId: ref.id }, { merge: true })
      if (op.environment === 'test') tx.set(root.collection('approvals').doc(op.profileHash), {
        operationId: ref.id, key: authorized.key, certificateFingerprint: op.certificateFingerprint,
        connectorVersion: NFSE_CONNECTOR_VERSION, createdAt: stamp(), createdBy: op.createdBy,
      })
    })
    return publicOperation(next, ref.id)
  }
  async function markUncertain(ref, message) {
    await db.runTransaction(async tx => {
      const current = await tx.get(ref)
      if (correctableRejection(current.data())) {
        tx.set(ref, { state: 'rejected', lastConsultationMessage: String(message).slice(0, 2000), lastConsultedAt: stamp(), updatedAt: stamp() }, { merge: true })
      } else if (current.data()?.state !== 'authorized') {
        tx.set(ref, { state: 'uncertain', message: String(message).slice(0, 2000), updatedAt: stamp() }, { merge: true })
      }
    })
  }
  async function markRejected(ref, message, uid) {
    await db.runTransaction(async tx => {
      const current = await tx.get(ref)
      const draftRef = root.collection('drafts').doc(current.data().draftId)
      const currentDraft = await tx.get(draftRef)
      if (current.data().state === 'authorized') return
      tx.set(ref, { state: 'rejected', rejectedBySefin: true, message: String(message).slice(0, 2000), updatedAt: stamp() }, { merge: true })
      tx.set(draftRef, { status: 'draft', revision: currentDraft.data().revision + 1, updatedAt: stamp(), updatedBy: uid }, { merge: true })
    })
  }
  // Recuperação restrita do E0120 que versões anteriores classificavam como incerto.
  // Só após GET 404, com a resposta HTTP 400 da mesma tentativa preservada no servidor.
  async function recoverLegacyImRejection(ref, op, uid) {
    return db.runTransaction(async tx => {
      const current = await tx.get(ref)
      const stored = current.data()
      if (stored?.state !== 'uncertain' || stored.key || stored.attempt !== op.attempt) return null
      const attempt = await tx.get(ref.collection('attempts').doc(String(stored.attempt)))
      const proof = attempt.data()
      if (proof?.responseStatus !== 400 || !/^E0120:[^|]+$/.test(proof.message || '')) return null
      const draftRef = root.collection('drafts').doc(stored.draftId)
      const draftSnapshot = await tx.get(draftRef)
      const savedDraft = draftSnapshot.data()
      if (savedDraft?.status !== 'processing' || savedDraft.operationId !== ref.id) return null
      const next = { ...stored, state: 'rejected', rejectedBySefin: true, message: proof.message,
        rejectionRecoveredAt: stamp(), lastConsultedAt: stamp(), updatedAt: stamp() }
      tx.set(ref, next)
      tx.set(draftRef, { status: 'draft', revision: savedDraft.revision + 1, updatedAt: stamp(), updatedBy: uid || stored.createdBy }, { merge: true })
      return publicOperation(next, ref.id)
    })
  }
  async function emit({ draftId, revision, environment, confirmed, uid }) {
    if (confirmed !== true || typeof draftId !== 'string' || !/^[a-f0-9-]{36}$/.test(draftId)) throw error('Selecione um rascunho e confirme explicitamente a emissão.', 400)
    const [issuerSnapshot, draftSnapshot] = await Promise.all([root.get(), root.collection('drafts').doc(draftId).get()])
    const issuer = normalizeIssuerSettings(issuerSnapshot.data() || {})
    const ready = await readiness(issuer)
    if (!ready.enabled || ready.environment !== environment) throw error(ready.blockers.join(' ') || 'O ambiente mudou. Atualize a tela e confirme novamente.')
    if (!draftSnapshot.exists || draftSnapshot.data().status !== 'draft' || draftSnapshot.data().revision !== revision) throw error('O rascunho mudou ou já foi enviado. Atualize a tela e consulte o histórico.')
    const certificate = await loadCertificate(env, clock())
    const hash = profileHash(issuer, certificate)
    const emittedAt = formatDpsEmissionTime(stamp().replace(/\.\d{3}Z$/, 'Z'))
    const draft = draftSnapshot.data()
    // Valida conteúdo e assinatura ANTES de reservar número e bloquear o rascunho.
    signDps(buildDpsXml({ issuer, draft, environment, series: ready.series, number: '1', emittedAt }).xml, certificate)
    const ref = root.collection('operations').doc(`${environment}-${draftId}`)
    const prior = await ref.get()
    let permittedRetry = false
    if (prior.exists) {
      if (!correctableRejection(prior.data())) throw error('A tentativa anterior não teve rejeição definitiva. Consulte a DPS no histórico; não será feito outro POST.')
      const checker = createClient(certificate, environment, { env })
      try {
        const lookup = await checker.lookupDps(prior.data().dpsId)
        if (lookup.status !== 404) throw error('Não foi comprovada a ausência da DPS rejeitada. Consulte o histórico antes de corrigir ou emitir novamente.')
        permittedRetry = true
      } finally { checker.close() }
    }
    const counter = root.collection('counters').doc(`${environment}-${Number(ready.series)}`)
    const op = await db.runTransaction(async tx => {
      const [existing, latestDraft, currentCounter, latestIssuer] = await Promise.all([tx.get(ref), tx.get(root.collection('drafts').doc(draftId)), tx.get(counter), tx.get(root)])
      if (environment === 'production') {
        const proof = await tx.get(root.collection('approvals').doc(hash))
        if (!proof.exists || proof.data().certificateFingerprint !== certificate.fingerprint || proof.data().connectorVersion !== NFSE_CONNECTOR_VERSION) throw error('Certificado ou homologação mudou durante a confirmação. Homologue novamente antes de emitir em produção.')
      }
      if (existing.exists && !(permittedRetry && correctableRejection(existing.data()))) throw error('Este rascunho já possui uma tentativa de emissão. Consulte a DPS no histórico; não será feito outro POST.')
      if (latestDraft.data()?.status !== 'draft' || latestDraft.data()?.revision !== revision || profileHash(latestIssuer.data() || {}, certificate) !== hash) throw error('Dados alterados durante a confirmação. Atualize a tela.')
      const start = environment === 'production' ? env.NFSE_DPS_INITIAL_NUMBER_PRODUCTION : env.NFSE_DPS_INITIAL_NUMBER_TEST
      if (start && !/^[1-9]\d{0,14}$/.test(start)) throw error('Número inicial de DPS inválido no servidor.')
      const number = existing.exists ? existing.data().dpsNumber : String(BigInt(currentCounter.data()?.lastNumber || (BigInt(start || '1') - 1n).toString()) + 1n)
      const series = existing.exists ? existing.data().series : String(Number(ready.series))
      const result = { environment, xmlLayout: NFSE_XML_LAYOUTS[environment].id, dpsId: dpsId(series, number), series, dpsNumber: number, attempt: (existing.data()?.attempt || 0) + 1,
        state: 'reserved', draftId, draft, issuer, profileHash: hash, certificateFingerprint: certificate.fingerprint,
        createdAt: stamp(), updatedAt: stamp(), createdBy: uid, emittedAt }
      tx.set(ref, result)
      if (!existing.exists) tx.set(counter, { lastNumber: number, updatedAt: stamp() })
      tx.set(root.collection('drafts').doc(draftId), { status: 'processing', updatedAt: stamp(), operationId: ref.id }, { merge: true })
      return result
    })
    const client = createClient(certificate, environment, { env })
    try {
      const xml = signDps(buildDpsXml({ issuer, draft, environment, series: op.series, number: op.dpsNumber, emittedAt }).xml, certificate)
      await ref.collection('documents').doc('dps').set({ xml, xmlLayout: op.xmlLayout, sha256: digest(xml), createdAt: stamp() })
      await ref.collection('attempts').doc(String(op.attempt)).set({ xml, xmlLayout: op.xmlLayout, sha256: digest(xml), createdAt: stamp(), createdBy: uid })
      await ref.set({ state: 'transmitting', updatedAt: stamp() }, { merge: true })
      // Um único POST. Timeout, 5xx e perda de resposta nunca geram nova emissão automática.
      const response = await client.submit(xml)
      const emissionTiming = { emittedAt, processedAt: processingTimestamp(response.payload?.dataHoraProcessamento), receivedAt: stamp() }
      await ref.collection('attempts').doc(String(op.attempt)).set({ responseStatus: response.status,
        responseSha256: digest(JSON.stringify(response.payload)), ...emissionTiming, message: response.status >= 400 ? fiscalResponseError(response).slice(0, 2000) : '' }, { merge: true })
      await ref.set({ emissionTiming }, { merge: true })
      op.emissionTiming = emissionTiming
      if (response.status >= 200 && response.status < 300 && response.payload?.nfseXmlGZipB64) return await finish(ref, op, response, certificate)
      const errors = response.payload?.erros
      const message = fiscalResponseError(response)
      if (response.status === 400 && Array.isArray(errors) && errors.length && errors.every(item => /^(?:E|RNG)\d{4}$/.test(String(item.Codigo || item.codigo || '')))
        && (errors.every(item => (item.Codigo || item.codigo) === 'E0120') || !/exist|duplic|cadastrad|processad/i.test(message))) {
        await markRejected(ref, message, uid)
        return publicOperation({ ...op, state: 'rejected', message }, ref.id)
      }
      await markUncertain(ref, fiscalResponseError(response))
      return publicOperation({ ...op, state: 'uncertain', message: fiscalResponseError(response) }, ref.id)
    } catch (err) {
      await markUncertain(ref, err.message)
      return publicOperation({ ...op, state: 'uncertain', message: err.message }, ref.id)
    } finally { client.close() }
  }
  async function reconcile(id, uid) {
    const { ref, op } = await getOperation(id)
    if (op.state === 'authorized') return publicOperation(op, ref.id)
    const certificate = await loadCertificate(env, clock())
    const client = createClient(certificate, op.environment, { env })
    try {
      const result = await client.lookupDps(op.dpsId)
      if (result.status === 404) {
        const recovered = await recoverLegacyImRejection(ref, op, uid)
        if (recovered) return recovered
        throw error('DPS ainda não encontrada na SEFIN. Isso não autoriza reenvio: aguarde e consulte novamente. Nenhum POST foi realizado.')
      }
      if (result.status !== 200) throw error(fiscalResponseError(result))
      const key = typeof result.payload === 'string' ? result.payload : result.payload?.chaveAcesso
      if (!/^\d{50}$/.test(key || '')) throw error('A consulta da DPS não retornou chave válida. Nenhum reenvio foi realizado.')
      const invoice = await client.lookupInvoice(key)
      if (invoice.status !== 200) throw error(fiscalResponseError(invoice))
      return await finish(ref, op, invoice, certificate)
    } catch (err) { await markUncertain(ref, err.message); throw error(err.message) }
    finally { client.close() }
  }
  async function documents(id, type) {
    const { ref, op } = await getOperation(id)
    if (!['authorized', 'dps'].includes(type)) throw error('Documento inválido.', 400)
    if (type === 'authorized' && op.state !== 'authorized') throw error('Ainda não há XML autorizado. Consulte a DPS.')
    const doc = await ref.collection('documents').doc(type).get()
    if (!doc.exists) throw error('Documento não disponível.', 404)
    if (digest(doc.data().xml) !== doc.data().sha256) throw error('Falha de integridade do XML armazenado. Não use este documento; confira a consulta oficial.', 500)
    return { xml: doc.data().xml, fileName: `${op.environment === 'test' ? 'SEM-VALOR-FISCAL-' : ''}${type === 'dps' ? op.dpsId : `NFSe-${op.key}`}.xml` }
  }
  return { readiness, emit, reconcile, documents }
}
