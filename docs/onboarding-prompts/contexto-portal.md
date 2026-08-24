# Prompt de Contexto - Portal GS / DashboardPremium

Voce esta assumindo continuidade tecnica do Portal GS / DashboardPremium, portal web multi-tenant da GS Gestao para laboratorios opticos. Trate este prompt como contexto oficial.

## Produto

Nome:
- GS Portal / DashboardPremium

Objetivo:
- Centralizar visao operacional e analitica de multiplos laboratorios opticos.
- Fornecer dashboard de Analise de Dados.
- Fornecer dashboard PPS.
- Fornecer acesso a modelos Power BI embed.
- Fornecer administracao multi-tenant:
  - empresas;
  - usuarios;
  - permissoes;
  - filtros;
  - dashboards internos/externos;
  - modelos BI;
  - regras de interpretacao.

Regra de ouro:
- Cada empresa pode ter regras proprias.
- Nao criar hardcode global para regra que muda por empresa.
- Sempre projetar por configuracao por tenant.

Empresas recorrentes:
- Premium Lab
- Indio Lab
- Lentes Gradual
- Art Lens
- Outras empresas com dashboard interno e/ou externo.

## Caminhos

Projeto principal do portal:

```text
G:\Meu Drive\PROJETOS GS\CLIENTES\2 - LABORATÓRIO ÓPTICO\PREMIUM\DashboardPremium
```

Sync Premium legado Firebird -> Supabase:

```text
G:\Meu Drive\PROJETOS GS\CLIENTES\2 - LABORATÓRIO ÓPTICO\PREMIUM\DashboardPremium\sync\firebird-supabase
```

Sync Indio separado:

```text
G:\Meu Drive\PROJETOS GS\CLIENTES\9 - SISTEMAS\IndioSupaBase\sync\firebird-supabase
```

PPS local Indio:

```text
G:\Meu Drive\PROJETOS GS\CLIENTES\9 - SISTEMAS\IndioPPS
```

APIs Python antigas/analises:

```text
G:\Meu Drive\PROJETOS GS\CLIENTES\9 - SISTEMAS\app.py
G:\Meu Drive\PROJETOS GS\CLIENTES\9 - SISTEMAS\fetch_pps.py
G:\Meu Drive\PROJETOS GS\CLIENTES\9 - SISTEMAS\fetch_pps (1).py
```

## Stack

- Next.js 14
- React
- Rotas API em `app/api/...`
- Firebase Auth + Firestore
- Supabase
- Power BI embed
- Hostinger / EasyPanel / Vercel historico

## Arquivos criticos

```text
app/admin/page.js
app/api/admin/companies/route.js
app/api/dashboard/route.js
components/HistoricoPedidos.jsx
components/KPICards.jsx
components/PerdasChart.jsx
lib/portal-config.js
lib/portal-store.js
```

Arquivos de sync legado:

```text
sync/firebird-supabase/sync.js
sync/firebird-supabase/install-user-task.ps1
sync/firebird-supabase/run-incremental-sync.ps1
sync/firebird-supabase/run-weekly-sync.ps1
```

## UI/UX

Direcao visual atual:
- Tema escuro/azulado.
- Visual executivo, limpo, denso.
- Sem exagero visual.
- Tipografia discreta.
- Cards mais compactos.
- Tabelas precisam ser legiveis.

Tabelas:
- Datas nao devem quebrar ruim.
- Texto longo de cliente deve ficar sem quebra e com truncamento.
- Colunas criticas:
  - Data Emissao
  - Caixa
  - ID Pedido
  - Cliente
  - Celula
  - Data Prevista
  - Dt. Saida
  - Dias no Lab
  - Roteiro

Regras:
- Mudancas pequenas e cirurgicas.
- Evitar refatoracao paralela.
- Nao regredir ajustes antigos.
- Alertar risco funcional antes.

## Evolucao feita no portal

### Modelo de alimentacao

Mudanca importante ja implantada:
- Removida ideia de fonte API direta no dashboard.
- Portal sempre le Supabase.
- No cadastro da empresa, ao inves de escolher fonte, escolhe modelo de alimentacao/interpretacao:
  - `firebird_legacy`
  - `api_cache`

