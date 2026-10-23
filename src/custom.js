// Car styling, fitted in the garages: a body kit (front lip, side skirts, diffuser, ducktail), a roll bar, a hardtop,
// ride height, wheel width, and decals (racing stripes, a door roundel with your number, the MX-5 Odyssey badge on the rear
// fenders). The decals are drawn by the paint shader in body space, so they follow the curves of the real body.
import * as THREE from 'three';
import { badgeCanvas } from './badge.js';

export const KIT_PRICES = { kit: 1800, rollbar: 600, hardtop: 1500 };
export const STRIPES = { off: null, white: 0xf2f2f2, black: 0x111111, red: 0xc8102e, gold: 0xd4a62a, blue: 0x1d3f7a };

export function createCustom({ car, settings, saveSettings }) {
  const c = settings.custom || (settings.custom = { owned: {}, kit: false, rollbar: false, hardtop: false, height: 0, width: 1, stripes: 'off', roundel: false, number: 1 + Math.floor(Math.random() * 98), logo: false });
  const body = car.body;
  const paint = car.mats.paintPlain;
  const black = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, metalness: 0.7, roughness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a232b, roughness: 0.08, metalness: 0.5 });
  const box = (w, h, d, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; return o; };
  // body kit
  const kit = new THREE.Group(); body.add(kit);
  kit.add(box(1.46, 0.03, 0.16, black, 0, 0.255, 1.8));
  for (const s of [-1, 1]) kit.add(box(0.06, 0.08, 1.45, black, s * 0.84, 0.3, -0.04));
  kit.add(box(1.16, 0.03, 0.22, black, 0, 0.27, -1.84));
  for (const x of [-0.42, -0.14, 0.14, 0.42]) kit.add(box(0.02, 0.07, 0.2, black, x, 0.3, -1.85));
  kit.add(box(1.16, 0.035, 0.16, paint, 0, 0.86, -1.9, -0.25));
  // roll bar behind the seats
  const roll = new THREE.Group(); body.add(roll);
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 10), steel); p.position.set(s * 0.42, 0.98, -0.62); roll.add(p); }
  { const top = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.84, 10).rotateZ(Math.PI / 2), steel); top.position.set(0, 1.23, -0.62); roll.add(top);
    const diag = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 8), steel); diag.position.set(0, 1.0, -0.62); diag.rotation.z = 0.95; roll.add(diag); }
  // hardtop
  const hard = new THREE.Group(); body.add(hard);
  hard.add(box(1.2, 0.05, 0.86, paint, 0, 1.15, -0.18));
  hard.add(box(1.16, 0.04, 0.5, glass, 0, 1.02, -0.78, -0.62));
  for (const s of [-1, 1]) { const side = box(0.03, 0.3, 0.75, glass, s * 0.6, 1.0, -0.22); side.rotation.z = -s * 0.12; hard.add(side); hard.add(box(0.04, 0.32, 0.08, paint, s * 0.6, 0.99, -0.62)); }
  // decals in the paint shader
  const numTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.userData.cv = cv; return t; })();
  const drawNum = () => { const g = numTex.userData.cv.getContext('2d'); g.clearRect(0, 0, 128, 128); g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 62, 0, 6.3); g.fill(); g.fillStyle = '#111'; g.font = '700 74px "Barlow Condensed", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(c.number), 64, 68); numTex.needsUpdate = true; };
  const logoTex = new THREE.CanvasTexture(badgeCanvas(256)); logoTex.colorSpace = THREE.SRGBColorSpace;
  const U = { uDirt: { value: c.dirt || 0 }, uStripes: { value: 0 }, uStripeCol: { value: new THREE.Color() }, uRoundel: { value: 0 }, uNumTex: { value: numTex }, uLogo: { value: 0 }, uLogoTex: { value: logoTex } };
  for (const m of car.paintMats) {
    const prev = m.onBeforeCompile, key = m.customProgramCacheKey;
    m.onBeforeCompile = (sh, r) => {
      prev && prev.call(m, sh, r);
      Object.assign(sh.uniforms, U);
      if (!sh.fragmentShader.includes('varying vec3 vLocal')) return;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uDirt; uniform float uStripes; uniform vec3 uStripeCol; uniform float uRoundel; uniform sampler2D uNumTex; uniform float uLogo; uniform sampler2D uLogoTex;')
        .replace('#include <emissivemap_fragment>', `{
  vec3 dn = normalize(vONormal), lp = vLocal;
  if (uStripes > 0.5 && dn.y > 0.3) { float ax = abs(lp.x); float b = smoothstep(0.06, 0.07, ax) * (1.0 - smoothstep(0.19, 0.2, ax)); diffuseColor.rgb = mix(diffuseColor.rgb, uStripeCol, b * (1.0 - vDark)); }
  if (abs(dn.x) > 0.55) {
    vec2 q = vec2(lp.z - 0.62, lp.y - 0.5);
    if (uRoundel > 0.5 && length(q) < 0.16) { vec2 uv = q / 0.32 + 0.5; if (dn.x > 0.0) uv.x = 1.0 - uv.x; vec4 t = texture2D(uNumTex, uv); diffuseColor.rgb = mix(diffuseColor.rgb, t.rgb, t.a * (1.0 - vDark)); }
    vec2 lq = vec2(lp.z + 1.28, lp.y - 0.55);
    if (uLogo > 0.5 && abs(lq.x) < 0.12 && abs(lq.y) < 0.12) { vec2 uv = vec2(lq.x / 0.24 + 0.5, lq.y / 0.24 + 0.5); if (dn.x > 0.0) uv.x = 1.0 - uv.x; vec4 t = texture2D(uLogoTex, uv); diffuseColor.rgb = mix(diffuseColor.rgb, t.rgb, t.a * (1.0 - vDark)); }
  }
  // mud and road grime: thickest along the sills and behind the wheels, splashed upward as it builds up
  if (uDirt > 0.01) {
    // value noise (smooth, two octaves) for splatter
    vec3 q = lp * vec3(14.0, 18.0, 11.0), qi = floor(q), qf = fract(q); qf = qf * qf * (3.0 - 2.0 * qf);
    #define H3(p) fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453)
    float n0 = mix(mix(mix(H3(qi), H3(qi + vec3(1,0,0)), qf.x), mix(H3(qi + vec3(0,1,0)), H3(qi + vec3(1,1,0)), qf.x), qf.y), mix(mix(H3(qi + vec3(0,0,1)), H3(qi + vec3(1,0,1)), qf.x), mix(H3(qi + vec3(0,1,1)), H3(qi + vec3(1,1,1)), qf.x), qf.y), qf.z);
    float n = n0 * 0.7 + H3(floor(q * 3.1)) * 0.3;
    float reach = 0.2 + uDirt * 0.55;                        // how far up the sides it has crept (body y ~0.2 .. 1.1)
    float low = 1.0 - smoothstep(0.18, 0.18 + reach * 0.6, lp.y);
    float up = max(0.0, dn.y);                               // bonnet, boot and roof stay cleaner: just a dusting
    float m = clamp((low * (0.35 + 0.9 * n) * 1.5 * (1.0 - 0.7 * up) + up * uDirt * 0.25 * n) * uDirt, 0.0, 0.85);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.26, 0.19), m);
    roughnessFactor = mix(roughnessFactor, 1.0, m);
  }
}
#include <emissivemap_fragment>`);
    };
    m.customProgramCacheKey = () => (key ? key.call(m) : '') + '-decals';
    m.needsUpdate = true;
  }

  const api = {
    get state() { return c; },
    // dirt 0..1 (saved): builds up off-road and in the rain, washes off at a car wash
    get dirt() { return c.dirt || 0; },
    setDirt(v) { c.dirt = Math.max(0, Math.min(1, v)); U.uDirt.value = c.dirt; },
    apply() {
      kit.visible = !!c.kit; roll.visible = !!c.rollbar; hard.visible = !!c.hardtop;
      if (c.hardtop) car.state.topUp = false;
      U.uStripes.value = STRIPES[c.stripes] != null ? 1 : 0; if (STRIPES[c.stripes] != null) U.uStripeCol.value.set(STRIPES[c.stripes]);
      U.uRoundel.value = c.roundel ? 1 : 0; U.uLogo.value = c.logo ? 1 : 0; drawNum();
      for (const w of car.wheels) if (w.spin) w.spin.scale.x = [0.85, 1, 1.22][c.width];
    },
    // ride height: the body sits lower or higher on its springs (applied after the car's own pose each frame)
    get rideOffset() { return [-0.035, 0, 0.03][c.height + 1]; },
    set(key, value) { c[key] = value; saveSettings(); api.apply(); },
    buy(key, econ) { if (c.owned[key]) { c[key] = !c[key]; saveSettings(); api.apply(); return true; } if (!econ.spend(KIT_PRICES[key])) return false; c.owned[key] = true; c[key] = true; saveSettings(); api.apply(); return true; },
  };
  api.apply();
  return api;
}
