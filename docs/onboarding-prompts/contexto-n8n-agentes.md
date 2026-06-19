# Prompt de Contexto - n8n / Agentes IA / WhatsApp / Redis

Voce esta assumindo continuidade da automacao de atendimento IA da GS Gestao no n8n. Trate este prompt como contexto oficial.

## Objetivo

Montar atendimento automatizado por WhatsApp usando:
- n8n self-hosted;
- Evolution API;
- Redis para memoria/sessao;
- OpenAI para agentes;
- API GS para boletos;
- Firebase/Firebird/API para pedidos;
- Power BI API para precos e autenticacao por codigo.

Uso principal:
- Clientes de laboratorios opticos consultam:
  - status de pedidos;
  - boletos/financeiro;
  - precos e descontos.

Seguranca:
- Cliente precisa autenticar antes de consultar dados.
- Autenticacao exige CNPJ obrigatorio.
- Depois autentica por:
  - CNPJ + telefone, validando pela API financeira;
  - CNPJ + codigo cliente, validando por Power BI.

## Infraestrutura

n8n:
- Self-hosted no EasyPanel/Hostinger VPS.
- URL: `https://n8n.gsgestao.com.br`
- Banco do n8n: Postgres interno do proprio n8n.
- IA usa Redis para memoria/sessao.

Redis:
- Usado para sessoes dos clientes e memoria dos agentes.
- Padrao de chave:
  - Chat teste n8n: `gs:chat:sessao:lentes-gradual:<chatId>`
  - WhatsApp futuro: `gs:wa:sessao:lentes-gradual:<telefone>`

API GS atual:
- `https://labapi.gsgestao.com.br`
- Header `x-api-key`.

Power BI:
- Usado para:
  - autenticacao por CNPJ + codigo cliente;
  - consulta de precos/descontos.

Workspace:
- `93668e0d-442e-40c2-800c-7bdb1a8a0f50`

Dataset autenticacao/precos:
- `5bf9c59d-3a27-464d-8143-42d6fd6cbc43`

## Flows criados

### 1. Flow principal de atendimento

Nome:
- `Flow principal de atendimento`

Finalidade:
- Receber mensagem.
- Buscar sessao no Redis.
- Decidir se usuario vai para autenticacao ou para agente.
- Chamar subworkflow correspondente.
- Retornar mensagem no chat.

Nodes:
1. `When chat message received`
2. `Code - Preparar entrada principal`
3. `Redis - Buscar sessão principal`
4. `Code - Normalizar sessão principal`
5. `Code - Definir rota principal`
6. `Switch - Sessão autenticada`
7. `Call 'Fluxo do Agente'`
8. `Chat`
9. `Call 'Autenticação'`
10. `Chat1`

Regra do switch:
- Se `rotaPrincipal` = `agente`, chama `Fluxo do Agente`.
- Se `rotaPrincipal` = `autenticacao`, chama `Autenticação`.

Inputs ao chamar `Fluxo do Agente`:

```n8n
tenant = {{$json.tenant}}
mensagem = {{$json.mensagem}}
chatId = {{$json.chatId}}
redisKey = {{$json.redisKey}}
session = {{JSON.stringify($json.session)}}
```

Inputs ao chamar `Autenticação`:

```n8n
tenant = {{$json.tenant}}
mensagem = {{$json.mensagem}}
chatId = {{$json.chatId}}
redisKey = {{$json.redisKey}}
session = {{JSON.stringify($json.session)}}
```

Importante:
- `session` no Execute Workflow precisa ser string, por isso usar `JSON.stringify`.

### Code - Preparar entrada principal

Funcao:
- Normaliza tenant, mensagem, chatId e redisKey.

Modelo:

```javascript
const input = $json;

const tenant = input.tenant || 'lentes-gradual';
const mensagem =
  input.chatInput ||
  input.mensagem ||
  input.message ||
  input.text ||
  '';

const chatId =
  input.sessionId ||
  input.chatId ||
  input.from ||
  'chat-teste';

const redisKey = `gs:chat:sessao:${tenant}:${chatId}`;

return [
  {
    json: {
      tenant,
      mensagem: String(mensagem).trim(),
      chatId,
      redisKey
    }
  }
];
```

