// Weather: clear, overcast, rain and fog, either chosen in the pause menu or cycling on its own ("Auto").
// Rain is a box of GPU line streaks wrapped around the camera; overcast dims the sun and greys the sky and clouds;
// roads turn glossy and lose grip when wet (the physics reads `wet`); heavy rain brings lightning and thunder.
// Thunderstorms (more likely after dark) bring gusty wind and frequent forked lightning; in winter rain falls as snow.
import * as THREE from 'three';

const PRESETS = { clear: { cloud: 0.05, rain: 0, fog: 0 }, overcast: { cloud: 0.75, rain: 0, fog: 0.15 }, rain: { cloud: 1, rain: 1, fog: 0.35 }, storm: { cloud: 1, rain: 1, fog: 0.45, storm: 1 }, fog: { cloud: 0.55, rain: 0, fog: 1 } };

export function createWeather({ scene, sky, audio, seasonSnow = () => 0 }) {
  const N = 6000, BOX = 44, HGT = 28;
  const seed = new Float32Array(N * 2 * 4), end = new Float32Array(N * 2), pos = new Float32Array(N * 2 * 3);
  for (let i = 0; i < N; i++) {
    const s = [Math.random() * BOX, Math.random() * BOX, Math.random() * HGT, 9 + Math.random() * 4];
    seed.set(s, i * 8); seed.set(s, i * 8 + 4); end[i * 2 + 1] = 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  geo.setAttribute('end', new THREE.BufferAttribute(end, 1));
  const uni = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uRain: { value: 0 }, uWind: { value: new THREE.Vector3(1.5, 0, 0.6) }, uLight: { value: 1 }, uSnowF: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false,
    vertexShader: `uniform float uTime; uniform vec3 uCam; uniform float uRain; uniform vec3 uWind; uniform float uSnowF;
      attribute vec4 seed; attribute float end; varying float vA;
      void main() {
        float fall = seed.w * mix(1.0, 0.11, uSnowF);
        vec3 p = vec3(seed.x, mod(seed.z - uTime * fall, ${HGT.toFixed(1)}), seed.y);
        p.xz += uSnowF * 0.6 * vec2(sin(uTime * 1.3 + seed.x * 3.1), cos(uTime * 1.1 + seed.y * 2.7)) + uWind.xz * uTime * uSnowF * 0.3;
        p.xz = uCam.xz + mod(p.xz - uCam.xz, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)};
        p.y += uCam.y - ${(HGT / 2).toFixed(1)};
        vec3 v = normalize(vec3(uWind.x, -fall, uWind.z));
        p -= v * end * mix(0.75, 0.07, uSnowF);
        vA = step(fract(seed.x * 7.31 + seed.y * 3.17), uRain);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `uniform float uLight; uniform float uSnowF; varying float vA; void main() { if (vA < 0.5) discard; gl_FragColor = vec4(mix(vec3(0.75, 0.8, 0.85), vec3(1.0), uSnowF) * uLight, mix(0.32, 0.85, uSnowF)); }`,
  });
  const rain = new THREE.LineSegments(geo, mat); rain.frustumCulled = false; rain.renderOrder = 3; scene.add(rain);

  // forked lightning: a jagged line from the cloud base to the ground, flickering for a moment
  const boltGeo = new THREE.BufferGeometry(); boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(200 * 3), 3));
  const bolt = new THREE.LineSegments(boltGeo, new THREE.LineBasicMaterial({ color: 0xeef2ff, fog: false, transparent: true }));
  bolt.frustumCulled = false; bolt.visible = false; scene.add(bolt);
  let boltT = 0;
  function strike(cam) {
    const a = Math.random() * Math.PI * 2, d = 350 + Math.random() * 1800;
    const gx = cam.x + Math.cos(a) * d, gz = cam.z + Math.sin(a) * d, top = 650;
    const P = boltGeo.attributes.position.array; let n = 0;
    const seg = (x0, y0, z0, x1, y1, z1) => { if (n < 199) { P.set([x0, y0, z0, x1, y1, z1], n * 3); n += 2; } };
    const fork = (x, y, z, yEnd, spread, depth) => {
      while (y > yEnd) { const nx = x + (Math.random() - 0.5) * spread, ny = y - 15 - Math.random() * 30, nz = z + (Math.random() - 0.5) * spread; seg(x, y, z, nx, ny, nz);
        if (depth < 2 && Math.random() < 0.12) fork(nx, ny, nz, ny - 80 - Math.random() * 120, spread * 0.8, depth + 1);
        x = nx; y = ny; z = nz; }
    };
    fork(gx + (Math.random() - 0.5) * 100, top, gz + (Math.random() - 0.5) * 100, cam.y - 50, 40, 0);
    for (let i = n; i < 200; i++) P[i * 3 + 1] = -1e5;
    boltGeo.attributes.position.needsUpdate = true; boltGeo.setDrawRange(0, n);
    bolt.visible = true; boltT = 0.35;
    return d;
  }

  let gustT = 0, thunderVol = 0.6;
  let mode = 'auto', target = PRESETS.clear, nextChange = 120 + Math.random() * 180, flash = 0, flashT = 30, thunderT = -1;
  const cur = { cloud: 0.05, rain: 0, fog: 0, storm: 0 };
  const roadMats = [];
  scene.traverse((o) => { if (o.isMesh && o.material && o.material.userData && o.material.userData.road && !roadMats.includes(o.material)) roadMats.push(o.material); });
  const pick = (night) => { const r = Math.random(); return r < 0.45 ? 'clear' : r < 0.65 ? 'overcast' : r < 0.9 ? (Math.random() < (night ? 0.55 : 0.2) ? 'storm' : 'rain') : 'fog'; };
  let autoState = 'clear', upcoming = pick(false);   // the next state is decided in advance, for the GPS weather radar

  return {
    get mode() { return mode; },
    get state() { return mode === 'auto' ? autoState : mode; },
    // what's coming and in how many seconds (auto weather only)
    get forecast() { return mode === 'auto' ? { next: upcoming, in: nextChange } : null; },
    get wet() { return cur.wet || 0; },
    get rain() { return cur.rain; },
    get cloud() { return cur.cloud; },
    get storm() { return cur.storm; },
    strike: (cam) => strike(cam),
    get snowing() { return cur.rain > 0.2 && seasonSnow() > 0.5; },
    // wind at the surface (m/s, x/z): a breeze, strong and gusty in storms
    wind: new THREE.Vector3(),
    snap() { Object.assign(cur, { storm: 0 }, target); cur.wet = target.rain > 0.3 ? 1 : 0; },   // jump straight to the target (tests, photo setups)
    setMode(m) { mode = m; if (m !== 'auto') target = PRESETS[m]; else target = PRESETS[autoState]; },
    // call after sky.update(); returns the fog density to use
    update(dt, cam, underwater, day) {
      if (mode === 'auto') { nextChange -= dt; if (nextChange <= 0) { autoState = upcoming; upcoming = pick(day < 0.3); target = PRESETS[autoState]; nextChange = 240 + Math.random() * 240; } }
      const k = Math.min(1, dt / 12);          // weather fronts take ~12 s to roll in
      for (const key of ['cloud', 'rain', 'fog', 'storm']) cur[key] += ((target[key] || 0) - cur[key]) * k;
      const snowF = seasonSnow() > 0.5 ? 1 : 0;
      // the roads get wet quickly and dry slowly
      cur.wet = (cur.wet || 0) + ((cur.rain > 0.3 ? 1 : 0) - (cur.wet || 0)) * Math.min(1, dt / (cur.rain > 0.3 ? 20 : 90));
      // sky
      sky.sun.intensity *= 1 - 0.75 * cur.cloud;
      sky.hemi.intensity *= 1 - 0.2 * cur.cloud;
      if (sky.stars) sky.stars.material.opacity *= 1 - 0.9 * Math.max(0, cur.cloud - 0.3) / 0.7;   // cloud hides the stars
      const u = sky.sky.material.uniforms; u.turbidity.value = 4.5 + 14 * cur.cloud; u.rayleigh.value = 1.4 - 1.1 * cur.cloud;
      const grey = 0.55 * day + 0.03;
      sky.horizon.lerp(new THREE.Color(grey, grey * 1.02, grey * 1.06), cur.cloud * 0.7);
      scene.fog.color.copy(sky.horizon);
      // wind: slow gusts, much stronger in a storm
      gustT += dt; const gust = 0.6 + 0.4 * Math.sin(gustT * 0.7) * Math.sin(gustT * 0.23 + 1);
      this.wind.set(1.5 + 9 * cur.storm * gust, 0, 0.6 + 6 * cur.storm * gust * Math.sin(gustT * 0.05));
      uni.uWind.value.copy(this.wind); uni.uSnowF.value = snowF;
      // lightning in heavy rain (not in snow); storms strike every few seconds
      flash = Math.max(0, flash - dt * 6);
      if (boltT > 0) { boltT -= dt; bolt.material.opacity = Math.random() < 0.7 ? 1 : 0.2; if (boltT <= 0) bolt.visible = false; }
      if (cur.rain > 0.8 && !snowF) { flashT -= dt; if (flashT <= 0) {
        flash = 1; const storm = cur.storm > 0.5;
        flashT = storm ? 3 + Math.random() * 9 : 15 + Math.random() * 40;
        const d = storm && Math.random() < 0.7 ? strike(cam) : 1500; thunderT = Math.max(0.3, d / 343); thunderVol = Math.min(1, 900 / d);
      } }
      if (thunderT > 0) { thunderT -= dt; if (thunderT <= 0) audio.thunder && audio.thunder(Math.min(1, (0.5 + Math.random() * 0.4) * (0.6 + thunderVol))); }
      sky.hemi.intensity += flash * 2.5;
      // rain streaks around the camera
      uni.uTime.value += dt; uni.uCam.value.copy(cam); uni.uRain.value = underwater ? 0 : cur.rain; uni.uLight.value = 0.35 + 0.65 * day + flash;
      rain.visible = cur.rain > 0.01 && !underwater;
      // wet roads mirror the lights, most of all at night
      for (const m of roadMats) m.roughness = 0.88 - (0.55 + 0.22 * (1 - day)) * cur.wet;
      audio.rain && audio.rain(underwater || snowF ? 0 : cur.rain * (1 + 0.3 * cur.storm));
      return 0.00022 + cur.fog * 0.011 + cur.rain * 0.0007;
    },
  };
}
