# Correcoes de dependencias — Hostinger — 21/10/2026

## Escopo e origem

Foram consultadas pelo navegador as quatro paginas e os detalhes dos **36 alertas**
do hPanel de gsgestao.com.br, repositorio premiumlab-dashboard. O scanner indicava
verificacao de 20/10/2026 15:31: 2 criticos, 16 altos, 15 moderados e 3 baixos.
O inventario individual, com ID e versao recomendada pela Hostinger, esta em
hostinger-alerts-2026-10-21.json. Nao foram executados os exemplos de exploracao.

## Alteracoes aplicadas ao projeto

| Pacote | Versao detectada pela Hostinger | Destino no lockfile |
| --- | --- | --- |
| next | 14.2.35 | 15.5.28 |
| postcss | 8.4.31 | 8.5.31 em todas as copias |
| @grpc/grpc-js | 1.9.16 | 1.14.6 em todas as copias |
| uuid | 9.0.1 | 11.1.1 |
| postcss-selector-parser | 6.1.5 | 7.1.7 |
| minimatch | 9.0.3 | Essa copia foi eliminada; ramos presentes: 3.1.5 e 10.2.6 |
| glob | 10.3.10 | Pacote ausente da arvore resultante |
| eslint | 8.57.1 | 9.39.5 |

- Atualizado eslint-config-next para a mesma versao do Next: 15.5.28.
- Overrides mantem dependencias internas corrigidas: alterar somente a dependencia
  direta nao remove, por exemplo, o PostCSS antigo interno do Next ou gRPC do Firebase.
- Minima patch version varia por ramo. Nao forcamos todo minimatch para v9 ou todo
  glob para v10, o que poderia quebrar APIs de consumidores de outros majors.
- Criado/versionado package-lock.json na raiz para tornar a instalacao reproduzivel.
- Adaptadas nove rotas/paginas dinamicas para aguardar params, conforme Next 15.
- Definido outputFileTracingRoot no diretorio real do projeto, evitando inferencia
  de raiz a partir de lockfiles de pastas superiores.
- O smoke HTTP identificou self is not defined ao importar o SDK Power BI no
  servidor. CompanyDashboardPage passou a carregar o componente BI via next/dynamic
  com ssr:false, em escopo de modulo; a logica interna do embed nao foi modificada.
- React continua 18.3.1 na arvore resolvida, respeitando os peers declarados e
  preservando o wrapper Power BI existente. Nao houve migracao paralela para React 19.
- Nao foram alteradas regras Firebase, credenciais, filtros de tenant ou autorizacao.

O alerta CVE-2025-50537 (ESLint) foi **retirado**, como informa seu proprio detalhe.
Ele nao deve ser descrito como exploracao comprovada do portal. Atualizamos a
ferramenta acima da versao recomendada, mas essa distincao fica registrada.

## Verificacao

- Testes existentes do BI: 20 aprovados.
- Cinco testes novos: inventario com 36 IDs unicos, versoes corrigidas inclusive
  aninhadas, alinhamento Next/ESLint, params assincronos e SDK BI restrito ao cliente.
  Total: **25 testes aprovados**.
- Smoke offline de UUID v4/v5, construtor Firestore e Metadata gRPC sem requisicoes
  externas ou leitura de dados reais.
- Build final Next 15.5.28 concluido com sucesso.
- npm ci --dry-run --ignore-scripts --no-fund --no-audit aprovado, conferindo
  consistencia de manifesto/lockfile; nao equivale a uma segunda instalacao limpa.
- Smoke HTTP: /login e **sete rotas de empresa** (home, dashboard, PPS,
  catalogo externo, externo individual, catalogo BI e BI individual) responderam 200.
  GET de credenciais sem token respondeu 403.
- A tela de login foi aberta no navegador. A copia local nao tem env Firebase;
  o console apontou as variaveis ausentes. Nao houve login real, teste de dados
  autenticados nem teste de BI real nesta copia. Nao inferir validacao de producao.
- Servidor e aba de teste temporarios encerrados depois das verificacoes.
- Nenhuma exploracao de vulnerabilidade foi executada em producao.

## Auditoria adicional — pendencias fora da lista original

Apos as atualizacoes, npm audit ainda aponta **8 entradas de pacotes, todas altas**.
Nao sao oito falhas independentes: varias sao propagacao da mesma dependencia.

1. Cadeia braces <=3.0.3 / micromatch / fast-glob / chokidar / Tailwind e plugin
   ESLint. A versao 3.0.3 era a mais recente do braces no registro consultado.
   Nao aplicar downgrade automatico sugerido pelo audit para Next/ESLint antigos.
   Avaliar correcao upstream ou migracao de ferramentas em tarefa propria, com
   regressao visual de CSS. Nao reescrever o layout inteiro como efeito colateral.
2. xlsx 0.18.5: prototype pollution e ReDoS, sem correcao oferecida no pacote npm
   consultado. No codigo examinado ele e usado para EXPORTAR planilhas em
   ProductionDashboard, nao foi encontrado fluxo de leitura de planilha nessa
   verificacao. Isso reduz a aplicabilidade de vetores de importacao, mas nao elimina
   o alerta. Planejar distribuicao oficial corrigida ou substituicao, testando todas
   as abas exportadas. Nao afirmar que o pacote esta seguro por ser usado para exportar.

Por isso NAO afirmar "zero vulnerabilidades" ou "portal totalmente seguro".
Os 36 alertas originais tiveram suas recomendacoes de versao atendidas na arvore
preparada, mas e necessario novo scanner depois da implantacao para confirmar o hPanel.

## Publicacao e validacao em producao

1. Revisar diff, integridade dos textos staged e testes; commit/push apenas desta tarefa.
2. Reimplantar usando package-lock.json (preferencialmente npm ci), sem reaproveitar
   node_modules antigo. Nao executar npm audit fix --force.
3. Conferir login, paginas de empresa, catalogo/embed Power BI e exportacao Excel.
4. Conferir vCard/cartao publico com params assincronos.
5. Aguardar scanner da Hostinger e comparar IDs com o inventario. O hPanel informa
   que a verificacao ocorre apos nova implantacao; o print antigo nao comprova o estado novo.
6. Registrar separadamente as pendencias novas do audit e os reforcos de autorizacao
   ja planejados em docs/onboarding-prompts/contexto-portal.md.

Referencias:

- https://github.com/advisories/GHSA-2xp9-vwfh-vxw4
- https://nextjs.org/docs/app/guides/upgrading/version-15

O arquivo de contexto registra o checkout usado, porque a pasta Google Drive tem
mudancas paralelas e historico de divergencia entre leitura local e leitura do Git.