### Redis - Buscar sessão principal

Operacao:
- Get

Key:

```n8n
{{$json.redisKey}}
```

Name/output:
- `sessionData`

### Code - Normalizar sessão principal

Funcao:
- Parseia Redis.
- Cria sessao inicial se nao existir.

Modelo:

```javascript
const entrada = $json;
let session = null;

if (entrada.sessionData) {
  try {
    session = typeof entrada.sessionData === 'string'
      ? JSON.parse(entrada.sessionData)
      : entrada.sessionData;
  } catch {
    session = null;
  }
}

const now = new Date().toISOString();

if (!session) {
  session = {
    tenant: entrada.tenant || 'lentes-gradual',
    estadoAtual: 'aguardando_cnpj',
    authenticated: false,
    allowedScopes: [],
    failedAttempts: 0,
    createdAt: now,
    updatedAt: now
  };
}

return [
  {
    json: {
      ...entrada,
      session
    }
  }
];
```

### Code - Definir rota principal

Funcao:
- Define se vai para agente ou autenticacao.

Modelo:

```javascript
const entrada = $json;
const session = entrada.session || {};

const rotaPrincipal = session.authenticated === true
  ? 'agente'
  : 'autenticacao';

return [
  {
    json: {
      ...entrada,
      rotaPrincipal
    }
  }
];
```

## 2. Flow Autenticação

Nome:
- `Autenticação`

Finalidade:
- Controlar estado da autenticacao.
- Pedir CNPJ.
- Pedir metodo: telefone ou codigo cliente.
- Validar telefone pela API financeira.
- Validar codigo pelo Power BI.
- Confirmar telefone cadastrado para boletos quando autenticado por codigo.

Estados:
- `aguardando_cnpj`
- `aguardando_metodo_autenticacao`
- `aguardando_telefone`
- `validando_telefone`
- `aguardando_codigo_cliente`
- `validando_codigo_cliente`
- `aguardando_confirmacao_boleto`
- `aguardando_novo_telefone_boleto`
- `autenticado_sem_boletos`
- `autenticado_total`

Nodes principais:
- `When Executed by Another Workflow`
- `Code - Preparar entrada subworkflow`
- `Estado Atual`
- ramos de tratamento por estado
- chamadas:
  - `Call 'Validar Cliente Telefone Financeiro'`
  - `Call 'Validar Cliente por Código BI'`
- Redis Set para salvar sessao
- Code para retornar resposta

Problema corrigido:
- O usuario precisava mandar telefone/codigo duas vezes.
- Causa: ao receber telefone/codigo, apenas mudava estado para validando, mas nao chamava validacao na mesma execucao.
- Ajuste: criar ramos `validando_telefone` e `validando_codigo_cliente` ou mandar diretamente para validacao apos receber valor.

### Sessao autenticada por telefone

Exemplo final:

```json
{
  "tenant": "lentes-gradual",
  "estadoAtual": "autenticado_total",
  "authenticated": true,
  "allowedScopes": ["pedidos", "boletos", "precos"],
  "failedAttempts": 0,
  "cnpj": "27679277000149",
  "authMethod": "telefone",
  "telefoneInformado": "66996039777",
  "telefoneValidado": "5566996039777",
  "authValidatedBy": "telefone_api"
}
```

### Sessao autenticada por codigo

Exemplo:

```json
{
  "tenant": "lentes-gradual",
  "estadoAtual": "autenticado_sem_boletos",
  "authenticated": true,
  "allowedScopes": ["pedidos", "precos"],
  "cnpj": "27679277000149",
  "authMethod": "codigo_cliente",
  "codigoClienteInformado": "1351",
  "customerCode": "1351",
  "customerName": "OTICA MADEIRO - RONDONOPOLIS",
  "companyName": "IRALENE FERREIRA COREZOMAE - ME",
  "telefoneCadastradoBoleto": "66 - 3421-6221",
  "authValidatedBy": "codigo_cliente_bi"
}
```

