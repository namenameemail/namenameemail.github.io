/**
 * Homography + view matrix helpers for WebGL preview.
 */

import {
  homographyWallToImage,
  cornersNormToPx,
  applyH,
} from '../homography.js';
import { itemQuadMeters } from '../warp.js';

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
export function imageCenter(base) {
  return {
    cx: base.offsetX + (base.imgW * base.scale) / 2,
    cy: base.offsetY + (base.imgH * base.scale) / 2,
  };
}

/**
 * Image pixel → fitted preview (base) coordinates.
 * @param {{x:number,y:number}} p
 * @param {BaseLayout} layout
 */
export function imagePxToBase(p, layout) {
  return {
    x: layout.offsetX + p.x * layout.scale,
    y: layout.offsetY + p.y * layout.scale,
  };
}

/**
 * @param {import('../state.js').Wall} wall
 * @param {BaseLayout} layout
 * @returns {number[]|null}
 */
export function wallHomographyToImagePx(wall, layout) {
  const { imgW, imgH, offsetX, offsetY, scale } = layout;
  const dstPx = cornersNormToPx(wall.cornersNorm, imgW, imgH).map((p) => ({
    x: offsetX + p.x * scale,
    y: offsetY + p.y * scale,
  }));
  return homographyWallToImage(wall.widthM, wall.heightM, dstPx);
}

/**
 * Two triangles (6 verts) interleaved pos+uv for affine textured quad.
 * @param {{x:number,y:number}[]} base4
 * @param {{x:number,y:number}[]} uv4
 * @returns {Float32Array} 6 * 4 floats
 */
export function quadToTriangleVerts(base4, uv4) {
  const tri = [0, 1, 2, 0, 2, 3];
  const out = new Float32Array(tri.length * 4);
  let o = 0;
  for (const idx of tri) {
    out[o++] = base4[idx].x;
    out[o++] = base4[idx].y;
    out[o++] = uv4[idx].x;
    out[o++] = uv4[idx].y;
  }
  return out;
}

/**
 * Photo layout rect → 6 verts.
 * @param {BaseLayout} layout
 */
export function photoLayoutVerts(layout) {
  const { offsetX, offsetY, imgW, imgH, scale } = layout;
  const x0 = offsetX;
  const y0 = offsetY;
  const x1 = offsetX + imgW * scale;
  const y1 = offsetY + imgH * scale;
  const base4 = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  // texImage2D: верх картинки в браузере → v=0 в GL; экран y вниз → верх экрана = uv.y 0
  const uv4 = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  return quadToTriangleVerts(base4, uv4);
}

/**
 * Full canvas quad for compositing FBO layer.
 * @param {number} cssW
 * @param {number} cssH
 */
export function fullscreenVerts(cssW, cssH) {
  const base4 = [
    { x: 0, y: 0 },
    { x: cssW, y: 0 },
    { x: cssW, y: cssH },
    { x: 0, y: cssH },
  ];
  const uv4 = [
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { x: 1, y: 0 },
    { x: 0, y: 0 },
  ];
  return quadToTriangleVerts(base4, uv4);
}

/**
 * @param {number[]} H
 * @param {import('../state.js').WallItem} item
 * @param {BaseLayout} layout
 */
export function itemQuadWithRealUv(item, H, layout) {
  const quadM = itemQuadMeters(item);
  const base = [];
  const uv = [];
  const uvCorners = [
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { x: 1, y: 0 },
    { x: 0, y: 0 },
  ];

  for (let i = 0; i < 4; i++) {
    const q = applyH(H, quadM[i].x, quadM[i].y);
    if (!q) return null;
    base.push(imagePxToBase(q, layout));
    uv.push(uvCorners[i]);
  }
  return { base, uv };
}

/**
 * Item quad in wall-meter coordinates + browser image UVs.
 * @param {import('../state.js').WallItem} item
 */
export function itemWallQuadWithRealUv(item) {
  return {
    base: itemQuadMeters(item),
    uv: [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ],
  };
}
