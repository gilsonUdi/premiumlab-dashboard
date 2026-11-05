import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import { buildDpsXml } from '../../lib/nfse/xml.mjs'
import { normalizeIssuerSettings } from '../../lib/nfse-drafts.mjs'
import { buildDanfsePdf, readDanfseData, danfseFileName } from '../../lib/nfse/danfse.mjs'

function fixture(environment = 'test', description = 'CONTROLADORIA E GOVERNANÇA DE PROCESSOS') {
  const amountCents = 190000
  const built = buildDpsXml({ issuer: normalizeIssuerSettings({ fiscalProfileConfirmed: true, totalTaxPercentSN: '6' }),
    draft: { customer: { name: 'Cliente <teste>', taxId: '52998224725', municipalityCode: '5103403', postalCode: '78025300', street: 'Rua', number: '1', district: 'Centro' },
      competence: '2026-11-04', serviceCode: '170201', description, amountCents },
    environment, series: '4', number: '2', emittedAt: '2026-11-04T22:40:39Z' })
  const key = '1'.repeat(50)
  const xml = `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${key}"><nNFSe>1</nNFSe><cStat>100</cStat><dhProc>2026-11-04T19:40:39-03:00</dhProc><xLocEmi>Cuiabá</xLocEmi><emit><CNPJ>48519335000147</CNPJ><xNome>Emitente autorizado</xNome></emit><valores><vLiq>1900.00</vLiq></valores>${built.xml.replace(/<\?xml[^>]*\?>/, '')}</infNFSe></NFSe>`
  return { xml, expected: { dpsId: built.id, environment, amountCents, key } }
}

test('PDF local contém uma página A4; ambiente e valores provêm do XML autorizado', async () => {
  for (const environment of ['test', 'production']) {
    const { xml, expected } = fixture(environment)
    const data = readDanfseData(xml, expected)
    assert.equal(data.test, environment === 'test')
    assert.equal(data.provider.name, 'Emitente autorizado')
    assert.equal(data.at('valores/vLiq'), '1900.00')
    assert.equal(data.consultationUrl, `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${expected.key}`)
    const result = await buildDanfsePdf(xml, expected)
    assert.equal(Buffer.from(result.bytes).subarray(0, 5).toString(), '%PDF-')
    assert.equal(result.fileName.startsWith('SEM-VALOR-FISCAL-'), environment === 'test')
    assert.equal(result.fileName, `${environment === 'test' ? 'SEM-VALOR-FISCAL-' : ''}Cliente teste - NFSe 1.pdf`)
    const pdf = await PDFDocument.load(result.bytes)
    assert.equal(pdf.getPageCount(), 1)
    assert.ok(Math.abs(pdf.getPage(0).getWidth() - 595.28) < 0.1)
    assert.equal(pdf.getTitle().includes('SEM VALOR FISCAL'), environment === 'test')
  }
})

test('nome do PDF usa cliente e número oficial da nota, preservando acentos e removendo caracteres inseguros', () => {
  assert.equal(danfseFileName({ test: false, customer: { name: 'Aliança Comércio LTDA' }, number: '18' }), 'Aliança Comércio LTDA - NFSe 18.pdf')
  assert.equal(danfseFileName({ test: true, customer: { name: ' Cliente: A/B\\C?*<>|"\r\n' }, number: '19' }), 'SEM-VALOR-FISCAL-Cliente A B C - NFSe 19.pdf')
  assert.equal(danfseFileName({ customer: { name: ' ... ' }, number: '20' }), 'Cliente - NFSe 20.pdf')
  assert.ok(danfseFileName({ customer: { name: 'A'.repeat(400) }, number: '21' }).length < 170)
  assert.doesNotMatch(danfseFileName({ customer: { name: '\u202eCliente\u2066' }, number: '22' }), /[\u202e\u2066]/)
})

test('PDF rejeita chave/ambiente divergentes, DPS sem autorização e grupos não suportados', async () => {
  const { xml, expected } = fixture()
  for (const options of [{ ...expected, key: '2'.repeat(50) }, { ...expected, environment: 'production' }]) {
    await assert.rejects(buildDanfsePdf(xml, options), /divergente/i)
  }
  await assert.rejects(buildDanfsePdf(xml.replace('<cStat>100</cStat>', '<cStat>101</cStat>'), expected), /cStat 100/)
  await assert.rejects(buildDanfsePdf(xml.replace('</infNFSe>', '<IBSCBS/></infNFSe>'), expected), /grupos fiscais/)
  await assert.rejects(buildDanfsePdf('<!DOCTYPE NFSe><NFSe/>', expected), /XML fiscal/)
})

test('descrição longa não cria páginas extras; caracteres incompatíveis não são alterados silenciosamente', async () => {
  const { xml, expected } = fixture('test', 'Serviço mensal '.repeat(170).slice(0, 2000))
  const result = await buildDanfsePdf(xml, expected)
  assert.equal((await PDFDocument.load(result.bytes)).getPageCount(), 1)
  const emoji = fixture('test', 'Serviço \u{1f49b}')
  await assert.rejects(buildDanfsePdf(emoji.xml, emoji.expected), /caracteres não suportados/)
})
