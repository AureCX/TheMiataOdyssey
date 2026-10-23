// Seasons: spring blossom, summer (drier grass and the Fairfield summer festival), autumn colours and winter snow.
// The look is done in the shaders: terrain, roads and trees share a few uniforms and recolour themselves (green
// grass turns gold in autumn and white under snow; broadleaf trees blossom, turn orange, then go bare and snowy).
// Winter also turns rain into snow and leaves the mountain pass icy, which the physics reads as lost grip.
import * as THREE from 'three';
import { RBox } from './shapes.js';
import { terrainHeight, groundHeight, FESTIVAL } from './world.js';

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_U = { uSnow: { value: 0 }, uAutumn: { value: 0 }, uSummer: { value: 0 }, uSpring: { value: 0 } };

const NOISE = /* glsl */`
uniform float uSnow; uniform float uAutumn; uniform float uSummer; uniform float uSpring;
varying vec3 vSeasW; varying vec3 vSeasN; varying vec3 vSeasO;
float sH(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float sN(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(sH(i),sH(i+vec2(1,0)),f.x), mix(sH(i+vec2(0,1)),sH(i+vec2(1,1)),f.x), f.y); }
`;

const FRAG = {
  // grass and fields: gold in autumn, drier in summer, snow on the flat in winter (less low down and on sand)
  terrain: /* glsl */`
{ float up = normalize(vSeasN).y, h = vSeasW.y;
  vec3 c = diffuseColor.rgb;
  float green = clamp((c.g - max(c.r, c.b)) * 16.0, 0.0, 1.0);
  float sandy = clamp((c.r - c.g * 1.12) * 10.0, 0.0, 1.0);
  c = mix(c, c * vec3(1.7, 0.9, 0.35), green * uAutumn * (0.6 + 0.4 * sN(vSeasW.xz * 0.02)));
  c = mix(c, c * vec3(1.18, 1.02, 0.7), green * uSummer * 0.7);
  c = mix(c, c * vec3(0.95, 1.08, 0.9), green * uSpring * 0.5);
  float n = sN(vSeasW.xz * 0.11) * 0.6 + sN(vSeasW.xz * 0.9) * 0.4;
  float snow = uSnow * smoothstep(0.6, 0.85, up) * clamp(0.35 + h / 110.0, 0.0, 1.0) * smoothstep(1.5, 4.0, h) * (1.0 - 0.7 * sandy);
  snow = smoothstep(0.12, 0.4, snow * (0.6 + 0.6 * n));
  c = mix(c, vec3(0.82, 0.85, 0.9), snow);
  diffuseColor.rgb = c;
  roughnessFactor = mix(roughnessFactor, 0.55, snow);
}`,
  // roads: ploughed, but patchy snow and frost creep in higher up
  road: /* glsl */`
{ float h = vSeasW.y;
  float n = sN(vSeasW.xz * 0.35) * 0.7 + sN(vSeasW.xz * 2.1) * 0.3;
  float snow = uSnow * smoothstep(60.0, 220.0, h) * smoothstep(0.45, 0.75, n);
  float frost = uSnow * 0.18;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.83, 0.88), max(snow * 0.85, frost));
  roughnessFactor = mix(roughnessFactor, 0.3, snow);
}`,
  // trees: blossom, autumn colours, bare and snowy branches; uFoliage = 1 for the broadleaf material
  veg: /* glsl */`
{ vec3 c = diffuseColor.rgb;
  float leafy = clamp((c.g - max(c.r, c.b)) * 6.0, 0.0, 1.0);
  float up = normalize(vSeasN).y;
  float r = sH(vSeasO.xz * 0.37);
  if (uFoliage > 0.5) {
    vec3 au = mix(vec3(0.62, 0.12, 0.02), vec3(0.85, 0.48, 0.04), r);
    if (r > 0.82) au = vec3(0.7, 0.62, 0.08);
    c = mix(c, au * (0.6 + 0.6 * leafy), leafy * uAutumn);
    float bl = step(0.62, r) * uSpring * smoothstep(0.45, 0.6, sN(vSeasW.xz * 2.3 + vSeasW.y * 1.7));
    c = mix(c, vec3(0.95, 0.62, 0.72), leafy * bl);
    // winter: most leaves gone (holes in the canopy), the rest brown
    if (uSnow > 0.5 && leafy > 0.5 && sN(vSeasW.xz * 3.1 + vSeasW.y * 2.3) < 0.62) discard;
    c = mix(c, vec3(0.2, 0.15, 0.1), leafy * uSnow);
  }
  float snow = uSnow * smoothstep(0.15, 0.6, up) * (0.6 + 0.4 * sN(vSeasW.xz * 2.0 + vSeasW.y));
  c = mix(c, vec3(0.85, 0.88, 0.92), snow * 0.9);
  diffuseColor.rgb = c;
}`,
};

