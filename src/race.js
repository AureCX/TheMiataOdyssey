// Red Mesa Raceway: kerbs, Armco, grandstand with a crowd, start gantry with lights, grid boxes and pit wall, plus
// 3-lap races against five AI drivers. The AI follow the circuit on a speed profile built from its curvature (each
// driver with their own pace), weave out to pass, and are solid to the touch. Countdown, laps, positions and prize money.
import * as THREE from 'three';
import { RBox } from './shapes.js';
import { TRACK, groundHeight } from './world.js';
import { addCollider } from './scenery.js';
import { createTrafficCar } from './car.js';

const PRIZES = [3000, 1800, 1000, 400, 300, 200];
const DRIVERS = [['Ruby Rossi', 0xe23b2e, 1.03], ['K. Nakamura', 0x1f4fb4, 1.0], ['Lena Brandt', 0x2f8f4a, 0.97], ['Jules Moreau', 0xe8b923, 0.95], ['Sam Okafor', 0x7a3f8f, 0.92]];

export function createRace({ scene, toast, onReward, ghosts }) {
  const R = TRACK.road, H = TRACK.h, n = R.n, L = R.length;
  const group = new THREE.Group(); scene.add(group);
  const START = (() => { let b = 0, bd = 1e9; for (let i = 0; i < n; i++) { const d = Math.hypot(R.pts[i][0] - (TRACK.x - 60), R.pts[i][1] - (TRACK.z - 105)); if (d < bd) { bd = d; b = i; } } return b; })();
  const S = (i) => R.s[((i % n) + n) % n];
  // curvature → AI speed profile
  const curv = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = R.pts[(i - 4 + n) % n], b = R.pts[i], c = R.pts[(i + 4) % n]; const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1]); const ar = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2; curv[i] = ar > 1e-6 ? 4 * ar / (ab * bc * ca) : 0; }
  const profile = (grip, top) => {
    const v = new Float32Array(n);
    for (let i = 0; i < n; i++) v[i] = Math.min(top, Math.sqrt(grip / Math.max(1e-4, curv[i])));
    for (let pass = 0; pass < 3; pass++) for (let k = 2 * n; k >= 0; k--) { const i = k % n, j = (i + 1) % n, ds = 3; v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * 8.5 * ds)); }
    for (let pass = 0; pass < 2; pass++) for (let k = 0; k <= 2 * n; k++) { const i = k % n, j = (i + 1) % n, ds = 3; v[j] = Math.min(v[j], Math.sqrt(v[i] * v[i] + 2 * Math.max(1.2, 5 - v[i] * 0.09) * ds)); }
    return v;
  };

  // ---------------------------------------------------------------- scenery
  {
    // kerbs on the corners: red/white blocks along both edges where the track bends
    const P = [], C = [], I = [];
    const red = new THREE.Color(0xd8211c), white = new THREE.Color(0xf2f2ee);
    for (let i = 0; i < n; i++) {
      const k = Math.max(curv[(i - 2 + n) % n], curv[i], curv[(i + 2) % n]);
      if (k < 1 / 90) continue;
      const j = (i + 1) % n;
      for (const side of [1, -1]) {
        const base = P.length / 3, col = (Math.floor(i / 1) % 2) ? red : white;
        for (const [q, w] of [[i, R.hw - 0.2], [i, R.hw + 1.1], [j, R.hw + 1.1], [j, R.hw - 0.2]]) {
          const vx = -R.tz[q] * side, vz = R.tx[q] * side;
          P.push(R.pts[q][0] + vx * w, H + 0.06, R.pts[q][1] + vz * w); C.push(col.r, col.g, col.b);
        }
        I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); g.computeVertexNormals();
    const nr = g.attributes.normal; for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 1, 0);
    group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 })));
  }
  {
    // Armco both sides, 7 m off the edge, with a gap by the paddock for the way in
    const posts = [], rails = [];
    const pit = TRACK.pit;
    const nearPit = (x, z) => { for (let k = 0; k < pit.n; k += 2) if (Math.hypot(pit.pts[k][0] - x, pit.pts[k][1] - z) < pit.hw + 4) return true; return false; };
    for (let i = 0; i < n; i += 1) for (const side of [1, -1]) {
      const vx = -R.tz[i] * side, vz = R.tx[i] * side, off = R.hw + 7;
      const x = R.pts[i][0] + vx * off, z = R.pts[i][1] + vz * off;
      if (z < TRACK.z - 100 && x > TRACK.x - 255 && x < TRACK.x + 240) continue;   // pit straight: the pit wall is there instead
      if (nearPit(x, z)) continue;
      // skip barrier pieces that would land on the track itself (tight hairpins)
      let clash = false; for (let k = 0; k < n; k += 4) if (Math.hypot(R.pts[k][0] - x, R.pts[k][1] - z) < R.hw + 3) { clash = true; break; }
      if (clash) continue;
      if (i % 2 === 0) posts.push([x, z]);
      rails.push([x, z, Math.atan2(R.tx[i], R.tz[i])]);
      if (i % 2 === 0) addCollider(x, z, 0.7, H + 1.0);
    }
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.35, metalness: 0.8 });
    const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), steel, posts.length);
    posts.forEach(([x, z], i) => { M.makeTranslation(x, H + 0.4, z); pm.setMatrixAt(i, M); }); group.add(pm);
    const rm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.32, 3.1), steel, rails.length);
    rails.forEach(([x, z, yaw], i) => { M.compose(p.set(x, H + 0.62, z), q.setFromAxisAngle(up, yaw), s); rm.setMatrixAt(i, M); }); rm.castShadow = true; group.add(rm);
  }
  // start/finish: chequered line, grid boxes, gantry with five start lights, grandstand, pit wall
  const sx = R.pts[START][0], sz = R.pts[START][1], tx = R.tx[START], tz = R.tz[START], vx = -tz, vz = tx, yaw = Math.atan2(tx, tz);
  const chk = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 16; const g = c.getContext('2d'); for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4'; g.fillRect(i * 8, j * 8, 8, 8); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t; })();
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(R.width, 1.6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: chk, polygonOffset: true, polygonOffsetFactor: -4 })); m.position.set(sx, H + 0.07, sz); m.rotation.y = yaw; group.add(m); }
  const gridPos = [];
  for (let k = 0; k < 6; k++) {
    const back = 8 + k * 7, lat = (k % 2 ? -1 : 1) * 2.8;
    const x = sx - tx * back + vx * lat, z = sz - tz * back + vz * lat;
    gridPos.push({ x, z, yaw });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.25).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, polygonOffset: true, polygonOffsetFactor: -4 }));
    m.position.set(x + tx * 2.2, H + 0.07, z + tz * 2.2); m.rotation.y = yaw; group.add(m);
  }
  const lightMats = [];
  {
    const steel = new THREE.MeshStandardMaterial({ color: 0x3a3e44, metalness: 0.6, roughness: 0.4 });
    const g = new THREE.Group(); g.position.set(sx, H, sz); g.rotation.y = yaw; group.add(g);   // local x across the track
    for (const s of [1, -1]) { const p = new THREE.Mesh(new RBox(0.5, 7.5, 0.5), steel); p.position.set(s * (R.hw + 2), 3.75, 0); g.add(p); addCollider(sx + vx * s * (R.hw + 2), sz + vz * s * (R.hw + 2), 0.5, H + 7.5); }
    const beam = new THREE.Mesh(new RBox(R.width + 4.5, 1.2, 0.6), steel); beam.position.y = 7.2; g.add(beam);
    const sign = (() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#1f4fb4'; x.fillRect(0, 0, 1024, 128); x.fillStyle = '#fff'; x.font = '700 92px "Barlow Condensed", Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('RED MESA RACEWAY', 512, 68); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    for (const zz of [-0.31, 0.31]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(R.width + 4, 1.1), new THREE.MeshStandardMaterial({ map: sign })); p.position.set(0, 7.95 + 0.6, zz); if (zz > 0) p.rotation.y = Math.PI; g.add(p); }
    const housing = new THREE.Mesh(new RBox(5.5, 0.9, 0.5), new THREE.MeshStandardMaterial({ color: 0x111111 })); housing.position.set(0, 6.1, -0.1); g.add(housing);
    for (let k = 0; k < 5; k++) { const m = new THREE.MeshBasicMaterial({ color: 0x220000 }); lightMats.push(m); const l = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), m); l.position.set(-2.2 + k * 1.1, 6.1, -0.36); l.rotation.y = Math.PI; g.add(l); }
  }
  {
    // grandstand on the infield side of the main straight, facing the pits across the track
    const ox = sx + vx * (R.hw + 10) + tx * 30, oz = sz + vz * (R.hw + 10) + tz * 30;
    const g = new THREE.Group(); g.position.set(ox, H, oz); g.rotation.y = Math.atan2(-tz, tx); group.add(g);   // local x along the track, +z away from it
    const conc = new THREE.MeshStandardMaterial({ color: 0xbdb8ad, roughness: 0.85 }), roof = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5, metalness: 0.3 });
    for (let k = 0; k < 8; k++) { const st = new THREE.Mesh(new RBox(70, 0.8 * (k + 1), 1.6), conc); st.position.set(0, 0.4 * (k + 1), k * 1.6); st.castShadow = st.receiveShadow = true; g.add(st); }
    const back = new THREE.Mesh(new RBox(70, 10, 0.5), conc); back.position.set(0, 5, 13); g.add(back);
    for (const sx2 of [-35, 35]) { const side = new THREE.Mesh(new RBox(0.5, 10, 13.5), conc); side.position.set(sx2, 5, 6.5); g.add(side); }
    const top = new THREE.Mesh(new RBox(72, 0.4, 15), roof); top.position.set(0, 10.6, 6); top.castShadow = true; g.add(top);
    const banner = (() => { const c = document.createElement('canvas'); c.width = 2048; c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#c8102e'; x.fillRect(0, 0, 2048, 128); x.fillStyle = '#fff'; x.font = '700 90px "Barlow Condensed", Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('RED MESA RACEWAY  ·  MAIN GRANDSTAND', 1024, 68); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(72, 1.6), new THREE.MeshStandardMaterial({ map: banner })); ban.position.set(0, 10.0, -1.05); ban.rotation.y = Math.PI; g.add(ban);
    const fans = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.9, 0.35), new THREE.MeshStandardMaterial({ roughness: 0.8 }), 8 * 60);
    const M = new THREE.Matrix4(), col = new THREE.Color(); let c = 0;
    for (let k = 0; k < 8; k++) for (let i = 0; i < 60; i++) { if (Math.random() < 0.25) continue; M.makeTranslation(-34 + i * 1.15 + Math.random() * 0.3, 0.8 * (k + 1) + 0.45, k * 1.6 + 0.2); fans.setMatrixAt(c, M); fans.setColorAt(c, col.setHSL(Math.random(), 0.6, 0.5)); c++; }
    fans.count = c; g.add(fans);
    g.updateMatrixWorld(true);
    for (let x = -34; x <= 34; x += 6) { const p = new THREE.Vector3(x, 0, 6).applyMatrix4(g.matrixWorld); addCollider(p.x, p.z, 4.5, H + 10.8); }
  }
  {
    // pit wall between the main straight and the pit lane, pit boxes behind the lane, paddock and apron surfaces
    const T = TRACK, wallZ = T.z - 114.8, x0 = T.x - 200, x1 = T.x + 175;
    const wall = new THREE.Mesh(new RBox(x1 - x0, 1.1, 0.6), new THREE.MeshStandardMaterial({ color: 0xe8e6e0 }));
    wall.position.set((x0 + x1) / 2, H + 0.55, wallZ); wall.castShadow = true; group.add(wall);
    const stripe = new THREE.Mesh(new RBox(x1 - x0, 0.25, 0.62), new THREE.MeshStandardMaterial({ color: 0xc8102e })); stripe.position.set((x0 + x1) / 2, H + 0.95, wallZ); group.add(stripe);
    for (let x = x0; x <= x1; x += 1.5) addCollider(x, wallZ, 0.35, H + 1.1);
    const concrete = new THREE.MeshStandardMaterial({ color: 0x8d8b86, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 }); concrete.userData.road = true;
    const pd = T.paddock;
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(pd.hl * 2, pd.hw * 2).rotateX(-Math.PI / 2), concrete); pad.position.set(pd.cx, H + 0.035, pd.cz); pad.receiveShadow = true; group.add(pad);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(344, 8.4).rotateX(-Math.PI / 2), concrete); apron.position.set(T.x - 10, H + 0.035, T.z - 131); apron.receiveShadow = true; group.add(apron);
    // pit boxes: a long building with roller doors facing the pit lane; the tuning garage takes one slot
    const wallM = new THREE.MeshStandardMaterial({ color: 0xe9e7e2, roughness: 0.8 }), doorM = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6 }), roofM = new THREE.MeshStandardMaterial({ color: 0x3b3f45, metalness: 0.4, roughness: 0.5 });
    const gapA = T.x - 129, gapB = T.x - 111, bz0 = T.z - 134, bz1 = T.z - 145;
    const block = (a, b) => {
      const w = b - a; if (w < 4) return;
      const m = new THREE.Mesh(new RBox(w, 6, bz0 - bz1), wallM); m.position.set((a + b) / 2, H + 3, (bz0 + bz1) / 2); m.castShadow = m.receiveShadow = true; group.add(m);
      const r = new THREE.Mesh(new RBox(w, 0.4, bz0 - bz1 + 1.2), roofM); r.position.set((a + b) / 2, H + 6.2, (bz0 + bz1) / 2 + 0.6); group.add(r);
      for (let x = a + 1; x + 9 <= b; x += 10.5) { const d = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 4.4), doorM); d.position.set(x + 4.25, H + 2.2, bz0 + 0.02); group.add(d); }
      for (let x = a + 2; x < b; x += 5) addCollider(x, (bz0 + bz1) / 2, 4.5, H + 6.4);
    };
    block(T.x - 185, gapA); block(gapB, T.x + 48); block(T.x + 72, T.x + 160);   // a passage at the infield bridge
    const pitSign = (() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#16181c'; x.fillRect(0, 0, 1024, 128); x.fillStyle = '#fff'; x.font = '700 84px "Barlow Condensed", Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('PIT LANE  ·  60 KM/H', 512, 68); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const ps = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.75), new THREE.MeshStandardMaterial({ map: pitSign })); ps.position.set(T.x + 40, H + 7.4, bz0 + 0.05); group.add(ps);
  }

  // ---------------------------------------------------------------- AI drivers
  const ai = DRIVERS.map(([name, color, pace], k) => {
    const m = createTrafficCar(color, 0); m.visible = false; group.add(m);
    const num = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill(); g.fillStyle = '#111'; g.font = '700 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(k + 2), 32, 34); const t = new THREE.CanvasTexture(c); return t; })();
    for (const s of [1, -1]) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), new THREE.MeshBasicMaterial({ map: num })); d.position.set(s * 0.87, 0.65, 0); d.rotation.y = s * Math.PI / 2; m.add(d); }
    return { name, m, pace, v: 0, s: 0, lap: 0, lat: 0, latT: 0, prof: profile(8.6 * pace, 44 * pace), imp: { x: 0, z: 0 }, col: [{ x: 0, z: 0, r: 1.0 }, { x: 0, z: 0, r: 1.0 }], done: false, finishT: 0 };
  });
  for (const a of ai) for (const c of a.col) c.owner = a;

  // nearest track index to a point, searching near a hint
  const nearest = (x, z, hint) => {
    let b = hint, bd = 1e18;
    for (let k = -40; k <= 40; k++) { const i = ((hint + k) % n + n) % n, d = (R.pts[i][0] - x) ** 2 + (R.pts[i][1] - z) ** 2; if (d < bd) { bd = d; b = i; } }
    if (bd > 900) for (let i = 0; i < n; i++) { const d = (R.pts[i][0] - x) ** 2 + (R.pts[i][1] - z) ** 2; if (d < bd) { bd = d; b = i; } }
    return b;
  };
  const sample = (s, out) => {
    s = ((s % L) + L) % L;
    let lo = 0, hi = n - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (R.s[mid] <= s) lo = mid; else hi = mid - 1; }
    const i = lo, j = (i + 1) % n, seg = (j ? R.s[j] : L) - R.s[i], t = seg > 0 ? (s - R.s[i]) / seg : 0;
    out.x = R.pts[i][0] + (R.pts[j][0] - R.pts[i][0]) * t; out.z = R.pts[i][1] + (R.pts[j][1] - R.pts[i][1]) * t;
    out.tx = R.tx[i]; out.tz = R.tz[i]; out.i = i; return out;
  };
  const tmp = {};

  let state = null;   // { phase: 'countdown'|'race'|'done', t, laps, player: {...}, results }
  const api = {
    get active() { return !!state; },
    get frozen() { return state && state.phase === 'countdown'; },
    gridSlot() { return gridPos[3]; },
    start(veh) {
      const LAPS = 3;
      // AI on slots 0,1,2,4,5; the player starts 4th
      const slots = [0, 1, 2, 4, 5];
      ai.forEach((a, k) => {
        // on the grid, just behind the line: the first crossing starts lap 1
        a.s = R.s[START] - (8 + slots[k] * 7); a.lat = (slots[k] % 2 ? -1 : 1) * 2.8; a.latT = a.lat; a.v = 0; a.lap = -1; a.done = false; a.m.visible = true;
      });
      const g = gridPos[3];
      veh.reset(g.x, H + 0.8, g.z, g.yaw);
      state = { phase: 'countdown', t: 0, laps: LAPS, player: { idx: nearest(g.x, g.z, START), lap: 0, lapStart: 0, best: null, armed: false, done: false, progress: 0 }, finished: [] };
      for (const m of lightMats) m.color.setRGB(0.15, 0, 0);
      toast(`${TRACK.name} · ${LAPS} laps · wait for the lights`);
    },
    // time trial: you alone, flying laps, your best lap saved and raced as a ghost
    startTrial(veh) {
      for (const a of ai) a.m.visible = false;
      const g = gridPos[0];
      veh.reset(g.x, H + 0.8, g.z, g.yaw);
      state = { phase: 'race', trial: true, t: 0, laps: Infinity, player: { idx: nearest(g.x, g.z, START), lap: 0, lapStart: 0, best: ghosts ? ghosts.best('raceway') : null, armed: true, done: false, progress: 0, timing: false }, finished: [] };
      toast(`${TRACK.name} time trial · cross the line to start the clock${ghosts && ghosts.best('raceway') ? ` · ghost ${ghosts.best('raceway').toFixed(2)} s` : ''}`);
    },
    cancel() { if (!state) return; if (ghosts) ghosts.stop(); state = null; for (const a of ai) a.m.visible = false; for (const m of lightMats) m.color.setRGB(0.15, 0, 0); toast('Race abandoned'); },
    near(player, out) { if (!state) return out; for (const a of ai) for (const c of a.col) if (Math.hypot(c.x - player.x, c.z - player.z) < 30) out.push(c); return out; },
    update(dt, veh) {
      if (!state) return null;
      state.t += dt;
      const P = state.player;
      if (state.phase === 'countdown') {
        const k = Math.floor(state.t);   // one red light per second, then all out = go
        for (let i = 0; i < 5; i++) lightMats[i].color.setRGB(i < k ? 3 : 0.15, 0, 0);
        if (state.t > 5.6 + Math.random() * 0.02) { state.phase = 'race'; state.t = 0; P.lapStart = 0; for (const m of lightMats) m.color.setRGB(0.1, 0, 0); toast('GO!'); }
      }
      const racing = state.phase === 'race';
      // player progress: laps count when crossing the line after passing the far side of the lap
      const pi = nearest(veh.pos.x, veh.pos.z, P.idx), prev = P.idx; P.idx = pi;
      const fromStart = (S(pi) - S(START) + L) % L;
      if (fromStart > L * 0.45 && fromStart < L * 0.6) P.armed = true;
      if (state.trial) {
        const crossed = ((S(prev) - S(START) + L) % L) > L * 0.9 && fromStart < L * 0.1;
        if (crossed && !P.timing) { P.timing = true; P.lapStart = state.t; P.armed = false; ghosts && ghosts.start('raceway'); toast('Clock running'); }
        else if (crossed && P.armed) {
          const lt = state.t - P.lapStart; P.lapStart = state.t; P.armed = false; P.lap++;
          const nb = ghosts ? ghosts.lap(lt) : (P.best == null || lt < P.best);
          if (P.best == null || lt < P.best) P.best = lt;
          toast(`Lap ${lt.toFixed(2)} s${nb ? ' · new best · ghost saved' : ` · best ${P.best.toFixed(2)} s`}`);
          if (nb) onReward && onReward(150, 'Raceway lap record');
        }
        if (P.timing) { const lt = state.t - P.lapStart; ghosts && ghosts.record(lt, veh); ghosts && ghosts.play('raceway', lt); }
        return { phase: 'race', trial: true, lap: P.lap + 1, laps: Infinity, pos: 1, of: 1, time: P.timing ? state.t - P.lapStart : 0, best: P.best, count: 0, done: false };
      }
      if (racing && P.armed && ((S(prev) - S(START) + L) % L) > L * 0.9 && fromStart < L * 0.1) {
        P.armed = false; P.lap++;
        const lt = state.t - P.lapStart; P.lapStart = state.t; if (P.best == null || lt < P.best) P.best = lt;
        if (P.lap >= state.laps && !P.done) { P.done = true; state.finished.push('You'); const pos = state.finished.length; const prize = PRIZES[pos - 1] || 0; toast(`Finished P${pos} · ${pos === 1 ? 'winner!' : ''}`); onReward && onReward(prize, `${TRACK.name} · P${pos}`); }
        else if (!P.done) toast(`Lap ${P.lap + 1}/${state.laps} · ${lt.toFixed(1)} s`);
      }
      P.progress = P.lap * L + (P.armed || fromStart < L * 0.5 ? fromStart : fromStart - L);
      // AI
      for (const a of ai) {
        if (racing && !a.done) {
          sample(a.s, tmp);
          const i = tmp.i, vt = a.prof[(i + 6) % n];
          // knocked by the player: lose some speed and wobble
          if (Math.abs(a.imp.x) + Math.abs(a.imp.z) > 1) { a.v *= 0.75; a.lat += Math.sign(a.imp.x * -tmp.tz + a.imp.z * tmp.tx) * 0.8; a.imp.x = a.imp.z = 0; }
          // the player ahead in my line: pull out to pass
          const dpx = veh.pos.x - tmp.x, dpz = veh.pos.z - tmp.z, along = dpx * tmp.tx + dpz * tmp.tz, lat = dpx * -tmp.tz + dpz * tmp.tx;
          if (along > 0 && along < 18 && Math.abs(lat - a.lat) < 2.4) { a.latT = lat > 0 ? Math.max(-4, lat - 3.4) : Math.min(4, lat + 3.4); if (along < 7) a.v = Math.min(a.v, Math.max(0, Math.hypot(veh.vel.x, veh.vel.z) - 1)); }
          else if (Math.abs(a.latT) > 0.5 && Math.random() < dt * 0.3) a.latT *= 0.5;
          for (const o of ai) if (o !== a) { const ds = ((o.s - a.s) % L + L) % L; if (ds > 0 && ds < 10 && Math.abs(o.lat - a.lat) < 2.2) { a.v = Math.min(a.v, o.v); a.latT = o.lat > 0 ? o.lat - 3 : o.lat + 3; } }
          a.lat += Math.max(-dt * 2, Math.min(dt * 2, a.latT - a.lat)); a.lat = Math.max(-R.hw + 1.4, Math.min(R.hw - 1.4, a.lat));
          a.v += Math.max(-9 * dt, Math.min(Math.max(1.2, 5.5 - a.v * 0.1) * dt * a.pace, vt - a.v));
          const before = (a.s - S(START) + 10 * L) % L;
          a.s += a.v * dt;
          const after = (a.s - S(START) + 10 * L) % L;
          if (after < before) { a.lap++; if (a.lap >= state.laps) { a.done = true; state.finished.push(a.name); } }
        }
        sample(a.s, tmp);
        const x = tmp.x - tmp.tz * a.lat, z = tmp.z + tmp.tx * a.lat;
        a.m.position.set(x, groundHeight(x, z) + 0.02, z); a.m.rotation.y = Math.atan2(tmp.tx, tmp.tz);
        a.col[0].x = x + tmp.tx * 1.1; a.col[0].z = z + tmp.tz * 1.1; a.col[1].x = x - tmp.tx * 1.1; a.col[1].z = z - tmp.tz * 1.1;
        a.progress = a.lap * L + ((a.s - S(START)) % L + L) % L;
      }
      // positions
      const order = [{ name: 'You', p: P.done ? 1e9 - state.finished.indexOf('You') : P.progress }, ...ai.map((a) => ({ name: a.name, p: a.done ? 1e9 - state.finished.indexOf(a.name) : a.progress }))].sort((x, y) => y.p - x.p);
      const pos = order.findIndex((o) => o.name === 'You') + 1;
      if (P.done && (state.finished.length >= 6 || state.t - P.lapStart > 30)) { const res = state.finished.slice(0, 3).join(', '); toast(`Podium: ${res}`); state = null; for (const a of ai) a.m.visible = false; return null; }
      return { phase: state.phase, lap: Math.min(state.laps, P.lap + 1), laps: state.laps, pos, of: 6, time: state.phase === 'race' ? state.t - P.lapStart : 0, best: P.best, count: state.phase === 'countdown' ? Math.max(0, 5 - Math.floor(state.t)) : 0, done: P.done };
    },
  };
  return api;
}
