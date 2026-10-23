// Events around the island:
// - Weekly board: a time trial on a different stretch of road every week (with your ghost), a drift target and a
//   delivery. Seeded by the ISO week, so everyone gets the same three; the first completion each week pays a bonus.
// - Hitchhikers: now and then someone thumbs a lift by the road. Stop beside them and press F; the GPS sets itself to
//   where they're going, they chat on the way and pay on arrival (more if you're quick, less if you scare them).
// - Seasons: a Christmas market on the festival field in winter, a beach party stage at Gull Bay in summer, and the
//   autumn rally weekend (banners at the stage starts, rally pay ×1.5).
// - Night city: neon street races round the Fairfield blocks (night only), and the Starlight drive-in east of town.
// - Postcards: hint-only photo targets ("Port Ruby cranes at dawn"): the right subject, place, time and season.
import * as THREE from 'three';
import { RBox } from './shapes.js';
import { roads, TOWNS, groundHeight, terrainHeight, roadAt, FESTIVAL, GULLBAY, SKI, TRACK, HARBOUR, DRIVEIN } from './world.js';
import { SEASON_U } from './seasons.js';

const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
// ISO week number, as "2026-W43"
export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear(), w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}
const rng = (seed) => { let s = 0; for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
const glow = (c, i = 2) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.5 });
function label(text, bg, fg, w = 512, h = 128, font = 64) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = `700 ${font}px "Barlow Condensed", Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = text.split('\n'); lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * font * 1.05));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// a simple person: legs, body, arms, head; `pose` 'thumb' raises the right arm
function person(shirt, pose = '') {
  const g = new THREE.Group(), skin = M(0xd9a27e), legs = M(0x2b3550);
  for (const s of [-1, 1]) { const l = new THREE.Mesh(new RBox(0.14, 0.82, 0.16, 0.05), legs); l.position.set(s * 0.1, 0.41, 0); g.add(l); }
  const b = new THREE.Mesh(new RBox(0.42, 0.6, 0.24, 0.08), M(shirt)); b.position.y = 1.12; g.add(b);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), skin); h.position.y = 1.57; g.add(h);
  const arm = (s, up) => { const a = new THREE.Group(); a.position.set(s * 0.27, 1.38, 0); const m = new THREE.Mesh(new RBox(0.1, 0.58, 0.1, 0.04), M(shirt)); m.position.y = -0.27; a.add(m); if (up) a.rotation.z = s * 1.9; g.add(a); return a; };
  arm(-1, false); g.userData.arm = arm(1, pose === 'thumb');
  if (pose === 'bag') { const k = new THREE.Mesh(new RBox(0.34, 0.45, 0.2, 0.06), M(0x6b4a2a)); k.position.set(-0.4, 0.23, 0.05); g.add(k); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function createEvents({ scene, toast, econ, settings, saveSettings, missions, ghosts, drift, stats, nav }) {
  const group = new THREE.Group(); scene.add(group);
  const town = (n) => TOWNS.find((t) => t.name === n);
  const F = town('Fairfield');
  const at = (o, x, z, y = null) => { o.position.set(x, y ?? groundHeight(x, z), z); group.add(o); return o; };

  // ================================================================ weekly board
  const week = isoWeek();
  if (!settings.weekly || settings.weekly.week !== week) {
    for (const k of Object.keys(settings.ghosts || {})) if (k.startsWith('wk-')) delete settings.ghosts[k];
    settings.weekly = { week, tt: null, drift: 0, paid: {} }; saveSettings();
  }
  const W = settings.weekly, R = rng(week);
  const weekly = {};
  { // time trial: up to 2.4 km of a main road, six splits
    const rs = roads.filter((r) => (r.type === 'road' || r.type === 'highway') && r.length > 1400);
    const r = rs[Math.floor(R() * rs.length)], dir = R() < 0.5 ? 1 : -1;
    if (r) {
      const L = Math.min(2400, Math.floor((r.length - 200) / 100) * 100), s0 = 100 + R() * (r.length - L - 200), idx = (s) => { let i = 0; while (i < r.n - 1 && r.s[i] < s) i++; return i; };
      const cps = []; for (let k = 0; k <= 6; k++) { const s = dir > 0 ? s0 + k * L / 6 : s0 + L - k * L / 6, i = idx(s); cps.push({ x: r.pts[i][0], z: r.pts[i][1], y: r.h[i], r: 14, kind: 'ground', label: k === 0 ? 'Start' : k === 6 ? 'Finish' : `Split ${k}` }); }
      weekly.tt = { road: r.name, cps, L, par: L / (r.type === 'highway' ? 34 : 27) };
    }
  }
  weekly.driftTarget = Math.round((6 + R() * 6) * 1000 / 500) * 500;
  { // delivery between two towns at least 1.2 km apart
    const ts = TOWNS.filter((t) => !t.island); let a = null, b = null;
    for (let k = 0; k < 40 && !b; k++) { const A = ts[Math.floor(R() * ts.length)], B = ts[Math.floor(R() * ts.length)]; const d = Math.hypot(A.x - B.x, A.z - B.z); if (A !== B && d > 1200 && d < 3200) { a = A; b = B; } }
    const goods = ['a wedding cake', 'a vintage gearbox', 'a crate of local wine', 'a surfboard', 'a lost dog (on the passenger seat)', 'theatre costumes'];
    if (a && b) weekly.deliv = { a, b, what: goods[Math.floor(R() * goods.length)], d: Math.hypot(a.x - b.x, a.z - b.z) };
  }
  let ttRun = null;
  function startTT() {
    const T = weekly.tt; if (!T) return;
    const id = `wk-${week}`;
    missions.startCustom({ id: 'weekly-tt', name: `Weekly time trial · ${T.road}`, job: true, startAtFirst: true, par: T.par, cps: T.cps.map((c) => ({ ...c })),
      pay: (t) => { const first = !W.paid.tt; W.paid.tt = true; const nb = W.tt == null || t < W.tt; if (nb) W.tt = t; saveSettings(); return 450 + (t <= T.par ? 350 : 0) + (first ? 600 : 0) + (nb ? 150 : 0); },
      onEnd: (ok) => { if (ttRun && ok) { const t = missions.lastTime; if (t != null && ghosts.lap(t)) toast('Weekly ghost saved'); } ghosts.stop(); ttRun = null; } });
    ghosts.stop(); ttRun = { id, started: false };
    nav && nav(`Weekly time trial start`, T.cps[0].x, T.cps[0].z);
    toast(`Weekly time trial: ${T.road}, ${(T.L / 1000).toFixed(1)} km. Clock starts at the first marker${ghosts.best(id) ? ` · your ghost ${fmt(ghosts.best(id))}` : ''}`);
  }
  function startDeliv() {
    const D = weekly.deliv; if (!D) return;
    missions.startCustom({ id: 'weekly-deliv', name: `Weekly delivery · ${D.what}`, job: true, limit: D.d / 14 + 120, cps: [
      { x: D.a.x, z: D.a.z, y: D.a.h, r: 12, label: `Collect ${D.what} in ${D.a.name}`, stop: true, dwell: 2, dwellMsg: 'Loading…', msg: `Loaded · on to ${D.b.name}` },
      { x: D.b.x, z: D.b.z, y: D.b.h, r: 12, label: `Deliver to ${D.b.name}`, stop: true }],
      pay: () => { const first = !W.paid.deliv; W.paid.deliv = true; saveSettings(); return 350 + D.d * 0.12 + (first ? 700 : 0); } });
    nav && nav(D.a.name, D.a.x, D.a.z);
    toast(`Weekly delivery: ${D.what}, ${D.a.name} → ${D.b.name}`);
  }
  let lastTotal = drift ? drift.state.total : 0;

  // ================================================================ hitchhikers
  const SHIRTS = [0xd94f3d, 0x3d7ad9, 0xe0c341, 0x46a36b, 0x8a4fc4, 0xf0f0f0];
  const NAMES = ['Maya', 'Jonas', 'Inès', 'Theo', 'Ruth', 'Kofi', 'Lena', 'Pablo', 'Aiko', 'Sam'];
  const CHAT = ['Nice car! Is it the 1.6?', 'I love this song.', 'My bus broke down by the quarry, thanks for stopping.', 'Do you ever take it to the raceway?', 'The sea looks amazing from up here.', 'Have you tried the drift zone on the pass?', 'I could get used to this roadster life.', 'Is that the cable car up there?'];
  let hitch = null, hitchCd = 25, hitchTry = 0, ride = null;
  function spawnHitch(pos, vel) {
    const rh = roadAt(pos.x, pos.z, 2); if (!rh) return false;
    const r = rh.road; if (r.type !== 'road' && r.type !== 'highway') return false;
    const fwd = Math.sign(vel.x * r.tx[rh.seg] + vel.z * r.tz[rh.seg]) || 1;
    const sAt = r.s[rh.seg] + fwd * 140; let i = rh.seg; if (fwd > 0) { while (i < r.n - 1 && r.s[i] < sAt) i++; } else { while (i > 0 && r.s[i] > sAt) i--; }
    if (i <= 1 || i >= r.n - 2 || r.bridge[i]) return false;
    const nx = -r.tz[i], nz = r.tx[i];
    // the same side as the player's lane
    const side = Math.sign((pos.x - r.pts[rh.seg][0]) * -r.tz[rh.seg] + (pos.z - r.pts[rh.seg][1]) * r.tx[rh.seg]) || 1;
    const x = r.pts[i][0] + nx * side * (r.hw + 1.8), z = r.pts[i][1] + nz * side * (r.hw + 1.8);
    if (Math.abs(terrainHeight(x, z) - r.h[i]) > 2.5) return false;
    const k = Math.floor(Math.random() * NAMES.length), p = person(SHIRTS[k % SHIRTS.length], 'thumb');
    const bag = person(SHIRTS[(k + 2) % SHIRTS.length], 'bag'); bag.visible = false;
    at(p, x, z, Math.max(terrainHeight(x, z), r.h[i] - 0.1)); p.rotation.y = Math.atan2(-nx * side, -nz * side) + fwd * 0.5;
    hitch = { p, x, z, name: NAMES[k], t: 0 };
    return true;
  }
  function pickUp(pos, yaw) {
    const name = hitch.name; group.remove(hitch.p); hitch = null;
    const places = [...TOWNS.map((t) => ({ name: t.name, x: t.x, z: t.z, y: t.h })), { name: 'the Starlight drive-in', x: DRIVEIN.x, z: DRIVEIN.z }, { name: 'Red Mesa Raceway', x: TRACK.entrance ? TRACK.entrance.x : TRACK.x, z: TRACK.entrance ? TRACK.entrance.z : TRACK.z }];
    const ok = places.filter((q) => { const d = Math.hypot(q.x - pos.x, q.z - pos.z); return d > 600 && d < 3000; });
    const dest = ok.length ? ok[Math.floor(Math.random() * ok.length)] : places.sort((a, b) => Math.hypot(b.x - pos.x, b.z - pos.z) - Math.hypot(a.x - pos.x, a.z - pos.z))[0];
    const d = Math.hypot(dest.x - pos.x, dest.z - pos.z);
    ride = { name, dest, d, t: 0, chat: 12, scared: 0, warn: 0 };
    missions.startCustom({ id: 'hitch', name: `Hitchhiker · ${name}`, job: true, limit: d / 9 + 120, cps: [{ x: dest.x, z: dest.z, y: dest.y, r: 16, label: `Drop ${name} at ${dest.name}`, stop: true }],
      pay: (t) => { const quick = Math.max(0, d / 16 - t) * 2; const tip = Math.max(0, 1 - ride.scared * 0.25); return Math.round((80 + d * 0.22 + quick) * (0.5 + 0.5 * tip)); },
      onEnd: (ok2) => { if (ok2) { toast(`${name}: ${ride && ride.scared > 2 ? 'I\'ll take the bus next time…' : 'Thanks for the lift!'}`); stats && stats.event('hitch', 1); } ride = null; } });
    nav && nav(dest.name, dest.x, dest.z, pos, yaw);
    toast(`${name}: "Going to ${dest.name}, if that's OK?"`);
  }

  // ================================================================ seasonal sets
  // winter: Christmas market on the festival field (the summer festival is packed away)
  const xmas = new THREE.Group(); group.add(xmas);
  const lightsMat = glow(0xffd27a, 2.5), lightsMat2 = glow(0xff4a4a, 2.5);
  { const cx = FESTIVAL.x, cz = FESTIVAL.z, h = groundHeight(cx, cz);
    xmas.position.set(cx, h, cz);
    // tree: stacked cones with baubles and a star
    const tree = new THREE.Group(); xmas.add(tree);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 2, 8), M(0x5b3a22)); trunk.position.y = 1; tree.add(trunk);
    for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(4.2 - k * 0.9, 3.6, 14), M(0x1d5a2c)); c.position.y = 2.6 + k * 2.2; tree.add(c); }
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), glow(0xffe066, 3)); star.position.y = 11.6; tree.add(star);
    const bg = new THREE.SphereGeometry(0.17, 8, 6);
    const bm = new THREE.InstancedMesh(bg, lightsMat, 60), bm2 = new THREE.InstancedMesh(bg, lightsMat2, 30), m4 = new THREE.Matrix4();
    for (let k = 0; k < 90; k++) { const y = 2 + Math.random() * 8.5, rr = (4.2 - (y - 1.6) / 2.2 * 0.9) * (1 - ((y - 0.8) % 2.2) / 3.6) * 0.9 + 0.2, a = Math.random() * 6.28; m4.makeTranslation(Math.cos(a) * rr, y, Math.sin(a) * rr); (k < 60 ? bm : bm2).setMatrixAt(k < 60 ? k : k - 60, m4); }
    tree.add(bm, bm2);
    // wooden chalets in a ring, roofs dusted white, with a lit sign each
    const wood = M(0x8a5a33), roof = M(0xe8ecf2, { roughness: 0.9 }), goods = ['Mulled cider', 'Gingerbread', 'Candles', 'Toys', 'Crêpes', 'Ornaments', 'Hot chocolate', 'Wool hats'];
    goods.forEach((name, k) => {
      const a = k / goods.length * Math.PI * 2, r = 20, s = new THREE.Group(); s.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); s.rotation.y = -a - Math.PI / 2; xmas.add(s);
      const b = new THREE.Mesh(new RBox(4, 2.6, 2.6, 0.06), wood); b.position.y = 1.3; s.add(b);
      for (const sd of [-1, 1]) { const rf = new THREE.Mesh(new RBox(4.6, 0.12, 2, 0.04), roof); rf.position.set(0, 3.0, sd * 0.75); rf.rotation.x = sd * 0.6; s.add(rf); }
      const st = label(name, '#5a1a14', '#ffe9b0', 512, 108, 60), sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.55), new THREE.MeshStandardMaterial({ map: st, emissive: 0xffffff, emissiveMap: st, emissiveIntensity: 0.5 })); sign.position.set(0, 2.15, 1.32); s.add(sign);
      const ctr = new THREE.Mesh(new RBox(3.6, 0.1, 0.5, 0.03), M(0xb07a45)); ctr.position.set(0, 1.1, 1.45); s.add(ctr);
    });
    // string lights from the tree top out to the chalets
    const lg = new THREE.SphereGeometry(0.09, 6, 4), N = 8 * 16, im = new THREE.InstancedMesh(lg, lightsMat, N); let n = 0;
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; for (let q = 1; q <= 16; q++) { const f = q / 17, rr = f * 20, y = 10.5 - f * 7.5 - Math.sin(f * Math.PI) * 1.2; m4.makeTranslation(Math.cos(a) * rr, y, Math.sin(a) * rr); im.setMatrixAt(n++, m4); } }
    xmas.add(im);
    // a small ice rink
    const rink = new THREE.Mesh(new THREE.CircleGeometry(7, 32).rotateX(-Math.PI / 2), M(0xcfe6f5, { roughness: 0.08, metalness: 0.1 })); rink.position.set(0, 0.06, 30); xmas.add(rink);
    for (let k = 0; k < 4; k++) { const sk = person(SHIRTS[k], ''); sk.scale.setScalar(0.95); xmas.add(sk); sk.userData.skate = { a: k * 1.6, r: 3 + k * 0.8 }; }
    xmas.visible = false;
  }
  const skaters = xmas.children.filter((o) => o.userData.skate);

  // summer: beach party stage on the Gull Bay sand
  const party = new THREE.Group(); group.add(party);
  const spots = [];
  if (GULLBAY.beach.length) {
    const b = GULLBAY.beach[Math.floor(GULLBAY.beach.length * 0.35)], x = b.x + b.nx * 6, z = b.z + b.nz * 6;
    party.position.set(x, groundHeight(x, z), z); party.rotation.y = Math.atan2(-b.nx, -b.nz);
    const deck = new THREE.Mesh(new RBox(12, 1, 7, 0.1), M(0x3a3f47)); deck.position.y = 0.5; party.add(deck);
    const truss = M(0xb9bec6, { metalness: 0.7, roughness: 0.35 });
    for (const sx of [-5.8, 5.8]) for (const sz of [-3.3, 3.3]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), truss); p.position.set(sx, 4, sz); party.add(p); }
    for (const sz of [-3.3, 3.3]) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 11.6, 6).rotateZ(Math.PI / 2), truss); bar.position.set(0, 7, sz); party.add(bar); }
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.4), new THREE.MeshBasicMaterial({ map: label('GULL BAY BEACH PARTY', '#ff3c8a', '#fff', 1024, 144, 96), toneMapped: false })); banner.position.set(0, 7.9, 3.35); party.add(banner);
    const desk = new THREE.Mesh(new RBox(2.6, 1.1, 0.9, 0.06), M(0x15171a)); desk.position.set(0, 1.55, -0.8); party.add(desk);
    const dj = person(0x111111, ''); dj.position.set(0, 1, -1.6); party.add(dj); dj.userData.bob = 0;
    for (const sx of [-5, 5]) { const sp = new THREE.Mesh(new RBox(1.3, 2.6, 1.1, 0.08), M(0x111111)); sp.position.set(sx, 2.3, 2.6); party.add(sp); }
    const cols = [0xff2d95, 0x2de0ff, 0xffe02d, 0x7dff2d];
    cols.forEach((c, k) => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 9, 16, 1, true).translate(0, -4.5, 0), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const piv = new THREE.Group(); piv.position.set(-4.5 + k * 3, 6.8, 3.2); piv.add(cone); party.add(piv); spots.push({ piv, cone, ph: k * 1.3 });
    });
    for (let k = 0; k < 14; k++) { const d = person(SHIRTS[k % SHIRTS.length], ''); d.position.set((Math.random() - 0.5) * 14, 0, 6 + Math.random() * 9); d.rotation.y = Math.PI + (Math.random() - 0.5); party.add(d); d.userData.bob = Math.random() * 6; }
  }
  party.visible = false;
  const dancers = party.children.filter((o) => o.userData.bob != null);

  // autumn: rally weekend arches at the stage starts
  const rallyArches = new THREE.Group(); group.add(rallyArches); rallyArches.visible = false;
  { const tex = label('RALLY WEEKEND · PAY ×1.5', '#2b1a0e', '#ffb347', 1024, 128, 80), mat = new THREE.MeshStandardMaterial({ map: tex }), pm = M(0xc0621a);
    for (const n of ['Riverside rally stage', 'Pinewood forest stage']) {
      const r = roads.find((q) => q.name === n); if (!r) continue;
      const i = Math.min(r.n - 1, 24), g = new THREE.Group(); g.position.set(r.pts[i][0], r.h[i], r.pts[i][1]); g.rotation.y = Math.atan2(r.tx[i], r.tz[i]); rallyArches.add(g);
      for (const s of [-1, 1]) { const p = new THREE.Mesh(new RBox(0.35, 5.2, 0.35), pm); p.position.set(s * (r.hw + 1.6), 2.6, 0); g.add(p); }
      for (const ry of [0, Math.PI]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(r.hw * 2 + 3.6, 1.2), mat); b.position.set(0, 5.4, ry ? -0.03 : 0.03); b.rotation.y = ry; g.add(b); }
      // hay bales and pumpkins either side
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 12).rotateZ(Math.PI / 2), M(0xd8b450, { roughness: 1 })); hb.position.set(s * (r.hw + 3 + k * 1.4), 0.6, 2); g.add(hb); const pk = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8).scale(1, 0.8, 1), M(0xe2701a)); pk.position.set(s * (r.hw + 3 + k * 1.4), 1.45, 2); g.add(pk); }
    } }

  // ================================================================ night city: neon street races
  const neon = new THREE.Group(); group.add(neon);
  const races = [];
  if (F && F.streets.length >= 8) {
    // the grid: parallel streets (along the town axis) and cross streets; corners where they meet
    const ax = [F.ux, F.uz], dirOf = (r) => { const dx = r.pts[r.n - 1][0] - r.pts[0][0], dz = r.pts[r.n - 1][1] - r.pts[0][1], l = Math.hypot(dx, dz); return [dx / l, dz / l]; };
    const par = [], crs = [];
    for (const st of F.streets) { const d = dirOf(st); (Math.abs(d[0] * ax[0] + d[1] * ax[1]) > 0.7 ? par : crs).push(st); }
    const off = (st) => (st.pts[0][0] - F.x) * -ax[1] + (st.pts[0][1] - F.z) * ax[0];
    const along = (st) => (st.pts[0][0] - F.x) * ax[0] + (st.pts[0][1] - F.z) * ax[1];
    par.sort((a, b) => off(a) - off(b)); crs.sort((a, b) => along(a) - along(b));
    const cross = (a, b) => { // nearest pair of points
      let best = null; for (let i = 0; i < a.n; i += 2) for (let j = 0; j < b.n; j += 2) { const d = (a.pts[i][0] - b.pts[j][0]) ** 2 + (a.pts[i][1] - b.pts[j][1]) ** 2; if (!best || d < best.d) best = { d, x: (a.pts[i][0] + b.pts[j][0]) / 2, z: (a.pts[i][1] + b.pts[j][1]) / 2 }; } return best; };
    const loop = (p0, p1, c0, c1, rev) => {
      if (!par[p0] || !par[p1] || !crs[c0] || !crs[c1]) return null;
      const C = [cross(par[p0], crs[c0]), cross(par[p0], crs[c1]), cross(par[p1], crs[c1]), cross(par[p1], crs[c0])];
      if (C.some((c) => !c || c.d > 64)) return null;
      const pts = []; for (let k = 0; k < 4; k++) { const a = C[k], b = C[(k + 1) % 4]; pts.push([a.x, a.z], [(a.x + b.x) / 2, (a.z + b.z) / 2]); }
      if (rev) pts.reverse();
      let L = 0; for (let k = 0; k < pts.length; k++) L += Math.hypot(pts[(k + 1) % pts.length][0] - pts[k][0], pts[(k + 1) % pts.length][1] - pts[k][1]);
      return { pts, L };
    };
    const np = par.length - 1, nc = crs.length - 1;
    const defs = [
      { id: 'neon1', name: 'Neon 1 · Outer blocks', lp: loop(0, np, 0, nc, false), laps: 2, col: 0xff2d95 },
      { id: 'neon2', name: 'Neon 2 · Downtown', lp: loop(1, np - 1, 0, nc, true), laps: 2, col: 0x2de0ff },
      { id: 'neon3', name: 'Neon 3 · Night owl', lp: loop(0, np - 1, 1, nc, false), laps: 3, col: 0x9d4dff },
    ];
    for (const d of defs) if (d.lp) races.push({ ...d, gold: d.lp.L * d.laps / 21 });
  }
  function startNeon(R2) {
    while (neon.children.length) neon.remove(neon.children[0]);
    const cps = [], P = R2.lp.pts, n = P.length;
    for (let l = 0; l < R2.laps; l++) for (let k = 0; k < n; k++) cps.push({ x: P[k][0], z: P[k][1], y: F.h, r: 12, kind: 'ground', label: l === 0 && k === 0 ? 'Start' : `Lap ${l + 1}/${R2.laps}` });
    cps.push({ x: P[0][0], z: P[0][1], y: F.h, r: 12, kind: 'ground', label: 'Finish' });
    // neon arches over every corner and mid-block
    const mat = glow(R2.col, 3), mat2 = glow(0xffffff, 1.5);
    for (let k = 0; k < n; k++) {
      const a = P[k], b = P[(k + 1) % n], c = P[(k + n - 1) % n], yaw = Math.atan2(b[0] - c[0], b[1] - c[1]), g = new THREE.Group();
      g.position.set(a[0], groundHeight(a[0], a[1]), a[1]); g.rotation.y = yaw; neon.add(g);
      for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 5.5, 6), mat); p.position.set(s * 6.5, 2.75, 0); g.add(p); }
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 13, 6).rotateZ(Math.PI / 2), mat); top.position.y = 5.5; g.add(top);
      const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 13, 6).rotateZ(Math.PI / 2), mat2); t2.position.y = 5.1; g.add(t2);
    }
    missions.startCustom({ id: R2.id, name: R2.name, job: true, startAtFirst: true, cps, par: R2.gold,
      pay: (t) => { const best = settings.neon[R2.id], nb = best == null || t < best; if (nb) settings.neon[R2.id] = t; const gold = t <= R2.gold; if (gold && !settings.neon[R2.id + 'g']) settings.neon[R2.id + 'g'] = 1; saveSettings();
        if (races.every((q) => settings.neon[q.id + 'g'])) toast('Neon series: all gold!'); return Math.round(300 + (gold ? 500 : t <= R2.gold * 1.15 ? 200 : 0) + (nb ? 100 : 0)); },
      onEnd: () => { while (neon.children.length) neon.remove(neon.children[0]); } });
    nav && nav(`${R2.name} start`, P[0][0], P[0][1]);
    toast(`${R2.name}: ${R2.laps} laps · gold under ${fmt(R2.gold)}`);
  }
  settings.neon = settings.neon || {};

  // ================================================================ the Starlight drive-in
  const drivein = { group: new THREE.Group(), t: 0, seen: false, still: 0 };
  { const D = DRIVEIN, g = drivein.group; g.position.set(D.x, D.h + 0.03, D.z); g.rotation.y = Math.atan2(D.ux, D.uz); group.add(g);
    // gravel lot and driveway
    const gc = document.createElement('canvas'); gc.width = gc.height = 128; const gx = gc.getContext('2d'); gx.fillStyle = '#6f685d'; gx.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 2200; k++) { const v = 70 + Math.random() * 80 | 0; gx.fillStyle = `rgb(${v},${v - 6},${v - 14})`; gx.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2); }
    const gt = new THREE.CanvasTexture(gc); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.colorSpace = THREE.SRGBColorSpace;
    const gm = new THREE.MeshStandardMaterial({ map: gt, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
    const lotT = gt.clone(); lotT.repeat.set(D.hw / 4, D.hl / 4); lotT.needsUpdate = true;
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(D.hw * 2, D.hl * 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: lotT, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 })); lot.position.y = 0.03; lot.receiveShadow = true; g.add(lot);
    if (D.drive) { const e = D.drive, dt2 = gt.clone(); dt2.repeat.set(1.6, e.hl / 2); dt2.needsUpdate = true;
      const dw = new THREE.Mesh(new THREE.PlaneGeometry(e.hw * 2, e.hl * 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: dt2, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
      dw.position.set(e.x, groundHeight(e.x, e.z) + 0.03, e.z); dw.rotation.y = Math.atan2(e.ux, e.uz); dw.receiveShadow = true; group.add(dw); }
    gm.dispose();
    // screen at the far end, facing back down the lot (local +z = along u)
    const c = document.createElement('canvas'); c.width = 256; c.height = 112; drivein.ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; drivein.tex = tex;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(24, 10.5), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); scr.position.set(0, 9.5, D.hl - 3); scr.rotation.y = Math.PI; g.add(scr); drivein.scr = scr;
    const back = new THREE.Mesh(new RBox(25, 11.5, 0.5, 0.1), M(0xdedad2)); back.position.set(0, 9.5, D.hl - 2.65); g.add(back);
    for (const sx of [-9, 0, 9]) { const leg = new THREE.Mesh(new RBox(0.6, 4.4, 0.6), M(0x6e6a64)); leg.position.set(sx, 2.2, D.hl - 2.6); g.add(leg); }
    // speaker posts in rows (cars park between them)
    const postM = M(0x7a7f86, { metalness: 0.5 }), spk = M(0x2a2c30);
    for (let row = 0; row < 4; row++) for (let k = -3; k <= 3; k++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), postM); p.position.set(k * 6.5, 0.55, D.hl - 22 - row * 11); g.add(p); const s = new THREE.Mesh(new RBox(0.3, 0.22, 0.12, 0.03), spk); s.position.set(k * 6.5, 1.15, D.hl - 22 - row * 11); g.add(s); }
    // projection booth / snack bar at the back
    const booth = new THREE.Mesh(new RBox(8, 3.2, 5, 0.15), M(0xe8d9b5)); booth.position.set(0, 1.6, -D.hl + 6); g.add(booth);
    const bt = label('SNACKS · POPCORN', '#c8102e', '#fff', 512, 80, 56), bsign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.1), new THREE.MeshStandardMaterial({ map: bt, emissive: 0xffffff, emissiveMap: bt, emissiveIntensity: 0.4 })); bsign.position.set(0, 3.5, -D.hl + 8.55); g.add(bsign);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(6, 0.25, D.hl * 2 - 12, 16, 1, true).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.03, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(0, 7, 1.5); g.add(beam); drivein.beam = beam;
    // the roadside sign by the driveway, in neon at night
    if (D.drive) { const s = new THREE.Group(), e = D.drive, sx = e.x + e.ux * e.hl - e.uz * 5, sz = e.z + e.uz * e.hl + e.ux * 5; s.position.set(sx, groundHeight(sx, sz), sz); s.rotation.y = Math.atan2(-e.ux, -e.uz) + Math.PI / 2; group.add(s);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5, 6), postM); pole.position.y = 2.5; s.add(pole);
      const st = label('★ STARLIGHT ★\nDRIVE-IN', '#16124a', '#ff6ad5', 512, 256, 92); drivein.signMat = new THREE.MeshStandardMaterial({ map: st, emissive: 0xffffff, emissiveMap: st, emissiveIntensity: 0 });
      for (const r of [0, Math.PI]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), drivein.signMat); b.position.set(0, 5.6, r ? -0.06 : 0.06); b.rotation.y = r; s.add(b); } }
  }
  const FILMS = ['Gone in 60 Laps', 'The Roadster Who Loved Me', 'Night of the Living Mechs', 'Gull Bay Summer', 'Fast & Frugal'];
  function drawFilm(t, night) {
    const g = drivein.ctx, W2 = 256, H2 = 112;
    if (!night) { g.fillStyle = '#e9e6de'; g.fillRect(0, 0, W2, H2); g.fillStyle = '#7a1a1a'; g.font = '700 22px Arial'; g.textAlign = 'center'; g.fillText('TONIGHT 21:00', W2 / 2, 50); g.font = '16px Arial'; g.fillText(FILMS[Math.floor(Date.now() / 864e5) % FILMS.length], W2 / 2, 78); drivein.tex.needsUpdate = true; return; }
    const sc = Math.floor(t / 12) % 3;
    if (sc === 0) { // a sunset road with a little red roadster
      const gr = g.createLinearGradient(0, 0, 0, H2); gr.addColorStop(0, '#2a1f5c'); gr.addColorStop(0.55, '#ff7a45'); gr.addColorStop(0.56, '#3a3a40'); gr.addColorStop(1, '#202024'); g.fillStyle = gr; g.fillRect(0, 0, W2, H2);
      g.fillStyle = '#ffd25a'; g.beginPath(); g.arc(W2 * 0.7, 60, 16, 0, 6.3); g.fill();
      g.fillStyle = '#ddd'; for (let k = 0; k < 6; k++) g.fillRect(((k * 60 - t * 120) % 360 + 360) % 360 - 50, 90, 26, 3);
      const bx = 90 + Math.sin(t * 1.3) * 6, by = 76 + Math.sin(t * 9) * 0.8; g.fillStyle = '#c8102e'; g.fillRect(bx, by, 50, 10); g.fillRect(bx + 12, by - 7, 22, 8); g.fillStyle = '#111'; g.beginPath(); g.arc(bx + 10, by + 11, 5, 0, 6.3); g.arc(bx + 40, by + 11, 5, 0, 6.3); g.fill();
    } else if (sc === 1) { // a mech silhouette against the moon
      g.fillStyle = '#0b1530'; g.fillRect(0, 0, W2, H2); g.fillStyle = '#f2f0dc'; g.beginPath(); g.arc(128, 48, 30, 0, 6.3); g.fill();
      g.fillStyle = '#000'; const s = Math.sin(t * 2) * 3; g.fillRect(118, 40 + s, 20, 26); g.fillRect(122, 30 + s, 12, 10); g.fillRect(112, 66 + s, 8, 30); g.fillRect(136, 66 + s, 8, 30); g.fillRect(104, 42 + s, 10, 18); g.fillRect(142, 42 + s, 10, 18);
      g.fillStyle = '#ff3030'; g.fillRect(125, 33 + s, 6, 2);
    } else { // credits roll
      g.fillStyle = '#000'; g.fillRect(0, 0, W2, H2); g.fillStyle = '#ddd'; g.font = '12px Arial'; g.textAlign = 'center';
      const lines = ['STARRING', 'the MX-5', 'the Strada GT', 'and Pilou as himself', '', 'DIRECTED BY', 'a very fast camera', '', 'NO ROADSTERS WERE HARMED']; lines.forEach((l, i) => g.fillText(l, W2 / 2, 120 + i * 16 - ((t % 12) * 18)));
    }
    // film grain flicker
    g.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.04})`; g.fillRect(0, 0, W2, H2);
    drivein.tex.needsUpdate = true;
  }
  drawFilm(0, false);

  // ================================================================ postcards
  settings.postcards = settings.postcards || {};
  const PC = [];
  function postcards(lighthouse) {
    if (PC.length) return PC;
    const sub = (x, z, dy = 6, y = null) => [x, (y ?? terrainHeight(x, z)) + dy, z];
    if (lighthouse) PC.push({ id: 'pc-light', hint: 'The lighthouse at sunset, seen from across the water', sub: [lighthouse.x, lighthouse.y, lighthouse.z], dmin: 120, dmax: 1200, hours: [17.3, 20.6] });
    PC.push({ id: 'pc-peaks', hint: 'Silverpine Peaks dressed in snow', sub: sub(SKI.top.x, SKI.top.z, 10), dmin: 300, dmax: 2600, season: 'winter' });
    PC.push({ id: 'pc-track', hint: 'Red Mesa Raceway from the sky', sub: [TRACK.x, (TRACK.h || 0) + 2, TRACK.z], dmin: 0, dmax: 900, above: 60, cone: 0.6 });
    if (F) PC.push({ id: 'pc-city', hint: 'Fairfield\'s lights from the hills, after dark', sub: [F.x, F.h + 12, F.z], dmin: 250, dmax: 1600, night: true, higher: F.h + 25 });
    PC.push({ id: 'pc-harbour', hint: 'Port Ruby\'s cranes at dawn', sub: [HARBOUR.cx + 15, 20, HARBOUR.cz], dmin: 60, dmax: 900, hours: [5, 8] });
    PC.push({ id: 'pc-drivein', hint: 'A film night at the drive-in', sub: [DRIVEIN.x + DRIVEIN.ux * (DRIVEIN.hl - 3), DRIVEIN.h + 9.5, DRIVEIN.z + DRIVEIN.uz * (DRIVEIN.hl - 3)], dmin: 15, dmax: 160, night: true });
    PC.push({ id: 'pc-xmas', hint: 'The Christmas tree, all lit up', sub: [FESTIVAL.x, groundHeight(FESTIVAL.x, FESTIVAL.z) + 6, FESTIVAL.z], dmin: 10, dmax: 120, season: 'winter', night: true });
    return PC;
  }
  const V = new THREE.Vector3(), Fw = new THREE.Vector3();

  // ================================================================ API
  let season = 'spring';
  const api = {
    weekly, races, isoWeek: week,
    get hitch() { return hitch; }, get ride() { return ride; }, spawnHitch,
    drivein, get sets() { return { xmas, party, rallyArches, neon }; },
    // pause-menu entries: { id, name, desc, disabled }
    list(ctx = {}) {
      const out = [];
      if (weekly.tt) out.push({ id: 'wk-tt', name: `Weekly · Time trial on ${weekly.tt.road}`, desc: `${(weekly.tt.L / 1000).toFixed(1)} km against your ghost. Par ${fmt(weekly.tt.par)}.${W.tt != null ? ` This week's best ${fmt(W.tt)}.` : ''}${W.paid.tt ? '' : ' First finish: +$600.'}` });
      out.push({ id: 'wk-drift', name: `Weekly · Drift ${weekly.driftTarget.toLocaleString('en-US')} pts`, desc: `Bank one drift chain worth ${weekly.driftTarget.toLocaleString('en-US')} points anywhere. This week's best ${Math.round(W.drift).toLocaleString('en-US')}.${W.paid.drift ? ' Done ✓' : ' Pays $1,200.'}`, disabled: true });
      if (weekly.deliv) out.push({ id: 'wk-deliv', name: `Weekly · Delivery to ${weekly.deliv.b.name}`, desc: `${weekly.deliv.what[0].toUpperCase() + weekly.deliv.what.slice(1)} from ${weekly.deliv.a.name}.${W.paid.deliv ? ' Done ✓' : ' First delivery: +$700.'}` });
      for (const r of races) out.push({ id: r.id, name: `Night city · ${r.name}`, desc: `${r.laps} laps round the Fairfield blocks under neon. Gold ${fmt(r.gold)}.${settings.neon[r.id] != null ? ` Best ${fmt(settings.neon[r.id])}${settings.neon[r.id + 'g'] ? ' 🥇' : ''}.` : ''}${ctx.night ? '' : ' Night only (20:00–05:30).'}`, disabled: !ctx.night });
      for (const p of postcards(ctx.lighthouse)) out.push({ id: p.id, name: `Postcard${settings.postcards[p.id] ? ' ✓' : ''} · ${p.hint}`, desc: settings.postcards[p.id] ? 'Captured.' : 'Find the spot, the time and the season, then frame it in photo mode (0, Enter). Pays $400.', disabled: !!settings.postcards[p.id] });
      return out;
    },
    start(id, ctx = {}) {
      if (id === 'wk-tt') return startTT();
      if (id === 'wk-deliv') return startDeliv();
      const r = races.find((q) => q.id === id); if (r) { if (!ctx.night) { toast('The neon races start after dark'); return; } return startNeon(r); }
      const p = PC.find((q) => q.id === id); if (p) { nav && nav('Postcard subject', p.sub[0], p.sub[2]); toast(`Postcard: ${p.hint}`); }
    },
    // called when a photo is saved
    postcardCheck(camera, hour, lighthouse) {
      camera.getWorldDirection(Fw);
      const night = hour < 5.5 || hour > 20;
      for (const p of postcards(lighthouse)) {
        if (settings.postcards[p.id]) continue;
        V.set(p.sub[0], p.sub[1], p.sub[2]).sub(camera.position); const d = V.length(); V.normalize();
        if (V.dot(Fw) < Math.cos(p.cone || 0.4) || d < p.dmin || d > p.dmax) continue;
        let miss = null;
        if (p.season && season !== p.season) miss = `wait for ${p.season}`;
        else if (p.night && !night) miss = 'come back after dark';
        else if (p.hours && (hour < p.hours[0] || hour > p.hours[1])) miss = 'wrong time of day';
        else if (p.above && camera.position.y - groundHeight(camera.position.x, camera.position.z) < p.above) miss = 'get higher';
        else if (p.higher && camera.position.y < p.higher) miss = 'find a higher viewpoint';
        if (miss) { toast(`Postcard "${p.hint}": nearly, ${miss}`); return null; }
        settings.postcards[p.id] = Date.now(); saveSettings();
        econ && econ.earn(400, `Postcard: ${p.hint}`);
        const n = PC.filter((q) => settings.postcards[q.id]).length;
        if (n === PC.length) econ && econ.earn(1500, 'Every postcard captured!'); else toast(`Postcards ${n}/${PC.length}`);
        stats && stats.event('postcards', 1);
        return p;
      }
      return null;
    },
    // seasonal sets and the drive-in (also called in photo mode, from the camera position)
    scenery(dt, pos, hour) {
      // seasons
      const night = hour < 5.5 || hour > 20;
      const near = (o, r) => Math.hypot(pos.x - o.x, pos.z - o.z) < r;
      xmas.visible = SEASON_U.uSnow.value > 0.5;
      if (xmas.visible && near(FESTIVAL, 700)) {
        lightsMat.emissiveIntensity = night ? 3 : 0.8; lightsMat2.emissiveIntensity = night ? 3 * (0.6 + 0.4 * Math.sin(Date.now() / 300)) : 0.8;
        for (const s of skaters) { const k = s.userData.skate; k.a += dt * 0.5; s.position.set(Math.cos(k.a) * k.r, 0.06, 30 + Math.sin(k.a) * k.r); s.rotation.y = -k.a; }
      }
      party.visible = SEASON_U.uSummer.value > 0.5;
      if (party.visible && Math.hypot(pos.x - party.position.x, pos.z - party.position.z) < 600) {
        const T = performance.now() / 1000;
        for (const s of spots) { s.piv.rotation.z = Math.sin(T * 0.9 + s.ph) * 0.5; s.piv.rotation.x = Math.cos(T * 0.7 + s.ph) * 0.35; s.cone.material.opacity = night ? 0.22 : 0.05; }
        for (const d of dancers) { d.userData.bob += dt * 7.5; d.position.y = (d === dancers[0] ? 1 : 0) + Math.abs(Math.sin(d.userData.bob)) * 0.15; }
      }
      rallyArches.visible = SEASON_U.uAutumn.value > 0.5;
      // drive-in: film at night, stop in the lot to watch
      const D = DRIVEIN, dd = Math.hypot(pos.x - D.x, pos.z - D.z);
      if (dd < 500) {
        drivein.t += dt; drivein.ft = (drivein.ft || 0) - dt;
        if (drivein.ft <= 0) { drivein.ft = night ? 0.1 : 5; drawFilm(drivein.t, night); }
        drivein.beam.visible = night;
        if (drivein.signMat) drivein.signMat.emissiveIntensity = night ? 1.6 : 0;
      } else if (drivein.signMat) drivein.signMat.emissiveIntensity = night ? 1.6 : 0;
    },
    // every frame; returns a prompt (or '')
    update(dt, { pos, vel, q, yaw, mode, hour, f, busy, seasonName }) {
      season = seasonName || season;
      const night = hour < 5.5 || hour > 20, speed = Math.hypot(vel.x, vel.z);
      let prompt = '';
      // weekly ghost: play and record while the trial clock runs
      if (ttRun) {
        const a = missions.active;
        if (!a || a.def.id !== 'weekly-tt') { ghosts.stop(); ttRun = null; }
        else if (a.running) { if (!ttRun.started) { ttRun.started = true; ghosts.start(ttRun.id); } ghosts.record(a.t, { pos, q }); ghosts.play(ttRun.id, a.t); }
        else ghosts.hide();
      }
      // weekly drift: watch for banked chains
      if (drift) { const tot = drift.state.total; if (tot > lastTotal) { const sc = tot - lastTotal; if (sc > W.drift) { W.drift = sc; saveSettings(); } if (sc >= weekly.driftTarget && !W.paid.drift) { W.paid.drift = true; saveSettings(); econ.earn(1200, `Weekly drift target ${weekly.driftTarget.toLocaleString('en-US')}`); } } lastTotal = tot; }
      // hitchhikers
      if (hitch) {
        hitch.t += dt; const d = Math.hypot(pos.x - hitch.x, pos.z - hitch.z);
        hitch.p.userData.arm.rotation.x = Math.sin(hitch.t * 3) * 0.25;
        if (d > 600 || hitch.t > 240) { group.remove(hitch.p); hitch = null; }
        else if (d < 10 && mode === 'car' && !busy) {
          if (speed > 2) prompt = `Hitchhiker · stop to pick up ${hitch.name}`;
          else { prompt = `F · pick up ${hitch.name}`; if (f) { pickUp(pos, yaw); prompt = ''; } }
        }
      } else if (!ride && mode === 'car' && !busy && speed > 6) {
        hitchCd -= dt; if (hitchCd <= 0) { hitchCd = 20; if (Math.random() < 0.35 && spawnHitch(pos, vel)) hitchCd = 120 + Math.random() * 120; }
      }
      if (ride) {
        ride.t += dt; ride.chat -= dt; ride.warn -= dt;
        if (speed > 42 && ride.warn <= 0) { ride.scared++; ride.warn = 8; toast(`${ride.name}: "${['Whoa, easy!', 'Can we slow down a bit?', 'I\'d like to arrive alive…', 'MY LIFE IS FLASHING BEFORE MY EYES'][Math.min(3, ride.scared - 1)]}"`); }
        else if (ride.chat <= 0) { ride.chat = 30 + Math.random() * 20; toast(`${ride.name}: "${CHAT[Math.floor(Math.random() * CHAT.length)]}"`); }
        if (!missions.active || missions.active.def.id !== 'hitch') ride = null;
      }
      api.scenery(dt, pos, hour);
      const near = (o, r) => Math.hypot(pos.x - o.x, pos.z - o.z) < r;
      if (xmas.visible) {
        if (!prompt && near(FESTIVAL, 34) && mode === 'car' && speed < 1 && !busy) { prompt = 'Christmas market · F for a mulled cider ($4)'; if (f) { if (econ.spend(4)) { toast('Mulled cider: warm hands, happy heart'); stats && stats.event('xmas'); } else toast('Mulled cider is $4'); } }
      }
      { const D = DRIVEIN, dd = Math.hypot(pos.x - D.x, pos.z - D.z);
        if (dd < 32 && night && mode === 'car' && speed < 0.5) {
          drivein.still += dt;
          if (drivein.still > 4 && !drivein.seen) { drivein.seen = true; toast(`Now showing at the Starlight: "${FILMS[Math.floor(Date.now() / 864e5) % FILMS.length]}"`); stats && stats.event('drivein'); }
        } else drivein.still = 0;
        if (!night) drivein.seen = false;
      }
      return prompt;
    },
  };
  return api;
}

// rally pay bonus in autumn
export const rallyBonus = () => (SEASON_U.uAutumn.value > 0.5 ? 1.5 : 1);
