// Ridge Runner: the Skyfox — a little single-prop bush plane, built from
// triangles in code. Forward is -Z in the plane's own space, up is +Y.
// Teal fuselage, cream wings, a red stripe, a spinning propeller.
export function buildPlane() {
  const pos = [], col = [], idx = [];
  let v = 0;
  function tri(a, b, c, colour) {
    for (const p of [a, b, c]) { pos.push(p[0], p[1], p[2]); col.push(...colour); }
    idx.push(v, v + 1, v + 2); v += 3;
  }
  function quad(a, b, c, d, colour) { tri(a, b, c, colour); tri(a, c, d, colour); }

  const teal = [0.05, 0.45, 0.52];
  const tealDark = [0.03, 0.33, 0.40];
  const cream = [0.94, 0.90, 0.78];
  const red = [0.78, 0.16, 0.12];
  const dark = [0.12, 0.12, 0.14];
  const glass = [0.45, 0.75, 0.85];
  const propGrey = [0.25, 0.25, 0.28];

  // Fuselage: a tapered box from the tail (z=+3.4) to the nose (z=-3.2),
  // slightly deeper at the cabin so the canopy sits proud of it.
  const F = {
    nose: [-0.0, 0.05, -3.2], tail: [0, 0.15, 3.4],
  };
  // Cross-sections: [halfWidth, yBottom, yTop] at stations along z.
  const stations = [
    { z: -3.2, w: 0.12, yb: -0.15, yt: 0.28 },
    { z: -2.2, w: 0.55, yb: -0.45, yt: 0.55 },
    { z: -0.6, w: 0.62, yb: -0.5, yt: 0.62 },
    { z: 0.9, w: 0.55, yb: -0.45, yt: 0.6 },
    { z: 2.2, w: 0.32, yb: -0.3, yt: 0.45 },
    { z: 3.4, w: 0.06, yb: 0.0, yt: 0.3 },
  ];
  for (let s = 0; s < stations.length - 1; s++) {
    const A = stations[s], B = stations[s + 1];
    const aTopL = [-A.w, A.yt, A.z], aTopR = [A.w, A.yt, A.z];
    const aBotL = [-A.w, A.yb, A.z], aBotR = [A.w, A.yb, A.z];
    const bTopL = [-B.w, B.yt, B.z], bTopR = [B.w, B.yt, B.z];
    const bBotL = [-B.w, B.yb, B.z], bBotR = [B.w, B.yb, B.z];
    quad(aTopL, bTopL, bTopR, aTopR, teal); // top
    quad(aBotR, bBotR, bBotL, aBotL, tealDark); // belly
    quad(aTopL, aBotL, bBotL, bTopL, teal); // left side
    quad(aTopR, bTopR, bBotR, aBotR, teal); // right side
  }
  // Nose cap and tail cap.
  tri([-0.12, -0.15, -3.2], [0.12, -0.15, -3.2], [0, 0.28, -3.2], dark);
  tri([-0.06, 0.0, 3.4], [0.06, 0.0, 3.4], [0, 0.3, 3.4], tealDark);
  // Red cheatline along both flanks.
  for (const side of [-1, 1]) {
    quad([side * 0.63, 0.05, -2.0], [side * 0.63, 0.05, 0.8], [side * 0.56, 0.12, 0.8], [side * 0.56, 0.12, -2.0], red);
  }
  // Canopy: a low glass wedge over the cabin.
  quad([-0.42, 0.62, -1.2], [0.42, 0.62, -1.2], [0.38, 0.78, -0.1], [-0.38, 0.78, -0.1], glass);
  quad([-0.42, 0.62, -1.2], [-0.38, 0.78, -0.1], [-0.3, 0.78, 0.55], [-0.34, 0.62, 0.55], glass);
  quad([0.42, 0.62, -1.2], [0.34, 0.62, 0.55], [0.3, 0.78, 0.55], [0.38, 0.78, -0.1], glass);
  tri([-0.38, 0.78, -0.1], [0.38, 0.78, -0.1], [0, 0.86, 0.55], glass);

  // Main wing: straight, slightly tapered, cream on top, teal below.
  function wing(y, z, span, chord, colourTop, colourBot) {
    const tip = span / 2, root = 0.6;
    const le = z - chord / 2, te = z + chord / 2;
    quad([-root, y, le], [root, y, le], [tip, y, te - 0.35], [-tip, y, te - 0.35], colourTop);
    quad([-tip, y - 0.09, te - 0.35], [tip, y - 0.09, te - 0.35], [root, y - 0.09, te], [-root, y - 0.09, te], colourBot);
    // Red wingtips.
    quad([-tip, y, le + 0.7], [-tip + 0.55, y, le + 0.55], [-tip + 0.55, y, te - 0.5], [-tip, y, te - 0.35], red);
    quad([tip - 0.55, y, le + 0.55], [tip, y, le + 0.7], [tip, y, te - 0.35], [tip - 0.55, y, te - 0.5], red);
  }
  wing(0.12, -0.4, 9.4, 1.7, cream, tealDark);

  // Tailplane and fin.
  wing(0.32, 2.9, 3.4, 0.9, cream, tealDark);
  quad([-0.05, 0.3, 2.2], [0.05, 0.3, 2.2], [0.05, 1.35, 3.15], [-0.05, 1.35, 3.15], red);
  quad([-0.05, 0.3, 2.2], [-0.05, 1.35, 3.15], [0.05, 1.35, 3.15], [0.05, 0.3, 2.2], red);

  // Fixed landing gear: two legs, two wheels, a tail wheel.
  for (const side of [-1, 1]) {
    quad([side * 0.45, -0.5, -1.1], [side * 0.55, -0.5, -1.1], [side * 0.55, -1.05, -1.1], [side * 0.45, -1.05, -1.1], dark);
    tri([side * 0.5 - 0.09, -1.15, -1.1], [side * 0.5 + 0.09, -1.15, -1.1], [side * 0.5, -0.85, -1.1], dark);
  }
  tri([0, -0.35, 3.1], [0.08, -0.35, 3.1], [0, -0.55, 3.1], dark);

  // The propeller is drawn separately (it spins), so buildPlane returns its
  // blade geometry too: two blades around the hub at the nose.
  const prop = { pos: [], col: [], idx: [] };
  let pv = 0;
  function ptri(a, b, c, colour) {
    for (const p of [a, b, c]) { prop.pos.push(p[0], p[1], p[2]); prop.col.push(...colour); }
    prop.idx.push(pv, pv + 1, pv + 2); pv += 3;
  }
  for (const s of [-1, 1]) {
    const y0 = 0.15, y1 = 1.45;
    ptri([0, y0, -3.32], [0.09, y0 + 0.1, -3.32], [0.09, y1, -3.32], propGrey);
    ptri([0, y0, -3.32], [0.09, y1, -3.32], [-0.09, y1, -3.32], propGrey);
    ptri([0, y0, -3.32], [-0.09, y1, -3.32], [-0.09, y0 + 0.1, -3.32], propGrey);
    void s;
  }
  // Hub cap.
  ptri([-0.14, 0.05, -3.36], [0.14, 0.05, -3.36], [0, 0.35, -3.36], dark);
  ptri([-0.14, 0.05, -3.36], [0, 0.35, -3.36], [0, 0.05, -3.36], dark);

  return {
    body: { positions: new Float32Array(pos), colours: new Float32Array(col), indices: new Uint16Array(idx), count: idx.length },
    prop: { positions: new Float32Array(prop.pos), colours: new Float32Array(prop.col), indices: new Uint16Array(prop.idx), count: prop.idx.length },
  };
}

// A glowing ring: a torus band built from a tube swept around a circle.
// The ring faces the course direction; the game rotates it to face the
// incoming plane (rings lie in the plane perpendicular to the flight path).
export function buildRing(radius, tube = 1.7, segs = 28, sides = 8, rgb = [1.0, 0.72, 0.18]) {
  const pos = [], col = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const cx = Math.cos(a) * radius, cy = Math.sin(a) * radius;
    for (let j = 0; j <= sides; j++) {
      const b = (j / sides) * Math.PI * 2;
      pos.push(cx + Math.cos(b) * tube, cy + Math.sin(b) * tube, 0);
      // Warm amber (or the caller's colour), brighter on the sun side.
      const l = 0.85 + 0.15 * Math.cos(b);
      col.push(rgb[0] * l, rgb[1] * l, rgb[2] * l);
    }
  }
  const ring = sides + 1;
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * ring + j, b = a + ring;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions: new Float32Array(pos), colours: new Float32Array(col), indices: new Uint16Array(idx), count: idx.length };
}
