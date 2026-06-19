# Prompt de Contexto - API GS Gestão / Gradual / Financeiro

Voce esta assumindo continuidade tecnica de uma API da GS Gestao usada no ecossistema de laboratorios opticos. Trate este prompt como contexto oficial.

## Visao Geral

A API atual serve como camada intermediaria para:
- consultar dados operacionais de pedidos da Lentes Gradual;
- alimentar cache no Supabase para dashboards;
- consultar financeiro/boletos de clientes;
- gerar PDF de boletos;
- futuramente atender agentes de IA no n8n/WhatsApp.

Regra arquitetural atual:
- Dashboard web nao deve consultar API em tempo real.
- API deve ser usada para ingestao/cache, ferramentas internas e automacoes.
- Portal/dashboard le Supabase como fonte fisica.
- O que muda por empresa e o modelo de interpretacao/alimentacao, nao a fonte fisica do dashboard.

## Ambientes e URLs

API antiga Render:
- Base URL historica: `https://gs-lab-api.onrender.com`
- Problema: cold start/inatividade, timeout, lentidao e instabilidade.
- Status: pode ser desligada apos migracao validada.

API nova EasyPanel/Hostinger VPS:
- Base URL atual: `https://labapi.gsgestao.com.br`
- API key mantida igual a historica usada no n8n.
- Foi testado no n8n e funcionando.

API Hostinger/EasyPanel antiga de testes:
- `https://gs-consultoria-gs-lab-api.6pwqgx.easypanel.host`
- Teve problemas de version unknown, rotas nao encontradas e timeouts.

API origem Gradual:
- Lentes Gradual: `http://168.75.79.226`
- Indio Lab: `http://177.135.73.212:8085`

## Credenciais e headers

Historicamente, a API da Gradual usa token em `accessToken`.
Em alguns fluxos o header `Authorization` usa token puro, sem `Bearer`, conforme comportamento observado.

Para a nossa API intermediaria:
- Header principal no n8n:
  - `Content-Type: application/json`
  - `x-api-key: <API_KEY_HISTORICA>`

Nao expor chaves em mensagens para cliente.

## Endpoints financeiros implementados

### Consultar recebiveis em aberto

Endpoint da nossa API:

```http
POST https://labapi.gsgestao.com.br/api/finance/receber/open
```

Headers:

```http
Content-Type: application/json
x-api-key: <API_KEY>
```

Body:

```json
{
  "celular": "5566996039777",
  "cnpjOtica": "27.679.277/0001-49"
}
```

Retorno validado:

```json
{
  "success": true,
  "count": 3,
  "items": [
    {
      "codigoReceber": "000181145",
      "empresa": 6,
      "vencimento": "2026-06-15",
      "valorAberto": "10976.66"
    }
  ]
}
```

Exemplo real validado:
- CNPJ: `27.679.277/0001-49`
- Telefone: `(66) 99603-9777`
- Normalizado: `5566996039777`
- Encontrou 3 boletos:
  - `000181145`, vencimento `2026-06-15`, valor `10976.66`
  - `000182229`, vencimento `2026-06-19`, valor `1783.78`
  - `000183214`, vencimento `2026-06-26`, valor `2746.44`

### Gerar PDF de boleto

A API tambem foi ajustada para chamada do endpoint original de boleto/PDF.
A ideia operacional:
- consultar boletos em aberto primeiro;
- cliente escolhe o boleto/codigoReceber;
- gerar PDF;
- salvar temporariamente no storage `gs-temp-files`;
- devolver link publico temporario;
- apagar arquivos depois de aproximadamente 10 dias.

Endpoint original recebido do fornecedor:

```bash
curl --location 'http://168.75.79.226/api/whatsapp/v1/boleto' \
--header 'Authorization: Authorization' \
--header 'Content-Type: application/json' \
--header 'urlRest: http://150.230.80.167' \
--data '{
  "celular": "55DDDCELULAR",
  "cnpjOtica": "XX.XXX.XXX/XXXX-XX",
  "empresa": X,
  "codigoReceber": "XXXXX"
}'
```

Se for continuar, conferir na API atual quais endpoints expostos foram criados para o PDF. O fluxo planejado e:
- n8n chama nossa API;
- nossa API chama endpoint original;
- nossa API salva PDF no storage temporario ou retorna binario/base64;
- n8n envia link ao cliente.

## Storage temporario gs-temp-files

Servico criado no EasyPanel:
- App: `gs-temp-files`
- Objetivo: salvar arquivos temporarios, especialmente PDFs de boleto.
- Health check validado:

```json
{
  "success": true,
  "service": "gs-temp-files",
  "time": "2026-06-18T13:14:23.505Z"
}
```

Problemas resolvidos:
- Build havia concluido, mas app nao iniciava corretamente.
- Logs mostraram `gs-temp-files listening on 80` e depois `listening on 3000`.
- O servico ficou respondendo corretamente no health.

