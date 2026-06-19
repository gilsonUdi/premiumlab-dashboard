# Prompt de Contexto - Power BI / Deneb / Modelos BI GS

Voce esta assumindo continuidade de ajustes em modelos Power BI da GS Gestao e integracoes com o portal/n8n. Trate este prompt como contexto oficial.

## Uso do Power BI no ecossistema

O Power BI e usado em quatro frentes:

1. Portal GS:
   - embed de modelos por empresa;
   - filtros por usuario;
   - RLS/effective identity;
   - telas de modelos BI.

2. Autenticacao de clientes no n8n:
   - validar CNPJ + codigo cliente.

3. Consulta de precos no n8n:
   - buscar preco laboratorio;
   - buscar tabelas de desconto do cliente;
   - calcular desconto por produto.

4. Visuais Deneb:
   - custom visuals especificos quando necessario.

## Power BI embed no portal

Pontos ja tratados:
- Sidebar e botao tela cheia.
- Ajustes mobile.
- Ao sair de um BI embed clicando na seta, deve voltar para a tela de modelos, nao para o portal da empresa.
- Ao trocar de pagina rapido enquanto carrega, havia bug de paginas alternando infinitamente.
- Mobile:
  - retrato deve usar layout mobile;
  - paisagem deve usar layout web;
  - barra inferior no mobile deve se adaptar a barra do navegador;
  - botao de tela cheia deve sumir no mobile.

Problemas conhecidos:
- Alguns modelos com RLS exigem effective identity e roles.
- Se RLS/effective identity estiver mal configurado, embed pode dar erro.

## Filtros Power BI por usuario

Problema:
- Quando mais de um filtro era configurado para usuario, o modelo trazia branco.

Contexto:
- Exemplo Gradual Mato Grosso:
  - Tabela: `Cad_Clientes`
  - Coluna: `ESTADO`
  - Valores: `MT`, `RO`
- Usuario queria que multiplos filtros funcionassem.

Cuidados:
- Filtros na mesma tabela/coluna com valores diferentes devem ser OR/IN, nao AND impossivel.
- Filtros de colunas/tabelas diferentes podem ser AND.
- No embed, revisar construcao dos filtros BasicFilter/AdvancedFilter.

## Modelo Power BI para autenticacao

Workspace:

```text
93668e0d-442e-40c2-800c-7bdb1a8a0f50
```

Dataset:

```text
5bf9c59d-3a27-464d-8143-42d6fd6cbc43
```

Campos usados na autenticacao:
- `COD_CLIENTE`
- `RAZAO_SOCIAL`
- `NOME_FANTASIA`
- `CNPJ`
- `TELEFONE`

Exemplo de retorno:

```json
{
  "[COD_CLIENTE]": 1351,
  "[RAZAO_SOCIAL]": "IRALENE FERREIRA COREZOMAE - ME",
  "[NOME_FANTASIA]": "OTICA MADEIRO - RONDONOPOLIS",
  "[CNPJ]": "27.679.277/0001-49",
  "[TELEFONE]": "66 - 3421-6221"
}
```

Regra:
- Cliente se autentica com CNPJ obrigatorio.
- Se usar codigo cliente, validar que CNPJ e codigo batem.
- Se bater:
  - liberar pedidos e precos;
  - boleto depende de confirmar telefone cadastrado ou informar telefone atual.

## Modelo Power BI de precos

Logica definida pelo usuario:

Tabela `Cadastro de clientes`:
- contem identificacao de clientes;
- codigo;
- CNPJ;
- razao social;
- nome fantasia.

Tabela `Clientes com tabela de negociações`:
- informa quais tabelas de desconto o cliente possui;
- codigo da tabela;
- codigo do cliente.

Tabela `Tabela de descontos negociados`:
- codigo da tabela;
- codigo do produto;
- percentual de desconto daquele produto naquela tabela.

Tabela `Tabela de preços de produtos`:
- codigo do produto;
- nome do produto;
- preco.

Decisao importante:
- Usar `PRECO_LABORATORIO`, nao `PRECO_ATACADO`.

Colunas usadas:

`CADASTRO DE CLIENTES`
- `CODIGO DO CLIENTE`
- `CNPJ ou CPF`
- `RAZÃO SOCIAL`
- `NOME FANTASIA`
- `CLICLIENTE`

`CLIENTES COM TABELA DE NEGOCIAÇÕES`
- `CODIGO DO CLIENTE`
- `CODIGO DA TABELA`
- `DESCRIÇÃO DA TABELA DE DESCONTOS`
- `DATA_CADASTRO`
- `TBPDESC`
- `TBPDESC2`
- `TBPDESCFECH`

`TABELA DE DESCONTOS NEGOCIADOS`
- `CODIGO DA TABELA`
- `PROCODIGO`
- `PERCENTUAL DESCONTO`
- `TBPSITUACAO`

