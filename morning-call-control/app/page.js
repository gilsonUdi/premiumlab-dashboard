'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { AlertTriangle, CheckCircle2, Database, X } from 'lucide-react';
import { db, hasFirebaseConfig } from '@/lib/firebase';
import { normalizePhone } from '@/lib/phone';
import {
  COLLECTIONS,
  getPowerBiDocId,
  getPowerBiModelLabel,
  normalizePowerBiModelType
} from '@/lib/constants';
import { useCollection } from '@/lib/useCollection';
import Sidebar from '@/components/Sidebar';
import ModuleHomePage from '@/components/ModuleHomePage';
import OverviewPage from '@/components/OverviewPage';
import CompaniesPage from '@/components/CompaniesPage';
import ClientsPage from '@/components/ClientsPage';
import PowerBiPage from '@/components/PowerBiPage';
import ActivityPage from '@/components/ActivityPage';
import ChatPage from '@/components/ChatPage';
import {
  ConsultationClientsPage,
  ConsultationCompaniesPage,
  ConsultationConnectionPage,
  ConsultationOverviewPage
} from '@/components/ConsultationPages';

const PAGE_META = {
  home: {
    title: 'Home',
    description: 'Escolha qual ferramenta do Axis AI deseja controlar.'
  },
  overview: {
    title: 'Visao geral',
    description: 'Acompanhe a operacao da IA 360° em tempo real.'
  },
  companies: {
    title: 'Empresas',
    description: 'Tenants atendidos pela IA 360° e tudo que pertence a cada um.'
  },
  clients: {
    title: 'Clientes',
    description: 'Numeros autorizados a receber ou solicitar a IA 360°.'
  },
  powerbi: {
    title: 'Power BI',
    description: 'Datasets usados na geracao dos relatorios, por empresa e modelo.'
  },
  chat: {
    title: 'Chat',
    description: 'Veja a conversa dos clientes com o Axis AI em formato de mensagens.'
  },
  activity: {
    title: 'Atividade',
    description: 'Tudo que o fluxo n8n registrou: avisos, solicitacoes, envios e erros.'
  },
  'consultation-overview': {
    title: 'Visao geral',
    description: 'Acompanhe a estrutura do Atendimento AI.'
  },
  'consultation-companies': {
    title: 'Empresas',
    description: 'Empresas, numeros usados e API Evolution do Atendimento AI.'
  },
  'consultation-connection': {
    title: 'Conexao WhatsApp',
    description: 'Conecte a instancia Evolution da empresa.'
  },
  'consultation-clients': {
    title: 'Clientes',
    description: 'Clientes autorizados a usar o Atendimento AI.'
  },
  'consultation-chat': {
    title: 'Chat',
    description: 'Conversas do Atendimento AI separadas por empresa e instancia Evolution.'
  }
};

