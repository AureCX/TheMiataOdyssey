// Rigid-body vehicle dynamics: raycast suspension + combined-slip tyre model, drivetrain,
// buoyancy/hydrodynamics for the boat kit, and blade-element style aero surfaces for the plane kit.
import * as THREE from 'three';
import { groundInfo, groundHeight, groundHeightAt, waveHeight, biomeWeights, SURFACES, WATER_LEVEL } from './world.js';
import { nearbyColliders } from './scenery.js';
import { DIMS } from './car.js';

const G = 9.81;
const RHO_W = 1000;
const V3 = () => new THREE.Vector3();

// ---------------- Engine: Mazda B6-ZE 1.6 DOHC, 116 PS @ 6500, 136 Nm @ 5500
const TORQUE = [[0, 0], [800, 88], [1000, 95], [2000, 112], [3000, 122], [4000, 130], [5000, 135], [5500, 136], [6000, 132], [6500, 125], [7000, 112], [7400, 98]];
function engineTorque(rpm) {
  if (rpm <= TORQUE[0][0]) return 0;
  for (let i = 1; i < TORQUE.length; i++) if (rpm < TORQUE[i][0]) {
    const [r0, t0] = TORQUE[i - 1], [r1, t1] = TORQUE[i];
    return t0 + (t1 - t0) * (rpm - r0) / (r1 - r0);
  }
  return 98;
}
export const GEARS = [-3.758, 0, 3.136, 1.888, 1.330, 1.000, 0.814]; // R, N, 1..5
export const FINAL = 4.3;
const IDLE = 850, REDLINE = 7200;

// ---------------- Tyre: normalised combined slip, magic-formula shape
const SR_PEAK = 0.1, SA_PEAK = 0.13, MF_B = 1.49, MF_C = 1.6;
const mf = (s) => Math.sin(MF_C * Math.atan(MF_B * s));
// past the peak, grip falls towards (1 - fall): ~20% on asphalt; loose ground (grass, sand) barely drops
// because a spinning tyre digs in instead of polishing the surface
const mfS = (s, fall) => (s <= 1 ? mf(s) : 1 - fall * (1 - Math.exp(-1.4 * (s - 1))));

