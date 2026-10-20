export function clampReportZoom(value) {
  return Math.min(3, Math.max(1, Number(value) || 1));
}

/** This surface is outside the cross-origin iframe. It scales/pans its host
 * without resizing, resetting or sending zoom commands to the Power BI SDK. */
export function attachReportGestures(surface, scroller, getZoom, changeZoom) {
  const pointers = new Map();
  let gesture;
  function localCenter(points) {
    const rect = surface.getBoundingClientRect();
    return {
      x: (points[0].x + points[1].x) / 2 - rect.left,
      y: (points[0].y + points[1].y) / 2 - rect.top,
    };
  }
  const distance = points => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  function begin() {
    const points = [...pointers.values()];
    if (points.length >= 2) {
      const center = localCenter(points);
      gesture = { distance: distance(points), zoom: getZoom(),
        contentX: (scroller.scrollLeft + center.x) / getZoom(),
        contentY: (scroller.scrollTop + center.y) / getZoom() };
    } else if (points.length === 1) {
      gesture = { point: points[0], left: scroller.scrollLeft, top: scroller.scrollTop };
    } else gesture = null;
  }
  const prevent = event => { if (event.cancelable) event.preventDefault(); };
  const down = event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    prevent(event);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    surface.setPointerCapture?.(event.pointerId);
    begin();
  };
  const move = event => {
    if (!pointers.has(event.pointerId)) return;
    prevent(event);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.values()];
    if (points.length >= 2 && gesture?.distance > 0) {
      changeZoom(clampReportZoom(gesture.zoom * distance(points) / gesture.distance), {
        contentX: gesture.contentX, contentY: gesture.contentY, ...localCenter(points),
      });
    } else if (points.length === 1 && gesture?.point) {
      scroller.scrollLeft = gesture.left + gesture.point.x - points[0].x;
      scroller.scrollTop = gesture.top + gesture.point.y - points[0].y;
    }
  };
  const up = event => { pointers.delete(event.pointerId); begin(); };
  const wheel = event => {
    prevent(event);
    if (event.ctrlKey || event.metaKey) {
      const rect = surface.getBoundingClientRect();
      const x = event.clientX - rect.left; const y = event.clientY - rect.top;
      changeZoom(clampReportZoom(getZoom() * Math.exp(-event.deltaY * 0.005)), {
        x, y, contentX: (scroller.scrollLeft + x) / getZoom(), contentY: (scroller.scrollTop + y) / getZoom(),
      });
    } else {
      scroller.scrollLeft += event.deltaX;
      scroller.scrollTop += event.deltaY;
    }
  };
  const handlers = { pointerdown: down, pointermove: move, pointerup: up,
    pointercancel: up, lostpointercapture: up, wheel };
  for (const [name, handler] of Object.entries(handlers)) surface.addEventListener(name, handler, { passive: false });
  return () => {
    for (const [name, handler] of Object.entries(handlers)) surface.removeEventListener(name, handler);
    for (const id of pointers.keys()) {
      if (surface.hasPointerCapture?.(id)) surface.releasePointerCapture(id);
    }
    pointers.clear();
  };
}
