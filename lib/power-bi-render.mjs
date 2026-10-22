/** Render a phased embed once, after metadata, visible size and native layout.
 * Repeated resize/visibility events must never redraw the entire report.
 * A replacement instance cannot inherit a pending render from its predecessor. */
export function createReportRenderController(getReport, isReady, prepare, onError) {
  const started = new WeakSet();
  let running = null;
  let pending = false;
  return function requestRender() {
    pending = true;
    if (running) return running;
    running = Promise.resolve().then(async () => {
      while (pending) {
        pending = false;
        const report = getReport();
        if (!report || started.has(report) || !isReady()) continue;
        try {
          await prepare();
          if (report !== getReport() || !isReady()) continue;
          // Set this before awaiting: rendered/resize callbacks may re-enter.
          started.add(report);
          await report.render();
        } catch (error) {
          // No automatic retry loop. A later explicit request may retry.
          started.delete(report);
          if (report === getReport()) onError(error);
        }
      }
    }).finally(() => { running = null; });
    return running;
  };
}
