'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Building2, ChevronDown, MessageCircle, RefreshCw, Search } from 'lucide-react';
import { formatPhone, normalizePhone } from '@/lib/phone';
import {
  formatDate,
  formatReferenceDate,
  formatTime,
  matchExecutionToContact,
  timeAgo
} from '@/lib/format';
import { getStatusMeta } from '@/lib/constants';
import { Avatar, EmptyState, StatusBadge } from '@/components/ui';

const EVOLUTION_SYNC_INTERVAL_MS = 8000;

function contactConversationKey(contact) {
  return `${contact.tenant || contact.tenantId || contact.companyId || 'sem-empresa'}::${
    normalizePhone(contact.phone) || contact.whatsappId || contact.id
  }`;
}

function getIncomingText(execution) {
  return (
    execution.triggerMessage ||
    execution.message ||
    execution.mensagem ||
    execution.requestMessage ||
    execution.input ||
    execution.inputText ||
    execution.userMessage ||
    execution.clientMessage ||
    execution.customerMessage ||
    execution.pergunta ||
    execution.question ||
    execution.text ||
    execution.body?.data?.message?.conversation ||
    execution.body?.data?.message?.extendedTextMessage?.text ||
    execution.body?.message?.conversation ||
    execution.raw?.body?.data?.message?.conversation ||
    execution.raw?.body?.data?.message?.extendedTextMessage?.text ||
    execution.raw?.body?.message?.conversation ||
    execution.raw?.data?.message?.conversation ||
    execution.raw?.data?.message?.extendedTextMessage?.text ||
    execution.raw?.message?.conversation ||
    execution.raw?.message?.extendedTextMessage?.text ||
    ''
  );
}

function getOutgoingText(execution) {
  return execution.responseText || execution.preview || execution.error || '';
}

function buildMessageRows(executions) {
  return executions
    .slice()
    .reverse()
    .flatMap(execution => {
      const incoming = getIncomingText(execution);
      const outgoing = getOutgoingText(execution);
      const when = execution.updatedAt || execution.sentAt || execution.createdAt;
      const rows = [];

      if (incoming) {
        rows.push({
          id: `${execution.id}-in`,
          direction: 'in',
          text: incoming,
          when,
          execution
        });
      }

      if (outgoing) {
        rows.push({
          id: `${execution.id}-out`,
          direction: execution.status === 'error' ? 'error' : 'out',
          text: outgoing,
          when,
          execution
        });
      }

      if (!incoming && !outgoing) {
        rows.push({
          id: `${execution.id}-system`,
          direction: 'system',
          text: getStatusMeta(execution.status).label,
          when,
          execution
        });
      }

      return rows;
    });
}

function buildEvolutionRows(messages) {
  return messages.map(message => ({
    id: message.id,
    direction: message.fromMe ? 'out' : 'in',
    text: message.text || `[${message.messageType || 'mensagem'}]`,
    when: message.timestamp,
    pushName: message.pushName,
    status: message.status,
    execution: {}
  }));
}

