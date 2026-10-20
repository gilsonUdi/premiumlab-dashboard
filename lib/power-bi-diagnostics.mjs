const MAX_EVENTS = 60;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FIELDS = new Set(['status', 'width', 'height', 'mode', 'persisted', 'navigation', 'discarded', 'previousOpen', 'outcome', 'timeOrigin']);

/** Local, bounded, per-tab trace. No URLs, tokens, user names or report data. */
export function createReportDiagnostics(browser, reportKey, now = () => Date.now()) {
  const key = `axis:bi-diagnostic:v1:${reportKey}`;
  let previous;
  try { previous = JSON.parse(browser.sessionStorage.getItem(key)); } catch { previous = null; }
  const recent = previous?.version === 1 && Number.isFinite(previous.savedAt)
    && now() - previous.savedAt < MAX_AGE_MS;
  const events = recent && Array.isArray(previous.events) ? previous.events.slice(-MAX_EVENTS) : [];
  let open = true;
  function record(event, details = {}) {
    const safe = {};
    for (const [field, value] of Object.entries(details)) {
      if (!FIELDS.has(field)) continue;
      if (typeof value === 'number' && Number.isFinite(value)) safe[field] = value;
      else if (typeof value === 'boolean') safe[field] = value;
      else if (typeof value === 'string') safe[field] = value.slice(0, 40);
    }
    events.push({ time: now(), event, ...safe });
    events.splice(0, Math.max(0, events.length - MAX_EVENTS));
    try { browser.sessionStorage.setItem(key, JSON.stringify({ version: 1, savedAt: now(), open, events })); } catch { /* storage can be blocked */ }
  }
  const navigation = browser.performance?.getEntriesByType?.('navigation')?.[0]?.type || 'unknown';
  record('page_start', { navigation, discarded: typeof browser.document?.wasDiscarded === 'boolean' ? browser.document.wasDiscarded : 'unknown',
    previousOpen: Boolean(recent && previous.open), timeOrigin: browser.performance?.timeOrigin || 0 });
  return {
    record,
    close() { open = false; record('view_closed'); },
    snapshot() { return JSON.stringify({ version: 1, events }, null, 2); },
  };
}
