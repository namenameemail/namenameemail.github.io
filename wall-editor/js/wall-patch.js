/**
 * Wall boundary: Coons patch over 4 edges (BL→BR→TR→TL).
 * - off: straight edges between corners (no curve handles)
 * - edge: quadratic Bezier per edge (1 control on edge)
 * - vertex: cubic Bezier per edge (handleOut + handleIn at vertices)
 */

import { itemQuadMeters } from './warp.js';
import { imagePxToBase } from './gl/homography-gl.js';

/** @typedef {{x:number,y:number}} PointNorm */
/** @typedef {'off'|'edge'|'vertex'} BoundaryMode */
/**
 * Active `mode` selects rendering; `edges` / handles are kept when switching modes.
 * @typedef {Object} WallBoundary
 * @property {BoundaryMode} mode
 * @property {PointNorm[]} corners
 * @property {PointNorm[]} edges
 * @property {PointNorm[]} handleOut
 * @property {PointNorm[]} handleIn
 */

export const BOUNDARY_MODE_OFF = 'off';
export const BOUNDARY_MODE_EDGE = 'edge';
export const BOUNDARY_MODE_VERTEX = 'vertex';

const GRID = 14;

/**
 * @param {number} v
 */
function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * @param {unknown} p
 * @returns {PointNorm}
 */
function normPoint(p) {
  const o = /** @type {{x?:number,y?:number}} */ (p);
  return { x: clamp01(Number(o?.x) || 0), y: clamp01(Number(o?.y) || 0) };
}

/**
 * @param {WallBoundary} b
 * @returns {BoundaryMode}
 */
export function getBoundaryMode(b) {
  if (b.mode === BOUNDARY_MODE_VERTEX) return BOUNDARY_MODE_VERTEX;
  if (b.mode === BOUNDARY_MODE_OFF) return BOUNDARY_MODE_OFF;
  return BOUNDARY_MODE_EDGE;
}

/**
 * @param {PointNorm[]} pts
 */
function clonePoints(pts) {
  return pts.map((p) => ({ ...p }));
}

/**
 * @param {WallBoundary} boundary
 * @returns {WallBoundary}
 */
export function cloneBoundary(boundary) {
  const b = withCurveData(boundary);
  return {
    mode: b.mode,
    corners: clonePoints(b.corners),
    edges: clonePoints(b.edges),
    handleOut: clonePoints(b.handleOut),
    handleIn: clonePoints(b.handleIn),
  };
}

/**
 * @param {PointNorm[]} corners
 * @param {Record<string, unknown>} [raw]
 * @returns {{ edges: PointNorm[], handleOut: PointNorm[], handleIn: PointNorm[] }}
 */
function resolveStoredCurveData(corners, raw = {}) {
  const rawEdges =
    Array.isArray(raw.edges) && raw.edges.length === 4 ? raw.edges.map(normPoint) : null;
  const rawOut =
    Array.isArray(raw.handleOut) && raw.handleOut.length === 4
      ? raw.handleOut.map(normPoint)
      : null;
  const rawIn =
    Array.isArray(raw.handleIn) && raw.handleIn.length === 4
      ? raw.handleIn.map(normPoint)
      : null;

  let edges = rawEdges;
  let handleOut = rawOut;
  let handleIn = rawIn;

  if (!edges) {
    if (handleOut && handleIn) {
      edges = vertexBoundaryToEdge({
        mode: BOUNDARY_MODE_VERTEX,
        corners,
        handleOut,
        handleIn,
      }).edges;
    } else {
      edges = straightEdgesFromCorners(corners);
    }
  }

  if (!handleOut || !handleIn) {
    if (rawEdges || edges) {
      const v = edgeBoundaryToVertex({
        mode: BOUNDARY_MODE_EDGE,
        corners,
        edges: rawEdges ?? edges,
      });
      handleOut = v.handleOut;
      handleIn = v.handleIn;
    } else {
      ({ handleOut, handleIn } = straightVertexHandlesFromCorners(corners));
    }
  }

  return {
    edges: clonePoints(edges),
    handleOut: clonePoints(handleOut),
    handleIn: clonePoints(handleIn),
  };
}

