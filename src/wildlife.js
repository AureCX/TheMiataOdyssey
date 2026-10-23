// Wildlife around you: deer in the forests (out on the roads at dusk and dawn; they bolt when you come close),
// cows grazing in the fields, seagulls wheeling over the harbour and the coast, and flocks of small birds on the
// ground that burst into the air as you pass. Animals live in a ring around you and are recycled as you move.
import * as THREE from 'three';
import { RBox } from './shapes.js';
import { groundHeight, terrainHeight, biomeWeights, roads, roadAt, townAt, HARBOUR } from './world.js';

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
function deerModel() {
  const g = new THREE.Group(), fur = M(0x8a5a32), pale = M(0xd9c3a0);
  const body = new THREE.Mesh(new RBox(0.42, 0.45, 1.15), fur); body.position.y = 1.0; g.add(body);
  const neck = new THREE.Mesh(new RBox(0.2, 0.55, 0.22), fur); neck.position.set(0, 1.35, 0.55); neck.rotation.x = -0.5; g.add(neck);
  const head = new THREE.Mesh(new RBox(0.18, 0.2, 0.38), fur); head.position.set(0, 1.62, 0.75); g.add(head);
  const tail = new THREE.Mesh(new RBox(0.1, 0.15, 0.05), pale); tail.position.set(0, 1.12, -0.6); g.add(tail);
  for (const s of [-1, 1]) { const a = new THREE.Mesh(new RBox(0.03, 0.35, 0.03), M(0x5a4636)); a.position.set(s * 0.08, 1.85, 0.68); a.rotation.z = s * 0.35; g.add(a); }
  const legs = []; for (const [x, z] of [[-0.15, 0.45], [0.15, 0.45], [-0.15, -0.45], [0.15, -0.45]]) { const l = new THREE.Group(); l.position.set(x, 0.8, z); const m = new THREE.Mesh(new RBox(0.08, 0.8, 0.08), fur); m.position.y = -0.4; l.add(m); g.add(l); legs.push(l); }
  g.userData.legs = legs; return g;
}
function cowModel() {
  const g = new THREE.Group(), w = M(0xf2f0ea), b = M(0x1e1e1e);
  const body = new THREE.Mesh(new RBox(0.75, 0.75, 1.7), Math.random() < 0.5 ? w : M(0x7a4a2a)); body.position.y = 1.0; g.add(body);
  const patch = new THREE.Mesh(new RBox(0.77, 0.4, 0.6), b); patch.position.set(0, 1.1, -0.2); g.add(patch);
  const head = new THREE.Mesh(new RBox(0.4, 0.4, 0.5), w); head.position.set(0, 0.95, 1.0); g.add(head);
  const nose = new THREE.Mesh(new RBox(0.36, 0.2, 0.12), M(0xd99a9a)); nose.position.set(0, 0.85, 1.28); g.add(nose);
  const legs = []; for (const [x, z] of [[-0.25, 0.6], [0.25, 0.6], [-0.25, -0.6], [0.25, -0.6]]) { const l = new THREE.Group(); l.position.set(x, 0.62, z); const m = new THREE.Mesh(new RBox(0.15, 0.62, 0.15), w); m.position.y = -0.31; l.add(m); g.add(l); legs.push(l); }
  g.userData.legs = legs; return g;
}
function birdModel(color, span) {
  const g = new THREE.Group(), m = M(color, { side: THREE.DoubleSide });
  const body = new THREE.Mesh(new RBox(span * 0.15, span * 0.12, span * 0.45), m); g.add(body);
  const wings = []; for (const s of [-1, 1]) { const w = new THREE.Group(); const p = new THREE.Mesh(new THREE.PlaneGeometry(span * 0.5, span * 0.22).rotateX(-Math.PI / 2).translate(s * span * 0.25, 0, 0), m); w.add(p); g.add(w); wings.push(w); }
  g.userData.wings = wings; return g;
}

