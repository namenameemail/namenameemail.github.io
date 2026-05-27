/**
 * 2D wall editor: place overlay images in meters (move on canvas).
 */

import { boundarySignature, wallMetersToPx } from './wall-patch.js';
import { drawTexturedQuad, itemQuadMeters } from './warp.js';

const MAX_DPR = 2;
const MAX_BG_PIXELS = 900_000;

/**
 * @typedef {'move'|null} DragMode
 */

/**
 * Create wall editor controller.
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {() => import('./app.js').Wall | null} opts.getActiveWall
 * @param {(wall: import('./app.js').Wall, opts?: {save?: boolean, invalidateWall?: boolean, renderPreview?: boolean}) => void} opts.onWallUpdate
 * @param {() => string | null} opts.getSelectedItemId
 * @param {(id: string | null) => void} opts.setSelectedItemId
 * @param {() => void} opts.onChange
 * @param {() => void} [opts.onDragEnd]
 * @param {Map<string, HTMLImageElement>} opts.imageCache
 * @param {() => string} [opts.getWallColor]
 * @param {() => { image: HTMLImageElement|null, boundary: import('./wall-patch.js').WallBoundary|null }} [opts.getPhotoBackground]
 * @param {() => boolean} [opts.getCleanExportPreview]
 */
export function createWallEditor(opts) {
  const {
    canvas,
    getActiveWall,
    onWallUpdate,
    getSelectedItemId,
    setSelectedItemId,
    onChange,
    onDragEnd,
    imageCache,
    getWallColor,
    getPhotoBackground,
    getCleanExportPreview,
  } = opts;

  let dragMode = null;
  let sizeKey = '';
  let dragItemId = null;
  let dragStart = null;
  let itemStart = null;
  /** @type {{ image: HTMLImageElement|null, width: number, height: number, data: Uint8ClampedArray|null }} */
  let sourcePixels = { image: null, width: 0, height: 0, data: null };
  const sourceCanvas = document.createElement('canvas');
  const bgCanvas = document.createElement('canvas');
  let bgKey = '';

  function getLayoutForSize(wall, cw, ch, pad = 6) {
    if (!wall) return null;

    const availW = Math.max(1, cw - pad * 2);
    const availH = Math.max(1, ch - pad * 2);
    const aspect = wall.widthM / wall.heightM;

    let drawW;
    let drawH;
    if (availW / availH > aspect) {
      drawH = availH;
      drawW = drawH * aspect;
    } else {
      drawW = availW;
      drawH = drawW / aspect;
    }

    const offsetX = (cw - drawW) / 2;
    const offsetY = (ch - drawH) / 2;
    const scaleX = drawW / wall.widthM;
    const scaleY = drawH / wall.heightM;

    return { wall, cw, ch, drawW, drawH, offsetX, offsetY, scaleX, scaleY };
  }

  function getLayout() {
    const wall = getActiveWall();
    if (!wall) return null;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const layout = getLayoutForSize(wall, rect.width, rect.height);
    return layout ? { ...layout, dpr } : null;
  }

  function metersToCanvas(xM, yM, layout) {
    return {
      x: layout.offsetX + xM * layout.scaleX,
      y: layout.offsetY + layout.drawH - yM * layout.scaleY,
    };
  }

  function canvasToMeters(x, y, layout) {
    return {
      xM: (x - layout.offsetX) / layout.scaleX,
      yM: (layout.drawH - (y - layout.offsetY)) / layout.scaleY,
    };
  }

  function getSourcePixels(image) {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return null;
    if (sourcePixels.image === image && sourcePixels.width === width && sourcePixels.height === height) {
      return sourcePixels;
    }

    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!srcCtx) return null;
    srcCtx.clearRect(0, 0, width, height);
    srcCtx.drawImage(image, 0, 0, width, height);
    const data = srcCtx.getImageData(0, 0, width, height).data;
    sourcePixels = { image, width, height, data };
    return sourcePixels;
  }

  function sampleBilinear(src, x, y, out, offset) {
    const { width, height, data } = src;
    if (!data || x < 0 || y < 0 || x > width - 1 || y > height - 1) {
      out[offset] = 255;
      out[offset + 1] = 255;
      out[offset + 2] = 255;
      out[offset + 3] = 255;
      return;
    }

    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    const i00 = (y0 * width + x0) * 4;
    const i10 = (y0 * width + x1) * 4;
    const i01 = (y1 * width + x0) * 4;
    const i11 = (y1 * width + x1) * 4;

    for (let c = 0; c < 4; c++) {
      const top = data[i00 + c] * (1 - tx) + data[i10 + c] * tx;
      const bottom = data[i01 + c] * (1 - tx) + data[i11 + c] * tx;
      out[offset + c] = top * (1 - ty) + bottom * ty;
    }
  }

  function renderPhotoBackground(layout, image, boundary) {
    const iw = image.naturalWidth || image.width;
    const ih = image.naturalHeight || image.height;
    if (!iw || !ih) return null;

    const scale = Math.min(1, Math.sqrt(MAX_BG_PIXELS / Math.max(1, layout.drawW * layout.drawH)));
    const outW = Math.max(1, Math.round(layout.drawW * scale));
    const outH = Math.max(1, Math.round(layout.drawH * scale));
    const key = [
      image.src,
      iw,
      ih,
      layout.wall.widthM,
      layout.wall.heightM,
      outW,
      outH,
      boundarySignature(boundary),
    ].join(':');
    if (key === bgKey) return bgCanvas;

    const src = getSourcePixels(image);
    if (!src?.data) return null;

    bgCanvas.width = outW;
    bgCanvas.height = outH;
    const bgCtx = bgCanvas.getContext('2d');
    if (!bgCtx) return null;

    const imgData = bgCtx.createImageData(outW, outH);
    const out = imgData.data;
    const { widthM, heightM } = layout.wall;

    for (let y = 0; y < outH; y++) {
      const yM = heightM * (1 - (y + 0.5) / outH);
      for (let x = 0; x < outW; x++) {
        const xM = widthM * ((x + 0.5) / outW);
        const p = wallMetersToPx(boundary, xM, yM, widthM, heightM, iw, ih);
        const offset = (y * outW + x) * 4;
        sampleBilinear(src, p.x, p.y, out, offset);
      }
    }

    bgCtx.putImageData(imgData, 0, 0);
    bgKey = key;
    return bgCanvas;
  }

  function itemCanvasQuad(item, layout) {
    return itemQuadMeters(item).map((p) => metersToCanvas(p.x, p.y, layout));
  }

  function getItemBoundsPx(item, layout) {
    const corners = itemCanvasQuad(item, layout);
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    return {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
    };
  }

  function pointInQuad(px, py, quad) {
    let inside = false;
    for (let i = 0, j = quad.length - 1; i < quad.length; j = i++) {
      const xi = quad[i].x;
      const yi = quad[i].y;
      const xj = quad[j].x;
      const yj = quad[j].y;
      const intersect =
        yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function fillItemQuad(ctx, quad, color) {
    ctx.beginPath();
    ctx.moveTo(quad[0].x, quad[0].y);
    for (let i = 1; i < quad.length; i++) ctx.lineTo(quad[i].x, quad[i].y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function strokeItemQuad(ctx, quad, style) {
    ctx.beginPath();
    ctx.moveTo(quad[0].x, quad[0].y);
    for (let i = 1; i < quad.length; i++) ctx.lineTo(quad[i].x, quad[i].y);
    ctx.closePath();
    ctx.strokeStyle = style.strokeStyle;
    ctx.lineWidth = style.lineWidth;
    ctx.setLineDash(style.dash ?? []);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function hitTest(clientX, clientY) {
    const layout = getLayout();
    if (!layout) return null;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const wall = layout.wall;

    for (let i = wall.items.length - 1; i >= 0; i--) {
      const item = wall.items[i];
      const quad = itemCanvasQuad(item, layout);
      if (pointInQuad(x, y, quad)) {
        return { mode: 'move', item };
      }
    }
    return null;
  }

  function onPointerDown(e) {
    const hit = hitTest(e.clientX, e.clientY);
    if (!hit) {
      setSelectedItemId(null);
      onChange();
      return;
    }

    const layout = getLayout();
    const rect = canvas.getBoundingClientRect();
    dragMode = hit.mode;
    dragItemId = hit.item.id;
    setSelectedItemId(hit.item.id);
    dragStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    itemStart = { ...hit.item };
    canvas.classList.add('dragging');
    canvas.setPointerCapture(e.pointerId);
    onChange();
  }

  function onPointerMove(e) {
    if (!dragMode || !dragItemId || !itemStart) return;

    const wall = getActiveWall();
    const layout = getLayout();
    if (!wall || !layout) return;

    const item = wall.items.find((it) => it.id === dragItemId);
    if (!item) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cur = canvasToMeters(x, y, layout);
    const start = canvasToMeters(dragStart.x, dragStart.y, layout);

    const dx = cur.xM - start.xM;
    const dy = cur.yM - start.yM;
    item.xM = Math.max(0, Math.min(wall.widthM - item.widthM, itemStart.xM + dx));
    item.yM = Math.max(0, Math.min(wall.heightM - item.heightM, itemStart.yM + dy));

    onWallUpdate(wall, { save: false, invalidateWall: false, renderPreview: false });
    onChange();
  }

  function onPointerUp(e) {
    const wasDragging = !!dragMode;
    if (dragMode) {
      canvas.classList.remove('dragging');
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
    dragMode = null;
    dragItemId = null;
    dragStart = null;
    itemStart = null;
    if (wasDragging) onDragEnd?.();
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const key = `${Math.round(rect.width)}x${Math.round(rect.height)}@${dpr}`;
    if (key === sizeKey) return;

    sizeKey = key;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawWall(ctx, layout, options = {}) {
    const { showGuides = true, showDimensions = true } = options;
    const { wall, offsetX, offsetY, drawW, drawH } = layout;

    const wallStroke = getWallColor?.() ?? '#000000';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(offsetX, offsetY, drawW, drawH);

    const bg = getPhotoBackground?.();
    const photoImg = bg?.image;
    const boundary = bg?.boundary;
    if (photoImg?.complete && boundary) {
      const bgImage = renderPhotoBackground(layout, photoImg, boundary);
      if (bgImage) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(offsetX, offsetY, drawW, drawH);
        ctx.clip();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(bgImage, offsetX, offsetY, drawW, drawH);
        ctx.restore();
      }
    }

    const selectedId = getSelectedItemId();

    for (const item of wall.items) {
      const img = imageCache.get(item.src);
      const quad = itemCanvasQuad(item, layout);

      if (img && img.complete) {
        drawTexturedQuad(ctx, img, quad);
      } else {
        fillItemQuad(ctx, quad, '#4c6ef5');
      }

      if (showGuides && item.id === selectedId) {
        strokeItemQuad(ctx, quad, {
          strokeStyle: '#000000',
          lineWidth: 2,
          dash: [3, 3],
        });
      }
    }

    if (showGuides) {
      ctx.strokeStyle = wallStroke;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(offsetX, offsetY, drawW, drawH);
    }

    if (showDimensions) {
      const label = `${wall.widthM} м × ${wall.heightM} м`;
      ctx.fillStyle = '#666666';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, offsetX + drawW / 2, Math.max(12, offsetY - 4));
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
    }
  }

  function draw() {
    const layout = getLayout();
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();

    ctx.clearRect(0, 0, rect.width, rect.height);

    if (!layout) {
      ctx.fillStyle = '#6a6a78';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Выберите стену', rect.width / 2, rect.height / 2);
      return;
    }

    const clean = getCleanExportPreview?.() ?? false;
    drawWall(ctx, layout, { showGuides: !clean, showDimensions: !clean });
  }

  function exportJpg(quality = 0.92) {
    const wall = getActiveWall();
    if (!wall) return Promise.resolve(null);

    const aspect = wall.widthM / wall.heightM;
    const longSide = 1800;
    const outW = aspect >= 1 ? longSide : Math.max(1, Math.round(longSide * aspect));
    const outH = aspect >= 1 ? Math.max(1, Math.round(longSide / aspect)) : longSide;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = outW;
    exportCanvas.height = outH;
    const exportCtx = exportCanvas.getContext('2d');
    const layout = getLayoutForSize(wall, outW, outH, 0);
    if (!exportCtx || !layout) return Promise.resolve(null);

    drawWall(exportCtx, layout, { showGuides: false, showDimensions: false });
    return new Promise((resolve) => {
      exportCanvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
    });
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  return {
    getLayout,
    metersToCanvas,
    resizeCanvas,
    draw,
    exportJpg,
  };
}
