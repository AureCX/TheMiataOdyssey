// Pilou International Airport: runway with markings, lights (edge, threshold, approach with a running "rabbit", PAPI
// that reads the player's glideslope), taxiways, apron, terminal with jet bridges and the Pilou logo, control tower,
// hangars, windsock, an entrance sign on the access road, parked airliners, and the AI traffic: two Pilou Air
// airliners flying the circuit (hold, line up, take off, circuit, land, taxi back) and two light aircraft sightseeing.
import * as THREE from 'three';
import { RBox } from './shapes.js';
import { AIRPORT, terrainHeight, groundHeight } from './world.js';
import { addCollider } from './scenery.js';
import { airlinerCircuit, scenicLoop } from './airpath.js';

const BLUE = 0x1f4fb4, ORANGE = 0xf26a21;

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const FONT = (px, w = 700) => `${w} ${px}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;

// flat rectangles (axis-aligned in x/z) gathered into one geometry
function quads() {
  const pos = [], idx = [];
  return {
    add(x0, z0, x1, z1, y) {
      const b = pos.length / 3;
      pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    },
    geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; },
  };
}

// ------------------------------------------------------------------ aircraft models
function airlinerModel(logo) {
  const g = new THREE.Group();
  // fuselage: a lathed profile, tail (-z) to nose (+z), painted from a canvas (u around, v along)
  const prof = [[0.25, -18.5], [0.9, -16.5], [1.6, -13.5], [1.95, -10], [2, -7], [2, 12], [1.92, 14], [1.7, 15.6], [1.35, 16.8], [0.85, 17.8], [0.3, 18.4], [0, 18.55]];
  const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 32).rotateX(Math.PI / 2);
  const L0 = -18.5, L1 = 18.55, along = (z) => (z - L0) / (L1 - L0);
  { const pa = lathe.attributes.position, uv = lathe.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, along(pa.getZ(i))); }
  const paint = (ctx, W, H, night) => {
    ctx.fillStyle = night ? '#000' : '#f4f5f7'; ctx.fillRect(0, 0, W, H);
    const y = (z) => H * (1 - along(z));                 // canvas row for a fuselage station (nose at top)
    if (!night) {
      // blue belly and an orange-to-yellow cheatline sweeping up at the tail (the logo's colours)
      ctx.fillStyle = '#1f4fb4'; ctx.fillRect(0, 0, W * 0.17, H); ctx.fillRect(W * 0.83, 0, W * 0.17, H);
      const gr = ctx.createLinearGradient(0, y(16), 0, y(-18));
      gr.addColorStop(0, '#f26a21'); gr.addColorStop(0.6, '#f7b733'); gr.addColorStop(1, '#8fd14f');
      ctx.fillStyle = gr; ctx.fillRect(W * 0.17, 0, W * 0.035, H); ctx.fillRect(W * 0.795, 0, W * 0.035, H);
    }
    // cabin windows on both sides, just above the widest line (u = 0.25 is +x / left, 0.75 is -x / right)
    ctx.fillStyle = night ? '#ffd9a0' : '#1a2430';
    for (let z = -9; z < 12.5; z += 0.55) for (const u of [0.305, 0.695]) ctx.fillRect(W * u - 3, y(z) - 4, 6, 8);
    // cockpit windows
    if (!night) { ctx.fillStyle = '#18222c'; ctx.beginPath(); ctx.moveTo(W * 0.36, y(15.6)); ctx.lineTo(W * 0.64, y(15.6)); ctx.lineTo(W * 0.6, y(16.5)); ctx.lineTo(W * 0.4, y(16.5)); ctx.fill(); }
    if (!night) {
      // titles along both sides, reading nose-first
      ctx.fillStyle = '#1f4fb4'; ctx.font = FONT(64);
      for (const [u, rot] of [[0.36, Math.PI / 2], [0.64, -Math.PI / 2]]) {
        ctx.save(); ctx.translate(W * u, y(2.5)); ctx.rotate(rot); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('PILOU AIR', 0, 0); ctx.restore();
      }
    }
  };
  const skin = canvasTex(1024, 2048, (c, W, H) => paint(c, W, H, false));
  const glowT = canvasTex(1024, 2048, (c, W, H) => paint(c, W, H, true));
  const body = new THREE.MeshStandardMaterial({ map: skin, emissiveMap: glowT, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.35, metalness: 0.15 });
  g.add(new THREE.Mesh(lathe, body));
  const white = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.4, metalness: 0.2 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.45, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.6 });
  const blue = new THREE.MeshStandardMaterial({ color: BLUE, roughness: 0.4, metalness: 0.15 });
  // a swept surface from a planform (x span, z chord) given as root LE/TE and tip LE/TE
  const surface = (rootX, tipX, rLE, rTE, tLE, tTE, th) => {
    const sh = new THREE.Shape([new THREE.Vector2(rootX, rLE), new THREE.Vector2(tipX, tLE), new THREE.Vector2(tipX, tTE), new THREE.Vector2(rootX, rTE)]);
    return new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false }).rotateX(Math.PI / 2);
  };
  for (const s of [1, -1]) {
    const wing = new THREE.Mesh(surface(1.5, 17, 4, -2.6, -3.4, -5.2, 0.38), white);
    wing.material = white; wing.scale.x = s; wing.position.set(0, -0.9, 0); wing.rotation.z = s * 0.09; g.add(wing);
    const tipFence = new THREE.Mesh(new RBox(0.12, 1.6, 1.4), blue); tipFence.position.set(s * 17.05, -0.2 + 1.45, -4.3); g.add(tipFence);
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.85, 4.4, 20).rotateX(Math.PI / 2), grey); eng.position.set(s * 5.9, -2.15, 3.2); g.add(eng);
    const intake = new THREE.Mesh(new THREE.CircleGeometry(0.95, 20), dark); intake.position.set(s * 5.9, -2.15, 5.41); g.add(intake);
    const pylon = new THREE.Mesh(new RBox(0.35, 1.0, 3.2), white); pylon.position.set(s * 5.9, -1.3, 2.4); g.add(pylon);
    const stab = new THREE.Mesh(surface(0.4, 6.4, -13.2, -17.2, -15.6, -17.6, 0.22), white); stab.scale.x = s; stab.position.y = 0.6; g.add(stab);
  }
  // fin: blue, with the logo on both sides
  const finShape = new THREE.Shape([new THREE.Vector2(-11.5, 0), new THREE.Vector2(-17.6, 8.6), new THREE.Vector2(-19.4, 8.6), new THREE.Vector2(-18.6, 0)]);
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.3, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(0.15, 1.2, 0), blue);
  g.add(fin);
  if (logo) {
    const lm = new THREE.MeshBasicMaterial({ map: logo, toneMapped: true });
    for (const s of [1, -1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.3), lm); p.position.set(s * 0.17, 5.4, -16.6); p.rotation.y = s * Math.PI / 2; g.add(p);
    }
  }
  // landing gear (hidden when retracted)
  const gear = new THREE.Group(); g.add(gear);
  const tyre = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 14).rotateZ(Math.PI / 2);
  for (const [x, z, n] of [[0, 13.5, 1], [3.2, -1.2, 2], [-3.2, -1.2, 2]]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 8), grey); strut.position.set(x, -1.75, z); gear.add(strut);
    for (let k = 0; k < n; k++) { const w = new THREE.Mesh(tyre, dark); w.position.set(x + (n > 1 ? (k - 0.5) * 0.6 : 0), -1.75, z + (n > 1 ? 0 : 0)); w.position.y = -1.75; gear.add(w); }
  }
  // navigation lights, strobes and beacons
  const lamp = (color, x, y, z, r = 0.16) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ color })); m.position.set(x, y, z); g.add(m); return m; };
  const nav = [lamp(0xff2020, 17.1, -0.3, -4.1), lamp(0x20ff40, -17.1, -0.3, -4.1), lamp(0xffffff, 0, 1.0, -18.7)];
  const strobes = [lamp(0xffffff, 17.1, -0.3, -4.6, 0.2), lamp(0xffffff, -17.1, -0.3, -4.6, 0.2)];
  const beacons = [lamp(0xff1a1a, 0, 2.05, -2, 0.2), lamp(0xff1a1a, 0, -2.05, 2, 0.2)];
  g.userData = { gear, nav, strobes, beacons, body };
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}

function lightPlaneModel(color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 });
  const trim = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x20262c, roughness: 0.3, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.25, 7.5, 12).rotateX(Math.PI / 2), paint); body.position.z = -0.6; g.add(body);
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.2, 12).rotateX(Math.PI / 2), trim); cowl.position.z = 3.6; g.add(cowl);
  const cabin = new THREE.Mesh(new RBox(1.1, 0.8, 2.2), dark); cabin.position.set(0, 0.55, 1.4); g.add(cabin);
  const wing = new THREE.Mesh(new RBox(11, 0.14, 1.5), paint); wing.position.set(0, 1.0, 1.2); g.add(wing);
  for (const s of [1, -1]) { const tip = new THREE.Mesh(new RBox(1.4, 0.16, 1.52), trim); tip.position.set(s * 4.9, 1.0, 1.2); g.add(tip); }
  const stab = new THREE.Mesh(new RBox(3.4, 0.1, 0.9), paint); stab.position.set(0, 0.15, -4.1); g.add(stab);
  const fin = new THREE.Mesh(new RBox(0.1, 1.5, 1.1), trim); fin.position.set(0, 0.85, -4.1); g.add(fin);
  const prop = new THREE.Mesh(new RBox(1.9, 0.12, 0.05), dark); prop.position.z = 4.25; g.add(prop);
  const nav = [];
  for (const [c, x] of [[0xff2020, 5.6], [0x20ff40, -5.6]]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: c })); m.position.set(x, 1.0, 1.2); g.add(m); nav.push(m); }
  g.userData = { prop, nav };
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// position/heading along a path at arc length s (cached index for speed)
function sampler(path) {
  const P = path.pts; let i = 0;
  return (s, out) => {
    s = ((s % path.L) + path.L) % path.L;
    if (P[i].s > s) i = 0;
    while (i < P.length - 2 && P[i + 1].s < s) i++;
    const a = P[i], b = P[i + 1], t = (s - a.s) / Math.max(1e-6, b.s - a.s);
    out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t; out.y = a.y + (b.y - a.y) * t; out.v = a.v + (b.v - a.v) * t;
    out.hdg = Math.atan2(b.x - a.x, b.z - a.z); out.slope = (b.y - a.y) / Math.max(1e-6, b.s - a.s);
    return out;
  };
}

export function createAirport(scene) {
  const AP = AIRPORT, H = AP.h, X = AP.x;
  const group = new THREE.Group(); scene.add(group);
  const logo = new THREE.TextureLoader().load('pilou.png'); logo.colorSpace = THREE.SRGBColorSpace; logo.anisotropy = 8;

  // ---------------------------------------------------------------- pavement
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x34363a, roughness: 0.88 }); asphalt.userData.road = true;
  const concrete = new THREE.MeshStandardMaterial({ color: 0x6f6e6a, roughness: 0.9 }); concrete.userData.road = true;
  const pv = { runway: quads(), taxiway: quads(), apron: quads() };
  for (const p of AP.paved) pv[p.kind].add(p.x0, p.z0, p.x1, p.z1, H + (p.kind === 'runway' ? 0.03 : 0.025));
  for (const [k, m] of [['runway', asphalt], ['taxiway', asphalt], ['apron', concrete]]) {
    const mesh = new THREE.Mesh(pv[k].geo(), m); mesh.receiveShadow = true; group.add(mesh);
  }
  // markings
  const mw = new THREE.MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
  const my = new THREE.MeshStandardMaterial({ color: 0xe6b422, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
  const W = quads(), Y = quads(), ym = H + 0.045;
  const hw = AP.rwyW / 2;
  W.add(X - hw + 0.6, AP.zN + 2, X - hw + 1.5, AP.zS - 2, ym); W.add(X + hw - 1.5, AP.zN + 2, X + hw - 0.6, AP.zS - 2, ym);   // edge lines
  for (let z = AP.zN + 75; z < AP.zS - 95; z += 50) W.add(X - 0.45, z, X + 0.45, z + 30, ym);                              // centreline
  for (const [end, dir] of [[AP.zS, -1], [AP.zN, 1]]) {
    for (let i = 0; i < 6; i++) for (const s of [1, -1]) { const x = X + s * (3 + i * 3.3); const z0 = end + dir * 6, z1 = end + dir * 36; W.add(x - 0.9, Math.min(z0, z1), x + 0.9, Math.max(z0, z1), ym); }  // piano keys
    for (const s of [1, -1]) { const z0 = end + dir * 300, z1 = end + dir * 345; W.add(X + s * 6, Math.min(z0, z1), X + s * 14, Math.max(z0, z1), ym); }  // aiming point
    for (const d of [150, 450]) for (const s of [1, -1]) for (const k of [0, 1]) { const z0 = end + dir * d, z1 = end + dir * (d + 22); const x = X + s * (7 + k * 3); W.add(x - 0.9, Math.min(z0, z1), x + 0.9, Math.max(z0, z1), ym); }
  }
  // taxiway centrelines and holding-position bars
  Y.add(AP.taxiX - 0.2, -336, AP.taxiX + 0.2, 392, ym);
  for (const z of [392, -336, 10]) Y.add(AP.taxiX, z - 0.2, X - hw - 2, z + 0.2, ym);
  for (const z of [392, -336, 10]) for (let k = 0; k < 4; k++) Y.add(X - hw - 14 - k * 1.1, z - 9, X - hw - 13.6 - k * 1.1, z + 9, ym);
  // apron: stand lead-in lines and stop bars
  for (const gz of AP.gates) { Y.add(-455, gz - 0.2, -384, gz + 0.2, ym); Y.add(-452, gz - 3, -451.5, gz + 3, ym); }
  group.add(new THREE.Mesh(W.geo(), mw), new THREE.Mesh(Y.geo(), my));
  // runway numbers: "36" read on the way north (south end), "18" on the way south (north end)
  const num = (txt) => canvasTex(256, 512, (c, w, h) => { c.fillStyle = '#f0f0ea'; c.font = FONT(300, 600); c.textAlign = 'center'; c.textBaseline = 'middle'; c.save(); c.scale(1, 1.6); c.fillText(txt, w / 2, h / 3.2); c.restore(); });
  const numMat = (t) => new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, depthWrite: false });
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 18).rotateX(-Math.PI / 2), numMat(num('36'))); m.position.set(X, ym + 0.005, AP.zS - 55); group.add(m); }
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 18).rotateX(-Math.PI / 2).rotateY(Math.PI), numMat(num('18'))); m.position.set(X, ym + 0.005, AP.zN + 55); group.add(m); }
  // the logo painted big on the apron, for arriving aircraft
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 24).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: logo, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3 })); m.position.set(-420, ym + 0.01, 250); group.add(m); }

  // ---------------------------------------------------------------- lights
  const lightGeo = new THREE.BoxGeometry(0.5, 0.4, 0.5);
  const lightSets = [];
  // halos: additive points that ignore the fog, so the lights read at night and through fog from far away
  const glowTex = canvasTex(64, 64, (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.75)'); g.addColorStop(0.45, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, false);
  const glows = [];
  // point halos with a minimum on-screen size, so a runway still shows as lines of lights from several km away
  const glowPoints = (color, pts, size, base = 1, minPx = 3) => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pts.length * 3).fill(1), 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: glowTex }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 }, uSize: { value: size }, uMin: { value: minPx }, uScale: { value: 400 } },
      vertexShader: `uniform float uSize, uMin, uScale; attribute vec3 color; varying vec3 vC; varying float vBoost;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          float px = uSize * uScale / max(1.0, -mv.z); gl_PointSize = clamp(px, uMin, 34.0); vBoost = clamp(px / uMin, 0.35, 1.0); vC = color; }`,
      fragmentShader: `uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity; varying vec3 vC; varying float vBoost;
        void main() { float a = texture2D(uMap, gl_PointCoord).a; gl_FragColor = vec4(uColor * vC * 2.2, a * uOpacity * (0.55 + 0.45 * vBoost)); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pm = new THREE.Points(geo, mat); pm.frustumCulled = false; pm.renderOrder = 5; group.add(pm); glows.push({ mat, base }); return pm;
  };
  const lightSet = (color, list, dayLevel = 0.25, size = 5) => {
    const mat = new THREE.MeshBasicMaterial({ color });
    const im = new THREE.InstancedMesh(lightGeo, mat, list.length);
    const m4 = new THREE.Matrix4(), pts = [];
    list.forEach(([x, z, y], i) => { const yy = (y ?? groundHeight(x, z)) + 0.2; im.setMatrixAt(i, m4.makeTranslation(x, yy, z)); pts.push([x, yy + 0.25, z]); });
    group.add(im); lightSets.push({ mat, base: new THREE.Color(color), dayLevel });
    glowPoints(color, pts, size, 1, color === 0x3a6bff ? 2 : 3.5);
    return im;
  };
  const edge = []; for (let z = AP.zN; z <= AP.zS; z += 50) for (const s of [1, -1]) edge.push([X + s * (hw + 1.5), z, H]);
  lightSet(0xfff4d8, edge, 0.25, 4);
  const thrG = [], thrR = []; for (let x = X - hw; x <= X + hw; x += 4) { thrG.push([x, AP.zS + 1.5, H]); thrR.push([x, AP.zN - 1.5, H]); }
  lightSet(0x30ff6a, thrG); lightSet(0xff3030, thrR);
  const taxi = []; for (let z = -330; z <= 380; z += 30) for (const s of [1, -1]) taxi.push([AP.taxiX + s * 10, z, H]);
  lightSet(0x3a6bff, taxi, 0.15, 3);
  const appr = [], rabbitZ = []; for (let k = 1; k <= 10; k++) { const z = AP.zS + k * 30; rabbitZ.push(z); for (let i = -2; i <= 2; i++) appr.push([X + i * 2.2, z]); }
  lightSet(0xfff0d0, appr, 0.25, 4);
  // poles under the approach lights
  { const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 6), new THREE.MeshStandardMaterial({ color: 0x777777 }), rabbitZ.length); const m4 = new THREE.Matrix4();
    rabbitZ.forEach((z, i) => { const gh = groundHeight(X, z); poles.setMatrixAt(i, m4.compose(new THREE.Vector3(X, gh + 0.1, z), new THREE.Quaternion(), new THREE.Vector3(1, 0.4, 1))); }); group.add(poles); }
  const rabbit = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })); group.add(rabbit);
  const rabbitGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true })); rabbitGlow.scale.setScalar(16); group.add(rabbitGlow);
  // PAPI: four lamp units left of the runway, abeam the aiming point; each shows white above its angle, red below
  const papi = [], PAPI_Z = AP.zS - 320, PAPI_ANG = [3.5, 3.17, 2.83, 2.5].map((d) => d * Math.PI / 180);
  for (let i = 0; i < 4; i++) {
    const box = new THREE.Mesh(new RBox(1.6, 0.9, 0.8), new THREE.MeshStandardMaterial({ color: 0x2a2a2a })); box.position.set(X - hw - 12 - i * 9, H + 0.6, PAPI_Z); group.add(box);
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.6), new THREE.MeshBasicMaterial({ color: 0xff2020 })); lens.position.set(box.position.x, H + 0.65, PAPI_Z + 0.41); group.add(lens);
    papi.push(lens);
  }
  const papiGlow = glowPoints(0xffffff, papi.map((l) => [l.position.x, l.position.y, l.position.z + 0.5]), 7);


  // ---------------------------------------------------------------- buildings
  const wall = new THREE.MeshStandardMaterial({ color: 0xdcdad3, roughness: 0.8 });
  const roofM = new THREE.MeshStandardMaterial({ color: 0xeef0f2, roughness: 0.5, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x6f93a8, roughness: 0.08, metalness: 0.6, emissive: 0xffd2a0, emissiveIntensity: 0 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9da3a8, roughness: 0.5, metalness: 0.6 });
  const darkM = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.7 });
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new RBox(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; group.add(m); return m; };
  const T = AP.terminal, tx = (T.x0 + T.x1) / 2, tw = T.x1 - T.x0, tl = T.z1 - T.z0;
  box(tw, 12, tl, wall, tx, H + 6, 0);
  box(0.4, 9.5, tl - 8, glass, T.x1 + 0.1, H + 5.6, 0);           // airside glass wall
  box(0.4, 7, tl - 40, glass, T.x0 - 0.1, H + 4.4, 0);            // landside glass
  box(tw + 8, 0.8, tl + 8, roofM, tx, H + 12.4, 0);              // overhanging roof
  { const vault = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, tl - 20, 32, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1, 0.28, 1), roofM); vault.position.set(tx, H + 12.8, 0); vault.castShadow = true; group.add(vault); }
  // name boards on both façades, logo on the roof facing the apron and the landside
  const nameTex = canvasTex(2048, 160, (c, w, h) => { c.fillStyle = '#1f4fb4'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffffff'; c.font = FONT(118); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('PILOU  INTERNATIONAL  AIRPORT', w / 2, h / 2 + 4); });
  const nameMat = new THREE.MeshStandardMaterial({ map: nameTex, roughness: 0.5, emissive: 0xffffff, emissiveMap: nameTex, emissiveIntensity: 0.05 });
  for (const [x, ry] of [[T.x1 + 0.35, Math.PI / 2], [T.x0 - 0.35, -Math.PI / 2]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(96, 7.5), nameMat); p.position.set(x, H + 15.4, 0); p.rotation.y = ry; group.add(p); }
  for (const x of [T.x1, T.x0]) box(0.6, 8.2, 98, roofM, x, H + 15.4, 0);  // board backings
  const logoMat = new THREE.MeshStandardMaterial({ map: logo, roughness: 0.5, emissive: 0xffffff, emissiveMap: logo, emissiveIntensity: 0.05 });
  for (const [x, ry] of [[tx + 0.45, Math.PI / 2], [tx - 0.45, -Math.PI / 2]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(15, 13.7), logoMat); p.position.set(x, H + 26, 0); p.rotation.y = ry; group.add(p); }
  box(0.8, 14, 15.6, steel, tx, H + 26, 0); box(0.6, 6, 0.6, steel, tx, H + 18, -5); box(0.6, 6, 0.6, steel, tx, H + 18, 5);
  for (let z = T.z0 + 10; z <= T.z1 - 10; z += 12) addCollider(tx, z, 14.5, H + 14);
  // jet bridges
  for (const gz of AP.gates) {
    box(12, 3, 3.2, steel, T.x1 + 6, H + 5, gz + 3.6);
    box(4, 3.4, 4, steel, T.x1 + 13.5, H + 5, gz + 3.6);
    for (const dz of [-1.2, 1.2]) box(0.4, 3.5, 0.4, darkM, T.x1 + 12.5, H + 1.75, gz + 3.6 + dz);
  }
  // control tower
  const TW = { x: -478, z: -140 };
  box(10, 6, 10, wall, TW.x, H + 3, TW.z);
  { const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 30, 20), wall); shaft.position.set(TW.x, H + 18, TW.z); shaft.castShadow = true; group.add(shaft); }
  { const cab = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 4.6, 4.6, 10), glass); cab.position.set(TW.x, H + 35.3, TW.z); group.add(cab); }
  { const deck = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 1, 10), wall); deck.position.set(TW.x, H + 32.5, TW.z); group.add(deck); }
  { const cap = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.0, 0.9, 10), darkM); cap.position.set(TW.x, H + 38, TW.z); group.add(cap); }
  box(0.25, 6, 0.25, steel, TW.x, H + 41.5, TW.z);
  const obstacle = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 })); obstacle.position.set(TW.x, H + 44.6, TW.z); group.add(obstacle);
  const beacon = new THREE.Group(); beacon.position.set(TW.x, H + 39, TW.z); group.add(beacon);
  const sprite = (color, scale, x, y, z) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0 })); sp.scale.setScalar(scale); sp.position.set(x, y, z); group.add(sp); return sp; };
  const beaconGlow = sprite(0xffffff, 22, TW.x, H + 39, TW.z), obstacleGlow = sprite(0xff2020, 6, TW.x, H + 44.6, TW.z);
  { const bw = new THREE.Mesh(new RBox(0.9, 0.7, 0.3), new THREE.MeshBasicMaterial({ color: 0xffffff })); bw.position.z = 0.4; beacon.add(bw);
    const bg = new THREE.Mesh(new RBox(0.9, 0.7, 0.3), new THREE.MeshBasicMaterial({ color: 0x30ff60 })); bg.position.z = -0.4; beacon.add(bg); }
  for (const ry of [0, Math.PI]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4), logoMat); p.position.set(TW.x + Math.sin(ry + Math.PI / 2) * 2.95, H + 26, TW.z); p.rotation.y = ry + Math.PI / 2; group.add(p); }
  addCollider(TW.x, TW.z, 6.5, H + 45);
  // hangars: arched, doors facing the apron, with the airline name
  const corr = canvasTex(256, 256, (c, w, h) => { for (let x = 0; x < w; x += 8) { c.fillStyle = x % 16 ? '#b9bec2' : '#a7adb2'; c.fillRect(x, 0, 8, h); } });
  corr.wrapS = corr.wrapT = THREE.RepeatWrapping; corr.repeat.set(10, 3);
  const shed = new THREE.MeshStandardMaterial({ map: corr, roughness: 0.55, metalness: 0.5, side: THREE.DoubleSide });
  const doorTex = canvasTex(1024, 512, (c, w, h) => {
    for (let x = 0; x < w; x += 64) { c.fillStyle = (x / 64) % 2 ? '#c7cbcf' : '#bcc1c5'; c.fillRect(x, 0, 64, h); }
    c.fillStyle = '#1f4fb4'; c.font = FONT(130); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('PILOU AIR', w / 2 + 70, h * 0.36);
  });
  for (const hz of [205, 275]) {
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 40, 28, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), shed);
    arch.rotation.y = 0; arch.position.set(-482, H, hz); arch.castShadow = true; group.add(arch);
    const half = new THREE.CircleGeometry(15, 28, 0, Math.PI);
    const back = new THREE.Mesh(half, shed); back.rotation.y = -Math.PI / 2; back.position.set(-502, H, hz); group.add(back);
    const door = new THREE.Mesh(half.clone(), new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.6, metalness: 0.3 }));
    // map the door texture across the half disc
    const uv = door.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * 2 - 1);
    door.rotation.y = Math.PI / 2; door.position.set(-462, H, hz); group.add(door);
    { const lg = new THREE.Mesh(new THREE.PlaneGeometry(6, 5.5), logoMat); lg.position.set(-461.9, H + 9.5, hz - 7.5); lg.rotation.y = Math.PI / 2; group.add(lg); }
    for (const dx of [-20, -8, 4]) addCollider(-482 + dx + 8, hz, 14, H + 15);
  }
  // apron floodlight masts
  const floods = [], floodGlows = [];
  for (const z of [-140, 140, 310]) { box(0.5, 22, 0.5, steel, -458, H + 11, z); const head = box(3, 0.8, 1.6, new THREE.MeshBasicMaterial({ color: 0x555555 }), -458, H + 22.2, z); floods.push(head); addCollider(-458, z, 0.6, H + 23); floodGlows.push(sprite(0xffe2b0, 14, -456.5, H + 21.8, z)); }
  // pools of light from the masts on the apron (and over the terminal frontage)
  const poolTex = canvasTex(128, 128, (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,225,180,0.9)'); g.addColorStop(0.5, 'rgba(255,215,160,0.4)'); g.addColorStop(1, 'rgba(255,210,150,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, false);
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -6 });
  for (const [x, z, r] of [[-440, -140, 42], [-440, 140, 42], [-440, 310, 36], [-425, -40, 40], [-425, 60, 40], [-300, -390, 30], [-300, 410, 30]]) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32).rotateX(-Math.PI / 2), poolMat); m.position.set(x, H + 0.08, z); m.renderOrder = 3; group.add(m);
  }
  // windsock, beside the runway
  const sockTex = canvasTex(64, 256, (c, w, h) => { for (let i = 0; i < 5; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#ff5a1a'; c.fillRect(0, i * h / 5, w, h / 5); } });
  box(0.18, 7, 0.18, steel, X + hw + 30, H + 3.5, -150);
  const sock = new THREE.Group(); sock.position.set(X + hw + 30, H + 6.8, -150); group.add(sock);
  { const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.5, 3.6, 12, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -1.8), new THREE.MeshStandardMaterial({ map: sockTex, side: THREE.DoubleSide })); sock.add(cone); }
  // entrance sign on the access road
  {
    const sx = -548, sz = 150;
    const sign = canvasTex(1024, 640, (c, w, h) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#1f4fb4'; c.font = FONT(96); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('PILOU', w / 2, h * 0.68); c.font = FONT(64, 600); c.fillText('INTERNATIONAL AIRPORT', w / 2, h * 0.84);
      c.fillStyle = '#5a6570'; c.font = FONT(40, 500); c.fillText('PIL  ·  Departures  ·  Arrivals  ·  Pilou Air', w / 2, h * 0.95);
    });
    const sm = new THREE.MeshStandardMaterial({ map: sign, roughness: 0.6 });
    const slab = box(1, 6.4, 10.2, darkM, sx, groundHeight(sx, sz) + 3.6, sz);
    for (const s of [1, -1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(10, 6.25), sm); p.position.set(sx + s * 0.52, slab.position.y, sz); p.rotation.y = s * Math.PI / 2; group.add(p);
      const lg = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.9), logoMat); lg.position.set(sx + s * 0.54, slab.position.y + 1.45, sz); lg.rotation.y = s * Math.PI / 2; group.add(lg);
    }
    addCollider(sx, sz, 3, groundHeight(sx, sz) + 7);
  }

  // ---------------------------------------------------------------- aircraft
  const parked = [];
  for (const gz of AP.gates) {
    const p = airlinerModel(logo); p.position.set(-436, H + 2.3, gz); p.rotation.y = -Math.PI / 2; group.add(p); parked.push(p);
    p.userData.gear.visible = true;
    for (let k = -2; k <= 2; k++) addCollider(-436 - k * 7, gz, 2.3, H + (k === -2 ? 12 : 4.5));
    for (const s of [1, -1]) addCollider(-439.2, gz + s * 5.9, 1.2, H + 2);
  }
  const circuit = airlinerCircuit(AP);
  const M = circuit.marks;
  const sample = sampler(circuit);
  const liners = [];
  for (const [s0, name] of [[M.downwind + 400, 'PL101'], [M.taxi + 120, 'PL202']]) {
    const m = airlinerModel(logo); group.add(m);
    liners.push({ m, s: s0, v: 60, name, hold: false, pitch: 0, bank: 0, prevHdg: null, onGround: true, col: [] });
  }
  const lights = [];
  const loops = [scenicLoop(0, 150, 1500, 1250, 0, 0.3), scenicLoop(150, -1150, 950, 450, 0, 2.0)];
  for (const lp of loops) {
    // altitude: 140 m above the highest ground nearby, smoothed along the loop
    const raw = lp.pts.map((p) => { let m = 0; for (let k = -2; k <= 2; k++) for (let j = -2; j <= 2; j++) m = Math.max(m, terrainHeight(p.x + k * 60, p.z + j * 60)); return m + 140; });
    const n = raw.length; for (let i = 0; i < n; i++) { let m = 0; for (let k = -25; k <= 25; k++) m = Math.max(m, raw[(i + k + n) % n]); lp.pts[i].y = m; }
    for (let it = 0; it < 3; it++) for (let i = 0; i < n; i++) lp.pts[i].y = Math.max(raw[i], (lp.pts[(i - 1 + n) % n].y + lp.pts[i].y + lp.pts[(i + 1) % n].y) / 3);
  }
  loops.forEach((lp, i) => { const m = lightPlaneModel(i ? 0xd8232a : 0x1f4fb4); group.add(m); lights.push({ m, lp, s: lp.L * (i ? 0.4 : 0), sample: sampler(lp), bank: 0, prevHdg: null }); });

  const st = {};
  let time = 0, night = 0, fog = 0;
  const DYN = [];
  const dummyOwner = { imp: { x: 0, z: 0 }, mesh: { position: new THREE.Vector3() } };
  const busyRunway = (other) => {
    const s = other.s;
    return (s > M.base && s < M.slow) || (s > M.lineup - 40 && s < M.lift + 150);
  };

  function updateLiner(p, dt) {
    // holding point (start of the path): wait for a clear runway
    if (p.hold) {
      if (!liners.some((o) => o !== p && busyRunway(o))) p.hold = false;
    }
    let target = Math.max(3, sample(p.s, st).v);
    if (p.hold) target = 0;
    // on the ground: keep clear of whoever is ahead
    const ground = circuit.ground(p.s);
    if (ground) for (const o of liners) if (o !== p && circuit.ground(o.s)) { const gap = ((o.s - p.s) % circuit.L + circuit.L) % circuit.L; if (gap > 0 && gap < 90) target = Math.min(target, (gap - 60) * 0.3); }
    target = Math.max(0, target);
    const accel = p.s > M.roll && p.s < M.lift + 400 ? 6 : 3.5;
    p.v += Math.max(-4 * dt, Math.min(accel * dt, target - p.v));
    const before = p.s;
    p.s += p.v * dt;
    if (p.s >= circuit.L) { p.s -= circuit.L; p.hold = true; }
    if (before < M.hold && p.s >= M.hold) p.hold = true;
    sample(p.s, st);
    const m = p.m;
    m.position.set(st.x, st.y, st.z);
    // attitude: heading from the path, bank from the turn rate, pitch from the climb (plus a little nose-up in the air)
    if (p.prevHdg === null) p.prevHdg = st.hdg;
    let dh = st.hdg - p.prevHdg; dh -= Math.round(dh / (Math.PI * 2)) * Math.PI * 2; p.prevHdg = st.hdg;
    const air = !circuit.ground(p.s);
    const rate = dt > 0 ? -dh / dt : 0;
    const bankT = air ? Math.max(-0.5, Math.min(0.5, Math.atan(p.v * rate / 9.81))) : 0;
    p.bank += (bankT - p.bank) * Math.min(1, dt * 1.5);
    const pitchT = air ? Math.atan(st.slope) + 0.05 : (p.s > M.lift - 30 && p.s < M.lift ? 0.12 * (p.s - (M.lift - 30)) / 30 : 0);
    p.pitch += (pitchT - p.pitch) * Math.min(1, dt * 2);
    m.rotation.set(-p.pitch, st.hdg, p.bank, 'YXZ');
    const agl = st.y - H;
    m.userData.gear.visible = !air || agl < 150 || p.s > M.base;
    p.onGround = !air; p.thrust = p.s > M.roll && p.s < M.lift + 600 ? 1 : air ? 0.55 : 0.25;
  }

  function updateLight(L, dt) {
    L.s += 52 * dt; L.lp.L && (L.s %= L.lp.L);
    L.sample(L.s, st);
    const m = L.m; m.position.set(st.x, st.y, st.z);
    if (L.prevHdg === null) L.prevHdg = st.hdg;
    let dh = st.hdg - L.prevHdg; dh -= Math.round(dh / (Math.PI * 2)) * Math.PI * 2; L.prevHdg = st.hdg;
    const rate = dt > 0 ? -dh / dt : 0;
    L.bank += (Math.max(-0.6, Math.min(0.6, Math.atan(52 * rate / 9.81))) - L.bank) * Math.min(1, dt);
    m.rotation.set(-Math.atan(st.slope), st.hdg, L.bank, 'YXZ');
    m.userData.prop.rotation.z += dt * 60;
  }

  return {
    group, liners, lights, circuit,
    setNight(n) { night = n; },
    // 0..1 how foggy it is: the lights come on and their halos show through it
    setFog(f) { fog = f; },
    update(dt, player) {
      time += dt;
      for (const p of liners) updateLiner(p, dt);
      for (const L of lights) updateLight(L, dt);
      // lights: dim by day, bright (bloom) at night; strobes and beacons flash
      const vis = Math.max(night, fog * 0.85);
      for (const ls of lightSets) ls.mat.color.copy(ls.base).multiplyScalar(ls.dayLevel + vis * 3);
      for (const g of glows) { g.mat.uniforms.uOpacity.value = vis * g.base; g.mat.uniforms.uScale.value = (typeof innerHeight === 'number' ? innerHeight : 720) / 2 / Math.tan(Math.PI / 6); }
      poolMat.opacity = night * 0.55;
      for (const f of floodGlows) f.material.opacity = night;
      mw.emissive.setScalar(night * 0.12); my.emissive.setRGB(night * 0.1, night * 0.08, 0);
      const flash = (time % 1.0) < 0.5;
      beaconGlow.material.color.set(flash ? 0xffffff : 0x30ff60); beaconGlow.material.opacity = Math.max(vis, 0.15) * (0.6 + 0.4 * Math.abs(Math.sin(time * 2 * Math.PI)));
      obstacleGlow.material.opacity = (time % 1.6) < 0.8 ? vis : 0;
      rabbitGlow.material.opacity = vis;
      const strobe = (time % 1.2) < 0.06, bcn = (time % 1.0) < 0.12;
      for (const p of [...liners.map((l) => l.m), ...parked]) {
        const u = p.userData;
        for (const n of u.nav) n.visible = night > 0.2 || !parked.includes(p);
        for (const s of u.strobes) s.visible = strobe && !parked.includes(p);
        for (const b of u.beacons) b.visible = bcn && !parked.includes(p);
        u.body.emissiveIntensity = night * 1.2;
      }
      for (const L of lights) for (const n of L.m.userData.nav) n.visible = true;
      // approach "rabbit": a strobe running toward the threshold twice a second
      const k = Math.floor((time * 20) % 10);
      const rz = rabbitZ[9 - k]; rabbit.position.set(X, groundHeight(X, rz) + 0.6, rz); rabbitGlow.position.copy(rabbit.position);
      rabbit.visible = night > 0.2 || true; rabbit.material.opacity = 0.5 + night * 0.5; rabbit.scale.setScalar(0.6 + night);
      obstacle.visible = (time % 1.6) < 0.8;
      beacon.rotation.y = time * 2.6;
      for (const f of floods) f.material.color.setScalar(0.33 + night * 2.5);
      glass.emissiveIntensity = night * 0.9; nameMat.emissiveIntensity = 0.05 + night * 0.5; logoMat.emissiveIntensity = 0.05 + night * 0.45;
      // windsock: points downwind, flutters
      sock.rotation.set(0.15 + 0.06 * Math.sin(time * 3.1), Math.atan2(1.5, 0.6) + Math.PI + 0.12 * Math.sin(time * 1.7), 0);
      // PAPI: the player's angle above the touchdown point
      if (player) {
        const dz = player.z - PAPI_Z, ang = Math.atan2(player.y - H, Math.max(1, dz));
        const pc = papiGlow.geometry.attributes.color;
        for (let i = 0; i < 4; i++) { const white = dz > 0 && ang > PAPI_ANG[i]; papi[i].material.color.set(white ? 0xffffff : 0xff2020).multiplyScalar(1 + night * 2); pc.setXYZ(i, 1, white ? 1 : 0.12, white ? 1 : 0.1); }
        pc.needsUpdate = true;
      }
      // nearest airliner: sound level, and its fuselage as obstacles while it's on the ground
      let lvl = 0, pitch = 0.4;
      DYN.length = 0;
      if (player) for (const p of liners) {
        const d = p.m.position.distanceTo(player);
        const l = p.thrust * Math.min(1, 90 / (d + 30)) ** 1.4;
        if (l > lvl) { lvl = l; pitch = p.thrust; }
        if (p.onGround && d < 70) {
          const f = new THREE.Vector3(Math.sin(p.m.rotation.y), 0, Math.cos(p.m.rotation.y));
          for (let k = -2; k <= 2; k++) DYN.push({ x: p.m.position.x + f.x * k * 7, z: p.m.position.z + f.z * k * 7, r: 2.3, owner: dummyOwner });
        }
      }
      this.sound = { level: Math.min(1, lvl), pitch };
    },
    // circles for the physics, like traffic cars
    near(out) { for (const c of DYN) out.push(c); return out; },
    sound: { level: 0, pitch: 0.4 },
  };
}
