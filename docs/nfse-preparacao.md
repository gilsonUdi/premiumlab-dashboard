# NFS-e Axis — preparação inicial (04/11/2026)

> Registro histórico da primeira entrega. O conector de emissão/consulta, configuração segura do A1 e as instruções atuais estão em [nfse-integracao.md](nfse-integracao.md). Os bloqueios abaixo descrevem a etapa preparatória, não o estado posterior do código. A homologação real continua pendente até configuração do servidor e testes na SEFIN.

## Disponível

- Administrador → Notas fiscais de serviço: rascunhos, clientes fiscais, configuração do emitente e área reservada ao histórico.
- Emitente único: GS GESTAO E CONTROLADORIA LTDA, CNPJ 48.519.335/0001-47, Cuiabá/MT, Simples Nacional (informado pelo usuário; confirmar com documentação fiscal).
- Inscrição municipal 240541, identificada no campo CM do alvará 2026 enviado pelo usuário. Preenchida por padrão e editável na configuração. CNPJ conferido com o alvará. O CNAE 7020-4/00 do alvará não foi convertido automaticamente em código tributário de serviço.
- Clientes fiscais separados dos acessos ao portal. Mesmo CPF/CNPJ atualiza o cadastro, sem criar outro login.
- Salvamento de rascunhos em centavos, competência, descrição, serviço e observações internas. Revisão transacional impede sobrescrita de edições concorrentes.
- GET/POST `/api/admin/nfse`: exige token Firebase não revogado, perfil admin e active=true. Credenciais Firebase Admin existentes são reutilizadas.
- Dados em `axisFiscal/issuer`, subcoleções `customers` e `drafts`, somente via backend. As regras devem negar acesso direto pelo SDK do navegador a esse namespace (as regras versionadas já negam por ausência de regra permissiva). Não é necessário publicar as regras antigas do repositório sobre as regras atuais: confirmar apenas que não há regra global permissiva no ambiente publicado.
- Leitura inicial limitada a 200 clientes por nome e 100 rascunhos recentes, com aviso de limite. Paginação/pesquisa completa ficam para evolução.

## Bloqueios deliberados

Nenhuma integração com governo foi implementada. Não há assinatura, DPS, numeração fiscal, emissão, cancelamento, PDF/XML fiscal ou importação de notas antigas. `action=emit` é bloqueada também no servidor. Salvar rascunho NÃO emite nota. Não interpretar valor de rascunho como cálculo de imposto.

O arquivo A1 fornecido não foi aberto, copiado, instalado ou versionado. Não há campo para enviar o certificado ou sua senha. Não colocar segredos nos campos de observação. Nenhuma configuração fiscal foi deduzida a partir do Simples Nacional além do regime informado.

## Próxima etapa (depende do usuário/contador)

1. Inscrição municipal recebida. Ainda receber uma nota recente e confirmar endereço, código de serviço, tributação, retenções e exigências do leiaute vigente com o contador.
2. Definir armazenamento seguro do A1 e senha no servidor, com acesso mínimo e controle de validade. Não utilizar arquivos públicos ou variáveis NEXT_PUBLIC para segredos.
3. Implementar conector oficial, assinatura e validação da DPS, consulta por identificador e proteção contra emissão duplicada em timeout.
4. Homologar em ambiente de teste. Separar homologação de produção e exigir autorização explícita para a primeira emissão real.
5. Somente após homologação liberar emissão, histórico autorizado e download de documentos; depois cancelamento/substituição conforme regras aplicáveis.

## Verificação local

`node --test scripts/tests/nfse-drafts.test.mjs`

`node --experimental-vm-modules --test scripts/tests/nfse-api.test.mjs`

Os testes de API usam Firebase/Next simulados. Não executam gravacões em produção nem acessam serviços fiscais.

`node --test scripts/tests/nfse-ui.test.mjs` verifica a interface com React Test Renderer e o compilador JSX do Next. Se as dependências estiverem isoladas, `NFSE_UI_REACT_MODULES` e `NFSE_UI_NEXT_MODULES` podem apontar para os respectivos diretórios `node_modules`. Não é necessário instalar dependências na pasta sincronizada.
