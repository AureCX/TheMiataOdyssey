// Procedural world: heightfield, biomes, rivers, lakes, roads, bridges, height queries.
import { createNoise2D, fbm, ridged, clamp, lerp, smoothstep } from './noise.js';

export const WORLD_SIZE = 4096;          // metres
export const HALF = WORLD_SIZE / 2;
export const CELL = 4;                    // grid spacing (m)
export const N = WORLD_SIZE / CELL;       // cells per side
export const NV = N + 1;                  // vertices per side
export const WATER_LEVEL = 0;

const nA = createNoise2D(1991);
const nB = createNoise2D(1989);
const nC = createNoise2D(5);
const nD = createNoise2D(1600);

// ---------- Water features ----------
export const ISLAND = { x: -880, z: 1720, rx: 300, rz: 230, name: 'Gull Island' };
export const GULLPIER = { name: 'Gull Island', near: [-612, 1706] };   // ferry pier (filled in by buildWorld)
// Gull Bay, the island's beach resort (filled in by buildWorld): shop plots along the promenade, the beach, the jetty
export const GULLBAY = { name: 'Gull Bay', shops: [], beach: [], jetty: null, court: null };
export const LAKES = [
  { x: -950, z: 150, r: 200, name: 'Forest lake' },
  { x: 560, z: 380, r: 135, name: 'Oasis lake' },
];

// River polyline: from mountain foothills down to the southern sea.
export const RIVER = [];
for (let z = -760; z <= 1700; z += 10) {
  const x = 170 + 90 * Math.sin(z / 310) + 35 * Math.sin(z / 93 + 1.3);
  RIVER.push([x, z]);
}
const RIVER_W = 16;

function distToPolyline(px, pz, pts, stride = 1) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i += stride) {
    const [ax, az] = pts[i], [bx, bz] = pts[Math.min(i + stride, pts.length - 1)];
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
    const ex = ax + dx * t - px, ez = az + dz * t - pz;
    const d = ex * ex + ez * ez;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// River lookup accelerated with a coarse z-index (river is monotonic in z).
function riverDist(x, z) {
  if (z < -900 || z > 1800) return 1e9;
  const i0 = Math.max(0, Math.floor((z + 760) / 10) - 12);
  const i1 = Math.min(RIVER.length - 1, i0 + 25);
  let best = 1e9;
  for (let i = i0; i < i1; i++) {
    const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    const ex = ax + dx * t - x, ez = az + dz * t - z;
    const d = ex * ex + ez * ez;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// ---------- Biomes ----------
export function biomeWeights(x, z) {
  const wx = x + 140 * nA(x / 800, z / 800);
  const wz = z + 140 * nB(x / 800, z / 800);
  const mountain = smoothstep(-620, -1050, wz);
  const desert = smoothstep(450, 900, wx) * (1 - mountain);
  const forest = smoothstep(-420, -850, wx) * (1 - mountain);
  const edge = Math.max(Math.abs(x), Math.abs(z));
  const sea = Math.max(smoothstep(1020, 1380, wz + 60 * nC(x / 300, 0.5)), smoothstep(1760, 2000, edge + 50 * nC(x / 250, z / 250)));
  const plains = Math.max(0, 1 - mountain - desert - forest);
  return { mountain, desert, forest, plains, sea };
}

export function biomeName(x, z, h) {
  if (h < -0.5) return 'Open water';
  const b = biomeWeights(x, z);
  if (b.sea > 0.5 || (h < 3 && b.sea > 0.15)) return 'Coast';
  if (b.mountain > 0.5) return h > 330 ? 'High mountains' : 'Mountains';
  if (b.desert > 0.5) return 'Desert';
  if (b.forest > 0.5) return 'Forest';
  return 'Plains';
}

// ---------- Raw height (before roads) ----------
export function rawHeight(x, z) {
  const b = biomeWeights(x, z);
  const plains = 7 + 5 * fbm(nA, x / 420, z / 420, 4) + 1.5 * fbm(nB, x / 70, z / 70, 3);
  const forest = 16 + 30 * (fbm(nB, x / 520, z / 520, 5) * 0.5 + 0.5) + 4 * fbm(nC, x / 90, z / 90, 3);
  // Desert: wind-aligned dunes + flat-topped mesas
  const du = x * 0.8 + z * 0.6, dv = -x * 0.6 + z * 0.8;
  const dunes = 9 * ridged(nC, du / 160, dv / 420, 3);
  const mesaN = fbm(nD, x / 520, z / 520, 4);
  const mesa = 70 * smoothstep(0.28, 0.36, mesaN) + 6 * smoothstep(0.36, 0.5, mesaN);
  const desert = 9 + dunes + mesa + 2 * fbm(nA, x / 60, z / 60, 2);
  // Mountains: ridged multifractal rising to the north
  const rise = smoothstep(-650, -1500, z + 100 * nB(x / 600, 7));
  const mountain = 45 + 120 * (fbm(nB, x / 300, z / 300, 4) * 0.5 + 0.5) * smoothstep(-600, -900, z)
    + 560 * Math.pow(ridged(nA, x / 950 + 3.1, z / 950, 6), 1.25) * rise;

  let h = plains;
  h = lerp(h, forest, b.forest);
  h = lerp(h, desert, b.desert);
  h = lerp(h, mountain, b.mountain);

  // Lakes
  for (const L of LAKES) {
    const d = Math.hypot(x - L.x, z - L.z) * (1 + 0.18 * nC(x / 90, z / 90));
    const f = smoothstep(L.r + 70, L.r - 30, d);
    h = lerp(h, -9 + 3 * nA(x / 50, z / 50), f);
  }
  // River
  const rd = riverDist(x, z);
  if (rd < 120) {
    const bank = smoothstep(RIVER_W + 55, RIVER_W + 4, rd);
    const bed = smoothstep(RIVER_W + 6, RIVER_W - 6, rd);
    const target = -3.8 + 1.2 * nC(x / 40, z / 40);
    h = lerp(h, Math.min(h, 2.2), bank);
    h = lerp(h, Math.min(h, target), bed);
  }
  // Sea: coast falls to the seabed
  const seabed = -28 + 10 * fbm(nD, x / 300, z / 300, 3);
  h = lerp(h, seabed, smoothstep(0, 1, b.sea));
  // Gull Island, off the south-west coast: a holiday island. Wide sand beaches shelve into turquoise shallows all
  // round, low dunes behind them, gentle green hills inland, and a rocky headland at the south for the lighthouse.
  { const I = ISLAND, dx = (x - I.x) / I.rx, dz = (z - I.z) / I.rz;
    const ir = Math.hypot(dx * (dx > 0 ? 0.78 : 1), dz) * (1 + 0.06 * nC(x / 80, z / 80));
    if (ir < 1.6) {
      const inland = 4.5 + 6 * smoothstep(0.6, 0.2, ir) + 2.5 * (fbm(nB, x / 140, z / 140, 3) * 0.5 + 0.5);
      let land;
      if (ir < 0.6) land = inland;
      else if (ir < 0.66) land = lerp(inland, 2.7 + 0.5 * nA(x / 25, z / 25), smoothstep(0.6, 0.66, ir));   // dunes
      else if (ir < 0.76) land = lerp(2.7, 1.1, (ir - 0.66) / 0.1);                                          // the beach
      else if (ir < 0.86) land = lerp(1.1, -2.2, (ir - 0.76) / 0.1);                                         // shallows
      else land = lerp(-2.2, seabed, smoothstep(0.86, 1.15, ir));
      // the lighthouse headland: a rocky knoll on the south shore
      const hd2 = Math.hypot(x - (I.x - 10), z - (I.z + 178));
      if (hd2 < 90) land = Math.max(land, 24 * smoothstep(80, 38, hd2) + 3 * fbm(nC, x / 30, z / 30, 2) * smoothstep(80, 50, hd2));
      h = Math.max(h, land);
    }
    // a channel out to deep water for the ferry, off the pier on the east beach
    const cx0 = GULLPIER.near[0], cz0 = GULLPIER.near[1];
    if (x > cx0 + 10 && x < cx0 + 230 && Math.abs(z - cz0) < 70) { const w = smoothstep(70, 35, Math.abs(z - cz0)) * smoothstep(cx0 + 10, cx0 + 30, x); h = lerp(h, Math.min(h, 1.5 - (x - cx0 - 25) * 0.35), w); }
  }
  // Beach shaping: flatten near sea level
  if (h > -2 && h < 4) h = lerp(h, 0.9 + (h - 1) * 0.35, 0.5);
  return h;
}

// ---------- Roads ----------
function catmullRom(points, closed, step) {
  const out = [];
  const n = points.length;
  const segs = closed ? n : n - 1;
  const P = (i) => closed ? points[(i + n) % n] : points[clamp(i, 0, n - 1)];
  for (let s = 0; s < segs; s++) {
    const p0 = P(s - 1), p1 = P(s), p2 = P(s + 1), p3 = P(s + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k = Math.max(2, Math.ceil(len / step));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(points[n - 1].slice());
  return out;
}

export const ROAD_DEFS = [
  { name: 'Highway 1', type: 'highway', width: 15, closed: true, pts: [
    [-900, -470], [0, -520], [900, -470], [1320, -40], [1180, 600], [420, 860], [-420, 860], [-1120, 620], [-1360, 20] ] },
  { name: 'Mountain pass', type: 'road', width: 7.5, closed: false, pts: [
    [0, -520], [-120, -700], [60, -860], [-90, -1000], [120, -1130], [-40, -1280], [240, -1420], [520, -1380], [700, -1150], [900, -470] ] },
  { name: 'Desert road', type: 'road', width: 7.5, closed: false, pts: [
    [1320, -40], [1560, -160], [1760, 120], [1690, 470], [1180, 600] ] },
  { name: 'Coast road', type: 'road', width: 7.5, closed: false, pts: [
    [420, 860], [330, 1040], [-120, 1110], [-560, 1020], [-420, 860] ] },
  { name: 'Forest road', type: 'road', width: 7, closed: false, pts: [
    [-1120, 620], [-820, 470], [-640, 160], [-700, -200], [-900, -470] ] },
  { name: 'Central road', type: 'road', width: 7.5, closed: false, pts: [
    [0, -520], [-90, -60], [120, 380], [420, 860] ] },
  // Gull Island: a causeway (bridge) from the Coast road's western bend, and a ring road round the plateau
  { name: 'Gull Island causeway', type: 'road', width: 7, closed: false, pts: [
    [-569.2, 1004.2], [-640, 1150], [-760, 1400], [-880.0, 1580.0] ] },
  { name: 'Gull Island ring', type: 'road', width: 6.5, closed: true, pts: [[-880.0, 1580.0], [-795.0, 1596.1], [-732.8, 1640.0], [-710.0, 1700.0], [-732.8, 1760.0], [-795.0, 1803.9], [-880.0, 1820.0], [-965.0, 1803.9], [-1027.2, 1760.0], [-1050.0, 1700.0], [-1027.2, 1640.0], [-965.0, 1596.1]] },
  // Gull Island harbour road: off the ring road, down to the east beach and the ferry pier
  { name: 'Gull Island harbour road', type: 'road', width: 6.5, closed: false, pts: [
    [-732.8, 1640], [-700, 1628], [-668, 1645], [-645, 1675], [-628, 1700], [-612, 1706] ] },
  // Gull Bay promenade: from the pier along the east beach, round the bay and back up to the ring road
  { name: 'Gull Bay promenade', type: 'road', width: 7, closed: false, pts: [
    [-620, 1706], [-631, 1736], [-638, 1770], [-656, 1795], [-700, 1802], [-760, 1786] ] },
  // rally stages: gravel loops off the Central and Forest roads (the Riverside stage fords the river)
  { name: 'Riverside rally stage', type: 'gravel', width: 6, closed: false, pts: [
    [81.5, 313.3], [140, 318], [212, 322], [290, 300], [330, 240], [380, 200], [450, 130], [520, 60], [600, 30], [680, 80], [740, 180],
    [730, 280], [770, 380], [720, 480], [680, 560], [600, 600], [520, 640], [450, 690], [400, 720], [342.2, 739.2] ] },
  { name: 'Pinewood forest stage', type: 'gravel', width: 6, closed: false, pts: [
    [-682.4, -154.1], [-760, -200], [-850, -280], [-960, -300], [-1080, -250], [-1170, -170], [-1230, -50], [-1260, 80], [-1250, 250],
    [-1230, 360], [-1200, 450], [-1100, 500], [-1000, 520], [-920, 480], [-853.8, 497.4] ] },
];

export const roads = [];
const SPAN = 3; // m between road samples

// Limit the grade between samples; bridges stay above the water and the road ramps up to them (raise-only passes
// last, so there's never a step at a bridge end). pin: optional per-sample fixed heights (NaN = free).
function gradeLimit(h, pts, grade, bridge, pin) {
  const n = h.length, ds = new Float32Array(n);
  for (let i = 1; i < n; i++) ds[i] = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const free = (i) => !pin || Number.isNaN(pin[i]);
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < n; i++) if (free(i)) h[i] = clamp(h[i], h[i - 1] - grade * ds[i], h[i - 1] + grade * ds[i]);
    for (let i = n - 2; i >= 0; i--) if (free(i)) h[i] = clamp(h[i], h[i + 1] - grade * ds[i + 1], h[i + 1] + grade * ds[i + 1]);
  }
  for (let i = 0; i < n; i++) if (bridge[i]) h[i] = Math.max(h[i], 6.5);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < n; i++) if (free(i)) h[i] = Math.max(h[i], h[i - 1] - grade * ds[i]);
    for (let i = n - 2; i >= 0; i--) if (free(i)) h[i] = Math.max(h[i], h[i + 1] - grade * ds[i + 1]);
  }
}

// rally stages: extra kinks between the control points (not on the first/last leg, nor near water), tapered at
// each end of a leg so the road still passes through the waypoints
function wiggle(ctrl, seed) {
  const out = [ctrl[0]];
  for (let k = 0; k < ctrl.length - 1; k++) {
    const [ax, az] = ctrl[k], [bx, bz] = ctrl[k + 1], L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L;
    const wet = rawHeight(ax, az) < 3 || rawHeight(bx, bz) < 3 || rawHeight((ax + bx) / 2, (az + bz) / 2) < 3;
    const n = Math.floor(L / 34), amp = k === 0 || k === ctrl.length - 2 || wet ? 0 : 9;
    for (let q = 1; q < n; q++) { const t = q / n, w = amp * Math.sin(q * 2.1 + seed + k) * Math.sin(Math.PI * t); out.push([ax + (bx - ax) * t + nx * w, az + (bz - az) * t + nz * w]); }
    out.push(ctrl[k + 1]);
  }
  return out;
}

function buildRoads() {
  for (const def of ROAD_DEFS) {
    const pts = catmullRom(def.type === 'gravel' ? wiggle(def.pts, def.name.length) : def.pts, def.closed, SPAN);
    const n = pts.length;
    const raw = pts.map(([x, z]) => rawHeight(x, z));
    // Smooth the profile
    const win = def.type === 'highway' ? 30 : 18;
    let h = raw.map((_, i) => {
      let s = 0, c = 0;
      for (let k = -win; k <= win; k++) {
        let j = i + k;
        if (def.closed) j = (j + n) % n; else if (j < 0 || j >= n) continue;
        s += raw[j]; c++;
      }
      return s / c;
    });
    // Bridges over water (gravel stages ford the water instead: the road dips to 0.35 m under the surface)
    const bridge = new Uint8Array(n), ford = def.type === 'gravel';
    const fordPin = ford ? new Float32Array(n).fill(NaN) : null;
    for (let i = 0; i < n; i++) if (raw[i] < 1.0 && !ford) {
      for (let k = -6; k <= 6; k++) { let j = i + k; if (def.closed) j = (j + n) % n; if (j >= 0 && j < n) bridge[j] = 1; }
    }
    for (let i = 0; i < n; i++) {
      if (ford && raw[i] < 0.5) { h[i] = fordPin[i] = -0.35; continue; }
      h[i] = Math.max(h[i], 2.6);
      if (bridge[i]) h[i] = Math.max(h[i], 6.5);
    }
    // Grade limit (forward+backward passes), per metre of road so uneven sample spacing can't exceed it
    gradeLimit(h, pts, def.type === 'highway' ? 0.07 : 0.11, bridge, fordPin);
    // Tangents & cumulative length
    const tx = new Float32Array(n), tz = new Float32Array(n), s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = pts[def.closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
      const b = pts[def.closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      tx[i] = dx / l; tz[i] = dz / l;
      if (i > 0) s[i] = s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    const length = s[n - 1] + (def.closed ? Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]) : 0);
    roads.push({ ...def, pts, h: Float32Array.from(h), bridge, tx, tz, s, length, n, hw: def.width / 2, fordPin });
  }
}

// Junctions: each road was profiled on its own, so where two meet their decks can be metres apart (one floats,
// the other is buried). The highway is the reference; every other road is pinned to the deck it joins or crosses,
// the correction eased in over 200 m either side, then re-graded with the pins held.
function nearestOnRoad(o, x, z) {
  let bd = 1e9, bh = 0;
  const segs = o.closed ? o.n : o.n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % o.n, a = o.pts[i], b = o.pts[j], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d < bd) { bd = d; bh = o.h[i] + (o.h[j] - o.h[i]) * t; }
  }
  return [bd, bh];
}
function joinRoads() {
  const done = roads.filter((r) => r.type === 'highway');
  for (const r of roads) {
    if (r.type === 'highway') continue;
    const pin = r.fordPin ? Float32Array.from(r.fordPin) : new Float32Array(r.n).fill(NaN);
    for (const o of done) for (let i = 0; i < r.n; i++) {
      if (r.bridge[i]) continue;
      const [d, h] = nearestOnRoad(o, r.pts[i][0], r.pts[i][1]);
      if (d < o.hw + r.hw + 1.5) pin[i] = h;
    }
    const pins = []; for (let i = 0; i < r.n; i++) if (!Number.isNaN(pin[i]) && !(r.fordPin && !Number.isNaN(r.fordPin[i]))) pins.push(i);
    if (!pins.length) { done.push(r); continue; }
    const h = r.h;
    // ease the profile towards the nearest pin
    const delta = new Float32Array(r.n);
    for (let i = 0; i < r.n; i++) {
      let best = 1e9, dv = 0;
      for (const p of pins) { const ds = Math.abs(r.s[i] - r.s[p]); if (ds < best) { best = ds; dv = pin[p] - h[p]; } }
      delta[i] = dv * (1 - smoothstep(0, 200, best));
    }
    for (let i = 0; i < r.n; i++) h[i] = Number.isNaN(pin[i]) ? h[i] + delta[i] : pin[i];
    gradeLimit(h, r.pts, 0.11, r.bridge, pin);
    done.push(r);
  }
}