Regras:
- `firebird_legacy`: interpreta tabelas antigas alimentadas pelo sync Firebird.
- `api_cache`: interpreta tabelas `gradual_cache_*` alimentadas pela API.
- Tenants antigos continuam compativeis.

Arquitetura correta:
- `app/api/dashboard/route.js` sempre le Supabase.
- Bifurcacao so na camada de normalizacao/interpretacao por empresa.

### Cadastro de empresa

Foram removidos campos de API direta:
- URL de API
- API key de empresa
- source gradualApi
- scan window
- start ID
- configs de busca runtime

Agora o cadastro tem alimentacao/interpretação.

Tambem ha configuracoes de regras:
- Limitar dashboard por codigo da empresa.
- Codigos de perda.
- Codigos de cancelamento na API.
- Pedido concluido quando.

Importante:
- Tenant slug nao e limitacao por empresa.
- Tenant slug separa laboratorio na API.
- Limitacao por empresa deve usar coluna equivalente a `EMPCODIGO`.
- No modelo legado era `PEDID.EMPCODIGO`.
- No modelo API/cache, foi necessario procurar equivalente nos dados trazidos.

### Regras de perdas

Antes havia codigo fixo global.
Foi migrado para configuracao por empresa:
- `lossFinalityCodes`

Na alimentacao API:
- perdas usam payload e regras do tenant.
- pedidos cancelados devem ser excluidos de tudo.
- produtos do tipo servico nao devem entrar no calculo de perdas.
- Para perdas, considerar somente produtos de estoque.
- No payload API, isso aparece em `warehouse.type = "STOCK"`.
- Foi necessario achar a coluna correspondente no Supabase e excluir sem `STOCK`.

### Cancelados

Pedidos cancelados apareceram no PPS/Analise.
Regra definida:
- Cancelados devem sumir da tabela.
- Cancelados tambem devem ser desconsiderados de todos os calculos do dashboard.
- Codigo de cancelamento deve ser configuravel por empresa.
- Gradual usa `43`, mas Indio pode usar outro, por exemplo `4`.
- Configuracao deve ficar na secao de regras, junto com codigo de perda.

### Pedido concluido quando

Existe conceito:
- Pedido concluido quando bater condicoes configuraveis.

Essas regras sao adicionais:
- Nao substituem fallback de data de saida.
- Se tem data de saida, continua concluido.
- Admin define tabela/coluna/valor.
- No modelo API/cache, tambem precisa aplicar a condicao nas tabelas novas.

### Dashboard externo e BI

Mudanca feita:
- Antes alternava entre dashboard externo e interno.
- Agora ambos sao opcionais e podem coexistir.
- Empresa pode ter:
  - nenhum;
  - interno;
  - externo;
  - ambos.

Dashboard externo:
- Agora deve aceitar multiplos dashboards externos com nomes.
- Ao clicar em Dashboard Externo, abre uma tela semelhante aos modelos BI, listando dashboards disponiveis da empresa.

Power BI:
- Ajustado botao de voltar dentro de BI embed para retornar para tela de modelos, nao para portal da empresa.
- Houve bug ao trocar paginas rapido no BI embed, causando alternancia infinita.
- Mobile:
  - Em retrato, BI fica mobile.
  - Em paisagem, deve ir para layout web.
  - Barra inferior no mobile deve se adaptar a barras do navegador.
  - Botao de tela cheia deve sumir no mobile.
  - Ajustes precisam evitar que barra superior fique escondida atras da UI do celular.

### Sugestoes / feedbacks de usuarios

Foi criado sistema de sugestoes:
- Usuario tem botao flutuante no canto inferior direito.
- Abre popup de “Solicitar melhoria”.
- Usuario pode enviar texto.
- Usuario ve historico de sugestoes e status.
- Admin ve pagina “Sugestoes” abaixo de Empresas na sidebar.
- Admin ve nome do usuario e empresa.
- Notificacao na sidebar mostra quantidade de novas sugestoes.
- Ao abrir a pagina admin, sugestoes novas viram lidas automaticamente.

Status:
- Lido
- Em progresso
- Concluido

Organizacao:
- Mesmo em “Todas”, agrupar por status:
  1. Lido
  2. Em progresso
  3. Concluido

