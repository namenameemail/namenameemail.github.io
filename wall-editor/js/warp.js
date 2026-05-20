/**
 * Draw an image mapped to a quadrilateral via two triangle affines.
 */

/**
 * Draw textured quad on 2D context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} image
 * @param {{x:number,y:number}[]} quad - 4 points [TL-style order: p0,p1,p2,p3]
 *   Expected order: bottom-left, bottom-right, top-right, top-left (same as homography)
 * @param {number} [opacity]
 */
/**
 * Map an arbitrary quad region of the image onto a destination quad (BL, BR, TR, TL).
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} image
 * @param {{x:number,y:number}[]} srcQuad
 * @param {{x:number,y:number}[]} dstQuad
 * @param {number} [opacity]
 */
export function drawTexturedQuadMapped(ctx, image, srcQuad, dstQuad, opacity = 1) {
  if (!image || srcQuad.length !== 4 || dstQuad.length !== 4) return;

  const iw = image.width || image.naturalWidth;
  const ih = image.height || image.naturalHeight;
  if (!iw || !ih) return;

  ctx.save();
  ctx.globalAlpha = opacity;
  drawTriangle(ctx, image, srcQuad[0], srcQuad[1], srcQuad[2], dstQuad[0], dstQuad[1], dstQuad[2]);
  drawTriangle(ctx, image, srcQuad[0], srcQuad[2], srcQuad[3], dstQuad[0], dstQuad[2], dstQuad[3]);
  ctx.restore();
}

export function drawTexturedQuad(ctx, image, quad, opacity = 1) {
  if (!image || quad.length !== 4) return;

  const iw = image.width || image.naturalWidth;
  const ih = image.height || image.naturalHeight;
  if (!iw || !ih) return;

  const src = [
    { x: 0, y: ih },
    { x: iw, y: ih },
    { x: iw, y: 0 },
    { x: 0, y: 0 },
  ];

  drawTexturedQuadMapped(ctx, image, src, quad, opacity);
}

/**
 * Affine warp one triangle from source image to destination.
 */
function drawTriangle(ctx, img, s0, s1, s2, d0, d1, d2) {
  const denom =
    s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(denom) < 1e-12) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();

  const m11 =
    (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denom;
  const m12 =
    (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denom;
  const m21 =
    (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denom;
  const m22 =
    (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denom;
  const dx =
    (d0.x * (s1.x * s2.y - s2.x * s1.y) +
      d1.x * (s2.x * s0.y - s0.x * s2.y) +
      d2.x * (s0.x * s1.y - s1.x * s0.y)) / denom;
  const dy =
    (d0.y * (s1.x * s2.y - s2.x * s1.y) +
      d1.y * (s2.x * s0.y - s0.x * s2.y) +
      d2.y * (s0.x * s1.y - s1.x * s0.y)) / denom;

  ctx.transform(m11, m12, m21, m22, dx, dy);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} rad — clockwise in wall coords (y up)
 */
function rotate2dCw(x, y, rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: x * c + y * s, y: -x * s + y * c };
}

/**
 * Build item quad in wall meters (BL, BR, TR, TL), with rotation around center.
 * @param {{xM:number,yM:number,widthM:number,heightM:number,rotationDeg?:number}} item
 * @returns {{x:number,y:number}[]}
 */
export function itemQuadMeters(item) {
  const { xM, yM, widthM, heightM } = item;
  const rot = ((item.rotationDeg ?? 0) * Math.PI) / 180;
  const cx = xM + widthM / 2;
  const cy = yM + heightM / 2;
  const hw = widthM / 2;
  const hh = heightM / 2;
  const local = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  return local.map((p) => {
    const r = rotate2dCw(p.x, p.y, rot);
    return { x: cx + r.x, y: cy + r.y };
  });
}
