// Tyre marks: one ring-buffered ribbon mesh, a strip per wheel laid while the tyre slides.
import * as THREE from 'three';

const MAX = 5000; // quads

export function createSkidMarks(scene) {
  const pos = new Float32Array(MAX * 4 * 3), colr = new Float32Array(MAX * 4 * 4);
  const idx = new Uint32Array(MAX * 6);
  for (let i = 0; i < MAX; i++) idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4 + 1, i * 4 + 2, i * 4 + 3], i * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(colr, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 1;
  scene.add(mesh);
  let next = 0, dirty = false;
  const last = [null, null, null, null];
  const L = new THREE.Vector3(), R = new THREE.Vector3();

  return {
    // p: contact point, side: unit vector across the tyre, n: ground normal, strength 0..1, colour [r,g,b]
    add(wheel, p, side, n, strength, rgb) {
      if (strength <= 0.02) { last[wheel] = null; return; }
      const hw = 0.09;
      L.copy(p).addScaledVector(side, -hw).addScaledVector(n, 0.015);
      R.copy(p).addScaledVector(side, hw).addScaledVector(n, 0.015);
      const prev = last[wheel];
      if (prev && prev.L.distanceToSquared(L) < 0.2 * 0.2) return;   // lay a segment every ~20 cm
      if (prev && prev.L.distanceToSquared(L) < 3 * 3) {
        const q = next; next = (next + 1) % MAX;
        pos.set([prev.L.x, prev.L.y, prev.L.z, prev.R.x, prev.R.y, prev.R.z, L.x, L.y, L.z, R.x, R.y, R.z], q * 12);
        const a0 = prev.a, a1 = Math.min(0.85, strength);
        colr.set([...rgb, a0, ...rgb, a0, ...rgb, a1, ...rgb, a1], q * 16);
        dirty = true;
      }
      last[wheel] = { L: L.clone(), R: R.clone(), a: Math.min(0.85, strength) };
    },
    break(wheel) { last[wheel] = null; },
    update() {
      if (!dirty) return;
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; dirty = false;
    },
    clear() { colr.fill(0); geo.attributes.color.needsUpdate = true; last.fill(null); },
  };
}
