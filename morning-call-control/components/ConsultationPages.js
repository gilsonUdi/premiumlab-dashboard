'use client';

import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Building2,
  KeyRound,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Search,
  Server,
  Users,
  X
} from 'lucide-react';
import { COLLECTIONS } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import {
  ActiveBadge,
  Avatar,
  ConfirmDeleteButton,
  EmptyState,
  Field,
  Panel,
  Switch,
  SwitchRow
} from '@/components/ui';

const EMPTY_COMPANY = {
  id: '',
  name: '',
  phoneUsed: '',
  evolutionBaseUrl: '',
  evolutionInstance: '',
  evolutionApiKey: '',
  active: true
};

const EMPTY_CLIENT = {
  companyId: '',
  name: '',
  phone: '',
  active: true,
  canConsult: true
};

function companyName(company) {
  return company?.name || company?.id || 'Empresa';
}

function CompanyForm({ initial, editing, firebaseReady, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);

  function set(key, value) {
    setForm(current => ({ ...current, [key]: value }));
  }

  return (
    <Panel
      title={editing ? `Editar empresa · ${initial.id}` : 'Nova empresa de consulta'}
      description="Cadastro independente da IA 360°."
      icon={Building2}
      className="formPanel"
      action={
        <button type="button" className="iconBtn" onClick={onCancel} title="Fechar">
          <X size={15} />
        </button>
      }
    >
      <form
        className="form"
        onSubmit={event => {
          event.preventDefault();
          onSubmit(form);
        }}
      >
        <div className="formGrid three">
          <Field label="ID da empresa" hint={editing ? 'O ID nao pode ser alterado.' : 'Ex.: gradual-consulta'}>
            <input
              value={form.id}
              onChange={event => set('id', event.target.value)}
              disabled={editing}
              required
            />
          </Field>
          <Field label="Nome">
            <input
              value={form.name}
              onChange={event => set('name', event.target.value)}
              placeholder="Lentes Gradual"
              required
            />
          </Field>
          <Field label="Telefone usado" hint="Numero conectado na Evolution para esta ferramenta.">
            <input
              value={form.phoneUsed}
              onChange={event => set('phoneUsed', event.target.value)}
              placeholder="66999999999"
              required
            />
          </Field>
          <Field label="URL da Evolution">
            <input
              value={form.evolutionBaseUrl}
              onChange={event => set('evolutionBaseUrl', event.target.value)}
              placeholder="https://evolution.gsgestao.com.br"
            />
          </Field>
          <Field label="Instancia Evolution">
            <input
              value={form.evolutionInstance}
              onChange={event => set('evolutionInstance', event.target.value)}
              placeholder="Atendimento AI"
            />
          </Field>
          <Field label="API key Evolution" hint="Independente por numero/instancia.">
            <input
              value={form.evolutionApiKey}
              onChange={event => set('evolutionApiKey', event.target.value)}
              placeholder="Chave da instancia"
              type="password"
            />
          </Field>
        </div>

        <div className="switchGrid">
          <div className="switchInline">
            <Switch checked={form.active} onChange={value => set('active', value)} label="Empresa ativa" />
            <span>Empresa ativa</span>
          </div>
        </div>

        <div className="formActions">
          <button className="btn primary" type="submit" disabled={!firebaseReady}>
            <Plus size={15} />
            {editing ? 'Salvar alteracoes' : 'Cadastrar empresa'}
          </button>
          <button className="btn ghost" type="button" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </Panel>
  );
}

function ConsultationCompanyCard({ company, stats, firebaseReady, onOpen, onEdit, onToggle, onRemove }) {
  return (
    <article className="companyCard">
      <button type="button" className="companyCardMain" onClick={onOpen}>
        <div className="companyCardTop">
          <Avatar name={companyName(company)} tone="gold" />
          <div>
            <strong>{companyName(company)}</strong>
            <span className="mono">{company.id}</span>
          </div>
        </div>
        <div className="companyCardStats">
          <div>
            <strong>{stats.clients}</strong>
            <span>clientes</span>
          </div>
          <div>
            <strong>{company.evolutionInstance || '-'}</strong>
            <span>instancia</span>
          </div>
          <div>
            <strong>{formatPhone(company.phoneUsed)}</strong>
            <span>numero</span>
          </div>
        </div>
      </button>
      <footer className="companyCardFoot">
        <ActiveBadge active={company.active} activeText="Ativa" inactiveText="Inativa" />
        <div className="rowActions">
          <Switch
            checked={Boolean(company.active)}
            onChange={onToggle}
            disabled={!firebaseReady}
            label={`Ativar ou desativar ${companyName(company)}`}
          />
          <button type="button" className="iconBtn" onClick={onEdit} title="Editar">
            <Pencil size={15} />
          </button>
          <ConfirmDeleteButton onConfirm={onRemove} disabled={!firebaseReady} />
        </div>
      </footer>
    </article>
  );
}

