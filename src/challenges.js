// Challenges around the island:
// - Street racers: rival MX-5s cruise the main roads. Get close behind one and flash your lights (L): it takes you
//   on in a sprint to a point about 1.5 km up the road. First there wins the cash.
// - Speed traps: cameras on the fast roads record your speed as you pass; beat the local record.
// - Jumps: your longest jump (take-off to landing) is recorded; the biggest crests on the roads have JUMP signs.
// - Boat race: a buoy course in the bay off Port Ruby. Air race: rings around Silverpine Peaks. Gold, silver and bronze
//   times, run through the mission checkpoints.
import * as THREE from 'three';
import { RBox } from './shapes.js';
import { roads, groundHeight, terrainHeight, HARBOUR, WATER_LEVEL, continueAtEnd } from './world.js';
import { buildGT } from './rides.js';

const mains = () => roads.filter((r) => r.type === 'highway' || r.type === 'road');

export function createChallenges({ scene, toast, econ, settings, saveSettings, missions, loadModel, stats }) {
  const group = new THREE.Group(); scene.add(group);
  const ch = settings.challenges || (settings.challenges = { traps: {}, jump: 0, medals: {} });
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
  const sign = (text, bg, fg = '#111') => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 256, 128); g.strokeStyle = '#111'; g.lineWidth = 8; g.strokeRect(4, 4, 248, 120); g.fillStyle = fg; g.font = '700 46px "Barlow Condensed", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; const lines = text.split('\n'); lines.forEach((l, i) => g.fillText(l, 128, 64 + (i - (lines.length - 1) / 2) * 46)); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide }); };
  const post = (x, z, mat, h = 2.4) => { const g = new THREE.Group(); g.position.set(x, groundHeight(x, z), z); group.add(g); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h, 6), M(0x777777)); p.position.y = h / 2; g.add(p); const b = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), mat); b.position.y = h + 0.3; g.add(b); return g; };

  // ---------------------------------------------------------------- speed traps on straight stretches
  const traps = [];
  { const rs = mains(); const picked = [];
    for (const r of rs) for (let i = 30; i < r.n - 30; i += 9) {
      let turn = 0; for (let k = -20; k < 20; k++) turn += Math.abs(r.tx[i + k] * r.tz[i + k + 1] - r.tz[i + k] * r.tx[i + k + 1]);
      if (turn < 0.04 && !r.bridge[i] && picked.every((p) => Math.hypot(p.x - r.pts[i][0], p.z - r.pts[i][1]) > 900)) picked.push({ r, i, x: r.pts[i][0], z: r.pts[i][1], turn });
    }
    picked.sort((a, b) => a.turn - b.turn);
    const mat = sign('SPEED\nTRAP', '#ffd400');
    picked.slice(0, 6).forEach((p, k) => {
      const { r, i } = p, sx = p.x - r.tz[i] * (r.hw + 1.5), sz = p.z + r.tx[i] * (r.hw + 1.5);
      const g = post(sx, sz, mat, 3); g.rotation.y = Math.atan2(r.tx[i], r.tz[i]);
      const cam = new THREE.Mesh(new RBox(0.3, 0.25, 0.5), M(0x333333)); cam.position.set(0, 3, 0); g.add(cam);
      traps.push({ id: 'trap' + k, x: p.x, z: p.z, r, i, name: `${r.name} speed trap`, record: Math.round(150 + k * 9 + (r.type === 'highway' ? 30 : 0)), cool: 0 });
    }); }

  // ---------------------------------------------------------------- jump signs at the biggest crests
  const jumps = [];
  { const cand = [];
    for (const r of roads) { if (r.type === 'rail' || r.type === 'street' || r.type === 'track') continue; for (let i = 10; i < r.n - 10; i += 3) { const c = r.h[i] - (r.h[i - 8] + r.h[i + 8]) / 2; if (c > 1.2) cand.push({ r, i, c }); } }
    cand.sort((a, b) => b.c - a.c);
    const mat = sign('JUMP', '#ff6a00', '#fff');
    for (const q of cand) { if (jumps.length >= 5) break; if (jumps.some((j) => Math.hypot(j.x - q.r.pts[q.i][0], j.z - q.r.pts[q.i][1]) < 300)) continue;
      const k = Math.max(0, q.i - 25), x = q.r.pts[k][0] + q.r.tz[k] * (q.r.hw + 1.4), z = q.r.pts[k][1] - q.r.tx[k] * (q.r.hw + 1.4);
      const g = post(x, z, mat); g.rotation.y = Math.atan2(-q.r.tx[k], -q.r.tz[k]); jumps.push({ x: q.r.pts[q.i][0], z: q.r.pts[q.i][1] }); } }
  let air = null;

  // ---------------------------------------------------------------- street racers
  const rivals = [];
  const PAINT = [0x1d6fd1, 0xe8b923, 0x1f4d36, 0xf2f2f2];
  let model = null, loading = false;
  function mesh(i) {
    if (model) { const c = model.clone(true), pm = new THREE.MeshPhysicalMaterial({ color: PAINT[i % 4], metalness: 0.4, roughness: 0.3, clearcoat: 1 }); c.traverse((o) => { if (o.isMesh && o.material && o.material.name === 'carpaint') o.material = pm; }); c.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(c, true); const h = new THREE.Group(); c.position.y -= box.min.y; h.add(c); h.rotation.order = 'YXZ'; return h; }
    const g = buildGT(); g.rotation.order = 'YXZ'; g.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshPhysicalMaterial) { o.material = o.material.clone(); o.material.color.set(PAINT[i % 4]); } }); return g;
  }
  function spawnRival(rv, near) {
    const rs = mains();
    for (let t = 0; t < 30; t++) { const r = rs[(Math.random() * rs.length) | 0], u = 5 + Math.random() * (r.n - 10), p = r.pts[u | 0], d = Math.hypot(p[0] - near.x, p[1] - near.z); if (d > 250 && d < 1200) { Object.assign(rv, { r, u, dir: Math.random() < 0.5 ? 1 : -1, v: 20, race: null }); return; } }
  }
  for (let i = 0; i < 3; i++) { const rv = { m: mesh(i), idx: i }; group.add(rv.m); rivals.push(rv); }
  const sample = (r, u) => { const n = r.n; let i = Math.floor(u); if (r.closed) i = ((i % n) + n) % n; else i = Math.max(0, Math.min(n - 2, i)); const j = r.closed ? (i + 1) % n : i + 1, t = u - Math.floor(u); return { x: r.pts[i][0] + (r.pts[j][0] - r.pts[i][0]) * t, z: r.pts[i][1] + (r.pts[j][1] - r.pts[i][1]) * t, h: r.h[i] + (r.h[j] - r.h[i]) * t, tx: r.tx[i], tz: r.tz[i] }; };
  let race = null;
  const finishMarker = new THREE.Group(); group.add(finishMarker); finishMarker.visible = false;
  { const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 120, 16, 1, true).translate(0, 60, 0), new THREE.MeshBasicMaterial({ color: 0xff3040, transparent: true, opacity: 0.35, depthWrite: false })); finishMarker.add(beam);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(8, 0.35, 8, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3040 })); ring.position.y = 0.4; finishMarker.add(ring); }

  // ---------------------------------------------------------------- boat and air courses
  const courses = [];
  { // boat: an oval of buoys in the bay south of Port Ruby
    const cx = HARBOUR.cx + 150, cz = HARBOUR.cz + 330, cps = [];
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + Math.PI / 2; let x = cx + Math.cos(a) * 420, z = cz + Math.sin(a) * 170; if (terrainHeight(x, z) > -3) z += 60; cps.push({ x, z, y: WATER_LEVEL, r: 18, kind: 'sea', modes: ['boat'], label: `Buoy ${k + 1}/10` }); }
    cps.push({ ...cps[0], label: 'Finish' });
    courses.push({ id: 'boatrace', name: 'Boat race · Port Ruby bay', desc: 'Ten buoys around the bay south of Port Ruby, in the boat. Gold, silver and bronze times.', cps, gold: 95, silver: 120, bronze: 150, start: { x: cx, z: cz - 170 - 40 } });
    // air: rings weaving between the peaks
    const pts = [[0, -1150], [180, -1300], [380, -1380], [560, -1300], [640, -1150], [500, -1000], [300, -980], [120, -1060], [-60, -1200], [-120, -1400], [80, -1550], [300, -1600]];
    const acps = pts.map(([x, z], k) => { let m = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) m = Math.max(m, terrainHeight(x + a * 40, z + b * 40)); return { x, z, y: m + 60, r: 30, kind: 'air', modes: ['plane'], label: `Ring ${k + 1}/${pts.length}` }; });
    courses.push({ id: 'airrace', name: 'Air race · Silverpine Peaks', desc: 'Twelve rings through the peaks, in the plane. Stay low and fast for gold.', cps: acps, gold: 110, silver: 140, bronze: 180 });
  }

  const api = {
    traps, jumps, rivals,
    get race() { return race; },
    list() { return courses.map((c) => ({ id: c.id, name: c.name, desc: `${c.desc}${ch.medals[c.id] ? ` Best: ${ch.medals[c.id].medal} (${ch.medals[c.id].t.toFixed(1)} s).` : ''}` })); },
    start(id) {
      const c = courses.find((q) => q.id === id); if (!c) return;
      missions.startCustom({ id: 'job-' + id, job: true, name: c.name, limit: c.bronze * 2.2, cps: c.cps.map((p) => ({ ...p })),
        pay: (t) => { const medal = t <= c.gold ? 'Gold' : t <= c.silver ? 'Silver' : t <= c.bronze ? 'Bronze' : null; const prev = ch.medals[id]; if (!prev || t < prev.t) { ch.medals[id] = { t, medal: medal || 'Finished' }; saveSettings(); } toast(`${c.name}: ${t.toFixed(1)} s · ${medal || 'no medal'} (gold ${c.gold} s)`); return medal === 'Gold' ? 1200 : medal === 'Silver' ? 700 : medal === 'Bronze' ? 400 : 100; } });
      toast(`${c.name}: head for the first ${c.cps[0].kind === 'air' ? 'ring' : 'buoy'}`);
    },
    // the player flashed their lights
    flash(veh) {
      if (race) return;
      for (const rv of rivals) {
        if (!rv.r) continue;
        const p = rv.m.position, dx = p.x - veh.pos.x, dz = p.z - veh.pos.z, d = Math.hypot(dx, dz);
        const f = new THREE.Vector3(0, 0, 1).applyQuaternion(veh.q);
        if (d < 40 && (dx * f.x + dz * f.z) > 0) {
          // finish: ~1.5 km up the rival's road (or as far as it goes)
          let u = rv.u + rv.dir * 500; if (!rv.r.closed) u = Math.max(3, Math.min(rv.r.n - 4, u));
          const fin = sample(rv.r, u);
          race = { rv, fin, uEnd: u, t: 0, count: 2.5 };
          finishMarker.position.set(fin.x, fin.h, fin.z); finishMarker.visible = true;
          toast(`Street race! First to the red beam ${(Math.hypot(fin.x - veh.pos.x, fin.z - veh.pos.z) / 1000).toFixed(1)} km up the road`);
          return true;
        }
      }
      return false;
    },
    update(dt, { veh, mode, onGround, ride, others = [], parked = null }) {
      if (!model && !loading && loadModel && rivals.some((rv) => Math.hypot(rv.m.position.x - veh.pos.x, rv.m.position.z - veh.pos.z) < 600)) { loading = true; loadModel().then((g) => { if (!g) return; model = g.scene; for (const rv of rivals) { group.remove(rv.m); const old = rv.m; rv.m = mesh(rv.idx); rv.m.position.copy(old.position); rv.m.quaternion.copy(old.quaternion); group.add(rv.m); } }).catch(() => {}); }
      const pos = veh.pos, spd = veh.vel.length();
      // rivals
      for (const rv of rivals) {
        if (!rv.r || Math.hypot(rv.m.position.x - pos.x, rv.m.position.z - pos.z) > 1500 && !(race && race.rv === rv)) spawnRival(rv, pos);
        if (!rv.r) continue;
        const r = rv.r, here = sample(r, rv.u), look = sample(r, rv.u + rv.dir * (race && race.rv === rv ? 18 : 10));
        const turn = Math.abs(Math.atan2(here.tx * look.tz - here.tz * look.tx, here.tx * look.tx + here.tz * look.tz));
        const racing = race && race.rv === rv && race.count <= 0;
        const vmax = racing ? 48 : 24, vt = Math.min(vmax, (racing ? 7 : 4) + (racing ? 14 : 9) / Math.max(0.04, turn));
        // whatever is ahead in our lane (traffic, the other rivals, you, the parked roadster): keep a gap, stop if need be;
        // while street racing, swing out into the other lane to get past
        let vgap = vmax; { const hx = here.tx * rv.dir, hz = here.tz * rv.dir, mp = rv.m.position;
          const check = (q) => { const dx = q.x - mp.x, dz = q.z - mp.z, along = dx * hx + dz * hz; if (along <= 0 || along > 40 || Math.abs(q.y - mp.y) > 4) return; const lat = dx * -hz + dz * hx;
            if (Math.abs(lat - 0) < 2.3) vgap = Math.min(vgap, Math.max(0, (along - 7) * (racing ? 0.9 : 0.55))); };
          for (const c of others) check(c.mesh.position);
          for (const o of rivals) if (o !== rv && o.r) check(o.m.position);
          check(pos); if (parked) check(parked);
          rv.blocked = vgap < vt - 2; }
        if (racing && rv.blocked) rv.passT = 3; rv.passT = Math.max(0, (rv.passT || 0) - dt);   // stay out until well past
        rv.laneT = racing && rv.passT > 0 ? -1.9 : 1.9; rv.lane = rv.lane ?? 1.9; rv.lane += Math.max(-2.5 * dt, Math.min(2.5 * dt, rv.laneT - rv.lane));
        const vt2 = racing && rv.passT > 0 && rv.lane < 0 ? vt : Math.min(vt, vgap);
        if (race && race.rv === rv && race.count > 0) rv.v = Math.max(0, rv.v - dt * 8); else rv.v += Math.max(-10 * dt, Math.min((racing ? 6 : 2.5) * dt, vt2 - rv.v));
        rv.u += rv.dir * rv.v * dt / 3;
        if (!r.closed && (rv.u < 2 || rv.u > r.n - 3)) {
          // end of the road: turn onto the road it joins (a U-turn only at a real dead end)
          const nx = continueAtEnd(r, rv.u < 2 ? 0 : r.n - 1, (q) => mains().includes(q));
          if (nx && !(race && race.rv === rv)) { rv.r = nx.road; rv.u = nx.u; rv.dir = nx.dir; rv.v = Math.min(rv.v, 9); rv.turnT = 1.6; }
          else { rv.dir *= -1; rv.u = Math.max(2.1, Math.min(r.n - 3.1, rv.u)); }
        }
        const r2 = rv.r;   // (may have changed at a junction)
        if (r2.closed) rv.u = ((rv.u % r2.n) + r2.n) % r2.n;
        const s = sample(r2, rv.u), lane = rv.lane ?? 1.9;
        if (rv.turnT > 0) { rv.turnT -= dt; const k = 1 - Math.exp(-dt * 4.5); rv.m.position.x += (s.x - s.tz * rv.dir * lane - rv.m.position.x) * k; rv.m.position.z += (s.z + s.tx * rv.dir * lane - rv.m.position.z) * k; rv.m.position.y = s.h + 0.03; }
        else rv.m.position.set(s.x - s.tz * rv.dir * lane, s.h + 0.03, s.z + s.tx * rv.dir * lane);
        // heading eases round (a dead end is a proper three-point-ish turn, not a snap); pitch follows the road
        const want = Math.atan2(s.tx * rv.dir, s.tz * rv.dir); let dy = want - rv.m.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        rv.m.rotation.y += Math.max(-1.6 * dt, Math.min(1.6 * dt, dy));
        if (Math.abs(dy) > 0.6) rv.v = Math.min(rv.v, 2.5);   // slow right down while turning round at a dead end
        const ah = sample(r2, rv.u + rv.dir * 1.2); rv.m.rotation.x = -Math.atan2(ah.h - s.h, 3.6);
      }
      // the street race
      if (race) {
        race.t += dt;
        if (race.count > 0) { race.count -= dt; if (race.count <= 0) toast('GO!'); }
        const dP = Math.hypot(pos.x - race.fin.x, pos.z - race.fin.z), rv = race.rv, dR = Math.hypot(rv.m.position.x - race.fin.x, rv.m.position.z - race.fin.z);
        const done = (msg, win) => { toast(msg); finishMarker.visible = false; if (win) { econ && econ.earn(600, 'Street race win'); stats && stats.event('streetwins', 1); } race = null; };
        if (dP < 14) done('You beat them to the line!', true);
        else if (dR < 10 || (!rv.r.closed && Math.abs(rv.u - race.uEnd) < 2)) done('They got there first…', false);
        else if (race.t > 240 || dP > 4000) done('Street race abandoned', false);
      }
      // speed traps
      if (mode === 'car' || ride) for (const t of traps) {
        t.cool -= dt; if (t.cool > 0) continue;
        if (Math.hypot(pos.x - t.x, pos.z - t.z) < 12) {
          t.cool = 8; const kmh = Math.round(spd * 3.6), best = ch.traps[t.id] || 0;
          if (kmh > best) { ch.traps[t.id] = kmh; saveSettings(); }
          toast(`📸 ${t.name}: ${kmh} km/h${kmh > best ? ' · personal best' : ` · best ${best}`}${kmh > t.record ? ' · beat the local record!' : ` · record ${t.record}`}`);
          if (kmh > t.record && best <= t.record) econ && econ.earn(250, 'Speed trap record');
        }
      }
      // jumps: distance from take-off to landing (car)
      if (mode === 'car' && !ride) {
        if (!onGround && spd > 8) { if (!air) air = { x: pos.x, z: pos.z, t: 0 }; air.t += dt; }
        else if (air) { const d = Math.hypot(pos.x - air.x, pos.z - air.z); if (air.t > 0.6 && d > 8) { const nb = d > ch.jump; if (nb) { ch.jump = d; saveSettings(); } toast(`Jump: ${d.toFixed(1)} m${nb ? ' · longest yet!' : ` · record ${ch.jump.toFixed(1)} m`}`); if (nb && d > 30) econ && econ.earn(Math.round(d * 5), 'Jump record'); } air = null; }
      }
    },
    // colliders for the rivals near the player
    near(pos, out) { for (const rv of rivals) if (Math.hypot(rv.m.position.x - pos.x, rv.m.position.z - pos.z) < 30) { const f = new THREE.Vector3(Math.sin(rv.m.rotation.y), 0, Math.cos(rv.m.rotation.y)); out.push({ x: rv.m.position.x + f.x, z: rv.m.position.z + f.z, r: 1.0, owner: { imp: { x: 0, z: 0 } } }, { x: rv.m.position.x - f.x, z: rv.m.position.z - f.z, r: 1.0, owner: { imp: { x: 0, z: 0 } } }); } return out; },
  };
  return api;
}