/**
 * Ensure edges + vertex handles exist (stored values win over derived).
 * @param {Partial<WallBoundary> & { corners: PointNorm[] }} boundary
 * @returns {WallBoundary}
 */
export function withCurveData(boundary) {
  const corners = boundary.corners.map((p) => ({ ...p }));
  const { edges, handleOut, handleIn } = resolveStoredCurveData(corners, boundary);
  const mode = getBoundaryMode(/** @type {WallBoundary} */ (boundary));
  return { mode, corners, edges, handleOut, handleIn };
}

/**
 * @param {PointNorm[]} corners
 * @returns {PointNorm[]}
 */
export function straightEdgesFromCorners(corners) {
  return corners.map((c, i) => {
    const n = corners[(i + 1) % 4];
    return { x: (c.x + n.x) / 2, y: (c.y + n.y) / 2 };
  });
}

/**
 * @param {PointNorm[]} corners
 * @returns {{ handleOut: PointNorm[], handleIn: PointNorm[] }}
 */
export function straightVertexHandlesFromCorners(corners) {
  const handleOut = [];
  const handleIn = [];
  for (let i = 0; i < 4; i++) {
    const prev = corners[(i + 3) % 4];
    const curr = corners[i];
    const next = corners[(i + 1) % 4];
    handleIn.push({
      x: curr.x + (prev.x - curr.x) / 3,
      y: curr.y + (prev.y - curr.y) / 3,
    });
    handleOut.push({
      x: curr.x + (next.x - curr.x) / 3,
      y: curr.y + (next.y - curr.y) / 3,
    });
  }
  return { handleOut, handleIn };
}

/**
 * @param {PointNorm[]} corners
 * @param {number} edgeIndex
 * @returns {PointNorm}
 */
export function straightEdgeControl(corners, edgeIndex) {
  const a = corners[edgeIndex];
  const b = corners[(edgeIndex + 1) % 4];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * @param {WallBoundary} boundary
 * @param {number} edgeIndex
 * @returns {WallBoundary}
 */
export function resetBoundaryEdge(boundary, edgeIndex) {
  const next = cloneBoundary(boundary);
  next.mode = BOUNDARY_MODE_EDGE;
  next.edges = next.edges.map((p, i) =>
    i === edgeIndex ? straightEdgeControl(next.corners, i) : p,
  );
  return next;
}

/**
 * @param {WallBoundary} boundary
 * @param {number} vertexIndex
 * @returns {WallBoundary}
 */
export function resetBoundaryVertex(boundary, vertexIndex) {
  const { handleIn, handleOut } = straightVertexHandlesFromCorners(boundary.corners);
  const next = cloneBoundary(boundary);
  next.mode = BOUNDARY_MODE_VERTEX;
  next.handleOut = next.handleOut.map((p, i) =>
    i === vertexIndex ? { ...handleOut[i] } : p,
  );
  next.handleIn = next.handleIn.map((p, i) =>
    i === vertexIndex ? { ...handleIn[i] } : p,
  );
  return next;
}

/**
 * @param {WallBoundaryEdge} edgeB
 * @returns {WallBoundaryVertex}
 */
export function edgeBoundaryToVertex(edgeB) {
  const corners = edgeB.corners.map((p) => ({ ...p }));
  const handleOut = [];
  const handleIn = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const c = edgeB.edges[i];
    handleOut.push({
      x: a.x + (2 / 3) * (c.x - a.x),
      y: a.y + (2 / 3) * (c.y - a.y),
    });
    handleIn.push({
      x: b.x + (2 / 3) * (c.x - b.x),
      y: b.y + (2 / 3) * (c.y - b.y),
    });
  }
  return { mode: BOUNDARY_MODE_VERTEX, corners, handleOut, handleIn };
}

/**
 * @param {WallBoundaryVertex} vertexB
 * @returns {WallBoundaryEdge}
 */
