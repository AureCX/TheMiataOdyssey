// Visual world: terrain meshes, roads, bridges, water, sky, vegetation, clouds, stars.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  HALF, CELL, N, NV, heights, roadMask, roads, biomeWeights, terrainHeight, roadAt, WAVES, LAKES, townAt, airportAt, reservedAt, pavedAt, ISLAND, ROAD_JOINS,
} from './world.js';
import { createNoise2D, mulberry32, smoothstep, clamp, lerp } from './noise.js';
import { applyTerrainSurfaces, applyRoadSurface } from './surfaces.js';
import { applySeason } from './seasons.js';

const nCol = createNoise2D(77);
const nCol2 = createNoise2D(78);
const lin = (c) => Math.pow(c, 2.2);

// ---------------------------------------------------------------- Terrain
const CHUNK = 128; // cells per chunk side

function terrainColor(x, z, h, ny, rm, out) {
  const b = biomeWeights(x, z);
  const v = nCol(x / 60, z / 60) * 0.5 + 0.5;
  const v2 = nCol2(x / 400, z / 400) * 0.5 + 0.5;
  // plains: patchwork of meadows and fields
  let r = lerp(0.36, 0.55, v2 * v2), g = lerp(0.50, 0.52, v2), bl = lerp(0.20, 0.26, v);
  r *= 0.9 + 0.2 * v; g *= 0.9 + 0.2 * v;
  // forest floor
  r = lerp(r, 0.27 + 0.06 * v, b.forest); g = lerp(g, 0.27 + 0.07 * v, b.forest); bl = lerp(bl, 0.14, b.forest);
  // desert sand / red rock strata
  if (b.desert > 0) {
    const strata = 0.5 + 0.5 * Math.sin(h * 0.9 + nCol(x / 200, z / 200) * 2);
    const rock = smoothstep(25, 40, h);
    const dr = lerp(0.86, lerp(0.62, 0.74, strata), rock), dg = lerp(0.71, lerp(0.36, 0.46, strata), rock), db = lerp(0.49, lerp(0.24, 0.31, strata), rock);
    r = lerp(r, dr * (0.95 + 0.1 * v), b.desert); g = lerp(g, dg * (0.95 + 0.1 * v), b.desert); bl = lerp(bl, db, b.desert);
  }
  // mountains: alpine grass -> rock -> snow
  if (b.mountain > 0) {
    const rockiness = smoothstep(120, 260, h + 60 * v);
    let mr = lerp(0.30, 0.47, rockiness), mg = lerp(0.40, 0.44, rockiness), mb = lerp(0.20, 0.42, rockiness);
    r = lerp(r, mr, b.mountain); g = lerp(g, mg, b.mountain); bl = lerp(bl, mb, b.mountain);
  }
  // steep slopes -> rock
  const steep = smoothstep(0.86, 0.68, ny);
  const rockCol = b.desert > 0.5 ? [0.6, 0.38, 0.27] : [0.42, 0.40, 0.38];
  r = lerp(r, rockCol[0] * (0.85 + 0.3 * v), steep); g = lerp(g, rockCol[1] * (0.85 + 0.3 * v), steep); bl = lerp(bl, rockCol[2] * (0.85 + 0.3 * v), steep);
  // snow
  const snow = smoothstep(340, 400, h + 50 * nCol2(x / 120, z / 120)) * smoothstep(0.62, 0.8, ny) * b.mountain;
  r = lerp(r, 0.94, snow); g = lerp(g, 0.95, snow); bl = lerp(bl, 0.98, snow);
  // beaches & underwater
  const beach = smoothstep(3.2, 1.2, h);
  r = lerp(r, 0.84, beach); g = lerp(g, 0.77, beach); bl = lerp(bl, 0.6, beach);
  if (h < 0) { const w = smoothstep(0, -8, h); r = lerp(r, 0.5, w); g = lerp(g, 0.5, w); bl = lerp(bl, 0.42, w); }
  // road shoulder gravel
  const s = rm / 255;
  r = lerp(r, 0.46, s); g = lerp(g, 0.43, s); bl = lerp(bl, 0.39, s);
  out[0] = lin(r); out[1] = lin(g); out[2] = lin(bl);
}

