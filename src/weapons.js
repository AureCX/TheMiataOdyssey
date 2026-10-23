// The mech's weapons. Q (A on AZERTY) deploys the arm cannon (the left forearm opens and slides out a barrel); with it
// out, F fires energy shells instead of punching. E fires a missile from the pod that rises out of the back above the right
// shoulder (six in the pod, one reloads every 2.5 s; the pod stows itself after a few quiet seconds). Missiles climb
// out of the tube, then home on the nearest arena enemy ahead (or the ground 70 m ahead) and explode.
// Shells and missiles damage arena enemies, knock trees down, shove traffic and burst on buildings and the ground.
import * as THREE from 'three';
import { groundHeight, WATER_LEVEL } from './world.js';
import { nearbyColliders } from './scenery.js';

export function createWeapons({ up = () => ({}), scene, fx, impact, audio, arena, veg, traffic, onShake, toast }) {
  const group = new THREE.Group(); scene.add(group);
  const shellM = new THREE.MeshBasicMaterial({ color: 0xbff6ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  const shellGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6).rotateX(Math.PI / 2);
  const coreGeo = new THREE.SphereGeometry(0.13, 8, 6);
  const missileGeo = (() => {
    const g = new THREE.Group(), w = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.4 }), r = new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.4 }), d = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.62, 10).rotateX(Math.PI / 2), w); g.add(b);
    const n = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 10).rotateX(Math.PI / 2), r); n.position.z = 0.39; g.add(n);
    for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.12, 0.12), d); f.position.z = -0.26; f.rotation.z = k * Math.PI / 2; f.position.x = Math.sin(k * Math.PI / 2) * 0.06; f.position.y = Math.cos(k * Math.PI / 2) * 0.06; g.add(f); }
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb040, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); fl.position.z = -0.5; g.add(fl);
    return g;
  })();
  const flashL = new THREE.PointLight(0xffb070, 0, 40, 1.6); scene.add(flashL);
  const shells = [], missiles = [], cols = [], beams = [];
  let cool = 0, ammo = 6, reload = 0, podIdle = 0, pending = 0;
  const V = new THREE.Vector3(), D = new THREE.Vector3(), Q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1);

  function explode(p, size, dmg, dir) {
    const r = size;
    impact.slam(p.x, Math.max(groundHeight(p.x, p.z), p.y - 1), p.z, Math.min(1, size / 6), groundHeight);
    fx.sparks(p.x, p.y, p.z, dir ? -dir.x * 3 : 0, dir ? -dir.z * 3 : 0, Math.round(14 + size * 6), 1.4);
    for (let k = 0; k < 3 + size; k++) fx.smoke(p.x + (Math.random() - 0.5) * size, p.y + Math.random(), p.z + (Math.random() - 0.5) * size, 1, true);
    flashL.position.set(p.x, p.y + 1, p.z); flashL.intensity = 60 * size;
    audio.impact(Math.min(1, 0.4 + size * 0.12), false, 'metal');
    onShake(Math.min(0.5, 0.05 + size * 0.05));
    const hits = arena.blast(p.x, p.y, p.z, r, dmg);
    veg.knock(p.x, p.z, r * 0.7, 0, 0);
    if (traffic) for (const c of traffic.cars) { const dx = c.mesh.position.x - p.x, dz = c.mesh.position.z - p.z, d = Math.hypot(dx, dz); if (d < r + 2) { const k = c.mass * 8 * (1 - d / (r + 2)) / (d || 1); c.imp.x += dx * k; c.imp.z += dz * k; } }
    return hits;
  }
  // where the projectile is now: hit something?
  function struck(p) {
    if (p.y < groundHeight(p.x, p.z) + 0.1 || p.y < WATER_LEVEL) return true;
    nearbyColliders(p.x, p.z, cols);
    for (let k = 0; k < cols.length; k += 4) if (p.y < cols[k + 3] && Math.hypot(p.x - cols[k], p.z - cols[k + 1]) < cols[k + 2]) return true;
    for (const t of arena.targets()) if (Math.hypot(p.x - t.x, p.y - t.y, p.z - t.z) < 2.4) return true;
    return false;
  }

  const api = {
    get ammo() { return ammo; },
    // F with the cannon out
    fireCannon(W) {
      if (cool > 0 || W.cannon < 0.95) return false;
      const U = up(); cool = U.reload ? 0.24 : 0.38; W.fireCannon();
      const from = W.muzzle(new THREE.Vector3()), dir = W.muzzleDir(new THREE.Vector3());
      dir.y = Math.max(-0.15, Math.min(0.15, dir.y)); dir.normalize();
      // light aim assist: an arena enemy within ~12 degrees of the barrel gets the shot
      let best = 0.978, aimT = null;
      for (const t of arena.targets()) { D.set(t.x - from.x, t.y - from.y, t.z - from.z); const l = D.length(); if (l > 150) continue; const c = D.dot(dir) / l; if (c > best) { best = c; aimT = D.clone().divideScalar(l); } }
      if (aimT) dir.copy(aimT);
      if (U.laser) {
        // laser lance: an instant beam that pierces up to 150 m, hitting everything along it
        let len = 150; for (let s2 = 2; s2 < 150; s2 += 1.5) { V.copy(from).addScaledVector(dir, s2); if (struck(V)) { len = s2; break; } }
        const end = V.copy(from).addScaledVector(dir, len).clone();
        for (const t of arena.targets()) { D.set(t.x - from.x, t.y - from.y, t.z - from.z); const al = D.dot(dir); if (al > 0 && al < len + 3 && D.addScaledVector(dir, -al).length() < 2.6) arena.blast(t.x, t.y, t.z, 1.5, 9); }
        explode(end, 1.2, 4, dir);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, len, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, len / 2), shellM); beam.position.copy(from); beam.quaternion.setFromUnitVectors(Z, dir); group.add(beam);
        beams.push({ m: beam, t: 0.18 }); audio.impact(0.3, false, 'glass'); onShake(0.06); return true;
      }
      const m = new THREE.Group(); m.add(new THREE.Mesh(shellGeo, shellM)); m.add(new THREE.Mesh(coreGeo, shellM)); m.position.copy(from); m.quaternion.setFromUnitVectors(Z, dir); group.add(m);
      shells.push({ m, v: dir.multiplyScalar(140), t: 0 });
      fx.sparks(from.x, from.y, from.z, dir.x * 0.1, dir.z * 0.1, 6, 1.5);
      audio.impact(0.35, false, 'metal'); onShake(0.05);
      return true;
    },
    // J: deploy the pod and launch the next missile once it's open
    fireMissile(W) {
      W.setPod(true); podIdle = 0;
      if (ammo <= 0) { toast('Missile pod reloading'); return; }
      pending++;
    },
    update(dt, W, mech) {
      cool = Math.max(0, cool - dt);
      flashL.intensity *= Math.max(0, 1 - dt * 10);
      if (W) {
        // the pod: reload, launch queued missiles when open, stow when idle
        if (ammo < 6) { reload += dt; if (reload > (up().reload ? 1.2 : 2.5)) { reload = 0; ammo++; } }
        for (let i = 0; i < 6; i++) W.loaded(i, i < ammo);
        if (pending > 0 && W.pod > 0.95 && cool <= 0 && ammo > 0) {
          pending--; ammo--; cool = 0.22;
          const from = W.tube(ammo, new THREE.Vector3()), fwd = W.podDir(new THREE.Vector3());
          // target: the nearest enemy roughly ahead, else the ground 70 m ahead
          const hx = Math.sin(mech.yaw), hz = Math.cos(mech.yaw);
          let tgt = null, best = 1e9;
          for (const t of arena.targets()) { const dx = t.x - from.x, dz = t.z - from.z, d = Math.hypot(dx, dz); if (d < 160 && (dx * hx + dz * hz) / (d || 1) > 0.2 && d < best) { best = d; tgt = t; } }
          const aim = tgt ? new THREE.Vector3(tgt.x, tgt.y, tgt.z) : new THREE.Vector3(from.x + hx * 70, 0, from.z + hz * 70);
          if (!tgt) aim.y = groundHeight(aim.x, aim.z);
          const m = missileGeo.clone(); m.position.copy(from); group.add(m);
          const v = fwd.multiplyScalar(10).add(new THREE.Vector3(0, 9, 0));
          missiles.push({ m, v, t: 0, aim, tgt: tgt ? arena.targets().indexOf(tgt) : -1 });
          fx.smoke(from.x, from.y, from.z, 1, false); audio.servo(0.8, 0.95);
          if (ammo === 0) toast('Missile pod empty · reloading');
        }
        if (pending === 0 && W.pod > 0.5) { podIdle += dt; if (podIdle > 4) W.setPod(false); }
      }
      for (let i = beams.length - 1; i >= 0; i--) { const b = beams[i]; b.t -= dt; b.m.scale.x = b.m.scale.y = Math.max(0.05, b.t / 0.18); if (b.t <= 0) { group.remove(b.m); beams.splice(i, 1); } }
      // shells
      for (let i = shells.length - 1; i >= 0; i--) {
        const s = shells[i]; s.t += dt;
        const steps = 3; let hit = false;
        for (let k = 0; k < steps && !hit; k++) { s.m.position.addScaledVector(s.v, dt / steps); hit = struck(s.m.position); }
        if (hit || s.t > 1.6) { if (hit) explode(s.m.position, 1.6, 6, D.copy(s.v).normalize()); group.remove(s.m); shells.splice(i, 1); }
      }
      // missiles: boost up, then steer toward the target with growing authority
      for (let i = missiles.length - 1; i >= 0; i--) {
        const s = missiles[i], p = s.m.position; s.t += dt;
        if (s.tgt >= 0) { const T = arena.targets()[s.tgt]; if (T) s.aim.set(T.x, T.y, T.z); }
        if (s.t > 0.35) {
          D.copy(s.aim).sub(p).normalize();
          const sp = Math.min(75, s.v.length() + 60 * dt), turn = Math.min(1, dt * (2 + s.t * 4));
          s.v.normalize().lerp(D, turn).normalize().multiplyScalar(sp);
        } else s.v.y -= 6 * dt;
        let hit = false; const steps = 3;
        for (let k = 0; k < steps && !hit; k++) { p.addScaledVector(s.v, dt / steps); hit = s.t > 0.25 && struck(p); }
        s.m.quaternion.setFromUnitVectors(Z, D.copy(s.v).normalize());
        if (Math.random() < 0.9) fx.smoke(p.x - D.x * 0.5, p.y - D.y * 0.5, p.z - D.z * 0.5, 0.4, false);
        if (hit || s.t > 5 || p.distanceTo(s.aim) < 1.2) { explode(p, 5, 18, D); group.remove(s.m); missiles.splice(i, 1); }
      }
    },
    clear() { for (const s of [...shells, ...missiles]) group.remove(s.m); shells.length = missiles.length = 0; pending = 0; },
  };
  return api;
}
