// Ground impacts for the mech's superhero landing: a cracked-earth decal that fades out over a few seconds and
// electric arcs crawling outward along the cracks for a moment.
import * as THREE from 'three';

function crackTexture() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  // scorched, crushed centre
  const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.22);
  rg.addColorStop(0, 'rgba(20,18,16,0.85)'); rg.addColorStop(0.6, 'rgba(30,26,22,0.45)'); rg.addColorStop(1, 'rgba(30,26,22,0)');
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  g.lineCap = 'round'; g.lineJoin = 'round';
  // branching cracks: random walks outward, thinning as they go
  const crack = (x, y, a, len, w) => {
    g.strokeStyle = 'rgba(8,7,6,0.95)'; g.lineWidth = w; g.beginPath(); g.moveTo(x, y);
    for (let i = 0; i < len; i++) {
      a += (Math.random() - 0.5) * 0.7; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y);
      if (Math.random() < 0.09 && w > 1.2) { g.stroke(); crack(x, y, a + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6), len - i - 2, w * 0.6); g.beginPath(); g.moveTo(x, y); g.lineWidth = w; }
      w *= 0.985;
    }
    g.stroke();
  };
  for (let k = 0; k < 9; k++) crack(S / 2, S / 2, k / 9 * Math.PI * 2 + Math.random() * 0.5, 14 + (Math.random() * 12 | 0), 5 + Math.random() * 3);
  // a ring of short concentric fractures
  for (let k = 0; k < 14; k++) { const a = Math.random() * Math.PI * 2, r = S * (0.12 + Math.random() * 0.06); g.lineWidth = 2; g.beginPath(); g.arc(S / 2, S / 2, r, a, a + 0.3 + Math.random() * 0.4); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function createImpactFX(scene) {
  const tex = crackTexture();
  const decals = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, opacity: 0 }));
    m.visible = false; m.renderOrder = 2; scene.add(m); decals.push({ m, life: 0 });
  }
  let nextDecal = 0;

  // electric arcs: jagged polylines along the ground, re-drawn every few frames
  const BOLTS = 10, SEG = 9;
  const pos = new Float32Array(BOLTS * SEG * 2 * 3);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const arcMat = new THREE.LineBasicMaterial({ color: 0x9fdcff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const arcs = new THREE.LineSegments(geo, arcMat); arcs.frustumCulled = false; arcs.visible = false; arcs.renderOrder = 4; scene.add(arcs);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x6fc8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), glowMat); glow.visible = false; scene.add(glow);
  let arcT = 0, arcR = 2, redraw = 0;
  const arcAt = new THREE.Vector3();
  let groundFn = null;

  function drawArcs() {
    let k = 0;
    for (let b = 0; b < BOLTS; b++) {
      let a = Math.random() * Math.PI * 2, r = 0.2, x = arcAt.x + Math.cos(a) * r, z = arcAt.z + Math.sin(a) * r;
      const reach = arcR * (0.5 + Math.random() * 0.6), step = reach / SEG;
      let y = (groundFn ? groundFn(x, z) : arcAt.y) + 0.06;
      for (let s = 0; s < SEG; s++) {
        pos[k++] = x; pos[k++] = y; pos[k++] = z;
        a += (Math.random() - 0.5) * 1.1; x += Math.cos(a) * step; z += Math.sin(a) * step;
        y = (groundFn ? groundFn(x, z) : arcAt.y) + 0.06 + Math.random() * 0.12;
        pos[k++] = x; pos[k++] = y; pos[k++] = z;
      }
    }
    geo.attributes.position.needsUpdate = true;
  }

  return {
    // strength 0..1 sets the size of the crater and how long the arcs crackle
    slam(x, y, z, strength, ground) {
      groundFn = ground;
      const d = decals[nextDecal]; nextDecal = (nextDecal + 1) % decals.length;
      const size = 3.5 + 4 * strength;
      d.m.scale.set(size, 1, size); d.m.position.set(x, y + 0.12, z); d.m.rotation.y = Math.random() * Math.PI * 2;
      d.m.visible = true; d.life = 1; d.m.material.opacity = 1;
      arcAt.set(x, y, z); arcR = 1.6 + 2.2 * strength; arcT = 0.45 + 0.5 * strength; redraw = 0;
      arcs.visible = true; glow.visible = true; glow.position.set(x, y + 0.35, z); glow.scale.setScalar(arcR * 0.9);
    },
    update(dt) {
      for (const d of decals) if (d.life > 0) {
        d.life -= dt / 12;                                 // ~12 s, fading over the last third
        d.m.material.opacity = Math.min(1, d.life * 3);
        if (d.life <= 0) d.m.visible = false;
      }
      if (arcT > 0) {
        arcT -= dt; redraw -= dt;
        if (redraw <= 0) { drawArcs(); redraw = 0.045; }
        const f = Math.max(0, Math.min(1, arcT / 0.3));
        arcMat.opacity = f * (0.6 + 0.4 * Math.random()); glowMat.opacity = 0.35 * f;
        if (arcT <= 0) { arcs.visible = false; glow.visible = false; }
      }
    },
  };
}
