'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock3,
  Database,
  MessageSquareText,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2
} from 'lucide-react';
import { db, hasFirebaseConfig } from '@/lib/firebase';
import { formatPhone, normalizePhone } from '@/lib/phone';

const COLLECTIONS = {
  tenants: 'tenants',
  contacts: 'morning_call_contacts',
  powerbi: 'powerbi_configs',
  executions: 'morning_call_executions'
};

const POWER_BI_MODEL_TYPES = [
  {
    id: 'geral',
    label: 'Dados gerais',
    description: 'Morning Call, vendas, receber e indicadores financeiros.'
  },
  {
    id: 'precos',
    label: 'Produtos e precos',
    description: 'Produtos, tabelas de negociacao, descontos e consulta de precos.'
  }
];

const DEFAULT_POWER_BI_MODEL_TYPE = 'geral';

const initialTenant = {
  id: '',
  name: '',
  slug: '',
  active: true
};

const initialContact = {
  tenant: '',
  name: '',
  phone: '',
  active: true,
  confirmationPhrase: 'Receber Morning Call',
  noticeTime: '07:00',
  timezone: 'America/Cuiaba',
  sendNotice: true,
  allowManualSend: true
};

const initialPowerBi = {
  tenant: '',
  workspaceId: '',
  datasetId: '',
  modelType: DEFAULT_POWER_BI_MODEL_TYPE,
  active: true
};

function normalizePowerBiModelType(value) {
  const modelType = String(value || '').trim().toLowerCase();

  if (POWER_BI_MODEL_TYPES.some(model => model.id === modelType)) {
    return modelType;
  }

  if (['morning_call', 'dados_gerais', 'dados-gerais', 'general'].includes(modelType)) {
    return 'geral';
  }

  if (['produtos', 'products', 'precos', 'preços', 'prices'].includes(modelType)) {
    return 'precos';
  }

  return DEFAULT_POWER_BI_MODEL_TYPE;
}

function getPowerBiDocId(tenant, modelType) {
  return `${tenant}__${normalizePowerBiModelType(modelType)}`;
}

function getPowerBiModelLabel(modelType) {
  return (
    POWER_BI_MODEL_TYPES.find(model => model.id === normalizePowerBiModelType(modelType))
      ?.label || 'Dados gerais'
  );
}

function useCollection(name) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(db));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!db) return undefined;

    const ref = collection(db, name);

    return onSnapshot(
      ref,
      snapshot => {
        const rows = snapshot.docs
          .map(item => ({ id: item.id, ...item.data() }))
          .sort((a, b) => {
            const aDate = a.createdAt?.toMillis?.() || 0;
            const bDate = b.createdAt?.toMillis?.() || 0;
            return bDate - aDate;
          });

        setItems(rows);
        setLoading(false);
        setError('');
      },
      error => {
        setLoading(false);
        setError(error.message || `Nao foi possivel carregar ${name}.`);
      }
    );
  }, [name]);

  return { items, loading, error };
}

function Card({ title, description, icon: Icon, children, action }) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <div className="panelTitleGroup">
          <span className="panelIcon">{Icon ? <Icon size={18} /> : null}</span>
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ children }) {
  return <div className="emptyState">{children}</div>;
}

function StatusPill({ active, activeText = 'Ativo', inactiveText = 'Inativo' }) {
  return (
    <span className={active ? 'pill active' : 'pill inactive'}>
      {active ? activeText : inactiveText}
    </span>
  );
}

