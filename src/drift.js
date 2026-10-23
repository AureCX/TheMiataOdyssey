// Drift scoring and ghost cars.
// Drift: sliding at speed scores points (angle × speed); keep linking slides to build a multiplier (up to ×5); a
// pause of 1.5 s banks the chain, a crash loses it. On the mountain pass there's a marked drift zone: the score you
// bank between its arches pays out and the best is kept.
// Ghosts: a lap is recorded at 10 Hz; when it's your best, it is saved and replayed as a translucent car next time.
import * as THREE from 'three';
import { RBox } from './shapes.js';
import { roads, groundHeight } from './world.js';
import { createTrafficCar } from './car.js';

export function createDrift({ scene, toast, settings, saveSettings, onReward }) {
  const f = new THREE.Vector3();
  const st = { chain: 0, mult: 1, held: 0, idle: 0, active: false, total: 0, zone: null, zoneScore: 0 };
  settings.drift = settings.drift || { best: 0, zoneBest: 0 };

  // the drift zone: the twistiest stretch of the mountain pass
  const pass = roads.find((r) => r.name === 'Mountain pass');
  let zone = null;
  if (pass) {
    let best = 0, bi = 0; const span = 120;   // samples (~360 m)
    for (let i = 0; i + span < pass.n; i += 4) { let t = 0; for (let k = i; k < i + span; k++) { const a = Math.atan2(pass.tx[k], pass.tz[k]), b = Math.atan2(pass.tx[k + 1], pass.tz[k + 1]); t += Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))); } if (t > best) { best = t; bi = i; } }
    zone = { road: pass, i0: bi, i1: bi + span };
    const arch = (i, color) => {
      const g = new THREE.Group(), [x, z] = pass.pts[i], h = pass.h[i], yaw = Math.atan2(pass.tx[i], pass.tz[i]);
      g.position.set(x, h, z); g.rotation.y = yaw; scene.add(g);
      const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 });
      for (const s of [1, -1]) { const p = new THREE.Mesh(new RBox(0.4, 5, 0.4), m); p.position.set(s * (pass.hw + 1.2), 2.5, 0); g.add(p); }
      const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x2 = c.getContext('2d'); x2.fillStyle = '#111'; x2.fillRect(0, 0, 512, 96); x2.fillStyle = '#fff'; x2.font = '700 64px "Barlow Condensed", Arial'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText(color === 0x2fbf5a ? 'DRIFT ZONE' : 'DRIFT ZONE END', 256, 52);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      for (const r of [0, Math.PI]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(pass.hw * 2 + 2.8, 1.1), new THREE.MeshStandardMaterial({ map: t })); b.position.set(0, 5.2, r ? -0.21 : 0.21); b.rotation.y = r; g.add(b); }
      const beam = new THREE.Mesh(new RBox(pass.hw * 2 + 3, 0.4, 0.4), m); beam.position.y = 5.2; g.add(beam);
    };
    arch(zone.i0, 0x2fbf5a); arch(zone.i1, 0xc8102e);
  }
  const zoneIndex = (pos) => {
    if (!zone) return -1;
    let b = -1, bd = 1e9; for (let i = zone.i0 - 10; i <= zone.i1 + 10; i++) { const p = pass.pts[i]; if (!p) continue; const d = (p[0] - pos.x) ** 2 + (p[1] - pos.z) ** 2; if (d < bd) { bd = d; b = i; } }
    return bd < 18 * 18 ? b : -1;
  };

  const api = {
    zone,
    get state() { return st; },
    // a crash ends the chain without banking it
    crash() { if (st.chain > 200) toast(`Drift chain lost (${Math.round(st.chain)})`); st.chain = 0; st.mult = 1; st.held = 0; },
    update(dt, veh, mode, onGround) {
      // the drift zone: enter at the green arch heading up the pass, finish at the red one
      const zi = mode === 'car' ? zoneIndex(veh.pos) : -1;
      if (!st.zone && zi >= 0 && zi <= zone.i0 + 3 && zi >= zone.i0 - 3) { st.zone = { t: 0 }; st.zoneScore = 0; toast('Drift zone · link your slides!'); }
      if (st.zone) {
        st.zone.t += dt;
        if (zi < 0 || mode !== 'car') { toast('Left the drift zone'); st.zone = null; }
        else if (zi >= zone.i1) {
          const sc = Math.round(st.zoneScore + st.chain * st.mult); st.chain = 0; st.mult = 1;
          const nb = sc > settings.drift.zoneBest; if (nb) { settings.drift.zoneBest = sc; saveSettings(); }
          toast(`Drift zone: ${sc.toLocaleString('en-US')} pts${nb ? ' · new best!' : ` · best ${settings.drift.zoneBest.toLocaleString('en-US')}`}`);
          if (sc > 0) onReward && onReward(Math.min(2500, sc / 25), 'Drift zone');
          st.zone = null;
        }
      }
      // scoring
      const spd = Math.hypot(veh.vel.x, veh.vel.z);
      f.set(0, 0, 1).applyQuaternion(veh.q); f.y = 0; f.normalize();
      const ang = spd > 0.5 ? Math.acos(Math.max(-1, Math.min(1, (f.x * veh.vel.x + f.z * veh.vel.z) / spd))) * 180 / Math.PI : 0;
      const drifting = mode === 'car' && onGround && spd > 8 && ang > 12 && ang < 75;
      st.active = drifting;
      if (drifting) {
        st.idle = 0; st.held += dt;
        st.chain += dt * spd * ang * 0.35;
        if (st.held > 2) { st.mult = Math.min(5, st.mult + 0.5); st.held = 0; }
      } else if (st.chain > 0) {
        st.idle += dt; st.held = 0;
        if (st.idle > 1.5) {
          const sc = Math.round(st.chain * st.mult);
          if (st.zone) st.zoneScore += sc;
          if (sc > 300) { toast(`Drift ${sc.toLocaleString('en-US')} pts${st.mult > 1 ? ` (×${st.mult})` : ''}`); }
          st.total += sc; if (sc > settings.drift.best) { settings.drift.best = sc; saveSettings(); }
          st.chain = 0; st.mult = 1;
        }
      }
      return st;
    },
  };
  return api;
}

