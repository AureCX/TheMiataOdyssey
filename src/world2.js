// The wider world: the railway (rails and sleepers on the ballast, four stations with platforms and shelters, and a
// passenger train that runs the loop and stops at each), Port Ruby harbour (quay, cranes, containers, a breakwater, a
// moored freighter and ships sailing offshore) and Silverpine Peaks (chalet, a chairlift with moving chairs, top station).
import * as THREE from 'three';
import { RBox } from './shapes.js';
import { RAIL, HARBOUR, SKI, WESTBAY, GULLPIER, terrainHeight, groundHeight, addRoof } from './world.js';
import { addCollider } from './scenery.js';
import { createTrafficCar } from './car.js';

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
function signTex(text, bg = '#1f4fb4', fg = '#fff', w = 1024, h = 160) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = `700 ${h * 0.62}px "Barlow Condensed", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h * 0.54);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildWorld2(scene) {
  const group = new THREE.Group(); scene.add(group);
  const R = RAIL.road, n = R.n, L = R.length;
  const at = (s, out) => {
    s = ((s % L) + L) % L; let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (R.s[m] <= s) lo = m; else hi = m - 1; }
    const i = lo, j = (i + 1) % n, seg = (j ? R.s[j] : L) - R.s[i], t = seg > 0 ? (s - R.s[i]) / seg : 0;
    out.x = R.pts[i][0] + (R.pts[j][0] - R.pts[i][0]) * t; out.z = R.pts[i][1] + (R.pts[j][1] - R.pts[i][1]) * t; out.y = R.h[i] + (R.h[j] - R.h[i]) * t;
    out.tx = R.tx[i]; out.tz = R.tz[i]; return out;
  };

  // ---------------------------------------------------------------- railway: rails and sleepers
  {
    const steel = mat(0x8a8d90, { metalness: 0.8, roughness: 0.35 }), wood = mat(0x4a3b2c, { roughness: 0.9 });
    const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 0.16, 0.3), wood, Math.ceil(L / 0.7));
    const o = {}; let c = 0;
    for (let s = 0; s < L; s += 0.7) { at(s, o); M.compose(P.set(o.x, o.y + 0.11, o.z), Q.setFromAxisAngle(UP, Math.atan2(o.tx, o.tz) + Math.PI / 2), S); sl.setMatrixAt(c++, M); }
    sl.count = c; sl.receiveShadow = true; group.add(sl);
    for (const side of [0.72, -0.72]) {
      const pos = [], idx = [];
      for (let i = 0; i <= n; i++) {
        const k = i % n, x = R.pts[k][0] - R.tz[k] * side, z = R.pts[k][1] + R.tx[k] * side, y = R.h[k] + 0.2;
        const vx = -R.tz[k] * 0.04, vz = R.tx[k] * 0.04;
        pos.push(x - vx, y + 0.08, z - vz, x + vx, y + 0.08, z + vz, x + vx, y, z + vz, x - vx, y, z - vz);
        if (i) { const b = (i - 1) * 4, a = i * 4; idx.push(b, a, b + 1, b + 1, a, a + 1, b + 1, a + 1, b + 2, b + 2, a + 1, a + 2, b + 3, a, b, b + 3, a + 3, a); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      group.add(new THREE.Mesh(g, steel));
    }
  }
  // stations: platform, shelter, name board
  const stopS = [];
  for (const st of RAIL.stations) {
    const i = st.i, [x, z] = R.pts[i], h = R.h[i], tx = R.tx[i], tz = R.tz[i], yaw = Math.atan2(tx, tz);
    const g = new THREE.Group(); g.position.set(x, h, z); g.rotation.y = yaw; group.add(g);   // local z along the line
    const conc = mat(0xbdb9b0), roof = mat(0x2f5a3a), white = mat(0xf2efe8);
    for (const side of [1, -1]) {
      const pf = new THREE.Mesh(new RBox(3.4, 1.0, 70), conc); pf.position.set(side * 4.0, 0.5, 0); pf.receiveShadow = true; g.add(pf);
      const edge = new THREE.Mesh(new RBox(0.3, 0.02, 70), mat(0xe8c21a)); edge.position.set(side * 2.5, 1.01, 0); g.add(edge);
    }
    const sh = new THREE.Mesh(new RBox(2.2, 2.6, 10), white); sh.position.set(5.0, 2.3, 0); sh.castShadow = true; g.add(sh);
    const rf = new THREE.Mesh(new RBox(3.6, 0.2, 12), roof); rf.position.set(4.4, 3.7, 0); g.add(rf);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.1), new THREE.MeshStandardMaterial({ map: signTex(st.name.toUpperCase(), '#1f3a6b') }));
    board.position.set(3.0, 3.2, 12); g.add(board); const b2 = board.clone(); b2.rotation.y = Math.PI; b2.position.z = -12; g.add(b2);
    for (const zz of [-12, 12]) { const p = new THREE.Mesh(new RBox(0.12, 3.2, 0.12), mat(0x333333)); p.position.set(3.0, 1.6, zz + (zz > 0 ? -0.05 : 0.05)); g.add(p); }
    g.updateMatrixWorld(true);
    for (const zz of [-4, 0, 4]) { const pp = new THREE.Vector3(5, 0, zz).applyMatrix4(g.matrixWorld); addCollider(pp.x, pp.z, 1.3, h + 3.8); }
    // the platforms are solid: a row of collider circles down each one (taller than the platform, so you can't drive
    // through it), and a top you can stand on if you get up there
    for (const side of [1, -1]) {
      for (let zz = -33.3; zz <= 33.3; zz += 2.2) { const pp = new THREE.Vector3(side * 4.0, 0, zz).applyMatrix4(g.matrixWorld); addCollider(pp.x, pp.z, 1.7, h + 1.7); }
      const c = new THREE.Vector3(side * 4.0, 0, 0).applyMatrix4(g.matrixWorld);
      addRoof(c.x, c.z, -tz, tx, 3.4, 70, h + 1.0);
    }
    stopS.push({ s: R.s[i], name: st.name });
  }
  stopS.sort((a, b) => a.s - b.s);

  // ---------------------------------------------------------------- trains
  // three services share the loop: a stopping passenger train (all stations), an express (two stations, faster) and a
  // long freight that runs straight through; each keeps a safe gap to the train ahead (simple block signalling)
  const dark = mat(0x1c1e22), glass = mat(0x22303c, { metalness: 0.6, roughness: 0.1 });
  const hl = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d0, emissiveIntensity: 1 });
  const body = (g, len, m, h = 3.2) => { const b = new THREE.Mesh(new RBox(3.0, h, len), m); b.position.y = 0.7 + h / 2; b.castShadow = true; g.add(b); const r = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, len, 16, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1, 0.25, 1), m); r.position.y = 0.7 + h; g.add(r); const u = new THREE.Mesh(new RBox(2.6, 0.7, len - 2), dark); u.position.y = 0.55; g.add(u); return b; };
  const locomotive = (color, stripeC, sleek) => {
    const loco = new THREE.Group();
    body(loco, 17, mat(color, { metalness: 0.3, roughness: 0.45 }));
    const nose = new THREE.Mesh(sleek ? new THREE.CylinderGeometry(1.5, 1.5, 3.2, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 1, 1.4) : new THREE.BoxGeometry(3.0, 1.6, 0.6), mat(sleek ? color : stripeC));
    nose.position.set(0, sleek ? 2.3 : 1.6, sleek ? 8.5 : 8.6); loco.add(nose);
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.0), glass); ws.position.set(0, 3.0, sleek ? 9.6 : 8.52); if (sleek) ws.rotation.x = -0.5; loco.add(ws);
    for (const sd of [1, -1]) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), hl); l.position.set(sd * 0.9, 1.5, sleek ? 9.9 : 8.92); loco.add(l); }
    const stripe = new THREE.Mesh(new RBox(3.04, 0.3, 17.04), mat(stripeC)); stripe.position.y = 1.4; loco.add(stripe);
    group.add(loco); return { g: loco, len: 17 };
  };
  const coach = (color, bandC, len = 19) => {
    const c = new THREE.Group(); body(c, len, mat(color, { roughness: 0.5 }));
    const band = new THREE.Mesh(new RBox(3.04, 0.9, len - 1), mat(bandC)); band.position.y = 2.6; c.add(band);
    const winM = new THREE.MeshStandardMaterial({ color: 0x24313c, roughness: 0.1, metalness: 0.5, emissive: 0xffd9a0, emissiveIntensity: 0 });
    for (const sd of [1, -1]) for (let w = -len / 2 + 2; w <= len / 2 - 2; w += 1.9) { const win = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.7), winM); win.position.set(sd * 1.53, 2.65, w); win.rotation.y = sd * Math.PI / 2; c.add(win); }
    c.userData.win = winM; group.add(c); return { g: c, len };
  };
  const CONT = [0xb5121b, 0x1f4fb4, 0x2f7a3a, 0xe5641c, 0x8a8f96, 0xe8b923];
  const wagon = (k) => {
    const w = new THREE.Group(), len = 15;
    const deck = new THREE.Mesh(new RBox(2.8, 0.4, len), dark); deck.position.y = 1.0; w.add(deck);
    const u = new THREE.Mesh(new RBox(2.4, 0.7, len - 2), dark); u.position.y = 0.55; w.add(u);
    if (k % 3 === 2) { const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, len - 1.5, 16).rotateX(Math.PI / 2), mat(0xd9dadb, { metalness: 0.5, roughness: 0.35 })); tank.position.y = 2.65; tank.castShadow = true; w.add(tank); }
    else for (const zz of [-3.6, 3.6]) { const cn = new THREE.Mesh(new RBox(2.5, 2.6, 6.8), mat(CONT[(k * 2 + (zz > 0 ? 1 : 0)) % CONT.length], { roughness: 0.6 })); cn.position.set(0, 2.5, zz); cn.castShadow = true; w.add(cn); }
    group.add(w); return { g: w, len };
  };
  // car carrier: a low flat wagon with wheel chocks and side rails; the player's car rides on its deck
  const flatcar = () => {
    const w = new THREE.Group(), len = 15;
    const deck = new THREE.Mesh(new RBox(2.9, 0.3, len), mat(0x5a5f66, { metalness: 0.4, roughness: 0.6 })); deck.position.y = 1.05; w.add(deck);
    const u = new THREE.Mesh(new RBox(2.4, 0.7, len - 2), dark); u.position.y = 0.55; w.add(u);
    for (const sd of [1, -1]) { const rail = new THREE.Mesh(new RBox(0.1, 0.5, len - 0.6), mat(0xe8b923)); rail.position.set(sd * 1.42, 1.45, 0); w.add(rail); }
    for (const zz of [-len / 2 + 0.3, len / 2 - 0.3]) { const end = new THREE.Mesh(new RBox(2.9, 0.6, 0.15), mat(0xe8b923)); end.position.set(0, 1.5, zz); w.add(end); }
    group.add(w); return { g: w, len, carrier: true, deckY: 1.2 };
  };
  const trains = [];
  const allStops = stopS.map((x, i) => i);
  const mk = (cars, vmax, stops, startFrac) => {
    const tr = { cars, vmax, stops, s: L * startFrac, v: 0, wait: 3, next: 0, total: cars.reduce((a, c) => a + c.len + 1, 0), carrier: cars.find((c) => c.carrier) || null, manual: null };
    // first stop: the next served station ahead
    let best = Infinity; tr.stops.forEach((si, k) => { const d = ((stopS[si].s - tr.s) % L + L) % L; if (d < best) { best = d; tr.next = k; } });
    trains.push(tr); return tr;
  };
  if (stopS.length) {
    mk([locomotive(0xb5121b, 0xf0e9d6), coach(0x2f5a3a, 0xf0e9d6), coach(0x2f5a3a, 0xf0e9d6), coach(0x2f5a3a, 0xf0e9d6), flatcar()], 26, allStops, (stopS[0].s + 30) / L);
    mk([locomotive(0xf2f3f5, 0x1f4fb4, true), coach(0xf2f3f5, 0x1f4fb4, 22), coach(0xf2f3f5, 0x1f4fb4, 22), coach(0xf2f3f5, 0x1f4fb4, 22), coach(0xf2f3f5, 0x1f4fb4, 22)], 38, [0, Math.min(2, stopS.length - 1)], 0.36);
    mk([locomotive(0x1f4fb4, 0xe8b923), locomotive(0x1f4fb4, 0xe8b923), ...Array.from({ length: 9 }, (_, k) => wagon(k)), flatcar()], 20, [], 0.7);
  }
  const col = [];


  // ---------------------------------------------------------------- Port Ruby harbour
  const ships = [];
  {
    const H = HARBOUR, conc = mat(0x9c988f), rock = mat(0x6b665e, { flatShading: true });
    const quay = new THREE.Mesh(new RBox(H.hl * 2, H.top + 8, H.hw * 2), conc); quay.position.set(H.cx, (H.top - 8) / 2, H.cz); quay.receiveShadow = true; group.add(quay);
    const edgeM = mat(0xe8c21a); const edge = new THREE.Mesh(new RBox(H.hl * 2, 0.05, 0.3), edgeM); edge.position.set(H.cx, H.top + 0.03, H.cz + H.hw - 0.6); group.add(edge);
    // bollards, containers, two gantry cranes
    for (let x = H.cx - H.hl + 4; x < H.cx + H.hl; x += 8) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.6, 10), mat(0x222222)); b.position.set(x, H.top + 0.3, H.cz + H.hw - 1); group.add(b); }
    const cols = [0xb5121b, 0x1f4fb4, 0x2f7a3a, 0xe5641c, 0x8a8f96, 0xe8b923];
    const cont = new THREE.InstancedMesh(new THREE.BoxGeometry(2.5, 2.6, 6.1), mat(0xffffff, { roughness: 0.6 }), 60); let ci = 0;
    const C = new THREE.Color();
    for (let row = 0; row < 3; row++) for (let k = 0; k < 6; k++) for (let lev = 0; lev < 1 + ((row + k) % 3); lev++) {
      if (ci >= 60) break;
      const x = H.cx - H.hl + 10 + k * 3, z = H.cz - H.hw + 5 + row * 6.4;
      M.makeTranslation(x, H.top + 1.3 + lev * 2.6, z); cont.setMatrixAt(ci, M); cont.setColorAt(ci, C.set(cols[(ci * 7) % cols.length])); ci++;
      if (lev === 0) addCollider(x, z, 2.2, H.top + 2.6 * 3);
    }
    cont.count = ci; cont.castShadow = true; group.add(cont);
    const yellow = mat(0xe8b923, { metalness: 0.4, roughness: 0.5 });
    for (const cx of [H.cx + 5, H.cx + 25]) {
      const g = new THREE.Group(); g.position.set(cx, H.top, H.cz + 2); group.add(g);
      for (const [lx, lz] of [[-5, -8], [5, -8], [-5, 8], [5, 8]]) { const leg = new THREE.Mesh(new RBox(0.7, 26, 0.7), yellow); leg.position.set(lx, 13, lz); leg.castShadow = true; g.add(leg); }
      const beam = new THREE.Mesh(new RBox(1.4, 1.6, 46), yellow); beam.position.set(0, 26, 10); beam.castShadow = true; g.add(beam);
      for (const lx of [-5, 5]) { const top = new THREE.Mesh(new RBox(0.6, 1.2, 18), yellow); top.position.set(lx, 25.4, 0); g.add(top); }
      const cab = new THREE.Mesh(new RBox(2.4, 2.2, 2.6), mat(0xeeeeee)); cab.position.set(0, 24, 4); g.add(cab);
      for (const [lx, lz] of [[-5, -8], [5, -8], [-5, 8], [5, 8]]) addCollider(cx + lx, H.cz + 2 + lz, 0.6, H.top + 27);
    }
    // breakwater
    const bw = []; for (let a = 0; a <= 1; a += 0.02) { const x = 30 + a * 150, z = 1300 + Math.sin(a * Math.PI) * 55; bw.push([x, z]); }
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(2.4, 0), rock, bw.length * 3); let ri = 0;
    for (const [x, z] of bw) for (let k = 0; k < 3; k++) { M.compose(P.set(x + (k - 1) * 1.8, 0.6 + (k === 1 ? 1.2 : 0), z + (k - 1) * 1.2), Q.setFromEuler(new THREE.Euler(k, k * 2, x)), S.set(1, 0.8, 1)); rocks.setMatrixAt(ri++, M); }
    S.set(1, 1, 1); group.add(rocks);
    for (const [x, z] of bw) addCollider(x, z, 3, 3);
    // ships: a freighter moored at the quay, a freighter and a ferry sailing offshore
    const ship = (len, beam, hullC, deckC, containersOn) => {
      const g = new THREE.Group();
      const shape = new THREE.Shape(); shape.moveTo(-beam / 2, 0); shape.lineTo(beam / 2, 0); shape.lineTo(beam / 2, 6); shape.lineTo(-beam / 2, 6); shape.closePath();
      const hull = new THREE.Mesh(new RBox(beam, 7, len), mat(hullC, { roughness: 0.6 })); hull.position.y = 1.5; g.add(hull);
      const bow = new THREE.Mesh(new THREE.CylinderGeometry(beam / 2, beam / 2, 7, 3, 1).rotateY(Math.PI / 2), mat(hullC, { roughness: 0.6 })); bow.scale.set(1, 1, 1.8); bow.position.set(0, 1.5, len / 2 + beam * 0.2); g.add(bow);
      const deck = new THREE.Mesh(new RBox(beam - 0.4, 0.3, len), mat(deckC)); deck.position.y = 5.1; g.add(deck);
      const bridge = new THREE.Mesh(new RBox(beam - 2, 8, 9), mat(0xf2f2f0)); bridge.position.set(0, 9.2, -len / 2 + 7); bridge.castShadow = true; g.add(bridge);
      const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 5, 14), mat(0xb5121b)); funnel.position.set(0, 14.5, -len / 2 + 4); g.add(funnel);
      const wins = new THREE.Mesh(new RBox(beam - 1.9, 1.2, 9.1), mat(0x22303c, { metalness: 0.5, roughness: 0.1 })); wins.position.set(0, 11.6, -len / 2 + 7); g.add(wins);
      if (containersOn) { const cn = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 2.5, 6), mat(0xffffff, { roughness: 0.6 }), 60); let k = 0; for (let z = -len / 2 + 16; z < len / 2 - 8 && k < 60; z += 6.4) for (let x = -beam / 2 + 1.5; x < beam / 2 - 1.2 && k < 60; x += 2.6) { const lv = 1 + ((k * 5) % 3); for (let l = 0; l < lv && k < 60; l++) { M.makeTranslation(x, 6.5 + l * 2.5, z); cn.setMatrixAt(k, M); cn.setColorAt(k, C.set(cols[(k * 3 + l) % cols.length])); k++; } } cn.count = k; g.add(cn); }
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      group.add(g); return g;
    };
    const moored = ship(70, 13, 0x1f3a6b, 0x8a4a3a, true); moored.position.set(HARBOUR.cx, -1.6, HARBOUR.cz + HARBOUR.hw + 8); moored.rotation.y = Math.PI / 2;
    ships.push({ g: moored, fixed: true, len: 70, beam: 13 });
    const sailing = ship(90, 15, 0x2f2f33, 0x7a3a2a, true), ferry = ship(55, 12, 0xf2f2f0, 0x3a6b8a, false);
    ships.push({ g: sailing, loop: { cx: 520, cz: 1720, rx: 880, rz: 180, w: 0.0075, a: 0 }, len: 90, beam: 15 });
    ships.push({ g: ferry, loop: { cx: 160, cz: 1560, rx: 420, rz: 140, w: -0.014, a: 2 }, len: 55, beam: 12 });
  }

  // ---------------------------------------------------------------- car ferry: Port Ruby <-> West Bay
  let ferryC = null;
  if (WESTBAY.end) {
    const W = WESTBAY, conc = mat(0x9c988f);
    // piers with bollards and a small terminal building
    const pierAt = (Pq, label) => {
      const pier = new THREE.Mesh(new RBox(Pq.hw * 2, Pq.h + 10, Pq.hl * 2), conc); pier.position.set(Pq.cx, (Pq.h - 10) / 2, Pq.cz); pier.rotation.y = Math.atan2(Pq.ux, Pq.uz); pier.receiveShadow = true; group.add(pier);
      for (const sd of [1, -1]) for (let k = -Pq.hl + 4; k < Pq.hl; k += 8) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.6, 10), mat(0x222222)); b.position.set(Pq.cx + Pq.ux * k - Pq.uz * sd * (Pq.hw - 0.6), Pq.h + 0.3, Pq.cz + Pq.uz * k + Pq.ux * sd * (Pq.hw - 0.6)); group.add(b); }
      const tx = Pq.cx - Pq.uz * (Pq.hw + 7) - Pq.ux * 6, tz = Pq.cz + Pq.ux * (Pq.hw + 7) - Pq.uz * 6;
      const term = new THREE.Group(); term.position.set(tx, Math.max(groundHeight(tx, tz), Pq.h - 0.2), tz); term.rotation.y = Math.atan2(Pq.ux, Pq.uz); group.add(term);
      if (term.position.y > groundHeight(tx, tz) + 0.5) { const base = new THREE.Mesh(new RBox(9, term.position.y + 4, 11), conc); base.position.y = -(term.position.y + 4) / 2 - 0.5; term.add(base); }
      const tb = new THREE.Mesh(new RBox(8, 4, 10), mat(0xf2efe8)); tb.position.y = 1.5; tb.castShadow = true; term.add(tb);
      const troof = new THREE.Mesh(new RBox(9, 0.4, 11), mat(0x1f4fb4)); troof.position.y = 3.7; term.add(troof);
      const ts = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.2), new THREE.MeshStandardMaterial({ map: signTex(label, '#1f4fb4') })); ts.position.set(0, 4.6, 0); ts.rotation.y = -Math.PI / 2; term.add(ts); const ts2 = ts.clone(); ts2.rotation.y = Math.PI / 2; term.add(ts2);
      addCollider(term.position.x, term.position.z, 5, term.position.y + 4);
    };
    pierAt(W, 'WEST BAY FERRY');
    const GP = GULLPIER.end ? GULLPIER : null;
    if (GP) pierAt(GP, 'GULL ISLAND FERRY');
    // the route: West Bay → Gull Island → Port Ruby (and back), each leg smoothed with its ends kept on the berths
    const H = HARBOUR;
    const A = { x: W.end.x + W.ux * 30, z: W.end.z + W.uz * 30 }, B = { x: H.cx - H.hl - 30, z: H.cz + 6 };
    const G = GP ? { x: GP.end.x + GP.ux * 28, z: GP.end.z + GP.uz * 28 } : null;
    const legs = G ? [[[A.x, A.z], [A.x + W.ux * 40 + 30, A.z + W.uz * 40 + 25], [-470, 1350], [-455, 1560], [-462, 1680], [G.x, G.z]],
      [[G.x, G.z], [-440, 1640], [-330, 1450], [-250, 1300], [-90, 1268], [B.x - 30, B.z], [B.x, B.z]]]
      : [[[A.x, A.z], [A.x + W.ux * 40 + 30, A.z + W.uz * 40 + 25], [-250, 1240], [-90, 1268], [B.x - 30, B.z], [B.x, B.z]]];
    const pts = [], stopIdx = [0];
    for (const path of legs) {
      const lp = []; for (let k = 0; k < path.length - 1; k++) { const [x0, z0] = path[k], [x1, z1] = path[k + 1], n2 = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 4); for (let q = 0; q < n2; q++) lp.push([x0 + (x1 - x0) * q / n2, z0 + (z1 - z0) * q / n2]); }
      lp.push(path[path.length - 1]);
      for (let it = 0; it < 8; it++) for (let k = 1; k < lp.length - 1; k++) lp[k] = [(lp[k - 1][0] + lp[k][0] * 2 + lp[k + 1][0]) / 4, (lp[k - 1][1] + lp[k][1] * 2 + lp[k + 1][1]) / 4];
      if (pts.length) lp.shift(); pts.push(...lp); stopIdx.push(pts.length - 1);
    }
    const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const PL = cum[cum.length - 1];
    const stopNames = G ? ['West Bay', 'Gull Island', 'Port Ruby'] : ['West Bay', 'Port Ruby'];
    const stops = stopIdx.map((i, k) => ({ name: stopNames[k], d: cum[i] }));
    const along = (d) => { d = Math.max(0, Math.min(PL, d)); let k = 1; while (k < cum.length - 1 && cum[k] < d) k++; const t = (d - cum[k - 1]) / (cum[k] - cum[k - 1] || 1); return { x: pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t, z: pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t, tx: pts[k][0] - pts[k - 1][0], tz: pts[k][1] - pts[k - 1][1] }; };
    // the ship: a double-ended white ferry with an open car deck and a bridge on top
    const g = new THREE.Group(); group.add(g);
    const len = 46, beam = 13, white = mat(0xf2f2f0, { roughness: 0.5 }), blue = mat(0x1f4fb4);
    const hull = new THREE.Mesh(new RBox(beam, 4.6, len), white); hull.position.y = 0.3; g.add(hull);
    for (const e of [1, -1]) { const nose = new THREE.Mesh(new THREE.CylinderGeometry(beam / 2, beam / 2, 4.6, 3, 1).rotateY(e > 0 ? Math.PI / 2 : -Math.PI / 2), white); nose.scale.set(1, 1, 0.9); nose.position.set(0, 0.3, e * len / 2); g.add(nose);
      const ramp = new THREE.Mesh(new RBox(6, 0.25, 3.5), mat(0x555a60, { metalness: 0.5 })); ramp.position.set(0, 2.75, e * (len / 2 + 0.5)); ramp.rotation.x = e * 0.25; g.add(ramp); }
    const band = new THREE.Mesh(new RBox(beam + 0.05, 0.8, len + 0.05), blue); band.position.y = -0.8; g.add(band);
    const deck = new THREE.Mesh(new RBox(beam - 1, 0.2, len), mat(0x4d5257)); deck.position.y = 2.65; g.add(deck);
    for (const sd of [1, -1]) { const wall = new THREE.Mesh(new RBox(0.3, 1.6, len - 4), white); wall.position.set(sd * (beam / 2 - 0.2), 3.5, 0); g.add(wall); }
    const sup = new THREE.Mesh(new RBox(beam - 1, 3, 12), white); sup.position.set(0, 7.2, 0); sup.castShadow = true; g.add(sup);
    for (const sd of [1, -1]) for (const px of [-5.6, 5.6]) { const leg = new THREE.Mesh(new RBox(0.5, 3, 0.5), white); leg.position.set(px, 4.3, sd * 5); g.add(leg); }
    const winB = new THREE.Mesh(new RBox(beam - 0.9, 1, 12.1), mat(0x22303c, { metalness: 0.5, roughness: 0.1 })); winB.position.set(0, 7.6, 0); g.add(winB);
    const fun = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 3, 12), blue); fun.position.set(0, 10.2, 0); g.add(fun);
    const nm = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.2), new THREE.MeshStandardMaterial({ map: signTex('BAYLINE FERRIES', '#ffffff', '#1f4fb4') }));
    for (const sd of [1, -1]) { const m2 = nm.clone(); m2.position.set(sd * (beam / 2 + 0.03), 0.9, 0); m2.rotation.y = sd * Math.PI / 2; g.add(m2); }
    const parked = []; for (const [px, pz, c, k] of [[-3, -14, 0x1f3f7a, 1], [3, -14, 0xeeece6, 3], [3, 14, 0x6b7a8f, 0], [-3, 14, 0xb5121b, 4]]) { const pc = createTrafficCar(c, k); pc.position.set(px, 2.75, pz); g.add(pc); parked.push(pc); }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    ferryC = { g, along, PL, stops, k: 0, d: 0, dir: 1, v: 0, wait: 20, yaw: 0, at: 'West Bay', deckY: 2.75,
      get next() { return this.stops[Math.max(0, Math.min(this.stops.length - 1, this.k + this.dir))].name; },
      // where cars drive on and off: the pier end / the west end of the quay
      quays: { 'West Bay': { x: W.end.x - W.ux * 8, z: W.end.z - W.uz * 8, h: W.h, heading: Math.atan2(-W.ux, -W.uz) }, 'Port Ruby': { x: H.cx - H.hl + 8, z: H.cz + 6, h: H.top, heading: Math.PI / 2 },
        ...(GP ? { 'Gull Island': { x: GP.end.x - GP.ux * 8, z: GP.end.z - GP.uz * 8, h: GP.h, heading: Math.atan2(-GP.ux, -GP.uz) } } : {}) } };
    const p0 = along(0); g.position.set(p0.x, -1.0, p0.z); ferryC.yaw = Math.atan2(p0.tx, p0.tz); g.rotation.y = ferryC.yaw;
  }

  // ---------------------------------------------------------------- Silverpine Peaks chairlift
  const chairs = [];
  let lift = null;
  {
    const B = SKI.base, T = SKI.top, bh = B.h, th = terrainHeight(T.x, T.z);
    const dx = T.x - B.x, dz = T.z - B.z, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len, yaw = Math.atan2(ux, uz);
    // chalet at the base, top station, sign
    const wood = mat(0x7a5236, { roughness: 0.85 }), roofM = mat(0x3a2a20), white = mat(0xf2f2f0);
    const ch = new THREE.Group(); ch.position.set(B.x - ux * 14 + uz * 14, bh, B.z - uz * 14 - ux * 14); ch.rotation.y = yaw; group.add(ch);
    const walls = new THREE.Mesh(new RBox(16, 6, 10), wood); walls.position.y = 3; walls.castShadow = true; ch.add(walls);
    const rf = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 9.5, 5, 4, 1).rotateY(Math.PI / 4).scale(1.2, 1, 0.78), roofM); rf.position.y = 8.5; ch.add(rf);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.6), new THREE.MeshStandardMaterial({ map: signTex('SILVERPINE PEAKS · SKI LIFT', '#b5121b') })); sg.position.set(0, 4.8, 5.06); ch.add(sg);
    addCollider(ch.position.x, ch.position.z, 8.5, bh + 7);
    const stn = (x, z, h, rot) => { const g = new THREE.Group(); g.position.set(x, h, z); g.rotation.y = yaw + rot; group.add(g); const b = new THREE.Mesh(new RBox(9, 4, 7), white); b.position.y = 2; g.add(b); const w = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.6, 24), mat(0x555555, { metalness: 0.6 })); w.position.set(0, 7.2, 0); g.add(w); const roof = new THREE.Mesh(new RBox(10, 0.5, 9), mat(0xb5121b)); roof.position.y = 8; g.add(roof); for (const s of [1, -1]) { const p = new THREE.Mesh(new RBox(0.5, 8, 0.5), mat(0x777777)); p.position.set(s * 4, 4, 0); g.add(p); } addCollider(x, z, 5, h + 8.2); return g; };
    stn(B.x, B.z, bh, 0); stn(T.x, T.z, th, Math.PI);
    // pylons every ~70 m, cable 9 m above the ground; chairs on a loop (up one side, down the other)
    const NP = Math.max(2, Math.round(len / 70)), pyl = [];
    const steel = mat(0x8c9196, { metalness: 0.7, roughness: 0.4 });
    for (let k = 0; k <= NP; k++) {
      const t = k / NP, x = B.x + dx * t, z = B.z + dz * t, gh = k === 0 ? bh : k === NP ? th : terrainHeight(x, z), top = gh + (k === 0 || k === NP ? 7.2 : 11);
      pyl.push({ x, z, top });
      if (k > 0 && k < NP) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, top - gh, 10), steel); p.position.set(x, (top + gh) / 2, z); group.add(p); const arm = new THREE.Mesh(new RBox(5.5, 0.4, 0.4), steel); arm.position.set(x, top, z); arm.rotation.y = yaw; group.add(arm); addCollider(x, z, 0.6, top); }
    }
    const cableH = (t) => { const f = t * NP, k = Math.min(NP - 1, Math.floor(f)), r = f - k; const a = pyl[k], b = pyl[k + 1]; return a.top + (b.top - a.top) * r - Math.sin(r * Math.PI) * 1.5; };
    for (const side of [1, -1]) {
      const pts = []; for (let k = 0; k <= 80; k++) { const t = k / 80; pts.push(new THREE.Vector3(B.x + dx * t + uz * side * 2.5, cableH(t), B.z + dz * t - ux * side * 2.5)); }
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x222222 })));
    }
    const NC = Math.round(len / 14) * 2;
    const chairM = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.15, 0.7).translate(0, -2.2, 0), mat(0x1f4fb4), NC);
    const hangM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 2.2, 0.06).translate(0, -1.1, 0), steel, NC);
    const backM = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.7, 0.1).translate(0, -1.8, -0.35), mat(0x1f4fb4), NC);
    for (const im of [chairM, hangM, backM]) { im.frustumCulled = false; group.add(im); }
    lift = { B, dx, dz, ux, uz, yaw, cableH, NC, chairM, hangM, backM, t: 0 };
  }

  // ---------------------------------------------------------------- Silverpine car cable car
  // Two big cabins on parallel track ropes, counterweighted (one goes up as the other comes down), from a terrace at the
  // end of the ski car park to the levelled summit plateau beside the chairlift's top station. Each cabin takes a car.
  let cable = null;
  if (SKI.cable) {
    const C = SKI.cable, A = C.base, Bt = C.top, px = C.px, pz = C.pz;
    const DX = Bt.x - A.x, DZ = Bt.z - A.z, LEN = Math.hypot(DX, DZ), yaw = Math.atan2(DX, DZ), ex = DX / LEN, ez = DZ / LEN;
    const HANG = 7.5, TRK = 4.5;   // rope above the cabin floor; track ropes either side of the centre line
    const ter = (t) => { let h = -1e9; for (const o of [-TRK - 2.5, 0, TRK + 2.5]) h = Math.max(h, terrainHeight(A.x + DX * t + px * o, A.z + DZ * t + pz * o)); return h; };
    // supports: the two station heads, then towers wherever a cabin would come within 7 m of the ground
    const sup = [{ t: 0, y: A.h + HANG, st: true }, { t: 1, y: Bt.h + HANG, st: true }];
    const ropeY = (t) => { let k = 0; while (k < sup.length - 2 && sup[k + 1].t < t) k++; const a = sup[k], b = sup[k + 1], r = (t - a.t) / (b.t - a.t || 1); return a.y + (b.y - a.y) * r - Math.sin(Math.PI * Math.max(0, Math.min(1, r))) * 0.012 * (b.t - a.t) * LEN; };
    const t0 = 11 / LEN, t1 = 1 - 11 / LEN;
    for (let it = 0; it < 14; it++) {
      let worst = 0, wt = -1;
      for (let t = t0; t <= t1; t += 3 / LEN) { const need = ter(t) + 7 - (ropeY(t) - HANG); if (need > worst) { worst = need; wt = t; } }
      if (wt < 0) break;
      const near = sup.find((q) => !q.st && Math.abs(q.t - wt) * LEN < 30);
      if (near) near.y += worst + 4; else { sup.push({ t: wt, y: ter(wt) + 7 + HANG + 6 }); sup.sort((a, b) => a.t - b.t); }
    }
    const red = mat(0xb5121b, { roughness: 0.5 }), white = mat(0xf2f2f0, { roughness: 0.6 }), steel = mat(0x8c9196, { metalness: 0.7, roughness: 0.4 }), dark = mat(0x2a2d31, { metalness: 0.5, roughness: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fc4d8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35, depthWrite: false });
    // towers: two tapered legs either side of the ropes, braced, with a cross-arm carrying the saddles
    for (const q of sup) {
      if (q.st) continue;
      const x = A.x + DX * q.t, z = A.z + DZ * q.t, gh = Math.min(...[-1, 1].map((sd) => terrainHeight(x + px * sd * 6, z + pz * sd * 6))) - 1, Ht = q.y - gh + 0.6;
      const tw = new THREE.Group(); tw.position.set(x, gh, z); tw.rotation.y = yaw; group.add(tw);
      for (const sd of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.1, Ht, 8), steel); leg.position.set(sd * 6.2, Ht / 2, 0); leg.rotation.z = sd * 0.02; leg.castShadow = true; tw.add(leg); addCollider(x + px * sd * 6.4, z + pz * sd * 6.4, 1.3, gh + Ht); }
      for (let y = 10; y < Ht - 4; y += 10) { const br = new THREE.Mesh(new RBox(12.4, 0.35, 0.35), steel); br.position.y = y; tw.add(br); }
      const arm = new THREE.Mesh(new RBox(14, 1, 1.4), dark); arm.position.y = Ht; tw.add(arm);
      for (const sd of [-1, 1]) { const sad = new THREE.Mesh(new RBox(0.7, 0.5, 5), steel); sad.position.set(sd * TRK, Ht - 0.5, 0); tw.add(sad); }
    }
    // the ropes
    for (const sd of [-1, 1]) { const pts = []; for (let k = 0; k <= 240; k++) { const t = k / 240; pts.push(new THREE.Vector3(A.x + DX * t + px * sd * TRK, ropeY(t), A.z + DZ * t + pz * sd * TRK)); } group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x1a1a1a }))); }
    // station halls: open at the car end, the ropes run out of the other end
    const hall = (x, z, h, flip, label) => {
      const g = new THREE.Group(); g.position.set(x, h, z); g.rotation.y = yaw + (flip ? Math.PI : 0); group.add(g);
      const fw = (lx, lz) => [x + Math.cos(g.rotation.y) * lx + Math.sin(g.rotation.y) * lz, z - Math.sin(g.rotation.y) * lx + Math.cos(g.rotation.y) * lz];
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) { const pl = new THREE.Mesh(new RBox(0.8, 11, 0.8), white); pl.position.set(sx * 9, 5.5, sz * 10); g.add(pl); }
        const wall = new THREE.Mesh(new RBox(0.4, 1.3, 20), white); wall.position.set(sx * 9, 0.65, 0); g.add(wall);
        const gl = new THREE.Mesh(new RBox(0.1, 8.6, 19.2), glass); gl.position.set(sx * 9, 5.6, 0); g.add(gl);
        for (let lz = -10; lz <= 10; lz += 2) { const [cx, cz] = fw(sx * 9, lz); addCollider(cx, cz, 1.0, h + 11); }
      }
      const roof = new THREE.Mesh(new RBox(20, 0.7, 22), red); roof.position.y = 11.3; roof.castShadow = true; g.add(roof);
      const mh = new THREE.Mesh(new RBox(10, 3, 8), white); mh.position.set(0, 13.1, 4); g.add(mh);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(TRK + 0.4, TRK + 0.4, 0.5, 32), dark); wheel.position.set(0, HANG + 0.3, 6); g.add(wheel);
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.6), new THREE.MeshStandardMaterial({ map: signTex(label, '#b5121b') })); sg.position.set(0, 10.2, -10.45); sg.rotation.y = Math.PI; g.add(sg);
      g.traverse((o) => { if (o.isMesh && o.material !== glass) o.castShadow = true; });
    };
    hall(A.x, A.z, A.h, false, 'SILVERPINE CABLE CAR · CARS & PASSENGERS');
    hall(Bt.x, Bt.z, Bt.h, true, `SILVERPINE SUMMIT · ${Math.round(Bt.h)} m`);
    // the summit plateau: a railing all round, a viewpoint sign
    if (SKI.summit) {
      const Sm = SKI.summit, vx = -Sm.uz, vz = Sm.ux, posts = [];
      // gaps in the downhill rail where the cable car and the chairlift come in
      const gaps = [[(Bt.x - Sm.cx) * vx + (Bt.z - Sm.cz) * vz, 10.5], [(SKI.top.x - Sm.cx) * vx + (SKI.top.z - Sm.cz) * vz, 5]];
      for (const [a0, b0, a1, b1] of [[-Sm.hl, -Sm.hw, Sm.hl, -Sm.hw], [Sm.hl, -Sm.hw, Sm.hl, Sm.hw], [Sm.hl, Sm.hw, -Sm.hl, Sm.hw], [-Sm.hl, Sm.hw, -Sm.hl, -Sm.hw]]) {
        const l = Math.hypot(a1 - a0, b1 - b0), n2 = Math.ceil(l / 2.5);
        for (let k = 0; k < n2; k++) { const a = a0 + (a1 - a0) * k / n2, b = b0 + (b1 - b0) * k / n2; if (a < -Sm.hl + 0.1 && gaps.some((g) => Math.abs(b - g[0]) < g[1])) continue; posts.push([Sm.cx + Sm.ux * a + vx * b, Sm.cz + Sm.uz * a + vz * b]); }
      }
      const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 1.1, 0.15).translate(0, 0.55, 0), steel, posts.length);
      posts.forEach(([x, z], i) => { M.makeTranslation(x, Sm.h, z); pm.setMatrixAt(i, M); addCollider(x, z, 1.4, Sm.h + 1.6); }); group.add(pm);
      for (const sd of [-1, 1]) for (const [ax, along, half] of [[1, Sm.hl, Sm.hw], [0, Sm.hw, Sm.hl]]) {
        if (ax && sd < 0) continue;   // the downhill side has the station openings
        const r = new THREE.Mesh(new RBox(0.08, 0.08, half * 2), steel);
        const lx = ax ? sd * along : 0, lz = ax ? 0 : sd * along;   // rail along the side
        r.position.set(Sm.cx + Sm.ux * lx + vx * lz, Sm.h + 1.05, Sm.cz + Sm.uz * lx + vz * lz); r.rotation.y = Math.atan2(ax ? vx : Sm.ux, ax ? vz : Sm.uz); group.add(r);
      }
    }
    // the Skyline café in the middle of the loop, telescopes at the far rail, a sign
    if (SKI.summit) {
      const Sm = SKI.summit, P = (u, v) => [Sm.cx + Sm.ux * u - Sm.uz * v, Sm.cz + Sm.uz * u + Sm.ux * v], yaw = Math.atan2(Sm.ux, Sm.uz);
      { const [x, z] = P(12, 0), g = new THREE.Group(); g.position.set(x, Sm.h, z); g.rotation.y = yaw; group.add(g);
        const wood = mat(0x7a5236, { roughness: 0.85 }), gl = new THREE.MeshStandardMaterial({ color: 0x9fc4d8, roughness: 0.05, transparent: true, opacity: 0.45 });
        const base = new THREE.Mesh(new RBox(14, 3.6, 9), wood); base.position.y = 1.8; g.add(base);
        for (const sd of [1, -1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(12, 2.2, 0.1), gl); w.position.set(0, 2, sd * 4.55); g.add(w); }
        const roof = new THREE.Mesh(new THREE.ConeGeometry(9.5, 3, 4).rotateY(Math.PI / 4), mat(0xb5121b)); roof.scale.set(1.1, 1, 0.75); roof.position.y = 5.1; g.add(roof);
        const sg = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.2), new THREE.MeshStandardMaterial({ map: signTex('SKYLINE CAFÉ · 535 m', '#b5121b') })); sg.position.set(0, 3.2, 4.62); g.add(sg); const sg2 = sg.clone(); sg2.rotation.y = Math.PI; sg2.position.z = -4.62; g.add(sg2);
        g.traverse((o) => { if (o.isMesh && o.material !== gl) o.castShadow = true; });
        addCollider(x, z, 5, Sm.h + 5); addCollider(x + Sm.ux * 4.5, z + Sm.uz * 4.5, 4.5, Sm.h + 5); addCollider(x - Sm.ux * 4.5, z - Sm.uz * 4.5, 4.5, Sm.h + 5); }
      for (const v of [-12, 0, 12]) { const [x, z] = P(Sm.hl - 4, v), t = new THREE.Group(); t.position.set(x, Sm.h, z); t.rotation.y = yaw; group.add(t);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.3, 8), steel); post.position.y = 0.65; t.add(post);
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.7, 12).rotateX(Math.PI / 2 - 0.15), mat(0x2a8a4a, { metalness: 0.4 })); scope.position.set(0, 1.4, 0.1); t.add(scope); addCollider(x, z, 0.4, Sm.h + 1.6); }
    }
    // the cabins: a glazed box with open ends, a hanger arm up to the carriage on the rope
    const cabin = () => {
      const g = new THREE.Group(); group.add(g);
      const floor = new THREE.Mesh(new RBox(4.4, 0.3, 7.6), dark); floor.position.y = -0.15; g.add(floor);
      const skirt = new THREE.Mesh(new RBox(4.5, 0.9, 7.7), red); skirt.position.y = -0.6; g.add(skirt);
      const roofc = new THREE.Mesh(new RBox(4.6, 0.35, 7.8), red); roofc.position.y = 3.1; g.add(roofc);
      for (const sx of [-1, 1]) { for (const sz of [-1, 1]) { const p = new THREE.Mesh(new RBox(0.15, 3, 0.15), white); p.position.set(sx * 2.15, 1.5, sz * 3.75); g.add(p); }
        const side = new THREE.Mesh(new RBox(0.06, 2.9, 7.4), glass); side.position.set(sx * 2.17, 1.5, 0); g.add(side);
        const band = new THREE.Mesh(new RBox(0.1, 0.5, 7.5), red); band.position.set(sx * 2.2, 0.3, 0); g.add(band); }
      const arm = new THREE.Mesh(new RBox(0.35, HANG - 3.3, 0.35), dark); arm.position.y = 3.3 + (HANG - 3.3) / 2; g.add(arm);
      const carr = new THREE.Mesh(new RBox(0.8, 0.9, 3.6), dark); carr.position.y = HANG - 0.1; g.add(carr);
      for (const sz of [-1.3, 1.3]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12).rotateZ(Math.PI / 2), steel); w.position.set(0, HANG + 0.2, sz); g.add(w); }
      const nm = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.6), new THREE.MeshStandardMaterial({ map: signTex('SILVERPINE', '#b5121b') })); for (const sd of [-1, 1]) { const m2 = nm.clone(); m2.position.set(sd * 2.32, 2.85, 0); m2.rotation.y = sd * Math.PI / 2; g.add(m2); }
      g.traverse((o) => { if (o.isMesh && o.material !== glass) o.castShadow = true; });
      return { g, deckY: 0 };
    };
    const cabins = [cabin(), cabin()];
    const names = ['Silverpine base', 'Silverpine summit'];
    cable = { cabins, u: 0, dir: 1, v: 0, wait: 20, at: names[0], LEN, HANG, ropeY,
      // where cars drive off: in front of each hall's open end
      stations: { [names[0]]: { x: A.x - ex * 15, z: A.z - ez * 15, h: A.h, heading: Math.atan2(-ex, -ez) }, [names[1]]: { x: Bt.x + ex * 15, z: Bt.z + ez * 15, h: Bt.h, heading: Math.atan2(ex, ez) } },
      centres: { [names[0]]: { x: A.x, z: A.z }, [names[1]]: { x: Bt.x, z: Bt.z } },
      // the cabin standing at a station (cabin 0 rides u, cabin 1 rides 1 - u)
      cabinAt(name) { if (!this.at) return null;   // docked: one cabin at each end
        const top = name === names[1]; return (this.u > 0.5) === top ? cabins[0] : cabins[1]; },
      // the station a docked cabin is standing at (null while the cabins are moving)
      stationOf(c) { if (!this.at || this.wait <= 0) return null; const top = (this.u > 0.5) === (c === cabins[0]); return top ? names[1] : names[0]; },
      place(c, t, off, sway) {
        const y = ropeY(t) - HANG;
        c.g.position.set(A.x + DX * t + px * off, y, A.z + DZ * t + pz * off); c.g.rotation.set(sway, yaw, 0, 'YXZ');
      },
      update(dt) {
        if (this.wait > 0) { this.wait -= dt; this.v = 0; if (this.wait <= 0) this.at = null; }
        else {
          const rem = (this.dir > 0 ? 1 - this.u : this.u) * LEN, vt = Math.min(9, Math.sqrt(2 * 0.5 * rem) + 0.25);
          this.v += Math.max(-0.8 * dt, Math.min(0.6 * dt, vt - this.v));
          this.u += this.dir * this.v * dt / LEN;
          if (rem < 0.2) { this.u = this.dir > 0 ? 1 : 0; this.at = this.u > 0.5 ? names[1] : names[0]; this.dir = -this.dir; this.wait = 22; this.v = 0; }
        }
        const sway = this.wait > 0 ? 0 : Math.sin(performance.now() / 1300) * 0.012;
        this.place(cabins[0], this.u, TRK, sway); this.place(cabins[1], 1 - this.u, -TRK, -sway);
      },
    };
    cable.update(0);
  }

  const o = {};
  return {
    group,
    // the train: cars as obstacles while near
    near(player, out) { for (const c of col) if (Math.hypot(c.x - player.x, c.z - player.z) < 40) out.push(c); return out; },
    update(dt, night) {
      // trains: each runs to its next stop (or just keeps going), never closer than ~180 m to the one ahead
      col.length = 0;
      for (const tr of trains) {
        let ahead = Infinity;
        for (const o of trains) if (o !== tr) { const d = ((o.s - o.total - tr.s) % L + L) % L; if (d < ahead) ahead = d; }
        const nextS = tr.stops.length ? stopS[tr.stops[tr.next]].s : Infinity;
        let gap = tr.stops.length ? ((nextS - tr.s) % L + L) % L : Infinity;
        tr.ahead = ahead;
        if (tr.manual) {
          // driven by the player: throttle and brake notches; the safety system applies the brakes if a red signal is passed
          const m = tr.manual; m.signal = ahead < 220 ? 'red' : ahead < 450 ? 'yellow' : 'green';
          if (ahead < 160 && tr.v > 2) m.emergency = true;
          if (m.emergency) { tr.v = Math.max(0, tr.v - 2.5 * dt); if (tr.v === 0 && ahead > 200) m.emergency = false; }
          else tr.v = Math.max(0, Math.min(tr.vmax * 1.3, tr.v + (m.throttle * 0.5 - m.brake * 1.3 - 0.015 - tr.v * tr.v * 0.00006) * dt));
          tr.s += tr.v * dt;
        }
        else if (tr.wait > 0) { tr.wait -= dt; tr.v = 0; if (tr.wait <= 0 && tr.stops.length) tr.next = (tr.next + 1) % tr.stops.length; }
        else {
          const stopD = Math.min(gap, Math.max(0, ahead - 180));
          const vt = Math.min(tr.vmax, Math.sqrt(2 * 0.7 * Math.max(0, stopD)) + (ahead - 180 > 0 ? 0.5 : 0));
          tr.v += Math.max(-1.2 * dt, Math.min(0.5 * dt, vt - tr.v));
          tr.s += tr.v * dt;
          if (tr.stops.length) { gap = ((nextS - tr.s) % L + L) % L; if (gap < 1.5 || gap > L - 5) { tr.wait = 14; tr.v = 0; } }
        }
        let off = 0;
        for (const car of tr.cars) {
          const sMid = tr.s - off - car.len / 2;
          const a = at(sMid + car.len / 2 - 2, {}), b = at(sMid - car.len / 2 + 2, {});
          const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = (a.y + b.y) / 2;
          car.g.position.set(mx, my + 0.25, mz);
          car.g.rotation.set(0, Math.atan2(a.x - b.x, a.z - b.z), 0);
          car.g.rotateX(-Math.atan2(a.y - b.y, Math.hypot(a.x - b.x, a.z - b.z)));
          if (car.g.userData.win) car.g.userData.win.emissiveIntensity = night * 1.2;
          for (let k = -2; k <= 2; k++) { const f = k / 5; col.push({ x: mx + (a.x - b.x) * f, z: mz + (a.z - b.z) * f, r: 1.8, owner: { imp: { x: 0, z: 0 } } }); }
          off += car.len + 1;
        }
      }
      // ships
      for (const sh of ships) {
        if (sh.fixed) { sh.g.position.y = -1.6 + Math.sin(performance.now() / 2400) * 0.15; continue; }
        const l = sh.loop; l.a += l.w * dt;
        const x = l.cx + Math.cos(l.a) * l.rx, z = l.cz + Math.sin(l.a) * l.rz;
        const vx = -Math.sin(l.a) * l.rx * l.w, vz = Math.cos(l.a) * l.rz * l.w;
        sh.g.position.set(x, -1.6 + Math.sin(performance.now() / 2000 + l.a * 5) * 0.2, z); sh.g.rotation.y = Math.atan2(vx, vz);
      }
      // the car ferry: dwell at a berth, sail the route, dwell, sail back (it turns round at the berth)
      if (ferryC) {
        const F = ferryC;
        if (F.wait > 0) { F.wait -= dt; F.v = 0; if (F.wait <= 0) { F.at = null; } }
        else {
          const tgt = F.stops[F.k + F.dir].d, rem = Math.abs(tgt - F.d);
          const vt = Math.min(9, Math.sqrt(2 * 0.25 * rem) + 0.3);
          F.v += Math.max(-0.5 * dt, Math.min(0.35 * dt, vt - F.v));
          F.d += F.dir * F.v * dt;
          if (rem < 0.5) { F.d = tgt; F.k += F.dir; F.at = F.stops[F.k].name; F.wait = 28; if (F.k === 0 || F.k === F.stops.length - 1) F.dir = -F.dir; }
        }
        const p = F.along(F.d), tyaw = Math.atan2(p.tx * F.dir, p.tz * F.dir);   // after arriving, dir has flipped: it swings round during the dwell
        let dy = Math.atan2(Math.sin(tyaw - F.yaw), Math.cos(tyaw - F.yaw)); F.yaw += Math.max(-0.12 * dt, Math.min(0.12 * dt, dy));
        F.g.position.set(p.x, -1.0 + Math.sin(performance.now() / 2100) * 0.12, p.z); F.g.rotation.set(Math.sin(performance.now() / 3300) * 0.01, F.yaw, Math.sin(performance.now() / 2700) * 0.015);
      }
      if (cable) cable.update(dt);
      // chairs
      if (lift) {
        const Lf = lift; Lf.t = (Lf.t + dt * 2.2 / Math.hypot(Lf.dx, Lf.dz)) % 1;
        for (let i = 0; i < Lf.NC; i++) {
          const half = Lf.NC / 2, up = i < half, t = ((i % half) / half + Lf.t) % 1, tt = up ? t : 1 - t, side = up ? 1 : -1;
          const x = Lf.B.x + Lf.dx * tt + Lf.uz * side * 2.5, z = Lf.B.z + Lf.dz * tt - Lf.ux * side * 2.5, y = Lf.cableH(tt);
          M.compose(P.set(x, y, z), Q.setFromAxisAngle(UP, Lf.yaw + (up ? 0 : Math.PI)), S);
          Lf.chairM.setMatrixAt(i, M); Lf.hangM.setMatrixAt(i, M); Lf.backM.setMatrixAt(i, M);
        }
        Lf.chairM.instanceMatrix.needsUpdate = Lf.hangM.instanceMatrix.needsUpdate = Lf.backM.instanceMatrix.needsUpdate = true;
      }
    },
    get trains() { return trains; },
    get ferry() { return ferryC; },
    get cable() { return cable; },
    stops: stopS, at, railLength: L,
  };
}
