// Photo spots: scenic viewpoints marked with a camera sign (and on the map). Stand near one in photo mode, frame
// its subject and save the photo: the first shot of each spot pays, and capturing them all pays a bonus.
import * as THREE from 'three';
import { AIRPORT, HARBOUR, SKI, TRACK, FESTIVAL, groundHeight, terrainHeight } from './world.js';

export function createPhotos({ scene, settings, saveSettings, econ, toast, extra = [] }) {
  settings.photos = settings.photos || {};
  const S = [
    { id: 'airport', name: 'Pilou International', x: -230, z: -60, sub: [-478, AIRPORT.h + 30, -140] },
    { id: 'harbour', name: 'Port Ruby cranes', x: 60, z: 1330, sub: [HARBOUR.cx + 15, 20, HARBOUR.cz] },
    { id: 'peaks', name: 'Silverpine Peaks chairlift', x: SKI.top.x + 30, z: SKI.top.z + 30, sub: [SKI.base.x, null, SKI.base.z] },
    { id: 'raceway', name: 'Red Mesa Raceway start', x: TRACK.x + 40, z: TRACK.z - 70, sub: [TRACK.x, null, TRACK.z - 105] },
    { id: 'forestlake', name: 'Forest lake', x: -720, z: 160, sub: [-950, 2, 150] },
    { id: 'oasis', name: 'Oasis lake', x: 720, z: 380, sub: [560, 2, 380] },
    { id: 'bridge', name: 'River bridge', x: 140, z: 960, sub: [197, 10, 885] },
    { id: 'festival', name: 'The big wheel', x: -46, z: -55, sub: [FESTIVAL.x + 14, null, FESTIVAL.z - 14] },
    ...extra,
  ];
  for (const s of S) if (s.sub[1] == null) s.sub[1] = terrainHeight(s.sub[0], s.sub[2]) + 8;
  // signs: a post with a camera board
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#1f6b3a'; g.beginPath(); g.roundRect(4, 4, 120, 120, 18); g.fill(); g.fillStyle = '#fff';
  g.beginPath(); g.roundRect(22, 42, 84, 56, 8); g.fill(); g.fillRect(46, 32, 34, 14); g.fillStyle = '#1f6b3a'; g.beginPath(); g.arc(64, 70, 18, 0, 6.3); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 70, 11, 0, 6.3); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }), postM = new THREE.MeshStandardMaterial({ color: 0x555555 });
  for (const s of S) {
    const h = groundHeight(s.x, s.z), grp = new THREE.Group(); grp.position.set(s.x, h, s.z); grp.rotation.y = Math.atan2(s.sub[0] - s.x, s.sub[2] - s.z); scene.add(grp);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 6), postM); p.position.y = 1; grp.add(p);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), board); b.position.y = 2.2; grp.add(b);
    s.y = h;
  }
  const V = new THREE.Vector3(), F = new THREE.Vector3();
  return {
    spots: S,
    get count() { return S.filter((s) => settings.photos[s.id]).length; },
    // called when a photo is saved: did it capture a spot's subject?
    check(camera) {
      camera.getWorldDirection(F);
      for (const s of S) {
        if (Math.hypot(camera.position.x - s.x, camera.position.z - s.z) > 90) continue;
        V.set(s.sub[0], s.sub[1], s.sub[2]).sub(camera.position); const d = V.length(); V.normalize();
        if (V.dot(F) < Math.cos(0.38) || d > 2500) { toast(`Photo spot · ${s.name}: frame the subject`); return null; }
        if (settings.photos[s.id]) { toast(`Photo spot · ${s.name} (already captured)`); return s; }
        settings.photos[s.id] = Date.now(); saveSettings();
        econ && econ.earn(150, `Photo spot: ${s.name}`);
        const n = S.filter((q) => settings.photos[q.id]).length;
        if (n === S.length) econ && econ.earn(1000, 'Every photo spot captured!'); else toast(`Photo spots ${n}/${S.length}`);
        return s;
      }
      return null;
    },
    // a hint when you're standing at a spot (not in photo mode)
    near(pos) { for (const s of S) if (Math.hypot(pos.x - s.x, pos.z - s.z) < 20) return s; return null; },
  };
}