export default function Home() {
  const firebaseReady = hasFirebaseConfig();
  const tenantsState = useCollection(COLLECTIONS.tenants);
  const contactsState = useCollection(COLLECTIONS.contacts);
  const powerBiState = useCollection(COLLECTIONS.powerbi);
  const executionsState = useCollection(COLLECTIONS.executions);
  const consultationCompaniesState = useCollection(COLLECTIONS.consultationCompanies);
  const consultationClientsState = useCollection(COLLECTIONS.consultationClients);
  const consultationExecutionsState = useCollection(COLLECTIONS.consultationExecutions);

  const [module, setModule] = useState(null);
  const [page, setPage] = useState('home');
  const [companyTab, setCompanyTab] = useState('all');
  const [clientFocusId, setClientFocusId] = useState(null);
  const [consultationClientFocusId, setConsultationClientFocusId] = useState(null);
  const [consultationConnectionCompanyId, setConsultationConnectionCompanyId] = useState(null);
  const [notice, setNotice] = useState(null);

  const tenants = tenantsState.items;
  const contacts = contactsState.items;
  const executions = executionsState.items;
  const consultationCompanies = consultationCompaniesState.items;
  const consultationClients = consultationClientsState.items;
  const consultationExecutions = consultationExecutionsState.items;

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

  const tenantMap = useMemo(() => {
    return tenants.reduce((acc, tenant) => {
      acc[tenant.id] = tenant;
      return acc;
    }, {});
  }, [tenants]);

  const consultationCompanyMap = useMemo(() => {
    return consultationCompanies.reduce((acc, company) => {
      acc[company.id] = company;
      return acc;
    }, {});
  }, [consultationCompanies]);

  const consultationEvolutionConfigMap = useMemo(() => {
    return consultationCompanies.reduce((acc, company) => {
      acc[company.id] = {
        baseUrl: company.evolutionBaseUrl || '',
        instance: company.evolutionInstance || '',
        apiKey: company.evolutionApiKey || '',
        strict: true
      };
      return acc;
    }, {});
  }, [consultationCompanies]);

  const errorCount = useMemo(
    () => executions.filter(execution => execution.status === 'error').length,
    [executions]
  );

  const collectionErrors = [
    tenantsState.error,
    contactsState.error,
    powerBiState.error,
    executionsState.error,
    consultationCompaniesState.error,
    consultationClientsState.error,
    consultationExecutionsState.error
  ].filter(Boolean);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

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

  async function saveTenant(form) {
    if (!ensureDb()) return false;
    if (!form.id.trim()) {
      showNotice('error', 'Informe o ID do tenant antes de salvar.');
      return false;
    }

    const id = form.id.trim().toLowerCase();
    try {
      await setDoc(
        doc(db, COLLECTIONS.tenants, id),
        {
          name: form.name.trim(),
          slug: form.slug.trim() || id,
          active: form.active,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp()
        },
        { merge: true }
      );
      showNotice('success', `Empresa ${form.name.trim() || id} salva com sucesso.`);
      return true;
    } catch (error) {
      handleActionError(error, 'Nao foi possivel salvar a empresa.');
      return false;
    }
  }

  async function saveContact(form) {
    if (!ensureDb()) return false;
    if (!form.tenant || !form.phone.trim()) {
      showNotice('error', 'Selecione a empresa e informe o telefone antes de salvar.');
      return false;
    }

    try {
      await addDoc(collection(db, COLLECTIONS.contacts), {
        ...form,
        phone: normalizePhone(form.phone),
        name: form.name.trim(),
        confirmationPhrase: form.confirmationPhrase.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastNoticeSentAt: null,
        lastReportSentAt: null
      });
      showNotice('success', 'Cliente autorizado com sucesso.');
      return true;
    } catch (error) {
      handleActionError(error, 'Nao foi possivel salvar o cliente.');
      return false;
    }
  }

  async function updateContact(id, data) {
    if (!ensureDb()) return false;

    const payload = { ...data };
    if (typeof payload.phone === 'string') payload.phone = normalizePhone(payload.phone);
    if (typeof payload.name === 'string') payload.name = payload.name.trim();
    if (typeof payload.confirmationPhrase === 'string') {
      payload.confirmationPhrase = payload.confirmationPhrase.trim();
    }

    try {
      await updateDoc(doc(db, COLLECTIONS.contacts, id), {
        ...payload,
        updatedAt: serverTimestamp()
      });
      showNotice('success', 'Cliente atualizado com sucesso.');
      return true;
    } catch (error) {
      handleActionError(error, 'Nao foi possivel atualizar o cliente.');
      return false;
    }
  }

  async function savePowerBiConfig(form) {
    if (!ensureDb()) return false;
    if (!form.tenant) {
      showNotice('error', 'Selecione a empresa antes de salvar a configuracao do Power BI.');
      return false;
    }

    const tenant = form.tenant.trim();
    const modelType = normalizePowerBiModelType(form.modelType);

    try {
      await setDoc(
        doc(db, COLLECTIONS.powerbi, getPowerBiDocId(tenant, modelType)),
        {
          tenant,
          modelType,
          workspaceId: form.workspaceId.trim(),
          datasetId: form.datasetId.trim(),
          active: form.active,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp()
        },
        { merge: true }
      );
      showNotice(
        'success',
        `Configuracao de Power BI (${getPowerBiModelLabel(modelType)}) salva com sucesso.`
      );
      return true;
    } catch (error) {
      handleActionError(error, 'Nao foi possivel salvar a configuracao do Power BI.');
      return false;
    }
  }

  async function saveConsultationCompany(form) {
    if (!ensureDb()) return false;
    if (
      !form.id.trim() ||
      !form.name.trim() ||
      !form.phoneUsed.trim() ||
      !form.evolutionBaseUrl.trim() ||
      !form.evolutionInstance.trim() ||
      !form.evolutionApiKey.trim()
    ) {
      showNotice(
        'error',
        'Informe ID, nome, telefone usado, URL, instancia e API key da Evolution antes de salvar.'
      );
      return false;
    }

    const id = form.id.trim().toLowerCase();

    try {
      await setDoc(
        doc(db, COLLECTIONS.consultationCompanies, id),
        {
          name: form.name.trim(),
          phoneUsed: normalizePhone(form.phoneUsed),
          evolutionBaseUrl: form.evolutionBaseUrl.trim(),
          evolutionInstance: form.evolutionInstance.trim(),
          evolutionApiKey: form.evolutionApiKey.trim(),
          active: form.active,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp()
        },
        { merge: true }
      );
      showNotice('success', `Empresa ${form.name.trim()} salva no Atendimento AI.`);
      return true;
    } catch (error) {
      handleActionError(error, 'Nao foi possivel salvar a empresa do Atendimento AI.');
      return false;
    }
  }

  async function updateConsultationCompany(id, data) {
    if (!ensureDb()) return false;

    const payload = { ...data };
    delete payload.id;
    if (typeof payload.name === 'string') payload.name = payload.name.trim();
    if (typeof payload.phoneUsed === 'string') payload.phoneUsed = normalizePhone(payload.phoneUsed);
    if (typeof payload.evolutionBaseUrl === 'string') payload.evolutionBaseUrl = payload.evolutionBaseUrl.trim();
    if (typeof payload.evolutionInstance === 'string') payload.evolutionInstance = payload.evolutionInstance.trim();
    if (typeof payload.evolutionApiKey === 'string') payload.evolutionApiKey = payload.evolutionApiKey.trim();

    if (
      !payload.name ||
      !payload.phoneUsed ||
      !payload.evolutionBaseUrl ||
      !payload.evolutionInstance ||
      !payload.evolutionApiKey
    ) {
      showNotice(
        'error',
        'Informe nome, telefone usado, URL, instancia e API key da Evolution antes de salvar.'
      );
      return false;
    }

    try {
      await updateDoc(doc(db, COLLECTIONS.consultationCompanies, id), {
        ...payload,
        updatedAt: serverTimestamp()
      });
      showNotice('success', 'Empresa do Atendimento AI atualizada com sucesso.');
      return true;
    } catch (error) {
      handleActionError(error, 'Nao foi possivel atualizar a empresa do Atendimento AI.');
      return false;
    }
  }

  async function saveConsultationClient(form) {
    if (!ensureDb()) return false;
    if (!form.companyId || !form.name.trim() || !form.phone.trim()) {
      showNotice('error', 'Selecione a empresa e informe nome e telefone antes de salvar.');
      return false;
    }

    try {
      await addDoc(collection(db, COLLECTIONS.consultationClients), {
        ...form,
        name: form.name.trim(),
        phone: normalizePhone(form.phone),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      showNotice('success', 'Cliente cadastrado no Atendimento AI.');
      return true;
    } catch (error) {
      handleActionError(error, 'Nao foi possivel salvar o cliente do Atendimento AI.');
      return false;
    }
  }

  async function updateConsultationClient(id, data) {
    if (!ensureDb()) return false;

    const payload = { ...data };
    if (typeof payload.name === 'string') payload.name = payload.name.trim();
    if (typeof payload.phone === 'string') payload.phone = normalizePhone(payload.phone);

    try {
      await updateDoc(doc(db, COLLECTIONS.consultationClients, id), {
        ...payload,
        updatedAt: serverTimestamp()
      });
      showNotice('success', 'Cliente do Atendimento AI atualizado com sucesso.');
      return true;
    } catch (error) {
      handleActionError(error, 'Nao foi possivel atualizar o cliente do Atendimento AI.');
      return false;
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

  function navigate(nextPage) {
    setPage(nextPage);
    if (nextPage !== 'clients') setClientFocusId(null);
    if (nextPage !== 'consultation-clients') setConsultationClientFocusId(null);
  }

  function openHome() {
    setModule(null);
    setPage('home');
    setClientFocusId(null);
    setConsultationClientFocusId(null);
  }

  function openMorningCall() {
    setModule('morning-call');
    setPage('overview');
    setClientFocusId(null);
  }

  function openConsultation() {
    setModule('consultation');
    setPage('consultation-overview');
    setConsultationClientFocusId(null);
  }

  function openConsultationConnection(company) {
    setConsultationConnectionCompanyId(company.id);
    setPage('consultation-connection');
  }

  function openCompany(tenantId) {
    setCompanyTab(tenantId);
    setPage('companies');
  }

  function openClient(contactId) {
    setClientFocusId(contactId);
    setPage('clients');
  }

  const meta = PAGE_META[page] || PAGE_META.home;

  return (
    <div className="app">
      <Sidebar
        page={page}
        module={module}
        onNavigate={navigate}
        onHome={openHome}
        counts={{
          companies: tenants.length,
          clients: contacts.length,
          'consultation-companies': consultationCompanies.length,
          'consultation-clients': consultationClients.length,
          'consultation-chat': consultationClients.length
        }}
        errorCount={errorCount}
        firebaseReady={firebaseReady}
      />

      <main className="main">
        <div className="mainInner">
          <header className="pageHeader">
            <div>
              <h1 className="pageTitle">{meta.title}</h1>
              <p className="pageDesc">{meta.description}</p>
            </div>
          </header>

          {!firebaseReady ? (
            <div className="banner warning">
              <Database size={17} />
              <div>
                <strong>Firebase ainda nao configurado.</strong>
                <p>
                  Configure as variaveis <code>NEXT_PUBLIC_FIREBASE_*</code> na Vercel ou no{' '}
                  <code>.env.local</code> para habilitar leitura e gravacao no Firestore.
                </p>
              </div>
            </div>
          ) : null}

          {collectionErrors.length ? (
            <div className="banner error">
              <AlertTriangle size={17} />
              <div>
                <strong>O Firestore retornou um erro.</strong>
                <p>{collectionErrors[0]}</p>
              </div>
            </div>
          ) : null}

          {page === 'home' ? (
            <ModuleHomePage
              morningCallCounts={{ companies: tenants.length, clients: contacts.length }}
              consultationCounts={{
                companies: consultationCompanies.length,
                clients: consultationClients.length
              }}
              onOpenMorningCall={openMorningCall}
              onOpenConsultation={openConsultation}
            />
          ) : null}

          {page === 'overview' ? (
            <OverviewPage
              tenants={tenants}
              contacts={contacts}
              powerBiConfigs={powerBiConfigs}
              executions={executions}
              tenantMap={tenantMap}
              onOpenCompany={openCompany}
              onNavigate={navigate}
            />
          ) : null}

          {page === 'companies' ? (
            <CompaniesPage
              tenants={tenants}
              contacts={contacts}
              powerBiConfigs={powerBiConfigs}
              executions={executions}
              tenantMap={tenantMap}
              tab={companyTab === 'all' || tenantMap[companyTab] ? companyTab : 'all'}
              onTabChange={setCompanyTab}
              onOpenClient={openClient}
              saveTenant={saveTenant}
              toggleDoc={toggleDoc}
              removeDoc={removeDoc}
              firebaseReady={firebaseReady}
            />
          ) : null}

          {page === 'clients' ? (
            <ClientsPage
              contacts={contacts}
              tenants={tenants}
              tenantMap={tenantMap}
              executions={executions}
              focusId={clientFocusId}
              onFocus={setClientFocusId}
              saveContact={saveContact}
              updateContact={updateContact}
              removeDoc={removeDoc}
              firebaseReady={firebaseReady}
            />
          ) : null}

          {page === 'powerbi' ? (
            <PowerBiPage
              powerBiConfigs={powerBiConfigs}
              tenants={tenants}
              tenantMap={tenantMap}
              savePowerBiConfig={savePowerBiConfig}
              toggleDoc={toggleDoc}
              removeDoc={removeDoc}
              firebaseReady={firebaseReady}
              onOpenCompany={openCompany}
            />
          ) : null}

          {page === 'chat' ? (
            <ChatPage contacts={contacts} executions={executions} tenantMap={tenantMap} />
          ) : null}

          {page === 'activity' ? (
            <ActivityPage
              executions={executions}
              tenants={tenants}
              tenantMap={tenantMap}
              onOpenClient={execution => {
                if (execution.contactId) openClient(execution.contactId);
              }}
            />
          ) : null}

          {page === 'consultation-overview' ? (
            <ConsultationOverviewPage
              companies={consultationCompanies}
              clients={consultationClients}
              executions={consultationExecutions}
              onNavigate={navigate}
            />
          ) : null}

          {page === 'consultation-companies' ? (
            <ConsultationCompaniesPage
              companies={consultationCompanies}
              clients={consultationClients}
              companyMap={consultationCompanyMap}
              firebaseReady={firebaseReady}
              saveCompany={saveConsultationCompany}
              updateCompany={updateConsultationCompany}
              toggleDoc={toggleDoc}
              removeDoc={removeDoc}
              onConnect={openConsultationConnection}
            />
          ) : null}

          {page === 'consultation-connection' ? (
            <ConsultationConnectionPage
              company={consultationCompanyMap[consultationConnectionCompanyId]}
              onBack={() => setPage('consultation-companies')}
            />
          ) : null}

          {page === 'consultation-clients' ? (
            <ConsultationClientsPage
              clients={consultationClients}
              companies={consultationCompanies}
              companyMap={consultationCompanyMap}
              focusId={consultationClientFocusId}
              onFocus={setConsultationClientFocusId}
              firebaseReady={firebaseReady}
              saveClient={saveConsultationClient}
              updateClient={updateConsultationClient}
              removeDoc={removeDoc}
            />
          ) : null}

          {page === 'consultation-chat' ? (
            <ChatPage
              contacts={consultationClients}
              executions={consultationExecutions}
              tenantMap={consultationCompanyMap}
              assistantName="Atendimento AI"
              emptyDescription="Assim que os clientes conversarem com o Atendimento AI, o historico aparece aqui."
              segmentByTenant
              tenantLabel="Empresa"
              evolutionConfigByTenant={consultationEvolutionConfigMap}
            />
          ) : null}
        </div>
      </main>

      {notice ? (
        <div className={`toast ${notice.type}`} role="status">
          {notice.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso">
            <X size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
