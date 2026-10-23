import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Res1n's 1989 MX-5 (CC-BY-4.0) -> body space: metres, origin on the ground mid-wheelbase, +z forward,
// +x = driver's side (left), wheel centres at y = 0.29. Moving parts become their own nodes.
const WB = 2.265, WHEEL_Y = 0.29, WHEEL_R = 0.29;

function classify(c, mat) {
  const [cx, cy, cz] = c.c, [sx, sy, sz] = c.s, ax = Math.abs(cx), side = cx > 0 ? 'L' : 'R', big = Math.max(sx, sy, sz);
  // wheels and brakes
  for (const w of c.wheels) {
    const d = Math.hypot(cy - w.y, cz - w.z);
    if (ax > 0.55 && Math.sign(cx) === Math.sign(w.x) && d < 0.2 && big < 0.65) {
      if (mat === 'black' && sy > 0.1 && d > 0.06) return 'caliper_' + w.name;
      if (['tire', 'material', 'brakedisk', 'chrome', 'black'].includes(mat)) return 'wheel_' + w.name;
    }
  }
  if (ax > 0.33 && ax < 0.7 && cy > 0.7 && cz > 1.45 && big < 0.36) return 'popup_' + side;
  if (ax > 0.74 && cy > 0.72 && cy < 1.0 && cz > -0.15 && cz < 0.25 && big < 0.26) return 'mirror_' + side;
  if (cz < -1.6 && ax > 0.25 && (mat === 'redglass' || mat === 'orangeglass')) return 'tail_' + side;
  if (cz > 1.7 && ax > 0.3 && cy < 0.65 && (mat === 'clearglass' || mat === 'orangeglass') && ax < 0.62) return 'front_' + side;
  if (mat === 'interior_second') return 'softtop';
  if (mat === 'windowglass' && cz < -0.6) return 'softtop';
  if (mat === 'black' && cy > 1.05 && cz > -0.25 && cz < 0.15) return 'softtop';
  if (mat === 'windowglass' && ax > 0.45) return 'window_' + side;
  if (mat === 'black' && ax > 0.55 && ax < 0.72 && cy > 0.9 && cy < 1.05 && cz > -0.1 && cz < 0.45 && sy > 0.25) return 'window_' + side;
  if (mat === 'windowglass') return 'windscreen';
  // opening panels: doors (skin, inner trim panel, handle, belt seals), bonnet, boot lid
  if ((mat === 'carpaint' || mat === 'interior') && ax > 0.66 && ax < 0.88 && Math.abs(cz + 0.05) < 0.15 && sz > 0.95 && sz < 1.3 && sy > 0.4) return 'door_' + side;
  if (mat === 'chrome' && ax > 0.74 && Math.abs(cy - 0.72) < 0.05 && Math.abs(cz + 0.48) < 0.1 && big < 0.2) return 'door_' + side;
  if (mat === 'black' && ax > 0.66 && ax < 0.75 && Math.abs(cy - 0.82) < 0.04 && cz > -0.66 && cz < 0.55 && sx < 0.06) return 'door_' + side;
  if (mat === 'carpaint' && ax < 0.1 && cz > 0.9 && cz < 1.4 && cy > 0.66 && cy < 0.9 && sx > 1.2) return 'hood';
  if (mat === 'carpaint' && ax < 0.1 && cz < -1.3 && cz > -1.8 && cy > 0.74 && sz > 0.5 && sz < 0.8) return 'boot';
  if (Math.abs(cx - 0.38) < 0.12 && Math.abs(cy - 0.77) < 0.12 && cz > 0.15 && cz < 0.55 && ['interior', 'black', 'chrome'].includes(mat) && big < 0.42 && c.c[0] > 0.2) return 'steer';
  return 'body';
}

