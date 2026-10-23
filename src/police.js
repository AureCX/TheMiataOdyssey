// Police: speeding through a town, running a red light, hitting people or ramming traffic raises the wanted level
// (1–3 stars). Patrol cars with flashing light bars and sirens come after you, more of them and faster at higher
// levels. Stop near one for a couple of seconds and you're fined; get far enough away for long enough, or take to the
// air or the water, and they lose you.
import * as THREE from 'three';
import { RBox } from './shapes.js';
import { groundHeight, townAt, nearestRoadPoint } from './world.js';
import { createTrafficCar } from './car.js';

// a patrol car: white saloon, light bar, blue stripes (also used for your police career)
export function buildPoliceCar() {
  const m = createTrafficCar(0xf2f3f5, 1);
  // light bar and a blue door stripe
  const red = new THREE.MeshBasicMaterial({ color: 0xff1a1a }), blue = new THREE.MeshBasicMaterial({ color: 0x1a4dff });
  const bar = new THREE.Group(); bar.position.set(0, 1.47, -0.2); m.add(bar);
  const base = new THREE.Mesh(new RBox(1.2, 0.08, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222 })); bar.add(base);
  const l = new THREE.Mesh(new RBox(0.55, 0.14, 0.26), red); l.position.set(0.32, 0.1, 0); bar.add(l);
  const r = new THREE.Mesh(new RBox(0.55, 0.14, 0.26), blue); r.position.set(-0.32, 0.1, 0); bar.add(r);
  for (const s of [1, -1]) { const st = new THREE.Mesh(new RBox(0.02, 0.22, 3.4), new THREE.MeshStandardMaterial({ color: 0x1f3f9f })); st.position.set(s * 0.93, 0.62, 0); m.add(st); }
  m.userData.lights = { red, blue };
  return m;
}

