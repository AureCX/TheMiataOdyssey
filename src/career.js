// Two careers, run from the pause menu's Jobs list:
// - Police patrol: you take a patrol car out. Dispatch sends you after speeders (catch up behind them and they pull
//   over; stop beside them to write the ticket) and getaway cars (they run: ram them three times, then stop beside
//   them to make the arrest).
// - Swift Parcels: drive the company van from the depot at your house on a five-drop route. Buy more vans and the
//   business earns money while you play.
import * as THREE from 'three';
import { roads, TOWNS } from './world.js';
import { createTrafficCar } from './car.js';
import { buildPoliceCar } from './police.js';

const mains = () => roads.filter((r) => r.type === 'highway' || r.type === 'road');
const VAN_PRICE = 8000;

export function createCareer({ scene, rides, toast, econ, settings, saveSettings, missions, stats, home, fx }) {
  const co = settings.company || (settings.company = { vans: 0, earned: 0 });
  // the patrol car and the company van as rides
  const cop = buildPoliceCar(); rides.register('cop', { name: 'Police car', vmax: 62, acc: 11, brake: 15, turn: 1.3, grip: 7.5, cam: [7.5, 2.3] }, cop);
  const van = createTrafficCar(0xf2f2f2, 4);
  { const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#e5641c'; g.fillRect(0, 0, 512, 128); g.fillStyle = '#fff'; g.font = '700 70px "Barlow Condensed", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SWIFT PARCELS', 256, 68);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const L = van.userData.L || 5;
    for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.62, 0.6), new THREE.MeshStandardMaterial({ map: t })); p.position.set(s * ((van.userData.W || 2) / 2 + 0.02), 1.5, -0.3); p.rotation.y = s * Math.PI / 2; van.add(p); } }
  rides.register('van', { name: 'Parcel van', vmax: 40, acc: 6.5, brake: 11, turn: 1.1, grip: 6, cam: [8, 2.6] }, van);

  let shift = null, payT = 0, owed = 0;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 60, 10, 1, true).translate(0, 30, 0), new THREE.MeshBasicMaterial({ color: 0xff3040, transparent: true, opacity: 0.35, depthWrite: false }));
  beam.visible = false; scene.add(beam);
  const sample = (r, u) => { const n = r.n; let i = Math.floor(u); if (r.closed) i = ((i % n) + n) % n; else i = Math.max(0, Math.min(n - 2, i)); const j = r.closed ? (i + 1) % n : i + 1, t = u - Math.floor(u); return { x: r.pts[i][0] + (r.pts[j][0] - r.pts[i][0]) * t, z: r.pts[i][1] + (r.pts[j][1] - r.pts[i][1]) * t, h: r.h[i] + (r.h[j] - r.h[i]) * t, tx: r.tx[i], tz: r.tz[i] }; };

  function newCall(pos) {
    const getaway = Math.random() < 0.35, rs = mains();
    for (let t = 0; t < 40; t++) {
      const r = rs[(Math.random() * rs.length) | 0], u = 5 + Math.random() * (r.n - 10), p = r.pts[u | 0], d = Math.hypot(p[0] - pos.x, p[1] - pos.z);
      if (d < 300 || d > 800) continue;
      const m = createTrafficCar([0xc8102e, 0x111111, 0xe8b923, 0x2c8ad6][(Math.random() * 4) | 0], [0, 1, 3][(Math.random() * 3) | 0]); scene.add(m);
      shift.call = { m, r, u, dir: Math.random() < 0.5 ? 1 : -1, v: getaway ? 30 : 28, getaway, hits: 0, state: 'drive', stopT: 0, lane: 1.9, hitCool: 0 };
      toast(getaway ? `Dispatch: getaway car on ${r.name}, ${Math.round(d)} m away · ram it to stop it` : `Dispatch: speeder on ${r.name}, ${Math.round(d)} m away · catch up behind it`);
      return;
    }
  }
  function endCall() { if (shift && shift.call) { scene.remove(shift.call.m); shift.call = null; } beam.visible = false; }

  const api = {
    get shift() { return shift; },
    list() {
      return [
        { id: 'patrol', name: shift ? 'End police patrol' : 'Police patrol', desc: shift ? `Arrests this shift: ${shift.arrests}.` : 'Take a patrol car out: pull over speeders, stop getaway cars. Paid per arrest.' },
        { id: 'parcels', name: 'Swift Parcels · delivery route', desc: 'Drive the company van from the depot at your house to five addresses and back.' },
        { id: 'buyvan', name: `Swift Parcels · buy a van (${econ ? econ.fmt(VAN_PRICE) : '$8,000'})`, desc: `You own ${co.vans} van${co.vans === 1 ? '' : 's'}${co.vans ? `, earning about $${co.vans * 45}/min while you play` : ''}. Each van adds about $45 a minute.` },
      ];
    },
    start(id, veh, setMode) {
      if (id === 'patrol') {
        if (shift) { endCall(); shift = null; if (rides.kind === 'cop') { const c = rides.stop(); veh.reset(c.pos.x + 3, c.pos.y + 1, c.pos.z, c.yaw); } toast('Patrol over'); return; }
        const f = new THREE.Vector3(0, 0, 1).applyQuaternion(veh.q); setMode('car');
        rides.start('cop', veh.pos, Math.atan2(f.x, f.z)); shift = { arrests: 0, call: null, wait: 4 };
        toast('On patrol · dispatch will call you'); return;
      }
      if (id === 'buyvan') { if (econ.spend(VAN_PRICE)) { co.vans++; saveSettings(); stats && stats.event('vans', 1); toast(`Swift Parcels now has ${co.vans} van${co.vans === 1 ? '' : 's'}`); } else toast('Not enough cash for a van'); return; }
      if (id === 'parcels' && home) {
        const sp = home.spawn; setMode('car'); veh.reset(sp.x, sp.h + 1, sp.z, sp.heading); rides.start('van', { x: sp.x - Math.cos(sp.heading) * 3.5, z: sp.z + Math.sin(sp.heading) * 3.5 }, sp.heading);
        const towns = TOWNS.filter((t) => t.walks && t.walks.length), drops = [];
        while (drops.length < 5) { const t = towns[(Math.random() * towns.length) | 0], w = t.walks[(Math.random() * t.walks.length) | 0]; if (drops.every((d) => Math.hypot(d.x - w.cx, d.z - w.cz) > 120)) drops.push({ x: w.cx, z: w.cz, y: w.top, r: 6, kind: 'ground', stop: true, dwell: 2, dwellMsg: 'Delivering the parcel…', label: `Parcel ${drops.length + 1}/5 · ${t.name}` }); }
        drops.sort((a, b) => Math.hypot(a.x - sp.x, a.z - sp.z) - Math.hypot(b.x - sp.x, b.z - sp.z));
        drops.forEach((d, i) => { d.label = `Parcel ${i + 1}/5`; d.msg = i < 4 ? `Delivered · ${4 - i} to go` : 'All delivered · back to the depot'; });
        missions.startCustom({ id: 'job-parcels', job: true, name: 'Swift Parcels route', limit: 900, cps: [...drops, { x: sp.x, z: sp.z, y: sp.h, r: 8, kind: 'ground', stop: true, label: 'Back to the depot (your house)' }],
          pay: (t) => 5 * 110 + Math.max(0, 600 - t) * 1.5 });
        toast('Swift Parcels: five parcels in the van'); return;
      }
    },
    update(dt, { pos, vel }) {
      // vans earn while you play
      if (co.vans) { payT += dt; owed += co.vans * 45 / 60 * dt; if (payT > 180) { payT = 0; econ && econ.earn(owed, `Swift Parcels (${co.vans} van${co.vans === 1 ? '' : 's'})`); co.earned += owed; owed = 0; } }
      if (!shift) return null;
      if (rides.kind !== 'cop') { endCall(); shift = null; return null; }
      const lights = cop.userData.lights, on = Math.floor(performance.now() / 180) % 2; lights.red.color.setRGB(on ? 1 : 0.25, on ? 0.1 : 0.03, on ? 0.1 : 0.03); lights.blue.color.setRGB(0.05, on ? 0.1 : 0.3, on ? 0.25 : 1);
      if (!shift.call) { shift.wait -= dt; if (shift.wait <= 0) newCall(pos); return { title: 'Police patrol', line: `Waiting for dispatch · arrests ${shift.arrests}` }; }
      const c = shift.call, r = c.r, spd = Math.hypot(vel.x, vel.z);
      const d = Math.hypot(c.m.position.x - pos.x, c.m.position.z - pos.z);
      // the suspect's driving
      c.hitCool -= dt;
      if (c.state === 'drive') {
        const here = sample(r, c.u), look = sample(r, c.u + c.dir * 14), turn = Math.abs(Math.atan2(here.tx * look.tz - here.tz * look.tx, here.tx * look.tx + here.tz * look.tz));
        const flee = c.getaway && d < 120, vmax = c.getaway ? (flee ? 40 : 30) * Math.pow(0.7, c.hits) : 28;
        c.v += Math.max(-8 * dt, Math.min(5 * dt, Math.min(vmax, 6 + 12 / Math.max(0.04, turn)) - c.v));
        // a speeder gives up when you're right behind it
        if (!c.getaway && d < 18) { c.state = 'pull'; toast('The speeder is pulling over'); }
        if (c.getaway && c.hits >= 3) { c.state = 'pull'; toast('The getaway car is disabled!'); }
      } else { c.v = Math.max(0, c.v - dt * 7); c.lane += (3.4 - c.lane) * Math.min(1, dt); }
      c.u += c.dir * c.v * dt / 3;
      if (!r.closed && (c.u < 2 || c.u > r.n - 3)) { c.dir *= -1; c.u = Math.max(2.1, Math.min(r.n - 3.1, c.u)); }
      if (r.closed) c.u = ((c.u % r.n) + r.n) % r.n;
      const s = sample(r, c.u);
      c.m.position.set(s.x - s.tz * c.dir * c.lane, s.h + 0.03, s.z + s.tx * c.dir * c.lane); c.m.rotation.y = Math.atan2(s.tx * c.dir, s.tz * c.dir);
      beam.visible = true; beam.position.copy(c.m.position);
      // rams
      if (c.getaway && d < 3.8 && c.hitCool <= 0 && spd > 6) { c.hits++; c.hitCool = 1.2; fx && fx.sparks(c.m.position.x, c.m.position.y + 0.6, c.m.position.z, 0, 0, 20, 1.2); toast(`Hit ${c.hits}/3`); vel.multiplyScalar(0.7); }
      // the arrest: suspect stopped, you stopped beside it
      if (c.state === 'pull' && c.v < 0.3 && d < 14 && spd < 1) { c.stopT += dt; if (c.stopT > 2) { const pay = c.getaway ? 450 : 180; shift.arrests++; stats && stats.event('arrests', 1); econ && econ.earn(pay, c.getaway ? 'Getaway driver arrested' : 'Speeding ticket'); endCall(); shift.wait = 12 + Math.random() * 10; } }
      if (d > 1800) { toast('The suspect got away'); endCall(); shift.wait = 10; }
      return { title: 'Police patrol', line: `${c.getaway ? `Getaway car · hits ${c.hits}/3` : 'Speeder'} · ${Math.round(d)} m · arrests ${shift.arrests}` };
    },
    near(pos, out) { if (shift && shift.call) { const m = shift.call.m; if (Math.hypot(m.position.x - pos.x, m.position.z - pos.z) < 30) out.push({ x: m.position.x, z: m.position.z, r: 1.6, owner: { imp: { x: 0, z: 0 } } }); } return out; },
  };
  return api;
}
