// Ridge Runner: the WebGL renderer. One shader program, vertex colours,
// a lambert sun and distance fog; raw WebGL, no library. The sky is a big
// gradient dome, the clouds are soft billboards, everything else is a mesh
// built by terrain.js / plane.js and merged here.
import { CFG } from './config.js';
import { buildPlane, buildRing } from './plane.js';

// ---- tiny mat4 helpers (column-major, like WebGL expects) ----
export function mat4Identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
export function mat4Mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
export function mat4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
  const o = new Float32Array(16);
  o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1;
  o[14] = 2 * far * near * nf;
  return o;
}
export function mat4LookAt(eye, centre, up) {
  let zx = eye[0] - centre[0], zy = eye[1] - centre[1], zz = eye[2] - centre[2];
  let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1,
  ]);
}
export function mat4Translate(x, y, z) {
  const o = mat4Identity(); o[12] = x; o[13] = y; o[14] = z; return o;
}
export function mat4RotateY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}
export function mat4RotateX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}
export function mat4RotateZ(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
export function mat4Scale(x, y, z) {
  const o = mat4Identity(); o[0] = x; o[5] = y; o[10] = z; return o;
}

// The plane's attitude: heading 0 faces -Z (north) and grows clockwise, so
// 90 is east and 270 is west, as on a compass. Pitch up positive, roll
// right (right wing down) positive. Forward, up and right vectors from the
// three angles.
export function planeBasis(headingDeg, pitchDeg, rollDeg) {
  const h = headingDeg * Math.PI / 180, p = pitchDeg * Math.PI / 180, r = rollDeg * Math.PI / 180;
  const ch = Math.cos(h), sh = Math.sin(h), cp = Math.cos(p), sp = Math.sin(p);
  const cr = Math.cos(r), sr = Math.sin(r);
  // Forward: (sin h * cos p, sin p, -cos h * cos p).
  const fwd = [sh * cp, sp, -ch * cp];
  // Right, before roll: (cos h, 0, sin h); then roll it around forward.
  const right0 = [ch, 0, sh];
  const up0 = [-sh * sp, cp, ch * sp];
  const right = [
    right0[0] * cr + up0[0] * sr,
    right0[1] * cr + up0[1] * sr,
    right0[2] * cr + up0[2] * sr,
  ];
  const up = [
    up0[0] * cr - right0[0] * sr,
    up0[1] * cr - right0[1] * sr,
    up0[2] * cr - right0[2] * sr,
  ];
  return { fwd, right, up };
}
export function planeMatrix(pose) {
  const { fwd, right, up } = planeBasis(pose.heading, pose.pitch, pose.roll);
  const m = new Float32Array(16);
  m[0] = right[0]; m[1] = right[1]; m[2] = right[2]; m[3] = 0;
  m[4] = up[0]; m[5] = up[1]; m[6] = up[2]; m[7] = 0;
  m[8] = -fwd[0]; m[9] = -fwd[1]; m[10] = -fwd[2]; m[11] = 0;
  m[12] = pose.x; m[13] = pose.y; m[14] = pose.z; m[15] = 1;
  return m;
}

const VERT = `
attribute vec3 aPos; attribute vec3 aCol; attribute vec3 aNorm;
uniform mat4 uProj; uniform mat4 uView; uniform mat4 uModel;
uniform vec3 uSun; uniform float uUnlit; uniform float uAlpha;
varying vec3 vCol; varying float vFog; varying vec3 vNorm;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vec4 view = uView * world;
  gl_Position = uProj * view;
  vFog = -view.z;
  vNorm = normalize(mat3(uModel) * aNorm);
  vCol = aCol;
}`;
const FRAG = `
precision mediump float;
uniform vec3 uSun; uniform float uUnlit; uniform float uAlpha;
uniform vec3 uFogCol; uniform float uFogNear; uniform float uFogFar;
varying vec3 vCol; varying float vFog; varying vec3 vNorm;
void main() {
  float lit = uUnlit > 0.5 ? 1.0 : (0.45 + 0.55 * max(0.0, dot(normalize(vNorm), normalize(uSun))));
  vec3 col = vCol * lit;
  float f = clamp((vFog - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  col = mix(col, uFogCol, f * f);
  gl_FragColor = vec4(col, uAlpha);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('shader: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

function uploadMesh(gl, mesh) {
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  // Real per-vertex normals: average the face normals of every triangle
  // that touches the vertex. Shared vertices (terrain) get smooth shading;
  // duplicated vertices (the plane's flat panels) keep their flat look.
  const nVerts = mesh.positions.length / 3;
  const normals = new Float32Array(nVerts * 3);
  const p = mesh.positions, idx = mesh.indices;
  for (let t = 0; t < mesh.count; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ab = [p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]];
    const ac = [p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]];
    const n = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    for (const v of [a, b, c]) { normals[v * 3] += n[0]; normals[v * 3 + 1] += n[1]; normals[v * 3 + 2] += n[2]; }
  }
  for (let v = 0; v < nVerts; v++) {
    const l = Math.hypot(normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]) || 1;
    normals[v * 3] /= l; normals[v * 3 + 1] /= l; normals[v * 3 + 2] /= l;
  }
  const interleaved = new Float32Array(nVerts * 9);
  for (let i = 0; i < nVerts; i++) {
    interleaved[i * 9] = mesh.positions[i * 3];
    interleaved[i * 9 + 1] = mesh.positions[i * 3 + 1];
    interleaved[i * 9 + 2] = mesh.positions[i * 3 + 2];
    interleaved[i * 9 + 3] = mesh.colours[i * 3];
    interleaved[i * 9 + 4] = mesh.colours[i * 3 + 1];
    interleaved[i * 9 + 5] = mesh.colours[i * 3 + 2];
    interleaved[i * 9 + 6] = normals[i * 3];
    interleaved[i * 9 + 7] = normals[i * 3 + 1];
    interleaved[i * 9 + 8] = normals[i * 3 + 2];
  }
  gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  // WebGL 1 only draws UNSIGNED_INT indices with the OES_element_index_uint
  // extension, so use 32-bit indices only when a mesh has more vertices
  // than 16-bit indices can name — the index COUNT is irrelevant.
  const idxArr = nVerts > 65535
    ? new Uint32Array(mesh.indices) : new Uint16Array(mesh.indices);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idxArr, gl.STATIC_DRAW);
  return { vb, ib, count: mesh.count, u32: idxArr instanceof Uint32Array };
}

// Merge the scattered pines into one mesh: a trunk box and two stacked
// cones per tree, all in one draw call.
function buildTreeMesh(trees) {
  const pos = [], col = [], idx = [];
  let v = 0;
  function cone(cx, cy, cz, r, h, colour) {
    const segs = 6;
    const apex = v;
    pos.push(cx, cy + h, cz); col.push(...colour); v++;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pos.push(cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r);
      col.push(colour[0] * 0.9, colour[1] * 0.9, colour[2] * 0.9); v++;
    }
    for (let i = 1; i <= segs; i++) idx.push(apex, apex + i, apex + i + 1);
    const base = apex + 1;
    for (let i = 1; i < segs; i++) idx.push(base, base + i + 1, base + i);
  }
  for (const t of trees) {
    const s = t.s;
    // Trunk.
    const tw = 0.5 * s, th = 2.2 * s;
    const c = [0.32, 0.22, 0.14];
    const corners = [
      [t.x - tw, t.y, t.z - tw], [t.x + tw, t.y, t.z - tw],
      [t.x + tw, t.y, t.z + tw], [t.x - tw, t.y, t.z + tw],
      [t.x - tw, t.y + th, t.z - tw], [t.x + tw, t.y + th, t.z - tw],
      [t.x + tw, t.y + th, t.z + tw], [t.x - tw, t.y + th, t.z + tw],
    ];
    const b = v;
    for (const p of corners) { pos.push(...p); col.push(...c); v++; }
    const faces = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 4, 5, 1], [2, 6, 7, 3], [0, 3, 7, 4], [1, 5, 6, 2]];
    for (const [a, b1, c1, d] of faces) idx.push(b + a, b + b1, b + c1, b + a, b + c1, b + d);
    cone(t.x, t.y + th, t.z, 2.6 * s, 5.5 * s, [0.08, 0.30, 0.12]);
    cone(t.x, t.y + th + 3.2 * s, t.z, 1.8 * s, 4.2 * s, [0.10, 0.34, 0.14]);
  }
  return { positions: new Float32Array(pos), colours: new Float32Array(col), indices: new Uint32Array(idx), count: idx.length };
}

// Merge the hamlet: each house is a box with a pitched roof; the church
// gets a tower and a spire.
function buildHouseMesh(houses) {
  const pos = [], col = [], idx = [];
  let v = 0;
  function box(cx, cy, cz, w, h, d, rot, colour) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const pts = [];
    for (const [lx, ly, lz] of [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]]) {
      pts.push([cx + (lx * w / 2) * c - (lz * d / 2) * s, cy + ly * h, cz + (lx * w / 2) * s + (lz * d / 2) * c]);
    }
    const b = v;
    for (const p of pts) { pos.push(...p); col.push(...colour); v++; }
    const faces = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 4, 5, 1], [2, 6, 7, 3], [0, 3, 7, 4], [1, 5, 6, 2]];
    for (const [a, b1, c1, d] of faces) idx.push(b + a, b + b1, b + c1, b + a, b + c1, b + d);
    return pts;
  }
  function roof(pts, colour) {
    // pts[4..7] are the top corners; ridge runs along the local z axis.
    const [a, b, c, d] = [pts[4], pts[5], pts[6], pts[7]];
    const midY = a[1] + 2.6;
    const ridgeA = [(a[0] + b[0]) / 2, midY, (a[2] + b[2]) / 2];
    const ridgeB = [(d[0] + c[0]) / 2, midY, (d[2] + c[2]) / 2];
    const base = v;
    for (const p of [a, b, ridgeB, ridgeA, d, c]) { pos.push(...p); col.push(...colour); v++; }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    idx.push(base + 4, base + 3, base + 2, base + 4, base + 2, base + 5);
    idx.push(base, base + 3, base + 4);
    idx.push(base + 1, base + 5, base + 2);
  }
  for (const hs of houses) {
    const pts = box(hs.x, hs.y, hs.z, hs.w, 4.5, hs.d, hs.rot, hs.wall);
    roof(pts, hs.roof);
    if (hs.church) {
      const t = box(hs.x + hs.w * 0.7, hs.y, hs.z, 4, 11, 4, hs.rot, hs.wall);
      const [a, b, c, d] = [t[4], t[5], t[6], t[7]];
      const apex = [(a[0] + b[0] + c[0] + d[0]) / 4, a[1] + 5, (a[2] + b[2] + c[2] + d[2]) / 4];
      const base = v;
      for (const p of [a, b, c, d, apex]) { pos.push(...p); col.push(0.35, 0.3, 0.32); v++; }
      idx.push(base, base + 1, base + 4, base + 1, base + 2, base + 4, base + 2, base + 3, base + 4, base + 3, base, base + 4);
    }
  }
  return { positions: new Float32Array(pos), colours: new Float32Array(col), indices: new Uint16Array(idx), count: idx.length };
}

// The sky dome: a big sphere around the camera, vertex-coloured from a
// pale horizon to a deep zenith, drawn unlit and without fog.
function buildSkyDome() {
  const pos = [], col = [], idx = [];
  const R = 9000, rings = 8, segs = 24;
  for (let j = 0; j <= rings; j++) {
    const phi = (j / rings) * Math.PI * 0.5; // 0 = horizon, PI/2 = zenith
    const y = Math.sin(phi) * R;
    const r = Math.cos(phi) * R;
    const t = j / rings;
    const c = [0.62 + 0.38 * (1 - t) * 0.4, 0.78 + 0.22 * (1 - t) * 0.35, 0.95 - 0.12 * t];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      col.push(c[0], c[1], c[2]);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i, b = a + segs + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions: new Float32Array(pos), colours: new Float32Array(col), indices: new Uint16Array(idx), count: idx.length };
}

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL is not available in this browser');
    this.gl = gl;
    // 32-bit indices need this extension on WebGL 1; the terrain is the
    // only mesh that could ever need it, and it fits in 16 bits anyway.
    gl.getExtension('OES_element_index_uint');
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('program: ' + gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    this.prog = prog;
    this.loc = {
      aPos: gl.getAttribLocation(prog, 'aPos'),
      aCol: gl.getAttribLocation(prog, 'aCol'),
      aNorm: gl.getAttribLocation(prog, 'aNorm'),
      uProj: gl.getUniformLocation(prog, 'uProj'),
      uView: gl.getUniformLocation(prog, 'uView'),
      uModel: gl.getUniformLocation(prog, 'uModel'),
      uSun: gl.getUniformLocation(prog, 'uSun'),
      uUnlit: gl.getUniformLocation(prog, 'uUnlit'),
      uAlpha: gl.getUniformLocation(prog, 'uAlpha'),
      uFogCol: gl.getUniformLocation(prog, 'uFogCol'),
      uFogNear: gl.getUniformLocation(prog, 'uFogNear'),
      uFogFar: gl.getUniformLocation(prog, 'uFogFar'),
    };
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.62, 0.78, 0.95, 1);

    this.terrain = uploadMesh(gl, world.terrain);
    this.runway = uploadMesh(gl, world.runway);
    this.water = uploadMesh(gl, world.water);
    this.trees = uploadMesh(gl, buildTreeMesh(world.landmarks.trees));
    this.houses = uploadMesh(gl, buildHouseMesh(world.landmarks.houses));
    this.sky = uploadMesh(gl, buildSkyDome());
    const plane = buildPlane();
    this.planeBody = uploadMesh(gl, plane.body);
    this.planeProp = uploadMesh(gl, plane.prop);
    this.ringMeshes = CFG.rings.map(r => uploadMesh(gl, buildRing(r.r)));
    this.ringMeshesGreen = CFG.rings.map(r => uploadMesh(gl, buildRing(r.r, 1.7, 28, 8, [0.25, 0.85, 0.35])));
    this.cloudMesh = this.makeCloudMesh(world.clouds);
    this.sun = [0.5, 0.75, 0.45];
    this.fogCol = [0.72, 0.82, 0.93];
  }

  makeCloudMesh(clouds) {
    // Each cloud is a row of overlapping soft discs (triangle fans), built
    // twice at right angles so one face is always towards the camera. No
    // hard rectangles: the silhouette stays puffy from every direction.
    const pos = [], col = [], idx = [];
    let v = 0;
    function disc(cx, cy, cz, r, colour, facingZ) {
      const segs = 10;
      const centre = v;
      pos.push(cx, cy, cz); col.push(...colour); v++;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        // Facing +Z the disc lies in the XY plane; facing +X it lies in ZY.
        if (facingZ) pos.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz);
        else pos.push(cx, cy + Math.sin(a) * r, cz + Math.cos(a) * r);
        col.push(...colour); v++;
      }
      for (let i = 1; i <= segs; i++) idx.push(centre, centre + i, centre + i + 1);
    }
    for (const c of clouds) {
      const puffs = [
        [-0.42, 0, 0.62], [-0.18, 0.12, 0.9], [0.1, 0.05, 1.0],
        [0.38, -0.05, 0.7], [0.55, -0.12, 0.45],
      ];
      for (const facingZ of [true, false]) {
        for (const [lx, ly, lr] of puffs) {
          const r = c.s * lr * 0.5;
          const x = facingZ ? c.x + lx * c.s : c.x;
          const z = facingZ ? c.z : c.z + lx * c.s;
          disc(x, c.y + ly * c.s * 0.3, z, r, [1, 1, 1], facingZ);
        }
      }
    }
    return uploadMesh(this.gl, { positions: new Float32Array(pos), colours: new Float32Array(col), indices: new Uint16Array(idx), count: idx.length });
  }

  drawMesh(mesh, model, opts = {}) {
    const gl = this.gl;
    gl.uniformMatrix4fv(this.loc.uModel, false, model);
    gl.uniform1f(this.loc.uUnlit, opts.unlit ? 1 : 0);
    gl.uniform1f(this.loc.uAlpha, opts.alpha ?? 1);
    // The sky dome sits 9 km out, past the fog's far plane: without this it
    // would fog to a flat sheet instead of a gradient.
    if (opts.noFog) {
      gl.uniform1f(this.loc.uFogNear, 1e9);
      gl.uniform1f(this.loc.uFogFar, 2e9);
    }
    if (opts.polygonOffset) {
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-2, -2);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb);
    gl.vertexAttribPointer(this.loc.aPos, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(this.loc.aPos);
    gl.vertexAttribPointer(this.loc.aCol, 3, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(this.loc.aCol);
    gl.vertexAttribPointer(this.loc.aNorm, 3, gl.FLOAT, false, 36, 24);
    gl.enableVertexAttribArray(this.loc.aNorm);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.u32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    if (opts.polygonOffset) gl.disable(gl.POLYGON_OFFSET_FILL);
    if (opts.noFog) {
      gl.uniform1f(this.loc.uFogNear, 500);
      gl.uniform1f(this.loc.uFogFar, 5200);
    }
  }

  // state: { pose, ringsHit, time, view, propAngle, clouds, nextRing }
  render(state, camera) {
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const proj = mat4Perspective(62 * Math.PI / 180, w / h, 0.5, 20000);
    const view = mat4LookAt(camera.eye, camera.target, [0, 1, 0]);
    gl.uniformMatrix4fv(this.loc.uProj, false, proj);
    gl.uniformMatrix4fv(this.loc.uView, false, view);
    gl.uniform3fv(this.loc.uSun, this.sun);
    gl.uniform3fv(this.loc.uFogCol, this.fogCol);
    gl.uniform1f(this.loc.uFogNear, 500);
    gl.uniform1f(this.loc.uFogFar, 5200);

    const I = mat4Identity();
    // Sky dome follows the camera so it never clips.
    this.drawMesh(this.sky, mat4Translate(camera.eye[0], camera.eye[1] - 40, camera.eye[2]), { unlit: true, noFog: true });
    this.drawMesh(this.terrain, I);
    this.drawMesh(this.runway, I, { polygonOffset: true });
    this.drawMesh(this.water, I, { alpha: 0.85, unlit: true });
    this.drawMesh(this.trees, I);
    this.drawMesh(this.houses, I);
    // Clouds drift slowly with the wind.
    this.drawMesh(this.cloudMesh, mat4Translate(state.cloudDrift, 0, 0), { alpha: 0.85, unlit: true });

    // Rings: the next one pulses amber and unlit, the rest are dimmer, and
    // rings already flown turn green.
    const t = state.time;
    CFG.rings.forEach((ring, i) => {
      const hit = i < state.ringsHit;
      const next = i === state.ringsHit;
      const pulse = next ? 1 + 0.18 * Math.sin(t * 5) : 1;
      const m = mat4Mul(
        mat4Translate(ring.x, ring.y, ring.z),
        mat4Mul(mat4RotateY(state.ringYaw[i]), mat4Scale(pulse, pulse, pulse)),
      );
      this.drawMesh(hit ? this.ringMeshesGreen[i] : this.ringMeshes[i], m, { unlit: next || hit });
    });

    // The Skyfox itself (hidden in cockpit view).
    if (state.view !== 'cockpit') {
      const pm = planeMatrix(state.pose);
      this.drawMesh(this.planeBody, pm);
      const propM = mat4Mul(pm, mat4Mul(mat4Translate(0, 0.05, -3.3), mat4RotateZ(state.propAngle)));
      this.drawMesh(this.planeProp, propM, { unlit: true });
    }
  }
}