// T-junctions: every open road end that lands on another road at the same height. Crossings of two country roads
// (away from either end) get a plain asphalt patch like the town crossings, without traffic lights.
function findJoins() {
  const near = (o, x, z) => { let bi = -1, bd = 1e18; for (let i = 0; i < o.n; i++) { const d = (o.pts[i][0] - x) ** 2 + (o.pts[i][1] - z) ** 2; if (d < bd) { bd = d; bi = i; } } return [bi, Math.sqrt(bd)]; };
  for (const r of roads) {
    if (r.closed || r.type === 'rail' || r.type === 'street') continue;
    for (const end of [0, r.n - 1]) {
      const [x, z] = r.pts[end]; let best = null;
      for (const o of roads) {
        if (o === r || o.type === 'rail') continue;
        const [ti, d] = near(o, x, z);
        if (d < o.hw + 2 && Math.abs(o.h[ti] - r.h[end]) < 1.5 && (!best || d < best.d)) best = { o, ti, d };
      }
      if (!best) continue;
      const o = best.o, ti = best.ti, k = end === 0 ? Math.min(r.n - 1, 6) : Math.max(0, r.n - 7);
      const side = Math.sign((r.pts[k][0] - o.pts[ti][0]) * -o.tz[ti] + (r.pts[k][1] - o.pts[ti][1]) * o.tx[ti]) || 1;
      ROAD_JOINS.push({ branch: r, end, through: o, ti, x: o.pts[ti][0], z: o.pts[ti][1], h: o.h[ti], side });
    }
  }
  // country-road crossings (segment intersections at the same level, clear of both roads' ends)
  const open = roads.filter((r) => r.type !== 'rail' && r.type !== 'street');
  for (let a = 0; a < open.length; a++) for (let b = a + 1; b < open.length; b++) {
    const A = open[a], B = open[b];
    for (let i = 0; i < A.n - 1; i += 1) {
      const [ax, az] = A.pts[i], [bx, bz] = A.pts[i + 1];
      for (let j = 0; j < B.n - 1; j++) {
        const [cx, cz] = B.pts[j], [dx, dz] = B.pts[j + 1];
        if (Math.abs(ax - cx) > 40 || Math.abs(az - cz) > 40) continue;
        const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx); if (Math.abs(den) < 1e-6) continue;
        const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        if (Math.abs(A.h[i] - B.h[j]) > 1.5 || A.bridge[i] || B.bridge[j]) continue;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const endA = !A.closed && (A.s[i] < B.hw + 8 || A.length - A.s[i] < B.hw + 8), endB = !B.closed && (B.s[j] < A.hw + 8 || B.length - B.s[j] < A.hw + 8);
        if (endA || endB || JUNCTIONS.some((q) => Math.hypot(q.x - x, q.z - z) < 6)) continue;
        JUNCTIONS.push({ x, z, a: A.hw + 0.5, b: B.hw + 0.5, ux: B.tx[j], uz: B.tz[j], h: A.h[i], r1: A, r2: B, rural: true });
      }
    }
  }
}

