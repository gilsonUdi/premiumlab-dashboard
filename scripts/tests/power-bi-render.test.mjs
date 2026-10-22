import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createReportRenderController } from '../../lib/power-bi-render.mjs';

test('mobile viewer restores original full pages without hiding or rearranging visuals', () => {
  const source = readFileSync(new URL('../../components/company/PowerBiEmbeddedView.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /customLayout|VisualContainerDisplayMode|getVisuals|mobilePlan|Modo leve|Próximo bloco/);
  assert.match(source, /reportLayoutSettings\(readReportViewport\(window\).mode, models\)/);
  assert.match(source, /phasedEmbeddingRef.current = initialViewport.mode !== 'desktop'/);
  assert.match(source, /permissions: models.Permissions.Read/);
  assert.match(source, /viewMode: models.ViewMode.View/);
  assert.match(source, /filters: Array.isArray\(config.filters\) \? config.filters : \[\]/);
});

test('SDK wrapper and handlers are stable while portal chrome updates', () => {
  const source = readFileSync(new URL('../../components/company/PowerBiEmbeddedView.jsx', import.meta.url), 'utf8');
  assert.match(source, /const StablePowerBIEmbed = memo\(PowerBIEmbed\)/);
  assert.match(source, /const eventHandlers = useMemo\(\(\) => new Map/);
  assert.match(source, /eventHandlers=\{eventHandlers\}/);
  const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');
  assert.match(css, /\.power-bi-mobile \.power-bi-toolbar,[\s\S]*?backdrop-filter: none/);
});

test('canvas orientation comes from the same measurement as its dimensions', () => {
  const source = readFileSync(new URL('../../components/company/PowerBiEmbeddedView.jsx', import.meta.url), 'utf8');
  assert.match(source, /\? previous : \{ width, height, mode \}/);
  assert.match(source, /reportCanvasWidth\(frameSize.width, frameSize.height, frameSize.mode \|\| viewport.mode, pageAspectRatio\)/);
});

test('initial draw waits for metadata, visible frame and native layout, and runs only once', async () => {
  let ready = false;
  const calls = [];
  const report = { render: async () => calls.push('render') };
  const render = createReportRenderController(() => report, () => ready,
    async () => calls.push('layout'), assert.fail);
  await render();
  assert.deepEqual(calls, []);
  ready = true;
  const first = render();
  assert.equal(render(), first);
  await first;
  for (let i = 0; i < 10; i++) await render();
  assert.deepEqual(calls, ['layout', 'render']);
});

test('hiding a tab while preparing postpones first draw until it becomes visible again', async () => {
  let ready = true;
  let release;
  const calls = [];
  const report = { render: async () => calls.push('render') };
  let first = true;
  const render = createReportRenderController(() => report, () => ready, async () => {
    calls.push('prepare');
    if (first) { first = false; await new Promise(resolve => { release = resolve; }); }
  }, assert.fail);
  const running = render();
  await Promise.resolve();
  ready = false; release(); await running;
  assert.deepEqual(calls, ['prepare']);
  ready = true; await render();
  assert.deepEqual(calls, ['prepare', 'prepare', 'render']);
});

test('replacement instances do not receive stale render commands', async () => {
  let release;
  const calls = [];
  const old = { render: async () => calls.push('old-render') };
  const next = { render: async () => calls.push('new-render') };
  let current = old;
  let first = true;
  const render = createReportRenderController(() => current, () => true, async () => {
    if (first) { first = false; await new Promise(resolve => { release = resolve; }); }
  }, assert.fail);
  const running = render(); await Promise.resolve();
  current = next; render(); release(); await running;
  assert.deepEqual(calls, ['new-render']);
});

test('unmounting while preparing cancels first draw', async () => {
  let release;
  let current = { render: async () => assert.fail('unmounted report rendered') };
  const render = createReportRenderController(() => current, () => true,
    () => new Promise(resolve => { release = resolve; }), assert.fail);
  const running = render(); await Promise.resolve();
  current = null; release(); await running;
});

test('errors are surfaced once without an automatic retry loop', async () => {
  let attempts = 0;
  const errors = [];
  const report = { render: async () => { if (++attempts === 1) throw Error('network'); } };
  const render = createReportRenderController(() => report, () => true, async () => {}, error => errors.push(error));
  await render();
  assert.equal(attempts, 1);
  assert.equal(errors.length, 1);
  await render(); await render();
  assert.equal(attempts, 2);
});

test('SDK events emitted during first draw cannot trigger a second draw', async () => {
  let attempts = 0;
  let render;
  const report = { render: async () => { attempts++; render(); } };
  render = createReportRenderController(() => report, () => true, async () => {}, assert.fail);
  await render();
  assert.equal(attempts, 1);
});
