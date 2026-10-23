// 1991 Mazda MX-5 (NA) model, built procedurally, with boat and plane transformations.
// Local frame: +z forward, +y up, +x = driver's left (left-hand drive). Origin = ground level, mid-wheelbase.
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createMech } from './mech.js';
import { createTransformer } from './transformer.js';

export const DIMS = {
  wheelbase: 2.265, track: 1.41, wheelR: 0.29, wheelW: 0.185,
  frontZ: 1.1325, rearZ: -1.1325, length: 3.97, width: 1.675,
};

// ---------------------------------------------------------------- Body surface definition
// Keyframes along the car: z, max half-width, sill/bumper bottom, top (deck/hood centre), crown, shoulder radius
const KEYS = [
  [-1.990, 0.700, 0.320, 0.840, 0.020, 0.13],
  [-1.950, 0.780, 0.290, 0.872, 0.025, 0.11],
  [-1.850, 0.815, 0.265, 0.884, 0.030, 0.09],
  [-1.600, 0.832, 0.245, 0.886, 0.030, 0.08],
  [-1.130, 0.8375, 0.215, 0.880, 0.030, 0.075],
  [-0.600, 0.836, 0.195, 0.870, 0.030, 0.07],
  [0.000, 0.836, 0.195, 0.858, 0.030, 0.07],
  [0.400, 0.836, 0.195, 0.838, 0.035, 0.075],
  [0.800, 0.835, 0.200, 0.800, 0.040, 0.085],
  [1.130, 0.836, 0.210, 0.758, 0.040, 0.09],
  [1.500, 0.826, 0.220, 0.712, 0.040, 0.10],
  [1.750, 0.792, 0.225, 0.664, 0.040, 0.11],
  [1.900, 0.715, 0.225, 0.612, 0.035, 0.12],
  [1.970, 0.625, 0.235, 0.560, 0.030, 0.12],
  [1.995, 0.520, 0.255, 0.505, 0.025, 0.11],
];
const Z_MIN = KEYS[0][0], Z_MAX = KEYS[KEYS.length - 1][0];

function stationAt(z) {
  const S = KEYS;
  z = Math.min(Z_MAX, Math.max(Z_MIN, z));
  let i = 0; while (i < S.length - 2 && S[i + 1][0] < z) i++;
  const p0 = S[Math.max(0, i - 1)], p1 = S[i], p2 = S[i + 1], p3 = S[Math.min(S.length - 1, i + 2)];
  const t = (z - p1[0]) / (p2[0] - p1[0]), t2 = t * t, t3 = t2 * t;
  const v = (k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
  return { w: v(1), yb: v(2), yt: v(3), crown: v(4), rs: v(5) };
}

// Half cross-section (x >= 0) from top centre to bottom centre, as a dense polyline.
function halfProfile(s) {
  const { w, yb, yt, crown, rs } = s;
  const tumble = 0.035, tuck = 0.045, rb = 0.05;
  const wt = Math.max(0.05, w - tumble - rs);
  const pts = [];
  for (let i = 0; i <= 14; i++) { const u = i / 14; pts.push([wt * u, yt - crown * u * u]); }
  const ycS = yt - crown - rs;
  for (let i = 1; i <= 10; i++) { const th = Math.PI / 2 * (1 - i / 10); pts.push([wt + rs * Math.cos(th), ycS + rs * Math.sin(th)]); }
  const yLow = yb + rb, ymax = yLow + 0.5 * (ycS - yLow);
  for (let i = 1; i <= 14; i++) {
    const y = ycS + (yLow - ycS) * i / 14;
    const x = y > ymax ? w - tumble * ((y - ymax) / (ycS - ymax)) ** 2 : w - tuck * ((ymax - y) / (ymax - yLow)) ** 2;
    pts.push([x, y]);
  }
  const cx = w - tuck - rb;
  for (let i = 1; i <= 6; i++) { const th = -Math.PI / 2 * i / 6; pts.push([cx + rb * Math.cos(th), yLow + rb * Math.sin(th)]); }
  for (let i = 1; i <= 6; i++) pts.push([cx * (1 - i / 6), yb]);
  return pts;
}

// Resample so curvature gets more points (crisp shoulders) — weight = length + k * turning angle.
function resample(pts, m) {
  const wts = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
    let turn = 0;
    if (i > 1) {
      const ax = pts[i - 1][0] - pts[i - 2][0], ay = pts[i - 1][1] - pts[i - 2][1];
      turn = Math.abs(Math.atan2(ax * dy - ay * dx, ax * dx + ay * dy));
    }
    wts.push(wts[i - 1] + Math.hypot(dx, dy) + 0.06 * turn);
  }
  const total = wts[wts.length - 1], out = [];
  let j = 0;
  for (let k = 0; k < m; k++) {
    const target = total * k / (m - 1);
    while (j < wts.length - 2 && wts[j + 1] < target) j++;
    const t = (target - wts[j]) / Math.max(1e-9, wts[j + 1] - wts[j]);
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t]);
  }
  return out;
}

// x of the body side at height y for station z (for placing trim on the skin)
export function sideX(z, y) {
  const p = halfProfile(stationAt(z));
  let best = p[0][0], bd = 1e9;
  for (let i = 14; i < p.length - 1; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[i + 1];
    if ((y - y0) * (y - y1) <= 0 && y0 !== y1) return x0 + (x1 - x0) * (y - y0) / (y1 - y0);
    const d = Math.abs(y0 - y); if (d < bd) { bd = d; best = x0; }
  }
  return best;
}
export function topY(z, x = 0) { const s = stationAt(z); const wt = s.w - 0.035 - s.rs; const u = Math.min(1, Math.abs(x) / wt); return s.yt - s.crown * u * u; }

