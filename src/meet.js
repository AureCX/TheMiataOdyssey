// The Roadster Club meet: in the Silverpine Peaks car park every evening (17:00–23:00) and all day at weekends.
// A dozen roadsters in club colours (clones of the detailed model, loaded when you get near), owners chatting under
// the club gazebo. Park among them and stop: the judges score your car (upgrades, condition, paint) against the
// others, with prize money for the top three, once a day.
import * as THREE from 'three';
import { RBox } from './shapes.js';
import { SKI } from './world.js';

const PAINTS = [0xb5121b, 0x1d3f7a, 0xeeece6, 0x0d0d0f, 0xe8b923, 0x1f4d36, 0xa7abb0, 0xe5641c, 0x6b2d5c, 0x2c8ad6, 0x7a1f1f, 0xf2f2f2];
const OWNERS = ['Mika', 'Jun', 'Ana', 'Theo', 'Sam', 'Lea', 'Ravi', 'Noor', 'Iris', 'Ben', 'Yuki'];

export function createMeet({ scene, toast, econ, loadModel, settings, saveSettings }) {
  const L = SKI.lot; if (!L) return null;
  const group = new THREE.Group(); scene.add(group); group.visible = false;
  const ux = L.ux, uz = L.uz, vx = -uz, vz = ux, H = L.h + 0.03;
  const P = (u, v) => [L.cx + ux * u + vx * v, L.cz + uz * u + vz * v];
  const yawU = Math.atan2(ux, uz);
  // slots: two angled rows facing each other, a gap down the middle for you
  const slots = [];
  for (const side of [1, -1]) for (let k = 0; k < 6; k++) { const [x, z] = P(-14 + k * 5.4, side * 9); slots.push({ x, z, yaw: yawU + (side > 0 ? -Math.PI / 2 : Math.PI / 2) + side * 0.35 }); }
  // the club gazebo and a banner
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
  { const [gx, gz] = P(16, 0), gz0 = new THREE.Group(); gz0.position.set(gx, H, gz); gz0.rotation.y = yawU; group.add(gz0);
    for (const [a, b] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) { const p = new THREE.Mesh(new RBox(0.1, 2.4, 0.1), M(0xdddddd)); p.position.set(a, 1.2, b); gz0.add(p); }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.2, 4), M(0xc8102e)); roof.position.y = 3; roof.rotation.y = Math.PI / 4; gz0.add(roof);
    const c = document.createElement('canvas'); c.width = 1024; c.height = 160; const g = c.getContext('2d'); g.fillStyle = '#c8102e'; g.fillRect(0, 0, 1024, 160); g.fillStyle = '#fff'; g.font = '700 96px "Barlow Condensed", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ROADSTER CLUB · MEET', 512, 86);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const b = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.72), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide })); b.position.set(0, 2.2, -2.05); b.rotation.y = Math.PI; gz0.add(b);
    const tbl = new THREE.Mesh(new RBox(2.2, 0.08, 0.8), M(0xf2f2f2)); tbl.position.set(0, 0.8, 0); gz0.add(tbl); }
  // light masts with a warm pool on the tarmac (lit after dusk)
  const lamps = [], poolC = document.createElement('canvas'); poolC.width = poolC.height = 128;
  { const g = poolC.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,220,170,0.9)'); gr.addColorStop(0.55, 'rgba(255,210,150,0.35)'); gr.addColorStop(1, 'rgba(255,200,140,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const poolM = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(poolC), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -6 });
  for (const u of [-10, 8]) { const [x, z] = P(u, 0);
    const m = new THREE.Mesh(new RBox(0.3, 8, 0.3), M(0x666666)); m.position.set(x, H + 4, z); group.add(m);
    const hd = new THREE.Mesh(new RBox(1.4, 0.3, 0.6), new THREE.MeshBasicMaterial({ color: 0x444444 })); hd.position.set(x, H + 8, z); group.add(hd);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(16, 32).rotateX(-Math.PI / 2), poolM); pool.position.set(x, H + 0.05, z); pool.renderOrder = 3; group.add(pool);
    lamps.push(hd); }
  const light = new THREE.PointLight(0xffd9a8, 0, 45, 1.2); { const [x, z] = P(0, 0); light.position.set(x, H + 7.5, z); group.add(light); }
  const people = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.25, 1.1, 3, 6).translate(0, 0.8, 0), M(0xffffff), 18);
  const PM = new THREE.Matrix4(), C = new THREE.Color();
  for (let i = 0; i < 18; i++) { const [x, z] = P(-16 + Math.random() * 36, (Math.random() - 0.5) * 6); PM.makeTranslation(x, H, z); people.setMatrixAt(i, PM); people.setColorAt(i, C.setHSL(Math.random(), 0.5, 0.45)); }
  group.add(people);

  let cars = null, loading = false, judged = -1, stopT = 0;
  const entrants = slots.map((_, i) => ({ owner: OWNERS[i % OWNERS.length], paint: PAINTS[i % PAINTS.length], score: 45 + Math.random() * 45 }));
  async function build() {
    loading = true;
    try {
      const gltf = await loadModel(); if (!gltf) return;
      const src = gltf.scene;
      cars = slots.map((s, i) => {
        const c = src.clone(true), paint = new THREE.MeshPhysicalMaterial({ color: entrants[i].paint, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
        c.traverse((o) => { if (o.isMesh) { const nm = o.material && o.material.name; if (nm === 'carpaint') o.material = paint; o.castShadow = true; } });
        // sit it on the ground: the model's lowest point at the lot surface
        c.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(c, true);
        const holder = new THREE.Group(); holder.add(c); c.position.y -= box.min.y; holder.position.set(s.x, H, s.z); holder.rotation.y = s.yaw; group.add(holder);
        return holder;
      });
    } catch (e) { console.warn('meet cars not loaded', e); cars = []; }
  }
  const active = (hour) => { const d = new Date().getDay(); return d === 0 || d === 6 || (hour >= 17 && hour < 23); };

  return {
    group,
    get on() { return group.visible; },
    get place() { return { x: L.cx, z: L.cz }; },
    update(dt, { veh, mode, hour, day, paint, dmgEngine, dirt = 0 }) {
      const on = active(hour); group.visible = on;
      if (!on) return;
      const night = hour < 6.5 || hour > 18.5 ? 1 : 0;
      poolM.opacity = night * 0.6; light.intensity = night * 60; for (const l of lamps) l.material.color.setScalar(night ? 1 : 0.27);
      const d = Math.hypot(veh.pos.x - L.cx, veh.pos.z - L.cz);
      if (!cars && !loading && d < 1500) build();
      // judging: stop in the car park
      if (mode === 'car' && d < 22 && Math.hypot(veh.vel.x, veh.vel.z) < 0.3) stopT += dt; else stopT = 0;
      if (stopT > 3 && judged !== day) {
        judged = day; stopT = -1e9;
        const lv = ['engine', 'turbo', 'tyres', 'brakes', 'suspension', 'weight', 'nitro'].reduce((a, k) => a + (econ ? econ.level(k) : 0), 0);
        const mine = Math.min(100, 40 + lv * 4 + dmgEngine * 20 + (paint && paint !== "#b5121b" ? 5 : 0) + Math.random() * 10 - dirt * 18);   // a dirty car loses points
        const field = entrants.map((e) => e.score).concat(mine).sort((a, b) => b - a), place = field.indexOf(mine) + 1;
        const prize = [800, 400, 200][place - 1] || 50;
        toast(`Car meet: judges' score ${Math.round(mine)} · ${place}${['st', 'nd', 'rd'][place - 1] || 'th'} of ${field.length}`);
        econ && econ.earn(prize, place === 1 ? 'Best in show!' : place <= 3 ? `Meet podium (${place})` : 'Thanks for coming to the meet');
      }
    },
  };
}
