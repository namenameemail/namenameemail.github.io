/**
 * Low-level textured draws for preview.
 */

import { IDENTITY_VIEW } from './gl-shaders.js';

/**
 * @param {WebGL2RenderingContext} gl
 * @param {ReturnType<import('./gl-shaders.js').createPreviewPrograms>['textured']} prog
 * @param {WebGLBuffer} vbo
 * @param {Float32Array} verts interleaved pos+uv, 4 floats per vertex
 * @param {number} vertCount
 * @param {WebGLTexture} tex
 * @param {Float32Array} viewMat
 * @param {number} cssW
 * @param {number} cssH
 * @param {number} [opacity]
 */
export function drawTexturedTris(
  gl,
  prog,
  vbo,
  verts,
  vertCount,
  tex,
  viewMat,
  cssW,
  cssH,
  opacity = 1,
) {
  gl.useProgram(prog.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);

  const stride = 4 * 4;
  gl.enableVertexAttribArray(prog.aPos);
  gl.vertexAttribPointer(prog.aPos, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(prog.aUv);
  gl.vertexAttribPointer(prog.aUv, 2, gl.FLOAT, false, stride, 8);

  gl.uniform2f(prog.uCanvasSize, cssW, cssH);
  gl.uniformMatrix3fv(prog.uView, false, viewMat);
  gl.uniform1i(prog.uTex, 0);
  gl.uniform1f(prog.uOpacity, opacity);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.drawArrays(gl.TRIANGLES, 0, vertCount);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

/**
 * Draw textured wall-meter triangles through a homography in the vertex shader.
 * This keeps GL rendering on the exact same projected wall plane as the handles.
 * @param {WebGL2RenderingContext} gl
 * @param {ReturnType<import('./gl-shaders.js').createPreviewPrograms>['projectiveTextured']} prog
 * @param {WebGLBuffer} vbo
 * @param {Float32Array} verts interleaved wall pos+uv, 4 floats per vertex
 * @param {number} vertCount
 * @param {WebGLTexture} tex
 * @param {number[]} H row-major homography wall meters -> preview base CSS px
 * @param {Float32Array} viewMat
 * @param {number} cssW
 * @param {number} cssH
 * @param {number} [opacity]
 */
export function drawProjectiveTexturedTris(
  gl,
  prog,
  vbo,
  verts,
  vertCount,
  tex,
  H,
  viewMat,
  cssW,
  cssH,
  opacity = 1,
) {
  gl.useProgram(prog.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);

  const stride = 4 * 4;
  gl.enableVertexAttribArray(prog.aPos);
  gl.vertexAttribPointer(prog.aPos, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(prog.aUv);
  gl.vertexAttribPointer(prog.aUv, 2, gl.FLOAT, false, stride, 8);

  gl.uniform2f(prog.uCanvasSize, cssW, cssH);
  gl.uniformMatrix3fv(prog.uView, false, viewMat);
  gl.uniform3f(prog.uH0, H[0], H[1], H[2]);
  gl.uniform3f(prog.uH1, H[3], H[4], H[5]);
  gl.uniform3f(prog.uH2, H[6], H[7], H[8]);
  gl.uniform1i(prog.uTex, 0);
  gl.uniform1f(prog.uOpacity, opacity);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.drawArrays(gl.TRIANGLES, 0, vertCount);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {ReturnType<import('./gl-shaders.js').createPreviewPrograms>['solid']} prog
 * @param {WebGLBuffer} vbo
 * @param {Float32Array} pos2 - pairs x,y per vertex
 * @param {number} vertCount
 * @param {Float32Array} viewMat
 * @param {number} cssW
 * @param {number} cssH
 * @param {number[]} rgba
 */
export function drawSolidTris(
  gl,
  prog,
  vbo,
  pos2,
  vertCount,
  viewMat,
  cssW,
  cssH,
  rgba,
) {
  gl.useProgram(prog.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, pos2, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(prog.aPos);
  gl.vertexAttribPointer(prog.aPos, 2, gl.FLOAT, false, 0, 0);
  gl.uniform2f(prog.uCanvasSize, cssW, cssH);
  gl.uniformMatrix3fv(prog.uView, false, viewMat);
  gl.uniform4fv(prog.uColor, rgba);
  gl.drawArrays(gl.TRIANGLES, 0, vertCount);
}

/**
 * Clear with color (identity view).
 */
export function clearColor(gl, w, h, r, g, b, a) {
  gl.viewport(0, 0, Math.round(w), Math.round(h));
  gl.clearColor(r, g, b, a);
  gl.clear(gl.COLOR_BUFFER_BIT);
}
