// Ridge Runner: the valley itself — a seeded heightmap, its coloured mesh,
// the lake, the runway strip, the hamlet, the pine forest and the clouds.
// Everything here is generated from CFG.seed, so every load builds the same
// valley; the screenshots are renders of this exact terrain.
import { CFG, RUNWAY_DIR } from './config.js';
import { makeNoise, mulberry32 } from './rng.js';

const SIZE = CFG.worldSize;
const N = CFG.terrainGrid; // samples per side
const HALF = SIZE / 2;

// Height in metres at world (x, z). The valley floor sits near y=0, the
// ridges rise around it, Mount Halden crowns the north, and Lake Mira fills
// the low bowl west of centre. The runway is flattened to the field.
export function makeHeightAt() {
  const fbm = makeNoise(CFG.seed);
  const peak = { x: -350, z: -1450, h: 640, r: 900 };
  const ridgeE = { x: 1250, z: -900, h: 420, r: 800 };
  const ridgeW = { x: -1350, z: -500, h: 380, r: 750 };
  const lake = { x: -650, z: -350, r: 560, depth: 42 };
  const river = { x: -900, z: -1000, w: 130 };

  function base(x, z) {
    // Rolling hills, stronger towards the edges of the map.
    const edge = Math.min(1, (Math.abs(x) + Math.abs(z)) / (SIZE * 0.55));
    let h = 34 + fbm(x / 420, z / 420) * 42 * (0.35 + edge);
    h += fbm(x / 130, z / 130) * 9;
    // Ridges and the peak.
    for (const m of [peak, ridgeE, ridgeW]) {
      const d = Math.hypot(x - m.x, z - m.z) / m.r;
      if (d < 1.4) h += m.h * Math.pow(Math.max(0, 1 - d), 1.6);
    }
    // The lake bowl, carved smooth.
    const dl = Math.hypot(x - lake.x, z - lake.z) / lake.r;
    if (dl < 1) h -= lake.depth * (1 - dl * dl);
    // A river gap running down from the peak to the lake.
    const dr = Math.abs(x - river.x - (z + 1000) * 0.12) / river.w;
    if (dr < 1) h -= 22 * (1 - dr);
    return h;
  }

  const rw = CFG.runway;
  // Flatten the field around the runway so landings are fair: the core of
  // the strip is dead flat at 26 m, blending back to the hills at the edge.
  function flatten(x, z, h) {
    const along = (x - rw.x) * RUNWAY_DIR.x + (z - rw.z) * RUNWAY_DIR.z;
    const across = Math.abs((x - rw.x) * -RUNWAY_DIR.z + (z - rw.z) * RUNWAY_DIR.x);
    if (Math.abs(along) < rw.length / 2 + 120 && across < rw.width / 2 + 130) {
      const t = Math.max(Math.abs(along) / (rw.length / 2 + 120), across / (rw.width / 2 + 130));
      const k = Math.max(0, Math.min(1, (t - 0.6) / 0.4));
      return 26 * (1 - k) + h * k;
    }
    return h;
  }

  return function heightAt(x, z) {
    const cx = Math.max(-HALF, Math.min(HALF, x));
    const cz = Math.max(-HALF, Math.min(HALF, z));
    return flatten(cx, cz, base(cx, cz));
  };
}

// Colour the terrain by height, slope and place: sand at the waterline,
// meadow green on the valley floor, dark pine green in the forest belt,
// grey rock on steep ground, snow above the treeline.
function terrainColour(h, slope, x, z, rand) {
  const water = CFG.waterLevel;
  if (h < water + 2.5) return [0.76, 0.70, 0.47]; // beach sand
  if (slope > 0.55) return [0.42, 0.40, 0.38]; // bare rock
  if (h > 300) return [0.93, 0.94, 0.97]; // snow
  if (h > 190) return [0.48, 0.50, 0.46]; // high rock / scree
  // Meadow with a forest belt that rings the valley between 40 and 130 m.
  const forest = h > 42 && h < 135 && rand() < 0.55;
  if (forest) return [0.13, 0.34, 0.15];
  const v = 0.92 + rand() * 0.16;
  return [0.40 * v, 0.64 * v, 0.28 * v];
}

// Build the terrain mesh: interleaved positions + rgb colours, indexed.
export function buildTerrain(heightAt) {
  const step = SIZE / (N - 1);
  const positions = new Float32Array(N * N * 3);
  const colours = new Float32Array(N * N * 3);
  const rand = mulberry32(CFG.seed + 7);
  const heights = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = -HALF + i * step, z = -HALF + j * step;
      heights[j * N + i] = heightAt(x, z);
    }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const x = -HALF + i * step, z = -HALF + j * step;
      const h = heights[k];
      const hx = heights[j * N + Math.min(N - 1, i + 1)] - heights[j * N + Math.max(0, i - 1)];
      const hz = heights[Math.min(N - 1, j + 1) * N + i] - heights[Math.max(0, j - 1) * N + i];
      const slope = Math.hypot(hx, hz) / (2 * step);
      const c = terrainColour(h, slope, x, z, rand);
      positions[k * 3] = x; positions[k * 3 + 1] = h; positions[k * 3 + 2] = z;
      colours[k * 3] = c[0]; colours[k * 3 + 1] = c[1]; colours[k * 3 + 2] = c[2];
    }
  }
  const indices = new Uint32Array((N - 1) * (N - 1) * 6);
  let o = 0;
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
      indices[o++] = a; indices[o++] = c; indices[o++] = b;
      indices[o++] = b; indices[o++] = c; indices[o++] = d;
    }
  }
  return { positions, colours, indices, count: indices.length };
}