export function createPolice({ scene, audio, toast, econ }) {
  let wanted = 0, heat = 0, lostT = 0, bustT = 0, speedT = 0, cool = 0;
  const cars = [];
  const tmp = new THREE.Vector3();

  function makeCar() {
    const m = buildPoliceCar();
    scene.add(m);
    return { m, speed: 0, imp: { x: 0, z: 0 }, col: [{ x: 0, z: 0, r: 1.2 }, { x: 0, z: 0, r: 1.2 }], offset: (Math.random() - 0.5) * 6 };
  }

  function spawn(player) {
    // on the nearest road, 220–320 m away, behind the player if possible
    const ang = Math.random() * Math.PI * 2, d = 220 + Math.random() * 100;
    const rp = nearestRoadPoint(player.x + Math.sin(ang) * d, player.z + Math.cos(ang) * d) || { x: player.x + Math.sin(ang) * d, z: player.z + Math.cos(ang) * d };
    const c = makeCar(); c.m.position.set(rp.x, groundHeight(rp.x, rp.z), rp.z); c.m.rotation.y = Math.atan2(player.x - rp.x, player.z - rp.z);
    for (const o of c.col) o.owner = c;
    cars.push(c);
  }
  function clear() { for (const c of cars) scene.remove(c.m); cars.length = 0; }

  const api = {
    get wanted() { return wanted; },
    get cars() { return cars; },
    report(level, why) {
      if (cool > 0) return;
      const was = wanted; wanted = Math.min(3, Math.max(wanted, level)); heat = Math.min(3, heat + 1);
      if (wanted > was) { toast(`${'★'.repeat(wanted)} Police: ${why}`); lostT = 0; }
    },
    // per frame. veh: player vehicle; mode; onGround
    update(dt, veh, mode, airborne) {
      cool = Math.max(0, cool - dt);
      const p = veh.pos, spd = veh.vel.length();
      // speeding in town (over ~80 km/h for a moment)
      if (mode === 'car' && townAt(p.x, p.z) && spd > 22.5) { speedT += dt; if (speedT > 1.2) { api.report(1, 'speeding in town'); speedT = 0; } } else speedT = Math.max(0, speedT - dt);
      if (!wanted) { if (cars.length) clear(); audio.siren(0); return; }
      // keep the right number of cars on you
      const want = wanted === 1 ? 1 : wanted === 2 ? 2 : 3;
      if (cars.length < want && Math.random() < dt * 0.6) spawn(p);
      const vmax = [0, 34, 40, 47][wanted];
      let nearest = 1e9;
      const t = performance.now() / 1000;
      for (const c of cars) {
        const m = c.m, dx = p.x - m.position.x, dz = p.z - m.position.z, d = Math.hypot(dx, dz);
        nearest = Math.min(nearest, d);
        // pursue: aim a little ahead of the player and to one side, so they don't all stack up
        const lead = Math.min(1.2, d / 30);
        const tx = p.x + veh.vel.x * lead + Math.cos(m.rotation.y) * c.offset, tz = p.z + veh.vel.z * lead - Math.sin(m.rotation.y) * c.offset;
        const want = Math.atan2(tx - m.position.x, tz - m.position.z);
        let dh = want - m.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        const turn = Math.min(1, 2.6 / Math.max(4, c.speed * 0.25));
        m.rotation.y += Math.max(-turn * dt * 2.2, Math.min(turn * dt * 2.2, dh));
        const target = Math.min(vmax, d < 12 ? spd * 0.9 : d * 0.9 + 8) * (Math.abs(dh) > 1.2 ? 0.45 : 1);
        c.speed += Math.max(-12 * dt, Math.min(7 * dt, target - c.speed));
        // knocked by the player
        if (Math.abs(c.imp.x) + Math.abs(c.imp.z) > 1) { m.position.x += c.imp.x / 1500 * 0.05; m.position.z += c.imp.z / 1500 * 0.05; c.speed *= 0.6; c.imp.x = c.imp.z = 0; }
        m.position.x += Math.sin(m.rotation.y) * c.speed * dt; m.position.z += Math.cos(m.rotation.y) * c.speed * dt;
        // don't drive into the player: hold a car length back
        const nd = Math.hypot(p.x - m.position.x, p.z - m.position.z);
        if (nd < 4.4) { m.position.x -= (p.x - m.position.x) / nd * (4.4 - nd); m.position.z -= (p.z - m.position.z) / nd * (4.4 - nd); }
        m.position.y += (groundHeight(m.position.x, m.position.z) - m.position.y) * Math.min(1, dt * 10);
        const f = Math.sin(m.rotation.y), g = Math.cos(m.rotation.y);
        c.col[0].x = m.position.x + f * 1.1; c.col[0].z = m.position.z + g * 1.1; c.col[1].x = m.position.x - f * 1.1; c.col[1].z = m.position.z - g * 1.1;
        const ph = (t * 6 + c.offset) % 2 < 1;
        m.userData.lights.red.color.setRGB(ph ? 3 : 0.2, 0.05, 0.05); m.userData.lights.blue.color.setRGB(0.05, 0.1, ph ? 0.2 : 3);
        m.userData.head.emissiveIntensity = 2;
      }
      audio.siren(Math.min(1, 60 / (nearest + 20)));
      // busted: a patrol car right by you while you're (nearly) stopped
      if (nearest < 8 && spd < 2.5 && !airborne) { bustT += dt; if (bustT > 2.2) { const fine = 250 * wanted; econ.fine(fine, `Busted! ${'★'.repeat(wanted)} fine`); wanted = 0; heat = 0; bustT = 0; cool = 20; clear(); audio.siren(0); return; } } else bustT = Math.max(0, bustT - dt);
      // escape: far away for a while, or in the air / on the water where they can't follow
      const out = mode === 'plane' || mode === 'boat' || airborne;
      if ((cars.length && nearest > 380) || out) { lostT += dt; if (lostT > (out ? 6 : 10)) { toast(out ? 'The police can’t follow you up there · lost them' : 'You lost the police'); if (wanted >= 3 && api.onEscape) api.onEscape(); wanted = 0; heat = 0; lostT = 0; cool = 8; clear(); audio.siren(0); } } else lostT = Math.max(0, lostT - dt * 0.5);
    },
    near(player, out) { for (const c of cars) for (const o of c.col) if (Math.hypot(o.x - player.x, o.z - player.z) < 30) out.push(o); return out; },
    get busting() { return bustT; },
    get losing() { return lostT; },
  };
  return api;
}
