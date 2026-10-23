// Ground detail textures (albedo + normal per surface) packed into texture arrays, and the shader code that
// blends them on the terrain and roads. Layers: 0 grass, 1 forest floor, 2 sand, 3 rock, 4 snow, 5 asphalt/gravel.
import * as THREE from 'three';
import means from '../textures/means.json';

export const LAYERS = ['grass', 'forest', 'sand', 'rock', 'snow', 'asphalt'];
// metres covered by one texture tile
const TILE = { grass: 2.5, forest: 3.5, sand: 4, rock: 6, snow: 6, asphalt: 3 };
const ROUGH = { grass: 0.95, forest: 0.95, sand: 0.9, rock: 0.82, snow: 0.55, asphalt: 0.86 };

function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('failed to load ' + src)); im.src = src; });
}

async function arrayTexture(kind, renderer, srgb) {
  const imgs = await Promise.all(LAYERS.map((n) => loadImage(`textures/${n}_${kind}.jpg`)));
  const S = imgs[0].width, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true });
  const data = new Uint8Array(S * S * 4 * imgs.length);
  imgs.forEach((im, i) => { g.drawImage(im, 0, 0, S, S); data.set(g.getImageData(0, 0, S, S).data, i * S * S * 4); });
  const t = new THREE.DataArrayTexture(data, S, S, imgs.length);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export async function loadSurfaces(renderer) {
  const [alb, nor] = await Promise.all([arrayTexture('albedo', renderer, true), arrayTexture('normal', renderer, false)]);
  return {
    uniforms: {
      tAlb: { value: alb }, tNor: { value: nor },
      uMean: { value: LAYERS.map((n) => new THREE.Vector3(...means[n])) },
      uScale: { value: LAYERS.map((n) => 1 / TILE[n]) },
      uRough: { value: LAYERS.map((n) => ROUGH[n]) },
    },
  };
}

// GLSL shared by terrain and roads: sample one layer at two scales (breaks up tiling), planar on xz.
const COMMON = /* glsl */`
uniform highp sampler2DArray tAlb; uniform highp sampler2DArray tNor;
uniform vec3 uMean[6]; uniform float uScale[6]; uniform float uRough[6];
varying vec3 vSurfW; varying vec3 vSurfN;
vec3 dAlbedo; vec3 dPerturb; float dRough;
void sampleLayer(int i, float w, vec2 uv, float fade) {
  vec3 a = texture(tAlb, vec3(uv, float(i))).rgb;
  vec3 a2 = texture(tAlb, vec3(uv * 0.27 + vec2(0.31, 0.67), float(i))).rgb;
  a = mix(a, a2, 0.35);
  vec2 n = texture(tNor, vec3(uv, float(i))).rg * 2.0 - 1.0;
  dAlbedo += w * mix(a / uMean[i], vec3(1.0), fade);
  dPerturb += w * vec3(n.x, 0.0, n.y) * (1.0 - fade);
  dRough += w * uRough[i];
}
void sampleRockTriplanar(float w, vec3 p, vec3 N, float fade) {
  vec3 b = pow(abs(N), vec3(4.0)); b /= (b.x + b.y + b.z);
  float s = uScale[3];
  vec3 ax = texture(tAlb, vec3(p.zy * s, 3.0)).rgb, ay = texture(tAlb, vec3(p.xz * s, 3.0)).rgb, az = texture(tAlb, vec3(p.xy * s, 3.0)).rgb;
  vec2 nx = texture(tNor, vec3(p.zy * s, 3.0)).rg * 2.0 - 1.0, ny = texture(tNor, vec3(p.xz * s, 3.0)).rg * 2.0 - 1.0, nz = texture(tNor, vec3(p.xy * s, 3.0)).rg * 2.0 - 1.0;
  vec3 a = ax * b.x + ay * b.y + az * b.z;
  vec3 pert = vec3(0.0, nx.y, nx.x) * b.x + vec3(ny.x, 0.0, ny.y) * b.y + vec3(nz.x, nz.y, 0.0) * b.z;
  dAlbedo += w * mix(a / uMean[3], vec3(1.0), fade);
  dPerturb += w * pert * (1.0 - fade);
  dRough += w * uRough[3];
}
`;

function vertexInject(shader, extraAttr) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vSurfW; varying vec3 vSurfN;${extraAttr}`)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurfW = (modelMatrix * vec4(transformed, 1.0)).xyz; vSurfN = normalize(mat3(modelMatrix) * objectNormal);');
}

const APPLY_NORMAL = /* glsl */`
#include <normal_fragment_maps>
{ vec3 Nw = normalize(normalize(vSurfN) + dPerturb * 0.9);
  normal = normalize((viewMatrix * vec4(Nw, 0.0)).xyz); }
`;

// Terrain: per-vertex weights for the 6 layers (wA = grass, forest, sand; wB = rock, snow, gravel)
export function applyTerrainSurfaces(material, surf) {
  material.customProgramCacheKey = () => 'terrain-surfaces';
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, surf.uniforms);
    vertexInject(sh, '\nattribute vec3 wA; attribute vec3 wB; varying vec3 vWA; varying vec3 vWB;');
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWA = wA; vWB = wB;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWA; varying vec3 vWB;\n' + COMMON)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  dAlbedo = vec3(0.0); dPerturb = vec3(0.0); dRough = 0.0;
  float dist = length(cameraPosition - vSurfW);
  float fade = smoothstep(120.0, 700.0, dist);
  float w[6] = float[6](vWA.x, vWA.y, vWA.z, vWB.x, vWB.y, vWB.z);
  float tot = w[0] + w[1] + w[2] + w[3] + w[4] + w[5] + 1e-4;
  for (int i = 0; i < 6; i++) {
    float wi = w[i] / tot;
    if (wi < 0.03) continue;
    if (i == 3) sampleRockTriplanar(wi, vSurfW, normalize(vSurfN), fade);
    else sampleLayer(i, wi, vSurfW.xz * uScale[i], fade);
  }
  diffuseColor.rgb *= dAlbedo;
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = dRough > 0.0 ? dRough : roughnessFactor;')
      .replace('#include <normal_fragment_maps>', APPLY_NORMAL);
  };
}

// Roads: lane-marking map stays; asphalt detail and bumps come from the world-space asphalt layer.
export function applyRoadSurface(material, surf) {
  material.customProgramCacheKey = () => 'road-surface';
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, surf.uniforms);
    vertexInject(sh, '');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + COMMON)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  dAlbedo = vec3(0.0); dPerturb = vec3(0.0); dRough = 0.0;
  float fade = smoothstep(80.0, 500.0, length(cameraPosition - vSurfW));
  sampleLayer(5, 1.0, vSurfW.xz * uScale[5], fade);
  // painted lines are bright: keep them, only modulate them lightly
  float paint = smoothstep(0.35, 0.6, max(diffuseColor.r, diffuseColor.g));
  diffuseColor.rgb *= mix(dAlbedo, mix(vec3(1.0), dAlbedo, 0.3), paint);
  dPerturb *= mix(1.0, 0.4, paint);
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = dRough;')
      .replace('#include <normal_fragment_maps>', APPLY_NORMAL);
  };
}
