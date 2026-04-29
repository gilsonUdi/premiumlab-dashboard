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

## Atualizacao automatica a cada 5 minutos

O fluxo automatico fica configurado para:

- rodar a cada 5 minutos;
- sincronizar apenas as tabelas com coluna de data;
- incluir `PDPRD` e `PDSER` por vinculo com pedidos recentes;
- trazer somente os ultimos 3 dias dessas tabelas;
- inserir apenas registros novos, preservando o historico anterior no Supabase;
- nunca apagar a janela anterior nem sobrescrever registros ja existentes.

Para criar a tarefa do usuario no Agendador do Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-user-task.ps1
```

Se a politica do Windows bloquear tarefas agendadas, use `run-watch.bat` e deixe a janela aberta. Ele executa a sincronizacao em loop, respeitando `SYNC_INTERVAL_SECONDS`.

## Configuracao recomendada

```env
SYNC_RECENT_DAYS=3
SYNC_DATE_TABLES_ONLY=true
SYNC_INTERVAL_SECONDS=300
```

As tabelas monitoradas por data ficam em `SYNC_DATE_COLUMNS`.
As tabelas sem data propria, mas dependentes de pedidos recentes, ficam em `SYNC_LINKED_DATE_TABLES`.

## Carga completa inicial

Na primeira carga, vale executar todas as tabelas:

```powershell
$env:SYNC_RECENT_DAYS="0"
$env:SYNC_DATE_TABLES_ONLY="false"
node sync.js
Remove-Item Env:\SYNC_RECENT_DAYS
Remove-Item Env:\SYNC_DATE_TABLES_ONLY
```

Depois disso, deixe o automatico seguir so com a janela movel de 3 dias.

## Observacoes

- O Supabase precisa ter as tabelas ja criadas com os mesmos nomes em minusculo.
- Para PPS e Analise de Dados, as tabelas realmente necessarias sao: `CLIEN`, `FUNCIO`, `ALMOX`, `LOCALPED`, `USUARIO`, `REQUI`, `PEDID`, `PDPRD`, `PDSER` e `ACOPED`.
- As tabelas nao necessarias para esses dois modos sao: `BANCO`, `PRODU`, `CFOP`, `CIDADE`, `CCORR`, `PAGAR`, `RECEB`, `MOVIMENTACAO`, `PEDFINALIDADE`, `GRUPOCLI`, `GRUPOROTULOS`, `PEDFO`, `NOTAS`, `TBFIS`, `COMPOPROROT` e `REGRAPROMO`.
- Quando a tabela tiver chave primaria no Firebird, o script usa essa chave como conflito para ignorar duplicados no Supabase.
- O modo padrao agora e `insert-only`: se o registro ja existir, ele e ignorado e nao atualizado.
- Se o computador desligar, a sincronizacao pausa e volta quando a tarefa rodar novamente.
- Os logs ficam em `logs\sync.log`.
