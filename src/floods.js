// Flooding: the low dips of the coast road (and anywhere else a main road runs within ~3 m of sea level) fill with
// muddy water in heavy rain and storms, then drain slowly once it stops. Driving in slows the car hard, throws up
// spray, and deep water gets into the engine. Warning signs come out at each end while a dip is flooded.
import * as THREE from 'three';
import { roads, groundHeight } from './world.js';

export function createFloods({ scene, toast }) {
  const zones = [];
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x6a5536, roughness: 0.55, metalness: 0, envMapIntensity: 0.08, transparent: true, vertexColors: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  const signMat = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.translate(64, 64); g.rotate(Math.PI / 4); g.fillStyle = '#ffb000'; g.fillRect(-42, -42, 84, 84); g.lineWidth = 6; g.strokeStyle = '#111'; g.strokeRect(-38, -38, 76, 76); g.rotate(-Math.PI / 4);
    g.fillStyle = '#111'; g.font = '700 22px "Barlow Condensed", Arial'; g.textAlign = 'center'; g.fillText('FLOOD', 0, 2);
    g.strokeStyle = '#111'; g.lineWidth = 3; g.beginPath(); for (let x = -22; x <= 22; x += 2) g.lineTo(x, 16 + Math.sin(x / 3) * 3); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
  })();
  const post = new THREE.MeshStandardMaterial({ color: 0x777777 });

  for (const r of roads) {
    if (r.type === 'rail' || r.type === 'track' || r.type === 'street' || r.type === 'gravel') continue;
    let run = null;
    for (let i = 0; i <= r.n; i++) {
      const low = i < r.n && !r.bridge[i] && r.h[i] < 3.25;
      if (low && !run) run = { i0: i, min: r.h[i] };
      if (low) run.min = Math.min(run.min, r.h[i]);
      if (!low && run) {
        const i0 = Math.max(0, run.i0 - 2), i1 = Math.min(r.n - 1, i - 1 + 2);
        // a flat water sheet following the road, a bit wider than it; it fades out where the ground rises above it
        const pos = [], idx = [], gnd = [], edge = [], W = r.hw + 4, A = 6;
        for (let k = i0; k <= i1; k++) {
          const [x, z] = r.pts[k], nx = -r.tz[k], nz = r.tx[k];
          for (let a = 0; a <= A; a++) { const o = (a / A * 2 - 1) * W, px = x + nx * o, pz = z + nz * o; pos.push(px, 0, pz); gnd.push(groundHeight(px, pz)); edge.push(Math.min(1, Math.min(a, A - a) / 2, Math.min(k - i0, i1 - k) / 3)); }
          if (k > i0) { const b = (k - i0) * (A + 1); for (let a = 0; a < A; a++) { const p0 = b - (A + 1) + a, p1 = b + a; idx.push(p0, p1, p0 + 1, p0 + 1, p1, p1 + 1); } }
        }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, q) => (q % 3 === 1 ? 1 : 0)), 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(gnd.length * 4).fill(1), 4));
        const mesh = new THREE.Mesh(geo, waterMat); mesh.visible = false; mesh.receiveShadow = true; scene.add(mesh);
        const signs = [];
        for (const [k, s] of [[Math.max(0, i0 - 8), 1], [Math.min(r.n - 1, i1 + 8), -1]]) {
          const [x, z] = r.pts[k], nx = -r.tz[k], nz = r.tx[k], sx = x + nx * (r.hw + 1.2) * s, sz = z + nz * (r.hw + 1.2) * s;
          const g = new THREE.Group(); g.position.set(sx, groundHeight(sx, sz), sz); g.rotation.y = Math.atan2(r.tx[k], r.tz[k]) + (s > 0 ? Math.PI : 0); g.visible = false; scene.add(g);
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), post); p.position.y = 1.1; g.add(p);
          const b = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), signMat); b.position.y = 2.2; g.add(b);
          signs.push(g);
        }
        const mid = r.pts[(i0 + i1) >> 1];
        zones.push({ road: r, i0, i1, min: run.min, mesh, gnd, edge, signs, level: 0, shown: -9, x: mid[0], z: mid[1], rad: Math.hypot(r.pts[i1][0] - r.pts[i0][0], r.pts[i1][1] - r.pts[i0][1]) / 2 + 20, warned: false });
        run = null;
      }
    }
  }

  let flood = 0, inWater = false;
  return {
    zones,
    get flood() { return flood; },
    set flood(v) { flood = v; },
    // flood level (0..1) rises in heavy rain, faster in a storm, and drains over a few minutes
    update(dt, weather, veh, mode, fx) {
      const tgt = weather.snowing ? 0 : Math.max(0, weather.rain - 0.5) * 2 * Math.min(1, weather.wet * 1.4) * (0.55 + 0.45 * weather.storm);
      flood += (tgt - flood) * Math.min(1, dt / (tgt > flood ? 50 : 150));
      const depthMax = 0.15 + 0.8 * flood;
      let depth = 0;
      for (const z of zones) {
        const on = flood > 0.04;
        z.mesh.visible = on; z.level = z.min + (on ? depthMax : -1);
        z.mesh.position.y = z.level;
        if (on && Math.abs(z.level - z.shown) > 0.01) {   // vertex alpha: deep water opaque, feathered at the edges
          z.shown = z.level; const c = z.mesh.geometry.attributes.color;
          for (let q = 0; q < z.gnd.length; q++) { const d = z.level - z.gnd[q]; c.setW(q, Math.max(0, Math.min(1, d / 0.3)) * 0.85 * z.edge[q]); }
          c.needsUpdate = true;
        }
        for (const s of z.signs) s.visible = flood > 0.15;
        if (!on || mode !== 'car') continue;
        if (Math.hypot(veh.pos.x - z.x, veh.pos.z - z.z) > z.rad) continue;
        const gh = groundHeight(veh.pos.x, veh.pos.z), d = z.level - gh;
        // inside the strip?
        let best = 1e9; for (let k = z.i0; k <= z.i1; k++) best = Math.min(best, Math.hypot(z.road.pts[k][0] - veh.pos.x, z.road.pts[k][1] - veh.pos.z));
        if (best < z.road.hw + 3 && d > depth) depth = d;
      }
      if (depth > 0.03) {
        const spd = Math.hypot(veh.vel.x, veh.vel.z);
        // water drag grows with depth and speed
        const k = Math.exp(-dt * depth * (0.35 + spd * 0.06));
        veh.vel.x *= k; veh.vel.z *= k;
        if (fx && spd > 2) { const n = Math.min(4, spd * dt * 3); for (let i = 0; i < n; i++) fx.dust(veh.pos.x + (Math.random() - 0.5) * 2, gh + depth + 0.2, veh.pos.z + (Math.random() - 0.5) * 3, 1, [0.62, 0.58, 0.5]); }
        if (depth > 0.5 && spd > 3) { veh.dmg.engine = Math.max(0.05, veh.dmg.engine - dt * 0.04 * depth * spd / 8); if (!inWater) toast(`Deep water · ${depth.toFixed(1)} m · the engine is taking in water!`); inWater = true; }
        else if (!inWater) { toast(`Flooded road · ${depth.toFixed(1)} m of water`); inWater = true; }
      } else inWater = false;
      return depth;
    },
  };
}
