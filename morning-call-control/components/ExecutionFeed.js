'use client';

import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock3,
  Loader2,
  MessageSquareText
} from 'lucide-react';
import { getStatusMeta } from '@/lib/constants';
import {
  dayKey,
  dayLabel,
  formatReferenceDate,
  formatTime,
  timeAgo
} from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { EmptyState, StatusBadge } from '@/components/ui';

const STATUS_ICONS = {
  green: CheckCircle2,
  cyan: Bell,
  violet: MessageSquareText,
  gold: Loader2,
  gray: Clock3,
  red: AlertCircle
};

export function FeedItem({ execution, tenantMap, compact = false, onOpenClient }) {
  const meta = getStatusMeta(execution.status);
  const Icon = STATUS_ICONS[meta.tone] || Clock3;
  const when = execution.updatedAt || execution.createdAt;
  const tenantName =
    tenantMap?.[execution.tenant]?.name || execution.tenant || 'Sem empresa';
  const displayName = execution.contactName || formatPhone(execution.phone) || 'Desconhecido';
  const reference = formatReferenceDate(
    execution.reportDateBr,
    execution.reportDate,
    execution.referenceDate
  );
  const preview = execution.responseText || execution.preview || '';
  const hasDetails = Boolean(preview || execution.error);

  return (
    <article className={`feedItem ${compact ? 'compact' : ''}`.trim()}>
      <span className={`feedIcon ${meta.tone}`}>
        <Icon size={15} />
      </span>
      <div className="feedBody">
        <div className="feedTop">
          {onOpenClient && execution.contactId ? (
            <button
              type="button"
              className="feedName link"
              onClick={() => onOpenClient(execution)}
            >
              {displayName}
            </button>
          ) : (
            <strong className="feedName">{displayName}</strong>
          )}
          <span className="feedTenant">{tenantName}</span>
          <span className="feedTime" title={formatTime(when)}>
            {timeAgo(when)}
          </span>
        </div>
        <div className="feedMeta">
          <StatusBadge status={execution.status} />
          {reference !== '-' ? <span className="feedRef">Referência {reference}</span> : null}
        </div>
        {execution.status === 'error' && execution.error ? (
          <p className="feedError">{String(execution.error)}</p>
        ) : null}
        {!compact && hasDetails && preview ? (
          <details className="feedExpand">
            <summary>Ver mensagem</summary>
            <pre>{String(preview)}</pre>
          </details>
        ) : null}
      </div>
    </article>
  );
}

export function ExecutionFeed({
  executions,
  tenantMap,
  limit,
  compact = false,
  grouped = true,
  onOpenClient,
  emptyText = 'Nenhuma atividade registrada ainda.'
}) {
  const rows = limit ? executions.slice(0, limit) : executions;

  if (!rows.length) {
    return (
      <EmptyState icon={MessageSquareText} title="Sem atividade">
        {emptyText}
      </EmptyState>
    );
  }

  if (!grouped) {
    return (
      <div className="feed">
        {rows.map(execution => (
          <FeedItem
            key={execution.id}
            execution={execution}
            tenantMap={tenantMap}
            compact={compact}
            onOpenClient={onOpenClient}
          />
        ))}
      </div>
    );
  }

  const groups = [];
  let currentKey = null;

  rows.forEach(execution => {
    const when = execution.updatedAt || execution.createdAt;
    const key = dayKey(when);

    if (key !== currentKey) {
      groups.push({ key, label: dayLabel(when), items: [] });
      currentKey = key;
    }

    groups[groups.length - 1].items.push(execution);
  });

  return (
    <div className="feed">
      {groups.map(group => (
        <div className="feedGroup" key={group.key}>
          <div className="feedDay">
            <span>{group.label}</span>
            <i />
          </div>
          {group.items.map(execution => (
            <FeedItem
              key={execution.id}
              execution={execution}
              tenantMap={tenantMap}
              compact={compact}
              onOpenClient={onOpenClient}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
