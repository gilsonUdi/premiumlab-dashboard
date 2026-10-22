import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { shouldOptimizeMobileReport, buildMobileReportPlan, createMobileReportOptimizer } from '../../lib/power-bi-mobile.mjs';

const require = createRequire(import.meta.url);
const models = require('powerbi-models');
const visual = (name, type = 'denebCustom', y = 0) => ({ name, type, title: name,
  layout: { x: 0, y, width: 400, height: 220 } });
const inventory = new Map([
  ['a', [visual('logo', 'image'), ...Array.from({ length: 7 }, (_, i) => visual('f' + i, 'slicer', i)),
    ...Array.from({ length: 11 }, (_, i) => visual('v' + i, 'denebCustom', i))]],
  ['b', [visual('tabela', 'tableEx')]],
]);
const visibleNames = plan => Object.entries(plan.settings.customLayout.pagesLayout[plan.pageName].visualsLayout)
  .filter(([, layout]) => layout.displayState.mode === models.VisualContainerDisplayMode.Visible).map(([name]) => name);

test('rollout affects only Gradual mobile; desktop and other companies are unchanged', () => {
  assert.equal(shouldOptimizeMobileReport('lentes-gradual', 'portrait'), true);
  assert.equal(shouldOptimizeMobileReport('lentes-gradual', 'landscape'), true);
  assert.equal(shouldOptimizeMobileReport('lentes-gradual', 'desktop'), false);
  assert.equal(shouldOptimizeMobileReport('artlens', 'portrait'), false);
});

test('11 heavy visuals are split into blocks of two without losing any indicator', () => {
  const reached = [];
  for (let block = 0; block < 6; block++) {
    const plan = buildMobileReportPlan(inventory, { pageName: 'a', block }, models);
    assert.equal(plan.chartCount, 11);
    assert.equal(plan.filterCount, 7);
    assert.equal(plan.blocks, 6);
    assert.ok(plan.visibleCount <= 2);
    reached.push(...visibleNames(plan));
    assert.ok(Object.values(plan.settings.customLayout.pagesLayout.b.visualsLayout)
      .every(layout => layout.displayState.mode === models.VisualContainerDisplayMode.Hidden));
  }
  assert.deepEqual(reached, Array.from({ length: 11 }, (_, i) => 'v' + i));
});

test('filters have their own blocks of four; chart visibility remains off', () => {
  const reached = [];
  for (let block = 0; block < 2; block++) {
    const plan = buildMobileReportPlan(inventory, { pageName: 'a', mode: 'filters', block }, models);
    reached.push(...visibleNames(plan));
    assert.ok(plan.visibleCount <= 4);
    assert.ok(visibleNames(plan).every(name => name.startsWith('f')));
  }
  assert.deepEqual(reached, Array.from({ length: 7 }, (_, i) => 'f' + i));
});

test('both orientations use Custom and bounded canvas, with readable responsive sizes', () => {
  const portrait = buildMobileReportPlan(inventory, { pageName: 'a' }, models);
  const landscape = buildMobileReportPlan(inventory, { pageName: 'a', landscape: true }, models);
  assert.equal(portrait.settings.layoutType, models.LayoutType.Custom);
  assert.equal(landscape.settings.layoutType, models.LayoutType.Custom);
  assert.equal(portrait.settings.customLayout.displayOption, models.DisplayOption.FitToWidth);
  assert.ok(portrait.settings.customLayout.pageSize.height <= 1000);
  assert.ok(landscape.settings.customLayout.pageSize.height <= 1000);
  const p = portrait.settings.customLayout.pagesLayout.a.visualsLayout;
  const l = landscape.settings.customLayout.pagesLayout.a.visualsLayout;
  assert.ok(p.v1.y > p.v0.y);
  assert.equal(l.v1.y, l.v0.y);
  assert.ok(l.v1.x > l.v0.x);
});

test('generated layouts pass the installed Power BI SDK settings validator', () => {
  for (const landscape of [false, true]) for (const mode of ['content', 'filters']) {
    const plan = buildMobileReportPlan(inventory, { pageName: 'a', mode, landscape }, models);
    assert.equal(models.validateSettings(plan.settings), undefined);
  }
});

test('invalid blocks are clamped, empty pages work and unauthorized pages fail closed', () => {
  assert.equal(buildMobileReportPlan(inventory, { pageName: 'a', block: 999 }, models).block, 5);
  assert.equal(buildMobileReportPlan(inventory, { pageName: 'a', block: -3 }, models).block, 0);
  assert.equal(buildMobileReportPlan(new Map([['empty', []]]), { pageName: 'empty' }, models).visibleCount, 0);
  assert.throws(() => buildMobileReportPlan(inventory, { pageName: 'secret' }, models), /não autorizada/);
});

