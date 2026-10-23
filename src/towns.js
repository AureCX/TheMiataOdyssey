// Towns: buildings along the street grids laid out in world.js (shops and apartment blocks in the centre, pitched-roof
// houses further out), pavements, street lights and a fuel station per town plus highway services. Window lights come on
// at night in the shader (world-space window grid, per-building seed), so thousands of windows cost nothing extra.
import * as THREE from 'three';
import { RBox } from './shapes.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TOWNS, roads, roadAt, terrainHeight, rawHeight, STATION_LOTS, GARAGE_LOTS, ROUNDABOUTS, JUNCTIONS, pavedAt, addRoof, roadDist } from './world.js';
import { addCollider } from './scenery.js';
import { mulberry32 } from './noise.js';

export const STATIONS = [];
export const GARAGES = [];    // { name, x, z (inside the workshop), ux, uz, h }   // { name, x, z, h, heading, pumps: [{x, z}] }

const WALLS = ['#d9cdb8', '#c9b79c', '#e8e2d6', '#b8a48a', '#d4c4a8', '#a9b2b8', '#c7c0b3', '#e3d3c0', '#bfa58c', '#9fa9a3'];
const DESERT_WALLS = ['#e2c49a', '#d8b583', '#ecd4b0', '#c99f6f', '#e8cfa7'];
const ROOFS = ['#8a3b2b', '#6e2f25', '#4c4f55', '#5a5e63', '#7a4433'];
const AWNINGS = ['#b5121b', '#1f5a3a', '#204a87', '#d98a1a', '#6b2d5c', '#2f6f74', '#e0dccf'];

function buildingMaterial(night) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = night;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBW; varying vec3 vBN; varying float vSeed; varying float vBase;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vec4 bwp = vec4(transformed, 1.0); vec3 bn = objectNormal; vec4 bb = vec4(0.0, 0.0, 0.0, 1.0);
#ifdef USE_INSTANCING
bwp = instanceMatrix * bwp; bn = mat3(instanceMatrix) * bn; vSeed = float(gl_InstanceID); bb = instanceMatrix * bb;
#else
vSeed = 0.0;
#endif
vBW = (modelMatrix * bwp).xyz; vBN = normalize(mat3(modelMatrix) * bn); vBase = (modelMatrix * bb).y + 1.0;   // floors count up from the building's own base (boxes are sunk 1 m)`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight; varying vec3 vBW; varying vec3 vBN; varying float vSeed; varying float vBase; float bWin; float bGlow;')
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float side = 1.0 - step(0.6, abs(vBN.y));
  vec3 t = normalize(vec3(-vBN.z, 0.0, vBN.x) + 1e-5);
  float u = dot(vBW, t) / 2.8, fl = (vBW.y - vBase - 0.4) / 3.2;
  vec2 cell = floor(vec2(u, fl)), f = fract(vec2(u, fl));
  // per-building and per-window randoms (small-number hashes: no sin() of big world coordinates, so no speckle)
  vec3 hp = fract(vec3(mod(cell, 97.0), mod(vSeed, 61.0)) * vec3(0.1031, 0.1030, 0.0973));
  hp += dot(hp, hp.yzx + 33.33);
  float r = fract((hp.x + hp.y) * hp.z);
  float bs = fract(mod(vSeed, 61.0) * 0.6180339);
  // window: glass inside a frame, a sill below; tall windows on some buildings
  float wx0 = 0.2 + 0.05 * step(0.5, bs), wy0 = 0.28 - 0.08 * step(0.7, bs);
  bWin = side * step(wx0, f.x) * step(f.x, 1.0 - wx0) * step(wy0, f.y) * step(f.y, 0.85);
  float frame = side * step(wx0 - 0.035, f.x) * step(f.x, 1.035 - wx0) * step(wy0 - 0.03, f.y) * step(f.y, 0.88) * (1.0 - bWin);
  float sill = side * step(wx0 - 0.06, f.x) * step(f.x, 1.06 - wx0) * step(wy0 - 0.075, f.y) * step(f.y, wy0 - 0.03);
  float mull = bWin * (1.0 - step(0.012, abs(f.x - 0.5))) ;
  bGlow = bWin * step(0.42, r) * uNight * (0.7 + 0.6 * fract(r * 17.0));
  // wall: plaster blotches or brick courses, a cornice at each floor
  vec2 bq = vec2(dot(vBW, t) * 4.0, vBW.y * 8.0); bq.x += step(1.0, mod(floor(bq.y), 2.0)) * 0.5;
  float brick = step(0.55, bs) * (1.0 - step(0.08, min(fract(bq.x), fract(bq.y)))) * (1.0 - smoothstep(0.15, 0.45, max(fwidth(bq.x), fwidth(bq.y))));   // fades out with distance
  vec3 wp = floor(vBW * 1.7); float blot = fract(sin(dot(mod(wp, 89.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  diffuseColor.rgb *= side * (0.93 + 0.08 * blot) * (1.0 - 0.22 * brick) + (1.0 - side);
  float cornice = side * (1.0 - step(0.035, f.y)) * step(1.0, vBW.y - vBase - 0.4);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.25 + 0.06, cornice);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.9, 0.86), max(frame, sill * 0.9));
  // glass: dark, with a faint sky reflection toward the top of each pane and the odd curtain
  vec3 glass = mix(vec3(0.05, 0.07, 0.09), vec3(0.32, 0.4, 0.48), smoothstep(0.35, 0.85, f.y) * 0.6);
  glass = mix(glass, vec3(0.55, 0.42, 0.3) * 0.6, step(0.8, r) * step(f.x, 0.5));
  diffuseColor.rgb = mix(diffuseColor.rgb, glass, bWin);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85), mull * 0.8);
  // flat roofs: tar and gravel
  float roofN = step(0.6, vBN.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * (0.38 + 0.12 * blot), roofN);
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.12, bWin);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.78, 0.48) * bGlow * 2.2;');
  };
  m.customProgramCacheKey = () => 'mx5buildings';
  return m;
}

