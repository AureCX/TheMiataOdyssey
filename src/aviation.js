// A living airport and a flying career at Pilou International.
// - Apron life: baggage tugs towing carts, a fuel bowser and a catering truck do the rounds of the parked airliners;
//   pushback tugs wait at the gates.
// - Follow-me: land at Pilou and the yellow follow-me car meets you at the runway exit and leads you to stand 5.
// - Tower radio: ground, tower and the Pilou Air flights talk to each other (spoken with the browser's speech
//   synthesis when it's available, always subtitled).
// - Career: pilot licences (student → private → commercial → airline transport), cargo flights (need a private
//   licence) and a crosswind landing challenge (pass it for the commercial licence). Wind blows on the plane.
import * as THREE from 'three';
import { RBox } from './shapes.js';
import { AIRPORT, AIRSTRIP, SEAPLANE, groundHeight } from './world.js';

const LIC = ['Student pilot', 'Private pilot (PPL)', 'Commercial pilot (CPL)', 'Airline transport pilot (ATPL)'];
const STAND = { x: -414, z: 150, name: 'stand 5' };

function sayable(t) { return t.replace(/\b36\b/g, 'three six').replace(/\bPL(\d)(\d)(\d)\b/g, 'Pilou $1 $2 $3').replace(/QNH/g, 'Q N H'); }

