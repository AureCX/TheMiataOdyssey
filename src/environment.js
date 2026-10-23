// Image-based lighting from real (CC0, Poly Haven via pmndrs/assets) sky panoramas: day, dusk and night are blended
// by sun height and rotated so each panorama's sun lines up with the game's sun, then baked with PMREM.
import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import park from './hdri/park.exr.js';
import dawn from './hdri/dawn.exr.js';
import night from './hdri/night.exr.js';

function decode(dataUrl) {
  const bin = atob(dataUrl.split(',')[1]), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const loader = new EXRLoader(); loader.setDataType(THREE.FloatType);
  const d = loader.parse(u8.buffer);
  const t = new THREE.DataTexture(d.data, d.width, d.height, d.format, THREE.FloatType);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = THREE.RepeatWrapping;
  t.needsUpdate = true;
  // brightest texel above the horizon = the sun; average luminance for normalising
  const ch = d.format === THREE.RGBAFormat ? 4 : 3;
  let best = -1, bu = 0.5, sum = 0;
  for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) {
    const k = (y * d.width + x) * ch, l = d.data[k] * 0.2126 + d.data[k + 1] * 0.7152 + d.data[k + 2] * 0.0722;
    sum += l;
    if (y > d.height / 2 && l > best) { best = l; bu = (x + 0.5) / d.width; }
  }
  return { tex: t, sunAz: (bu - 0.5) * Math.PI * 2, avg: sum / (d.width * d.height) };
}

export function createEnvironment(renderer) {
  const maps = [park, dawn, night].map(decode);
  const uniforms = {
    tDay: { value: maps[0].tex }, tDusk: { value: maps[1].tex }, tNight: { value: maps[2].tex },
    uW: { value: new THREE.Vector3(1, 0, 0) },        // day, dusk, night weights (already normalised by brightness)
    uRot: { value: new THREE.Vector3() },             // per-map rotation
    uTint: { value: new THREE.Color(1, 1, 1) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDay; uniform sampler2D tDusk; uniform sampler2D tNight; uniform vec3 uW; uniform vec3 uRot; uniform vec3 uTint;
      varying vec3 vDir;
      vec3 sampleEq(sampler2D t, vec3 d, float rot) {
        float u = (atan(d.z, d.x) + rot) / 6.2831853 + 0.5;
        float v = asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5;
        return texture2D(t, vec2(u, v)).rgb;
      }
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = uW.x * sampleEq(tDay, d, uRot.x) + uW.y * sampleEq(tDusk, d, uRot.y) + uW.z * sampleEq(tNight, d, uRot.z);
        // tame the colour cast: the sun is the key light, the sky only flavours ambient and reflections
        c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, 0.6);
        gl_FragColor = vec4(c * uTint, 1.0);
      }`,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 64, 32), mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  let rt = null;
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return {
    // sunDir: the game's sun direction; returns the baked environment texture
    update(sunDir, sunColor) {
      const y = sunDir.y;
      const wDay = smooth(0.06, 0.32, y), wNight = 1 - smooth(-0.2, -0.03, y), wDusk = Math.max(0, 1 - wDay - wNight);
      // target average radiance per regime, so all three sit at sensible exposure for the scene lights
      uniforms.uW.value.set(wDay * 0.42 / maps[0].avg, wDusk * 0.24 / maps[1].avg, wNight * 0.03 / maps[2].avg);
      const az = Math.atan2(sunDir.z, sunDir.x);
      uniforms.uRot.value.set(maps[0].sunAz - az, maps[1].sunAz - az, maps[2].sunAz - az);
      uniforms.uTint.value.setRGB(1, 1, 1).lerp(sunColor, 0.35 * (1 - wNight));
      const next = pmrem.fromScene(scene, 0, 0.1, 500);
      if (rt) rt.dispose();
      rt = next;
      return rt.texture;
    },
  };
}
