'use client';

import { useMemo, useState } from 'react';
import {
  BarChart3,
  Building2,
  MessageSquareText,
  Pencil,
  Plus,
  Users,
  X
} from 'lucide-react';
import { COLLECTIONS, getPowerBiModelLabel } from '@/lib/constants';
import { matchExecutionToContact, timeAgo } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import {
  ActiveBadge,
  Avatar,
  ConfirmDeleteButton,
  EmptyState,
  Field,
  Panel,
  StatusBadge,
  Switch
} from '@/components/ui';
import { ExecutionFeed } from '@/components/ExecutionFeed';

const EMPTY_FORM = { id: '', name: '', slug: '', active: true };

function CompanyForm({ initial, editing, firebaseReady, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);

  function set(key, value) {
    setForm(current => ({ ...current, [key]: value }));
  }

  return (
    <Panel
      title={editing ? `Editar empresa · ${initial.id}` : 'Nova empresa'}
      description="O ID identifica o tenant no n8n e nas demais coleções."
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
        <div className="formGrid">
          <Field label="ID do tenant" hint={editing ? 'O ID não pode ser alterado.' : 'Minúsculas, sem espaços. Ex.: gradual'}>
            <input
              value={form.id}
              onChange={event => set('id', event.target.value)}
              placeholder="gradual"
              disabled={editing}
              required
            />
          </Field>
          <Field label="Nome da empresa">
            <input
              value={form.name}
              onChange={event => set('name', event.target.value)}
              placeholder="Lentes Gradual"
            />
          </Field>
          <Field label="Slug" hint="Opcional. Se vazio, usa o ID.">
            <input
              value={form.slug}
              onChange={event => set('slug', event.target.value)}
              placeholder="gradual"
            />
          </Field>
          <div className="field">
            <span className="fieldLabel">Status</span>
            <div className="switchInline">
              <Switch checked={form.active} onChange={value => set('active', value)} label="Empresa ativa" />
              <span>{form.active ? 'Empresa ativa' : 'Empresa inativa'}</span>
            </div>
          </div>
        </div>
        <div className="formActions">
          <button className="btn primary" type="submit" disabled={!firebaseReady}>
            <Plus size={15} />
            {editing ? 'Salvar alterações' : 'Cadastrar empresa'}
          </button>
          <button className="btn ghost" type="button" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </Panel>
  );
}

function CompanyCard({ tenant, stats, onOpen, onToggle, firebaseReady }) {
  return (
    <article className="companyCard">
      <button type="button" className="companyCardMain" onClick={onOpen}>
        <div className="companyCardTop">
          <Avatar name={tenant.name || tenant.id} tone="gold" />
          <div>
            <strong>{tenant.name || tenant.id}</strong>
            <span className="mono">{tenant.id}</span>
          </div>
        </div>
        <div className="companyCardStats">
          <div>
            <strong>{stats.contacts}</strong>
            <span>clientes</span>
          </div>
          <div>
            <strong>{stats.configs}</strong>
            <span>configs BI</span>
          </div>
          <div>
            <strong>{stats.executions}</strong>
            <span>execuções</span>
          </div>
        </div>
      </button>
      <footer className="companyCardFoot">
        <ActiveBadge active={tenant.active} activeText="Ativa" inactiveText="Inativa" />
        <Switch
          checked={Boolean(tenant.active)}
          onChange={onToggle}
          disabled={!firebaseReady}
          label={`Ativar ou desativar ${tenant.name || tenant.id}`}
        />
      </footer>
    </article>
  );
}

