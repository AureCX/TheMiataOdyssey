// City life: pedestrians strolling the pavements (they dodge cars, and get knocked over by careless ones), traffic
// lights where the streets cross each town's main road (AI traffic stops for them; running a red is reported), and
// cars parked along the kerbs.
import * as THREE from 'three';
import { TOWNS, JUNCTIONS, ROAD_JOINS } from './world.js';
import { trafficParts, TRAFFIC_MATS } from './car.js';
import { addCollider } from './scenery.js';

const SHIRTS = [0xc8102e, 0x1f4fb4, 0x2f7a3a, 0xe8b923, 0xeeeeee, 0x333333, 0x7a3f8f, 0xe5641c, 0x2aa7b8, 0x9c6b4a];
const SKIN = [0xf1c8a5, 0xd9a47e, 0xa8714f, 0x6e4632, 0xf5d6be];
const CYCLE = 30;   // s: main road green 0–13, amber 13–16, red 16–30; side streets the opposite

export function createCityLife(scene) {
  const group = new THREE.Group(); scene.add(group);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler(), col = new THREE.Color();

  // ---------------------------------------------------------------- pedestrians
  const peds = [];
  for (const t of TOWNS) for (const w of t.walks) {
    const n = Math.max(1, Math.round(w.hl * 2 / 22 * (t.size === 'city' ? 1.4 : t.size === 'town' ? 1 : 0.7)));
    for (let k = 0; k < n; k++) peds.push({ w, s: (Math.random() * 2 - 1) * w.hl, dir: Math.random() < 0.5 ? 1 : -1, lat: (Math.random() - 0.5) * 1.2, v: 1.0 + Math.random() * 0.6, ph: Math.random() * 6, down: 0, dodge: 0, h: 0.9 + Math.random() * 0.2, shirt: SHIRTS[(Math.random() * SHIRTS.length) | 0], pants: [0x1d2733, 0x3b3b3b, 0x4a5b7a, 0x6b5a45][(Math.random() * 4) | 0], skin: SKIN[(Math.random() * SKIN.length) | 0] });
  }
  const N = peds.length;
  const torso = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.62, 0.26).translate(0, 1.12, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), N);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 10, 8).translate(0, 1.57, 0), new THREE.MeshStandardMaterial({ roughness: 0.7 }), N);
  const legGeo = new THREE.BoxGeometry(0.15, 0.82, 0.16).translate(0, -0.41, 0);
  const legL = new THREE.InstancedMesh(legGeo, new THREE.MeshStandardMaterial({ roughness: 0.85 }), N), legR = new THREE.InstancedMesh(legGeo, legL.material, N);
  const armGeo = new THREE.BoxGeometry(0.1, 0.58, 0.12).translate(0, -0.29, 0);
  const armL = new THREE.InstancedMesh(armGeo, torso.material, N), armR = new THREE.InstancedMesh(armGeo, torso.material, N);
  peds.forEach((pd, i) => { torso.setColorAt(i, col.set(pd.shirt)); armL.setColorAt(i, col.set(pd.shirt)); armR.setColorAt(i, col.set(pd.shirt)); head.setColorAt(i, col.set(pd.skin)); legL.setColorAt(i, col.set(pd.pants)); legR.setColorAt(i, col.set(pd.pants)); });
  for (const im of [torso, head, legL, legR, armL, armR]) { im.castShadow = true; im.frustumCulled = false; group.add(im); }
  const base = new THREE.Matrix4(), part = new THREE.Matrix4();

  // ---------------------------------------------------------------- traffic lights
  const signals = [];
  for (const j of JUNCTIONS) {
    if (!j.r1 || j.r1.type === 'street' || j.rural) continue;
    const r = j.r1; let bi = 0, bd = 1e18;
    for (let i = 0; i < r.n; i++) { const d = (r.pts[i][0] - j.x) ** 2 + (r.pts[i][1] - j.z) ** 2; if (d < bd) { bd = d; bi = i; } }
    signals.push({ j, road: r, i: bi, stop: j.r2.hw + 4.5, ux: r.tx[bi], uz: r.tz[bi] });
  }
  // and at the busiest highway junctions (both ends of the Central and Coast roads)
  for (const J of ROAD_JOINS) {
    if (J.through.type !== 'highway' || !['Central road', 'Coast road'].includes(J.branch.name)) continue;
    signals.push({ j: { x: J.x, z: J.z, h: J.h, r2: J.branch }, road: J.through, i: J.ti, stop: J.branch.hw + 5.5, ux: J.through.tx[J.ti], uz: J.through.tz[J.ti], join: J });
  }
  const lampMats = ['main', 'side'].map(() => [0xff2a1a, 0xffb000, 0x1aff5a].map((c) => new THREE.MeshBasicMaterial({ color: c })));
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.5, metalness: 0.6 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6 });
  const poles = [], heads = [], lamps = [[[], [], []], [[], [], []]];
  for (const sg of signals) {
    const { j } = sg, vx = -sg.uz, vz = sg.ux, A = j.r2.hw + 1.6, B = sg.road.hw + 1.6;
    for (const k of [1, -1]) {
      // poles on two opposite corners; each carries a head for the main road and one for the side street
      const x = j.x + sg.ux * A * k + vx * B * k, z = j.z + sg.uz * A * k + vz * B * k;
      poles.push([x, j.h, z]);
      for (const [axis, dx, dz] of [[0, -sg.ux * k, -sg.uz * k], [1, -vx * k, -vz * k]]) {
        const hx = x + dz * 0.0, hz = z, yaw = Math.atan2(dx, dz);
        heads.push([hx, j.h + 4.2, hz, yaw]);
        for (let li = 0; li < 3; li++) lamps[axis][li].push([hx + dx * 0.2, j.h + 4.55 - li * 0.33, hz + dz * 0.2, yaw]);
      }
    }
    addCollider(j.x + sg.ux * A + vx * B, j.z + sg.uz * A + vz * B, 0.25, j.h + 5);
    addCollider(j.x - sg.ux * A - vx * B, j.z - sg.uz * A - vz * B, 0.25, j.h + 5);
  }
  const inst = (geo, mat, list, f) => { if (!list.length) return null; const im = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((a, i) => { f(a); im.setMatrixAt(i, M); }); group.add(im); return im; };
  inst(new THREE.CylinderGeometry(0.09, 0.12, 4.8, 8).translate(0, 2.4, 0), poleMat, poles, ([x, y, z]) => M.makeTranslation(x, y, z));
  inst(new THREE.BoxGeometry(0.36, 1.1, 0.3), headMat, heads, ([x, y, z, yaw]) => M.compose(p.set(x, y + 0.24, z), q.setFromAxisAngle(s.set(0, 1, 0), yaw), s.set(1, 1, 1)));
  const lampGeo = new THREE.CircleGeometry(0.12, 12);
  for (const a of [0, 1]) for (let li = 0; li < 3; li++) inst(lampGeo, lampMats[a][li], lamps[a][li], ([x, y, z, yaw]) => M.compose(p.set(x, y, z), q.setFromAxisAngle(s.set(0, 1, 0), yaw), s.set(1, 1, 1)));
  let clock = 0;
  const phase = () => { const t = clock % CYCLE; return { main: t < 13 ? 'green' : t < 16 ? 'amber' : 'red', side: t < 16 ? 'red' : t < 27 ? 'green' : 'amber' }; };

  // ---------------------------------------------------------------- parked cars (instanced per body style)
  const parked = [];
  for (const t of TOWNS) for (const w of t.walks) {
    if (w.hl < 7) continue;
    for (let s0 = -w.hl + 5; s0 < w.hl - 5; s0 += 9 + Math.random() * 14) {
      if (Math.random() < 0.45) continue;
      const toRoad = 1.3 + 1.2;   // from the pavement centre to the parking strip
      // the road is on the side of the pavement facing the street centreline: find it from the town's streets
      parked.push({ w, s: s0, kind: [0, 1, 1, 3, 4][(Math.random() * 5) | 0], color: [0xb5121b, 0x1d3f7a, 0xeeece6, 0x2b2b2b, 0x8a8f96, 0x2f6b4a, 0xd6c27a, 0x5a2a6b][(Math.random() * 8) | 0], toRoad });
    }
  }
  // which side of each pavement the street is on: the pavement's offset from its street (the street through the walk's axis)
  const sideOf = new Map();
  for (const t of TOWNS) for (const st of t.streets) for (const w of t.walks) {
    if (sideOf.has(w)) continue;
    if (Math.abs(st.tx[0] * w.ux + st.tz[0] * w.uz) < 0.99) continue;
    const dx = w.cx - st.pts[0][0], dz = w.cz - st.pts[0][1], lat = dx * -st.tz[0] + dz * st.tx[0];
    if (Math.abs(Math.abs(lat) - (st.hw + 1.3)) < 0.2) sideOf.set(w, Math.sign(lat));
  }
  const byKind = new Map();
  for (const pk of parked) { const side = sideOf.get(pk.w); if (!side) continue; if (!byKind.has(pk.kind)) byKind.set(pk.kind, []); byKind.get(pk.kind).push({ ...pk, side }); }
  for (const [kind, list] of byKind) {
    const { merged } = trafficParts(kind, false, true);   // the light version: there are hundreds of them
    for (const [k, geo] of Object.entries(merged)) {
      const mat = k === 'paint' ? new THREE.MeshPhysicalMaterial({ roughness: 0.32, clearcoat: 0.8 }) : k === 'head' || k === 'tail' ? new THREE.MeshStandardMaterial({ color: k === 'head' ? 0xdddddd : 0x660000 }) : TRAFFIC_MATS[k];
      const im = new THREE.InstancedMesh(geo, mat, list.length); im.castShadow = k === 'paint';
      list.forEach((pk, i) => {
        const w = pk.w, vx = -w.uz, vz = w.ux, off = -pk.side * 2.45;   // from the pavement toward the street
        const x = w.cx + w.ux * pk.s + vx * off, z = w.cz + w.uz * pk.s + vz * off;
        M.compose(p.set(x, w.h + 0.03, z), q.setFromAxisAngle(s.set(0, 1, 0), Math.atan2(w.ux, w.uz) + (Math.random() < 0.5 ? 0 : Math.PI)), s.set(1, 1, 1));
        im.setMatrixAt(i, M); if (k === 'paint') im.setColorAt(i, col.set(pk.color));
        if (k === 'paint') { addCollider(x + w.ux * 1.1, z + w.uz * 1.1, 1.0, w.h + 1.6); addCollider(x - w.ux * 1.1, z - w.uz * 1.1, 1.0, w.h + 1.6); }
      });
      group.add(im);
    }
  }

  return {
    counts: { pedestrians: N, signals: signals.length, parked: parked.length },
    // distance (m) ahead along `road` to the next stop line showing red (or amber with room to stop), else Infinity
    // a side road arriving at a signalled junction: true while its lights aren't green
    sideStop(J) { if (!signals.some((sg) => sg.join === J)) return null; return phase().side !== 'green'; },
    signal(road, u, dir) {
      const ph = phase().main; if (ph === 'green') return Infinity;
      let best = Infinity;
      for (const sg of signals) {
        if (sg.road !== road) continue;
        let d = (sg.i - u) * dir * 3; if (road.closed && d < 0) d += road.length;
        d -= sg.stop;
        if (d > 0 && d < best && (ph === 'red' || d > 12)) best = d;
      }
      return best;
    },
    update(dt, player, vel, mode, onRed, onHit) {
      clock += dt;
      const ph = phase();
      for (let a = 0; a < 2; a++) { const st = a ? ph.side : ph.main; lampMats[a][0].color.setRGB(st === 'red' ? 3 : 0.15, 0.02, 0.02); lampMats[a][1].color.setRGB(st === 'amber' ? 3 : 0.15, st === 'amber' ? 1.8 : 0.1, 0.0); lampMats[a][2].color.setRGB(0.02, st === 'green' ? 3 : 0.12, st === 'green' ? 1.2 : 0.05); }
      // the player running a red: crossing a signalled junction fast on the axis that's showing red
      const spd = Math.hypot(vel.x, vel.z);
      if (mode === 'car' && spd > 12) for (const sg of signals) {
        const dx = player.x - sg.j.x, dz = player.z - sg.j.z;
        if (dx * dx + dz * dz > 16) continue;
        const along = Math.abs((vel.x * sg.ux + vel.z * sg.uz) / spd) > 0.7;
        if ((along ? ph.main : ph.side) === 'red' && !sg.flagged) { sg.flagged = 3; onRed && onRed(); }
      }
      for (const sg of signals) if (sg.flagged) sg.flagged = Math.max(0, sg.flagged - dt);
      // pedestrians
      const t = clock;
      for (let i = 0; i < N; i++) {
        const pd = peds[i], w = pd.w;
        let x = w.cx + w.ux * pd.s - w.uz * pd.lat, z = w.cz + w.uz * pd.s + w.ux * pd.lat;
        const dx = x - player.x, dz = z - player.z, d2 = dx * dx + dz * dz;
        if (pd.down > 0) pd.down = Math.max(0, pd.down - dt);
        else if (d2 < 900) {
          // a car bearing down: jump aside; too late and they're knocked over
          if (spd > 3 && d2 < 2.2 && Math.abs(player.y - w.top) < 2.5) { pd.down = 6; pd.lat = Math.max(-1.2, Math.min(1.2, pd.lat + Math.sign(dx * -w.uz + dz * w.ux || 1) * 1.5)); onHit && onHit(spd); }
          else if (spd > 2 && d2 < 30) { pd.dodge = 1.2; pd.lat += Math.sign(dx * -w.uz + dz * w.ux || 1) * dt * 3; pd.lat = Math.max(-1.25, Math.min(1.25, pd.lat)); }
        }
        if (pd.down <= 0) {
          pd.dodge = Math.max(0, pd.dodge - dt);
          pd.s += pd.dir * pd.v * dt * (pd.dodge > 0 ? 2.2 : 1);
          if (pd.s > w.hl - 0.4) { pd.s = w.hl - 0.4; pd.dir = -1; } else if (pd.s < -w.hl + 0.4) { pd.s = -w.hl + 0.4; pd.dir = 1; }
          x = w.cx + w.ux * pd.s - w.uz * pd.lat; z = w.cz + w.uz * pd.s + w.ux * pd.lat;
        }
        const yaw = Math.atan2(w.ux * pd.dir, w.uz * pd.dir);
        const sw = pd.down > 0 ? 0 : Math.sin(t * pd.v * 5.2 + pd.ph);
        const fall = pd.down > 0 ? Math.min(1, (6 - pd.down) * 4) * (pd.down > 1 ? 1 : pd.down) : 0;   // lie down, then get up
        base.compose(p.set(x, w.top, z), q.setFromEuler(e.set(-fall * Math.PI / 2 * 0.95, yaw, 0, 'YXZ')), s.set(pd.h, pd.h, pd.h));
        base.multiply(part.makeTranslation(0, Math.abs(sw) * 0.03, 0));
        torso.setMatrixAt(i, base); head.setMatrixAt(i, base);
        legL.setMatrixAt(i, M.copy(base).multiply(part.makeTranslation(0.1, 0.82, 0)).multiply(part.makeRotationX(sw * 0.5)));
        legR.setMatrixAt(i, M.copy(base).multiply(part.makeTranslation(-0.1, 0.82, 0)).multiply(part.makeRotationX(-sw * 0.5)));
        armL.setMatrixAt(i, M.copy(base).multiply(part.makeTranslation(0.27, 1.4, 0)).multiply(part.makeRotationX(-sw * 0.45)));
        armR.setMatrixAt(i, M.copy(base).multiply(part.makeTranslation(-0.27, 1.4, 0)).multiply(part.makeRotationX(sw * 0.45)));
      }
      for (const im of [torso, head, legL, legR, armL, armR]) im.instanceMatrix.needsUpdate = true;
    },
  };
}
