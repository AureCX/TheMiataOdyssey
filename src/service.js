// Wear and tear on the road: sharp rocks and gravel (and hard knocks) can puncture a tyre: it loses grip, drags and
// pulls the car to that side. A badly damaged engine drops into limp mode (much less power). Call roadside
// assistance from the pause menu: a breakdown van comes to you, changes flat tyres, patches the engine up to get you
// home, straightens a loose wheel and leaves you 10 L of fuel.
import * as THREE from 'three';
import { RBox } from './shapes.js';
import { roads } from './world.js';
import { createTrafficCar } from './car.js';

const WHEEL = ['front left', 'front right', 'rear left', 'rear right'];

export function createService({ scene, toast, econ }) {
  let van = null, limpWarned = false;
  const tmp = new THREE.Vector3();
  const api = {
    get busy() { return !!van; },
    // damage hit (0..1+) from a crash: a chance of a puncture on the nearest wheel
    knock(veh, sev, local) {
      if (sev < 0.3 || Math.random() > 0.35) return;
      const i = local ? (local.z > 0 ? 0 : 2) + (local.x > 0 ? 0 : 1) : (Math.random() * 4) | 0;
      api.puncture(veh, i);
    },
    puncture(veh, i) { if (veh.dmg.flat[i] || veh.dmg.lost[i]) return; veh.dmg.flat[i] = true; toast(`Puncture · ${WHEEL[i]} tyre! (pause menu → roadside assistance)`); },
    cost(veh) { return 150 + veh.dmg.flat.filter(Boolean).length * 60 + Math.round((1 - veh.dmg.engine) * 300); },
    call(veh) {
      if (van) { toast('Assistance is on its way'); return; }
      const c = api.cost(veh);
      if (econ && !econ.spend(c)) { toast(`Roadside assistance costs $${c} · not enough cash`); return; }
      // the van comes along the nearest road from 120 m back
      let best = null, bd = 1e18;
      for (const r of roads) { if (r.type === 'rail') continue; for (let i = 0; i < r.n; i += 2) { const d = (r.pts[i][0] - veh.pos.x) ** 2 + (r.pts[i][1] - veh.pos.z) ** 2; if (d < bd) { bd = d; best = { r, i }; } } }
      const m = createTrafficCar(0xf2c200, 4); scene.add(m);
      const lamp = new THREE.Mesh(new RBox(1.2, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0xffa000 })); lamp.position.y = m.userData.H ? m.userData.H + 0.1 : 2.3; m.add(lamp);
      const path = [];
      if (best && Math.sqrt(bd) < 150) { const { r, i } = best; for (let k = 40; k >= 0; k -= 2) { const j = Math.max(0, Math.min(r.n - 1, i - k)); path.push([r.pts[j][0] - r.tz[j] * 1.9, r.h[j], r.pts[j][1] + r.tx[j] * 1.9]); } }
      else { for (let k = 6; k >= 0; k--) path.push([veh.pos.x - 15 * k, veh.pos.y, veh.pos.z - 15 * k]); }
      // stop 7 m short of you
      const end = path[path.length - 1], dx = veh.pos.x - end[0], dz = veh.pos.z - end[2], dl = Math.hypot(dx, dz) || 1;
      path.push([veh.pos.x - dx / dl * 7, veh.pos.y - 0.4, veh.pos.z - dz / dl * 7]);
      van = { m, path, k: 0, t: 0, phase: 'drive', lamp };
      toast(`Roadside assistance called ($${c}) · the van is on its way`);
    },
    update(dt, veh) {
      // limp mode warning
      if (veh.dmg.engine < 0.3 && !limpWarned) { limpWarned = true; toast('Engine in LIMP MODE · reduced power · get it to a garage or call assistance'); }
      if (veh.dmg.engine >= 0.3) limpWarned = false;
      if (!van) return null;
      van.t += dt; van.lamp.visible = (van.t * 2.5) % 1 < 0.5;
      if (van.phase === 'drive') {
        van.k = Math.min(van.path.length - 1, van.k + dt * 1.6);
        const i = Math.floor(van.k), f = van.k - i, a = van.path[i], b = van.path[Math.min(i + 1, van.path.length - 1)];
        van.m.position.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f + 0.03, a[2] + (b[2] - a[2]) * f);
        if (Math.hypot(b[0] - a[0], b[2] - a[2]) > 0.1) van.m.rotation.y = Math.atan2(b[0] - a[0], b[2] - a[2]);
        if (van.k >= van.path.length - 1) { van.phase = 'work'; van.t = 0; toast('The mechanic is on it…'); }
      } else if (van.phase === 'work') {
        if (van.t > 6) {
          veh.dmg.flat.fill(false); veh.dmg.loose.fill(false); veh.dmg.engine = Math.max(veh.dmg.engine, 0.75);
          for (let i = 0; i < 4; i++) { veh.dmg.toe[i] *= 0.3; veh.dmg.bend[i] *= 0.3; }
          if (veh.fuel < 10) veh.fuel = 10;
          toast('All fixed up · drive safe! (a garage can do a full repair)');
          van.phase = 'leave'; van.t = 0;
        }
      } else { van.m.position.addScaledVector(tmp.set(Math.sin(van.m.rotation.y), 0, Math.cos(van.m.rotation.y)), -dt * 8); if (van.t > 6) { scene.remove(van.m); van = null; } }
      return van ? van.phase : null;
    },
    // a chance of a puncture on sharp ground: per wheel, per second, scaled by speed
    roadHazards(dt, veh, mode) {
      if (mode !== 'car') return;
      const spd = veh.vel.length(); if (spd < 12) return;
      veh.wheels.forEach((w, i) => { const p = w.surface === 'rock' ? 0.006 : w.surface === 'gravel' ? 0.0012 : 0; if (p && w.contact && Math.random() < p * dt * spd / 20) api.puncture(veh, i); });
    },
  };
  return api;
}
