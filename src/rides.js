// Other rides: a motorbike, a jet ski, a second car (the Strada GT coupe) and a helicopter. Pick one in the pause
// menu (or press 5 for the helicopter): it appears beside the roadster, which waits where you left it. Each has its
// own arcade handling; press 1 to get back in the MX-5 (it's brought to you).
// Controls: W/S throttle and brake (helicopter: climb and descend), A/D steer (helicopter: yaw), the arrow keys tilt
// the helicopter (cyclic), Space handbrake (car and bike).
import * as THREE from 'three';
import { groundHeight, groundHeightAt, groundInfo, terrainHeight, waveHeight, WATER_LEVEL, SURFACES, pavedAt, HARBOUR } from './world.js';
import { nearbyColliders } from './scenery.js';
import { createTrafficCar, trafficParts } from './car.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const KINDS = {
  bike: { name: 'Motorbike', vmax: 64, acc: 10, brake: 14, turn: 1.9, grip: 9, cam: [5.2, 1.8] },
  gt: { name: 'Strada GT', vmax: 78, acc: 11.5, brake: 15, turn: 1.25, grip: 7, cam: [7, 2.1] },
  ski: { name: 'Jet ski', vmax: 30, acc: 6.5, brake: 5, turn: 1.6, grip: 2.5, cam: [5.5, 1.9] },
  heli: { name: 'Helicopter', vmax: 72, acc: 0, brake: 0, turn: 1.2, grip: 0, cam: [14, 4.5] },
};

function M(c, o = {}) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...o }); }
const tyreM = M(0x141414, { roughness: 0.9 }), rimM = M(0xb8bcc2, { metalness: 0.8, roughness: 0.3 }), glassM = M(0x1d2a33, { metalness: 0.5, roughness: 0.1 });
function wheel(r, w) {
  // a tyre with rounded shoulders, a five-spoke rim and a hub. Rotation order YXZ: steer about the vertical, then spin
  // about the steered axle (XYZ would tilt the wheel as it spins)
  const g = new THREE.Group(); g.rotation.order = 'YXZ'; const sh = Math.min(w * 0.35, r * 0.2), pts = [new THREE.Vector2(r * 0.62, -w / 2)];
  for (let k = 0; k <= 4; k++) { const a = -Math.PI / 2 + k / 8 * Math.PI; pts.push(new THREE.Vector2(r - sh + Math.cos(a) * sh, -w / 2 + sh + Math.sin(a) * sh)); }
  for (let k = 0; k <= 4; k++) { const a = k / 8 * Math.PI; pts.push(new THREE.Vector2(r - sh + Math.cos(a) * sh, w / 2 - sh + Math.sin(a) * sh)); }
  pts.push(new THREE.Vector2(r * 0.62, w / 2));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 22).rotateZ(Math.PI / 2), tyreM));
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.63, r * 0.63, w * 0.9, 18, 1, true).rotateZ(Math.PI / 2), rimM); g.add(barrel);
  for (const sd of [1, -1]) {
    const face = new THREE.Group(); face.position.x = sd * w * 0.42; g.add(face);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.18, 0.04, 12).rotateZ(Math.PI / 2), rimM); face.add(hub);
    for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, r * 0.5, r * 0.1), rimM); sp.position.set(0, Math.cos(k / 5 * Math.PI * 2) * r * 0.36, Math.sin(k / 5 * Math.PI * 2) * r * 0.36); sp.rotation.x = -k / 5 * Math.PI * 2; face.add(sp); }
    const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.62, 0.015, 6, 22).rotateY(Math.PI / 2), rimM); face.add(lip);
  }
  return g;
}

