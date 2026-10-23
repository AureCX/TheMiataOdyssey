// Red Rock Quarry: the mech story, five fights in the desert arena (pause menu → Jobs), each unlocking the next.
//   1 Training: smash 14 target crates (punch or ram).
//   2 Drone swarm: drones circle overhead and dive at you; punch them while they're low.   → unlocks the shield
//   3 Twin scouts: two small, quick walkers that stomp and shoot.                         → unlocks the dash (Shift)
//   4 Turret line: four turrets lobbing plasma from the quarry rim.                        → unlocks the ground pound
//   5 The Iron Golem: a three-storey walker with shockwave stomps and plasma orbs. Punch its glowing core (double
//     damage while it winds up a stomp).
// Upgrades: the shield takes 40% off every hit; the dash (Shift in the mech) lunges you forward; the ground pound
// (land hard from a jump or jet) blasts everything within 10 m.
import * as THREE from 'three';
import { RBox } from './shapes.js';
import { ARENA, groundHeight, roads, townAt, terrainHeight } from './world.js';
import { addCollider } from './scenery.js';

export const CHAPTERS = [
  { name: 'Training', pay: 400 },
  { name: 'Drone swarm', pay: 700, unlock: 'shield' },
  { name: 'Twin scouts', pay: 1000, unlock: 'dash' },
  { name: 'Turret line', pay: 1400, unlock: 'pound' },
  { name: 'The Iron Golem', pay: 3000 },
];
const UNLOCK = { shield: 'Shield (−40% damage)', dash: 'Dash (Shift in the mech)', pound: 'Ground pound (land hard from a jump)' };

