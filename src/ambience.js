// Atmosphere: street lights reflected as long warm streaks on wet roads at night, and banks of mist that settle in
// the valleys, river and lakes around dawn (and linger after rain).
import * as THREE from 'three';
import { terrainHeight, RIVER, LAKES, HALF } from './world.js';

export function createAmbience({ scene, lamps }) {
  // ---- wet reflections: a streak on the road under each lamp, stretched toward the camera
  const streakTex = (() => { const c = document.createElement('canvas'); c.width = 32; c.height = 128; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,215,160,0)'); gr.addColorStop(0.25, 'rgba(255,215,160,0.9)'); gr.addColorStop(1, 'rgba(255,215,160,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 128); const gx = g.createLinearGradient(0, 0, 32, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, 32, 128); return new THREE.CanvasTexture(c); })();
  const NS = 90;
  const streakMat = new THREE.MeshBasicMaterial({ map: streakTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8 });
  const streaks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.4, 10).rotateX(-Math.PI / 2).translate(0, 0, 4.2), streakMat, NS);
  streaks.frustumCulled = false; streaks.count = 0; streaks.renderOrder = 4; scene.add(streaks);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);

  // ---- valley mist: billboards in the low places
  const spots = [];
  const near = (x, z, list, r) => list.some(([a, b]) => Math.hypot(a - x, b - z) < r);
  for (let x = -HALF + 100; x < HALF - 100; x += 70) for (let z = -HALF + 100; z < HALF - 100; z += 70) {
    const h = terrainHeight(x, z); if (h < 1 || h > 260) continue;
    let m = 0; for (let a = 0; a < 8; a++) m += terrainHeight(x + Math.cos(a * 0.785) * 160, z + Math.sin(a * 0.785) * 160); m /= 8;
    const wet = LAKES.some((L) => Math.hypot(L.x - x, L.z - z) < L.r + 60) || (z > -900 && z < 1800 && near(x, z, RIVER.filter((_, i) => i % 6 === 0), 70));
    if (m - h > 6 || wet) spots.push([x + (Math.random() - 0.5) * 30, h + 5 + Math.random() * 4, z + (Math.random() - 0.5) * 30, 60 + Math.random() * 50]);
  }
  const mistTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const mistU = { map: { value: mistTex }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(1, 1, 1) } };
  const mistMat = new THREE.ShaderMaterial({
    uniforms: mistU, transparent: true, depthWrite: false, fog: false,
    vertexShader: `varying vec2 vUv; varying float vFade;
      void main() { vUv = uv; vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float s = length(instanceMatrix[0].xyz);
        c.xy += position.xy * s * vec2(1.0, 0.35); vFade = smoothstep(2200.0, 900.0, -c.z) * smoothstep(5.0, 40.0, -c.z); gl_Position = projectionMatrix * c; }`,
    fragmentShader: `uniform sampler2D map; uniform float uOpacity; uniform vec3 uColor; varying vec2 vUv; varying float vFade;
      void main() { float a = texture2D(map, vUv).a * uOpacity * vFade; if (a < 0.003) discard; gl_FragColor = vec4(uColor, a); }`,
  });
  const mist = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mistMat, spots.length);
  spots.forEach(([x, y, z, s], i) => { M.compose(P.set(x, y, z), Q.identity(), S.setScalar(s)); mist.setMatrixAt(i, M); });
  mist.frustumCulled = false; mist.renderOrder = 5; scene.add(mist);
  let wetMist = 0;

  return {
    mistCount: spots.length,
    update(dt, { cam, hour, wet, night, horizon, rain }) {
      // streaks for the nearest lamps
      const k = night * Math.min(1, wet * 1.3);
      streakMat.opacity = k * 0.8;
      let n = 0;
      if (k > 0.02) for (const L of lamps) {
        if (n >= NS) break;
        const dx = cam.x - L.x, dz = cam.z - L.z; if (dx * dx + dz * dz > 220 * 220) continue;
        const gy = terrainHeight(L.x, L.z), yaw = Math.atan2(dx, dz);
        M.compose(P.set(L.x, Math.max(gy, L.y - 6.25) + 0.06, L.z), Q.setFromAxisAngle(UP, yaw), S.set(1, 1, 1)); streaks.setMatrixAt(n++, M);
      }
      streaks.count = n; streaks.instanceMatrix.needsUpdate = true;
      // mist: dawn (5–9 h), and for a while after rain
      wetMist += ((rain > 0.3 ? 1 : 0) - wetMist) * Math.min(1, dt / 120);
      const dawn = Math.max(0, Math.min(1, (hour - 4.6) / 0.9)) * (1 - Math.max(0, Math.min(1, (hour - 8) / 1.6)));
      mistU.uOpacity.value = Math.max(dawn * 0.8, wetMist * 0.35) * (hour > 4 && hour < 20 ? 1 : 0.3);
      mistU.uColor.value.copy(horizon).lerp(new THREE.Color(1, 1, 1), 0.35);
      mist.visible = mistU.uOpacity.value > 0.01;
    },
  };
}
