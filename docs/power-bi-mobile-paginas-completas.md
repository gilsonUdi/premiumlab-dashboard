# BI mobile: páginas completas e otimização somente no portal

Atualização: 22/10/2026.

## Decisão e escopo

O usuário confirmou melhora de desempenho com o modo em blocos, mas solicitou
restaurar as páginas originais completas. Não autoriza alterar o relatório para
otimizá-lo. Nenhum PBIX, visual, medida DAX, consulta, modelo, fonte, filtro de
acesso ou configuração de capacidade foi alterado nesta etapa.

O portal não enumera nem oculta visuais e não usa mais `CustomLayout`.
Foram removidos os controles Indicadores/Filtros e a paginação por blocos.
Voltam os layouts nativos: `MobilePortrait` na vertical e `Master` na horizontal.
A navegação inferior de páginas nas duas orientações, a interação permanente e
os controles de zoom exclusivos do BI na horizontal são preservados.

## Otimizações implementadas

1. **Primeiro desenho preparado no mobile.** Usa `powerbi.load`/`report.render`
   por meio de `phasedEmbedding`. Carrega metadados, espera área com dimensões
   positivas e aba visível, aplica o layout nativo atual e só então solicita a
   primeira renderização. Evita desenhar inicialmente a página em outro layout
   para trocá-lo logo depois. Não faz renderização progressiva de visuais nem
   reduz a quantidade de indicadores.
2. **Uma solicitação inicial de renderização por instância.** O controlador
   serializa solicitações; redimensionamento, orientação e retorno da aba não
   chamam novamente `report.render`. Instâncias substituídas/desmontadas não
   recebem comandos atrasados. Falhas são exibidas sem repetição automática.
3. **Menos redimensionamentos do iframe.** `ResizeObserver` publica a primeira
   área positiva imediatamente e agrupa as dimensões intermediárias seguintes
   em uma atualização após estabilização de 150 ms. Eventos de viewport com
   valores idênticos não atualizam o React. Orientação e dimensões do canvas
   usam a mesma medição: não combina a altura antiga de retrato com o cálculo
   de largura de paisagem, evitando um iframe temporariamente ampliado na rotação.
4. **SDK estável.** Configuração, callbacks e mapa de eventos permanecem estáveis;
   o componente do SDK é memoizado para não comparar configurações e reinstalar
   handlers a cada atualização de tamanho/zoom do portal. Renovação do token
   continua usando `setAccessToken`, sem recriar o embed.
5. **Menos efeitos de composição no mobile.** Remove desfoque de fundo e sombras
   das barras superior/inferior do portal nessa tela. Não modifica o canvas ou
   os efeitos dos gráficos dentro do iframe.
6. **Modo somente leitura explícito.** O embed solicita `Permissions.Read` e
   `ViewMode.View`. Isso é uma preferência do cliente, não substitui a autorização
   do backend nem as restrições do embed token.
7. **Menos chamadas de metadados.** Reutiliza os dados da página recebidos na carga
   e em eventos de navegação quando disponíveis, evitando `getActivePage` duplicado.

O desktop mantém o carregamento direto, sem a fase de preparação mobile.
As otimizações da moldura e dos eventos também se aplicam às outras empresas;
não há mais uma implementação especial por blocos somente para a Gradual.

## Proteções de estado

- A mesma instância do relatório permanece ao girar, navegar, aplicar filtros e
  usar o zoom do portal; não há `key` dependente de orientação.
- Captura/restauração temporária de bookmark continua preservando filtros e
  segmentações entre os renderizadores nativos. Não tenta capturar bookmark
  antes da primeira renderização, quando a API ainda não suporta essa operação.
- Não remove filtros para aproveitar cache, não guarda dados/token no diagnóstico
  e não acessa páginas além das já autorizadas pelo backend.
- Falhas transitórias do heartbeat continuam preservando a instância; revogações
  e encerramento efetivo da sessão continuam sendo respeitados.

## Verificação

```powershell
node --test scripts/tests/*.test.mjs
npm run build
```

Testes unitários cobrem renderização única, tamanho zero, aba oculta, erros,
troca de instância, desmontagem, eventos concorrentes, agrupamento de resize,
preservação de filtros e ausência de ocultação/reorganização de visuais.

Integração React com SDK simulado, fora das dependências de produção, também
confere abertura vertical e horizontal, navegação, rotação, zoom, identidade
de configuração/iframe, heartbeat 500/503 e renovação de token. Isso não mede
consumo de memória de um relatório real nem substitui validação em iPhone.

Após implantação, abrir uma sessão nova e testar no aparelho afetado:

1. Páginas originais completas, sem controles de blocos.
2. Abertura já na horizontal e troca vertical/horizontal repetida.
3. Filtros mantidos, páginas inferiores acessíveis e zoom apenas no BI.
4. Mesmo roteiro do vídeo, incluindo deixar o aparelho parado, por vários minutos.
5. Ausência de recarregamentos/falha nativa e valores iguais aos do desktop.

## Limites desta etapa

O portal tem controle sobre o ciclo de carregamento e sua própria moldura, não
sobre o consumo interno de cada visual do Power BI. O desenho final continua
contendo a página completa, portanto esta etapa **não garante** eliminar quedas
por limite de memória do navegador. Não reintroduzir blocos, ocultar indicadores,
publicar uma versão simplificada ou alterar o BI sem nova autorização do usuário.

Referências oficiais:

- [Microsoft — Phased embedding](https://learn.microsoft.com/en-us/javascript/api/overview/powerbi/phased-embedding).
- [Microsoft — Embedded performance best practices](https://learn.microsoft.com/en-us/power-bi/developer/embedded/embedded-performance-best-practices).
