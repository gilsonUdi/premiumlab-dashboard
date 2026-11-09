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
6. A sessão do relatório termina após 30 minutos sem interação, ao sair da página
   ou ao fechar o relatório.
7. Uma chamada agendada à rota de reconciliação expira sessões abandonadas e
   solicita o Suspend quando não houver nenhuma sessão ou reserva de atualização ativa.

## Inatividade (09/11/2026)

Cliques, movimento do ponteiro, teclado, toque e rolagem no portal, além de
cliques/seleções e navegação de páginas informados pelo SDK do BI, renovam o
prazo de 30 minutos. Renderizações, renovação de token e heartbeats automáticos
não contam como interação. Apenas olhar o relatório sem interagir encerra a
sessão após esse prazo; para reuniões mais longas, interaja antes de 30 minutos.

O heartbeat continua a cada minuto até esse limite, inclusive em abas ocultas,
mas não registra interação nessas abas. O backend limita a validade de cada
heartbeat ao menor prazo entre a tolerância de transporte (10 minutos por
padrão) e o tempo restante de inatividade. Assim, suspender os timers do celular
não prolonga a sessão além do último prazo informado. Falha de rede superior à
tolerância de transporte também pode encerrar a sessão.

As reservas de automação não passam pelo heartbeat do navegador e continuam
protegendo as atualizações. Nenhuma configuração do fluxo de refresh foi alterada.
Depois da implantação, recarregue as abas antigas para aplicar o novo controle;
clientes antigos sem `idleMs` mantêm compatibilidade até serem recarregados.

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

Em 24/08/2026 foi criada a função personalizada
`Power BI Embedded Capacity Operator` e atribuída à entidade de serviço
`n8n-credenciais-powerbi` diretamente no recurso `axispowerbiembedded`. O escopo
e as três ações acima foram confirmados no IAM do Azure.

## Agendamento obrigatório

Executar a cada minuto:

```http
GET https://SEU-DOMINIO/api/cron/power-bi-capacity
Authorization: Bearer POWER_BI_CAPACITY_CRON_SECRET
```

Sem esse agendamento, o Resume ao abrir o relatório funciona, mas a expiração de
sessões abandonadas e o Suspend automático não são garantidos.

O agendamento de produção está publicado no n8n:

- workflow: `Power BI - Gerenciamento automático da capacidade A1`;
- ID: `PjOyI6C6VbyffgDK`;
- intervalo: 1 minuto;
- autenticação: credencial de backend com o segredo do cron;
- primeira execução automática validada com HTTP 200 e status `success`.

Na Hostinger, as 9 variáveis dessa funcionalidade foram acrescentadas
individualmente às 14 variáveis já existentes. Nenhuma variável anterior foi
substituída ou removida.

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