export class Vehicle {
  constructor() {
    this.pos = V3(); this.vel = V3(); this._va = V3(); this.q = new THREE.Quaternion(); this.w = V3();
    this.F = V3(); this.T = V3();
    this.baseMass = 1030;
    this.mass = this.baseMass;
    this.I = V3(); // body-frame diagonal inertia (x=pitch, y=yaw, z=roll)
    this.boatT = 0; this.planeT = 0;
    this.gear = 2; // index into GEARS (2 = 1st)
    this.auto = true;
    this.rpm = IDLE;
    this.flood = 0; // car-mode water ingress 0..1
    this.steerAngle = 0;
    this.propSpeed = 0; this.boatProp = 0;
    this.throttleLever = 0;
    this.time = 0;
    this.crash = 0;
    this.events = [];          // impacts for the damage system: {p, n, speed, kind}
    this._impact = null; this._lastImpactT = -9; this._lastImpactS = 0;
    this._scrape = { level: 0 }; this.scrape = { level: 0 };
    this.dmg = { engine: 1, toe: [0, 0, 0, 0], camber: [0, 0, 0, 0], lost: [false, false, false, false], bend: [0, 0, 0, 0], loose: [false, false, false, false], flat: [false, false, false, false] };
    this.k = 26000; this.c = 2300; this.L0 = 0.25; this.attachY = -0.017;
    this.wheels = [
      { x: DIMS.track / 2, z: DIMS.frontZ, front: true, arb: 14000 },
      { x: -DIMS.track / 2, z: DIMS.frontZ, front: true, arb: 14000 },
      { x: DIMS.track / 2, z: DIMS.rearZ, front: false, arb: 7000 },
      { x: -DIMS.track / 2, z: DIMS.rearZ, front: false, arb: 7000 },
    ].map((w) => ({ ...w, comp: 0, compPrev: 0, omega: 0, angle: 0, contact: false, Fz: 0, slip: 0, slipLat: 0, surface: 'asphalt', len: this.L0,
      temp: 25, wear: 1, brakeT: 40, camber: 0, grip: 1, phase: 0 }));
    for (const w of this.wheels) { w.x0 = w.x; w.z0 = w.z; }  // factory mounting points (crashes can push wheels back/in)
    this.ambientT = 20;
    this.realism = true; // false = sim-arcade: no tyre temperature/wear effects, no brake fade
    this.tank = 45; this.fuel = 45;   // litres (the NA's tank)
    // body collision points (local, CoM origin)
    this.hullPts = [];
    for (const x of [-0.82, 0.82]) for (const z of [-1.95, -1.0, 0, 1.0, 1.95]) { this.hullPts.push(new THREE.Vector3(x, -0.25, z), new THREE.Vector3(x, 0.4, z)); }
    this.hullPts.push(new THREE.Vector3(0, 0.75, 0.0), new THREE.Vector3(0.6, 0.72, 0.05), new THREE.Vector3(-0.6, 0.72, 0.05), new THREE.Vector3(0, 0.45, -0.75), new THREE.Vector3(0, -0.3, 0));
    this.ringPts = [];
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; this.ringPts.push(new THREE.Vector3(Math.sin(a) * 0.86, 0.0, Math.cos(a) * 2.0)); }
    // buoyancy grid
    this.buoyPts = [];
    for (const x of [-0.65, 0, 0.65]) for (const z of [-1.8, -0.9, 0, 0.9, 1.8]) this.buoyPts.push({ x, z });
    this.updateMassProps();
    this.tmp = { g: { h: 0, nx: 0, ny: 1, nz: 0, onRoad: false, surface: 'asphalt' } };
    this._colliders = [];
    this.telemetry = { speed: 0, inWater: false, submerged: 0, airspeed: 0, aoa: 0, altitude: 0, vs: 0, onGround: false, stall: false };
  }

  updateMassProps() {
    const b = this.boatT, p = this.planeT;
    this.mass = this.baseMass + 190 * b + 150 * p;
    this.I.set(1250 + 400 * b + 600 * p, 1350 + 420 * b + 1300 * p, 330 + 150 * b + 1100 * p);
  }

  recordImpact(p, n, speed, kind) {
    if (!this._impact || speed > this._impact.speed) this._impact = { p: p.clone(), n: n.clone(), speed, kind };
  }

  repair() {
    this.dmg = { engine: 1, toe: [0, 0, 0, 0], camber: [0, 0, 0, 0], lost: [false, false, false, false], bend: [0, 0, 0, 0], loose: [false, false, false, false], flat: [false, false, false, false] };
    for (const w of this.wheels) { w.wear = 1; w.temp = this.ambientT; w.brakeT = this.ambientT; w.x = w.x0; w.z = w.z0; }
    this.mechLimp = 0;  // fresh tyres, cool brakes, straight suspension
  }

  reset(x, y, z, heading) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0); this.w.set(0, 0, 0);
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    for (const w of this.wheels) { w.omega = 0; w.comp = w.compPrev = 0; }
    this.flood = 0; this.throttleLever = 0;
    if (this.gear < 2) this.gear = 2;
  }

  // apply world-space force f at world point p
  addForceAt(f, p) {
    this.F.add(f);
    this._r.subVectors(p, this.pos);
    this._t.crossVectors(this._r, f);
    this.T.add(this._t);
  }

  pointVel(p, out) {
    this._r.subVectors(p, this.pos);
    return out.crossVectors(this.w, this._r).add(this.vel);
  }

  step(dt, inp, env) {
    this.time += dt;
    this.F.set(0, -G * this.mass, 0); this.T.set(0, 0, 0);
    this._impact = null; this._scrape.level = 0;
    const q = this.q;
    const up = this._up.set(0, 1, 0).applyQuaternion(q);
    const fwd = this._fwd.set(0, 0, 1).applyQuaternion(q);
    const left = this._left.set(1, 0, 0).applyQuaternion(q);
    const speedFwd = this.vel.dot(fwd);
    const wheelAvail = 1 - this.boatT;
    const planeMode = this.planeT > 0.5, boatMode = this.boatT > 0.5;

    // ----------------------------------------------------- Steering
    const v = this.vel.length();
    // full lock when slow; at speed the rack is limited to roughly what the front tyres can use (path + peak slip angle),
    // so a full keyboard/stick input turns as hard as the car can rather than ploughing straight on
    const maxSteer = Math.min(0.58 / (1 + v / 22), Math.atan(DIMS.wheelbase * 8 / Math.max(1, v * v)) + 0.075);
    const target = -inp.steer * maxSteer;
    const rate = 2.6 * dt;
    this.steerAngle += Math.max(-rate, Math.min(rate, target - this.steerAngle));

    // ----------------------------------------------------- Drivetrain
    const ratio = GEARS[this.gear] * FINAL;
    const rearOmega = (this.wheels[2].omega + this.wheels[3].omega) / 2;
    let driveT = 0; // total torque at the rear axle
    let engineCoupled = false;
    let throttle = inp.throttle;
    let brake = inp.brake;
    // arcade-style reverse when stopped: S engages reverse, W brakes in reverse
    if (!planeMode && !boatMode) {
      if (this.auto) {
        if (this.gear === 0) { const t = throttle; throttle = brake; brake = t; if (speedFwd > -0.5 && throttle === 0 && brake > 0 && Math.abs(speedFwd) < 0.6) this.gear = 2; }
        else if (brake > 0 && throttle === 0 && Math.abs(speedFwd) < 0.6 && this._brakeHold > 0.35) { this.gear = 0; }
        this._brakeHold = (brake > 0 && Math.abs(speedFwd) < 0.6) ? (this._brakeHold || 0) + dt : 0;
      }
      // throttle body: part pedal already gives most of the torque at low revs (petrol engine pedal map)
      let pedal = 1 - (1 - throttle) * (1 - throttle);
      // Sim-arcade traction control: trims the pedal while the rear tyres spin
      const rs = Math.max(this.wheels[2].slip, this.wheels[3].slip);
      this.tc = this.tc ?? 1;
      if (!this.realism && rs > 0.16 && speedFwd > -0.5) this.tc = Math.max(0.2, this.tc - dt * 5); else this.tc = Math.min(1, this.tc + dt * 1.5);
      if (!this.realism) pedal *= this.tc;
      if (ratio !== 0) {
        const wheelRpm = Math.abs(rearOmega * ratio) * 60 / (2 * Math.PI);
        let rpm = wheelRpm;
        if (rpm < 1300) {
          // clutch slipping: engine held up by throttle
          // pulling away: the clutch slips with the engine held around 1500-2600 rpm, like a careful launch
          const free = IDLE + pedal * 1750;
          rpm = Math.max(rpm, IDLE + (free - IDLE) * Math.min(1, pedal * 2));
          const clutch = Math.min(1, 0.35 + pedal);
          driveT = engineTorque(rpm) * pedal * clutch * ratio * 0.9 * this.enginePower();
        } else {
          engineCoupled = true;
          let tq = engineTorque(rpm) * pedal * this.enginePower();
          if (rpm > REDLINE) tq = 0; // limiter
          tq -= (1 - pedal) * (12 + rpm * 0.0035); // engine braking
          driveT = tq * ratio * 0.9;
        }
        this.rpm += (Math.min(rpm, REDLINE + 150) - this.rpm) * Math.min(1, dt * 25);
        // automatic shifting
        if (this.auto && this.gear >= 2) {
          if (wheelRpm > 6900 && this.gear < 6) this.gear++;
          else if (wheelRpm < 2600 && this.gear > 2) { const nr = wheelRpm * GEARS[this.gear - 1] / GEARS[this.gear]; if (nr < 6200) this.gear--; }
        }
      } else {
        this.rpm += (IDLE + throttle * 6000 - this.rpm) * Math.min(1, dt * 6);
      }
    } else {
      // engine drives a propeller
      this.rpm += (IDLE + throttle * 5900 - this.rpm) * Math.min(1, dt * 3);
    }

    // ----------------------------------------------------- Wheels / suspension / tyres
    const g = this.tmp.g;
    const attach = this._a, hit = this._b, f = this._c, tmp = this._d, vc = this._e;
    const down = this._down.copy(up).negate();
    let contacts = 0;
    const R = DIMS.wheelR;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      w.contact = false; w.Fz = 0;
      if (wheelAvail < 0.3 || this.dmg.lost[i]) { w.comp = 0; w.len = this.L0; w.omega *= 0.98; w.contact = false; continue; }
      attach.set(w.x, this.attachY, w.z).applyQuaternion(q).add(this.pos);
      // ray-heightfield intersection along body-down
      const dy = Math.max(0.2, -down.y);
      let d = (attach.y - groundHeightAt(attach.x, attach.z, attach.y)) / dy;
      hit.copy(attach).addScaledVector(down, d);
      d = (attach.y - groundHeightAt(hit.x, hit.z, attach.y)) / dy;
      // a bent rim is out of round and wobbles: radius and toe vary once per revolution
      const bend = this.dmg.bend[i];
      w.phase = (w.phase + w.omega * dt) % (2 * Math.PI);
      // a wheel hanging loose sags on its broken mount
      const len = d - (R + bend * 0.012 * Math.sin(w.phase) - (this.dmg.loose[i] ? 0.035 : 0));
      w.compPrev = w.comp;
      w.comp = Math.max(0, this.L0 - len);
      w.len = Math.min(this.L0, Math.max(0.02, len));
      w.angle = (w.front ? this.steerAngle * (1 + (w.x > 0 === this.steerAngle > 0 ? 0.1 : -0.06)) : 0) + this.dmg.toe[i] + this.dmg.bend[i] * 0.03 * Math.sin(w.phase + 1.3) + (this.dmg.loose[i] ? 0.11 * Math.sin(w.phase * 0.5) : 0);
      if (w.comp <= 0) { w.slip = 0; w.slipLat = 0; continue; }
      if (w.comp > this.L0 + 0.3) { w.comp = 0; continue; } // underground (teleport guard)
      w.contact = true; contacts++;
      hit.copy(attach).addScaledVector(down, d);
      groundInfo(hit.x, hit.z, g, attach.y);
      const n = this._n.set(g.nx, g.ny, g.nz);
      const surf = SURFACES[g.surface] || SURFACES.grass;
      w.surface = g.surface;
      // spring/damper + anti-roll + bump stop
      const other = this.wheels[i ^ 1];
      const compRate = (w.comp - w.compPrev) / dt;
      let Fs = this.k * w.comp + this.c * compRate + w.arb * (w.comp - other.comp);
      if (w.comp > 0.2) Fs += 250000 * (w.comp - 0.2);
      Fs = Math.max(0, Fs) * Math.max(0, up.dot(n));
      w.Fz = Fs;
      f.copy(up).multiplyScalar(Fs);
      this.addForceAt(f, hit);
      // tyre frame
      const wf = tmp.copy(fwd).applyAxisAngle(up, w.angle);
      wf.addScaledVector(n, -wf.dot(n)).normalize();
      const wl = this._wl.crossVectors(n, wf);
      this.pointVel(hit, vc);
      const vLong = vc.dot(wf), vLat = vc.dot(wl);
      const denom = Math.max(Math.abs(vLong), 5);
      const sr = (w.omega * R - vLong) / denom;
      const sa = Math.atan2(vLat, Math.max(Math.abs(vLong), 2.5));
      const sx = sr / SR_PEAK, sy = sa / SA_PEAK;
      const s = Math.hypot(sx, sy);
      // grip modifiers: load sensitivity, tyre temperature, wear, camber
      const side = w.x > 0 ? 1 : -1;
      const roll = Math.asin(Math.max(-1, Math.min(1, left.y)));
      // double-wishbone camber: static setting, gain in bump (~0.5 deg/cm), body roll, crash damage
      const gamma = (w.front ? -0.009 : -0.017) - 0.87 * (w.comp - 0.097) - side * roll + this.dmg.camber[i] * 0.5;
      w.camber = gamma;
      const loadK = Math.max(0.78, Math.min(1.12, 1 - 0.12 * (Fs / 2550 - 1)));
      const tK = this.realism ? Math.max(0.74, 1 - 0.09 * ((w.temp - 82) / 50) ** 2) : 1;
      const wearK = this.realism ? 0.84 + 0.16 * w.wear : 1;
      const camK = 1 - 0.6 * Math.min(0.15, Math.abs(gamma + 0.026));
      w.grip = loadK * tK * wearK * camK * (this.dmg.loose[i] ? 0.55 : 1) * (this.dmg.flat && this.dmg.flat[i] ? 0.45 : 1) * (this.tune ? this.tune.grip : 1);
      const D = surf.mu * (1 - (env.wet || 0) * surf.wetLoss) * (1 - (env.ice || 0)) * 1.05 * Fs * w.grip;   // wet roads lose ~30% grip
      let Fx = 0, Fy = 0;
      if (s > 1e-6) { const F = D * mfS(s, surf.fall); Fx = F * sx / s; Fy = -F * sy / s; }
      // low-speed lateral stiction to stop creeping
      if (Math.abs(vLong) < 1.5) Fy -= vLat * Math.min(D, 1800) * 0.4 * (1 - Math.abs(vLong) / 1.5);
      // a flat tyre drags (and pulls the car to its side)
      if (this.dmg.flat && this.dmg.flat[i]) Fx -= Math.sign(vLong) * Math.min(Math.abs(vLong) * 400, Fs * 0.09);
      // camber thrust: a tyre leaning sideways pushes the way it leans
      Fy += Fs * 0.8 * side * gamma;
      w.slip = sr; w.slipLat = sa;
      // tyre heating from sliding and flexing, cooling into the air; wear from sliding energy
      const slipPow = Math.abs(Fx * (w.omega * R - vLong)) + Math.abs(Fy * vLat);
      const vAbs = Math.abs(vLong);
      w.temp += (slipPow * 6e-5 + vAbs * 0.12 * (Fs / 2550) - (w.temp - this.ambientT) * (0.012 + 0.002 * vAbs)) * dt;
      if (this.realism) w.wear = Math.max(0, w.wear - slipPow * dt * 1.5e-7 * (1 + Math.max(0, w.temp - 110) / 20) * (g.surface === 'asphalt' ? 1 : 0.4));
      f.copy(wf).multiplyScalar(Fx).addScaledVector(wl, Fy);
      // rolling resistance
      f.addScaledVector(wf, -Math.sign(vLong) * Math.min(Math.abs(vLong) * 2, 1) * surf.roll * Fs);
      this.addForceAt(f, hit);
      w._Fx = Fx;
    }
    // wheel spin integration (rear driven with viscous LSD)
    const handbrake = inp.handbrake ? 1 : 0;
    const Ie = 0.14; // engine + flywheel inertia
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      let T = 0, I = 1.1;
      if (!w.front && !planeMode && !boatMode) {
        T = driveT / 2;
        if (engineCoupled) I += Ie * ratio * ratio / 2;
        const o = this.wheels[i ^ 1];
        T -= 40 * (w.omega - o.omega);
      }
      T -= (w._Fx || 0) * R * (w.contact ? 1 : 0);
      w.omega += T / I * dt;
      // brakes: 60/40 bias, ~2200 Nm total
      // brake fade: friction drops as the discs pass ~400 C
      const fade = this.realism ? 1 - 0.45 * Math.min(1, Math.max(0, (w.brakeT - 380) / 270)) : 1;
      let bT = brake * (w.front ? 650 : 430) * fade * (this.tune ? this.tune.brake : 1);
      if (!w.front) bT += handbrake * 1400;
      const bd = bT / I * dt;
      w.brakeT += (Math.min(bT, Math.abs(w.omega) * I / dt) * Math.abs(w.omega) * 0.0006 - (w.brakeT - this.ambientT) * (0.012 + 0.0016 * Math.abs(w.omega * R))) * dt;
      if (Math.abs(w.omega) <= bd) w.omega = 0; else w.omega -= Math.sign(w.omega) * bd;
      if (!w.contact) w.omega *= 0.999;
      w._Fx = 0;
    }

    // ----------------------------------------------------- Body vs ground collisions
    const hp = this._a, pv = this._e;
    let bodyHits = 0;
    const qInv = this._qi2.copy(q).invert();
    for (const lp of this.hullPts) {
      hp.copy(lp).applyQuaternion(q).add(this.pos);
      const gh = groundHeightAt(hp.x, hp.z, hp.y + 0.3);
      const pen = gh - hp.y;
      if (pen <= 0) continue;
      bodyHits++;
      groundInfo(hp.x, hp.z, g, hp.y + 0.3);
      const n = this._n.set(g.nx, g.ny, g.nz);
      this.pointVel(hp, pv);
      const vn = pv.dot(n);
      const Fn = Math.max(0, 260000 * pen * n.y - 14000 * vn);
      f.copy(n).multiplyScalar(Fn);
      // sliding friction
      tmp.copy(pv).addScaledVector(n, -vn);
      const vt = tmp.length();
      if (vt > 1e-3) f.addScaledVector(tmp, -0.55 * Fn * Math.min(1, vt / 0.5) / vt);
      this.addForceAt(f, hp);
      if (-vn > 4) this.recordImpact(lp, this._ln.copy(n).applyQuaternion(qInv), -vn, 'ground');
      if (vt > 2 && Fn > 500 && vt * Fn > this._scrape.level) Object.assign(this._scrape, { level: vt * Fn, x: hp.x, y: hp.y, z: hp.z, vx: pv.x, vz: pv.z, speed: vt });
    }

    // ----------------------------------------------------- Trees, rocks, traffic: car footprint (box) vs circles
    const cols = nearbyColliders(this.pos.x, this.pos.z, this._colliders);
    const dyn = env.dynamicColliders || [];
    const fh = this._fh.set(fwd.x, 0, fwd.z);
    if (fh.lengthSq() < 0.04) fh.set(0, 0, 1); // pointing straight up/down: fall back
    fh.normalize();
    const lh = this._lh.set(fh.z, 0, -fh.x);
    const HX = 0.84, HZ = 1.99;
    const gBase = groundHeight(this.pos.x, this.pos.z);
    const lowEnough = this.pos.y - gBase < 6;
    const circle = (cx, cz, cr, kind) => {
      const dx = cx - this.pos.x, dz = cz - this.pos.z;
      const lx = dx * lh.x + dz * lh.z, lz = dx * fh.x + dz * fh.z;
      if (Math.abs(lx) > HX + cr || Math.abs(lz) > HZ + cr) return;
      let qx = Math.max(-HX, Math.min(HX, lx)), qz = Math.max(-HZ, Math.min(HZ, lz));
      let nx, nz, pen;
      const ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
      if (d > 1e-6) { if (d >= cr) return; pen = cr - d; nx = -ex / d; nz = -ez / d; }
      else { // centre inside the footprint: push out along the nearest side
        const ox = HX - Math.abs(lx), oz = HZ - Math.abs(lz);
        if (ox < oz) { nx = -Math.sign(lx); nz = 0; pen = cr + ox; qx = Math.sign(lx) * HX; }
        else { nx = 0; nz = -Math.sign(lz); pen = cr + oz; qz = Math.sign(lz) * HZ; }
      }
      // contact point and normal in world space (normal points from obstacle into car)
      hp.copy(this.pos).addScaledVector(lh, qx).addScaledVector(fh, qz);
      const wnx = lh.x * nx + fh.x * nz, wnz = lh.z * nx + fh.z * nz;
      this.pointVel(hp, pv);
      const vn = pv.x * wnx + pv.z * wnz;
      // stiff, heavily damped contact: crumple zones absorb energy instead of bouncing
      const Fn = Math.max(0, 3.5e6 * pen - (vn < 0 ? 110000 : 20000) * vn);
      const tx = -wnz, tz = wnx, vt = pv.x * tx + pv.z * tz;
      f.set(wnx * Fn - tx * Math.sign(vt) * Fn * 0.3, 0, wnz * Fn - tz * Math.sign(vt) * Fn * 0.3);
      this.addForceAt(f, hp);
      if (-vn > 2.5) this.recordImpact(this._lp.set(qx, 0, qz), this._ln.set(nx, 0, nz), -vn, kind ? 'car' : 'tree');
      if (kind && env.onHitDynamic) env.onHitDynamic(kind, -vn, -f.x * this._dt, -f.z * this._dt);
    };
    this._dt = dt;
    if (lowEnough) {
      for (const dc of dyn) circle(dc.x, dc.z, dc.r, dc);
    }
    // static obstacles count up to their own top (tall buildings stop a low-flying plane; a car on a roof stays there)
    for (let c = 0; c < cols.length; c += 4) if (this.pos.y < cols[c + 3] - 0.6) circle(cols[c], cols[c + 1], cols[c + 2] + 0.05, null);
    // wing tips (plane kit) against trees
    const wingSpan = this.planeT * 4.5;
    if (wingSpan > 1) for (const sgn of [1, -1]) for (const frac of [1, 0.66]) {
      const lp = this._lp.set(sgn * wingSpan * frac, 0.05, -0.2);
      hp.copy(lp).applyQuaternion(q).add(this.pos);
      for (let c = 0; c < cols.length; c += 4) {
        if (hp.y > cols[c + 3]) continue;
        const dx = hp.x - cols[c], dz = hp.z - cols[c + 1], r = cols[c + 2] + 0.3;
        if (dx * dx + dz * dz < r * r) {
          this.pointVel(hp, pv);
          f.copy(pv).multiplyScalar(-1500);
          this.addForceAt(f, hp);
          if (pv.length() > 5) this.recordImpact(lp.clone(), this._ln.set(-sgn, 0, 0), pv.length(), 'wing');
        }
      }
    }

    // ----------------------------------------------------- Water: buoyancy + hydrodynamic drag + propulsion
    const t = env.time;
    const calm = env.calm ?? 1;
    const b = this.boatT;
    const footprint = (1.6 + 0.4 * b) * (3.9 + 0.5 * b);
    const area = footprint / this.buoyPts.length;
    let submergedSum = 0;
    const hullBottom = (z) => {
      const carB = -0.27;
      const u = (z + 2.15) / 4.6, bow = Math.pow(Math.max(0, (u - 0.62) / 0.38), 1.6);
      const boatB = -0.46 - 0.42 + 0.62 * bow * bow + 0.27; // sits a little deeper so it doesn't ride high in swell
      return carB + (boatB - carB) * b;
    };
    // car-mode flooding
    const floodCap = 1 - 0.97 * this.flood * (1 - b);
    for (const bp of this.buoyPts) {
      const yb = hullBottom(bp.z);
      const colH = 0.7 + 0.25 * b;
      hp.set(bp.x * (1 + 0.35 * b), yb, bp.z * (1 + 0.1 * b)).applyQuaternion(q).add(this.pos);
      const wh = WATER_LEVEL + waveHeight(hp.x, hp.z, t, calm);
      const depth = wh - hp.y;
      if (depth <= 0) continue;
      if (groundHeight(hp.x, hp.z) > wh) continue;
      const sub = Math.min(depth, colH);
      const frac = sub / colH;
      submergedSum += frac;
      // buoyancy (volume of the column below the surface)
      f.set(0, RHO_W * G * area * sub * floodCap, 0);
      this.addForceAt(f, hp);
      // drag in body axes
      this.pointVel(hp, pv);
      const vz = pv.dot(fwd), vx = pv.dot(left), vy = pv.dot(up);
      const kL = (70 - 61 * b), kS = 70 - 20 * b, kV = 260 + 120 * b;
      const lin = 120 - 70 * b;
      f.copy(fwd).multiplyScalar(-(kL * Math.abs(vz) + lin * 0.4) * vz * frac)
        .addScaledVector(left, -(kS * Math.abs(vx) + lin) * vx * frac)
        .addScaledVector(up, -(kV * Math.abs(vy) + lin * 4) * vy * frac);
      // apply hull drag near the waterline so lateral drag doesn't trip the hull
      hp.addScaledVector(up, Math.max(0, -0.3 - yb));
      this.addForceAt(f, hp);
    }
    const subFrac = submergedSum / this.buoyPts.length;
    this.telemetry.submerged = subFrac;
    this.telemetry.inWater = subFrac > 0.05;
    if (subFrac > 0.2 && b < 0.5) this.flood = Math.min(1, this.flood + dt / 25);
    else if (b > 0.5) this.flood = Math.max(0, this.flood - dt / 3);
    else if (subFrac < 0.01) this.flood = Math.max(0, this.flood - dt / 40);

    // outboard propeller
    if (b > 0.5) {
      hp.set(0, -1.15, -2.45).applyQuaternion(q).add(this.pos);
      const wh = WATER_LEVEL + waveHeight(hp.x, hp.z, t, calm);
      const thr = inp.throttle - inp.brake * 0.45;
      this.boatProp += (thr * 120 - this.boatProp) * Math.min(1, dt * 3);
      if (wh - hp.y > 0.05) {
        const steerA = inp.steer * (0.5 - 0.3 * Math.min(1, Math.abs(speedFwd) / 12));
        const dir = tmp.copy(fwd).applyAxisAngle(up, steerA);
        const Tm = thr * 5000 * b * this.enginePower();
        f.copy(dir).multiplyScalar(Tm);
        this.addForceAt(f, hp);
      }
    } else this.boatProp *= 0.97;

    // ----------------------------------------------------- Aerodynamics
    const rho = 1.225 * Math.exp(-this.pos.y / 8500);
    // body drag (Cd 0.38 x 1.72 m²) + a little lift reduction
    // wind only acts on the plane kit (the air moves past the wings); the car ignores it
    const wind = this.planeT > 0.05 && env.wind ? env.wind : null;
    const va = wind ? this._va.copy(this.vel).sub(wind) : this.vel;
    const vv = va.length();
    if (vv > 0.1) {
      f.copy(va).multiplyScalar(-0.5 * rho * 0.65 * vv);
      this.F.add(f);
    }
    // wing/tail surfaces
    const p = this.planeT;
    let aoaWing = 0, stall = false;
    if (p > 0.05) {
      const pe = p * p * (3 - 2 * p);
      const surfaces = this._surfaces || (this._surfaces = [
        { pos: new THREE.Vector3(2.35, 0.06, -0.1), n: new THREE.Vector3(-0.09, 1, 0).normalize(), area: 8, inc: 0.06, AR: 5, ctl: 'rollL' },
        { pos: new THREE.Vector3(-2.35, 0.06, -0.1), n: new THREE.Vector3(0.09, 1, 0).normalize(), area: 8, inc: 0.06, AR: 5, ctl: 'rollR' },
        { pos: new THREE.Vector3(0, 0.29, -4.45), n: new THREE.Vector3(0, 1, 0), area: 2.3, inc: -0.1, AR: 5, ctl: 'pitch' },
        { pos: new THREE.Vector3(0, 0.8, -4.2), n: new THREE.Vector3(1, 0, 0), area: 1.25, inc: 0, AR: 1.5, ctl: 'yaw' },
      ]);
      for (const s of surfaces) {
        hp.copy(s.pos).applyQuaternion(q).add(this.pos);
        const n = this._n.copy(s.n).applyQuaternion(q);
        this.pointVel(hp, pv); if (wind) pv.sub(wind);
        const vn = pv.dot(n), vcd = pv.dot(fwd);
        const V2 = vn * vn + vcd * vcd;
        if (V2 < 1) continue;
        let defl = 0;
        if (s.ctl === 'rollL') defl = inp.roll * 0.045;
        else if (s.ctl === 'rollR') defl = -inp.roll * 0.045;
        else if (s.ctl === 'pitch') defl = -inp.pitch * 0.16;
        else if (s.ctl === 'yaw') defl = inp.yaw * 0.25;
        const alpha = Math.atan2(-vn, vcd) + s.inc + defl;
        const as = 0.27;
        let CL, kStall = 0;
        const a = Math.abs(alpha);
        if (a < as) CL = 5.0 * alpha;
        else { const post = 1.1 * Math.sin(2 * alpha); kStall = Math.min(1, (a - as) / 0.12); CL = (1 - kStall) * 5.0 * as * Math.sign(alpha) + kStall * post; if (s.ctl === 'rollL') stall = true; }
        const CD = 0.028 + CL * CL / (Math.PI * 0.8 * s.AR) * (1 - kStall) + 1.8 * Math.pow(Math.sin(alpha), 2) * kStall;
        const qd = 0.5 * rho * V2 * s.area * pe;
        // motion direction in the n-c plane
        const um = tmp.copy(n).multiplyScalar(vn).addScaledVector(fwd, vcd).normalize();
        const liftDir = vc.copy(n).addScaledVector(um, -n.dot(um)).normalize();
        f.copy(liftDir).multiplyScalar(qd * CL).addScaledVector(um, -qd * CD);
        this.addForceAt(f, hp);
        if (s.ctl === 'rollL') aoaWing = alpha;
      }
      // propeller thrust at the nose
      const thr = this.throttleLever;
      this.propSpeed += ((thr * 0.9 + 0.1) * 260 - this.propSpeed) * Math.min(1, dt * 2);
      const Pw = 150000 * thr * 0.82 * this.enginePower();
      const Tp = Math.min(6800 * thr, Pw / Math.max(vcdAbs(this.vel, fwd), 1)) * pe;
      hp.set(0, -0.04, 2.2).applyQuaternion(q).add(this.pos);
      f.copy(fwd).multiplyScalar(Tp);
      this.addForceAt(f, hp);
      // flight assist: wing leveller + yaw damper when the stick is centred
      if (inp.assist && contacts === 0) {
        const qa = Math.min(1, vv / 30) * pe;
        const rollRate = this.w.dot(fwd);
        if (Math.abs(inp.roll) < 0.1) this.T.addScaledVector(fwd, (-5000 * left.y - 6000 * rollRate) * qa);
        else this.T.addScaledVector(fwd, -1500 * rollRate * qa);
        this.T.addScaledVector(up, -3000 * this.w.dot(up) * qa * (Math.abs(inp.yaw) < 0.1 ? 1 : 0));
      }
    } else this.propSpeed *= 0.97;

    // ----------------------------------------------------- Integrate
    const m = this.mass;
    this.vel.addScaledVector(this.F, dt / m);
    // angular (body frame, with gyroscopic term)
    const qi = this._qi.copy(q).invert();
    const wb = this._wb.copy(this.w).applyQuaternion(qi);
    const Tb = this._tb.copy(this.T).applyQuaternion(qi);
    const I = this.I;
    const Iw = this._iw.set(I.x * wb.x, I.y * wb.y, I.z * wb.z);
    const gyro = this._gy.crossVectors(wb, Iw);
    wb.x += (Tb.x - gyro.x) / I.x * dt;
    wb.y += (Tb.y - gyro.y) / I.y * dt;
    wb.z += (Tb.z - gyro.z) / I.z * dt;
    this.w.copy(wb).applyQuaternion(q);
    // small angular damping (air) for numerical calm
    this.w.multiplyScalar(1 - 0.02 * dt);
    this.pos.addScaledVector(this.vel, dt);
    const wq = this._wq.set(this.w.x * dt * 0.5, this.w.y * dt * 0.5, this.w.z * dt * 0.5, 0);
    wq.multiply(q);
    q.set(q.x + wq.x, q.y + wq.y, q.z + wq.z, q.w + wq.w).normalize();

    // safety: never fall through the terrain
    const gh = groundHeight(this.pos.x, this.pos.z);
    if (this.pos.y < gh - 1.5) { this.pos.y = gh + 0.5; if (this.vel.y < 0) this.vel.y = 0; }

    // impact events (debounced so one crash is one event)
    if (this._impact) {
      const im = this._impact;
      if (this.time - this._lastImpactT > 0.25 || im.speed > this._lastImpactS + 4) {
        this.events.push(im); this._lastImpactT = this.time; this._lastImpactS = im.speed;
      }
    }
    if (this._scrape.level > this.scrape.level) Object.assign(this.scrape, this._scrape);

    // telemetry
    const tm = this.telemetry;
    tm.speed = this.vel.dot(fwd);
    tm.airspeed = vv;
    tm.aoa = aoaWing;
    tm.stall = stall;
    tm.altitude = this.pos.y - Math.max(gh, WATER_LEVEL);
    tm.vs = this.vel.y;
    tm.onGround = contacts > 0 || bodyHits > 0;
    tm.contacts = contacts;
  }
}

