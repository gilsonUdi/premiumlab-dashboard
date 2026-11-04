import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getFirebaseAdminAuth, getFirebaseAdminDb } from '@/lib/firebase-admin'
import { NFSE_BLOCK_REASON, NFSE_ISSUER, normalizeFiscalCustomer, normalizeInvoiceDraft, normalizeIssuerSettings, requireDraftRevision } from '@/lib/nfse-drafts.mjs'
import { createNfseService, publicOperation } from '@/lib/nfse/service.mjs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function authorize(request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
  if (!token) throw Object.assign(new Error('Entre no portal para continuar.'), { status: 401 })
  let decoded
  try { decoded = await getFirebaseAdminAuth().verifyIdToken(token, true) }
  catch { throw Object.assign(new Error('Sessão inválida ou revogada. Entre novamente.'), { status: 401 }) }
  const profile = await getFirebaseAdminDb().collection('users').doc(decoded.uid).get()
  if (!profile.exists || profile.data().role !== 'admin' || profile.data().active !== true) {
    throw Object.assign(new Error('Somente administradores ativos podem acessar as notas fiscais.'), { status: 403 })
  }
  return { uid: decoded.uid, authTime: Number(decoded.auth_time || 0) }
}
function root() { return getFirebaseAdminDb().collection('axisFiscal').doc('issuer') }
function json(data, status = 200) { return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } }) }
function failure(error) {
  if (!error.status) console.error('[admin-nfse]', error.code || 'internal')
  return json({ error: error.status ? error.message : 'Não foi possível acessar os dados fiscais. Verifique a configuração do Firebase Admin no servidor.' }, error.status || 500)
}
function validate(fn, value) {
  try { return fn(value) }
  catch (error) { throw Object.assign(error, { status: 400 }) }
}
export async function GET(request) {
  try {
    await authorize(request)
    const [issuer, customers, drafts, operations] = await Promise.all([
      root().get(), root().collection('customers').orderBy('name').limit(201).get(),
      root().collection('drafts').orderBy('updatedAt', 'desc').limit(101).get(),
      root().collection('operations').orderBy('updatedAt', 'desc').limit(101).get(),
    ])
    const issuerSettings = { ...normalizeIssuerSettings(issuer.data() || {}), ...NFSE_ISSUER }
    const readiness = await createNfseService({ db: getFirebaseAdminDb() }).readiness(issuerSettings)
    return json({ issuer: issuerSettings, readiness,
      customers: customers.docs.slice(0, 200).map(doc => ({ ...doc.data(), id: doc.id })),
      drafts: drafts.docs.slice(0, 100).map(doc => ({ ...doc.data(), id: doc.id })).filter(draft => draft.status === 'draft'),
      operations: operations.docs.slice(0, 100).map(doc => publicOperation(doc.data(), doc.id)),
      truncated: { customers: customers.size > 200, drafts: drafts.size > 100, operations: operations.size > 100 },
      emissionEnabled: readiness.enabled, blockReason: readiness.enabled ? '' : readiness.blockers.join(' ') || NFSE_BLOCK_REASON })
  } catch (error) { return failure(error) }
}
export async function POST(request) {
  try {
    const { uid, authTime } = await authorize(request)
    const raw = await request.text()
    if (raw.length > 30000) return json({ error: 'Solicitação muito grande.' }, 413)
    let body
    try { body = JSON.parse(raw) } catch { return json({ error: 'Dados inválidos.' }, 400) }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Dados inválidos.' }, 400)
    if (['emit', 'reconcile', 'downloadXml', 'downloadDps'].includes(body.action)) {
      const service = createNfseService({ db: getFirebaseAdminDb() })
      if (body.action === 'emit') {
        if (body.confirmed !== true) return json({ error: 'Confirme explicitamente a emissão e o ambiente.' }, 400)
        if (Date.now() / 1000 - authTime > 600) return json({ error: 'Entre novamente no portal antes de emitir (login recente de até 10 minutos).' }, 403)
        return json({ operation: await service.emit({ draftId: body.id, revision: body.revision, environment: body.environment, confirmed: body.confirmed, uid }) })
      }
      if (body.action === 'reconcile') return json({ operation: await service.reconcile(body.id, uid) })
      return json(await service.documents(body.id, body.action === 'downloadXml' ? 'authorized' : 'dps'))
    }
    const now = new Date().toISOString()
    if (body.action === 'saveIssuer') {
      const issuer = validate(normalizeIssuerSettings, body.data)
      await root().set({ ...issuer, updatedAt: now, updatedBy: uid })
      return json({ issuer, readiness: await createNfseService({ db: getFirebaseAdminDb() }).readiness(issuer) })
    }
    if (body.action === 'saveCustomer') {
      const customer = validate(normalizeFiscalCustomer, body.data)
      const id = createHash('sha256').update(customer.taxId).digest('hex')
      await root().collection('customers').doc(id).set({ ...customer, updatedAt: now, updatedBy: uid })
      return json({ customer: { ...customer, id } })
    }
    if (body.action === 'saveDraft') {
      const draft = validate(normalizeInvoiceDraft, body.data)
      // UUID estável para tentativas repetidas da mesma gravação, sem duplicar rascunhos.
      if (typeof body.id !== 'string' || !/^[a-f0-9-]{36}$/.test(body.id)) return json({ error: 'Identificador de rascunho inválido.' }, 400)
      const db = getFirebaseAdminDb()
      const ref = root().collection('drafts').doc(body.id)
      const result = await db.runTransaction(async tx => {
        const [current, customer] = await Promise.all([tx.get(ref), tx.get(root().collection('customers').doc(draft.customerId))])
        if (!customer.exists) throw Object.assign(new Error('Cliente fiscal não encontrado. Atualize a tela.'), { status: 400 })
        if (current.exists) {
          try { requireDraftRevision(current.data(), body.revision) }
          catch (error) { throw Object.assign(error, { status: 409 }) }
        } else if (body.revision !== 0) throw Object.assign(new Error('Rascunho não encontrado. Atualize a tela.'), { status: 409 })
        const saved = { ...draft, customer: normalizeFiscalCustomer(customer.data()), issuerTaxId: NFSE_ISSUER.taxId,
          revision: (current.data()?.revision || 0) + 1,
          createdAt: current.data()?.createdAt || now, createdBy: current.data()?.createdBy || uid,
          updatedAt: now, updatedBy: uid }
        tx.set(ref, saved)
        return saved
      })
      return json({ draft: { ...result, id: ref.id } })
    }
    return json({ error: 'Operação não disponível nesta etapa.' }, 400)
  } catch (error) { return failure(error) }
}