export function buildBike() {
  const g = new THREE.Group(), red = M(0xc8102e, { metalness: 0.3, roughness: 0.35 }), blk = M(0x1a1a1a);
  const lean = new THREE.Group(); g.add(lean);
  const fw = wheel(0.33, 0.12), rw = wheel(0.34, 0.18); fw.position.set(0, 0.33, 0.72); rw.position.set(0, 0.34, -0.72); lean.add(fw, rw);
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.55), red); tank.position.set(0, 0.86, 0.12); lean.add(tank);
  const fair = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 8).rotateX(Math.PI / 2), red); fair.position.set(0, 0.88, 0.62); lean.add(fair);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.55), blk); seat.position.set(0, 0.86, -0.35); lean.add(seat);
  const eng = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.45), M(0x666a70, { metalness: 0.6 })); eng.position.set(0, 0.52, 0); lean.add(eng);
  const fork = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), rimM); fork.position.set(0, 0.62, 0.66); fork.rotation.x = 0.35; lean.add(fork);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.04), blk); bar.position.set(0, 1.0, 0.5); lean.add(bar);
  // rider
  const suit = M(0x1f3f7a), helm = M(0xf2f2f2, { metalness: 0.2, roughness: 0.2 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.55, 0.26), suit); torso.position.set(0, 1.18, -0.12); torso.rotation.x = 0.6; lean.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), helm); head.position.set(0, 1.5, 0.08); lean.add(head);
  for (const s of [1, -1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.55), suit); leg.position.set(s * 0.2, 0.8, -0.1); leg.rotation.x = -0.5; lean.add(leg); }
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.07, 10), new THREE.MeshBasicMaterial({ color: 0xfff3d0 })); lamp.position.set(0, 0.86, 0.86); lean.add(lamp);
  g.userData = { lean, wheels: [fw, rw], front: fw };
  return g;
}
export function buildGT() {
  // the rounded coupe body shared with the traffic cars, with its own wheels so they can turn and steer
  const g = createTrafficCar(0x1d6fd1, 6, true);
  const { R, W, wheels: wz } = trafficParts(6, true);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 4.2).rotateX(-Math.PI / 2), M(0xf2f2f2, { polygonOffset: true, polygonOffsetFactor: -2 }));
  stripe.position.set(0, 0.9, 0); stripe.visible = false; g.add(stripe);
  const wing = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.05, 0.36, 2, 0.02), M(0x111111)); wing.position.set(0, 1.0, -2.0); g.add(wing);
  for (const s of [1, -1]) { const st = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.2, 0.16, 2, 0.02), M(0x111111)); st.position.set(s * 0.55, 0.9, -2.0); g.add(st); }
  const ws = [];
  for (const z of wz) for (const s of [1, -1]) { const w = wheel(R, 0.26); w.position.set(s * (W / 2 - 0.14), R, z); g.add(w); ws.push(w); }
  g.userData.wheels = ws; g.userData.fronts = ws.slice(0, 2);
  return g;
}
function buildSki() {
  const g = new THREE.Group(), yel = M(0xffc400, { roughness: 0.35 }), blk = M(0x1a1a1a);
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 2.9), M(0xf2f2f2, { roughness: 0.3 })); hull.position.y = 0.2; g.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4), M(0xf2f2f2, { roughness: 0.3 })); bow.scale.set(1, 0.45, 1); bow.position.set(0, 0.2, 1.85); g.add(bow);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.3, 1.6), yel); top.position.set(0, 0.55, 0.3); g.add(top);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.15, 1.0), blk); seat.position.set(0, 0.62, -0.6); g.add(seat);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.05), blk); bar.position.set(0, 0.95, 0.55); g.add(bar);
  const suit = M(0xe5641c), torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.55, 0.26), suit); torso.position.set(0, 1.05, -0.35); torso.rotation.x = 0.4; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), M(0x222222)); head.position.set(0, 1.42, -0.15); g.add(head);
  g.userData = { wheels: [] };
  return g;
}
function buildHeli() {
  const g = new THREE.Group(), body = M(0xc8102e, { metalness: 0.3, roughness: 0.35 }), wht = M(0xf2f2f2);
  const cab = new THREE.Mesh(new THREE.SphereGeometry(1.25, 18, 14), body); cab.scale.set(1, 0.95, 1.5); cab.position.set(0, 1.55, 0.2); g.add(cab);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1.15, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), glassM); glass.rotation.x = Math.PI / 2 - 0.2; glass.scale.set(0.95, 1.2, 0.9); glass.position.set(0, 1.75, 0.95); g.add(glass);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.32, 5, 10).rotateX(Math.PI / 2), body); boom.position.set(0, 1.75, -3.3); g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.7), wht); fin.position.set(0, 2.2, -5.7); g.add(fin);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.4), wht); stab.position.set(0, 1.8, -5.2); g.add(stab);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 8), M(0x333333)); mast.position.set(0, 2.85, 0.1); g.add(mast);
  const rotor = new THREE.Group(); rotor.position.set(0, 3.15, 0.1); g.add(rotor);
  for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 5.2).translate(0, 0, 2.6), M(0x2a2a2a)); b.rotation.y = k * Math.PI * 2 / 3; rotor.add(b); }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(5.2, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, depthWrite: false })); rotor.add(disc);
  const tail = new THREE.Group(); tail.position.set(0.14, 2.3, -5.8); g.add(tail);
  for (let k = 0; k < 2; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.1, 0.12), M(0x2a2a2a)); b.rotation.x = k * Math.PI / 2; tail.add(b); }
  for (const s of [1, -1]) { const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.0, 6).rotateX(Math.PI / 2), M(0x333333)); sk.position.set(s * 0.9, 0.05, 0.1); g.add(sk); for (const z of [-0.7, 0.9]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), M(0x333333)); st.position.set(s * 0.8, 0.3, z); g.add(st); } }
  const PIL = document.createElement('canvas'); PIL.width = 256; PIL.height = 64; { const x = PIL.getContext('2d'); x.fillStyle = '#c8102e'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#fff'; x.font = '700 40px "Barlow Condensed", Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('SKYHOP', 128, 34); }
  const t = new THREE.CanvasTexture(PIL); t.colorSpace = THREE.SRGBColorSpace;
  for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshStandardMaterial({ map: t })); p.position.set(s * 0.33, 1.75, -2.4); p.rotation.y = s * Math.PI / 2; g.add(p); }
  g.userData = { rotor, tail, disc, wheels: [] };
  return g;
}

