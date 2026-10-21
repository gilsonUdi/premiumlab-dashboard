import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readReportViewport, observeReportViewport, reportLayoutSettings, reportCanvasWidth, createReportLayoutUpdater } from '../../lib/power-bi-viewport.mjs';

function browser(width, height, touch = true, orientation = '') {
  const events = new Map();
  const timers = new Map();
  let timerId = 0;
  const pointer = {
    matches: touch,
    addEventListener: (event, handler) => events.set(`pointer:${event}`, handler),
    removeEventListener: event => events.delete(`pointer:${event}`),
  };
  return {
    innerWidth: width, innerHeight: height, screen: { orientation: { type: orientation } },
    navigator: { maxTouchPoints: touch ? 5 : 0 }, matchMedia: () => pointer,
    addEventListener: (event, handler) => events.set(event, handler),
    removeEventListener: event => events.delete(event),
    setTimeout: handler => { timers.set(++timerId, handler); return timerId; },
    clearTimeout: id => timers.delete(id),
    emit: event => events.get(event)?.(),
    flush: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); },
    events, timers,
  };
}

test('portrait, landscape, small phones, tablets and desktop use the right layout', () => {
  assert.equal(readReportViewport(browser(390,844)).mode, 'portrait');
  assert.equal(readReportViewport(browser(844,390)).mode, 'landscape');
  assert.equal(readReportViewport(browser(667,375)).mode, 'landscape');
  assert.equal(readReportViewport(browser(1180,820)).mode, 'landscape');
  assert.equal(readReportViewport(browser(1440,900,false)).mode, 'desktop');
  // A software keyboard must not turn a portrait phone into a landscape report.
  assert.equal(readReportViewport(browser(390,300,true,'portrait-primary')).mode, 'portrait');
});

test('rotation burst settles once, and cleanup cancels pending timers/listeners', () => {
  const phone = browser(390,844);
  const modes = [];
  const cleanup = observeReportViewport(phone, view => modes.push(view.mode));
  phone.innerWidth = 844; phone.innerHeight = 390;
  phone.emit('orientationchange'); phone.emit('resize'); phone.emit('resize');
  assert.equal(phone.timers.size, 1);
  phone.flush();
  assert.deepEqual(modes, ['portrait','landscape']);
  phone.emit('resize'); cleanup(); phone.flush();
  assert.equal(phone.events.size, 0);
  assert.equal(modes.length, 2);
});

test('uses native MobileLandscape instead of a desktop Master on phones', () => {
  const models = { LayoutType: { Master: 0, MobilePortrait: 2, MobileLandscape: 3 } };
  assert.deepEqual(reportLayoutSettings('portrait',models), { layoutType: 2 });
  assert.deepEqual(reportLayoutSettings('landscape',models), { layoutType: 3 });
  assert.deepEqual(reportLayoutSettings('desktop',models), { layoutType: 0 });
});

test('Safari visible area excludes browser bars and follows viewport offsets', () => {
  const phone = browser(844, 390, true, 'landscape-primary');
  phone.visualViewport = { width: 844, height: 268, offsetTop: 42, offsetLeft: 0, scale: 1 };
  assert.deepEqual(readReportViewport(phone).bounds, { width: 844, height: 268, top: 42, left: 0 });
  phone.visualViewport = { width: 422, height: 134, offsetTop: 80, offsetLeft: 30, scale: 2 };
  assert.deepEqual(readReportViewport(phone).bounds, { width: 844, height: 390, top: 0, left: 0 });
});

test('first rotation follows visual viewport and screen orientation events and cleans up', () => {
  const phone = browser(390, 844, true, 'portrait-primary');
  phone.visualViewport = { width: 390, height: 700, scale: 1,
    addEventListener: (event, handler) => phone.events.set(`visual:${event}`, handler),
    removeEventListener: event => phone.events.delete(`visual:${event}`) };
  phone.screen.orientation.addEventListener = (event, handler) => phone.events.set(`screen:${event}`, handler);
  phone.screen.orientation.removeEventListener = event => phone.events.delete(`screen:${event}`);
  const views = [];
  const cleanup = observeReportViewport(phone, value => views.push(value));
  // The window event can arrive before Safari has changed its actual visible area.
  phone.emit('orientationchange'); phone.flush();
  phone.innerWidth = 844; phone.innerHeight = 390;
  phone.screen.orientation.type = 'landscape-primary';
  phone.visualViewport.width = 844; phone.visualViewport.height = 268;
  phone.emit('visual:resize'); phone.emit('screen:change'); phone.flush();
  assert.equal(views.at(-1).mode, 'landscape');
  assert.equal(views.at(-1).bounds.height, 268);
  phone.visualViewport.height = 320;
  phone.emit('visual:scroll'); phone.flush();
  assert.equal(views.at(-1).bounds.height, 320);
  cleanup();
  assert.equal(phone.events.size, 0);
});