Regras desejadas:
- Salvar boleto somente temporariamente.
- Expirar ou apagar arquivos com mais de 10 dias.
- Nomear arquivos com token/UUID, nao com CNPJ puro.
- Nao deixar listagem publica de diretorio.

## Sync API -> Supabase

Contexto:
- A API direta para dashboard foi abandonada por timeout/lentidao.
- A API alimenta tabelas cache no Supabase.
- Dashboard le Supabase.

Pastas de sync:
- `C:\Users\Windows 11\Desktop\gradual-api-supabase-sync`
- `C:\Users\Windows 11\Desktop\gradual-api-supabase-sync-render`
- Pasta usada para Kestra/sync automatico fica separada do Google Drive.

Motivo:
- `npm install` em Google Drive falhava com `TAR_ENTRY_ERROR`, `EBADF`, `EPERM`.
- Evitar rodar npm dentro do Drive.

Tabelas Supabase observadas:
- `gradual_cache_orders`
- `gradual_cache_items`
- `gradual_cache_events`
- `gradual_cache_runs`

Campos importantes do payload de pedidos:
- `customerId`
- `customerName`
- `sellerName` / `vendedorNome`
- `caixa`
- `currentCell`
- `datas.issueDate`
- `datas.deliveryDate`
- `datas.expeditionDate`
- `datas.closedDate`
- `routes[]`
- `tracking[]`
- `occurrences[]`
- `products[]`
- `hasLossEvent`
- `lossQuantity`

Observacoes importantes:
- `expeditionDate` representa data de expedicao/saida conforme retorno da API.
- Cancelados precisam ser excluidos de todos os calculos do dashboard.
- Codigo de cancelamento deve ser configuravel por empresa, nao fixo global.
- Gradual usa cancelamento por local/celula `43`, mas outras empresas podem usar outro codigo.

## Sync automatico no Kestra

Kestra self-hosted em Docker.
Problema inicial:
- Docker task runner sem acesso a `/var/run/docker.sock`.
- Corrigido montando Docker socket no compose.

Execucao:
- A cada 30 minutos.
- Usa imagem `node:22`.
- Roda `npm ci` e `npm run sync`.

Log real observado:
- Maior order_id no Supabase: `2991382`
- Cursor inicial: `2993382`
- Periodo enviado para API: `2020-01-01` ate `2030-12-31`
- PageSize: `200`
- ScanWindow: `1500`
- BlockSize: `8000`

Problemas:
- API origem e lenta e instavel.
- Varios timeouts em paginas.
- Em um momento parava perto do cursor `2987476`.
- Depois melhorou com retries, pageSize menor e modo reduzido.

Resumo Supabase apos carga:

```csv
tenant_slug,min_order_id,max_order_id,total_orders,min_issue_date,max_issue_date,last_synced_at
lentes-gradual,2914857,2993382,64679,2025-10-27,2026-06-02,2026-06-08 14:28:34.685+00
```

## Firebird direto / n8n

Foi testado node Firebird no n8n.
DSN observado:
- `GRADUAL_INTERNO_64`

Configuracao ODBC observada:
- Database: `146.235.33.208:REPLICA`
- Client: `C:\Windows\SysWOW64\fbclient.dll`
- Database Account: `CONSULTA`
- Dialect: 3
- Character Set: NONE

Campos Firebird descobertos:
- `PEDID.PEDCODIGO`
- `PEDID.PEDDTEMIS`
- `PEDID.PEDDTROMAN`
- `PEDID.PEDNRROMAN`
- `PEDID.PEDDTSAIDA`
- `PEDID.PEDHRSAIDA`

Query testada:

```sql
SELECT FIRST 100
    P.ID_PEDIDO,
    P.PEDCODIGO,
    P.PEDDTEMIS,
    P.PEDDTROMAN,
    P.PEDNRROMAN,
    P.PEDDTSAIDA,
    P.PEDHRSAIDA
FROM PEDID P
WHERE P.PEDDTEMIS >= CAST(? AS DATE)
  AND P.PEDDTEMIS < DATEADD(1 DAY TO CAST(? AS DATE))
ORDER BY P.PEDDTEMIS DESC, P.ID_PEDIDO DESC
```

Erro conhecido:
- Alguns nodes Firebird nao aceitavam parametros `?` corretamente e retornavam:
  `Expected parameters: (params=0 vs. expected=2)`

## Proximos passos API

1. Migrar definitivamente API Render para EasyPanel e desligar Render.
2. Garantir healthcheck e logs na VPS.
3. Confirmar endpoint final para PDF de boleto.
4. Integrar PDF com `gs-temp-files`.
5. Criar limpeza automatica de arquivos temporarios.
6. Documentar endpoints para n8n:
   - buscar boletos
   - gerar PDF boleto
   - consultar pedido
   - eventuais ferramentas auxiliares
7. Evitar expor API origem diretamente ao n8n sempre que nossa API puder encapsular regra/seguranca.

