import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardHeartbeatOutcome, sendDashboardHeartbeat } from '../../lib/power-bi-session-client.mjs';
import { createReportDiagnostics } from '../../lib/power-bi-diagnostics.mjs';

test('temporary failures do not expire the dashboard', () => {
  for (const status of [0,408,429,500,502,503,504]) {
    assert.equal(dashboardHeartbeatOutcome(status,{active:false}),'retry');
  }
  assert.equal(dashboardHeartbeatOutcome(200,null),'retry');
  assert.equal(dashboardHeartbeatOutcome(200,{active:true}),'active');
  assert.equal(dashboardHeartbeatOutcome(200,{active:false}),'ended');
  for (const status of [401,403,404]) assert.equal(dashboardHeartbeatOutcome(status,{}),'ended');
});

test('each heartbeat renews auth headers, with one forced refresh on 401', async () => {
  const refreshes = []; const sentHeaders = [];
  const headers = async force => { refreshes.push(force); return { Authorization: force ? 'new' : 'current' }; };
  let calls = 0;
  const fetcher = async (url, options) => {
    assert.equal(url,'/api/power-bi/session');
    sentHeaders.push(options.headers.Authorization);
    return { status: ++calls === 1 ? 401 : 200, json: async () => ({active:true}) };
  };
  assert.equal((await sendDashboardHeartbeat(fetcher,headers,{sessionId:'test'})).outcome,'active');
  assert.deepEqual(refreshes,[false,true]);
  assert.deepEqual(sentHeaders,['current','new']);
  await sendDashboardHeartbeat(fetcher,headers,{});
  assert.equal(refreshes.length,3);
  assert.equal(refreshes[2],false);
});

test('revoked access is respected; network loss is not reported as expiration', async () => {
  let calls = 0;
  const denied = await sendDashboardHeartbeat(async () => {
    calls++; return {status:401,json:async () => ({})};
  },async () => ({}),{});
  assert.equal(calls,2);
  assert.equal(denied.outcome,'ended');
  await assert.rejects(() => sendDashboardHeartbeat(async () => {throw Error('offline');},async () => ({}),{}),/offline/);
});

test('HTML error responses leave the live report eligible for retry', async () => {
  const result = await sendDashboardHeartbeat(async () => ({status:502,json:async () => {throw Error('HTML');}}),async () => ({}),{});
  assert.equal(result.outcome,'retry');
});

function fakeBrowser() {
  const data = new Map();
  return { document: {wasDiscarded:false}, performance: { timeOrigin: 100, getEntriesByType: () => [{type:'navigate'}] },
    sessionStorage: { getItem: key => data.get(key), setItem: (key,value) => data.set(key,value) } };
}

test('local trace distinguishes reload/discard and preserves history across reload', () => {
  const browser = fakeBrowser();
  const initial = createReportDiagnostics(browser,'report',() => 1000);
  initial.record('iframe_loaded');
  browser.document.wasDiscarded = true;
  browser.performance.timeOrigin = 200;
  browser.performance.getEntriesByType = () => [{type:'reload'}];
  const next = createReportDiagnostics(browser,'report',() => 2000);
  const events = JSON.parse(next.snapshot()).events;
  assert.equal(events[1].event,'iframe_loaded');
  assert.deepEqual(events.at(-1),{time:2000,event:'page_start',navigation:'reload',discarded:true,previousOpen:true,timeOrigin:200});
});

test('diagnostics are bounded, do not store credentials/data and survive blocked storage', () => {
  const browser = fakeBrowser();
  const trace = createReportDiagnostics(browser,'report',() => 1000);
  for (let i=0;i<100;i++) trace.record('heartbeat',{status:200,accessToken:'secret',email:'private',body:'report data'});
  const snapshot = trace.snapshot();
  assert.equal(JSON.parse(snapshot).events.length,60);
  assert.doesNotMatch(snapshot,/secret|private|report data/);
  trace.close();
  assert.equal(JSON.parse(createReportDiagnostics(browser,'report',() => 2000).snapshot()).events.at(-1).previousOpen,false);
  browser.sessionStorage.getItem = () => {throw Error('blocked');};
  browser.sessionStorage.setItem = () => {throw Error('blocked');};
  assert.doesNotThrow(() => createReportDiagnostics(browser,'report').record('iframe_loaded'));
});

test('diagnostics recover a lost tab history from local backup and refresh capture time', () => {
  const browser = fakeBrowser();
  const backup = new Map();
  browser.localStorage = { getItem: key => backup.get(key), setItem: (key, value) => backup.set(key, value) };
  let time = 1000;
  const first = createReportDiagnostics(browser, 'report', () => time);
  first.record('sdk_rendered');
  browser.sessionStorage = { getItem: () => null, setItem: () => {} };
  time = 2000;
  const recovered = createReportDiagnostics(browser, 'report', () => time);
  const snapshot = JSON.parse(recovered.snapshot());
  assert.equal(snapshot.capturedAt, 2000);
  assert.ok(snapshot.events.some(event => event.event === 'sdk_rendered'));
  assert.equal(snapshot.events.at(-1).event, 'history_recovered');
  time = 3000;
  recovered.record('page_alive', { outcome: 'loaded' });
  assert.equal(JSON.parse(recovered.snapshot()).capturedAt, 3000);
  assert.equal(JSON.parse(recovered.snapshot()).events.at(-1).event, 'page_alive');
});

test('layout and iframe diagnostic fields exclude report content and credentials', () => {
  const trace = createReportDiagnostics(fakeBrowser(), 'report', () => 1000);
  trace.record('layout_applied', { layoutType: 0, accessToken: 'secret', settings: { private: true } });
  trace.record('iframe_geometry', { width: 672, height: 327, outcome: 'visible-size', src: 'private-url' });
  const events = JSON.parse(trace.snapshot()).events;
  assert.deepEqual(events.at(-2), { time: 1000, event: 'layout_applied', layoutType: 0 });
  assert.deepEqual(events.at(-1), { time: 1000, event: 'iframe_geometry', width: 672, height: 327, outcome: 'visible-size' });
  assert.doesNotMatch(trace.snapshot(), /secret|private-url|settings/);
});