// Cockpit opening (plan view rounded rectangle) signed distance
const CP = { z0: -0.665, z1: 0.36, hw: 0.655, r: 0.17 };
function cockpitSDF(x, z) {
  const cz = (CP.z0 + CP.z1) / 2, hz = (CP.z1 - CP.z0) / 2;
  const qx = Math.abs(x) - (CP.hw - CP.r), qz = Math.abs(z - cz) - (hz - CP.r);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - CP.r;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function buildBodyGeometry() {
  const NZ = 170, M = 61, NT = 2 * M - 2;
  const pos = [], dark = [], idx = [];
  const archR = 0.372, wheelY = DIMS.wheelR;
  for (let a = 0; a <= NZ; a++) {
    const u = a / NZ;
    const z = Z_MIN + (Z_MAX - Z_MIN) * (0.5 - 0.5 * Math.cos(u * Math.PI));
    const s = stationAt(z);
    const half = resample(halfProfile(s), M);
    const ring = half.concat(half.slice(1, M - 1).reverse().map(([x, y]) => [-x, y]));
    for (let b = 0; b < NT; b++) {
      let [x, y] = ring[b];
      let dk = 0;
      // wheel arches: lift the lower outer skin to the arch line
      for (const az of [DIMS.frontZ, DIMS.rearZ]) {
        const dz = z - az;
        if (Math.abs(dz) < archR) {
          const archY = wheelY + Math.sqrt(archR * archR - dz * dz);
          const outer = smooth(s.w - 0.34, s.w - 0.16, Math.abs(x));
          if (y < archY && outer > 0) { y += (archY - y) * outer; if (outer > 0.3) dk = 1; }
        }
      }
      // open cockpit tub
      if (y > s.yt - s.crown - 0.025) {
        const d = cockpitSDF(x, z);
        const depth = smooth(0.004, -0.03, d);
        if (depth > 0) { y += (0.4 - y) * depth; if (depth > 0.25) dk = 1; }
      }
      pos.push(x, y, z);
      dark.push(dk);
    }
  }
  for (let a = 0; a < NZ; a++) for (let b = 0; b < NT; b++) {
    const i0 = a * NT + b, i1 = a * NT + (b + 1) % NT, i2 = i0 + NT, i3 = i1 + NT;
    idx.push(i0, i2, i1, i1, i2, i3);
  }
  // end caps (tail panel and bumper face)
  for (const [ring, front] of [[0, false], [NZ, true]]) {
    let cx = 0, cy = 0, cz = 0;
    for (let b = 0; b < NT; b++) { cx += pos[(ring * NT + b) * 3]; cy += pos[(ring * NT + b) * 3 + 1]; cz += pos[(ring * NT + b) * 3 + 2]; }
    const ci = pos.length / 3; pos.push(cx / NT, cy / NT, cz / NT + (front ? 0.004 : -0.004)); dark.push(0);
    for (let b = 0; b < NT; b++) {
      const i0 = ring * NT + b, i1 = ring * NT + (b + 1) % NT;
      front ? idx.push(ci, i1, i0) : idx.push(ci, i0, i1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('dark', new THREE.Float32BufferAttribute(dark, 1));
  g.setAttribute('scratch', new THREE.Float32BufferAttribute(new Float32Array(dark.length), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure faces point outward (top centre normal must point up)
  const n = g.attributes.normal;
  const probe = Math.floor(NZ / 2) * NT;
  if (n.getY(probe) < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    g.computeVertexNormals();
  }
  return g;
}

// Find separate pieces (connected triangles) inside the merged body and lift some back out as their own meshes.
function splitParts(meshes, M) {
  meshes = [...meshes].sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count);
  const pa = meshes[0].geometry.attributes.position.array, nV = pa.length / 3;
  const same = meshes.filter((m) => m.geometry.attributes.position.array === pa);
  const par = new Int32Array(nV); for (let i = 0; i < nV; i++) par[i] = i;
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (const m of same) { const ix = m.geometry.index.array; for (let i = 0; i < ix.length; i += 3) { const a = find(ix[i]); par[find(ix[i + 1])] = a; par[find(ix[i + 2])] = a; } }
  const comps = new Map();
  for (const m of same) {
    const ix = m.geometry.index.array;
    for (let i = 0; i < ix.length; i += 3) {
      const r = find(ix[i]); let c = comps.get(r);
      if (!c) comps.set(r, c = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9], mats: new Set() });
      c.mats.add(m.material);
      for (let k = 0; k < 3; k++) { const v = ix[i + k]; for (let d = 0; d < 3; d++) { const q = pa[v * 3 + d]; if (q < c.min[d]) c.min[d] = q; if (q > c.max[d]) c.max[d] = q; } }
    }
  }
  const classify = (c) => {
    const cx = (c.min[0] + c.max[0]) / 2, cy = (c.min[1] + c.max[1]) / 2, cz = (c.min[2] + c.max[2]) / 2;
    const sx = c.max[0] - c.min[0], sy = c.max[1] - c.min[1], sz = c.max[2] - c.min[2], side = cx > 0 ? 1 : -1;
    if (Math.abs(cx) > 0.74 && cy > 0.72 && cy < 1.08 && cz > -0.25 && cz < 0.45 && Math.max(sx, sy, sz) < 0.35) return 'mirror' + side;
    if (c.mats.has(M.lamps) && cz < -1.55 && Math.abs(cx) > 0.3) return 'tail' + side;
    if (c.mats.has(M.lamps) && cz > 1.6 && Math.abs(cx) > 0.3 && cy < 0.65) return 'front' + side;
    if (cx > 0.2 && cx < 0.6 && cy > 0.6 && cy < 0.85 && cz > 0 && cz < 0.2 && sx > 0.25 && sz < 0.16) return 'steer';
    return null;
  };
  for (const c of comps.values()) c.part = classify(c);
  // collect triangles per part and material; remove them from the body
  const parts = new Map();
  for (const m of same) {
    const ix = m.geometry.index.array, keep = [];
    for (let i = 0; i < ix.length; i += 3) {
      const part = comps.get(find(ix[i])).part;
      let tri = [ix[i], ix[i + 1], ix[i + 2]];
      // windscreen frame: body-coloured paint above the scuttle near the glass becomes black trim
      if (!part && m.material === M.realPaint) {
        const y = (pa[tri[0] * 3 + 1] + pa[tri[1] * 3 + 1] + pa[tri[2] * 3 + 1]) / 3, z = (pa[tri[0] * 3 + 2] + pa[tri[1] * 3 + 2] + pa[tri[2] * 3 + 2]) / 3;
        const x = Math.abs(pa[tri[0] * 3] + pa[tri[1] * 3] + pa[tri[2] * 3]) / 3;
        if (y > 0.93 && x < 0.76 && z > -0.3 && z < 0.45) { const key = 'frame'; if (!parts.has(key)) parts.set(key, new Map()); const pm = parts.get(key); if (!pm.has(M.trim)) pm.set(M.trim, []); pm.get(M.trim).push(...tri); continue; }
      }
      if (!part) { keep.push(...tri); continue; }
      if (!parts.has(part)) parts.set(part, new Map());
      const pm = parts.get(part); if (!pm.has(m.material)) pm.set(m.material, []); pm.get(m.material).push(...tri);
    }
    m.geometry.setIndex(keep);
  }
  const src = meshes[0].geometry.attributes;
  // standalone geometry, re-centred so the part has its own origin
  const build = (tris, centre) => {
    const map = new Map(), pos = [], nor = [], uv = [], idx = [];
    for (const v of tris) {
      let n = map.get(v);
      if (n === undefined) {
        n = pos.length / 3; map.set(v, n);
        pos.push(pa[v * 3] - centre.x, pa[v * 3 + 1] - centre.y, pa[v * 3 + 2] - centre.z);
        nor.push(src.normal.getX(v), src.normal.getY(v), src.normal.getZ(v));
        if (src.uv) uv.push(src.uv.getX(v), src.uv.getY(v));
      }
      idx.push(n);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    if (uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const nv = pos.length / 3;
    g.setAttribute('dark', new THREE.Float32BufferAttribute(new Float32Array(nv), 1));
    g.setAttribute('scratch', new THREE.Float32BufferAttribute(new Float32Array(nv), 1));
    g.setIndex(idx);
    return g;
  };
  const centreOf = (pm) => { const b = new THREE.Box3(); for (const tris of pm.values()) for (const v of tris) b.expandByPoint(new THREE.Vector3(pa[v * 3], pa[v * 3 + 1], pa[v * 3 + 2])); return b.getCenter(new THREE.Vector3()); };
  const meshFor = (pm) => {
    const c = centreOf(pm), g = new THREE.Group(); g.position.copy(c);
    for (const [mat, tris] of pm) { const mm = new THREE.Mesh(build(tris, c), mat); mm.castShadow = true; g.add(mm); }
    return g;
  };
  const out = { mirror: {}, tail: { 1: [], '-1': [] }, front: {}, steer: null, crack: null };
  for (const [key, pm] of parts) {
    if (key === 'frame') { const g = meshFor(pm); meshes[0].parent.add(g); continue; }
    if (key.startsWith('mirror')) out.mirror[+key.slice(6)] = meshFor(pm);
    else if (key.startsWith('tail')) { const c = centreOf(pm); for (const [mat, tris] of pm) { const mm = new THREE.Mesh(build(tris, c), mat); mm.position.copy(c); out.tail[+key.slice(4)].push(mm); } }
    else if (key.startsWith('front')) { const c = centreOf(pm); const [[mat, tris]] = pm; const mm = new THREE.Mesh(build(tris, c), mat); mm.position.copy(c); out.front[+key.slice(5)] = mm; }
    else if (key === 'steer') {
      const pivot = meshFor(pm);
      // rim axis = direction of least spread (PCA on the vertices)
      const pts = []; pivot.traverse((o) => { if (o.isMesh) { const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(p, i)); } });
      const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (const p of pts) { const a = [p.x, p.y, p.z]; for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) C[r][q] += a[r] * a[q]; }
      // smallest eigenvector via power iteration on (trace*I - C)
      const tr = C[0][0] + C[1][1] + C[2][2]; let v = new THREE.Vector3(0, 0.3, 1).normalize();
      for (let it = 0; it < 60; it++) { const nx = (tr - C[0][0]) * v.x - C[0][1] * v.y - C[0][2] * v.z, ny = -C[1][0] * v.x + (tr - C[1][1]) * v.y - C[1][2] * v.z, nz = -C[2][0] * v.x - C[2][1] * v.y + (tr - C[2][2]) * v.z; v.set(nx, ny, nz).normalize(); }
      if (v.z < 0) v.negate();
      // re-parent the meshes under a pivot that rotates about that axis
      const holder = new THREE.Group(); holder.position.copy(pivot.position);
      const spin = new THREE.Group(); holder.add(spin);
      for (const ch of [...pivot.children]) spin.add(ch);
      out.steer = { pivot: spin, axis: v, holder };
      out.steer.pivot = spin; out.steer.root = holder;
    }
  }
  if (out.steer) { const s2 = out.steer; out.steer = { pivot: s2.root, axis: s2.axis, spin: s2.pivot }; }
  // crack overlay on the windscreen glass: copy its big pieces, nudge outward, planar UVs
  const glassMesh = same.find((m) => m.material === M.glass);
  if (glassMesh) {
    const ix = glassMesh.geometry.index.array, tris = [];
    for (let i = 0; i < ix.length; i += 3) { const c = comps.get(find(ix[i])); if (c.max[0] - c.min[0] > 0.8) tris.push(ix[i], ix[i + 1], ix[i + 2]); }
    if (tris.length) {
      const g = build(tris, new THREE.Vector3());
      g.computeBoundingBox(); const bb = g.boundingBox, p = g.attributes.position, n = g.attributes.normal, uvs = [];
      for (let i = 0; i < p.count; i++) {
        p.setXYZ(i, p.getX(i) + n.getX(i) * 0.003, p.getY(i) + n.getY(i) * 0.003, p.getZ(i) + n.getZ(i) * 0.003);
        uvs.push((p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
      }
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      out.crack = g;
    }
  }
  return out;
}

// ---------------------------------------------------------------- soft top
// Vinyl roof lofted over the cabin, folding backwards about a hinge behind the seats (like the NA's manual top),
// with a plastic rear window and wind-up side windows. set(t): 0 = folded away, 1 = up.
function buildSoftTop(mats) {
  const NS = 30, NC = 27, H = { y: 0.92, z: -0.82 };
  const key = (k, s) => { let i = 0; while (i < k.length - 2 && k[i + 1][0] < s) i++; const [s0, v0] = k[i], [s1, v1] = k[i + 1]; const u = Math.min(1, Math.max(0, (s - s0) / (s1 - s0))); const e = u * u * (3 - 2 * u); return v0 + (v1 - v0) * e; };
  const ROOF = [[0, 1.152], [0.15, 1.2], [0.35, 1.228], [0.5, 1.218], [0.62, 1.18], [0.78, 1.08], [0.9, 0.98], [1, 0.895]];
  const HW = [[0, 0.6], [0.4, 0.655], [1, 0.7]];
  const crown = 0.045;
  const up = new Float32Array(NS * NC * 3);
  const glassTri = [], fabTri = [];
  for (let i = 0; i < NS; i++) {
    const sv = i / (NS - 1), z = 0.045 + (-1.02 - 0.045) * sv, ry = key(ROOF, sv), hw = key(HW, sv);
    const edgeY = ry - crown - 0.07;
    const sideB = edgeY + (0.89 - edgeY) * Math.min(1, Math.max(0, (sv - 0.4) / 0.12));
    // half profile from the top centre to the side bottom
    const prof = [[0, ry], [0.5 * hw, ry - crown * 0.25], [0.82 * hw, ry - crown * 0.68], [0.95 * hw, ry - crown - 0.02], [hw, edgeY], [hw + 0.01, sideB]];
    for (let j = 0; j < NC; j++) {
      const c = j / (NC - 1) * 2 - 1, a = Math.abs(c) * (prof.length - 1);
      const k = Math.min(prof.length - 2, Math.floor(a)), f = a - k;
      const x = (prof[k][0] + (prof[k + 1][0] - prof[k][0]) * f) * Math.sign(c), y = prof[k][1] + (prof[k + 1][1] - prof[k][1]) * f;
      up.set([x, y, z], (i * NC + j) * 3);
    }
  }
  for (let i = 0; i < NS - 1; i++) for (let j = 0; j < NC - 1; j++) {
    const a = i * NC + j, b = a + 1, c = a + NC, d = c + 1;
    const sv = (i + 0.5) / (NS - 1), cx = Math.abs((j + 0.5) / (NC - 1) * 2 - 1);
    const list = sv > 0.7 && sv < 0.94 && cx < 0.42 ? glassTri : fabTri;
    list.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.Float32BufferAttribute(up.slice(), 3);
  geo.setAttribute('position', pos);
  geo.setIndex([...fabTri, ...glassTri]);
  geo.addGroup(0, fabTri.length, 0); geo.addGroup(fabTri.length, glassTri.length, 1);
  geo.computeVertexNormals();
  const vinyl = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.92, side: THREE.DoubleSide });
  const rearWin = new THREE.MeshPhysicalMaterial({ color: 0x2b363c, roughness: 0.12, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const roof = new THREE.Mesh(geo, [vinyl, rearWin]); roof.castShadow = true; roof.receiveShadow = true;
  const group = new THREE.Group(); group.add(roof);
  // side windows: four corners (z, y) with tumblehome, rising out of the door
  const winCorners = (sx) => [[0.3, 0.9, 0.83], [-0.42, 0.9, 0.84], [-0.42, key(ROOF, (0.045 + 0.42) / 1.065) - crown - 0.09, 0.645], [0.05, 1.1, 0.6]].map(([z, y, x]) => [sx * x, y, z]);
  const windows = [1, -1].map((sx) => {
    const g = new THREE.BufferGeometry(); const c = winCorners(sx);
    g.setAttribute('position', new THREE.Float32BufferAttribute(c.flat(), 3)); g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats.glass); m.userData.corners = c; group.add(m); return m;
  });
  const tmp = new Float32Array(3);
  let last = -1;
  return {
    group,
    set(t) {
      if (Math.abs(t - last) < 1e-4) return; last = t;
      group.visible = t > 0.01;
      if (!group.visible) return;
      const fold = 1 - t;
      for (let i = 0; i < NS; i++) {
        const sv = i / (NS - 1), th = fold * 2.7 * Math.pow(1 - sv, 0.75), sh = 1 - fold * 0.62 * (1 - sv);
        for (let j = 0; j < NC; j++) {
          const k = (i * NC + j) * 3, x = up[k], y = up[k + 1], z = up[k + 2];
          const dz = z - H.z, dy = y - H.y, r = Math.hypot(dz, dy) * sh, phi = Math.atan2(dy, dz) + th;
          pos.array[k] = x * (1 - fold * 0.08); pos.array[k + 1] = H.y + r * Math.sin(phi); pos.array[k + 2] = H.z + r * Math.cos(phi);
        }
      }
      pos.needsUpdate = true; geo.computeVertexNormals();
      // windows wind down into the doors as the top folds
      const w = Math.min(1, Math.max(0, (t - 0.35) / 0.65));
      for (const m of windows) {
        const c = m.userData.corners, p = m.geometry.attributes.position;
        c.forEach(([x, y, z], i) => { const yy = 0.9 + (y - 0.9) * w; p.setXYZ(i, x + (c[0][0] - x) * (1 - w), yy, z); });
        p.needsUpdate = true; m.visible = w > 0.02;
      }
      void tmp;
    },
  };
}

// Split every triangle into four, `levels` times (flat midpoint subdivision: same shape, more vertices).
function subdivide(geo, levels) {
  let g = geo.index ? geo : geo.toNonIndexed();
  for (let l = 0; l < levels; l++) {
    const names = Object.keys(g.attributes), src = {}, out = {};
    for (const n of names) { src[n] = g.attributes[n]; out[n] = Array.from(src[n].array); }
    const idx = g.index ? g.index.array : [...Array(src.position.count).keys()];
    const mid = new Map(), tris = [];
    const midpoint = (a, b) => {
      const key = a < b ? a * 1e7 + b : b * 1e7 + a;
      let m = mid.get(key);
      if (m === undefined) {
        m = out.position.length / 3;
        for (const n of names) { const sz = src[n].itemSize; for (let k = 0; k < sz; k++) out[n].push((src[n].array[a * sz + k] + src[n].array[b * sz + k]) / 2); }
        mid.set(key, m);
      }
      return m;
    };
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2], ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      tris.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    const ng = new THREE.BufferGeometry();
    for (const n of names) ng.setAttribute(n, new THREE.Float32BufferAttribute(out[n], src[n].itemSize));
    ng.setIndex(tris);
    for (const gr of g.groups) ng.addGroup(gr.start * 4, gr.count * 4, gr.materialIndex);
    g = ng;
  }
  if (g.attributes.normal) { const n = g.attributes.normal; for (let i = 0; i < n.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(n, i).normalize(); n.setXYZ(i, v.x, v.y, v.z); } }
  return g;
}

// Paint with clearcoat, black interior tub, and shut lines drawn analytically in body space.
function paintMaterial(hex, lines = true) {
  const m = new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.38, metalness: 0.0, clearcoat: 0.9, clearcoatRoughness: 0.05, envMapIntensity: 0.6 });
  m.customProgramCacheKey = () => 'mx5paint' + lines;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float dark; attribute float scratch; varying float vDark; varying float vScratch; varying vec3 vLocal; varying vec3 vONormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDark = dark; vScratch = scratch; vLocal = position; vONormal = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vDark; varying float vScratch; varying vec3 vLocal; varying vec3 vONormal;
float scrHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
float gapLine(float d) { return 1.0 - smoothstep(0.0011, 0.0032, abs(d)); }
float shutLines(vec3 p, vec3 n) {
  float L = 0.0;
  float side = step(0.5, abs(n.x));
  float top = step(0.55, n.y);
  float zf = 0.355 + (p.y - 0.5) * 0.07;           // front door shut, slightly raked
  if (side > 0.5 && p.y > 0.24 && p.y < 0.86) { L = max(L, gapLine(p.z - zf)); L = max(L, gapLine(p.z + 0.645)); }
  if (side > 0.5 && p.z < zf && p.z > -0.645 && p.y < 0.4) L = max(L, gapLine(p.y - 0.262));
  if (side > 0.5 && p.y > 0.21 && p.y < 0.6) { L = max(L, gapLine(p.z - 1.64)); L = max(L, gapLine(p.z + 1.67)); }
  if (top > 0.5 && p.z > 0.47 && p.z < 1.86) L = max(L, gapLine(abs(p.x) - 0.69));
  if (top > 0.5 && abs(p.x) < 0.69) { L = max(L, gapLine(p.z - 0.47)); L = max(L, gapLine(p.z - 1.86 + 0.12 * pow(abs(p.x) / 0.69, 4.0))); }
  if (top > 0.5 && p.z < -1.0 && p.z > -1.96) L = max(L, gapLine(abs(p.x) - 0.635));
  if (top > 0.5 && abs(p.x) < 0.635) L = max(L, gapLine(p.z + 1.0));
  if (side > 0.5 && p.x < 0.0) {             // fuel filler door, right rear fender
    vec2 q = abs(vec2(p.z + 1.4, p.y - 0.665)) - vec2(0.07, 0.055);
    L = max(L, gapLine(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0)));
  }
  return L;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012), vDark);
diffuseColor.rgb *= 1.0 - ${lines ? '0.88' : '0.0'} * shutLines(vLocal, normalize(vONormal)) * (1.0 - vDark);
// scraped paint: streaks of bare primer/metal where the body was hit
// light damage dulls the paint; heavy damage scrapes through to primer and bare metal in scuff bands
float band = scrHash(floor(vec2(vLocal.y * 55.0, vLocal.z * 3.0 + vLocal.x * 3.0)));
float scr = vScratch * (1.0 - vDark);
diffuseColor.rgb *= 1.0 - 0.18 * smoothstep(0.0, 0.4, scr);
float bare = smoothstep(0.45, 0.9, scr * (0.6 + 0.8 * band));
diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.30, 0.30, 0.31), vec3(0.17, 0.17, 0.18), band), bare * 0.85);`)
      .replace('#include <clearcoat_normal_fragment_begin>', '#include <clearcoat_normal_fragment_begin>\n')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat *= (1.0 - vDark) * (1.0 - vScratch); material.roughness = mix(material.roughness, 0.85, max(vDark, vScratch * 0.8));');
  };
  return m;
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
const slab = (w, h, r, depth, bevel = 0.004) => new THREE.ExtrudeGeometry(roundedRect(w, h, r), { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });

// ---------------------------------------------------------------- Wheels: 185/60 R14 on 14" "daisy" alloys
function makeWheel(mats) {
  const g = new THREE.Group();
  const R = DIMS.wheelR, W = DIMS.wheelW, rimR = 0.1778;
  // tyre profile (x = radius, y = axial), bead to bead over the tread with shallow grooves
  const prof = [];
  const side = (sgn, dir) => {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([rimR + 0.004 + (R - 0.03 - rimR) * t, sgn * (W / 2 - 0.012 + 0.016 * Math.sin(t * Math.PI))]); }
    return dir > 0 ? pts : pts.reverse();
  };
  prof.push(...side(-1, 1));
  for (let i = 0; i <= 6; i++) { const a = Math.PI / 2 * (i / 6); prof.push([R - 0.03 + 0.03 * Math.sin(a), -(W / 2 - 0.004) + 0.022 * (1 - Math.cos(a)) * 0]); }
  const grooves = [-0.055, -0.018, 0.018, 0.055];
  let yPrev = -(W / 2 - 0.006);
  for (const gy of grooves) {
    prof.push([R, gy - 0.006]); prof.push([R - 0.007, gy - 0.005]); prof.push([R - 0.007, gy + 0.005]); prof.push([R, gy + 0.006]);
    yPrev = gy;
  }
  void yPrev;
  for (let i = 0; i <= 6; i++) { const a = Math.PI / 2 * (1 - i / 6); prof.push([R - 0.03 + 0.03 * Math.sin(a), W / 2 - 0.004]); }
  prof.push(...side(1, -1));
  const tyre = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 48).rotateZ(Math.PI / 2), mats.tyre);
  g.add(tyre);
  // rim barrel
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, W - 0.03, 32, 1, true).rotateZ(Math.PI / 2), mats.rimDark));
  // daisy face: disc with 8 petal-shaped windows
  const face = new THREE.Shape(); face.absarc(0, 0, rimR - 0.004, 0, Math.PI * 2, false);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 8;
    const hole = new THREE.Path();
    hole.absellipse(Math.cos(a) * 0.112, Math.sin(a) * 0.112, 0.044, 0.024, 0, Math.PI * 2, true, a);
    face.holes.push(hole);
  }
  const hubHole = new THREE.Path(); hubHole.absarc(0, 0, 0.03, 0, Math.PI * 2, true); face.holes.push(hubHole);
  const faceGeo = new THREE.ExtrudeGeometry(face, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 2, curveSegments: 20 });
  faceGeo.rotateY(Math.PI / 2);
  const faceM = new THREE.Mesh(faceGeo, mats.rim); faceM.position.x = W / 2 - 0.045; g.add(faceM);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rimR - 0.002, 0.008, 8, 40).rotateY(Math.PI / 2), mats.rim); lip.position.x = W / 2 - 0.016; g.add(lip);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2).scale(0.45, 1, 1), mats.rim);
  cap.position.x = W / 2 - 0.03; g.add(cap);
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2;
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 6).rotateZ(Math.PI / 2), mats.chrome);
    nut.position.set(W / 2 - 0.03, Math.cos(a) * 0.05, Math.sin(a) * 0.05); g.add(nut);
  }
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.118, 0.022, 28).rotateZ(Math.PI / 2), mats.disc);
  disc.position.x = -0.005; g.add(disc);
  return g;
}

export function createMX5(color = 0xb5121b) {
  const mats = {
    paint: paintMaterial(color),
    paintPlain: new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.9, clearcoatRoughness: 0.05, envMapIntensity: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.75 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.4 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.95 }),
    interior: new THREE.MeshStandardMaterial({ color: 0x232220, roughness: 0.92 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 0.85 }),
    carpet: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 1 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.1, metalness: 1 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xa9abae, roughness: 0.3, metalness: 0.9 }),
    rimDark: new THREE.MeshStandardMaterial({ color: 0x8a8c90, roughness: 0.4, metalness: 0.8, side: THREE.DoubleSide }),
    disc: new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 0.55, metalness: 0.7 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9, side: THREE.DoubleSide }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xb8ccd6, roughness: 0.03, metalness: 0.0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, envMapIntensity: 1.2 }),
    mirrorGlass: new THREE.MeshStandardMaterial({ color: 0x9aa6b0, roughness: 0.02, metalness: 1 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xf0f0e8, emissive: 0xfff3d0, emissiveIntensity: 0, roughness: 0.1, metalness: 0.5 }),
    tail: new THREE.MeshPhysicalMaterial({ color: 0x9a0c0c, emissive: 0xff1a0a, emissiveIntensity: 0.15, roughness: 0.15, clearcoat: 1 }),
    amber: new THREE.MeshPhysicalMaterial({ color: 0xe08a1c, emissive: 0xff8a00, emissiveIntensity: 0.04, roughness: 0.15, clearcoat: 1 }),
    reverse: new THREE.MeshPhysicalMaterial({ color: 0xe8e8e8, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.1, clearcoat: 1 }),
    plate: new THREE.MeshStandardMaterial({ color: 0xf2f0e6, roughness: 0.5 }),
    gauge: null,
    hull: new THREE.MeshPhysicalMaterial({ color: 0xf2f0ea, roughness: 0.35, clearcoat: 0.6 }),
    antifoul: new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.6 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.4, metalness: 0.8 }),
    prop: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, side: THREE.DoubleSide }),
    brokenLamp: new THREE.MeshStandardMaterial({ color: 0x2a1512, roughness: 0.6 }),
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const shell = new THREE.Mesh(buildBodyGeometry(), mats.paint);
  const skins = [];
  // off: where the skin's own origin sits in body space (parts like lamps keep a local origin for effects)
  // node: the part's group when it has its own origin/rotation (lamps, hinged panels); dents are applied in its frame
  const addSkin = (g, node = null) => skins.push({ geo: g, node, orig: Float32Array.from(g.attributes.position.array), origN: Float32Array.from(g.attributes.normal.array), adj: null });
  const _pl = new THREE.Vector3(), _dl = new THREE.Vector3(), _mInv = new THREE.Matrix4(), _qInv = new THREE.Quaternion();
  let realBodyRef = null, transformer = null;
  // body space -> the skin's own frame (its mesh/group may sit on hinges or the mech rig)
  const toLocal = (t, pb, db) => {
    t.node.updateWorldMatrix(true, false);
    _mInv.copy(t.node.matrixWorld);
    if (realBodyRef) _mInv.premultiply(new THREE.Matrix4().copy(realBodyRef.matrixWorld).invert());
    _mInv.invert();
    _pl.copy(pb).applyMatrix4(_mInv); if (db) _dl.copy(db).transformDirection(_mInv);
  };
  const under = (o, g) => { while (o) { if (o === g) return true; o = o.parent; } return false; };
  addSkin(shell.geometry);
  // Recompute normals only around a dent. Face normals are flipped to agree with the factory normals,
  // so models with mixed triangle winding or hand-tuned normals keep their shading elsewhere.
  function localNormals(t, p, R) {
    const g = t.geo, pa = g.attributes.position.array, na = g.attributes.normal.array, on = t.origN;
    const idx = t.faces || (g.index ? g.index.array : null), nTri = idx ? idx.length / 3 : pa.length / 9;
    const vi = (f, k) => (idx ? idx[f * 3 + k] : f * 3 + k);
    if (!t.adj) {           // vertex -> faces (CSR)
      const nV = pa.length / 3, cnt = new Uint32Array(nV + 1);
      for (let f = 0; f < nTri; f++) for (let k = 0; k < 3; k++) cnt[vi(f, k) + 1]++;
      for (let v = 0; v < nV; v++) cnt[v + 1] += cnt[v];
      const list = new Uint32Array(cnt[nV]), fill = cnt.slice(0, nV);
      for (let f = 0; f < nTri; f++) for (let k = 0; k < 3; k++) list[fill[vi(f, k)]++] = f;
      t.adj = { start: cnt, list };
    }
    const R2 = (R + 0.05) * (R + 0.05), { start, list } = t.adj;
    for (let v = 0; v < pa.length / 3; v++) {
      const dx = pa[v * 3] - p.x, dy = pa[v * 3 + 1] - p.y, dz = pa[v * 3 + 2] - p.z;
      if (dx * dx + dy * dy + dz * dz > R2) continue;
      let sx = 0, sy = 0, sz = 0;
      for (let j = start[v]; j < start[v + 1]; j++) {
        const f = list[j], a = vi(f, 0) * 3, b = vi(f, 1) * 3, c = vi(f, 2) * 3;
        const ux = pa[b] - pa[a], uy = pa[b + 1] - pa[a + 1], uz = pa[b + 2] - pa[a + 2];
        const wx = pa[c] - pa[a], wy = pa[c + 1] - pa[a + 1], wz = pa[c + 2] - pa[a + 2];
        let cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
        if (cx * on[v * 3] + cy * on[v * 3 + 1] + cz * on[v * 3 + 2] < 0) { cx = -cx; cy = -cy; cz = -cz; }
        sx += cx; sy += cy; sz += cz;
      }
      const l = Math.hypot(sx, sy, sz);
      if (l > 1e-12) { na[v * 3] = sx / l; na[v * 3 + 1] = sy / l; na[v * 3 + 2] = sz / l; }
    }
    g.attributes.normal.needsUpdate = true;
    if (t.extra) for (const e of t.extra) e.attributes.normal.needsUpdate = true;
  }
  let real = null, realSteer = null;
  const blinkMats = {}, frontLensMats = {};
  const paintMats = [], rimMats = [];   // garage: everything painted body colour, and the wheels' finish
  const bumpers = {}, crashStruct = {};
  const panels = { doors: {}, hood: null, boot: null };  // hinged panels that crashes can spring open  // detachable bumper covers and what sits behind them (detailed model)
  const _eyeT = new THREE.Vector3(), _eyeV2 = new THREE.Vector3(0.37, 0.53, -0.42), _eyeOld = new THREE.Vector3(0.31, 0.62, -0.32);  // per side (1 = left/driver, -1 = right), filled by the detailed model
  shell.castShadow = true; shell.receiveShadow = true;
  body.add(shell);

  const add = (geo, mat, x, y, z, parent = body, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = true; parent.add(m); return m;
  };

  // --- wheel wells (dark liners hide the inside of the arches)
  for (const az of [DIMS.frontZ, DIMS.rearZ]) for (const sx of [1, -1]) {
    const well = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.34, 28, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1, side: THREE.DoubleSide }));
    well.position.set(sx * 0.66, DIMS.wheelR, az); body.add(well);
  }
  // --- fender lips round each arch (crisp edge over the wheel)
  for (const az of [DIMS.frontZ, DIMS.rearZ]) for (const sx of [1, -1]) {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const a = Math.PI * (0.03 + 0.94 * i / 40);
      const z = az + Math.cos(a) * 0.372, y = DIMS.wheelR + Math.sin(a) * 0.372;
      pts.push(new THREE.Vector3(sx * (sideX(z, y) - 0.008), y, z));
    }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.014, 6, false), mats.paintPlain, 0, 0, 0);
  }
  // --- underbody, front lip, rear valance
  add(new THREE.BoxGeometry(1.46, 0.05, 3.5), mats.dark, 0, 0.215, 0);
  add(new THREE.BoxGeometry(1.1, 0.03, 0.1), mats.trim, 0, 0.235, 1.93);
  add(new THREE.BoxGeometry(1.2, 0.07, 0.06), mats.trim, 0, 0.33, -1.985);

  // --- cockpit rim (padded edge round the opening)
  {
    const pts = [];
    const cz = (CP.z0 + CP.z1) / 2, hz = (CP.z1 - CP.z0) / 2 - 0.012, hw = CP.hw - 0.012, r = CP.r;
    // superellipse loop starting at the front-left corner so the gap under the windscreen falls at the ends
    for (let i = 0; i <= 96; i++) {
      const a = Math.PI / 2 + 0.42 + i / 96 * (Math.PI * 2 - 0.84);
      const c = Math.cos(a), s = Math.sin(a);
      const x = Math.sign(c) * Math.pow(Math.abs(c), 0.35) * hw, z = cz + Math.sign(s) * Math.pow(Math.abs(s), 0.35) * hz;
      void r;
      pts.push(new THREE.Vector3(x, topY(z, x) + 0.004, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts, false);
    add(new THREE.TubeGeometry(curve, 140, 0.016, 8, false), mats.rubber, 0, 0, 0);
  }

  // --- interior
  const cabin = new THREE.Group(); body.add(cabin);
  add(new THREE.BoxGeometry(1.26, 0.03, 1.0), mats.carpet, 0, 0.385, -0.16, cabin);
  // door cards
  for (const sx of [1, -1]) {
    add(new THREE.BoxGeometry(0.03, 0.38, 0.95), mats.interior, sx * 0.635, 0.62, -0.15, cabin);
    add(new THREE.BoxGeometry(0.05, 0.03, 0.3), mats.trim, sx * 0.615, 0.7, -0.05, cabin);      // armrest
    add(new THREE.BoxGeometry(0.02, 0.025, 0.06), mats.chrome, sx * 0.615, 0.76, 0.12, cabin);  // door release
  }
  // seats (extruded side profile)
  {
    const sp = new THREE.Shape();
    sp.moveTo(0.27, 0.03); sp.lineTo(0.28, 0.13); sp.quadraticCurveTo(0.1, 0.16, -0.1, 0.1);
    sp.lineTo(-0.19, 0.5); sp.quadraticCurveTo(-0.2, 0.62, -0.22, 0.66); sp.quadraticCurveTo(-0.26, 0.74, -0.32, 0.68);
    sp.lineTo(-0.34, 0.12); sp.lineTo(-0.27, 0.03); sp.closePath();
    const seatGeo = new THREE.ExtrudeGeometry(sp, { depth: 0.44, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 3, curveSegments: 8 });
    seatGeo.rotateY(-Math.PI / 2); seatGeo.translate(0.22, 0, 0);
    for (const sx of [1, -1]) {
      const seat = add(seatGeo, mats.seat, sx * 0.30, 0.38, -0.22, cabin, 0.03);
      seat.receiveShadow = true;
    }
  }
  // dashboard
  {
    const dp = new THREE.Shape();
    dp.moveTo(0.42, 0.56); dp.lineTo(0.42, 0.82); dp.quadraticCurveTo(0.3, 0.86, 0.17, 0.82); dp.quadraticCurveTo(0.1, 0.78, 0.1, 0.7);
    dp.lineTo(0.16, 0.56); dp.closePath();
    const dg = new THREE.ExtrudeGeometry(dp, { depth: 1.22, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
    dg.rotateY(-Math.PI / 2); dg.translate(0.61, 0, 0);
    add(dg, mats.interior, 0, 0, 0, cabin);
    // gauge binnacle hood (driver side)
    const hood = new THREE.CylinderGeometry(0.13, 0.13, 0.13, 20, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2);
    add(hood, new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.8, side: THREE.DoubleSide }), 0.31, 0.79, 0.15, cabin);
    // dials (canvas drawn, glow at night)
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g2 = c.getContext('2d');
    g2.fillStyle = '#050505'; g2.fillRect(0, 0, 512, 256);
    for (const [cx, max, maj] of [[128, 8, 1], [384, 140, 20]]) {
      g2.strokeStyle = '#ddd'; g2.lineWidth = 4; g2.beginPath(); g2.arc(cx, 128, 116, 0, Math.PI * 2); g2.stroke();
      for (let v = 0; v <= max; v += maj / 2) {
        const a = Math.PI * 0.75 + Math.PI * 1.5 * v / max, major = (v / maj) % 1 === 0;
        g2.lineWidth = major ? 5 : 2;
        g2.beginPath(); g2.moveTo(cx + Math.cos(a) * (major ? 86 : 96), 128 + Math.sin(a) * (major ? 86 : 96)); g2.lineTo(cx + Math.cos(a) * 108, 128 + Math.sin(a) * 108); g2.stroke();
        if (major) { g2.fillStyle = '#eee'; g2.font = 'bold 26px sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(String(v), cx + Math.cos(a) * 64, 128 + Math.sin(a) * 64); }
      }
      g2.strokeStyle = '#ff7a1a'; g2.lineWidth = 6; g2.beginPath(); g2.moveTo(cx, 128); g2.lineTo(cx + Math.cos(Math.PI * 0.85) * 90, 128 + Math.sin(Math.PI * 0.85) * 90); g2.stroke();
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    mats.gauge = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.4 });
    add(new THREE.PlaneGeometry(0.24, 0.12).rotateY(Math.PI), mats.gauge, 0.31, 0.78, 0.2, cabin, 0.12);
    // round air vents — an NA signature
    for (const vx of [0.075, -0.075, 0.56, -0.56]) {
      add(new THREE.TorusGeometry(0.036, 0.008, 8, 20), mats.chrome, vx, 0.72, 0.135, cabin);
      add(new THREE.CircleGeometry(0.034, 20).rotateY(Math.PI), mats.dark, vx, 0.72, 0.14, cabin);
      add(new THREE.BoxGeometry(0.06, 0.006, 0.01), mats.trim, vx, 0.72, 0.13, cabin);
    }
    // centre console, gear lever, handbrake, radio
    add(new THREE.BoxGeometry(0.2, 0.2, 0.75), mats.interior, 0, 0.48, -0.08, cabin);
    add(new THREE.BoxGeometry(0.18, 0.05, 0.02), mats.trim, 0, 0.64, 0.16, cabin);
    add(new THREE.ConeGeometry(0.045, 0.1, 10), mats.rubber, 0, 0.62, 0.02, cabin);
    add(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), mats.chrome, 0, 0.69, 0.02, cabin);
    add(new THREE.SphereGeometry(0.028, 14, 10), mats.rubber, 0, 0.76, 0.02, cabin);
    add(new THREE.BoxGeometry(0.03, 0.03, 0.22), mats.trim, -0.06, 0.6, -0.22, cabin, 0.25);
  }
  // steering wheel (4-spoke) on a column
  const steer = new THREE.Group();
  steer.position.set(0.31, 0.775, 0.06); steer.rotation.x = -0.38;
  body.add(steer);
  add(new THREE.TorusGeometry(0.183, 0.016, 10, 40), mats.rubber, 0, 0, 0, steer);
  add(new THREE.CylinderGeometry(0.05, 0.055, 0.04, 16).rotateX(Math.PI / 2), mats.trim, 0, 0, 0.0, steer);
  for (const a of [0.35, Math.PI - 0.35, Math.PI + 0.55, -0.55]) {
    const sp = add(new THREE.BoxGeometry(0.15, 0.025, 0.012), mats.trim, Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0, steer);
    sp.rotation.z = a;
  }
  add(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8).rotateX(Math.PI / 2), mats.trim, 0.31, 0.81, 0.18, body, -0.38);

  // --- folded soft top under its boot cover
  add(new THREE.CapsuleGeometry(0.1, 1.08, 4, 16).rotateZ(Math.PI / 2).scale(1, 0.75, 1.25), mats.rubber, 0, 0.885, -0.74);
  add(new THREE.BoxGeometry(0.02, 0.06, 0.05), mats.chrome, 0.64, 0.88, -0.7);
  add(new THREE.BoxGeometry(0.02, 0.06, 0.05), mats.chrome, -0.64, 0.88, -0.7);

  let crackCanvas, crackTex, crackMesh;
  // --- windscreen: curved glass in a black frame
  const ws = new THREE.Group(); ws.position.set(0, topY(0.36) - 0.005, 0.355); ws.rotation.x = -0.99; body.add(ws);
  {
    const wsH = 0.46, wB = 1.3, wT = 1.18;
    const bend = (geo) => {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, p.getZ(i) - 0.07 * x * x - 0.02 * y); }
      geo.computeVertexNormals(); return geo;
    };
    const outline = (w0, w1, h, r) => {
      const s = new THREE.Shape();
      s.moveTo(-w0 / 2 + r, 0); s.lineTo(w0 / 2 - r, 0); s.quadraticCurveTo(w0 / 2, 0, w0 / 2 - 0.004, r);
      s.lineTo(w1 / 2, h - r); s.quadraticCurveTo(w1 / 2, h, w1 / 2 - r, h); s.lineTo(-w1 / 2 + r, h);
      s.quadraticCurveTo(-w1 / 2, h, -w1 / 2, h - r); s.lineTo(-w0 / 2 + 0.004, r); s.quadraticCurveTo(-w0 / 2, 0, -w0 / 2 + r, 0);
      return s;
    };
    const frame = outline(wB, wT, wsH, 0.06);
    const inner = outline(wB - 0.08, wT - 0.08, wsH - 0.07, 0.04);
    const hole = new THREE.Path(inner.getPoints(8).map((p) => new THREE.Vector2(p.x, p.y + 0.035)).reverse());
    frame.holes.push(hole);
    const fg = bend(new THREE.ExtrudeGeometry(frame, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 8 }).translate(0, 0, -0.012));
    add(fg, mats.trim, 0, 0, 0, ws);
    const gg = bend(new THREE.ShapeGeometry(outline(wB - 0.06, wT - 0.06, wsH - 0.05, 0.05), 8).translate(0, 0.025, 0));
    const glass = add(gg, mats.glass, 0, 0, 0, ws); glass.castShadow = false;
    // crack overlay (drawn on impact)
    crackCanvas = document.createElement('canvas'); crackCanvas.width = 512; crackCanvas.height = 192;
    crackTex = new THREE.CanvasTexture(crackCanvas); crackTex.colorSpace = THREE.SRGBColorSpace;
    const cg = gg.clone();
    { const p = cg.attributes.position, uv = cg.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + wB / 2) / wB, p.getY(i) / wsH); }
    crackMesh = add(cg, new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }), 0, 0, -0.002, ws);
    crackMesh.castShadow = false; crackMesh.visible = false;
    // rear-view mirror
    add(new THREE.BoxGeometry(0.2, 0.065, 0.025), mats.trim, 0, wsH - 0.09, -0.05, ws);
    add(new THREE.BoxGeometry(0.19, 0.055, 0.005), mats.mirrorGlass, 0, wsH - 0.09, -0.064, ws);
    // sun visors folded
    for (const sx of [0.3, -0.3]) add(new THREE.BoxGeometry(0.34, 0.12, 0.015), mats.interior, sx, wsH - 0.1, -0.025, ws);
  }
  // cowl vent and wipers
  add(new THREE.BoxGeometry(1.16, 0.006, 0.07), mats.trim, 0, topY(0.43) + 0.002, 0.43);
  for (const [wx, ang] of [[0.42, 0.12], [-0.12, 0.12]]) {
    const wiper = add(new THREE.BoxGeometry(0.5, 0.012, 0.018), mats.trim, wx, topY(0.4) + 0.025, 0.4);
    wiper.rotation.set(0, ang, -0.04);
  }

  // --- door mirrors (NA "bullet" housings on the door corners)
  const mirrors = {};
  for (const sx of [1, -1]) {
    const bx = sideX(0.27, 0.84) * sx;
    const mg = new THREE.Group(); body.add(mg); mirrors[sx] = mg;
    const addM = (geo, mat, x, y, z, parent, rx = 0, ry = 0, rz = 0) => add(geo, mat, x, y, z, mg, rx, ry, rz);
    addM(new THREE.BoxGeometry(0.05, 0.05, 0.12), mats.trim, bx, 0.85, 0.27, body, 0, 0, sx * 0.3);
    // base plate on the door corner, short arm, rounded housing
    addM(slab(0.09, 0.07, 0.02, 0.012, 0.003), mats.trim, bx + sx * 0.006, 0.875, 0.28, body, 0, sx * Math.PI / 2);
    addM(new THREE.BoxGeometry(0.07, 0.025, 0.05), mats.trim, bx + sx * 0.04, 0.9, 0.275, body, 0, 0, sx * 0.35);
    const hx = bx + sx * 0.12;
    const housing = addM(new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62).rotateX(Math.PI / 2).scale(0.082, 0.05, 0.065), mats.paintPlain, hx, 0.93, 0.25);
    housing.rotation.y = sx * 0.1;
    addM(new THREE.CircleGeometry(1, 24).scale(0.073, 0.043, 1).rotateY(Math.PI), mats.mirrorGlass, hx, 0.93, 0.228, body, 0, sx * 0.1);
  }
  // --- door handles, side markers, antenna
  for (const sx of [1, -1]) {
    const hx = sideX(-0.5, 0.72) * sx;
    add(slab(0.11, 0.028, 0.012, 0.006, 0.002), mats.trim, hx + sx * 0.002, 0.72, -0.5, body, 0, sx * Math.PI / 2);
    const fx = sideX(1.72, 0.47) * sx;
    add(slab(0.07, 0.035, 0.015, 0.006, 0.002), mats.amber, fx, 0.47, 1.72, body, 0, sx * (Math.PI / 2 - 0.35));
    const rx = sideX(-1.74, 0.5) * sx;
    add(slab(0.07, 0.035, 0.015, 0.006, 0.002), mats.tail, rx, 0.5, -1.74, body, 0, sx * (Math.PI / 2 + 0.3));
  }
  add(new THREE.CylinderGeometry(0.003, 0.004, 0.42, 5), mats.chrome, -0.68, topY(-1.25, 0.68) + 0.2, -1.25, body, -0.25);

  const frontLamps = {};
  // --- nose: intake "smile", turn/park lamps, badge
  const noseZ = Z_MAX + 0.004;
  add(new THREE.CapsuleGeometry(0.058, 0.46, 6, 16).rotateZ(Math.PI / 2).scale(1, 1, 0.5), mats.dark, 0, 0.33, noseZ - 0.02);
  for (let i = -2; i <= 2; i++) add(new THREE.BoxGeometry(0.5, 0.006, 0.01), mats.trim, 0, 0.33 + i * 0.02, noseZ + 0.006);
  for (const sx of [1, -1]) {
    const lamp = add(slab(0.17, 0.05, 0.022, 0.012, 0.003), mats.amber, sx * 0.4, 0.4, 1.972, body, 0, sx * 0.45);
    lamp.userData.mat = mats.amber; frontLamps[sx] = lamp;
    lamp.renderOrder = 1;
  }
  add(new THREE.TorusGeometry(0.03, 0.006, 6, 20).scale(1.3, 1, 1), mats.chrome, 0, 0.47, 1.985, body, -0.3);

  // --- tail: oval NA lamp clusters (reverse | turn | tail/brake), plate recess, exhaust
  const tailLights = [];
  const tailSides = {};
  for (const sx of [1, -1]) {
    const grp = new THREE.Group(); grp.position.set(sx * 0.43, 0.675, Z_MIN - 0.004); grp.rotation.y = Math.PI + sx * 0.12; grp.scale.setScalar(1.12); body.add(grp);
    add(slab(0.44, 0.15, 0.065, 0.01, 0.004), mats.trim, 0, 0, -0.004, grp);
    // in group space +x points to the car's -x (rotated by PI): outermost segment is at -sx side
    const segs = [[0.2, mats.tail, 0.11], [0.1, mats.amber, -0.045], [0.09, mats.reverse, -0.145]];
    tailSides[sx] = [];
    for (const [w, m, off] of segs) {
      const s = add(slab(w, 0.12, 0.045, 0.012, 0.004), m, -sx * off, 0, 0.004, grp);
      s.userData.mat = m;
      tailSides[sx].push(s);
      if (m === mats.tail) tailLights.push(s);
    }
  }
  add(slab(0.36, 0.15, 0.015, 0.01, 0), mats.dark, 0, 0.58, Z_MIN - 0.002, body, 0, Math.PI);
  add(new THREE.PlaneGeometry(0.33, 0.12).rotateY(Math.PI), mats.plate, 0, 0.58, Z_MIN - 0.016);
  add(new THREE.CylinderGeometry(0.032, 0.032, 0.14, 14).rotateX(Math.PI / 2), mats.chrome, -0.42, 0.28, Z_MIN - 0.02);
  add(new THREE.CylinderGeometry(0.024, 0.024, 0.142, 14).rotateX(Math.PI / 2), mats.dark, -0.42, 0.28, Z_MIN - 0.021);

  // --- pop-up headlights: lid follows the hood, lamp on the pod's underside faces forward when raised
  const popups = [];
  for (const sx of [1, -1]) {
    const pz = 1.43, podW = 0.31, podL = 0.26, podH = 0.17, px = 0.5;
    const pivot = new THREE.Group();
    pivot.position.set(sx * px, topY(pz, px) - 0.002, pz);
    pivot.rotation.set(0.14, 0, -sx * 0.085);
    body.add(pivot);
    const lidGeo = slab(podW, podL, 0.035, 0.022, 0.006).rotateX(-Math.PI / 2).translate(0, -0.028, podL / 2);
    add(lidGeo, mats.paintPlain, 0, 0, 0, pivot);
    add(new THREE.BoxGeometry(podW - 0.03, podH, podL - 0.04), mats.trim, 0, -podH / 2 - 0.02, podL / 2, pivot);
    const lens = add(new THREE.CircleGeometry(0.075, 28), mats.lamp.clone(), 0, -podH - 0.025, podL / 2 + 0.005, pivot, Math.PI / 2);
    add(new THREE.TorusGeometry(0.079, 0.008, 6, 28), mats.chrome, 0, -podH - 0.026, podL / 2 + 0.005, pivot, Math.PI / 2);
    const spot = new THREE.SpotLight(0xfff1d6, 0, 120, 0.42, 0.45, 1.6);
    spot.position.set(0, -podH - 0.03, podL / 2);
    const tgt = new THREE.Object3D(); tgt.position.set(0, -podH - 5, podL / 2 - 0.4);
    pivot.add(spot, tgt);
    spot.target = tgt;
    popups.push({ pivot, lens, spot, broken: false, stuck: 0, side: sx });
  }

  // --- wheels
  const wheels = [];
  const wheelDefs = [
    { x: DIMS.track / 2, z: DIMS.frontZ, front: true, side: 1 },
    { x: -DIMS.track / 2, z: DIMS.frontZ, front: true, side: -1 },
    { x: DIMS.track / 2, z: DIMS.rearZ, front: false, side: 1 },
    { x: -DIMS.track / 2, z: DIMS.rearZ, front: false, side: -1 },
  ];
  for (const d of wheelDefs) {
    const mount = new THREE.Group(); // suspension travel + retraction
    mount.position.set(d.x, DIMS.wheelR, d.z);
    const steerG = new THREE.Group(); mount.add(steerG);
    const wg = makeWheel(mats);
    if (d.side < 0) wg.rotation.y = Math.PI; // rim face outward
    const spin = new THREE.Group(); spin.add(wg); steerG.add(spin);
    // brake caliper (doesn't spin)
    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.07), mats.metal);
    cal.position.set(d.side * 0.005, 0.085, d.front ? -0.06 : 0.06); steerG.add(cal);
    wg.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    root.add(mount);
    wheels.push({ ...d, mount, steerG, spin, baseY: DIMS.wheelR });
  }

  // ======== BOAT KIT ========
  const boat = new THREE.Group();
  body.add(boat);
  {
    // V-hull lofted below body
    const NZ = 40, pts = [], idx = [];
    const z0 = -2.15, z1 = 2.45;
    const ring = 9;
    for (let a = 0; a <= NZ; a++) {
      const u = a / NZ, z = z0 + (z1 - z0) * u;
      const bow = Math.pow(Math.max(0, (u - 0.62) / 0.38), 1.6);
      const hw = 0.98 * (1 - 0.92 * bow) * (u < 0.04 ? 0.85 + u * 3.7 : 1);
      const keel = -0.42 + 0.62 * bow * bow + (u < 0.05 ? (0.05 - u) * 2 : 0);
      const chine = keel + 0.22 * (1 - bow * 0.6);
      const deck = 0.32 + 0.12 * bow;
      // cross-section: deck L, chine L, keel, chine R, deck R (+ more for smooth)
      const sec = [[hw, deck], [hw * 1.0, chine + 0.12], [hw * 0.92, chine], [hw * 0.45, (keel + chine) / 2 - 0.02], [0, keel],
        [-hw * 0.45, (keel + chine) / 2 - 0.02], [-hw * 0.92, chine], [-hw * 1.0, chine + 0.12], [-hw, deck]];
      for (const [x, y] of sec) pts.push(x, y, z);
    }
    for (let a = 0; a < NZ; a++) for (let b = 0; b < ring - 1; b++) {
      const i0 = a * ring + b, i1 = i0 + 1, i2 = i0 + ring, i3 = i2 + 1;
      idx.push(i0, i2, i1, i1, i2, i3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const hull = new THREE.Mesh(g, mats.hull); hull.castShadow = true; hull.material.side = THREE.DoubleSide;
    boat.add(hull);
    // boot-top stripe
    const stripe = new THREE.Mesh(g.clone(), mats.antifoul);
    stripe.scale.set(1.002, 0.55, 1.0); stripe.position.y = -0.2;
    boat.add(stripe);
    // outboard motor
    const ob = new THREE.Group(); ob.position.set(0, 0.45, -2.2); boat.add(ob);
    add(new THREE.BoxGeometry(0.42, 0.5, 0.5), mats.paintPlain, 0, 0.25, -0.1, ob);
    add(new THREE.BoxGeometry(0.44, 0.06, 0.52), mats.trim, 0, 0.0, -0.1, ob);
    add(new THREE.BoxGeometry(0.1, 0.9, 0.18), mats.metal, 0, -0.45, -0.12, ob);
    add(new THREE.CylinderGeometry(0.06, 0.05, 0.36, 10), mats.metal, 0, -0.85, -0.05, ob, Math.PI / 2);
    const bprop = new THREE.Group(); bprop.position.set(0, -0.85, -0.25); ob.add(bprop);
    for (let i = 0; i < 3; i++) {
      const blade = add(new THREE.BoxGeometry(0.04, 0.17, 0.01), mats.metal, 0, 0, 0, bprop);
      blade.geometry.translate(0, 0.09, 0); blade.rotation.z = i * Math.PI * 2 / 3; blade.rotation.y = 0.5;
    }
    boat.userData = { ob, prop: bprop };
  }

  // ======== PLANE KIT ========
  const plane = new THREE.Group();
  body.add(plane);
  const ailerons = [];
  const wings = [];
  {
    const wingMat = new THREE.MeshPhysicalMaterial({ color: 0xeeeeee, roughness: 0.35, clearcoat: 0.5, side: THREE.DoubleSide });
    for (const sx of [1, -1]) {
      const root2 = new THREE.Group(); root2.position.set(sx * 0.8, 0.5, -0.05); plane.add(root2);
      const span = 3.7, chordR = 1.8, chordT = 1.1;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.55); shape.lineTo(span, 0.32); shape.lineTo(span, 0.32 - chordT); shape.lineTo(0, 0.55 - chordR); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
      geo.rotateX(Math.PI / 2); geo.translate(0, 0.045, 0);
      if (sx < 0) geo.scale(-1, 1, 1);
      const w = new THREE.Mesh(geo, wingMat); w.castShadow = true;
      // red wingtip
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, chordT + 0.05), mats.paintPlain);
      tip.position.set(sx * span, 0, 0.32 - chordT / 2);
      const nav = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshStandardMaterial({ color: sx > 0 ? 0xff2020 : 0x20ff40, emissive: sx > 0 ? 0xff0000 : 0x00ff30, emissiveIntensity: 2 }));
      nav.position.set(sx * (span + 0.04), 0, 0.32 - chordT / 2);
      const wingG = new THREE.Group(); wingG.add(w, tip, nav); root2.add(wingG);
      // aileron
      const ailPivot = new THREE.Group(); ailPivot.position.set(sx * span * 0.72, 0, 0.32 - chordT - 0.06 + 0.02); wingG.add(ailPivot);
      const ail = new THREE.Mesh(new THREE.BoxGeometry(span * 0.5, 0.06, 0.3), wingMat); ail.position.z = -0.15; ail.castShadow = true;
      ailPivot.add(ail);
      ailerons.push({ pivot: ailPivot, side: sx });
      wings.push({ group: wingG, side: sx });
    }
    // tail boom + empennage
    const tail = new THREE.Group(); tail.position.set(0, 0.7, -1.9); plane.add(tail);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 2.6, 10).rotateX(Math.PI / 2).translate(0, 0, -1.3), mats.metal);
    boom.castShadow = true; tail.add(boom);
    const hstab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 0.6), wingMat); hstab.position.set(0, 0.05, -2.45); hstab.castShadow = true; tail.add(hstab);
    const elevPivot = new THREE.Group(); elevPivot.position.set(0, 0.05, -2.75); tail.add(elevPivot);
    const elev = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.05, 0.32), mats.paintPlain); elev.position.z = -0.16; elevPivot.add(elev);
    const finShape = new THREE.Shape(); finShape.moveTo(0, 0); finShape.lineTo(0.75, 0); finShape.lineTo(0.35, 1.1); finShape.lineTo(0.05, 1.1); finShape.closePath();
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.05, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-0.025, 0.05, -2.15), wingMat);
    fin.castShadow = true; tail.add(fin);
    const rudPivot = new THREE.Group(); rudPivot.position.set(0, 0.1, -2.92); tail.add(rudPivot);
    const rud = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.26), mats.paintPlain); rud.position.set(0, 0.5, -0.13); rudPivot.add(rud);
    plane.userData.tail = tail;
    plane.userData.elevator = elevPivot;
    plane.userData.rudder = rudPivot;
    // nose propeller
    const propG = new THREE.Group(); propG.position.set(0, 0.42, 2.12); plane.add(propG);
    add(new THREE.ConeGeometry(0.13, 0.28, 16).rotateX(Math.PI / 2), mats.chrome, 0, 0, 0.1, propG);
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8).rotateX(Math.PI / 2), mats.metal, 0, 0, -0.08, propG);
    const blades = new THREE.Group(); propG.add(blades);
    for (let i = 0; i < 2; i++) {
      const bg = new THREE.BoxGeometry(0.1, 0.9, 0.02); bg.translate(0, 0.47, 0);
      const bl = add(bg, mats.prop, 0, 0, 0, blades); bl.rotation.z = i * Math.PI; bl.rotation.y = 0.35;
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.95, 32), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }));
    propG.add(disc);
    plane.userData.prop = blades; plane.userData.propDisc = disc; plane.userData.propG = propG;
  }

  // CoM offset: model origin is at ground, physics CoM is 0.46 m up
  const COM_Y = 0.46;
  body.position.y = -COM_Y;
  for (const w of wheels) w.mount.position.y -= COM_Y;

  let softTop = buildSoftTop(mats); body.add(softTop.group); softTop.set(0);
  const mech = createMech(mats); root.add(mech.group);
  const state = { mechT: 0, footfall: false, lights: false, lightT: 0, boatT: 0, planeT: 0, brake: 0, reverse: false, wingsLost: false, topUp: false, topT: 0, blink: 0, blinkT: 0, blinkOn: false };

  function setMorph(boatT, planeT, mechT = 0) {
    state.boatT = boatT; state.planeT = planeT; state.mechT = mechT;
    // mech: the car body folds away into the robot's torso while the armour pieces fly out
    if (transformer) { body.scale.setScalar(1); body.position.y = -COM_Y; body.visible = true; for (const w of wheels) w.mount.visible = mechT <= 0.01; }
    else {
      const fold = smooth(0.08, 0.55, mechT), sc = Math.max(0.001, 1 - fold);
      body.scale.setScalar(sc); body.position.y = -COM_Y + fold * 1.6; body.visible = sc > 0.01;
      for (const w of wheels) w.mount.visible = mechT < 0.25;
    }
    const e = (t) => t * t * (3 - 2 * t);
    const b = e(boatT), p = e(planeT);
    boat.visible = boatT > 0.001;
    if (real) { boat.scale.set(1, Math.max(0.01, b), 1); boat.position.y = 0.33 * (1 - b); }  // hull grows down out of the sills
    else { boat.scale.set(0.3 + 0.7 * b, b, 0.6 + 0.4 * b); boat.position.y = -0.3 * (1 - b); }
    boat.userData.ob.rotation.x = (1 - b) * -1.2;
    plane.visible = planeT > 0.001;
    for (const w of wings) {
      w.group.visible = !state.wingsLost;
      const unfold = Math.min(1, p * 1.4);
      w.group.scale.set(0.02 + 0.98 * unfold, 1, 1);
      w.group.rotation.z = w.side * (1 - unfold) * 1.2;
    }
    plane.userData.tail.scale.set(Math.max(0.01, p), Math.max(0.01, p), Math.max(0.01, p));
    plane.userData.propG.scale.setScalar(Math.max(0.01, Math.min(1, p * 1.3)));
    // wheels tuck up sideways in boat mode
    for (const w of wheels) {
      w.retract = b;
      if (w.caliper) w.caliper.visible = b < 0.02;
      w.spin.rotation.z = w.side * b * Math.PI / 2 * 0.98;
    }
  }
  setMorph(0, 0);

  // ---- detailed model v2: Res1n's 1989 MX-5 (CC-BY-4.0), already split into named parts in body space
  // (see tools/export_v2.js). Positions arrive quantized (meshopt); everything is converted back to float.
  // closed pose of each pop-up, fitted so the lid lies flush with the hood (rms 1.2 mm): pitch about the hinge,
  // a little roll to follow the wing's crown, hinge 27 mm higher. Animating with a slerp keeps it one fixed axis.
  const _qId = new THREE.Quaternion();
  const POD_CLOSE = { pitch: 0.955, roll: 0.25, lift: 0.0275 };
  const KNEE_CUT = -1.4;  // where the mech's thighs end and shins begin (car z)
  function floatMesh(mesh) {
    const g = mesh.geometry;
    for (const k of Object.keys(g.attributes)) {
      const a = g.attributes[k];
      if (a.isInterleavedBufferAttribute || a.normalized || !(a.array instanceof Float32Array)) {
        const n = a.count, sz = a.itemSize, f = new Float32Array(n * sz), get = ['getX', 'getY', 'getZ', 'getW'];
        for (let i = 0; i < n; i++) for (let j = 0; j < sz; j++) f[i * sz + j] = a[get[j]](i);
        g.setAttribute(k, new THREE.BufferAttribute(f, sz));
      }
    }
    mesh.updateMatrix(); g.applyMatrix4(mesh.matrix);
    mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return mesh;
  }
  // Boat hull for the detailed model: lofted from the body's own outline so the hull's top edge meets the body
  // sides with no shelf or gap, a shallow-V planing bottom below it, and a compact outboard on the tail.
  function modelBoat(bodyMeshes) {
    const NZ = 64, SHEER = 0.33;
    // body half-width and extent along z, from skin vertices just below the sheer line
    let zMin = 1e9, zMax = -1e9;
    const pts = [];
    for (const m of bodyMeshes) {
      if (m.material.transparent) continue;
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0.24 && y < 0.42) { const z = p.getZ(i); pts.push(Math.abs(p.getX(i)), z); if (z < zMin) zMin = z; if (z > zMax) zMax = z; } }
    }
    const hwRaw = new Float32Array(NZ + 1).fill(-1);
    for (let k = 0; k < pts.length; k += 2) { const a = Math.round((pts[k + 1] - zMin) / (zMax - zMin) * NZ); if (pts[k] > hwRaw[a]) hwRaw[a] = pts[k]; }
    // fill empty stations, then a light smoothing pass
    for (let a = 0; a <= NZ; a++) if (hwRaw[a] < 0) { let l = a, r = a; while (l > 0 && hwRaw[l] < 0) l--; while (r < NZ && hwRaw[r] < 0) r++; hwRaw[a] = Math.max(0, (hwRaw[l] + hwRaw[r]) / 2); }
    // the skin is cut away at the wheel arches: bridge them by interpolating across each arch
    const zOf = (a) => zMin + (zMax - zMin) * a / NZ;
    for (const az of [DIMS.frontZ, DIMS.rearZ]) {
      let l = 0, r = NZ; while (l < NZ && zOf(l + 1) < az - 0.42) l++; while (r > 0 && zOf(r - 1) > az + 0.42) r--;
      for (let a = l + 1; a < r; a++) hwRaw[a] = hwRaw[l] + (hwRaw[r] - hwRaw[l]) * (a - l) / (r - l);
    }
    const hw = hwRaw.map((v, a) => (a > 0 && a < NZ ? (hwRaw[a - 1] + 2 * v + hwRaw[a + 1]) / 4 : v));
    const ring = 11, pos = [], idx = [];
    for (let a = 0; a <= NZ; a++) {
      const u = a / NZ, z = zMin + (zMax - zMin) * u, w = hw[a] + 0.012;
      const bow = smooth(0.62, 1, u), stern = smooth(0.06, 0, u);
      const keel = -0.34 + 0.5 * bow * bow + 0.12 * stern;   // rises to the bow, slightly at the transom
      const chine = Math.min(SHEER - 0.08, keel + 0.2 + 0.1 * bow);
      const sec = [[w, SHEER], [w * 0.995, (SHEER + chine) / 2], [w * 0.96, chine + 0.015], [w * 0.9, chine], [w * 0.5, (keel + chine) / 2 - 0.015], [0, keel]];
      const full = sec.concat(sec.slice(0, -1).reverse().map(([x, y]) => [-x, y]));
      for (const [x, y] of full) pos.push(x, y, z);
    }
    for (let a = 0; a < NZ; a++) for (let b = 0; b < ring - 1; b++) { const i0 = a * ring + b, i1 = i0 + 1, i2 = i0 + ring, i3 = i2 + 1; idx.push(i0, i1, i2, i1, i3, i2); }
    // transom: close the stern section
    const c0 = pos.length / 3; pos.push(0, (SHEER + pos[5 * 3 + 1]) / 2, zMin);
    for (let b = 0; b < ring - 1; b++) idx.push(c0, b + 1, b);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    // gelcoat above the waterline, antifouling below (by height, so the line stays straight)
    const hullMat = new THREE.MeshPhysicalMaterial({ color: 0xf2f0ea, roughness: 0.3, clearcoat: 0.7, side: THREE.DoubleSide });
    hullMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vHy;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHy = position.y;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vHy;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat af = smoothstep(0.065, 0.055, vHy); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.035, 0.05), af);\nfloat ln = smoothstep(0.012, 0.0, abs(vHy - 0.115)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.02, 0.03), ln);');
    };
    const hull = new THREE.Mesh(g, hullMat); hull.castShadow = true; hull.receiveShadow = true;
    // outboard on a transom bracket: upright black cowling, chrome band, grey leg down past the keel, prop
    const ob = new THREE.Group(); ob.position.set(0, SHEER, zMin + 0.02);
    const cowlMat = new THREE.MeshPhysicalMaterial({ color: 0x0d0d0f, roughness: 0.3, clearcoat: 0.9 });
    const cowl = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.06, 8, 16).scale(1, 1, 1.45), cowlMat); cowl.position.set(0, 0.32, -0.3); ob.add(cowl);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.16, 0.06, 20).scale(1, 1, 1.45), mats.chrome); cap.position.set(0, 0.15, -0.3); ob.add(cap);
    const midsec = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.16, 16).scale(1, 1, 1.4), mats.metal); midsec.position.set(0, 0.05, -0.3); ob.add(midsec);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.2), mats.metal); bracket.position.set(0, 0.02, -0.12); ob.add(bracket);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.17), mats.metal); leg.position.set(0, -0.3, -0.31); ob.add(leg);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.012, 0.26), mats.metal); plate.position.set(0, -0.45, -0.32); ob.add(plate);
    const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.22, 4, 10).rotateX(Math.PI / 2), mats.metal); pod.position.set(0, -0.6, -0.3); ob.add(pod);
    const prop = new THREE.Group(); prop.position.set(0, -0.6, -0.46); ob.add(prop);
    for (let i = 0; i < 3; i++) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.14, 0.008).translate(0, 0.075, 0), mats.metal);
      bl.rotation.z = i * Math.PI * 2 / 3; bl.rotation.y = 0.5; prop.add(bl);
    }
    for (const o of [cowl, cap, midsec, bracket, leg, plate, pod]) o.castShadow = true;
    for (const ch of [...boat.children]) boat.remove(ch);
    boat.add(hull, ob);
    boat.userData = { ob, prop };
  }

  // Sprung-open panels swing under the car's own motion (inp.eff = gravity minus acceleration, car frame), wind and
  // bumps. Doors hinge at the front about a vertical axis, the boot lid at its front (torsion springs lift it), and a
  // bonnet whose latch has gone lifts at speed until it rests on the windscreen.
  function updatePanels(dt, inp) {
    const e = inp.eff || { x: 0, y: -9.81, z: 0 }, v2 = (inp.speed || 0) ** 2;
    const swing = (pn, acc, lo, hi) => {
      pn.vel += (acc - 2.4 * pn.vel) * dt; pn.ang += pn.vel * dt;
      if (pn.ang < lo) { pn.ang = lo; pn.vel = Math.abs(pn.vel) * 0.3; }
      if (pn.ang > hi) { pn.ang = hi; pn.vel = -Math.abs(pn.vel) * 0.25; }
    };
    for (const sx of [1, -1]) {
      const d = panels.doors[sx]; if (!d) continue;
      if (d.open) swing(d, e.x * sx * 1.5 + 2 * (0.35 - d.ang) - 0.05 * v2 * Math.sin(d.ang), 0.03, 1.15);
      d.grp.rotation.y = -sx * (d.ang + (d.robot || 0));
    }
    const b = panels.boot;
    if (b) { if (b.open) swing(b, 9 * (1 - b.ang) + e.y * 0.55 * Math.cos(b.ang) - 0.025 * v2 * Math.sin(b.ang), 0.04, 1.25); b.grp.rotation.x = b.ang + (b.robot || 0); }
    const h = panels.hood;
    if (h) { const lo = h.buckle * 0.1; if (h.open) swing(h, 0.035 * v2 * Math.cos(h.ang) + e.y * 0.6 * Math.cos(h.ang), lo, 1.22); else h.ang = lo; h.grp.rotation.x = -h.ang; }
  }

  function useModelV2(scene) {
    const node = (name) => scene.getObjectByName(name);
    for (const ch of body.children) if (ch !== boat && ch !== plane) ch.visible = false;
    for (const p of popups) { p.pivot.visible = true; p.pivot.traverse((o) => { if (o.isMesh) o.visible = false; }); }
    ws.visible = true; ws.traverse((o) => { if (o.isMesh) o.visible = o === crackMesh && crackMesh.visible; });
    skins.length = 0;
    const ds = (mt) => { const c = mt.clone(); c.side = THREE.DoubleSide; return c; };
    const realPaint = paintMaterial(mats.paintPlain.color.getHex(), false); realPaint.side = THREE.DoubleSide; paintMats.push(realPaint);
    const lens = new THREE.MeshPhysicalMaterial({ color: 0xf4f4ee, emissive: 0xfff3d0, emissiveIntensity: 0, roughness: 0.05, transparent: true, opacity: 0.55, clearcoat: 1, side: THREE.DoubleSide });
    const clear = new THREE.MeshPhysicalMaterial({ color: 0xf2f2ee, roughness: 0.05, transparent: true, opacity: 0.4, clearcoat: 1, side: THREE.DoubleSide });
    const vinyl = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.92, side: THREE.DoubleSide });
    const rearWin = new THREE.MeshPhysicalMaterial({ color: 0x2b363c, roughness: 0.12, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    const fog = ds(mats.tail); fog.emissiveIntensity = 0;
    // indicators: one amber material per side so each side can flash; the front bumper lamp's clear lens glows amber too
    for (const sx of [1, -1]) {
      blinkMats[sx] = ds(mats.amber); blinkMats[sx].emissiveIntensity = 0.03;
      frontLensMats[sx] = clear.clone(); frontLensMats[sx].emissive = new THREE.Color(0xff8a10); frontLensMats[sx].emissiveIntensity = 0;
    }
    mats.reverse.side = THREE.DoubleSide;
    const MAT = {
      carpaint: realPaint, black: ds(mats.trim), chrome: ds(mats.chrome), interior: ds(mats.interior), interior_second: vinyl,
      mattemetal: ds(mats.metal), mirror: ds(mats.mirrorGlass), windowglass: mats.glass, clearglass: ds(mats.reverse), orangeglass: ds(mats.amber),
      redglass: fog, LicPlate: ds(mats.dark), material: ds(mats.rim), tire: mats.tyre, brakedisk: ds(mats.disc),
    };
    rimMats.push(MAT.material);
    const PART = {
      popup: { clearglass: lens }, front: { clearglass: clear }, tail: { redglass: mats.tail, orangeglass: mats.amber },
      softtop: { windowglass: rearWin }, window: { windowglass: mats.glass },
    };
    mats.tail.side = THREE.DoubleSide; mats.amber.side = THREE.DoubleSide;
    // dark cabin materials: keep the sky reflection from tinting them blue
    for (const k of ['black', 'interior', 'interior_second', 'LicPlate']) MAT[k].envMapIntensity = 0.3;
    const meshesOf = (n) => { const out = []; n.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
    const take = (name, parent) => {
      const n = node(name); if (!n) return null;
      const g = new THREE.Group(); g.name = name; g.position.copy(n.position); g.userData = n.userData; parent.add(g);
      const kind = name.split('_')[0];
      for (const mesh of meshesOf(n)) {
        floatMesh(mesh);
        const mn = mesh.material.name;
        mesh.material = (PART[kind] && PART[kind][mn]) || MAT[mn] || mats.trim;
        mesh.userData.matName = mn;
        mesh.castShadow = true; mesh.receiveShadow = !mesh.material.transparent;
        g.add(mesh);
      }
      return g;
    };
    const realBody = new THREE.Group(); body.add(realBody);
    // deformable body: every surface dents together
    const bodyG = take('body', realBody);
    // split lenses that mix several lamps: amber by side (indicators), clear into rear (reversing lamps) and the rest
    const splitMesh = (mesh, keyOf) => {
      const g = mesh.geometry, pa = g.attributes.position, idx = g.index.array, groups = new Map();
      for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i], b = idx[i + 1], c = idx[i + 2];
        const k = keyOf((pa.getX(a) + pa.getX(b) + pa.getX(c)) / 3, (pa.getZ(a) + pa.getZ(b) + pa.getZ(c)) / 3);
        if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a, b, c);
      }
      mesh.parent.remove(mesh);
      return [...groups].map(([k, tris]) => { const ng = g.clone(); ng.setIndex(tris); const mm = new THREE.Mesh(ng, mesh.material); mm.userData.key = k; mm.userData.matName = mesh.userData.matName; mm.castShadow = false; bodyG.add(mm); return mm; });
    };
    for (const mesh of [...bodyG.children]) {
      if (mesh.userData.matName === 'orangeglass') for (const mm of splitMesh(mesh, (x) => (x > 0 ? 1 : -1))) mm.material = blinkMats[mm.userData.key];
      else if (mesh.userData.matName === 'clearglass') for (const mm of splitMesh(mesh, (x, z) => (z < -1.5 ? 'rev' : 'clr'))) mm.material = mm.userData.key === 'rev' ? mats.reverse : clear;
    }
    // bumper covers become their own parts (cut along the shut lines) so a crash can tear them off
    const extract = (test) => {
      const out = [];
      for (const mesh of [...bodyG.children]) {
        const g = mesh.geometry, pa = g.attributes.position, idx = g.index.array, keep = [], take = [];
        for (let i = 0; i < idx.length; i += 3) {
          const a = idx[i], b = idx[i + 1], c = idx[i + 2];
          (test((pa.getX(a) + pa.getX(b) + pa.getX(c)) / 3, (pa.getY(a) + pa.getY(b) + pa.getY(c)) / 3, (pa.getZ(a) + pa.getZ(b) + pa.getZ(c)) / 3) ? take : keep).push(a, b, c);
        }
        if (!take.length) continue;
        const names = Object.keys(g.attributes), arr = Object.fromEntries(names.map((k) => [k, []])), map = new Map();
        const nidx = take.map((v) => {
          let m = map.get(v);
          if (m === undefined) { m = map.size; map.set(v, m); for (const k of names) { const at = g.attributes[k]; for (let c = 0; c < at.itemSize; c++) arr[k].push(at.array[v * at.itemSize + c]); } }
          return m;
        });
        const ng = new THREE.BufferGeometry();
        for (const k of names) ng.setAttribute(k, new THREE.Float32BufferAttribute(arr[k], g.attributes[k].itemSize));
        ng.setIndex(nidx);
        const mm = new THREE.Mesh(ng, mesh.material); mm.userData.matName = mesh.userData.matName; mm.castShadow = mesh.castShadow; mm.receiveShadow = mesh.receiveShadow;
        out.push(mm);
        if (keep.length) g.setIndex(keep); else bodyG.remove(mesh);
      }
      return out;
    };
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a2c2f, roughness: 0.6, metalness: 0.6 });
    const radMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.8, metalness: 0.3 });
    for (const [end, test] of [['front', (x, y, z) => z > 1.64 && y < 0.6], ['rear', (x, y, z) => z < -1.67 && y < 0.6]]) {
      const grp = new THREE.Group(); grp.name = 'bumper_' + end; realBody.add(grp);
      for (const mm of extract(test)) {
        const g = mm.geometry, n = g.attributes.position.count;
        g.setAttribute('dark', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
        g.setAttribute('scratch', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
        addSkin(g); grp.add(mm);
      }
      bumpers[end] = grp;
      // revealed when the cover comes off: reinforcement beam (+ radiator and brackets at the front)
      const cs = new THREE.Group(); cs.visible = false; realBody.add(cs); crashStruct[end] = cs;
      const zb = end === 'front' ? 1.74 : -1.8;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.11, 0.09), darkMetal); beam.position.set(0, 0.4, zb); cs.add(beam);
      for (const sx of [1, -1]) { const br = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.22), darkMetal); br.position.set(sx * 0.42, 0.4, zb - Math.sign(zb) * 0.14); cs.add(br); }
      if (end === 'front') {
        const rad = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.34, 0.05), radMat); rad.position.set(0, 0.47, 1.6); cs.add(rad);
        const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 20).rotateX(Math.PI / 2), darkMetal); fan.position.set(0.1, 0.47, 1.56); cs.add(fan);
      }
      for (const o of cs.children) { o.castShadow = true; o.receiveShadow = true; }
    }
    // cut the shell into the sections the mech is made of (in car pose they sit exactly where they were)
    const partition = (mesh, keyOf) => {
      const g = mesh.geometry, pa = g.attributes.position, idx = g.index.array, groups = new Map();
      for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i], b = idx[i + 1], c = idx[i + 2];
        const k = keyOf((pa.getX(a) + pa.getX(b) + pa.getX(c)) / 3, (pa.getY(a) + pa.getY(b) + pa.getY(c)) / 3, (pa.getZ(a) + pa.getZ(b) + pa.getZ(c)) / 3);
        if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a, b, c);
      }
      const names = Object.keys(g.attributes), out = new Map();
      for (const [k, tris] of groups) {
        const arr = Object.fromEntries(names.map((n) => [n, []])), map = new Map();
        const nidx = tris.map((v) => { let m = map.get(v); if (m === undefined) { m = map.size; map.set(v, m); for (const n of names) { const at = g.attributes[n]; for (let c = 0; c < at.itemSize; c++) arr[n].push(at.array[v * at.itemSize + c]); } } return m; });
        const ng = new THREE.BufferGeometry();
        for (const n of names) ng.setAttribute(n, new THREE.Float32BufferAttribute(arr[n], g.attributes[n].itemSize));
        ng.setIndex(nidx);
        const mm = new THREE.Mesh(ng, mesh.material); mm.userData = { ...mesh.userData }; mm.castShadow = mesh.castShadow; mm.receiveShadow = mesh.receiveShadow;
        out.set(k, mm);
      }
      return out;
    };
    // split long triangles (the simplified underbody has slivers half the car long) so each piece stays inside its
    // section: repeatedly halve the longest edge until every edge is under maxLen
    const splitLong = (g, maxLen) => {
      const names = Object.keys(g.attributes), arr = Object.fromEntries(names.map((n) => [n, Array.from(g.attributes[n].array)]));
      const size = Object.fromEntries(names.map((n) => [n, g.attributes[n].itemSize]));
      const P = arr.position, mids = new Map(), out = [], stack = [];
      const idx = g.index.array; for (let i = idx.length - 3; i >= 0; i -= 3) stack.push([idx[i], idx[i + 1], idx[i + 2]]);
      const d2 = (a, b) => (P[a * 3] - P[b * 3]) ** 2 + (P[a * 3 + 1] - P[b * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[b * 3 + 2]) ** 2;
      const mid = (a, b) => {
        const key = a < b ? a * 4194304 + b : b * 4194304 + a; let m = mids.get(key);
        if (m === undefined) { m = P.length / 3; for (const n of names) { const k = size[n]; for (let c = 0; c < k; c++) arr[n].push((arr[n][a * k + c] + arr[n][b * k + c]) / 2); } mids.set(key, m); }
        return m;
      };
      const L2 = maxLen * maxLen;
      while (stack.length) {
        const [a, b, c] = stack.pop();
        const ab = d2(a, b), bc = d2(b, c), ca = d2(c, a), mx = Math.max(ab, bc, ca);
        if (mx <= L2 || out.length > 3e6) { out.push(a, b, c); continue; }
        if (mx === ab) { const m = mid(a, b); stack.push([a, m, c], [m, b, c]); }
        else if (mx === bc) { const m = mid(b, c); stack.push([a, b, m], [a, m, c]); }
        else { const m = mid(c, a); stack.push([a, b, m], [m, b, c]); }
      }
      if (out.length === idx.length) return;
      for (const n of names) g.setAttribute(n, new THREE.Float32BufferAttribute(arr[n], size[n]));
      g.setIndex(out);
    };
    for (const mesh of bodyG.children) splitLong(mesh.geometry, 0.3);
    const region = (x, y, z) => {
      if (z > 0.53 && !(y > 0.8 && z < 0.75 && Math.abs(x) < 0.7)) return z > 1.42 ? 'nose' : 'front';   // the scuttle stays with the cabin
      if (z > -0.95) return 'cabin';   // the rear bulkhead stays with the cabin
      return (z > KNEE_CUT ? 'thigh' : 'shin') + (x >= 0 ? 'L' : 'R');
    };
    const chunks = {};
    for (const k of ['nose', 'front', 'cabin', 'thighL', 'thighR', 'shinL', 'shinR']) { chunks[k] = new THREE.Group(); chunks[k].name = 'chunk_' + k; realBody.add(chunks[k]); }
    for (const mesh of [...bodyG.children]) { for (const [k, mm] of partition(mesh, region)) chunks[k].add(mm); bodyG.remove(mesh); }
    // rear bumper halves go with the legs
    const bumperRear = {};
    for (const sx of [1, -1]) { bumperRear[sx] = new THREE.Group(); bumperRear[sx].name = 'bumper_rear_' + sx; bumpers.rear.add(bumperRear[sx]); }
    for (const mesh of [...bumpers.rear.children].filter((o) => o.isMesh)) splitLong(mesh.geometry, 0.3);
    for (const mesh of [...bumpers.rear.children].filter((o) => o.isMesh)) { for (const [k, mm] of partition(mesh, (x) => (x >= 0 ? 1 : -1))) bumperRear[k].add(mm); bumpers.rear.remove(mesh); }
    bumpers.rear.userData.parts = [bumperRear[1], bumperRear[-1]];
    skins.splice(0, skins.length);
    const shellMeshes = [];
    for (const grp of [...Object.values(chunks), bumpers.front, bumperRear[1], bumperRear[-1]]) for (const mesh of grp.children) if (mesh.isMesh) {
      const g = mesh.geometry, n = g.attributes.position.count;
      if (!g.attributes.dark) g.setAttribute('dark', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
      if (!g.attributes.scratch) g.setAttribute('scratch', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
      addSkin(g); shellMeshes.push(mesh);
    }
    modelBoat(shellMeshes);
    // windscreen glass + crack overlay (planar UVs over the glass)
    const wsG = take('windscreen', realBody);
    if (wsG && wsG.children[0]) {
      const g = wsG.children[0].geometry.clone(); g.computeBoundingBox();
      const bb = g.boundingBox, p = g.attributes.position, nn = g.attributes.normal, uvs = [];
      for (let i = 0; i < p.count; i++) {
        p.setXYZ(i, p.getX(i) + nn.getX(i) * 0.003, p.getY(i) + nn.getY(i) * 0.003, p.getZ(i) + nn.getZ(i) * 0.003);
        uvs.push((p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
      }
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      const cm = new THREE.Mesh(g, crackMesh.material); cm.visible = crackMesh.visible; cm.renderOrder = 2;
      wsG.add(cm); crackMesh = cm;
    }
    // breakable bits
    for (const [sx, s] of [[1, 'L'], [-1, 'R']]) {
      const mg = take('mirror_' + s, realBody); if (mg) mirrors[sx] = mg;
      const tg = take('tail_' + s, realBody);
      if (tg) { tailSides[sx] = tg.children; for (const mm of tg.children) { if (mm.userData.matName === 'orangeglass') mm.material = blinkMats[sx]; mm.userData.mat = mm.material; } }
      const fg = take('front_' + s, realBody);
      if (fg) for (const mm of fg.children) mm.material = mm.userData.matName === 'orangeglass' ? blinkMats[sx] : frontLensMats[sx];
      if (fg && bumpers.front) bumpers.front.add(fg);  // the bumper lamps go with the bumper (both groups sit at the body origin)
      // lamps are separate parts: make them skins too so a crash pushes them in with the bumper
      for (const grp of [tg, fg]) if (grp) for (const mm of grp.children) {
        const g = mm.geometry, n = g.attributes.position.count;
        g.setAttribute('dark', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
        g.setAttribute('scratch', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
        addSkin(g, grp);
      }
      if (fg) {
        const main = fg.children.reduce((a, b) => (b.geometry.attributes.position.count > a.geometry.attributes.position.count ? b : a));
        main.userData.mat = main.material; frontLamps[sx] = main;
      }
    }
    // pop-ups (hinge at each node origin)
    const pods = [];
    for (const [sx, s] of [[1, 'L'], [-1, 'R']]) {
      const pg = take('popup_' + s, realBody); if (!pg) continue;
      const closed = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -POD_CLOSE.roll * sx)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), POD_CLOSE.pitch));
      pods.push({ pivot: pg, side: sx, closed, y0: pg.position.y });
      pg.quaternion.copy(closed); pg.position.y += POD_CLOSE.lift;
    }
    // steering wheel spins about its column
    const sg = take('steer', realBody);
    if (sg) {
      const spin = new THREE.Group(); for (const ch of [...sg.children]) spin.add(ch); sg.add(spin);
      realSteer = { pivot: sg, spin, dir: -1, axis: new THREE.Vector3(...(sg.userData.axis || [0, -0.34, 0.94])).normalize() };
    }
    // wheels + calipers
    const wheelNodes = [];
    for (const [i, name] of ['FL', 'FR', 'RL', 'RR'].entries()) {
      const w = wheels[i], sp = w.spin;
      const wn = take('wheel_' + name, sp); wheelNodes[i] = wn;
      if (wn) { wn.position.set(0, 0, 0); for (const ch of sp.children) if (ch !== wn) ch.visible = false; }
      for (const ch of w.steerG.children) if (ch !== sp) ch.visible = false;
      const cal = take('caliper_' + name, w.steerG);
      if (cal) { const wnode = node('wheel_' + name); cal.position.sub(wnode ? wnode.position : cal.position); w.caliper = cal; }
    }
    // soft top: the model's own roof folds back about a hinge behind the seats; windows wind into the doors
    const topG = take('softtop', realBody);
    const winG = [take('window_L', realBody), take('window_R', realBody)].filter(Boolean);
    // opening panels on their hinges (node origins are the hinge lines): doors carry their glass and mirror
    const skinGroup = (grp) => { for (const mm of grp.children) if (mm.isMesh) {
      const g = mm.geometry, n = g.attributes.position.count;
      g.setAttribute('dark', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
      g.setAttribute('scratch', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
      addSkin(g, grp);
    } };
    for (const [sx, s] of [[1, 'L'], [-1, 'R']]) {
      const dg = take('door_' + s, realBody); if (!dg) continue;
      skinGroup(dg);
      panels.doors[sx] = { grp: dg, ang: 0, vel: 0, open: false };
      const mg = mirrors[sx]; if (mg && mg.parent === realBody) { mg.position.sub(dg.position); dg.add(mg); }
      const wg = winG.find((g) => g.name === 'window_' + s); if (wg) { wg.position.sub(dg.position); dg.add(wg); }
    }
    for (const name of ['hood', 'boot']) { const pg = take(name, realBody); if (pg) { skinGroup(pg); panels[name] = { grp: pg, ang: 0, vel: 0, open: false, buckle: 0 }; } }
    softTop.group.visible = false;
    softTop = modelSoftTop(topG, winG);
    softTop.set(state.topT * state.topT * (3 - 2 * state.topT));
    real = { body: realBody, pods, lens, lamps: null, hingeY: 0 };
    // mech: the shell sections on a kinematic rig (car pose = every joint at rest)
    realBodyRef = realBody;
    const podY = pods.map((p) => p.pivot.position.y);
    transformer = createTransformer({
      root: realBody, mats, chunks, bumperRear, wheelNodes,
      tails: { 1: tailSides[1] && tailSides[1][0] && tailSides[1][0].parent, '-1': tailSides[-1] && tailSides[-1][0] && tailSides[-1][0].parent },
      doors: panels.doors, boot: panels.boot,
      toTorso: [topG, wsG, sg, panels.boot && panels.boot.grp, crashStruct.rear, bodyG].filter(Boolean),
      toChest: [panels.hood && panels.hood.grp].filter(Boolean),
      toNose: [bumpers.front, crashStruct.front, ...pods.map((p) => p.pivot)].filter(Boolean),
    });
    pods.forEach((p, i) => { p.y0 += p.pivot.position.y - podY[i]; });
    // skins dent in their mesh's own frame from now on
    const meshByGeo = new Map(); realBody.traverse((o) => { if (o.isMesh) meshByGeo.set(o.geometry, o); });
    for (const t of skins) t.node = meshByGeo.get(t.geo) || t.node;
  }
  function modelSoftTop(topG, winG) {
    const H = { y: 0.92, z: -0.82 }, Z0 = 0.02, Z1 = -1.224;
    const geos = topG.children.map((m) => { const g = m.geometry; return { g, p: Float32Array.from(g.attributes.position.array), n: Float32Array.from(g.attributes.normal.array) }; });
    const wins = winG.map((g) => ({ g, y: g.position.y }));
    let last = -1;
    return {
      group: topG,
      set(t) {
        if (Math.abs(t - last) < 1e-4) return; last = t;
        topG.visible = t > 0.01;
        const w = Math.min(1, Math.max(0, (t - 0.35) / 0.65));
        for (const wi of wins) { wi.g.position.y = wi.y - 0.34 * (1 - w); wi.g.visible = w > 0.02; }
        if (!topG.visible) return;
        const fold = 1 - t;
        for (const { g, p, n } of geos) {
          const pa = g.attributes.position.array, na = g.attributes.normal.array;
          for (let k = 0; k < p.length; k += 3) {
            const x = p[k], y = p[k + 1], z = p[k + 2];
            const sv = Math.min(1, Math.max(0, (Z0 - z) / (Z0 - Z1)));
            const th = fold * 2.7 * Math.pow(1 - sv, 0.75), sh = 1 - fold * 0.62 * (1 - sv);
            const dz = z - H.z, dy = y - H.y, r = Math.hypot(dz, dy) * sh, phi = Math.atan2(dy, dz) + th;
            pa[k] = x * (1 - fold * 0.08); pa[k + 1] = H.y + r * Math.sin(phi); pa[k + 2] = H.z + r * Math.cos(phi);
            // rotate the normal with the fabric (rotation about x by th)
            const c = Math.cos(th), s = Math.sin(th), ny = n[k + 1], nz = n[k + 2];
            na[k] = n[k]; na[k + 1] = ny * c + nz * s; na[k + 2] = -ny * s + nz * c;
          }
          g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
        }
      },
    };
  }

  return {
    root, body, wheels, popups, mats, boat, plane, ailerons, state, steer, tailLights, wings,
    setMorph,
    parts: { mirrors, tailSides, frontLamps, shell, bumpers, crashStruct, panels },
    get paintMats() { return [mats.paint, mats.paintPlain, ...paintMats].filter(Boolean); },
    get real() { return !!real; },
    // garage
    setPaint(hex) { for (const m of [mats.paint, mats.paintPlain, mats.hull && null, ...paintMats]) if (m) m.color.set(hex); },
    setWheels(style) {
      const W = { silver: [0xa9abae, 0.9, 0.3], gunmetal: [0x45474c, 0.85, 0.35], gold: [0xc9a14a, 1, 0.25], white: [0xe6e6e2, 0.15, 0.4], black: [0x141414, 0.6, 0.35] }[style] || [0xa9abae, 0.9, 0.3];
      for (const m of [mats.rim, ...rimMats]) { m.color.set(W[0]); m.metalness = W[1]; m.roughness = W[2]; }
    },
    mechPunch() { return transformer ? transformer.punch() : false; },
    get mechWeapons() { return transformer || mech; },   // arm cannon + missile pod (detailed model or the simple robot)
    mechAction(type, s) { if (transformer) transformer.action(type, s); },
    mechFist(s, out) { return transformer ? transformer.fist(s, out) : null; },
    get mechBusy() { return transformer ? transformer.busy : null; },
    mechLeapReady() { return transformer ? transformer.leapReady() : true; },
    mechTakeHit() { return transformer ? transformer.takeHit() : false; },
    get driverX() { return real ? 0.39 : 0.31; },
    // driver's eye in CoM space: just ahead of the headrest, ~1.0 m off the ground, so the top clears the head
    get eye() { return state.mechT > 0.5 ? (transformer ? root.worldToLocal(_eyeT.copy(transformer.eye)) : mech.eye) : real && real.pods ? _eyeV2 : _eyeOld; },
    // swap the procedural body for a detailed model (body/popups/wheel_* nodes in body space, from mx5.glb)
    useModel(scene) {
      const m = (name) => scene.getObjectByName(name);
      if (m('mx5v2')) return useModelV2(scene);
      const bodyNode = m('body'), pivotNode = m('popups');
      if (!bodyNode || !pivotNode) throw new Error('mx5.glb is missing body/popups nodes');
      // hide procedural visuals, keep kits, spot lights and the windscreen crack overlay
      for (const ch of body.children) if (ch !== boat && ch !== plane) ch.visible = false;
      for (const p of popups) { p.pivot.visible = true; p.pivot.traverse((o) => { if (o.isMesh) o.visible = false; }); }
      ws.visible = true; ws.traverse((o) => { if (o.isMesh) o.visible = o === crackMesh && crackMesh.visible; });
      skins.length = 0;
      const lamps = new THREE.MeshPhysicalMaterial({ map: null, roughness: 0.15, clearcoat: 1 });
      lamps.userData.tail = { value: 0 };
      lamps.onBeforeCompile = (sh) => {
        sh.uniforms.uTail = lamps.userData.tail;
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTail;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
#ifdef USE_MAP
{ vec4 lt = texture2D(map, vMapUv); float red = smoothstep(0.06, 0.25, lt.r - max(lt.g, lt.b)); totalEmissiveRadiance += vec3(1.0, 0.08, 0.04) * red * uTail; }
#endif`);
      };
      const lens = new THREE.MeshPhysicalMaterial({ color: 0xf4f4ee, emissive: 0xfff3d0, emissiveIntensity: 0, roughness: 0.05, metalness: 0.3, clearcoat: 1 });
      const realPaint = paintMaterial(mats.paintPlain.color.getHex(), false);
      const BODY = { 'Material.002': realPaint, 'Material.001': mats.interior, 'Material.004': mats.mirrorGlass, 'Material.005': mats.dark,
        'Material.010': mats.glass, 'Material.012': lamps, 'Material.013': mats.chrome };
      const POD = { 'Material.002': mats.paintPlain, 'Material.001': mats.trim, 'Material.008': lens, 'Material.009': mats.chrome, 'Material.007': mats.chrome };
      const WHEEL = { 'Material.015': mats.rim, 'Material.014': mats.tyre, 'Material.016': mats.rimDark, 'Material.017': mats.chrome };
      const remap = (o, table) => {
        const conv = (mm) => {
          const t = table[mm.name] || mats.trim;
          if (t === lamps && mm.map) { lamps.map = mm.map; lamps.map.colorSpace = THREE.SRGBColorSpace; lamps.needsUpdate = true; }
          return t;
        };
        o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
        o.castShadow = true; o.receiveShadow = true;
      };
      const realBody = new THREE.Group(); body.add(realBody);
      // glTF splits multi-material meshes into one mesh per material: walk every mesh under each node
      const meshesOf = (node) => { const out = []; node.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
      // every body surface dents together, including the black inner panel behind the skin.
      // glTF primitives of one mesh share a vertex buffer: deform each buffer once, with all its triangles.
      const shared = new Map();
      for (const mesh of meshesOf(bodyNode)) {
        // the black backing panel (seen through the grille) is very coarse: subdivide it so it can dent with the skin
        if (mesh.name === 'Plane' || (mesh.parent && mesh.parent.name === 'Plane')) mesh.geometry = subdivide(mesh.geometry, 3);
        remap(mesh, BODY);
        const g = mesh.geometry, pa = g.attributes.position;
        let sk = shared.get(pa.array);
        if (!sk) {
          const n = pa.count;
          g.setAttribute('dark', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
          g.setAttribute('scratch', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
          addSkin(g); sk = skins[skins.length - 1]; sk.faceLists = []; shared.set(pa.array, sk);
        } else {
          g.setAttribute('dark', sk.geo.attributes.dark);
          g.setAttribute('scratch', sk.geo.attributes.scratch);
          sk.extra = sk.extra || []; sk.extra.push(g);
        }
        if (g.index) sk.faceLists.push(g.index.array);
        realBody.add(mesh);
      }
      // ---- split separate parts back out of the merged body (mirrors, lamps, steering wheel), black windscreen frame
      const split = splitParts([...realBody.children].filter((o) => o.isMesh), { realPaint, lamps, glass: mats.glass, trim: mats.trim });
      for (const sx of [1, -1]) {
        if (split.mirror[sx]) { realBody.add(split.mirror[sx]); mirrors[sx] = split.mirror[sx]; }
        if (split.tail[sx].length) { for (const m of split.tail[sx]) { m.userData.mat = m.material; realBody.add(m); } tailSides[sx] = split.tail[sx]; }
        if (split.front[sx]) { split.front[sx].userData.mat = split.front[sx].material; realBody.add(split.front[sx]); frontLamps[sx] = split.front[sx]; }
      }
      if (split.steer) { realBody.add(split.steer.pivot); }
      if (split.crack) {
        const cm = new THREE.Mesh(split.crack, crackMesh.material); cm.visible = crackMesh.visible; cm.renderOrder = 2;
        realBody.add(cm); crackMesh = cm;
      }
      realSteer = split.steer;
      for (const sk of shared.values()) {
        const total = sk.faceLists.reduce((a, l) => a + l.length, 0), all = new Uint32Array(total);
        let o = 0; for (const l of sk.faceLists) { all.set(l, o); o += l.length; }
        sk.faces = all;
      }
      const pivot = new THREE.Group(); pivot.position.copy(pivotNode.position); realBody.add(pivot);
      for (const mesh of meshesOf(pivotNode)) { remap(mesh, POD); pivot.add(mesh); }
      for (const [i, name] of ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'].entries()) {
        const wn = m(name); if (!wn) continue;
        for (const mesh of meshesOf(wn)) remap(mesh, WHEEL);
        wn.position.set(0, 0, 0);
        const sp = wheels[i].spin;
        for (const ch of sp.children) ch.visible = false;
        for (const ch of wheels[i].steerG.children) if (ch !== sp) ch.visible = false; // procedural caliper
        sp.add(wn);
      }
      real = { body: realBody, pivot, lens, lamps, hingeY: pivot.position.y };
    },
    // push the skin in around a body-space point; returns how much it actually moved
    // push the skin in around a body-space point
    deform(pb, dirB, sev, only = null) {
      const R = 0.32 + 0.45 * Math.min(1, sev), depth = Math.min(0.2, 0.025 + 0.14 * sev);
      for (const t of skins) {
        if (only && !only.some((g) => under(t.node, g))) continue;
        let p = pb, dir = dirB;
        if (t.node) { toLocal(t, pb, dirB); p = _pl; dir = _dl; }
        const geo = t.geo, pa = geo.attributes.position, sa = geo.attributes.scratch, orig = t.orig;
        let hit = false;
        for (let i = 0; i < pa.count; i++) {
          const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
          const dx = x - p.x, dy = y - p.y, dz = z - p.z;
          // falloff across the impact face; layers behind it (skin, inner panel, trim) move together
          const along = dx * dir.x + dy * dir.y + dz * dir.z;
          if (along > 0.6 || along < -0.3) continue;
          const px = dx - dir.x * along, py = dy - dir.y * along, pz = dz - dir.z * along;
          const d2 = px * px + py * py + pz * pz;
          if (d2 > R * R) continue;
          const fall = 1 - Math.sqrt(d2) / R;
          const k = fall * fall * (3 - 2 * fall) * (1 - Math.min(1, Math.max(0, (along - 0.3) / 0.3)));
          const wr = 0.85 + 0.15 * Math.sin(x * 9 + y * 7) * Math.sin(z * 8 + y * 5);
          let nx = x + dir.x * depth * k * wr, ny = y + dir.y * depth * k * wr, nz = z + dir.z * depth * k * wr;
          // never more than 25 cm from the factory shape
          const ox = orig[i * 3], oy = orig[i * 3 + 1], oz = orig[i * 3 + 2];
          const ex = nx - ox, ey = ny - oy, ez = nz - oz, e = Math.hypot(ex, ey, ez);
          if (e > 0.25) { nx = ox + ex / e * 0.25; ny = oy + ey / e * 0.25; nz = oz + ez / e * 0.25; }
          pa.setXYZ(i, nx, ny, nz);
          sa.setX(i, Math.min(1, sa.getX(i) + k * (0.25 + sev * 0.8)));
          hit = true;
        }
        if (hit) {
          pa.needsUpdate = true; sa.needsUpdate = true; localNormals(t, p, R);
          if (t.extra) for (const e of t.extra) e.attributes.position.needsUpdate = true;
        }
      }
    },
    scratchAt(pb, amount, R = 0.35) {
      for (const t of skins) {
        let p = pb; if (t.node) { toLocal(t, pb, null); p = _pl; }
        const pa = t.geo.attributes.position, sa = t.geo.attributes.scratch;
        for (let i = 0; i < pa.count; i++) {
          const dx = pa.getX(i) - p.x, dy = pa.getY(i) - p.y, dz = pa.getZ(i) - p.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < R * R) sa.setX(i, Math.min(1, sa.getX(i) + amount * (1 - Math.sqrt(d2) / R)));
        }
        sa.needsUpdate = true;
      }
    },
    crackWindscreen(u, v, sev) {
      const g = crackCanvas.getContext('2d'), W = crackCanvas.width, H = crackCanvas.height;
      const cx = u * W, cy = (1 - v) * H;
      g.strokeStyle = 'rgba(235,240,245,0.85)'; g.lineCap = 'round';
      const rays = 8 + Math.floor(sev * 10);
      for (let i = 0; i < rays; i++) {
        let a = Math.random() * Math.PI * 2, x = cx, y = cy, len = 40 + Math.random() * 200 * sev;
        g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y);
        while (len > 0) { const st = 8 + Math.random() * 14; a += (Math.random() - 0.5) * 0.5; x += Math.cos(a) * st; y += Math.sin(a) * st; g.lineTo(x, y); len -= st; }
        g.stroke();
      }
      for (let r = 10; r < 30 + sev * 60; r += 12 + Math.random() * 10) {
        g.lineWidth = 1; g.beginPath();
        for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.35) { const rr = r * (0.8 + Math.random() * 0.4); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
        g.stroke();
      }
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fill();
      crackTex.needsUpdate = true; crackMesh.visible = true;
    },
    repair() {
      for (const t of skins) {
        const pa = t.geo.attributes.position, sa = t.geo.attributes.scratch, na = t.geo.attributes.normal;
        pa.array.set(t.orig); sa.array.fill(0); na.array.set(t.origN);
        pa.needsUpdate = true; sa.needsUpdate = true; na.needsUpdate = true;
        if (t.extra) for (const e of t.extra) { e.attributes.position.needsUpdate = true; e.attributes.normal.needsUpdate = true; }
      }
      for (const sx of [1, -1]) {
        mirrors[sx].visible = true;
        for (const m of tailSides[sx]) m.material = m.userData.mat;
        frontLamps[sx].material = frontLamps[sx].userData.mat;
      }
      for (const p of popups) { p.broken = false; p.lens.material.color.set(0xf0f0e8); }
      for (const w of wheels) w.spin.visible = true;
      for (const end of Object.keys(bumpers)) { for (const b of bumpers[end].userData.parts || [bumpers[end]]) b.visible = true; crashStruct[end].visible = false; }
      for (const pn of [panels.doors[1], panels.doors[-1], panels.hood, panels.boot]) if (pn) { pn.open = false; pn.ang = 0; pn.vel = 0; pn.buckle = 0; }
      crackCanvas.getContext('2d').clearRect(0, 0, crackCanvas.width, crackCanvas.height);
      crackMesh.visible = false;
      state.wingsLost = false;
    },
    update(dt, inp) {
      state.footfall = transformer ? transformer.update(dt, state.mechT, inp.mech || {}) : mech.update(dt, state.mechT, inp.mech || {});
      updatePanels(dt, inp);
      // soft top: ~3 s to raise or lower by hand
      { const tg = state.topUp ? 1 : 0; state.topT += Math.sign(tg - state.topT) * Math.min(Math.abs(tg - state.topT), dt / 3); const e = state.topT * state.topT * (3 - 2 * state.topT); softTop.set(transformer ? Math.max(e, smooth(0.12, 0.45, state.mechT)) : e); }  // the top closes over the cockpit, which becomes the mech's back
      // pop-up headlight animation (~0.6 s like the real motors)
      const tgt = state.lights ? 1 : 0;
      state.lightT += Math.sign(tgt - state.lightT) * Math.min(Math.abs(tgt - state.lightT), dt / 0.6);
      const ang = 0.14 - 1.39 * (state.lightT * state.lightT * (3 - 2 * state.lightT));
      for (const p of popups) {
        const on = state.lightT > 0.95 && !p.broken ? 1 : 0;
        p.pivot.rotation.x = p.broken ? p.stuck : ang;
        p.spot.intensity = on * 60;
        p.lens.material.emissiveIntensity = on * 14;
      }
      if (real) {
        const broken = popups.find((p) => p.broken);
        const e = state.lightT * state.lightT * (3 - 2 * state.lightT);
        if (real.pods) {
          // v2 model: pods are modelled raised; rotate forward/down about the hinge to close them
          for (const pod of real.pods) {
            const pp = popups.find((q) => q.side === pod.side);
            const open = pp.broken ? Math.min(1, Math.max(0, (0.14 - pp.stuck) / 1.0)) : e;
            pod.pivot.quaternion.slerpQuaternions(pod.closed, _qId, open);
            pod.pivot.position.y = pod.y0 + POD_CLOSE.lift * (1 - open);
          }
        } else {
          real.pivot.rotation.x = broken ? Math.min(0, broken.stuck - 0.14) : -0.92 * e;
          real.pivot.position.y = real.hingeY - 0.035 * e; // sink a little as they rise so the lids don't stand tall
        }
        real.lens.emissiveIntensity = state.lightT > 0.95 && !broken ? 14 : 0;
        if (real.lamps) real.lamps.userData.tail.value = (state.lights ? 1.5 : 0.0) + state.brake * 9;
      }
      mats.tail.emissiveIntensity = (state.lights ? 1.5 : 0.08) + state.brake * 9;
      mats.reverse.emissiveIntensity = state.reverse ? 7 : 0;
    // indicators: ~85 flashes a minute, 50 % duty; state.blink: 0 off, 1 left, -1 right, 2 hazards
    state.blinkT = (state.blinkT + dt) % 0.7;
    state.blinkOn = state.blink !== 0 && state.blinkT < 0.35;
    for (const sx of [1, -1]) {
      const on = state.blinkOn && (state.blink === sx || state.blink === 2);
      if (blinkMats[sx]) blinkMats[sx].emissiveIntensity = on ? 4 : 0.03;
      if (frontLensMats[sx]) frontLensMats[sx].emissiveIntensity = on ? 2.2 : 0;
    }
      mats.gauge.emissiveIntensity = state.lights ? 0.9 : 0.05;
      steer.rotation.z = -(inp.steerAngle || 0) * 6;
      if (realSteer) realSteer.spin.quaternion.setFromAxisAngle(realSteer.axis, (inp.steerAngle || 0) * 6 * (realSteer.dir || 1));
      // control surfaces
      for (const a of ailerons) a.pivot.rotation.x = a.side * (inp.roll || 0) * 0.35;
      plane.userData.elevator.rotation.x = (inp.pitch || 0) * 0.4;
      plane.userData.rudder.rotation.y = -(inp.yaw || 0) * 0.4;
      if (plane.visible) {
        plane.userData.prop.rotation.z += (inp.propSpeed || 0) * dt;
        plane.userData.propDisc.material.opacity = Math.min(0.25, (inp.propSpeed || 0) / 300);
      }
      if (boat.visible) boat.userData.prop.rotation.z += (inp.boatProp || 0) * dt;
    },
  };
}