Se cliente confirmar telefone cadastrado para boletos:
- liberar `boletos`
- mudar `estadoAtual` para `autenticado_total`
- `allowedScopes`: `["pedidos","precos","boletos"]`

## 3. Validar Cliente Telefone Financeiro

Nome:
- `Validar Cliente Telefone Financeiro`

Finalidade:
- Validar CNPJ + telefone usando API financeira.

Nodes:
1. `When Executed by Another Workflow`
2. `Code - Preparar telefone`
3. `HTTP Request - Validar financeiro`
4. `Code - Normalizar retorno`

HTTP:

```http
POST https://labapi.gsgestao.com.br/api/finance/receber/open
```

Headers:

```http
Content-Type: application/json
x-api-key: <API_KEY>
```

Body:

```n8n
{{$json.requestBody}}
```

Exemplo de retorno valido:

```json
{
  "success": true,
  "matched": true,
  "tenant": "lentes-gradual",
  "cnpj": "27.679.277/0001-49",
  "normalizedPhone": "5566996039777",
  "source": "api_financeira",
  "recordsFound": 3
}
```

Telefone invalido:

```json
{
  "success": true,
  "matched": false,
  "reason": "Favor entrar no cadastro do usuário no Web Pedidos e adicionar o número do celular"
}
```

## 4. Validar Cliente por Código BI

Nome:
- `Validar Cliente por Código BI`

Finalidade:
- Validar CNPJ + codigo cliente via Power BI API.

Power BI:
- Workspace: `93668e0d-442e-40c2-800c-7bdb1a8a0f50`
- Dataset: `5bf9c59d-3a27-464d-8143-42d6fd6cbc43`

Tabelas usadas:
- `Autenticacao` ou tabela equivalente no modelo com:
  - `COD_CLIENTE`
  - `RAZAO_SOCIAL`
  - `NOME_FANTASIA`
  - `CNPJ`
  - `TELEFONE`

Retorno valido:

```json
{
  "success": true,
  "matched": true,
  "tenant": "lentes-gradual",
  "cnpj": "27679277000149",
  "customerCode": "1351",
  "source": "bi_autenticacao",
  "customerName": "OTICA MADEIRO - RONDONOPOLIS",
  "companyName": "IRALENE FERREIRA COREZOMAE - ME",
  "registeredPhone": "66 - 3421-6221"
}
```

Retorno invalido:

```json
{
  "success": true,
  "matched": false,
  "tenant": "lentes-gradual",
  "cnpj": "27679277000149",
  "customerCode": "1350",
  "source": "bi_autenticacao",
  "reason": "Código do cliente não confere com o CNPJ informado"
}
```

## 5. Fluxo do Agente

Nome:
- `Fluxo do Agente`

Finalidade:
- Receber mensagem de usuario autenticado.
- Classificar intencao.
- Validar escopo permitido.
- Chamar subagentes/ferramentas de:
  - pedidos;
  - boletos;
  - precos.

Nodes atuais:
1. `When Executed by Another Workflow`
2. `Code - Preparar contexto agente`
3. `AI Agent1` (classificador de intencao)
4. `Code - Normalizar Intenção`
5. `Switch - Intenção`
6. Ramo Pedido
7. Ramo Preço
8. Ramo Boleto
9. Ramo Outro

### Code - Preparar contexto agente

Modelo:

```javascript
const entrada = $json;

let session = entrada.session || {};
if (typeof session === 'string') {
  try {
    session = JSON.parse(session);
  } catch {
    session = {};
  }
}

return [
  {
    json: {
      ...entrada,
      tenant: entrada.tenant || session.tenant || 'lentes-gradual',
      mensagem: String(entrada.mensagem || entrada.chatInput || '').trim(),
      chatId: entrada.chatId || entrada.sessionId || '',
      redisKey: entrada.redisKey || '',
      session,
      cnpj: entrada.cnpj || session.cnpj || '',
      customerCode:
        entrada.customerCode ||
        session.customerCode ||
        session.codigoClienteInformado ||
        ''
    }
  }
];
```

