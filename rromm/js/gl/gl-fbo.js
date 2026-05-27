/**
 * WebGL2 framebuffer objects.
 */

/**
 * @param {WebGL2RenderingContext} gl
 * @param {number} w
 * @param {number} h
 */
export function createFramebuffer(gl, w, h) {
  const tex = gl.createTexture();
  const fb = gl.createFramebuffer();
  if (!tex || !fb) return null;

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return { fb, tex, width: w, height: h };
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {{ fb: WebGLFramebuffer, tex: WebGLTexture, width: number, height: number }} fbo
 * @param {number} w
 * @param {number} h
 */
export function resizeFramebuffer(gl, fbo, w, h) {
  if (fbo.width === w && fbo.height === h) return;
  fbo.width = w;
  fbo.height = h;
  gl.bindTexture(gl.TEXTURE_2D, fbo.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {{ fb: WebGLFramebuffer, tex: WebGLTexture }} fbo
 */
export function deleteFramebuffer(gl, fbo) {
  gl.deleteFramebuffer(fbo.fb);
  gl.deleteTexture(fbo.tex);
}
