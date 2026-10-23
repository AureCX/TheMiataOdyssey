// AI traffic that follows the road network, keeps lanes, brakes for curves, cars ahead and the player.
import * as THREE from 'three';
import { roads, groundHeight, continueAtEnd, turnOffs, ROAD_JOINS } from './world.js';
import { createTrafficCar } from './car.js';
import { mulberry32 } from './noise.js';

const COLORS = [0xf2f2f2, 0x1d1d1f, 0x2b4c7e, 0x7d8a93, 0x8c1c13, 0xc9b27c, 0x2f5d3a, 0x5a3e6b, 0xe0e0e0, 0x3b3b3b, 0x0f3d6b];

export function createTraffic(scene, count = 34) {
  const mainRoads = roads.filter((r) => r.type !== 'street' && r.type !== 'track' && r.type !== 'rail' && r.type !== 'gravel');  // town streets are too short for through traffic
  const rnd = mulberry32(2024);
  const cars = [];
  const colliders = [];
  // headlight beams: a soft additive pool on the road ahead of each car, shown after dark
  const beamTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 10, 2, 32, 40, 80); gr.addColorStop(0, 'rgba(255,240,205,0.9)'); gr.addColorStop(0.5, 'rgba(255,235,195,0.35)'); gr.addColorStop(1, 'rgba(255,230,190,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 128); return new THREE.CanvasTexture(c); })();
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8 });
  const beamGeo = new THREE.PlaneGeometry(5, 16).rotateX(-Math.PI / 2).translate(0, 0.12, 8);
  for (let i = 0; i < count; i++) {
    const kr = rnd(), kind = i < 3 ? 5 : kr < 0.1 ? 2 : kr < 0.22 ? 4 : kr < 0.4 ? 3 : kr < 0.7 ? 1 : 0;
    const mesh = createTrafficCar(COLORS[(rnd() * COLORS.length) | 0], kind);
    scene.add(mesh);
    const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.z = mesh.userData.L / 2; beam.renderOrder = 2; mesh.add(beam);
    const c = { mesh, kind, L: mesh.userData.L, W: mesh.userData.W, mass: [1150, 1350, 7000, 1900, 2200, 11000][kind], speed: 0, bump: 0, imp: { x: 0, z: 0 }, crash: null, col: [{ x: 0, z: 0, r: 0 }, { x: 0, z: 0, r: 0 }] };
    place(c, rnd, null);
    cars.push(c);
    colliders.push(...c.col);
  }

  function place(c, r, near) {
    let road, u;
    for (let tries = 0; tries < 40; tries++) {
      road = mainRoads[(r() * mainRoads.length) | 0];
      u = r() * (road.n - 2);
      if (!near) break;
      const p = road.pts[u | 0];
      const d = Math.hypot(p[0] - near.x, p[1] - near.z);
      if (d > 250 && d < 1000) break;
    }
    c.road = road; c.u = u; c.dir = r() < 0.5 ? 1 : -1;
    // highways: trucks and buses keep to the slow (outer) lane; cars cruise there and pull out to overtake
    c.home = road.type === 'highway' ? 5.6 : 1.9; c.lane = c.laneT = c.home; c.passT = 0; c.yieldT = 0;
    c.cruise = (road.type === 'highway' ? 25 + r() * 9 : 15 + r() * 6) * (c.kind === 2 || c.kind === 5 ? 0.8 : c.kind === 4 ? 0.92 : 1);
    c.speed = c.cruise * 0.8;
    c.crash = null; c.imp.x = c.imp.z = 0;
  }

  const fwd = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), tmpV = new THREE.Vector3();
  // the join at a road end (cached), and whether the main road is clear enough to pull out
  const joinCache = new Map();
  const joinAt = (road, end) => { const k = road.name + ':' + end + ':' + road.n; if (!joinCache.has(k)) joinCache.set(k, ROAD_JOINS.find((j) => j.branch === road && j.end === end && mainRoads.includes(j.through)) || null); return joinCache.get(k); };
  function gapClear(c, J, player) {
    for (const o of cars) {
      if (o === c || o.crash) continue;
      const p = o.mesh.position, dx = J.x - p.x, dz = J.z - p.z, d = Math.hypot(dx, dz);
      if (d < 9 && o.road !== c.road) return false;                                        // someone's in the junction
      if (o.road !== J.through || d > 55 || o.speed < 0.5) continue;
      const fx = o.road.tx[Math.max(0, Math.min(o.road.n - 1, o.u | 0))] * o.dir, fz = o.road.tz[Math.max(0, Math.min(o.road.n - 1, o.u | 0))] * o.dir;
      if (fx * dx + fz * dz > 0) return false;                                             // coming this way
    }
    if (player) { const dx = J.x - player.x, dz = J.z - player.z, d = Math.hypot(dx, dz); if (d < 45 && (!api.playerVel || api.playerVel.x * dx + api.playerVel.z * dz > 0 || d < 10)) return false; }
    return true;
  }
  // onto another road at a junction: its lanes and cruising speed; slow for the turn
  function switchRoad(c, nx) {
    c.road = nx.road; c.u = nx.u; c.dir = nx.dir;
    c.home = nx.road.type === 'highway' ? 5.6 : 1.9; c.laneT = c.home; c.passT = 0;
    c.cruise = (nx.road.type === 'highway' ? 25 + Math.random() * 9 : 15 + Math.random() * 6) * (c.kind === 2 || c.kind === 5 ? 0.8 : c.kind === 4 ? 0.92 : 1);
    c.speed = Math.min(c.speed, 9); c.turnT = 1.6;
  }

  function sample(road, u) {
    const n = road.n;
    let i = Math.floor(u), t = u - i;
    const i0 = road.closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i));
    const i1 = road.closed ? (i0 + 1) % n : Math.min(n - 1, i0 + 1);
    const a = road.pts[i0], b = road.pts[i1];
    return {
      x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, h: road.h[i0] + (road.h[i1] - road.h[i0]) * t,
      tx: road.tx[i0], tz: road.tz[i0], i0,
    };
  }

  const api = {
    signal: null,
    sideStop: null,     // (join) -> true while a signalled side road shows red, null where there are no lights
    playerVel: null,
    cars, colliders,
    extra: [],   // more things to stop for (positions): the parked MX-5 while you ride, the rival MX-5s
    yieldTo: [],   // [{ x, z, vx, vz }]: sirens and hazard lights (set by main each frame)
    update(dt, player, night) {
      beamMat.opacity = night ? 0.45 : 0;
      const obstacles = [player, ...api.extra];
      for (const o of cars) if (o.crash) obstacles.push(o.mesh.position);
      for (const c of cars) {
        // knocked by the player: switch from lane following to a sliding rigid body
        if (Math.abs(c.imp.x) + Math.abs(c.imp.z) > 1) {
          if (!c.crash) {
            fwd.set(0, 0, 1).applyQuaternion(c.mesh.quaternion);
            c.crash = { vx: fwd.x * c.speed, vz: fwd.z * c.speed, w: 0, t: 0, yaw: Math.atan2(fwd.x, fwd.z) };
          }
          const dv = Math.hypot(c.imp.x, c.imp.z) / c.mass;
          c.crash.vx += c.imp.x / c.mass; c.crash.vz += c.imp.z / c.mass;
          c.crash.w += (Math.random() - 0.5) * dv * 1.2;
          c.crash.t = 0;
          c.imp.x = c.imp.z = 0; c.speed = 0;
        }
        if (c.crash) {
          const k = c.crash;
          k.t += dt;
          const sp = Math.hypot(k.vx, k.vz), ns = Math.max(0, sp - 7.5 * dt);
          if (sp > 1e-4) { k.vx *= ns / sp; k.vz *= ns / sp; }
          k.w *= Math.exp(-2.5 * dt); k.yaw += k.w * dt;
          const p = c.mesh.position;
          p.x += k.vx * dt; p.z += k.vz * dt; p.y = groundHeight(p.x, p.z) + 0.03;
          c.mesh.quaternion.setFromEuler(e.set(0, k.yaw, 0));
          fwd.set(Math.sin(k.yaw), 0, Math.cos(k.yaw));
          const q4 = c.L / 4;
          c.col[0].x = p.x + fwd.x * q4; c.col[0].z = p.z + fwd.z * q4;
          c.col[1].x = p.x - fwd.x * q4; c.col[1].z = p.z - fwd.z * q4;
          const blink = Math.floor(k.t * 2) % 2;   // hazard lights
          c.mesh.userData.tail.emissiveIntensity = blink ? 2.5 : 0.2;
          const dxp = p.x - player.x, dzp = p.z - player.z;
          if (k.t > 25 && dxp * dxp + dzp * dzp > 120 * 120) place(c, Math.random, player);
          continue;
        }
        const road = c.road;
        // curvature ahead
        const look = sample(road, c.u + c.dir * 12);
        const here = sample(road, c.u);
        const turn = Math.abs(Math.atan2(here.tx * look.tz - here.tz * look.tx, here.tx * look.tx + here.tz * look.tz));
        let target = Math.min(c.cruise, 4 + 9 / Math.max(0.05, turn));
        // traffic ahead (same road, dir and lane); on the highway, pull out past slower vehicles when the fast lane is clear
        const hwy = road.type === 'highway';
        for (const o of cars) {
          if (o === c || o.crash || o.road !== road || o.dir !== c.dir || Math.abs(o.lane - c.lane) > 1.5) continue;
          let gap = (o.u - c.u) * c.dir * 3;
          if (road.closed && gap < 0) gap += road.length * (road.closed ? 1 : 0);
          if (gap > 0 && gap < 45) {
            if (hwy && c.laneT === c.home && c.kind !== 2 && c.kind !== 5 && o.speed < c.cruise - 3 && gap < 40) {
              const clear = !cars.some((q) => q !== c && !q.crash && q.road === road && q.dir === c.dir && Math.abs(q.lane - 1.9) < 1.5 && Math.abs((q.u - c.u) * 3) < 35);
              if (clear) { c.laneT = 1.9; c.passT = 6; continue; }
            }
            target = Math.min(target, Math.max(0, (gap - 9) * 0.6), o.speed + (gap - 12) * 0.3);
          }
        }
        // back to the slow lane once past (and the lane beside is clear)
        if (c.laneT !== c.home) { c.passT -= dt; if (c.passT <= 0 && !cars.some((q) => q !== c && !q.crash && q.road === road && q.dir === c.dir && Math.abs(q.lane - c.home) < 1.5 && Math.abs((q.u - c.u) * 3) < 20)) c.laneT = c.home; }
        // sirens and hazard lights coming up behind: slow down and pull over to the edge
        for (const y of api.yieldTo) {
          const dx = y.x - c.mesh.position.x, dz = y.z - c.mesh.position.z, d2 = dx * dx + dz * dz;
          if (d2 > 80 * 80) continue;
          const hx2 = here.tx * c.dir, hz2 = here.tz * c.dir, along = dx * hx2 + dz * hz2, closing = -(y.vx * hx2 + y.vz * hz2);
          if (along < -3 && closing < -2) c.yieldT = 3;
        }
        if (c.yieldT > 0) { c.yieldT -= dt; target = Math.min(target, 5); c.laneT = Math.min(road.hw - 1.2, (hwy ? 5.6 : 1.9) + 1.6); }
        else if (c.laneT > c.home + 0.1 && c.passT <= 0) c.laneT = c.home;
        c.lane += Math.max(-1.6 * dt, Math.min(1.6 * dt, c.laneT - c.lane));
        // the player
        const hx = here.tx * c.dir, hz = here.tz * c.dir;
        for (const ob of obstacles) {
          const dx = ob.x - c.mesh.position.x, dz = ob.z - c.mesh.position.z;
          const along = dx * hx + dz * hz, lat = Math.abs(dx * -hz + dz * hx);
          if (along > 0 && along < 40 && lat < 2.6 && Math.abs(ob.y - here.h) < 4) target = Math.min(target, Math.max(0, (along - 8) * 0.5));
        }
        // traffic lights: stop at the line on red (and on amber if there's room)
        if (api.signal) { const d = api.signal(road, c.u, c.dir); if (d < 70) target = Math.min(target, Math.max(0, (d - 1.5) * 0.45)); }
        // give way at the end of a side road: wait at the line for a gap in the main road's traffic (or for green)
        if (!road.closed) {
          const endIdx = c.dir > 0 ? road.n - 1 : 0, J = joinAt(road, endIdx);
          if (J) {
            const dEnd = Math.abs(endIdx - c.u) * 3, toLine = dEnd - (J.through.hw + 5);
            if (toLine > 25 || toLine < -1) c.committed = false;
            if (dEnd < 70 && !c.committed) {
              const lights = api.sideStop ? api.sideStop(J) : null;
              let wait = lights === true;
              if (lights === null) wait = !gapClear(c, J, player);
              if (wait) target = Math.min(target, Math.max(0, (toLine - 1) * 0.45));
              else if (toLine < 3) c.committed = true;   // pulling out: don't stop in the middle
            }
          }
        }
        if (c.bump > 0) { c.bump -= dt; target = 0; }
        const acc = target > c.speed ? 2.2 : -7;
        c.speed += Math.max(-Math.abs(acc) * dt * 1.4, Math.min(Math.abs(acc) * dt, target - c.speed));
        c.speed = Math.max(0, c.speed);
        const u0 = c.u;
        c.u += c.dir * c.speed * dt / 3;
        // junctions: now and then turn off onto a side road; at the end of a road, turn onto the road it joins
        // (a U-turn only at a true dead end)
        const okRoad = (q) => mainRoads.includes(q);
        if (c.turnCool <= 0) { const offs = turnOffs(road, u0, c.u, c.dir, okRoad); if (offs.length) { c.turnCool = 4; if (Math.random() < 0.35) { switchRoad(c, offs[(Math.random() * offs.length) | 0]); } } }
        c.turnCool = (c.turnCool || 0) - dt;
        if (c.road === road && !road.closed && (c.u <= 0.5 || c.u >= road.n - 1.5)) {
          const nx = continueAtEnd(road, c.u <= 0.5 ? 0 : road.n - 1, okRoad);
          if (nx) { switchRoad(c, nx); c.turnCool = 4; }
          else { c.dir *= -1; c.u = Math.max(0.6, Math.min(road.n - 1.6, c.u)); }
        }
        if (c.road.closed) c.u = ((c.u % c.road.n) + c.road.n) % c.road.n;
        // respawn far cars near the player
        const pdx = c.mesh.position.x - player.x, pdz = c.mesh.position.z - player.z;
        if (pdx * pdx + pdz * pdz > 1600 * 1600) place(c, Math.random, player);

        const s = sample(c.road, c.u);
        const rx = -s.tz * c.dir, rz = s.tx * c.dir;
        // just after changing roads, ease across to the new lane instead of jumping
        if (c.turnT > 0) { c.turnT -= dt; tmpV.set(s.x + rx * c.lane, s.h + 0.03, s.z + rz * c.lane); c.mesh.position.lerp(tmpV, 1 - Math.exp(-dt * 4.5)); }
        else c.mesh.position.set(s.x + rx * c.lane, s.h + 0.03, s.z + rz * c.lane);
        const ahead = sample(c.road, c.u + c.dir * 2);
        const pitch = -Math.atan2(ahead.h - s.h, 6);
        e.set(pitch, Math.atan2(s.tx * c.dir, s.tz * c.dir), 0);
        tmpQ.setFromEuler(e);
        c.mesh.quaternion.slerp(tmpQ, Math.min(1, dt * 8));
        fwd.set(0, 0, 1).applyQuaternion(c.mesh.quaternion);
        const q4 = c.L / 4;
        c.col[0].x = c.mesh.position.x + fwd.x * q4; c.col[0].z = c.mesh.position.z + fwd.z * q4;
        c.col[1].x = c.mesh.position.x - fwd.x * q4; c.col[1].z = c.mesh.position.z - fwd.z * q4;
        c.col[0].r = c.col[1].r = c.W / 2 + 0.15;
        c.col[0].owner = c.col[1].owner = c;
        c.mesh.userData.head.emissiveIntensity = night ? 3 : 0;
        c.mesh.userData.tail.emissiveIntensity = c.yieldT > 0 ? ((Math.floor(performance.now() / 400) % 2) ? 2.5 : 0.3) : (night ? 0.9 : 0.15) + (target < c.speed - 1 ? 2 : 0);
      }
    },
    // only colliders near the player (and at road level)
    near(player, out) {
      out.length = 0;
      for (const col of colliders) {
        const dx = col.x - player.x, dz = col.z - player.z;
        if (dx * dx + dz * dz < 900 && Math.abs(col.owner.mesh.position.y - player.y) < 3.5) out.push(col);
      }
      return out;
    },
  };
  return api;
}
