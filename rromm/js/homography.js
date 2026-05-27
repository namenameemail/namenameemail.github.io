/**
 * Homography (3x3) from four point correspondences via DLT.
 * Points: {x, y} in arbitrary 2D coordinates.
 */

/**
 * @param {{x:number,y:number}} p
 * @returns {[number, number, number]}
 */
function toHom(p) {
  return [p.x, p.y, 1];
}

/**
 * Solve 8x8 linear system Ax = b with Gaussian elimination.
 * @param {number[][]} A
 * @param {number[]} b
 * @returns {number[]}
 */
function solve8(A, b) {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];

    const div = M[col][col];
    if (Math.abs(div) < 1e-12) return new Array(8).fill(0);

    for (let j = col; j <= n; j++) M[col][j] /= div;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col];
      for (let j = col; j <= n; j++) M[row][j] -= factor * M[col][j];
    }
  }

  return M.map((row) => row[n]);
}

/**
 * Build homography H (3x3 row-major) mapping src -> dst.
 * @param {{x:number,y:number}[]} src - 4 points
 * @param {{x:number,y:number}[]} dst - 4 points
 * @returns {number[]|null} 9 elements or null if degenerate
 */
export function findHomography(src, dst) {
  if (src.length !== 4 || dst.length !== 4) return null;

  const A = [];
  const b = [];

  for (let i = 0; i < 4; i++) {
    const { x: xs, y: ys } = src[i];
    const { x: xd, y: yd } = dst[i];

    A.push([xs, ys, 1, 0, 0, 0, -xd * xs, -xd * ys]);
    b.push(xd);
    A.push([0, 0, 0, xs, ys, 1, -yd * xs, -yd * ys]);
    b.push(yd);
  }

  const h = solve8(A, b);
  const H = [
    h[0], h[1], h[2],
    h[3], h[4], h[5],
    h[6], h[7], 1,
  ];

  const det =
    H[0] * (H[4] * H[8] - H[5] * H[7]) -
    H[1] * (H[3] * H[8] - H[5] * H[6]) +
    H[2] * (H[3] * H[7] - H[4] * H[6]);

  if (Math.abs(det) < 1e-12) return null;
  return H;
}

/**
 * Apply homography to a point.
 * @param {number[]} H - 9 elements row-major
 * @param {number} x
 * @param {number} y
 * @returns {{x:number,y:number}|null}
 */
export function applyH(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  if (Math.abs(w) < 1e-12) return null;
  return {
    x: (H[0] * x + H[1] * y + H[2]) / w,
    y: (H[3] * x + H[4] * y + H[5]) / w,
  };
}

/**
 * Invert 3x3 homography.
 * @param {number[]} H
 * @returns {number[]|null}
 */
export function invertH(H) {
  const a = H[0], b = H[1], c = H[2];
  const d = H[3], e = H[4], f = H[5];
  const g = H[6], h = H[7], i = H[8];

  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const Hh = -(a * f - c * d);
  const I = a * e - b * d;

  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;

  const inv = [A, D, G, B, E, Hh, C, F, I];
  for (let j = 0; j < 9; j++) inv[j] /= det;
  return inv;
}

/**
 * Wall rectangle in meter coords -> homography to image pixels.
 * @param {number} widthM
 * @param {number} heightM
 * @param {{x:number,y:number}[]} dstPx - 4 corners on image (BL, BR, TR, TL)
 * @returns {number[]|null}
 */
export function homographyWallToImage(widthM, heightM, dstPx) {
  const src = [
    { x: 0, y: 0 },
    { x: widthM, y: 0 },
    { x: widthM, y: heightM },
    { x: 0, y: heightM },
  ];
  return findHomography(src, dstPx);
}

/**
 * Map normalized corners (0-1) to pixel coords for given image size.
 * @param {{x:number,y:number}[]} cornersNorm
 * @param {number} imgW
 * @param {number} imgH
 * @returns {{x:number,y:number}[]}
 */
export function cornersNormToPx(cornersNorm, imgW, imgH) {
  return cornersNorm.map((p) => ({ x: p.x * imgW, y: p.y * imgH }));
}

/**
 * Check if quadrilateral is simple (non self-intersecting).
 * @param {{x:number,y:number}[]} pts - 4 points
 * @returns {boolean}
 */
export function isSimpleQuad(pts) {
  if (pts.length < 4) return false;

  function cross(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  }

  function segmentsIntersect(p1, p2, p3, p4) {
    const d1 = cross(p1, p2, p3);
    const d2 = cross(p1, p2, p4);
    const d3 = cross(p3, p4, p1);
    const d4 = cross(p3, p4, p2);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    return false;
  }

  const edges = [[0, 1], [1, 2], [2, 3], [3, 0]];
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if (Math.abs(i - j) === 1 || (i === 0 && j === 3)) continue;
      const [a, b] = edges[i];
      const [c, d] = edges[j];
      if (segmentsIntersect(pts[a], pts[b], pts[c], pts[d])) return false;
    }
  }
  return true;
}