export function ConsultationOverviewPage({ companies, clients, executions, onNavigate }) {
  const activeCompanies = companies.filter(company => company.active).length;
  const activeClients = clients.filter(client => client.active).length;

  return (
    <>
      <div className="kpiRow">
        <div className="kpi">
          <span className="kpiIcon gold">
            <Building2 size={18} />
          </span>
          <div>
            <span className="kpiLabel">Empresas</span>
            <strong className="kpiValue">{companies.length}</strong>
            <span className="kpiHint">{activeCompanies} ativas</span>
          </div>
        </div>
        <div className="kpi">
          <span className="kpiIcon cyan">
            <Users size={18} />
          </span>
          <div>
            <span className="kpiLabel">Clientes</span>
            <strong className="kpiValue">{clients.length}</strong>
            <span className="kpiHint">{activeClients} ativos</span>
          </div>
        </div>
        <div className="kpi">
          <span className="kpiIcon green">
            <MessageCircle size={18} />
          </span>
          <div>
            <span className="kpiLabel">Consultas</span>
            <strong className="kpiValue">{executions.length}</strong>
            <span className="kpiHint">historico da ferramenta</span>
          </div>
        </div>
        <div className="kpi">
          <span className="kpiIcon gray">
            <Bot size={18} />
          </span>
          <div>
            <span className="kpiLabel">Modulo</span>
            <strong className="kpiValue">IA</strong>
            <span className="kpiHint">consulta WhatsApp</span>
          </div>
        </div>
      </div>

      <div className="overviewGrid">
        <Panel
          title="Empresas de consulta"
          description="Numeros e instancias Evolution usados apenas pelo Atendimento AI."
          icon={Building2}
          action={
            <button type="button" className="btn primary" onClick={() => onNavigate('consultation-companies')}>
              <Plus size={15} />
              Nova empresa
            </button>
          }
        >
          {companies.length ? (
            <div className="miniCompanyList">
              {companies.slice(0, 6).map(company => (
                <button
                  type="button"
                  key={company.id}
                  className="miniCompany"
                  onClick={() => onNavigate('consultation-companies')}
                >
                  <div>
                    <strong>{companyName(company)}</strong>
                    <span>
                      {formatPhone(company.phoneUsed)}
                      {company.evolutionInstance ? ` · ${company.evolutionInstance}` : ''}
                    </span>
                  </div>
                  <ActiveBadge active={company.active} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={Building2} title="Nenhuma empresa cadastrada">
              Cadastre a empresa que usara o Atendimento AI pelo WhatsApp.
            </EmptyState>
          )}
        </Panel>

        <Panel title="Configuracao esperada" icon={Server} className="n8nPanel">
          <div className="n8nText">
            <p>
              As empresas e clientes deste modulo sao independentes da IA 360°. A Evolution
              pode reaproveitar URL/base da infraestrutura, mas a API key fica por numero/instancia.
            </p>
          </div>
        </Panel>
      </div>
    </>
  );
}

export function ConsultationCompaniesPage({
  companies,
  clients,
  companyMap,
  firebaseReady,
  saveCompany,
  updateCompany,
  toggleDoc,
  removeDoc
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState('all');

  const selectedCompany = selectedCompanyId !== 'all' ? companyMap[selectedCompanyId] : null;

  const stats = useMemo(() => {
    return companies.reduce((acc, company) => {
      acc[company.id] = {
        clients: clients.filter(client => client.companyId === company.id).length
      };
      return acc;
    }, {});
  }, [companies, clients]);

  function openForm(company) {
    setEditingCompany(company || null);
    setFormOpen(true);
  }

  async function handleSubmit(form) {
    const ok = editingCompany
      ? await updateCompany(editingCompany.id, form)
      : await saveCompany(form);

    if (ok) {
      setFormOpen(false);
      setEditingCompany(null);
    }
  }

  return (
    <>
      <div className="tabBar">
        <button
          type="button"
          className={`tab ${selectedCompanyId === 'all' ? 'active' : ''}`.trim()}
          onClick={() => setSelectedCompanyId('all')}
        >
          Todas
          <em>{companies.length}</em>
        </button>
        {companies.map(company => (
          <button
            key={company.id}
            type="button"
            className={`tab ${selectedCompanyId === company.id ? 'active' : ''}`.trim()}
            onClick={() => setSelectedCompanyId(company.id)}
          >
            <i className={`statusDot ${company.active ? 'green' : 'gray'}`} />
            {companyName(company)}
          </button>
        ))}
        <button type="button" className="tab newTab" onClick={() => openForm(null)}>
          <Plus size={14} />
          Nova empresa
        </button>
      </div>

      {formOpen ? (
        <CompanyForm
          key={editingCompany?.id || 'new'}
          initial={
            editingCompany
              ? {
                  id: editingCompany.id,
                  name: editingCompany.name || '',
                  phoneUsed: editingCompany.phoneUsed || '',
                  evolutionBaseUrl: editingCompany.evolutionBaseUrl || '',
                  evolutionInstance: editingCompany.evolutionInstance || '',
                  evolutionApiKey: editingCompany.evolutionApiKey || '',
                  active: editingCompany.active !== false
                }
              : EMPTY_COMPANY
          }
          editing={Boolean(editingCompany)}
          firebaseReady={firebaseReady}
          onSubmit={handleSubmit}
          onCancel={() => {
            setFormOpen(false);
            setEditingCompany(null);
          }}
        />
      ) : null}

      {selectedCompanyId === 'all' ? (
        companies.length ? (
          <div className="cardGrid">
            {companies.map(company => (
              <ConsultationCompanyCard
                key={company.id}
                company={company}
                stats={stats[company.id] || { clients: 0 }}
                firebaseReady={firebaseReady}
                onOpen={() => setSelectedCompanyId(company.id)}
                onEdit={() => openForm(company)}
                onToggle={() => toggleDoc(COLLECTIONS.consultationCompanies, company)}
                onRemove={() => removeDoc(COLLECTIONS.consultationCompanies, company.id)}
              />
            ))}
          </div>
        ) : (
          <EmptyState icon={Building2} title="Nenhuma empresa cadastrada">
            Use o botao Nova empresa para cadastrar a primeira ferramenta de atendimento.
          </EmptyState>
        )
      ) : selectedCompany ? (
        <div className="companyDetailGrid">
          <Panel title={companyName(selectedCompany)} icon={Building2}>
            <div className="infoList">
              <div className="infoItem">
                <span>ID</span>
                <strong>{selectedCompany.id}</strong>
              </div>
              <div className="infoItem">
                <span>Telefone usado</span>
                <strong>{formatPhone(selectedCompany.phoneUsed)}</strong>
              </div>
              <div className="infoItem">
                <span>Instancia Evolution</span>
                <strong>{selectedCompany.evolutionInstance || '-'}</strong>
              </div>
              <div className="infoItem">
                <span>URL Evolution</span>
                <strong>{selectedCompany.evolutionBaseUrl || '-'}</strong>
              </div>
              <div className="infoItem">
                <span>API key</span>
                <strong>{selectedCompany.evolutionApiKey ? 'Configurada' : 'Nao informada'}</strong>
              </div>
              <div className="infoItem">
                <span>Atualizado em</span>
                <strong>{formatDate(selectedCompany.updatedAt || selectedCompany.createdAt)}</strong>
              </div>
            </div>
            <div className="formActions">
              <button type="button" className="btn ghost" onClick={() => openForm(selectedCompany)}>
                <Pencil size={14} />
                Editar
              </button>
              <Switch
                checked={Boolean(selectedCompany.active)}
                onChange={() => toggleDoc(COLLECTIONS.consultationCompanies, selectedCompany)}
                disabled={!firebaseReady}
                label="Ativar empresa"
              />
            </div>
          </Panel>

          <Panel title="Clientes vinculados" icon={Users}>
            {clients.filter(client => client.companyId === selectedCompany.id).length ? (
              <div className="clientList">
                {clients
                  .filter(client => client.companyId === selectedCompany.id)
                  .map(client => (
                    <div className="clientRow" key={client.id}>
                      <Avatar name={client.name || client.phone} tone="cyan" />
                      <div className="clientMeta">
                        <strong>{client.name || formatPhone(client.phone)}</strong>
                        <span>{formatPhone(client.phone)}</span>
                      </div>
                      <ActiveBadge active={client.active} />
                    </div>
                  ))}
              </div>
            ) : (
              <EmptyState icon={Users} title="Sem clientes">
                Cadastre clientes para esta empresa na aba Clientes.
              </EmptyState>
            )}
          </Panel>
        </div>
      ) : (
        <EmptyState icon={Building2} title="Empresa nao encontrada" />
      )}
    </>
  );
}

function ClientForm({ initial, editing, companies, firebaseReady, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);

  function set(key, value) {
    setForm(current => ({ ...current, [key]: value }));
  }

  return (
    <Panel
      title={editing ? `Editar cliente · ${initial.name || formatPhone(initial.phone)}` : 'Novo cliente de consulta'}
      description="Cliente autorizado a conversar com o Atendimento AI."
      icon={Users}
      className="formPanel"
      action={
        <button type="button" className="iconBtn" onClick={onCancel} title="Fechar">
          <X size={15} />
        </button>
      }
    >
      <form
        className="form"
        onSubmit={event => {
          event.preventDefault();
          onSubmit(form);
        }}
      >
        <div className="formGrid three">
          <Field label="Empresa">
            <select
              value={form.companyId}
              onChange={event => set('companyId', event.target.value)}
              required
            >
              <option value="">Selecione</option>
              {companies.map(company => (
                <option key={company.id} value={company.id}>
                  {companyName(company)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nome">
            <input
              value={form.name}
              onChange={event => set('name', event.target.value)}
              placeholder="Nome do cliente"
              required
            />
          </Field>
          <Field label="Telefone">
            <input
              value={form.phone}
              onChange={event => set('phone', event.target.value)}
              placeholder="66999999999"
              required
            />
          </Field>
        </div>

        <div className="switchGrid">
          <div className="switchInline">
            <Switch checked={form.active} onChange={value => set('active', value)} label="Cliente ativo" />
            <span>Cliente ativo</span>
          </div>
          <div className="switchInline">
            <Switch checked={form.canConsult} onChange={value => set('canConsult', value)} label="Pode consultar" />
            <span>Pode consultar</span>
          </div>
        </div>

        <div className="formActions">
          <button className="btn primary" type="submit" disabled={!firebaseReady}>
            <Plus size={15} />
            {editing ? 'Salvar alteracoes' : 'Cadastrar cliente'}
          </button>
          <button className="btn ghost" type="button" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </Panel>
  );
}

function ConsultationClientDetail({
  client,
  companyMap,
  firebaseReady,
  onBack,
  onEdit,
  onToggleField,
  onRemove
}) {
  return (
    <>
      <Panel className="clientDetailHead">
        <div className="clientDetailTop">
          <button type="button" className="btn ghost" onClick={onBack}>
            <ArrowLeft size={15} />
            Clientes
          </button>
          <div className="rowActions">
            <button type="button" className="btn ghost" onClick={onEdit}>
              <Pencil size={14} />
              Editar
            </button>
            <ConfirmDeleteButton onConfirm={onRemove} disabled={!firebaseReady} />
          </div>
        </div>
        <div className="clientDetailId">
          <Avatar name={client.name || client.phone} size="lg" tone="cyan" />
          <div>
            <h2>{client.name || formatPhone(client.phone)}</h2>
            <span>
              {companyName(companyMap[client.companyId])}
              {' · '}
              {formatPhone(client.phone)}
            </span>
          </div>
          <ActiveBadge active={client.active} />
        </div>
      </Panel>

      <div className="clientDetailGrid">
        <Panel title="Permissoes" icon={KeyRound}>
          <SwitchRow
            label="Cliente ativo"
            description="Autorizado a interagir com o Atendimento AI."
            checked={Boolean(client.active)}
            onChange={value => onToggleField('active', value)}
            disabled={!firebaseReady}
          />
          <SwitchRow
            label="Pode consultar"
            description="Pode receber respostas da IA pelo WhatsApp."
            checked={client.canConsult !== false}
            onChange={value => onToggleField('canConsult', value)}
            disabled={!firebaseReady}
          />
        </Panel>

        <Panel title="Dados do cliente" icon={Phone}>
          <div className="infoList">
            <div className="infoItem">
              <span>Telefone</span>
              <strong>{formatPhone(client.phone)}</strong>
            </div>
            <div className="infoItem">
              <span>Cadastrado em</span>
              <strong>{formatDate(client.createdAt)}</strong>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}

export function ConsultationClientsPage({
  clients,
  companies,
  companyMap,
  focusId,
  onFocus,
  firebaseReady,
  saveClient,
  updateClient,
  removeDoc
}) {
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);

  const focusedClient = focusId ? clients.find(client => client.id === focusId) : null;

  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();

    return clients.filter(client => {
      if (companyFilter !== 'all' && client.companyId !== companyFilter) return false;
      if (!term) return true;

      return [client.name, client.phone, companyMap[client.companyId]?.name]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(term));
    });
  }, [clients, search, companyFilter, companyMap]);

  function openForm(client) {
    setEditingClient(client || null);
    setFormOpen(true);
  }

  async function handleSubmit(form) {
    const ok = editingClient ? await updateClient(editingClient.id, form) : await saveClient(form);

    if (ok) {
      setFormOpen(false);
      setEditingClient(null);
    }
  }

  if (focusedClient && !formOpen) {
    return (
      <ConsultationClientDetail
        client={focusedClient}
        companyMap={companyMap}
        firebaseReady={firebaseReady}
        onBack={() => onFocus(null)}
        onEdit={() => openForm(focusedClient)}
        onToggleField={(field, value) => updateClient(focusedClient.id, { [field]: value })}
        onRemove={async () => {
          await removeDoc(COLLECTIONS.consultationClients, focusedClient.id);
          onFocus(null);
        }}
      />
    );
  }

  return (
    <>
      {formOpen ? (
        <ClientForm
          key={editingClient?.id || 'new'}
          initial={
            editingClient
              ? {
                  companyId: editingClient.companyId || '',
                  name: editingClient.name || '',
                  phone: editingClient.phone || '',
                  active: editingClient.active !== false,
                  canConsult: editingClient.canConsult !== false
                }
              : { ...EMPTY_CLIENT, companyId: companies[0]?.id || '' }
          }
          editing={Boolean(editingClient)}
          companies={companies}
          firebaseReady={firebaseReady}
          onSubmit={handleSubmit}
          onCancel={() => {
            setFormOpen(false);
            setEditingClient(null);
          }}
        />
      ) : null}

      <div className="toolbar">
        <div className="searchBox">
          <Search size={15} />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar por nome, telefone ou empresa"
          />
        </div>
        <div className="chipRow">
          <button
            type="button"
            className={`chip ${companyFilter === 'all' ? 'active' : ''}`.trim()}
            onClick={() => setCompanyFilter('all')}
          >
            Todas
            <em>{clients.length}</em>
          </button>
          {companies.map(company => {
            const count = clients.filter(client => client.companyId === company.id).length;
            return (
              <button
                key={company.id}
                type="button"
                className={`chip ${companyFilter === company.id ? 'active' : ''}`.trim()}
                onClick={() => setCompanyFilter(company.id)}
              >
                {companyName(company)}
                <em>{count}</em>
              </button>
            );
          })}
        </div>
        <button type="button" className="btn primary" onClick={() => openForm(null)}>
          <Plus size={15} />
          Novo cliente
        </button>
      </div>

      {filteredClients.length ? (
        <div className="clientList panelless">
          {filteredClients.map(client => (
            <button
              key={client.id}
              type="button"
              className="clientRow"
              onClick={() => onFocus(client.id)}
            >
              <Avatar name={client.name || client.phone} tone="cyan" />
              <div className="clientMeta">
                <strong>{client.name || formatPhone(client.phone)}</strong>
                <span>
                  {companyName(companyMap[client.companyId])}
                  {' · '}
                  {formatPhone(client.phone)}
                </span>
              </div>
              <div className="clientFlags">
                {client.canConsult !== false ? (
                  <span className="flag" title="Pode consultar">
                    <Bot size={12} />
                    consulta
                  </span>
                ) : null}
              </div>
              <div className="clientRight">
                <ActiveBadge active={client.active} />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState icon={Users} title="Nenhum cliente encontrado">
          {clients.length ? 'Ajuste a busca ou o filtro.' : 'Cadastre o primeiro cliente do Atendimento AI.'}
        </EmptyState>
      )}
    </>
  );
}
