// Red Mesa Raceway, the public side: an entrance plaza at the end of the access road (arch, ticket booths, a barrier
// that lifts as you arrive, flags), the infield bridge from the paddock over the pit lane and the main straight
// (with the circuit's name across it, Le Mans style), and the village in the infield: a high street of team shops,
// cafés and hospitality, the museum, a hotel, food trucks, a big screen and a campsite.
import * as THREE from 'three';
import { RBox } from './shapes.js';
import { TRACK, DECKS, groundHeight } from './world.js';
import { addCollider } from './scenery.js';
import { trafficParts, TRAFFIC_MATS } from './car.js';

export function createRaceway({ scene }) {
  const T = TRACK, H = T.h, group = new THREE.Group(); scene.add(group);
  const farHide = [];   // small infield detail (parked cars, fans, tents) hidden from far away
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
  const tex = (text, bg, fg = '#fff', w = 1024, h = 128) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; let fs = h * 0.66; do { g.font = `700 ${fs}px "Barlow Condensed", Arial`; fs -= 4; } while (g.measureText(text).width > w * 0.94 && fs > 12); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h * 0.54); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const box = (w, h, d, m, x, y, z, parent = group) => { const o = new THREE.Mesh(new RBox(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  const conc = M(0xcfcac0), asph = M(0x3a3b3e, { roughness: 0.9 }), red = M(0xc8102e), white = M(0xf2f0ea), steel = M(0x8c9196, { metalness: 0.6, roughness: 0.4 });

  // ---------------------------------------------------------------- the infield bridge
  const D = DECKS[0];
  if (D) {
    const P = D.pts, hw = D.hw;
    // deck: a strip with a thick edge, following the profile
    const pos = [], idx = [];
    P.forEach(([x, z, h], k) => { pos.push(x - hw, h, z, x + hw, h, z, x - hw, h - 0.7, z, x + hw, h - 0.7, z); if (k) { const a = (k - 1) * 4, b = k * 4; idx.push(a, b, a + 1, a + 1, b, b + 1, a + 2, a + 3, b + 2, a + 3, b + 3, b + 2, a, a + 2, b, a + 2, b + 2, b, a + 1, b + 1, a + 3, a + 3, b + 1, b + 3); } });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const deck = new THREE.Mesh(geo, asph); deck.receiveShadow = deck.castShadow = true; group.add(deck);
    // parapets, pillars where it's high, posts that stop you driving off the ramps
    for (let k = 0; k < P.length - 1; k++) {
      const [x, z, h] = P[k], [, z2, h2] = P[k + 1], L = Math.hypot(z2 - z, h2 - h), ang = Math.atan2(h2 - h, z2 - z);
      for (const s of [-1, 1]) { const p = box(0.35, 0.9, L + 0.05, conc, x + s * (hw + 0.17), (h + h2) / 2 + 0.45, (z + z2) / 2); p.rotation.x = -ang; }
      const e = h - H;
      if (k % 5 === 0 && e > 1.6) for (const s of [-1, 1]) box(0.7, e - 0.6, 0.7, conc, x + s * (hw - 0.8), H + (e - 0.6) / 2, z);
      if (e > 0.5 && e < 3.6) for (const s of [-1, 1]) addCollider(x + s * (hw + 0.45), z, 0.35, h + 1);
    }
    // the name across the bridge, both faces, over the straight
    const ban = tex('RED MESA RACEWAY', '#c8102e', '#fff', 2048, 192);
    const zc = T.z - 105, top = T.bridge.top;
    for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw + 0.8, 1.6), new THREE.MeshStandardMaterial({ map: ban })); b.position.set(T.bridge.x, top - 0.8, zc + s * 13.1); b.rotation.y = s > 0 ? 0 : Math.PI; group.add(b); }
    // a white arch frame on the bridge (tyre-sponsor style)
    for (const z of [zc - 13.4, zc + 13.4]) { box(2 * hw + 1.4, 0.5, 0.5, white, T.bridge.x, top + 3.2, z); for (const s of [-1, 1]) box(0.5, 3.2, 0.5, white, T.bridge.x + s * (hw + 0.45), top + 1.6, z); }
  }

  // ---------------------------------------------------------------- entrance plaza at the end of the access road
  const E = T.entrance;
  let barrier = null;
  if (E) {
    const yaw = Math.atan2(E.tx, E.tz), g = new THREE.Group(); g.position.set(E.x - E.tx * 14, H, E.z - E.tz * 14); g.rotation.y = yaw; group.add(g);   // local z along the road
    for (const s of [-1, 1]) { box(1.2, 8, 1.2, red, s * 7.5, 4, 0, g); }
    const arch = box(16.2, 1.8, 1.2, M(0x1b1d20), 0, 8.3, 0, g);
    const sign = tex('RED MESA RACEWAY · WELCOME', '#1b1d20', '#fff', 2048, 192);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(15.6, 1.5), new THREE.MeshStandardMaterial({ map: sign, emissive: 0xffffff, emissiveMap: sign, emissiveIntensity: 0.15 })); p.position.set(0, 8.3, s * 0.62); p.rotation.y = s > 0 ? 0 : Math.PI; g.add(p); }
    void arch;
    // ticket booths with the lifting barrier
    for (const s of [-1, 1]) { const b = box(2.4, 2.6, 3, white, s * 6, 1.3, 6, g); void b; box(2.8, 0.25, 3.4, red, s * 6, 2.75, 6, g); const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), M(0x22303c, { metalness: 0.5, roughness: 0.1 })); w.position.set(s * 6 - s * 1.21, 1.6, 6); w.rotation.y = -s * Math.PI / 2; g.add(w); }
    barrier = new THREE.Group(); barrier.position.set(-4.6, 1.0, 7.8); g.add(barrier);
    const arm = new THREE.Mesh(new RBox(9, 0.15, 0.15), M(0xf2f2f2)); arm.position.x = 4.5; barrier.add(arm);
    for (let k = 0; k < 4; k++) { const st = new THREE.Mesh(new RBox(0.6, 0.16, 0.16), red); st.position.set(1 + k * 2.2, 0, 0); barrier.add(st); }
    g.updateMatrixWorld(true);
    for (const s of [-1, 1]) { const v = new THREE.Vector3(s * 7.5, 0, 0).applyMatrix4(g.matrixWorld); addCollider(v.x, v.z, 0.8, H + 8.5); const b = new THREE.Vector3(s * 6, 0, 6).applyMatrix4(g.matrixWorld); addCollider(b.x, b.z, 1.6, H + 2.8); }
    // flag poles along the approach
    const fc = [0xc8102e, 0x1d6fd1, 0xffb000, 0x2fbf5a, 0xf2f2f2];
    for (let k = 0; k < 6; k++) for (const s of [-1, 1]) { const d = 22 + k * 12, x = E.x - E.tx * d - E.tz * s * 6.5, z = E.z - E.tz * d + E.tx * s * 6.5, y = groundHeight(x, z);
      box(0.12, 7, 0.12, steel, x, y + 3.5, z); const f = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), M(fc[(k + (s > 0 ? 2 : 0)) % 5], { side: THREE.DoubleSide })); f.position.set(x + 0.8 * E.tz, y + 6.4, z - 0.8 * E.tx); f.rotation.y = yaw + Math.PI / 2; group.add(f); }
    E.g = g;
  }

  // ---------------------------------------------------------------- the infield village
  const V = T.village;
  if (V) {
    const hs = V.streets[1], ms = V.streets[0], z0 = hs.pts[0][1], hx0 = hs.pts[0][0], hx1 = hs.pts[hs.n - 1][0];
    const awn = ['#c8102e', '#1d6fd1', '#2f9f4a', '#e5641c', '#6b2d5c', '#1b1d20'];
    const NAMES = ['TEAM CAFÉ', 'PIT SHOP', 'RED MESA STORE', 'BOULANGERIE', 'TEAM HOSPITALITY', 'GRILL & GO', 'MODEL CARS', 'BAR DU VIRAGE', 'TYRE CO.', 'GELATO', 'PRESS CENTRE', 'FAN CLUB'];
    const winM = new THREE.MeshStandardMaterial({ color: 0x2b3a44, roughness: 0.15, metalness: 0.4, emissive: 0xffc98a, emissiveIntensity: 0 });
    const shop = (x, z, side, name, k) => {
      const g = new THREE.Group(); g.position.set(x, H, z + side * 11.5); g.rotation.y = side > 0 ? Math.PI : 0; group.add(g);   // facing the street
      const w = 10, hgt = 6 + (k % 3) * 1.6;
      box(w, hgt, 8, M([0xf1eee6, 0xe8dcc6, 0xd9e2e6, 0xefe2d2][k % 4]), 0, hgt / 2, -4, g);
      box(w + 0.4, 0.4, 8.4, M(0x3b3f45), 0, hgt + 0.2, -4, g);
      const aw = new THREE.Mesh(new THREE.PlaneGeometry(w - 1, 2.2), M(new THREE.Color(awn[k % awn.length]).getHex(), { side: THREE.DoubleSide })); aw.position.set(0, 3.1, 0.9); aw.rotation.x = -1.0; g.add(aw);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w - 1.5, 0.9), new THREE.MeshStandardMaterial({ map: tex(name, awn[k % awn.length]) })); s.position.set(0, 4.6, 0.02); g.add(s);
      for (const wx of [-2.8, 2.8]) { const wi = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.8), winM); wi.position.set(wx, 1.6, 0.02); g.add(wi); }
      for (let u = 0; u < (hgt > 7 ? 2 : 1); u++) for (const wx of [-3, 0, 3]) { const wi = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), winM); wi.position.set(wx, 6.2 + u * 1.6, 0.02); if (6.2 + u * 1.6 < hgt - 0.6) g.add(wi); }
      // café tables out front for some
      if (k % 3 === 0) for (const tx of [-3, 0, 3]) { box(0.8, 0.05, 0.8, white, tx, 0.75, 2.4, g); box(0.06, 0.75, 0.06, steel, tx, 0.37, 2.4, g); const um = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.4, 8), M(new THREE.Color(awn[(k + 1) % awn.length]).getHex())); um.position.set(tx, 2.2, 2.4); g.add(um); }
      g.updateMatrixWorld(true); const c = new THREE.Vector3(0, 0, -4).applyMatrix4(g.matrixWorld); addCollider(c.x, c.z, 5.6, H + hgt);
    };
    let k = 0;
    for (let x = hx0 + 12; x < hx1 - 8; x += 13) for (const side of [-1, 1]) { if (Math.abs(x - ms.pts[0][0]) < 9) continue; if (side < 0 && x > T.x + 30 && x < T.x + 90) continue; shop(x, z0, side, NAMES[k % NAMES.length], k); k++; }
    // the museum: columns and a big glass front, opposite the bridge foot
    { const g = new THREE.Group(); g.position.set(V.x - 22, H, z0 - 28); g.rotation.y = 0; group.add(g);
      box(26, 9, 14, M(0xe9e6df), 0, 4.5, 0, g); box(27, 0.6, 15, M(0x2a2d33), 0, 9.3, 0, g);
      for (let c2 = -11; c2 <= 11; c2 += 3.6) box(0.7, 7, 0.7, white, c2, 3.5, 7.6, g);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(22, 6), winM); gl.position.set(0, 3.5, 7.02); g.add(gl);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(18, 1.4), new THREE.MeshStandardMaterial({ map: tex('RACEWAY MUSEUM · 24 HOURS OF RED MESA', '#1b1d20') })); s.position.set(0, 8.2, 7.3); g.add(s);
      addCollider(g.position.x - 7, g.position.z, 7.5, H + 9.6); addCollider(g.position.x + 7, g.position.z, 7.5, H + 9.6); }
    // hotel at the east end of the high street
    { const g = new THREE.Group(); g.position.set(hx1 - 10, H, z0 - 30); g.rotation.y = 0; group.add(g);
      box(18, 15, 12, M(0xdcd4c4), 0, 7.5, 0, g); box(19, 0.5, 13, M(0x3b3f45), 0, 15.3, 0, g);
      for (let fl = 0; fl < 4; fl++) for (let wx = -7; wx <= 7; wx += 2.8) { const wi = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.4), winM); wi.position.set(wx, 2 + fl * 3.4, 6.02); g.add(wi); }
      const s = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.4), new THREE.MeshStandardMaterial({ map: tex('PADDOCK HOTEL', '#1d3f7a') })); s.position.set(0, 13.8, 6.05); g.add(s);
      addCollider(g.position.x, g.position.z, 9.5, H + 15.5); }
    // big screen facing the high street, food trucks, flags across the street
    { const g = new THREE.Group(); g.position.set(V.x + 40, H, z0 + 26); g.rotation.y = Math.PI; group.add(g); box(0.6, 9, 0.6, steel, -5, 4.5, 0, g); box(0.6, 9, 0.6, steel, 5, 4.5, 0, g);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(10, 5.6), new THREE.MeshStandardMaterial({ map: tex('LIVE · RED MESA RACEWAY', '#0b1a33', '#ffb000', 1024, 576), emissive: 0xffffff, emissiveIntensity: 0.6 })); scr.material.emissiveMap = scr.material.map; scr.position.set(0, 6.4, 0.35); g.add(scr); box(10.6, 6.2, 0.4, M(0x111111), 0, 6.4, 0.1, g); addCollider(g.position.x, g.position.z, 2.5, H + 9.5); }
    for (const [dx, c] of [[-30, 0xffb000], [-18, 0x3fa9ff], [95, 0xc8102e]]) { const g = new THREE.Group(); g.position.set(T.x + dx, H, z0 + 9); group.add(g); box(5.5, 2.6, 2.2, M(c), 0, 1.75, 0, g); box(1.6, 1.8, 2.1, M(c), 3.4, 1.35, 0, g); const h2 = new THREE.Mesh(new THREE.PlaneGeometry(3, 1), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffc070, emissiveIntensity: 0.3 })); h2.position.set(-0.3, 2, -1.11); h2.rotation.y = Math.PI; g.add(h2); for (const wx of [-1.8, 3.2]) for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), M(0x111111)); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.42, s * 1.05); g.add(w); } addCollider(g.position.x + 1, g.position.z, 3, H + 3); }
    // bunting across the high street
    { const fp = [], fcol = [], col = new THREE.Color(), cs = [0xc8102e, 0xf2f2f2, 0x1d6fd1, 0xffb000];
      for (let x = hx0 + 20; x < hx1 - 10; x += 26) { const a = [x, H + 7, z0 - 10], b = [x + 6, H + 7, z0 + 10];
        for (let q = 0; q < 14; q++) { const t0 = q / 14, t1 = (q + 0.6) / 14, sag = (t) => -1.5 * 4 * t * (1 - t), p0 = a.map((v, i) => v + (b[i] - v) * t0 + (i === 1 ? sag(t0) : 0)), p1 = a.map((v, i) => v + (b[i] - v) * t1 + (i === 1 ? sag(t1) : 0)), pm = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - 0.4, (p0[2] + p1[2]) / 2];
          fp.push(...p0, ...p1, ...pm, ...p1, ...p0, ...pm); col.setHex(cs[q % 4]); for (let r = 0; r < 6; r++) fcol.push(col.r, col.g, col.b); } }
      const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.setAttribute('color', new THREE.Float32BufferAttribute(fcol, 3)); fg.computeVertexNormals();
      group.add(new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide }))); }
    // street lamps along the high street
    const lampM = new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffd9a0, emissiveIntensity: 0 });
    for (let x = hx0 + 6; x < hx1; x += 18) for (const s of [-1, 1]) { box(0.14, 5, 0.14, M(0x2a2d33), x, H + 2.5, z0 + s * 5.2); const l = box(0.5, 0.2, 0.5, lampM, x, H + 5.05, z0 + s * 5.2); void l; }
    // campsite south-west of the village: tents in rows
    const tentCols = [0x2f7a3a, 0x1d6fd1, 0xe5641c, 0xc8102e, 0xe8b923, 0x6b2d5c];
    for (let i = 0; i < 28; i++) { const x = T.x - 70 + (i % 7) * 11 + (Math.random() - 0.5) * 3, z = z0 + 34 + Math.floor(i / 7) * 12 + (Math.random() - 0.5) * 3;
      const t = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.9, 4), M(tentCols[i % 6])); t.position.set(x, H + 0.95, z); t.rotation.y = Math.PI / 4 + Math.random() * 0.4; t.scale.set(1, 1, 1.5); t.castShadow = true; group.add(t); }
    const camp = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.2), new THREE.MeshStandardMaterial({ map: tex('CAMPING · TRIBUNES', '#2f7a3a'), side: THREE.DoubleSide })); camp.position.set(T.x - 76, H + 2.6, z0 + 26); group.add(camp); box(0.12, 2.6, 0.12, steel, T.x - 79.5, H + 1.3, z0 + 26); box(0.12, 2.6, 0.12, steel, T.x - 72.5, H + 1.3, z0 + 26);
    V.lamp = lampM; V.win = winM;
  }

  // ---------------------------------------------------------------- track entry signs
  for (const r of T.entries || []) {
    const [x, z] = r.pts[0], g = new THREE.Group(); g.position.set(x - r.tz * 5.5, H, z + r.tx * 5.5); g.rotation.y = Math.atan2(r.tx, r.tz) + Math.PI; group.add(g);
    box(0.15, 3, 0.15, steel, 0, 1.5, 0, g);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.1), new THREE.MeshStandardMaterial({ map: tex('TRACK ENTRY ➜ PIT LANE', '#2f9f4a', '#fff', 512, 160), side: THREE.DoubleSide })); sg.position.y = 3.2; g.add(sg);
    // painted arrows on the entry road
    for (let k = 4; k < r.n - 2; k += 4) { const ar = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex('▲', '#3a3b3e', '#f2f2ee', 128, 256), transparent: true, polygonOffset: true, polygonOffsetFactor: -6 })); ar.position.set(r.pts[k][0], H + 0.07, r.pts[k][1]); ar.rotation.y = Math.atan2(r.tx[k], r.tz[k]) + Math.PI; group.add(ar); }
  }

  // ---------------------------------------------------------------- fill the rest of the infield
  fillInfield();
  function fillInfield() {
    const R = T.road, P = R.pts;
    const inLoop = (x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
    const trackD = (x, z) => { let b = 1e9; for (let i = 0; i < P.length; i += 2) { const d = (P[i][0] - x) ** 2 + (P[i][1] - z) ** 2; if (d < b) b = d; } return Math.sqrt(b); };
    // keep clear of what's already there: the village, museum, hotel, grandstand, bridge foot and campsite
    const L = (x, z) => [x - T.x, z - T.z];
    const busy = [[-70, -98, 10, -70], [-55, -46, 205, 6], [20, -60, 100, -38], [30, -60, 195, -36], [50, -104, 72, -40], [-82, 4, 2, 58], [80, 0, 125, 18]];
    const free = (x, z) => { const [lx, lz] = L(x, z); return !busy.some(([a, b, c, d]) => lx > a && lx < c && lz > b && lz < d); };
    const ok = (x, z, m) => inLoop(x, z) && trackD(x, z) > R.hw + m && free(x, z);
    const plotOK = (x, z, h) => { for (const [a, b] of [[0, 0], [-h, -h], [h, -h], [-h, h], [h, h], [0, h], [0, -h], [h, 0], [-h, 0]]) if (!ok(x + a, z + b, 15)) return false; return true; };
    const hash = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
    const S = 34, plots = [];
    for (let lx = -280; lx <= 290; lx += S) for (let lz = -100; lz <= 175; lz += S) { const x = T.x + lx, z = T.z + lz; if (plotOK(x, z, S / 2 - 2)) plots.push({ x, z, d: trackD(x, z), r: hash(lx, lz) }); }
    // instanced pieces
    // parked cars: placements are collected here, then drawn with the rounded traffic-car bodies (instanced per style)
    const carRec = [], carBody = { instanceMatrix: { count: 900 }, setMatrixAt(i, m) { carRec[i] = { m: m.clone(), c: 0xffffff }; }, setColorAt(i, c) { carRec[i].c = c.getHex(); } };
    const carTop = { instanceMatrix: { count: 0 }, setMatrixAt() {}, setColorAt() {} };
    const tent = new THREE.InstancedMesh(new THREE.ConeGeometry(1.7, 1.9, 4).rotateY(Math.PI / 4).scale(1, 1, 1.4).translate(0, 0.95, 0), M(0xffffff), 600);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.26, 2.6, 6).translate(0, 1.3, 0), M(0x5a4030), 1200);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.1, 1).translate(0, 3.8, 0), M(0xffffff, { flatShading: true }), 1200);
    const fans = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.9, 0.35).translate(0, 0.45, 0), M(0xffffff), 3000);
    const lawn = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), M(0x5d8a3a, { roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 }), 1400);
    const lot = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), M(0x55565a, { roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 }), 200);
    const counts = { car: 0, tent: 0, tree: 0, fan: 0, lawn: 0, lot: 0 };
    const MX = new THREE.Matrix4(), Q = new THREE.Quaternion(), Pv = new THREE.Vector3(), Sv = new THREE.Vector3(), C = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0);
    const put = (im, key, x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1, color) => { const i = counts[key]; if (i >= im.instanceMatrix.count) return; MX.compose(Pv.set(x, y, z), Q.setFromAxisAngle(UP, yaw), Sv.set(sx, sy, sz)); im.setMatrixAt(i, MX); if (color != null) im.setColorAt(i, C.set(color)); counts[key]++; };
    const CAR_C = [0xc8102e, 0xf2f2f2, 0x1d1d1f, 0x2b4c7e, 0x7d8a93, 0xe8b923, 0x2f5d3a, 0xb5121b, 0xa7abb0, 0x1d6fd1];
    const TENT_C = [0x2f7a3a, 0x1d6fd1, 0xe5641c, 0xc8102e, 0xe8b923, 0x6b2d5c, 0xf2f2f2];
    const half = S / 2 - 1;
    for (const p of plots) {
      const kind = p.d < R.hw + 40 ? 'stand' : p.r < 0.38 ? 'park' : p.r < 0.62 ? 'camp' : p.r < 0.85 ? 'trees' : 'marquee';
      if (kind === 'park') {
        put(lot, 'lot', p.x, H + 0.05, p.z, 0, S - 2, 1, S - 2);
        for (let row = -1; row <= 1; row += 2) for (let k = -6; k <= 6; k++) { if (hash(p.x + k, p.z + row) < 0.18) continue; const x = p.x + k * 2.5, z = p.z + row * 6; put(carBody, 'car', x, H, z, row > 0 ? 0 : Math.PI, 1, 1, 1, CAR_C[(hash(x, z) * CAR_C.length) | 0]); put(carTop, 'car2' in counts ? 'car2' : (counts.car2 = 0, 'car2'), x, H, z, row > 0 ? 0 : Math.PI); }
        addCollider(p.x - 8, p.z - 6, 7, H + 1.6); addCollider(p.x + 8, p.z - 6, 7, H + 1.6); addCollider(p.x - 8, p.z + 6, 7, H + 1.6); addCollider(p.x + 8, p.z + 6, 7, H + 1.6);
      } else if (kind === 'camp') {
        put(lawn, 'lawn', p.x, H + 0.05, p.z, 0, S - 2, 1, S - 2);
        for (let i = 0; i < 14; i++) { const x = p.x + (hash(p.x, i) - 0.5) * (S - 6), z = p.z + (hash(i, p.z) - 0.5) * (S - 6); put(tent, 'tent', x, H, z, hash(x, z) * 6, 1, 1, 1, TENT_C[i % TENT_C.length]); if (i % 4 === 0) put(carBody, 'car', x + 3, H, z + 1, hash(z, x) * 6, 1, 1, 1, CAR_C[i % CAR_C.length]); }
      } else if (kind === 'trees') {
        put(lawn, 'lawn', p.x, H + 0.05, p.z, 0, S - 2, 1, S - 2);
        for (let i = 0; i < 7; i++) { const x = p.x + (hash(p.x + i, p.z) - 0.5) * (S - 8), z = p.z + (hash(p.x, p.z + i) - 0.5) * (S - 8), sc = 0.8 + hash(x, z) * 0.6; put(trunk, 'tree', x, H, z, 0, sc, sc, sc); counts.tree--; put(crown, 'tree', x, H, z, hash(z, x) * 6, sc, sc, sc, [0x3d6a2a, 0x467a30, 0x2f5a22][i % 3]); addCollider(x, z, 0.5 * sc, H + 6); }
        // picnic tables
        for (let i = 0; i < 3; i++) box(2, 0.08, 0.8, M(0x7a5a3a), p.x - 6 + i * 6, H + 0.75, p.z + 9);
      } else if (kind === 'marquee') {
        const g = new THREE.Group(); g.position.set(p.x, H, p.z); g.rotation.y = hash(p.x, p.z) > 0.5 ? Math.PI / 2 : 0; group.add(g);
        box(22, 3.4, 12, white, 0, 1.7, 0, g);
        const roofG = new THREE.CylinderGeometry(0.1, 7.6, 2.6, 4, 1).rotateY(Math.PI / 4); const rf = new THREE.Mesh(roofG, white); rf.scale.set(1.55, 1, 0.85); rf.position.y = 4.7; rf.castShadow = true; g.add(rf);
        const nm = ['HOSPITALITY', 'MERCHANDISE', 'FAN ZONE', 'TEAM VILLAGE', 'PADDOCK CLUB', 'DRIVER SIGNING'][(p.r * 60 | 0) % 6];
        for (const sd of [-1, 1]) { const sgn = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.1), new THREE.MeshStandardMaterial({ map: tex(nm, '#c8102e') })); sgn.position.set(0, 2.7, sd * 6.03); if (sd < 0) sgn.rotation.y = Math.PI; g.add(sgn); }
        addCollider(p.x - 6, p.z, 7, H + 6); addCollider(p.x + 6, p.z, 7, H + 6);
        for (const [fx2, fz2] of [[-14, 8], [14, -8]]) { box(0.12, 6, 0.12, steel, p.x + fx2, H + 3, p.z + fz2); const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), M(CAR_C[(p.r * 10 | 0) % CAR_C.length], { side: THREE.DoubleSide })); fl.position.set(p.x + fx2 + 0.7, H + 5.4, p.z + fz2); group.add(fl); }
      } else {
        // a small stand facing the nearest bit of track, full of fans
        let bi = 0, bd = 1e9; for (let i = 0; i < P.length; i++) { const d = (P[i][0] - p.x) ** 2 + (P[i][1] - p.z) ** 2; if (d < bd) { bd = d; bi = i; } }
        const yaw = Math.atan2(P[bi][0] - p.x, P[bi][1] - p.z);
        const g = new THREE.Group(); g.position.set(p.x, H, p.z); g.rotation.y = yaw; group.add(g);   // local +z faces the track
        for (let k = 0; k < 5; k++) box(24, 0.6 * (k + 1), 1.5, conc, 0, 0.3 * (k + 1), -k * 1.5, g);
        box(25, 0.3, 9, M(0xf2f2f2, { metalness: 0.3 }), 0, 6.2, -3, g); for (const sx of [-12, 12]) box(0.3, 6, 0.3, steel, sx, 3, -6.5, g);
        g.updateMatrixWorld(true);
        for (let k = 0; k < 5; k++) for (let i = 0; i < 22; i++) { if (hash(i + p.x, k + p.z) < 0.25) continue; Pv.set(-11 + i * 1.05, 0.6 * (k + 1), -k * 1.5 - 0.3).applyMatrix4(g.matrixWorld); put(fans, 'fan', Pv.x, Pv.y, Pv.z, yaw, 1, 1, 1, new THREE.Color().setHSL(hash(i, k + p.x), 0.6, 0.5).getHex()); }
        Pv.set(0, 0, -3).applyMatrix4(g.matrixWorld); addCollider(Pv.x, Pv.z, 7, H + 6.4); Pv.set(-8, 0, -3).applyMatrix4(g.matrixWorld); addCollider(Pv.x, Pv.z, 5, H + 6.4); Pv.set(8, 0, -3).applyMatrix4(g.matrixWorld); addCollider(Pv.x, Pv.z, 5, H + 6.4);
      }
    }
    // everything left over becomes parkland: grass, trees and the odd bench, right up to the run-off
    const G2 = 12;
    for (let lx = -285; lx <= 295; lx += G2) for (let lz = -100; lz <= 180; lz += G2) {
      const x = T.x + lx, z = T.z + lz;
      if (!inLoop(x, z) || trackD(x, z) < R.hw + 11 || !free(x, z) || plots.some((q) => Math.abs(q.x - x) < S / 2 + 2 && Math.abs(q.z - z) < S / 2 + 2)) continue;
      put(lawn, 'lawn', x, H + 0.045, z, 0, G2 + 0.4, 1, G2 + 0.4);
      const r = hash(lx * 1.7, lz * 2.3);
      if (r < 0.45 && trackD(x, z) > R.hw + 15) { const tx = x + (hash(lx, lz) - 0.5) * 6, tz = z + (hash(lz, lx) - 0.5) * 6, sc = 0.7 + r; put(trunk, 'tree', tx, H, tz, 0, sc, sc, sc); counts.tree--; put(crown, 'tree', tx, H, tz, r * 9, sc, sc, sc, [0x3d6a2a, 0x467a30, 0x2f5a22, 0x55703a][(r * 40 | 0) % 4]); addCollider(tx, tz, 0.5 * sc, H + 6); }
      else if (r > 0.92) box(1.8, 0.45, 0.5, M(0x7a5a3a), x, H + 0.45, z);
    }
    {
      const STY = [0, 1, 3, 6, 6, 1], byKind = new Map();
      carRec.forEach((r, i) => { if (!r) return; const k = STY[(hash(i * 1.3, r.m.elements[12]) * STY.length) | 0]; if (!byKind.has(k)) byKind.set(k, []); byKind.get(k).push(r); });
      const paintM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.12 });
      const lampM = { head: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.2 }), tail: new THREE.MeshStandardMaterial({ color: 0x8a1010, roughness: 0.3 }) };
      for (const [k, list] of byKind) {
        const { merged } = trafficParts(k, false, true);
        for (const [part, geo] of Object.entries(merged)) {
          const im = new THREE.InstancedMesh(geo, part === 'paint' ? paintM : lampM[part] || TRAFFIC_MATS[part], list.length);
          list.forEach((r, i) => { im.setMatrixAt(i, r.m); if (part === 'paint') im.setColorAt(i, C.set(r.c)); });
          im.castShadow = false; im.receiveShadow = true; group.add(im); farHide.push(im);   // hundreds of cars: no shadow pass
        }
      }
    }
    for (const [im, key] of [[tent, 'tent'], [trunk, 'tree'], [crown, 'tree'], [fans, 'fan'], [lawn, 'lawn'], [lot, 'lot']]) { im.count = counts[key]; im.castShadow = im !== lawn && im !== lot; im.receiveShadow = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; group.add(im); if (im === fans || im === tent) farHide.push(im); }
    T.infield = { plots: plots.length };
  }

  let t = 0;
  return {
    get village() { return V; },
    update(dt, { pos, night, cam }) {
      t += dt;
      if (cam) { const far = Math.hypot(cam.x - TRACK.x, cam.z - TRACK.z) > 1000; for (const im of farHide) im.visible = !far; }
      if (barrier && E) { const d = Math.hypot(pos.x - E.g.position.x, pos.z - E.g.position.z); barrier.rotation.z += ((d < 35 ? 1.35 : 0) - barrier.rotation.z) * Math.min(1, dt * 2); }
      if (V && V.lamp) { V.lamp.emissiveIntensity = night ? 6 : 0; V.win.emissiveIntensity = night ? 1 : 0; }
    },
  };
}