Visual:
- Fundo do card normal.
- Contorno do card muda por status:
  - Concluido: esverdeado.
  - Em progresso: azulado.
  - Lido: normal.
- Botao do status atual fica “aceso” com borda/cor do status.

Anexos:
- Firebase Storage habilitado.
- Usuarios podem anexar fotos/videos.
- Maximo combinado: 4 arquivos, 30MB cada.
- Foi adicionado botao para colar print da area de transferencia.
- Popup precisa ter scroll para nao passar da tela.

Problemas encontrados:
- `(0, _g.getFirebaseServices) is not a function`: corrigir import/servico Firebase Storage.
- `Firebase Storage: User does not have permission... storage/unauthorized`: precisa ajustar regras do Storage.

### Login

Tela de login tinha “gestao” sem acento.
Foi solicitado mudar para “gestão”.

### Usuarios admin

Tela antiga confundia edicao e criacao.
Mudanca solicitada/feita:
- Lista de usuarios fica apenas para selecao/edicao.
- Formulario de edicao so aparece apos clicar no usuario.
- Botao Novo Usuario abre popup separado.
- Objetivo: evitar confundir edicao com criacao.

Tambem existem:
- Botao copiar configuracao de usuario.
- Gerar lista TXT de usuarios com novas senhas foi pedido antes como alternativa ao reveal password.

## Bugs recentes do dashboard

### Filtro janela 30 dias

Premium Lab:
- PPS/Analise retornavam vazio em `02/05 ate 01/06`.
- Ao mudar para `01/05 ate 01/06`, voltava.
- PPS ficava travado em janela de 30 dias.
- Implementada opcao 1 para ajustar causa mantendo janela.

### Erro empcodigo

Erro:

```text
pedido_dashboard_cache: column pedido_dashboard_cache.empcodigo does not exist
```

Diagnostico:
- Query estava tentando buscar `pedido_dashboard_cache.empcodigo`.
- Mas `empcodigo` fica na tabela `pedid`, nao em `pedido_dashboard_cache`.

### PPS nao encontrava pedidos

Foi ajustado para buscar `empcodigo` em `pedid`.

### Ordenacao PPS

Solicitacao:
- Na coluna “Dias no Lab”, priorizar:
  1. Atrasados
  2. Perto do atraso
  3. No prazo
- Dentro de cada grupo, `Dias no Lab` continua ditando ordem.

Problemas:
- Ajustes quebraram scroll da tabela algumas vezes.
- Tabela ficava travada nos pedidos de cima.
- Corrigir sem bloquear overflow/scroll.

## Hospedagem

Hostinger:
- Em alguns momentos mostrou logs repetidos:
  `Starting...`
  `Next.js 14.2.3`
- Dominio temporario antigo `orchid-wallaby-...hostingersite.com` parecia iniciar junto e consumir recursos.
- Usuario queria remover dominio temporario antigo.
- Hostinger mostrou vulnerabilidades no Next.js `14.2.3`.
- Foi recomendado atualizar Next via PR da Hostinger/GitHub.

VPS:
- Hostinger VPS com Docker Ubuntu.
- EasyPanel instalado/planejado.
- n8n, Evolution API e Redis configurados.
- Possivel instalar API, Postgres proprio e servicos personalizados.

## Regras operacionais git

Para portal principal:
- Fazer commit.
- Fazer push.
- Reportar hash e descricao.

Para API ou sync:
- Commit/push no diretorio Git correto da API/sync quando explicitamente tratado.
- Trabalhos locais/paralelos de sync: nao commit/push sem autorizacao explicita.

## Proximos passos portal

1. Revisar se configuracoes de cancelamento/perda estao realmente na secao Regras.
2. Garantir que alimentacao `api_cache` exclui cancelados de todos os KPIs.
3. Garantir perdas API considerando apenas estoque, nao servico.
4. Validar PPS/Analise Premium, Indio e Gradual sem regressao.
5. Validar scroll e ordenacao PPS:
   - Atrasados > Perto do atraso > No prazo.
6. Validar BI mobile:
   - retrato mobile;
   - paisagem web;
   - barra adaptativa;
   - sem tela cheia no mobile.