### AI Agent1 - Classificador de intencao

System message recomendada:

```text
Voce e um classificador de intencao para atendimento automatizado da GS Gestao.

Sua unica funcao e analisar a mensagem do cliente e retornar SOMENTE JSON valido.

Nao explique. Nao converse. Nao use markdown.

Intencoes possiveis:

1. pedido
Use quando o cliente quer consultar pedido, status, entrega, previsao, atraso, producao, celula atual, roteiro, romaneio, rastreio ou conclusao de pedido.

2. boleto
Use quando o cliente quer consultar boletos, financeiro, vencimentos, cobrancas, contas em aberto, segunda via, pagamento ou PDF de boleto.

3. preco
Use quando o cliente quer consultar preco, valor, tabela, desconto, produto, lente, orcamento, laboratorio, preco laboratorio, produtos com desconto ou quanto custa.

4. outro
Use para saudacoes, duvidas gerais ou mensagens que nao pedem pedido, boleto ou preco.

Regras especiais:
- Se a mensagem mencionar preco, desconto, produto ou lente, a intencao deve ser preco.
- Se a mensagem mencionar boleto ou financeiro, a intencao deve ser boleto.
- Se a mensagem mencionar pedido, status ou entrega, a intencao deve ser pedido.
- Se a mensagem mencionar "codigo do cliente" ou "meu codigo" dentro de uma conversa de preco, mantenha intencao preco.

Para preco:
- Se o cliente mencionar um produto especifico, preencha termoProduto exatamente com o termo citado.
- Exemplos:
  "preco de AR CLEAN" => termoProduto: "AR CLEAN"
  "tenho desconto em PREMIERE HD" => termoProduto: "PREMIERE HD"
  "quanto custa ANTIRREFLEXO BLUE" => termoProduto: "ANTIRREFLEXO BLUE"
- Se o cliente perguntar genericamente quais produtos tem desconto, use tipoConsultaPreco: "listar_descontos".
- Se mencionar produto especifico, use tipoConsultaPreco: "consultar_produto".

Retorne exatamente neste formato:
{
  "intencao": "pedido|boleto|preco|outro",
  "pedidoId": null,
  "termoProduto": null,
  "codigoClienteInformado": null,
  "tipoConsultaPreco": "consultar_produto|listar_descontos|null",
  "confidence": 0.0
}
```

### Code - Normalizar Intenção

Usado para limpar JSON do agente e aplicar fallback por regex.

