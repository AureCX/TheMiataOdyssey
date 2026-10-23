// Home: your house on the Central road north of Fairfield. The garage door rolls up as you arrive; drive in and
// stop to sleep until morning (fills the tank, saves). The trophy shelf at the back of the garage gains a cup for
// every achievement, and the motorbike and the Strada GT are parked on the drive.
import * as THREE from 'three';
import { RBox } from './shapes.js';
import { HOME_LOTS, groundHeight } from './world.js';
import { addCollider } from './scenery.js';
import { buildBike, buildGT } from './rides.js';

export function createHome({ scene, toast }) {
  const L = HOME_LOTS[0]; if (!L) return null;
  const group = new THREE.Group(); scene.add(group);
  const ux = L.ux, uz = L.uz, vx = -uz, vz = ux, H = L.h;
  const P = (u, v) => [L.cx + ux * u + vx * v, L.cz + uz * u + vz * v];
  const face = Math.atan2(-vx, -vz);   // local +z points at the road
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
  const place = (obj, u, v, y = 0) => { const [x, z] = P(u, v); obj.position.set(x, H + y, z); obj.rotation.y = face; group.add(obj); return obj; };
  // the drive: fine gravel over the plot, a lawn strip and a low hedge along the sides
  { const drive = new THREE.Mesh(new THREE.PlaneGeometry(L.hl * 2, L.half * 2).rotateX(-Math.PI / 2), M(0x8d8270, { roughness: 0.95 })); place(drive, 0, 0, 0.04); drive.receiveShadow = true;
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), M(0x4f7d32)); place(lawn, -8.5, -6, 0.05);
    for (const u of [-L.hl + 0.4, L.hl - 0.4]) { const h = new THREE.Mesh(new RBox(0.8, 1.1, L.half * 2 - 2), M(0x2f5a2a)); place(h, u, 1, 0.55); h.rotation.y = face; } }
  // the house: white render, dark pitched roof, big windows that glow at night
  const winM = new THREE.MeshStandardMaterial({ color: 0x2b3a44, roughness: 0.1, metalness: 0.4, emissive: 0xffc98a, emissiveIntensity: 0 });
  const house = new THREE.Group(); place(house, -4.5, 7.5);
  { const w = M(0xf1eee6), roof = M(0x33373c);
    const b = new THREE.Mesh(new RBox(12, 6, 8), w); b.position.y = 3; b.castShadow = b.receiveShadow = true; house.add(b);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 6.6, 3, 4, 1).rotateY(Math.PI / 4), roof); r.scale.set(1.45, 1, 0.9); r.position.y = 7.5; r.castShadow = true; house.add(r);
    for (const [x, y] of [[-3.5, 1.6], [3.5, 1.6], [-3.5, 4.6], [0, 4.6], [3.5, 4.6]]) { const wi = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.5), winM); wi.position.set(x, y, 4.01); house.add(wi); }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.3), M(0x8a2a1a)); door.position.set(0, 1.15, 4.01); house.add(door);
    const chim = new THREE.Mesh(new RBox(0.9, 2.4, 0.9), M(0x7a5a4a)); chim.position.set(3.5, 8.3, -1); house.add(chim); }
  for (let k = -5; k <= 5; k += 2.5) { const [px, pz] = P(-4.5 + k, 7.5); addCollider(px, pz, 3.6, H + 9); }
  // mailbox by the road
  { const mb = new THREE.Group(); place(mb, -11, -11.5); const p = new THREE.Mesh(new RBox(0.1, 1.1, 0.1), M(0x444444)); p.position.y = 0.55; mb.add(p); const b = new THREE.Mesh(new RBox(0.35, 0.3, 0.55), M(0xc8102e)); b.position.y = 1.2; mb.add(b); }
  // the garage: open front, door rolls up, trophy shelf on the back wall
  const gar = new THREE.Group(); place(gar, 7.5, 6.5);
  const GW = 6.4, GD = 9, GH = 3.4;
  { const w = M(0xe4e1d8);
    for (const s of [-1, 1]) { const side = new THREE.Mesh(new RBox(0.25, GH, GD), w); side.position.set(s * GW / 2, GH / 2, 0); side.castShadow = true; gar.add(side); }
    const back = new THREE.Mesh(new RBox(GW, GH, 0.25), w); back.position.set(0, GH / 2, -GD / 2); gar.add(back);
    const roof = new THREE.Mesh(new RBox(GW + 0.6, 0.3, GD + 0.6), M(0x33373c)); roof.position.y = GH + 0.15; roof.castShadow = true; gar.add(roof);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(GW, GD).rotateX(-Math.PI / 2), M(0x8f8d88, { roughness: 0.6 })); floor.position.y = 0.06; gar.add(floor);
    const lamp = new THREE.Mesh(new RBox(1.4, 0.06, 0.2), new THREE.MeshBasicMaterial({ color: 0xfff4dd })); lamp.position.set(0, GH - 0.05, 0); gar.add(lamp);
    const shelf = new THREE.Mesh(new RBox(GW - 0.6, 0.06, 0.45), M(0x6b4a2b)); shelf.position.set(0, 1.5, -GD / 2 + 0.38); gar.add(shelf);
    const shelf2 = shelf.clone(); shelf2.position.y = 2.3; gar.add(shelf2); }
  const door = new THREE.Mesh(new RBox(GW - 0.2, GH - 0.1, 0.12), M(0xc9ccd0, { metalness: 0.4, roughness: 0.5 })); door.position.set(0, GH / 2, GD / 2); gar.add(door);
  gar.updateMatrixWorld(true);
  const wv = new THREE.Vector3();
  for (let k = -GD / 2; k <= GD / 2 - 0.5; k += 1.2) for (const s of [-1, 1]) { wv.set(s * GW / 2, 0, k).applyMatrix4(gar.matrixWorld); addCollider(wv.x, wv.z, 0.35, H + GH + 0.3); }
  for (let k = -GW / 2; k <= GW / 2; k += 1.2) { wv.set(k, 0, -GD / 2).applyMatrix4(gar.matrixWorld); addCollider(wv.x, wv.z, 0.35, H + GH + 0.3); }
  // trophies: a cup per achievement
  const gold = M(0xd4a62a, { metalness: 0.9, roughness: 0.25 }), cups = [];
  for (let i = 0; i < 26; i++) { const row = i < 13 ? 0 : 1, k = i % 13, c = new THREE.Group(); c.position.set(-GW / 2 + 0.7 + k * 0.42, 1.53 + row * 0.8, -GD / 2 + 0.38); gar.add(c);
    const base = new THREE.Mesh(new RBox(0.16, 0.06, 0.16), M(0x222222)); base.position.y = 0.03; c.add(base);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.12, 6), gold); stem.position.y = 0.12; c.add(stem);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.04, 0.14, 10, 1, true), gold); cup.position.y = 0.25; c.add(cup);
    c.visible = false; cups.push(c); }
  // the other rides on the drive
  { const gt = buildGT(); place(gt, -7, -2); gt.rotation.y = face + 0.5; const bk = buildBike(); place(bk, 2.5, 1.5); bk.rotation.y = face - 0.3; bk.userData.lean.rotation.z = -0.12; }

  wv.set(0, 0, 0).applyMatrix4(gar.matrixWorld);
  const inside = { x: wv.x, z: wv.z };
  let doorOpen = 0, stopT = 0;
  const api = {
    get place() { return { x: L.cx, z: L.cz }; },
    // where you're put when you go home: in front of the garage, facing it
    get spawn() { const [x, z] = P(7.5, -6); return { x, z, h: H, heading: Math.atan2(vx, vz) }; },
    prompt: '',
    setTrophies(n) { cups.forEach((c, i) => { c.visible = i < n; }); },
    update(dt, { veh, mode, night, fPress, sleep }) {
      const d = Math.hypot(veh.pos.x - inside.x, veh.pos.z - inside.z);
      doorOpen += ((d < 30 ? 1 : 0) - doorOpen) * Math.min(1, dt * 1.5);
      door.position.y = GH / 2 + doorOpen * (GH - 0.4); door.scale.y = 1 - doorOpen * 0.85;
      winM.emissiveIntensity = night ? 1.1 : 0;
      api.prompt = '';
      if (mode === 'car' && d < 3.5 && Math.hypot(veh.vel.x, veh.vel.z) < 0.4) { stopT += dt; if (stopT > 0.5) api.prompt = 'Home · F to sleep until morning (fills the tank, saves)'; } else stopT = 0;
      if (api.prompt && fPress) { sleep(); return true; }
      return false;
    },
  };
  return api;
}
