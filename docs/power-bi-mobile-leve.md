# Primeira etapa de otimização do BI mobile — 22/10/2026

## Escopo

Ativação automática somente para `lentes-gradual`, quando a abertura ocorre
em celular/tablet identificado como portrait ou landscape. Desktop e demais
empresas continuam no caminho anterior. A escolha é mantida durante a sessão,
sem recriar o iframe ao girar o aparelho.

Não altera PBIX, medidas DAX, modelo semântico, identidade do embed, filtros
de acesso, permissões ou fontes. Os arquivos PBIX originais não foram editados.

## Evidência e hipótese

O vídeo apresentou quedas também na vertical, a 100%. O usuário confirmou
reprodução sem zoom em um embed mínimo, justificando reduzir o trabalho de
renderização do relatório, não somente modificar o CSS do portal.

Inventário somente de metadados da cópia local
`Gestão Diretoria Visuais Atualizados.pbix`:

| Página | Elementos | Visuais Deneb | Slicers |
| --- | ---: | ---: | ---: |
| Indicadores Performance | 23 | 8 | 7 |
| Dashboard Comercial | 24 | 7 | 9 |
| Vendas por Consultor e Previsão | 27 | 7 | 8 |
| Vendas Produtos e Serviços | 26 | 9 | 8 |
| Bonificação e Perdas de Processos | 28 | 11 | 8 |

Esses números são do arquivo local, não uma afirmação de igualdade de versão
com a publicação. Em execução, os visuais são descobertos diretamente pelo SDK.

## Implementação

- `lib/power-bi-mobile.mjs`: prepara inventário de nomes, tipos, títulos e
  posições. Não exporta dados dos visuais.
- Usa **phased embedding**: carrega metadados, configura o layout e somente
  então chama `report.render()`. Não precisa desenhar a página completa antes
  de limitar a exibição.
- Consulta metadados apenas das páginas já liberadas pelo backend. Visuais
  originalmente ocultos continuam ocultos; imagens, formas e navegação interna
  decorativa não integram os blocos de indicadores.
- **Indicadores:** até dois visuais por bloco, todos acessíveis por anterior/
  próximo. Nenhuma métrica é substituída ou tem sua fórmula modificada.
- **Filtros:** área própria com até quatro segmentações por bloco, sem gráficos
  simultâneos. Os filtros continuam pertencendo ao mesmo relatório/instância.
- Layout `Custom` nas duas orientações: empilha no retrato e organiza duas
  colunas na horizontal. A navegação inferior de páginas é preservada.
- Todos os outros blocos/páginas ficam explicitamente ocultos pelo layout do
  SDK, inclusive em chamadas que façam merge das configurações.
- Canvas de tamanho limitado e ajuste à largura, sem ampliação CSS do iframe
  no modo leve. Os botões de zoom manual não aparecem nesse modo.
- Serialização e deduplicação evitam que capturas atrasadas de metadados ou
  eventos de viewport apliquem a página anterior. Não faz polling dos visuais.
- Falha na preparação mostra erro; não há fallback automático que carregue
  silenciosamente a página completa e pesada.

Ocultar visuais pelo SDK reduz o conteúdo exibido/renderizado. Não comprova,
isoladamente, liberação de toda a memória de plugins ou cancelamento de todas
as consultas internas do Power BI. A redução real de memória e a resolução da
queda dependem de validação no iPhone.

## Testes

```powershell
node --test scripts/tests/*.test.mjs
npm run build
```

Há testes de orçamento de visuais, acesso a todos os blocos, autorizações,
visuais originalmente ocultos, mudança de orientação, estados vazios,
concorrência, troca de instância e erros de SDK. Também foi executada uma
integração React com SDK simulado em ambiente temporário: primeiro render
depois da preparação, navegação, filtros, rotação e identidade do iframe/config.

## Validação necessária após implantação

No iPhone que reproduziu a falha, abrir o BI da Gradual e conferir:

1. A área **Indicadores / Filtros** e os controles de blocos aparecem.
2. Percorrer todos os blocos e páginas, sem visuais faltantes.
3. Aplicar período, representante e cliente; voltar aos indicadores e conferir
   que as seleções continuam ativas, inclusive ao girar o aparelho.
4. Repetir o roteiro do vídeo por pelo menos cinco minutos sem recarregamento
   ou mensagem de falha do navegador.
5. Conferir valores contra o mesmo período/filtros no desktop.

Se ainda houver queda, isolar cada bloco para identificar o visual responsável
e revisar sua especificação, volume de dados e consulta. O próximo passo pode
exigir uma versão mobile do próprio relatório, com visuais nativos ou consultas
mais enxutas. Não aumentar a capacidade Azure por suposição: uma queda do
processo do navegador não comprova insuficiência no servidor.

Referências:

- [Microsoft — Phased embedding](https://learn.microsoft.com/en-us/javascript/api/overview/powerbi/phased-embedding).
- [Microsoft — Custom layouts](https://learn.microsoft.com/en-us/javascript/api/overview/powerbi/custom-layout).
- [Microsoft — Otimização de relatórios](https://learn.microsoft.com/en-us/power-bi/guidance/power-bi-optimization).
