/**
 * WebGL texture pool keyed by image src.
 */

/**
 * @param {WebGL2RenderingContext} gl
 * @param {HTMLImageElement} img
 * @param {number} maxSize
 */
function uploadImage(gl, img, maxSize) {
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (!w || !h) return null;

  if (w > maxSize || h > maxSize) {
    const s = Math.min(maxSize / w, maxSize / h);
    w = Math.max(1, Math.round(w * s));
    h = Math.max(1, Math.round(h * s));
  }

  const tex = gl.createTexture();
  if (!tex) return null;

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  if (w === img.naturalWidth && h === img.naturalHeight) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  } else {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  }

  gl.bindTexture(gl.TEXTURE_2D, null);
  return { tex, width: w, height: h };
}

export class GlTextureCache {
  /**
   * @param {WebGL2RenderingContext} gl
   */
  constructor(gl) {
    this.gl = gl;
    this.maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    /** @type {Map<string, { tex: WebGLTexture, width: number, height: number }>} */
    this.bySrc = new Map();
  }

  /**
   * @param {string} src
   * @param {HTMLImageElement} img
   */
  ensure(src, img) {
    if (!src || !img?.complete) return null;
    let entry = this.bySrc.get(src);
    if (entry) return entry;

    const uploaded = uploadImage(this.gl, img, this.maxSize);
    if (!uploaded) return null;

    entry = uploaded;
    this.bySrc.set(src, entry);
    return entry;
  }

  /**
   * @param {string} src
   */
  delete(src) {
    const entry = this.bySrc.get(src);
    if (!entry) return;
    this.gl.deleteTexture(entry.tex);
    this.bySrc.delete(src);
  }

  clear() {
    for (const entry of this.bySrc.values()) {
      this.gl.deleteTexture(entry.tex);
    }
    this.bySrc.clear();
  }
}