// Driving on at a junction: a car reaching `end` of `road` (0 or n-1) carries on along the road it joins, turning
// left or right (never straight back the way it came). ok(road) filters the roads it may use. Returns
// { road, u, dir } or null (a true dead end: turn round).
export function continueAtEnd(road, end, ok = () => true, rnd = Math.random) {
  const J = ROAD_JOINS.find((j) => j.branch === road && j.end === end && ok(j.through));
  if (!J) return null;
  const o = J.through, k = end === 0 ? Math.min(road.n - 1, 4) : Math.max(0, road.n - 5);
  const hx = road.pts[end][0] - road.pts[k][0], hz = road.pts[end][1] - road.pts[k][1], hl = Math.hypot(hx, hz) || 1;
  const dirs = [1, -1].filter((d) => (o.tx[J.ti] * d * hx + o.tz[J.ti] * d * hz) / hl > -0.35);
  const dir = dirs.length ? dirs[(rnd() * dirs.length) | 0] : 1;
  let u = J.ti + dir * 1.2; if (o.closed) u = ((u % o.n) + o.n) % o.n; else u = Math.max(0.7, Math.min(o.n - 1.7, u));
  return { road: o, u, dir };
}
// Turning off: the side roads that start (or end) on `road` between samples u0 and u1, heading away from it.
export function turnOffs(road, u0, u1, dir, ok = () => true) {
  const out = [], lo = Math.min(u0, u1), hi = Math.max(u0, u1);
  for (const J of ROAD_JOINS) {
    if (J.through !== road || J.ti < lo || J.ti >= hi || !ok(J.branch)) continue;
    const b = J.branch, bd = J.end === 0 ? 1 : -1, k = J.end === 0 ? Math.min(b.n - 1, 4) : Math.max(0, b.n - 5);
    const ox = b.pts[k][0] - b.pts[J.end][0], oz = b.pts[k][1] - b.pts[J.end][1], ol = Math.hypot(ox, oz) || 1;
    if ((road.tx[J.ti] * dir * ox + road.tz[J.ti] * dir * oz) / ol < -0.35) continue;   // no hairpin turns
    out.push({ road: b, u: J.end === 0 ? 1.2 : b.n - 2.2, dir: bd });
  }
  return out;
}

// ---------- Towns ----------
// Each sits on a levelled plateau where it meets an existing road, with a grid of side streets aligned to that road.
export const TOWN_DEFS = [
  { name: 'Fairfield', x: -60, z: 150, r: 190, size: 'city' },
  { name: 'Port Ruby', x: 200, z: 1050, r: 150, size: 'town' },
  { name: 'Mesa', x: 1550, z: -120, r: 135, size: 'town' },
  { name: 'Pinewood', x: -700, z: 100, r: 120, size: 'village' },
];
export const TOWNS = [];
function makeStreet(name, ax, az, bx, bz, H) {
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(3, Math.ceil(len / SPAN) + 1);
  const pts = [], s = new Float32Array(n), tx = new Float32Array(n).fill((bx - ax) / len), tz = new Float32Array(n).fill((bz - az) / len);
  for (let i = 0; i < n; i++) { const t = i / (n - 1); pts.push([ax + (bx - ax) * t, az + (bz - az) * t]); s[i] = len * t; }
  return { name, type: 'street', width: 6.5, closed: false, pts, h: new Float32Array(n).fill(H), bridge: new Uint8Array(n), tx, tz, s, length: len, n, hw: 3.25 };
}
function makeRing(name, cx, cz, R, H) {
  const n = Math.max(16, Math.round(2 * Math.PI * R / SPAN));
  const pts = [], s = new Float32Array(n), tx = new Float32Array(n), tz = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]); tx[i] = -Math.sin(a); tz[i] = Math.cos(a); s[i] = R * a; }
  return { name, type: 'street', width: 7, closed: true, pts, h: new Float32Array(n).fill(H), bridge: new Uint8Array(n), tx, tz, s, length: 2 * Math.PI * R, n, hw: 3.5 };
}
// fuel-station lots, roundabouts and junctions laid out with the towns (rendered in towns.js)
export const GARAGE_LOTS = [];
export const SHOP_LOTS = [];
export const HOME_LOTS = [];      // your house (one)      // Luigi's Pizza in Fairfield
// Mesa Field: a desert airstrip (destination for passenger flights), and Port Ruby's seaplane base on a pier
export const AIRSTRIP = { name: 'Mesa Field', x: 1020, z: 140, ux: 0.5, uz: Math.sqrt(3) / 2, len: 460, w: 22, h: 0 };
export const SEAPLANE = { name: 'Port Ruby seaplane base', x: 250, z0: 1258, z1: 1345, w: 6, top: 2.2, buoy: { x: 250, z: 1398 } };    // same shape as the station lots: the garage building sits at the back
export const STATION_LOTS = [];   // { name, cx, cz, ux, uz, h }: u along the road, v = (-uz, ux) away from it
export const ROUNDABOUTS = [];    // { x, z, R, island, h, town }
// where a road ends on another road (filled in by findJoins): the side road's mesh stops at the main road's edge and
// a flared asphalt mouth fills the corner; traffic turns onto the main road instead of turning round
export const ROAD_JOINS = [];   // { branch, end (0 | n-1), through, ti (nearest sample on through), x, z, h, side (which side of through) }
export const JUNCTIONS = [];      // { x, z, a, b, ux, uz, h }: plain asphalt patches (half sizes along/across u) over crossings
const RB_R = 12, RB_ISLAND = 7.5;

// segment/segment intersection: param along a (0..1) or null
function segX(ax, az, bx, bz, cx, cz, dx, dz, tol = 0.02) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t >= -tol && t <= 1 + tol && u >= -tol && u <= 1 + tol ? Math.max(0, Math.min(1, t)) : null;
}

function buildTowns() {
  for (const d of TOWN_DEFS) {
    let best = 1e18, bp = null;
    for (const r of roads) if (r.type !== 'street') for (let i = 0; i < r.n; i++) {
      if (r.bridge[i]) continue;
      const dd = (r.pts[i][0] - d.x) ** 2 + (r.pts[i][1] - d.z) ** 2;
      if (dd < best) { best = dd; bp = { r, i }; }
    }
    const [cx, cz] = bp.r.pts[bp.i], H = Math.max(bp.r.h[bp.i], 3.2), ux = bp.r.tx[bp.i], uz = bp.r.tz[bp.i], vx = -uz, vz = ux;
    const t = { ...d, x: cx, z: cz, h: H, ux, uz, road: bp.r.name, streets: [], rings: [], walks: [] };
    TOWNS.push(t);
    // bring every road through town to the plateau
    for (const r of roads) for (let i = 0; i < r.n; i++) {
      const dd = Math.hypot(r.pts[i][0] - cx, r.pts[i][1] - cz);
      if (dd < t.r * 1.35) r.h[i] = lerp(r.h[i], H, 1 - smoothstep(t.r * 0.95, t.r * 1.35, dd));   // level across the whole street grid
    }
    // a closed street grid: parallel streets either side of the through road, cross streets over it, and a cross
    // street closing each end, so every street ends at a junction (no dead ends or stubs into the fields)
    const along = { city: [45, 90], town: [55], village: [42] }[d.size];
    const cross = { city: [-1, -1 / 3, 1 / 3, 1], town: [-1, -0.15, 1], village: [-1, 0.1, 1] }[d.size];
    const P = (u, v) => [cx + ux * u + vx * v, cz + uz * u + vz * v];
    const dry = (a, b) => { for (let k = 0; k <= 12; k++) { const x = a[0] + (b[0] - a[0]) * k / 12, z = a[1] + (b[1] - a[1]) * k / 12; if (rawHeight(x, z) < -6) return false; } return true; };
    const Vmax = Math.max(...along), U = Math.sqrt((0.9 * t.r) ** 2 - Vmax ** 2);
    const keep = {};
    for (const side of [1, -1]) {
      let k = along.length;
      for (; k > 0; k--) {
        const V = along[k - 1] * side;
        let ok = true;
        for (const o of along.slice(0, k)) if (!dry(P(-U, o * side), P(U, o * side))) ok = false;
        for (const f of cross) if (!dry(P(f * U, 0), P(f * U, V))) ok = false;
        if (ok) break;
      }
      keep[side] = along.slice(0, k);
    }
    const Vp = keep[1].length ? Math.max(...keep[1]) : 0, Vn = keep[-1].length ? Math.max(...keep[-1]) : 0;
    let k = 0;
    const add = (a, b) => { const st = makeStreet(`${d.name} street ${++k}`, a[0], a[1], b[0], b[1], H); roads.push(st); t.streets.push(st); return st; };
    for (const side of [1, -1]) for (const o of keep[side]) add(P(-U, o * side), P(U, o * side));
    if (Vp || Vn) for (const f of cross) add(P(f * U, -Vn), P(f * U, Vp));
    // roundabouts where the inner parallel streets meet the interior cross streets (one or two per side)
    const inner = cross.filter((f) => Math.abs(f) < 1).sort((a, b) => Math.abs(a) - Math.abs(b)).slice(0, d.size === 'city' ? 2 : 1);
    for (const side of [1, -1]) if (keep[side].length) for (const f of inner) {
      const [x, z] = P(f * U, keep[side][0] * side);
      const ring = makeRing(`${d.name} roundabout`, x, z, RB_R, H); roads.push(ring); t.rings.push(ring);
      ROUNDABOUTS.push({ x, z, R: RB_R, island: RB_ISLAND, h: H, town: d.name, city: d.size === 'city' });
    }
    t.U = U; t.Vp = Vp; t.Vn = Vn;
  }
}