window.go = async (opts = {}) => {
  const g = await new GLTFLoader().loadAsync('scene.gltf'); const obj = g.scene; obj.updateMatrixWorld(true);
  const R = new THREE.Matrix4().makeRotationY(-Math.PI / 2).multiply(new THREE.Matrix4().makeScale(0.01, 0.01, 0.01));
  // pass 1: geometry in the rotated frame, components
  const items = [];
  obj.traverse((o) => {
    if (!o.isMesh) return;
    let geo = o.geometry.clone().applyMatrix4(R.clone().multiply(o.matrixWorld));
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    geo = mergeVertices(geo, 1e-6);
    // connectivity on positions only (normals split vertices at hard edges)
    const pa = geo.attributes.position.array, nV = pa.length / 3, key = new Map(), canon = new Int32Array(nV);
    for (let v = 0; v < nV; v++) { const k = `${Math.round(pa[v * 3] * 1e5)},${Math.round(pa[v * 3 + 1] * 1e5)},${Math.round(pa[v * 3 + 2] * 1e5)}`; let c = key.get(k); if (c === undefined) key.set(k, c = v); canon[v] = c; }
    const par = new Int32Array(nV).map((_, i) => i); const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    const ix = geo.index.array;
    for (let i = 0; i < ix.length; i += 3) { const a = find(canon[ix[i]]); par[find(canon[ix[i + 1]])] = a; par[find(canon[ix[i + 2]])] = a; }
    const comps = new Map();
    for (let v = 0; v < nV; v++) { const r = find(canon[v]); let c = comps.get(r); if (!c) comps.set(r, c = { n: 0, min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] }); c.n++; for (let d = 0; d < 3; d++) { c.min[d] = Math.min(c.min[d], pa[v * 3 + d]); c.max[d] = Math.max(c.max[d], pa[v * 3 + d]); } }
    items.push({ o, geo, find, canon, comps, mat: o.material.name.startsWith('LicPlate') ? 'LicPlate' : o.material.name });
  });
  // wheel centres from the rim components
  const rims = [];
  for (const it of items) if (it.mat === 'material') for (const c of it.comps.values()) if (c.max[1] - c.min[1] > 0.3) rims.push(c.min.map((v, d) => (v + c.max[d]) / 2));
  const zs = rims.map((c) => c[2]), zf = Math.max(...zs), zr = Math.min(...zs), midZ = (zf + zr) / 2, wy = rims[0][1];
  const k = WB / (zf - zr);
  const T = new THREE.Matrix4().makeTranslation(0, WHEEL_Y, 0).multiply(new THREE.Matrix4().makeScale(k, k, k)).multiply(new THREE.Matrix4().makeTranslation(0, -wy, -midZ));
  const toBody = (p) => new THREE.Vector3(...p).applyMatrix4(T);
  const wheels = rims.map((c) => { const p = toBody(c); return { x: p.x, y: p.y, z: p.z, name: (p.z > 0 ? 'F' : 'R') + (p.x > 0 ? 'L' : 'R') }; });
  // pass 2: classify components (in body space) and collect triangles per part/material
  const parts = new Map(), log = [];
  for (const it of items) {
    it.geo.applyMatrix4(T);
    const pa = it.geo.attributes.position.array;
    for (const c of it.comps.values()) {
      const a = toBody(c.min), b = toBody(c.max);
      c.c = [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2]; c.s = [b.x - a.x, b.y - a.y, b.z - a.z]; c.wheels = wheels;
      c.part = classify(c, it.mat);
      if (c.part !== 'body' && c.n > 100) log.push(`${c.part} ${it.o.name} ${it.mat} n=${c.n} c=${c.c.map((v) => v.toFixed(2))} s=${c.s.map((v) => v.toFixed(2))}`);
    }
    const ix = it.geo.index.array;
    for (let i = 0; i < ix.length; i += 3) {
      const part = it.comps.get(it.find(it.canon[ix[i]])).part;
      if (!parts.has(part)) parts.set(part, new Map());
      const pm = parts.get(part); if (!pm.has(it.mat)) pm.set(it.mat, { geo: it.geo, tris: [], src: it.o.material, list: [] });
      const e = pm.get(it.mat);
      // several source meshes can share a material: keep per-geometry lists
      let l = e.list.find((x) => x.geo === it.geo); if (!l) e.list.push(l = { geo: it.geo, tris: [] });
      l.tris.push(ix[i], ix[i + 1], ix[i + 2]);
    }
  }
  const build = (lists, origin, scale = 1) => {
    const pos = [], nor = [], idx = [];
    for (const { geo, tris } of lists) {
      const pa = geo.attributes.position.array, na = geo.attributes.normal.array, map = new Map();
      for (const v of tris) {
        let n = map.get(v);
        if (n === undefined) { n = pos.length / 3; map.set(v, n); pos.push((pa[v * 3] - origin.x) * scale, (pa[v * 3 + 1] - origin.y) * scale, (pa[v * 3 + 2] - origin.z) * scale); nor.push(na[v * 3], na[v * 3 + 1], na[v * 3 + 2]); }
        idx.push(n);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setIndex(idx);
    return geo;
  };
  const boxOf = (pm) => { const b = new THREE.Box3(); for (const e of pm.values()) for (const { geo, tris } of e.list) { const pa = geo.attributes.position.array; for (const v of tris) b.expandByPoint(new THREE.Vector3(pa[v * 3], pa[v * 3 + 1], pa[v * 3 + 2])); } return b; };
  const root = new THREE.Group(); root.name = 'mx5v2';
  const info = { k, wheels, parts: {} };
  for (const [part, pm] of parts) {
    const node = new THREE.Group(); node.name = part; root.add(node);
    let origin = new THREE.Vector3(), scale = 1;
    const box = boxOf(pm);
    if (part.startsWith('wheel_')) { const w = wheels.find((q) => 'wheel_' + q.name === part); origin.set(w.x, w.y, w.z); const r = box.getSize(new THREE.Vector3()).y / 2; scale = WHEEL_R / r; info.wheelScale = scale; }
    else if (part.startsWith('popup_')) origin = opts.hinge ? new THREE.Vector3(Math.sign(box.getCenter(new THREE.Vector3()).x) * Math.abs(opts.hinge[0]), opts.hinge[1], opts.hinge[2]) : box.getCenter(new THREE.Vector3());
    else if (part.startsWith('door_')) { const b = box.getCenter(new THREE.Vector3()); origin.set(Math.sign(b.x) * 0.84, 0.55, 0.53); }  // front hinge line
    else if (part === 'hood') origin.set(0, 0.84, 0.475);   // rear hinge, under the scuttle
    else if (part === 'boot') origin.set(0, 0.86, -1.275);  // front hinge, behind the top well
    else if (part === 'steer') { origin.set(box.getCenter(new THREE.Vector3()).x, 0.7625, 0.195); node.userData.axis = [0, -0.339, 0.941]; }
    else if (part !== 'body' && part !== 'softtop' && part !== 'windscreen') origin = box.getCenter(new THREE.Vector3());
    node.position.copy(origin);
    let nv = 0;
    for (const [mat, e] of pm) {
      const geo = build(e.list, origin, scale); nv += geo.attributes.position.count;
      const sm = e.src;
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ name: mat, color: sm.color, roughness: sm.roughness, metalness: sm.metalness, transparent: sm.transparent, opacity: sm.opacity, side: THREE.DoubleSide }));
      m.name = part + ':' + mat; node.add(m);
    }
    info.parts[part] = { nv, box: [box.min.toArray().map((v) => +v.toFixed(3)), box.max.toArray().map((v) => +v.toFixed(3))] };
  }
  root.userData = { credit: '"1989 Mazda MX-5 (NA)" by Res1n, CC-BY-4.0, https://sketchfab.com/3d-models/1989-mazda-mx-5-na-bd6429f3d02a426f9a714a66c33bb353' };
  window.root = root;
  if (opts.noExport) return JSON.stringify(info, null, 1) + '\n' + log.join('\n');
  const buf = await new GLTFExporter().parseAsync(root, { binary: true });
  let bin = ''; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { b64: btoa(bin), name: 'raw2.glb', info: JSON.stringify(info) };
};

