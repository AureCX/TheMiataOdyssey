// Smaller destinations: Mesa Field (a desert airstrip with a hangar and windsock), Port Ruby's seaplane base (a pier
// with a hut and mooring buoys) and Luigi's Pizza in Fairfield.
import * as THREE from 'three';
import { RBox } from './shapes.js';
import { AIRSTRIP, SEAPLANE, SHOP_LOTS, terrainHeight } from './world.js';
import { addCollider } from './scenery.js';

function textTex(lines, { w = 1024, h = 256, bg = '#16181c', fg = '#fff', accent = null } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (accent) { g.fillStyle = accent; g.fillRect(0, h - h * 0.12, w, h * 0.12); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach(([t, px, y]) => { g.font = `700 ${px}px "Barlow Condensed", Arial, sans-serif`; g.fillText(t, w / 2, h * y); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildExtras(scene) {
  const group = new THREE.Group(); scene.add(group);
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
  const box = (parent, w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new RBox(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; parent.add(b); return b; };
  const night = [];

  // ---- Mesa Field
  {
    const A = AIRSTRIP, g = new THREE.Group(); g.position.set(A.x, A.h, A.z); g.rotation.y = Math.atan2(A.ux, A.uz); group.add(g);   // local +z along the strip
    const tar = mat(0x5a524a, { roughness: 0.95 }); tar.userData.road = true;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(A.w, A.len).rotateX(-Math.PI / 2), tar); strip.position.y = 0.04; strip.receiveShadow = true; g.add(strip);
    const white = mat(0xf0ece2, { polygonOffset: true, polygonOffsetFactor: -2 });
    for (let z = -A.len / 2 + 40; z < A.len / 2 - 40; z += 30) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 14).rotateX(-Math.PI / 2), white); d.position.set(0, 0.06, z); g.add(d); }
    for (const e of [-1, 1]) for (let k = -3; k <= 3; k++) { if (!k) continue; const d = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 18).rotateX(-Math.PI / 2), white); d.position.set(k * 2.6, 0.06, e * (A.len / 2 - 14)); g.add(d); }
    // apron, hangar, windsock and a sign, beside the south-west end
    const ax = 30, az = -(A.len / 2 - 40);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(38, 50).rotateX(-Math.PI / 2), tar); apron.position.set(ax, 0.04, az); g.add(apron);
    const shed = mat(0xb7a58a); const roof = mat(0x6e5a44);
    box(g, 16, 6, 0.4, shed, ax + 10, 3, az + 12); box(g, 0.4, 6, 14, shed, ax + 18, 3, az + 5); box(g, 0.4, 6, 14, shed, ax + 2, 3, az + 5); box(g, 17, 0.4, 15, roof, ax + 10, 6.2, az + 5);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshStandardMaterial({ map: textTex([['MESA FIELD', 150, 0.45]], { accent: '#e5641c' }), roughness: 0.6 }));
    sign.position.set(ax + 10, 7.6, az + 11.6); sign.rotation.y = Math.PI; g.add(sign);
    box(g, 0.15, 6, 0.15, mat(0x999999, { metalness: 0.6 }), ax - 6, 3, az - 20);
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.45, 3, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -1.5), mat(0xff5a1a, { side: THREE.DoubleSide }));
    sock.position.set(ax - 6, 5.8, az - 20); g.add(sock);
    const lights = new THREE.MeshBasicMaterial({ color: 0x777777 }); night.push({ m: lights, c: new THREE.Color(0xfff2c0) });
    for (let z = -A.len / 2; z <= A.len / 2; z += 40) for (const s of [1, -1]) { const l = new THREE.Mesh(new RBox(0.4, 0.4, 0.4), lights); l.position.set(s * (A.w / 2 + 1), 0.3, z); g.add(l); }
    g.updateMatrixWorld(true);
    for (const [lx, lz] of [[ax + 10, az + 12], [ax + 18, az + 5], [ax + 2, az + 5]]) { const p = new THREE.Vector3(lx, 0, lz).applyMatrix4(g.matrixWorld); addCollider(p.x, p.z, 4, A.h + 6.4); }
    const sp = new THREE.Vector3(ax, 0, az).applyMatrix4(g.matrixWorld);
    AIRSTRIP.stand = { x: sp.x, z: sp.z };
  }

  // ---- Port Ruby seaplane base
  {
    const S = SEAPLANE, wood = mat(0x8a6a48, { roughness: 0.9 }), pile = mat(0x4a3a2a);
    const len = S.z1 - S.z0;
    const deck = box(group, S.w, 0.3, len, wood, S.x, S.top - 0.15, (S.z0 + S.z1) / 2); deck.material.userData.road = true;
    for (let z = S.z0 + 4; z <= S.z1; z += 6) for (const s of [-1, 1]) { const ph = S.top + 6; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, ph, 8), pile); p.position.set(S.x + s * (S.w / 2 - 0.3), S.top - ph / 2 + 0.6, z); group.add(p); }
    const hut = mat(0xe8e4da), red = mat(0xb5121b);
    box(group, 6, 3, 4, hut, S.x + 7, terrainHeight(S.x + 7, S.z0 - 4) + 1.5, S.z0 - 4);
    box(group, 6.6, 0.3, 4.6, red, S.x + 7, terrainHeight(S.x + 7, S.z0 - 4) + 3.15, S.z0 - 4);
    addCollider(S.x + 7, S.z0 - 4, 3, terrainHeight(S.x + 7, S.z0 - 4) + 3.3);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2), new THREE.MeshStandardMaterial({ map: textTex([['PORT RUBY SEAPLANE BASE', 110, 0.45]], { bg: '#1f4fb4', accent: '#f7b733' }), roughness: 0.6 }));
    sign.position.set(S.x, S.top + 3.4, S.z0 + 2); group.add(sign);
    for (const s of [-1, 1]) box(group, 0.2, 3.4, 0.2, pile, S.x + s * 4.4, S.top + 1.7, S.z0 + 2);
    const buoyM = mat(0xff6a1a, { roughness: 0.5 });
    for (const [bx, bz] of [[S.buoy.x - 18, S.buoy.z], [S.buoy.x + 18, S.buoy.z], [S.buoy.x, S.buoy.z + 22]]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), buoyM); b.position.set(bx, 0.2, bz); group.add(b); night.push({ bob: b, ph: bx * 0.1 }); }
  }

  // ---- Luigi's Pizza
  for (const L of SHOP_LOTS) {
    const g = new THREE.Group(); g.position.set(L.cx, L.h, L.cz); g.rotation.y = Math.atan2(L.ux, L.uz) - Math.PI / 2; group.add(g);   // local x along the road, +z away from it
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(L.hl * 2, L.half * 2).rotateX(-Math.PI / 2), mat(0x55575b, { roughness: 0.9 })); floor.position.y = 0.035; g.add(floor);
    const wall = mat(0xf1e6cf), trim = mat(0x1f6b3a);
    box(g, 12, 4.4, 7, wall, 0, 2.2, L.half - 3.6);
    box(g, 12.6, 0.4, 7.6, trim, 0, 4.6, L.half - 3.6);
    const awning = mat(0xc8102e); box(g, 12, 0.18, 1.8, awning, 0, 3.3, L.half - 7.9);
    const glass = new THREE.MeshStandardMaterial({ color: 0x2a3540, roughness: 0.1, metalness: 0.5, emissive: 0xffc070, emissiveIntensity: 0 }); night.push({ m: glass, e: 1.1 });
    box(g, 8, 2.4, 0.1, glass, 0, 1.4, L.half - 7.15);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), new THREE.MeshStandardMaterial({ map: textTex([["LUIGI'S PIZZA", 150, 0.45]], { bg: '#1f6b3a', accent: '#c8102e', w: 1024, h: 180 }), roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0 }));
    sign.material.emissiveMap = sign.material.map; night.push({ m: sign.material, e: 0.7 });
    sign.position.set(0, 5.3, L.half - 7.15); sign.rotation.y = Math.PI; g.add(sign);
    // two delivery scooters out front
    for (const sx of [-3, 3]) { const sc = new THREE.Group(); sc.position.set(sx, 0, L.half - 10); g.add(sc);
      box(sc, 0.5, 0.5, 1.5, mat(0xc8102e, { metalness: 0.3 }), 0, 0.55, 0); box(sc, 0.55, 0.45, 0.55, mat(0xf3f0e8), 0, 1.0, -0.4);
      for (const z of [-0.6, 0.6]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.12, 12).rotateZ(Math.PI / 2), mat(0x111111)); w.position.set(0, 0.25, z); sc.add(w); } }
    g.updateMatrixWorld(true);
    for (const lx of [-4.5, 0, 4.5]) { const p = new THREE.Vector3(lx, 0, L.half - 3.6).applyMatrix4(g.matrixWorld); addCollider(p.x, p.z, 3.6, L.h + 4.8); }
    const pk = new THREE.Vector3(0, 0, -2).applyMatrix4(g.matrixWorld);
    L.pickup = { x: pk.x, z: pk.z };
  }

  let t = 0;
  return {
    group,
    update(dt, n) {
      t += dt;
      for (const o of night) {
        if (o.bob) o.bob.position.y = 0.15 + Math.sin(t * 1.3 + o.ph) * 0.15;
        else if (o.c) o.m.color.copy(o.c).multiplyScalar(0.3 + n * 2.5);
        else o.m.emissiveIntensity = n * o.e;
      }
    },
  };
}
