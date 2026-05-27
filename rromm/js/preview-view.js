/**
 * Pan & zoom for the preview canvas (view transform over fitted image layout).
 */

const MIN_ZOOM = 0.08;
const MAX_ZOOM = 12;
const ZOOM_STEP = 1.12;

/**
 * @typedef {Object} BaseLayout
 * @property {number} imgW
 * @property {number} imgH
 * @property {number} offsetX
 * @property {number} offsetY
 * @property {number} scale
 */

/**
 * @param {BaseLayout} base
 */
function imageCenter(base) {
  return {
    cx: base.offsetX + (base.imgW * base.scale) / 2,
    cy: base.offsetY + (base.imgH * base.scale) / 2,
  };
}

/**
 * @param {{x:number,y:number}} norm
 * @param {BaseLayout} base
 */
export function normToBase(norm, base) {
  return {
    x: base.offsetX + norm.x * base.imgW * base.scale,
    y: base.offsetY + norm.y * base.imgH * base.scale,
  };
}

/**
 * @param {number} bx
 * @param {number} by
 * @param {BaseLayout} base
 * @param {number} panX
 * @param {number} panY
 * @param {number} zoom
 */
export function baseToScreen(bx, by, base, panX, panY, zoom) {
  const { cx, cy } = imageCenter(base);
  return {
    x: panX + cx + (bx - cx) * zoom,
    y: panY + cy + (by - cy) * zoom,
  };
}

/**
 * @param {number} sx
 * @param {number} sy
 * @param {BaseLayout} base
 * @param {number} panX
 * @param {number} panY
 * @param {number} zoom
 */
export function screenToBase(sx, sy, base, panX, panY, zoom) {
  const { cx, cy } = imageCenter(base);
  return {
    x: cx + (sx - panX - cx) / zoom,
    y: cy + (sy - panY - cy) / zoom,
  };
}

/**
 * @param {{x:number,y:number}} norm
 * @param {BaseLayout} base
 * @param {number} panX
 * @param {number} panY
 * @param {number} zoom
 */
export function normToScreen(norm, base, panX, panY, zoom) {
  const b = normToBase(norm, base);
  return baseToScreen(b.x, b.y, base, panX, panY, zoom);
}

/**
 * @param {number} sx
 * @param {number} sy
 * @param {BaseLayout} base
 * @param {number} panX
 * @param {number} panY
 * @param {number} zoom
 */
export function screenToNorm(sx, sy, base, panX, panY, zoom) {
  const b = screenToBase(sx, sy, base, panX, panY, zoom);
  return {
    x: (b.x - base.offsetX) / (base.imgW * base.scale),
    y: (b.y - base.offsetY) / (base.imgH * base.scale),
  };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {BaseLayout} base
 * @param {number} panX
 * @param {number} panY
 * @param {number} zoom
 */
export function applyViewTransform(ctx, base, panX, panY, zoom) {
  const { cx, cy } = imageCenter(base);
  ctx.translate(panX, panY);
  ctx.translate(cx, cy);
  ctx.scale(zoom, zoom);
  ctx.translate(-cx, -cy);
}

/**
 * 3×3 affine view matrix for WebGL (column-major, same as applyViewTransform).
 * @param {BaseLayout} base
 * @param {number} panX
 * @param {number} panY
 * @param {number} zoom
 * @returns {Float32Array}
 */
export function getViewMatrix3(base, panX, panY, zoom) {
  const { cx, cy } = imageCenter(base);
  const tx = panX + cx - zoom * cx;
  const ty = panY + cy - zoom * cy;
  // | z 0 tx |  columns: [z,0,0], [0,z,0], [tx,ty,1]
  // | 0 z ty |
  // | 0 0  1 |
  return new Float32Array([zoom, 0, 0, 0, zoom, 0, tx, ty, 1]);
}

/**
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {() => BaseLayout} opts.getBaseLayout
 * @param {() => void} opts.onChange
 * @param {() => boolean} [opts.isCornerDragging]
 * @param {() => { left: number, top: number, width: number, height: number }} [opts.getScreenRect]
 */
export function createPreviewView(opts) {
  const { canvas, getBaseLayout, onChange, isCornerDragging, getScreenRect } = opts;

  function pointerRect() {
    if (getScreenRect) {
      const r = getScreenRect();
      return {
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
      };
    }
    return canvas.getBoundingClientRect();
  }

  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let panning = false;
  let panStart = null;

  function clampZoom(z) {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
  }

  function resetView() {
    zoom = 1;
    panX = 0;
    panY = 0;
  }

  function getState() {
    return { zoom, panX, panY };
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @param {number} factor
   */
  function zoomAtClient(clientX, clientY, factor) {
    const base = getBaseLayout();
    if (!base.imgW) return;

    const rect = pointerRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const norm = screenToNorm(sx, sy, base, panX, panY, zoom);

    const newZoom = clampZoom(zoom * factor);
    const b = normToBase(norm, base);
    const { cx, cy } = imageCenter(base);
    panX = sx - cx - (b.x - cx) * newZoom;
    panY = sy - cy - (b.y - cy) * newZoom;
    zoom = newZoom;
    onChange();
  }

  function zoomIn() {
    const rect = pointerRect();
    zoomAtClient(rect.left + rect.width / 2, rect.top + rect.height / 2, ZOOM_STEP);
  }

  function zoomOut() {
    const rect = pointerRect();
    zoomAtClient(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / ZOOM_STEP);
  }

  function isPanButton(e) {
    return e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey);
  }

  function onWheel(e) {
    const base = getBaseLayout();
    if (!base.imgW) return;

    e.preventDefault();
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    zoomAtClient(e.clientX, e.clientY, factor);
  }

  function onPointerDown(e) {
    if (!isPanButton(e)) return;
    if (isCornerDragging?.()) return;

    const base = getBaseLayout();
    if (!base.imgW) return;

    panning = true;
    const rect = pointerRect();
    panStart = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      panX,
      panY,
    };
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!panning || !panStart) return;

    const rect = pointerRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    panX = panStart.panX + (x - panStart.x);
    panY = panStart.panY + (y - panStart.y);
    onChange();
  }

  function endPan(e) {
    if (!panning) return;
    panning = false;
    panStart = null;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}
  }

  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', endPan);
  canvas.addEventListener('pointercancel', endPan);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    getState,
    resetView,
    zoomIn,
    zoomOut,
    normToScreen: (norm) => {
      const base = getBaseLayout();
      return normToScreen(norm, base, panX, panY, zoom);
    },
    screenToNorm: (clientX, clientY) => {
      const base = getBaseLayout();
      const rect = pointerRect();
      return screenToNorm(
        clientX - rect.left,
        clientY - rect.top,
        base,
        panX,
        panY,
        zoom,
      );
    },
    applyTransform: (ctx) => {
      const base = getBaseLayout();
      if (base.imgW) applyViewTransform(ctx, base, panX, panY, zoom);
    },
    getViewMatrix: () => {
      const base = getBaseLayout();
      if (!base.imgW) return null;
      return getViewMatrix3(base, panX, panY, zoom);
    },
    get panning() {
      return panning;
    },
  };
}