`TABELA DE PREÇOS DE PRODUTOS`
- `PROCODIGO`
- `PRODUTO`
- `PRECO_ATACADO`
- `PRECO_LABORATORIO`
- `DESCRIÇÃO DA MARCA`
- `COD_MARCA`
- `LINHA`
- `NGRUPO`

## Regras de consulta de precos

1. Se cliente pergunta preco de produto especifico:
   - buscar na coluna `PRODUTO`;
   - o produto retornado precisa conter as palavras principais do termo pesquisado;
   - exemplo: `AR CLEAN` precisa conter `AR` e `CLEAN`;
   - exemplo: `PREMIERE HD` precisa conter `PREMIERE` e `HD`.

2. Se cliente pergunta se tem desconto em produto especifico:
   - tambem e consulta de produto;
   - nao e listagem geral de descontos.

3. Se produto existe e tem desconto:
   - mostrar preco laboratorio;
   - mostrar percentual;
   - mostrar preco final com desconto.

4. Se produto existe mas nao tem desconto:
   - mostrar preco laboratorio;
   - informar que nao foi localizado desconto especifico para aquele produto.

5. Se cliente pergunta genericamente “quais produtos tenho desconto?”:
   - identificar cliente por `customerCode`;
   - se nao tiver customerCode, identificar por CNPJ;
   - buscar tabelas de desconto do cliente;
   - buscar produtos com desconto nessas tabelas;
   - listar opcoes com codigo, produto e percentual.

6. Se retorna muitas opcoes:
   - listar 5 a 10;
   - pedir para cliente escolher uma opcao/codigo para detalhar.

## Problema atual na consulta de precos

Historico de problemas:
- A IA classificava preco como pedido.
- Depois passou a classificar preco corretamente.
- A tool de precos era chamada sem `termoProduto`.
- Foi descoberto que `termoProduto` existia antes, mas sumia no node `HTTP Request - Obter token Power BI`.
- Causa: HTTP Request de token substitui o item de entrada pela resposta do token.
- Solucao: adicionar `Code - Mesclar token com parâmetros` logo depois do token.

Outro problema:
- Para `AR CLEAN`, retornou produtos como `ABSOLUTTO HD INDEX...`, que nao tinham relacao direta.
- Regra corrigida:
  - DAX precisa filtrar `TABELA DE PREÇOS DE PRODUTOS[PRODUTO]`;
  - usar tokens do termo em `CONTAINSSTRING`;
  - nao listar produtos apenas por terem desconto.

## DAX via Power BI API

Endpoint:

```http
POST https://api.powerbi.com/v1.0/myorg/groups/{workspaceId}/datasets/{datasetId}/executeQueries
```

Header:

```http
Authorization: Bearer {{$json.access_token}}
Content-Type: application/json
```

Body:

```json
{
  "queries": [
    {
      "query": "EVALUATE ..."
    }
  ],
  "serializerSettings": {
    "includeNulls": true
  }
}
```

Erro comum:
- Se usar `Using Fields Below` e colocar objeto em campo `queries`, o Power BI recebe string errada.
- Preferir `Specify Body: Using JSON`
- JSON:

```n8n
{{$json.executeQueryBody}}
```

Erro 403:
- Pode ser credential/app sem permissao no workspace/dataset, token errado, dataset sem permissao Build, ou endpoint/dataset incorreto.
- Em execucoes anteriores a API funcionou com o app de embed.

## Deneb

Contexto:
- Usuario mencionou criar visuais Deneb para Power BI.
- Ainda nao foi detalhado neste trecho.
- Se outro chat for mexer com Deneb:
  - manter padrao visual executivo;
  - evitar visual exagerado;
  - focar legibilidade;
  - documentar medidas DAX usadas;
  - nao quebrar filtros/relacionamentos existentes.

Possiveis diretrizes para Deneb:
- Usar Vega/Vega-Lite.
- Sempre validar:
  - responsividade;
  - legibilidade de rotulos;
  - cores coerentes com dashboard;
  - tooltips uteis;
  - ordenacao correta;
  - comportamento com filtros vazios.

## Proximos passos Power BI / Precos

1. Garantir que token Power BI nao apaga parametros.
2. Confirmar que DAX usa `PRECO_LABORATORIO`.
3. Confirmar filtro por `PRODUTO` com todas as palavras principais.
4. Normalizar retorno para remover produto incompatível mesmo se DAX trouxer.
5. Testar:
   - `AR CLEAN`
   - `PREMIERE HD`
   - `ANTIRREFLEXO BLUE`
   - listagem geral de descontos
   - produto sem desconto
6. Ajustar resposta do agente para listar opcoes reais e pedir escolha.
7. Se necessario, criar medidas auxiliares no modelo para facilitar query.