7. Validar sugestoes com anexos e regras Firebase Storage.

## Troca da propria senha pelo usuario - atualizacao de 04/08/2026

- A home da empresa passou a exibir o botao `Alterar senha` na barra superior.
- O botao abre um popup compacto com um unico campo, `Nova senha`, alem das acoes de confirmar e fechar.
- A senha deve ter entre 6 e 128 caracteres.
- Foi criada a rota protegida `PATCH /api/account/password`. Ela identifica o usuario exclusivamente pelo token Firebase da sessao e atualiza somente o UID autenticado; o frontend nao envia nem escolhe UID.
- Contas marcadas como inativas nao podem usar a operacao.
- Depois da troca, o popup informa o sucesso sem desconectar o usuario.
- A barra superior passou a quebrar os botoes em telas menores para acomodar a nova acao sem transbordamento.
- Build de producao do Next.js 14.2.35 concluido com sucesso em copia temporaria limpa. O aviso preexistente de uso dinamico da rota `/api/admin/feedback` apareceu durante a geracao, mas nao impediu o build.

## Dependencia Sharp no deploy - atualizacao de 04/08/2026

- O deploy da Hostinger iniciou o Next.js 14.2.35, mas a otimizacao de imagens falhou em runtime com `sharp is required to be installed in standalone mode`.
- O pacote `sharp` passou a ser uma dependencia explicita de producao no `package.json`, garantindo sua instalacao e inclusao no ambiente standalone.

## Power BI Embedded A1 sob demanda - atualizacao de 24/08/2026

A Area do Cliente passou a ter uma camada de gerenciamento automatico para a
capacidade Azure Power BI Embedded A1 compartilhada, sem substituir o fluxo atual
de geracao do Embed Token.

Arquitetura implementada:

- a rota de embed consulta a capacidade pela Azure Resource Manager API antes de
  gerar o token;
- se a A1 estiver suspensa, somente o processo que obtiver um lock distribuido no
  Firestore solicita Resume; acessos concorrentes aguardam com HTTP 202;
- a interface mostra `Preparando seu painel de indicadores. Aguarde alguns
  instantes...` ate o estado Active;
- cada dashboard aberto possui sessao propria e heartbeat de 60 segundos;
- 10 minutos sem atividade encerram apenas o dashboard, mantendo o login do portal;
- uma rota protegida de reconciliacao expira sessoes abandonadas e solicita
  Suspend depois de 30 minutos sem nenhuma sessao ativa;
- antes do Suspend ocorre nova verificacao de sessoes, impedindo desligamento com
  cliente ativo;
- Resume, Suspend, empresa que provocou a ativacao, sessoes, duracoes, pico de
  simultaneidade, horas mensais e estimativa de custo ficam registrados no
  Firestore;
- administradores podem consultar o consolidado por
  `GET /api/admin/power-bi-capacity`.

Colecoes criadas pelo backend:

- `powerBiCapacityControl`;
- `powerBiDashboardSessions`;
- `powerBiCapacityEvents`;
- `powerBiCapacityMonthly`.

Ativacao concluida em 24/08/2026:

- as 9 variaveis novas foram adicionadas na Hostinger sem substituir ou remover
  as 14 variaveis anteriores do portal;
- foi criada no Azure a funcao personalizada
  `Power BI Embedded Capacity Operator`, contendo somente as acoes ARM de
  read/resume/suspend;
- a funcao foi atribuida a `n8n-credenciais-powerbi` no escopo exclusivo do
  recurso `axispowerbiembedded`;
- o workflow n8n `Power BI - Gerenciamento automatico da capacidade A1`, ID
  `PjOyI6C6VbyffgDK`, foi publicado com execucao a cada minuto;
- o teste manual e a primeira execucao automatica responderam HTTP 200 e
  terminaram com status `success`;
- a execucao automatica confirmou a capacidade operacional e preservou a A1
  ativa porque havia uma sessao de dashboard ativa.

Documentacao operacional completa em `docs/power-bi-capacity-on-demand.md`.
Build de producao do Next.js 14.2.35 aprovado em copia temporaria limpa; permaneceu
apenas o aviso preexistente de renderizacao dinamica de `/api/admin/feedback`.