export function vertexBoundaryToEdge(vertexB) {
  const corners = vertexB.corners.map((p) => ({ ...p }));
  const edges = [];
  for (let i = 0; i < 4; i++) {
    edges.push(evalBoundaryEdge({ ...vertexB, corners }, i, 0.5));
  }
  return { mode: BOUNDARY_MODE_EDGE, corners, edges };
}

/**
 * @param {WallBoundary} boundary
 * @param {BoundaryMode} mode
 * @returns {WallBoundary}
 */
export function convertBoundaryMode(boundary, mode) {
  const full = withCurveData(boundary);
  if (full.mode === mode) return full;
  return { ...full, mode };
}

/**
 * @param {unknown} raw
 * @returns {WallBoundary|null}
 */
export function normalizeWallBoundary(raw) {
  if (!raw) return null;

  if (Array.isArray(raw) && raw.length === 4) {
    const corners = raw.map(normPoint);
    const mode = BOUNDARY_MODE_OFF;
    const { edges, handleOut, handleIn } = resolveStoredCurveData(corners, {});
    return { mode, corners, edges, handleOut, handleIn };
  }

  const o = /** @type {Record<string, unknown>} */ (raw);
  if (!Array.isArray(o.corners) || o.corners.length !== 4) return null;

  const corners = o.corners.map(normPoint);
  const mode =
    o.mode === BOUNDARY_MODE_OFF
      ? BOUNDARY_MODE_OFF
      : o.mode === BOUNDARY_MODE_VERTEX
        ? BOUNDARY_MODE_VERTEX
        : o.mode === BOUNDARY_MODE_EDGE
          ? BOUNDARY_MODE_EDGE
          : BOUNDARY_MODE_OFF;
  const { edges, handleOut, handleIn } = resolveStoredCurveData(corners, o);
  return { mode, corners, edges, handleOut, handleIn };
}

/**
 * @param {WallBoundary} b
 * @returns {string}
 */
export function boundarySignature(b) {
  const full = withCurveData(b);
  const parts = [full.mode, ...full.corners.map((p) => `${p.x.toFixed(5)},${p.y.toFixed(5)}`)];
  parts.push(...full.edges, ...full.handleOut, ...full.handleIn);
  return parts.map((p) => (typeof p === 'string' ? p : `${p.x.toFixed(5)},${p.y.toFixed(5)}`)).join('|');
}

/**
 * @param {PointNorm} a
 * @param {PointNorm} c
 * @param {PointNorm} b
 * @param {number} t
 */
export function quadraticPoint(a, c, b, t) {
  const s = 1 - t;
  return {
    x: s * s * a.x + 2 * s * t * c.x + t * t * b.x,
    y: s * s * a.y + 2 * s * t * c.y + t * t * b.y,
  };
}

/**
 * @param {PointNorm} p0
 * @param {PointNorm} p1
 * @param {PointNorm} p2
 * @param {PointNorm} p3
 * @param {number} t
 */
export function cubicPoint(p0, p1, p2, p3, t) {
  const s = 1 - t;
  const s2 = s * s;
  const s3 = s2 * s;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: s3 * p0.x + 3 * s2 * t * p1.x + 3 * s * t2 * p2.x + t3 * p3.x,
    y: s3 * p0.y + 3 * s2 * t * p1.y + 3 * s * t2 * p2.y + t3 * p3.y,
  };
}

/**
 * @param {WallBoundary} boundary
 * @param {number} edgeIndex
 * @param {number} t
 */
export function evalBoundaryEdge(boundary, edgeIndex, t) {
  const i = edgeIndex;
  const a = boundary.corners[i];
  const b = boundary.corners[(i + 1) % 4];

  if (boundary.mode === BOUNDARY_MODE_OFF) {
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  }

  if (boundary.mode === BOUNDARY_MODE_VERTEX) {
    return cubicPoint(a, boundary.handleOut[i], boundary.handleIn[(i + 1) % 4], b, t);
  }

  return quadraticPoint(a, boundary.edges[i], b, t);
}

/**
 * @param {WallBoundary} boundary
 * @param {number} u
 * @param {number} v
 */
