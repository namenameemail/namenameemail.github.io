/**
 * WebGL2 shader compile/link.
 */

/**
 * @param {WebGL2RenderingContext} gl
 * @param {number} type
 * @param {string} source
 */
function compileShader(gl, type, source) {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('createShader failed');
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || 'unknown';
    gl.deleteShader(sh);
    throw new Error(log);
  }
  return sh;
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {string} vsSource
 * @param {string} fsSource
 */
export function createProgram(gl, vsSource, fsSource) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const prog = gl.createProgram();
  if (!prog) throw new Error('createProgram failed');
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) || 'unknown';
    gl.deleteProgram(prog);
    throw new Error(log);
  }
  return prog;
}

const VS_TEXTURED = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
uniform vec2 u_canvasSize;
uniform mat3 u_view;
out vec2 v_uv;
void main() {
  vec3 p = u_view * vec3(a_pos, 1.0);
  float x = (p.x / u_canvasSize.x) * 2.0 - 1.0;
  float y = 1.0 - (p.y / u_canvasSize.y) * 2.0;
  gl_Position = vec4(x, y, 0.0, 1.0);
  v_uv = a_uv;
}`;

const VS_PROJECTIVE_TEXTURED = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
uniform vec2 u_canvasSize;
uniform mat3 u_view;
uniform vec3 u_h0;
uniform vec3 u_h1;
uniform vec3 u_h2;
out vec2 v_uv;
void main() {
  vec3 src = vec3(a_pos, 1.0);
  vec3 q = vec3(dot(u_h0, src), dot(u_h1, src), dot(u_h2, src));
  vec3 p = u_view * vec3(q.xy / q.z, 1.0);
  float x = (p.x / u_canvasSize.x) * 2.0 - 1.0;
  float y = 1.0 - (p.y / u_canvasSize.y) * 2.0;
  gl_Position = vec4(x * q.z, y * q.z, 0.0, q.z);
  v_uv = a_uv;
}`;

const FS_TEXTURED = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_opacity;
out vec4 outColor;
void main() {
  vec4 c = texture(u_tex, v_uv);
  outColor = vec4(c.rgb, c.a * u_opacity);
}`;

const VS_SOLID = `#version 300 es
in vec2 a_pos;
uniform vec2 u_canvasSize;
uniform mat3 u_view;
uniform vec4 u_color;
out vec4 v_color;
void main() {
  vec3 p = u_view * vec3(a_pos, 1.0);
  float x = (p.x / u_canvasSize.x) * 2.0 - 1.0;
  float y = 1.0 - (p.y / u_canvasSize.y) * 2.0;
  gl_Position = vec4(x, y, 0.0, 1.0);
  v_color = u_color;
}`;

const FS_SOLID = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 outColor;
void main() {
  outColor = v_color;
}`;

/** Identity view for offscreen passes. */
export const IDENTITY_VIEW = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

/**
 * @param {WebGL2RenderingContext} gl
 */
export function createPreviewPrograms(gl) {
  const textured = createProgram(gl, VS_TEXTURED, FS_TEXTURED);
  const projectiveTextured = createProgram(gl, VS_PROJECTIVE_TEXTURED, FS_TEXTURED);
  const solid = createProgram(gl, VS_SOLID, FS_SOLID);

  return {
    textured: {
      program: textured,
      aPos: gl.getAttribLocation(textured, 'a_pos'),
      aUv: gl.getAttribLocation(textured, 'a_uv'),
      uCanvasSize: gl.getUniformLocation(textured, 'u_canvasSize'),
      uView: gl.getUniformLocation(textured, 'u_view'),
      uTex: gl.getUniformLocation(textured, 'u_tex'),
      uOpacity: gl.getUniformLocation(textured, 'u_opacity'),
    },
    projectiveTextured: {
      program: projectiveTextured,
      aPos: gl.getAttribLocation(projectiveTextured, 'a_pos'),
      aUv: gl.getAttribLocation(projectiveTextured, 'a_uv'),
      uCanvasSize: gl.getUniformLocation(projectiveTextured, 'u_canvasSize'),
      uView: gl.getUniformLocation(projectiveTextured, 'u_view'),
      uH0: gl.getUniformLocation(projectiveTextured, 'u_h0'),
      uH1: gl.getUniformLocation(projectiveTextured, 'u_h1'),
      uH2: gl.getUniformLocation(projectiveTextured, 'u_h2'),
      uTex: gl.getUniformLocation(projectiveTextured, 'u_tex'),
      uOpacity: gl.getUniformLocation(projectiveTextured, 'u_opacity'),
    },
    solid: {
      program: solid,
      aPos: gl.getAttribLocation(solid, 'a_pos'),
      uCanvasSize: gl.getUniformLocation(solid, 'u_canvasSize'),
      uView: gl.getUniformLocation(solid, 'u_view'),
      uColor: gl.getUniformLocation(solid, 'u_color'),
    },
  };
}