export default function CompaniesPage({
  tenants,
  contacts,
  powerBiConfigs,
  executions,
  tenantMap,
  tab,
  onTabChange,
  onOpenClient,
  saveTenant,
  toggleDoc,
  removeDoc,
  firebaseReady
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);

  const currentTenant = tab !== 'all' ? tenantMap[tab] : null;

  const tenantStats = useMemo(() => {
    const stats = {};
    tenants.forEach(tenant => {
      stats[tenant.id] = {
        contacts: contacts.filter(c => c.tenant === tenant.id).length,
        configs: powerBiConfigs.filter(c => c.tenant === tenant.id).length,
        executions: executions.filter(e => e.tenant === tenant.id).length
      };
    });
    return stats;
  }, [tenants, contacts, powerBiConfigs, executions]);

  function openForm(tenant) {
    setEditingTenant(tenant || null);
    setFormOpen(true);
  }

  async function handleSubmit(form) {
    const ok = await saveTenant(form);
    if (ok) {
      setFormOpen(false);
      setEditingTenant(null);
    }
  }

  const tenantContacts = currentTenant
    ? contacts.filter(contact => contact.tenant === currentTenant.id)
    : [];
  const tenantConfigs = currentTenant
    ? powerBiConfigs.filter(config => config.tenant === currentTenant.id)
    : [];
  const tenantExecutions = currentTenant
    ? executions.filter(execution => execution.tenant === currentTenant.id)
    : [];

  return (
    <>
      <div className="tabBar">
        <button
          type="button"
          className={`tab ${tab === 'all' ? 'active' : ''}`.trim()}
          onClick={() => onTabChange('all')}
        >
          Todas
          <em>{tenants.length}</em>
        </button>
        {tenants.map(tenant => (
          <button
            key={tenant.id}
            type="button"
            className={`tab ${tab === tenant.id ? 'active' : ''}`.trim()}
            onClick={() => onTabChange(tenant.id)}
          >
            <i className={`statusDot ${tenant.active ? 'green' : 'gray'}`} />
            {tenant.name || tenant.id}
          </button>
        ))}
        <button type="button" className="tab newTab" onClick={() => openForm(null)}>
          <Plus size={14} />
          Nova empresa
        </button>
      </div>

      {formOpen ? (
        <CompanyForm
          key={editingTenant?.id || 'new'}
          initial={
            editingTenant
              ? {
                  id: editingTenant.id,
                  name: editingTenant.name || '',
                  slug: editingTenant.slug || '',
                  active: Boolean(editingTenant.active)
                }
              : EMPTY_FORM
          }
          editing={Boolean(editingTenant)}
          firebaseReady={firebaseReady}
          onSubmit={handleSubmit}
          onCancel={() => {
            setFormOpen(false);
            setEditingTenant(null);
          }}
        />
      ) : null}

      {tab === 'all' ? (
        tenants.length ? (
          <div className="cardGrid">
            {tenants.map(tenant => (
              <CompanyCard
                key={tenant.id}
                tenant={tenant}
                stats={tenantStats[tenant.id]}
                firebaseReady={firebaseReady}
                onOpen={() => onTabChange(tenant.id)}
                onToggle={() => toggleDoc(COLLECTIONS.tenants, tenant)}
              />
            ))}
          </div>
        ) : (
          <EmptyState icon={Building2} title="Nenhuma empresa cadastrada">
            Use o botão “Nova empresa” para cadastrar o primeiro tenant.
          </EmptyState>
        )
      ) : currentTenant ? (
        <>
          <Panel className="companyHeader">
            <div className="companyHeaderRow">
              <div className="companyHeaderId">
                <Avatar name={currentTenant.name || currentTenant.id} size="lg" tone="gold" />
                <div>
                  <h2>{currentTenant.name || currentTenant.id}</h2>
                  <span className="mono">{currentTenant.id}</span>
                </div>
              </div>
              <div className="companyHeaderActions">
                <ActiveBadge
                  active={currentTenant.active}
                  activeText="Ativa"
                  inactiveText="Inativa"
                />
                <Switch
                  checked={Boolean(currentTenant.active)}
                  onChange={() => toggleDoc(COLLECTIONS.tenants, currentTenant)}
                  disabled={!firebaseReady}
                  label="Ativar ou desativar empresa"
                />
                <button type="button" className="btn ghost" onClick={() => openForm(currentTenant)}>
                  <Pencil size={14} />
                  Editar
                </button>
              </div>
            </div>
          </Panel>

          <div className="companyDetailGrid">
            <div className="companyDetailMain">
              <Panel
                title="Clientes desta empresa"
                description="Números autorizados vinculados a este tenant."
                icon={Users}
              >
                {tenantContacts.length ? (
                  <div className="clientList">
                    {tenantContacts.map(contact => {
                      const lastExecution = executions.find(execution =>
                        matchExecutionToContact(execution, contact)
                      );

                      return (
                        <button
                          key={contact.id}
                          type="button"
                          className="clientRow"
                          onClick={() => onOpenClient(contact.id)}
                        >
                          <Avatar name={contact.name || contact.phone} tone="cyan" />
                          <div className="clientMeta">
                            <strong>{contact.name || formatPhone(contact.phone)}</strong>
                            <span>
                              {formatPhone(contact.phone)}
                              {contact.noticeTime ? ` · aviso ${contact.noticeTime}` : ''}
                            </span>
                          </div>
                          <div className="clientRight">
                            {lastExecution ? (
                              <>
                                <StatusBadge status={lastExecution.status} />
                                <span className="clientWhen">
                                  {timeAgo(lastExecution.updatedAt || lastExecution.createdAt)}
                                </span>
                              </>
                            ) : (
                              <span className="clientWhen">sem eventos</span>
                            )}
                            <ActiveBadge active={contact.active} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState icon={Users} title="Nenhum cliente">
                    Cadastre clientes para esta empresa na aba Clientes.
                  </EmptyState>
                )}
              </Panel>

              <Panel
                title="Atividade recente"
                description="Execuções do Morning Call desta empresa."
                icon={MessageSquareText}
              >
                <ExecutionFeed
                  executions={tenantExecutions}
                  tenantMap={tenantMap}
                  limit={12}
                  compact
                />
              </Panel>
            </div>

            <div className="companyDetailSide">
              <Panel
                title="Power BI"
                description="Datasets configurados para este tenant."
                icon={BarChart3}
              >
                {tenantConfigs.length ? (
                  <div className="configList">
                    {tenantConfigs.map(config => (
                      <div className="configCard" key={config.id}>
                        <div className="configCardTop">
                          <span className={`badge ${config.modelType === 'precos' ? 'violet' : 'gold'}`}>
                            <i className="badgeDot" />
                            {getPowerBiModelLabel(config.modelType)}
                          </span>
                          <div className="rowActions">
                            <Switch
                              checked={Boolean(config.active)}
                              onChange={() => toggleDoc(COLLECTIONS.powerbi, config)}
                              disabled={!firebaseReady}
                              label="Ativar ou desativar configuração"
                            />
                            <ConfirmDeleteButton
                              onConfirm={() => removeDoc(COLLECTIONS.powerbi, config.id)}
                              disabled={!firebaseReady}
                            />
                          </div>
                        </div>
                        <div className="configIds">
                          <div>
                            <span>Workspace</span>
                            <code>{config.workspaceId || '—'}</code>
                          </div>
                          <div>
                            <span>Dataset</span>
                            <code>{config.datasetId || '—'}</code>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={BarChart3} title="Sem configuração">
                    Configure os datasets deste tenant na aba Power BI.
                  </EmptyState>
                )}
              </Panel>
            </div>
          </div>
        </>
      ) : (
        <EmptyState icon={Building2} title="Empresa não encontrada">
          A empresa selecionada não existe mais.
        </EmptyState>
      )}
    </>
  );
}