// no fuel, no power: the car coasts, the boat drifts, the plane glides
Vehicle.prototype.enginePower = function () { return this.fuel > 0 ? (0.25 + 0.75 * this.dmg.engine) * (this.dmg.engine < 0.3 ? 0.6 : 1) * (this.tune ? this.tune.power : 1) * (1 + 0.6 * (this.nitro || 0)) : 0; };

// Fuel flow in litres per second. The B6 burns ~6 L/100 km cruising and over 30 L/h flat out; the outboard and the
// propeller load the engine harder; the mech's servos sip, its jump-jets gulp. fuelRate scales it: the game compresses
// time like its day cycle (x10 Realistic, about 50 km a tank; x4 Sim-arcade).
Vehicle.prototype.burnFuel = function (dt, throttle, mode) {
  if (this.fuel <= 0) { this.fuel = 0; return; }
  const load = mode === 'plane' ? 0.0002 + 0.011 * this.throttleLever
    : mode === 'boat' ? 0.0002 + 0.008 * throttle
    : mode === 'mech' ? 0.0003 + 0.00035 * Math.abs(this.mech ? this.mech.u : 0) + (this.mech && this.mech.jet ? 0.03 : 0)
    : 0.00015 + 0.009 * throttle * Math.min(1.1, this.rpm / 6500);
  this.fuel = Math.max(0, this.fuel - load * dt * (this.fuelRate ?? 1));
};

