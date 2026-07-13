export const COLLECTIONS = {
  tenants: 'tenants',
  contacts: 'morning_call_contacts',
  powerbi: 'powerbi_configs',
  executions: 'morning_call_executions',
  consultationCompanies: 'consulta_ia_companies',
  consultationClients: 'consulta_ia_clients',
  consultationExecutions: 'consulta_ia_executions',
  sacCompanies: 'sac_companies'
};

export const POWER_BI_MODEL_TYPES = [
  {
    id: 'geral',
    label: 'Dados gerais',
    description: 'IA 360°, vendas, receber e indicadores financeiros.'
  },
  {
    id: 'precos',
    label: 'Produtos e preços',
    description: 'Produtos, tabelas de negociação, descontos e consulta de preços.'
  }
];

export const DEFAULT_POWER_BI_MODEL_TYPE = 'geral';

export function normalizePowerBiModelType(value) {
  const modelType = String(value || '').trim().toLowerCase();

  if (POWER_BI_MODEL_TYPES.some(model => model.id === modelType)) {
    return modelType;
  }

  if (['morning_call', 'dados_gerais', 'dados-gerais', 'general'].includes(modelType)) {
    return 'geral';
  }

  if (['produtos', 'products', 'precos', 'preços', 'prices'].includes(modelType)) {
    return 'precos';
  }

  return DEFAULT_POWER_BI_MODEL_TYPE;
}

export function getPowerBiDocId(tenant, modelType) {
  return `${tenant}__${normalizePowerBiModelType(modelType)}`;
}

export function getPowerBiModelLabel(modelType) {
  return (
    POWER_BI_MODEL_TYPES.find(model => model.id === normalizePowerBiModelType(modelType))
      ?.label || 'Dados gerais'
  );
}

export const TIMEZONES = [
  'America/Cuiaba',
  'America/Sao_Paulo',
  'America/Campo_Grande',
  'America/Manaus',
  'America/Porto_Velho',
  'America/Rio_Branco',
  'America/Belem',
  'America/Fortaleza',
  'America/Recife',
  'America/Bahia',
  'America/Boa_Vista'
];

export const STATUS_META = {
  sent: { label: 'Relatório enviado', tone: 'green' },
  report_sent: { label: 'Relatório enviado', tone: 'green' },
  notice_sent: { label: 'Aviso enviado', tone: 'cyan' },
  requested: { label: 'Solicitado', tone: 'violet' },
  generating: { label: 'Gerando relatório', tone: 'gold' },
  pending: { label: 'Pendente', tone: 'gray' },
  error: { label: 'Erro', tone: 'red' }
};

export function getStatusMeta(status) {
  return STATUS_META[status] || { label: status || 'Pendente', tone: 'gray' };
}

export function statusLabel(status) {
  return getStatusMeta(status).label;
}