export function coonsPatchNorm(boundary, u, v) {
  const c = boundary.corners;
  const bottom = evalBoundaryEdge(boundary, 0, u);
  const right = evalBoundaryEdge(boundary, 1, v);
  const top = evalBoundaryEdge(boundary, 2, 1 - u);
  const left = evalBoundaryEdge(boundary, 3, 1 - v);

  const bilinearX =
    (1 - u) * (1 - v) * c[0].x +
    u * (1 - v) * c[1].x +
    u * v * c[2].x +
    (1 - u) * v * c[3].x;
  const bilinearY =
    (1 - u) * (1 - v) * c[0].y +
    u * (1 - v) * c[1].y +
    u * v * c[2].y +
    (1 - u) * v * c[3].y;

  return {
    x:
      (1 - v) * bottom.x +
      v * top.x +
      (1 - u) * left.x +
      u * right.x -
      bilinearX,
    y:
      (1 - v) * bottom.y +
      v * top.y +
      (1 - u) * left.y +
      u * right.y -
      bilinearY,
  };
}

/**
 * @param {WallBoundary} boundary
 * @param {number} xM
 * @param {number} yM
 * @param {number} widthM
 * @param {number} heightM
 */
export function wallMetersToNorm(boundary, xM, yM, widthM, heightM) {
  const u = widthM > 0 ? xM / widthM : 0;
  const v = heightM > 0 ? yM / heightM : 0;
  return coonsPatchNorm(boundary, u, v);
}

/**
 * @param {WallBoundary} boundary
 * @param {number} xM
 * @param {number} yM
 * @param {number} widthM
 * @param {number} heightM
 * @param {number} imgW
 * @param {number} imgH
 */
export function wallMetersToPx(boundary, xM, yM, widthM, heightM, imgW, imgH) {
  const p = wallMetersToNorm(boundary, xM, yM, widthM, heightM);
  return { x: p.x * imgW, y: p.y * imgH };
}

/**
 * @param {number} index
 * @returns {WallBoundaryEdge}
 */
export function defaultWallBoundary(index) {
  const offset = (index % 5) * 0.04;
  const x0 = 0.28 + offset;
  const y0 = 0.62 + offset * 0.5;
  const w = 0.22;
  const h = 0.28;
  const corners = [
    { x: x0, y: y0 },
    { x: x0 + w, y: y0 },
    { x: x0 + w, y: y0 - h },
    { x: x0, y: y0 - h },
  ];
  const edges = straightEdgesFromCorners(corners);
  const { handleOut, handleIn } = straightVertexHandlesFromCorners(corners);
  return { mode: BOUNDARY_MODE_OFF, corners, edges, handleOut, handleIn };
}

/**
 * @param {WallBoundary} boundary
 * @param {'corner'|'edge'|'handleOut'|'handleIn'} kind
 * @param {number} index
 * @param {{x:number,y:number}} pt
 * @returns {WallBoundary}
 */
export function applyBoundaryPoint(boundary, kind, index, pt) {
  const p = { x: pt.x, y: pt.y };
  const next = cloneBoundary(boundary);

  if (kind === 'corner') next.corners[index] = p;
  else if (kind === 'edge') next.edges[index] = p;
  else if (kind === 'handleOut') next.handleOut[index] = p;
  else if (kind === 'handleIn') next.handleIn[index] = p;

  return next;
}

/**
 * @param {WallBoundary} boundary
 * @param {'corner'|'edge'|'handleOut'|'handleIn'} kind
 * @param {number} index
 * @returns {WallBoundary}
 */
export function resetBoundaryHandle(boundary, kind, index) {
  if (boundary.mode === BOUNDARY_MODE_OFF) return boundary;
  if (boundary.mode === BOUNDARY_MODE_VERTEX) {
    if (kind === 'handleOut' || kind === 'handleIn') {
      return resetBoundaryVertex(boundary, index);
    }
    return boundary;
  }
  if (kind === 'edge') return resetBoundaryEdge(boundary, index);
  return boundary;
}

/**
 * Reset Bezier controls at a corner (both adjacent edges or vertex tangents).
 * @param {WallBoundary} boundary
 * @param {number} cornerIndex
 * @returns {WallBoundary}
 */
