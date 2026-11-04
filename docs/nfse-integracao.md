# NFS-e Axis — integração oficial SEFIN Nacional

Atualização: 04/11/2026. Substitui as limitações da etapa preparatória descrita em `nfse-preparacao.md`.

## Implementado

- API direta SEFIN Nacional, sem intermediário pago e sem automação do navegador.
- DPS 1.01, assinatura XMLDSig com A1, autenticação mútua TLS >= 1.2, GZip/base64. RSA-SHA1 na assinatura XML segue o padrão do manual nacional; não enfraquece a validação TLS. Chaves privadas não são devolvidas pela API.
- Certificado aberto exclusivamente no servidor; validação local da senha, período de validade, correspondência chave/certificado e CNPJ do emitente no SAN ICP-Brasil (OID 2.16.76.1.3.3). A aceitação da cadeia ICP-Brasil e do cadastro fiscal será confirmada pela SEFIN, não presumida pelo teste local.
- Emissão sob confirmação explícita, ambiente fixado na confirmação e login administrativo recente (até 10 minutos). API nega perfis não administrativos, inativos e tokens revogados.
- Reserva transacional de série/número por ambiente no Firestore. O mesmo rascunho tem uma única operação, com histórico das tentativas. Contratos de concorrência protegem cliques repetidos e múltiplas instâncias.
- Um POST por tentativa. Timeout, erro de conexão, 5xx e resposta não reconhecida ficam incertos: nenhuma repetição automática. Consultar DPS usa somente GET. Notas recuperadas devem corresponder à DPS, ambiente, CNPJ e valor esperados.
- Rejeição definitiva reconhecida (HTTP 400 com códigos de validação E/RNG e sem indicação de duplicidade) libera o rascunho para correção. Nova tentativa é manual e exige confirmar ausência da mesma DPS por GET 404; conserva série/número, não cria outra nota automaticamente. Erros não reconhecidos permanecem bloqueados para análise.
- XML assinado da DPS e XML autorizado salvos em documentos privados da operação. Histórico mostra ambiente, cliente, valor, DPS, chave e situação; downloads restritos a administradores.
- Homologação e produção separadas. Produção exige flags explícitas E evidência de nota autorizada em homologação com o mesmo conector, A1 e configuração fiscal. Alterações na configuração/certificado invalidam essa elegibilidade até novo teste.
- Código nacional 170201 e NBS 118065300 foram confirmados pelo usuário com a contabilidade; inscrição municipal 240541 e endereço vêm dos documentos de referência. Conferir endereço na configuração e no cadastro nacional.

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

Administração → Notas fiscais de serviço → Configuração do emitente. Resolver bloqueios listados no topo e usar Atualizar para verificar a configuração local. Cadastrar cliente, salvar rascunho, confirmar ambiente/dados e emitir. Se o login tiver mais de 10 minutos, entrar novamente e reabrir o rascunho salvo.

Para uma resposta incerta, abrir Emissões e consultas → Consultar DPS (sem reenviar). Jamais criar outra nota para contornar timeout. A ausência na consulta não é tratada automaticamente como autorização para novo envio.

## PDF/DANFSe

A API antiga de geração de DANFSe foi descontinuada pelo governo. Não implementamos dependência desse endpoint nem apresentamos impressão do rascunho como nota autorizada. O histórico permite baixar XML autorizado e abrir a consulta oficial para obter o DANFSe. Geração própria do PDF no leiaute NT 008 e cancelamento/substituição são evoluções posteriores, não funcionalidades já homologadas.

## Dados privados

Namespace Firestore `axisFiscal/issuer`: configuração, `customers`, `drafts`, `operations`, `counters`, `approvals`. Operações contêm subcoleções `documents` e `attempts`. Deve permanecer negado o acesso direto pelo SDK do navegador, inclusive a documentos aninhados; conferir as regras efetivamente publicadas (não publicar regras antigas indiscriminadamente). O backend usa Firebase Admin após autenticação/autorização. Certificado e senha não são gravados nessas coleções.

## Testes e fontes técnicas

`node --test scripts/tests/nfse-drafts.test.mjs scripts/tests/nfse-integration.test.mjs`

`node --experimental-vm-modules --test scripts/tests/nfse-api.test.mjs`

`node --test scripts/tests/nfse-ui.test.mjs` (React Test Renderer disponível ou configurado pelas variáveis de diretório documentadas na etapa inicial).

Os testes de XSD usam XmlSchema .NET em Windows/PowerShell e os XSDs oficiais **sem alteração**. O pattern da série do XSD usa ^/$; libxml2 interpreta esses sinais como literais, diferente da implementação .NET. Em outro sistema, usar `NFSE_TEST_POWERSHELL` com PowerShell/.NET ou verificar explicitamente o teste pulado. Validar XSD local não equivale a autorização ou homologação no governo.

A auditoria npm desta instalação ainda sinalizou vulnerabilidade alta no pacote `xlsx` já utilizado pelo portal e moderadas na cadeia de ferramentas ESLint/TypeScript. A atualização/substituição desses componentes não foi incluída nesta integração e não deve ser considerada concluída. Não foi usado `npm audit fix --force`.

- Endereços oficiais: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao
- Leiautes: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual
- XSDs copiados de: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/nfse-esquemas_xsd-v1-01-20260209.zip (pasta Schemas/1.01). Licenças e avisos originais preservados.
- Padrão de assinatura: https://www.gov.br/nfse/pt-br/biblioteca/manuais-e-tutoriais/manual-integrado-nfse
- Descontinuação do DANFSe no ADN e disponibilização pela consulta pública: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/atualizacoes-e-implantacoes
