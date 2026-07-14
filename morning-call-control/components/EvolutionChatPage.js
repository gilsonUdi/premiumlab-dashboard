'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, RefreshCw } from 'lucide-react';
import ChatPage from '@/components/ChatPage';
import { normalizePhone } from '@/lib/phone';

function firstValue(...values) {
  return values.find(value => value !== undefined && value !== null && String(value).trim()) || '';
}

function messageText(message) {
  if (!message || typeof message !== 'object') return '';

  return firstValue(
    message.conversation,
    message.extendedTextMessage?.text,
    message.imageMessage?.caption,
    message.videoMessage?.caption,
    message.documentMessage?.caption,
    message.text
  );
}

function toIso(value) {
  if (!value) return '';
  if (typeof value === 'number') {
    return new Date(value < 100000000000 ? value * 1000 : value).toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function timestampMillis(value) {
  const iso = toIso(value);
  return iso ? new Date(iso).getTime() : 0;
}

function messageTimestamp(message) {
  return firstValue(
    message?.messageTimestamp,
    message?.timestamp,
    message?.updatedAt,
    message?.updated_at,
    message?.createdAt,
    message?.created_at
  );
}

function latestChatMessage(chat) {
  const nestedMessages = Array.isArray(chat.messages)
    ? chat.messages
    : Array.isArray(chat.messages?.records)
      ? chat.messages.records
      : [];
  const candidates = [chat.lastMessage, chat.last_message, ...nestedMessages].filter(
    message => message && typeof message === 'object'
  );

  return candidates.sort(
    (a, b) => timestampMillis(messageTimestamp(b)) - timestampMillis(messageTimestamp(a))
  )[0] || {};
}

function normalizeChat(chat, index, companyId) {
  const lastMessage = latestChatMessage(chat);
  const key = lastMessage.key || chat.key || {};
  const remoteJid = String(
    firstValue(
      chat.remoteJid,
      chat.remote_jid,
      chat.jid,
      chat.id,
      key.remoteJidAlt,
      key.remoteJid
    )
  );
  const alternateJid = String(firstValue(key.remoteJidAlt, chat.remoteJidAlt, key.remoteJid));
  const whatsappId = alternateJid.includes('@s.whatsapp.net') ? alternateJid : remoteJid;
  const phone = normalizePhone(whatsappId || remoteJid);
  const message = lastMessage.message || lastMessage;
  const lastText = String(firstValue(chat.lastMessageText, chat.last_message_text, messageText(message)));
  const lastAt = toIso(
    firstValue(
      messageTimestamp(lastMessage),
      chat.updatedAt,
      chat.updated_at,
      chat.createdAt,
      chat.created_at
    )
  );
  const isIndividual =
    (remoteJid || whatsappId) &&
    !String(remoteJid || whatsappId).includes('@g.us') &&
    !String(remoteJid || whatsappId).includes('@broadcast');

  if (!isIndividual || (!phone && !whatsappId)) return null;

  return {
    id: `${companyId}-${remoteJid || whatsappId || index}`,
    tenant: companyId,
    companyId,
    name: String(
      firstValue(
        chat.name,
        chat.pushName,
        chat.contact?.name,
        chat.contact?.pushName,
        lastMessage.pushName,
        phone
      )
    ),
    phone,
    whatsappId: whatsappId || remoteJid,
    active: true,
    lastText,
    lastAt
  };
}

export default function EvolutionChatPage({ companies, companyMap, evolutionConfigByTenant }) {
  const activeCompanies = useMemo(
    () => companies.filter(company => company.active !== false),
    [companies]
  );
  const [activeCompanyId, setActiveCompanyId] = useState('');
  const [state, setState] = useState({ loading: false, error: '', contacts: [] });

  useEffect(() => {
    if (activeCompanyId && activeCompanies.some(company => company.id === activeCompanyId)) return;
    setActiveCompanyId(activeCompanies[0]?.id || '');
  }, [activeCompanies, activeCompanyId]);

  const loadChats = useCallback(async ({ signal } = {}) => {
    if (!activeCompanyId) {
      setState({ loading: false, error: '', contacts: [] });
      return;
    }

    const evolutionConfig = evolutionConfigByTenant?.[activeCompanyId];
    setState(current => ({ ...current, loading: true, error: '' }));

    try {
      const response = await fetch('/api/evolution/chats', {
        method: 'POST',
        signal,
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 300, evolutionConfig })
      });
      const payload = await response.json();
      if (signal?.aborted) return;

      const contacts = (Array.isArray(payload.chats) ? payload.chats : [])
        .map((chat, index) => normalizeChat(chat, index, activeCompanyId))
        .filter(Boolean)
        .sort((a, b) => timestampMillis(b.lastAt) - timestampMillis(a.lastAt));

      setState({ loading: false, error: payload.error || '', contacts });
    } catch (error) {
      if (signal?.aborted) return;
      setState({
        loading: false,
        error: error.message || 'Nao foi possivel carregar as conversas da Evolution.',
        contacts: []
      });
    }
  }, [activeCompanyId, evolutionConfigByTenant]);

  useEffect(() => {
    const controller = new AbortController();
    loadChats({ signal: controller.signal });
    return () => controller.abort();
  }, [loadChats]);

  return (
    <>
      <div className="tabBar chatCompanyTabs">
        {activeCompanies.length ? (
          activeCompanies.map(company => (
            <button
              key={company.id}
              type="button"
              className={`tab ${activeCompanyId === company.id ? 'active' : ''}`.trim()}
              onClick={() => setActiveCompanyId(company.id)}
            >
              <Building2 size={14} />
              {company.name || company.id}
              {activeCompanyId === company.id ? <em>{state.contacts.length}</em> : null}
            </button>
          ))
        ) : (
          <span className="mutedInline">Cadastre uma empresa SAC para carregar as conversas.</span>
        )}

        {activeCompanyId ? (
          <button
            type="button"
            className="chatSyncButton"
            onClick={() => loadChats()}
            disabled={state.loading}
            title="Atualizar lista de conversas"
          >
            <RefreshCw size={14} className={state.loading ? 'spinning' : ''} />
            {state.loading ? 'Carregando' : 'Atualizar'}
          </button>
        ) : null}

        {state.error ? <span className="mutedInline" title={state.error}>Falha na Evolution</span> : null}
      </div>

      <ChatPage
        key={activeCompanyId || 'sem-empresa'}
        contacts={state.contacts}
        executions={[]}
        tenantMap={companyMap}
        assistantName="SAC Gradual"
        emptyDescription={
          state.loading
            ? 'Carregando conversas diretamente da Evolution...'
            : state.error
              ? 'Nao foi possivel carregar as conversas desta empresa.'
              : 'A Evolution ainda nao retornou conversas para esta empresa.'
        }
        evolutionConfigByTenant={evolutionConfigByTenant}
        sourceMode="evolution"
      />
    </>
  );
}
