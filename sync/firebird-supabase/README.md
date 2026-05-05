# Firebird -> Supabase Sync

Sincronizador local para rodar no computador do cliente e enviar as tabelas do Firebird para o Supabase.

## Instalar no PC do cliente

1. Copie esta pasta para o computador do cliente.
2. Instale Node.js 20.x LTS.
3. Abra o terminal dentro desta pasta e rode:

```powershell
npm install
```

Se estiver usando Node 24 ou 22, troque para Node 20 antes de continuar. O pacote `node-firebird` desta rotina fica estavel com Node 20 LTS.

4. Copie `.env.example` para `.env.local`.
5. Preencha Firebird e Supabase no `.env.local`.
6. Teste:

```powershell
npm run sync:dry
npm run sync
```

## Atualizacao automatica a cada 10 minutos

O fluxo automatico fica configurado para:

- rodar a cada 10 minutos;
- sincronizar apenas as tabelas com coluna de data;
- incluir `PDPRD` e `PDSER` por vinculo com pedidos recentes;
- incluir `JBXROTEIRO` por vinculo com a `ACOPED`;
- recalcular `pedido_roteiro_cache` no fim da sincronizacao para a coluna de roteiro do dashboard;
- trazer os ultimos 3 meses dessas tabelas;
- atualizar `JBXROTEIRO` por vinculo com a `ACOPED` usando a mesma janela de 3 meses;
- atualizar por upsert as tabelas mutaveis recentes para refletir mudancas operacionais.

Para criar a tarefa do usuario no Agendador do Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-user-task.ps1
```

Se a politica do Windows bloquear tarefas agendadas, use `run-watch.bat` e deixe a janela aberta. Ele executa a sincronizacao em loop, respeitando `SYNC_INTERVAL_SECONDS`.

## Configuracao recomendada

```env
SYNC_INCREMENTAL=true
SYNC_RECENT_DAYS=90
SYNC_DATE_TABLES_ONLY=true
SYNC_INTERVAL_SECONDS=600
```

As tabelas monitoradas por data ficam em `SYNC_DATE_COLUMNS`.
As tabelas sem data propria, mas dependentes de pedidos recentes, ficam em `SYNC_LINKED_DATE_TABLES`.
As tabelas sem data propria que precisam de refresh de janela ficam em `SYNC_REFRESH_LINKED_TABLES`.
As tabelas recentes que devem atualizar registros existentes ficam em `SYNC_UPSERT_TABLES`.

No caso da `JBXROTEIRO`, a automacao usa:

- `ID_PEDIDO` como chave de relacao;
- `ACOPED.APDATA` como relogio de recencia;
- janela propria de 90 dias, alinhada com o restante do automatico.

## Carga completa inicial

Na primeira carga, vale executar todas as tabelas:

```powershell
$env:SYNC_RECENT_DAYS="0"
$env:SYNC_DATE_TABLES_ONLY="false"
node sync.js
Remove-Item Env:\SYNC_RECENT_DAYS
Remove-Item Env:\SYNC_DATE_TABLES_ONLY
```

Depois disso, deixe o automatico seguir so com a janela movel de 3 meses.

## Refresh corretivo so da janela recente

Se precisar corrigir divergencia de dados sem apagar o historico antigo, voce pode
substituir apenas a janela recente de tabelas especificas.

Exemplo para recalcular perdas e vendas dos ultimos 30 dias:

```powershell
node sync.js --tables PEDID,PDPRD,PDSER --refresh-recent-days 30
```

Esse comando:

- apaga no Supabase apenas os registros dessas tabelas ligados aos ultimos 30 dias;
- recarrega a mesma janela a partir do Firebird;
- preserva tudo que for anterior a 30 dias.

## Observacoes

- O Supabase precisa ter as tabelas ja criadas com os mesmos nomes em minusculo.
- O sync cria automaticamente a tabela `pedido_roteiro_cache` no Supabase quando necessario.
- Para PPS e Analise de Dados, as tabelas realmente necessarias sao: `CLIEN`, `FUNCIO`, `ALMOX`, `LOCALPED`, `USUARIO`, `REQUI`, `PEDID`, `PDPRD`, `PDSER`, `ACOPED`, `PEDFINALIDADE` e `JBXROTEIRO`.
- As tabelas nao necessarias para esses dois modos sao: `BANCO`, `PRODU`, `CFOP`, `CIDADE`, `CCORR`, `PAGAR`, `RECEB`, `MOVIMENTACAO`, `GRUPOCLI`, `GRUPOROTULOS`, `PEDFO`, `NOTAS`, `TBFIS`, `COMPOPROROT` e `REGRAPROMO`.
- A tabela derivada `CLIENCRM` fica fora do automatico. Ela pode ser sincronizada manualmente quando voce quiser atualizar a visao de CRM.
- Quando a tabela tiver chave primaria no Firebird, o script usa essa chave como conflito para ignorar duplicados no Supabase.
- O modo padrao continua conservador, mas tabelas listadas em `SYNC_UPSERT_TABLES` usam upsert para atualizar registros recentes.
- Excecao: tabelas configuradas em `SYNC_REFRESH_LINKED_TABLES` ainda podem ser recarregadas por janela recente quando necessario.
- Se o computador desligar, a sincronizacao pausa e volta quando a tarefa rodar novamente.
- Os logs ficam em `logs\sync.log`.

## Sincronizar so a JBXROTEIRO

Para testar ou atualizar so essa tabela:

```powershell
node sync.js --table JBXROTEIRO
```

Nesse caso, o sync:

- busca apenas os registros de `JBXROTEIRO` ligados a pedidos com `ACOPED.APDATA` nos ultimos 90 dias;
- apaga no Supabase so essa mesma janela de `JBXROTEIRO`;
- reinsere os dados atualizados;
- preserva o historico mais antigo.

## Sincronizar a tabela derivada CLIENCRM

A `CLIENCRM` e uma tabela derivada montada por uma consulta agregada no Firebird.
Ela nao entra no automatico de 10 em 10 minutos.

Para atualizar so ela:

```powershell
node sync.js --table CLIENCRM
```

Esse comando:

- roda a consulta de CRM direto no Firebird;
- substitui completamente o conteudo de `cliencrm` no Supabase;
- nao mexe nas tabelas operacionais do dashboard.
