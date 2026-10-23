// Post-processing: ambient occlusion (GTAO), bloom, speed blur, tone mapping, with quality levels
// and automatic step-down when the frame rate can't keep up.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const SpeedBlurShader = {
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uAmount; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      if (uAmount > 0.0005) {
        vec2 dir = vUv - vec2(0.5, 0.45);
        float edge = smoothstep(0.08, 0.6, length(dir));   // keep the centre (the car) sharp
        vec4 acc = c;
        for (int i = 1; i < 8; i++) acc += texture2D(tDiffuse, vUv - dir * uAmount * edge * float(i) / 8.0);
        c = acc / 8.0;
      }
      gl_FragColor = c;
    }`,
};

// Clamp the HDR scene before bloom: a few specular glints overflow half-float and would spread as black NaN dots.
const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    bool bad(vec4 c) { return any(isnan(c)) || any(isinf(c)); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      if (bad(c)) {
        vec2 px = 1.0 / vec2(textureSize(tDiffuse, 0));
        vec4 s = vec4(0.0); float n = 0.0;
        for (int i = 0; i < 4; i++) {
          vec2 o = i == 0 ? vec2(px.x, 0.0) : i == 1 ? vec2(-px.x, 0.0) : i == 2 ? vec2(0.0, px.y) : vec2(0.0, -px.y);
          vec4 q = texture2D(tDiffuse, vUv + o);
          if (!bad(q)) { s += q; n += 1.0; }
        }
        c = n > 0.0 ? s / n : vec4(0.0, 0.0, 0.0, 1.0);
      }
      gl_FragColor = min(c, vec4(48.0));
    }`,
};

// Photo mode looks: colour filters, a tilt-shift depth of field around a focus line, and a vignette.
export const PHOTO_FILTERS = ['None', 'Black & white', 'Sepia', 'Vintage', 'Vivid', 'Cool', 'Warm sunset'];
const PhotoShader = {
  uniforms: { tDiffuse: { value: null }, uFilter: { value: 0 }, uDof: { value: 0 }, uFocus: { value: 0.45 }, uVig: { value: 0 }, uPx: { value: new THREE.Vector2(1 / 1280, 1 / 720) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform int uFilter; uniform float uDof, uFocus, uVig; uniform vec2 uPx; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float r = uDof * smoothstep(0.06, 0.42, abs(vUv.y - uFocus)) * 9.0;
      if (r > 0.3) {
        vec4 acc = c; float n = 1.0;
        for (int i = 0; i < 16; i++) { float a = float(i) * 2.39996; float d = sqrt(float(i) + 0.5) / 4.0; acc += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * d * r * uPx); n += 1.0; }
        c = acc / n;
      }
      vec3 col = c.rgb; float l = dot(col, vec3(0.299, 0.587, 0.114));
      if (uFilter == 1) col = vec3(l) * 1.05;
      else if (uFilter == 2) col = vec3(l * 1.07, l * 0.92, l * 0.72);
      else if (uFilter == 3) col = mix(col, vec3(l), 0.35) * vec3(1.08, 1.0, 0.85) + vec3(0.04, 0.03, 0.0);
      else if (uFilter == 4) col = mix(vec3(l), col, 1.45);
      else if (uFilter == 5) col = col * vec3(0.88, 1.0, 1.15);
      else if (uFilter == 6) col = col * vec3(1.15, 0.98, 0.8) + vec3(0.03, 0.01, 0.0);
      float v = smoothstep(0.85, 0.25, length(vUv - 0.5)); col *= mix(1.0, v, uVig);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};

export const QUALITY_NAMES = ['Low', 'Medium', 'High'];

export function createPostFX(renderer, scene, camera, { hideForAO = [] } = {}) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  // multisampled target keeps the hardware antialiasing that direct rendering had (thin seams stay smooth)
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new ShaderPass(SanitizeShader));
  const gtao = new GTAOPass(scene, camera, size.x, size.y);
  gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.5, thickness: 2, scale: 1.2, samples: 10, distanceFallOff: 1 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  gtao.blendIntensity = 0.85;
  // sprites, points and the sky dome confuse the AO normal pass: hide them while it runs
  const aoRender = gtao.render.bind(gtao);
  gtao.render = (...args) => {
    const was = hideForAO.map((o) => o.visible);
    hideForAO.forEach((o) => { o.visible = false; });
    aoRender(...args);
    hideForAO.forEach((o, i) => { o.visible = was[i]; });
  };
  composer.addPass(gtao);
  // high threshold: only lamps, glints and the sun disc bloom, not the whole bright sky
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.3, 0.45, 6.0);
  composer.addPass(bloom);
  const blur = new ShaderPass(SpeedBlurShader);
  composer.addPass(blur);
  composer.addPass(new OutputPass());
  const photoPass = new ShaderPass(PhotoShader); photoPass.enabled = false; composer.addPass(photoPass);

  let quality = 2;
  let fpsT = 0, fpsN = 0, cooldown = 4, onAuto = null;
  const apply = () => {
    gtao.enabled = quality >= 2;
    bloom.enabled = quality >= 1;
    blur.enabled = quality >= 1;
    renderer.shadowMap.enabled = true;
  };
  apply();
  return {
    get quality() { return quality; },
    // photo looks: { filter, dof (0..1), focus (0..1 up the screen), vignette } or null to turn them off
    setPhotoFx(o) {
      photoPass.enabled = !!o && (o.filter > 0 || o.dof > 0 || o.vignette > 0);
      if (o) { const u = photoPass.uniforms; u.uFilter.value = o.filter; u.uDof.value = o.dof; u.uFocus.value = o.focus; u.uVig.value = o.vignette; u.uPx.value.set(1 / size.x, 1 / size.y); }
    },
    bloom,
    setQuality(q) { quality = (q + 3) % 3; apply(); cooldown = 6; },
    onAutoChange(fn) { onAuto = fn; },
    setSize(w, h) { size.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio()); composer.setSize(w, h); gtao.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio()); },
    render(dt, speed) {
      // adaptive quality: step down if the average frame rate stays low
      fpsT += dt; fpsN++; cooldown -= dt;
      if (fpsT > 3) {
        const fps = fpsN / fpsT; fpsT = 0; fpsN = 0;
        if (!window.__noAutoQuality && cooldown <= 0 && quality > 0 && fps < (quality === 2 ? 40 : 28)) { quality--; apply(); cooldown = 6; if (onAuto) onAuto(quality, fps); }
      }
      blur.uniforms.uAmount.value = Math.min(1, Math.max(0, (speed - 28) / 45)) * 0.035;
      if (quality === 0 && !photoPass.enabled) renderer.render(scene, camera);
      else composer.render(dt);
    },
  };
}