// world-space surface patterns for instanced materials: roof tiles (courses with staggered joints) and paving slabs
function patterned(m, kind) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPW; varying vec3 vPN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vec4 pwp = vec4(transformed, 1.0); vec3 pn = objectNormal;
#ifdef USE_INSTANCING
pwp = instanceMatrix * pwp; pn = mat3(instanceMatrix) * pn;
#endif
vPW = (modelMatrix * pwp).xyz; vPN = normalize(mat3(modelMatrix) * pn);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPW; varying vec3 vPN;')
      .replace('#include <color_fragment>', kind === 'tiles' ? `#include <color_fragment>
{ vec3 n = normalize(vPN); vec3 dn = normalize(vec3(n.x, 0.0, n.z) + 1e-5); vec3 tg = vec3(-dn.z, 0.0, dn.x);
  float row = vPW.y / 0.24, col = dot(vPW, tg) / 0.32 + step(1.0, mod(floor(row), 2.0)) * 0.5;
  float joint = 1.0 - smoothstep(0.0, 0.12, fract(row)) * smoothstep(0.0, 0.06, fract(col)) * smoothstep(1.0, 0.94, fract(col));
  vec3 cid = mod(floor(vec3(col, row, 0.0)), 53.0); float rr = fract(sin(dot(cid, vec3(12.9898, 78.233, 1.0))) * 43758.5453);
  float slope = step(0.15, n.y) * (1.0 - smoothstep(0.2, 0.6, max(fwidth(row), fwidth(col))));
  diffuseColor.rgb *= mix(1.0, (0.86 + 0.18 * rr) * (1.0 - 0.45 * joint), slope); }` : `#include <color_fragment>
{ vec2 q = vPW.xz / 1.2; float j = 1.0 - smoothstep(0.0, 0.05, fract(q.x)) * smoothstep(0.0, 0.05, fract(q.y));
  vec2 cid = mod(floor(q), 53.0); float rr = fract(sin(dot(cid, vec2(12.9898, 78.233))) * 43758.5453);
  diffuseColor.rgb *= (0.92 + 0.12 * rr) * (1.0 - 0.3 * j * step(0.6, vPN.y) * (1.0 - smoothstep(0.15, 0.5, max(fwidth(q.x), fwidth(q.y))))); }`);
  };
  m.customProgramCacheKey = () => 'mx5pattern-' + kind;
  return m;
}