function fixture() {
  const calls = [];
  const plans = [];
  const hidden = visual('authored-hidden');
  hidden.layout.displayState = { mode: models.VisualContainerDisplayMode.Hidden };
  let activePage = 'a';
  const report = {
    getPages: async () => [
      { name: 'secret', getVisuals: async () => { assert.fail('unauthorized metadata'); } },
      { name: 'a', getVisuals: async () => { calls.push('metadata:a'); return [...inventory.get('a'), hidden]; } },
      { name: 'b', getVisuals: async () => { calls.push('metadata:b'); return inventory.get('b'); } },
    ],
    updateSettings: async settings => { calls.push(['settings', settings]); },
    setFilters: () => assert.fail('must not rewrite filters'),
    removeFilters: () => assert.fail('must not clear filters'),
    render: async () => calls.push('render'),
  };
  let current = report;
  const optimizer = createMobileReportOptimizer(models, (r, p) => r === current && p === activePage, plan => plans.push(plan));
  return { calls, plans, report, optimizer, setPage: p => { activePage = p; }, setReport: r => { current = r; } };
}

test('inventory reads only allowed metadata once and hides authored-hidden visuals', async () => {
  const f = fixture();
  await f.optimizer.update(f.report, { pageName: 'a' }, ['a', 'b']);
  const first = f.plans[0];
  assert.equal(first.chartCount, 11);
  assert.equal(first.settings.customLayout.pagesLayout.a.visualsLayout['authored-hidden'], undefined);
  await f.optimizer.update(f.report, { pageName: 'a', block: 1 }, ['a', 'b']);
  await f.optimizer.update(f.report, { pageName: 'a', mode: 'filters' }, ['a', 'b']);
  assert.equal(f.calls.filter(c => c === 'metadata:a').length, 1);
  assert.equal(f.calls.filter(c => c === 'metadata:b').length, 1);
  assert.equal(f.calls.filter(c => c === 'render').length, 0);
});

test('all other blocks are explicitly hidden, so merged SDK layouts cannot accumulate charts', async () => {
  const f = fixture();
  await f.optimizer.update(f.report, { pageName: 'a' }, ['a', 'b']);
  await f.optimizer.update(f.report, { pageName: 'a', block: 1 }, ['a', 'b']);
  const plan = f.plans.at(-1);
  assert.equal(plan.settings.customLayout.pagesLayout.a.visualsLayout.v0.displayState.mode, models.VisualContainerDisplayMode.Hidden);
  assert.equal(plan.settings.customLayout.pagesLayout.a.visualsLayout.v2.displayState.mode, models.VisualContainerDisplayMode.Visible);
});

test('rendered/resize callbacks deduplicate while mode changes and rotations are applied', async () => {
  const f = fixture();
  await f.optimizer.update(f.report, { pageName: 'a' }, ['a', 'b']);
  await f.optimizer.update(f.report, { pageName: 'a' }, ['a', 'b']);
  assert.equal(f.plans.length, 1);
  await f.optimizer.update(f.report, { pageName: 'a', landscape: true }, ['a', 'b']);
  assert.equal(f.plans.length, 2);
  assert.equal(f.plans.at(-1).settings.layoutType, models.LayoutType.Custom);
});

test('late page inventory does not send an obsolete page layout', async () => {
  const f = fixture();
  let release;
  const getPages = f.report.getPages;
  f.report.getPages = async () => { await new Promise(resolve => { release = resolve; }); return getPages(); };
  const running = f.optimizer.update(f.report, { pageName: 'a' }, ['a', 'b']);
  await Promise.resolve();
  f.setPage('b');
  f.optimizer.update(f.report, { pageName: 'b' }, ['a', 'b']);
  release(); await running;
  assert.deepEqual(f.plans.map(p => p.pageName), ['b']);
});

test('replacement instances and interrupted loading do not apply stale layouts', async () => {
  const f = fixture();
  let release;
  f.report.getPages = () => new Promise(resolve => { release = resolve; });
  const running = f.optimizer.update(f.report, { pageName: 'a' }, ['a']);
  await Promise.resolve();
  f.setReport(null); release([]); await running;
  assert.equal(f.plans.length, 0);
  assert.equal(f.calls.length, 0);
});

test('SDK failure is retryable and never silently renders the heavy full report', async () => {
  const f = fixture();
  f.report.updateSettings = async () => { throw Error('SDK failed'); };
  await assert.rejects(f.optimizer.update(f.report, { pageName: 'a' }, ['a', 'b']), /SDK failed/);
  f.report.updateSettings = async () => {};
  await f.optimizer.update(f.report, { pageName: 'a' }, ['a', 'b']);
  assert.equal(f.plans.length, 1);
  assert.ok(!f.calls.includes('render'));
});

test('component prepares mobile layout before first render and does not enable CSS zoom', () => {
  const source = readFileSync(new URL('../../components/company/PowerBiEmbeddedView.jsx', import.meta.url), 'utf8');
  assert.match(source, /phasedEmbedding=\{mobileOptimizationRef.current\}/);
  assert.match(source, /await updateMobileReport\(\)[\s\S]*?await report.render\(\)/);
  assert.match(source, /const effectiveZoom = mobileOptimizationRef.current \? 1/);
  assert.match(source, /isLandscape && !mobileOptimizationRef.current/);
  assert.doesNotMatch(source, /key=\{.*(?:mobilePlan|viewport.mode)/);
});