// ---- inspection renders of window.root
let R3;
window.shot = (o) => {
  if (!R3) { R3 = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); R3.setSize(900, 600); R3.localClippingEnabled = true; document.body.appendChild(R3.domElement); }
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9fb3c4);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 2.5)); const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(3, 5, 4); scene.add(d);
  const clip = o.clip ? [new THREE.Plane(new THREE.Vector3(...o.clip[0]), o.clip[1])] : [];
  const hl = o.hl || {}, hide = o.hide || [];
  const r = root.clone(true);
  r.traverse((m) => {
    if (!m.isMesh) return;
    const part = m.parent.name; m.visible = !hide.includes(part) && !(o.only && !o.only.includes(part));
    m.material = m.material.clone(); m.material.clippingPlanes = clip;
    if (hl[part] !== undefined) { m.material.color.set(hl[part]); m.material.transparent = false; m.material.opacity = 1; }
  });
  if (o.rot) for (const [name, ax, ang] of o.rot) { const n = r.getObjectByName(name); n.rotation[ax] = ang; }
  if (o.pose) for (const [name, a, rz, dy] of o.pose) { const n = r.getObjectByName(name); const sx = Math.sign(n.position.x);
    n.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rz * sx).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a)); n.position.y += dy; }
  scene.add(r);
  const s = o.size || 1.2, cam = new THREE.OrthographicCamera(-s * 1.5, s * 1.5, s, -s, 0.01, 50);
  cam.position.set(...o.pos); cam.lookAt(...o.at); scene.add(cam);
  R3.render(scene, cam); return R3.domElement.toDataURL('image/png').split(',')[1];
};