// After every road exists: junction patches, pavements cut back at every crossing, and the fuel-station lots
function layoutTownDetails() {
  for (const t of TOWNS) {
    const through = roads.find((r) => r.name === t.road);
    const others = [...t.streets];
    for (const st of t.streets) {
      const [ax, az] = st.pts[0], [bx, bz] = st.pts[st.n - 1], len = st.length;
      const gaps = [];
      const gap = (s, half) => gaps.push([s - half, s + half]);
      // crossings with the other streets
      for (const o of others) if (o !== st) {
        const [cx, cz] = o.pts[0], [dx, dz] = o.pts[o.n - 1];
        const p = segX(ax, az, bx, bz, cx, cz, dx, dz);
        if (p === null) continue;
        const sAt = p * len; gap(sAt, o.hw + 3.2);
        const x = ax + (bx - ax) * p, z = az + (bz - az) * p;
        if (!JUNCTIONS.some((j) => Math.hypot(j.x - x, j.z - z) < 2)) JUNCTIONS.push({ x, z, a: o.hw + 0.5, b: st.hw + 0.5, ux: st.tx[0], uz: st.tz[0], h: t.h, r1: st, r2: o });
      }
      // crossings with the through road
      for (let i = 0; i < through.n - 1; i++) {
        const [cx, cz] = through.pts[i], [dx, dz] = through.pts[i + 1];
        if (Math.hypot(cx - ax, cz - az) > len + 30 && Math.hypot(cx - bx, cz - bz) > len + 30) continue;
        const p = segX(ax, az, bx, bz, cx, cz, dx, dz, 0);
        if (p === null) continue;
        gap(p * len, through.hw + 3.6);
        const x = ax + (bx - ax) * p, z = az + (bz - az) * p;
        JUNCTIONS.push({ x, z, a: st.hw + 0.8, b: through.hw + 0.4, ux: through.tx[i], uz: through.tz[i], h: through.h[i], r1: through, r2: st });
      }
      // roundabouts: the whole ring plus a margin
      for (const rb of ROUNDABOUTS) {
        if (rb.town !== t.name) continue;
        const ex = bx - ax, ez = bz - az, sAt = ((rb.x - ax) * ex + (rb.z - az) * ez) / len, dPerp = Math.abs((rb.x - ax) * ez - (rb.z - az) * ex) / len;
        const Rg = rb.R + 3.5 + 3;
        if (dPerp < Rg) gap(sAt, Math.sqrt(Rg * Rg - dPerp * dPerp));
      }
      // pavement: walk along each side and keep the stretches clear of every other road and of the roundabouts
      const ux = st.tx[0], uz = st.tz[0];
      for (const side of [1, -1]) {
        const off = side * (st.hw + 1.3), ok = [];
        for (let m = 0; m <= len; m += 1) {
          const x = ax + ux * m - uz * off, z = az + uz * m + ux * off;
          ok.push(!roadNearExcept(x, z, 1.6, st) && !ROUNDABOUTS.some((rb) => rb.town === t.name && Math.hypot(rb.x - x, rb.z - z) < rb.R + 3.5 + 1.8) && rawHeight(x, z) > -6);
        }
        let i0 = -1;
        for (let i = 0; i <= ok.length; i++) {
          if (i < ok.length && ok[i]) { if (i0 < 0) i0 = i; continue; }
          if (i0 >= 0) {
            const p0 = i0 + 0.6, p1 = i - 1 - 0.6;
            if (p1 - p0 >= 4) {
              const mid = (p0 + p1) / 2, x = ax + ux * mid - uz * off, z = az + uz * mid + ux * off;
              const w = { cx: x, cz: z, ux, uz, hl: (p1 - p0) / 2, hw: 1.3, h: t.h, top: t.h + 0.14, kind: 'walk' };
              addPaved(w); t.walks.push(w);
            }
            i0 = -1;
          }
        }
      }
      void gaps;
    }
    for (const rb of ROUNDABOUTS) if (rb.town === t.name) addPaved({ cx: rb.x, cz: rb.z, ux: 1, uz: 0, hl: rb.island, hw: rb.island, round: true, h: t.h, top: t.h + 0.28, kind: 'island' });
  }
  // fuel stations: a forecourt touching the road edge, levelled to the road
  const nearStreet = (x, z, m) => { const r = roadAt(x, z, m); return r && r.road.type === 'street'; };
  const tryLot = (name, r, i, side, H, list = STATION_LOTS, kind = 'station', hl = 15, half = 11.5) => {
    const [px, pz] = r.pts[i]; let ux = r.tx[i], uz = r.tz[i];
    if (side < 0) { ux = -ux; uz = -uz; }
    const vx = -uz, vz = ux, off = r.hw + half - 0.5, cx = px + vx * off, cz = pz + vz * off;
    for (let a = -hl - 1; a <= hl + 1; a += 3) for (let b = -half + 1.5; b <= half + 0.5; b += 3) {
      const x = cx + ux * a + vx * b, z = cz + uz * a + vz * b;
      if (nearStreet(x, z, 3) || rawHeight(x, z) < 1.2 || pavedAt(x, z) || ROUNDABOUTS.some((rb) => Math.hypot(rb.x - x, rb.z - z) < rb.R + 6)) return false;
      const rr = roadAt(x, z, 0.5); if (rr && b > -half + 2.5) return false;   // only the edge may touch a road
    }
    for (const L of [...STATION_LOTS, ...GARAGE_LOTS, ...SHOP_LOTS]) if (Math.hypot(L.cx - cx, L.cz - cz) < 50) return false;
    list.push({ name, cx, cz, ux, uz, h: H, hl, half });
    addPaved({ cx, cz, ux, uz, hl, hw: half, h: H, top: H + 0.03, kind });
    return true;
  };
  for (const t of TOWNS) {
    const r = roads.find((q) => q.name === t.road);
    let done = false;
    for (const u of [0.38, -0.38, 0.55, -0.55, 0.25, -0.25]) for (const side of [1, -1]) {
      if (done) continue;
      const tx = t.x + t.ux * u * t.r, tz = t.z + t.uz * u * t.r;
      let bi = 0, bd = 1e18; for (let i = 0; i < r.n; i++) { const dd = (r.pts[i][0] - tx) ** 2 + (r.pts[i][1] - tz) ** 2; if (dd < bd) { bd = dd; bi = i; } }
      if (r.bridge[bi]) continue;
      done = tryLot(`${t.name} services`, r, bi, side, r.h[bi]);
    }
  }
  // garages in the bigger towns, toward the ends of the main street
  for (const t of TOWNS) {
    if (t.size === 'village') continue;
    const r = roads.find((q) => q.name === t.road);
    let done = false;
    for (const u of [-0.62, 0.62, -0.72, 0.72, -0.5, 0.5, -0.8, 0.8]) for (const side of [-1, 1]) {
      if (done) continue;
      const tx = t.x + t.ux * u * t.r, tz = t.z + t.uz * u * t.r;
      let bi = 0, bd = 1e18; for (let i = 0; i < r.n; i++) { const dd = (r.pts[i][0] - tx) ** 2 + (r.pts[i][1] - tz) ** 2; if (dd < bd) { bd = dd; bi = i; } }
      if (r.bridge[bi]) continue;
      done = tryLot(`${t.name} Motors`, r, bi, side, r.h[bi], GARAGE_LOTS, 'garage');
    }
  }
  // your house: a plot on the Central road north of Fairfield, the house at the back of a gravel drive
  { const r = roads.find((q) => q.name === 'Central road');
    for (let i = 60; i < r.n && !HOME_LOTS.length; i += 4) {
      const [x, z] = r.pts[i]; if (z < -420 || z > -180 || r.bridge[i] || townAt(x, z, 60)) continue;
      for (const side of [1, -1]) if (!HOME_LOTS.length) tryLot('Home', r, i, side, r.h[i], HOME_LOTS, 'home', 14, 13);
    } }
  // the pizzeria, on Fairfield's main street
  { const t = TOWNS.find((q) => q.name === 'Fairfield'), r = roads.find((q) => q.name === t.road); let done = false;
    for (const u of [0.1, -0.1, 0.2, -0.2, 0.3, -0.3, 0.42, -0.42, 0.55, -0.55, 0.05, -0.05]) for (const side of [-1, 1]) {
      if (done) continue;
      const tx = t.x + t.ux * u * t.r, tz = t.z + t.uz * u * t.r;
      let bi = 0, bd = 1e18; for (let i = 0; i < r.n; i++) { const dd = (r.pts[i][0] - tx) ** 2 + (r.pts[i][1] - tz) ** 2; if (dd < bd) { bd = dd; bi = i; } }
      done = tryLot("Luigi's Pizza", r, bi, side, r.h[bi], SHOP_LOTS, 'shop', 9, 8.5);
    } }
  // airstrip and pier
  { const A = AIRSTRIP; let s = 0, n = 0; for (let u = -A.len / 2; u <= A.len / 2; u += 20) { s += rawHeight(A.x + A.ux * u, A.z + A.uz * u); n++; } A.h = s / n;
    addPaved({ cx: A.x, cz: A.z, ux: A.ux, uz: A.uz, hl: A.len / 2, hw: A.w / 2, h: A.h, top: A.h + 0.03, kind: 'strip' });
    const vx = -A.uz, vz = A.ux;   // apron beside the threshold end
    addPaved({ cx: A.x - A.ux * (A.len / 2 - 40) + vx * 30, cz: A.z - A.uz * (A.len / 2 - 40) + vz * 30, ux: A.ux, uz: A.uz, hl: 25, hw: 19, h: A.h, top: A.h + 0.03, kind: 'strip' }); }
  addPaved({ cx: HARBOUR.cx, cz: HARBOUR.cz, ux: 1, uz: 0, hl: HARBOUR.hl, hw: HARBOUR.hw, h: HARBOUR.top, top: HARBOUR.top, kind: 'pier' });
  { // Gull Island ferry pier: straight on from the end of the harbour road, out into the sea
    const r = roads.find((q) => q.name === 'Gull Island harbour road'), k = r.n - 1, [px, pz] = r.pts[k];
    let vx = r.tx[k], vz = r.tz[k]; const l = Math.hypot(vx, vz); vx /= l; vz /= l;
    // turn the pier to point at the deepest water nearby (east)
    let best = null; for (let a = -1.2; a <= 1.2; a += 0.1) { const cx = Math.cos(a), cz = Math.sin(a), d = rawHeight(px + cx * 60, pz + cz * 60); if (!best || d < best.d) best = { d, cx, cz }; }
    vx = best.cx; vz = best.cz;
    const L = 40, top = r.h[k];
    Object.assign(GULLPIER, { h: top, ux: vx, uz: vz, cx: px + vx * (L / 2 + 2), cz: pz + vz * (L / 2 + 2), hl: L / 2 + 2, hw: 6, end: { x: px + vx * (L + 2), z: pz + vz * (L + 2) } });
    addPaved({ cx: GULLPIER.cx, cz: GULLPIER.cz, ux: vx, uz: vz, hl: L / 2 + 2, hw: 6, h: top, top, kind: 'pier' });
  }
  { // Gull Bay: plots on the inland side of the promenade, the beach on the sea side, a jetty for the jet skis
    const r = roads.find((q) => q.name === 'Gull Bay promenade');
    const at = (s0) => { let i = 0; while (i < r.n - 2 && r.s[i + 1] < s0) i++; return i; };
    const side = (i) => { const nx = -r.tz[i], nz = r.tx[i]; return rawHeight(r.pts[i][0] + nx * 25, r.pts[i][1] + nz * 25) > rawHeight(r.pts[i][0] - nx * 25, r.pts[i][1] - nz * 25) ? 1 : -1; };
    const SH = [['GULL BAY SURF', 'surf', 11, 8], ['GELATO', 'gelato', 7, 6], ['SEASHELL CAFÉ', 'cafe', 12, 9], ['SOUVENIRS', 'shop', 9, 7], ['DIVE CENTRE', 'dive', 10, 8], ['BEACH MARKET', 'market', 11, 8], ['HOTEL GULL BAY', 'hotel', 22, 13]];
    let s0 = 22;
    for (const [name, type, w, d] of SH) {
      const i = at(s0 + w / 2), sd = side(i), nx = -r.tz[i] * sd, nz = r.tx[i] * sd, off = r.hw + 3 + d / 2;
      const cx = r.pts[i][0] + nx * off, cz = r.pts[i][1] + nz * off, h = r.h[i];
      GULLBAY.shops.push({ name, type, x: cx, z: cz, h, w, d, face: Math.atan2(-nx, -nz), ux: r.tx[i], uz: r.tz[i] });
      addPaved({ cx: cx - nx * 1.5, cz: cz - nz * 1.5, ux: r.tx[i], uz: r.tz[i], hl: w / 2 + 1.5, hw: d / 2 + 3, h, top: h + 0.05, kind: 'shop' });
      s0 += w + 4;
    }
    // the beach: points on the sea side of the first stretch, every 6 m, out to the water's edge
    for (let q = 4; q < 110; q += 6) {
      const i = at(q), sd = -side(i), nx = -r.tz[i] * sd, nz = r.tx[i] * sd;
      for (let o = r.hw + 6; o < 70; o += 6) { const x = r.pts[i][0] + nx * o, z = r.pts[i][1] + nz * o, h = rawHeight(x, z); if (h < 0.9) break; GULLBAY.beach.push({ x, z, o, q, nx, nz }); }
    }
    { // volleyball court half way along, a jetty near the far end
      const i = at(60), sd = -side(i), nx = -r.tz[i] * sd, nz = r.tx[i] * sd;
      GULLBAY.court = { x: r.pts[i][0] + nx * (r.hw + 20), z: r.pts[i][1] + nz * (r.hw + 20), yaw: Math.atan2(r.tx[i], r.tz[i]) };
      const j = at(100), sj = -side(j); let jx = -r.tz[j] * sj, jz = r.tx[j] * sj;
      let best = null; for (let a = -0.8; a <= 0.8; a += 0.1) { const c = Math.cos(a), sn = Math.sin(a), vx = jx * c - jz * sn, vz = jx * sn + jz * c, d = rawHeight(r.pts[j][0] + vx * 60, r.pts[j][1] + vz * 60); if (!best || d < best.d) best = { d, vx, vz }; }
      jx = best.vx; jz = best.vz;
      let o0 = r.hw + 2; while (o0 < 80 && rawHeight(r.pts[j][0] + jx * o0, r.pts[j][1] + jz * o0) > 1.0) o0 += 2;   // start at the water's edge
      const L = 34, top = 1.7, sx = r.pts[j][0] + jx * (o0 - 8), sz = r.pts[j][1] + jz * (o0 - 8);
      GULLBAY.jetty = { x0: sx, z0: sz, ux: jx, uz: jz, L: L + 8, top, end: { x: sx + jx * (L + 8), z: sz + jz * (L + 8) } };
      addPaved({ cx: sx + jx * (L + 8) / 2, cz: sz + jz * (L + 8) / 2, ux: jx, uz: jz, hl: (L + 8) / 2, hw: 1.6, h: top, top, kind: 'pier' });
    }
  }
  { // West Bay ferry pier: off the Coast road's western dip, out into the bay
    const r = roads.find((q) => q.name === 'Coast road'); let bi = 0, bd = 1e18;
    for (let i = 0; i < r.n; i++) { const d = (r.pts[i][0] - WESTBAY.near[0]) ** 2 + (r.pts[i][1] - WESTBAY.near[1]) ** 2; if (d < bd) { bd = d; bi = i; } }
    const [px, pz] = r.pts[bi]; let vx = -r.tz[bi], vz = r.tx[bi];
    if (rawHeight(px + vx * 30, pz + vz * 30) > rawHeight(px - vx * 30, pz - vz * 30)) { vx = -vx; vz = -vz; }   // seaward
    const L = 44, top = r.h[bi];
    Object.assign(WESTBAY, { h: top, ux: vx, uz: vz, cx: px + vx * (r.hw + L / 2), cz: pz + vz * (r.hw + L / 2), hl: L / 2, hw: 6, road: r, i: bi,
      end: { x: px + vx * (r.hw + L), z: pz + vz * (r.hw + L) } });
    addPaved({ cx: WESTBAY.cx, cz: WESTBAY.cz, ux: vx, uz: vz, hl: L / 2, hw: 6, h: top, top, kind: 'pier' });
  }
  { // ski base: a car park beside the pass road, on the side facing the lift
    const r = roads.find((q) => q.name === 'Mountain pass'); let bi = 0, bd = 1e18;
    for (let i = 0; i < r.n; i++) { const d = (r.pts[i][0] - SKI.base.x) ** 2 + (r.pts[i][1] - SKI.base.z) ** 2; if (d < bd) { bd = d; bi = i; } }
    const [px, pz] = r.pts[bi], dx = SKI.top.x - px, dz = SKI.top.z - pz, l = Math.hypot(dx, dz);
    let vx = -r.tz[bi], vz = r.tx[bi]; if (vx * dx + vz * dz < 0) { vx = -vx; vz = -vz; }
    const cx = px + vx * (r.hw + 14), cz = pz + vz * (r.hw + 14);
    SKI.base = { x: cx + vx * 18, z: cz + vz * 18, h: r.h[bi] }; SKI.lot = { cx, cz, ux: r.tx[bi], uz: r.tz[bi], h: r.h[bi] };
    addPaved({ cx, cz, ux: r.tx[bi], uz: r.tz[bi], hl: 18, hw: 14.5, h: r.h[bi], top: r.h[bi] + 0.03, kind: 'station' });
    FLAT_AREAS.push({ cx: SKI.base.x, cz: SKI.base.z, ux: dx / l, uz: dz / l, hl: 12, hw: 12, h: r.h[bi], M: 18 });
    // the car cable car: a terrace at the end of the car park on the far side from the chalet, and a levelled summit
    // plateau beside the chairlift's top station; the line runs parallel to the chairlift
    const ex = dx / l, ez = dz / l; let px2 = -ez, pz2 = ex;
    const su = (r.tx[bi] * px2 + r.tz[bi] * pz2) > 0 ? 1 : -1;
    const bx = cx + r.tx[bi] * su * 42 + vx * 10, bz = cz + r.tz[bi] * su * 42 + vz * 10;
    const off = (bx - SKI.base.x) * px2 + (bz - SKI.base.z) * pz2;
    const tx = SKI.top.x + px2 * off, tz = SKI.top.z + pz2 * off, th = 535;
    SKI.cable = { base: { x: bx, z: bz, h: r.h[bi] }, top: { x: tx, z: tz, h: th }, ex, ez, px: px2, pz: pz2 };
    addPaved({ cx: bx, cz: bz, ux: ex, uz: ez, hl: 16, hw: 10, h: r.h[bi], top: r.h[bi] + 0.03, kind: 'station' });
    FLAT_AREAS.push({ cx: bx, cz: bz, ux: ex, uz: ez, hl: 16, hw: 10, h: r.h[bi], M: 22 });
    // the summit plateau: from just behind the two lift stations out to a viewpoint 130 m along the line, with the
    // Skyline loop road round it (a scenic drive at 535 m)
    const SHL = 70, mx = (tx + SKI.top.x) / 2 + ex * (SHL - 10), mz = (tz + SKI.top.z) / 2 + ez * (SHL - 10), hw2 = Math.abs(off) / 2 + 36;
    SKI.summit = { cx: mx, cz: mz, ux: ex, uz: ez, hl: SHL, hw: hw2, h: th };
    addPaved({ cx: mx, cz: mz, ux: ex, uz: ez, hl: SHL, hw: hw2, h: th, top: th + 0.03, kind: 'station' });
    FLAT_AREAS.push({ cx: mx, cz: mz, ux: ex, uz: ez, hl: SHL, hw: hw2, h: th, M: 55 });
    { const lc = [mx + ex * 12, mz + ez * 12], A2 = SHL - 26, B2 = hw2 - 12, n = Math.ceil(2 * Math.PI * Math.sqrt((A2 * A2 + B2 * B2) / 2) / 3);
      const pts = []; for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, u = Math.cos(a) * A2, v = Math.sin(a) * B2; pts.push([lc[0] + ex * u - ez * v, lc[1] + ez * u + ex * v]); }
      const tx2 = new Float32Array(n), tz2 = new Float32Array(n), s2 = new Float32Array(n); let L = 0;
      for (let k = 0; k < n; k++) { const a = pts[(k + n - 1) % n], b = pts[(k + 1) % n], l2 = Math.hypot(b[0] - a[0], b[1] - a[1]); tx2[k] = (b[0] - a[0]) / l2; tz2[k] = (b[1] - a[1]) / l2; if (k) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); s2[k] = L; }
      L += Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]);
      const loop = { name: 'Skyline loop', type: 'street', width: 7,   // (street: no through traffic up here)
        closed: true, pts, h: new Float32Array(n).fill(th), bridge: new Uint8Array(n), tx: tx2, tz: tz2, s: s2, length: L, n, hw: 3.5 };
      roads.push(loop); indexRoads([loop]); SKI.loop = loop; }
  }
  { let sm = 0, c = 0; for (let x = -60; x <= 60; x += 20) for (let z = -60; z <= 60; z += 20) { sm += rawHeight(ARENA.x + x, ARENA.z + z); c++; } ARENA.h = Math.round(sm / c * 10) / 10;
    FLAT_AREAS.push({ cx: ARENA.x, cz: ARENA.z, ux: 1, uz: 0, hl: ARENA.r, hw: ARENA.r, h: ARENA.h, M: 25 }); }
  // the Starlight drive-in east of Fairfield: a levelled gravel lot facing a big screen, with a driveway to the road
  { const D = DRIVEIN; let sm = 0, c = 0; for (let x = -30; x <= 30; x += 15) for (let z = -24; z <= 24; z += 12) { sm += rawHeight(D.x + x, D.z + z); c++; }
    D.h = Math.round(sm / c * 10) / 10;
    addPaved({ cx: D.x, cz: D.z, ux: D.ux, uz: D.uz, hl: D.hl, hw: D.hw, h: D.h, top: D.h + 0.03, kind: 'station', gravel: true });
    FLAT_AREAS.push({ cx: D.x, cz: D.z, ux: D.ux, uz: D.uz, hl: D.hl, hw: D.hw, h: D.h, M: 20 });
    let best = null; for (const r of roads) { if (r.type === 'rail' || r.type === 'track') continue; for (let i = 0; i < r.n; i++) { if (r.bridge[i]) continue; const d = Math.hypot(r.pts[i][0] - D.x, r.pts[i][1] - D.z); if (!best || d < best.d) best = { d, r, i }; } }
    if (best) { const [rx, rz] = best.r.pts[best.i], ex = (rx - D.x) / best.d, ez = (rz - D.z) / best.d, a = Math.min(D.hl, D.hw) - 2, b = best.d - best.r.hw - 1, L = b - a;
      D.drive = { x: D.x + ex * (a + L / 2), z: D.z + ez * (a + L / 2), ux: ex, uz: ez, hl: L / 2, hw: 3.2, rh: best.r.h[best.i] };
      addPaved({ cx: D.drive.x, cz: D.drive.z, ux: ex, uz: ez, hl: L / 2, hw: 3.2, h: (D.h + best.r.h[best.i]) / 2, top: (D.h + best.r.h[best.i]) / 2 + 0.03, kind: 'station' }); } }
  { const S = SEAPLANE; addPaved({ cx: S.x, cz: (S.z0 + S.z1) / 2, ux: 0, uz: 1, hl: (S.z1 - S.z0) / 2, hw: S.w / 2, h: S.top, top: S.top, kind: 'pier' }); }
  const hw = roads[0];
  for (const f of [0.18, 0.62]) {
    for (let tries = 0; tries < 30; tries++) {
      const i = Math.floor(hw.n * (f + tries * 0.006)) % hw.n;
      if (hw.bridge[i] || Math.abs(rawHeight(hw.pts[i][0], hw.pts[i][1]) - hw.h[i]) > 3 || townAt(hw.pts[i][0], hw.pts[i][1], 40)) continue;
      if (tryLot(`Highway services ${f < 0.5 ? 'north' : 'south'}`, hw, i, 1, hw.h[i]) || tryLot(`Highway services ${f < 0.5 ? 'north' : 'south'}`, hw, i, -1, hw.h[i])) break;
    }
  }
}

