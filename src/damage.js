// Crash damage: turns physics impact events into dents, broken parts, mechanical damage, effects and sound.
import * as THREE from 'three';
import { DIMS } from './car.js';

const COM_Y = 0.46; // physics origin (centre of mass) sits 0.46 m above the body-space origin

export function createDamage({ car, veh, fx, audio, onToast, onWingsLost }) {
  const zones = { front: 0, rear: 0, left: 0, right: 0 };
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  let smokeAcc = 0;
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xcfe3ea, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.8 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xa01010, roughness: 0.3 });
  const amberMat = new THREE.MeshStandardMaterial({ color: 0xe0901a, roughness: 0.3 });
  const paintMat = car.mats.paintPlain;

  const toWorld = (p) => car.body.localToWorld(p.clone());
  const wheelPos = (i) => new THREE.Vector2((i % 2 === 0 ? 1 : -1) * DIMS.track / 2, i < 2 ? DIMS.frontZ : DIMS.rearZ);

  function tearOff(i, n) {
    if (veh.dmg.lost[i]) return;
    veh.dmg.lost[i] = true;
    const sp = car.wheels[i].spin;
    fx.detach(sp, w.copy(veh.vel).multiplyScalar(0.8).add(v.set(-n.x * 3, 3, -n.z * 3)), 10, DIMS.wheelR);
    sp.visible = false;
    onToast('Wheel torn off');
  }

  function handle(ev) {
    const sev = Math.min(1.6, Math.max(0, (ev.speed - 3) / 14)); // ~17 m/s (60 km/h) into something solid = 1
    const p = ev.p.clone(); p.y += COM_Y;                           // body space
    const n = ev.n.clone().normalize();                             // points into the car
    const wp = toWorld(p);
    const carVel = veh.vel;

    if (sev < 0.04) {
      car.scratchAt(p, 0.15);
      return 0;
    }
    car.deform(p, n, sev);
    const zone = p.z > 1.05 ? 'front' : p.z < -1.05 ? 'rear' : p.x > 0 ? 'left' : 'right';
    zones[zone] = Math.min(1, zones[zone] + sev * 0.45);
    let glass = false;

    // mechanical damage
    if (zone === 'front') veh.dmg.engine = Math.max(0, veh.dmg.engine - sev * 0.42);
    else if (sev > 1) veh.dmg.engine = Math.max(0, veh.dmg.engine - 0.1);
    for (let i = 0; i < 4; i++) {
      const wpz = wheelPos(i), d = Math.hypot(p.x - wpz.x, p.z - wpz.y);
      if (d > 0.75 || veh.dmg.lost[i]) continue;
      const k = sev * (1 - d / 0.75);
      veh.dmg.toe[i] = Math.max(-0.12, Math.min(0.12, veh.dmg.toe[i] + (Math.random() - 0.5) * 0.12 * k + Math.sign(n.z || 1) * 0.02 * k));
      veh.dmg.camber[i] = Math.max(-0.25, Math.min(0.25, veh.dmg.camber[i] + (Math.random() - 0.3) * 0.18 * k));
      // rims bend (wobble, vibration); hard hits shove the wheel back or inward on its mounts
      if (sev > 0.3) veh.dmg.bend[i] = Math.min(1, veh.dmg.bend[i] + 0.55 * k);
      if (sev > 0.5) {
        const wv = veh.wheels[i];
        wv.z = Math.max(wv.z0 - 0.12, Math.min(wv.z0 + 0.12, wv.z + n.z * 0.07 * k));
        const ax = Math.abs(wv.x0), nx = Math.max(ax - 0.1, Math.min(ax, Math.abs(wv.x) - Math.abs(n.x) * 0.06 * k));
        wv.x = Math.sign(wv.x0) * nx;
      }
      // a solid hit near a wheel breaks its mount (it hangs loose); another hit, or a huge one, tears it off
      if (d < 0.55 && ((veh.dmg.loose[i] && sev > 0.45) || sev > 1.35)) tearOff(i, n);
      else if (d < 0.55 && sev > 0.75 && !veh.dmg.loose[i]) { veh.dmg.loose[i] = true; onToast('Wheel hanging loose'); }
    }

    // breakable parts
    for (const pop of car.popups) {
      if (pop.broken || zone !== 'front' || sev < 0.35 || Math.abs(p.x - pop.side * 0.5) > 0.55) continue;
      pop.broken = true; pop.stuck = 0.14 - Math.random() * 1.0;
      pop.lens.material.color.set(0x333333);
      glass = true;
      const lw = pop.lens.getWorldPosition(new THREE.Vector3());
      fx.shards(lw.x, lw.y, lw.z, carVel.x, 1, carVel.z, 8, glassMat);
    }
    for (const sx of [1, -1]) {
      const fl = car.parts.frontLamps[sx];
      if (zone === 'front' && sev > 0.25 && fl.material !== car.mats.brokenLamp && Math.sign(p.x || 1) === sx) {
        fl.material = car.mats.brokenLamp; glass = true;
        const lw = fl.getWorldPosition(new THREE.Vector3()); fx.shards(lw.x, lw.y, lw.z, carVel.x, 1, carVel.z, 5, amberMat);
      }
      const ts = car.parts.tailSides[sx];
      if (zone === 'rear' && sev > 0.25 && ts[0].material !== car.mats.brokenLamp && (Math.abs(p.x) < 0.25 || Math.sign(p.x) === sx)) {
        for (const m of ts) m.material = car.mats.brokenLamp;
        glass = true;
        const lw = ts[0].getWorldPosition(new THREE.Vector3()); fx.shards(lw.x, lw.y, lw.z, carVel.x, 1, carVel.z, 8, redMat);
      }
      const mg = car.parts.mirrors[sx];
      if (mg.visible && sev > 0.3 && Math.sign(p.x) === sx && Math.abs(p.z - 0.27) < 0.9 && Math.abs(n.x) > 0.4) {
        fx.detach(mg, w.copy(carVel).multiplyScalar(0.7).add(v.set(sx * 2, 2, 0).applyQuaternion(veh.q)), 12, 0.05);
        mg.visible = false; glass = true;
      }
    }
    // opening panels: side hits spring a door, rear hits the boot lid, front hits buckle the bonnet (and may free it)
    const P = car.parts.panels;
    if (P) {
      const sideOf = zone === 'left' ? 1 : zone === 'right' ? -1 : 0;
      if (sideOf && P.doors[sideOf] && sev > 0.7) P.doors[sideOf].open = true;
      if (zone === 'front' && sev > 1.0) for (const sx of [1, -1]) if (P.doors[sx] && Math.random() < 0.35) P.doors[sx].open = true;
      if (zone === 'rear' && P.boot && sev > 0.6 && !P.boot.open) { P.boot.open = true; onToast('Boot lid sprung'); }
      if (zone === 'front' && P.hood && sev > 0.5) {
        const hb = P.hood;
        hb.buckle = Math.min(1, hb.buckle + sev * 0.45);
        car.deform(v.set(0, 0.6, 1.2), w.set(0, 1, 0), Math.min(1, sev) * 0.55, [hb.grp]);   // crease rises up the middle
        if (hb.buckle > 0.75 && !hb.open) { hb.open = true; onToast('Bonnet latch broken'); }
      }
    }
    // bumpers: a big hit, or a second solid one on an already crumpled end, tears the cover off
    for (const end of ['front', 'rear']) {
      const b = car.parts.bumpers && car.parts.bumpers[end];
      const parts = b ? b.userData.parts || [b] : [];
      if (!parts.length || !parts[0].visible || zone !== end) continue;
      if (sev > 1.05 || (zones[end] > 0.85 && sev > 0.55)) {
        const dir = end === 'front' ? 1 : -1;
        for (const pt of parts) { fx.detach(pt, w.copy(carVel).multiplyScalar(0.55).add(v.set((Math.random() - 0.5) * 2, 2.2, dir * 1.5).applyQuaternion(veh.q)), 4, 0.15); pt.visible = false; }
        car.parts.crashStruct[end].visible = true; glass = true;
        onToast(end === 'front' ? 'Front bumper torn off' : 'Rear bumper torn off');
      }
    }
    if ((p.y > 0.75 && sev > 0.3) || (zone === 'front' && sev > 0.8)) {
      car.crackWindscreen(0.25 + Math.random() * 0.5, 0.2 + Math.random() * 0.6, Math.min(1, sev));
      glass = true;
    }
    // plane kit: wings are the first thing to go
    if (veh.planeT > 0.5 && !car.state.wingsLost && (ev.kind === 'wing' || sev > 0.6)) {
      for (const wg of car.wings) fx.detach(wg.group, w.copy(carVel).multiplyScalar(0.6).add(v.set(wg.side * 4, 3, 0).applyQuaternion(veh.q)), 4, 0.1);
      car.state.wingsLost = true;
      onWingsLost();
    }

    // effects
    const hard = ev.kind === 'car' || ev.kind === 'ground';
    fx.sparks(wp.x, wp.y, wp.z, carVel.x, carVel.z, Math.round(6 + sev * 30), hard ? 1 : 0.3);
    if (sev > 0.5) fx.shards(wp.x, wp.y + 0.2, wp.z, carVel.x, 1.5, carVel.z, Math.round(sev * 6), paintMat);
    if (ev.kind === 'tree') fx.dust(wp.x, wp.y + 1.5, wp.z, 6, [0.3, 0.42, 0.22]);
    audio.impact(sev, glass, ev.kind);
    if (sev > 0.9) onToast(sev > 1.3 ? 'Heavy crash' : 'Crash');
    return sev;
  }

  return {
    zones,
    // returns the biggest severity this frame (for camera shake)
    update(dt) {
      let maxSev = 0;
      while (veh.events.length) maxSev = Math.max(maxSev, handle(veh.events.shift()));
      // a loose wheel driven hard eventually lets go
      const spd = veh.vel.length();
      for (let i = 0; i < 4; i++) if (veh.dmg.loose[i] && !veh.dmg.lost[i] && veh.wheels[i].contact && Math.random() < dt * Math.max(0, spd - 12) * 0.006) tearOff(i, v.set(veh.wheels[i].x > 0 ? -1 : 1, 0, 0));
      // engine smoke / steam from under the bonnet
      const eng = veh.dmg.engine;
      if (eng < 0.75) {
        smokeAcc += dt * (0.75 - eng) * 40;
        while (smokeAcc > 1) {
          smokeAcc -= 1;
          const hp = car.body.localToWorld(v.set((Math.random() - 0.5) * 0.6, 0.72, 1.45));
          fx.smoke(hp.x, hp.y, hp.z, 1 - eng, eng < 0.4, veh.vel.x, veh.vel.z);
        }
      }
      // scraping along the ground: sparks + grinding sound
      const sc = veh.scrape;
      const lvl = Math.min(1, sc.level / 60000);
      audio.setScrape(lvl);
      if (lvl > 0.02 && Math.random() < lvl * 4) fx.sparks(sc.x, sc.y + 0.05, sc.z, sc.vx, sc.vz, 3 + Math.round(lvl * 8), 1);
      if (lvl > 0.02) {
        car.scratchAt(car.body.worldToLocal(v.set(sc.x, sc.y, sc.z)), dt * 2 * lvl, 0.3);
      }
      sc.level = 0;
      return maxSev;
    },
    get total() { return (zones.front + zones.rear + zones.left + zones.right) / 4; },
    repair() {
      zones.front = zones.rear = zones.left = zones.right = 0;
      car.repair(); veh.repair(); fx.clear();
    },
    // small top-down damage diagram
    draw(ctx) {
      const W = ctx.canvas.width, H = ctx.canvas.height;
      ctx.clearRect(0, 0, W, H);
      const any = zones.front + zones.rear + zones.left + zones.right + (1 - veh.dmg.engine) + veh.dmg.lost.filter(Boolean).length + veh.dmg.bend.reduce((a, b) => a + b, 0);
      ctx.canvas.style.opacity = any > 0.02 ? 1 : 0;
      if (any <= 0.02) return;
      const col = (d) => `hsl(${Math.round(120 - 120 * Math.min(1, d))}, 80%, ${d > 0.02 ? 50 : 40}%)`;
      ctx.fillStyle = 'rgba(10,11,13,0.72)'; ctx.beginPath(); ctx.roundRect(0, 0, W, H, 10); ctx.fill();
      const cx = W / 2, bw = W * 0.42, bh = H * 0.62, top = H * 0.12;
      ctx.lineWidth = 3;
      const seg = (d, x, y, w2, h2) => { ctx.fillStyle = col(d); ctx.globalAlpha = 0.85; ctx.fillRect(x, y, w2, h2); ctx.globalAlpha = 1; };
      seg(zones.front, cx - bw / 2, top, bw, bh * 0.22);
      seg(zones.rear, cx - bw / 2, top + bh * 0.78, bw, bh * 0.22);
      seg(zones.left, cx - bw / 2, top + bh * 0.24, bw * 0.47, bh * 0.52);   // driver's left = screen left (top view, nose up)
      seg(zones.right, cx + bw * 0.03, top + bh * 0.24, bw * 0.47, bh * 0.52);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.strokeRect(cx - bw / 2, top, bw, bh);
      // wheels
      for (let i = 0; i < 4; i++) {
        const x = cx + (i % 2 === 0 ? -1 : 1) * (bw / 2 + 6), y = top + (i < 2 ? bh * 0.2 : bh * 0.8);
        const wv = veh.wheels[i], shove = Math.hypot(wv.x - wv.x0, wv.z - wv.z0);
        const mis = Math.min(1, (Math.abs(veh.dmg.toe[i]) + Math.abs(veh.dmg.camber[i]) * 0.5) * 8 + veh.dmg.bend[i] * 0.8 + shove * 8 + (veh.dmg.loose[i] ? 1 : 0));
        ctx.fillStyle = veh.dmg.lost[i] ? 'transparent' : col(mis); ctx.strokeStyle = veh.dmg.lost[i] ? '#ff3b30' : 'rgba(0,0,0,0.6)';
        ctx.beginPath(); ctx.rect(x - 5, y - 11, 10, 22); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = '#f3efe6'; ctx.font = `600 ${Math.round(H * 0.085)}px "Barlow Condensed", sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(`ENGINE ${Math.round(veh.dmg.engine * 100)}%`, cx, H * 0.92);
    },
  };
}