export function resetBoundaryCorner(boundary, cornerIndex) {
  if (boundary.mode === BOUNDARY_MODE_OFF) return cloneBoundary(boundary);
  if (getBoundaryMode(boundary) === BOUNDARY_MODE_VERTEX) {
    return resetBoundaryVertex(boundary, cornerIndex);
  }
  const e0 = (cornerIndex + 3) % 4;
  const e1 = cornerIndex;
  return resetBoundaryEdge(resetBoundaryEdge(boundary, e0), e1);
}

/**
 * Reset all edge / vertex Bezier controls to straight (corners unchanged).
 * @param {WallBoundary} boundary
 * @returns {WallBoundary}
 */
export function resetBoundaryAll(boundary) {
  const corners = boundary.corners.map((p) => ({ ...p }));
  const edges = straightEdgesFromCorners(corners);
  const { handleIn, handleOut } = straightVertexHandlesFromCorners(corners);
  return {
    mode: boundary.mode,
    corners,
    edges,
    handleIn,
    handleOut,
  };
}

/**
 * @param {WallBoundary} boundary
 * @param {number} [segments]
 */
export function boundaryOutlineNorm(boundary, segments = 16) {
  const segs =
    boundary.mode === BOUNDARY_MODE_VERTEX
      ? Math.max(segments, 24)
      : boundary.mode === BOUNDARY_MODE_OFF
        ? 1
        : segments;
  const pts = [];
  for (let e = 0; e < 4; e++) {
    for (let s = 0; s < segs; s++) {
      if (e > 0 && s === 0) continue;
      pts.push(evalBoundaryEdge(boundary, e, s / segs));
    }
  }
  return pts;
}

/**
 * @param {import('./state.js').WallItem} item
 * @param {import('./state.js').Wall} wall
 * @param {WallBoundary} boundary
 * @param {number} imgW
 * @param {number} imgH
 * @param {import('./gl/homography-gl.js').BaseLayout} layout
 * @param {number} [subdiv]
 * @returns {Float32Array|null}
 */
export function itemMeshVertsOnWall(item, wall, boundary, imgW, imgH, layout, subdiv = 8) {
  const q = itemQuadMeters(item);

  const cols = subdiv + 1;
  const rows = subdiv + 1;
  const grid = [];
  const uvGrid = [];

  for (let j = 0; j < rows; j++) {
    const row = [];
    const uvRow = [];
    const v = j / subdiv;
    for (let i = 0; i < cols; i++) {
      const u = i / subdiv;
      const xM =
        (1 - u) * (1 - v) * q[0].x +
        u * (1 - v) * q[1].x +
        u * v * q[2].x +
        (1 - u) * v * q[3].x;
      const yM =
        (1 - u) * (1 - v) * q[0].y +
        u * (1 - v) * q[1].y +
        u * v * q[2].y +
        (1 - u) * v * q[3].y;
      const norm = wallMetersToNorm(boundary, xM, yM, wall.widthM, wall.heightM);
      const px = { x: norm.x * imgW, y: norm.y * imgH };
      row.push(imagePxToBase(px, layout));
      uvRow.push({ x: u, y: 1 - v });
    }
    grid.push(row);
    uvGrid.push(uvRow);
  }

  const tri = [];
  for (let j = 0; j < subdiv; j++) {
    for (let i = 0; i < subdiv; i++) {
      tri.push(
        [grid[j][i], uvGrid[j][i]],
        [grid[j][i + 1], uvGrid[j][i + 1]],
        [grid[j + 1][i], uvGrid[j + 1][i]],
        [grid[j][i + 1], uvGrid[j][i + 1]],
        [grid[j + 1][i + 1], uvGrid[j + 1][i + 1]],
        [grid[j + 1][i], uvGrid[j + 1][i]],
      );
    }
  }

  const out = new Float32Array(tri.length * 4);
  let o = 0;
  for (const [p, uv] of tri) {
    out[o++] = p.x;
    out[o++] = p.y;
    out[o++] = uv.x;
    out[o++] = uv.y;
  }
  return out;
}
