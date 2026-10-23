// Gull Island: a holiday island across the causeway from the Coast road. Gull Bay on the east beach is the resort:
// a promenade with a surf shop, a gelato kiosk, a café, souvenirs, a dive centre, a beach market and the Hotel Gull
// Bay; on the sand, rows of parasols and loungers, a beach bar, a lifeguard tower, a beach volleyball court and a
// jetty where you can hire a jet ski. Offshore, a banana boat and a parasail circle the bay, and the red-and-white
// lighthouse stands on the rocky headland to the south (its beam sweeps the sea at night).
// Activities (press F at the prompt): hire a jet ski at the jetty ($20), join a game of beach volleyball.
import * as THREE from 'three';
import { RBox } from './shapes.js';
import { ISLAND, GULLBAY, terrainHeight, groundHeight, WATER_LEVEL, waveHeight } from './world.js';
import { addCollider } from './scenery.js';

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const signTex = (text, bg, fg = '#fff') => canvasTex(512, 96, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = `700 ${text.length > 14 ? 50 : 60}px "Barlow Condensed", Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h * 0.54); });
const stripeTex = (a, b) => canvasTex(128, 16, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 16, 0, 16, 16); } });

export function createIsland({ scene }) {
  const group = new THREE.Group(); scene.add(group);
  const I = ISLAND, M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
  // lighthouse: highest point near the south cliffs
  let L = null; for (let z = I.z + 80; z <= I.z + 220; z += 6) for (let x = I.x - 60; x <= I.x + 60; x += 10) { const h = terrainHeight(x, z), ok = h > 15 && terrainHeight(x + 6, z) > 15 && terrainHeight(x - 6, z) > 15 && terrainHeight(x, z - 6) > 15; if (ok && (!L || z > L.z)) L = { x, z, h }; }
  if (!L) L = { x: I.x, z: I.z + 100, h: terrainHeight(I.x, I.z + 100) };
  const lh = new THREE.Group(); lh.position.set(L.x, L.h - 0.3, L.z); group.add(lh);
  const stripes = (() => { const c = document.createElement('canvas'); c.width = 16; c.height = 128; const g = c.getContext('2d'); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f4f4f0' : '#c8102e'; g.fillRect(0, i * 16, 16, 16); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 22, 24), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.6 })); tower.position.y = 11; tower.castShadow = true; lh.add(tower);
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.3, 24), M(0x222222)); gallery.position.y = 22.2; lh.add(gallery);
  const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.2, 16), new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe08a, emissiveIntensity: 0.3, transparent: true, opacity: 0.85 })); lampRoom.position.y = 23.5; lh.add(lampRoom);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.6, 16), M(0xc8102e)); cap.position.y = 25.4; lh.add(cap);
  const keeper = new THREE.Mesh(new RBox(6, 3.2, 5), M(0xf4f4f0)); keeper.position.set(5.5, 1.6, -2); keeper.castShadow = true; lh.add(keeper);
  const kroof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 1.8, 4), M(0x8a2a1a)); kroof.position.set(5.5, 4.1, -2); kroof.rotation.y = Math.PI / 4; lh.add(kroof);
  addCollider(L.x, L.z, 2.8, L.h + 26); addCollider(L.x + 5.5, L.z - 2, 3.5, L.h + 5);
  // the sweeping beam: two long additive cones from the lamp
  const beamM = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Group(); beam.position.y = 23.5; lh.add(beam);
  for (const s of [1, -1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(14, 260, 20, 1, true).translate(0, -130, 0).rotateZ(s * Math.PI / 2), beamM); beam.add(c); }
  const GB = GULLBAY;
  const night = { mats: [] };   // window and lamp materials that glow after dark
  const glowM = (c) => { const m = new THREE.MeshStandardMaterial({ color: 0x223040, emissive: c, emissiveIntensity: 0, roughness: 0.15, metalness: 0.3 }); night.mats.push(m); return m; };
  const win = glowM(0xffd9a0);
  const box = (w, h, d, m, x, y, z, parent) => { const o = new THREE.Mesh(new RBox(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };

  // ---------------------------------------------------------------- the shops along the promenade
  const COL = { surf: 0x2c8ad6, gelato: 0xf3a6c0, cafe: 0xf2efe6, shop: 0xf2c94c, dive: 0xe5641c, market: 0x8fd1c4, hotel: 0xf6f4ee };
  const AWN = { surf: ['#ffffff', '#2c8ad6'], gelato: ['#ffffff', '#e0507a'], cafe: ['#ffffff', '#1f9fb4'], shop: ['#ffffff', '#e2a31a'], dive: ['#ffffff', '#c8102e'], market: ['#ffffff', '#2f9f4a'], hotel: ['#ffffff', '#1f4fb4'] };
  const SIGN = { surf: '#1d5f9e', gelato: '#c83e6a', cafe: '#1f8a9a', shop: '#b5121b', dive: '#c8102e', market: '#2f7f4a', hotel: '#1f4fb4' };
  for (const s of GB.shops) {
    const g = new THREE.Group(); g.position.set(s.x, s.h + 0.05, s.z); g.rotation.y = s.face; group.add(g);
    const hotel = s.type === 'hotel', floors = hotel ? 3 : 1, H = floors * 3.3;
    const wall = new THREE.MeshStandardMaterial({ color: COL[s.type], roughness: 0.85 });
    box(s.w, H, s.d, wall, 0, H / 2, 0, g);
    box(s.w + 0.3, 0.4, s.d + 0.3, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), 0, H + 0.2, 0, g);   // parapet
    // shop front: glazing and a door on the promenade side (+z)
    for (let f = 0; f < floors; f++) {
      const y = f * 3.3;
      if (f === 0) { box(s.w * 0.7, 2.2, 0.08, win, 0, 1.3, s.d / 2 + 0.03, g); }
      else for (let k = -2; k <= 2; k++) { box(2.2, 1.6, 0.08, win, k * 4.2, y + 1.7, s.d / 2 + 0.03, g); box(3, 0.12, 1.2, new THREE.MeshStandardMaterial({ color: 0x1f4fb4 }), k * 4.2, y + 0.6, s.d / 2 + 0.6, g); }
    }
    // striped awning and the sign
    const aw = new THREE.Mesh(new RBox(s.w * 0.9, 0.08, 2), new THREE.MeshStandardMaterial({ map: stripeTex(...AWN[s.type]), roughness: 0.8 }));
    aw.position.set(0, 3.0, s.d / 2 + 1); aw.rotation.x = 0.28; g.add(aw);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(s.w * 0.85, hotel ? 12 : 8), hotel ? 1.6 : 1.1), new THREE.MeshStandardMaterial({ map: signTex(s.name, SIGN[s.type]), emissive: 0xffffff, emissiveIntensity: 0 }));
    night.mats.push(sg.material); sg.material.userData.dim = 0.35;
    sg.position.set(0, hotel ? H + 1.2 : 3.75, hotel ? 0 : s.d / 2 + 0.05); if (hotel) { const p2 = sg.clone(); p2.rotation.y = Math.PI; p2.position.z = -0.01; g.add(p2); sg.position.z = 0.01; }
    g.add(sg);
    // a few things outside, by trade
    if (s.type === 'surf') for (let k = 0; k < 5; k++) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.7, 4, 10), new THREE.MeshStandardMaterial({ color: [0xffc400, 0xe5641c, 0x2fbf5a, 0xffffff, 0xc8102e][k], roughness: 0.4 })); b.scale.set(1, 1, 0.18); b.position.set(-s.w / 2 + 1 + k * 0.7, 1.15, s.d / 2 + 0.35); b.rotation.x = -0.18; g.add(b); }
    if (s.type === 'gelato') { const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2, 14).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: 0xd8a35a })); cone.position.set(0, H + 1.4, 0); g.add(cone); const sc = new THREE.Mesh(new THREE.SphereGeometry(0.8, 14, 10), new THREE.MeshStandardMaterial({ color: 0xf7b6c8 })); sc.position.set(0, H + 2.6, 0); g.add(sc); }
    if (s.type === 'cafe') for (let k = -1; k <= 1; k++) { const tx = k * 3.6, tz = s.d / 2 + 2.2; box(0.9, 0.05, 0.9, new THREE.MeshStandardMaterial({ color: 0xffffff }), tx, 0.75, tz, g); box(0.06, 0.75, 0.06, new THREE.MeshStandardMaterial({ color: 0x555555 }), tx, 0.37, tz, g); const um = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.45, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0x1f9fb4, side: THREE.DoubleSide })); um.position.set(tx, 2.3, tz); g.add(um); box(0.04, 2.1, 0.04, new THREE.MeshStandardMaterial({ color: 0xdddddd }), tx, 1.05, tz, g); }
    if (s.type === 'dive') { const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshStandardMaterial({ map: canvasTex(64, 48, (c, w, h) => { c.fillStyle = '#d01818'; c.fillRect(0, 0, w, h); c.strokeStyle = '#fff'; c.lineWidth = 9; c.beginPath(); c.moveTo(0, 0); c.lineTo(w, h); c.stroke(); }), side: THREE.DoubleSide })); fl.position.set(s.w / 2 - 0.4, H + 2.2, 0); g.add(fl); box(0.06, 2.4, 0.06, new THREE.MeshStandardMaterial({ color: 0xcccccc }), s.w / 2 - 1.05, H + 1.2, 0, g); }
    if (s.type === 'market') for (let k = 0; k < 4; k++) box(1.0, 0.45, 0.7, new THREE.MeshStandardMaterial({ color: [0xe5641c, 0xffc400, 0x2fbf5a, 0xc8102e][k] }), -s.w / 2 + 1.5 + k * 1.3, 0.6, s.d / 2 + 0.8, g);
    if (hotel) { const pool = new THREE.Mesh(new THREE.PlaneGeometry(8, 4).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3fc6e0, roughness: 0.05, metalness: 0.1 })); pool.position.set(0, 0.07, -s.d / 2 - 3.5); g.add(pool); }
    // walls as colliders: circles along the back line
    const n = Math.max(2, Math.round(s.w / (s.d * 0.8)));
    for (let k = 0; k < n; k++) { const lx = -s.w / 2 + s.d / 2 + (s.w - s.d) * (n > 1 ? k / (n - 1) : 0.5); addCollider(s.x + Math.cos(s.face) * lx, s.z - Math.sin(s.face) * lx, s.d / 2, s.h + H); }
  }

  // ---------------------------------------------------------------- the beach: parasols, loungers, towels, people
  const rnd = (() => { let a = 7; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })();
  const C = new THREE.Color(), MX = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(1, 1, 1), EU = new THREE.Euler();
  const near = (p, x, z, r) => Math.hypot(p.x - x, p.z - z) < r;
  const J = GB.jetty, CT = GB.court;
  const spots = GB.beach.filter((p) => !(CT && near(p, CT.x, CT.z, 14)) && !(J && near(p, J.x0, J.z0, 10)));
  const umbrella = spots.filter((p) => p.o < 30 && rnd() < 0.6);
  const N = umbrella.length;
  const umM = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 0.55, 12, 1, true).translate(0, 2.45, 0), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7 }), N);
  const poleM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6).translate(0, 1.2, 0), new THREE.MeshStandardMaterial({ color: 0xeeeeee }), N);
  const loungeM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.14, 1.9).translate(0.95, 0.3, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), N);
  const towelM = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 1.8).rotateX(-Math.PI / 2).translate(-1.1, 0.03, 0.3), new THREE.MeshStandardMaterial({ roughness: 0.9 }), N);
  const UC = [0xc8102e, 0xffb000, 0x1d6fd1, 0x2fbf5a, 0xf2f2f2, 0xe0507a];
  umbrella.forEach((p, i) => {
    const y = terrainHeight(p.x, p.z), yaw = Math.atan2(p.nx, p.nz) + (rnd() - 0.5) * 0.4;
    MX.compose(V.set(p.x, y, p.z), Q.setFromEuler(EU.set(0, yaw, 0)), SC);
    for (const m of [umM, poleM, loungeM, towelM]) m.setMatrixAt(i, MX);
    umM.setColorAt(i, C.set(UC[i % UC.length])); towelM.setColorAt(i, C.setHSL(rnd(), 0.7, 0.55));
  });
  for (const m of [umM, poleM, loungeM, towelM]) { m.castShadow = true; group.add(m); }
  // sunbathers on the loungers and towels, people strolling the water's edge, swimmers' heads in the shallows
  const NP = Math.min(160, N * 2 + 30);
  const people = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.22, 1.1, 3, 6), new THREE.MeshStandardMaterial({ roughness: 0.8 }), NP);
  const walkers = [], swimmers = [];
  let pi = 0;
  for (const p of umbrella) {
    if (pi >= NP - 30) break;
    const y = terrainHeight(p.x, p.z), yaw = Math.atan2(p.nx, p.nz);
    for (const [lx, ly] of [[0.95, 0.55], [-1.1, 0.25]]) { if (rnd() < 0.3) continue; const cx = Math.cos(yaw), sx = Math.sin(yaw);
      MX.compose(V.set(p.x + cx * lx, y + ly, p.z - sx * lx), Q.setFromEuler(EU.set(Math.PI / 2, yaw, 0, 'YXZ')), SC); people.setMatrixAt(pi, MX); people.setColorAt(pi, C.setHSL(0.05 + rnd() * 0.06, 0.45, 0.45 + rnd() * 0.25)); pi++; }
  }
  const edge = GB.beach.filter((p) => GB.beach.every((q) => q.q !== p.q || q.o <= p.o));   // the outermost point of each row
  for (let k = 0; k < 14 && pi < NP; k++) { const e = edge[Math.floor(rnd() * edge.length)]; if (!e) break; walkers.push({ i: pi++, e, t: rnd() * 100, sp: 0.6 + rnd() * 0.5, c: C.setHSL(rnd(), 0.6, 0.5).getHex() }); }
  for (let k = 0; k < 16 && pi < NP; k++) { const e = edge[Math.floor(rnd() * edge.length)]; if (!e) break; swimmers.push({ i: pi++, x: e.x + e.nx * (6 + rnd() * 14), z: e.z + e.nz * (6 + rnd() * 14), ph: rnd() * 6 }); }
  for (const w of walkers) people.setColorAt(w.i, C.set(w.c));
  for (const s of swimmers) people.setColorAt(s.i, C.setHSL(0.07, 0.4, 0.55));
  people.count = pi; people.castShadow = true; group.add(people);
  // a line of swimming-area buoys beyond the swimmers
  { const bs = edge.map((e) => [e.x + e.nx * 26, e.z + e.nz * 26]); const bm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.4 }), bs.length);
    bs.forEach(([x, z], i) => { MX.makeTranslation(x, WATER_LEVEL + 0.05, z); bm.setMatrixAt(i, MX); bm.setColorAt(i, C.set(i % 2 ? 0xffffff : 0xe0201a)); }); group.add(bm); }

  // beach bar, lifeguard tower
  const pick = (q, o) => GB.beach.reduce((b, p) => (!b || Math.abs(p.q - q) + Math.abs(p.o - o) * 0.5 < Math.abs(b.q - q) + Math.abs(b.o - o) * 0.5 ? p : b), null);
  const barP = pick(28, 10) || { x: ISLAND.x + 230, z: ISLAND.z, nx: 1, nz: 0 };
  const bar = new THREE.Group(); bar.position.set(barP.x, groundHeight(barP.x, barP.z), barP.z); bar.rotation.y = Math.atan2(-(barP.nx || 1), -(barP.nz || 0)) + Math.PI; group.add(bar);
  { const wood = new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.9 });
    box(5, 1.1, 2.6, wood, 0, 0.55, 0, bar); box(5.4, 0.08, 3, new THREE.MeshStandardMaterial({ color: 0x8a6a40 }), 0, 1.15, 0, bar);
    for (const [x, z] of [[-2.4, -1.2], [2.4, -1.2], [-2.4, 1.2], [2.4, 1.2]]) box(0.14, 2.8, 0.14, wood, x, 1.4, z, bar);
    const th = new THREE.Mesh(new THREE.ConeGeometry(4.4, 1.6, 4), new THREE.MeshStandardMaterial({ color: 0xd8b878, roughness: 1 })); th.position.y = 3.5; th.rotation.y = Math.PI / 4; th.scale.set(1, 1, 0.75); bar.add(th);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.8), new THREE.MeshStandardMaterial({ map: signTex('GULL BAY BEACH BAR', '#1f9fb4'), side: THREE.DoubleSide })); sg.position.set(0, 2.55, 1.5); bar.add(sg);
    for (let k = 0; k < 4; k++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.8, 10), new THREE.MeshStandardMaterial({ color: 0x222222 })); st.position.set(-1.8 + k * 1.2, 0.4, 1.8); bar.add(st); }
    addCollider(bar.position.x, bar.position.z, 3, bar.position.y + 4); }
  const lgP = pick(80, 14);
  if (lgP) { const lg = new THREE.Group(); lg.position.set(lgP.x, terrainHeight(lgP.x, lgP.z), lgP.z); lg.rotation.y = Math.atan2(lgP.nx, lgP.nz); group.add(lg);
    const w = new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }), red = new THREE.MeshStandardMaterial({ color: 0xd01818 });
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.15, 3, 0.15, w, x, 1.5, z, lg);
    box(2.4, 1.6, 2.4, red, 0, 3.8, 0, lg); box(2.8, 0.15, 2.8, w, 0, 4.7, 0, lg); box(2.6, 0.1, 2.6, w, 0, 3.0, 0, lg);
    const ladder = box(0.6, 3.2, 0.1, w, 0, 1.5, -1.6, lg); ladder.rotation.x = 0.35;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ map: canvasTex(64, 40, (c, ww, hh) => { c.fillStyle = '#e8c21a'; c.fillRect(0, 0, ww, hh / 2); c.fillStyle = '#d01818'; c.fillRect(0, hh / 2, ww, hh / 2); }), side: THREE.DoubleSide })); fl.position.set(0.45, 6, 0); lg.add(fl); box(0.05, 1.6, 0.05, w, 0, 5.4, 0, lg);
    addCollider(lg.position.x, lg.position.z, 1.6, lg.position.y + 5); }

  // ---------------------------------------------------------------- beach volleyball
  let ball = null, players = [], game = null;
  if (CT) {
    const ct = new THREE.Group(); ct.position.set(CT.x, terrainHeight(CT.x, CT.z) + 0.02, CT.z); ct.rotation.y = CT.yaw; group.add(ct);
    const lines = new THREE.Mesh(new THREE.PlaneGeometry(8, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: canvasTex(64, 128, (c, w, h) => { c.strokeStyle = '#1d6fd1'; c.lineWidth = 3; c.strokeRect(2, 2, w - 4, h - 4); }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); ct.add(lines);
    for (const s of [-1, 1]) box(0.1, 2.6, 0.1, new THREE.MeshStandardMaterial({ color: 0xdddddd }), s * 4.6, 1.3, 0, ct);
    const net = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 1), new THREE.MeshStandardMaterial({ map: canvasTex(128, 16, (c, w, h) => { c.strokeStyle = '#222'; for (let x = 0; x < w; x += 4) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y < h; y += 4) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } c.fillStyle = '#fff'; c.fillRect(0, 0, w, 2); }), transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 }));
    net.position.y = 2.0; ct.add(net);
    const pm = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
    for (const [x, z, c] of [[-2, -4, 0xc8102e], [2, -5, 0xc8102e], [-2, 5, 0x1d6fd1], [2, 4, 0x1d6fd1]]) { const p = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.2, 4, 8), pm(c)); p.position.set(x, 0.85, z); p.castShadow = true; ct.add(p); players.push({ m: p, x, z, ph: Math.random() * 6 }); }
    ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), pm(0xffe14a)); ct.add(ball);
  }

  // ---------------------------------------------------------------- the jetty: jet ski hire, pedalos
  const floaters = [];
  if (J) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9 });
    const deck = new THREE.Mesh(new RBox(3.2, 0.25, J.L), wood); deck.position.set(J.x0 + J.ux * J.L / 2, J.top - 0.12, J.z0 + J.uz * J.L / 2); deck.rotation.y = Math.atan2(J.ux, J.uz); deck.castShadow = deck.receiveShadow = true; group.add(deck);
    for (let k = 4; k <= J.L; k += 4) for (const sd of [-1, 1]) { const x = J.x0 + J.ux * k - J.uz * sd * 1.5, z = J.z0 + J.uz * k + J.ux * sd * 1.5, gb = terrainHeight(x, z); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, J.top - gb + 0.6, 6), wood); post.position.set(x, (J.top + gb + 0.6) / 2, z); group.add(post); }
    // the hire hut at the shore end
    const hut = new THREE.Group(); hut.position.set(J.x0 - J.uz * 4.5 + J.ux * 2, groundHeight(J.x0 - J.uz * 4.5 + J.ux * 2, J.z0 + J.ux * 4.5 + J.uz * 2), J.z0 + J.ux * 4.5 + J.uz * 2); hut.rotation.y = Math.atan2(J.ux, J.uz); group.add(hut);
    box(3, 2.5, 3, new THREE.MeshStandardMaterial({ color: 0xffc400, roughness: 0.7 }), 0, 1.25, 0, hut); box(3.6, 0.2, 3.6, new THREE.MeshStandardMaterial({ color: 0x1d6fd1 }), 0, 2.6, 0, hut);
    const hs = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.7), new THREE.MeshStandardMaterial({ map: signTex('JET SKI HIRE · $20', '#1d6fd1'), side: THREE.DoubleSide })); hs.position.set(0, 3.1, 0); hs.rotation.y = Math.PI / 2; hut.add(hs);
    addCollider(hut.position.x, hut.position.z, 2.2, hut.position.y + 3);
    // jet skis and pedalos tied up alongside
    const jsM = new THREE.MeshStandardMaterial({ color: 0xffc400, roughness: 0.35 }), wM = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 });
    for (let k = 0; k < 6; k++) {
      const sd = k % 2 ? 1 : -1, along = 14 + Math.floor(k / 2) * 8, x = J.x0 + J.ux * along - J.uz * sd * 3.2, z = J.z0 + J.uz * along + J.ux * sd * 3.2;
      const g = new THREE.Group(); g.position.set(x, WATER_LEVEL, z); g.rotation.y = Math.atan2(J.ux, J.uz) + (k < 4 ? 0 : Math.PI / 2); group.add(g);
      if (k < 4) { box(0.9, 0.4, 2.6, wM, 0, 0.15, 0, g); box(0.8, 0.25, 1.4, jsM, 0, 0.45, 0.3, g); }
      else { box(1.6, 0.35, 2.4, new THREE.MeshStandardMaterial({ color: 0x2c8ad6 }), 0, 0.15, 0, g); box(1.3, 0.3, 0.6, wM, 0, 0.5, -0.3, g); const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.5, 8), wM); sl.position.set(0, 0.45, 1.0); g.add(sl); }
      floaters.push({ g, ph: k * 1.3 });
    }
  }

  // ---------------------------------------------------------------- offshore: a banana boat and a parasail
  const bayC = J ? { x: J.end.x + J.ux * 110, z: J.end.z + J.uz * 110 } : { x: ISLAND.x + 400, z: ISLAND.z };
  const boat = () => { const g = new THREE.Group(); box(1.9, 0.7, 5.2, new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 }), 0, 0.2, 0, g); box(1.95, 0.25, 5.25, new THREE.MeshStandardMaterial({ color: 0xc8102e }), 0, -0.05, 0, g); box(1.2, 0.8, 1.2, new THREE.MeshStandardMaterial({ color: 0x223040 }), 0, 0.9, 0.3, g); group.add(g); return g; };
  const b1 = boat(), b2 = boat();
  const banana = new THREE.Group(); group.add(banana);
  { const tube = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 4.5, 6, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: 0.5 })); tube.position.y = 0.3; banana.add(tube);
    for (let k = 0; k < 4; k++) { const r = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.6, 3, 6), new THREE.MeshStandardMaterial({ color: [0xe5641c, 0x1d6fd1, 0x2fbf5a, 0xc8102e][k] })); r.position.set(0, 0.95, -1.6 + k * 1.05); banana.add(r); } }
  const chute = new THREE.Mesh(new THREE.SphereGeometry(4, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), new THREE.MeshStandardMaterial({ map: canvasTex(128, 16, (c) => { const cs = ['#c8102e', '#ffc400', '#1d6fd1', '#ffffff']; for (let i = 0; i < 8; i++) { c.fillStyle = cs[i % 4]; c.fillRect(i * 16, 0, 16, 16); } }), side: THREE.DoubleSide, roughness: 0.8 }));
  chute.scale.set(1, 0.6, 1); group.add(chute);
  const flyer = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 3, 6), new THREE.MeshStandardMaterial({ color: 0xe5641c })); group.add(flyer);
  const rope = (a) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x222222 })); group.add(l); return l; };
  const r1 = rope(), r2 = rope();
  const setRope = (l, a, b) => { const p = l.geometry.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true; l.geometry.computeBoundingSphere(); };

  // ---------------------------------------------------------------- promenade lamps (lit at night)
  const lampHeads = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffd9a0, emissiveIntensity: 0 }); night.mats.push(lampHeads); lampHeads.userData.dim = 2.5;
  { const pts = GB.shops.map((s) => [s.x - Math.sin(s.face) * -0 + Math.sin(s.face) * (s.d / 2 + 4.6), s.z + Math.cos(s.face) * (s.d / 2 + 4.6), s.h]);
    const lp = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.08, 4, 6).translate(0, 2, 0), new THREE.MeshStandardMaterial({ color: 0x2a2d31 }), pts.length), lh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 10, 8).translate(0, 4.1, 0), lampHeads, pts.length);
    pts.forEach(([x, z, h], i) => { MX.makeTranslation(x, h, z); lp.setMatrixAt(i, MX); lh.setMatrixAt(i, MX); }); group.add(lp, lh); }

  // ---------------------------------------------------------------- activities
  let t = 0, visited = false, prompt = '', vb = null;
  const S0 = J ? { x: J.x0 - J.uz * 4.5, z: J.z0 + J.ux * 4.5 } : null;
  return {
    lighthouse: { x: L.x, z: L.z, y: L.h + 23 }, beach: { x: bar.position.x, z: bar.position.z },
    village: GB.shops.length ? { x: GB.shops[2].x, z: GB.shops[2].z } : null,
    jetty: S0, court: CT ? { x: CT.x, z: CT.z } : null,
    get prompt() { return prompt; },
    // F at a prompt: hire a jet ski, join the volleyball; returns true when it used the key press
    activity(dt, { veh, mode, fPress, rides, econ, toast, stats }) {
      prompt = '';
      if (vb) { vb.t -= dt; prompt = 'Beach volleyball · rally on!'; if (vb.t <= 0) { const won = Math.random() < 0.6, a = 21, b = 12 + Math.floor(Math.random() * 8); toast(won ? `Beach volleyball: you won ${a}–${b}!` : `Beach volleyball: lost ${b}–${a}, good game`); if (won && econ) econ.earn(50, 'Beach volleyball win'); stats && stats.event('volleyball'); vb = null; } return false; }
      if (mode !== 'car' || rides.active || Math.hypot(veh.vel.x, veh.vel.z) > 3) return false;
      if (S0 && Math.hypot(veh.pos.x - S0.x, veh.pos.z - S0.z) < 14) {
        prompt = 'F · hire a jet ski ($20) · press 1 to come back to the MX-5';
        if (fPress) { if (econ && !econ.spend(20)) { toast('Jet ski hire is $20'); return true; } rides.start('ski', J.end, Math.atan2(J.ux, J.uz)); return true; }
      } else if (CT && Math.hypot(veh.pos.x - CT.x, veh.pos.z - CT.z) < 24) {
        prompt = 'F · join the beach volleyball game (win $50)';
        if (fPress) { vb = { t: 9 }; toast('You join the game…'); return true; }
      }
      return false;
    },
    update(dt, { pos, night: nt, onVisit }) {
      t += dt; beam.rotation.y = t * 0.6; beamM.opacity = nt * 0.16; lampRoom.material.emissiveIntensity = 0.3 + nt * 2.5;
      if (!visited && Math.hypot(pos.x - L.x, pos.z - L.z) < 40) { visited = true; onVisit && onVisit(); }
      for (const m of night.mats) m.emissiveIntensity = nt * (m.userData.dim ?? 1.6);
      if (Math.hypot(pos.x - ISLAND.x, pos.z - ISLAND.z) > 900) return;   // animate only when you're near
      // volleyball: the ball arcs over the net, the players bob and jump to it (faster while you play)
      if (ball) { const sp = vb ? 1.5 : 1, ph = (t * 0.45 * sp) % 2, k = ph % 1, dir = ph < 1 ? 1 : -1;
        ball.position.set(Math.sin(t * 0.7) * 2, 1.9 + Math.sin(k * Math.PI) * 5, dir * (-4.5 + 9 * k));
        for (const p of players) { const jump = Math.max(0, Math.sin(t * 3 * sp + p.ph)) * 0.25; p.m.position.y = 0.85 + jump; p.m.position.x = p.x + Math.sin(t * 0.7 + p.ph) * 0.8; } }
      // walkers along the water's edge, swimmers bobbing
      for (const w of walkers) { const e = w.e, s = Math.sin(t * 0.05 * w.sp + w.t) * 40, tx = e.nz, tz = -e.nx; V.set(e.x + tx * s, terrainHeight(e.x + tx * s, e.z + tz * s) + 0.8, e.z + tz * s); MX.compose(V, Q.identity(), SC); people.setMatrixAt(w.i, MX); }
      for (const s of swimmers) { MX.compose(V.set(s.x + Math.sin(t * 0.3 + s.ph) * 1.5, WATER_LEVEL - 0.55 + Math.sin(t * 1.4 + s.ph) * 0.08, s.z), Q.identity(), SC); people.setMatrixAt(s.i, MX); }
      people.instanceMatrix.needsUpdate = true;
      for (const f of floaters) { f.g.position.y = WATER_LEVEL + Math.sin(t * 1.3 + f.ph) * 0.08; f.g.rotation.z = Math.sin(t * 0.9 + f.ph) * 0.04; }
      // the banana boat runs a wide loop, the parasail boat a bigger one the other way
      const a1 = t * 0.12, a2 = -t * 0.08 + 2;
      const p1 = (a, R) => ({ x: bayC.x + Math.cos(a) * R, z: bayC.z + Math.sin(a) * R * 0.7 });
      { const p = p1(a1, 70), q = p1(a1 - 0.02, 70); b1.position.set(p.x, WATER_LEVEL + 0.1, p.z); b1.rotation.y = Math.atan2(p.x - q.x, p.z - q.z);
        const bb = p1(a1 - 0.25, 70); banana.position.set(bb.x, WATER_LEVEL + Math.sin(t * 2) * 0.1, bb.z); const bq = p1(a1 - 0.27, 70); banana.rotation.y = Math.atan2(bb.x - bq.x, bb.z - bq.z); banana.rotation.z = Math.sin(t * 1.7) * 0.12;
        setRope(r1, V.set(p.x, WATER_LEVEL + 0.8, p.z).clone(), banana.position.clone().setY(WATER_LEVEL + 0.6)); }
      { const p = p1(a2, 120), q = p1(a2 + 0.02, 120); b2.position.set(p.x, WATER_LEVEL + 0.1, p.z); b2.rotation.y = Math.atan2(p.x - q.x, p.z - q.z);
        const back = { x: p.x - Math.sin(b2.rotation.y) * 38, z: p.z - Math.cos(b2.rotation.y) * 38 }, hgt = 30 + Math.sin(t * 0.4) * 2;
        chute.position.set(back.x, WATER_LEVEL + hgt, back.z); chute.rotation.set(-0.35, b2.rotation.y, 0, 'YXZ');
        flyer.position.set(back.x + Math.sin(b2.rotation.y) * 2, WATER_LEVEL + hgt - 4, back.z + Math.cos(b2.rotation.y) * 2);
        setRope(r2, V.set(p.x, WATER_LEVEL + 1, p.z).clone(), flyer.position.clone()); }
    },
  };
}
