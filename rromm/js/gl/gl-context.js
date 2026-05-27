/**
 * WebGL2 context helpers.
 */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ onLost?: () => void, onRestored?: () => void }} [opts]
 * @returns {WebGL2RenderingContext | null}
 */
export function createWebGL2(canvas, opts = {}) {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  });

  if (!gl) return null;

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    opts.onLost?.();
  });

  canvas.addEventListener('webglcontextrestored', () => {
    opts.onRestored?.();
  });

  return gl;
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {number} w
 * @param {number} h
 */
export function setViewport(gl, w, h) {
  gl.viewport(0, 0, w, h);
}
