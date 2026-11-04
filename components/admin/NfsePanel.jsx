'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LockKeyhole, Plus, RefreshCw, Save } from 'lucide-react'
import { getPortalAccessToken } from '@/lib/portal-store'
import { NFSE_ISSUER } from '@/lib/nfse-drafts.mjs'

const EMPTY_CUSTOMER = { name: '', taxId: '', email: '', municipalRegistration: '', postalCode: '',
  street: '', number: '', complement: '', district: '', municipality: '', municipalityCode: '', state: '' }
const EMPTY_DRAFT = { customerId: '', competence: '', amount: '', description: '', serviceCode: '', notes: '' }
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const panel = 'rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6'

function Field({ label, value, onChange, multiline = false, ...props }) {
  const Control = multiline ? 'textarea' : 'input'
  return <label className="block min-w-0 text-sm text-slate-300">
    <span className="mb-2 block">{label}</span>
    <Control {...props} className="portal-input" value={value || ''} onChange={event => onChange?.(event.target.value)} />
  </label>
}
function localToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function dateTime(value) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value))
}
const stateLabel = value => ({ reserved: 'Número reservado', transmitting: 'Transmitindo', rejected: 'Rejeição definitiva — rascunho liberado para correção', uncertain: 'Aguardando consulta — não reenviar', authorized: 'Autorizada' }[value] || value)

