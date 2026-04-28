# Firebird -> Upstash Sync

Sincronizador local para rodar no computador do cliente e enviar snapshots das tabelas do Firebird para o Upstash Redis.

## Instalar no PC do cliente

1. Copie esta pasta para o computador do cliente.
2. Instale Node.js 20 ou superior.
3. Abra o terminal dentro desta pasta e rode:

```powershell
npm install
```

4. Copie `.env.example` para `.env.local`.
5. Preencha Firebird e Upstash no `.env.local`.
6. Teste:

```powershell
npm run sync:dry
npm run sync
```

## Atualizacao automatica a cada 5 minutos

Sem permissao de administrador, tente criar a tarefa do usuario:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-user-task.ps1
```

Se a politica do Windows bloquear tarefas agendadas, use `run-watch.bat` e deixe a janela aberta. Ele executa a sincronizacao em loop, respeitando `SYNC_INTERVAL_SECONDS`.

## Formato das chaves no Upstash

Com `UPSTASH_KEY_PREFIX=premium:premium-lab`, cada tabela gera:

```text
premium:premium-lab:tables
premium:premium-lab:table:pedid:meta
premium:premium-lab:table:pedid:chunk:0
premium:premium-lab:table:pedid:chunk:1
premium:premium-lab:sync:last_run
premium:premium-lab:sync:last_summary
```

Os dados ficam em JSON. A tela do dashboard pode ler os `chunks` e montar os arrays em memoria.

## Sincronizacao recente sem apagar historico

Depois da primeira carga completa, use:

```env
SYNC_RECENT_DAYS=3
SYNC_MERGE_MODE=true
SYNC_DATE_TABLES_ONLY=true
SYNC_INDEX_COLUMNS=ACOPED:id_pedido,PDPRD:id_pedido,PDSER:id_pedido,REQUI:pdccodigo
```

Com esse modo, as tabelas com `SYNC_DATE_COLUMNS` buscam somente a janela recente, mas gravam no Upstash como `hash-merge`. Isso atualiza/insere registros pela chave primaria e nao apaga os dados antigos ja armazenados.

`SYNC_DATE_TABLES_ONLY=true` faz a rotina agendada processar somente tabelas com coluna de data. As tabelas base continuam armazenadas pela carga completa e podem ser atualizadas manualmente quando necessario.

Para fazer uma nova carga completa de todas as tabelas:

```powershell
$env:SYNC_RECENT_DAYS="0"
$env:SYNC_DATE_TABLES_ONLY="false"
node sync.js
Remove-Item Env:\SYNC_RECENT_DAYS
Remove-Item Env:\SYNC_DATE_TABLES_ONLY
```

As linhas sao divididas em buckets para evitar o limite de tamanho por chave do Upstash:

```env
SYNC_BUCKET_COUNT=64
```

Se uma tabela for muito grande, aumente para `128` ou `256`.

Se uma tabela nao tiver chave primaria, o script usa um hash do conteudo da linha como identificador. Funciona para preservar dados, mas a atualizacao fica melhor em tabelas com PK.

`SYNC_INDEX_COLUMNS` cria indices auxiliares para o dashboard buscar detalhes por pedido sem varrer tabelas grandes.

## Observacoes

- O Upstash armazena uma copia dos dados sincronizados.
- Se o computador desligar, a sincronizacao pausa e volta quando a tarefa rodar novamente.
- Para tabelas grandes, mantenha `SYNC_DATE_COLUMNS` e `SYNC_RECENT_DAYS` configurados para reduzir tempo, armazenamento e custo.
- Tabelas em modo snapshot substituem os chunks antigos; tabelas em modo merge preservam historico.