export function createArena({ scene, toast, econ, fx, audio, settings, saveSettings, onShake }) {
  const A = ARENA, H = A.h;
  const story = settings.mechStory || (settings.mechStory = { ch: settings.arenaBest ? 5 : 0, up: {} });
  const group = new THREE.Group(); scene.add(group);
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
  const rock = M(0x9a5a3c, { flatShading: true });
  // quarry walls: stepped cliffs in a ring, open to the south
  for (let k = 0; k < 34; k++) {
    const a = k / 34 * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.32) continue;
    const r = A.r + 8 + Math.sin(k * 2.7) * 3, x = A.x + Math.cos(a) * r, z = A.z + Math.sin(a) * r, h = 12 + (k * 37 % 11);
    const b = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rock); b.scale.set(9, h, 7); b.position.set(x, H + h * 0.45, z); b.rotation.set(k, a, k * 0.3); b.castShadow = b.receiveShadow = true; group.add(b);
    addCollider(x, z, 7, H + h * 1.3);
  }
  for (const a of [0.8, 2.35, 3.9, 5.5]) { const x = A.x + Math.cos(a) * (A.r - 4), z = A.z + Math.sin(a) * (A.r - 4); const m = new THREE.Mesh(new RBox(0.5, 18, 0.5), M(0x777777, { metalness: 0.6 })); m.position.set(x, H + 9, z); group.add(m); const hd = new THREE.Mesh(new RBox(2.5, 0.8, 1.2), new THREE.MeshBasicMaterial({ color: 0xfff2c0 })); hd.position.set(x, H + 18, z); hd.lookAt(A.x, H, A.z); group.add(hd); addCollider(x, z, 0.6, H + 19); }
  { const x = A.x + 20, z = A.z + A.r + 4, c = new THREE.Group(); c.position.set(x, groundHeight(x, z), z); group.add(c);
    const b = new THREE.Mesh(new RBox(8, 3, 4), M(0xe8b923)); b.position.y = 1.5; c.add(b);
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 128; const g = cv.getContext('2d'); g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, 1024, 128); g.fillStyle = '#e8b923'; g.font = '700 74px "Barlow Condensed", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('RED ROCK QUARRY · MECH ARENA', 512, 68);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; const sg = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide })); sg.position.set(0, 3.7, 0); c.add(sg);
    addCollider(x, z, 4, c.position.y + 3); }

  // ---------------------------------------------------------------- enemy models
  const tcv = document.createElement('canvas'); tcv.width = tcv.height = 128; { const g = tcv.getContext('2d'); g.fillStyle = '#d9d2c0'; g.fillRect(0, 0, 128, 128); for (const [r, c] of [[56, '#c8102e'], [42, '#fff'], [28, '#c8102e'], [14, '#fff'], [6, '#c8102e']]) { g.fillStyle = c; g.beginPath(); g.arc(64, 64, r, 0, 6.3); g.fill(); } }
  const tt = new THREE.CanvasTexture(tcv); tt.colorSpace = THREE.SRGBColorSpace;
  const crateM = new THREE.MeshStandardMaterial({ map: tt, roughness: 0.7 });
  const iron = M(0x3a3f46, { metalness: 0.7, roughness: 0.4 }), dark = M(0x1b1d20, { metalness: 0.5 });
  const visor = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 2.5 });
  function walker(scale, tint) {
    const g = new THREE.Group(), glow = new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 2 });
    const part = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    const hips = new THREE.Group(); hips.position.y = 7; g.add(hips);
    const legs = [-1, 1].map((s) => { const l = new THREE.Group(); l.position.set(s * 2.2, 0, 0); hips.add(l); part(new THREE.BoxGeometry(1.8, 4, 2), iron, 0, -2, 0, l); part(new THREE.BoxGeometry(1.6, 3.4, 1.8), dark, 0, -5.6, 0, l); part(new THREE.BoxGeometry(2.4, 0.6, 3.4), iron, 0, -7.1, 0.5, l); return l; });
    part(new THREE.BoxGeometry(6.5, 5, 4), iron, 0, 10, 0);
    const core = part(new THREE.SphereGeometry(1.1, 16, 12), glow, 0, 10, 2.05);
    part(new THREE.BoxGeometry(3, 2, 2.6), dark, 0, 13.6, 0.2); part(new THREE.BoxGeometry(2.6, 0.5, 0.1), visor, 0, 13.8, 1.52);
    const arms = [-1, 1].map((s) => { const a = new THREE.Group(); a.position.set(s * 4.1, 12, 0); g.add(a); part(new THREE.BoxGeometry(1.6, 5, 1.6), iron, 0, -2.5, 0, a); part(new THREE.BoxGeometry(2.2, 2.2, 2.2), dark, 0, -5.6, 0, a); return a; });
    g.scale.setScalar(scale); group.add(g);
    return { g, legs, arms, core };
  }
  function drone() {
    const g = new THREE.Group(), body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), M(0x2a2e33, { metalness: 0.6 })); g.add(body);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff2020, emissiveIntensity: 2 })); eye.position.z = 0.75; g.add(eye);
    for (const [x, z] of [[1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4]]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 12), M(0x111111, { transparent: true, opacity: 0.6 })); r.position.set(x, 0.3, z); g.add(r); const arm = new THREE.Mesh(new RBox(Math.abs(x) || 0.12, 0.1, Math.abs(z) || 0.12), M(0x444444)); arm.position.set(x / 2, 0.2, z / 2); g.add(arm); }
    group.add(g); return { g, eye };
  }
  function turret() {
    const g = new THREE.Group(); const base = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.3, 2.2, 10), iron); base.position.y = 1.1; g.add(base);
    const head = new THREE.Group(); head.position.y = 2.6; g.add(head); const hb = new THREE.Mesh(new RBox(2.2, 1.4, 2.2), dark); head.add(hb);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.6, 10).rotateX(Math.PI / 2), iron); barrel.position.set(0, 0.2, 1.8); head.add(barrel);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshStandardMaterial({ color: 0x8cf0ff, emissive: 0x60d0ff, emissiveIntensity: 2 })); eye.position.set(0, 0.5, 1.05); head.add(eye);
    group.add(g); return { g, head };
  }
  const debris = [], debrisGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const burst = (x, y, z, mat, n = 9, s = 1) => { for (let i = 0; i < n; i++) { const d = new THREE.Mesh(debrisGeo, mat); d.scale.setScalar(s); d.position.set(x, y, z); d.userData.v = new THREE.Vector3((Math.random() - 0.5) * 10, 4 + Math.random() * 7, (Math.random() - 0.5) * 10); d.userData.t = 3; group.add(d); debris.push(d); } };
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.4, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, side: THREE.DoubleSide, depthWrite: false })); ring.visible = false; group.add(ring);
  const orbs = [], orbGeo = new THREE.SphereGeometry(0.7, 12, 8), orbM = new THREE.MeshBasicMaterial({ color: 0x8cf0ff });
  const V = new THREE.Vector3();

  let st = null, enemies = [];
  // the rogue mech: now and then a walker turns up in the countryside; walk up to it in your mech to take it on
  let rogue = null, rogueCool = 240 + Math.random() * 240;
  function spawnRogue(near) {
    const main = roads.filter((r) => r.type === 'road' || r.type === 'highway');
    for (let t = 0; t < 40; t++) {
      const r = main[(Math.random() * main.length) | 0], i = (Math.random() * r.n) | 0, side = Math.random() < 0.5 ? 1 : -1;
      const x = r.pts[i][0] - r.tz[i] * side * 40, z = r.pts[i][1] + r.tx[i] * side * 40, d = Math.hypot(x - near.x, z - near.z);
      if (d < 450 || d > 1100 || townAt(x, z, 80) || terrainHeight(x, z) < 2 || Math.hypot(x - A.x, z - A.z) < A.r + 150) continue;
      const w = walker(0.7, 0xb04cff); w.g.position.set(x, groundHeight(x, z), z);
      rogue = { x, z, w, t: 0 }; toast('⚠ A rogue mech has been sighted · it\'s on the map'); return;
    }
  }
  function clearAll() { for (const e of enemies) group.remove(e.g); enemies = []; for (const o of orbs) group.remove(o.m); orbs.length = 0; ring.visible = false; }
  function spawnChapter(ch) {
    clearAll();
    if (ch === 0) for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2 + 0.2, r = 18 + (k % 3) * 18, m = new THREE.Mesh(new RBox(2.2, 2.2, 2.2), crateM); m.position.set(A.x + Math.cos(a) * r, H + 1.1, A.z + Math.sin(a) * r); m.rotation.y = a; m.castShadow = true; group.add(m); enemies.push({ type: 'crate', g: m, hp: 1, max: 1 }); }
    if (ch === 1) for (let k = 0; k < 8; k++) { const d = drone(); enemies.push({ type: 'drone', g: d.g, eye: d.eye, hp: 1, max: 1, a: k / 8 * 6.28, r: 22 + (k % 2) * 10, y: 9 + (k % 3) * 2, dive: 0, cool: 3 + k * 1.3 }); }
    if (ch === 2) for (const s of [-1, 1]) { const w = walker(0.5, 0x40c0ff); w.g.position.set(A.x + s * 25, H, A.z - 35); enemies.push({ type: 'walker', ...w, hp: 40, max: 40, speed: 4.2, reach: 3.2, stompR: 7, shotEvery: 2.6, shot: 2 + s, stomp: 1, wind: 0, walk: 0, scale: 0.5 }); }
    if (ch === 3) for (let k = 0; k < 4; k++) { const a = Math.PI * (1.15 + k * 0.23), t = turret(); t.g.position.set(A.x + Math.cos(a) * (A.r - 12), H, A.z + Math.sin(a) * (A.r - 12)); enemies.push({ type: 'turret', ...t, hp: 25, max: 25, shot: 1 + k * 0.6 }); }
    if (ch === 4) { const w = walker(1, 0xff6a00); w.g.position.set(A.x, H, A.z - 40); enemies.push({ type: 'walker', ...w, hp: 120, max: 120, speed: 2.4, reach: 5.5, stompR: 13, shotEvery: 3.6, shot: 3, stomp: 0, wind: 0, walk: 0, scale: 1, boss: true }); }
  }
  const hurt = (dmg, why) => { if (!st) return; const d = dmg * (story.up.shield ? 0.6 : 1); st.hp -= d; api.onHurt && api.onHurt(d); toast(`${why} −${Math.round(d)}`); onShake(0.25); };
  const kill = (e) => { e.hp = 0; group.remove(e.g); const p = e.g.position; burst(p.x, p.y + (e.type === 'walker' ? 6 * e.scale : 1), p.z, e.type === 'crate' ? crateM : iron, e.type === 'walker' ? 16 : 9, e.scale || 1); fx.sparks(p.x, p.y + 1, p.z, 0, 0, 20, 1.2); };
  const damage = (e, dmg) => { e.hp -= dmg; if (e.hp <= 0) kill(e); };

  const api = {
    CHAPTERS, story,
    get active() { return !!st; },
    get rogue() { return rogue ? { x: rogue.x, z: rogue.z } : null; },
    onHurt: null,
    // open-world rogue mech: spawning, idling, and starting the fight when you walk up in the mech
    roam(dt, veh, mode, busy) {
      if (st) return '';
      if (!rogue) { rogueCool -= dt; if (rogueCool <= 0 && !busy) { rogueCool = 60; spawnRogue(veh.pos); } return ''; }
      rogue.t += dt; const w = rogue.w, d = Math.hypot(veh.pos.x - rogue.x, veh.pos.z - rogue.z);
      w.g.rotation.y += dt * 0.25; w.core.material.emissiveIntensity = 2 + Math.sin(rogue.t * 3);
      if (rogue.t > 900 && d > 600) { group.remove(w.g); rogue = null; rogueCool = 300; return ''; }
      if (d < 90 && mode === 'mech') {
        clearAll(); st = { ch: -1, rogue: true, phase: 'fight', t: 0, hp: 100, cx: rogue.x, cz: rogue.z };
        enemies.push({ type: 'walker', ...w, hp: 80, max: 80, speed: 3.4, reach: 4.2, stompR: 9, shotEvery: 2.8, shot: 2, stomp: 1.5, wind: 0, walk: 0, scale: 0.7 });
        toast('Rogue mech engaged! Punch, cannon (Q, F) and missiles (E)'); return '';
      }
      return d < 160 && mode !== 'mech' ? 'Rogue mech ahead · switch to the mech (4) to fight it' : '';
    },
    get state() { return st; },
    place: { x: A.x, z: A.z + A.r - 6 },
    list() {
      const next = Math.min(story.ch, 4);
      const out = [{ id: 'arena', name: `Mech story · ${next + 1}/5: ${CHAPTERS[next].name}`, desc: `${story.ch >= 5 ? 'Story complete: fight the Iron Golem again. ' : ''}Red Rock Quarry, in the mech.${CHAPTERS[next].unlock && story.ch < 5 ? ` Win to unlock: ${UNLOCK[CHAPTERS[next].unlock]}.` : ''} Upgrades: ${Object.keys(story.up).map((k) => UNLOCK[k]).join(', ') || 'none yet'}.` }];
      return out;
    },
    start(veh, setMode) {
      const ch = Math.min(story.ch, 4);
      st = { ch, phase: 'fight', t: 0, hp: 100 };
      spawnChapter(ch);
      veh.reset(A.x, H + 1.2, A.z + A.r - 10, Math.PI); setMode('mech');
      toast(`Chapter ${ch + 1}: ${CHAPTERS[ch].name}${['', ' · punch the drones when they dive', ' · two scouts', ' · take out the turrets', ' · punch the glowing core'][ch]}`);
    },
    cancel() { if (st) toast('Arena abandoned'); st = null; clearAll(); },
    // the mech's punch: whatever is in reach takes it
    punch(px, py, pz, fx_, fz_) {
      if (!st) return false;
      let hit = false;
      for (const e of enemies) {
        if (e.hp <= 0) continue;
        const p = e.g.position, d = Math.hypot(p.x - px, p.z - pz);
        if (e.type === 'crate' && d < 3.2) { damage(e, 1); hit = true; }
        else if (e.type === 'drone' && d < 3.6 && p.y - H < 6) { damage(e, 1); hit = true; }
        else if (e.type === 'turret' && d < 3.8) { damage(e, 9); hit = true; }
        else if (e.type === 'walker' && d < e.reach) { const dmg = e.wind > 0 ? 14 : 7; damage(e, dmg); hit = true; if (e.wind > 0 && e.boss) toast('Critical hit!'); }
      }
      if (hit) { fx.sparks(px, py + 1, pz, fx_ * 4, fz_ * 4, 22, 1.3); audio.impact(0.9, false, 'metal'); onShake(0.18); }
      return hit;
    },
    // cannon shells and missiles: everything within r of the blast takes dmg (falling off toward the edge); returns hits
    blast(x, y, z, r, dmg) {
      if (!st) return 0;
      let n = 0;
      for (const e of enemies) {
        if (e.hp <= 0) continue;
        const p = e.g.position, d = Math.hypot(p.x - x, (p.y + (e.type === 'drone' ? 0 : 1.5)) - y, p.z - z), rr = r + (e.scale || 0) * 1.5 + (e.type === 'walker' ? 1.5 : 0.8);
        if (d < rr) { damage(e, Math.max(1, Math.round(dmg * (1 - 0.5 * d / rr)))); n++; }
      }
      return n;
    },
    // live enemies, for the missiles' homing
    targets() { return st ? enemies.filter((e) => e.hp > 0).map((e) => ({ x: e.g.position.x, y: e.g.position.y + (e.type === 'drone' ? 0 : 1.5), z: e.g.position.z })) : []; },
    // ground pound (upgrade): blast everything within 10 m
    pound(x, z) {
      if (!st || !story.up.pound) return;
      ring.visible = true; ring.position.set(x, H + 0.2, z); ring.scale.setScalar(1); ring.userData.t = 0; fx.dust(x, H + 0.3, z, 40); onShake(0.4);
      let n = 0; for (const e of enemies) if (e.hp > 0 && Math.hypot(e.g.position.x - x, e.g.position.z - z) < 10 + (e.scale || 0) * 3) { damage(e, e.type === 'walker' ? 18 : 30); n++; }
      toast(n ? `Ground pound! ${n} hit` : 'Ground pound!');
    },
    near(pos, out) { if (st) for (const e of enemies) if (e.hp > 0 && (e.type === 'walker' || e.type === 'turret' || e.type === 'crate')) { const p = e.g.position; if (Math.hypot(pos.x - p.x, pos.z - p.z) < 40) out.push({ x: p.x, z: p.z, r: e.type === 'walker' ? 3.6 * e.scale : e.type === 'turret' ? 2.2 : 1.3, owner: { imp: { x: 0, z: 0 } } }); } return out; },
    update(dt, veh, mode, onGround) {
      for (let i = debris.length - 1; i >= 0; i--) { const d = debris[i], v = d.userData.v; v.y -= 18 * dt; d.position.addScaledVector(v, dt); if (d.position.y < H + 0.3) { d.position.y = H + 0.3; v.y *= -0.3; v.x *= 0.7; v.z *= 0.7; } d.rotation.x += dt * 5; d.userData.t -= dt; if (d.userData.t <= 0) { group.remove(d); debris.splice(i, 1); } }
      if (ring.visible) { ring.userData.t += dt; ring.scale.setScalar(1 + ring.userData.t * 22); ring.material.opacity = Math.max(0, 1 - ring.userData.t * 1.6); if (ring.userData.t > 0.7) ring.visible = false; }
      if (!st) return null;
      st.t += dt;
      const p = veh.pos, spd = veh.vel.length();
      if (!st.rogue && Math.hypot(p.x - A.x, p.z - A.z) > A.r + 120) { api.cancel(); return null; }
      if (st.rogue && Math.hypot(p.x - st.cx, p.z - st.cz) > 500) { toast('The rogue mech got away'); clearAll(); st = null; rogue = null; return null; }
      const shoot = (from, lead = 0.8) => { const m = new THREE.Mesh(orbGeo, orbM); m.position.copy(from); group.add(m); const tx = p.x + veh.vel.x * lead - from.x, ty = p.y + 1 - from.y, tz = p.z + veh.vel.z * lead - from.z, l = Math.hypot(tx, ty, tz); orbs.push({ m, v: new THREE.Vector3(tx / l * 20, ty / l * 20, tz / l * 20), t: 4 }); };
      for (const e of enemies) {
        if (e.hp <= 0) continue;
        const g = e.g, dx = p.x - g.position.x, dz = p.z - g.position.z, d = Math.hypot(dx, dz);
        if (e.type === 'crate') { if (spd > 6 && d < 2.6) damage(e, 1); continue; }
        if (e.type === 'drone') {
          e.cool -= dt;
          if (e.dive > 0) { e.dive -= dt; const k = e.dive > 1.2 ? 0 : 1; g.position.x += (e.tx - g.position.x) * Math.min(1, dt * 2.5) * k; g.position.z += (e.tz - g.position.z) * Math.min(1, dt * 2.5) * k; g.position.y += ((e.dive > 1.2 ? H + e.y : H + 2.2) - g.position.y) * Math.min(1, dt * 3);
            e.eye.material.emissiveIntensity = (st.t * 10) % 1 < 0.5 ? 4 : 1;
            if (e.dive < 1.2 && !e.hitDone && Math.hypot(g.position.x - p.x, g.position.z - p.z) < 2.5 && g.position.y - p.y < 4) { e.hitDone = true; hurt(8, 'Drone strike!'); }
            if (e.dive <= 0) e.cool = 4 + Math.random() * 4;
          } else {
            e.a += dt * 0.5; const x = A.x + Math.cos(e.a) * e.r, z = A.z + Math.sin(e.a) * e.r; g.position.x += (x - g.position.x) * Math.min(1, dt * 2); g.position.z += (z - g.position.z) * Math.min(1, dt * 2); g.position.y += (H + e.y - g.position.y) * Math.min(1, dt * 1.5);
            e.eye.material.emissiveIntensity = 2;
            if (e.cool <= 0 && !enemies.some((o) => o !== e && o.dive > 0)) { e.dive = 3.6; e.tx = p.x; e.tz = p.z; e.hitDone = false; }
          }
          g.lookAt(p.x, g.position.y, p.z); continue;
        }
        if (e.type === 'turret') {
          e.head.rotation.y = Math.atan2(dx, dz) - g.rotation.y; e.shot -= dt;
          if (e.shot <= 0) { e.shot = 2.4 + Math.random(); e.head.getWorldPosition(V); V.y += 0.4; shoot(V, 0.6); }
          continue;
        }
        // walkers
        const face = Math.atan2(dx, dz); let dy = face - g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); g.rotation.y += Math.max(-1.4 * dt, Math.min(1.4 * dt, dy));
        if (e.wind > 0) {
          e.wind -= dt; e.legs[1].rotation.x = -0.9 * Math.min(1, (1.1 - e.wind) / 0.6);
          if (e.wind <= 0) {
            e.legs[1].rotation.x = 0; ring.visible = true; ring.position.set(g.position.x, (st.rogue ? groundHeight(g.position.x, g.position.z) : H) + 0.2, g.position.z); ring.scale.setScalar(e.scale); ring.userData.t = 0; onShake(0.3 * e.scale + 0.15);
            audio.stomp && audio.stomp(1, 'rock', false, 1); fx.dust(g.position.x, (st.rogue ? groundHeight(g.position.x, g.position.z) : H) + 0.3, g.position.z, 30);
            if (d < e.stompR && (onGround || mode === 'car')) { const k = 1 - d / (e.stompR + 3); hurt(18 * k * (e.boss ? 1 : 0.8), 'Shockwave!'); veh.vel.x += dx / (d || 1) * 9; veh.vel.z += dz / (d || 1) * 9; veh.vel.y += 5; }
            e.stomp = e.boss ? 3.5 : 2.6;
          }
        } else {
          e.stomp -= dt;
          const keep = e.stompR * 0.6;
          if (d > keep) { const v = e.speed * Math.min(1, (d - keep) / 4); g.position.x += Math.sin(g.rotation.y) * v * dt; g.position.z += Math.cos(g.rotation.y) * v * dt; e.walk += dt * v * 0.9 / e.scale; }
          e.legs[0].rotation.x = Math.sin(e.walk) * 0.45; e.legs[1].rotation.x = -Math.sin(e.walk) * 0.45; e.arms[0].rotation.x = -Math.sin(e.walk) * 0.3; e.arms[1].rotation.x = Math.sin(e.walk) * 0.3;
          if (d < e.stompR * 0.9 && e.stomp <= 0) e.wind = 1.1;
          e.shot -= dt; if (e.shot <= 0 && d > 8) { e.shot = e.shotEvery + Math.random() * 1.5; e.core.getWorldPosition(V); shoot(V); }
        }
        g.position.y = (st.rogue ? groundHeight(g.position.x, g.position.z) : H) + Math.abs(Math.sin(e.walk)) * 0.25 * e.scale;
        e.core.material.emissiveIntensity = e.wind > 0 ? 4 + Math.sin(st.t * 30) * 2 : 2;
      }
      for (let i = orbs.length - 1; i >= 0; i--) { const o = orbs[i]; o.t -= dt; o.m.position.addScaledVector(o.v, dt);
        const hitP = o.m.position.distanceTo(V.set(p.x, p.y + 1, p.z)) < 2.4, hitG = o.m.position.y < groundHeight(o.m.position.x, o.m.position.z);
        if (hitP || hitG || o.t <= 0) { if (hitP) hurt(10, 'Plasma hit!'); fx.sparks(o.m.position.x, o.m.position.y, o.m.position.z, 0, 0, 18, 1.2); group.remove(o.m); orbs.splice(i, 1); } }
      const alive = enemies.filter((e) => e.hp > 0), total = enemies.reduce((a, e) => a + e.max, 0), left = alive.reduce((a, e) => a + e.hp, 0);
      if (!alive.length && st.rogue) {
        story.rogues = (story.rogues || 0) + 1;
        const un = story.rogues === 1 ? 'reload' : story.rogues === 3 ? 'laser' : null;
        if (un) { story.up[un] = true; toast(`Unlocked: ${un === 'reload' ? 'Rapid reload (missiles and cannon)' : 'Laser lance: the cannon fires a piercing beam'}`); }
        toast(`Rogue mech destroyed! (${story.rogues} so far)`); econ && econ.earn(1500, 'Rogue mech bounty'); saveSettings(); onShake(0.5);
        for (const o of orbs) group.remove(o.m); orbs.length = 0; st = null; rogue = null; rogueCool = 420 + Math.random() * 300; return null;
      }
      if (st.hp <= 0 && st.rogue) { toast('Your mech is beaten · the rogue mech stomps off'); clearAll(); st = null; rogue = null; rogueCool = 300; return null; }
      if (!alive.length) {
        const ch = st.ch, C = CHAPTERS[ch], first = story.ch <= ch;
        if (first) { story.ch = ch + 1; if (C.unlock) { story.up[C.unlock] = true; toast(`Unlocked: ${UNLOCK[C.unlock]}`); } }
        if (ch === 4) { const nb = !settings.arenaBest || st.t < settings.arenaBest; if (nb) settings.arenaBest = st.t; toast(`The Iron Golem is down! ${st.t.toFixed(1)} s${nb ? ' · new best!' : ''}`); onShake(0.6); }
        else toast(`Chapter ${ch + 1} cleared in ${st.t.toFixed(1)} s${first ? ` · next: ${CHAPTERS[ch + 1].name} (Jobs menu)` : ''}`);
        saveSettings(); econ && econ.earn(C.pay * (first ? 1 : 0.4), `Mech story · ${C.name}`);
        for (const o of orbs) group.remove(o.m); orbs.length = 0; st = null; return null;
      }
      if (st.hp <= 0) { toast('Your mech is beaten · try again from the Jobs menu'); api.cancel(); return null; }
      if (st.rogue) return { title: 'Rogue mech', line: `${Math.round(left)} armour left · ${st.t.toFixed(1)} s`, hp: st.hp, boss: total ? left / total : null };
      return { title: `Mech story · ${st.ch + 1}/5 ${CHAPTERS[st.ch].name}`, line: `${alive.length} left · ${st.t.toFixed(1)} s`, hp: st.hp, boss: total ? left / total : null };
    },
  };
  return api;
}