function vcdAbs(vel, fwd) { return Math.abs(vel.dot(fwd)); }

// scratch vectors
Object.assign(Vehicle.prototype, {
  _r: V3(), _t: V3(), _up: V3(), _fwd: V3(), _left: V3(), _down: V3(), _a: V3(), _b: V3(), _c: V3(), _d: V3(), _e: V3(), _n: V3(), _wl: V3(),
  _qi2: new THREE.Quaternion(), _ln: V3(), _lp: V3(), _fh: V3(), _lh: V3(),
  _qi: new THREE.Quaternion(), _wq: new THREE.Quaternion(), _wb: V3(), _tb: V3(), _iw: V3(), _gy: V3(),
});

export function waterCalmAt(x, z) { return 0.25 + 0.75 * biomeWeights(x, z).sea; }

// ---------------- Mech mode: a kinematic walker (no wheels). t = transformation progress 0..1; while it's under 1
// the robot is standing up (or folding back) in place. Inputs: throttle/brake walk, steer turns, inp.jump jumps and
// holding it fires the back-pack jets for a short burst.
Vehicle.prototype.stepMech = function (dt, inp, env, t) {
  this.time += dt;
  const M = this.mech || (this.mech = { yaw: 0, u: 0, vy: 0, air: false, fuel: 1.5, land: 0, init: false });
  if (!M.init) {
    const f = this._fwd.set(0, 0, 1).applyQuaternion(this.q);
    // keep falling if it transforms in mid-air (out of the plane)
    M.yaw = Math.atan2(f.x, f.z); M.u = Math.max(-3, Math.min(12, this.vel.dot(f.setY(0).normalize()))); M.vy = this.vel.y;
    M.air = this.pos.y - groundHeight(this.pos.x, this.pos.z) > 1.5; M.init = true;
  }
  const ready = t > 0.98;
  // stand upright, facing the heading
  const tq = this._qi2.setFromAxisAngle(this._up.set(0, 1, 0), M.yaw + (M.spin || 0));
  if (M.spin) this.q.copy(tq); else this.q.slerp(tq, Math.min(1, dt * 4));   // spin: the launch pirouette
  let yawRate = 0;
  const gh = groundHeight(this.pos.x, this.pos.z);
  const depth = WATER_LEVEL - gh;                                   // the robot wades along the bottom
  if (ready && !M.lock) {                                           // lock: landing / launch poses
    const top = (inp.throttle > 0 && this.fuel > 0 ? 6.5 : 0) * inp.throttle * (depth > 1.4 ? 0.55 : 1) * (1 - 0.45 * (this.mechLimp || 0));
    const target = top - inp.brake * 2.2;
    M.u += Math.max(-7 * dt, Math.min(7 * dt, target - M.u));
    yawRate = -inp.steer * (1.5 - Math.min(0.6, Math.abs(M.u) * 0.08));
    M.yaw += yawRate * dt;
    if (inp.jump && !M.air) { M.vy = 6.8; M.air = true; }
    if (inp.jump && M.air && M.vy < 3 && M.fuel > 0 && this.fuel > 0) { M.vy += 15 * dt; M.fuel -= dt; M.jet = true; } else M.jet = false;
  } else { M.u *= Math.max(0, 1 - 4 * dt); M.jet = false; }
  M.vy -= 9.81 * dt;
  this.pos.x += Math.sin(M.yaw) * M.u * dt;
  this.pos.z += Math.cos(M.yaw) * M.u * dt;
  this.pos.y += M.vy * dt;
  // trees and rocks: push the robot's 0.8 m radius out of each circle
  const cols = nearbyColliders(this.pos.x, this.pos.z, this._colliders);
  for (let c = 0; c < cols.length; c += 4) {
    if (this.pos.y - 0.46 > cols[c + 3] - 0.3) continue;
    const dx = this.pos.x - cols[c], dz = this.pos.z - cols[c + 1], r = cols[c + 2] + 0.8, d = Math.hypot(dx, dz);
    if (d < r && d > 1e-4) { this.pos.x += dx / d * (r - d); this.pos.z += dz / d * (r - d); M.u *= 0.9; }
  }
  // feet on the ground (root sits 0.46 m above the soles); small steps are climbed smoothly
  const g2 = groundHeightAt(this.pos.x, this.pos.z, this.pos.y - 0.46) + 0.46;
  if (this.pos.y <= g2) {
    if (M.air && M.vy < -3) M.land = Math.max(M.land || 0, -M.vy);   // main.js consumes and clears it
    this.pos.y = g2; M.vy = 0; M.air = false; M.fuel = Math.min(1.5, M.fuel + dt * 0.5);
  } else if (!M.air && this.pos.y - g2 < 0.6 && M.vy <= 0) { this.pos.y = Math.max(g2, this.pos.y - 3 * dt); M.vy = 0; }
  else M.air = true;
  this.vel.set(Math.sin(M.yaw) * M.u, M.vy, Math.cos(M.yaw) * M.u);
  this.w.set(0, yawRate, 0);
  for (const w of this.wheels) { w.contact = false; w.omega *= 0.95; w.slip = 0; w.slipLat = 0; }
  this.rpm += (900 + Math.abs(M.u) * 650 + (M.jet ? 2500 : 0) - this.rpm) * Math.min(1, dt * 5);
  const tm = this.telemetry;
  tm.speed = Math.abs(M.u); tm.onGround = !M.air; tm.inWater = depth > 0.6; tm.submerged = 0; tm.airspeed = 0;
  tm.altitude = this.pos.y - Math.max(gh, WATER_LEVEL);
};
