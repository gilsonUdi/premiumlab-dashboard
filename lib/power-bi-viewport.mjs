export function readReportViewport(browser) {
  // Pinch zoom may change innerWidth while the layout viewport stays fixed.
  const width = browser.document?.documentElement?.clientWidth || browser.innerWidth;
  const height = browser.document?.documentElement?.clientHeight || browser.innerHeight;
  const touch = browser.matchMedia('(hover: none) and (pointer: coarse)').matches
    || browser.navigator.maxTouchPoints > 0;
  const shortEdge = Math.min(browser.screen?.width || width, browser.screen?.height || height);
  const mobile = width < 768 || (touch && shortEdge < 1024);
  const orientation = touch ? browser.screen?.orientation?.type : '';
  // Orientation APIs can lag behind Safari's actual layout during rotation.
  // A wide phone/tablet viewport is landscape even if the API still says portrait.
  // Keep portrait keyboards (narrow and temporarily short) from triggering it.
  const portrait = width >= 600 && width > height ? false : height >= width ? true
    : orientation ? orientation.startsWith('portrait')
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
  let previous;
  const sync = () => {
    // Browser magnification is not a device rotation. Do not switch the SDK
    // layout because the visual viewport shrank during a pinch.
    if (observed && !rotated && browser.visualViewport?.scale > 1) return;
    rotated = false;
    observed = true;
    const next = readReportViewport(browser);
    const signature = JSON.stringify(next);
    if (signature === previous) return;
    previous = signature;
    onChange(next);
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

/** Settle animated browser bars/rotation before resizing the live iframe.
 * The first measurable area is immediate; subsequent bursts produce one size. */
export function observeReportFrame(browser, container, onChange) {
  let timer;
  let lastWidth = -1;
  let lastHeight = -1;
  let measurable = false;
  const measure = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === lastWidth && height === lastHeight) return;
    lastWidth = width;
    lastHeight = height;
    measurable = width > 0 && height > 0;
    onChange({ width, height });
  };
  const schedule = () => {
    browser.clearTimeout(timer);
    if (!measurable) measure();
    else timer = browser.setTimeout(measure, 150);
  };
  measure();
  const observer = new browser.ResizeObserver(schedule);
  observer.observe(container);
  return () => {
    observer.disconnect();
    browser.clearTimeout(timer);
  };
}

export function reportLayoutSettings(mode, models) {
  // Use the regular report renderer horizontally. MobileLandscape can acknowledge
  // "rendered" yet leave an empty canvas on the affected iPhone/browser combination.
  return { layoutType: mode === 'portrait' ? models.LayoutType.MobilePortrait : models.LayoutType.Master };
}

export function initialReportLayoutSettings(_mode, models) {
  // Runtime updateSettings does not replace the SDK's initial layout. Use a
  // horizontal, mobile-capable baseline so a late page load cannot restore an
  // initial MobilePortrait after the user has rotated the phone.
  // Portrait is applied explicitly once the report has rendered.
  return { layoutType: models.LayoutType.MobileLandscape };
}

export function reportCanvasWidth(width, height, mode, aspectRatio = 16 / 9) {
  // Give wide report pages their full width at the available height. The host
  // can scroll horizontally instead of clipping the cross-origin iframe.
  return mode === 'landscape' ? Math.max(width, Math.ceil(height * aspectRatio)) : width;
}

/** Serialize SDK calls: a slow portrait update must not win over a rotation. */
export function createReportLayoutUpdater(getReport, isReady, getSettings, onError, onTransition, getPage = () => '', canCaptureState = () => true) {
  let running = null;
  let pending = false;
  let lastReport = null;
  let lastSettings = null;
  let lastLayoutType;
  let lastPage;
  let observedPage;
  let pageRevision = 0;
  return function update() {
    const requestedPage = getPage();
    if (requestedPage !== observedPage) {
      observedPage = requestedPage;
      pageRevision++;
    }
    pending = true;
    if (running) return running;
    running = Promise.resolve().then(async () => {
      while (pending) {
        pending = false;
        const report = getReport();
        if (!report || !isReady()) break;
        const settings = getSettings();
        const page = getPage();
        const revision = pageRevision;
        // A new page can restore its mobile layout even on the same report.
        const signature = JSON.stringify([pageRevision, getPage(), settings]);
        // Browser chrome resizing the same iframe does not require another SDK render.
        if (report === lastReport && signature === lastSettings) continue;
        // MobilePortrait and Master can keep different slicer selections.
        // Capture all report pages before changing renderer, not just report-
        // level filters (which omit slicers, page filters and visual selections).
        // The opaque state exists only during this transition, never in storage.
        let viewState;
        if (canCaptureState() && report === lastReport && page === lastPage && settings.layoutType !== lastLayoutType
          && report.bookmarksManager?.capture && report.bookmarksManager?.applyState) {
          try {
            viewState = (await report.bookmarksManager.capture({ allPages: true }))?.state;
            if (viewState) onTransition?.('state_captured', settings);
          } catch (error) {
            onTransition?.('state_capture_failed', settings);
            onError(error);
          }
          // A late capture must not restore another report or undo navigation.
          if (report !== getReport() || revision !== pageRevision || !isReady()) {
            pending = true;
            continue;
          }
        }
        onTransition?.('requested', settings);
        try {
          await report.updateSettings(settings);
          lastReport = report;
          lastSettings = signature;
          lastLayoutType = settings.layoutType;
          lastPage = page;
          if (viewState && report === getReport() && revision === pageRevision && page === getPage() && isReady()) {
            try {
              await report.bookmarksManager.applyState(viewState);
              onTransition?.('state_restored', settings);
            } catch (error) {
              onTransition?.('state_restore_failed', settings);
              onError(error);
            }
          }
          onTransition?.('applied', settings);
        }
        catch (error) { onTransition?.('failed', settings); onError(error); }
      }
    }).finally(() => { running = null; });
    return running;
  };
}
