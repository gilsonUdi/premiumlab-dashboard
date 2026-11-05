# NFS-e Axis — integração oficial SEFIN Nacional

Atualização: 04/11/2026. Substitui as limitações da etapa preparatória descrita em `nfse-preparacao.md`.

## Implementado

- API direta SEFIN Nacional, sem intermediário pago e sem automação do navegador.
- DPS 1.01, assinatura XMLDSig com A1, autenticação mútua TLS >= 1.2, GZip/base64. RSA-SHA1 na assinatura XML segue o padrão do manual nacional; não enfraquece a validação TLS. Chaves privadas não são devolvidas pela API.
- Certificado aberto exclusivamente no servidor; validação local da senha, período de validade, correspondência chave/certificado e CNPJ do emitente no SAN ICP-Brasil (OID 2.16.76.1.3.3). A aceitação da cadeia ICP-Brasil e do cadastro fiscal será confirmada pela SEFIN, não presumida pelo teste local.
- Emissão sob confirmação explícita e ambiente fixado na confirmação. Não há limite de 10 minutos desde o login: um administrador ativo pode emitir enquanto possuir sessão/token válido. API continua validando o token com verificação de revogação e negando perfis não administrativos e inativos.
- Reserva transacional de série/número por ambiente no Firestore. O mesmo rascunho tem uma única operação, com histórico das tentativas. Contratos de concorrência protegem cliques repetidos e múltiplas instâncias.
- Um POST por tentativa. Timeout, erro de conexão, 5xx e resposta não reconhecida ficam incertos: nenhuma repetição automática. Consultar DPS usa somente GET. Notas recuperadas devem corresponder à DPS, ambiente, CNPJ e valor esperados.
- Rejeição definitiva reconhecida (HTTP 400 com códigos de validação E/RNG e sem indicação de duplicidade) libera o rascunho para correção. Nova tentativa é manual e exige confirmar ausência da mesma DPS por GET 404; conserva série/número, não cria outra nota automaticamente. Erros não reconhecidos permanecem bloqueados para análise.
- XML assinado da DPS e XML autorizado salvos em documentos privados da operação. Histórico mostra ambiente, cliente, valor, DPS, chave e situação; downloads restritos a administradores.
- Homologação e produção separadas. Produção exige flags explícitas E evidência de nota autorizada em homologação com o mesmo conector, A1 e configuração fiscal. Alterações na configuração/certificado invalidam essa elegibilidade até novo teste.
- Código nacional 170201 e NBS 118065300 foram confirmados pelo usuário com a contabilidade; inscrição municipal 240541 e endereço vêm dos documentos de referência. Conferir endereço na configuração e no cadastro nacional.

## Adaptação de homologação NT009 R1 (04/11/2026)

O retorno real E1235 revelou uma diferença entre os ambientes: produção restrita usa o pacote de 20/10/2026 (NT009 R1), enquanto a produção ainda usa o esquema de 09/02/2026 nesta data. Ambos identificam o documento com `versao="1.01"`; essa string não distingue os contratos.

- **Homologação:** `finNFSe=0` (nota regular) em `infDPS`, depois de `tpEmit` e antes de `cLocEmi`. NBS antes da descrição em `cServ`.
- **Produção:** mantém a estrutura anterior, sem inserir `finNFSe` nesse ponto e com descrição antes do NBS. Não há fallback automático nem troca por calendário sem nova conferência da publicação oficial.
- Esquemas de produção preservados em `infra/nfse/xsd/`; homologação em `infra/nfse/xsd/homologacao-20261020/`, copiados sem alterações do pacote oficial. Nenhuma classificação de IBS/CBS foi inventada para corrigir o erro estrutural.
- A interface mostra o leiaute ativo e cada nova tentativa registra sua identificação junto ao XML. Histórico anterior e contadores não são apagados nem reiniciados.
- Testes validam XML assinado e não assinado de **cada ambiente no seu XSD**. Testes negativos reproduzem o E1235 do XML legado e verificam que o leiaute novo não invade o contrato de produção.
- Uma consulta GET com 404 não apaga a rejeição definitiva nem impede a correção do rascunho. Registros antigos marcados como incertos por essa consulta só podem ser retomados se preservarem a evidência `rejectedBySefin=true`, com novo GET 404 antes da tentativa manual. Timeout e incerteza sem essa evidência seguem bloqueados.
- Versão do conector incrementada: eventuais provas de homologação anteriores não liberam produção com o conector alterado. O teste real na SEFIN deve ser repetido pelo usuário, sem emissão automática na implantação.

