// Riding along: put the car on a carrier and let something else do the driving.
// - Motorail: the stopping train has a car-carrier wagon at the back. Wait at a station, and when the train is in,
//   pull up beside it and press F to load; at any later station press F to drive off by the road nearest the station.
// - Car ferry: Bayline Ferries runs West Bay (Coast road) → Gull Island (east cove) → Port Ruby (west end of the quay)
//   and back.
// - Silverpine cable car: two cabins, each big enough for a car, from the end of the ski car park to the summit
//   plateau; drive up to the station hall while a cabin is in and press F.
// - Freight driver (a job): take over the freight train's cab with your car on its carrier wagon and bring it to a
//   stop at the named station; signals ahead turn yellow and red near the train in front, and the safety system
//   stops you if you run a red.
import * as THREE from 'three';
import { roads } from './world.js';

const FARE = { motorail: 40, ferry: 25, cablecar: 30 };

export function createTransport({ world2, toast, econ }) {
  const trains = world2.trains, stops = world2.stops;
  const stopping = trains.find((t) => t.stops.length > 2 && t.carrier), freight = trains.find((t) => !t.stops.length && t.carrier);
  const L = world2.railLength;
  const railPos = (s) => world2.at(s, {});
  // where to drive off at each station: the nearest point on a proper road
  const exits = stops.map((st) => {
    const p = railPos(st.s); let best = 1e18, res = null;
    for (const r of roads) { if (r.type === 'rail' || r.type === 'track') continue; for (let i = 0; i < r.n; i++) { const d = (r.pts[i][0] - p.x) ** 2 + (r.pts[i][1] - p.z) ** 2; if (d < best) { best = d; res = { x: r.pts[i][0] + r.tz[i] * r.hw * 0.45, z: r.pts[i][1] - r.tx[i] * r.hw * 0.45, h: r.h[i], heading: Math.atan2(r.tx[i], r.tz[i]), road: r.name }; } } }
    return { ...res, name: st.name, sx: p.x, sz: p.z, dist: Math.sqrt(best) };
  });
  const stopName = (tr) => stops[tr.stops[tr.next]].name;
  const stationNear = (pos, r) => { for (let k = 0; k < stops.length; k++) { const p = railPos(stops[k].s); if (Math.hypot(p.x - pos.x, p.z - pos.z) < r) return k; } return -1; };
  const M = new THREE.Matrix4(), V = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3();

  let ride = null, job = null, prompt = '', action = null;

  function board(kind, carrier, tr) {
    const fare = FARE[kind] || 0;
    if (fare && econ && !econ.spend(fare)) toast(`Fare $${fare} · you're short, ride on the house`);
    else if (fare) toast(`Fare $${fare}`);
    ride = { kind, carrier, tr };
  }
  function leave(veh, at) {
    ride = null;
    veh.reset(at.x, at.h + 1.0, at.z, at.heading);
    toast(`Drove off at ${at.name}`);
  }

  const api = {
    get ride() { return ride; },
    get job() { return job; },
    get prompt() { return prompt; },
    get driving() { return ride && ride.kind === 'freight' ? ride.tr : null; },
    // the freight driver job: a station two stops ahead of where the freight is now
    startFreight(veh) {
      if (!freight) return;
      const order = stops.map((st, k) => ({ k, d: ((st.s - freight.s) % L + L) % L })).sort((a, b) => a.d - b.d);
      const dst = order[Math.min(1, order.length - 1)];
      freight.manual = { throttle: 0, brake: 0, signal: 'green', emergency: false };
      ride = { kind: 'freight', carrier: freight.carrier, tr: freight };
      job = { k: dst.k, name: stops[dst.k].name, t: 0, limit: 60 + dst.d / 14, spad: 0 };
      toast(`Freight driver: bring the freight to a stop at ${job.name} · W power, S brake`);
    },
    cancel(veh) {
      if (ride && ride.kind === 'freight') ride.tr.manual = null;
      job = null;
      if (ride && veh) { const k = stationNear(veh.pos, 1e9); ride = null; const e = exits[k]; veh.reset(e.x, e.h + 1.0, e.z, e.heading); }
      ride = null;
    },
    // per frame: carriers move the car; prompts; returns true while the car is being carried
    update(dt, veh, mode, inp, fPressed) {
      prompt = ''; action = null;
      const ferry = world2.ferry;
      const cable = world2.cable;
      if (ride) {
        // the car sits on the carrier deck
        const g = ride.carrier.g; g.updateMatrixWorld();
        V.set(0, ride.carrier.deckY + 0.62, ride.kind === 'ferry' ? -12 : 0).applyMatrix4(g.matrixWorld);
        veh.pos.copy(V); g.getWorldQuaternion(Q); veh.q.copy(Q);
        veh.vel.set(0, 0, 0); veh.w.set(0, 0, 0);
        for (const w of veh.wheels) w.omega = 0;
        if (ride.kind === 'motorail') {
          const tr = ride.tr;
          if (tr.wait > 0.5) { const st = stopName(tr), e = exits.find((x) => x.name === st); prompt = `F · drive off at ${st}`; action = () => leave(veh, e); }
          else prompt = `Motorail · next stop ${stopName(tr)}`;
        } else if (ride.kind === 'ferry') {
          if (ferry.wait > 0.5 && ferry.at) { const q = ferry.quays[ferry.at]; prompt = `F · drive off at ${ferry.at}`; action = () => leave(veh, { ...q, name: ferry.at }); }
          else prompt = `Bayline Ferries · sailing to ${ferry.next}`;
        } else if (ride.kind === 'cablecar') {
          const here = cable.wait > 0.5 ? cable.stationOf(ride.carrier) : null;
          if (here) { prompt = `F · drive off at ${here}`; action = () => leave(veh, { ...cable.stations[here], name: here }); }
          else prompt = `Silverpine cable car · ${cable.dir > 0 === (ride.carrier === cable.cabins[0]) ? 'going up to the summit' : 'going down to the base'} · ${Math.round(cable.v * 3.6)} km/h`;
        } else if (ride.kind === 'freight') {
          const tr = ride.tr, m = tr.manual;
          if (m) { m.throttle = inp.throttle; m.brake = inp.brake; }
          if (job) {
            job.t += dt;
            if (m && m.emergency && !job.spadT) { job.spad++; job.spadT = 1; toast('Signal passed at danger · emergency brake! (−$150)'); }
            if (m && !m.emergency) job.spadT = 0;
            const p = railPos(stops[job.k].s), dS = ((stops[job.k].s - tr.s) % L + L) % L, d = dS > L / 2 ? dS - L : dS;
            job.dist = d;
            if (tr.v < 0.3 && Math.abs(d) < 25) {
              const pay = Math.max(100, 500 + 300 * (1 - Math.abs(d) / 25) + Math.max(0, job.limit - job.t) * 3 - job.spad * 150);
              econ && econ.earn(pay, `Freight delivered to ${job.name} (${Math.abs(d).toFixed(1)} m from the mark)`);
              tr.manual = null; const e = exits[job.k]; job = null; leave(veh, e);
              return false;
            }
            prompt = `Stop at ${job.name} · ${d > 0 ? Math.round(d) + ' m' : 'overshot ' + Math.round(-d) + ' m'}`;
          }
          if (tr.v < 0.3) { const k = stationNear(veh.pos, 220); if (k >= 0 && (!job || k !== job.k)) { prompt += (prompt ? ' · ' : '') + `F · leave the cab at ${stops[k].name}`; action = () => { tr.manual = null; job = null; leave(veh, exits[k]); }; } }
        }
        if (action && fPressed) action();
        return !!ride;
      }
      if (mode !== 'car') return false;
      const spd = Math.hypot(veh.vel.x, veh.vel.z);
      // Motorail
      if (stopping) {
        const c = stopping.carrier.g.position, dc = Math.hypot(c.x - veh.pos.x, c.z - veh.pos.z);
        if (stopping.wait > 1.5 && dc < 30 && spd < 4) { prompt = `F · load your car onto the Motorail at ${stopName(stopping)} ($${FARE.motorail})`; action = () => board('motorail', stopping.carrier, stopping); }
        else if (spd < 4) {
          const k = stationNear(veh.pos, 45);
          if (k >= 0) {
            const st = stops[k], d = ((st.s - stopping.s) % L + L) % L;
            prompt = `${st.name} · Motorail due in about ${Math.max(1, Math.round((d / 18 + 14 * stopping.stops.filter((si) => { const dd = ((stops[si].s - stopping.s) % L + L) % L; return dd < d; }).length) / 60))} min · wait by the track`;
          }
        }
      }
      // ferry
      if (ferry && !action && spd < 4) {
        for (const name of Object.keys(ferry.quays)) {
          const q = ferry.quays[name]; if (Math.hypot(q.x - veh.pos.x, q.z - veh.pos.z) > 35) continue;
          if (ferry.wait > 1.5 && ferry.at === name) { prompt = `F · drive onto the ferry to ${ferry.next} ($${FARE.ferry})`; action = () => board('ferry', ferry, null); }
          else prompt = `Bayline Ferries · ${name} · the ferry is ${ferry.at ? `at ${ferry.at}` : 'at sea'}, back every few minutes`;
        }
      }
      // cable car
      if (cable && !action && spd < 4) {
        for (const name of Object.keys(cable.centres)) {
          const c = cable.centres[name]; if (Math.hypot(c.x - veh.pos.x, c.z - veh.pos.z) > 28) continue;
          const cab = cable.cabinAt(name);
          if (cab && cable.wait > 1.5) { prompt = `F · load your car into the cable car to the ${name.endsWith('summit') ? 'base' : 'summit'} ($${FARE.cablecar})`; action = () => board('cablecar', cab, null); }
          else prompt = `Silverpine cable car · next cabin in about ${Math.round(((cable.dir > 0 ? 1 - cable.u : cable.u) * cable.LEN) / 8 + 4)} s`;
        }
      }
      if (action && fPressed) { action(); return true; }
      return false;
    },
    // camera for the freight cab (camMode 2) or a chase view of the locomotive; returns false when not driving
    camera(camera, camMode, dt) {
      if (!ride || ride.kind !== 'freight') return false;
      const loco = ride.tr.cars[0].g; loco.updateMatrixWorld();
      if (camMode === 2) { V.set(-0.7, 3.0, 9.15).applyMatrix4(loco.matrixWorld); camera.position.copy(V); V.set(-0.7, 2.6, 40).applyMatrix4(loco.matrixWorld); }
      else { const far = camMode === 1; V.set(0, far ? 14 : 8, far ? -42 : -26).applyMatrix4(loco.matrixWorld); camera.position.lerp(V, Math.min(1, dt * 3)); if (camera.position.distanceTo(V) > 60) camera.position.copy(V); V.set(0, 2.5, 12).applyMatrix4(loco.matrixWorld); }
      camera.up.set(0, 1, 0); camera.lookAt(V);
      return true;
    },
    hud() {
      if (!ride || ride.kind !== 'freight') return null;
      const tr = ride.tr, m = tr.manual || {};
      return { speed: tr.v * 3.6, throttle: m.throttle || 0, brake: m.brake || 0, signal: m.signal || 'green', emergency: m.emergency, ahead: tr.ahead, job };
    },
  };
  return api;
}
