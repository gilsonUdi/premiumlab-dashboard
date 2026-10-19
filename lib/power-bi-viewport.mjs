export function readReportViewport(browser) {
  const width = browser.innerWidth;
  const height = browser.innerHeight;
  const touch = browser.matchMedia('(hover: none) and (pointer: coarse)').matches
    || browser.navigator.maxTouchPoints > 0;
  const mobile = width < 768 || (touch && Math.min(width, height) < 1024);
  const orientation = touch ? browser.screen?.orientation?.type : '';
  const portrait = orientation ? orientation.startsWith('portrait') : height >= width;
  return {
    mode: mobile ? (portrait ? 'portrait' : 'landscape') : 'desktop',
    touch,
    compactPages: width < 1024,
  };
}

/** One settled update per rotation, not one per intermediate resize event. */
export function observeReportViewport(browser, onChange) {
  let timer;
  const sync = () => onChange(readReportViewport(browser));
  const schedule = () => {
    browser.clearTimeout(timer);
    timer = browser.setTimeout(sync, 200);
  };
  const pointer = browser.matchMedia('(hover: none) and (pointer: coarse)');
  sync();
  pointer.addEventListener('change', schedule);
  browser.addEventListener('resize', schedule);
  browser.addEventListener('orientationchange', schedule);
  return () => {
    browser.clearTimeout(timer);
    pointer.removeEventListener('change', schedule);
    browser.removeEventListener('resize', schedule);
    browser.removeEventListener('orientationchange', schedule);
  };
}

export function reportLayoutSettings(mode, models) {
  return { layoutType: mode === 'portrait' ? models.LayoutType.MobilePortrait
    : mode === 'landscape' ? models.LayoutType.MobileLandscape : models.LayoutType.Master };
}

export function reportCanvasWidth(width, height, mode, aspectRatio = 16 / 9) {
  // Give wide report pages their full width at the available height. The host
  // can scroll horizontally instead of clipping the cross-origin iframe.
  return mode === 'landscape' ? Math.max(width, Math.ceil(height * aspectRatio)) : width;
}

/** Serialize SDK calls: a slow portrait update must not win over a rotation. */
export function createReportLayoutUpdater(getReport, isReady, getSettings, onError) {
  let running = null;
  let pending = false;
  return function update() {
    pending = true;
    if (running) return running;
    running = Promise.resolve().then(async () => {
      while (pending) {
        pending = false;
        const report = getReport();
        if (!report || !isReady()) break;
        try { await report.updateSettings(getSettings()); }
        catch (error) { onError(error); }
      }
    }).finally(() => { running = null; });
    return running;
  };
}
