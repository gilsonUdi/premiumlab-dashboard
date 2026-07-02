'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ExecutionFeed } from '@/components/ExecutionFeed';
import { getStatusMeta } from '@/lib/constants';

const STATUS_FILTERS = [
  { id: 'all', label: 'Tudo', match: () => true },
  { id: 'sent', label: 'Relatórios', match: s => ['sent', 'report_sent'].includes(s) },
  { id: 'notice', label: 'Avisos', match: s => s === 'notice_sent' },
  {
    id: 'progress',
    label: 'Em andamento',
    match: s => ['requested', 'generating', 'pending'].includes(s)
  },
  { id: 'error', label: 'Erros', match: s => s === 'error' }
];

export default function ActivityPage({
  executions,
  tenants,
  tenantMap,
  onOpenClient
}) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [tenantFilter, setTenantFilter] = useState('all');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => {
    const result = {};
    STATUS_FILTERS.forEach(filter => {
      result[filter.id] = executions.filter(execution =>
        filter.match(execution.status)
      ).length;
    });
    return result;
  }, [executions]);

  const filtered = useMemo(() => {
    const filter = STATUS_FILTERS.find(item => item.id === statusFilter) || STATUS_FILTERS[0];
    const term = search.trim().toLowerCase();

    return executions.filter(execution => {
      if (!filter.match(execution.status)) return false;
      if (tenantFilter !== 'all' && execution.tenant !== tenantFilter) return false;
      if (!term) return true;

      return [
        execution.contactName,
        execution.phone,
        execution.tenant,
        tenantMap[execution.tenant]?.name,
        getStatusMeta(execution.status).label
      ]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(term));
    });
  }, [executions, statusFilter, tenantFilter, search, tenantMap]);

  return (
    <>
      <div className="activitySummary">
        {STATUS_FILTERS.map(filter => (
          <button
            key={filter.id}
            type="button"
            className={`summaryChip ${filter.id} ${statusFilter === filter.id ? 'active' : ''}`.trim()}
            onClick={() => setStatusFilter(filter.id)}
          >
            <strong>{counts[filter.id]}</strong>
            <span>{filter.label}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <div className="searchBox">
          <Search size={15} />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar por cliente, telefone ou empresa"
          />
        </div>
        <div className="chipRow">
          <button
            type="button"
            className={`chip ${tenantFilter === 'all' ? 'active' : ''}`.trim()}
            onClick={() => setTenantFilter('all')}
          >
            Todas as empresas
          </button>
          {tenants.map(tenant => (
            <button
              key={tenant.id}
              type="button"
              className={`chip ${tenantFilter === tenant.id ? 'active' : ''}`.trim()}
              onClick={() => setTenantFilter(tenant.id)}
            >
              {tenant.name || tenant.id}
            </button>
          ))}
        </div>
      </div>

      <ExecutionFeed
        executions={filtered}
        tenantMap={tenantMap}
        limit={100}
        onOpenClient={onOpenClient}
        emptyText={
          executions.length
            ? 'Nenhum evento corresponde aos filtros selecionados.'
            : 'Assim que o n8n registrar eventos, eles aparecem aqui.'
        }
      />
    </>
  );
}
