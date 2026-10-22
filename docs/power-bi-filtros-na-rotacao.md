# Preservação dos filtros ao girar o celular

## Correção de 22/10/2026

O portal usa `MobilePortrait` na vertical e `Master` na horizontal, mantendo
o iframe. A troca de renderer não tinha uma etapa de preservação das seleções.

`createReportLayoutUpdater`, em `lib/power-bi-viewport.mjs`, agora captura
o estado com `report.bookmarksManager.capture({ allPages: true })` antes de uma
mudança de layout na mesma página/instância e o reaplica com `applyState` depois
de `updateSettings`. Isso abrange filtros, segmentações e estado dos visuais,
em vez de usar apenas `getFilters`, que não cobre as segmentações visuais.

O estado existe somente em memória durante a transição. Não é salvo em
localStorage, sessionStorage, Firestore ou logs. O diagnóstico registra apenas
o tipo de layout e as etapas `layout_state_captured`, `layout_state_restored`,
`layout_state_capture_failed` e `layout_state_restore_failed`.

A captura não ocorre em redimensionamentos sem mudança de layout, na primeira
carga ou na troca de página. Há verificações de instância e revisão de página
depois das operações assíncronas, para não restaurar uma página que o usuário
já deixou. A fila de atualizações e sua deduplicação continuam ativas para
evitar ciclos causados pelos eventos `rendered` da restauração.

Falhas do SDK são registradas sem impedir a troca de layout; nesses casos,
a preservação não pode ser garantida. Não foi feita uma validação física em
iPhone nesta alteração.

## Validação

```powershell
node --test scripts/tests/*.test.mjs
npm run build
```

`power-bi-rotation-state.test.mjs` simula a perda das seleções no
`updateSettings` e verifica a restauração nos dois sentidos, páginas/instâncias
alteradas enquanto a captura está pendente, falhas do SDK e eventos de render.

Depois da implantação, validar no aparelho:

1. Abrir uma página do BI na vertical e selecionar filtros de cliente,
   representante e período.
2. Girar para a horizontal e conferir seleções e valores dos indicadores.
3. Alterar um filtro na horizontal e voltar à vertical.
4. Trocar páginas e repetir; conferir que a página escolhida não é revertida.
5. No diagnóstico, conferir `layout_state_captured` e
   `layout_state_restored`, sem novas entradas `sdk_instance` na rotação.

Referência da API de captura/restauração:
[Microsoft Learn — Report bookmarks](https://learn.microsoft.com/en-us/javascript/api/overview/powerbi/report-bookmarks).