// ---- fit the closed pop-up: angle (and hinge nudge) that puts the lid flush with the hood around it
window.fitPod = (opts = {}) => {
  const pod = root.getObjectByName('popup_L'), body = root.getObjectByName('body');
  const paint = (n) => n.children.find((m) => m.name.endsWith(':carpaint'));
  const lidG = paint(pod).geometry, bodyG = paint(body).geometry;
  const H = pod.position.clone();
  const lp = lidG.attributes.position, ln = lidG.attributes.normal;
  // lid top: closed-state up-facing vertices of the pod paint
  const rot = (x, y, z, a) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
  const lid = [];
  for (let i = 0; i < lp.count; i++) { const n = rot(ln.getX(i), ln.getY(i), ln.getZ(i), 0.82); if (n[1] > 0.8) lid.push([lp.getX(i), lp.getY(i), lp.getZ(i)]); }
  // closed footprint (xz) at the guess angle
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [x, y, z] of lid) { const p = rot(x, y, z, 0.82); x0 = Math.min(x0, x + H.x); x1 = Math.max(x1, x + H.x); z0 = Math.min(z0, p[2] + H.z); z1 = Math.max(z1, p[2] + H.z); }
  // hood ring around the opening
  const bp = bodyG.attributes.position, bn = bodyG.attributes.normal, ring = [];
  const m = 0.07;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
    if (x < x0 - m || x > x1 + m || z < z0 - m || z > z1 + m || y < 0.6) continue;
    if (x > x0 + 0.01 && x < x1 - 0.01 && z > z0 + 0.01 && z < z1 - 0.01) continue;
    if (Math.abs(bn.getY(i)) < 0.8) continue;
    ring.push([x, y, z]);
  }
  // least squares quadratic y = f(x, z)
  const basis = (x, z) => [1, x, z, x * x, x * z, z * z];
  const A = Array.from({ length: 6 }, () => new Array(6).fill(0)), bvec = new Array(6).fill(0);
  for (const [x, y, z] of ring) { const f = basis(x, z); for (let r = 0; r < 6; r++) { bvec[r] += f[r] * y; for (let c = 0; c < 6; c++) A[r][c] += f[r] * f[c]; } }
  for (let c = 0; c < 6; c++) { let p = c; for (let r = c + 1; r < 6; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; [bvec[c], bvec[p]] = [bvec[p], bvec[c]];
    for (let r = 0; r < 6; r++) if (r !== c) { const k = A[r][c] / A[c][c]; for (let q = c; q < 6; q++) A[r][q] -= k * A[c][q]; bvec[r] -= k * bvec[c]; } }
  const coef = bvec.map((v, i) => v / A[i][i]);
  const surf = (x, z) => basis(x, z).reduce((a, f, i) => a + f * coef[i], 0);
  let ringErr = 0; for (const [x, y, z] of ring) ringErr += (y - surf(x, z)) ** 2;
  // keep only the outer lid skin: closed-state points within 3 cm of the hood surface
  { const keep = lid.filter(([x, y, z]) => { const p = rot(x, y, z, 0.82); return p[1] + H.y > surf(x + H.x, p[2] + H.z) - 0.03; }); lid.length = 0; lid.push(...keep); }
  const xm = (x0 + x1) / 2;
  const evalA = (a, dy = 0, dz = 0, rz = 0) => {
    let e = 0, mean = 0, front = 0, back = 0, nf = 0, nb = 0, inn = 0, out = 0, ni = 0, no = 0;
    const c = Math.cos(rz), sn = Math.sin(rz);
    for (const [x0_, y0_, z0_] of lid) { const p = rot(x0_, y0_, z0_, a); const xr = x0_ * c - p[1] * sn, yr = x0_ * sn + p[1] * c;
      const X = xr + H.x, Y = yr + H.y + dy, Z = p[2] + H.z + dz; const d = Y - surf(X, Z); e += d * d; mean += d;
      if (Z > (z0 + z1) / 2) { front += d; nf++; } else { back += d; nb++; } if (X < xm) { inn += d; ni++; } else { out += d; no++; } }
    return { rms: Math.sqrt(e / lid.length), mean: mean / lid.length, front: front / nf, back: back / nb, inn: inn / ni, out: out / no };
  };
  const rows = [];
  for (let a = 0.78; a <= 0.9; a += 0.02) { const r = evalA(a); rows.push(`${a.toFixed(2)} rms=${(r.rms * 1000).toFixed(1)} mean=${(r.mean * 1000).toFixed(1)} front=${(r.front * 1000).toFixed(1)} back=${(r.back * 1000).toFixed(1)} inner=${(r.inn * 1000).toFixed(1)} outer=${(r.out * 1000).toFixed(1)}`); }
  let best = null;
  for (let a = 0.7; a <= 1.1; a += 0.005) for (let rz = -0.45; rz <= 0.1; rz += 0.01) for (let dy = -0.04; dy <= 0.04; dy += 0.0025) { const r = evalA(a, dy, 0, rz); if (!best || r.rms < best.r.rms) best = { a, dy, dz: 0, rz, r }; }
  const b = best.r;
  return `lid ${lid.length} ring ${ring.length} ring rms ${(Math.sqrt(ringErr / ring.length) * 1000).toFixed(1)}mm x ${x0.toFixed(3)}..${x1.toFixed(3)} z ${z0.toFixed(3)}..${z1.toFixed(3)}\n` + rows.join('\n') + `\nBEST a=${best.a.toFixed(3)} rz=${best.rz.toFixed(2)} dy=${best.dy.toFixed(4)} rms=${(b.rms * 1000).toFixed(1)} front=${(b.front * 1000).toFixed(1)} back=${(b.back * 1000).toFixed(1)} inner=${(b.inn * 1000).toFixed(1)} outer=${(b.out * 1000).toFixed(1)}`;
};