function addWorldNoise(material, strength = 0.22) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ float n = vnoise(vWPos.xz*0.9)*0.5 + vnoise(vWPos.xz*0.21)*0.35 + vnoise(vWPos.xz*3.7)*0.15;
  diffuseColor.rgb *= 1.0 - ${strength.toFixed(3)} + ${(strength * 2).toFixed(3)} * n; }`);
  };
}

// Surface layer weights (grass, forest, sand, rock, snow, gravel), following the same rules as terrainColor.
function terrainWeights(x, z, h, ny, rm, w) {
  const b = biomeWeights(x, z);
  w.fill(0); w[0] = 1;
  const mixTo = (layer, t) => { if (t <= 0) return; for (let i = 0; i < 6; i++) w[i] *= 1 - t; w[layer] += t; };
  mixTo(1, b.forest);
  if (b.desert > 0) { const rock = smoothstep(25, 40, h); mixTo(2, b.desert * (1 - rock)); mixTo(3, b.desert * rock); }
  if (b.mountain > 0) mixTo(3, b.mountain * smoothstep(120, 260, h + 60 * (nCol(x / 60, z / 60) * 0.5 + 0.5)));
  mixTo(3, smoothstep(0.86, 0.68, ny));
  mixTo(4, smoothstep(340, 400, h + 50 * nCol2(x / 120, z / 120)) * smoothstep(0.62, 0.8, ny) * b.mountain);
  mixTo(2, smoothstep(3.2, 1.2, h));
  mixTo(5, rm / 255);
  return w;
}

export function buildTerrain(scene, surf) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, envMapIntensity: 0.3 });
  if (surf) applyTerrainSurfaces(mat, surf); else addWorldNoise(mat, 0.2);
  applySeason(mat, 'terrain');
  const wts = new Float32Array(6);
  const col = [0, 0, 0];
  const group = new THREE.Group();
  const chunks = N / CHUNK;
  for (let cz = 0; cz < chunks; cz++) for (let cx = 0; cx < chunks; cx++) {
    const vn = CHUNK + 1, NS = 4 * vn;   // grid vertices + skirt vertices (a copy of the border, dropped 3 m)
    const pos = new Float32Array((vn * vn + NS) * 3), nor = new Float32Array((vn * vn + NS) * 3), colr = new Float32Array((vn * vn + NS) * 3);
    const wA = new Float32Array((vn * vn + NS) * 3), wB = new Float32Array((vn * vn + NS) * 3);
    for (let j = 0; j < vn; j++) for (let i = 0; i < vn; i++) {
      const gi = cx * CHUNK + i, gj = cz * CHUNK + j;
      const idx = gj * NV + gi;
      const x = -HALF + gi * CELL, z = -HALF + gj * CELL, h = heights[idx];
      const hl = heights[gj * NV + Math.max(0, gi - 1)], hr = heights[gj * NV + Math.min(N, gi + 1)];
      const hd = heights[Math.max(0, gj - 1) * NV + gi], hu = heights[Math.min(N, gj + 1) * NV + gi];
      let nx = hl - hr, ny = 2 * CELL, nz = hd - hu; const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const k = (j * vn + i) * 3;
      pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
      nor[k] = nx; nor[k + 1] = ny; nor[k + 2] = nz;
      terrainColor(x, z, h, ny, roadMask[idx], col);
      colr[k] = col[0]; colr[k + 1] = col[1]; colr[k + 2] = col[2];
      terrainWeights(x, z, h, ny, roadMask[idx], wts);
      wA[k] = wts[0]; wA[k + 1] = wts[1]; wA[k + 2] = wts[2]; wB[k] = wts[3]; wB[k + 1] = wts[4]; wB[k + 2] = wts[5];
    }
    const index = new Uint32Array(CHUNK * CHUNK * 6);
    let p = 0;
    for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
      const a = j * vn + i, b = a + 1, c = a + vn, d = c + 1;
      // diagonal b-c, matching terrainHeight()
      index[p++] = a; index[p++] = c; index[p++] = b;
      index[p++] = b; index[p++] = c; index[p++] = d;
    }
    // skirts: the four border rows copied 3 m lower, so coarser neighbours never show a crack
    const border = [];
    for (let i = 0; i < vn; i++) border.push(i, (vn - 1) * vn + i, i * vn, i * vn + vn - 1);
    border.forEach((b, k) => { const t = vn * vn + k; for (const A of [pos, nor, colr, wA, wB]) { A[t * 3] = A[b * 3]; A[t * 3 + 1] = A[b * 3 + 1]; A[t * 3 + 2] = A[b * 3 + 2]; } pos[t * 3 + 1] -= 3; });
    const attrs = { position: new THREE.BufferAttribute(pos, 3), normal: new THREE.BufferAttribute(nor, 3), color: new THREE.BufferAttribute(colr, 3), wA: new THREE.BufferAttribute(wA, 3), wB: new THREE.BufferAttribute(wB, 3) };
    const mk = (idx) => { const g = new THREE.BufferGeometry(); for (const [k, a] of Object.entries(attrs)) g.setAttribute(k, a); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere(); return g; };
    // coarser levels: every 2nd / 4th vertex, plus the skirts
    const coarse = (st) => {
      const out = [];
      for (let j = 0; j < CHUNK; j += st) for (let i = 0; i < CHUNK; i += st) { const a = j * vn + i, b = a + st, c = a + st * vn, d = c + st; out.push(a, c, b, b, c, d); }
      const sk = (row, k0) => { for (let i = 0; i < vn - st; i += st) { const a = row(i), b = row(i + st), a2 = vn * vn + k0(i), b2 = vn * vn + k0(i + st); out.push(a, a2, b, b, a2, b2, a, b, a2, b, b2, a2); } };   // both windings
      sk((i) => i, (i) => i * 4); sk((i) => (vn - 1) * vn + i, (i) => i * 4 + 1); sk((i) => i * vn, (i) => i * 4 + 2); sk((i) => i * vn + vn - 1, (i) => i * 4 + 3);
      return new Uint32Array(out);
    };
    const levels = [mk(index), mk(coarse(2)), mk(coarse(4))];
    const mesh = new THREE.Mesh(levels[0], mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.userData.levels = levels; mesh.userData.c = [-HALF + (cx + 0.5) * CHUNK * CELL, -HALF + (cz + 0.5) * CHUNK * CELL];
    group.add(mesh);
  }
  // Seabed skirt beyond the world edge
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x5b5a4c, roughness: 1 }));
  skirt.position.y = -32;
  group.add(skirt);
  scene.add(group);
  // level of detail by distance from the camera (shadows only from the chunks close by)
  group.userData.lod = (cam) => {
    for (const m of group.children) {
      const L = m.userData.levels; if (!L) continue;
      const d = Math.hypot(m.userData.c[0] - cam.x, m.userData.c[1] - cam.z) - CHUNK * CELL * 0.71, lv = d < 450 ? 0 : d < 1300 ? 1 : 2;
      if (m.geometry !== L[lv]) m.geometry = L[lv];
      m.castShadow = d < 300;
    }
  };
  return group;
}

// ---------------------------------------------------------------- Roads
function asphaltTexture(type, renderer) {
  const W = 256, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#3b3b3d'; g.fillRect(0, 0, W, H);
  const rnd = mulberry32(type === 'highway' ? 11 : 12);
  for (let i = 0; i < 9000; i++) {
    const v = 40 + rnd() * 50 | 0;
    g.fillStyle = `rgba(${v},${v},${v + 2},${0.35 + rnd() * 0.4})`;
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  // tyre wear
  g.fillStyle = 'rgba(20,20,22,0.18)';
  const lanes = type === 'highway' ? 4 : 2;
  for (let l = 0; l < (type === 'plain' ? 0 : lanes); l++) {
    const cx = (l + 0.5) / lanes * W;
    g.fillRect(cx - W / lanes * 0.32, 0, W / lanes * 0.13, H);
    g.fillRect(cx + W / lanes * 0.2, 0, W / lanes * 0.13, H);
  }
  g.fillStyle = '#e8e6df';
  const edge = 5;
  if (type !== 'plain') { g.fillRect(6, 0, edge, H); g.fillRect(W - 6 - edge, 0, edge, H); }
  if (type === 'highway') {
    g.fillStyle = '#e2b53a';
    g.fillRect(W / 2 - 7, 0, 4, H); g.fillRect(W / 2 + 3, 0, 4, H);
    g.fillStyle = '#e8e6df';
    for (const fx of [0.25, 0.75]) g.fillRect(W * fx - 2, 0, 4, H * 0.4);
  } else if (type !== 'track' && type !== 'plain') {
    g.fillRect(W / 2 - 2, 0, 4, H * 0.4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roadDistTo(o, x, z) { let b = 1e9; for (let i = 0; i < o.n; i += 2) { const d = Math.hypot(o.pts[i][0] - x, o.pts[i][1] - z); if (d < b) b = d; } return b; }
// loose gravel: stones on packed earth, two darker wheel tracks worn in
function gravelTexture(renderer) {
  const W = 256, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), rnd = mulberry32(31);
  g.fillStyle = '#8b7c64'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 14000; i++) { const v = 95 + rnd() * 80 | 0, r = 0.6 + rnd() * 1.8; g.fillStyle = `rgba(${v + 8},${v},${v - 14},${0.35 + rnd() * 0.5})`; g.fillRect(rnd() * W, rnd() * H, r, r); }
  for (const fx of [0.3, 0.7]) { const gr = g.createLinearGradient(W * (fx - 0.1), 0, W * (fx + 0.1), 0); gr.addColorStop(0, 'rgba(60,50,38,0)'); gr.addColorStop(0.5, 'rgba(60,50,38,0.35)'); gr.addColorStop(1, 'rgba(60,50,38,0)'); g.fillStyle = gr; g.fillRect(W * (fx - 0.1), 0, W * 0.2, H); }
  for (const ex of [0, W - 18]) { g.fillStyle = 'rgba(110,120,70,0.45)'; g.fillRect(ex, 0, 18, H); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildRoads(scene, renderer, surf) {
  const group = new THREE.Group();
  const mats = {
    highway: new THREE.MeshStandardMaterial({ map: asphaltTexture('highway', renderer), roughness: 0.88, envMapIntensity: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    road: new THREE.MeshStandardMaterial({ map: asphaltTexture('road', renderer), roughness: 0.9, envMapIntensity: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
  };
  mats.rail = new THREE.MeshStandardMaterial({ color: 0x6b645a, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  mats.track = new THREE.MeshStandardMaterial({ map: asphaltTexture('track', renderer), roughness: 0.85, envMapIntensity: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  mats.highway.userData.road = true; mats.road.userData.road = true; mats.track.userData.road = true;
  if (surf) { applyRoadSurface(mats.highway, surf); mats.road.onBeforeCompile = mats.highway.onBeforeCompile; mats.road.customProgramCacheKey = mats.highway.customProgramCacheKey; }
  if (surf) { mats.track.onBeforeCompile = mats.highway.onBeforeCompile; mats.track.customProgramCacheKey = mats.highway.customProgramCacheKey; }
  mats.gravel = new THREE.MeshStandardMaterial({ map: gravelTexture(renderer), roughness: 0.97, envMapIntensity: 0.2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  for (const k of ['highway', 'road', 'track', 'gravel']) applySeason(mats[k], 'road');
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9a978f, roughness: 0.85 });
  const bridgeGeos = [];
  const pillar = new THREE.BoxGeometry(1.6, 1, 1.6);
  const pillarMats = [];

  // ---- junction mouths: where a road ends on another, its ribbon stops short of the main road and a plain asphalt
  // mouth with curved corner flares fills the gap (covering the main road's edge line there), with a give-way line
  const trim = new Map();   // road -> { k0, k1 }
  const mouthP = [], mouthUV = [], mouthI = [], giveP = [], giveUV = [], giveI = [];
  for (const J of ROAD_JOINS) {
    const r = J.branch, o = J.through, ti = J.ti, end = J.end;
    if (r.name === o.name) continue;
    const nX = -o.tz[ti] * J.side, nZ = o.tx[ti] * J.side;          // through road normal, toward the branch
    const ox = o.pts[ti][0], oz = o.pts[ti][1], dLine = (x, z) => (x - ox) * nX + (z - oz) * nZ;   // signed distance from the through centreline
    // approach angle: |cos| of the branch against the through road (near 1 = a shallow merge, no flares)
    const ke = end === 0 ? Math.min(r.n - 1, 6) : Math.max(0, r.n - 7), tbe = [r.pts[end][0] - r.pts[ke][0], r.pts[end][1] - r.pts[ke][1]], tl = Math.hypot(...tbe) || 1;
    const cosA = (tbe[0] * o.tx[ti] + tbe[1] * o.tz[ti]) / tl, shallow = Math.abs(cosA) > 0.77;
    const R = shallow ? 4 : r.type === 'gravel' ? 2.5 : Math.min(5, 2.5 + r.hw * 0.4);   // shallow merges get a long straight taper
    // the ribbon stops where its centreline is a fillet (plus a little) clear of the through road's edge
    const step = end === 0 ? 1 : -1, perp = (k) => dLine(r.pts[k][0], r.pts[k][1]) - o.hw;
    let kt = end; while (kt + step >= 0 && kt + step < r.n && perp(kt) < R + 1.2 && Math.abs(kt - end) < 60) kt += step;
    if (perp(kt) < R + 1.2) continue;
    const tr = trim.get(r) || { k0: 0, k1: r.n }; if (end === 0) tr.k0 = Math.max(tr.k0, kt); else tr.k1 = Math.min(tr.k1, kt + 1); trim.set(r, tr);
    // sections every ~0.5 m along the branch from kt toward the through road, until the centre is 0.5 m inside its edge
    const hO = o.h[ti] + 0.035, hB = r.h[kt] + 0.035, D = Math.max(0.5, perp(kt));
    const yAt = (x, z) => hO + (hB - hO) * Math.max(0, Math.min(1, (dLine(x, z) - o.hw) / D));
    const secs = [];
    for (let k = kt; k !== end; k -= step) {
      const k2 = k - step, [x0, z0] = r.pts[k], [x1, z1] = r.pts[k2], L = Math.hypot(x1 - x0, z1 - z0), m = Math.max(1, Math.ceil(L / 0.5));
      for (let q = 0; q < m; q++) { const t = q / m, tx = r.tx[k] + (r.tx[k2] - r.tx[k]) * t, tz = r.tz[k] + (r.tz[k2] - r.tz[k]) * t, tn = Math.hypot(tx, tz) || 1; secs.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, -tz / tn * -step, tx / tn * -step]); }
    }
    secs.push([r.pts[end][0], r.pts[end][1], -r.tz[end] * -step, r.tx[end] * -step]);
    const rows = [];
    for (const [cx, cz, nbx, nbz] of secs) {
      const e = dLine(cx, cz) - o.hw;
      if (e < -0.5) break;
      const fl = e >= R ? 0 : shallow ? (R - Math.max(0, e)) * 0.9 : R - Math.sqrt(Math.max(0, R * R - (R - Math.max(0, e)) ** 2));   // quarter-circle fillet (or a taper)
      const row = [];
      for (const sd of [-1, 1]) {
        // tight fillet on the acute corner, a wider one on the obtuse corner
        const along = Math.sign((nbx * sd) * o.tx[ti] + (nbz * sd) * o.tz[ti]), c = cosA * -step * (end === 0 ? -1 : 1);
        const acute = along * c < 0, k = acute ? Math.max(0.15, 1 - Math.abs(cosA) * 1.4) : 1;
        let w = r.hw + fl * k, px = cx + nbx * sd * w, pz = cz + nbz * sd * w;
        const dp = dLine(px, pz) - o.hw;
        if (dp < -0.5) { const dc = e; const f = (dc + 0.5) / Math.max(1e-3, dc - dp); px = cx + (px - cx) * f; pz = cz + (pz - cz) * f; }   // clip at the edge line
        row.push([px, pz]);
      }
      rows.push(row);
    }
    if (rows.length < 3) continue;
    const base = mouthP.length / 3;
    for (const row of rows) for (const [x, z] of row) { mouthP.push(x, yAt(x, z), z); mouthUV.push(x / 4, z / 4); }
    for (let k = 0; k < rows.length - 1; k++) {
      const a0 = base + k * 2, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3;
      const [A, B, C] = [rows[k][0], rows[k][1], rows[k + 1][0]], up = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      if (up < 0) mouthI.push(a0, b0, a1, b0, b1, a1); else mouthI.push(a0, a1, b0, b0, a1, b1);
    }
    // give-way line across the lane heading into the junction (right-hand traffic) where the flare begins
    { let si = 0; for (let k = 0; k < secs.length; k++) { if (dLine(secs[k][0], secs[k][1]) - o.hw <= R) { si = k; break; } }
      const [cx, cz, nbx, nbz] = secs[si], tbx = nbz, tbz = -nbx, y = yAt(cx, cz) + 0.004, gb = giveP.length / 3, a0 = 0.15, a1 = r.hw - 0.35, w = 0.32;
      for (const [aa, ww] of [[a0, -w / 2], [a1, -w / 2], [a1, w / 2], [a0, w / 2]]) giveP.push(cx + nbx * aa + tbx * ww, y, cz + nbz * aa + tbz * ww);
      giveUV.push(0, 0, (a1 - a0) / 0.9, 0, (a1 - a0) / 0.9, 1, 0, 1);
      const P0 = [giveP[gb * 3], giveP[gb * 3 + 2]], P1 = [giveP[gb * 3 + 3], giveP[gb * 3 + 5]], P2 = [giveP[gb * 3 + 6], giveP[gb * 3 + 8]], up = (P1[0] - P0[0]) * (P2[1] - P0[1]) - (P1[1] - P0[1]) * (P2[0] - P0[0]);
      if (up < 0) giveI.push(gb, gb + 1, gb + 2, gb, gb + 2, gb + 3); else giveI.push(gb, gb + 2, gb + 1, gb, gb + 3, gb + 2); }
  }
  for (const r of roads) {
    const n = r.n, cnt = r.closed ? n + 1 : n;
    // gravel stages start and end at the edge of the road they join, not on top of it
    let k0 = 0, k1 = cnt;
    { const tr = trim.get(r); if (tr) { k0 = Math.max(k0, tr.k0); k1 = Math.min(k1, tr.k1); } }
    if (r.type === 'gravel') { const off = (i) => roads.some((o) => o !== r && o.type !== 'gravel' && o.type !== 'rail' && roadDistTo(o, r.pts[i][0], r.pts[i][1]) < o.hw + 0.3); while (k0 < n - 2 && off(k0)) k0++; while (k1 > k0 + 2 && off(k1 - 1)) k1--; }
    const pos = new Float32Array(cnt * 2 * 3), uv = new Float32Array(cnt * 2 * 2);
    const repeat = r.type === 'highway' ? 12 : r.type === 'gravel' ? 6 : 10;
    for (let k = 0; k < cnt; k++) {
      const i = k % n;
      const [x, z] = r.pts[i], h = r.h[i] + 0.03;
      const rx = -r.tz[i], rz = r.tx[i]; // right vector
      const v = (k === n ? r.length : r.s[i]) / repeat;
      pos.set([x - rx * r.hw, h, z - rz * r.hw, x + rx * r.hw, h, z + rz * r.hw], k * 6);
      uv.set([0, v, 1, v], k * 4);
    }
    const idx = [];
    for (let k = k0; k < k1 - 1; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mats[r.type] || mats.road);
    mesh.receiveShadow = true;
    group.add(mesh);

    // Bridges: slab underside, barriers, pillars
    let k = 0;
    while (k < n) {
      if (!r.bridge[k]) { k++; continue; }
      let e = k; while (e < n - 1 && r.bridge[e + 1]) e++;
      const P = [], U = [], I = [];
      const add = (x, y, z) => { P.push(x, y, z); return P.length / 3 - 1; };
      for (let i = k; i <= e; i++) {
        const [x, z] = r.pts[i], h = r.h[i];
        const rx = -r.tz[i], rz = r.tx[i], w = r.hw + 0.6;
        // per-sample ring: outer-left-top, barrier top L, inner L, ... we build 8-vertex cross-section
        const sec = [
          [-w, h - 1.2], [-w, h + 0.95], [-w + 0.45, h + 0.95], [-w + 0.6, h + 0.02],
          [w - 0.6, h + 0.02], [w - 0.45, h + 0.95], [w, h + 0.95], [w, h - 1.2],
        ];
        for (const [o, y] of sec) add(x + rx * o, y, z + rz * o);
        if (i > k && (i - k) % 8 === 0) pillarMats.push([x, z, h - 1.2, Math.atan2(r.tx[i], r.tz[i]), r.hw]);
      }
      const S = 8;
      for (let i = 0; i < e - k; i++) for (let s = 0; s < S; s++) {
        if (s === 3) continue; // deck top is the road mesh
        const a = i * S + s, b = i * S + (s + 1) % S, c = a + S, d = b + S;
        I.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setIndex(I); g.computeVertexNormals();
      bridgeGeos.push(g);
      k = e + 1;
    }
  }
  if (mouthI.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(mouthP, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(mouthUV, 2)); g.setIndex(mouthI); g.computeVertexNormals();
    const tex = asphaltTexture('plain', renderer); tex.wrapS = THREE.RepeatWrapping;
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, envMapIntensity: 0.4, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
    m.userData.road = true; applySeason(m, 'road');
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; group.add(mesh);
    const gc = document.createElement('canvas'); gc.width = 64; gc.height = 16; const gx = gc.getContext('2d'); gx.fillStyle = '#e8e6df'; gx.fillRect(0, 0, 38, 16);
    const gt = new THREE.CanvasTexture(gc); gt.wrapS = THREE.RepeatWrapping; gt.colorSpace = THREE.SRGBColorSpace;
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(giveP, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(giveUV, 2)); gg.setIndex(giveI); gg.computeVertexNormals();
    group.add(new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ map: gt, transparent: true, alphaTest: 0.5, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 })));
  }
  if (bridgeGeos.length) {
    const m = new THREE.Mesh(mergeGeometries(bridgeGeos), concrete);
    m.material.side = THREE.DoubleSide;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  if (pillarMats.length) {
    const im = new THREE.InstancedMesh(pillar, concrete, pillarMats.length * 2);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let c = 0;
    for (const [x, z, top, yaw, hw] of pillarMats) {
      const bottom = Math.min(terrainHeight(x, z), -1) - 2;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      for (const side of [-1, 1]) {
        const off = side * (hw - 1.5);
        p.set(x + Math.cos(yaw) * off, (top + bottom) / 2, z - Math.sin(yaw) * off);
        s.set(1, top - bottom, 1);
        M.compose(p, q, s); im.setMatrixAt(c++, M);
      }
    }
    im.castShadow = true;
    group.add(im);
  }
  scene.add(group);
  return group;
}

// ---------------------------------------------------------------- Water
export function buildWater(scene) {
  // Depth / calmness lookup texture
  const S = 512;
  const data = new Uint8Array(S * S * 4);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = -HALF + (i + 0.5) / S * HALF * 2, z = -HALF + (j + 0.5) / S * HALF * 2;
    const h = terrainHeight(x, z);
    const sea = biomeWeights(x, z).sea;
    const k = (j * S + i) * 4;
    data[k] = clamp(-h / 30, 0, 1) * 255;
    data[k + 1] = (0.25 + 0.75 * sea) * 255;
    data[k + 2] = 0; data[k + 3] = 255;
  }
  const depthTex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  depthTex.magFilter = THREE.LinearFilter; depthTex.minFilter = THREE.LinearFilter;
  depthTex.needsUpdate = true;

  const wv = WAVES.map(([dx, dz, L, A, c]) => new THREE.Vector4(dx, dz, 2 * Math.PI / L, A)).slice(0, 3);
  const speeds = new THREE.Vector3(...WAVES.map((w) => w[4]));
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uHorizon: { value: new THREE.Color(0.7, 0.8, 0.9) },
    uZenith: { value: new THREE.Color(0.2, 0.4, 0.8) },
    uDepth: { value: null },
    uHalf: { value: HALF },
    uWaves: { value: wv },
    uSpeeds: { value: speeds },
    uEdgeFade: { value: 1 },
    uCenter: { value: new THREE.Vector2() },
    uRadius: { value: 1e9 },
    uNight: { value: 0 },
  }]);
  uniforms.uDepth.value = depthTex;

  const vertexShader = /* glsl */`
    uniform float uTime; uniform vec4 uWaves[3]; uniform vec3 uSpeeds; uniform sampler2D uDepth; uniform float uHalf;
    uniform vec2 uCenter; uniform float uRadius; uniform float uEdgeFade;
    varying vec3 vWPos; varying vec2 vGrad; varying float vDepth; varying float vCalm;
    #include <fog_pars_vertex>
    void main(){
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vec2 tuv = (wp.xz + uHalf) / (2.0*uHalf);
      vec4 d = texture2D(uDepth, clamp(tuv, 0.0, 1.0));
      bool inside = tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0;
      vDepth = inside ? d.r * 30.0 : 30.0;
      vCalm = inside ? d.g : 1.0;
      float fade = uEdgeFade * (1.0 - smoothstep(uRadius*0.7, uRadius, length(wp.xz - uCenter)));
      float h = 0.0; vec2 g = vec2(0.0);
      for (int i=0;i<3;i++){
        vec4 w = uWaves[i]; float spd = i==0 ? uSpeeds.x : (i==1 ? uSpeeds.y : uSpeeds.z);
        float ph = w.z * (dot(w.xy, wp.xz) - spd*uTime);
        h += w.w * sin(ph);
        g += w.w * w.z * cos(ph) * w.xy;
      }
      float amp = vCalm * fade * smoothstep(0.0, 2.0, vDepth + 0.5);
      wp.y += h * amp;
      vGrad = g * amp;
      vWPos = wp.xyz;
      vec4 mvPosition = viewMatrix * wp;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`;
  const fragmentShader = /* glsl */`
    uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uHorizon; uniform vec3 uZenith; uniform float uNight;
    varying vec3 vWPos; varying vec2 vGrad; varying float vDepth; varying float vCalm;
    #include <common>
    #include <fog_pars_fragment>
    float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hh(i),hh(i+vec2(1,0)),f.x), mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x), f.y); }
    vec2 ripple(vec2 p, float t){
      vec2 g = vec2(0.0);
      g += vec2(cos(p.x*1.7+t*2.1+sin(p.y*0.8)), cos(p.y*1.9-t*1.7+sin(p.x*0.7))) * 0.05;
      g += vec2(cos(dot(p, vec2(3.1,1.3))+t*3.3), cos(dot(p, vec2(-1.2,3.7))-t*2.9)) * 0.025;
      g += (vec2(vn(p*2.3+t*0.4), vn(p*2.3-t*0.37+7.0)) - 0.5) * 0.06;
      return g;
    }
    void main(){
      vec3 V = normalize(cameraPosition - vWPos);
      float dist = length(cameraPosition - vWPos);
      vec2 g = vGrad + ripple(vWPos.xz, uTime) * (0.35 + 0.65*vCalm) * (1.0 - smoothstep(60.0, 600.0, dist));
      vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
      if (V.y < 0.0) N = -N; // seen from below
      vec3 R = reflect(-V, N);
      float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
      vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.5));
      float spec = pow(max(dot(R, uSunDir), 0.0), 600.0) * 30.0 + pow(max(dot(R, uSunDir), 0.0), 60.0) * 0.4;
      float depth = max(vDepth, 0.0);
      vec3 deep = vec3(0.012, 0.06, 0.09), shallow = vec3(0.06, 0.32, 0.30);
      float daylight = clamp(uSunDir.y*3.0 + 0.15, 0.05, 1.0);
      vec3 body = mix(shallow, deep, smoothstep(0.0, 9.0, depth)) * daylight;
      // subsurface glow on wave faces
      body += vec3(0.02, 0.09, 0.07) * clamp(dot(g, uSunDir.xz), 0.0, 1.0) * daylight;
      vec3 col = mix(body, sky, fres) + uSunColor * spec * step(0.0, uSunDir.y);
      float foam = smoothstep(0.9, 0.0, depth) * smoothstep(0.35, 0.75, vn(vWPos.xz*1.4 + uTime*0.3) + 0.3*sin(depth*12.0 - uTime*2.0));
      col = mix(col, vec3(0.9)*daylight, foam*0.7);
      float alpha = mix(0.55, 0.97, smoothstep(0.0, 3.5, depth));
      alpha = max(alpha, fres);
      gl_FragColor = vec4(col, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`;
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, fog: true, transparent: true, side: THREE.DoubleSide, depthWrite: true });
  const near = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800, 300, 300).rotateX(-Math.PI / 2), mat);
  near.frustumCulled = false;
  near.renderOrder = 1;
  const farMat = mat.clone();
  farMat.uniforms = uniforms; // share
  const far = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000, 1, 1).rotateX(-Math.PI / 2), farMat);
  far.position.y = -0.55;
  far.renderOrder = 0;
  scene.add(far, near);
  uniforms.uRadius.value = 900;
  return {
    uniforms,
    update(t, camPos) {
      uniforms.uTime.value = t;
      near.position.set(Math.round(camPos.x / 12) * 12, 0, Math.round(camPos.z / 12) * 12);
      uniforms.uCenter.value.set(near.position.x, near.position.z);
    },
  };
}

// ---------------------------------------------------------------- Sky, sun, lights
export function buildSky(scene) {
  const sky = new Sky();
  sky.scale.setScalar(20000);
  const u = sky.material.uniforms;
  u.turbidity.value = 4.5; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a5040, 0.9);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(window.__testLow ? 512 : 4096, window.__testLow ? 512 : 4096);
  const sc = sun.shadow.camera; sc.left = -140; sc.right = 140; sc.top = 140; sc.bottom = -140; sc.near = 1; sc.far = 1200;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  scene.add(hemi, sun, sun.target);

  // Stars
  const rnd = mulberry32(3);
  const sp = new Float32Array(3000 * 3);
  for (let i = 0; i < 3000; i++) {
    const u1 = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u1 * u1);
    sp.set([r * Math.cos(th) * 9000, Math.abs(u1) * 9000, r * Math.sin(th) * 9000], i * 3);
  }
  const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(sp, 3)),
    new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  stars.frustumCulled = false;
  scene.add(stars);

  const sunDir = new THREE.Vector3();
  const horizon = new THREE.Color(), zenith = new THREE.Color(), sunColor = new THREE.Color();
  const moonColor = new THREE.Color(0.55, 0.65, 1.0), lightDir = new THREE.Vector3();
  const fog = new THREE.FogExp2(0xaabbcc, 0.00022);
  scene.fog = fog;

  return {
    sky, sun, hemi, stars, sunDir, horizon, zenith, sunColor,
    // timeOfDay: 0..24 hours
    update(timeOfDay, focus) {
      const ang = (timeOfDay - 6) / 12 * Math.PI; // 6h sunrise, 18h sunset
      const elev = Math.sin(ang) * 1.05, az = Math.cos(ang);
      sunDir.set(az * 0.8, elev, -0.45).normalize();
      u.sunPosition.value.copy(sunDir);
      const day = smoothstep(-0.12, 0.25, sunDir.y);
      const golden = smoothstep(0.35, 0.02, sunDir.y) * smoothstep(-0.1, 0.02, sunDir.y);
      sunColor.setRGB(1, lerp(0.95, 0.55, golden), lerp(0.9, 0.3, golden));
      const sunUp = smoothstep(-0.04, 0.12, sunDir.y);
      const moon = 1 - smoothstep(-0.2, -0.02, sunDir.y);
      sun.color.copy(sunColor).lerp(moonColor, 1 - sunUp);
      sun.intensity = 3.2 * sunUp + 0.35 * moon;
      lightDir.copy(sunDir);
      if (sunUp < 0.01) lightDir.set(-sunDir.x, -sunDir.y, -sunDir.z * 0.5 + 0.3).normalize();
      hemi.intensity = lerp(0.08, 0.22, day); // sky-image lighting (environment.js) provides most of the fill
      hemi.color.setRGB(lerp(0.25, 0.75, day), lerp(0.3, 0.85, day), lerp(0.5, 1.0, day));
      // approximate sky colours for fog and water reflection
      horizon.setRGB(lerp(0.015, lerp(0.72, 0.95, golden), day), lerp(0.02, lerp(0.8, 0.62, golden), day), lerp(0.05, lerp(0.9, 0.45, golden), day));
      zenith.setRGB(lerp(0.004, 0.22, day), lerp(0.008, 0.42, day), lerp(0.025, 0.78, day));
      fog.color.copy(horizon);
      stars.material.opacity = 1 - smoothstep(-0.2, 0.05, sunDir.y);
      sky.visible = sunDir.y > -0.25;
      sun.position.copy(focus).addScaledVector(lightDir, 500);
      sun.target.position.copy(focus);
      // snap shadow camera to texels to avoid shimmering
      return day;
    },
  };
}

// ---------------------------------------------------------------- Vegetation & rocks
export const colliders = new Map(); // hash -> [x, z, r, top, ...] (top: height of the obstacle's top)
const CCELL = 16;
const ckey = (cx, cz) => cx * 92837111 ^ cz * 689287499;
export function addCollider(x, z, r, top = terrainHeight(x, z) + 12) {
  const k = ckey(Math.floor(x / CCELL), Math.floor(z / CCELL));
  let a = colliders.get(k); if (!a) colliders.set(k, a = []);
  a.push(x, z, r, top);
}
const treeGrid = new Map();
export function removeCollider(x, z) {
  const a = colliders.get(ckey(Math.floor(x / CCELL), Math.floor(z / CCELL)));
  if (a) for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - x) < 0.01 && Math.abs(a[i + 1] - z) < 0.01) { a.splice(i, 4); return; }
}
export function nearbyColliders(x, z, out) {
  out.length = 0;
  const cx = Math.floor(x / CCELL), cz = Math.floor(z / CCELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const a = colliders.get(ckey(cx + i, cz + j));
    if (a) for (let k = 0; k < a.length; k++) out.push(a[k]);
  }
  return out;
}

function colorize(geo, hex) {
  const c = new THREE.Color(hex);
  c.convertSRGBToLinear();
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
function jitter(geo, amt, seed) {
  const r = mulberry32(seed);
  const p = geo.attributes.position;
  // merge-safe: jitter by position hash so shared vertices move together
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let d = map.get(key);
    if (!d) map.set(key, d = [(r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt]);
    p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

function makeTreeGeometries() {
  const prep = (g) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); return g; };
  // Pine
  const pine = mergeGeometries([
    colorize(prep(new THREE.CylinderGeometry(0.16, 0.28, 3, 6).translate(0, 1.5, 0)), '#4a3423'),
    colorize(jitter(prep(new THREE.ConeGeometry(2.4, 4.2, 9, 1).translate(0, 3.6, 0)), 0.35, 1), '#1f3f22'),
    colorize(jitter(prep(new THREE.ConeGeometry(1.9, 3.6, 9, 1).translate(0, 5.6, 0)), 0.3, 2), '#24492a'),
    colorize(jitter(prep(new THREE.ConeGeometry(1.25, 3.0, 8, 1).translate(0, 7.5, 0)), 0.25, 3), '#2a5330'),
  ]);
  // Broadleaf
  const leaf = mergeGeometries([
    colorize(prep(new THREE.CylinderGeometry(0.2, 0.32, 3.4, 6).translate(0, 1.7, 0)), '#4f3a28'),
    colorize(jitter(prep(new THREE.IcosahedronGeometry(2.6, 1).translate(0, 4.6, 0)), 0.9, 4), '#3d6a2a'),
    colorize(jitter(prep(new THREE.IcosahedronGeometry(1.8, 1).translate(1.2, 5.6, 0.5)), 0.6, 5), '#467a30'),
    colorize(jitter(prep(new THREE.IcosahedronGeometry(1.7, 1).translate(-1.1, 5.2, -0.6)), 0.6, 6), '#3a6428'),
  ]);
  // Saguaro cactus
  const cg = '#4f7a3a';
  const cactus = mergeGeometries([
    colorize(prep(new THREE.CapsuleGeometry(0.35, 4.2, 3, 8).translate(0, 2.4, 0)), cg),
    colorize(prep(new THREE.CapsuleGeometry(0.22, 1.2, 3, 6).rotateZ(Math.PI / 2).translate(0.75, 2.2, 0)), cg),
    colorize(prep(new THREE.CapsuleGeometry(0.22, 1.4, 3, 6).translate(1.3, 2.9, 0)), cg),
    colorize(prep(new THREE.CapsuleGeometry(0.2, 0.9, 3, 6).rotateZ(Math.PI / 2).translate(-0.6, 2.9, 0)), cg),
    colorize(prep(new THREE.CapsuleGeometry(0.2, 1.0, 3, 6).translate(-1.05, 3.4, 0)), cg),
  ]);
  // Rock
  const rock = colorize(jitter(prep(new THREE.DodecahedronGeometry(1, 1)), 0.45, 7).scale(1.4, 0.8, 1.1), '#8a857c');
  // Palm
  const palmParts = [];
  for (let i = 0; i < 6; i++) {
    const seg = prep(new THREE.CylinderGeometry(0.17 - i * 0.012, 0.2 - i * 0.012, 1.3, 6));
    seg.rotateZ(-0.05 * i).translate(i * i * 0.035, 0.65 + i * 1.25, 0);
    palmParts.push(colorize(seg, '#7a6247'));
  }
  for (let i = 0; i < 7; i++) {
    const f = prep(new THREE.PlaneGeometry(3.6, 0.8, 4, 1));
    const p = f.attributes.position;
    for (let k = 0; k < p.count; k++) { const x = p.getX(k) + 1.8; p.setXYZ(k, x, p.getY(k), -0.12 * x * x); }
    f.rotateX(-Math.PI / 2).rotateY(i / 7 * Math.PI * 2).translate(0.9, 7.8, 0);
    palmParts.push(colorize(f, '#3f7a2e'));
  }
  const palm = mergeGeometries(palmParts);
  // Shrub
  const shrub = colorize(jitter(prep(new THREE.IcosahedronGeometry(0.9, 1)).scale(1, 0.6, 1), 0.4, 9), '#6b6a3a');
  return { pine, leaf, cactus, rock, palm, shrub };
}

export function buildVegetation(scene) {
  const geos = makeTreeGeometries();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.35 });
  const leafMat = mat.clone();
  applySeason(mat, 'veg', 0); applySeason(leafMat, 'veg', 1);   // broadleaf trees change with the seasons
  const rnd = mulberry32(1234);
  const STEP = 11;
  const CH = 512; // instance chunk size (m)
  const buckets = new Map(); // `${type}:${chunk}` -> matrices[]
  const colorVar = new Map();
  const push = (type, x, y, z, s, rotY, tint, collR) => {
    const key = `${type}:${Math.floor((x + HALF) / CH)}:${Math.floor((z + HALF) / CH)}`;
    let b = buckets.get(key); if (!b) buckets.set(key, b = { type, list: [] });
    b.list.push([x, y, z, s, rotY, tint]);
    if (collR) addCollider(x, z, collR * s);
  };
  const nDens = createNoise2D(91);
  for (let z = -HALF + 20; z < HALF - 20; z += STEP) for (let x = -HALF + 20; x < HALF - 20; x += STEP) {
    const px = x + (rnd() - 0.5) * STEP * 0.9, pz = z + (rnd() - 0.5) * STEP * 0.9;
    const h = terrainHeight(px, pz);
    if (h < 1.6) continue;
    const r = rnd();
    const b = biomeWeights(px, pz);
    const slope = Math.abs(terrainHeight(px + 2, pz) - terrainHeight(px - 2, pz)) + Math.abs(terrainHeight(px, pz + 2) - terrainHeight(px, pz - 2));
    if (slope > 3.2) { if (r < 0.04) push('rock', px, h - 0.4, pz, 1 + rnd() * 2.5, rnd() * 6, rnd(), 1.1); continue; }
    if (roadAt(px, pz, 6) || townAt(px, pz, 12) || airportAt(px, pz, 20) || reservedAt(px, pz, 15) || pavedAt(px, pz) || pavedAt(px + 5, pz) || pavedAt(px - 5, pz) || pavedAt(px, pz + 5) || pavedAt(px, pz - 5)) continue;
    const clump = nDens(px / 160, pz / 160) * 0.5 + 0.5;
    // Gull Island: palms and flowering shrubs, no pines
    { const di = Math.hypot((px - ISLAND.x) / ISLAND.rx * (px > ISLAND.x ? 0.78 : 1), (pz - ISLAND.z) / ISLAND.rz);
      if (di < 0.8) { if (r < (h < 3 ? 0.14 : 0.12 + 0.3 * clump)) push('palm', px, h - 0.2, pz, 0.8 + rnd() * 0.6, rnd() * 6, rnd(), 0.35); else if (h > 3 && r < 0.3 + 0.3 * clump) push('shrub', px, h - 0.2, pz, 0.6 + rnd() * 0.6, rnd() * 6, rnd(), 0); continue; } }
    const coast = b.sea > 0.08 && h < 7;
    if (coast) { if (r < 0.12) push('palm', px, h - 0.2, pz, 0.8 + rnd() * 0.5, rnd() * 6, rnd(), 0.35); continue; }
    if (b.mountain > 0.5) {
      if (h < 330 && r < 0.42 * smoothstep(380, 200, h) * (0.4 + clump)) push('pine', px, h - 0.2, pz, 0.7 + rnd() * 0.7, rnd() * 6, rnd(), 0.45);
      else if (r > 0.97) push('rock', px, h - 0.4, pz, 1 + rnd() * 2, rnd() * 6, rnd(), 1.1);
      continue;
    }
    if (b.desert > 0.5) {
      if (r < 0.025) push('cactus', px, h - 0.1, pz, 0.7 + rnd() * 0.6, rnd() * 6, rnd(), 0.4);
      else if (r < 0.07) push('shrub', px, h - 0.2, pz, 0.6 + rnd(), rnd() * 6, rnd(), 0);
      else if (r < 0.085) push('rock', px, h - 0.4, pz, 0.8 + rnd() * 2, rnd() * 6, rnd(), 1.1);
      continue;
    }
    if (b.forest > 0.5) {
      const d = 0.55 + 0.35 * clump;
      if (r < d * 0.75) push('pine', px, h - 0.2, pz, 0.8 + rnd() * 0.8, rnd() * 6, rnd(), 0.45);
      else if (r < d) push('leaf', px, h - 0.2, pz, 0.8 + rnd() * 0.5, rnd() * 6, rnd(), 0.5);
      continue;
    }
    // plains: hedgerow copses
    const d = 0.02 + 0.45 * smoothstep(0.62, 0.85, clump) + b.forest * 0.4;
    if (r < d) push(rnd() < 0.8 ? 'leaf' : 'pine', px, h - 0.2, pz, 0.7 + rnd() * 0.6, rnd() * 6, rnd(), 0.5);
    else if (r > 0.995) push('rock', px, h - 0.4, pz, 0.6 + rnd(), rnd() * 6, rnd(), 0.9);
  }
  const group = new THREE.Group();
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  let total = 0;
  // far versions: a few dozen triangles each, in the full model's average colour and size (no shadows)
  const lowGeos = {};
  for (const [type, g] of Object.entries(geos)) {
    g.computeBoundingBox(); const b = g.boundingBox, w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z), h = b.max.y - b.min.y;
    const c = g.attributes.color, avg = [0, 0, 0]; if (c) { for (let i = 0; i < c.count; i++) { avg[0] += c.getX(i); avg[1] += c.getY(i); avg[2] += c.getZ(i); } avg.forEach((v, k) => (avg[k] = v / c.count)); }
    let lg;
    if (type === 'pine' || type === 'cactus') lg = new THREE.ConeGeometry(w * (type === 'cactus' ? 0.25 : 0.45), h, 5).translate(0, b.min.y + h / 2, 0);
    else if (type === 'palm') lg = new THREE.ConeGeometry(w * 0.45, h * 0.3, 5).rotateX(Math.PI).translate(0, b.max.y - h * 0.15, 0);
    else lg = new THREE.IcosahedronGeometry(0.5, 0).scale(w, type === 'rock' || type === 'shrub' ? h : h * 0.7, w).translate(0, type === 'rock' || type === 'shrub' ? b.min.y + h / 2 : b.max.y - h * 0.35, 0);
    lg = lg.toNonIndexed(); const cc = new Float32Array(lg.attributes.position.count * 3); for (let i = 0; i < cc.length; i += 3) { cc[i] = avg[0]; cc[i + 1] = avg[1]; cc[i + 2] = avg[2]; }
    lg.setAttribute('color', new THREE.BufferAttribute(cc, 3)); lg.computeVertexNormals();
    lowGeos[type] = lg;
  }
  const chunks = [];
  for (const { type, list } of buckets.values()) {
    const im = new THREE.InstancedMesh(geos[type], type === 'leaf' ? leafMat : mat, list.length);
    list.forEach(([x, y, z, sc, ry, tint], i) => {
      q.setFromAxisAngle(up, ry); p.set(x, y, z); s.setScalar(sc);
      if (type === 'rock') s.set(sc, sc * (0.6 + tint * 0.6), sc);
      M.compose(p, q, s); im.setMatrixAt(i, M);
      col.setRGB(0.85 + tint * 0.3, 0.85 + (1 - tint) * 0.25, 0.85 + tint * 0.1);
      im.setColorAt(i, col);
      if (type !== 'rock' && type !== 'shrub') {   // trees can be knocked over (mech)
        const k = `${Math.floor(x / 20)},${Math.floor(z / 20)}`;
        let a = treeGrid.get(k); if (!a) treeGrid.set(k, a = []);
        a.push({ im, i, x, y, z, sc, ry, alive: true });
      }
    });
    im.computeBoundingSphere();
    im.castShadow = true; im.receiveShadow = true;
    group.add(im);
    // the far version shares the instance transforms and tints
    const lo = new THREE.InstancedMesh(lowGeos[type], type === 'leaf' ? leafMat : mat, list.length);
    lo.instanceMatrix.array.set(im.instanceMatrix.array); if (im.instanceColor) { lo.instanceColor = im.instanceColor.clone(); }
    lo.computeBoundingSphere(); lo.receiveShadow = true; lo.visible = false; group.add(lo);
    let cx = 0, cz = 0; for (const [x, , z] of list) { cx += x; cz += z; } cx /= list.length; cz /= list.length;
    chunks.push({ im, lo, cx, cz, near: true });
    im.userData.lo = lo;
    total += list.length;
  }
  let lodT = 0;
  scene.add(group);
  const falling = [];
  const ax = new THREE.Vector3(), qf = new THREE.Quaternion();
  return {
    group, total,
    // knock over every tree within `radius` of (x, z), falling away along (dx, dz); returns how many went down
    knock(x, z, radius, dx, dz) {
      let n = 0;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const a = treeGrid.get(`${Math.floor(x / 20) + i},${Math.floor(z / 20) + j}`); if (!a) continue;
        for (const t of a) {
          if (!t.alive || Math.hypot(t.x - x, t.z - z) > radius) continue;
          t.alive = false; n++;
          removeCollider(t.x, t.z);
          if (t.im.userData.lo) { M.makeScale(0, 0, 0); t.im.userData.lo.setMatrixAt(t.i, M); t.im.userData.lo.instanceMatrix.needsUpdate = true; }
          let fx = dx, fz = dz; if (!fx && !fz) { fx = t.x - x; fz = t.z - z; } const l = Math.hypot(fx, fz) || 1;
          falling.push({ ...t, ax: fz / l, az: -fx / l, t: 0 });
        }
      }
      return n;
    },
    // cam: switch each 512 m chunk between the full trees (with shadows close by) and the far versions
    update(dt, cam) {
      if (cam && (lodT -= dt) <= 0) {
        lodT = 0.4;
        const reach = 1100 + Math.max(0, cam.y - 60) * 2.5;   // beyond this the fog hides them anyway
        for (const c of chunks) {
          const d = Math.hypot(c.cx - cam.x, c.cz - cam.z), inReach = cam.distanceTo(c.im.boundingSphere.center) - c.im.boundingSphere.radius < reach;
          if (c.near && d > 780) c.near = false; else if (!c.near && d < 700) c.near = true;
          c.im.visible = c.near && inReach; c.lo.visible = !c.near && inReach; c.im.castShadow = d < 420;
        }
      }
      for (let k = falling.length - 1; k >= 0; k--) {
        const f = falling[k];
        f.t += dt;
        const ang = Math.min(Math.PI / 2 * 0.96, 1.6 * f.t * f.t);
        qf.setFromAxisAngle(ax.set(f.ax, 0, f.az), ang).multiply(q.setFromAxisAngle(up, f.ry));
        M.compose(p.set(f.x, f.y, f.z), qf, s.setScalar(f.sc)); f.im.setMatrixAt(f.i, M); f.im.instanceMatrix.needsUpdate = true;
        if (ang >= Math.PI / 2 * 0.96) falling.splice(k, 1);
      }
    },
  };
}

// ---------------------------------------------------------------- Clouds
function cloudTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.7)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function buildClouds(scene) {
  const tex = cloudTexture();
  const rnd = mulberry32(42);
  const group = new THREE.Group();
  const mats = [];
  for (let i = 0; i < 70; i++) {
    const cx = (rnd() - 0.5) * 7000, cz = (rnd() - 0.5) * 7000, cy = 380 + rnd() * 380;
    const cl = new THREE.Group();
    cl.position.set(cx, cy, cz);
    const puffs = 7 + (rnd() * 8 | 0);
    for (let k = 0; k < puffs; k++) {
      const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.55 + rnd() * 0.3, fog: false });
      mats.push(m);
      const s = new THREE.Sprite(m);
      const sz = 50 + rnd() * 70;
      s.scale.set(sz * 1.6, sz, 1);
      s.position.set((rnd() - 0.5) * 160, (rnd() - 0.5) * 30 + (k === 0 ? 10 : 0), (rnd() - 0.5) * 100);
      cl.add(s);
    }
    group.add(cl);
  }
  scene.add(group);
  const c = new THREE.Color();
  return {
    group,
    update(dt, day, sunColor, cover = 0) {
      group.position.x += dt * (3 + cover * 6);
      if (group.position.x > 3500) group.position.x -= 7000;
      c.setRGB(lerp(0.12, 1, day), lerp(0.13, 1, day), lerp(0.18, 1, day)).lerp(sunColor, 0.15 * day).multiplyScalar(1 - 0.5 * cover);
      for (const m of mats) { m.color.copy(c); m.opacity = Math.min(1, (m.userData.o0 ?? (m.userData.o0 = m.opacity)) * (1 + cover)); }
      group.position.y = -cover * 120;   // overcast: lower, heavier cloud
    },
  };
}