```javascript
const contexto = $('Code - Preparar contexto agente').first().json;
const raw = $json.output || $json.text || $json.response || '{}';

let parsed;

try {
  parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
} catch {
  const cleaned = String(raw)
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {};
  }
}

const mensagemOriginal = String(contexto.mensagem || '');
const mensagem = mensagemOriginal.toLowerCase();

const falaDePreco =
  /pre[cç]o|valor|quanto custa|tabela|desconto|produto|lente|or[cç]amento|laborat[oó]rio|clean|blue|premiere|antirreflexo/i.test(mensagemOriginal);

const falaDeBoleto =
  /boleto|financeiro|vencimento|cobran[cç]a|pagamento|conta em aberto|segunda via|pdf/i.test(mensagemOriginal);

const falaDePedido =
  /pedido|status|entrega|previs[aã]o|atraso|produ[cç][aã]o|romaneio|roteiro|rastreio/i.test(mensagemOriginal);

const falaCodigoCliente =
  /meu c[oó]digo|c[oó]digo do cliente|c[oó]digo da empresa|c[oó]digo cadastrado/i.test(mensagemOriginal);

let intencao = String(parsed.intencao || '').toLowerCase();

if (falaDePreco) intencao = 'preco';
if (falaDeBoleto) intencao = 'boleto';
if (falaDePedido && !falaDePreco && !falaDeBoleto && !falaCodigoCliente) intencao = 'pedido';
if (falaCodigoCliente && intencao === 'pedido') intencao = 'preco';

if (!['pedido', 'boleto', 'preco', 'outro'].includes(intencao)) {
  intencao = 'outro';
}

let pedidoId = parsed.pedidoId ? String(parsed.pedidoId).replace(/\D/g, '') : null;
let codigoClienteInformado = parsed.codigoClienteInformado
  ? String(parsed.codigoClienteInformado).replace(/\D/g, '')
  : null;

if (falaCodigoCliente && !codigoClienteInformado) {
  const match = mensagem.match(/\d{2,}/);
  codigoClienteInformado = match ? match[0] : null;
}

if (intencao !== 'pedido') {
  pedidoId = null;
}

let termoProduto = parsed.termoProduto || null;

if (intencao === 'preco' && !termoProduto) {
  const m = mensagemOriginal.match(/(?:pre[cç]o|valor|quanto custa|desconto|produto|lente|consultar|procurar|buscar|checar|verificar)(?:\s+de|\s+do|\s+da|\s+em|\s+no|\s+na|\s+algum|\s+alguma)?\s+(.+)/i);
  if (m && m[1]) {
    termoProduto = m[1]
      .replace(/\?+$/g, '')
      .replace(/se tenho desconto/gi, '')
      .replace(/tenho desconto/gi, '')
      .trim();
  }
}

let tipoConsultaPreco =
  parsed.tipoConsultaPreco ||
  (/desconto|tenho desconto|produtos com desconto|minhas tabelas|tabelas de desconto/i.test(mensagemOriginal) && !termoProduto
    ? 'listar_descontos'
    : 'consultar_produto');

return [
  {
    json: {
      ...contexto,
      output: raw,
      intencao,
      pedidoId,
      termoProduto,
      codigoClienteInformado,
      tipoConsultaPreco,
      classificacao: {
        intencao,
        pedidoId,
        termoProduto,
        codigoClienteInformado,
        tipoConsultaPreco,
        confidence: Number(parsed.confidence || 0)
      }
    }
  }
];
```

## 6. Subagente Boletos

Nome:
- `Subagente Boletos`

Status:
- Funcionando.

Objetivo:
- Responder consultas financeiras/boletos de cliente autenticado.
- Usa ferramenta `consultar_boletos_financeiro`.

Tool HTTP correta:

```http
POST https://labapi.gsgestao.com.br/api/finance/receber/open
```

Nunca usar GET nesse endpoint.

Body:

```json
{
  "celular": "5566996039777",
  "cnpjOtica": "27.679.277/0001-49"
}
```

Resposta real:

```text
Foram encontrados 3 boletos em aberto para consulta:

1. Código Receber: 000181145
   Vencimento: 15/06/2026
   Valor: R$ 10.976,66

2. Código Receber: 000182229
   Vencimento: 19/06/2026
   Valor: R$ 1.783,78

3. Código Receber: 000183214
   Vencimento: 26/06/2026
   Valor: R$ 2.746,44
```

## 7. Subagente Preços Gradual

Nome:
- `Subagente Preços Gradual`

Objetivo:
- Consultar precos e descontos no Power BI.
- Se produto especifico: buscar na coluna `PRODUTO`.
- Se pergunta generica: listar produtos com desconto.

Tool:
- `Tool de consulta de preços`

Problema atual resolvido/parcial:
- IA enviava `termoProduto`, mas o HTTP Request do token apagava dados anteriores.
- Solucao: adicionar node entre token e DAX.

### Node obrigatorio: Code - Mesclar token com parâmetros

Posicao:

```text
Code - Preparar parâmetros
→ HTTP Request - Obter token Power BI
→ Code - Mesclar token com parâmetros
→ Code - Montar DAX preço
→ HTTP Request - Executar query Power BI
```

Codigo:

