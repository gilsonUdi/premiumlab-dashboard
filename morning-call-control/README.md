# Morning Call Control

Painel operacional para controlar tenants, numeros autorizados, configuracoes de Power BI e execucoes do Morning Call.

## Deploy na Vercel

1. Crie um novo projeto na Vercel apontando para este repositorio.
2. Em **Root Directory**, selecione `morning-call-control`.
3. Configure as variaveis de ambiente do Firebase:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
MORNING_CALL_INBOUND_WEBHOOK_URL=https://n8n.gsgestao.com.br/webhook/morning-call/evolution
```

## Colecoes Firestore usadas

- `tenants`
- `morning_call_contacts`
- `powerbi_configs`
- `morning_call_executions`

### Configuracoes Power BI

Cada tenant pode ter dois modelos do Power BI cadastrados em `powerbi_configs`:

- `{tenant}__geral`: modelo de dados gerais do Morning Call, com vendas, receber e indicadores financeiros.
- `{tenant}__precos`: modelo de produtos e precos, usado para consultas de produtos, tabelas e descontos.

Campos esperados:

- `tenant`
- `modelType`: `geral` ou `precos`
- `workspaceId`
- `datasetId`
- `active`

## Uso pelo n8n

O flow principal do Morning Call deve consultar `morning_call_contacts` pelo telefone normalizado. O contato encontrado define o `tenant`, a frase de confirmacao e se o numero esta autorizado. Depois, o n8n busca em `powerbi_configs` o documento do tenant e modelo necessario para cada tool.

Cada contato pode definir `morningCallFilters.states` com uma ou mais UFs. Uma lista vazia mantém o relatório comercial com todos os estados. O fluxo aplica esse escopo somente às consultas da tabela `VENDAS`; a tesouraria permanece consolidada porque a tabela `RECEBER` não possui estado no modelo atual.

O Morning Call Financeiro possui autorização independente. O contato só recebe o aviso e pode solicitar o relatório de contas a receber quando `allowReceivablesMorningCall` estiver explicitamente como `true`. A frase fica em `receivablesConfirmationPhrase` e, quando não informada, usa `Receber Morning Call Financeiro`.

A prévia do Morning Call está disponível somente para contatos da Gradual com `allowPreviewMorningCall: true`. A frase de solicitação é `previewConfirmationPhrase` (padrão: `Prévia Morning Call`). Ela reutiliza o relatório comercial e a consulta Firebird, com a data de emissão de amanhã e o fechamento parcial de hoje. A resposta informa o horário da consulta e avisa que os números podem mudar. A prévia não possui aviso diário nem agendamento próprio; a permissão é independente das permissões do Morning Call comercial e financeiro.

Na tela de detalhes de um cliente, os botoes de envio manual reutilizam o mesmo webhook de entrada do n8n. O painel simula a confirmacao cadastrada do contato, preservando as validacoes de empresa ativa, permissoes e fonte de dados feitas pelo fluxo oficial.