export function createWildlife({ scene, toast }) {
  const group = new THREE.Group(); scene.add(group);
  const deer = Array.from({ length: 10 }, () => ({ m: deerModel(), active: false }));
  const cows = Array.from({ length: 14 }, () => ({ m: cowModel(), active: false }));
  const gulls = Array.from({ length: 14 }, () => ({ m: birdModel(0xf4f4f4, 1.1), active: false }));
  const flocks = Array.from({ length: 4 }, () => ({ birds: Array.from({ length: 9 }, () => birdModel(0x4a3a2e, 0.35)), active: false }));
  for (const a of [...deer, ...cows, ...gulls]) { a.m.visible = false; group.add(a.m); }
  for (const f of flocks) for (const b of f.birds) { b.visible = false; group.add(b); }
  const forestRoads = roads.filter((r) => r.type === 'road' || r.type === 'gravel');
  let t = 0;

  // a spawn point 150–500 m from the player that suits the animal
  function findSpot(p, ok, tries = 25) { for (let i = 0; i < tries; i++) { const a = Math.random() * Math.PI * 2, d = 150 + Math.random() * 350, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d; if (ok(x, z)) return [x, z]; } return null; }
  const flat = (x, z) => Math.abs(terrainHeight(x + 3, z) - terrainHeight(x - 3, z)) + Math.abs(terrainHeight(x, z + 3) - terrainHeight(x, z - 3)) < 2;

  function walkLegs(m, phase, amp) { m.userData.legs.forEach((l, i) => { l.rotation.x = Math.sin(phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * amp; }); }

  return {
    update(dt, { pos, vel, hour, mode }) {
      t += dt;
      const dusk = (hour > 17.5 && hour < 21.5) || (hour > 5 && hour < 8.5);
      const spd = Math.hypot(vel.x, vel.z);
      // ---- deer
      for (const d of deer) {
        if (!d.active) {
          if (Math.random() > dt * 0.6) continue;
          const sp = findSpot(pos, (x, z) => biomeWeights(x, z).forest > 0.4 && flat(x, z) && !townAt(x, z, 20));
          if (!sp) continue;
          // at dusk, some come out to the road edge
          let [x, z] = sp; if (dusk && Math.random() < 0.5) { const r = forestRoads[(Math.random() * forestRoads.length) | 0], i = (Math.random() * r.n) | 0; if (Math.hypot(r.pts[i][0] - pos.x, r.pts[i][1] - pos.z) < 500) { x = r.pts[i][0] - r.tz[i] * (r.hw + 3); z = r.pts[i][1] + r.tx[i] * (r.hw + 3); d.cross = { tx: -r.tz[i], tz: r.tx[i] }; } }
          Object.assign(d, { active: true, x, z, yaw: Math.random() * 6.28, v: 0, state: 'graze', timer: 3 + Math.random() * 8, flee: 0, phase: 0, down: 0 }); d.m.visible = true;
        }
        const dx = d.x - pos.x, dz = d.z - pos.z, dist = Math.hypot(dx, dz);
        if (dist > 700) { d.active = false; d.m.visible = false; d.cross = null; continue; }
        if (d.down > 0) { d.down += dt; d.m.rotation.z = Math.min(1.5, d.down * 3); if (d.down > 12) { d.active = false; d.m.visible = false; d.m.rotation.z = 0; } continue; }
        if (dist < 45 && (spd > 4 || dist < 15) && d.state !== 'flee') { d.state = 'flee'; d.timer = 6; d.yaw = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.8; }
        d.timer -= dt;
        if (d.state === 'graze' && d.timer <= 0) { d.state = Math.random() < 0.5 ? 'walk' : 'graze'; d.timer = 4 + Math.random() * 6; d.yaw += (Math.random() - 0.5) * 2; if (d.cross) { d.state = 'walk'; d.yaw = Math.atan2(d.cross.tx, d.cross.tz); d.cross = null; d.timer = 8; } }
        else if (d.state !== 'graze' && d.timer <= 0) { d.state = 'graze'; d.timer = 5 + Math.random() * 8; }
        const vt = d.state === 'flee' ? 11 : d.state === 'walk' ? 1.3 : 0;
        d.v += (vt - d.v) * Math.min(1, dt * 3); d.x += Math.sin(d.yaw) * d.v * dt; d.z += Math.cos(d.yaw) * d.v * dt; d.phase += d.v * dt * 2.2;
        const gy = groundHeight(d.x, d.z);
        d.m.position.set(d.x, gy + (d.state === 'flee' ? Math.abs(Math.sin(d.phase)) * 0.35 : 0), d.z); d.m.rotation.y = d.yaw; walkLegs(d.m, d.phase, d.state === 'flee' ? 0.8 : 0.35 * Math.min(1, d.v));
        // hit by the car
        if (mode === 'car' && dist < 1.8 && spd > 5) { d.down = 0.01; toast('Oh deer! It limps off into the trees…'); vel.multiplyScalar(0.8); }
      }
      // ---- cows: in fields (plains), slow grazers
      for (const c of cows) {
        if (!c.active) {
          if (Math.random() > dt * 0.8) continue;
          const sp = findSpot(pos, (x, z) => { const b = biomeWeights(x, z); return b.forest < 0.3 && b.desert < 0.3 && b.mountain < 0.3 && terrainHeight(x, z) > 4 && flat(x, z) && !roadAt(x, z, 12) && !townAt(x, z, 30); });
          if (!sp) continue;
          Object.assign(c, { active: true, x: sp[0], z: sp[1], yaw: Math.random() * 6.28, v: 0, timer: Math.random() * 10, phase: 0 }); c.m.visible = true;
          // herd: a couple more nearby
          for (const o of cows) if (!o.active && Math.random() < 0.6) { Object.assign(o, { active: true, x: sp[0] + (Math.random() - 0.5) * 20, z: sp[1] + (Math.random() - 0.5) * 20, yaw: Math.random() * 6.28, v: 0, timer: Math.random() * 10, phase: 0 }); o.m.visible = true; if (Math.random() < 0.4) break; }
        }
        if (Math.hypot(c.x - pos.x, c.z - pos.z) > 750) { c.active = false; c.m.visible = false; continue; }
        c.timer -= dt; if (c.timer <= 0) { c.timer = 6 + Math.random() * 10; c.walk = Math.random() < 0.35; c.yaw += (Math.random() - 0.5) * 1.5; }
        const vt = c.walk ? 0.6 : 0; c.v += (vt - c.v) * Math.min(1, dt); c.x += Math.sin(c.yaw) * c.v * dt; c.z += Math.cos(c.yaw) * c.v * dt; c.phase += c.v * dt * 3;
        if (roadAt(c.x, c.z, 4)) { c.yaw += Math.PI; c.x += Math.sin(c.yaw) * 0.5; c.z += Math.cos(c.yaw) * 0.5; }
        c.m.position.set(c.x, groundHeight(c.x, c.z), c.z); c.m.rotation.y = c.yaw; walkLegs(c.m, c.phase, 0.3 * c.v);
        c.m.children[2].rotation.x = c.walk ? 0 : 0.5 + Math.sin(t * 0.7 + c.x) * 0.15;   // head down to graze
      }
      // ---- seagulls over the harbour and the coast
      const coast = Math.hypot(pos.x - HARBOUR.cx, pos.z - HARBOUR.cz) < 900 || terrainHeight(pos.x, pos.z) < 6;
      for (const [k, g] of gulls.entries()) {
        if (!g.active) { if (!coast || Math.random() > dt) continue; const cx = coast && Math.hypot(pos.x - HARBOUR.cx, pos.z - HARBOUR.cz) < 900 ? HARBOUR.cx : pos.x, cz = coast && Math.hypot(pos.x - HARBOUR.cx, pos.z - HARBOUR.cz) < 900 ? HARBOUR.cz + 20 : pos.z + 60; Object.assign(g, { active: true, cx, cz, r: 25 + Math.random() * 60, a: Math.random() * 6.28, w: (0.25 + Math.random() * 0.2) * (k % 2 ? 1 : -1), y: 12 + Math.random() * 25, flap: Math.random() * 6 }); g.m.visible = true; }
        if (Math.hypot(g.cx - pos.x, g.cz - pos.z) > 1200) { g.active = false; g.m.visible = false; continue; }
        g.a += g.w * dt; g.flap += dt * (Math.sin(t * 0.5 + k) > 0.3 ? 9 : 1);
        const x = g.cx + Math.cos(g.a) * g.r, z = g.cz + Math.sin(g.a) * g.r, y = Math.max(terrainHeight(x, z), 0) + g.y + Math.sin(t + k) * 2;
        g.m.position.set(x, y, z); g.m.rotation.set(0, Math.atan2(-Math.sin(g.a) * g.w, Math.cos(g.a) * g.w), -Math.sign(g.w) * 0.35);
        const f = Math.sin(g.flap) * 0.5; g.m.userData.wings[0].rotation.z = f; g.m.userData.wings[1].rotation.z = -f;
      }
      // ---- small birds on the ground that take off as you pass
      for (const f of flocks) {
        if (!f.active) {
          if (Math.random() > dt * 0.5) continue;
          const sp = findSpot(pos, (x, z) => { const b = biomeWeights(x, z); return b.desert < 0.4 && b.mountain < 0.5 && terrainHeight(x, z) > 3 && !townAt(x, z) && !!roadAt(x, z, 14) && !roadAt(x, z, 3); }, 40);
          if (!sp) continue;
          f.active = true; f.state = 'ground'; f.t = 0; f.x = sp[0]; f.z = sp[1];
          f.birds.forEach((b, i) => { b.userData.o = [(Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8]; b.userData.v = new THREE.Vector3(); b.position.set(f.x + b.userData.o[0], groundHeight(f.x + b.userData.o[0], f.z + b.userData.o[1]) + 0.1, f.z + b.userData.o[1]); b.rotation.set(0, Math.random() * 6.28, 0); b.visible = true; });
        }
        const d = Math.hypot(f.x - pos.x, f.z - pos.z);
        if (d > 700) { f.active = false; for (const b of f.birds) b.visible = false; continue; }
        if (f.state === 'ground') {
          f.t += dt; for (const b of f.birds) { b.position.y = groundHeight(b.position.x, b.position.z) + 0.1 + Math.max(0, Math.sin(t * 9 + b.userData.o[0] * 7)) * 0.08; b.userData.wings[0].rotation.z = 0.9; b.userData.wings[1].rotation.z = -0.9; }
          if (d < 30) { f.state = 'fly'; f.t = 0; for (const b of f.birds) { const ax = b.position.x - pos.x, az = b.position.z - pos.z, l = Math.hypot(ax, az) || 1; b.userData.v.set(ax / l * 8 + (Math.random() - 0.5) * 4, 5 + Math.random() * 3, az / l * 8 + (Math.random() - 0.5) * 4); b.userData.flap = Math.random() * 6; } }
        } else {
          f.t += dt;
          for (const b of f.birds) { const v = b.userData.v; v.y -= (f.t > 2 ? 1.5 : 0) * dt; b.position.addScaledVector(v, dt); b.rotation.y = Math.atan2(v.x, v.z); b.userData.flap += dt * 22; const fl = Math.sin(b.userData.flap) * 0.9; b.userData.wings[0].rotation.z = fl; b.userData.wings[1].rotation.z = -fl; }
          if (f.t > 9) { f.active = false; for (const b of f.birds) b.visible = false; }
        }
      }
    },
  };
}
