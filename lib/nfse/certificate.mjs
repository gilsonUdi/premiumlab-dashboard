import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve, relative } from 'node:path'
import { X509Certificate, createPrivateKey, createPublicKey } from 'node:crypto'
import forge from 'node-forge'
import { SignedXml } from 'xml-crypto'
import { NFSE_ISSUER } from '../nfse-drafts.mjs'

function fail(message) { throw new Error(message) }
export async function loadCertificate(env = process.env, now = new Date()) {
  if (!env.NFSE_A1_PASSWORD || (!env.NFSE_A1_PFX_BASE64 && !env.NFSE_A1_PFX_PATH)) fail('Configure NFSE_A1_PASSWORD e o A1 no armazenamento seguro do servidor (NFSE_A1_PFX_PATH ou NFSE_A1_PFX_BASE64).')
  if (env.NFSE_A1_PFX_BASE64 && env.NFSE_A1_PFX_PATH) fail('Configure somente uma origem para o A1: arquivo seguro ou base64.')
  let pfx
  if (env.NFSE_A1_PFX_PATH) {
    const path = env.NFSE_A1_PFX_PATH
    const publicRelative = relative(resolve(process.cwd(), 'public'), resolve(path))
    if (!isAbsolute(path) || (!publicRelative.startsWith('..') && !isAbsolute(publicRelative))) fail('O A1 deve ficar em caminho absoluto fora da pasta pública.')
    try { pfx = await readFile(path) } catch { fail('Não foi possível ler o A1 no servidor. Confira a montagem e as permissões do arquivo secreto.') }
  } else {
    if (!/^[A-Za-z0-9+/=\s]+$/.test(env.NFSE_A1_PFX_BASE64)) fail('Conteúdo base64 do certificado inválido.')
    pfx = Buffer.from(env.NFSE_A1_PFX_BASE64.replace(/\s/g, ''), 'base64')
  }
  if (!pfx.length || pfx.length > 200000) fail('Tamanho de certificado inválido.')
  let p12
  try { p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(pfx.toString('binary')), false, env.NFSE_A1_PASSWORD) }
  catch { fail('Não foi possível abrir o A1. Confira a senha e o formato do arquivo no servidor.') }
  const keys = [...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [])].filter(bag => bag.key)
  if (keys.length !== 1) fail('O A1 deve conter exatamente uma chave privada RSA utilizável.')
  const key = keys[0].key
  if (!key.n || !key.e || key.n.bitLength() < 2048) fail('O A1 deve usar chave RSA de pelo menos 2048 bits.')
  const cert = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [])
    .map(bag => bag.cert).find(candidate => candidate?.publicKey?.n?.compareTo(key.n) === 0 && candidate.publicKey.e.compareTo(key.e) === 0)
  if (!cert) fail('Certificado correspondente à chave privada não encontrado no A1.')
  const usage = cert.getExtension('keyUsage')
  const extendedUsage = cert.getExtension('extKeyUsage')
  if ((usage && !usage.digitalSignature) || (extendedUsage && !extendedUsage.clientAuth)) fail('O certificado não permite assinatura digital e autenticação de cliente.')
  if (now < cert.validity.notBefore || now >= cert.validity.notAfter) fail('Certificado A1 vencido ou ainda não válido.')
  const ext = cert.getExtension('subjectAltName')
  let taxIds = []
  if (ext) {
    const visit = node => {
      if (Array.isArray(node.value)) {
        const oid = node.value.find(child => child.type === forge.asn1.Type.OID && forge.asn1.derToOid(child.value) === '2.16.76.1.3.3')
        if (oid) {
          const collect = child => {
            if (Array.isArray(child.value)) child.value.forEach(collect)
            else if (typeof child.value === 'string' && /^\d{14}$/.test(child.value)) taxIds.push(child.value)
          }
          node.value.forEach(collect)
        }
        node.value.forEach(visit)
      }
    }
    try { visit(forge.asn1.fromDer(ext.value)) } catch { fail('Não foi possível validar o CNPJ do certificado A1.') }
  }
  if (!taxIds.includes(NFSE_ISSUER.taxId) || taxIds.some(value => value !== NFSE_ISSUER.taxId)) fail('O CNPJ do A1 não corresponde ao emitente único da Axis.')
  const certificatePem = forge.pki.certificateToPem(cert)
  const privateKeyPem = forge.pki.privateKeyToPem(key)
  const privateKey = createPrivateKey(privateKeyPem)
  if (!createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).equals(new X509Certificate(certificatePem).publicKey.export({ type: 'spki', format: 'der' }))) fail('Chave e certificado divergentes.')
  const chain = [cert]
  const allCerts = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).map(bag => bag.cert).filter(Boolean)
  while (chain.length < 10) {
    const tail = chain.at(-1)
    const parent = allCerts.find(candidate => !chain.includes(candidate) && tail.isIssuer(candidate))
    if (!parent) break
    chain.push(parent)
  }
  return { privateKeyPem, certificatePem, chainPem: chain.map(value => forge.pki.certificateToPem(value)).join('\n'),
    fingerprint: new X509Certificate(certificatePem).fingerprint256.replace(/:/g, ''),
    expiresAt: cert.validity.notAfter.toISOString(), taxId: NFSE_ISSUER.taxId }
}
export function signDps(xml, certificate) {
  const signer = new SignedXml({ privateKey: certificate.privateKeyPem, publicCert: certificate.certificatePem,
    // XMLDSig conforme manual nacional; TLS continua >=1.2, com validação de servidor.
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315' })
  signer.addReference({ xpath: "//*[local-name()='infDPS']", transforms: [
    'http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  ], digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1' })
  signer.computeSignature(xml, { location: { reference: "//*[local-name()='infDPS']", action: 'after' } })
  return signer.getSignedXml()
}