test('a report loaded at zero size receives layout after its first measurable frame', async () => {
  let width = 0; let height = 0;
  const layouts = [];
  const update = createReportLayoutUpdater(() => ({ updateSettings: async settings => layouts.push(settings.layoutType) }),
    () => width > 0 && height > 0, () => ({ layoutType: 3 }), assert.fail);
  await update();
  assert.deepEqual(layouts, []);
  width = 672; height = 210;
  await update();
  assert.deepEqual(layouts, [3]);
});

test('BI surface overrides global 100vh and updates settings after frame measurements', () => {
  const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../../components/company/PowerBiEmbeddedView.jsx', import.meta.url), 'utf8');
  assert.match(css, /\.portal-page\.power-bi-page\s*\{\s*min-height: 0/);
  assert.match(source, /height: viewport.bounds.height/);
  assert.match(source, /\[viewport.mode, frameSize.width, frameSize.height\]/);
  assert.match(source, /grid h-full min-h-0/);
  const loaded = source.slice(source.indexOf("recordDiagnostic('sdk_loaded')"));
  assert.ok(loaded.indexOf('await layoutUpdaterRef.current()') < loaded.indexOf('getActivePage()'));
});

test('browser pinch does not switch report layout; a real rotation still does', () => {
  const phone = browser(844,390);
  const modes = [];
  const cleanup = observeReportViewport(phone, view => modes.push(view.mode));
  phone.visualViewport = { scale: 2 };
  phone.innerWidth = 400; phone.innerHeight = 600;
  phone.emit('resize'); phone.flush();
  assert.deepEqual(modes,['landscape']);
  phone.screen.orientation.type = 'portrait-primary';
  phone.emit('orientationchange'); phone.flush();
  assert.deepEqual(modes,['landscape','portrait']);
  cleanup();
});

test('wide pages get scrollable width rather than clipping; portrait/desktop fit host', () => {
  assert.equal(reportCanvasWidth(650,300,'landscape',3), 900);
  assert.equal(reportCanvasWidth(844,250,'landscape'), 844);
  assert.equal(reportCanvasWidth(390,700,'portrait',3), 390);
  assert.equal(reportCanvasWidth(1440,900,'desktop',3), 1440);
});

test('late SDK response cannot restore an outdated orientation', async () => {
  let settings = { layoutType: 'portrait' };
  let release;
  const applied = [];
  const report = { updateSettings: async value => {
    applied.push(value.layoutType);
    if (applied.length === 1) await new Promise(resolve => { release = resolve; });
  } };
  const update = createReportLayoutUpdater(() => report, () => true, () => settings, assert.fail);
  const running = update();
  await Promise.resolve();
  settings = { layoutType: 'landscape' };
  update(); update();
  release(); await running;
  assert.deepEqual(applied, ['portrait','landscape']);
});

test('only applies settings after report loaded, without resetting or embedding', async () => {
  let ready = false;
  let count = 0;
  const update = createReportLayoutUpdater(() => ({ updateSettings: async () => count++ }),
    () => ready, () => ({ layoutType: 'portrait' }), assert.fail);
  await update(); assert.equal(count,0);
  ready = true;
  await update(); assert.equal(count,1);
});

test('component does not remount on orientation or replace config on token renewal', () => {
  const source = readFileSync(new URL('../../components/company/PowerBiEmbeddedView.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(source, /key=\{powerBiLayout/);
  const refresh = source.slice(source.indexOf('const refreshEmbedToken ='),source.indexOf('useEffect(() => observeReportViewport'));
  assert.match(refresh, /setAccessToken/);
  assert.doesNotMatch(refresh, /setConfig\(/);
  assert.match(source, /\}, \[config\]\)/);
});
