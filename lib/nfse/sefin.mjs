import https from 'node:https'
import { gzipSync, gunzipSync } from 'node:zlib'

export const SEFIN_URLS = Object.freeze({ test: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional', production: 'https://sefin.nfse.gov.br/SefinNacional' })
export function sefinBase(environment, env = process.env) {
  if (!Object.hasOwn(SEFIN_URLS, environment)) throw new Error('Ambiente fiscal inválido.')
  const value = environment === 'test' ? (env.NFSE_SEFIN_TEST_BASE_URL || SEFIN_URLS.test) : SEFIN_URLS.production
  if (![SEFIN_URLS.test, 'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional', SEFIN_URLS.production].includes(value)
    || (environment === 'test' && value === SEFIN_URLS.production)) throw new Error('Endereço SEFIN não permitido.')
  return value
}
export function unpackFiscalXml(value) {
  if (typeof value !== 'string' || value.length > 800000 || !/^[A-Za-z0-9+/=\s]+$/.test(value)) throw new Error('Retorno fiscal compactado inválido.')
  return gunzipSync(Buffer.from(value, 'base64'), { maxOutputLength: 600000 }).toString('utf8')
}
export function packDps(xml) { return { dpsXmlGZipB64: gzipSync(Buffer.from(xml, 'utf8')).toString('base64') } }
export function createSefinClient(certificate, environment, { env = process.env, request = https.request } = {}) {
  const base = sefinBase(environment, env)
  const agent = new https.Agent({ key: certificate.privateKeyPem, cert: certificate.chainPem || certificate.certificatePem, minVersion: 'TLSv1.2', rejectUnauthorized: true, keepAlive: false })
  async function call(method, path, data) {
    // Somente caminhos construídos pelo conector, sem redirects nem URL arbitrária.
    const body = data ? JSON.stringify(data) : null
    return new Promise((resolve, reject) => {
      const req = request(`${base}${path}`, { method, agent, headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}) } }, res => {
        let size = 0
        const chunks = []
        res.on('data', chunk => { size += chunk.length; if (size > 1000000) { req.destroy(new Error('Resposta SEFIN excedeu o limite. Consulte a DPS antes de tentar novamente.')); return } chunks.push(chunk) })
        res.on('error', () => reject(new Error('Conexão interrompida ao receber a resposta SEFIN. Consulte a DPS.')))
        res.on('end', () => {
          let payload
          try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { payload = null }
          resolve({ status: res.statusCode, payload })
        })
      })
      const timer = setTimeout(() => req.destroy(new Error('Tempo limite na SEFIN. A nota pode ter sido autorizada; consulte a DPS antes de qualquer nova emissão.')), 60000)
      req.on('close', () => clearTimeout(timer))
      req.on('error', () => reject(new Error('Não foi possível concluir a comunicação com a SEFIN. Consulte a DPS; não reenvie automaticamente.')))
      if (body) req.write(body)
      req.end()
    })
  }
  return {
    submit: xml => call('POST', '/nfse', packDps(xml)),
    lookupDps: id => { if (!/^DPS\d{42}$/.test(id)) throw new Error('Identificador da DPS inválido.'); return call('GET', `/dps/${id}`) },
    lookupInvoice: key => { if (!/^\d{50}$/.test(key)) throw new Error('Chave de acesso inválida.'); return call('GET', `/nfse/${key}`) },
    close: () => agent.destroy(),
  }
}
export function fiscalResponseError(response) {
  const errors = response.payload?.erros || response.payload?.Erros || []
  if (!Array.isArray(errors)) return `SEFIN HTTP ${response.status}: resposta não reconhecida. Consulte a DPS.`
  return errors.slice(0, 8).map(error => `${String(error.Codigo || error.codigo || '').slice(0, 30)}: ${String(error.Descricao || error.descricao || '').slice(0, 500)} ${String(error.Complemento || error.complemento || '').slice(0, 500)}`).join(' | ')
    || `SEFIN HTTP ${response.status}: consulte a situação da DPS.`
}
