/**
 * Preview overlay: Bezier wall boundaries (edge quadratic / vertex cubic).
 */

import {
  BOUNDARY_MODE_EDGE,
  BOUNDARY_MODE_OFF,
  BOUNDARY_MODE_VERTEX,
  applyBoundaryPoint,
  boundaryOutlineNorm,
  defaultWallBoundary,
  getBoundaryMode,
  resetBoundaryAll,
  resetBoundaryCorner,
  resetBoundaryHandle,
} from './wall-patch.js';

const HANDLE_HALF = 10;
const EDGE_HANDLE_HALF = 8;
const VERTEX_HANDLE_HALF = 7;
const HOVER_FILL = '#ffd43b';
const HOVER_STROKE = '#1a1a1e';

/** @type {string[]} */
export const WALL_COLORS = [
  '#7B2CBF',
  '#FF5400',
  '#00B4D8',
  '#90BE6D',
  '#F94144',
  '#577590',
  '#F9C74F',
  '#43AA8B',
];

export function wallColorAt(index) {
  return WALL_COLORS[index % WALL_COLORS.length];
}

/**
 * @param {import('./state.js').Wall|null|undefined} wall
 * @param {number} index
 */
export function resolveWallColor(wall, index) {
  return wall?.color ?? wallColorAt(index);
}

/**
 * @param {string} hex
 * @param {string} [alpha]
 */
export function wallColorAlpha(hex, alpha = '99') {
  const h = hex.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(h)) return h + alpha;
  if (/^#[0-9A-Fa-f]{8}$/.test(h)) return h.slice(0, 7) + alpha;
  return h;
}

/**
 * @param {string} hex
 */
export function toColorInputValue(hex) {
  const h = hex.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(h)) return h;
  if (/^#[0-9A-Fa-f]{8}$/.test(h)) return h.slice(0, 7);
  return '#7b2cbf';
}

/**
 * @typedef {{ wallId: string, kind: 'corner'|'edge'|'handleOut'|'handleIn', index: number }} HandleHit
 */

/**
 * @param {object} opts
 * @param {() => import('./app.js').Wall[]} opts.getWalls
 * @param {(wallId: string) => string} opts.getWallColor
 * @param {() => string} opts.getActiveWallId
 * @param {(wallId: string) => void} opts.onSelectWall
 * @param {(wallId: string, boundary: import('./wall-patch.js').WallBoundary|null, opts?: {save?: boolean}) => void} opts.onBoundaryChange
 * @param {(clientX: number, clientY: number) => {x:number,y:number}} opts.screenToNorm
 * @param {(norm: {x:number,y:number}) => {x:number,y:number}} opts.normToScreen
 * @param {() => { left: number, top: number, width: number, height: number }} [opts.getScreenRect]
 * @param {HTMLCanvasElement} opts.canvas
 * @param {(msg: string) => void} opts.setStatus
 * @param {() => void} opts.onChange
 * @param {() => void} [opts.onDragEnd]
 */