// AI traffic: hatchback (0), saloon (1), box truck (2), SUV (3) and van (4). Bodies are extruded side profiles with
// rounded edges, painted pillars and roof, glass panels, bumpers, grille, lamps, plates, mirrors and wheels with rims.
// Each car's parts are merged per material, so a car costs a handful of draw calls.
const TRAFFIC_GEO = new Map();
const tpoly = (pts) => new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
// round a profile's corners (each corner becomes an arc, its radius limited by the neighbouring edges), then split
// long edges so the body can be bent smoothly afterwards
// geometry detail for the traffic bodies: full (traffic, rides) or lite (hundreds of parked cars)
let TQ = { seg: 3, edge: 0.42, steps: 4, bev: 3, tyre: 14, small: 0.1 };
function filletProfile(pts, r, seg = TQ.seg, maxEdge = TQ.edge) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const rr = Math.min(r, la * 0.45, lb * 0.45);
    const ua = [(a[0] - p[0]) / la, (a[1] - p[1]) / la], ub = [(b[0] - p[0]) / lb, (b[1] - p[1]) / lb];
    const p0 = [p[0] + ua[0] * rr, p[1] + ua[1] * rr], p1 = [p[0] + ub[0] * rr, p[1] + ub[1] * rr];
    for (let k = 0; k <= seg; k++) { const t = k / seg, u = 1 - t;   // quadratic Bézier through the corner
      out.push([u * u * p0[0] + 2 * u * t * p[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * p[1] + t * t * p1[1]]); }
  }
  const res = [];
  for (let i = 0; i < out.length; i++) {
    const a = out[i], b = out[(i + 1) % out.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.ceil(l / maxEdge));
    for (let k = 0; k < m; k++) res.push([a[0] + (b[0] - a[0]) * k / m, a[1] + (b[1] - a[1]) * k / m]);
  }
  return res.filter((q, i) => i === 0 || Math.hypot(q[0] - res[i - 1][0], q[1] - res[i - 1][1]) > 1e-4);
}
function extrudeSide(pts, width, bevel = 0.06, round = 0) {
  const prof = round ? filletProfile(pts, round) : pts;
  return new THREE.ExtrudeGeometry(tpoly(prof), { depth: width - 2 * bevel, steps: round ? TQ.steps : 1, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * (round ? 0.5 : 1), bevelSegments: round ? TQ.bev : 2, curveSegments: 4 })
    .rotateY(-Math.PI / 2).translate((width - 2 * bevel) / 2, 0, 0);
}
const rbox = (w, h, d, r = 0.04) => (Math.min(w, h, d) < TQ.small ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w * 0.45, h * 0.45, d * 0.45)));
// bend a car body: the sides bow out at the waist and tuck in at the sill, the glasshouse leans in toward the roof
// (tumblehome), the ends round off in plan, and the bonnet, roof and boot lid are crowned
function bendCar(geo, S) {
  const p = geo.attributes.position, L = S.L, W = S.W, yb = S.low[0][1];
  const belt = S.gh[0][1], top = Math.max(...S.gh.map((q) => q[1])), zc = (Math.max(...S.low.map((q) => q[0])) + Math.min(...S.low.map((q) => q[0]))) / 2;
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i); const z = p.getZ(i);
    const u = Math.min(1, Math.abs(x) / (W / 2)), zn = Math.abs(z - zc) / (L / 2);
    const plan = 1 - 0.14 * Math.pow(sm(0.5, 1.02, zn), 1.4);
    let side;
    if (y < belt) { const m = (y - (yb + belt) / 2) / ((belt - yb) / 2); side = 1 - 0.07 * m * m; }
    else side = (1 - 0.07) * (1 - 0.2 * Math.pow(Math.min(1, (y - belt) / (top - belt)), 1.3));
    x *= plan * side;
    y += (1 - u * u) * (y > belt ? 0.05 : 0.035) * sm(yb + 0.15, belt, y);
    p.setXYZ(i, x, y, z);
  }
  p.needsUpdate = true;
  return geo;
}
function sideWindow(pts, x, side) {
  // the greenhouse outline pulled in toward its centre, as a flat pane on the body side
  let cz = 0, cy = 0; for (const [z, y] of pts) { cz += z; cy += y; } cz /= pts.length; cy /= pts.length;
  const inner = pts.map(([z, y]) => [cz + (z - cz) * 0.86, cy + (y - cy) * 0.78]);
  return new THREE.ShapeGeometry(tpoly(inner)).rotateY(-Math.PI / 2).translate(x * side, 0, 0);
}
function pane(a, b, width) {
  // a glass quad spanning the body width between two profile points (z, y)
  const dz = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dz, dy);
  const g = new THREE.PlaneGeometry(width, len, 10, 2);
  g.rotateX(Math.atan2(dz, dy)); g.translate(0, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2);
  return g;
}
const TRAFFIC_STYLES = {
  0: { L: 3.9, W: 1.72, low: [[-1.95, 0.3], [1.92, 0.3], [1.98, 0.55], [1.9, 0.8], [1.15, 0.94], [-1.85, 0.98], [-1.97, 0.68]], gh: [[1.1, 0.93], [0.35, 1.42], [-1.5, 1.46], [-1.84, 0.97]], wz: [1.25, -1.28] },
  1: { L: 4.6, W: 1.8, low: [[-2.3, 0.3], [2.28, 0.3], [2.33, 0.55], [2.25, 0.76], [1.35, 0.88], [-1.55, 0.92], [-2.28, 0.9], [-2.34, 0.6]], gh: [[1.25, 0.87], [0.45, 1.38], [-0.95, 1.41], [-1.62, 0.91]], wz: [1.45, -1.42] },
  3: { L: 4.6, W: 1.9, low: [[-2.3, 0.42], [2.28, 0.42], [2.33, 0.75], [2.2, 1.02], [1.3, 1.12], [-2.25, 1.15], [-2.32, 0.8]], gh: [[1.22, 1.1], [0.55, 1.72], [-2.08, 1.75], [-2.24, 1.14]], wz: [1.45, -1.45], r: 0.37 },
  6: { L: 4.45, W: 1.92, low: [[-2.2, 0.26], [2.18, 0.26], [2.25, 0.42], [2.16, 0.62], [1.2, 0.8], [-1.6, 0.86], [-2.2, 0.82], [-2.26, 0.52]], gh: [[1.0, 0.79], [0.05, 1.2], [-0.85, 1.22], [-1.95, 0.85]], wz: [1.38, -1.32], r: 0.34 },
  4: { L: 5.0, W: 1.95, low: [[-2.5, 0.35], [2.48, 0.35], [2.52, 0.68], [2.35, 0.98], [1.6, 1.1], [-2.5, 1.12], [-2.52, 0.7]], gh: [[1.55, 1.08], [0.95, 1.98], [-2.46, 2.02], [-2.5, 1.12]], wz: [1.65, -1.6], van: true },
};
const TYRES = new Map();
function tyreGeo(R, w) {
  const key = R + ':' + w + ':' + TQ.tyre; if (TYRES.has(key)) return TYRES.get(key);
  const pts = [], r0 = R * 0.6, sh = Math.min(w * 0.35, R * 0.18);
  pts.push(new THREE.Vector2(r0, -w / 2));
  for (let k = 0; k <= 2; k++) { const a = -Math.PI / 2 + k / 2 * Math.PI / 2; pts.push(new THREE.Vector2(R - sh + Math.cos(a) * sh, -w / 2 + sh + Math.sin(a) * sh)); }
  for (let k = 0; k <= 2; k++) { const a = k / 2 * Math.PI / 2; pts.push(new THREE.Vector2(R - sh + Math.cos(a) * sh, w / 2 - sh + Math.sin(a) * sh)); }
  pts.push(new THREE.Vector2(r0, w / 2));
  const g = new THREE.LatheGeometry(pts, TQ.tyre).rotateZ(Math.PI / 2);
  TYRES.set(key, g); return g;
}
function trafficParts(kind, noWheels = false, lite = false) {
  const ckey = kind + (noWheels ? ':nw' : '') + (lite ? ':lite' : '');
  if (TRAFFIC_GEO.has(ckey)) return TRAFFIC_GEO.get(ckey);
  TQ = lite ? { seg: 1, edge: 1.6, steps: 1, bev: 1, tyre: 7, small: 0.35 } : { seg: 3, edge: 0.42, steps: 4, bev: 3, tyre: 14, small: 0.1 };
  const parts = { paint: [], dark: [], glass: [], chrome: [], head: [], tail: [], plate: [], white: [] };
  const box = (list, w, h, d, x, y, z) => list.push(rbox(w, h, d, 0.03).translate(x, y, z));
  let L, W, wheels, R = 0.32, SS = null;
  if (kind === 5) {
    // city bus: long box body, window band, big windscreen
    L = 11; W = 2.5; R = 0.5;
    parts.white.push(extrudeSide([[-5.5, 0.45], [5.4, 0.45], [5.5, 0.9], [5.45, 3.0], [5.2, 3.2], [-5.4, 3.2], [-5.5, 2.9]], W, 0.14, 0.3));
    parts.paint.push(rbox(W + 0.04, 0.55, L - 0.3, 0.12).translate(0, 0.95, 0));
    for (const s of [1, -1]) parts.glass.push(new THREE.PlaneGeometry(L - 2.2, 1.0).rotateY(s * Math.PI / 2).translate(s * (W / 2 + 0.03), 2.15, -0.4));
    parts.glass.push(new THREE.PlaneGeometry(W * 0.86, 1.6).rotateX(-0.08).translate(0, 2.15, L / 2 + 0.02));
    box(parts.dark, W * 0.8, 0.35, 0.05, 0, 2.95, L / 2 + 0.01);                       // destination board
    box(parts.dark, W + 0.06, 0.3, 0.2, 0, 0.55, L / 2); box(parts.dark, W + 0.06, 0.3, 0.2, 0, 0.55, -L / 2);
    for (const s of [1, -1]) { box(parts.head, 0.4, 0.18, 0.06, s * (W / 2 - 0.35), 0.95, L / 2 + 0.02); box(parts.tail, 0.3, 0.3, 0.06, s * (W / 2 - 0.25), 1.2, -L / 2 - 0.02); box(parts.dark, 0.08, 0.5, 0.3, s * (W / 2 + 0.2), 2.6, L / 2 - 0.2); }
    box(parts.dark, 0.06, 2.1, 1.1, W / 2 + 0.03, 1.5, 3.6); box(parts.dark, 0.06, 2.1, 1.1, W / 2 + 0.03, 1.5, -0.8);   // doors
    box(parts.plate, 0.5, 0.12, 0.02, 0, 0.55, L / 2 + 0.11);
    wheels = [[3.6, 1], [-3.2, 1]];
  } else if (kind === 2) {
    L = 6.6; W = 2.35; R = 0.46;
    // cab with a sloped windscreen, and a ribbed box body
    const cab = [[1.9, 0.55], [3.3, 0.55], [3.3, 1.5], [3.05, 2.55], [1.9, 2.6]];
    parts.paint.push(extrudeSide(cab.map(([z, y]) => [z - 1.0, y]), W, 0.12, 0.22));
    parts.glass.push(pane([2.3 - 0.02, 1.6], [2.05 - 0.02, 2.45], W * 0.86));
    for (const s of [1, -1]) parts.glass.push(sideWindow([[2.2, 1.55], [2.0, 2.4], [1.15, 2.42], [1.15, 1.55]], W / 2 + 0.005, s));
    parts.white.push(rbox(W, 2.6, 4.6, 0.12).translate(0, 0.75 + 1.3, -1.1));
    for (let k = 0; k < 7; k++) box(parts.chrome, W + 0.04, 0.06, 0.06, 0, 0.9 + k * 0.37, 1.18), box(parts.chrome, W + 0.04, 0.06, 0.06, 0, 0.9 + k * 0.37, -3.38);
    box(parts.dark, W * 0.95, 0.3, 6.2, 0, 0.5, -0.1);                                   // chassis rails
    box(parts.dark, W + 0.1, 0.3, 0.25, 0, 0.55, 2.35);                                  // bumper
    box(parts.dark, W * 0.6, 0.55, 0.05, 0, 1.0, 2.33);                                  // grille
    for (const s of [1, -1]) { box(parts.head, 0.36, 0.2, 0.06, s * (W / 2 - 0.3), 1.0, 2.33); box(parts.tail, 0.3, 0.2, 0.06, s * (W / 2 - 0.25), 0.8, -3.42); box(parts.paint, 0.08, 0.3, 0.22, s * (W / 2 + 0.15), 2.0, 1.95); box(parts.dark, 0.05, 0.5, 0.4, s * (W / 2 - 0.2), 0.6, -2.6); }
    box(parts.plate, 0.5, 0.12, 0.02, 0, 0.55, 2.49);
    wheels = [[1.55, 1], [-1.9, 2], [-2.9, 2]];
  } else {
    const S = TRAFFIC_STYLES[kind]; L = S.L; W = S.W; R = S.r || 0.32; SS = S;
    parts.paint.push(extrudeSide(S.low, W, 0.1, 0.16));
    parts.paint.push(extrudeSide(S.gh, W * 0.84, 0.08, 0.14));
    // glass: windscreen, rear window, side windows with a B-pillar
    const gh = S.gh;
    parts.glass.push(pane([gh[0][0] + 0.02, gh[0][1] + 0.04], [gh[1][0] + 0.02, gh[1][1] - 0.02], W * 0.72));
    if (!S.van) parts.glass.push(pane([gh[3][0] - 0.02, gh[3][1] + 0.04], [gh[2][0] - 0.02, gh[2][1] - 0.02], W * 0.7));
    const side = S.van ? [gh[0], gh[1], [gh[1][0] - 0.85, gh[1][1]], [gh[0][0] - 0.85, gh[0][1]]] : gh;
    for (const s of [1, -1]) parts.glass.push(sideWindow(side, W * 0.42 + 0.012, s));
    if (!S.van) { const bz = (gh[1][0] + gh[2][0]) / 2; for (const s of [1, -1]) box(parts.paint, 0.03, (gh[1][1] - gh[0][1]) * 0.8, 0.12, s * (W * 0.42 + 0.03), (gh[0][1] + gh[1][1]) / 2 + 0.02, bz); }
    const zf = S.low[2][0], zr = S.low[S.low.length - 1][0], yb = S.low[0][1];
    parts.dark.push(rbox(W * 0.98, 0.24, 0.24, 0.1).translate(0, yb + 0.12, zf + 0.0));          // bumpers
    parts.dark.push(rbox(W * 0.98, 0.24, 0.24, 0.1).translate(0, yb + 0.12, zr - 0.0));
    box(parts.dark, W * 0.46, 0.14, 0.05, 0, yb + 0.36, zf + 0.04);          // grille
    box(parts.plate, 0.5, 0.11, 0.02, 0, yb + 0.12, zf + 0.13); box(parts.plate, 0.5, 0.11, 0.02, 0, yb + 0.12, zr - 0.13);
    for (const s of [1, -1]) {
      box(parts.head, 0.36, 0.12, 0.06, s * (W / 2 - 0.3), yb + 0.38, zf - 0.02);
      box(parts.tail, 0.34, 0.14, 0.06, s * (W / 2 - 0.25), yb + 0.42, zr + 0.02);
      box(parts.paint, 0.1, 0.1, 0.16, s * (W / 2 + 0.1), gh[0][1] + 0.08, gh[0][0] - 0.12);     // mirrors
      box(parts.dark, 0.02, 0.04, 0.22, s * (W / 2 + 0.065), (gh[0][1] + yb) / 2 + 0.1, 0.2);      // door handles
    }
    // bend everything on the body (not the wheels, added below) into the rounded shape
    for (const list of Object.values(parts)) for (let k = 0; k < list.length; k++) { if (list[k].index) list[k] = list[k].toNonIndexed(); bendCar(list[k], S); }
    for (const k of ['paint', 'glass']) parts[k] = parts[k].map((g) => { for (const a of Object.keys(g.attributes)) if (!['position', 'uv'].includes(a)) g.deleteAttribute(a); return toCreasedNormals(g, 0.7); });
    if (kind === 3) { box(parts.chrome, 0.05, 0.05, 1.6, W * 0.38, gh[2][1] + 0.07, (gh[1][0] + gh[2][0]) / 2); box(parts.chrome, 0.05, 0.05, 1.6, -W * 0.38, gh[2][1] + 0.07, (gh[1][0] + gh[2][0]) / 2); }  // roof rails
    wheels = [[S.wz[0], 1], [S.wz[1], 1]];
  }
  // wheels: tyre, rim and hub, with a dark arch behind
  const wx = W / 2 - 0.12;
  const wheelPos = [];
  for (const [z, n] of noWheels ? [] : wheels) for (const s of [1, -1]) for (let k = 0; k < n; k++) {
    const x = s * (wx - k * 0.32);
    parts.dark.push((lite ? new THREE.CylinderGeometry(R, R, 0.24, 8).rotateZ(Math.PI / 2) : tyreGeo(R, 0.24).clone()).translate(x, R, z));
    if (k === 0) {
      parts.chrome.push(new THREE.CylinderGeometry(R * 0.62, R * 0.62, 0.02, lite ? 6 : 12).rotateZ(Math.PI / 2).translate(x + s * 0.12, R, z));
      if (!lite) parts.dark.push(new THREE.CylinderGeometry(R * 0.2, R * 0.2, 0.03, 8).rotateZ(Math.PI / 2).translate(x + s * 0.13, R, z));
      { const arch = new THREE.CircleGeometry(R + 0.07, lite ? 8 : 16).rotateY(s * Math.PI / 2).translate(s * (W / 2 + 0.065), R, z); parts.dark.push(SS ? bendCar(arch.toNonIndexed(), SS) : arch); }
    }
    wheelPos.push([x, z]);
  }
  const merged = {};
  for (const [k, list] of Object.entries(parts)) if (list.length) merged[k] = mergeGeometries(list.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const a of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(a)) n.deleteAttribute(a); if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); if (!n.attributes.normal) n.computeVertexNormals(); return n; }));
  const out = { merged, L, W, R, wheels: wheels.map(([z]) => z) };
  TRAFFIC_GEO.set(ckey, out);
  return out;
}
const TRAFFIC_MATS = {
  dark: new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.7 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1d2a36, roughness: 0.05, metalness: 0.7, side: THREE.DoubleSide }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xc4c8cc, roughness: 0.25, metalness: 0.9 }),
  plate: new THREE.MeshStandardMaterial({ color: 0xf2f0e6, roughness: 0.5 }),
  white: new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.6 }),
};
export { trafficParts, TRAFFIC_MATS };
export function createTrafficCar(color, kind = 0, noWheels = false) {
  const g = new THREE.Group();
  const { merged, L, W } = trafficParts(kind, noWheels);
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 0 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x880000, emissive: 0xff0000, emissiveIntensity: 0.2 });
  const mats = { ...TRAFFIC_MATS, paint, head, tail };
  for (const [k, geo] of Object.entries(merged)) { const m = new THREE.Mesh(geo, mats[k]); m.castShadow = k === 'paint' || k === 'white'; g.add(m); }
  g.userData = { L, W, head, tail };
  return g;
}