```javascript
const parametros = $('Code - Preparar parâmetros').first().json;
const token = $json;

return [
  {
    json: {
      ...parametros,
      access_token:
        token.access_token ||
        token.accessToken ||
        token.token ||
        null,
      token_type:
        token.token_type ||
        token.tokenType ||
        'Bearer',
      expires_in:
        token.expires_in ||
        token.expiresIn ||
        null,
      tokenRaw: token
    }
  }
];
```

No HTTP Request de query:

```n8n
Authorization: Bearer {{$json.access_token}}
```

### Inputs da tool no Subagente Preços

No node `Call 'Tool de consulta de preços'`:

Campos fixos:

```n8n
tenant = {{ $json.tenant || $json.session?.tenant || 'lentes-gradual' }}
cnpj = {{ $json.cnpj || $json.session?.cnpj || '' }}
customerCode = {{ $json.customerCode || $json.session?.customerCode || $json.session?.codigoClienteInformado || '' }}
Session = {{ JSON.stringify($json.session || {}) }}
```

Campos definidos pela IA:

`termoProduto`:

```n8n
{{ $fromAI('termoProduto', 'Nome, código ou descrição do produto citado pelo cliente. Exemplos: AR CLEAN, PREMIERE HD, ANTIRREFLEXO BLUE.', 'string') }}
```

`tipoConsultaPreco`:

```n8n
{{ $fromAI('tipoConsultaPreco', 'Use consultar_produto para produto específico ou listar_descontos para lista geral de descontos.', 'string') }}
```

Descricao da ferramenta:

```text
Consulta preços e descontos no Power BI da Lentes Gradual.

Use esta ferramenta sempre que o cliente pedir preço, valor, desconto, orçamento, tabela ou produtos com desconto.

Se o cliente mencionar um produto específico, você deve chamar esta ferramenta com:
tipoConsultaPreco = "consultar_produto"
termoProduto = exatamente o produto citado pelo cliente.

Exemplos:
Cliente: "quanto custa AR CLEAN?"
termoProduto: "AR CLEAN"

Cliente: "tenho desconto em PREMIERE HD?"
termoProduto: "PREMIERE HD"

Cliente: "procura ANTIRREFLEXO BLUE"
termoProduto: "ANTIRREFLEXO BLUE"

Se o cliente perguntar genericamente quais produtos ele tem desconto, sem citar produto específico, use:
tipoConsultaPreco = "listar_descontos"

Nunca chame esta ferramenta com termoProduto vazio quando tipoConsultaPreco for "consultar_produto".
```

### Prompt rigido do Subagente Preços