export function createPreviewHandles(opts) {
  const {
    getWalls,
    getWallColor,
    getActiveWallId,
    onSelectWall,
    onBoundaryChange,
    screenToNorm,
    normToScreen,
    getScreenRect,
    canvas,
    onChange,
    onDragEnd,
  } = opts;

  function pointerRect() {
    if (getScreenRect) return getScreenRect();
    return canvas.getBoundingClientRect();
  }

  /** @type {HandleHit|null} */
  let drag = null;
  /** @type {HandleHit|null} */
  let hover = null;

  function toCanvasXY(clientX, clientY) {
    const rect = pointerRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  /**
   * @param {{x:number,y:number}} norm
   * @param {number} cx
   * @param {number} cy
   * @param {number} half
   */
  function hitNormPoint(norm, cx, cy, half) {
    const px = normToScreen(norm);
    return Math.abs(cx - px.x) <= half && Math.abs(cy - px.y) <= half;
  }

  /**
   * @param {import('./wall-patch.js').WallBoundary} b
   * @param {number} priority
   * @param {number} cx
   * @param {number} cy
   * @param {string} wallId
   * @param {HandleHit|null} best
   * @returns {HandleHit|null}
   */
  function pickNormPoint(b, priority, cx, cy, wallId, kind, index, half, bias, best) {
    if (!hitNormPoint(b, cx, cy, half)) return best;
    const px = normToScreen(b);
    const score = priority * 1000 + Math.hypot(cx - px.x, cy - px.y) + bias;
    if (!best || score < best.score) {
      return { wallId, kind, index, score };
    }
    return best;
  }

  /**
   * @returns {HandleHit|null}
   */
  function findHandle(clientX, clientY) {
    const { x: cx, y: cy } = toCanvasXY(clientX, clientY);
    const walls = getWalls();
    const activeId = getActiveWallId();

    /** @type {({ wallId: string, kind: HandleHit['kind'], index: number, score: number }|null)} */
    let best = null;

    walls.forEach((wall) => {
      const b = wall.wallBoundary;
      if (!b) return;

      const priority = wall.id === activeId ? 0 : 1;

      for (let ci = 0; ci < 4; ci++) {
        best = pickNormPoint(
          b.corners[ci], priority, cx, cy, wall.id, 'corner', ci, HANDLE_HALF, 0, best,
        );
      }

      const curveMode = getBoundaryMode(b);
      if (curveMode === BOUNDARY_MODE_EDGE) {
        for (let ei = 0; ei < 4; ei++) {
          best = pickNormPoint(
            b.edges[ei], priority, cx, cy, wall.id, 'edge', ei, EDGE_HANDLE_HALF, 0.5, best,
          );
        }
      } else if (curveMode === BOUNDARY_MODE_VERTEX) {
        for (let vi = 0; vi < 4; vi++) {
          best = pickNormPoint(
            b.handleOut[vi], priority, cx, cy, wall.id, 'handleOut', vi, VERTEX_HANDLE_HALF, 0.4, best,
          );
          best = pickNormPoint(
            b.handleIn[vi], priority, cx, cy, wall.id, 'handleIn', vi, VERTEX_HANDLE_HALF, 0.6, best,
          );
        }
      }
    });

    return best
      ? { wallId: best.wallId, kind: best.kind, index: best.index }
      : null;
  }

  /**
   * @param {number} px
   * @param {number} py
   * @param {{x:number,y:number}[]} poly
   */
  function pointInPolygon(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x;
      const yi = poly[i].y;
      const xj = poly[j].x;
      const yj = poly[j].y;
      const intersect =
        yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Active wall interior (not on a handle).
   * @returns {string|null} wallId
   */
  function findActiveWallInterior(clientX, clientY) {
    const activeId = getActiveWallId();
    if (!activeId) return null;
    const wall = getWalls().find((w) => w.id === activeId);
    if (!wall?.wallBoundary) return null;

    const { x: cx, y: cy } = toCanvasXY(clientX, clientY);
    const outline = boundaryOutlineNorm(wall.wallBoundary, 32);
    const poly = outline.map((p) => normToScreen(p));
    return pointInPolygon(cx, cy, poly) ? wall.id : null;
  }

  function onPointerDown(e) {
    if (e.button !== 0 || e.altKey) return;

    const hit = findHandle(e.clientX, e.clientY);
    if (!hit) return;

    const wall = getWalls().find((w) => w.id === hit.wallId);
    if (!wall?.wallBoundary) return;

    if (hit.kind === 'corner' && hit.wallId !== getActiveWallId()) {
      onSelectWall(hit.wallId);
    }

    drag = hit;
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function isSameHandle(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.wallId === b.wallId && a.kind === b.kind && a.index === b.index;
  }

  function setHover(clientX, clientY) {
    const hit = findHandle(clientX, clientY);
    if (isSameHandle(hover, hit)) return false;
    hover = hit;
    return true;
  }

  function onPointerMove(e) {
    if (drag) {
      const wall = getWalls().find((w) => w.id === drag.wallId);
      if (!wall?.wallBoundary) return;

      const pt = screenToNorm(e.clientX, e.clientY);
      const next = applyBoundaryPoint(wall.wallBoundary, drag.kind, drag.index, pt);
      onBoundaryChange(wall.id, next, { save: false });
      onChange();
      return;
    }

    if (setHover(e.clientX, e.clientY)) onChange();
  }

  function onPointerUp(e) {
    if (!drag) return;

    drag = null;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}
    onDragEnd?.();
    setHover(e.clientX, e.clientY);
    onChange();
  }

  function onPointerLeave() {
    if (!hover) return;
    hover = null;
    onChange();
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{x:number,y:number}} p
   * @param {boolean} highlighted
   * @param {boolean} isActive
   * @param {string} color
   * @param {'square'|'circle'} shape
   * @param {number} baseSize
   * @param {string} [label]
   */
  function drawHandle(ctx, p, highlighted, isActive, color, shape, baseSize, label) {
    const size = highlighted ? baseSize + 4 : baseSize;
    const half = size / 2;
    ctx.fillStyle = highlighted ? HOVER_FILL : isActive ? '#fff' : color;
    if (shape === 'square') {
      ctx.fillRect(p.x - half, p.y - half, size, size);
      ctx.strokeStyle = highlighted ? color : HOVER_STROKE;
      ctx.lineWidth = highlighted ? 2.5 : 2;
      ctx.strokeRect(p.x - half, p.y - half, size, size);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, half, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = HOVER_STROKE;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (label && isActive) {
      ctx.fillStyle = highlighted ? HOVER_STROKE : '#1a1a1e';
      ctx.font = highlighted ? 'bold 10px system-ui' : '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(label, p.x, p.y + 3);
    }
  }

  function isHit(wallId, kind, index) {
    return (
      (hover?.wallId === wallId && hover.kind === kind && hover.index === index) ||
      (drag?.wallId === wallId && drag.kind === kind && drag.index === index)
    );
  }

  function drawOverlay(ctx) {
    const walls = getWalls();
    const activeId = getActiveWallId();

    walls.forEach((wall) => {
      const boundary = wall.wallBoundary;
      if (!boundary) return;

      const color = getWallColor(wall.id);
      const isActive = wall.id === activeId;
      const curveMode = getBoundaryMode(boundary);
      const vertexMode = curveMode === BOUNDARY_MODE_VERTEX;
      const edgeMode = curveMode === BOUNDARY_MODE_EDGE;
      const offMode = curveMode === BOUNDARY_MODE_OFF;
      const outline = boundaryOutlineNorm(
        boundary,
        vertexMode ? 28 : offMode ? 1 : 20,
      ).map((p) =>
        normToScreen(p),
      );

      ctx.save();
      ctx.strokeStyle = isActive ? color : wallColorAlpha(color, '99');
      ctx.lineWidth = isActive ? 2.5 : 1.5;

      if (outline.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(outline[0].x, outline[0].y);
        for (let i = 1; i < outline.length; i++) {
          ctx.lineTo(outline[i].x, outline[i].y);
        }
        ctx.closePath();
        ctx.stroke();
      }

      if (isActive) {
        let cx = 0;
        let cy = 0;
        for (const p of boundary.corners) {
          const s = normToScreen(p);
          cx += s.x;
          cy += s.y;
        }
        cx /= 4;
        cy /= 4;
        ctx.font = '12px system-ui';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.fillText(wall.name, cx, cy);

        for (let i = 0; i < 4; i++) {
          const a = normToScreen(boundary.corners[i]);
          const b = normToScreen(boundary.corners[(i + 1) % 4]);

          if (offMode) {
            ctx.strokeStyle = wallColorAlpha(color, 'aa');
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          } else if (vertexMode) {
            const out = normToScreen(boundary.handleOut[i]);
            const inn = normToScreen(boundary.handleIn[(i + 1) % 4]);

            ctx.strokeStyle = wallColorAlpha(color, 'aa');
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(out.x, out.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(inn.x, inn.y);
            ctx.stroke();

            ctx.strokeStyle = wallColorAlpha(color, '55');
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.bezierCurveTo(out.x, out.y, inn.x, inn.y, b.x, b.y);
            ctx.stroke();
            ctx.setLineDash([]);
          } else if (edgeMode) {
            const c = normToScreen(boundary.edges[i]);

            ctx.strokeStyle = wallColorAlpha(color, 'aa');
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(c.x, c.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(c.x, c.y);
            ctx.stroke();

            ctx.strokeStyle = wallColorAlpha(color, '55');
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        for (let i = 0; i < 4; i++) {
          drawHandle(
            ctx,
            normToScreen(boundary.corners[i]),
            isHit(wall.id, 'corner', i),
            true,
            color,
            'square',
            14,
            String(i + 1),
          );
        }

        if (vertexMode) {
          for (let i = 0; i < 4; i++) {
            drawHandle(
              ctx,
              normToScreen(boundary.handleOut[i]),
              isHit(wall.id, 'handleOut', i),
              true,
              wallColorAlpha(color, 'cc'),
              'circle',
              8,
            );
            drawHandle(
              ctx,
              normToScreen(boundary.handleIn[i]),
              isHit(wall.id, 'handleIn', i),
              true,
              wallColorAlpha(color, '99'),
              'circle',
              7,
            );
          }
        } else if (edgeMode) {
          for (let i = 0; i < 4; i++) {
            drawHandle(
              ctx,
              normToScreen(boundary.edges[i]),
              isHit(wall.id, 'edge', i),
              true,
              wallColorAlpha(color, 'cc'),
              'circle',
              8,
            );
          }
        }
      } else {
        for (let i = 0; i < 4; i++) {
          drawHandle(
            ctx,
            normToScreen(boundary.corners[i]),
            false,
            false,
            color,
            'square',
            10,
          );
        }
      }

      ctx.restore();
    });
  }

  canvas.addEventListener('dblclick', (e) => {
    const hit = findHandle(e.clientX, e.clientY);
    if (hit) {
      const wall = getWalls().find((w) => w.id === hit.wallId);
      if (!wall?.wallBoundary || wall.id !== getActiveWallId()) return;

      const next =
        hit.kind === 'corner'
          ? resetBoundaryCorner(wall.wallBoundary, hit.index)
          : resetBoundaryHandle(wall.wallBoundary, hit.kind, hit.index);
      onBoundaryChange(wall.id, next, { save: true });
      onChange();
      e.preventDefault();
      return;
    }

    const wallId = findActiveWallInterior(e.clientX, e.clientY);
    if (!wallId) return;

    const wall = getWalls().find((w) => w.id === wallId);
    if (!wall?.wallBoundary) return;

    onBoundaryChange(wallId, resetBoundaryAll(wall.wallBoundary), { save: true });
    onChange();
    e.preventDefault();
  });

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerenter', (e) => {
    if (!drag && setHover(e.clientX, e.clientY)) onChange();
  });
  canvas.addEventListener('pointerleave', onPointerLeave);

  return {
    drawOverlay,
    get dragging() {
      return !!drag;
    },
    get hovering() {
      return !!hover;
    },
  };
}

/** @deprecated use defaultWallBoundary */
export function defaultCornersNorm(index) {
  return defaultWallBoundary(index).corners;
}
