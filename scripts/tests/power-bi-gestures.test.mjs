import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attachReportGestures, clampReportZoom } from '../../lib/power-bi-gestures.mjs';

function harness() {
  const handlers = new Map();
  const captured = new Set();
  const scroller = { scrollLeft: 100, scrollTop: 50 };
  let zoom = 1;
  let anchor;
  let prevented = 0;
  const surface = {
    addEventListener: (name, handler) => handlers.set(name, handler),
    removeEventListener: name => handlers.delete(name),
    setPointerCapture: id => captured.add(id), hasPointerCapture: id => captured.has(id),
    releasePointerCapture: id => captured.delete(id),
    getBoundingClientRect: () => ({ left: 160, top: 40 }),
  };
  const cleanup = attachReportGestures(surface, scroller, () => zoom,
    (value, point) => { zoom = value; anchor = point; });
  const emit = (name, id, x, y, extra = {}) => handlers.get(name)?.({
    pointerId: id, clientX: x, clientY: y, cancelable: true, pointerType: 'touch',
    preventDefault() { prevented++; }, ...extra,
  });
  return { emit, cleanup, handlers, scroller, captured, zoom: () => zoom, anchor: () => anchor, prevented: () => prevented };
}

test('pinch scales only the report with a stable content anchor', () => {
  const h = harness();
  h.emit('pointerdown',1,210,140); h.emit('pointerdown',2,310,140);
  h.emit('pointermove',2,410,140);
  assert.equal(h.zoom(),2);
  assert.equal(h.anchor().contentX,200);
  assert.equal(h.anchor().contentY,150);
  assert.equal(h.anchor().x,150);
  assert.ok(h.prevented() > 0);
  h.cleanup();
  assert.equal(h.handlers.size,0);
  assert.equal(h.captured.size,0);
});

test('one finger drags both axes without changing zoom', () => {
  const h = harness();
  h.emit('pointerdown',1,300,200); h.emit('pointermove',1,260,170);
  assert.equal(h.scroller.scrollLeft,140);
  assert.equal(h.scroller.scrollTop,80);
  assert.equal(h.zoom(),1);
  h.emit('pointercancel',1,260,170); h.emit('pointermove',1,0,0);
  assert.equal(h.scroller.scrollLeft,140);
  h.cleanup();
});

test('trackpad pinch changes report scale, ordinary wheel pans', () => {
  const h = harness();
  h.emit('wheel',0,200,100,{ctrlKey:true,deltaY:-100,deltaX:0});
  assert.ok(h.zoom() > 1);
  const scale = h.zoom();
  h.emit('wheel',0,200,100,{ctrlKey:false,deltaY:30,deltaX:10});
  assert.equal(h.scroller.scrollLeft,110);
  assert.equal(h.scroller.scrollTop,80);
  assert.equal(h.zoom(),scale);
  h.cleanup();
});

test('zoom stays between fit and 300%, avoiding unbounded iframe rendering', () => {
  assert.equal(clampReportZoom(0.2),1);
  assert.equal(clampReportZoom(10),3);
  assert.equal(clampReportZoom(1.5),1.5);
});

test('both mobile orientations use bottom pages while zoom stays outside SDK config', () => {
  const source = readFileSync(new URL('../../components/company/PowerBiEmbeddedView.jsx',import.meta.url),'utf8');
  assert.match(source,/useBottomPageNavigation = viewport.mode !== 'desktop' \|\| viewport.compactPages/);
  assert.match(source,/useBottomPageNavigation && sidebarPages.length > 0/);
  assert.match(source,/useBottomPageNavigation \? 'hidden'/);
  assert.match(source,/gridTemplateColumns: 'minmax\(0, 1fr\)'/);
  assert.match(source,/aria-label="Navegação inferior das páginas do relatório"/);
  assert.match(source,/overflow-x-auto overscroll-x-contain touch-pan-x/);
  assert.doesNotMatch(source,/power-bi-pages-sidebar/);
  const config = source.slice(source.indexOf('const embedConfig ='),source.indexOf('const embedAvailable ='));
  assert.doesNotMatch(config,/reportZoom/);
  assert.match(source,/transform: effectiveZoom === 1 \? 'none' : `scale\(\$\{effectiveZoom\}\)`/);
});

test('report is always interactive without a toggle or a gesture interception overlay', () => {
  const source = readFileSync(new URL('../../components/company/PowerBiEmbeddedView.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /reportInteraction|setReportInteraction|gestureSurfaceRef|power-bi-gesture-surface|Interagir/);
  assert.match(source, /aria-label="Aumentar zoom do BI"/);
  assert.match(source, /aria-label="Diminuir zoom do BI"/);
});
