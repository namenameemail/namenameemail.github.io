/**
 * Export active photo + wall overlays to JPG via WebGL (native resolution).
 */

import { createWebGL2 } from './gl/gl-context.js';
import { createPreviewPrograms, IDENTITY_VIEW } from './gl/gl-shaders.js';
import { GlTextureCache } from './gl/gl-textures.js';
import { itemMeshVertsOnWall } from './wall-patch.js';
import { quadToTriangleVerts } from './gl/homography-gl.js';
import { clearColor, drawTexturedTris } from './gl/gl-draw.js';

/**
 * @param {object} opts
 * @param {HTMLImageElement} opts.roomImage
 * @param {import('./state.js').Wall[]} opts.walls
 * @param {(photo: import('./state.js').Photo, wallId: string) => boolean} opts.isWallEnabled
 * @param {(photo: import('./state.js').Photo, wallId: string) => import('./wall-patch.js').WallBoundary|null} opts.getBoundary
 * @param {import('./state.js').Photo} opts.photo
 * @param {Map<string, HTMLImageElement>} opts.imageCache
 * @param {number} [opts.quality]
 * @returns {Promise<Blob|null>}
 */
export async function exportPreviewJpg(opts) {
  const { roomImage, walls, isWallEnabled, getBoundary, photo, imageCache, quality = 0.92 } =
    opts;

  const imgW = roomImage.naturalWidth;
  const imgH = roomImage.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = imgW;
  canvas.height = imgH;
  const gl =
    canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
    }) || null;
  if (!gl) return null;
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const programs = createPreviewPrograms(gl);
  const vbo = gl.createBuffer();
  const texCache = new GlTextureCache(gl);
  const photoSrc = roomImage.src || '__export_photo__';
  texCache.ensure(photoSrc, roomImage);

  clearColor(gl, imgW, imgH, 0, 0, 0, 1);

  const photoTex = texCache.bySrc.get(photoSrc);
  if (photoTex) {
    const base4 = [
      { x: 0, y: 0 },
      { x: imgW, y: 0 },
      { x: imgW, y: imgH },
      { x: 0, y: imgH },
    ];
    const uv4 = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const verts = quadToTriangleVerts(base4, uv4);
    drawTexturedTris(gl, programs.textured, vbo, verts, 6, photoTex.tex, IDENTITY_VIEW, imgW, imgH, 1);
  }

  const layout = { imgW, imgH, offsetX: 0, offsetY: 0, scale: 1 };

  for (const wall of walls) {
    if (!isWallEnabled(photo, wall.id)) continue;
    const boundary = getBoundary(photo, wall.id);
    if (!boundary) continue;

    for (const item of wall.items) {
      const img = imageCache.get(item.src);
      if (!img) continue;
      const texEntry = texCache.ensure(item.src, img);
      if (!texEntry) continue;

      const verts = itemMeshVertsOnWall(item, wall, boundary, imgW, imgH, layout, 10);
      if (!verts?.length) continue;

      drawTexturedTris(
        gl,
        programs.textured,
        vbo,
        verts,
        verts.length / 4,
        texEntry.tex,
        IDENTITY_VIEW,
        imgW,
        imgH,
        1,
      );
    }
  }

  gl.finish();

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}