export function createAviation({ scene, airport, toast, settings, saveSettings, econ, missions, audio }) {
  const AP = AIRPORT, H = AP.h;
  const group = new THREE.Group(); scene.add(group);
  const pilot = settings.pilot || (settings.pilot = { lic: 0, flights: 0, landings: 0, best: null });
  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
  const dark = M(0x1b1d20), glass = M(0x22303c, { metalness: 0.5, roughness: 0.15 }), wheelM = M(0x111111);
  const amber = new THREE.MeshBasicMaterial({ color: 0xffa000 });
  const wheels = (g, xs, zs, r = 0.35) => { for (const x of xs) for (const z of zs) { const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.25, 10).rotateZ(Math.PI / 2), wheelM); w.position.set(x, r, z); g.add(w); } };
  const beaconOn = (g, y) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), amber); b.position.set(0, y, 0); g.add(b); g.userData.beacon = b; };

  // ---------------------------------------------------------------- vehicle models
  const tug = (color) => { const g = new THREE.Group(); const b = new THREE.Mesh(new RBox(1.5, 0.8, 2.4), M(color)); b.position.y = 0.75; g.add(b);
    const cab = new THREE.Mesh(new RBox(1.4, 0.9, 1.0), glass); cab.position.set(0, 1.6, -0.4); g.add(cab); const rf = new THREE.Mesh(new RBox(1.5, 0.08, 1.1), M(color)); rf.position.set(0, 2.08, -0.4); g.add(rf);
    wheels(g, [-0.72, 0.72], [-0.8, 0.8], 0.32); beaconOn(g, 2.2); return g; };
  const cart = () => { const g = new THREE.Group(); const b = new THREE.Mesh(new RBox(1.5, 0.15, 2.6), M(0x6f7378)); b.position.y = 0.55; g.add(b);
    const bags = new THREE.Mesh(new RBox(1.3, 0.8, 2.3), M([0x2a4a8a, 0x8a2a2a, 0x2a2a2a, 0x6b5a3a][(Math.random() * 4) | 0])); bags.position.y = 1.05; g.add(bags);
    const rf = new THREE.Mesh(new RBox(1.6, 0.06, 2.7), M(0x1f4fb4)); rf.position.y = 1.9; g.add(rf);
    for (const x of [-0.75, 0.75]) for (const z of [-1.25, 1.25]) { const p = new THREE.Mesh(new RBox(0.05, 1.3, 0.05), dark); p.position.set(x, 1.25, z); g.add(p); }
    wheels(g, [-0.65, 0.65], [-0.9, 0.9], 0.25); return g; };
  const truck = (color, kind) => { const g = new THREE.Group();
    const cab = new THREE.Mesh(new RBox(2.3, 2.0, 1.8), M(color)); cab.position.set(0, 1.5, 3.1); g.add(cab);
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.8), glass); ws.position.set(0, 1.95, 4.01); g.add(ws);
    const ch = new THREE.Mesh(new RBox(2.2, 0.4, 7.4), dark); ch.position.y = 0.7; g.add(ch);
    let lift = null;
    if (kind === 'fuel') { const t = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 5.2, 16).rotateX(Math.PI / 2), M(0xe9ecef, { metalness: 0.4, roughness: 0.35 })); t.position.set(0, 2.0, -0.6); g.add(t);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.17, 1.17, 0.5, 16).rotateX(Math.PI / 2), M(0xc8102e)); band.position.set(0, 2.0, -0.6); g.add(band); }
    else { lift = new THREE.Group(); lift.position.set(0, 1.0, -0.8); g.add(lift); const bx = new THREE.Mesh(new RBox(2.3, 2.4, 4.6), M(0xf2f2f0)); bx.position.y = 1.3; lift.add(bx);
      const lg = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.0), M(0x1f4fb4)); lg.position.set(1.16, 1.6, 0); lg.rotation.y = Math.PI / 2; lift.add(lg); const lg2 = lg.clone(); lg2.position.x = -1.16; lg2.rotation.y = -Math.PI / 2; lift.add(lg2);
      const sc = new THREE.Mesh(new RBox(1.6, 1, 3.6), M(0x888888, { metalness: 0.5 })); sc.position.set(0, 0.5, -0.8); sc.name = 'scissor'; g.add(sc); }
    wheels(g, [-1.0, 1.0], [-2.6, 3.0], 0.45); beaconOn(g, 2.65); g.userData.lift = lift; return g; };
  const followMe = () => { const g = new THREE.Group();
    const b = new THREE.Mesh(new RBox(1.8, 0.8, 4.3), M(0xf2c200)); b.position.y = 0.75; g.add(b);
    const c = new THREE.Mesh(new RBox(1.6, 0.6, 2.2), glass); c.position.set(0, 1.45, -0.2); g.add(c);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const x = cv.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#f2c200'; x.fillRect(i * 16, j * 16, 16, 16); }
    x.fillStyle = '#111'; x.fillRect(40, 8, 176, 48); x.fillStyle = '#f2c200'; x.font = '700 38px "Barlow Condensed", Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('FOLLOW ME', 128, 34);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new RBox(1.7, 0.55, 0.08), [M(0x111111), M(0x111111), M(0x111111), M(0x111111), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.4 }), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.4 })]);
    sign.position.set(0, 2.05, -0.4); g.add(sign);
    const lamps = []; for (const s of [-0.6, 0.6]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa000 })); l.position.set(s, 2.42, -0.4); g.add(l); lamps.push(l); }
    wheels(g, [-0.85, 0.85], [-1.4, 1.4], 0.34); g.userData.lamps = lamps; return g; };

  // ---------------------------------------------------------------- apron routes
  const lane = -400, gates = AP.gates;
  const loopA = [[lane, 250], [lane, -140], [-452, -140], [-452, -110], [lane + 6, -110], [lane + 6, 245]];
  const fleet = [];
  const mkV = (mesh, route, speed, stops, trail = 0) => {
    group.add(mesh);
    const pts = []; for (let k = 0; k < route.length; k++) { const [x0, z0] = route[k], [x1, z1] = route[(k + 1) % route.length], n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2); for (let q = 0; q < n; q++) pts.push([x0 + (x1 - x0) * q / n, z0 + (z1 - z0) * q / n]); }
    const cum = [0]; for (let k = 1; k <= pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k % pts.length][0] - pts[k - 1][0], pts[k % pts.length][1] - pts[k - 1][1]));
    const L = cum[pts.length];
    const at = (d) => { d = ((d % L) + L) % L; let lo = 0, hi = pts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cum[m] <= d) lo = m; else hi = m - 1; } const a = pts[lo], b = pts[(lo + 1) % pts.length], t = (d - cum[lo]) / (cum[lo + 1] - cum[lo] || 1); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[0] - a[0], b[1] - a[1])]; };
    const carts = []; for (let k = 0; k < trail; k++) { const c = cart(); group.add(c); carts.push(c); }
    const v = { mesh, at, L, d: Math.random() * L, speed, v: 0, stops: stops.map((s) => { let b = 0, bd = 1e9; for (let k = 0; k < pts.length; k++) { const dd = Math.hypot(pts[k][0] - s[0], pts[k][1] - s[1]); if (dd < bd) { bd = dd; b = k; } } return cum[b]; }), wait: 0, carts, lastStop: -1 };
    fleet.push(v); return v;
  };
  // stops beside each gate on the lane (and the hangars)
  const gateStops = gates.map((gz) => [lane, gz + 12]);
  mkV(tug(0xe8b923), loopA, 5.5, gateStops, 3);
  mkV(tug(0xd2d6da), loopA, 5, gateStops.slice().reverse(), 3).d = 300;
  mkV(truck(0xc8102e, 'fuel'), loopA, 6, [[lane, gates[1] - 10], [lane, gates[3] - 10]]).d = 120;
  mkV(truck(0x1f4fb4, 'catering'), loopA, 5, [[lane + 6, gates[0] + 14], [lane + 6, gates[2] + 14]]).d = 500;
  // pushback tugs parked at the gates, under the noses
  for (const gz of gates) { const t = tug(0x3a3f45); t.scale.set(1.3, 0.8, 1.6); t.position.set(-462 + 12, H, gz - 6); t.rotation.y = Math.PI / 2; group.add(t); }
  // stand 5: lead-in line and stop bar
  { const ym = new THREE.MeshStandardMaterial({ color: 0xe6b422, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 });
    const line = new THREE.Mesh(new THREE.PlaneGeometry(50, 0.4).rotateX(-Math.PI / 2), ym); line.position.set(STAND.x + 5, H + 0.05, STAND.z); group.add(line);
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 6).rotateX(-Math.PI / 2), ym); bar.position.set(STAND.x - 17, H + 0.05, STAND.z); group.add(bar);
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'); x.fillStyle = '#e6b422'; x.font = '700 110px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('5', 64, 70);
    const t = new THREE.CanvasTexture(cv); const n = new THREE.Mesh(new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: t, transparent: true, polygonOffset: true, polygonOffsetFactor: -3 })); n.position.set(STAND.x + 24, H + 0.06, STAND.z - 6); n.rotation.y = 0; group.add(n); }

  // ---------------------------------------------------------------- follow-me car
  const fm = { g: followMe(), state: 'parked', home: { x: -395, z: 100 }, route: null, d: 0, v: 0 };
  fm.g.position.set(fm.home.x, H, fm.home.z); group.add(fm.g);
  const exits = [-336, 10, 392];   // taxiway links from the runway
  function routeFrom(pts) { const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])); return { pts, cum, L: cum[cum.length - 1] }; }
  function along(r, d) { d = Math.max(0, Math.min(r.L, d)); let k = 1; while (k < r.pts.length - 1 && r.cum[k] < d) k++; const a = r.pts[k - 1], b = r.pts[k], t = (d - r.cum[k - 1]) / (r.cum[k] - r.cum[k - 1] || 1); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[0] - a[0], b[1] - a[1])]; }

  // ---------------------------------------------------------------- tower radio
  const atcEl = document.getElementById('atc');
  const queue = []; let speaking = 0, subT = 0;
  const voice = () => { try { const vs = speechSynthesis.getVoices(); return vs.find((v) => /en-GB/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null; } catch { return null; } };
  function radio(who, text) {
    if (settings.atc === false) return;
    queue.push({ who, text });
  }
  function pump(dt) {
    subT -= dt; speaking -= dt;
    if (subT <= 0 && atcEl) atcEl.hidden = true;
    if (speaking > 0 || !queue.length) return;
    const m = queue.shift(), dur = 1.2 + m.text.length * 0.065;
    if (atcEl) { atcEl.hidden = false; atcEl.innerHTML = `<b>${m.who}</b> ${m.text}`; }
    subT = dur + 1.5; speaking = dur + 0.4;
    try {
      if (!audio.muted && 'speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(sayable(m.text)); const v = voice(); if (v) u.voice = v;
        u.rate = 1.12; u.pitch = m.who.startsWith('PL') ? 1.05 : 0.88; u.volume = 0.8; speechSynthesis.speak(u);
      }
    } catch { /* no speech */ }
  }
  const windStr = (w) => { const spd = Math.hypot(w.x, w.z), from = (Math.round(((Math.atan2(-w.x, w.z) * 180 / Math.PI) + 360) % 360 / 10) * 10) || 360; return spd < 1.5 ? 'wind calm' : `wind ${String(from).padStart(3, '0')} degrees ${Math.round(spd * 1.94)} knots`; };

  // ---------------------------------------------------------------- flying career state
  let wasAir = false, landedAt = 0, said = {}, cw = null, cargo = null, lastNear = false, linerSaid = {};
  const cwActive = () => cw && cw.state !== 'done';
  const onRunway = (p) => Math.abs(p.x - AP.x) < AP.rwyW / 2 + 2 && p.z > AP.zN && p.z < AP.zS;
  const nearAirport = (p, m = 0) => p.x > AP.foot.x0 - m && p.x < AP.foot.x1 + m && p.z > AP.foot.z0 - m && p.z < AP.foot.z1 + m;
  const award = (lv) => { if (pilot.lic >= lv) return; pilot.lic = lv; saveSettings(); toast(`Licence: ${LIC[lv]}!`); radio('Pilou Tower', `Congratulations, you now hold a ${LIC[lv].replace(/ \(.*\)/, '')} licence.`); };

  const api = {
    group, LIC, STAND,
    get licence() { return LIC[pilot.lic]; },
    get level() { return pilot.lic; },
    get pilot() { return pilot; },
    radio,
    // wind on the plane: the weather's wind, or the crosswind challenge's own
    wind(weatherWind, out) {
      if (cw && cw.state !== 'done') { const g = 1 + 0.35 * Math.sin(performance.now() / 900) * Math.sin(performance.now() / 2300 + 1); return out.set(cw.wx * g, 0, cw.wz * g); }
      return out.copy(weatherWind);
    },
    // jobs for the pause menu
    list() {
      return [
        { id: 'licence', name: pilot.lic === 0 ? 'Private pilot licence test' : `Licence: ${LIC[pilot.lic]}`, desc: pilot.lic === 0 ? 'Plane: take off from Pilou International, fly the circuit through three rings, land on runway 36 and stop. Passing gets you a private licence.' : pilot.lic === 1 ? 'Pass the crosswind landing challenge (grade B or better) for a commercial licence.' : pilot.lic === 2 ? `Complete ${Math.max(0, 8 - pilot.flights)} more flight jobs for an airline transport licence.` : 'Top licence. Flight jobs pay 50% more.', disabled: pilot.lic > 0 },
        { id: 'crosswind', name: 'Crosswind landing challenge', desc: `You start on a 2.5 km final for runway 36 with a strong, gusty crosswind. Crab in, kick it straight and land on the centreline.${pilot.best ? ` Best ${pilot.best}.` : ''}` },
        { id: 'cargo', name: 'Cargo flight', desc: pilot.lic >= 1 ? 'Fly freight between Pilou International (cargo apron by the hangars) and Mesa Field. Heavier plane; land softly to keep the goods intact.' : 'Needs a private pilot licence.', disabled: pilot.lic < 1 },
      ];
    },
    payFactor() { return [1, 1, 1.25, 1.5][pilot.lic]; },
    flightDone() { pilot.flights++; saveSettings(); if (pilot.lic === 2 && pilot.flights >= 8) award(3); },
    start(id, ctx) {
      if (id === 'licence' && pilot.lic === 0) {
        const cp = (x, z, y, r, kind, label) => ({ x, z, y, r, kind, label });
        missions.startCustom({ id: 'job-ppl', job: true, name: 'Private pilot licence test', limit: 600,
          cps: [cp(AP.x, 300, H, 20, 'ground', 'Line up on runway 36 (plane)'), cp(AP.x, -900, H + 160, 40, 'air', 'Climb out: ring 1'), cp(AP.x + 700, -300, H + 220, 45, 'air', 'Crosswind leg: ring 2'),
            cp(AP.x + 700, 900, H + 200, 45, 'air', 'Downwind: ring 3'), cp(AP.x, 1100, H + 70, 40, 'air', 'Final approach gate'), { ...cp(AP.x, 0, H, 22, 'ground', 'Land on runway 36 and stop'), stop: true, modes: ['plane'] }],
          pay: () => 600, onEnd: (ok) => { if (ok) award(1); } });
        ctx.setMode('plane'); toast('Licence test: get the plane onto runway 36');
      } else if (id === 'crosswind') {
        missions.cancel();
        const side = Math.random() < 0.5 ? 1 : -1, spd = 9 + Math.random() * 5;
        cw = { wx: side * spd, wz: -1.5, state: 'final', start: 0, td: null };
        ctx.spawnPlane(AP.x + side * -18, H + 135, AP.zS + 2500, Math.PI, 44);   // heading north (−z)
        radio('Pilou Tower', `Roadster one, runway 36, ${windStr({ x: cw.wx, z: cw.wz })}, gusting. Cleared to land.`);
        toast(`Crosswind ${Math.round(spd * 1.94)} kt from the ${side > 0 ? 'west' : 'east'} · land on the centreline`);
      } else if (id === 'cargo' && pilot.lic >= 1) {
        const atPilou = Math.hypot(ctx.pos.x - AP.x, ctx.pos.z - AP.z) < Math.hypot(ctx.pos.x - AIRSTRIP.x, ctx.pos.z - AIRSTRIP.z);
        const pick = atPilou ? { x: -425, z: 245, y: H, name: 'Pilou cargo apron' } : { x: AIRSTRIP.stand.x, z: AIRSTRIP.stand.z, y: AIRSTRIP.h, name: 'Mesa Field apron' };
        const drop = atPilou ? { x: AIRSTRIP.stand.x, z: AIRSTRIP.stand.z, y: AIRSTRIP.h, name: 'Mesa Field apron' } : { x: -425, z: 245, y: H, name: 'Pilou cargo apron' };
        const kg = 150 + Math.round(Math.random() * 6) * 25;
        cargo = { kg, loaded: false, maxVs: 0, air: false };
        const dist = Math.hypot(drop.x - pick.x, drop.z - pick.z);
        missions.startCustom({ id: 'job-cargo', job: true, name: `Cargo: ${kg} kg to ${drop.name}`, limit: 600,
          cps: [{ ...pick, r: 14, kind: 'ground', stop: true, modes: ['plane'], dwell: 4, dwellMsg: 'Loading freight…', label: `${pick.name} · stop in the marker (plane)`, msg: `${kg} kg on board · the plane is heavier` },
            { ...drop, r: 16, kind: 'ground', stop: true, modes: ['plane'], dwell: 3, dwellMsg: 'Unloading…', label: `${drop.name} · stop in the marker` }],
          onReach: (k) => { if (k === 0 && cargo) { cargo.loaded = true; cargo.maxVs = 0; } },
          pay: () => { const vs = cargo ? cargo.maxVs : 0, dmg = vs < 2.5 ? 1 : vs < 4 ? 0.8 : vs < 6 ? 0.5 : 0.2; toast(`Touchdown ${vs.toFixed(1)} m/s · goods ${Math.round(dmg * 100)}% intact`); return (300 + dist * 0.6 + kg * 1.2) * dmg * api.payFactor(); },
          onEnd: (ok) => { cargo = null; if (ok) api.flightDone(); } });
        toast(`Cargo flight: fly to ${pick.name} to load`);
      }
    },
    get cargoKg() { return cargo && cargo.loaded ? cargo.kg : 0; },
    update(dt, ctx) {
      const { veh, mode, onGround, day, weatherWind } = ctx, p = veh.pos, spd = Math.hypot(veh.vel.x, veh.vel.z);
      pump(dt);
      // apron traffic
      const t = performance.now() / 1000;
      for (const v of fleet) {
        if (v.wait > 0) { v.wait -= dt; v.v = 0; }
        else {
          // stop at the next service point for a while
          for (let k = 0; k < v.stops.length; k++) { const dd = ((v.stops[k] - v.d) % v.L + v.L) % v.L; if (dd < 0.6 && v.lastStop !== k) { v.wait = 18 + Math.random() * 15; v.lastStop = k; } }
          v.v += Math.max(-3 * dt, Math.min(1.5 * dt, v.speed - v.v)); v.d += v.v * dt;
        }
        const [x, z, h] = v.at(v.d); v.mesh.position.set(x, H, z); v.mesh.rotation.y = h;
        v.carts.forEach((c, k) => { const [cx, cz, ch] = v.at(v.d - 3.2 - k * 3.1); c.position.set(cx, H, cz); c.rotation.y = ch; });
        if (v.mesh.userData.beacon) v.mesh.userData.beacon.visible = (t * 2 + v.L) % 1 < 0.5;
        const lift = v.mesh.userData.lift; if (lift) lift.position.y += ((v.wait > 3 ? 3.2 : 1.0) - lift.position.y) * Math.min(1, dt * 0.6);
      }
      // follow-me: meet a landed plane at the runway exit, lead it to stand 5
      if (mode === 'plane' && !onGround && veh.telemetry.altitude > 25) wasAir = true;
      if (wasAir && mode === 'plane' && onGround && onRunway(p) && spd < 40 && fm.state === 'parked' && !cwActive()) {
        wasAir = false; pilot.landings++; saveSettings();
        const ez = exits.reduce((b, z) => (veh.vel.z < 0 ? (z < p.z - 60 && (b === null || z > b) ? z : b) : (z > p.z + 60 && (b === null || z < b) ? z : b)), null) ?? exits[1];
        fm.route = routeFrom([[fm.g.position.x, fm.g.position.z], [AP.taxiX, fm.g.position.z], [AP.taxiX, ez]]);
        fm.next = routeFrom([[AP.taxiX, ez], [AP.taxiX, STAND.z], [STAND.x + 30, STAND.z], [STAND.x + 18, STAND.z + 10]]);
        fm.state = 'meet'; fm.d = 0;
        radio('Pilou Tower', `Welcome to Pilou. Vacate at the next taxiway, follow-me car will lead you to stand 5.`);
      }
      if (fm.state !== 'parked') {
        const r = fm.route; let vt = 9;
        if (fm.state === 'lead') { const dp = Math.hypot(p.x - fm.g.position.x, p.z - fm.g.position.z); vt = dp < 25 ? 8 : dp < 55 ? 5 : dp > 90 ? 0 : 2.5; }
        fm.v += Math.max(-4 * dt, Math.min(2 * dt, vt - fm.v)); fm.d += fm.v * dt;
        const [x, z, h] = along(r, fm.d); fm.g.position.set(x, H, z);
        let dh = h - fm.g.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); fm.g.rotation.y += dh * Math.min(1, dt * 4);
        for (const l of fm.g.userData.lamps) l.visible = (t * 3) % 1 < 0.5;
        if (fm.d >= r.L - 0.5) {
          if (fm.state === 'meet') { fm.state = 'lead'; fm.route = fm.next; fm.d = 0; if (mode === 'plane') toast('Follow the follow-me car to stand 5'); }
          else if (fm.state === 'lead') { fm.state = 'done'; toast('Stand 5 · stop on the yellow line by the stop bar'); }
          else if (fm.state === 'home') { fm.state = 'parked'; }
        }
        if (fm.state === 'done') {
          if (mode === 'plane' && spd < 0.5 && Math.hypot(p.x - (STAND.x - 10), p.z - STAND.z) < 10) { radio('Pilou Ground', 'On stand 5, shut down. Thanks for flying with us.'); econ && econ.earn(60, 'Parked on stand 5'); fm.state = 'home'; }
          if (mode !== 'plane' || !nearAirport(p, 200)) fm.state = 'home';
          if (fm.state === 'home') { fm.route = routeFrom([[fm.g.position.x, fm.g.position.z], [fm.home.x, fm.g.position.z], [fm.home.x, fm.home.z]]); fm.d = 0; }
        }
        if (fm.state === 'lead' && (mode !== 'plane' || !nearAirport(p, 300))) { fm.state = 'home'; fm.route = routeFrom([[fm.g.position.x, fm.g.position.z], [fm.home.x, fm.g.position.z], [fm.home.x, fm.home.z]]); fm.d = 0; }
      }
      // tower radio
      const near = nearAirport(p, 3000);
      if (mode === 'plane' && onGround && nearAirport(p) && !onRunway(p) && !said.taxi && spd < 15) { said.taxi = 1; radio('Pilou Ground', `Roadster one, taxi to holding point runway 36 via Alpha, ${windStr(weatherWind)}, QNH 1013.`); }
      if (mode === 'plane' && onGround && onRunway(p) && spd > 12 && !said.takeoff && !wasAir) { said.takeoff = 1; radio('Pilou Tower', `Roadster one, ${windStr(weatherWind)}, runway 36, cleared for takeoff.`); }
      if (mode === 'plane' && !onGround && p.z > AP.zS && p.z < AP.zS + 6000 && Math.abs(p.x - AP.x) < 600 && veh.vel.z < -20 && veh.telemetry.altitude < 600 && !said.land && !cwActive()) { said.land = 1; radio('Pilou Tower', `Roadster one, runway 36, ${windStr(weatherWind)}, cleared to land.`); }
      if (mode !== 'plane' || (!onGround && veh.telemetry.altitude > 300)) { said.taxi = 0; if (veh.telemetry.altitude > 300) said.takeoff = 0; }
      if (onGround) said.land = 0;
      // the Pilou Air flights, heard while you're near
      if (near && airport.liners) for (const L of airport.liners) {
        const mk = airport.circuit.marks, s = L.s, key = L.name;
        const ev = s > mk.lineup - 30 && s < mk.lineup ? 'lineup' : s > mk.base && s < mk.base + 60 ? 'base' : null;
        if (ev && linerSaid[key] !== ev) { linerSaid[key] = ev; radio(ev === 'lineup' ? 'Pilou Tower' : key, ev === 'lineup' ? `${key}, runway 36, cleared for takeoff.` : `Pilou Tower, ${key} on base, runway 36.`); if (ev === 'base') radio('Pilou Tower', `${key}, cleared to land runway 36.`); }
      }
      // cargo: the plane is heavier while loaded; landing hardness
      if (cargo && cargo.loaded) {
        if (!onGround) cargo.air = true; else if (cargo.air) { cargo.maxVs = Math.max(cargo.maxVs, -(cargo.lastVy || 0)); cargo.air = false; }
        cargo.lastVy = veh.vel.y;
      }
      // crosswind challenge scoring
      if (cw && cw.state !== 'done') {
        cw.start += dt;
        if (mode !== 'plane') { cw = null; toast('Crosswind challenge abandoned'); }
        else if (cw.state === 'final' && onGround) {
          const off = Math.abs(p.x - AP.x), on = onRunway(p), fw = new THREE.Vector3(0, 0, 1).applyQuaternion(veh.q), crab = Math.abs(Math.atan2(fw.x, -fw.z)) * 180 / Math.PI;
          cw.td = { off, vs: -cw.lastVy, crab, z: p.z, on };
          cw.state = on ? 'roll' : 'done';
          if (!on) { toast('Touched down off the runway · challenge failed'); cw.state = 'done'; }
        } else if (cw.state === 'roll' && spd < 3) {
          const td = cw.td, aim = AP.zS - 300;
          let sc = 100 - td.off * 5 - Math.max(0, td.vs - 1.5) * 15 - td.crab * 3 - Math.abs(td.z - aim) / 12;
          if (!onRunway(p)) sc -= 40;
          sc = Math.max(0, Math.round(sc));
          const grade = sc >= 85 ? 'A' : sc >= 70 ? 'B' : sc >= 50 ? 'C' : 'D';
          toast(`Crosswind landing: ${grade} (${sc}) · ${td.off.toFixed(1)} m off centre, ${td.vs.toFixed(1)} m/s, crab ${td.crab.toFixed(0)}°`);
          if (!pilot.best || sc > parseInt(pilot.best.split(' ')[1] || '0', 10)) { pilot.best = `${grade} ${sc}`; saveSettings(); }
          econ && econ.earn([600, 400, 200, 50][['A', 'B', 'C', 'D'].indexOf(grade)], `Crosswind landing ${grade}`);
          if (grade <= 'B' && pilot.lic === 1) award(2);
          cw.state = 'done';
        }
        cw && (cw.lastVy = veh.vel.y);
      }
    },
    get crosswind() { return cw; },
    // dynamic colliders: the apron vehicles and the follow-me car
    near(pos, out) {
      if (!nearAirport(pos, 50)) return out;
      for (const v of fleet) { out.push({ x: v.mesh.position.x, z: v.mesh.position.z, r: 1.8, owner: { imp: { x: 0, z: 0 } } }); for (const c of v.carts) out.push({ x: c.position.x, z: c.position.z, r: 1.3, owner: { imp: { x: 0, z: 0 } } }); }
      out.push({ x: fm.g.position.x, z: fm.g.position.z, r: 1.9, owner: { imp: { x: 0, z: 0 } } });
      return out;
    },
    get followMe() { return fm; },
  };
  return api;
}