// ---------- Paved areas (oriented rectangles or discs): airport, forecourts, pavements, roundabout islands
export const PAVED = [];
const PCELL = 32, pavedHash = new Map();
function addPaved(p) {
  PAVED.push(p);
  const R = Math.hypot(p.hl, p.hw);
  for (let i = Math.floor((p.cx - R) / PCELL); i <= Math.floor((p.cx + R) / PCELL); i++)
    for (let j = Math.floor((p.cz - R) / PCELL); j <= Math.floor((p.cz + R) / PCELL); j++) {
      const k = hashKey(i, j); let a = pavedHash.get(k); if (!a) pavedHash.set(k, a = []); a.push(p);
    }
}
export function pavedAt(x, z) {
  const a = pavedHash.get(hashKey(Math.floor(x / PCELL), Math.floor(z / PCELL)));
  if (!a) return null;
  let best = null;
  for (const p of a) {
    const dx = x - p.cx, dz = z - p.cz;
    if (p.round) { if (dx * dx + dz * dz > p.hl * p.hl) continue; }
    else if (Math.abs(dx * p.ux + dz * p.uz) > p.hl || Math.abs(-dx * p.uz + dz * p.ux) > p.hw) continue;
    if (!best || p.top > best.top) best = p;
  }
  return best;
}
function flattenPaved() {
  for (const a of FLAT_AREAS) {
    const R = Math.hypot(a.hl, a.hw) + a.M;
    const i0 = Math.max(0, Math.floor((a.cx - R + HALF) / CELL)), i1 = Math.min(N, Math.ceil((a.cx + R + HALF) / CELL));
    const k0 = Math.max(0, Math.floor((a.cz - R + HALF) / CELL)), k1 = Math.min(N, Math.ceil((a.cz + R + HALF) / CELL));
    for (let kz = k0; kz <= k1; kz++) for (let kx = i0; kx <= i1; kx++) {
      const x = -HALF + kx * CELL, z = -HALF + kz * CELL, dx = x - a.cx, dz = z - a.cz;
      const d = Math.hypot(Math.max(Math.abs(dx * a.ux + dz * a.uz) - a.hl, 0), Math.max(Math.abs(-dx * a.uz + dz * a.ux) - a.hw, 0));
      const w = 1 - smoothstep(0, a.M, d), idx = kz * NV + kx;
      if (w > 0 && !(d > 0 && roadMask[idx] > 0)) heights[idx] = lerp(heights[idx], a.h - 0.05, w);
    }
  }
  // forecourts (and the airport) sit level; blend the terrain into them
  for (const p of PAVED) {
    if (p.kind !== 'station' && p.kind !== 'garage' && p.kind !== 'home' && p.kind !== 'shop' && p.kind !== 'strip' && p.kind !== 'airport' && p.kind !== 'paddock') continue;
    const M = p.kind === 'airport' ? 0 : p.kind === 'strip' ? 40 : 14, R = Math.hypot(p.hl, p.hw) + M;
    const i0 = Math.max(0, Math.floor((p.cx - R + HALF) / CELL)), i1 = Math.min(N, Math.ceil((p.cx + R + HALF) / CELL));
    const k0 = Math.max(0, Math.floor((p.cz - R + HALF) / CELL)), k1 = Math.min(N, Math.ceil((p.cz + R + HALF) / CELL));
    for (let kz = k0; kz <= k1; kz++) for (let kx = i0; kx <= i1; kx++) {
      const x = -HALF + kx * CELL, z = -HALF + kz * CELL, dx = x - p.cx, dz = z - p.cz;
      const a = Math.abs(dx * p.ux + dz * p.uz) - p.hl, b = Math.abs(-dx * p.uz + dz * p.ux) - p.hw;
      const d = Math.hypot(Math.max(a, 0), Math.max(b, 0));
      const w = M ? 1 - smoothstep(0, M, d) : (d <= 0 ? 1 : 0);
      const idx = kz * NV + kx;
      if (w > 0 && !(d > 0 && roadMask[idx] > 0)) heights[idx] = lerp(heights[idx], p.h - 0.02, w);
    }
  }
}