function formatDate(value) {
  if (!value) return '-';

  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export default function Home() {
  const firebaseReady = hasFirebaseConfig();
  const tenantsState = useCollection(COLLECTIONS.tenants);
  const contactsState = useCollection(COLLECTIONS.contacts);
  const powerBiState = useCollection(COLLECTIONS.powerbi);
  const executionsState = useCollection(COLLECTIONS.executions);

  const [tenantForm, setTenantForm] = useState(initialTenant);
  const [contactForm, setContactForm] = useState(initialContact);
  const [powerBiForm, setPowerBiForm] = useState(initialPowerBi);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState(null);

  const tenants = tenantsState.items;
  const contacts = contactsState.items;
  const powerBiConfigs = useMemo(() => {
    return powerBiState.items.map(config => {
      const [tenantFromId, modelFromId] = String(config.id || '').split('__');

      return {
        ...config,
        tenant: config.tenant || tenantFromId || '',
        modelType: normalizePowerBiModelType(config.modelType || modelFromId)
      };
    });
  }, [powerBiState.items]);
  const executions = executionsState.items;

  useEffect(() => {
    if (!contactForm.tenant && tenants[0]?.id) {
      setContactForm(current => ({ ...current, tenant: tenants[0].id }));
    }

    if (!powerBiForm.tenant && tenants[0]?.id) {
      setPowerBiForm(current => ({ ...current, tenant: tenants[0].id }));
    }
  }, [tenants, contactForm.tenant, powerBiForm.tenant]);

  const tenantMap = useMemo(() => {
    return tenants.reduce((acc, tenant) => {
      acc[tenant.id] = tenant;
      return acc;
    }, {});
  }, [tenants]);

  const filteredContacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contacts;

    return contacts.filter(contact => {
      return [
        contact.name,
        contact.tenant,
        contact.phone,
        tenantMap[contact.tenant]?.name
      ]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(term));
    });
  }, [contacts, search, tenantMap]);

  const collectionErrors = [
    tenantsState.error,
    contactsState.error,
    powerBiState.error,
    executionsState.error
  ].filter(Boolean);

  function showNotice(type, message) {
    setNotice({ type, message });
  }

  function ensureDb() {
    if (db) return true;

    showNotice(
      'error',
      'Firebase nao configurado. Confira as variaveis NEXT_PUBLIC_FIREBASE_* na Vercel e faca um novo deploy.'
    );
    return false;
  }

  function handleActionError(error, fallbackMessage) {
    showNotice('error', error?.message || fallbackMessage);
  }

  async function saveTenant(event) {
    event.preventDefault();
    if (!ensureDb()) return;
    if (!tenantForm.id.trim()) {
      showNotice('error', 'Informe o ID do tenant antes de salvar.');
      return;
    }

    const id = tenantForm.id.trim().toLowerCase();
    try {
      await setDoc(
        doc(db, COLLECTIONS.tenants, id),
        {
          name: tenantForm.name.trim(),
          slug: tenantForm.slug.trim() || id,
          active: tenantForm.active,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp()
        },
        { merge: true }
      );
      setTenantForm(initialTenant);
      showNotice('success', `Tenant ${id} salvo com sucesso.`);
    } catch (error) {
      handleActionError(error, 'Nao foi possivel salvar o tenant.');
    }
  }

  async function saveContact(event) {
    event.preventDefault();
    if (!ensureDb()) return;
    if (!contactForm.tenant || !contactForm.phone.trim()) {
      showNotice('error', 'Selecione o tenant e informe o telefone antes de salvar.');
      return;
    }

    try {
      await addDoc(collection(db, COLLECTIONS.contacts), {
        ...contactForm,
        phone: normalizePhone(contactForm.phone),
        name: contactForm.name.trim(),
        confirmationPhrase: contactForm.confirmationPhrase.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastNoticeSentAt: null,
        lastReportSentAt: null
      });
      setContactForm(current => ({ ...initialContact, tenant: current.tenant }));
      showNotice('success', 'Numero autorizado salvo com sucesso.');
    } catch (error) {
      handleActionError(error, 'Nao foi possivel salvar o numero autorizado.');
    }
  }

  async function savePowerBiConfig(event) {
    event.preventDefault();
    if (!ensureDb()) return;
    if (!powerBiForm.tenant) {
      showNotice('error', 'Selecione o tenant antes de salvar a configuracao do Power BI.');
      return;
    }

    const tenant = powerBiForm.tenant.trim();
    const modelType = normalizePowerBiModelType(powerBiForm.modelType);

    try {
      await setDoc(
        doc(db, COLLECTIONS.powerbi, getPowerBiDocId(tenant, modelType)),
        {
          tenant,
          modelType,
          workspaceId: powerBiForm.workspaceId.trim(),
          datasetId: powerBiForm.datasetId.trim(),
          active: powerBiForm.active,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp()
        },
        { merge: true }
      );
      setPowerBiForm(current => ({
        ...initialPowerBi,
        tenant: current.tenant,
        modelType: current.modelType
      }));
      showNotice(
        'success',
        `Configuracao de Power BI (${getPowerBiModelLabel(modelType)}) salva com sucesso.`
      );
    } catch (error) {
      handleActionError(error, 'Nao foi possivel salvar a configuracao do Power BI.');
    }
  }

  async function toggleDoc(collectionName, item) {
    if (!ensureDb()) return;

    try {
      await updateDoc(doc(db, collectionName, item.id), {
        active: !item.active,
        updatedAt: serverTimestamp()
      });
      showNotice('success', 'Status atualizado com sucesso.');
    } catch (error) {
      handleActionError(error, 'Nao foi possivel atualizar o status.');
    }
  }

  async function removeDoc(collectionName, id) {
    if (!ensureDb()) return;

    try {
      await deleteDoc(doc(db, collectionName, id));
      showNotice('success', 'Registro removido com sucesso.');
    } catch (error) {
      handleActionError(error, 'Nao foi possivel remover o registro.');
    }
  }

  return (
    <main className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">GS Controladoria</p>
          <h1>Morning Call Control</h1>
          <p className="heroText">
            Painel para controlar tenants, numeros autorizados, datasets do Power BI e
            execucoes do Morning Call enviado pelo WhatsApp.
          </p>
        </div>
        <div className="heroCard">
          <div className="metric">
            <span>Tenants</span>
            <strong>{tenants.length}</strong>
          </div>
          <div className="metric">
            <span>Contatos ativos</span>
            <strong>{contacts.filter(contact => contact.active).length}</strong>
          </div>
          <div className="metric">
            <span>Configs Power BI</span>
            <strong>{powerBiConfigs.length}</strong>
          </div>
          <div className="metric">
            <span>Execucoes</span>
            <strong>{executions.length}</strong>
          </div>
        </div>
      </header>

      {!firebaseReady ? (
        <section className="configWarning">
          <Database size={20} />
          <div>
            <strong>Firebase ainda nao configurado.</strong>
            <p>
              Configure as variaveis `NEXT_PUBLIC_FIREBASE_*` na Vercel ou no
              `.env.local` para habilitar leitura e gravacao no Firestore.
            </p>
          </div>
        </section>
      ) : null}

      {collectionErrors.length ? (
        <section className="configWarning error">
          <Database size={20} />
          <div>
            <strong>Firestore retornou erro.</strong>
            <p>{collectionErrors[0]}</p>
          </div>
        </section>
      ) : null}

      {notice ? (
        <section className={`notice ${notice.type}`}>
          <strong>{notice.type === 'error' ? 'Acao nao concluida' : 'Tudo certo'}</strong>
          <p>{notice.message}</p>
        </section>
      ) : null}

      <section className="grid two">
        <Card
          title="Tenants"
          description="Empresas ou laboratorios que podem usar o Morning Call."
          icon={ShieldCheck}
        >
          <form className="form" onSubmit={saveTenant}>
            <div className="formGrid">
              <Field label="ID do tenant">
                <input
                  value={tenantForm.id}
                  onChange={event =>
                    setTenantForm(current => ({ ...current, id: event.target.value }))
                  }
                  placeholder="gradual"
                />
              </Field>
              <Field label="Nome">
                <input
                  value={tenantForm.name}
                  onChange={event =>
                    setTenantForm(current => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Lentes Gradual"
                />
              </Field>
              <Field label="Slug">
                <input
                  value={tenantForm.slug}
                  onChange={event =>
                    setTenantForm(current => ({ ...current, slug: event.target.value }))
                  }
                  placeholder="gradual"
                />
              </Field>
              <label className="checkField">
                <input
                  type="checkbox"
                  checked={tenantForm.active}
                  onChange={event =>
                    setTenantForm(current => ({
                      ...current,
                      active: event.target.checked
                    }))
                  }
                />
                Tenant ativo
              </label>
            </div>
            <button className="primaryButton" type="submit" disabled={!firebaseReady}>
              <Plus size={16} />
              Salvar tenant
            </button>
          </form>

          <div className="list">
            {tenants.length ? (
              tenants.map(tenant => (
                <div className="listItem" key={tenant.id}>
                  <div>
                    <strong>{tenant.name || tenant.id}</strong>
                    <span>{tenant.id}</span>
                  </div>
                  <div className="rowActions">
                    <StatusPill active={tenant.active} />
                    <button onClick={() => toggleDoc(COLLECTIONS.tenants, tenant)}>
                      <RefreshCw size={15} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState>Nenhum tenant cadastrado.</EmptyState>
            )}
          </div>
        </Card>

        <Card
          title="Power BI"
          description="Datasets usados pelas tools de geracao do relatorio."
          icon={BarChart3}
        >
          <form className="form" onSubmit={savePowerBiConfig}>
            <div className="formGrid">
              <Field label="Tenant">
                <select
                  value={powerBiForm.tenant}
                  onChange={event =>
                    setPowerBiForm(current => ({ ...current, tenant: event.target.value }))
                  }
                >
                  <option value="">Selecione</option>
                  {tenants.map(tenant => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name || tenant.id}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Modelo">
                <select
                  value={powerBiForm.modelType}
                  onChange={event =>
                    setPowerBiForm(current => ({
                      ...current,
                      modelType: normalizePowerBiModelType(event.target.value)
                    }))
                  }
                >
                  {POWER_BI_MODEL_TYPES.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Workspace ID">
                <input
                  value={powerBiForm.workspaceId}
                  onChange={event =>
                    setPowerBiForm(current => ({
                      ...current,
                      workspaceId: event.target.value
                    }))
                  }
                  placeholder="group id"
                />
              </Field>
              <Field label="Dataset ID">
                <input
                  value={powerBiForm.datasetId}
                  onChange={event =>
                    setPowerBiForm(current => ({
                      ...current,
                      datasetId: event.target.value
                    }))
                  }
                  placeholder="dataset id"
                />
              </Field>
              <label className="checkField">
                <input
                  type="checkbox"
                  checked={powerBiForm.active}
                  onChange={event =>
                    setPowerBiForm(current => ({
                      ...current,
                      active: event.target.checked
                    }))
                  }
                />
                Config ativa
              </label>
            </div>
            <button className="primaryButton" type="submit" disabled={!firebaseReady}>
              <Settings2 size={16} />
              Salvar Power BI
            </button>
          </form>

          <div className="list">
            {powerBiConfigs.length ? (
              powerBiConfigs.map(config => (
                <div className="listItem" key={config.id}>
                  <div>
                    <strong>
                      {tenantMap[config.tenant]?.name || config.tenant || config.id}
                    </strong>
                    <span>{getPowerBiModelLabel(config.modelType)}</span>
                    <span>{config.datasetId || 'Dataset nao informado'}</span>
                  </div>
                  <div className="rowActions">
                    <StatusPill active={config.active} />
                    <button onClick={() => toggleDoc(COLLECTIONS.powerbi, config)}>
                      <RefreshCw size={15} />
                    </button>
                    <button onClick={() => removeDoc(COLLECTIONS.powerbi, config.id)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState>Nenhuma configuracao de Power BI cadastrada.</EmptyState>
            )}
          </div>
        </Card>
      </section>

      <Card
        title="Numeros autorizados"
        description="Somente estes telefones podem solicitar ou receber Morning Call."
        icon={Phone}
        action={
          <div className="searchBox">
            <Search size={15} />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar contato"
            />
          </div>
        }
      >
        <form className="form" onSubmit={saveContact}>
          <div className="formGrid contacts">
            <Field label="Tenant">
              <select
                value={contactForm.tenant}
                onChange={event =>
                  setContactForm(current => ({ ...current, tenant: event.target.value }))
                }
              >
                <option value="">Selecione</option>
                {tenants.map(tenant => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name || tenant.id}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nome">
              <input
                value={contactForm.name}
                onChange={event =>
                  setContactForm(current => ({ ...current, name: event.target.value }))
                }
                placeholder="GS Controladoria Gilson"
              />
            </Field>
            <Field label="Telefone">
              <input
                value={contactForm.phone}
                onChange={event =>
                  setContactForm(current => ({ ...current, phone: event.target.value }))
                }
                placeholder="5566999999999"
              />
            </Field>
            <Field label="Horario aviso">
              <input
                type="time"
                value={contactForm.noticeTime}
                onChange={event =>
                  setContactForm(current => ({
                    ...current,
                    noticeTime: event.target.value
                  }))
                }
              />
            </Field>
            <Field label="Frase de confirmacao">
              <input
                value={contactForm.confirmationPhrase}
                onChange={event =>
                  setContactForm(current => ({
                    ...current,
                    confirmationPhrase: event.target.value
                  }))
                }
              />
            </Field>
            <div className="checkGroup">
              <label className="checkField">
                <input
                  type="checkbox"
                  checked={contactForm.active}
                  onChange={event =>
                    setContactForm(current => ({
                      ...current,
                      active: event.target.checked
                    }))
                  }
                />
                Ativo
              </label>
              <label className="checkField">
                <input
                  type="checkbox"
                  checked={contactForm.sendNotice}
                  onChange={event =>
                    setContactForm(current => ({
                      ...current,
                      sendNotice: event.target.checked
                    }))
                  }
                />
                Aviso diario
              </label>
            </div>
          </div>
          <button className="primaryButton" type="submit" disabled={!firebaseReady}>
            <Plus size={16} />
            Autorizar numero
          </button>
        </form>

        <div className="table">
          <div className="tableHeader contactColumns">
            <span>Contato</span>
            <span>Tenant</span>
            <span>Telefone</span>
            <span>Confirmacao</span>
            <span>Status</span>
            <span></span>
          </div>
          {filteredContacts.length ? (
            filteredContacts.map(contact => (
              <div className="tableRow contactColumns" key={contact.id}>
                <strong>{contact.name || '-'}</strong>
                <span>{tenantMap[contact.tenant]?.name || contact.tenant}</span>
                <span>{formatPhone(contact.phone)}</span>
                <span>{contact.confirmationPhrase}</span>
                <StatusPill active={contact.active} />
                <div className="rowActions">
                  <button onClick={() => toggleDoc(COLLECTIONS.contacts, contact)}>
                    <RefreshCw size={15} />
                  </button>
                  <button onClick={() => removeDoc(COLLECTIONS.contacts, contact.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <EmptyState>Nenhum numero autorizado encontrado.</EmptyState>
          )}
        </div>
      </Card>

      <Card
        title="Execucoes"
        description="Historico usado pelo n8n para auditoria e reenvio."
        icon={Activity}
      >
        <div className="table">
          <div className="tableHeader executionColumns">
            <span>Cliente</span>
            <span>Tenant</span>
            <span>Status</span>
            <span>Referencia</span>
            <span>Atualizado</span>
          </div>
          {executions.length ? (
            executions.slice(0, 20).map(execution => (
              <div className="tableRow executionColumns" key={execution.id}>
                <strong>{execution.contactName || execution.phone || '-'}</strong>
                <span>{tenantMap[execution.tenant]?.name || execution.tenant || '-'}</span>
                <span className="statusText">
                  {execution.status === 'report_sent' ? (
                    <CheckCircle2 size={15} />
                  ) : (
                    <Clock3 size={15} />
                  )}
                  {execution.status || 'pending'}
                </span>
                <span>{execution.referenceDate || '-'}</span>
                <span>{formatDate(execution.updatedAt || execution.createdAt)}</span>
              </div>
            ))
          ) : (
            <EmptyState>Nenhuma execucao registrada ainda.</EmptyState>
          )}
        </div>
      </Card>

      <section className="n8nGuide">
        <MessageSquareText size={20} />
        <div>
          <h2>Contrato para o n8n</h2>
          <p>
            O flow principal deve normalizar o telefone recebido da Evolution API e
            procurar em `morning_call_contacts` por `phone`. Se o contato estiver ativo,
            o `tenant` define qual tool de Morning Call sera chamada.
          </p>
        </div>
      </section>
    </main>
  );
}
