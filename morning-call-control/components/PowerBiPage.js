'use client';

import { useMemo, useState } from 'react';
import { BarChart3, Plus, X } from 'lucide-react';
import {
  COLLECTIONS,
  DEFAULT_POWER_BI_MODEL_TYPE,
  POWER_BI_MODEL_TYPES,
  getPowerBiModelLabel,
  normalizePowerBiModelType
} from '@/lib/constants';
import {
  ConfirmDeleteButton,
  EmptyState,
  Field,
  Panel,
  Switch
} from '@/components/ui';

const EMPTY_FORM = {
  tenant: '',
  workspaceId: '',
  datasetId: '',
  modelType: DEFAULT_POWER_BI_MODEL_TYPE,
  active: true
};

function PowerBiForm({ initial, tenants, firebaseReady, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);

  function set(key, value) {
    setForm(current => ({ ...current, [key]: value }));
  }

  const modelInfo = POWER_BI_MODEL_TYPES.find(
    model => model.id === normalizePowerBiModelType(form.modelType)
  );

  return (
    <Panel
      title="Configuração de dataset"
      description="Salvar com a mesma empresa e modelo substitui a configuração existente."
      icon={BarChart3}
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
          <Field label="Empresa">
            <select value={form.tenant} onChange={event => set('tenant', event.target.value)} required>
              <option value="">Selecione</option>
              {tenants.map(tenant => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name || tenant.id}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Modelo" hint={modelInfo?.description}>
            <select
              value={form.modelType}
              onChange={event => set('modelType', normalizePowerBiModelType(event.target.value))}
            >
              {POWER_BI_MODEL_TYPES.map(model => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Workspace ID">
            <input
              value={form.workspaceId}
              onChange={event => set('workspaceId', event.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </Field>
          <Field label="Dataset ID">
            <input
              value={form.datasetId}
              onChange={event => set('datasetId', event.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </Field>
          <div className="field">
            <span className="fieldLabel">Status</span>
            <div className="switchInline">
              <Switch checked={form.active} onChange={value => set('active', value)} label="Configuração ativa" />
              <span>{form.active ? 'Configuração ativa' : 'Configuração inativa'}</span>
            </div>
          </div>
        </div>
        <div className="formActions">
          <button className="btn primary" type="submit" disabled={!firebaseReady}>
            <Plus size={15} />
            Salvar configuração
          </button>
          <button className="btn ghost" type="button" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </Panel>
  );
}

export default function PowerBiPage({
  powerBiConfigs,
  tenants,
  tenantMap,
  savePowerBiConfig,
  toggleDoc,
  removeDoc,
  firebaseReady,
  onOpenCompany
}) {
  const [formOpen, setFormOpen] = useState(false);

  const groups = useMemo(() => {
    const byTenant = new Map();

    powerBiConfigs.forEach(config => {
      const key = config.tenant || 'sem-tenant';
      if (!byTenant.has(key)) byTenant.set(key, []);
      byTenant.get(key).push(config);
    });

    return Array.from(byTenant.entries()).map(([tenant, configs]) => ({
      tenant,
      name: tenantMap[tenant]?.name || tenant,
      configs
    }));
  }, [powerBiConfigs, tenantMap]);

  async function handleSubmit(form) {
    const ok = await savePowerBiConfig(form);
    if (ok) setFormOpen(false);
  }

  return (
    <>
      <div className="toolbar">
        <p className="toolbarText">
          Datasets do Power BI usados pelas tools de geração do relatório, por empresa e modelo.
        </p>
        {!formOpen ? (
          <button type="button" className="btn primary" onClick={() => setFormOpen(true)}>
            <Plus size={15} />
            Nova configuração
          </button>
        ) : null}
      </div>

      {formOpen ? (
        <PowerBiForm
          initial={{ ...EMPTY_FORM, tenant: tenants[0]?.id || '' }}
          tenants={tenants}
          firebaseReady={firebaseReady}
          onSubmit={handleSubmit}
          onCancel={() => setFormOpen(false)}
        />
      ) : null}

      {groups.length ? (
        groups.map(group => (
          <Panel
            key={group.tenant}
            title={group.name}
            description={`${group.configs.length} modelo${group.configs.length === 1 ? '' : 's'} configurado${group.configs.length === 1 ? '' : 's'}.`}
            icon={BarChart3}
            action={
              tenantMap[group.tenant] ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => onOpenCompany(group.tenant)}
                >
                  Ver empresa
                </button>
              ) : null
            }
          >
            <div className="configList twoCols">
              {group.configs.map(config => (
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
          </Panel>
        ))
      ) : (
        <EmptyState icon={BarChart3} title="Nenhuma configuração de Power BI">
          Cadastre a primeira configuração com o botão “Nova configuração”.
        </EmptyState>
      )}
    </>
  );
}