// ---------- Airport ----------
// Pilou International: one 800 m runway (north-south) on a levelled plateau between Fairfield and Pinewood, a parallel
// taxiway on the west side, the apron and terminal beyond it, and an access road from Pinewood.
const RWY_X = -300;
export const AIRPORT = {
  name: 'Pilou International Airport', code: 'PIL', x: RWY_X, z: 10, h: 9,
  zN: -390, zS: 410, rwyW: 45, taxiX: -375, finalZ: 1250,
  foot: { x0: -505, x1: -250, z0: -440, z1: 460 },
  paved: [
    { x0: RWY_X - 22.5, x1: RWY_X + 22.5, z0: -390, z1: 410, kind: 'runway' },
    { x0: -384, x1: -366, z0: -345, z1: 401, kind: 'taxiway' },
    { x0: -384, x1: RWY_X - 22, z0: 383, z1: 401, kind: 'taxiway' },
    { x0: -384, x1: RWY_X - 22, z0: -345, z1: -327, kind: 'taxiway' },
    { x0: -384, x1: RWY_X - 22, z0: 1, z1: 19, kind: 'taxiway' },
    { x0: -462, x1: -384, z0: -150, z1: 320, kind: 'apron' },
  ],
  terminal: { x0: -490, x1: -462, z0: -110, z1: 110 },
  gates: [-75, -25, 25, 75],
};
export function airportAt(x, z, margin = 0) {
  const f = AIRPORT.foot;
  return x > f.x0 - margin && x < f.x1 + margin && z > f.z0 - margin && z < f.z1 + margin;
}
export function airportPaved(x, z) {
  const p = pavedAt(x, z);
  return p && p.kind === 'airport' ? p : null;
}
function buildAirportRoad() {
  // access road: from the nearest Pinewood street (or its through road), between the terminal and the hangars, onto the apron
  const t0 = TOWNS.find((t) => t.name === 'Pinewood');
  let sx = -600, sz = 160, h0 = AIRPORT.h, bd = 1e18;
  if (t0) for (const r of roads) if (t0.streets.includes(r) || r.name === t0.road) for (let i = 0; i < r.n; i++) {
    const [x, z] = r.pts[i]; if (x > -505) continue;
    const dd = (x + 505) ** 2 + (z - 160) ** 2; if (dd < bd) { bd = dd; sx = x; sz = z; h0 = r.h[i]; }
  }
  const mid = [-500, 160];
  for (const [a, b, ha, hb] of [[[sx, sz], mid, h0, AIRPORT.h], [mid, [-462, 160], AIRPORT.h, AIRPORT.h]]) {
    const st = makeStreet('Airport road', a[0], a[1], b[0], b[1], hb);
    for (let i = 0; i < st.n; i++) st.h[i] = lerp(ha, hb, smoothstep(0, 1, i / (st.n - 1)));
    roads.push(st);
  }
}

