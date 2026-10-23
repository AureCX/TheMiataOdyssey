// Crash effects: sparks, smoke/steam, and rigid debris (shards and detached car parts).
import * as THREE from 'three';
import { groundHeight } from './world.js';

function softDot() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function pointPool(n, additive, tex) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 4), size = new Float32Array(n);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, scale: { value: 600 } },
    vertexShader: `attribute vec4 color; attribute float size; varying vec4 vC; uniform float scale;
      void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying vec4 vC;
      void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a * t.a); if (gl_FragColor.a < 0.01) discard; }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  const items = [];
  for (let i = 0; i < n; i++) items.push({ life: 0, max: 1, x: 0, y: -9999, z: 0, vx: 0, vy: 0, vz: 0, s0: 0, s1: 0, r: 1, g: 1, b: 1, a: 1, drag: 0, grav: 0, rise: 0 });
  let next = 0;
  return {
    pts,
    spawn(o) { const p = items[next]; next = (next + 1) % n; Object.assign(p, o); p.life = p.max; },
    update(dt) {
      for (let i = 0; i < n; i++) {
        const p = items[i];
        if (p.life <= 0) { size[i] = 0; continue; }
        p.life -= dt;
        const t = 1 - p.life / p.max;
        p.vy += (p.rise - p.grav) * dt;
        const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; p.vz *= d;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.grav > 0) { const gh = groundHeight(p.x, p.z); if (p.y < gh) { p.y = gh; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; } }
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        col[i * 4] = p.r; col[i * 4 + 1] = p.g; col[i * 4 + 2] = p.b; col[i * 4 + 3] = p.a * (1 - t) * Math.min(1, t * 8 + 0.2);
        size[i] = p.s0 + (p.s1 - p.s0) * t;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.attributes.size.needsUpdate = true;
    },
  };
}

export function createEffects(scene) {
  const tex = softDot();
  const sparks = pointPool(400, true, tex);
  const smoke = pointPool(1400, false, tex);
  scene.add(sparks.pts, smoke.pts);
  const debris = [];
  const shardGeo = new THREE.BoxGeometry(0.06, 0.012, 0.045);
  const v = new THREE.Vector3();

  return {
    objects: [sparks.pts, smoke.pts],
    sparks(x, y, z, vx, vz, n = 12, hot = 1) {
      for (let i = 0; i < n; i++) {
        sparks.spawn({ x, y, z, vx: vx * 0.6 + (Math.random() - 0.5) * 5, vy: Math.random() * 3.5, vz: vz * 0.6 + (Math.random() - 0.5) * 5,
          max: 0.25 + Math.random() * 0.35, s0: 0.07, s1: 0.01, r: 1, g: 0.55 + 0.35 * hot * Math.random(), b: 0.2, a: 1, drag: 1.5, grav: 9.8, rise: 0 });
      }
    },
    smoke(x, y, z, density, dark, vx = 0, vz = 0) {
      const c = dark ? 0.12 + Math.random() * 0.08 : 0.75 + Math.random() * 0.15;
      smoke.spawn({ x: x + (Math.random() - 0.5) * 0.3, y, z: z + (Math.random() - 0.5) * 0.3, vx: vx * 0.3 + (Math.random() - 0.5) * 0.6, vy: 0.6 + Math.random() * 0.8, vz: vz * 0.3 + (Math.random() - 0.5) * 0.6,
        max: 1.8 + Math.random() * 1.6, s0: 0.4, s1: 2.6 + density * 1.5, r: c, g: c, b: c * 1.02, a: 0.25 + 0.3 * density, drag: 0.8, grav: 0, rise: 0.6 });
    },
    dust(x, y, z, n, color = [0.62, 0.56, 0.46]) {
      for (let i = 0; i < n; i++) smoke.spawn({ x, y, z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 1.2, vz: (Math.random() - 0.5) * 3,
        max: 1.2 + Math.random(), s0: 0.5, s1: 2.5, r: color[0], g: color[1], b: color[2], a: 0.35, drag: 1.5, grav: 0, rise: 0.2 });
    },
    // shards of glass / plastic / paint
    shards(x, y, z, vx, vy, vz, n, material) {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(shardGeo, material);
        m.position.set(x, y, z); m.scale.setScalar(0.6 + Math.random() * 1.4);
        scene.add(m);
        debris.push({ obj: m, vel: new THREE.Vector3(vx * 0.5 + (Math.random() - 0.5) * 4, vy + Math.random() * 3, vz * 0.5 + (Math.random() - 0.5) * 4),
          spin: new THREE.Vector3(Math.random() * 20, Math.random() * 20, Math.random() * 20), life: 12, r: 0.01 });
      }
    },
    // a car part leaves the car: clone its world transform, fling it
    detach(obj, vel, spinScale = 6, r = 0.1) {
      obj.updateWorldMatrix(true, true);
      const c = obj.clone(true);
      obj.matrixWorld.decompose(c.position, c.quaternion, c.scale);
      scene.add(c);
      // re-centre the clone on its own bounds so it tumbles about its middle
      c.updateMatrixWorld(true);
      const centre = new THREE.Box3().setFromObject(c).getCenter(new THREE.Vector3());
      const off = c.worldToLocal(centre.clone());
      for (const ch of c.children) ch.position.sub(off);
      c.position.copy(centre);
      debris.push({ obj: c, vel: vel.clone(), spin: new THREE.Vector3((Math.random() - 0.5) * spinScale, (Math.random() - 0.5) * spinScale, (Math.random() - 0.5) * spinScale), life: 40, r });
      return c;
    },
    update(dt) {
      sparks.update(dt); smoke.update(dt);
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i];
        d.life -= dt;
        d.vel.y -= 9.81 * dt;
        d.obj.position.addScaledVector(d.vel, dt);
        const q = d.obj.quaternion;
        v.copy(d.spin).multiplyScalar(dt);
        q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(v.x, v.y, v.z)));
        const gh = groundHeight(d.obj.position.x, d.obj.position.z) + d.r;
        if (d.obj.position.y < gh) {
          d.obj.position.y = gh;
          if (d.vel.y < 0) d.vel.y *= -0.25;
          d.vel.x *= 0.7; d.vel.z *= 0.7; d.spin.multiplyScalar(0.6);
        }
        if (d.life <= 0) { scene.remove(d.obj); debris.splice(i, 1); }
      }
    },
    clear() { for (const d of debris) scene.remove(d.obj); debris.length = 0; },
  };
}