// ghost laps: record while a lap runs, keep the best (saved), replay it
export function createGhosts({ scene, settings, saveSettings }) {
  settings.ghosts = settings.ghosts || {};
  const car = createTrafficCar(0x3fa9ff, 0);
  car.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.38; o.material.depthWrite = false; o.castShadow = false; } });
  car.visible = false; scene.add(car);
  let rec = null;
  const e = new THREE.Euler(), q = new THREE.Quaternion();
  return {
    // start recording a lap for `id`
    start(id) { rec = { id, data: [], next: 0 }; },
    stop() { rec = null; car.visible = false; },
    // t: seconds into the current lap
    record(t, veh) {
      if (!rec || t < rec.next) return;
      rec.next = t + 0.1;
      e.setFromQuaternion(veh.q, 'YXZ');
      rec.data.push(Math.round(veh.pos.x * 10) / 10, Math.round(veh.pos.y * 10) / 10, Math.round(veh.pos.z * 10) / 10, Math.round(e.y * 1000) / 1000, Math.round(e.x * 1000) / 1000, Math.round(e.z * 1000) / 1000);
    },
    // lap finished in `time`: keep it if it's the best; then start recording the next one
    lap(time) {
      if (!rec) return false;
      const g = settings.ghosts[rec.id];
      const best = !g || time < g.time;
      if (best && rec.data.length > 20) { settings.ghosts[rec.id] = { time, data: rec.data }; saveSettings(); }
      rec = { id: rec.id, data: [], next: 0 };
      return best;
    },
    best(id) { const g = settings.ghosts[id]; return g ? g.time : null; },
    // show the saved ghost at lap time t
    play(id, t) {
      const g = settings.ghosts[id];
      if (!g) { car.visible = false; return; }
      const d = g.data, n = d.length / 6, f = Math.min(n - 1.001, t * 10), i = Math.floor(f), k = f - i;
      if (i < 0 || i >= n - 1) { car.visible = false; return; }
      const a = i * 6, b = a + 6;
      car.position.set(d[a] + (d[b] - d[a]) * k, d[a + 1] + (d[b + 1] - d[a + 1]) * k - 0.42, d[a + 2] + (d[b + 2] - d[a + 2]) * k);
      let dy = d[b + 3] - d[a + 3]; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      car.quaternion.setFromEuler(e.set(d[a + 4], d[a + 3] + dy * k, d[a + 5], 'YXZ'));
      car.visible = true;
    },
    hide() { car.visible = false; },
  };
}
