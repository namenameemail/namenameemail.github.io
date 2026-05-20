/**
 * Preview overlay: all walls visible, draggable corner handles.
 */

import { isSimpleQuad } from './homography.js';

const HANDLE_HALF = 10;
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

/** Цвет стены по её порядку в комнате (не по списку видимых на фото). */
export function wallColorAt(index) {
  return WALL_COLORS[index % WALL_COLORS.length];
}

/**
 * @param {object} opts
 * @param {() => import('./app.js').Wall[]} opts.getWalls
 * @param {(wallId: string) => number} opts.getWallColorIndex
 * @param {() => string} opts.getActiveWallId
 * @param {(wallId: string, corners: {x:number,y:number}[]|null, opts?: {save?: boolean}) => void} opts.onCornersChange
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
    getWallColorIndex,
    getActiveWallId,
    onCornersChange,
    screenToNorm,
    normToScreen,
    getScreenRect,
    canvas,
    setStatus,
    onChange,
    onDragEnd,
  } = opts;

  function pointerRect() {
    if (getScreenRect) return getScreenRect();
    return canvas.getBoundingClientRect();
  }

  /** @type {{ wallId: string, cornerIndex: number } | null} */
  let drag = null;
  /** @type {{ wallId: string, cornerIndex: number } | null} */
  let hover = null;

  function toCanvasXY(clientX, clientY) {
    const rect = pointerRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  /**
   * @returns {{ wallId: string, cornerIndex: number } | null}
   */
  function findHandle(clientX, clientY) {
    const { x: cx, y: cy } = toCanvasXY(clientX, clientY);
    const walls = getWalls();
    const activeId = getActiveWallId();

    /** @type {{ wallId: string, cornerIndex: number, dist: number } | null} */
    let best = null;

    walls.forEach((wall, wi) => {
      const corners = wall.cornersNorm;
      if (!corners?.length) return;

      corners.forEach((p, ci) => {
        const px = normToScreen(p);
        if (
          Math.abs(cx - px.x) > HANDLE_HALF ||
          Math.abs(cy - px.y) > HANDLE_HALF
        ) {
          return;
        }
        const dist = Math.hypot(cx - px.x, cy - px.y);

        const priority = wall.id === activeId ? 0 : 1;
        const score = priority * 1000 + dist;
        if (!best || score < best.dist) {
          best = { wallId: wall.id, cornerIndex: ci, dist: score };
        }
      });
    });

    return best ? { wallId: best.wallId, cornerIndex: best.cornerIndex } : null;
  }

  function onPointerDown(e) {
    if (e.button !== 0 || e.altKey) return;

    const hit = findHandle(e.clientX, e.clientY);
    if (!hit) return;

    const wall = getWalls().find((w) => w.id === hit.wallId);
    if (!wall?.cornersNorm) return;

    drag = hit;
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function isSameHandle(
    a,
    b,
  ) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.wallId === b.wallId && a.cornerIndex === b.cornerIndex;
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
      if (!wall?.cornersNorm) return;

      const pt = screenToNorm(e.clientX, e.clientY);
      const corners = wall.cornersNorm.map((p, i) =>
        i === drag.cornerIndex ? { x: pt.x, y: pt.y } : { ...p }
      );

      if (corners.length === 4 && !isSimpleQuad(corners)) return;

      onCornersChange(wall.id, corners, { save: false });
      onChange();
      return;
    }

    if (setHover(e.clientX, e.clientY)) onChange();
  }

  function onPointerUp(e) {
    if (!drag) return;

    const wall = getWalls().find((w) => w.id === drag.wallId);
    if (wall?.cornersNorm?.length === 4 && !isSimpleQuad(wall.cornersNorm)) {
      setStatus('Ошибка: четырёхугольник самопересекается');
    }

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

  function drawOverlay(ctx) {
    const walls = getWalls();
    const activeId = getActiveWallId();

    walls.forEach((wall, wi) => {
      const corners = wall.cornersNorm;
      if (!corners?.length) return;

      const color = wallColorAt(getWallColorIndex(wall.id));
      const isActive = wall.id === activeId;
      const pxCorners = corners.map((p) => normToScreen(p));

      ctx.save();
      ctx.strokeStyle = isActive ? color : color + '99';
      ctx.lineWidth = isActive ? 2.5 : 1.5;

      if (pxCorners.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(pxCorners[0].x, pxCorners[0].y);
        for (let i = 1; i < pxCorners.length; i++) {
          ctx.lineTo(pxCorners[i].x, pxCorners[i].y);
        }
        if (pxCorners.length === 4) ctx.closePath();
        ctx.stroke();
      }

      if (isActive && pxCorners.length === 4) {
        const cx = pxCorners.reduce((s, p) => s + p.x, 0) / 4;
        const cy = pxCorners.reduce((s, p) => s + p.y, 0) / 4;
        ctx.font = '12px system-ui';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.fillText(wall.name, cx, cy);
      }

      pxCorners.forEach((p, i) => {
        const isHovered =
          hover?.wallId === wall.id && hover.cornerIndex === i;
        const isDragged =
          drag?.wallId === wall.id && drag.cornerIndex === i;
        const highlighted = isHovered || isDragged;
        const size = highlighted ? (isActive ? 18 : 14) : isActive ? 14 : 10;
        const half = size / 2;

        ctx.fillStyle = highlighted ? HOVER_FILL : isActive ? '#fff' : color;
        ctx.fillRect(p.x - half, p.y - half, size, size);
        ctx.strokeStyle = highlighted ? color : HOVER_STROKE;
        ctx.lineWidth = highlighted ? 2.5 : 2;
        ctx.strokeRect(p.x - half, p.y - half, size, size);

        if (isActive) {
          ctx.fillStyle = highlighted ? HOVER_STROKE : '#1a1a1e';
          ctx.font = highlighted ? 'bold 10px system-ui' : '10px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(String(i + 1), p.x, p.y + 3);
        }
      });

      ctx.restore();
    });
  }

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

/**
 * Default 4 corners for a new wall (staggered by index).
 * @param {number} index
 * @returns {{x:number,y:number}[]}
 */
export function defaultCornersNorm(index) {
  const offset = (index % 5) * 0.04;
  const x0 = 0.28 + offset;
  const y0 = 0.62 + offset * 0.5;
  const w = 0.22;
  const h = 0.28;
  return [
    { x: x0, y: y0 },
    { x: x0 + w, y: y0 },
    { x: x0 + w, y: y0 - h },
    { x: x0, y: y0 - h },
  ];
}