```text
Voce e um subagente de consulta de precos da GS Gestao para laboratorios opticos.

Sua funcao e consultar precos, descontos e produtos com desconto para clientes ja autenticados.

REGRA PRINCIPAL:
Sempre que o cliente mencionar qualquer nome, marca, linha, descricao parcial ou codigo de produto, voce deve chamar a ferramenta de consulta de precos antes de responder.

E proibido pedir mais detalhes antes de consultar a ferramenta quando ja existe algum termo de produto na mensagem.

Exemplos de termos suficientes:
- AR CLEAN
- PREMIERE HD
- ANTIRREFLEXO BLUE
- CHILLI VISION
- POLI
- LENTE PRONTA
- BLUE
- FREE FORM
- NK+025-200

REGRA DE TERMO PRODUTO:
O campo termoProduto deve ser preenchido exatamente com o produto citado pelo cliente.

Exemplos:
"procura preço de AR CLEAN" => termoProduto = "AR CLEAN"
"tenho desconto em PREMIERE HD?" => termoProduto = "PREMIERE HD"
"quanto custa ANTIRREFLEXO BLUE?" => termoProduto = "ANTIRREFLEXO BLUE"

Nunca chame a ferramenta com termoProduto vazio se tipoConsultaPreco for consultar_produto.

REGRA DE BUSCA:
A ferramenta busca o termo informado na coluna PRODUTO.
Voce so pode apresentar produtos cujo nome tenha relacao direta com o termo pesquisado.

Se o cliente informou "AR CLEAN", apresente somente produtos que contenham AR CLEAN ou todas as palavras principais AR e CLEAN.
Se o cliente informou "PREMIERE HD", apresente somente produtos que contenham PREMIERE e HD.

Nao misture produtos de outra linha.
Nao apresente produtos apenas porque tem desconto se eles nao tem relacao com o termo pesquisado.

TIPOS DE CONSULTA:

1. consultar_produto
Use quando o cliente mencionar um produto especifico, marca, linha, descricao parcial ou codigo.
Passe:
- tipoConsultaPreco = consultar_produto
- termoProduto = termo citado pelo cliente

2. listar_descontos
Use somente quando o cliente perguntar genericamente:
- quais produtos tenho desconto?
- quais sao meus descontos?
- quais produtos entram na minha tabela?
Sem citar produto especifico.

Se o cliente perguntar "tenho desconto em AR CLEAN?", isso e consultar_produto, nao listar_descontos.

COMO RESPONDER:

Se a ferramenta retornar 1 produto:
- codigo;
- nome;
- preco laboratorio;
- percentual de desconto, se houver;
- preco final com desconto, se houver.

Se retornar varios produtos:
Liste de 5 a 10 opcoes:
1. codigo - nome - preco laboratorio - desconto se houver
Depois pergunte qual opcao o cliente quer consultar em detalhe.

Se produto existir sem desconto:
Informe o preco laboratorio e diga que nao foi encontrado desconto especifico para esse produto.

Se nao encontrar nada:
Peça outro nome, codigo ou descricao.

Formato:
- Portugues do Brasil.
- Direto e educado.
- Valores como R$ 1.234,56.
- Percentuais como 10% ou 12,5%.
- Nao exponha nomes de tabelas, DAX, Power BI, API ou banco.
- Nao finalize toda resposta com "posso ajudar em mais alguma coisa?".
```

## 8. Tool de consulta de preços

Nome:
- `Tool de consulta de preços`

Nodes:
1. `When Executed by Another Workflow`
2. `Code - Preparar parâmetros`
3. `HTTP Request - Obter token Power BI`
4. `Code - Mesclar token com parâmetros`
5. `Code - Montar DAX preço`
6. `HTTP Request - Executar query Power BI`
7. `Code - Normalizar retorno preço`

Modelo Power BI:
- Usa `PRECO_LABORATORIO`.
- Nunca usar `PRECO_ATACADO`, pois foi decidido trocar para preco laboratorio.

Tabelas:
- `CADASTRO DE CLIENTES`
- `CLIENTES COM TABELA DE NEGOCIAÇÕES`
- `TABELA DE DESCONTOS NEGOCIADOS`
- `TABELA DE PREÇOS DE PRODUTOS`

Colunas importantes:
- `CADASTRO DE CLIENTES[CNPJ ou CPF]`
- `CADASTRO DE CLIENTES[CODIGO DO CLIENTE]`
- `CLIENTES COM TABELA DE NEGOCIAÇÕES[CODIGO DO CLIENTE]`
- `CLIENTES COM TABELA DE NEGOCIAÇÕES[CODIGO DA TABELA]`
- `TABELA DE DESCONTOS NEGOCIADOS[CODIGO DA TABELA]`
- `TABELA DE DESCONTOS NEGOCIADOS[PROCODIGO]`
- `TABELA DE DESCONTOS NEGOCIADOS[PERCENTUAL DESCONTO]`
- `TABELA DE PREÇOS DE PRODUTOS[PROCODIGO]`
- `TABELA DE PREÇOS DE PRODUTOS[PRODUTO]`
- `TABELA DE PREÇOS DE PRODUTOS[PRECO_LABORATORIO]`
- `TABELA DE PREÇOS DE PRODUTOS[DESCRIÇÃO DA MARCA]`
- `TABELA DE PREÇOS DE PRODUTOS[LINHA]`

### Code - Preparar parâmetros