Após a implantação: conferir no topo `Homologação NT009 R1 · 20/10/2026`, atualizar, reabrir o rascunho rejeitado, salvar e confirmar uma nova tentativa em homologação. As mensagens antigas continuam no histórico; não confundir uma rejeição anterior com o resultado da tentativa nova. Não é necessário trocar A1, série ou variáveis apenas por esta correção.

## Escopo fiscal suportado nesta primeira versão

ME/EPP optante pelo Simples Nacional, regime de apuração federal e municipal pelo SN, sem regime especial, serviço 170201/NBS 118065300, operação tributável e prestação em Cuiabá/MT. Sem retenções, deduções, descontos, exportações ou substituição de nota. O administrador deve confirmar esse perfil na configuração.

Não se fixa a alíquota histórica de ISS de 2,33%. Não é enviado `pAliq`: a parametrização é tratada pela SEFIN. O percentual aproximado total de tributos do Simples (`pTotTribSN`) deve ser informado explicitamente e confirmado pelo responsável; não usamos 6% automaticamente. Não se copiam valores históricos de IBS/CBS nem se inventam CST/cClassTrib. Situações fora desse perfil, novas exigências do governo ou rejeições do ambiente real exigem ajuste/homologação antes de produção.

## O que ainda depende de configuração e validação real

Nenhum certificado real foi aberto/instalado nesta implementação, e nenhuma nota foi emitida no governo ou gravada em produção durante os testes locais. Foi utilizado A1 sintético gerado em memória e Firebase/SEFIN simulados nos testes.

1. Configurar o A1 e senha como segredos no servidor de hospedagem. Não enviar senha pelo chat, não colocar certificado no repositório e não usar caminho do computador local como se fosse acessível pelo site.
2. Escolher série **exclusiva** para o aplicativo; não reutilizar uma série/número já consumidos por outro emissor. Os contadores no Firebase não devem ser apagados nem reiniciados. A série 70013 das notas fornecidas pertence ao emissor anterior e não é copiada.
3. Informar percentual aproximado do Simples validado para as emissões e confirmar o perfil fiscal no admin.
4. Completar dados do cliente: CPF/CNPJ, nome, endereço, CEP e código IBGE de 7 dígitos. O município do cliente não é deduzido a partir do nome ou CEP.
5. Fazer uma emissão de homologação e validar XML, retorno, impostos e consulta com a contabilidade.
6. Só após homologação autorizar produção no servidor e confirmar a primeira nota real na interface.

## Variáveis no servidor (não no navegador)

Exemplo sem segredos: `infra/nfse/.env.example`.

| Variável | Como configurar |
| --- | --- |
| `NFSE_ENABLED` | `true` somente depois de preparar o ambiente; padrão desabilitado. Não dispara notas sozinho. |
| `NFSE_ENVIRONMENT` | Começar com `test`. Usar `production` apenas após homologação. |
| `NFSE_PRODUCTION_ENABLED` | Manter `false` nos testes. A liberação real também depende da evidência de homologação no Firebase. |
| `NFSE_A1_PFX_PATH` | Caminho absoluto de arquivo secreto **no servidor**, por exemplo `/run/secrets/axis-a1.pfx`; precisa estar realmente montado e legível pelo processo. Nunca dentro de `public/`. |
| `NFSE_A1_PFX_BASE64` | Alternativa ao arquivo, se a hospedagem aceitar o tamanho: conteúdo completo do PFX em base64, armazenado como segredo. Base64 NÃO é criptografia. Não configurar junto com PATH. |
| `NFSE_A1_PASSWORD` | Senha real do PFX, como segredo da hospedagem; nunca no chat, código ou prefixo NEXT_PUBLIC. |
| `NFSE_DPS_SERIES_TEST` | Série exclusiva de homologação de 1 a 49999, definida pelo responsável. |
| `NFSE_DPS_SERIES_PRODUCTION` | Série exclusiva de produção de 1 a 49999. |
| `NFSE_DPS_INITIAL_NUMBER_TEST` / `NFSE_DPS_INITIAL_NUMBER_PRODUCTION` | Número inicial apenas para contador novo; padrão 1. Alterar depois não reinicia contador existente. |
| `NFSE_SEFIN_TEST_BASE_URL` | Opcional: somente caminhos oficiais permitidos, `/SefinNacional` ou `/API/SefinNacional` no host de produção restrita. Não há fallback automático de POST. |

