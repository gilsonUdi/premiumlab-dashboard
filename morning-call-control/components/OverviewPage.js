'use client';

import {
  AlertCircle,
  Building2,
  CheckCircle2,
  MessageSquareText,
  Users,
  Workflow
} from 'lucide-react';
import { isToday } from '@/lib/format';
import { Panel, ActiveBadge, EmptyState } from '@/components/ui';
import { ExecutionFeed } from '@/components/ExecutionFeed';

function Kpi({ icon: Icon, tone, label, value, hint }) {
  return (
    <div className="kpi">
      <span className={`kpiIcon ${tone}`}>
        <Icon size={17} />
      </span>
      <div>
        <span className="kpiLabel">{label}</span>
        <strong className="kpiValue">{value}</strong>
        {hint ? <span className="kpiHint">{hint}</span> : null}
      </div>
    </div>
  );
}

export default function OverviewPage({
  tenants,
  contacts,
  powerBiConfigs,
  executions,
  tenantMap,
  onOpenCompany,
  onNavigate
}) {
  const activeTenants = tenants.filter(tenant => tenant.active);
  const activeContacts = contacts.filter(contact => contact.active);
  const sentToday = executions.filter(
    execution =>
      ['sent', 'report_sent'].includes(execution.status) &&
      isToday(execution.sentAt || execution.updatedAt || execution.createdAt)
  );
  const errorsToday = executions.filter(
    execution =>
      execution.status === 'error' && isToday(execution.updatedAt || execution.createdAt)
  );

  return (
    <>
      <div className="kpiRow">
        <Kpi
          icon={Building2}
          tone="gold"
          label="Empresas ativas"
          value={activeTenants.length}
          hint={`de ${tenants.length} cadastradas`}
        />
        <Kpi
          icon={Users}
          tone="cyan"
          label="Clientes ativos"
          value={activeContacts.length}
          hint={`${contacts.filter(c => c.sendNotice !== false).length} com aviso diário`}
        />
        <Kpi
          icon={CheckCircle2}
          tone="green"
          label="Relatórios enviados hoje"
          value={sentToday.length}
          hint={`${executions.length} execuções no histórico`}
        />
        <Kpi
          icon={AlertCircle}
          tone={errorsToday.length ? 'red' : 'gray'}
          label="Erros hoje"
          value={errorsToday.length}
          hint={
            errorsToday.length
              ? 'Verifique a aba Atividade'
              : 'Nenhum erro registrado hoje'
          }
        />
      </div>

      <div className="overviewGrid">
        <Panel
          title="Atividade recente"
          description="Últimos eventos registrados pelo fluxo n8n."
          icon={MessageSquareText}
          action={
            <button type="button" className="btn ghost" onClick={() => onNavigate('activity')}>
              Ver tudo
            </button>
          }
        >
          <ExecutionFeed
            executions={executions}
            tenantMap={tenantMap}
            limit={8}
            compact
            grouped={false}
          />
        </Panel>

        <div className="overviewSide">
          <Panel
            title="Empresas"
            description="Situação por empresa atendida."
            icon={Building2}
            action={
              <button type="button" className="btn ghost" onClick={() => onNavigate('companies')}>
                Gerenciar
              </button>
            }
          >
            {tenants.length ? (
              <div className="miniCompanyList">
                {tenants.map(tenant => {
                  const tenantContacts = contacts.filter(c => c.tenant === tenant.id);
                  const tenantConfigs = powerBiConfigs.filter(c => c.tenant === tenant.id);

                  return (
                    <button
                      key={tenant.id}
                      type="button"
                      className="miniCompany"
                      onClick={() => onOpenCompany(tenant.id)}
                    >
                      <div>
                        <strong>{tenant.name || tenant.id}</strong>
                        <span>
                          {tenantContacts.length} cliente{tenantContacts.length === 1 ? '' : 's'}
                          {' · '}
                          {tenantConfigs.length} config{tenantConfigs.length === 1 ? '' : 's'} BI
                        </span>
                      </div>
                      <ActiveBadge active={tenant.active} activeText="Ativa" inactiveText="Inativa" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={Building2} title="Nenhuma empresa">
                Cadastre a primeira empresa na aba Empresas.
              </EmptyState>
            )}
          </Panel>

          <Panel title="Contrato do n8n" icon={Workflow} className="n8nPanel">
            <p className="n8nText">
              O fluxo normaliza o telefone recebido da Evolution API e busca em{' '}
              <code>morning_call_contacts</code> por <code>phone</code>. Se o contato estiver
              ativo, o <code>tenant</code> define qual tool de Morning Call será chamada.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