// unit prism for pitched roofs: ridge along x, 1 wide (z), 1 long (x), 1 high
function prismGeometry() {
  const g = new THREE.BufferGeometry();
  const v = [
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 1, 0,     // slope -z
    -0.5, 1, 0, 0.5, 1, 0, 0.5, 0, 0.5, -0.5, 0, 0.5,       // slope +z
    -0.5, 0, -0.5, -0.5, 1, 0, -0.5, 0, 0.5,                // gable -x
    0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 1, 0,                   // gable +x
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6, 8, 10, 9, 11, 13, 12]);
  g.computeVertexNormals();
  return g;
}

const garageSigns = [];
function garageSign(name) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 112;
  const g = c.getContext('2d');
  g.fillStyle = '#16181c'; g.fillRect(0, 0, 1024, 112);
  g.fillStyle = '#e5641c'; g.fillRect(0, 96, 1024, 16);
  g.fillStyle = '#fff'; g.font = 'bold 64px "Barlow Condensed", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(`${name.toUpperCase()}  ·  TUNING & REPAIRS`, 512, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function signTexture(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#b5121b'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#fff'; g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildTowns(scene) {
  const group = new THREE.Group(); scene.add(group);
  const night = { value: 0 };
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffd9a0, emissiveIntensity: 0 });
  const boxes = [], roofs = [], poles = [], lamps = [], slabs = [];
  const details = { parapet: [], ac: [], tank: [], mast: [], shop: [], awning: [] };
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

  // footprint check against roads, other lots and water; marks a coarse occupancy grid
  const occ = new Set(), key = (x, z) => `${Math.round(x / 3)},${Math.round(z / 3)}`;
  const corners = (cx, cz, ux, uz, w, d) => { const vx = -uz, vz = ux, out = []; for (const a of [-0.5, 0, 0.5]) for (const b of [-0.5, 0, 0.5]) out.push([cx + ux * w * a + vx * d * b, cz + uz * w * a + vz * d * b]); return out; };
  const free = (cx, cz, ux, uz, w, d, H) => {
    for (const [x, z] of corners(cx, cz, ux, uz, w + 2, d + 2)) {
      if (roadAt(x, z, 1.2) || occ.has(key(x, z))) return false;
      const pv = pavedAt(x, z); if (pv && pv.kind !== 'walk') return false;
      if (ROUNDABOUTS.some((rb) => Math.hypot(rb.x - x, rb.z - z) < rb.R + 6)) return false;
      if (Math.abs(terrainHeight(x, z) - H) > 1.6 || rawHeight(x, z) < 0.6) return false;
    }
    return true;
  };
  const mark = (cx, cz, ux, uz, w, d) => { const vx = -uz, vz = ux; for (let a = -0.5; a <= 0.5; a += 1.5 / w) for (let b = -0.5; b <= 0.5; b += 1.5 / d) occ.add(key(cx + ux * w * a + vx * d * b, cz + uz * w * a + vz * d * b)); };
  const collide = (cx, cz, ux, uz, w, d, top) => {
    // circles along the long side cover the rectangle well enough for the car's box test
    const long = Math.max(w, d), short = Math.min(w, d), along = w >= d ? [ux, uz] : [-uz, ux], n = Math.max(1, Math.round(long / short));
    for (let i = 0; i < n; i++) { const o = (i + 0.5) / n - 0.5; addCollider(cx + along[0] * o * (long - short * 0.6), cz + along[1] * o * (long - short * 0.6), short * 0.52, top); }
  };
  const col = new THREE.Color();
  const addBox = (list, cx, y, cz, ux, uz, w, h, d, color) => list.push({ cx, y, cz, yaw: Math.atan2(ux, uz) - Math.PI / 2, w, h, d, color });

  // ---- fuel stations: canopy over two pump islands, kiosk, price sign
  const stationParts = { canopy: [], pump: [], kiosk: [] };
  function station(name, cx, cz, ux, uz, H) {
    const vx = -uz, vz = ux;
    addBox(slabs, cx, H - 0.1, cz, ux, uz, 30, 0.14, 23, '#4a4c50');                  // forecourt (paved, flush with the road)
    stationParts.canopy.push({ cx, cz, ux, uz, H });
    const pumps = [];
    for (const a of [-5, 5]) for (const b of [-2.2, 2.2]) {
      const x = cx + ux * a + vx * (b - 1), z = cz + uz * a + vz * (b - 1);
      addBox(stationParts.pump, x, H, z, ux, uz, 0.9, 1.7, 0.6, '#d8d4cc'); pumps.push({ x, z });
    }
    const kx = cx + vx * 8.5, kz = cz + vz * 8.5;
    addBox(boxes, kx, H - 0.5, kz, ux, uz, 12, 4.5, 6, '#ece7dc'); collide(kx, kz, ux, uz, 12, 6, H + 4); addRoof(kx, kz, ux, uz, 12, 6, H + 4);
    const sx = cx + ux * 13 - vx * 9, sz = cz + uz * 13 - vz * 9;
    poles.push({ x: sx, y: H, z: sz, h: 7 }); stationParts.kiosk.push({ x: sx, y: H + 7, z: sz, yaw: Math.atan2(ux, uz) });
    mark(cx, cz, ux, uz, 30, 24);
    STATIONS.push({ name, x: cx - vx, z: cz - vz, h: H, heading: Math.atan2(ux, uz), pumps });
  }

  for (const t of TOWNS) {
    const rnd = mulberry32(t.name.length * 977 + Math.round(t.x));
    const desert = t.name === 'Mesa';
    // the through road's samples inside town, plus the streets
    const through = roads.find((r) => r.name === t.road);
    const lanes = [];
    { const pts = []; for (let i = 0; i < through.n; i++) if (Math.hypot(through.pts[i][0] - t.x, through.pts[i][1] - t.z) < t.r * 0.95) pts.push(i); if (pts.length > 2) lanes.push({ r: through, i0: pts[0], i1: pts[pts.length - 1] }); }
    for (const st of t.streets) lanes.push({ r: st, i0: 0, i1: st.n - 1 });
    for (const { r, i0, i1 } of lanes) {
      for (const side of [1, -1]) {
        let sAt = r.s[i0] + 4 + rnd() * 6;
        while (sAt < r.s[i1] - 6) {
          let i = i0; while (i < i1 && r.s[i + 1] < sAt) i++;
          const [px, pz] = r.pts[i], ux = r.tx[i], uz = r.tz[i], vx = -uz * side, vz = ux * side;
          const dc = Math.hypot(px - t.x, pz - t.z) / t.r;
          const core = t.size === 'city' ? Math.max(0, 1 - dc * 1.4) : t.size === 'town' ? Math.max(0, 0.6 - dc) : 0;
          const w = 9 + rnd() * 7 + core * 6, d = 9 + rnd() * 6 + core * 6;
          const set = r.hw + 3.5 + d / 2, cx = px + vx * set, cz = pz + vz * set;
          sAt += w + 1.5 + rnd() * 4;
          if (Math.hypot(cx - t.x, cz - t.z) > t.r * 0.95 || !free(cx, cz, ux, uz, w, d, t.h)) continue;
          mark(cx, cz, ux, uz, w, d);
          const floors = core > 0.15 ? 2 + Math.floor(rnd() * (2 + core * 9)) : t.size === 'village' ? 1 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 3);
          const h = floors * 3.2 + 0.6, y = terrainHeight(cx, cz) - 1;
          const wallC = (desert ? DESERT_WALLS : WALLS)[(rnd() * (desert ? DESERT_WALLS : WALLS).length) | 0];
          addBox(boxes, cx, y, cz, ux, uz, w, h + 1, d, wallC);
          const top = y + h + 1;
          if (floors <= 2 && core < 0.2 && !desert) {
            const rh = 2.2 + rnd() * 1.2;
            addBox(roofs, cx, top, cz, ux, uz, w + 0.6, rh, d + 0.6, ROOFS[(rnd() * ROOFS.length) | 0]);
            collide(cx, cz, ux, uz, w, d, top + rh * 0.6); addRoof(cx, cz, ux, uz, w, d, top + rh * 0.55);
          } else {
            collide(cx, cz, ux, uz, w, d, top); addRoof(cx, cz, ux, uz, w, d, top);
            // parapet, and plant on the roof of the taller ones
            for (const [a, b, lw, ld] of [[0, 0.5, w, 0.35], [0, -0.5, w, 0.35], [0.5, 0, 0.35, d], [-0.5, 0, 0.35, d]])
              addBox(details.parapet, cx + ux * a * (w - 0.35) + vx * b * (d - 0.35), top, cz + uz * a * (w - 0.35) + vz * b * (d - 0.35), ux, uz, lw, 0.8, ld, '#8d8a84');
            if (floors >= 3) for (let k = 0, n = 1 + Math.floor(rnd() * 3); k < n; k++) {
              const a = (rnd() - 0.5) * (w - 4), b = (rnd() - 0.5) * (d - 4);
              addBox(details.ac, cx + ux * a + vx * b, top, cz + uz * a + vz * b, ux, uz, 1.6, 1.0, 1.2, '#b9bcbe');
            }
            if (floors >= 6 && rnd() < 0.6) details.tank.push({ x: cx + ux * (w / 4), y: top, z: cz + uz * (w / 4) });
            if (floors >= 8 && rnd() < 0.7) details.mast.push({ x: cx - ux * (w / 4), y: top, z: cz - uz * (w / 4), h: 4 + rnd() * 5 });
          }
          // shop fronts with awnings along the street in the centres
          if (core > 0.12 || (t.size !== 'village' && dc < 0.45 && rnd() < 0.6)) {
            const fx = cx - vx * (d / 2 + 0.06), fz = cz - vz * (d / 2 + 0.06);
            addBox(details.shop, fx, y + 1.0, fz, ux, uz, w * 0.86, 3.0, 0.12, null);
            addBox(details.awning, fx - vx * 0.7, y + 1 + 3.25, fz - vz * 0.7, ux, uz, w * 0.86, 0.14, 1.4, AWNINGS[(rnd() * AWNINGS.length) | 0]);
          }
        }
        // street lights every ~32 m on this side
        for (let sl = r.s[i0] + 10; sl < r.s[i1] - 5; sl += 32) {
          let i = i0; while (i < i1 && r.s[i + 1] < sl) i++;
          const [px, pz] = r.pts[i], vx = -r.tz[i] * side, vz = r.tx[i] * side, o = r.hw + 1.6;
          const x = px + vx * o, z = pz + vz * o;
          if (roadAt(x, z, 0.3)) continue;
          poles.push({ x, y: r.h[i], z, h: 6.5 }); lamps.push({ x: x - vx * 1.1, y: r.h[i] + 6.3, z: z - vz * 1.1 });
          addCollider(x, z, 0.25);
        }
      }
    }
  }
  // fuel stations on the lots laid out with the world (paved forecourts touching the road)
  for (const L of STATION_LOTS) station(L.name, L.cx, L.cz, L.ux, L.uz, L.h);
  // garages: an open-fronted workshop at the back of the lot; drive in and stop to open the garage screen
  const garageWall = new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.85 });
  const garageRoof = new THREE.MeshStandardMaterial({ color: 0x3b3f45, roughness: 0.6, metalness: 0.4 });
  const garageLight = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 0.4 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 });
  const benchMat = new THREE.MeshStandardMaterial({ color: 0xb5121b, roughness: 0.5, metalness: 0.3 });
  for (const L of GARAGE_LOTS) {
    if (!L.pitBox) addBox(slabs, L.cx, L.h - 0.1, L.cz, L.ux, L.uz, 30, 0.14, 23, '#6d6c68');          // concrete forecourt and workshop floor
    const g = new THREE.Group(); g.position.set(L.cx, L.h, L.cz); g.rotation.y = Math.atan2(L.ux, L.uz) - Math.PI / 2; group.add(g);
    const part = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new RBox(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
    part(16.6, 6, 0.6, 0, 3, 10.9, garageWall);                                         // back wall
    for (const sx of [-8, 8]) part(0.6, 6, 11.2, sx, 3, 5.3, garageWall);               // side walls
    part(17.2, 0.45, 12.2, 0, 6.2, 5.3, garageRoof);
    part(16.6, 1.5, 0.5, 0, 5.25, -0.05, garageWall);                                   // header over the door
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.3), new THREE.MeshStandardMaterial({ map: garageSign(L.name), roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0 }));
    sign.position.set(0, 5.25, -0.32); sign.rotation.y = Math.PI; g.add(sign); garageSigns.push(sign.material);
    part(10, 0.12, 1.2, 0, 5.9, 5, garageLight);                                        // strip lights
    part(4, 1, 0.9, -5.5, 0.5, 9.9, benchMat);                                          // tool bench and tyre stack
    for (let k = 0; k < 4; k++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 16), tyreMat); t.position.set(6.2, 0.11 + k * 0.23, 9.6); g.add(t); }
    for (const sx of [-1.4, 1.4]) part(0.25, 2.2, 0.25, sx, 1.1, 8.6, garageRoof);      // lift posts
    // colliders along the walls (up to the roof) and a solid roof
    const vx = -L.uz, vz = L.ux, W = (u, v) => [L.cx + L.ux * u + vx * v, L.cz + L.uz * u + vz * v];
    for (let u = -7.5; u <= 7.5; u += 1.5) { const [x, z] = W(u, 10.9); addCollider(x, z, 0.75, L.h + 6.4); }
    for (const su of [-8, 8]) for (let v = 0.4; v <= 10.6; v += 1.5) { const [x, z] = W(su, v); addCollider(x, z, 0.75, L.h + 6.4); }
    { const [x, z] = W(0, 5.3); addRoof(x, z, L.ux, L.uz, 17.2, 12.2, L.h + 6.45); }
    const [ix, iz] = W(0, 5.5);
    GARAGES.push({ name: L.name, x: ix, z: iz, ux: L.ux, uz: L.uz, h: L.h });
    mark(L.cx, L.cz, L.ux, L.uz, 30, 24);
  }

  // pavements, cut back at every crossing
  for (const t of TOWNS) for (const w of t.walks) addBox(slabs, w.cx, w.h - 0.1, w.cz, w.ux, w.uz, w.hl * 2, 0.24, w.hw * 2, '#a6a39b');

  // ---- instancing
  const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const unitR = new RoundedBoxGeometry(1, 1, 1, 2, 0.025).translate(0, 0.5, 0);   // buildings: softened edges
  const inst = (geo, mat, list, place) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((b, i) => { place(b); im.setMatrixAt(i, M); if (b.color) im.setColorAt(i, col.set(b.color)); });
    im.castShadow = true; im.receiveShadow = true; group.add(im); return im;
  };
  const boxPlace = (b) => { q.setFromAxisAngle(up, b.yaw); M.compose(p.set(b.cx, b.y, b.cz), q, sc.set(b.w, b.h, b.d)); };
  inst(unitR, buildingMaterial(night), boxes, boxPlace);
  inst(prismGeometry(), patterned(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), 'tiles'), roofs, boxPlace);
  inst(unit, patterned(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), 'paving'), slabs, boxPlace);
  // building details
  inst(unit, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), details.parapet, boxPlace);
  inst(unit, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.5 }), details.ac, boxPlace);
  inst(unit, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 }), details.awning, boxPlace);
  const shopMat = new THREE.MeshStandardMaterial({ color: 0x1c2630, roughness: 0.1, metalness: 0.5, emissive: 0xffd6a0, emissiveIntensity: 0 });
  inst(unit, shopMat, details.shop, boxPlace);
  inst(new THREE.CylinderGeometry(1.1, 1.1, 2.2, 14).translate(0, 1.6, 0), new THREE.MeshStandardMaterial({ color: 0x8a6f52, roughness: 0.8 }), details.tank, (b) => M.compose(p.set(b.x, b.y, b.z), q.identity(), sc.set(1, 1, 1)));
  inst(new THREE.CylinderGeometry(0.06, 0.1, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x9ea2a6, metalness: 0.7, roughness: 0.4 }), details.mast, (b) => M.compose(p.set(b.x, b.y, b.z), q.identity(), sc.set(1, b.h, 1)));
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.6 });
  inst(new THREE.CylinderGeometry(0.09, 0.12, 1, 8).translate(0, 0.5, 0), poleMat, poles, (b) => M.compose(p.set(b.x, b.y, b.z), q.identity(), sc.set(1, b.h, 1)));
  inst(new THREE.BoxGeometry(0.5, 0.18, 0.9), lampMat, lamps, (b) => M.compose(p.set(b.x, b.y, b.z), q.identity(), sc.set(1, 1, 1)));
  // stations
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.6 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xb5121b, roughness: 0.5, emissive: 0xb5121b, emissiveIntensity: 0 });
  const canopyLight = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0 });
  for (const c of stationParts.canopy) {
    const g = new THREE.Group(); g.position.set(c.cx, c.H, c.cz); g.rotation.y = Math.atan2(c.ux, c.uz) - Math.PI / 2; group.add(g);
    const top = new THREE.Mesh(new RBox(16, 0.7, 10), canopyMat); top.position.set(0, 5.4, -1); top.castShadow = true; g.add(top);
    const band = new THREE.Mesh(new RBox(16.1, 0.35, 10.1), stripeMat); band.position.set(0, 5.4, -1); g.add(band);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(15, 9).rotateX(Math.PI / 2), canopyLight); under.position.set(0, 5.04, -1); g.add(under);
    for (const a of [-5, 5]) {
      const pil = new THREE.Mesh(new RBox(0.5, 5.2, 0.5), canopyMat); pil.position.set(a, 2.6, -1); g.add(pil);
      const isl = new THREE.Mesh(new RBox(1.4, 0.25, 6.4), canopyMat); isl.position.set(a, 0.12, -1); g.add(isl);
      addCollider(c.cx + c.ux * a - c.uz * -1, c.cz + c.uz * a + c.ux * -1, 0.6);
    }
  }
  inst(unit, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), stationParts.pump, boxPlace);
  const signMat = new THREE.MeshStandardMaterial({ map: signTexture('FUEL'), emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0, roughness: 0.4 });
  for (const s of stationParts.kiosk) { const m = new THREE.Mesh(new RBox(2.4, 1.2, 0.25), signMat); m.position.set(s.x, s.y, s.z); m.rotation.y = s.yaw; group.add(m); }

  // junctions: a plain asphalt patch over each crossing, so the markings of two streets don't fight
  const patchMat = new THREE.MeshStandardMaterial({ color: 0x45474b, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  patchMat.userData.road = true;
  // each patch is a small grid kept only where it lies on both roads, following their heights
  {
    const P = [], I = [], out = {};
    for (const j of JUNCTIONS) {
      const S = Math.max(j.a, j.b) * 1.6 + 2, n = Math.ceil(S * 2 / 0.6), vx = -j.uz, vz = j.ux, base = P.length / 3, idx = new Int32Array((n + 1) * (n + 1)).fill(-1);
      for (let a = 0; a <= n; a++) for (let b = 0; b <= n; b++) {
        const u = -S + 2 * S * a / n, v = -S + 2 * S * b / n, x = j.x + j.ux * u + vx * v, z = j.z + j.uz * u + vz * v;
        if (roadDist(j.r1, x, z, out) > j.r1.hw + 0.05) continue;
        const h = out.h;
        if (roadDist(j.r2, x, z) > j.r2.hw + 0.05) continue;
        idx[a * (n + 1) + b] = P.length / 3; P.push(x, h + 0.036, z);
      }
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        const q = [idx[a * (n + 1) + b], idx[(a + 1) * (n + 1) + b], idx[(a + 1) * (n + 1) + b + 1], idx[a * (n + 1) + b + 1]];
        if (q[0] >= 0 && q[1] >= 0 && q[2] >= 0) I.push(q[0], q[2], q[1]);
        if (q[0] >= 0 && q[2] >= 0 && q[3] >= 0) I.push(q[0], q[3], q[2]);
      }
      void base;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setIndex(I); geo.computeVertexNormals();
    // keep the faces up whatever the winding came out as
    const nr = geo.attributes.normal; for (let i = 0; i < nr.count; i++) if (nr.getY(i) < 0) nr.setXYZ(i, 0, 1, 0);
    const pm = new THREE.Mesh(geo, patchMat); pm.receiveShadow = true; patchMat.side = THREE.DoubleSide; group.add(pm);
  }
  // roundabouts: asphalt disc with edge lines, kerbed grass island, a fountain (city) or a tree in the middle
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  const kerbMat = new THREE.MeshStandardMaterial({ color: 0xbdbab2, roughness: 0.85 });
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x4f7a34, roughness: 0.95 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.7 });
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x3f7fa6, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.85 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3d6b2a, roughness: 0.9, flatShading: true });
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 0.9 });
  const flowerMat = new THREE.MeshStandardMaterial({ color: 0xd8405a, roughness: 0.8 });
  const fountains = [];
  for (const rb of ROUNDABOUTS) {
    const g = new THREE.Group(); g.position.set(rb.x, rb.h, rb.z); group.add(g);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(rb.R + 3.8, 48).rotateX(-Math.PI / 2), patchMat); disc.position.y = 0.04; disc.receiveShadow = true; g.add(disc);
    for (const [r0, r1] of [[rb.R + 3.15, rb.R + 3.35], [rb.island + 0.35, rb.island + 0.5]]) { const l = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 56).rotateX(-Math.PI / 2), lineMat); l.position.y = 0.05; g.add(l); }
    const kerb = new THREE.Mesh(new THREE.CylinderGeometry(rb.island, rb.island + 0.1, 0.3, 40), kerbMat); kerb.position.y = 0.13; kerb.receiveShadow = true; g.add(kerb);
    const lawn = new THREE.Mesh(new THREE.CircleGeometry(rb.island - 0.35, 40).rotateX(-Math.PI / 2), grassMat); lawn.position.y = 0.29; lawn.receiveShadow = true; g.add(lawn);
    if (rb.city) {
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.7, 32), stoneMat); basin.position.y = 0.6; basin.castShadow = true; g.add(basin);
      const water = new THREE.Mesh(new THREE.CircleGeometry(2.9, 32).rotateX(-Math.PI / 2), waterMat); water.position.y = 0.92; g.add(water);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.2, 12), stoneMat); col.position.y = 1.9; g.add(col);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.4, 0.4, 20), stoneMat); bowl.position.y = 3.0; g.add(bowl);
      const spray = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false }));
      spray.position.y = 3.7; spray.rotation.x = Math.PI; g.add(spray); fountains.push(spray);
      addCollider(rb.x, rb.z, 3.4, rb.h + 1.2);
    } else {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 8), barkMat); trunk.position.y = 1.8; trunk.castShadow = true; g.add(trunk);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 1), leafMat); crown.position.y = 4.8; crown.castShadow = true; g.add(crown);
      for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), k % 2 ? flowerMat : leafMat); f.position.set(Math.cos(a) * (rb.island - 1.4), 0.5, Math.sin(a) * (rb.island - 1.4)); g.add(f); }
      addCollider(rb.x, rb.z, 0.5, rb.h + 8);
    }
  }

  return {
    group,
    update(dt) { for (const f of fountains) { f.rotation.y += dt * 2; f.scale.y = 1 + 0.08 * Math.sin(performance.now() / 120); } },
    // n: 0 day .. 1 night
    setNight(n) {
      night.value = n; lampMat.emissiveIntensity = n * 8; canopyLight.emissiveIntensity = n * 2.5; signMat.emissiveIntensity = 0;
      stripeMat.emissiveIntensity = n * 0.6; shopMat.emissiveIntensity = n * 0.9;
      for (const m of garageSigns) m.emissiveIntensity = n * 0.8;
    },
    lamps,
    counts: { buildings: boxes.length, lights: lamps.length, stations: STATIONS.length },
  };
}