As variáveis Firebase Admin já existentes continuam necessárias. Não há token comercial de API fiscal: a identidade na SEFIN é o certificado A1 via mTLS. A senha de conta gov.br não é usada pelo conector.

## Uso na interface

Administração → Notas fiscais de serviço → Configuração do emitente. Resolver bloqueios listados no topo e usar Atualizar para verificar a configuração local. Cadastrar cliente, salvar rascunho, confirmar ambiente/dados e emitir. A emissão não exige sair e entrar a cada 10 minutos. Uma sessão realmente inválida, expirada sem renovação ou revogada ainda exige autenticação válida; o controle de acesso administrativo permanece ativo.

Para uma resposta incerta, abrir Emissões e consultas → Consultar DPS (sem reenviar). Jamais criar outra nota para contornar timeout. A ausência na consulta não é tratada automaticamente como autorização para novo envio.

## PDF/DANFSe

A API antiga de geração de DANFSe foi descontinuada pelo governo. O histórico agora oferece **Baixar PDF / DANFSe**, com geração local a partir do XML autorizado armazenado, além de XML e consulta oficial. A ação autenticada `downloadPdf` não consulta, transmite ou altera notas: verifica estado autorizado, hash SHA-256, correspondência da DPS/chave/ambiente/cliente/valor e `cStat=100` antes de gerar. Não há PDF fiscal de rascunho, rejeição ou resultado incerto. Nenhum certificado/senha é incorporado ao PDF.

O documento A4 de uma página é baseado na estrutura da NT008: logo nacional, identificação, chave de 50 dígitos, QR Code de consulta, prestador/tomador, descrição, tributos e valores. Homologação tem aviso vermelho **NFS-e SEM VALIDADE JURÍDICA** e nome de arquivo `SEM-VALOR-FISCAL-...`. Dados do prestador vêm de `emit` no XML (podem diferir do cadastro local, pois a SEFIN usa dados cadastrais próprios). Campos ausentes aparecem como traço, nunca como imposto zero presumido. A situação impressa é a do XML armazenado; cancelamentos posteriores só podem ser conferidos pela consulta oficial.

Escopo inicial: perfil atual de ME/EPP, tributos pelo SN, sem regime especial, deduções, retenções federais, grupos IBS/CBS, substituição ou obras/eventos. Grupos ainda não suportados são recusados com orientação de usar a consulta oficial, em vez de omitir tributos. Há limites de texto/reticências e validação de espaço para manter uma página. Fontes padrão PDF Helvetica/Helvetica-Bold são usadas como substitutas tipográficas portáveis; isso não equivale à certificação de reprodução integral da NT008, que especifica Arial/Microsoft Sans Serif. Glifos incompatíveis são recusados, não substituídos em dados fiscais. Campos de município/UF ausentes no XML são exibidos como traço, mantendo o código IBGE/CEP quando disponível. Não há enriquecimento a partir do cadastro atual nem consulta externa para completar dados.

O logo oficial, sem alteração, é distribuído em `public/nfse/logo-nfse.png`; origem: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/logos-da-nfs-e/Logo%20-%20NFS-e%20-%20Horizontal.png/view (licença indicada no portal: CC BY-ND 3.0). Fonte do leiaute: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/nt-008-se-cgnfse-danfse-20260505.pdf. Não há dependência de navegador/Chrome no servidor. Cancelamento/substituição continuam fora deste módulo; as notas antigas não são importadas automaticamente.

## Dados privados

### Inscrição municipal no XML e rejeição E0120

A IM `240541` continua no cadastro. O envio de `prest/IM` é controlado por `sendMunicipalRegistration`, habilitado somente com booleano `true`. Por padrão, inclusive configurações antigas sem essa propriedade, a IM não é enviada: este é o cenário apontado pelo E0120 recebido da SEFIN para o emitente Axis. Em Configuração do emitente, o administrador pode habilitar o envio se o cadastro complementar CNC passar a exigi-lo. A opção não altera IM do tomador nem apaga a inscrição cadastrada. O perfil fiscal/versionamento considera a opção; homologação anterior não libera automaticamente produção com o novo conector.

