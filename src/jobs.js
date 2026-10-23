// Paid jobs, run through the mission system as generated routes:
// - Passenger flight: board at Pilou International (plane, stopped at the stand), fly to Mesa Field or Port Ruby's
//   seaplane base; paid by distance, speed and how gently you touched down.
// - Taxi: pick up a fare on a town pavement and drop them across town or in another town.
// - Pizza: collect three pizzas at Luigi's in Fairfield and deliver them before they go cold.
// - Towing: find a broken-down car on a main road, hook it up, and tow it to the nearest garage.
import * as THREE from 'three';
import { TOWNS, AIRPORT, AIRSTRIP, SEAPLANE, SHOP_LOTS, roads, groundHeight } from './world.js';
import { GARAGES } from './towns.js';
import { createTrafficCar } from './car.js';

const rnd = (a) => a[(Math.random() * a.length) | 0];

export function createJobs({ scene, missions, toast }) {
  let towed = null, landing = { maxVs: 0, armed: false };
  const tmp = new THREE.Vector3();

  const walkPoint = (town) => { const w = rnd(town.walks); return { x: w.cx, z: w.cz, y: w.top }; };
  const nearestTown = (pos) => TOWNS.reduce((b, t) => (!b || Math.hypot(t.x - pos.x, t.z - pos.z) < Math.hypot(b.x - pos.x, b.z - pos.z) ? t : b), null);

  const defs = {
    flight(pos) {
      const dests = [
        { name: 'Mesa Field', x: AIRSTRIP.stand.x, z: AIRSTRIP.stand.z, y: AIRSTRIP.h, r: 16, modes: ['plane'], label: 'Mesa Field · stop on the apron' },
        { name: 'Port Ruby seaplane base', x: SEAPLANE.buoy.x, z: SEAPLANE.buoy.z, y: 0, r: 26, modes: ['plane', 'boat'], label: 'Port Ruby seaplane base · land on the water by the buoys' },
      ];
      const d = rnd(dests), stand = { x: -420, z: AIRPORT.gates[2] + 25, y: AIRPORT.h };
      const dist = Math.hypot(d.x - stand.x, d.z - stand.z);
      landing = { maxVs: 0, armed: false };
      return { id: 'job-flight', job: true, name: `Pilou Air flight to ${d.name}`, limit: 420,
        cps: [{ ...stand, r: 14, kind: 'ground', stop: true, modes: ['plane'], dwell: 4, dwellMsg: 'Passengers boarding…', label: 'Gate 3 stand · stop in the marker (plane)', msg: 'Passengers on board: take off!' },
          { ...d, kind: 'ground', stop: true, dwell: 2, dwellMsg: 'Passengers disembarking…' }],
        onReach(k) { if (k === 0) landing = { maxVs: 0, armed: true }; },
        pay(t) {
          const base = 350 + dist * 0.55, quick = Math.max(0, 1 - t / 240) * 250;
          const vs = landing.maxVs, soft = vs < 2 ? 200 : vs < 3.5 ? 80 : vs < 5 ? 0 : -150;
          toast(`Touchdown ${vs.toFixed(1)} m/s · ${vs < 2 ? 'butter!' : vs < 3.5 ? 'smooth' : vs < 5 ? 'firm' : 'passengers shaken'}`);
          return (base + quick + soft) * (api.pilot ? api.pilot.payFactor() : 1);
        },
        onEnd(ok) { if (ok && api.pilot) api.pilot.flightDone(); } };
    },
    taxi(pos) {
      const from = nearestTown(pos);
      const others = TOWNS.filter((t) => t !== from && t.walks.length);
      const to = Math.random() < 0.45 || !others.length ? from : rnd(others);
      const a = walkPoint(from); let b = walkPoint(to);
      for (let k = 0; k < 10 && to === from && Math.hypot(a.x - b.x, a.z - b.z) < 150; k++) b = walkPoint(to);
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      const limit = 40 + dist / 11;
      return { id: 'job-taxi', job: true, name: `Taxi to ${to.name}`, limit: limit + 60,
        cps: [{ ...a, r: 5, kind: 'ground', stop: true, modes: ['car'], dwell: 1.5, dwellMsg: 'Passenger getting in…', label: `Pick up in ${from.name}`, msg: `Fare: "${to === from ? 'Across town, please' : `To ${to.name}, please`}"` },
          { ...b, r: 5, kind: 'ground', stop: true, modes: ['car'], dwell: 1, label: `Drop off in ${to.name}` }],
        pay(t) { return 60 + dist * 0.45 + Math.max(0, limit - t) * 3; } };
    },
    pizza() {
      const L = SHOP_LOTS[0], F = TOWNS.find((t) => t.name === 'Fairfield');
      const drops = []; while (drops.length < 3) { const p = walkPoint(F); if (drops.every((d) => Math.hypot(d.x - p.x, d.z - p.z) > 60) && Math.hypot(p.x - L.pickup.x, p.z - L.pickup.z) > 50) drops.push(p); }
      let start = 0;
      return { id: 'job-pizza', job: true, name: "Luigi's Pizza deliveries", limit: 260,
        cps: [{ x: L.pickup.x, z: L.pickup.z, y: L.h, r: 6, kind: 'ground', stop: true, modes: ['car'], dwell: 2, dwellMsg: 'Loading three pizzas…', label: "Luigi's Pizza · pick up", msg: 'Three pizzas · deliver them hot!' },
          ...drops.map((d, i) => ({ ...d, r: 5, kind: 'ground', stop: true, modes: ['car'], dwell: 1, label: `Delivery ${i + 1} of 3`, msg: i < 2 ? `Delivered · ${2 - i} to go` : null }))],
        onReach(k, ctx) { if (k === 0) start = ctx.time || 0; },
        pay(t) { return 3 * 80 + Math.max(0, 200 - t) * 1.5; } };
    },
    tow(pos) {
      // a breakdown on a main road, 500–1500 m away
      const main = roads.filter((r) => r.type !== 'street' && r.type !== 'track' && r.type !== 'rail' && r.type !== 'gravel');
      let site = null;
      for (let k = 0; k < 60 && !site; k++) {
        const r = rnd(main), i = (Math.random() * r.n) | 0; if (r.bridge[i]) continue;
        const [x, z] = r.pts[i], d = Math.hypot(x - pos.x, z - pos.z);
        if (d > 500 && d < 1500) site = { x: x - r.tz[i] * (r.hw + 2.2), z: z + r.tx[i] * (r.hw + 2.2), yaw: Math.atan2(r.tx[i], r.tz[i]) };
      }
      if (!site) return null;
      const car = createTrafficCar(rnd([0x6b7a8f, 0x8f2a2a, 0x2a5f3a, 0xc7b37a]), Math.random() < 0.5 ? 0 : 1);
      car.position.set(site.x, groundHeight(site.x, site.z), site.z); car.rotation.y = site.yaw; scene.add(car);
      towed = { car, hooked: false, blink: 0 };
      const g = GARAGES.reduce((b, q) => (!b || Math.hypot(q.x - site.x, q.z - site.z) < Math.hypot(b.x - site.x, b.z - site.z) ? q : b), null);
      const dist = Math.hypot(g.x - site.x, g.z - site.z);
      return { id: 'job-tow', job: true, name: `Tow to ${g.name}`, limit: 600,
        cps: [{ x: site.x, z: site.z, r: 8, kind: 'ground', stop: true, modes: ['car'], dwell: 2, dwellMsg: 'Hooking up…', label: 'Broken-down car · stop beside it', msg: 'Hooked up · tow it to the garage (gently!)' },
          { x: g.x, z: g.z, y: g.h, r: 9, kind: 'ground', stop: true, modes: ['car'], dwell: 1, label: `${g.name} workshop` }],
        onReach(k) { if (k === 0 && towed) towed.hooked = true; },
        pay() { return 300 + dist * 0.35; },
        onEnd() { if (towed) { scene.remove(towed.car); towed = null; } } };
    },
  };

  const api = {
    pilot: null,   // the flying career (licence pay factor, flight count), set by main
    list: [
      { id: 'flight', name: 'Passenger flight', desc: 'Board at Pilou International gate 3 (plane), fly to Mesa Field or the Port Ruby seaplane base. Land gently.' },
      { id: 'taxi', name: 'Taxi fare', desc: 'Pick up a fare in the nearest town and drop them off. Quicker is better.' },
      { id: 'pizza', name: 'Pizza delivery', desc: "Three hot pizzas from Luigi's in Fairfield to three addresses." },
      { id: 'tow', name: 'Tow job', desc: 'A car has broken down on a main road. Hook it up and tow it to the nearest garage.' },
    ],
    start(id, pos) {
      if (towed) { scene.remove(towed.car); towed = null; }
      const def = defs[id] && defs[id](pos);
      if (!def) { toast('No job available right now'); return; }
      missions.startCustom(def);
      toast(`${def.name}: ${def.cps[0].label}`);
    },
    // per frame: landing measurement and the towed car following the hitch
    update(dt, veh, mode, onGround) {
      if (landing.armed) {
        if (!onGround) landing.air = true;
        else if (landing.air) { landing.maxVs = Math.max(landing.maxVs, -landing.lastVy || 0); landing.air = false; }
        landing.lastVy = veh.vel.y;
      }
      if (towed) {
        towed.blink += dt;
        const lamp = (towed.blink % 0.8) < 0.4 ? 3 : 0.3;
        towed.car.userData.head.emissiveIntensity = lamp; towed.car.userData.tail.emissiveIntensity = lamp;
        if (towed.hooked) {
          // the hitch is behind the rear bumper; the towed car trails on a 2 m bar
          const f = tmp.set(0, 0, 1).applyQuaternion(veh.q); f.y = 0; f.normalize();
          const hx = veh.pos.x - f.x * 2.6, hz = veh.pos.z - f.z * 2.6;
          const c = towed.car.position, L = towed.car.userData.L / 2 + 2;
          let dx = c.x - hx, dz = c.z - hz; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
          c.x = hx + dx * L; c.z = hz + dz * L; c.y = groundHeight(c.x, c.z);
          towed.car.rotation.y = Math.atan2(-dx, -dz);
        }
      }
    },
    get towing() { return towed && towed.hooked ? towed : null; },
  };
  return api;
}