```javascript
const entrada = $json;

let session = entrada.Session || entrada.session || {};
if (typeof session === 'string') {
  try {
    session = JSON.parse(session);
  } catch {
    session = {};
  }
}

const tenant = entrada.tenant || session.tenant || 'lentes-gradual';
const cnpj = String(entrada.cnpj || session.cnpj || '').replace(/\D/g, '');
const customerCode = String(
  entrada.customerCode ||
  session.customerCode ||
  session.codigoClienteInformado ||
  ''
).replace(/\D/g, '');

const tipoConsultaPreco =
  entrada.tipoConsultaPreco ||
  entrada.tipo ||
  'consultar_produto';

const mensagem = String(entrada.mensagem || entrada.message || '').trim();

let termoProduto = String(
  entrada.termoProduto ||
  entrada.produto ||
  entrada.termo ||
  ''
).trim();

if (!termoProduto && tipoConsultaPreco === 'consultar_produto' && mensagem) {
  termoProduto = mensagem
    .replace(/procure pra mim/gi, '')
    .replace(/procura pra mim/gi, '')
    .replace(/busca pra mim/gi, '')
    .replace(/busque pra mim/gi, '')
    .replace(/quero saber/gi, '')
    .replace(/quero/gi, '')
    .replace(/consultar/gi, '')
    .replace(/verificar/gi, '')
    .replace(/checar/gi, '')
    .replace(/pre[cç]os?/gi, '')
    .replace(/valor/gi, '')
    .replace(/quanto custa/gi, '')
    .replace(/se tenho desconto/gi, '')
    .replace(/tenho desconto/gi, '')
    .replace(/desconto/gi, '')
    .replace(/produtos?/gi, '')
    .replace(/em algum/gi, '')
    .replace(/em alguma/gi, '')
    .replace(/em um/gi, '')
    .replace(/em uma/gi, '')
    .replace(/em/gi, '')
    .replace(/\?/g, '')
    .trim();
}

return [
  {
    json: {
      ...entrada,
      tenant,
      cnpj,
      customerCode,
      termoProduto: termoProduto.toUpperCase(),
      Session: JSON.stringify(session),
      tipoConsultaPreco,
      mensagem,
      buscarPor: customerCode ? 'codigo_cliente' : 'cnpj'
    }
  }
];
```

### Code - Mesclar token com parâmetros

```javascript
const parametros = $('Code - Preparar parâmetros').first().json;
const token = $json;

return [
  {
    json: {
      ...parametros,
      access_token:
        token.access_token ||
        token.accessToken ||
        token.token ||
        null,
      token_type:
        token.token_type ||
        token.tokenType ||
        'Bearer',
      expires_in:
        token.expires_in ||
        token.expiresIn ||
        null,
      tokenRaw: token
    }
  }
];
```

### Code - Montar DAX preço

Usar a versao mais recente ja fornecida no chat. Regras principais:
- Se `consultar_produto`, `termoProduto` e obrigatorio.
- Separar tokens do produto.
- Filtrar `TABELA DE PREÇOS DE PRODUTOS[PRODUTO]` com `CONTAINSSTRING` para todos os tokens.
- Buscar cliente por `customerCode`; se nao houver, buscar por CNPJ.
- Retornar `PRECO_LABORATORIO`.
- Retornar desconto se houver; se nao houver, retornar produto com preco sem desconto.

## Pendencias n8n

1. Corrigir de vez envio de `termoProduto` para a Tool de Preços.
2. Garantir `Code - Mesclar token com parâmetros` antes do DAX.
3. Ajustar DAX para nao retornar produtos fora do termo pesquisado.
4. Melhorar `Code - Normalizar retorno preço` para filtrar novamente resultados incompatíveis.
5. Substituir mocks de pedido/preco por ferramentas reais.
6. Criar tool de gerar PDF boleto e integrar `gs-temp-files`.
7. Integrar Evolution API no lugar do Chat Trigger.
8. Garantir que respostas finais do subworkflow voltem no formato:

```json
{
  "responseText": "mensagem para o cliente",
  "handledIntent": "preco|boleto|pedido|outro"
}
```