// add the seasonal recolouring to a material, on top of whatever shader patching it already has
export function applySeason(material, kind, foliage = 0) {
  const prev = material.onBeforeCompile, prevKey = material.customProgramCacheKey;
  const fol = { value: foliage };
  material.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(material, sh, r);
    Object.assign(sh.uniforms, SEASON_U, { uFoliage: fol });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeasW; varying vec3 vSeasN; varying vec3 vSeasO;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{ mat4 sm = modelMatrix;
  #ifdef USE_INSTANCING
  sm = modelMatrix * instanceMatrix;
  #endif
  vSeasW = (sm * vec4(transformed, 1.0)).xyz; vSeasO = (sm * vec4(0.0, 0.0, 0.0, 1.0)).xyz; vSeasN = normalize(mat3(sm) * objectNormal); }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFoliage;\n' + NOISE)
      .replace('#include <emissivemap_fragment>', FRAG[kind] + '\n#include <emissivemap_fragment>');
  };
  material.customProgramCacheKey = () => (prevKey ? prevKey.call(material) : '') + '-season-' + kind + foliage;
  material.needsUpdate = true;
}

// the season from the real calendar (northern hemisphere)
const fromDate = () => SEASONS[[3, 3, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3][new Date().getMonth()]];

export function createSeasons({ scene, settings, saveSettings, toast }) {
  let mode = settings.season || 'auto';
  const cur = () => (mode === 'auto' ? fromDate() : mode);
  const target = { uSnow: 0, uAutumn: 0, uSummer: 0, uSpring: 0 };
  const setTarget = (s) => { for (const k in target) target[k] = 0; target[{ spring: 'uSpring', summer: 'uSummer', autumn: 'uAutumn', winter: 'uSnow' }[s]] = 1; };
  setTarget(cur());
  for (const k in target) SEASON_U[k].value = target[k];
  const festival = buildFestival(scene);
  festival.group.visible = cur() === 'summer';

  return {
    get mode() { return mode; },
    get season() { return cur(); },
    get winter() { return SEASON_U.uSnow.value; },
    festival,
    snap() { for (const k in target) SEASON_U[k].value = target[k]; festival.group.visible = target.uSummer > 0.5; },
    set(m) { mode = m; settings.season = m; saveSettings(); setTarget(cur()); toast && toast(`Season: ${cur()[0].toUpperCase() + cur().slice(1)}`); },
    // ice: winter grip loss, worst high on the mountain pass, a little black ice anywhere on cold nights
    iceAt(x, z, y, day) {
      const w = SEASON_U.uSnow.value; if (w < 0.01) return 0;
      return w * Math.min(0.6, 0.55 * Math.min(1, Math.max(0, (y - 70) / 160)) + (day < 0.3 ? 0.12 : 0.04));
    },
    update(dt, cam, day) {
      const k = Math.min(1, dt / 3);
      for (const key in target) SEASON_U[key].value += (target[key] - SEASON_U[key].value) * k;
      festival.group.visible = SEASON_U.uSummer.value > 0.5;
      if (festival.group.visible) festival.update(dt, cam, day);
    },
  };
}

// ---------------------------------------------------------------- Fairfield summer festival
// in the field north of Fairfield: a big wheel, stalls, a stage, bunting, food trucks, and fireworks after dark
export { FESTIVAL };

