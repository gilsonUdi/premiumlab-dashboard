# Power BI Embedded A1 sob demanda

O portal mantém a integração Power BI Embedded existente e acrescenta um
gerenciador de capacidade antes da geração do Embed Token.

## Fluxo

1. O acesso ao relatório cria uma reserva de sessão no Firestore.
2. O backend consulta a capacidade pela Azure Resource Manager API.
3. Se estiver suspensa, apenas o processo que obtiver o lock distribuído solicita
   o Resume. Os demais recebem `202` e aguardam.
4. Quando a capacidade fica `Active`, o fluxo original gera o Embed Token.
5. O navegador envia heartbeat a cada 60 segundos enquanto houver atividade.
6. A sessão do relatório termina após 10 minutos sem atividade, ao sair da página
   ou ao fechar o relatório.
7. Uma chamada agendada à rota de reconciliação expira sessões abandonadas e,
   depois de 30 minutos sem sessões, solicita o Suspend.

## Variáveis

As variáveis estão documentadas em `.env.example`. Por padrão, o controle Azure
reutiliza `POWER_BI_TENANT_ID`, `POWER_BI_CLIENT_ID` e
`POWER_BI_CLIENT_SECRET`, já usados pelo Embedded. `AZURE_TENANT_ID`,
`AZURE_CLIENT_ID` e `AZURE_CLIENT_SECRET` só precisam ser definidos quando o
controle da capacidade usar outra aplicação. Os segredos devem existir somente
no backend.

O service principal deve ter, no escopo da capacidade
`axispowerbiembedded`, as permissões:

- `Microsoft.PowerBIDedicated/capacities/read`;
- `Microsoft.PowerBIDedicated/capacities/resume/action`;
- `Microsoft.PowerBIDedicated/capacities/suspend/action`.

Pode ser usada uma função personalizada com apenas essas ações. `Contributor`
também funciona, mas concede permissões mais amplas que o necessário.

## Agendamento obrigatório

Executar a cada minuto:

```http
GET https://SEU-DOMINIO/api/cron/power-bi-capacity
Authorization: Bearer POWER_BI_CAPACITY_CRON_SECRET
```

Sem esse agendamento, o Resume ao abrir o relatório funciona, mas a expiração de
sessões abandonadas e o Suspend automático não são garantidos.

## Dados registrados no Firestore

- `powerBiDashboardSessions`: sessões, atividade, empresa, relatório e duração;
- `powerBiCapacityControl/shared-a1`: estado observado, lock e períodos ativos;
- `powerBiCapacityEvents`: solicitações/conclusões de Resume e Suspend;
- `powerBiCapacityMonthly`: horas ativas, sessões concluídas, tempo total e pico
  de simultaneidade por mês.

Administradores podem consultar o consolidado em:

```http
GET /api/admin/power-bi-capacity
Authorization: Bearer FIREBASE_ID_TOKEN
```

A estimativa mensal usa `AZURE_POWER_BI_A1_HOURLY_COST`. O valor deve ser mantido
de acordo com o preço efetivo da região/contrato da assinatura.
