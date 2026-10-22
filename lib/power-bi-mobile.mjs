// First rollout is limited to the report/company with reproduced iPhone crashes.
export function shouldOptimizeMobileReport(slug, mode) {
  return slug === 'lentes-gradual' && mode !== 'desktop';
}

export const MOBILE_CHARTS_PER_BLOCK = 2;
export const MOBILE_FILTERS_PER_BLOCK = 4;
const DECORATIVE_TYPES = new Set(['image', 'shape', 'textbox', 'actionbutton', 'pagenavigator', 'bookmarknavigator', 'group']);

function isFilter(visual) {
  return /slicer|textfilter/i.test(visual.type || '');
}

export function buildMobileReportPlan(inventory, request, models) {
  const visuals = inventory.get(request.pageName);
  if (!visuals) throw new Error('Página não autorizada para o modo leve.');
  const filters = visuals.filter(isFilter);
  const charts = visuals.filter(visual => !isFilter(visual) && !DECORATIVE_TYPES.has(String(visual.type).toLowerCase()));
  const mode = request.mode === 'filters' ? 'filters' : 'content';
  const candidates = mode === 'filters' ? filters : charts;
  const limit = mode === 'filters' ? MOBILE_FILTERS_PER_BLOCK : MOBILE_CHARTS_PER_BLOCK;
  const blocks = Math.max(1, Math.ceil(candidates.length / limit));
  const block = Math.min(blocks - 1, Math.max(0, Math.trunc(Number(request.block) || 0)));
  const selected = candidates.slice(block * limit, (block + 1) * limit);
  const width = request.landscape ? 760 : 360;
  const gap = 12;
  const columns = request.landscape ? 2 : 1;
  const cellWidth = (width - gap * (columns + 1)) / columns;
  let height = gap;
  const visible = {};
  for (let index = 0; index < selected.length; index += columns) {
    const row = selected.slice(index, index + columns);
    const rowHeight = Math.max(...row.map(visual => mode === 'filters' ? 120
      : Math.max(190, Math.min(480, cellWidth * (Number(visual.layout?.height) || 240) / (Number(visual.layout?.width) || 360)))));
    row.forEach((visual, column) => {
      visible[visual.name] = { x: gap + column * (cellWidth + gap), y: height,
        width: cellWidth, height: rowHeight, displayState: { mode: models.VisualContainerDisplayMode.Visible } };
    });
    height += rowHeight + gap;
  }
  const pagesLayout = {};
  for (const [name, pageVisuals] of inventory) {
    // Explicitly hide previous blocks too: updateSettings can merge custom maps.
    const visualsLayout = Object.fromEntries(pageVisuals.map(visual => [visual.name,
      { displayState: { mode: models.VisualContainerDisplayMode.Hidden } }]));
    if (name === request.pageName) Object.assign(visualsLayout, visible);
    pagesLayout[name] = { defaultLayout: { displayState: { mode: models.VisualContainerDisplayMode.Hidden } }, visualsLayout };
  }
  return {
    pageName: request.pageName, mode, block, blocks, chartCount: charts.length,
    filterCount: filters.length, visibleCount: selected.length,
    labels: selected.map(visual => visual.title || (isFilter(visual) ? 'Filtro' : 'Indicador')),
    settings: { layoutType: models.LayoutType.Custom, customLayout: {
      displayOption: models.DisplayOption.FitToWidth,
      pageSize: { type: models.PageSizeType.Custom, width, height: Math.max(240, Math.ceil(height)) }, pagesLayout,
    } },
  };
}

// Only metadata is read before report.render(). No data exports, model changes,
// new tokens, or queries outside the existing embed identity are introduced.
export function createMobileReportOptimizer(models, isCurrent, onPlan) {
  const inventories = new WeakMap();
  let desired = null;
  let running = null;
  let lastReport = null;
  let lastSignature = '';
  async function inventoryFor(report, allowedNames) {
    if (!inventories.has(report)) {
      inventories.set(report, (async () => {
        const allowed = new Set(allowedNames);
        const inventory = new Map();
        for (const page of await report.getPages()) {
          if (!allowed.has(page.name)) continue;
          const visuals = await page.getVisuals();
          // Save authored visibility before any custom layout is applied.
          inventory.set(page.name, visuals.filter(visual => visual.name
            && visual.layout?.displayState?.mode !== models.VisualContainerDisplayMode.Hidden)
            .map(visual => ({ name: visual.name, type: visual.type, title: visual.title,
              layout: { ...visual.layout } }))
            .sort((a, b) => (Number(a.layout.y) || 0) - (Number(b.layout.y) || 0)
              || (Number(a.layout.x) || 0) - (Number(b.layout.x) || 0)));
        }
        return inventory;
      })().catch(error => { inventories.delete(report); throw error; }));
    }
    return inventories.get(report);
  }
  return {
    update(report, request, allowedNames) {
      desired = { report, request: { ...request }, allowedNames: [...allowedNames] };
      if (running) return running;
      running = Promise.resolve().then(async () => {
        while (desired) {
          const next = desired;
          desired = null;
          const inventory = await inventoryFor(next.report, next.allowedNames);
          if (desired || !isCurrent(next.report, next.request.pageName)) continue;
          const plan = buildMobileReportPlan(inventory, next.request, models);
          const signature = JSON.stringify([plan.pageName, plan.mode, plan.block, Boolean(next.request.landscape)]);
          if (lastReport === next.report && signature === lastSignature) continue;
          await next.report.updateSettings(plan.settings);
          if (desired || !isCurrent(next.report, plan.pageName)) continue;
          lastReport = next.report;
          lastSignature = signature;
          onPlan(plan);
        }
      }).finally(() => { running = null; });
      return running;
    },
  };
}
