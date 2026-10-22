import test from 'node:test';
import assert from 'node:assert/strict';
import { createReportLayoutUpdater } from '../../lib/power-bi-viewport.mjs';

function fixture() {
  const calls = [];
  const transitions = [];
  let settings = { layoutType: 'portrait' };
  let page = 'a';
  let state = { filters: ['MT'], pageFilters: ['2026'], slicers: { seller: ['Ana'], date: ['outubro'] },
    otherPages: { b: { customer: ['Cliente'] } } };
  const report = {
    updateSettings: async value => { calls.push(['layout', value.layoutType]); state = {}; },
    bookmarksManager: {
      capture: async options => { calls.push(['capture', options]); return { state: JSON.stringify(state) }; },
      applyState: async value => { calls.push(['restore']); state = JSON.parse(value); },
    },
  };
  let instance = report;
  const errors = [];
  const update = createReportLayoutUpdater(() => instance, () => true, () => settings,
    error => errors.push(error), (event, value) => transitions.push([event, value]), () => page);
  return { report, calls, transitions, errors, update,
    setLayout: layoutType => { settings = { layoutType }; },
    setPage: value => { page = value; },
    setState: value => { state = value; }, getState: () => state,
    setInstance: value => { instance = value; } };
}

test('keeps report/page filters and slicers on all pages in both rotation directions', async () => {
  const f = fixture();
  await f.update(); // Initial rendering must not capture or restore defaults.
  f.calls.length = 0;
  const selections = { report: ['MT'], page: ['2026'], slicers: { seller: ['Ana'] },
    otherPages: { b: { client: ['Cliente'] } } };
  f.setState(selections);
  f.setLayout('horizontal'); await f.update();
  assert.deepEqual(f.getState(), selections);
  f.setState({ ...selections, report: ['GO'] });
  f.setLayout('portrait'); await f.update();
  assert.deepEqual(f.getState(), { ...selections, report: ['GO'] });
  assert.deepEqual(f.calls, [
    ['capture', { allPages: true }], ['layout', 'horizontal'], ['restore'],
    ['capture', { allPages: true }], ['layout', 'portrait'], ['restore'],
  ]);
});

test('resize and page navigation do not reapply old selections or recapture state', async () => {
  const f = fixture(); await f.update();
  f.calls.length = 0;
  await f.update();
  assert.deepEqual(f.calls, []);
  f.setPage('b'); await f.update();
  assert.deepEqual(f.calls, [['layout', 'portrait']]);
});

test('late capture cannot restore a page the user has already left', async () => {
  const f = fixture(); await f.update();
  let release;
  f.report.bookmarksManager.capture = () => new Promise(resolve => { release = resolve; });
  f.setLayout('horizontal'); const running = f.update();
  await Promise.resolve();
  f.setPage('b'); f.update();
  release({ state: 'old-page' }); await running;
  assert.equal(f.calls.filter(([name]) => name === 'restore').length, 0);
  assert.deepEqual(f.calls.at(-1), ['layout', 'horizontal']);
});

test('navigation during updateSettings prevents restoring the previous page', async () => {
  const f = fixture(); await f.update();
  let release; let blocked = true;
  f.report.updateSettings = async () => { if (blocked) { blocked = false; await new Promise(resolve => { release = resolve; }); } };
  f.setLayout('horizontal'); const running = f.update();
  await Promise.resolve(); await Promise.resolve();
  f.setPage('b'); f.update(); release(); await running;
  assert.equal(f.calls.filter(([name]) => name === 'restore').length, 0);
});

test('a replacement report cannot receive the previous instance bookmark', async () => {
  const f = fixture(); await f.update();
  let release;
  f.report.bookmarksManager.capture = () => new Promise(resolve => { release = resolve; });
  f.setLayout('horizontal'); const running = f.update(); await Promise.resolve();
  const nextCalls = [];
  f.setInstance({ updateSettings: async value => nextCalls.push(value.layoutType) });
  f.update(); release({ state: 'old-report' }); await running;
  assert.deepEqual(nextCalls, ['horizontal']);
  assert.equal(f.calls.filter(([name]) => name === 'restore').length, 0);
});

test('SDK capture/apply failures are observable without render loops or leaked state', async () => {
  const f = fixture(); await f.update();
  f.report.bookmarksManager.capture = async () => { throw new Error('capture failed'); };
  f.setLayout('horizontal'); await f.update();
  assert.equal(f.errors.length, 1);
  assert.ok(f.transitions.some(([event]) => event === 'state_capture_failed'));
  f.report.bookmarksManager.capture = async () => ({ state: 'private-state' });
  f.report.bookmarksManager.applyState = async () => { throw new Error('restore failed'); };
  f.setLayout('portrait'); await f.update(); await f.update();
  assert.equal(f.errors.length, 2);
  assert.ok(f.transitions.some(([event]) => event === 'state_restore_failed'));
  assert.doesNotMatch(JSON.stringify(f.transitions), /private-state/);
});

test('rendered callbacks during restore do not repeat the same transition', async () => {
  const f = fixture(); await f.update();
  f.report.bookmarksManager.applyState = async () => { f.calls.push(['restore']); f.update(); };
  f.setLayout('horizontal'); await f.update();
  assert.equal(f.calls.filter(([name]) => name === 'restore').length, 1);
});