Uma resposta HTTP 400 contendo exclusivamente código E0120 é rejeição corrigível; os termos “não existem informações” não a tornam incerta. Não há novo POST automático. Para a tentativa antiga presa como incerta, clicar em **Consultar DPS (sem reenviar)**: somente após GET 404 e comprovação da resposta HTTP 400/E0120 arquivada na mesma tentativa, o sistema recupera a rejeição e libera o rascunho. Atualize a lista para editá-lo. A emissão posterior ainda exige confirmação, revisão atual e outra consulta GET 404 da mesma DPS. Sem essa prova, o bloqueio permanece; não há liberação baseada apenas na mensagem exibida ou no 404.

### Diagnóstico dos horários de emissão

`dhEmi` é representado no fuso IANA `America/Cuiaba`, do emitente (em novembro/2026, `-04:00`), antes da assinatura. Por exemplo, `2026-11-04T22:06:13Z` vira `2026-11-04T18:06:13-04:00`: o mesmo instante, sem margem artificial nem retrocesso. O instante persistido em `emittedAt` usa a mesma representação do XML. A visualização administrativa continua em Brasília. A versão do conector foi incrementada; uma aprovação de homologação de versão anterior não libera produção nesta versão. Essa normalização testa a hipótese de interpretação do fuso na rejeição E0008, não comprova correção na SEFIN sem nova tentativa autorizada pelo usuário.

Novas respostas de emissão preservam `dataHoraProcessamento` da SEFIN (quando for uma data válida com fuso) em `operations/{id}/emissionTiming.processedAt` e em `attempts/{tentativa}/processedAt`. Também são gravados `emittedAt` (instante enviado na DPS) e `receivedAt` (relógio do portal ao receber a resposta). O histórico administrativo mostra os três horários em Brasília com segundos, além do valor original da SEFIN, preservando fuso e frações para diagnóstico de E0008.

Horário ausente/inválido aparece como “Não informado / não registrado”; não se usa o relógio do portal como substituto do processamento SEFIN. Registros antigos não são retroativamente preenchidos. Consultas posteriores não substituem os horários da emissão original. Não há ajuste do relógio, retrocesso artificial da emissão nem mudança nas regras de reenvio.

Namespace Firestore `axisFiscal/issuer`: configuração, `customers`, `drafts`, `operations`, `counters`, `approvals`. Operações contêm subcoleções `documents` e `attempts`. Deve permanecer negado o acesso direto pelo SDK do navegador, inclusive a documentos aninhados; conferir as regras efetivamente publicadas (não publicar regras antigas indiscriminadamente). O backend usa Firebase Admin após autenticação/autorização. Certificado e senha não são gravados nessas coleções.

## Testes e fontes técnicas

`node --test scripts/tests/nfse-drafts.test.mjs scripts/tests/nfse-integration.test.mjs scripts/tests/nfse-pdf.test.mjs`

`node --experimental-vm-modules --test scripts/tests/nfse-api.test.mjs`

`node --test scripts/tests/nfse-ui.test.mjs` (React Test Renderer disponível ou configurado pelas variáveis de diretório documentadas na etapa inicial).

Os testes de XSD usam XmlSchema .NET em Windows/PowerShell e os XSDs oficiais **sem alteração**. O pattern da série do XSD usa ^/$; libxml2 interpreta esses sinais como literais, diferente da implementação .NET. Em outro sistema, usar `NFSE_TEST_POWERSHELL` com PowerShell/.NET ou verificar explicitamente o teste pulado. Validar XSD local não equivale a autorização ou homologação no governo.

A auditoria npm desta instalação ainda sinalizou vulnerabilidade alta no pacote `xlsx` já utilizado pelo portal e moderadas na cadeia de ferramentas ESLint/TypeScript. A atualização/substituição desses componentes não foi incluída nesta integração e não deve ser considerada concluída. Não foi usado `npm audit fix --force`.

- Endereços oficiais: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao
- Leiautes: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual
- XSDs copiados de: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/nfse-esquemas_xsd-v1-01-20260209.zip (pasta Schemas/1.01). Licenças e avisos originais preservados.
- XSD de homologação: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/esquemas_prod_restrita_20261020.zip
- Publicação NT009 R1 em testes: https://www.gov.br/nfse/pt-br/noticias/cgnfs-e-informa-disponibilizadas-no-ambiente-de-testes-o-release-1-das-evolucoes-da-nota-tecnica-009
- Padrão de assinatura: https://www.gov.br/nfse/pt-br/biblioteca/manuais-e-tutoriais/manual-integrado-nfse
- Descontinuação do DANFSe no ADN e disponibilização pela consulta pública: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/atualizacoes-e-implantacoes
