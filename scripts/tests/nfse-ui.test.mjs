import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vm from 'node:vm'
import * as domain from '../../lib/nfse-drafts.mjs'

// Permite usar dependências isoladas sem instalar dentro da pasta sincronizada do Drive.
const requireReact = process.env.NFSE_UI_REACT_MODULES ? createRequire(resolve(process.env.NFSE_UI_REACT_MODULES, '../package.json')) : createRequire(import.meta.url)
const requireNext = process.env.NFSE_UI_NEXT_MODULES ? createRequire(resolve(process.env.NFSE_UI_NEXT_MODULES, '../package.json')) : createRequire(import.meta.url)
const React = requireReact('react')
const { act, create } = requireReact('react-test-renderer')
const babel = requireNext('next/dist/compiled/babel/bundle.js')
const source = readFileSync(new URL('../../components/admin/NfsePanel.jsx', import.meta.url), 'utf8')
const code = babel.core().transformSync(source, { filename: 'NfsePanel.jsx', babelrc: false, configFile: false,
  presets: [[babel.presetReact(), { runtime: 'classic' }]], plugins: [babel.pluginTransformModulesCommonjs()] }).code
const labelText = node => typeof node === 'string' ? node : (node.children || []).map(labelText).join('')

async function renderPanel({ fail = false } = {}) {
  const customer = { id: 'a'.repeat(64), name: 'Cliente teste', taxId: domain.NFSE_ISSUER.taxId }
  const posts = []
  const modules = { react: React, 'lucide-react': new Proxy({}, { get: () => () => null }),
    '@/lib/portal-store': { getPortalAccessToken: async () => 'local-test-token' }, '@/lib/nfse-drafts.mjs': domain }
  const module = { exports: {} }
  const states = []
  vm.runInNewContext(code, { module, exports: module.exports, React, console, Intl, Date,
    crypto: { randomUUID: () => '12345678-1234-4234-8234-123456789012' },
    window: { addEventListener() {}, removeEventListener() {}, confirm: () => true },
    require: name => modules[name],
    fetch: async (_url, options) => {
      if (!options.body) return { ok: !fail, json: async () => fail ? { error: 'Acesso negado' } : {
        issuer: domain.normalizeIssuerSettings({}), customers: [customer], drafts: [], truncated: { customers: false, drafts: false }, emissionEnabled: false } }
      const body = JSON.parse(options.body); posts.push(body)
      if (body.action === 'saveDraft') return { ok: true, json: async () => ({ draft: { ...domain.normalizeInvoiceDraft(body.data),
        id: body.id, customer, revision: 1, updatedAt: '2026-11-04T12:00:00Z' } }) }
      throw new Error(`Unexpected action: ${body.action}`)
    },
  })
  let renderer
  await act(async () => { renderer = create(React.createElement(module.exports.default, { onNavigationState: state => states.push(state) })) })
  const button = name => renderer.root.findAllByType('button').find(node => labelText(node).includes(name))
  const field = name => renderer.root.findAllByType('label').find(node => labelText(node).includes(name)).findByType(name === 'Cliente fiscal *' ? 'select' : 'input')
  return { renderer, button, field, posts, states }
}
test('interface carrega, abre rascunho e mantém emissão e certificado indisponíveis', async () => {
  const ui = await renderPanel()
  await act(async () => ui.button('Novo rascunho').props.onClick())
  assert.equal(ui.button('Emitir NFS-e').props.disabled, true)
  assert.equal(ui.renderer.root.findAllByType('input').some(node => node.props.type === 'file'), false)
  assert.equal(ui.posts.length, 0)
  await act(async () => ui.renderer.unmount())
})
test('salva rascunho, apresenta confirmação e reutiliza revisão ao editar', async () => {
  const ui = await renderPanel()
  await act(async () => ui.button('Novo rascunho').props.onClick())
  await act(async () => ui.field('Cliente fiscal *').props.onChange({ target: { value: 'a'.repeat(64) } }))
  await act(async () => ui.field('Valor dos serviços').props.onChange({ target: { value: '150,10' } }))
  await act(async () => ui.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }))
  assert.equal(ui.posts.length, 1); assert.equal(ui.posts[0].action, 'saveDraft'); assert.equal(ui.posts[0].revision, 0)
  assert.ok(ui.renderer.root.findAllByProps({ role: 'status' }).some(node => labelText(node).includes('Nenhuma nota fiscal foi emitida')))
  assert.equal(ui.states.at(-1).dirty, false)
  await act(async () => ui.renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }))
  assert.equal(ui.posts[1].id, ui.posts[0].id); assert.equal(ui.posts[1].revision, 1)
  assert.equal(ui.posts.some(body => body.action === 'emit'), false)
  await act(async () => ui.renderer.unmount())
})
test('erro de acesso fica visível sem apresentar formulário de emissão', async () => {
  const ui = await renderPanel({ fail: true })
  assert.equal(labelText(ui.renderer.root.findByProps({ role: 'alert' })), 'Acesso negado')
  assert.equal(ui.renderer.root.findAllByType('form').length, 0)
  await act(async () => ui.renderer.unmount())
})