function buildFestival(scene) {
  const g = new THREE.Group(); scene.add(g);
  const F = FESTIVAL, gh = (x, z) => terrainHeight(x, z);
  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });
  const white = M(0xf2efe8), steel = M(0x9aa1a8, { metalness: 0.6, roughness: 0.4 }), wood = M(0x7a5a3a);
  const bulbs = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd27a, emissiveIntensity: 0 });
  const colors = [0xc8102e, 0xffb000, 0x1d6fd1, 0x2fbf5a, 0xe5641c, 0x8e44ad];

  // the big wheel
  const wheel = new THREE.Group(), wx = F.x + 14, wz = F.z - 14, wy = gh(wx, wz);
  const R = 14;
  for (const s of [-1, 1]) {
    for (const a of [-0.32, 0.32]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, R + 3, 8), steel); leg.position.set(Math.sin(a) * (R + 3) / 2, (R + 3) / 2, s * 1.6); leg.rotation.z = a; g.add(leg); leg.position.x += wx; leg.position.y += wy; leg.position.z += wz; }
  }
  wheel.position.set(wx, wy + R + 2.5, wz); g.add(wheel);
  for (const s of [-1.3, 1.3]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.18, 6, 48), steel); rim.position.z = s; wheel.add(rim); }
  const cars = [];
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    const sp = new THREE.Mesh(new RBox(0.12, R, 0.12), steel); sp.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0); sp.rotation.z = a - Math.PI / 2; wheel.add(sp);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4), bulbs); b.position.set(Math.cos(a) * R, Math.sin(a) * R, 1.45); wheel.add(b);
    const cab = new THREE.Group(); const body = new THREE.Mesh(new RBox(1.6, 1.3, 1.6), M(colors[i % colors.length])); body.position.y = -1.1; cab.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.6, 4), white); roof.position.y = -0.2; roof.rotation.y = Math.PI / 4; cab.add(roof);
    cab.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); wheel.add(cab); cars.push(cab);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 3.2, 12), steel); hub.rotation.x = Math.PI / 2; wheel.add(hub);

  // stalls in a horseshoe, striped canvas roofs
  const stripe = (c) => { const cv = document.createElement('canvas'); cv.width = 64; cv.height = 8; const x = cv.getContext('2d'); for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#f6f2e8' : c; x.fillRect(i * 8, 0, 8, 8); } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const awnings = ['#c8102e', '#1d6fd1', '#2f9f4a', '#e5641c'].map((c) => new THREE.MeshStandardMaterial({ map: stripe(c), roughness: 0.8, side: THREE.DoubleSide }));
  const stallPts = [];
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.15 + i / 8 * 1.2) + Math.PI * 0.35, rr = F.r - 6;
    const x = F.x + Math.cos(a) * rr, z = F.z + Math.sin(a) * rr, y = gh(x, z);
    const s = new THREE.Group(); s.position.set(x, y, z); s.rotation.y = Math.atan2(F.x - x, F.z - z); g.add(s);
    const counter = new THREE.Mesh(new RBox(3.2, 1.1, 1), wood); counter.position.set(0, 0.55, 0.6); s.add(counter);
    const back = new THREE.Mesh(new RBox(3.2, 2.4, 0.15), white); back.position.set(0, 1.2, -1); s.add(back);
    for (const px of [-1.55, 1.55]) for (const pz of [-1, 1.1]) { const p = new THREE.Mesh(new RBox(0.1, 2.6, 0.1), wood); p.position.set(px, 1.3, pz); s.add(p); }
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.6), awnings[i % 4]); roof.rotation.x = -Math.PI / 2 + 0.25; roof.position.set(0, 2.75, 0.05); s.add(roof);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), bulbs); lamp.position.set(0, 2.4, 0.9); s.add(lamp);
    stallPts.push([x, z]);
  }
  // stage with a truss and lights
  { const sx = F.x - 16, sz = F.z - 16, y = gh(sx, sz), s = new THREE.Group(); s.position.set(sx, y, sz); s.rotation.y = Math.atan2(F.x - sx, F.z - sz); g.add(s);
    const deck = new THREE.Mesh(new RBox(12, 1.2, 7), M(0x222222)); deck.position.y = 0.6; s.add(deck);
    for (const px of [-5.8, 5.8]) for (const pz of [-3.3, 3.3]) { const t = new THREE.Mesh(new RBox(0.35, 7, 0.35), steel); t.position.set(px, 3.5, pz); s.add(t); }
    for (const pz of [-3.3, 3.3]) { const t = new THREE.Mesh(new RBox(12, 0.35, 0.35), steel); t.position.set(0, 7, pz); s.add(t); }
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 5.5), new THREE.MeshStandardMaterial({ color: 0x14213d, emissive: 0x1d3f7a, emissiveIntensity: 0.3 })); backdrop.position.set(0, 4, -3.2); s.add(backdrop);
    for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: colors[i], emissiveIntensity: 0 })); l.position.set(-5 + i * 2, 6.6, 3.3); l.rotation.x = 0.6; s.add(l); l.userData.stage = true; }
    for (const px of [-7.5, 7.5]) { const sp = new THREE.Mesh(new RBox(1.4, 2.6, 1.2), M(0x111111)); sp.position.set(px, 1.3, 2.5); s.add(sp); }
  }
  // food trucks
  for (const [dx, dz, c] of [[18, 16, 0xffb000], [8, 24, 0x3fa9ff]]) {
    const x = F.x + dx, z = F.z + dz, y = gh(x, z), t = new THREE.Group(); t.position.set(x, y, z); t.rotation.y = Math.atan2(F.x - x, F.z - z) + Math.PI / 2; g.add(t);
    const box = new THREE.Mesh(new RBox(5.5, 2.6, 2.2), M(c)); box.position.y = 1.75; t.add(box);
    const cab = new THREE.Mesh(new RBox(1.6, 1.8, 2.1), M(c)); cab.position.set(3.4, 1.35, 0); t.add(cab);
    const hatch = new THREE.Mesh(new THREE.PlaneGeometry(3, 1), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffc070, emissiveIntensity: 0.3 })); hatch.position.set(-0.3, 2, 1.11); t.add(hatch);
    for (const wx2 of [-1.8, 3.2]) for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), M(0x111111)); w.rotation.x = Math.PI / 2; w.position.set(wx2, 0.42, s * 1.05); t.add(w); }
  }
  // picnic tables
  for (let i = 0; i < 8; i++) { const a = i * 2.3, rr = 8 + (i % 3) * 4, x = F.x + Math.cos(a) * rr, z = F.z + 6 + Math.sin(a) * rr, y = gh(x, z);
    const t = new THREE.Mesh(new RBox(2, 0.08, 0.8), wood); t.position.set(x, y + 0.75, z); t.rotation.y = a; g.add(t);
    for (const s of [-0.65, 0.65]) { const b = new THREE.Mesh(new RBox(2, 0.06, 0.3), wood); b.position.set(x + Math.sin(a) * s, y + 0.45, z + Math.cos(a) * s); b.rotation.y = a; g.add(b); } }
  // bunting: strings of flags from the wheel to the stalls
  const flagGeo = new THREE.BufferGeometry(); const fp = [], fc = [];
  const col = new THREE.Color();
  const hang = (ax, ay, az, bx, by, bz) => {
    const n = Math.max(6, Math.round(Math.hypot(bx - ax, bz - az) / 0.8));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 0.6) / n, sag = (t) => -2.2 * 4 * t * (1 - t);
      const p0 = [ax + (bx - ax) * t0, ay + (by - ay) * t0 + sag(t0), az + (bz - az) * t0], p1 = [ax + (bx - ax) * t1, ay + (by - ay) * t1 + sag(t1), az + (bz - az) * t1];
      const pm = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - 0.45, (p0[2] + p1[2]) / 2];
      fp.push(...p0, ...p1, ...pm, ...p1, ...p0, ...pm);
      col.setHex(colors[k % colors.length]); for (let q = 0; q < 6; q++) fc.push(col.r, col.g, col.b);
    }
  };
  const top = [wx, wy + 6, wz];
  for (let i = 0; i < stallPts.length; i += 2) { const [x, z] = stallPts[i]; hang(...top, x, gh(x, z) + 2.9, z); }
  hang(stallPts[0][0], gh(...stallPts[0]) + 2.9, stallPts[0][1], stallPts[8][0], gh(...stallPts[8]) + 2.9, stallPts[8][1]);
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); flagGeo.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3)); flagGeo.computeVertexNormals();
  g.add(new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 })));
  // entrance arch by the road side
  { const ex = F.x, ez = F.z + F.r - 2, y = gh(ex, ez), a = new THREE.Group(); a.position.set(ex, y, ez); g.add(a);
    for (const s of [-4, 4]) { const p = new THREE.Mesh(new RBox(0.5, 5, 0.5), M(0xc8102e)); p.position.set(s, 2.5, 0); a.add(p); }
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96; const x = cv.getContext('2d'); x.fillStyle = '#ffb000'; x.fillRect(0, 0, 512, 96); x.fillStyle = '#1a1a1a'; x.font = '700 54px "Barlow Condensed", Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('FAIRFIELD SUMMER FEST', 256, 50);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    for (const r of [0, Math.PI]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 1.6), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0 })); b.position.set(0, 5, r ? -0.05 : 0.05); b.rotation.y = r; a.add(b); b.userData.sign = true; }
  }

  // fireworks: a pool of points, rockets that climb then burst into coloured stars
  const NP = 1500;
  const pos = new Float32Array(NP * 3), pcol = new Float32Array(NP * 3), vel = new Float32Array(NP * 3), life = new Float32Array(NP);
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('color', new THREE.BufferAttribute(pcol, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 1.4, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  pts.frustumCulled = false; g.add(pts);
  let next = 0, nextShell = 2;
  const rockets = [];
  const emit = (x, y, z, vx, vy, vz, c, l) => { const i = next; next = (next + 1) % NP; pos.set([x, y, z], i * 3); vel.set([vx, vy, vz], i * 3); pcol.set([c.r, c.g, c.b], i * 3); life[i] = l; };
  const fwCol = [0xff3040, 0xffd040, 0x40a0ff, 0x60ff80, 0xff70ff, 0xffffff];

  let spin = 0;
  return {
    group: g,
    update(dt, cam, day) {
      spin += dt * 0.06; wheel.rotation.z = spin;
      for (const c of cars) c.rotation.z = -spin;
      const night = day < 0.35;
      bulbs.emissiveIntensity = night ? 2.2 : 0.2;
      g.traverse((o) => { if (o.userData.stage) o.material.emissiveIntensity = night ? 1.5 + Math.sin(performance.now() / 300 + o.position.x) : 0; if (o.userData.sign) o.material.emissiveIntensity = night ? 0.5 : 0; });
      // fireworks after dark, when someone is around to see them
      const near = Math.hypot(cam.x - FESTIVAL.x, cam.z - FESTIVAL.z) < 1500;
      if (night && near) {
        nextShell -= dt;
        if (nextShell <= 0) { nextShell = 0.8 + Math.random() * 2.2; rockets.push({ x: FESTIVAL.x + (Math.random() - 0.5) * 40, y: groundHeight(FESTIVAL.x, FESTIVAL.z) + 2, z: FESTIVAL.z - 30 + (Math.random() - 0.5) * 30, vy: 34 + Math.random() * 10, t: 1.6 + Math.random() * 0.8 }); }
      }
      for (let k = rockets.length - 1; k >= 0; k--) {
        const r = rockets[k]; r.t -= dt; r.y += r.vy * dt; r.vy -= 9.8 * dt;
        col.setRGB(1, 0.8, 0.5); emit(r.x, r.y, r.z, 0, -2, 0, col, 0.4);
        if (r.t <= 0) {
          rockets.splice(k, 1); col.setHex(fwCol[(Math.random() * fwCol.length) | 0]);
          const n = 110, sp = 14 + Math.random() * 8;
          for (let i = 0; i < n; i++) { const u = Math.random() * 2 - 1, a = Math.random() * 6.283, s = Math.sqrt(1 - u * u); emit(r.x, r.y, r.z, Math.cos(a) * s * sp, u * sp, Math.sin(a) * s * sp, col, 1.6 + Math.random() * 0.8); }
        }
      }
      for (let i = 0; i < NP; i++) {
        if (life[i] <= 0) { if (pos[i * 3 + 1] > -1e4) pos[i * 3 + 1] = -1e5; continue; }
        life[i] -= dt; const k = i * 3;
        vel[k + 1] -= 4 * dt; vel[k] *= 1 - dt * 0.9; vel[k + 1] *= 1 - dt * 0.9; vel[k + 2] *= 1 - dt * 0.9;
        pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
        const f = Math.min(1, life[i]); pcol[k] *= 0.5 + 0.5 * f; pcol[k + 1] *= 0.5 + 0.5 * f; pcol[k + 2] *= 0.5 + 0.5 * f;
      }
      pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true;
    },
  };
}