// ---------- Red Mesa Raceway ----------
// A 1.46 km circuit in the south-east desert on a levelled site, with a paddock (and pit garage) reached from the
// Desert road. Local shape points are relative to the site centre (x east, z south).
export const TRACK = { name: 'Red Mesa Raceway', x: 1440, z: 900, h: 0, road: null, pit: null, straightZ: -105, shape: [[-200, -105], [0, -106], [190, -105], [255, -90], [282, -40], [268, 15], [210, 32], [145, 25], [100, 50], [100, 95], [135, 125], [195, 132], [240, 145], [238, 166], [185, 172], [60, 166], [-80, 155], [-140, 118], [-128, 65], [-165, 24], [-230, 36], [-272, 0], [-275, -65], [-245, -100]] };
export const FLAT_AREAS = [];
export const DRIVEIN = { x: 356, z: 136, ux: 1, uz: 0, hl: 34, hw: 28, name: 'Starlight drive-in' };
// the summer festival field north of Fairfield (kept clear of trees all year)
export const FESTIVAL = { x: -46, z: -115, r: 38, name: 'Fairfield summer festival' };
// the quarry mech arena, in the desert north of the raceway (levelled in buildWorld)
export const ARENA = { x: 1500, z: 360, r: 78, h: 0, name: 'Red Rock Quarry' };
export function reservedAt(x, z, margin = 0) {
  if (Math.hypot(x - FESTIVAL.x, z - FESTIVAL.z) < FESTIVAL.r + margin) return FESTIVAL;
  if (Math.hypot(x - ARENA.x, z - ARENA.z) < ARENA.r + 14 + margin) return ARENA;
  for (const a of FLAT_AREAS) if (Math.abs((x - a.cx) * a.ux + (z - a.cz) * a.uz) < a.hl + margin && Math.abs(-(x - a.cx) * a.uz + (z - a.cz) * a.ux) < a.hw + margin) return a;
  return null;
}
function buildTrack() {
  const T = TRACK;
  let sum = 0, n0 = 0; for (let x = -320; x <= 320; x += 20) for (let z = -170; z <= 170; z += 20) { sum += rawHeight(T.x + x, T.z + z); n0++; }
  const H = T.h = Math.round(sum / n0 * 10) / 10;
  const pts = catmullRom(T.shape.map(([x, z]) => [T.x + x, T.z + z]), true, SPAN);
  const n = pts.length, tx = new Float32Array(n), tz = new Float32Array(n), sArr = new Float32Array(n);
  let len = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    tx[i] = (b[0] - a[0]) / l; tz[i] = (b[1] - a[1]) / l;
    if (i) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); sArr[i] = len;
  }
  len += Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]);
  const road = { name: T.name, type: 'track', width: 12, closed: true, pts, h: new Float32Array(n).fill(H), bridge: new Uint8Array(n), tx, tz, s: sArr, length: len, n, hw: 6 };
  roads.push(road); T.road = road;
  FLAT_AREAS.push({ cx: T.x, cz: T.z, ux: 1, uz: 0, hl: 330, hw: 178, h: H, M: 70 });
  // pit lane alongside the main straight (north side), leaving the track after the last corner and rejoining before
  // turn 1; pit boxes behind it (one of them is the tuning garage), paddock behind those, access road from the Desert road
  const pitPts = catmullRom([[-238, -102], [-214, -117], [-185, -123], [0, -123], [170, -123], [198, -118], [222, -107]].map(([x, z]) => [T.x + x, T.z + z]), false, SPAN);
  const pn = pitPts.length, ptx = new Float32Array(pn), ptz = new Float32Array(pn), ps = new Float32Array(pn);
  let plen = 0;
  for (let i = 0; i < pn; i++) {
    const a = pitPts[Math.max(0, i - 1)], b = pitPts[Math.min(pn - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    ptx[i] = (b[0] - a[0]) / l; ptz[i] = (b[1] - a[1]) / l; if (i) plen += Math.hypot(pitPts[i][0] - pitPts[i - 1][0], pitPts[i][1] - pitPts[i - 1][1]); ps[i] = plen;
  }
  const pit = { name: 'Pit lane', type: 'track', width: 9, closed: false, pts: pitPts, h: new Float32Array(pn).fill(H + 0.012), bridge: new Uint8Array(pn), tx: ptx, tz: ptz, s: ps, length: plen, n: pn, hw: 4.5 };
  roads.push(pit); T.pit = pit;
  T.paddock = { cx: T.x - 20, cz: T.z - 152, hl: 165, hw: 16 };
  addPaved({ cx: T.paddock.cx, cz: T.paddock.cz, ux: 1, uz: 0, hl: T.paddock.hl, hw: 16, h: H, top: H + 0.03, kind: 'paddock' });
  addPaved({ cx: T.x - 10, cz: T.z - 131, ux: 1, uz: 0, hl: 172, hw: 4.2, h: H, top: H + 0.03, kind: 'paddock' });   // pit apron
  GARAGE_LOTS.push({ name: 'Raceway pit garage', cx: T.x - 120, cz: T.z - 134, ux: -1, uz: 0, h: H, hl: 15, half: 11.5, pitBox: true });
  const desert = roads.find((r) => r.name === 'Desert road');
  let bi = 0, bd = 1e18; for (let i = 0; i < desert.n; i++) { const d = (desert.pts[i][0] - (T.x - 40)) ** 2 + (desert.pts[i][1] - (T.z - 170)) ** 2; if (d < bd) { bd = d; bi = i; } }
  const [ax, az] = desert.pts[bi], st = makeStreet('Raceway road', ax, az, T.x - 40, T.z - 166, H);
  for (let i = 0; i < st.n; i++) st.h[i] = lerp(desert.h[bi], H, smoothstep(0, 1, i / (st.n - 1)));
  st.width = 7.5; st.hw = 3.75; roads.push(st); T.access = st;
  // the infield bridge: from the paddock, up over the pit lane and the main straight, down into the infield village
  const BX = T.x + 60, prof = [[-172, 0], [-128, 5.8], [-92, 5.8], [-48, 0]];
  const dpts = []; for (let k = 0; k < prof.length - 1; k++) { const [z0, h0] = prof[k], [z1, h1] = prof[k + 1], m = Math.ceil((z1 - z0) / 2); for (let q = 0; q < m; q++) { const f = q / m, e = h0 + (h1 - h0) * (0.5 - 0.5 * Math.cos(Math.PI * f)); dpts.push([BX, T.z + z0 + (z1 - z0) * f, H + 0.04 + e]); } }
  dpts.push([BX, T.z - 48, H + 0.04]);
  T.bridge = { x: BX, z0: T.z - 172, z1: T.z - 48, top: H + 5.84, hw: 4.2 };
  DECKS.push({ pts: dpts, hw: 4.2, box: [BX - 5, BX + 5, T.z - 175, T.z - 45] });
  // the village: a main street from the bridge foot south, crossed by the village high street
  const vs = (name, a, b, c, d) => { const r = makeStreet(name, T.x + a, T.z + b, T.x + c, T.z + d, H); r.width = 7; r.hw = 3.5; roads.push(r); return r; };
  T.village = { streets: [vs('Village main street', 60, -46, 60, 20), vs('Village high street', -50, -20, 190, -20)], x: T.x + 60, z: T.z - 20 };
  T.entrance = { x: st.pts[st.n - 1][0], z: st.pts[st.n - 1][1], tx: st.tx[0], tz: st.tz[0] };
  // track entries: from each end of the paddock onto the pit lane (which joins the circuit at both ends)
  const entry = (name, a, b, c, d) => { const r = makeStreet(name, T.x + a, T.z + b, T.x + c, T.z + d, H + 0.02); r.type = 'track'; r.width = 8; r.hw = 4; roads.push(r); return r; };
  T.entries = [entry('Track entry west', -186, -156, -209, -119), entry('Track entry east', 146, -158, 170, -152), entry('Track entry east', 170, -152, 190, -120)];
}

// ---------- Railway ----------
// A loop line 28 m outside Highway 1, graded to 3 % (cuttings, embankments and viaducts where it must), pinned to the
// road height where roads cross it (level crossings). Stations: STATIONS_RAIL.
export const RAIL = { road: null, stations: [] };
// Port Ruby harbour (a quay over the water west of the seaplane pier) and the Silverpine Peaks ski area off the mountain pass
export const HARBOUR = { cx: 110, cz: 1254, hl: 40, hw: 14, top: 2.2 };
export const WESTBAY = { name: 'West Bay', near: [-451, 1063] };   // ferry pier (filled in by buildWorld)
export const SKI = { base: { x: 636.7, z: -1275.7 }, top: { x: 253.7, z: -1597.1 } };
function buildRail() {
  const hw = roads[0], n0 = hw.n;
  let cx = 0, cz = 0; for (const [x, z] of hw.pts) { cx += x; cz += z; } cx /= n0; cz /= n0;
  const pts = [];
  for (let i = 0; i < n0; i += 2) {
    const [x, z] = hw.pts[i]; let nx = -hw.tz[i], nz = hw.tx[i];
    if ((x - cx) * nx + (z - cz) * nz < 0) { nx = -nx; nz = -nz; }   // outward
    pts.push([x + nx * 28, z + nz * 28, hw.h[i]]);
  }
  // smooth the offset line so inside corners don't kink
  for (let it = 0; it < 6; it++) for (let i = 0; i < pts.length; i++) { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length]; pts[i][0] = (a[0] + 2 * pts[i][0] + b[0]) / 4; pts[i][1] = (a[1] + 2 * pts[i][1] + b[1]) / 4; }
  const n = pts.length, tx = new Float32Array(n), tz = new Float32Array(n), sA = new Float32Array(n), h = new Float32Array(n), bridge = new Uint8Array(n), pin = new Float32Array(n).fill(NaN);
  let len = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    tx[i] = (b[0] - a[0]) / l; tz[i] = (b[1] - a[1]) / l;
    if (i) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); sA[i] = len;
    h[i] = Math.max(pts[i][2], rawHeight(pts[i][0], pts[i][1]) * 0.5 + pts[i][2] * 0.5);
  }
  len += Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]);
  // level crossings: pin the line to the height of any road crossing it
  const P2 = pts.map(([x, z]) => [x, z]);
  for (const r of roads) {
    if (r === hw) continue;
    for (let i = 0; i < n; i++) {
      const [ax, az] = P2[i], [bx, bz] = P2[(i + 1) % n];
      for (let k = 0; k < r.n - 1; k++) {
        const [cx2, cz2] = r.pts[k], [dx2, dz2] = r.pts[k + 1];
        if (Math.abs(cx2 - ax) > 30 || Math.abs(cz2 - az) > 30) continue;
        const t = segX(ax, az, bx, bz, cx2, cz2, dx2, dz2, 0);
        if (t !== null) { pin[i] = r.h[k]; pin[(i + 1) % n] = r.h[k + 1]; }
      }
    }
  }
  for (let i = 0; i < n; i++) if (!Number.isNaN(pin[i])) h[i] = pin[i];
  gradeLimit(h, P2, 0.03, bridge, pin);
  for (let it = 0; it < 3; it++) gradeLimit(h, P2, 0.03, bridge, pin);
  for (let i = 0; i < n; i++) if (rawHeight(P2[i][0], P2[i][1]) < h[i] - 6 || rawHeight(P2[i][0], P2[i][1]) < 0.5) bridge[i] = 1;
  const road = { name: 'Railway', type: 'rail', width: 4.4, closed: true, pts: P2, h, bridge, tx, tz, s: sA, length: len, n, hw: 2.2 };
  roads.push(road); RAIL.road = road;
  // stations near the junctions of the side roads
  for (const [name, x, z] of [['North Junction', 0, -520], ['Mesa Halt', 1320, -40], ['Port Ruby Road', 420, 860], ['Pinewood Halt', -1120, 620]]) {
    let bi = 0, bd = 1e18; for (let i = 0; i < n; i++) { const d = (P2[i][0] - x) ** 2 + (P2[i][1] - z) ** 2; if (d < bd) { bd = d; bi = i; } }
    // shift the platform 120 m along so it's clear of the crossing
    const sAt = (sA[bi] + 120) % len; let si = 0; while (si < n - 1 && sA[si + 1] < sAt) si++;
    RAIL.stations.push({ name, i: si, s: sA[si] });
  }
}

export function townAt(x, z, margin = 0) {
  for (const t of TOWNS) if ((x - t.x) ** 2 + (z - t.z) ** 2 < (t.r + margin) ** 2) return t;
  return null;
}

// Spatial hash of road segments
const RCELL = 32;
const roadHash = new Map();
function hashKey(cx, cz) { return cx * 73856093 ^ cz * 19349663; }
function indexRoads(list = roads) {
  list.forEach((r) => { const ri = roads.indexOf(r);
    const segs = r.closed ? r.n : r.n - 1;
    for (let i = 0; i < segs; i++) {
      const a = r.pts[i], b = r.pts[(i + 1) % r.n];
      const pad = r.hw + 2;
      const x0 = Math.floor((Math.min(a[0], b[0]) - pad) / RCELL), x1 = Math.floor((Math.max(a[0], b[0]) + pad) / RCELL);
      const z0 = Math.floor((Math.min(a[1], b[1]) - pad) / RCELL), z1 = Math.floor((Math.max(a[1], b[1]) + pad) / RCELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const k = hashKey(cx, cz);
        let arr = roadHash.get(k);
        if (!arr) roadHash.set(k, arr = []);
        arr.push(ri, i);
      }
    }
  });
}

// Returns nearest road info at (x,z) if within the paved width (+margin), else null.
const _roadHit = { road: null, seg: 0, t: 0, dist: 0, h: 0, lateral: 0, bridge: false };
export function roadAt(x, z, margin = 0) {
  const arr = roadHash.get(hashKey(Math.floor(x / RCELL), Math.floor(z / RCELL)));
  if (!arr) return null;
  let best = 1e9, found = false;
  for (let k = 0; k < arr.length; k += 2) {
    const r = roads[arr[k]], i = arr[k + 1];
    const j = (i + 1) % r.n;
    const a = r.pts[i], b = r.pts[j];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
    const ex = x - (a[0] + dx * t), ez = z - (a[1] + dz * t);
    const d = Math.hypot(ex, ez);
    if (d < r.hw + margin && d < best) {
      best = d; found = true;
      _roadHit.road = r; _roadHit.seg = i; _roadHit.t = t; _roadHit.dist = d;
      _roadHit.h = r.h[i] + (r.h[j] - r.h[i]) * t;
      _roadHit.lateral = (ex * -dz + ez * dx) / Math.hypot(dx, dz); // + = left of travel? (sign used consistently)
      _roadHit.bridge = !!(r.bridge[i] && r.bridge[j]);
    }
  }
  return found ? _roadHit : null;
}

// is any road other than `exclude` within its half-width + margin of (x, z)?
export function roadNearExcept(x, z, margin, exclude) {
  const arr = roadHash.get(hashKey(Math.floor(x / RCELL), Math.floor(z / RCELL)));
  if (!arr) return false;
  for (let k = 0; k < arr.length; k += 2) {
    const r = roads[arr[k]]; if (r === exclude) continue;
    if (segDist(r, arr[k + 1], x, z) < r.hw + margin) return true;
  }
  return false;
}
// distance from (x, z) to road r's centreline (via the hash), and the road height there
export function roadDist(r, x, z, out) {
  const arr = roadHash.get(hashKey(Math.floor(x / RCELL), Math.floor(z / RCELL)));
  let best = Infinity;
  if (arr) for (let k = 0; k < arr.length; k += 2) if (roads[arr[k]] === r) {
    const i = arr[k + 1], d = segDist(r, i, x, z);
    if (d < best) { best = d; if (out) { const j = (i + 1) % r.n; out.h = r.h[i] + (r.h[j] - r.h[i]) * _segT; } }
  }
  return best;
}
let _segT = 0;
function segDist(r, i, x, z) {
  const j = (i + 1) % r.n, a = r.pts[i], b = r.pts[j], dx = b[0] - a[0], dz = b[1] - a[1];
  const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1); _segT = t;
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}

// ---------- Heightfield ----------
export const heights = new Float32Array(NV * NV);
export const roadMask = new Uint8Array(NV * NV); // 0..255 shoulder influence

function buildHeightfield(progress) {
  for (let j = 0; j < NV; j++) {
    const z = -HALF + j * CELL;
    for (let i = 0; i < NV; i++) heights[j * NV + i] = rawHeight(-HALF + i * CELL, z);
    if (progress && j % 64 === 0) progress(j / NV);
  }
}