async function request(body) {
  const token = await getPortalAccessToken()
  if (!token) throw new Error('Entre novamente no portal.')
  const response = await fetch('/api/admin/nfse', {
    method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload) throw new Error(payload?.error || 'Não foi possível acessar o módulo fiscal.')
  return payload
}

export default function NfsePanel({ onNavigationState }) {
  const [tab, setTab] = useState('drafts')
  const [data, setData] = useState(null)
  const [issuer, setIssuer] = useState(NFSE_ISSUER)
  const [customer, setCustomer] = useState(EMPTY_CUSTOMER)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [draftMeta, setDraftMeta] = useState({ id: '', revision: 0 })
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const requestBusy = useRef(false)

  const load = useCallback(async () => {
    setLoading(true); setError(''); setNotice('')
    try {
      const payload = await request()
      setData(payload); setIssuer(payload.issuer)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { onNavigationState?.({ dirty, busy }) }, [dirty, busy, onNavigationState])
  useEffect(() => () => onNavigationState?.({ dirty: false, busy: false }), [onNavigationState])
  useEffect(() => {
    if (!dirty) return
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function change(setter, key, value) {
    setter(current => ({ ...current, [key]: value })); setDirty(true); setNotice('')
  }
  function canLeave() { return !dirty || window.confirm('Existem alterações não salvas neste módulo. Deseja descartá-las?') }
  function switchTab(next) {
    if (next === tab || busy || !canLeave()) return
    setDirty(false); setError(''); setNotice('')
    setIssuer(data?.issuer || NFSE_ISSUER); setCustomer(EMPTY_CUSTOMER)
    setDraft(EMPTY_DRAFT); setDraftMeta({ id: '', revision: 0 }); setTab(next)
  }
  async function save(action, payload, onSaved) {
    if (requestBusy.current) return
    requestBusy.current = true; setBusy(true); setError(''); setNotice('')
    try { const result = await request({ action, ...payload }); onSaved(result); setDirty(false) }
    catch (err) { setError(err.message) }
    finally { requestBusy.current = false; setBusy(false) }
  }
  function newDraft() {
    if (busy || !canLeave()) return
    setDraft({ ...EMPTY_DRAFT, competence: localToday(), description: data.issuer.defaultDescription || '', serviceCode: data.issuer.serviceCode || '' })
    setDraftMeta({ id: crypto.randomUUID(), revision: 0 }); setDirty(false); setError(''); setNotice('')
  }
  function editDraft(item) {
    if (busy || !canLeave()) return
    setDraft({ customerId: item.customerId, competence: item.competence, amount: (item.amountCents / 100).toFixed(2),
      description: item.description, serviceCode: item.serviceCode, notes: item.notes })
    setDraftMeta({ id: item.id, revision: item.revision }); setDirty(false); setError(''); setNotice('')
  }
  function saveDraft(event) {
    event.preventDefault()
    save('saveDraft', { id: draftMeta.id, revision: draftMeta.revision, data: draft }, result => {
      setDraftMeta({ id: result.draft.id, revision: result.draft.revision })
      setData(current => ({ ...current, drafts: [result.draft, ...current.drafts.filter(item => item.id !== result.draft.id)] }))
      setNotice('Rascunho salvo no Firebase. Nenhuma nota fiscal foi emitida.')
    })
  }
  async function emitDraft() {
    const saved = data.drafts.find(item => item.id === draftMeta.id)
    if (!saved || dirty || !data.readiness?.enabled || busy) return
    const environment = data.readiness.environment
    const title = environment === 'production' ? 'EMITIR NOTA FISCAL REAL EM PRODUÇÃO' : 'EMITIR EM HOMOLOGAÇÃO — SEM VALOR FISCAL'
    if (!window.confirm(`${title}\n\nCliente: ${saved.customer.name}\nCPF/CNPJ: ${saved.customer.taxId}\nValor: ${money.format(saved.amountCents / 100)}\nCompetência: ${saved.competence}\nServiço: ${saved.serviceCode}\nDescrição: ${saved.description}\n\nPerfil: Simples Nacional ME/EPP, sem retenções, deduções ou descontos. Prestação em Cuiabá/MT. Confirmar?`)) return
    await save('emit', { id: saved.id, revision: saved.revision, environment, confirmed: true }, result => {
      setDraftMeta({ id: '', revision: 0 })
      setData(current => ({ ...current, drafts: current.drafts.filter(item => item.id !== saved.id), operations: [result.operation, ...(current.operations || []).filter(item => item.id !== result.operation.id)] }))
      setTab('history')
      setNotice(result.operation.state === 'authorized' ? (environment === 'test' ? 'Homologação autorizada, sem valor fiscal. Consulte o histórico.' : 'Nota fiscal autorizada. Consulte o histórico e baixe o XML.') : result.operation.state === 'rejected' ? 'A SEFIN rejeitou a emissão. Use Atualizar, abra e corrija o rascunho. Uma nova tentativa exige confirmação e consulta da mesma DPS antes do envio.' : 'A resposta não confirmou a autorização. Consulte a mesma DPS no histórico; não foi iniciado outro envio.')
    })
  }
  async function reconcile(id) {
    await save('reconcile', { id }, result => {
      setData(current => ({ ...current, operations: current.operations.map(item => item.id === id ? result.operation : item) }))
      setNotice('Situação da DPS consultada. Nenhum novo POST de emissão foi realizado.')
    })
  }
  async function downloadXml(id, action) {
    await save(action, { id }, result => {
      const url = URL.createObjectURL(new Blob([result.xml], { type: 'application/xml;charset=utf-8' }))
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.fileName; document.body.appendChild(anchor); anchor.click(); anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice('XML disponibilizado para download. A DPS não substitui o XML da nota autorizada.')
    })
  }

  return <div className="space-y-6 text-slate-200">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-widest text-amber-200">Fiscal · Axis</p>
        <h2 className="mt-1 text-2xl font-bold text-white">Notas fiscais de serviço</h2>
        <p className="mt-2 text-sm text-slate-400">Clientes, rascunhos e emissão pela API oficial SEFIN Nacional.</p></div>
      <button type="button" className="portal-ghost-button" disabled={loading || busy} onClick={() => { if (canLeave()) { setDirty(false); setCustomer(EMPTY_CUSTOMER); setDraft(EMPTY_DRAFT); setDraftMeta({ id: '', revision: 0 }); load() } }}><RefreshCw size={16} /> Atualizar</button>
    </header>
    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4 text-sm text-amber-100">
      <div className="flex items-center gap-2 font-semibold"><LockKeyhole size={17} /> {data?.readiness?.environment === 'production' ? 'Ambiente de PRODUÇÃO — notas com valor fiscal' : 'HOMOLOGAÇÃO — sem valor fiscal'} · {data?.readiness?.enabled ? 'Configuração habilitada para emissão' : 'Emissão bloqueada'}</div>
      <p className="mt-2">Salvar um rascunho não emite nota. Após transmitir, consulte a mesma DPS se a resposta for incerta; o sistema não reenvia automaticamente.</p>
      {data?.readiness?.blockers?.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5">{data.readiness.blockers.map(item => <li key={item}>{item}</li>)}</ul>}
      {data?.readiness?.certificate && <p className="mt-2 text-xs">A1 do CNPJ {data.readiness.certificate.taxId} · validade {dateTime(data.readiness.certificate.expiresAt)} · identificação final {data.readiness.certificate.fingerprintSuffix}</p>}
      <p className="mt-2 text-xs">Integração direta, sem intermediário pago. Produção exige liberação no servidor e homologação autorizada com o mesmo certificado e configuração fiscal.</p>
    </div>
    {error && <div role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div>}
    {loading ? <p role="status">Carregando dados fiscais…</p> : !data ? <p className="text-sm text-slate-400">Não foi possível carregar. Use Atualizar para tentar novamente.</p> : <>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Área fiscal">
        {[['drafts', 'Nova nota e rascunhos'], ['customers', 'Clientes fiscais'], ['issuer', 'Configuração do emitente'], ['history', 'Emissões e consultas']].map(([key, label]) =>
          <button key={key} role="tab" aria-selected={tab === key} disabled={busy} onClick={() => switchTab(key)} className={tab === key ? 'portal-primary-button' : 'portal-ghost-button'}>{label}</button>)}
      </div>
      {tab === 'drafts' && <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-400">{data.drafts.length} rascunho(s) carregado(s). Não são documentos fiscais.</p><button className="portal-primary-button" disabled={busy} onClick={newDraft}><Plus size={16} /> Novo rascunho</button></div>
        {draftMeta.id && <form className={`${panel} space-y-5`} onSubmit={saveDraft}>
          <h3 className="font-semibold text-white">{draftMeta.revision ? 'Editar rascunho' : 'Preparar nova nota'}</h3>
          <fieldset disabled={busy} className="space-y-4">
            <label className="block text-sm"><span className="mb-2 block">Cliente fiscal *</span><select className="portal-input" required value={draft.customerId} onChange={event => change(setDraft, 'customerId', event.target.value)}><option value="">Selecione um cliente</option>{data.customers.map(item => <option value={item.id} key={item.id}>{item.name} · {item.taxId}</option>)}</select></label>
            {!data.customers.length && <p className="text-sm text-amber-200">Cadastre primeiro um cliente na aba Clientes fiscais.</p>}
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Competência *" type="date" required value={draft.competence} onChange={value => change(setDraft, 'competence', value)} /><Field label="Valor dos serviços (R$) *" type="text" inputMode="decimal" required maxLength={15} placeholder="Ex.: 1500,00 (sem separador de milhar)" value={draft.amount} onChange={value => change(setDraft, 'amount', value)} /></div>
            <Field label="Descrição do serviço" multiline rows={4} maxLength={2000} value={draft.description} onChange={value => change(setDraft, 'description', value)} />
            <Field label="Código de serviço nacional (a confirmar com o contador)" maxLength={30} value={draft.serviceCode} onChange={value => change(setDraft, 'serviceCode', value)} />
            <Field label="Observações internas (não são enviadas ao governo)" multiline rows={2} maxLength={2000} value={draft.notes} onChange={value => change(setDraft, 'notes', value)} />
            <div className="flex flex-wrap gap-3"><button className="portal-primary-button" type="submit"><Save size={16} /> {busy ? 'Salvando…' : 'Salvar rascunho'}</button><button className="portal-ghost-button" type="button" disabled={!data.readiness?.enabled || dirty || !draftMeta.revision} title={!data.readiness?.enabled ? 'Resolva as pendências da configuração acima.' : 'Salve todas as alterações antes de emitir.'} onClick={emitDraft}><LockKeyhole size={16} /> {data.readiness?.environment === 'production' ? 'Emitir NFS-e REAL' : 'Emitir NFS-e em homologação'}</button></div>
            <p className="text-xs text-slate-400">Primeira versão: serviço 170201, NBS 118065300, operação tributável, prestação em Cuiabá, Simples ME/EPP com tributos federais e ISS pelo SN, sem retenções, deduções ou descontos. Outras situações exigem adaptação e validação fiscal.</p>
          </fieldset>
        </form>}
        <div className={`${panel} space-y-3`}>
          <h3 className="font-semibold text-white">Rascunhos salvos</h3>
          {!data.drafts.length && <p className="text-sm text-slate-400">Nenhum rascunho salvo. Comece por Novo rascunho.</p>}
          {data.truncated.drafts && <p className="text-sm text-amber-200">Exibindo somente os 100 rascunhos mais recentes.</p>}
          {data.drafts.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 py-3">
            <div><p className="font-medium text-white">{item.customer.name}</p><p className="mt-1 text-sm text-slate-400">Competência {item.competence.split('-').reverse().join('/')} · {money.format(item.amountCents / 100)} · Rascunho</p><p className="mt-1 text-xs text-slate-500">Atualizado em {dateTime(item.updatedAt)}</p></div>
            <button className="portal-ghost-button" disabled={busy} onClick={() => editDraft(item)}>Abrir rascunho</button>
          </div>)}
        </div>
      </div>}
      {tab === 'customers' && <div className="space-y-5">
        <form className={`${panel} space-y-4`} onSubmit={event => {
          event.preventDefault()
          save('saveCustomer', { data: customer }, result => {
            setData(current => ({ ...current, customers: [...current.customers.filter(item => item.id !== result.customer.id), result.customer].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) }))
            setCustomer(EMPTY_CUSTOMER); setNotice('Cliente fiscal salvo. Cadastros com o mesmo CPF/CNPJ são atualizados, sem duplicação.')
          })
        }}>
          <h3 className="font-semibold text-white">Cadastrar ou atualizar cliente fiscal</h3>
          <p className="text-xs text-slate-400">Cadastro separado dos acessos ao portal. Informar dados aqui não cria login nem altera permissões.</p>
          <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome / razão social *" required maxLength={200} value={customer.name} onChange={value => change(setCustomer, 'name', value)} />
            <Field label="CPF / CNPJ *" required maxLength={25} value={customer.taxId} onChange={value => change(setCustomer, 'taxId', value)} />
            <Field label="E-mail" type="email" maxLength={200} value={customer.email} onChange={value => change(setCustomer, 'email', value)} />
            <Field label="Inscrição municipal (se aplicável)" maxLength={40} value={customer.municipalRegistration} onChange={value => change(setCustomer, 'municipalRegistration', value)} />
            {[['postalCode', 'CEP', 10], ['street', 'Logradouro', 200], ['number', 'Número', 30], ['complement', 'Complemento', 156], ['district', 'Bairro', 60], ['municipality', 'Município', 200], ['municipalityCode', 'Código IBGE do município (7 dígitos; necessário para emitir)', 7], ['state', 'UF', 2]].map(([key, label, maxLength]) => <Field key={key} label={label} maxLength={maxLength} value={customer[key]} onChange={value => change(setCustomer, key, value)} />)}
          </fieldset>
          <div className="flex flex-wrap gap-2"><button className="portal-primary-button" disabled={busy}><Save size={16} /> {busy ? 'Salvando…' : 'Salvar cliente'}</button><button type="button" className="portal-ghost-button" disabled={busy} onClick={() => { if (canLeave()) { setCustomer(EMPTY_CUSTOMER); setDirty(false) } }}>Limpar formulário</button></div>
        </form>
        <div className={`${panel} space-y-3`}><h3 className="font-semibold text-white">Clientes fiscais cadastrados</h3>
          {!data.customers.length && <p className="text-sm text-slate-400">Nenhum cliente cadastrado.</p>}
          {data.truncated.customers && <p className="text-sm text-amber-200">Exibindo os primeiros 200 clientes por nome.</p>}
          {data.customers.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 py-3"><div><p className="font-medium text-white">{item.name}</p><p className="text-sm text-slate-400">{item.taxId} {item.municipality && `· ${item.municipality}/${item.state}`}</p></div><button className="portal-ghost-button" disabled={busy} onClick={() => { if (canLeave()) { setCustomer(item); setDirty(false); setNotice('') } }}>Editar</button></div>)}
        </div>
      </div>}
      {tab === 'issuer' && <form className={`${panel} space-y-5`} onSubmit={event => {
        event.preventDefault()
        save('saveIssuer', { data: issuer }, result => { setIssuer(result.issuer); setData(current => ({ ...current, issuer: result.issuer, readiness: result.readiness || current.readiness })); setNotice('Configuração salva. Atualize para conferir as pendências de emissão e homologação.') })
      }}>
        <h3 className="font-semibold text-white">Emitente único · Axis / GS Gestão</h3>
        <p className="text-sm text-slate-400">Os campos fiscais são preparatórios e deverão ser conferidos com o contador antes da homologação.</p>
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <Field label="Razão social" readOnly value={issuer.legalName} /><Field label="CNPJ" readOnly value="48.519.335/0001-47" />
          <Field label="Município / UF" readOnly value="Cuiabá / MT" /><Field label="Regime tributário informado" readOnly value={issuer.taxRegime} />
          {[['municipalRegistration', 'Inscrição municipal', 40], ['postalCode', 'CEP', 10], ['street', 'Logradouro', 200], ['number', 'Número', 30], ['district', 'Bairro', 200], ['complement', 'Complemento', 200], ['serviceCode', 'Código nacional de serviço (a confirmar)', 30], ['municipalServiceCode', 'Código municipal de serviço (se aplicável)', 30]].map(([key, label, maxLength]) => <Field key={key} label={label} maxLength={maxLength} value={issuer[key]} onChange={value => change(setIssuer, key, value)} />)}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="NBS validada pelo contador" maxLength={9} disabled={busy} value={issuer.nbsCode} onChange={value => change(setIssuer, 'nbsCode', value)} /><Field label="Percentual aproximado total de tributos do Simples (%) — confirmar valor atual" inputMode="decimal" maxLength={6} disabled={busy} value={issuer.totalTaxPercentSN} onChange={value => change(setIssuer, 'totalTaxPercentSN', value)} /></div>
        <label className="flex items-start gap-3 text-sm text-amber-100"><input type="checkbox" disabled={busy} checked={issuer.fiscalProfileConfirmed === true} onChange={event => change(setIssuer, 'fiscalProfileConfirmed', event.target.checked)} /><span>Confirmo com a contabilidade o perfil usado nesta configuração: ME/EPP, tributos federais e ISS pelo Simples, sem regime especial, operação tributável em Cuiabá, ISS e tributos federais não retidos, sem descontos/deduções. O percentual informado acima está correto para as emissões.</span></label>
        <Field label="Descrição padrão do serviço" multiline rows={4} disabled={busy} maxLength={2000} value={issuer.defaultDescription} onChange={value => change(setIssuer, 'defaultDescription', value)} />
        <Field label="Orientações do contador / pendências" multiline rows={3} disabled={busy} maxLength={2000} value={issuer.accountantNotes} onChange={value => change(setIssuer, 'accountantNotes', value)} />
        <div className="rounded-xl border border-white/10 p-4 text-sm text-slate-400"><strong className="text-slate-200">Certificado A1 e liberação de ambiente: somente no servidor</strong><p className="mt-2">Não envie o .pfx nem a senha por estes campos ou pelo chat. Configure os segredos no ambiente de hospedagem. Atualizar verifica abertura, CNPJ e validade local do A1; não realiza emissão nem comprova aceitação pela SEFIN. A homologação só é comprovada por uma nota de teste autorizada.</p></div>
        <button className="portal-primary-button" disabled={busy}><Save size={16} /> {busy ? 'Salvando…' : 'Salvar configuração'}</button>
      </form>}
      {tab === 'history' && <div className={`${panel} space-y-4`}>
        <h3 className="font-semibold text-white">Emissões, homologações e consultas por DPS</h3>
        <p className="text-sm text-slate-400">PDF/DANFSe: a antiga API nacional de PDF foi descontinuada. Use a consulta oficial da nota autorizada para obter o documento. O XML autorizado pode ser baixado aqui. Notas antigas não são importadas automaticamente.</p>
        {!data.operations?.length && <p className="text-sm text-slate-400">Nenhuma tentativa registrada por este módulo.</p>}
        {data.truncated.operations && <p className="text-sm text-amber-200">Exibindo as 100 tentativas mais recentes.</p>}
        {(data.operations || []).map(item => <div className="space-y-3 border-t border-white/10 py-4" key={item.id}>
          <p className="font-semibold text-white">{item.customerName} · {money.format(item.amountCents / 100)}</p>
          <p className={item.environment === 'production' ? 'text-sm text-amber-200' : 'text-sm text-sky-200'}>{item.environment === 'production' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO — SEM VALOR FISCAL'} · {stateLabel(item.state)}</p>
          <p className="break-all text-xs text-slate-400">DPS: {item.dpsId} · Série {item.series} · Número {item.dpsNumber}{item.invoiceNumber && ` · NFS-e ${item.invoiceNumber}`}</p>
          {item.message && <p className="whitespace-pre-wrap break-words text-sm text-slate-300">{item.message}</p>}
          <div className="flex flex-wrap gap-2">
            {item.state !== 'authorized' && <button className="portal-ghost-button" disabled={busy} onClick={() => reconcile(item.id)}>Consultar DPS (sem reenviar)</button>}
            <button className="portal-ghost-button" disabled={busy} onClick={() => downloadXml(item.id, 'downloadDps')}>Baixar DPS</button>
            {item.state === 'authorized' && <><button className="portal-ghost-button" disabled={busy} onClick={() => downloadXml(item.id, 'downloadXml')}>Baixar XML autorizado</button><a className="portal-ghost-button" href={item.consultationUrl} target="_blank" rel="noopener noreferrer">Consulta oficial / DANFSe</a></>}
          </div>
        </div>)}
      </div>}
      {dirty && <p role="status" className="text-sm text-amber-200">Existem alterações não salvas. Salve antes de sair desta área.</p>}
    </>}
  </div>
}
