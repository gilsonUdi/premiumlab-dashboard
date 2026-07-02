'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, MessageCircle, Search } from 'lucide-react';
import { formatPhone } from '@/lib/phone';
import {
  formatDate,
  formatReferenceDate,
  formatTime,
  initialsOf,
  matchExecutionToContact,
  timeAgo
} from '@/lib/format';
import { getStatusMeta } from '@/lib/constants';
import { Avatar, EmptyState, StatusBadge } from '@/components/ui';

function conversationKey(execution) {
  return (
    execution.contactId ||
    execution.whatsappId ||
    execution.phone ||
    `${execution.tenant || 'sem-tenant'}-${execution.contactName || 'sem-contato'}`
  );
}

function getIncomingText(execution) {
  return (
    execution.triggerMessage ||
    execution.message ||
    execution.mensagem ||
    execution.requestMessage ||
    execution.raw?.data?.message?.conversation ||
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

function buildConversations({ contacts, executions, tenantMap }) {
  const map = new Map();

  function ensureConversation(key, seed = {}) {
    if (!map.has(key)) {
      map.set(key, {
        key,
        contact: seed.contact || null,
        tenant: seed.tenant || seed.contact?.tenant || '',
        name: seed.name || seed.contact?.name || '',
        phone: seed.phone || seed.contact?.phone || '',
        whatsappId: seed.whatsappId || seed.contact?.whatsappId || '',
        executions: []
      });
    }

    return map.get(key);
  }

  contacts.forEach(contact => {
    ensureConversation(contact.id || contact.phone, {
      contact,
      name: contact.name,
      tenant: contact.tenant,
      phone: contact.phone,
      whatsappId: contact.whatsappId
    });
  });

  executions.forEach(execution => {
    const contact = contacts.find(item => matchExecutionToContact(execution, item));
    const key = contact?.id || conversationKey(execution);
    const row = ensureConversation(key, {
      contact,
      name: execution.contactName,
      tenant: execution.tenant,
      phone: execution.phone,
      whatsappId: execution.whatsappId
    });

    row.contact = row.contact || contact || null;
    row.name = row.name || contact?.name || execution.contactName || '';
    row.tenant = row.tenant || contact?.tenant || execution.tenant || '';
    row.phone = row.phone || contact?.phone || execution.phone || '';
    row.whatsappId = row.whatsappId || contact?.whatsappId || execution.whatsappId || '';
    row.executions.push(execution);
  });

  return Array.from(map.values())
    .map(row => {
      const lastExecution = row.executions[0] || null;
      const tenantName = tenantMap?.[row.tenant]?.name || row.tenant || 'Sem empresa';
      const displayName = row.name || formatPhone(row.phone) || row.whatsappId || 'Contato sem nome';

      return {
        ...row,
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

export default function ChatPage({ contacts, executions, tenantMap }) {
  const [search, setSearch] = useState('');
  const [activeKey, setActiveKey] = useState('');

  const conversations = useMemo(
    () => buildConversations({ contacts, executions, tenantMap }),
    [contacts, executions, tenantMap]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conversations;

    return conversations.filter(conversation =>
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
  }, [conversations, search]);

  useEffect(() => {
    if (activeKey && conversations.some(conversation => conversation.key === activeKey)) return;
    setActiveKey(conversations[0]?.key || '');
  }, [activeKey, conversations]);

  const activeConversation =
    filtered.find(conversation => conversation.key === activeKey) || filtered[0] || null;
  const messages = activeConversation ? buildMessageRows(activeConversation.executions) : [];

  return (
    <section className="chatShell">
      <aside className="chatListPanel">
        <div className="chatListHead">
          <div>
            <span className="sectionEyebrow">Conversas</span>
            <strong>{filtered.length}</strong>
          </div>
          <span className="chatLiveBadge">Firestore</span>
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
              </div>
            </header>

            <div className="chatTimeline">
              {messages.length ? (
                messages.map(message => (
                  <article
                    key={message.id}
                    className={`chatBubble ${message.direction}`.trim()}
                    title={formatDate(message.when)}
                  >
                    <div className="chatBubbleAuthor">
                      {message.direction === 'in' ? (
                        activeConversation.displayName
                      ) : message.direction === 'error' ? (
                        'Erro'
                      ) : (
                        <>
                          <Bot size={13} />
                          Axis AI
                        </>
                      )}
                    </div>
                    <p>{String(message.text)}</p>
                    <footer>
                      <span>{formatTime(message.when)}</span>
                      {message.execution.reportDate ||
                      message.execution.reportDateBr ||
                      message.execution.referenceDate ? (
                        <span>
                          Ref.{' '}
                          {formatReferenceDate(
                            message.execution.reportDateBr,
                            message.execution.reportDate,
                            message.execution.referenceDate
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
          </>
        ) : (
          <EmptyState icon={MessageCircle} title="Nenhuma conversa">
            Assim que os contatos interagirem com o Morning Call, o historico aparece aqui.
          </EmptyState>
        )}
      </section>
    </section>
  );
}
