'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, LockKeyhole, Plus, RefreshCw, Save } from 'lucide-react'
import { getPortalAccessToken } from '@/lib/portal-store'
import { NFSE_BLOCK_REASON, NFSE_ISSUER } from '@/lib/nfse-drafts.mjs'

const EMPTY_CUSTOMER = { name: '', taxId: '', email: '', municipalRegistration: '', postalCode: '',
  street: '', number: '', complement: '', district: '', municipality: '', state: '' }
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

  return <div className="space-y-6 text-slate-200">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-widest text-amber-200">Fiscal · Axis</p>
        <h2 className="mt-1 text-2xl font-bold text-white">Notas fiscais de serviço</h2>
        <p className="mt-2 text-sm text-slate-400">Prepare clientes e rascunhos para a futura emissão de NFS-e Nacional.</p></div>
      <button type="button" className="portal-ghost-button" disabled={loading || busy} onClick={() => { if (canLeave()) { setDirty(false); setCustomer(EMPTY_CUSTOMER); setDraft(EMPTY_DRAFT); setDraftMeta({ id: '', revision: 0 }); load() } }}><RefreshCw size={16} /> Atualizar</button>
    </header>
    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4 text-sm text-amber-100">
      <div className="flex items-center gap-2 font-semibold"><LockKeyhole size={17} /> Preparação — emissão bloqueada</div>
      <p className="mt-2">{NFSE_BLOCK_REASON}</p>
      <p className="mt-2 text-xs">Inscrição municipal informada no alvará: 240541. Pendente: nota de referência, validação dos parâmetros pelo contador e integração/homologação. Certificado A1 não instalado neste módulo.</p>
    </div>
    {error && <div role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div>}
    {loading ? <p role="status">Carregando dados fiscais…</p> : !data ? <p className="text-sm text-slate-400">Não foi possível carregar. Use Atualizar para tentar novamente.</p> : <>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Área fiscal">
        {[['drafts', 'Nova nota e rascunhos'], ['customers', 'Clientes fiscais'], ['issuer', 'Configuração do emitente'], ['history', 'Notas emitidas']].map(([key, label]) =>
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
            <Field label="Descrição do serviço" multiline rows={4} maxLength={4000} value={draft.description} onChange={value => change(setDraft, 'description', value)} />
            <Field label="Código de serviço nacional (a confirmar com o contador)" maxLength={30} value={draft.serviceCode} onChange={value => change(setDraft, 'serviceCode', value)} />
            <Field label="Observações internas (não são enviadas ao governo)" multiline rows={2} maxLength={2000} value={draft.notes} onChange={value => change(setDraft, 'notes', value)} />
            <div className="flex flex-wrap gap-3"><button className="portal-primary-button" type="submit"><Save size={16} /> {busy ? 'Salvando…' : 'Salvar rascunho'}</button><button className="portal-ghost-button" type="button" disabled title={NFSE_BLOCK_REASON}><LockKeyhole size={16} /> Emitir NFS-e — indisponível</button></div>
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
            {[['postalCode', 'CEP', 10], ['street', 'Logradouro', 200], ['number', 'Número', 30], ['complement', 'Complemento', 200], ['district', 'Bairro', 200], ['municipality', 'Município', 200], ['state', 'UF', 2]].map(([key, label, maxLength]) => <Field key={key} label={label} maxLength={maxLength} value={customer[key]} onChange={value => change(setCustomer, key, value)} />)}
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
        save('saveIssuer', { data: issuer }, result => { setIssuer(result.issuer); setData(current => ({ ...current, issuer: result.issuer })); setNotice('Configuração preparatória salva. A emissão permanece bloqueada.') })
      }}>
        <h3 className="font-semibold text-white">Emitente único · Axis / GS Gestão</h3>
        <p className="text-sm text-slate-400">Os campos fiscais são preparatórios e deverão ser conferidos com o contador antes da homologação.</p>
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <Field label="Razão social" readOnly value={issuer.legalName} /><Field label="CNPJ" readOnly value="48.519.335/0001-47" />
          <Field label="Município / UF" readOnly value="Cuiabá / MT" /><Field label="Regime tributário informado" readOnly value={issuer.taxRegime} />
          {[['municipalRegistration', 'Inscrição municipal', 40], ['postalCode', 'CEP', 10], ['street', 'Logradouro', 200], ['number', 'Número', 30], ['district', 'Bairro', 200], ['complement', 'Complemento', 200], ['serviceCode', 'Código nacional de serviço (a confirmar)', 30], ['municipalServiceCode', 'Código municipal de serviço (se aplicável)', 30]].map(([key, label, maxLength]) => <Field key={key} label={label} maxLength={maxLength} value={issuer[key]} onChange={value => change(setIssuer, key, value)} />)}
        </fieldset>
        <Field label="Descrição padrão do serviço" multiline rows={4} disabled={busy} maxLength={4000} value={issuer.defaultDescription} onChange={value => change(setIssuer, 'defaultDescription', value)} />
        <Field label="Orientações do contador / pendências" multiline rows={3} disabled={busy} maxLength={2000} value={issuer.accountantNotes} onChange={value => change(setIssuer, 'accountantNotes', value)} />
        <div className="rounded-xl border border-white/10 p-4 text-sm text-slate-400"><strong className="text-slate-200">Certificado A1: configuração pendente</strong><p className="mt-2">Não envie o arquivo .pfx nem sua senha por estes campos. A instalação segura será feita posteriormente no servidor. Salvar estes dados não configura a tributação nem habilita a emissão.</p></div>
        <button className="portal-primary-button" disabled={busy}><Save size={16} /> {busy ? 'Salvando…' : 'Salvar configuração'}</button>
      </form>}
      {tab === 'history' && <div className={`${panel} text-center`}><FileText className="mx-auto mb-3 text-slate-500" size={32} /><h3 className="font-semibold text-white">Nenhuma nota emitida por este módulo</h3><p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">O histórico de notas autorizadas, número, chave de acesso e download de PDF/XML será habilitado com a integração fiscal. Notas antigas não são importadas nesta etapa. Os documentos preparados agora aparecem somente em Rascunhos.</p></div>}
      {dirty && <p role="status" className="text-sm text-amber-200">Existem alterações não salvas. Salve antes de sair desta área.</p>}
    </>}
  </div>
}