function flattenRoads() {
  const bestD = new Float32Array(NV * NV).fill(1e9);
  const bestH = new Float32Array(NV * NV);
  const bestW = new Float32Array(NV * NV);
  const bestShoulder = new Float32Array(NV * NV);
  for (const r of roads) {
    const segs = r.closed ? r.n : r.n - 1;
    const shoulder = r.type === 'highway' ? 26 : 18;
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % r.n;
      if (r.bridge[i] && r.bridge[j]) continue;
      const a = r.pts[i], b = r.pts[j];
      const R = r.hw + 2 + shoulder;
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - R + HALF) / CELL));
      const i1 = Math.min(N, Math.ceil((Math.max(a[0], b[0]) + R + HALF) / CELL));
      const k0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - R + HALF) / CELL));
      const k1 = Math.min(N, Math.ceil((Math.max(a[1], b[1]) + R + HALF) / CELL));
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
      for (let kz = k0; kz <= k1; kz++) for (let kx = i0; kx <= i1; kx++) {
        const x = -HALF + kx * CELL, z = -HALF + kz * CELL;
        const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / L2, 0, 1);
        const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
        const idx = kz * NV + kx;
        if (d < bestD[idx]) { bestD[idx] = d; bestH[idx] = r.h[i] + (r.h[j] - r.h[i]) * t; bestW[idx] = r.hw + 2.5; bestShoulder[idx] = shoulder; }
      }
    }
  }
  for (let idx = 0; idx < NV * NV; idx++) {
    const d = bestD[idx];
    if (d > 1e8) continue;
    const w = bestW[idx], sh = bestShoulder[idx];
    const t = 1 - smoothstep(w, w + sh, d);
    if (t <= 0) continue;
    heights[idx] = lerp(heights[idx], bestH[idx] - 0.06, t);
    roadMask[idx] = Math.round(255 * (1 - smoothstep(w - 1, w + 4, d)));
  }
  // town plateaus (the streets and through roads already sit at the town's level)
  for (const tn of TOWNS) {
    const R = tn.r + 60;
    const i0 = Math.max(0, Math.floor((tn.x - R + HALF) / CELL)), i1 = Math.min(N, Math.ceil((tn.x + R + HALF) / CELL));
    const k0 = Math.max(0, Math.floor((tn.z - R + HALF) / CELL)), k1 = Math.min(N, Math.ceil((tn.z + R + HALF) / CELL));
    for (let kz = k0; kz <= k1; kz++) for (let kx = i0; kx <= i1; kx++) {
      const x = -HALF + kx * CELL, z = -HALF + kz * CELL, d = Math.hypot(x - tn.x, z - tn.z);
      const w = 1 - smoothstep(tn.r * 0.92, tn.r + 60, d);
      if (w > 0 && !(d > 0 && roadMask[kz * NV + kx] > 0)) { const idx = kz * NV + kx; heights[idx] = lerp(heights[idx], tn.h - 0.1, w); }
    }
  }
}

function flattenAirport() {
  const f = AIRPORT.foot, M = 70;
  const i0 = Math.max(0, Math.floor((f.x0 - M + HALF) / CELL)), i1 = Math.min(N, Math.ceil((f.x1 + M + HALF) / CELL));
  const k0 = Math.max(0, Math.floor((f.z0 - M + HALF) / CELL)), k1 = Math.min(N, Math.ceil((f.z1 + M + HALF) / CELL));
  for (let kz = k0; kz <= k1; kz++) for (let kx = i0; kx <= i1; kx++) {
    const x = -HALF + kx * CELL, z = -HALF + kz * CELL;
    const d = Math.hypot(Math.max(f.x0 - x, 0, x - f.x1), Math.max(f.z0 - z, 0, z - f.z1));
    const w = 1 - smoothstep(0, M, d);
    if (w > 0 && !(d > 0 && roadMask[kz * NV + kx] > 0)) { const idx = kz * NV + kx; heights[idx] = lerp(heights[idx], AIRPORT.h, w); if (d === 0) roadMask[idx] = 0; }
  }
}

// Terrain height matching the rendered triangulation exactly.
export function terrainHeight(x, z) {
  let fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
  if (fx < 0 || fz < 0 || fx >= N || fz >= N) return -30;
  const i = Math.floor(fx), j = Math.floor(fz);
  fx -= i; fz -= j;
  const a = heights[j * NV + i], b = heights[j * NV + i + 1], c = heights[(j + 1) * NV + i], d = heights[(j + 1) * NV + i + 1];
  if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
  return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}

// Building roofs you can land on: oriented rectangles with a top height, registered by towns.js
const roofHash = new Map();
export function addRoof(cx, cz, ux, uz, w, d, top) {
  const r = { cx, cz, ux, uz, hw: w / 2, hd: d / 2, top }, R = Math.hypot(w, d) / 2;
  for (let i = Math.floor((cx - R) / PCELL); i <= Math.floor((cx + R) / PCELL); i++)
    for (let j = Math.floor((cz - R) / PCELL); j <= Math.floor((cz + R) / PCELL); j++) {
      const k = hashKey(i, j); let a = roofHash.get(k); if (!a) roofHash.set(k, a = []); a.push(r);
    }
}
// the roof under (x, z) if something at height y is on or above it (within `reach` below the top), else -Infinity
export function roofAt(x, z, y, reach = 1.2) {
  const a = roofHash.get(hashKey(Math.floor(x / PCELL), Math.floor(z / PCELL)));
  if (!a) return -Infinity;
  let best = -Infinity;
  for (const r of a) {
    if (y < r.top - reach || r.top <= best) continue;
    const dx = x - r.cx, dz = z - r.cz;
    if (Math.abs(dx * r.ux + dz * r.uz) <= r.hw && Math.abs(-dx * r.uz + dz * r.ux) <= r.hd) best = r.top;
  }
  return best;
}
// ground height for something at height y: the terrain/road, or a roof it is standing on
export function groundHeightAt(x, z, y) {
  const g = groundHeight(x, z), r = roofAt(x, z, y), d = deckAt(x, z, y);
  return Math.max(g, r, d);
}
// Bridge decks that pass over other roads (the raceway's infield bridge): a polyline with its own heights. A deck
// only counts as ground for something already near its level, so cars on the track underneath ignore it.
export const DECKS = [];   // { pts: [[x, z, h], ...], hw }
export function deckAt(x, z, y) {
  if (y == null) return -Infinity;
  let best = -Infinity;
  for (const D of DECKS) {
    if (x < D.box[0] || x > D.box[1] || z < D.box[2] || z > D.box[3]) continue;
    for (let i = 0; i < D.pts.length - 1; i++) {
      const [ax, az, ah] = D.pts[i], [bx, bz, bh] = D.pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
      const t = ((x - ax) * dx + (z - az) * dz) / L2;
      if (t < 0 || t > 1) continue;   // only the segment you're actually over
      const ex = x - ax - dx * t, ez = z - az - dz * t;
      if (ex * ex + ez * ez > D.hw * D.hw) continue;
      const h = ah + (bh - ah) * t;
      if (y > h - 1.4 && y < h + 3 && h > best) best = h;
    }
  }
  return best;
}

// Driveable surface height: road deck / bridges / terrain.
export function groundHeight(x, z) {
  const th = terrainHeight(x, z);
  const pv = pavedAt(x, z);
  if (pv) return pv.top;
  const r = roadAt(x, z, 0.3);
  if (r) {
    const rh = r.h + 0.03;
    if (r.bridge) return Math.max(th, rh);
    return rh;
  }
  return th;
}

export function groundInfo(x, z, out, y) {
  const e = 0.6, gh = y == null ? groundHeight : (a, b) => groundHeightAt(a, b, y);
  const h = gh(x, z);
  const hx = gh(x + e, z) - gh(x - e, z);
  const hz = gh(x, z + e) - gh(x, z - e);
  if (y != null && h > groundHeight(x, z) + 0.5) { const l = Math.hypot(hx, 2 * e, hz); out.h = h; out.nx = -hx / l; out.ny = 2 * e / l; out.nz = -hz / l; out.onRoad = true; out.surface = 'asphalt'; return out; }
  let nx = -hx, ny = 2 * e, nz = -hz;
  const l = Math.hypot(nx, ny, nz);
  out.h = h; out.nx = nx / l; out.ny = ny / l; out.nz = nz / l;
  const r = roadAt(x, z, 0.3);
  out.onRoad = !!r || !!pavedAt(x, z);
  out.surface = r && r.road.type === 'gravel' ? 'gravel' : out.onRoad ? 'asphalt' : surfaceAt(x, z, h);
  return out;
}

export function surfaceAt(x, z, h) {
  if (pavedAt(x, z)) return 'asphalt';
  if (h < 2.5) return 'sand';
  const b = biomeWeights(x, z);
  if (b.desert > 0.5) return 'sand';
  if (b.mountain > 0.5 && h > 380) return 'snow';
  if (b.mountain > 0.5) return 'rock';
  return 'grass';
}

// Surface grip & rolling resistance
export const SURFACES = {
  asphalt: { mu: 1.0, fall: 0.2, wetLoss: 0.3, roll: 0.012, color: '#444' },
  grass: { mu: 0.68, fall: 0.0, wetLoss: 0.25, roll: 0.05, color: '#5a7' },
  sand: { mu: 0.55, fall: 0.0, wetLoss: 0.0, roll: 0.11, color: '#db9' },
  rock: { mu: 0.8, fall: 0.2, wetLoss: 0.3, roll: 0.03, color: '#888' },
  snow: { mu: 0.32, fall: 0.1, wetLoss: 0.1, roll: 0.04, color: '#eee' },
  gravel: { mu: 0.74, fall: 0.06, wetLoss: 0.15, roll: 0.028, color: '#9a8a70' },
};

// ---------- Waves (shared by physics and the water shader) ----------
export const WAVES = [
  // dirX, dirZ, wavelength, amplitude, speed
  [0.8, 0.6, 38, 0.22, 7.7],
  [-0.4, 0.9, 21, 0.13, 5.7],
  [0.95, -0.3, 11, 0.06, 4.1],
];
export function waveHeight(x, z, t, calm = 1) {
  let h = 0;
  for (const [dx, dz, L, A, c] of WAVES) {
    const k = 2 * Math.PI / L;
    h += A * Math.sin(k * (dx * x + dz * z) - k * c * t);
  }
  return h * calm;
}

// ---------- Build ----------
export async function buildWorld(progress = () => {}) {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  progress('Shaping terrain', 0.05); await tick();
  buildHeightfield();
  progress('Surveying roads', 0.45); await tick();
  buildRoads();
  joinRoads();
  buildTowns();
  buildAirportRoad();
  buildTrack();
  buildRail();
  indexRoads();
  for (const p of AIRPORT.paved) addPaved({ cx: (p.x0 + p.x1) / 2, cz: (p.z0 + p.z1) / 2, ux: 0, uz: 1, hl: (p.z1 - p.z0) / 2, hw: (p.x1 - p.x0) / 2, h: AIRPORT.h, top: AIRPORT.h + 0.03, kind: 'airport', sub: p.kind });
  layoutTownDetails();
  findJoins();
  progress('Grading roads', 0.55); await tick();
  flattenRoads();
  flattenAirport();
  flattenPaved();
}

// Spawn on the highway near the central junction, facing east.
export function spawnPoint() {
  const r = roads[0];
  const i = 40;
  return { x: r.pts[i][0] - r.tz[i] * 3.5, z: r.pts[i][1] + r.tx[i] * 3.5, heading: Math.atan2(r.tx[i], r.tz[i]) };
}

// Nearest road point (for resets).
export function nearestRoadPoint(x, z) {
  let best = 1e18, res = null;
  for (const r of roads) for (let i = 0; i < r.n; i += 2) {
    if (r.type === 'rail' || r.bridge[i]) continue;   // never onto the railway or the edge of a bridge deck
    const d = (r.pts[i][0] - x) ** 2 + (r.pts[i][1] - z) ** 2;
    if (d < best) { best = d; res = { x: r.pts[i][0], z: r.pts[i][1], h: r.h[i], heading: Math.atan2(r.tx[i], r.tz[i]), road: r, i }; }
  }
  return res;
}

export { distToPolyline };
