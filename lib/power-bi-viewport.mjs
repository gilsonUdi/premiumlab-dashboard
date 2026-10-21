export function readReportViewport(browser) {
  // Pinch zoom may change innerWidth while the layout viewport stays fixed.
  const width = browser.document?.documentElement?.clientWidth || browser.innerWidth;
  const height = browser.document?.documentElement?.clientHeight || browser.innerHeight;
  const touch = browser.matchMedia('(hover: none) and (pointer: coarse)').matches
    || browser.navigator.maxTouchPoints > 0;
  const shortEdge = Math.min(browser.screen?.width || width, browser.screen?.height || height);
  const mobile = width < 768 || (touch && shortEdge < 1024);
  const orientation = touch ? browser.screen?.orientation?.type : '';
  const portrait = orientation ? orientation.startsWith('portrait')
    : touch && typeof browser.orientation === 'number' ? Math.abs(browser.orientation) % 180 === 0
    : height >= width;
  const visual = browser.visualViewport?.scale > 1 ? null : browser.visualViewport;
  return {
    mode: mobile ? (portrait ? 'portrait' : 'landscape') : 'desktop',
    touch,
    compactPages: width < 1024,
    bounds: {
      width: Math.round(visual?.width || width),
      height: Math.round(visual?.height || height),
      top: Math.max(0, Math.round(visual?.offsetTop || 0)),
      left: Math.max(0, Math.round(visual?.offsetLeft || 0)),
    },
  };
}

/** One settled update per rotation, not one per intermediate resize event. */
export function observeReportViewport(browser, onChange) {
  let timer;
  let observed = false;
  let rotated = false;
  const sync = () => {
    // Browser magnification is not a device rotation. Do not switch the SDK
    // layout because the visual viewport shrank during a pinch.
    if (observed && !rotated && browser.visualViewport?.scale > 1) return;
    rotated = false;
    observed = true;
    onChange(readReportViewport(browser));
  };
  const schedule = () => {
    browser.clearTimeout(timer);
    timer = browser.setTimeout(sync, 200);
  };
  const pointer = browser.matchMedia('(hover: none) and (pointer: coarse)');
  const visual = browser.visualViewport;
  const orientation = browser.screen?.orientation;
  const rotate = () => { rotated = true; schedule(); };
  sync();
  pointer.addEventListener('change', schedule);
  browser.addEventListener('resize', schedule);
  browser.addEventListener('orientationchange', rotate);
  visual?.addEventListener?.('resize', schedule);
  visual?.addEventListener?.('scroll', schedule);
  orientation?.addEventListener?.('change', rotate);
  return () => {
    browser.clearTimeout(timer);
    pointer.removeEventListener('change', schedule);
    browser.removeEventListener('resize', schedule);
    browser.removeEventListener('orientationchange', rotate);
    visual?.removeEventListener?.('resize', schedule);
    visual?.removeEventListener?.('scroll', schedule);
    orientation?.removeEventListener?.('change', rotate);
  };
}

export function reportLayoutSettings(mode, models) {
  // Use the regular report renderer horizontally. MobileLandscape can acknowledge
  // "rendered" yet leave an empty canvas on the affected iPhone/browser combination.
  return { layoutType: mode === 'portrait' ? models.LayoutType.MobilePortrait : models.LayoutType.Master };
}

export function initialReportLayoutSettings(mode, models) {
  // The SDK requires mobile capability at embed time for later portrait switches.
  // Keep this separate from the runtime landscape compatibility layout (Master).
  return { layoutType: mode === 'portrait' ? models.LayoutType.MobilePortrait : models.LayoutType.MobileLandscape };
}

export function reportCanvasWidth(width, height, mode, aspectRatio = 16 / 9) {
  // Give wide report pages their full width at the available height. The host
  // can scroll horizontally instead of clipping the cross-origin iframe.
  return mode === 'landscape' ? Math.max(width, Math.ceil(height * aspectRatio)) : width;
}

/** Serialize SDK calls: a slow portrait update must not win over a rotation. */
export function createReportLayoutUpdater(getReport, isReady, getSettings, onError, onTransition) {
  let running = null;
  let pending = false;
  let lastReport = null;
  let lastSettings = null;
  return function update() {
    pending = true;
    if (running) return running;
    running = Promise.resolve().then(async () => {
      while (pending) {
        pending = false;
        const report = getReport();
        if (!report || !isReady()) break;
        const settings = getSettings();
        const signature = JSON.stringify(settings);
        // Browser chrome resizing the same iframe does not require another SDK render.
        if (report === lastReport && signature === lastSettings) continue;
        onTransition?.('requested', settings);
        try {
          await report.updateSettings(settings);
          lastReport = report;
          lastSettings = signature;
          onTransition?.('applied', settings);
        }
        catch (error) { onTransition?.('failed', settings); onError(error); }
      }
    }).finally(() => { running = null; });
    return running;
  };
}