// The runway: a flat strip mesh laid just above the flattened field, with
// white edge lines, a centreline and the number "09" painted at the south
// end. Built as thin triangles, not a texture.
export function buildRunway(heightAt) {
  const rw = CFG.runway;
  const y = 26.15; // a hand's breadth above the flattened field: no z-fight,
  // and the wheels (1.15 m below the plane's centre) rest on it exactly.
  const dx = RUNWAY_DIR.x, dz = RUNWAY_DIR.z; // along the strip
  const px = -dz, pz = dx; // across it
  const L = rw.length / 2, W = rw.width / 2;
  const pos = [], col = [], idx = [];
  function quad(cx, cz, hw, hl, r, g, b, lift) {
    const base = pos.length / 3;
    const yy = y + (lift || 0);
    const corners = [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]];
    for (const [u, v] of corners) {
      pos.push(cx + px * u + dx * v, yy, cz + pz * u + dz * v);
      col.push(r, g, b);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  quad(rw.x, rw.z, W, L, 0.38, 0.39, 0.37, 0); // asphalt, light enough to read against the grass
  // Centreline dashes.
  for (let s = -L + 40; s < L - 20; s += 50) {
    quad(rw.x + dx * s, rw.z + dz * s, 1.0, 7, 0.95, 0.95, 0.9, 0.05);
  }
  // Threshold bars at both ends.
  for (const s of [-L + 18, L - 18]) {
    quad(rw.x + dx * s, rw.z + dz * s, W - 6, 3, 0.95, 0.95, 0.9, 0.05);
  }
  return { positions: new Float32Array(pos), colours: new Float32Array(col), indices: new Uint16Array(idx), count: idx.length };
}

// The lake surface: one big translucent blue quad at the water level,
// clipped to the bowl by its shape (a disc of triangles around the centre).
// Drawn unlit in a bright sky blue so it reads as water, not a shadow.
export function buildWater() {
  const cx = -650, cz = -350, r = 560;
  const pos = [cx, CFG.waterLevel, cz], col = [0.30, 0.58, 0.80], idx = [];
  const segs = 40;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pos.push(cx + Math.cos(a) * r, CFG.waterLevel, cz + Math.sin(a) * r);
    col.push(0.30, 0.58, 0.80);
  }
  for (let i = 1; i <= segs; i++) idx.push(0, i, i + 1 > segs ? 1 : i + 1);
  return { positions: new Float32Array(pos), colours: new Float32Array(col), indices: new Uint16Array(idx), count: idx.length };
}

// Scatter the valley's landmarks: pines on the forest belt, the hamlet of
// Mira Falls east of the lake, a windsock and two hangars by the runway.
export function scatterLandmarks(heightAt) {
  const rand = mulberry32(CFG.seed + 99);
  const trees = [];
  let guard = 0;
  while (trees.length < 520 && guard++ < 6000) {
    const x = (rand() * 2 - 1) * HALF * 0.94;
    const z = (rand() * 2 - 1) * HALF * 0.94;
    const h = heightAt(x, z);
    if (h < 44 || h > 150) continue;
    // Keep the runway, the lake and the hamlet clear of trees.
    if (Math.abs(x + 260) < 190 && Math.abs(z - 620) < 480) continue;
    if (Math.hypot(x + 650, z + 350) < 580) continue;
    if (Math.hypot(x - 950, z + 480) < 260) continue;
    trees.push({ x, z, y: h, s: 0.8 + rand() * 0.9 });
  }
  // Mira Falls: twelve houses and a church around a little green.
  const houses = [];
  const hx0 = 950, hz0 = 480;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rand() * 0.4;
    const r = 55 + rand() * 110;
    const x = hx0 + Math.cos(a) * r, z = hz0 + Math.sin(a) * r * 0.8;
    houses.push({ x, z, y: heightAt(x, z), w: 9 + rand() * 6, d: 8 + rand() * 5, rot: rand() * Math.PI, wall: [0.85 + rand() * 0.1, 0.78, 0.62], roof: [0.55, 0.22, 0.16] });
  }
  houses.push({ x: hx0, z: hz0, y: heightAt(hx0, hz0), w: 12, d: 16, rot: 0.3, wall: [0.92, 0.9, 0.85], roof: [0.35, 0.3, 0.32], church: true });
  return { trees, houses };
}

// A handful of soft clouds drifting over the valley.
export function makeClouds() {
  const rand = mulberry32(CFG.seed + 31);
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    clouds.push({
      x: (rand() * 2 - 1) * 1800,
      z: (rand() * 2 - 1) * 1800,
      y: 420 + rand() * 160,
      s: 120 + rand() * 160,
      drift: 2 + rand() * 3,
    });
  }
  return clouds;
}
