'use client';

import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  CalendarClock,
  MessageSquareText,
  Pencil,
  Phone,
  Plus,
  Search,
  Users,
  X
} from 'lucide-react';
import { COLLECTIONS, TIMEZONES } from '@/lib/constants';
import { formatDate, matchExecutionToContact, timeAgo } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import {
  ActiveBadge,
  Avatar,
  ConfirmDeleteButton,
  EmptyState,
  Field,
  Panel,
  StatusBadge,
  SwitchRow,
  Switch
} from '@/components/ui';
import { ExecutionFeed } from '@/components/ExecutionFeed';

const EMPTY_FORM = {
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

function ContactForm({ initial, editing, tenants, firebaseReady, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);

  function set(key, value) {
    setForm(current => ({ ...current, [key]: value }));
  }

  return (
    <Panel
      title={editing ? `Editar cliente · ${initial.name || formatPhone(initial.phone)}` : 'Novo cliente'}
      description="Somente números autorizados podem solicitar ou receber a IA 360°."
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
              value={form.tenant}
              onChange={event => set('tenant', event.target.value)}
              required
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
              value={form.name}
              onChange={event => set('name', event.target.value)}
              placeholder="GS Controladoria Gilson"
            />
          </Field>
          <Field label="Telefone" hint="Somente números, com DDD. O 55 é adicionado automaticamente.">
            <input
              value={form.phone}
              onChange={event => set('phone', event.target.value)}
              placeholder="66999999999"
              required
            />
          </Field>
          <Field label="Horário do aviso">
            <input
              type="time"
              value={form.noticeTime}
              onChange={event => set('noticeTime', event.target.value)}
            />
          </Field>
          <Field label="Fuso horário">
            <select value={form.timezone} onChange={event => set('timezone', event.target.value)}>
              {TIMEZONES.map(zone => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Frase de confirmação" hint="Resposta que o cliente envia para receber o relatório.">
            <input
              value={form.confirmationPhrase}
              onChange={event => set('confirmationPhrase', event.target.value)}
            />
          </Field>
        </div>

        <div className="switchGrid">
          <div className="switchInline">
            <Switch checked={form.active} onChange={value => set('active', value)} label="Cliente ativo" />
            <span>Cliente ativo</span>
          </div>
          <div className="switchInline">
            <Switch checked={form.sendNotice} onChange={value => set('sendNotice', value)} label="Aviso diário" />
            <span>Recebe aviso diário</span>
          </div>
          <div className="switchInline">
            <Switch
              checked={form.allowManualSend}
              onChange={value => set('allowManualSend', value)}
              label="Envio manual"
            />
            <span>Pode solicitar manualmente</span>
          </div>
        </div>

        <div className="formActions">
          <button className="btn primary" type="submit" disabled={!firebaseReady}>
            <Plus size={15} />
            {editing ? 'Salvar alterações' : 'Autorizar cliente'}
          </button>
          <button className="btn ghost" type="button" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </Panel>
  );
}

function ClientDetail({
  contact,
  tenantMap,
  executions,
  firebaseReady,
  onBack,
  onEdit,
  onToggleField,
  onRemove
}) {
  const history = useMemo(
    () => executions.filter(execution => matchExecutionToContact(execution, contact)),
    [executions, contact]
  );

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
          <Avatar name={contact.name || contact.phone} size="lg" tone="cyan" />
          <div>
            <h2>{contact.name || formatPhone(contact.phone)}</h2>
            <span>
              {tenantMap[contact.tenant]?.name || contact.tenant || 'Sem empresa'}
              {' · '}
              {formatPhone(contact.phone)}
            </span>
          </div>
          <ActiveBadge active={contact.active} />
        </div>
      </Panel>

      <div className="clientDetailGrid">
        <div className="clientDetailSide">
          <Panel title="Preferências" icon={Bell}>
            <SwitchRow
              label="Cliente ativo"
              description="Autorizado a interagir com a IA 360°."
              checked={Boolean(contact.active)}
              onChange={value => onToggleField('active', value)}
              disabled={!firebaseReady}
            />
            <SwitchRow
              label="Aviso diário"
              description={`Aviso automático às ${contact.noticeTime || '07:00'}.`}
              checked={contact.sendNotice !== false}
              onChange={value => onToggleField('sendNotice', value)}
              disabled={!firebaseReady}
            />
            <SwitchRow
              label="Envio manual"
              description="Pode pedir o relatório a qualquer momento."
              checked={contact.allowManualSend !== false}
              onChange={value => onToggleField('allowManualSend', value)}
              disabled={!firebaseReady}
            />
          </Panel>

          <Panel title="Detalhes" icon={CalendarClock}>
            <div className="infoList">
              <div className="infoItem">
                <span>Frase de confirmação</span>
                <strong>{contact.confirmationPhrase || '—'}</strong>
              </div>
              <div className="infoItem">
                <span>Fuso horário</span>
                <strong>{contact.timezone || '—'}</strong>
              </div>
              <div className="infoItem">
                <span>Último aviso enviado</span>
                <strong>{formatDate(contact.lastNoticeSentAt)}</strong>
              </div>
              <div className="infoItem">
                <span>Último relatório enviado</span>
                <strong>{formatDate(contact.lastReportSentAt)}</strong>
              </div>
              <div className="infoItem">
                <span>Cadastrado em</span>
                <strong>{formatDate(contact.createdAt)}</strong>
              </div>
            </div>
          </Panel>
        </div>

        <Panel
          title="Histórico de conversas"
          description={`${history.length} evento${history.length === 1 ? '' : 's'} registrado${history.length === 1 ? '' : 's'} para este cliente.`}
          icon={MessageSquareText}
        >
          <ExecutionFeed
            executions={history}
            tenantMap={tenantMap}
            limit={30}
            emptyText="Nenhuma conversa registrada para este cliente ainda."
          />
        </Panel>
      </div>
    </>
  );
}

export default function ClientsPage({
  contacts,
  tenants,
  tenantMap,
  executions,
  focusId,
  onFocus,
  saveContact,
  updateContact,
  removeDoc,
  firebaseReady
}) {
  const [search, setSearch] = useState('');
  const [tenantFilter, setTenantFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);

  const focusedContact = focusId ? contacts.find(contact => contact.id === focusId) : null;

  const filteredContacts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return contacts.filter(contact => {
      if (tenantFilter !== 'all' && contact.tenant !== tenantFilter) return false;
      if (!term) return true;

      return [contact.name, contact.tenant, contact.phone, tenantMap[contact.tenant]?.name]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(term));
    });
  }, [contacts, search, tenantFilter, tenantMap]);

  async function handleSubmit(form) {
    const ok = editingContact
      ? await updateContact(editingContact.id, form)
      : await saveContact(form);

    if (ok) {
      setFormOpen(false);
      setEditingContact(null);
    }
  }

  function openForm(contact) {
    setEditingContact(contact || null);
    setFormOpen(true);
  }

  if (focusedContact && !formOpen) {
    return (
      <ClientDetail
        contact={focusedContact}
        tenantMap={tenantMap}
        executions={executions}
        firebaseReady={firebaseReady}
        onBack={() => onFocus(null)}
        onEdit={() => openForm(focusedContact)}
        onToggleField={(field, value) => updateContact(focusedContact.id, { [field]: value })}
        onRemove={async () => {
          await removeDoc(COLLECTIONS.contacts, focusedContact.id);
          onFocus(null);
        }}
      />
    );
  }

  return (
    <>
      {formOpen ? (
        <ContactForm
          key={editingContact?.id || 'new'}
          initial={
            editingContact
              ? {
                  tenant: editingContact.tenant || '',
                  name: editingContact.name || '',
                  phone: editingContact.phone || '',
                  active: Boolean(editingContact.active),
                  confirmationPhrase: editingContact.confirmationPhrase || '',
                  noticeTime: editingContact.noticeTime || '07:00',
                  timezone: editingContact.timezone || 'America/Cuiaba',
                  sendNotice: editingContact.sendNotice !== false,
                  allowManualSend: editingContact.allowManualSend !== false
                }
              : { ...EMPTY_FORM, tenant: tenants[0]?.id || '' }
          }
          editing={Boolean(editingContact)}
          tenants={tenants}
          firebaseReady={firebaseReady}
          onSubmit={handleSubmit}
          onCancel={() => {
            setFormOpen(false);
            setEditingContact(null);
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
            className={`chip ${tenantFilter === 'all' ? 'active' : ''}`.trim()}
            onClick={() => setTenantFilter('all')}
          >
            Todas
            <em>{contacts.length}</em>
          </button>
          {tenants.map(tenant => {
            const count = contacts.filter(contact => contact.tenant === tenant.id).length;
            return (
              <button
                key={tenant.id}
                type="button"
                className={`chip ${tenantFilter === tenant.id ? 'active' : ''}`.trim()}
                onClick={() => setTenantFilter(tenant.id)}
              >
                {tenant.name || tenant.id}
                <em>{count}</em>
              </button>
            );
          })}
        </div>
        {!formOpen ? (
          <button type="button" className="btn primary" onClick={() => openForm(null)}>
            <Plus size={15} />
            Novo cliente
          </button>
        ) : null}
      </div>

      {filteredContacts.length ? (
        <div className="clientList panelless">
          {filteredContacts.map(contact => {
            const lastExecution = executions.find(execution =>
              matchExecutionToContact(execution, contact)
            );

            return (
              <button
                key={contact.id}
                type="button"
                className="clientRow"
                onClick={() => onFocus(contact.id)}
              >
                <Avatar name={contact.name || contact.phone} tone="cyan" />
                <div className="clientMeta">
                  <strong>{contact.name || formatPhone(contact.phone)}</strong>
                  <span>
                    {tenantMap[contact.tenant]?.name || contact.tenant || 'Sem empresa'}
                    {' · '}
                    {formatPhone(contact.phone)}
                  </span>
                </div>
                <div className="clientFlags">
                  {contact.sendNotice !== false ? (
                    <span className="flag" title={`Aviso diário às ${contact.noticeTime || '07:00'}`}>
                      <Bell size={12} />
                      {contact.noticeTime || '07:00'}
                    </span>
                  ) : null}
                  {contact.allowManualSend !== false ? (
                    <span className="flag" title="Pode solicitar manualmente">
                      <Phone size={12} />
                      manual
                    </span>
                  ) : null}
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
        <EmptyState icon={Users} title="Nenhum cliente encontrado">
          {contacts.length
            ? 'Ajuste a busca ou o filtro de empresa.'
            : 'Cadastre o primeiro cliente autorizado com o botão “Novo cliente”.'}
        </EmptyState>
      )}
    </>
  );
}
