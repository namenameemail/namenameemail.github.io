/**
 * WebGL2 preview: photo + per-wall FBO item layers + view transform.
 */

import { createWebGL2, setViewport } from './gl/gl-context.js';
import { createPreviewPrograms, IDENTITY_VIEW } from './gl/gl-shaders.js';
import { GlTextureCache } from './gl/gl-textures.js';
import {
  createFramebuffer,
  resizeFramebuffer,
  deleteFramebuffer,
} from './gl/gl-fbo.js';
import { photoLayoutVerts } from './gl/homography-gl.js';
import { itemMeshVertsOnWall } from './wall-patch.js';
import { clearColor, drawTexturedTris } from './gl/gl-draw.js';

export const MAX_DPR = 2;

export class PreviewRendererGL {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLCanvasElement} overlayCanvas
   * @param {HTMLElement} wrap
   * @param {{ onContextLost?: () => void, onContextRestored?: () => void }} [opts]
   */
  constructor(canvas, overlayCanvas, wrap, opts = {}) {
    this.canvas = canvas;
    this.overlayCanvas = overlayCanvas;
    this.wrap = wrap;
    this.stackEl =
      wrap.querySelector('.preview-canvas-stack') || wrap;
    this.gl = createWebGL2(canvas, {
      onLost: () => {
        this._lost = true;
        opts.onContextLost?.();
      },
      onRestored: () => {
        this._lost = false;
        this._initGl();
        opts.onContextRestored?.();
      },
    });
    this.available = !!this.gl;
    this._lost = false;

    /** @type {ReturnType<createPreviewPrograms>|null} */
    this.programs = null;
    /** @type {WebGLBuffer|null} */
    this.vbo = null;
    /** @type {GlTextureCache|null} */
    this.textureCache = null;

    /** @type {Map<string, { fb: WebGLFramebuffer, tex: WebGLTexture, width: number, height: number }>} */
    this.wallFbos = new Map();
    /** @type {Set<string>} */
    this.dirtyWalls = new Set();
    this.photoDirty = true;
    /** @type {string|null} */
    this.photoSrcKey = null;

    /** @type {Map<string, { key: string, H: number[] }>} */
    this.homographyCache = new Map();

    this.layout = { imgW: 0, imgH: 0, offsetX: 0, offsetY: 0, scale: 1 };
    this.sizeKey = '';
    this.cssW = 0;
    this.cssH = 0;
    this.dpr = 1;
    this.interactionScale = 1;

    if (this.gl) this._initGl();
    this.ensureSize();
  }

  _initGl() {
    const gl = this.gl;
    if (!gl) return;
    this.programs = createPreviewPrograms(gl);
    this.vbo = gl.createBuffer();
    this.textureCache = new GlTextureCache(gl);
    this.wallFbos.clear();
    this.dirtyWalls.clear();
    this.homographyCache.clear();
    this.photoDirty = true;
  }

  getTextureCache() {
    return this.textureCache;
  }

  /** @param {number} scale 0.5 during drag, 1 full */
  setInteractionScale(scale) {
    this.interactionScale = scale;
  }

  invalidateAll() {
    this.photoDirty = true;
    this.dirtyWalls.clear();
    for (const id of this.wallFbos.keys()) {
      this.dirtyWalls.add(id);
    }
    this.homographyCache.clear();
  }

  /** @param {string} wallId */
  invalidateWall(wallId) {
    this.dirtyWalls.add(wallId);
    this.homographyCache.delete(wallId);
  }

  invalidatePhoto() {
    this.photoDirty = true;
  }

  getLayout() {
    return { ...this.layout };
  }

  /** Screen/CSS rect of preview stack (single coord system for GL + overlay). */
  getScreenRect() {
    const r = this.stackEl.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      width: Math.max(1, Math.round(r.width)),
      height: Math.max(1, Math.round(r.height)),
    };
  }

  ensureSize() {
    const { width: w, height: h } = this.getScreenRect();
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.cssW = w;
    this.cssH = h;

    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    const bufferChanged =
      this.canvas.width !== pw || this.canvas.height !== ph;

    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    if (this.overlayCanvas) {
      this.overlayCanvas.style.width = `${w}px`;
      this.overlayCanvas.style.height = `${h}px`;
    }

    if (bufferChanged) {
      this.canvas.width = pw;
      this.canvas.height = ph;
      if (this.overlayCanvas) {
        this.overlayCanvas.width = pw;
        this.overlayCanvas.height = ph;
      }
      if (this.gl) {
        for (const fbo of this.wallFbos.values()) {
          resizeFramebuffer(this.gl, fbo, pw, ph);
        }
        this.photoDirty = true;
        this.invalidateAll();
      }
    }

    this.sizeKey = `${w}x${h}@${dpr}`;

    if (this.overlayCanvas) {
      const octx = this.overlayCanvas.getContext('2d');
      if (octx) octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  /**
   * @param {HTMLImageElement|null} roomImage
   */
  computeLayout(roomImage) {
    if (!roomImage) {
      this.layout = { imgW: 0, imgH: 0, offsetX: 0, offsetY: 0, scale: 1 };
      return;
    }
    const imgW = roomImage.naturalWidth;
    const imgH = roomImage.naturalHeight;
    const scale = Math.min(this.cssW / imgW, this.cssH / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    this.layout = {
      imgW,
      imgH,
      offsetX: (this.cssW - drawW) / 2,
      offsetY: (this.cssH - drawH) / 2,
      scale,
    };
  }

  /**
   * @param {import('./state.js').Wall} wall
   */
  _boundaryKey(wall) {
    const b = wall.wallBoundary;
    if (!b) return '';
    return `${wall.widthM}:${wall.heightM}:${boundarySignature(b)}`;
  }

  /**
   * @param {string} wallId
   */
  _ensureWallFbo(wallId) {
    const gl = this.gl;
    if (!gl) return null;
    const pw = Math.round(this.cssW * this.dpr);
    const ph = Math.round(this.cssH * this.dpr);
    let fbo = this.wallFbos.get(wallId);
    if (!fbo) {
      fbo = createFramebuffer(gl, pw, ph);
      if (fbo) this.wallFbos.set(wallId, fbo);
    } else {
      resizeFramebuffer(gl, fbo, pw, ph);
    }
    return fbo;
  }

  /**
   * Draw wall items on main framebuffer (same view matrix as photo & overlay).
   * @param {WebGL2RenderingContext} gl
   * @param {ReturnType<createPreviewPrograms>['projectiveTextured']} prog
   * @param {GlTextureCache} texCache
   * @param {import('./state.js').Wall} wall
   * @param {Map<string, HTMLImageElement>} imageCache
   * @param {Float32Array} viewMat
   */
  _drawWallItems(gl, prog, texCache, wall, imageCache, viewMat) {
    const boundary = wall.wallBoundary;
    if (!boundary || !this.vbo) return;

    const { imgW, imgH } = this.layout;
    if (!imgW || !imgH) return;

    for (const item of wall.items) {
      const img = imageCache.get(item.src);
      if (!img) continue;
      const texEntry = texCache.ensure(item.src, img);
      if (!texEntry) continue;

      const verts = itemMeshVertsOnWall(item, wall, boundary, imgW, imgH, this.layout);
      if (!verts?.length) continue;

      drawTexturedTris(
        gl,
        prog,
        this.vbo,
        verts,
        verts.length / 4,
        texEntry.tex,
        viewMat,
        this.cssW,
        this.cssH,
        1,
      );
    }
  }

  /**
   * Clip following GL draws to the visible photo rectangle after pan/zoom.
   * @param {WebGL2RenderingContext} gl
   * @param {Float32Array} viewMat
   * @returns {boolean} true when a non-empty clip was applied
   */
  _beginPhotoClip(gl, viewMat) {
    const { offsetX, offsetY, imgW, imgH, scale } = this.layout;
    if (!imgW || !imgH || !scale) return false;

    const x0 = offsetX;
    const y0 = offsetY;
    const x1 = offsetX + imgW * scale;
    const y1 = offsetY + imgH * scale;
    const corners = [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ].map((p) => ({
      x: viewMat[0] * p.x + viewMat[3] * p.y + viewMat[6],
      y: viewMat[1] * p.x + viewMat[4] * p.y + viewMat[7],
    }));

    const minX = Math.max(0, Math.min(...corners.map((p) => p.x)));
    const maxX = Math.min(this.cssW, Math.max(...corners.map((p) => p.x)));
    const minY = Math.max(0, Math.min(...corners.map((p) => p.y)));
    const maxY = Math.min(this.cssH, Math.max(...corners.map((p) => p.y)));
    if (maxX <= minX || maxY <= minY) return false;

    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(
      Math.floor(minX * this.dpr),
      Math.floor((this.cssH - maxY) * this.dpr),
      Math.ceil((maxX - minX) * this.dpr),
      Math.ceil((maxY - minY) * this.dpr),
    );
    return true;
  }

  /**
   * @param {import('./state.js').Wall} wall
   * @param {Map<string, HTMLImageElement>} imageCache
   */
  _buildWallFbo(wall, imageCache) {
    const gl = this.gl;
    const prog = this.programs?.textured;
    const texCache = this.textureCache;
    if (!gl || !prog || !texCache || !this.vbo) return;

    const fbo = this._ensureWallFbo(wall.id);
    if (!fbo) return;

    const boundary = wall.wallBoundary;
    if (!boundary) return;

    const { imgW, imgH } = this.layout;
    if (!imgW || !imgH) return;

    const pw = fbo.width;
    const ph = fbo.height;
    const cssW = this.cssW;
    const cssH = this.cssH;

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fb);
    setViewport(gl, pw, ph);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    for (const item of wall.items) {
      const img = imageCache.get(item.src);
      if (!img) continue;
      const texEntry = texCache.ensure(item.src, img);
      if (!texEntry) continue;

      const verts = itemMeshVertsOnWall(item, wall, boundary, imgW, imgH, this.layout);
      if (!verts?.length) continue;

      drawTexturedTris(
        gl,
        prog,
        this.vbo,
        verts,
        verts.length / 4,
        texEntry.tex,
        IDENTITY_VIEW,
        cssW,
        cssH,
        1,
      );
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * @param {object} opts
   * @param {HTMLImageElement|null} opts.roomImage
   * @param {import('./state.js').Wall[]} opts.walls
   * @param {Map<string, HTMLImageElement>} opts.imageCache
   * @param {() => Float32Array|null} opts.getViewMatrix
   * @param {(ctx: CanvasRenderingContext2D) => void} opts.drawOverlay
   * @param {boolean} [opts.hideOverlay]
   */
  render(opts) {
    const { roomImage, walls, imageCache, getViewMatrix, drawOverlay, hideOverlay = false } = opts;
    const gl = this.gl;
    const overlay = this.overlayCanvas;

    this.ensureSize();
    this.computeLayout(roomImage);

    const octx = overlay?.getContext('2d');
    if (octx) {
      octx.save();
      octx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      octx.clearRect(0, 0, this.cssW, this.cssH);
      octx.restore();
    }

    if (!gl || !this.programs || this._lost) {
      if (octx) this._drawErrorOverlay(octx, 'WebGL2 недоступен');
      return;
    }

    const pw = gl.drawingBufferWidth;
    const ph = gl.drawingBufferHeight;
    setViewport(gl, pw, ph);
    clearColor(gl, pw, ph, 0.784, 0.784, 0.784, 1);

    if (!roomImage) {
      if (octx) this._drawMessageOverlay(octx, 'Загрузите фото комнаты');
      return;
    }

    const viewMat = getViewMatrix?.() ?? IDENTITY_VIEW;
    const prog = this.programs.textured;
    const texCache = this.textureCache;
    if (!texCache || !this.vbo) return;

    const photoSrc = roomImage.src || '__photo__';
    if (this.photoDirty || this.photoSrcKey !== photoSrc) {
      texCache.ensure(photoSrc, roomImage);
      this.photoSrcKey = photoSrc;
      this.photoDirty = false;
    }
    const photoTex = texCache.bySrc.get(photoSrc);
    if (photoTex) {
      const photoVerts = photoLayoutVerts(this.layout);
      drawTexturedTris(
        gl,
        prog,
        this.vbo,
        photoVerts,
        6,
        photoTex.tex,
        viewMat,
        this.cssW,
        this.cssH,
        1,
      );
    }

    const clipped = this._beginPhotoClip(gl, viewMat);
    if (clipped) {
      for (const wall of walls) {
        if (!wall.wallBoundary) continue;
        this._drawWallItems(gl, prog, texCache, wall, imageCache, viewMat);
        this.dirtyWalls.delete(wall.id);
      }
      gl.disable(gl.SCISSOR_TEST);
    }

    if (octx && drawOverlay && !hideOverlay) {
      octx.save();
      octx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      // normToScreen уже включает pan/zoom — как в старом 2D (drawOverlay вне applyView)
      drawOverlay(octx);
      octx.restore();
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} msg
   */
  _drawMessageOverlay(ctx, msg) {
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#6a6a78';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(msg, this.cssW / 2, this.cssH / 2);
    ctx.restore();
  }

  _drawErrorOverlay(ctx, msg) {
    this._drawMessageOverlay(ctx, msg);
  }

  /** @param {string} wallId */
  deleteWallFbo(wallId) {
    const fbo = this.wallFbos.get(wallId);
    if (fbo && this.gl) deleteFramebuffer(this.gl, fbo);
    this.wallFbos.delete(wallId);
    this.homographyCache.delete(wallId);
  }

  dispose() {
    if (!this.gl) return;
    for (const fbo of this.wallFbos.values()) {
      deleteFramebuffer(this.gl, fbo);
    }
    this.wallFbos.clear();
    this.textureCache?.clear();
    if (this.vbo) this.gl.deleteBuffer(this.vbo);
  }
}