function rowTime(row) {
  const parsed = row.when ? new Date(row.when).getTime() : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function mergeMessageRows(primaryRows, fallbackRows) {
  const rows = [...primaryRows];
  const signatures = new Set(
    rows.map(row => `${row.direction}|${String(row.text).slice(0, 120)}|${Math.floor(rowTime(row) / 60000)}`)
  );

  fallbackRows.forEach(row => {
    const signature = `${row.direction}|${String(row.text).slice(0, 120)}|${Math.floor(rowTime(row) / 60000)}`;
    if (signatures.has(signature)) return;

    signatures.add(signature);
    rows.push(row);
  });

  return rows.sort((a, b) => rowTime(a) - rowTime(b));
}

function mergeEvolutionMessages(previousMessages, nextMessages) {
  const map = new Map();

  [...previousMessages, ...nextMessages].forEach((message, index) => {
    const key =
      message.id ||
      `${message.fromMe ? 'out' : 'in'}|${String(message.text || '').slice(0, 140)}|${
        message.timestamp || index
      }`;

    map.set(key, message);
  });

  return Array.from(map.values()).sort((a, b) => {
    const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return aTime - bTime;
  });
}

function buildConversations({ contacts, executions, tenantMap }) {
  const map = new Map();

  function ensureConversation(key, contact) {
    if (!map.has(key)) {
      map.set(key, {
        key,
        contact,
        contactIds: new Set([contact.id].filter(Boolean)),
        tenant: contact.tenant || contact.tenantId || contact.companyId || '',
        name: contact.name || '',
        phone: normalizePhone(contact.phone),
        whatsappId: contact.whatsappId || '',
        active: contact.active !== false,
        executions: []
      });
    }

    const row = map.get(key);
    if (contact.id) row.contactIds.add(contact.id);
    if (!row.name && contact.name) row.name = contact.name;
    if (!row.whatsappId && contact.whatsappId) row.whatsappId = contact.whatsappId;
    row.active = row.active || contact.active !== false;

    return row;
  }

  contacts
    .filter(contact => contact.phone || contact.whatsappId || contact.id)
    .forEach(contact => ensureConversation(contactConversationKey(contact), contact));

  executions.forEach(execution => {
    const contact = contacts.find(item => matchExecutionToContact(execution, item));
    if (!contact) return;

    const contactTenant = contact.tenant || contact.tenantId || contact.companyId || '';
    const executionTenant = execution.tenant || execution.tenantId || execution.companyId || '';
    if (contactTenant && executionTenant && contactTenant !== executionTenant) return;

    const row = ensureConversation(contactConversationKey(contact), contact);
    row.executions.push(execution);
  });

  return Array.from(map.values())
    .map(row => {
      const lastExecution = row.executions[0] || null;
      const tenantName = tenantMap?.[row.tenant]?.name || row.tenant || 'Sem empresa';
      const displayName = row.name || formatPhone(row.phone) || row.whatsappId || 'Contato sem nome';

      return {
        ...row,
        contactIds: Array.from(row.contactIds),
        displayName,
        tenantName,
        lastExecution,
        lastAt: lastExecution?.updatedAt || lastExecution?.sentAt || lastExecution?.createdAt || '',
        lastText: lastExecution ? getOutgoingText(lastExecution) || getIncomingText(lastExecution) : ''
      };
    })
    .sort((a, b) => {
      const aTime = a.lastAt ? new Date(a.lastAt).getTime() : 0;
      const bTime = b.lastAt ? new Date(b.lastAt).getTime() : 0;
      return bTime - aTime;
    });
}

export default function ChatPage({
  contacts,
  executions,
  tenantMap,
  assistantName = 'Axis AI',
  emptyDescription = 'Assim que os contatos interagirem com a IA 360°, o historico aparece aqui.',
  segmentByTenant = false,
  tenantLabel = 'Empresa',
  evolutionConfigByTenant = {}
}) {
  const [search, setSearch] = useState('');
  const [activeKey, setActiveKey] = useState('');
  const [activeTenant, setActiveTenant] = useState('');
  const timelineRef = useRef(null);
  const [evolutionState, setEvolutionState] = useState({
    key: '',
    loading: false,
    error: '',
    messages: [],
    lastSyncedAt: ''
  });

  const conversations = useMemo(
    () => buildConversations({ contacts, executions, tenantMap }),
    [contacts, executions, tenantMap]
  );

  const tenantOptions = useMemo(() => {
    const ids = Array.from(new Set(conversations.map(conversation => conversation.tenant).filter(Boolean)));
    return ids.map(id => ({
      id,
      name: tenantMap?.[id]?.name || id,
      total: conversations.filter(conversation => conversation.tenant === id).length
    }));
  }, [conversations, tenantMap]);

  useEffect(() => {
    if (!segmentByTenant) return;
    if (activeTenant && tenantOptions.some(option => option.id === activeTenant)) return;
    setActiveTenant(tenantOptions[0]?.id || '');
  }, [activeTenant, segmentByTenant, tenantOptions]);

  const scopedConversations = useMemo(() => {
    if (!segmentByTenant) return conversations;
    if (!activeTenant) return [];
    return conversations.filter(conversation => conversation.tenant === activeTenant);
  }, [activeTenant, conversations, segmentByTenant]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return scopedConversations;

    return scopedConversations.filter(conversation =>
      [
        conversation.displayName,
        conversation.tenantName,
        conversation.phone,
        conversation.whatsappId,
        conversation.lastText
      ]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(term))
    );
  }, [scopedConversations, search]);

  useEffect(() => {
    if (activeKey && scopedConversations.some(conversation => conversation.key === activeKey)) return;
    setActiveKey(scopedConversations[0]?.key || '');
  }, [activeKey, scopedConversations]);

  const activeConversation =
    filtered.find(conversation => conversation.key === activeKey) || filtered[0] || null;

  const evolutionParams = useMemo(() => {
    if (!activeConversation) return null;

    const params = new URLSearchParams();

    if (activeConversation.whatsappId) params.set('whatsappId', activeConversation.whatsappId);
    if (activeConversation.phone) params.set('phone', activeConversation.phone);

    const remoteJid =
      activeConversation.whatsappId ||
      (activeConversation.phone ? `${normalizePhone(activeConversation.phone)}@s.whatsapp.net` : '') ||
      activeConversation.executions?.[0]?.whatsappId ||
      activeConversation.executions?.[0]?.raw?.data?.key?.remoteJidAlt ||
      activeConversation.executions?.[0]?.raw?.data?.key?.remoteJid ||
      '';

    if (remoteJid) params.set('remoteJid', remoteJid);
    params.set('limit', '160');

    const companyConfig = evolutionConfigByTenant?.[activeConversation.tenant] || null;

    return {
      key: activeConversation.key,
      query: params.toString(),
      body: companyConfig
        ? {
            remoteJid,
            whatsappId: activeConversation.whatsappId || '',
            phone: activeConversation.phone || '',
            limit: 160,
            evolutionConfig: companyConfig
          }
        : null
    };
  }, [activeConversation, evolutionConfigByTenant]);

  const firestoreMessages = activeConversation ? buildMessageRows(activeConversation.executions) : [];
  const evolutionMessages =
    activeConversation && evolutionState.key === activeConversation.key
      ? buildEvolutionRows(evolutionState.messages)
      : [];
  const messages = mergeMessageRows(firestoreMessages, evolutionMessages);
  const chatSource = firestoreMessages.length
    ? evolutionMessages.length
      ? 'Firestore + Evolution'
      : 'Firestore'
    : evolutionMessages.length
      ? 'Evolution'
      : 'Firestore';

  function scrollToLatest(behavior = 'smooth') {
    timelineRef.current?.scrollTo({
      top: timelineRef.current.scrollHeight,
      behavior
    });
  }

  const syncEvolutionMessages = useCallback(
    async ({ signal, silent = false } = {}) => {
      if (!evolutionParams?.query) {
        setEvolutionState({ key: '', loading: false, error: '', messages: [], lastSyncedAt: '' });
        return;
      }

      setEvolutionState(current => ({
        key: evolutionParams.key,
        loading: !silent,
        error: '',
        messages: current.key === evolutionParams.key ? current.messages : [],
        lastSyncedAt: current.key === evolutionParams.key ? current.lastSyncedAt : ''
      }));

      try {
        const response = await fetch(
          evolutionParams.body ? '/api/evolution/messages' : `/api/evolution/messages?${evolutionParams.query}`,
          evolutionParams.body
            ? {
                method: 'POST',
                signal,
                cache: 'no-store',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(evolutionParams.body)
              }
            : {
                signal,
                cache: 'no-store'
              }
        );
        const payload = await response.json();

        if (signal?.aborted) return;

        setEvolutionState(current => {
          const nextMessages = Array.isArray(payload.messages) ? payload.messages : [];
          const shouldMerge = current.key === evolutionParams.key && nextMessages.length > 0;
          const shouldPreserve = current.key === evolutionParams.key && nextMessages.length === 0 && !payload.error;

          return {
            key: evolutionParams.key,
            loading: false,
            error: payload.error || '',
            messages: shouldMerge
              ? mergeEvolutionMessages(current.messages, nextMessages)
              : shouldPreserve
                ? current.messages
                : nextMessages,
            lastSyncedAt: new Date().toISOString()
          };
        });
      } catch (error) {
        if (signal?.aborted) return;

        setEvolutionState(current => ({
          key: evolutionParams.key,
          loading: false,
          error: error.message || 'Nao foi possivel carregar a Evolution API.',
          messages: current.key === evolutionParams.key ? current.messages : [],
          lastSyncedAt: current.key === evolutionParams.key ? current.lastSyncedAt : ''
        }));
      }
    },
    [evolutionParams]
  );

  useEffect(() => {
    if (!activeConversation) {
      setEvolutionState({ key: '', loading: false, error: '', messages: [], lastSyncedAt: '' });
      return undefined;
    }

    const controller = new AbortController();
    syncEvolutionMessages({ signal: controller.signal });

    const timer = setInterval(() => {
      syncEvolutionMessages({ signal: controller.signal, silent: true });
    }, EVOLUTION_SYNC_INTERVAL_MS);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [activeConversation, syncEvolutionMessages]);

  useEffect(() => {
    scrollToLatest('auto');
  }, [activeConversation?.key, messages.length, evolutionState.loading]);

  return (
    <>
    {segmentByTenant ? (
      <div className="tabBar chatCompanyTabs">
        {tenantOptions.length ? (
          tenantOptions.map(option => (
            <button
              key={option.id}
              type="button"
              className={`tab ${activeTenant === option.id ? 'active' : ''}`.trim()}
              onClick={() => {
                setActiveTenant(option.id);
                setActiveKey('');
              }}
            >
              <Building2 size={14} />
              {option.name}
              <em>{option.total}</em>
            </button>
          ))
        ) : (
          <span className="mutedInline">Nenhuma {tenantLabel.toLowerCase()} com conversas.</span>
        )}
      </div>
    ) : null}

    <section className="chatShell">
      <aside className="chatListPanel">
        <div className="chatListHead">
          <div>
            <span className="sectionEyebrow">Conversas</span>
            <strong>{filtered.length}</strong>
          </div>
          <span className={`chatLiveBadge ${chatSource.includes('Evolution') ? 'evolution' : ''}`}>
            {chatSource}
          </span>
        </div>

        <div className="chatSearch">
          <Search size={15} />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar conversa"
          />
        </div>

        <div className="chatConversationList">
          {filtered.length ? (
            filtered.map(conversation => {
              const meta = getStatusMeta(conversation.lastExecution?.status);

              return (
                <button
                  key={conversation.key}
                  type="button"
                  className={`chatConversation ${
                    activeConversation?.key === conversation.key ? 'active' : ''
                  }`.trim()}
                  onClick={() => setActiveKey(conversation.key)}
                >
                  <Avatar name={conversation.displayName} />
                  <div>
                    <strong>{conversation.displayName}</strong>
                    <span>{conversation.tenantName}</span>
                    <small>{conversation.lastText || 'Sem mensagens registradas.'}</small>
                  </div>
                  <em className={`chatStatusDot ${meta.tone}`} />
                </button>
              );
            })
          ) : (
            <EmptyState icon={MessageCircle} title="Nenhuma conversa">
              Nenhum contato ou execucao corresponde a busca.
            </EmptyState>
          )}
        </div>
      </aside>

      <section className="chatWindow">
        {activeConversation ? (
          <>
            <header className="chatHeader">
              <div className="chatHeaderIdentity">
                <Avatar name={activeConversation.displayName} size="lg" />
                <div>
                  <strong>{activeConversation.displayName}</strong>
                  <span>
                    {activeConversation.tenantName}
                    {activeConversation.phone ? ` · ${formatPhone(activeConversation.phone)}` : ''}
                  </span>
                </div>
              </div>
              <div className="chatHeaderMeta">
                {activeConversation.lastExecution ? (
                  <StatusBadge status={activeConversation.lastExecution.status} />
                ) : null}
                <span>
                  {activeConversation.lastAt
                    ? `Ultima atividade ${timeAgo(activeConversation.lastAt)}`
                    : 'Sem atividade'}
                </span>
                {evolutionState.key === activeConversation.key && evolutionState.loading ? (
                  <span>Carregando Evolution...</span>
                ) : null}
                {evolutionState.key === activeConversation.key && evolutionState.lastSyncedAt ? (
                  <span>Sync {timeAgo(evolutionState.lastSyncedAt)}</span>
                ) : null}
                {evolutionState.key === activeConversation.key && evolutionState.error ? (
                  <span title={evolutionState.error}>Fallback Firestore ativo</span>
                ) : null}
                <button
                  type="button"
                  className="chatSyncButton"
                  onClick={() => syncEvolutionMessages()}
                  disabled={evolutionState.key === activeConversation.key && evolutionState.loading}
                  title="Sincronizar conversa agora"
                >
                  <RefreshCw
                    size={14}
                    className={
                      evolutionState.key === activeConversation.key && evolutionState.loading
                        ? 'spinning'
                        : ''
                    }
                  />
                  Atualizar
                </button>
              </div>
            </header>

            <div className="chatTimelineWrap">
              <div className="chatTimeline" ref={timelineRef}>
              {messages.length ? (
                messages.map(message => (
                  <article
                    key={message.id}
                    className={`chatBubble ${message.direction}`.trim()}
                    title={formatDate(message.when)}
                  >
                    <div className="chatBubbleAuthor">
                      {message.direction === 'in' ? (
                        message.pushName || activeConversation.displayName
                      ) : message.direction === 'error' ? (
                        'Erro'
                      ) : (
                        <>
                          <Bot size={13} />
                          {assistantName}
                        </>
                      )}
                    </div>
                    <p>{String(message.text)}</p>
                    <footer>
                      <span>{formatTime(message.when)}</span>
                      {message.status ? <span>{message.status}</span> : null}
                      {message.execution?.reportDate ||
                      message.execution?.reportDateBr ||
                      message.execution?.referenceDate ? (
                        <span>
                          Ref.{' '}
                          {formatReferenceDate(
                            message.execution?.reportDateBr,
                            message.execution?.reportDate,
                            message.execution?.referenceDate
                          )}
                        </span>
                      ) : null}
                    </footer>
                  </article>
                ))
              ) : (
                <EmptyState icon={MessageCircle} title="Sem mensagens">
                  A conversa existe porque o contato esta autorizado, mas ainda nao ha execucoes.
                </EmptyState>
              )}
              </div>
              {messages.length ? (
                <button
                  type="button"
                  className="chatLatestButton"
                  onClick={() => scrollToLatest()}
                  title="Ir para a mensagem mais recente"
                >
                  <ChevronDown size={15} />
                  Mais recente
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <EmptyState icon={MessageCircle} title="Nenhuma conversa">
            {emptyDescription}
          </EmptyState>
        )}
      </section>
    </section>
    </>
  );
}