// the freighter moored along Port Ruby quay is a wall on the water too
const moored = (x, z, m = 0) => Math.abs(x - HARBOUR.cx) < 38 + m && Math.abs(z - (HARBOUR.cz + HARBOUR.hw + 8)) < 8 + m;
const blocked = (x, z) => pavedAt(x, z) || moored(x, z);

export function createRides({ scene, toast, fx }) {
  const meshes = { bike: buildBike(), gt: buildGT(), ski: buildSki(), heli: buildHeli() };
  for (const m of Object.values(meshes)) { m.visible = false; m.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(m); }
  let cur = null;   // { kind, k, m, pos, vel, yaw, pitch, roll, air, rpm, spin }
  const gi = {}, cols = [], F = new THREE.Vector3(), E = new THREE.Euler(0, 0, 0, 'YXZ'), V = new THREE.Vector3();
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();

  function findWater(x, z) { for (let r = 0; r <= 300; r += 10) for (let a = 0; a < 16; a++) { const px = x + Math.cos(a / 16 * 6.283) * r, pz = z + Math.sin(a / 16 * 6.283) * r; if (terrainHeight(px, pz) < WATER_LEVEL - 1.2 && !moored(px, pz, 10) && ![[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]].some(([a, b]) => pavedAt(px + a, pz + b))) return [px, pz]; } return null; }

  // lights and indicators for whichever ride you're on: L for the headlights, Q/E indicators, O hazards (the same
  // controls as the MX-5). The helicopter gets navigation lights (red left, green right, a white strobe) and a
  // landing light instead of indicators. One shared spotlight moves to the ride you're in.
  const lamps = { lights: false, blink: 0, blinkT: 0, blinkOn: false, brake: 0 };
  const beam = new THREE.SpotLight(0xfff1d6, 0, 90, 0.5, 0.45, 1.2); beam.visible = true; scene.add(beam); scene.add(beam.target);
  const LAMPS = {   // [x, y, z] in the ride's own frame (x left, z forward)
    bike: { head: [[0, 0.86, 0.9]], tail: [[0, 0.82, -0.92]], ind: [[0.2, 0.95, 0.66, 1], [-0.2, 0.95, 0.66, -1], [0.14, 0.8, -0.9, 1], [-0.14, 0.8, -0.9, -1]], beam: [0, 0.9, 1.0] },
    ski: { head: [[0, 0.5, 1.9]], tail: [[0, 0.45, -1.47]], ind: [], beam: [0, 0.6, 2.1] },
    heli: { head: [[0, 0.75, 1.75]], tail: [], ind: [], nav: true, beam: [0, 0.6, 1.8] },
  };
  function kit(kind, m) {
    if (m.userData.kit) return m.userData.kit;
    const root = m.userData.lean || m;
    let cfg = LAMPS[kind];
    if (!cfg) {
      // from the bounding box (taken with the mesh at the origin, facing +z)
      const sp = m.position.clone(), sq = m.quaternion.clone(); m.position.set(0, 0, 0); m.quaternion.identity(); m.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(m, true); m.position.copy(sp); m.quaternion.copy(sq);
      const w = (b.max.x - b.min.x) / 2, y = b.min.y + Math.min(0.62, (b.max.y - b.min.y) * 0.38), zf = b.max.z + 0.02, zr = b.min.z - 0.02;
      const own = !!m.userData.head;   // a traffic-car body: drive its own lamps, tuck the indicators inside the corners
      cfg = own ? { head: [], tail: [], ind: [[w * 0.62, y, zf - 0.16, 1], [-w * 0.62, y, zf - 0.16, -1], [w * 0.62, y + 0.08, zr + 0.16, 1], [-w * 0.62, y + 0.08, zr + 0.16, -1]], beam: [0, y, zf + 0.1], own }
        : { head: [[w * 0.68, y, zf], [-w * 0.68, y, zf]], tail: [[w * 0.72, y + 0.08, zr], [-w * 0.72, y + 0.08, zr]],
        ind: [[w * 0.9, y, zf - 0.03, 1], [-w * 0.9, y, zf - 0.03, -1], [w * 0.9, y + 0.08, zr + 0.03, 1], [-w * 0.9, y + 0.08, zr + 0.03, -1]], beam: [0, y, zf + 0.1] };
    }
    const headM = cfg.own ? m.userData.head : new THREE.MeshStandardMaterial({ color: 0xf4f1e8, emissive: 0xfff3d6, emissiveIntensity: 0, roughness: 0.2 });
    const tailM = cfg.own ? m.userData.tail : new THREE.MeshStandardMaterial({ color: 0x5a0a0a, emissive: 0xff1a10, emissiveIntensity: 0.05, roughness: 0.3 });
    const indM = { 1: new THREE.MeshStandardMaterial({ color: 0x6a4a10, emissive: 0xff9a10, emissiveIntensity: 0, roughness: 0.3 }), [-1]: null };
    indM[-1] = indM[1].clone();
    const add = (geo, mat, [x, y, z], rotY = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.y = rotY; root.add(o); return o; };
    for (const q of cfg.head) add(new THREE.CircleGeometry(0.09, 14), headM, q);
    for (const q of cfg.tail) add(new THREE.BoxGeometry(0.16, 0.07, 0.03), tailM, q);
    for (const q of cfg.ind) add(new THREE.BoxGeometry(0.08, 0.05, 0.04), indM[q[3]], q);
    const k = { root, headM, tailM, indM, beam: cfg.beam, nav: null };
    if (cfg.nav) {
      const nv = (c, pos) => { const mt = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0, roughness: 0.3 }); add(new THREE.SphereGeometry(0.07, 8, 6), mt, pos); return mt; };
      k.nav = { red: nv(0xff2010, [1.2, 1.55, 0.2]), green: nv(0x20ff40, [-1.2, 1.55, 0.2]), strobe: nv(0xffffff, [0, 2.8, -5.8]) };
    }
    return (m.userData.kit = k);
  }
  function updateLamps(dt, c) {
    const k = kit(c.kind, c.m);
    lamps.blinkT = (lamps.blinkT + dt) % 0.7; lamps.blinkOn = lamps.blink !== 0 && lamps.blinkT < 0.35;
    k.headM.emissiveIntensity = lamps.lights ? 9 : 0;
    k.tailM.emissiveIntensity = (lamps.lights ? 1.5 : 0.05) + lamps.brake * 7;
    for (const sx of [1, -1]) k.indM[sx].emissiveIntensity = lamps.blinkOn && (lamps.blink === sx || lamps.blink === 2) ? 4 : 0;
    if (k.nav) { const on = c.spin > 0.2 || lamps.lights ? 1 : 0, t = performance.now() / 1000; k.nav.red.emissiveIntensity = k.nav.green.emissiveIntensity = on * 3; k.nav.strobe.emissiveIntensity = on * (t % 1.2 < 0.08 ? 12 : 0); }
    if (beam.parent !== k.root) { k.root.add(beam); k.root.add(beam.target); beam.position.set(...k.beam); beam.target.position.set(k.beam[0], c.kind === 'heli' ? -30 : k.beam[1] - 1.6, k.beam[2] + (c.kind === 'heli' ? 18 : 22)); }
    beam.intensity = lamps.lights ? (c.kind === 'heli' ? 400 : 90) : 0;
  }

  const api = {
    KINDS,
    lamps,
    // more ride kinds from other modules (the police car, the delivery van): handling like a car
    register(kind, def, mesh) { KINDS[kind] = def; mesh.visible = false; mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; }); if (!mesh.userData.wheels) mesh.userData.wheels = []; meshes[kind] = mesh; scene.add(mesh); },
    get active() { return cur; },
    get kind() { return cur && cur.kind; },
    // returns false (with a toast) if it can't be placed
    start(kind, at, heading) {
      let x = at.x + Math.cos(heading) * 3.5, z = at.z - Math.sin(heading) * 3.5;
      if (kind === 'ski') { const w = findWater(at.x, at.z); if (!w) { toast('The jet ski needs water within 300 m'); return false; } [x, z] = w; }
      if (cur) cur.m.visible = false;
      const m = meshes[kind]; m.visible = true;
      cur = { kind, k: KINDS[kind], m, pos: new THREE.Vector3(x, groundHeight(x, z) + (kind === 'ski' ? 0 : 0.05), z), vel: new THREE.Vector3(), yaw: heading, pitch: 0, roll: 0, air: false, rpm: 900, spin: 0, lean: 0, coll: 0 };
      if (kind === 'ski') cur.pos.y = WATER_LEVEL;
      camPos.copy(cur.pos).add(V.set(-Math.sin(heading) * 8, 4, -Math.cos(heading) * 8)); camLook.copy(cur.pos);
      toast(`${cur.k.name} · press 1 to get back in the MX-5`);
      return true;
    },
    stop() { if (cur) cur.m.visible = false; const c = cur; cur = null; beam.intensity = 0; return c; },
    // dyn: moving obstacles near the ride (traffic, police, rival MX-5s, the parked roadster): { x, z, r, owner }
    update(dt, keys, dyn = []) {
      if (!cur) return;
      const c = cur, k = c.k, p = c.pos, v = c.vel;
      const thr = keys('KeyW', 'ArrowUp') ? 1 : 0, brk = keys('KeyS', 'ArrowDown') ? 1 : 0, steer = (keys('KeyA', 'ArrowLeft') ? 1 : 0) - (keys('KeyD', 'ArrowRight') ? 1 : 0), hb = keys('Space');
      F.set(Math.sin(c.yaw), 0, Math.cos(c.yaw));
      const fwdV = v.x * F.x + v.z * F.z, latX = v.x - F.x * fwdV, latZ = v.z - F.z * fwdV;
      if (c.kind === 'heli') {
        // helicopter: W/S collective, A/D yaw, arrows cyclic (tilt), lands on its skids
        const coll = (keys('KeyW') ? 1 : 0) - (keys('KeyS') ? 1 : 0), cyc = (keys('ArrowUp') ? 1 : 0) - (keys('ArrowDown') ? 1 : 0), roll = (keys('ArrowRight') ? 1 : 0) - (keys('ArrowLeft') ? 1 : 0), yawIn = (keys('KeyA') ? 1 : 0) - (keys('KeyD') ? 1 : 0);
        c.spin = Math.min(1, c.spin + dt * 0.5);
        const gh = groundHeight(p.x, p.z), onG = p.y <= gh + 0.06;
        c.pitch += ((onG ? 0 : cyc * 0.35) - c.pitch) * Math.min(1, dt * 2.5); c.roll += ((onG ? 0 : roll * 0.35) - c.roll) * Math.min(1, dt * 2.5);
        c.yaw += yawIn * 1.2 * dt * c.spin;
        const R = { x: -Math.cos(c.yaw), z: Math.sin(c.yaw) };   // the right-hand side
        const lift = c.spin * (9.81 + coll * 6);
        v.x += (F.x * c.pitch + R.x * c.roll) * 18 * dt * c.spin; v.z += (F.z * c.pitch + R.z * c.roll) * 18 * dt * c.spin;
        v.y += (lift - 9.81) * dt;
        v.x -= v.x * 0.35 * dt; v.z -= v.z * 0.35 * dt; v.y -= v.y * 0.9 * dt;
        const hs = Math.hypot(v.x, v.z); if (hs > k.vmax) { v.x *= k.vmax / hs; v.z *= k.vmax / hs; }
        p.addScaledVector(v, dt);
        const g2 = groundHeight(p.x, p.z); if (p.y < g2) { if (v.y < -6) toast('Hard landing!'); p.y = g2; v.y = Math.max(0, v.y); if (coll <= 0) { v.x *= 1 - Math.min(1, dt * 4); v.z *= 1 - Math.min(1, dt * 4); } }
        const wl = WATER_LEVEL + 0.4; if (p.y < wl && terrainHeight(p.x, p.z) < WATER_LEVEL) { p.y = wl; v.y = Math.max(0, v.y); }
        c.rpm = 3000 + c.spin * 3000 + coll * 1500; c.air = p.y > g2 + 0.3;
        const u = c.m.userData; u.rotor.rotation.y += dt * 30 * c.spin; u.tail.rotation.x += dt * 60 * c.spin; u.disc.material.opacity = 0.25 * c.spin;
        if (c.air && p.y - g2 < 8) fx.dust(p.x + (Math.random() - 0.5) * 8, g2 + 0.2, p.z + (Math.random() - 0.5) * 8, 1, terrainHeight(p.x, p.z) < 0 ? [0.85, 0.9, 0.95] : [0.6, 0.55, 0.45]);
      } else {
        // ground and water rides: drive along the heading, lateral grip pulls the velocity into line
        let grip = k.grip, onWater = false;
        if (c.kind === 'ski') { const depth = WATER_LEVEL - terrainHeight(p.x, p.z); onWater = depth > 0.35; if (!onWater) { grip = 20; v.multiplyScalar(Math.max(0, 1 - dt * 3)); if (Math.hypot(v.x, v.z) < 0.5 && thr) toast('Jet ski aground'); } }
        else { groundInfo(p.x, p.z, gi); const sf = SURFACES[gi.surface] || SURFACES.grass; grip *= sf.mu; if (hb) grip *= 0.25; }
        const spd = Math.hypot(v.x, v.z);
        if (!c.air) {
          const a = thr * k.acc * Math.max(0.15, 1 - Math.max(0, fwdV) / k.vmax) * (c.kind === 'ski' && !onWater ? 0 : 1) - brk * (fwdV > 0.5 ? k.brake : k.acc * 0.4) * (fwdV > -8 ? 1 : 0);
          v.x += F.x * a * dt; v.z += F.z * a * dt;
          const kl = Math.min(1, grip * dt); v.x -= latX * kl; v.z -= latZ * kl;
          v.x -= v.x * 0.02 * dt * spd * 0.1; v.z -= v.z * 0.02 * dt * spd * 0.1;
          if (!thr && !brk) { const roll = Math.min(1, dt * (c.kind === 'ski' ? 0.6 : 0.12)); v.x -= v.x * roll; v.z -= v.z * roll; }
          const turnRate = steer * k.turn * Math.min(1, spd / 6) * (fwdV < 0 ? -1 : 1) / (1 + spd / 40);
          c.yaw += turnRate * dt;
          c.lean += ((c.kind === 'bike' ? -Math.atan(turnRate * spd / 9.81) * 0.9 : c.kind === 'ski' ? -turnRate * 0.25 : 0) - c.lean) * Math.min(1, dt * 5);
        }
        const ox = p.x, oz = p.z;
        p.x += v.x * dt; p.z += v.z * dt;
        // piers and quays are walls for the jet ski
        if (c.kind === 'ski' && blocked(p.x, p.z)) { p.x = ox; p.z = oz; if (Math.hypot(v.x, v.z) > 6) toast('Bump!'); v.multiplyScalar(-0.3); }
        // collisions: push out of colliders, lose speed
        nearbyColliders(p.x, p.z, cols);
        for (let q = 0; q < cols.length; q += 4) { const dx = p.x - cols[q], dz = p.z - cols[q + 1], d = Math.hypot(dx, dz), r = cols[q + 2] + 0.7; if (d < r && p.y < cols[q + 3] - 0.6) { p.x += dx / (d || 1) * (r - d); p.z += dz / (d || 1) * (r - d); const vn = (v.x * dx + v.z * dz) / (d || 1); if (vn < 0) { v.x -= dx / (d || 1) * vn * 1.4; v.z -= dz / (d || 1) * vn * 1.4; if (-vn > 6 && c.coll <= 0) { toast('Crunch!'); c.coll = 1; fx.sparks(p.x, p.y + 0.6, p.z, 0, 0, 12, 1); } } } }
        // traffic and other moving cars: push out, bounce, and shove them (they slide off with their hazards on)
        const mass = c.kind === 'bike' ? 260 : c.kind === 'van' ? 2200 : 1400, rad = c.kind === 'bike' ? 0.45 : 0.95;
        for (const o of dyn) {
          // a traffic car's two circles (front and back) are joined into a capsule, so there's no gap at the doors
          let ox = o.x, oz = o.z; const pair = o.owner && o.owner.col && o.owner.col.length === 2 ? o.owner.col : null;
          if (pair) { if (o !== pair[0]) continue; const ax = pair[0].x, az = pair[0].z, sx = pair[1].x - ax, sz = pair[1].z - az, l2 = sx * sx + sz * sz || 1, t = Math.max(0, Math.min(1, ((p.x - ax) * sx + (p.z - az) * sz) / l2)); ox = ax + sx * t; oz = az + sz * t; }
          const dx = p.x - ox, dz = p.z - oz, d = Math.hypot(dx, dz), r = o.r + rad;
          if (d >= r || (o.y != null && Math.abs(o.y - p.y) > 2.5)) continue;
          const nx = dx / (d || 1), nz = dz / (d || 1); p.x += nx * (r - d); p.z += nz * (r - d);
          const vn = v.x * nx + v.z * nz;
          if (vn < 0) {
            v.x -= nx * vn * 1.3; v.z -= nz * vn * 1.3;
            if (o.owner && o.owner.imp) { o.owner.imp.x -= nx * -vn * mass * 0.9; o.owner.imp.z -= nz * -vn * mass * 0.9; }
            if (-vn > 4 && c.coll <= 0) { c.coll = 0.8; fx.sparks(p.x - nx * rad, p.y + 0.6, p.z - nz * rad, -nx * 2, -nz * 2, 14, 1); if (-vn > 9) toast('Crunch!'); }
          }
        }
        c.coll -= dt;
        if (c.kind === 'ski') {
          const target = onWater ? WATER_LEVEL + waveHeight(p.x, p.z, performance.now() / 1000, 0.6) : groundHeight(p.x, p.z);
          p.y += (target - p.y) * Math.min(1, dt * 8); c.pitch = -Math.min(0.12, spd * 0.006);
          if (onWater && spd > 4) fx.dust(p.x - F.x * 1.6, p.y + 0.2, p.z - F.z * 1.6, 1, [0.9, 0.95, 1]);
        } else {
          // follow the ground; leave it over crests (jumps), land back on it
          const gh = groundHeightAt(p.x, p.z, p.y + 1.0);
          if (c.air) { v.y -= 9.81 * dt; p.y += v.y * dt; if (p.y <= gh) { p.y = gh; c.air = false; if (v.y < -7) toast('Big landing!'); v.y = 0; } }
          else { const drop = p.y - gh; if (drop > 0.35 && spd > 12) { c.air = true; v.y = Math.max(0, c.vyPrev || 0); } else { c.vyPrev = (gh - p.y) / Math.max(dt, 1e-3); p.y = gh; } }
          const ahead = groundHeight(p.x + F.x * 1.2, p.z + F.z * 1.2), back = groundHeight(p.x - F.x * 1.2, p.z - F.z * 1.2);
          if (!c.air) c.pitch = -Math.atan2(ahead - back, 2.4);
          if (spd > 6 && gi.surface !== 'asphalt' && Math.random() < spd * dt * 0.8) fx.dust(p.x - F.x * 1.5, p.y + 0.2, p.z - F.z * 1.5, 1, gi.surface === 'sand' ? [0.78, 0.68, 0.52] : [0.6, 0.55, 0.45]);
        }
        c.rpm = 1000 + Math.min(1, Math.abs(fwdV) / k.vmax) * (c.kind === 'bike' ? 9000 : 6000) + thr * 600;
        const wr = fwdV * dt / 0.34; for (const w of c.m.userData.wheels) w.rotation.x += wr;
        if (c.m.userData.fronts) for (const w of c.m.userData.fronts) w.rotation.y = steer * 0.35;
        if (c.m.userData.front) c.m.userData.front.rotation.y = steer * 0.25;
      }
      lamps.brake = c.kind !== 'heli' && brk && fwdV > 0.5 ? 1 : 0;
      updateLamps(dt, c);
      // pose
      E.set(c.pitch, c.yaw, c.kind === 'bike' ? 0 : c.kind === 'ski' ? c.lean : c.roll, 'YXZ');
      c.m.position.copy(p); c.m.quaternion.setFromEuler(E);
      if (c.kind === 'bike') c.m.userData.lean.rotation.z = c.lean;
    },
    // chase camera
    camera(camera, dt, lookYaw = 0) {
      if (!cur) return false;
      const c = cur, [dist, hgt] = c.k.cam, yaw = c.yaw + lookYaw;
      V.set(c.pos.x - Math.sin(yaw) * dist, c.pos.y + hgt, c.pos.z - Math.cos(yaw) * dist);
      const gmin = Math.max(groundHeight(V.x, V.z), WATER_LEVEL) + 0.6; if (V.y < gmin) V.y = gmin;
      camPos.lerp(V, 1 - Math.pow(0.002, dt)); if (camPos.distanceTo(V) > 60) camPos.copy(V);
      camLook.lerp(V.set(c.pos.x + Math.sin(c.yaw) * 2, c.pos.y + 1, c.pos.z + Math.cos(c.yaw) * 2), 1 - Math.pow(0.0001, dt));
      camera.position.copy(camPos); camera.up.set(0, 1, 0); camera.lookAt(camLook);
      return true;
    },
    get info() { if (!cur) return null; const s = Math.hypot(cur.vel.x, cur.vel.z); return { name: cur.k.name, kmh: s * 3.6, rpm: cur.rpm, alt: cur.pos.y - groundHeight(cur.pos.x, cur.pos.z), heli: cur.kind === 'heli', pos: cur.pos, vel: cur.vel, yaw: cur.yaw, air: cur.air }; },
  };
  return api;
}
