import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import {
  buildWorld, spawnPoint, groundHeight, terrainHeight, biomeName, roadAt, nearestRoadPoint, waveHeight, surfaceAt, townAt, TOWNS,
  heights, NV, N, HALF, CELL, roads, LAKES,
} from './world.js';
import { buildTowns, STATIONS, GARAGES } from './towns.js';
import { createEconomy, garageUI } from './economy.js';
import { createJobs } from './jobs.js';
import { createPolice } from './police.js';
import { createCityLife } from './citylife.js';
import { createRace } from './race.js';
import { buildWorld2 } from './world2.js';
import { createTransport } from './transport.js';
import { createAviation } from './aviation.js';
import { createRally } from './rally.js';
import { createPhotos } from './photos.js';
import { createMeet } from './meet.js';
import { createArena } from './arena.js';
import { createRides } from './rides.js';
import { createStats } from './stats.js';
import { createHome } from './home.js';
import { createAmbience } from './ambience.js';
import { createCustom } from './custom.js';
import { createService } from './service.js';
import { createChallenges } from './challenges.js';
import { createCareer } from './career.js';
import { createIsland } from './island.js';
import { createRaceway } from './raceway.js';
import { badgeCanvas } from './badge.js';
import { createWildlife } from './wildlife.js';
import { PHOTO_FILTERS } from './postfx.js';
import { createDrift, createGhosts } from './drift.js';
import { buildExtras } from './extras.js';
import { createAirport } from './airport.js';
import { createInstruments } from './instruments.js';
import { AIRPORT, airportAt, ROUNDABOUTS, STATION_LOTS, roofAt, JUNCTIONS, SHOP_LOTS, AIRSTRIP, SEAPLANE, TRACK, SKI, RAIL, FESTIVAL, HARBOUR, ARENA, ROAD_JOINS, DRIVEIN } from './world.js';
import { createMissions } from './missions.js';
import { createWeather } from './weather.js';
import { createSeasons, SEASONS } from './seasons.js';
import { createFloods } from './floods.js';
import { buildTerrain, buildRoads, buildWater, buildSky, buildVegetation, buildClouds, nearbyColliders } from './scenery.js';
import { loadSurfaces } from './surfaces.js';
import { createEnvironment } from './environment.js';
import { createPostFX, QUALITY_NAMES } from './postfx.js';
import { createSkidMarks } from './skidmarks.js';
import { createRadio } from './radio.js';
import { createGamepad, PAD } from './gamepad.js';
import { createMX5, DIMS } from './car.js';
import { Vehicle, GEARS, waterCalmAt } from './physics.js';
import { createTraffic } from './traffic.js';
import { createAudio } from './audio.js';
import { createEffects } from './particles.js';
import { createImpactFX } from './impactfx.js';
import { createWeapons } from './weapons.js';
import { createGPS } from './gps.js';
import { createMirror } from './mirror.js';
import { createDamage } from './damage.js';
import { createEvents, rallyBonus } from './events.js';

const $ = (id) => document.getElementById(id);
const setStage = (label, frac) => { $('stage').textContent = label; $('bar').firstElementChild.style.width = `${Math.round(frac * 100)}%`; };

// ------------------------------------------------------------------ Renderer
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(window.__testLow ? 0.5 : Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.25, 30000);
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
});

// ------------------------------------------------------------------ Build
async function boot() {
  // detailed car model loads in parallel with world generation; the procedural car is the fallback
  // shipped as base64 text (mx5.glb.txt) because the artifact host only serves web file types
  // mx5v2: Res1n's 1989 MX-5 with its soft top (meshopt-compressed); mx5: the older FBX-derived model
  const loadGlb = (url) => fetch(url)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then((b64) => {
      const bin = atob(b64.trim()), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(u8.buffer, '');
    });
  const modelP = loadGlb('mx5v2.glb.txt')
    .catch((e) => { console.warn('mx5v2 not loaded, trying the older model', e); return loadGlb('mx5.glb.txt'); })
    .catch((e) => { console.warn('detailed model not loaded, using procedural car', e); return null; });
  const surfP = loadSurfaces(renderer).catch((e) => { console.warn('ground textures not loaded', e); return null; });
  await buildWorld((label, f) => setStage(label, f));
  const surf = await surfP;
  const tick = () => new Promise((r) => setTimeout(r, 0));
  setStage('Painting terrain', 0.62); await tick();
  scene.userData.terrain = buildTerrain(scene, surf);
  setStage('Laying asphalt', 0.72); await tick();
  buildRoads(scene, renderer, surf);
  setStage('Building towns', 0.74); await tick();
  const towns = buildTowns(scene);
  const airport = createAirport(scene);
  setStage('Filling the sea', 0.76); await tick();
  const water = buildWater(scene);
  setStage('Planting forests', 0.8); await tick();
  const veg = buildVegetation(scene);
  setStage('Raising the sky', 0.9); await tick();
  const sky = buildSky(scene);
  const clouds = buildClouds(scene);
  setStage('Building the roadster', 0.95); await tick();
  setStage('Fitting the detailed MX-5', 0.97);
  const model = await modelP;
  start({ water, veg, sky, clouds, model, towns, airport, loadGlb });
}

function start({ water, veg, sky, clouds, model, towns, airport, loadGlb }) {
  // reflections and ambient light from real sky panoramas (day / dusk / night), rotated to the game's sun
  const environment = createEnvironment(renderer);
  let envTime = -99;
  function updateEnv(sunDir) { scene.environment = environment.update(sunDir, sky.sunColor); }

  // ---------------------------------------------------------------- Player
  const car = createMX5();
  if (model) { try { car.useModel(model.scene); } catch (e) { console.warn('detailed model failed, using procedural car', e); } }
  scene.add(car.root);
  car.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const veh = new Vehicle();
  const sp = spawnPoint();
  veh.reset(sp.x, groundHeight(sp.x, sp.z) + 0.75, sp.z, sp.heading);

  const traffic = createTraffic(scene, 34);
  const fx = createEffects(scene);
  const impact = createImpactFX(scene);
  const skids = createSkidMarks(scene);
  const postfx = createPostFX(renderer, scene, camera, { hideForAO: [sky.sky, sky.stars, clouds.group, ...fx.objects] });
  postfx.onAutoChange((q, fps) => toast(`Graphics ${QUALITY_NAMES[q]} (${Math.round(fps)} fps) · P to change`));
  window.addEventListener('resize', () => postfx.setSize(window.innerWidth, window.innerHeight));
  let trafficOn = true;
  let flightAssist = true;
  const audio = createAudio();
  const radio = createRadio(() => audio.ctx, () => audio.dest);
  const pad = createGamepad((id, on) => toast(on ? 'Controller connected' : 'Controller disconnected'));
  // per-viewer settings (best effort: storage may be unavailable)
  const settings = (() => { try { return JSON.parse(localStorage.getItem('mx5-settings') || '{}'); } catch { return {}; } })();
  const saveSettings = () => { try { localStorage.setItem('mx5-settings', JSON.stringify(settings)); } catch { /* private mode */ } };
  if (settings.realism === false) veh.realism = false;
  veh.fuelRate = veh.realism ? 10 : 4;
  if (typeof settings.volume === 'number') radio.setVolume(settings.volume);
  let paused = false;
  const damage = createDamage({ car, veh, fx, audio, onToast: (m) => toast(m), onWingsLost: () => { setMode('car'); morphPlane = 0; toast('Wings torn off · press X to repair'); } });

  // ---------------------------------------------------------------- Input
  const keys = new Set();
  const onceKeys = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Escape') { e.preventDefault(); if (garage.open) garage.close(); else if (photo.on) setPhoto(false); else togglePause(); return; }
    if (paused || garage.open) return; // the menu is plain buttons: Tab / Enter / arrows work natively
    keys.add(e.code); onceKeys.add(e.code);
    // shortcuts follow the printed letter (AZERTY, QWERTZ…); driving keys stay positional (WASD = ZQSD on AZERTY)
    if (e.key && e.key.length === 1) onceKeys.add('Char' + e.key.toUpperCase());
    audio.start();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  const pressed = (...c) => c.some((k) => keys.has(k));
  const once = (c) => { const v = onceKeys.has(c); onceKeys.delete(c); return v; };
  const act = (ch) => once('Char' + ch);

  // look-around drag
  let drag = null, lookYaw = 0, lookPitch = 0, lastDrag = 0;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); audio.start(); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (photo.on) { photo.yaw -= (e.clientX - drag.x) * 0.004; photo.pitch = Math.max(-1.5, Math.min(1.5, photo.pitch - (e.clientY - drag.y) * 0.004)); drag = { x: e.clientX, y: e.clientY }; return; }
    lookYaw -= (e.clientX - drag.x) * 0.006; lookPitch = Math.max(-0.4, Math.min(1.2, lookPitch + (e.clientY - drag.y) * 0.004));
    drag = { x: e.clientX, y: e.clientY }; lastDrag = performance.now();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => { if (photo.on) { photo.fov = Math.max(12, Math.min(100, photo.fov + Math.sign(e.deltaY) * 4)); e.preventDefault(); } }, { passive: false });

  // ---------------------------------------------------------------- Photo mode: frozen world, free camera, no HUD
  const photo = { on: false, yaw: 0, pitch: 0, fov: 60, filter: 0, dof: 0, focus: 0.45, vig: 0, sticker: false };
  const photoFx = () => { postfx.setPhotoFx(photo.on ? { filter: photo.filter, dof: photo.dof, focus: photo.focus, vignette: photo.vig } : null);
    $('photoFx').textContent = `F filter: ${PHOTO_FILTERS[photo.filter]} · V blur: ${['off', 'soft', 'strong'][Math.round(photo.dof * 2)]}${photo.dof ? ' (Z/X focus)' : ''} · G vignette ${photo.vig ? 'on' : 'off'} · L badge ${photo.sticker ? 'on' : 'off'}`; };
  const logoImg = badgeCanvas(256);   // the photo sticker
  // the gallery: small copies of your photos, kept in this browser
  const gallery = (() => { try { return JSON.parse(localStorage.getItem('mx5-gallery') || '[]'); } catch { return []; } })();
  const saveGallery = () => { try { localStorage.setItem('mx5-gallery', JSON.stringify(gallery)); } catch { gallery.splice(0, 4); try { localStorage.setItem('mx5-gallery', JSON.stringify(gallery)); } catch { /* full */ } } };
  function setPhoto(on) {
    photo.on = on;
    document.body.classList.toggle('photo', on);
    $('photoBar').hidden = !on;
    audio.setPaused(on);
    photoFx();
    if (on) {
      if (paused) togglePause(false);
      camera.getWorldDirection(tmpV); photo.yaw = Math.atan2(tmpV.x, tmpV.z); photo.pitch = Math.asin(Math.max(-1, Math.min(1, tmpV.y))); photo.fov = camera.fov;
    }
  }
  function showGallery() {
    const el = $('galleryUI'); el.hidden = false;
    el.innerHTML = `<div class="panel"><h2>Photo gallery</h2>${gallery.length ? '' : '<p>No photos yet: press 0 for photo mode, Enter to save.</p>'}<div class="grid">${gallery.slice().reverse().map((g3, i) => `<figure><img src="${g3.img}" alt="Photo ${i + 1}"><figcaption>${g3.spot ? g3.spot + ' · ' : ''}${new Date(g3.t).toLocaleDateString()}</figcaption><button data-del="${g3.t}" aria-label="Delete photo">✕</button></figure>`).join('')}</div><button class="primary" data-close>Close</button></div>`;
  }
  $('galleryUI').addEventListener('click', (e) => { const d = e.target.closest('[data-del]'); if (d) { const k = gallery.findIndex((g3) => String(g3.t) === d.dataset.del); if (k >= 0) gallery.splice(k, 1); saveGallery(); showGallery(); return; } if (e.target.closest('[data-close]') || e.target.id === 'galleryUI') $('galleryUI').hidden = true; });
  function savePhoto() {
    postfx.render(0, 0);
    const src = renderer.domElement, c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const g2 = c.getContext('2d'); g2.drawImage(src, 0, 0);
    if (photo.sticker) { const w = c.width * 0.09, h = w; g2.globalAlpha = 0.92; g2.drawImage(logoImg, c.width - w - c.width * 0.02, c.height - h - c.width * 0.02, w, h); g2.globalAlpha = 1; }
    const a = document.createElement('a'); a.download = `mx5-odyssey-${Date.now()}.png`; a.href = c.toDataURL('image/png'); a.click();
    toast('Photo saved'); $('toast').style.opacity = 1;
    const spot = photos.check(camera) || events.postcardCheck(camera, timeOfDay, island.lighthouse);
    const t = document.createElement('canvas'); t.width = 320; t.height = Math.round(320 * c.height / c.width); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
    gallery.push({ t: Date.now(), img: t.toDataURL('image/jpeg', 0.7), spot: spot ? spot.name || spot.hint : null }); if (gallery.length > 24) gallery.shift(); saveGallery();
    stats.event('photos', 1);
  }
  $('photoSave').addEventListener('click', (e) => { e.stopPropagation(); savePhoto(); });
  function photoFrame(dt) {
    const sp = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 40 : 10) * dt;
    const f = tmpV.set(Math.sin(photo.yaw) * Math.cos(photo.pitch), Math.sin(photo.pitch), Math.cos(photo.yaw) * Math.cos(photo.pitch));
    const r = tmpV2.set(-Math.cos(photo.yaw), 0, Math.sin(photo.yaw));
    const mv = (k, v, s) => { if (keys.has(k)) camera.position.addScaledVector(v, s); };
    mv('KeyW', f, sp); mv('KeyS', f, -sp); mv('KeyD', r, sp); mv('KeyA', r, -sp);
    if (keys.has('KeyE')) camera.position.y += sp; if (keys.has('KeyQ')) camera.position.y -= sp;
    camera.position.y = Math.max(camera.position.y, groundHeight(camera.position.x, camera.position.z) + 0.3);
    if (onceKeys.has('BracketRight')) timeOfDay = (timeOfDay + 0.5) % 24;
    if (onceKeys.has('BracketLeft')) timeOfDay = (timeOfDay + 23.5) % 24;
    if (onceKeys.has('Enter') || onceKeys.has('NumpadEnter')) savePhoto();
    if (onceKeys.has('Digit0') || onceKeys.has('Numpad0')) setPhoto(false);
    if (onceKeys.has('KeyF')) { photo.filter = (photo.filter + 1) % PHOTO_FILTERS.length; photoFx(); }
    if (onceKeys.has('KeyV')) { photo.dof = (Math.round(photo.dof * 2) + 1) % 3 / 2; photoFx(); }
    if (onceKeys.has('KeyG')) { photo.vig = photo.vig ? 0 : 0.8; photoFx(); }
    if (onceKeys.has('KeyL')) { photo.sticker = !photo.sticker; photoFx(); }
    if (keys.has('KeyZ')) { photo.focus = Math.max(0.05, photo.focus - dt * 0.3); photoFx(); }
    if (keys.has('KeyX')) { photo.focus = Math.min(0.95, photo.focus + dt * 0.3); photoFx(); }
    onceKeys.clear();
    camera.up.set(0, 1, 0);
    camera.lookAt(tmpV2.copy(camera.position).add(f));
    camera.fov = photo.fov; camera.updateProjectionMatrix();
    const day = sky.update(timeOfDay, veh.pos);
    renderer.toneMappingExposure = (0.55 + 0.35 * day) * (1 - 0.18 * weather.cloud);
    weather.update(0.0001, camera.position, false, day);
    towns.setNight(timeOfDay < 6.2 || timeOfDay > 19.2 ? 1 : timeOfDay < 7.2 ? (7.2 - timeOfDay) : timeOfDay > 18.2 ? (timeOfDay - 18.2) : 0);
    airport.update(0.0001, null);
    events.scenery(dt, camera.position, timeOfDay);
    postfx.render(dt, 0);
  }

  // mode buttons
  let mode = 'car';
  const modeBtns = { car: $('m-car'), boat: $('m-boat'), plane: $('m-plane'), mech: $('m-mech') };
  // Starscream-style launch from a standing robot: crouch, leap, pirouette and transform at the top of the jump
  let leap = null;
  const setMode = (m, force) => {
    if (m === mode && !force) return;
    if (m === 'plane' && car.state.wingsLost) { toast('Wings damaged · press X to repair'); return; }
    if (!force && m === 'plane' && mode === 'mech' && morphMech >= 1 && veh.mech && !veh.mech.air && !leap) { leap = { phase: 'crouch', t: 0 }; car.mechAction('leap'); return; }
    if (m !== 'plane') leap = null;
    mode = m;
    for (const [k, b] of Object.entries(modeBtns)) b.setAttribute('aria-pressed', String(k === m));
    toast({ car: 'Roadster', boat: 'Boat kit deploying', plane: 'Wings unfolding', mech: 'Transforming' }[m]);
    if (m === 'plane') veh.throttleLever = 0;
  };
  for (const [k, b] of Object.entries(modeBtns)) b.addEventListener('click', () => { setMode(k); audio.start(); b.blur(); });
  // sleep at home: fade out, morning, full tank, save
  function goodnight() {
    $('fade').classList.add('on');
    setTimeout(() => { timeOfDay = 7; veh.fuel = veh.tank; stats.event('slept'); const sp = home.spawn; settings.save = { x: sp.x, z: sp.z, h: sp.heading, t: 7, fuel: veh.fuel, eng: veh.dmg.engine }; saveSettings(); toast('Good morning! Tank filled, game saved'); $('fade').classList.remove('on'); }, 1200);
  }
  // put the plane in the air (challenges): wings out, flying at `speed` along `heading`
  function spawnPlane(x, y, z, heading, speed) {
    if (transport.ride) transport.cancel(veh);
    setMode('plane', true); morphPlane = 1; morphBoat = 0; morphMech = 0; veh.planeT = 1; veh.boatT = 0;
    veh.reset(x, y, z, heading); veh.vel.set(Math.sin(heading) * speed, 0, Math.cos(heading) * speed); veh.throttleLever = 0.45;
  }

  let toastTimer = 0;
  function toast(msg) { $('toast').textContent = msg; $('toast').style.opacity = 1; toastTimer = 2.2; }
  const econ = createEconomy({ settings, saveSettings, toast: (m) => toast(m), veh });
  const cashEl = $('cash'); const showCash = () => { cashEl.textContent = econ.fmt(econ.cash); cashEl.classList.add('flash'); setTimeout(() => cashEl.classList.remove('flash'), 300); };
  econ.onChange = showCash; showCash();
  let garageAt = null, garageStill = 0;
  const custom = createCustom({ car, settings, saveSettings });
  const service = createService({ scene, toast: (m) => toast(m), econ });
  const garage = garageUI({ root: document.body, econ, custom,
    onRepair: () => { damage.repair(); toast('Serviced and repaired'); },
    onPaint: (c) => { car.setPaint(c); settings.paint = c; saveSettings(); },
    onWheels: (w) => { car.setWheels(w); settings.wheels = w; saveSettings(); },
    onClose: () => { audio.setPaused(false); keys.clear(); canvas.focus?.(); } });
  const missions = createMissions({ scene, settings, saveSettings, toast, onReward: (amt, why) => econ.earn(amt, why),
    onDone: (def, t) => { if (def.id === 'lap' && lapGhost) { const nb = ghosts.lap(t); if (nb) toast('Highway lap ghost saved'); ghosts.stop(); lapGhost = false; } } });
  const jobs = createJobs({ scene, missions, toast });
  const aviation = createAviation({ scene, airport, toast: (m) => toast(m), settings, saveSettings, econ, missions, audio });
  jobs.pilot = aviation;
  const windV = new THREE.Vector3();
  let cargoKg = 0;
  const extras = buildExtras(scene);
  const police = createPolice({ scene, audio, toast, econ });
  const city = createCityLife(scene);
  traffic.signal = city.signal;
  traffic.sideStop = city.sideStop;
  const world2 = buildWorld2(scene);
  const transport = createTransport({ world2, toast: (m) => toast(m), econ });
  let fPress = false, carried = false;
  const ghosts = createGhosts({ scene, settings, saveSettings });
  const race = createRace({ scene, toast, onReward: (amt, why) => econ.earn(amt, why), ghosts });
  const drift = createDrift({ scene, toast, settings, saveSettings, onReward: (amt, why) => econ.earn(amt, why) });
  { const earn = econ.earn; econ.earn = (amount, why) => { if (why && /· P1$/.test(why)) stats.event('win'); if (why && /^Rally /.test(why)) amount *= rallyBonus(); return earn(amount, why); }; }
  const rides = createRides({ scene, toast: (m) => toast(m), fx });
  const rally = createRally({ scene, toast: (m) => toast(m), settings, saveSettings, econ, ghosts, audio });
  let mx5P = null; const loadMx5 = () => mx5P || (mx5P = loadGlb('mx5v2.glb.txt').catch(() => null));
  const meet = createMeet({ scene, toast: (m) => toast(m), econ, loadModel: loadMx5, settings, saveSettings });
  const arena = createArena({ scene, toast: (m) => toast(m), econ, fx, audio, settings, saveSettings, onShake: (v) => { shake = Math.max(shake, v); } });
  // the mech's shield (an arena upgrade): a hex bubble, faint during a fight, flaring when it takes a hit
  const shield = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); g.strokeStyle = 'rgba(140,240,255,1)'; g.lineWidth = 3;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 12; x++) { const cx = x * 22 + (y % 2) * 11, cy = y * 16; g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6; g.lineTo(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11); } g.closePath(); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2);
    const m = new THREE.Mesh(new THREE.SphereGeometry(2.7, 32, 20), new THREE.MeshBasicMaterial({ map: t, color: 0x60e0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.visible = false; scene.add(m); return { m, flash: 0 };
  })();
  arena.onHurt = () => { if (arena.story.up.shield) shield.flash = 1; };
  const weapons = createWeapons({ up: () => arena.story.up, scene, fx, impact, audio, arena, veg, traffic, onShake: (v) => { shake = Math.max(shake, v); }, toast: (m) => toast(m) });
  const island = createIsland({ scene });
  const raceway = createRaceway({ scene });
  const photos = createPhotos({ scene, settings, saveSettings, econ, toast: (m) => toast(m), extra: [{ id: 'lighthouse', name: 'Gull Island lighthouse', x: island.lighthouse.x - 45, z: island.lighthouse.z - 60, sub: [island.lighthouse.x, island.lighthouse.y, island.lighthouse.z] }, ...(drift.zone ? [{ id: 'driftzone', name: 'Drift zone arch', x: drift.zone.road.pts[drift.zone.i0 - 14][0], z: drift.zone.road.pts[drift.zone.i0 - 14][1], sub: [drift.zone.road.pts[drift.zone.i0][0], drift.zone.road.h[drift.zone.i0] + 4, drift.zone.road.pts[drift.zone.i0][1]] }] : [])] });
  const stats = createStats({ settings, saveSettings, toast: (m) => toast(m), root: document.body,
    ctx: { econ, photos, get pilot() { return aviation.pilot; }, pilotName: () => aviation.licence, onUnlock: () => home && home.setTrophies(stats.unlocked.length) } });
  const home = createHome({ scene, toast: (m) => toast(m) });
  // GPS: destinations are gathered fresh each time the list opens (so the current objective is always there)
  const gps = createGPS({ toast: (m) => toast(m), radio, clock: (addH = 0) => { const t = (timeOfDay + addH + 24) % 24, h = Math.floor(t), m = Math.floor((t - h) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; } });
  // rear-view mirror (8) and the phone mount for the GPS in the cockpit view
  const mirror = createMirror(renderer, scene);
  const phone = (() => {
    const g = new THREE.Group(), t = new THREE.CanvasTexture(gps.canvas); t.colorSpace = THREE.SRGBColorSpace;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.1, 0.012), new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.4 })); g.add(body);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.158, 0.088), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })); scr.position.z = 0.0065; g.add(scr);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 6), new THREE.MeshStandardMaterial({ color: 0x222222 })); arm.position.set(0, -0.07, -0.02); g.add(arm);
    g.visible = false; scene.add(g); return { g, t };
  })();
  gps.onOpen = () => {
    const P = [], add = (name, cat, x, z, top) => { if (Number.isFinite(x) && Number.isFinite(z)) P.push({ name, cat, x, z, top }); };
    const nx = missions.next; if (nx) add(`Current objective`, 'Places', nx.x, nx.z, true);
    if (home) add('Home', 'Places', home.place.x, home.place.z, true);
    for (const t of TOWNS) add(t.name, 'Towns', t.x, t.z);
    for (const st of STATIONS) add(st.name, 'Fuel', st.x, st.z);
    for (const gg of GARAGES) add(gg.name, 'Garages', gg.x, gg.z);
    for (const sh of SHOP_LOTS) add(sh.name, 'Places', sh.cx, sh.cz);
    add(AIRPORT.name, 'Transport', -470, 0); add('Mesa Field airstrip', 'Transport', AIRSTRIP.x, AIRSTRIP.z);
    if (TRACK.entrance) add(TRACK.name, 'Places', TRACK.entrance.x, TRACK.entrance.z);
    if (world2.ferry) for (const [nm, q] of Object.entries(world2.ferry.quays)) add(`Ferry · ${nm}`, 'Transport', q.x, q.z);
    if (world2.cable) add('Silverpine cable car', 'Transport', world2.cable.centres['Silverpine base'].x, world2.cable.centres['Silverpine base'].z);
    for (const st of RAIL.stations) add(`${st.name} station`, 'Transport', RAIL.road.pts[st.i][0], RAIL.road.pts[st.i][1]);
    add('Silverpine Peaks ski area', 'Places', SKI.lot.cx, SKI.lot.cz);
    if (island.village) add('Gull Bay resort', 'Places', island.village.x, island.village.z);
    add('Gull Island lighthouse', 'Places', island.lighthouse.x, island.lighthouse.z);
    add('Port Ruby harbour', 'Places', HARBOUR.cx, HARBOUR.cz);
    add('Red Rock Quarry (mech arena)', 'Places', ARENA.x, ARENA.z);
    if (seasons.season === 'winter') add('Christmas market', 'Places', FESTIVAL.x, FESTIVAL.z); else add('Fairfield summer festival', 'Places', FESTIVAL.x, FESTIVAL.z);
    if (seasons.season === 'summer' && island.village) add('Gull Bay beach party', 'Places', island.village.x, island.village.z);
    add(DRIVEIN.name, 'Places', DRIVEIN.x, DRIVEIN.z);
    gps.setPOIs(P);
  };
  const challenges = createChallenges({ scene, toast: (m) => toast(m), econ, settings, saveSettings, missions, loadModel: loadMx5, stats });
  const career = createCareer({ scene, rides, toast: (m) => toast(m), econ, settings, saveSettings, missions, stats, home, fx });
  police.onEscape = () => stats.event('escape3');
  // weekly board, hitchhikers, seasonal events, night city and postcards
  const navTo = (name, x, z) => { const ri = rides.info, P0 = ri ? ri.pos : veh.pos; tmpV.set(0, 0, 1).applyQuaternion(veh.q); gps.navigate({ name, x, z }, P0, ri ? ri.yaw : Math.atan2(tmpV.x, tmpV.z)); };
  const events = createEvents({ scene, toast: (m) => toast(m), econ, settings, saveSettings, missions, ghosts, drift, stats, nav: navTo });
  const ambience = createAmbience({ scene, lamps: towns.lamps || [] });
  const wildlife = createWildlife({ scene, toast: (m) => toast(m) });
  if (home) home.setTrophies(stats.unlocked.length);
  let dashT = 0, poundH = 0, wasMechAir = false;
  let lapGhost = false, saveT = 0, lastDay = 1, iceWarn = 0;
  let pedToastT = 0;
  const seasons = createSeasons({ scene, settings, saveSettings, toast });
  const weather = createWeather({ scene, sky, audio, seasonSnow: () => seasons.winter });
  const floods = createFloods({ scene, toast });
  if (settings.weather) weather.setMode(settings.weather);
  if (settings.engineVol != null) audio.setEngineVolume(settings.engineVol);
  if (settings.paint) car.setPaint(settings.paint);
  if (settings.wheels) car.setWheels(settings.wheels);

  // ---------------------------------------------------------------- HUD: gauges
  const tachCtx = $('tach').getContext('2d'), spdCtx = $('speedo').getContext('2d');
  const instruments = createInstruments({ panel: $('instr'), hud: $('mechHud'), airport: AIRPORT });
  const dmgCtx = $('dmg').getContext('2d'), tyreCtx = $('tyres').getContext('2d');
  // tyre temperature (inner block), wear (bar) and brake temperature (disc ring) for each corner
  function drawTyres() {
    const c = tyreCtx, W = c.canvas.width, H = c.canvas.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(10,11,13,0.72)'; c.beginPath(); c.roundRect(0, 0, W, H, 10); c.fill();
    const tcol = (t) => t < 50 ? `hsl(205,70%,${45 + (50 - t) * 0.2}%)` : t < 105 ? `hsl(${130 - (t - 50) * 1.2},70%,45%)` : `hsl(${Math.max(0, 64 - (t - 105) * 2)},85%,50%)`;
    c.font = '600 15px "Barlow Condensed", sans-serif'; c.textAlign = 'center';
    veh.wheels.forEach((w, i) => {
      const x = i % 2 === 0 ? W * 0.27 : W * 0.73, y = i < 2 ? H * 0.27 : H * 0.68;
      c.fillStyle = tcol(w.temp); c.fillRect(x - 16, y - 26, 32, 52);
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x - 16, y - 26, 32, 52 * (1 - w.wear));
      c.strokeStyle = w.brakeT > 380 ? `hsl(${Math.max(0, 40 - (w.brakeT - 380) / 6)},100%,55%)` : 'rgba(255,255,255,0.35)'; c.lineWidth = 3; c.strokeRect(x - 16, y - 26, 32, 52);
      c.fillStyle = '#f3efe6'; c.fillText(`${Math.round(w.temp)}°`, x, y + 5);
    });
    c.fillStyle = '#a59f93'; c.font = '600 13px "Barlow Condensed", sans-serif';
    const bmax = Math.max(...veh.wheels.map((w) => w.brakeT));
    c.fillText(`BRAKES ${Math.round(bmax)}°C${bmax > 380 ? ' · FADE' : ''}`, W / 2, H * 0.94);
    c.fillText(veh.realism ? `AIR ${Math.round(veh.ambientT)}°C` : 'SIM-ARCADE · NO FADE', W / 2, H * 0.08);
  }
  function drawGauge(ctx, value, max, majors, label, unit, redFrom, sub) {
    const S = ctx.canvas.width, c = S / 2, R = S * 0.46;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(10,11,13,0.78)'; ctx.beginPath(); ctx.arc(c, c, R + 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 2; ctx.stroke();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    const ang = (v) => a0 + (a1 - a0) * Math.max(0, Math.min(1, v / max));
    if (redFrom != null) { ctx.strokeStyle = '#c8102e'; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(c, c, R - 10, ang(redFrom), a1); ctx.stroke(); }
    ctx.lineCap = 'butt';
    for (let v = 0; v <= max + 1e-6; v += majors / 2) {
      const a = ang(v), major = Math.abs(v / majors - Math.round(v / majors)) < 1e-6;
      ctx.strokeStyle = '#f3efe6'; ctx.lineWidth = major ? 4 : 2;
      ctx.beginPath(); ctx.moveTo(c + Math.cos(a) * (R - (major ? 22 : 14)), c + Math.sin(a) * (R - (major ? 22 : 14)));
      ctx.lineTo(c + Math.cos(a) * (R - 4), c + Math.sin(a) * (R - 4)); ctx.stroke();
      if (major) {
        ctx.fillStyle = '#f3efe6'; ctx.font = `600 ${S * 0.085}px "Barlow Condensed", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(Math.round(label === 'rpm' ? v / 1000 : v)), c + Math.cos(a) * (R - 44), c + Math.sin(a) * (R - 44));
      }
    }
    ctx.fillStyle = '#a59f93'; ctx.font = `500 ${S * 0.055}px "Barlow Condensed", sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(unit, c, c + R * 0.42);
    if (sub) { ctx.fillStyle = '#f3efe6'; ctx.font = `700 ${S * 0.13}px "Barlow Condensed", sans-serif`; ctx.fillText(sub, c, c + R * 0.7); }
    const a = ang(value);
    ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(c - Math.cos(a) * 16, c - Math.sin(a) * 16); ctx.lineTo(c + Math.cos(a) * (R - 16), c + Math.sin(a) * (R - 16)); ctx.stroke();
    ctx.fillStyle = '#1b1c1f'; ctx.beginPath(); ctx.arc(c, c, 13, 0, Math.PI * 2); ctx.fill();
  }

  // ---------------------------------------------------------------- HUD: maps
  const mapImg = document.createElement('canvas');
  mapImg.width = mapImg.height = 1024;
  {
    const g = mapImg.getContext('2d');
    const img = g.createImageData(1024, 1024);
    for (let j = 0; j < 1024; j++) for (let i = 0; i < 1024; i++) {
      const gi = Math.min(N, Math.round(i / 1023 * N)), gj = Math.min(N, Math.round(j / 1023 * N));
      const h = heights[gj * NV + gi];
      const x = -HALF + gi * CELL, z = -HALF + gj * CELL;
      const hx = heights[gj * NV + Math.min(N, gi + 1)] - h;
      const shade = Math.max(0.55, Math.min(1.25, 1 - hx * 0.08));
      let r, gg, b;
      if (h < 0) { const d = Math.min(1, -h / 25); r = 40 - 25 * d; gg = 110 - 50 * d; b = 140 - 40 * d; }
      else {
        const nm = biomeName(x, z, h);
        [r, gg, b] = nm === 'Desert' ? [205, 170, 115] : nm === 'Forest' ? [58, 90, 52] : nm.includes('ountain') ? (h > 360 ? [235, 237, 240] : [120, 118, 105]) : nm === 'Coast' ? (h > 3.2 ? [112, 140, 78] : [214, 200, 160]) : [112, 140, 78];
        r *= shade; gg *= shade; b *= shade;
      }
      const k = (j * 1024 + i) * 4;
      img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    gps.setMap(mapImg, HALF);
    const toMap = (x, z) => [(x + HALF) / (2 * HALF) * 1024, (z + HALF) / (2 * HALF) * 1024];
    for (const r of roads) {
      g.strokeStyle = r.type === 'highway' ? '#f2d16b' : r.type === 'street' ? '#d8d4ca' : r.type === 'rail' ? '#3a3a3a' : r.type === 'track' ? '#e23b2e' : r.type === 'gravel' ? '#b08a5a' : '#f3efe6';
      g.lineWidth = r.type === 'highway' ? 3.2 : r.type === 'street' ? 1.2 : r.type === 'rail' ? 2.2 : r.type === 'track' ? 2.6 : 2;
      g.setLineDash(r.type === 'rail' ? [5, 3] : []);
      g.beginPath();
      r.pts.forEach(([x, z], i) => { const [mx, my] = toMap(x, z); i ? g.lineTo(mx, my) : g.moveTo(mx, my); });
      if (r.closed) g.closePath();
      g.stroke();
    }
    g.setLineDash([]);
    g.font = '600 15px "Barlow Condensed", sans-serif'; g.fillStyle = 'rgba(255,255,255,0.85)'; g.textAlign = 'center';
    for (const [t, x, z] of [['MOUNTAINS', 0, -1500], ['DESERT', 1450, 250], ['FOREST', -1400, -300], ['SEA', 0, 1600], ['PLAINS', -300, 400]]) {
      const [mx, my] = toMap(x, z); g.fillText(t, mx, my);
    }
    // towns and fuel stations
    for (const t of TOWNS) {
      const [mx, my] = toMap(t.x, t.z);
      g.fillStyle = 'rgba(60,58,55,0.35)'; g.beginPath(); g.arc(mx, my, t.r * 1024 / (2 * HALF), 0, Math.PI * 2); g.fill();
      g.font = '700 17px "Barlow Condensed", sans-serif'; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 3;
      g.strokeText(t.name.toUpperCase(), mx, my - t.r * 1024 / (2 * HALF) - 6); g.fillText(t.name.toUpperCase(), mx, my - t.r * 1024 / (2 * HALF) - 6);
    }
    // the airport: paved areas, then its name
    for (const p of AIRPORT.paved) {
      const [ax, ay] = toMap(p.x0, p.z0), [bx, by] = toMap(p.x1, p.z1);
      g.fillStyle = p.kind === 'apron' ? '#8d8c88' : '#3a3c40'; g.fillRect(ax, ay, Math.max(1.5, bx - ax), Math.max(1.5, by - ay));
    }
    { const [mx, my] = toMap(AIRPORT.x - 60, AIRPORT.zN - 30); g.font = '700 16px "Barlow Condensed", sans-serif'; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 3; g.textAlign = 'center';
      g.strokeText('✈ PILOU INTERNATIONAL', mx, my); g.fillText('✈ PILOU INTERNATIONAL', mx, my); }
    // other places: garages (G), pizzeria (P), airstrip, seaplane base, raceway, ski lift, railway stations
    const pin = (x, z, label, color, letter) => {
      const [mx, my] = toMap(x, z);
      g.fillStyle = color; g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.roundRect(mx - 6, my - 6, 12, 12, 3); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = '700 9px sans-serif'; g.textAlign = 'center'; g.fillText(letter, mx, my + 3.5);
      if (label) { g.font = '700 13px "Barlow Condensed", sans-serif'; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 3; g.strokeText(label, mx, my - 10); g.fillStyle = '#fff'; g.fillText(label, mx, my - 10); }
    };
    for (const gq of GARAGES) pin(gq.x, gq.z, null, '#e5641c', 'G');
    for (const L of SHOP_LOTS) pin(L.cx, L.cz, null, '#1f6b3a', 'P');
    pin(AIRSTRIP.x, AIRSTRIP.z, '✈ MESA FIELD', '#1f4fb4', 'A');
    pin(SEAPLANE.x, SEAPLANE.z1, 'SEAPLANE BASE', '#1f4fb4', 'S');
    pin(TRACK.x, TRACK.z, 'RED MESA RACEWAY', '#c8102e', 'R');
    pin(FESTIVAL.x, FESTIVAL.z, 'SUMMER FEST', '#ffb000', 'F');
    for (const st of rally.stages) pin(st.r.pts[st.i0][0], st.r.pts[st.i0][1], `RALLY · ${st.name.toUpperCase()}`, '#8a5a2b', '⚑');
    for (const sp of photos.spots) pin(sp.x, sp.z, null, '#1f6b3a', '◉');
    if (meet) pin(meet.place.x, meet.place.z, 'MX-5 MEET (evenings)', '#c8102e', 'M');
    pin(arena.place.x, arena.place.z, 'MECH ARENA', '#9a5a3c', 'Q');
    if (home) pin(home.place.x, home.place.z, 'HOME', '#2f9f4a', '⌂');
    pin(island.lighthouse.x, island.lighthouse.z, 'GULL ISLAND', '#c8102e', '⛯');
    if (TRACK.village) pin(TRACK.village.x, TRACK.village.z, 'RACEWAY VILLAGE', '#c8102e', 'V');
    pin(island.beach.x, island.beach.z, null, '#1f9fb4', 'B');
    if (island.village) pin(island.village.x, island.village.z, 'GULL BAY RESORT', '#e0507a', '☀');
    if (island.jetty) pin(island.jetty.x, island.jetty.z, 'JET SKI HIRE', '#1d6fd1', 'J');
    if (island.court) pin(island.court.x, island.court.z, null, '#e8a21a', 'V');
    for (const t of challenges.traps) pin(t.x, t.z, null, '#d4a000', '⚡');
    for (const j of challenges.jumps) pin(j.x, j.z, null, '#ff6a00', '↑');
    if (world2.ferry) for (const [nm, q] of Object.entries(world2.ferry.quays)) pin(q.x, q.z, nm === 'West Bay' ? 'FERRY · WEST BAY' : 'FERRY', '#1f4fb4', '⛴');
    if (world2.cable) for (const [nm, c] of Object.entries(world2.cable.centres)) pin(c.x, c.z, nm.endsWith('summit') ? 'CABLE CAR · SUMMIT' : 'CABLE CAR', '#b5121b', '🚡');
    if (drift.zone) pin(drift.zone.road.pts[drift.zone.i0][0], drift.zone.road.pts[drift.zone.i0][1], 'DRIFT ZONE', '#2fbf5a', 'D');
    pin(SKI.base.x, SKI.base.z, 'SILVERPINE PEAKS', '#5a6b7a', '⛷');
    for (const st of RAIL.stations) pin(RAIL.road.pts[st.i][0], RAIL.road.pts[st.i][1], st.name.toUpperCase(), '#333', 'T');
    for (const st of STATIONS) {
      const [mx, my] = toMap(st.x, st.z);
      g.fillStyle = '#b5121b'; g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.roundRect(mx - 6, my - 6, 12, 12, 3); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = '700 9px sans-serif'; g.fillText('F', mx, my + 3.5);
    }
  }
  const mmCtx = $('minimap').getContext('2d'), bigCtx = $('bigmap').getContext('2d');
  $('bigmap').style.pointerEvents = 'auto';
  $('bigmap').addEventListener('click', (e) => {
    const r = $('bigmap').getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 2 * HALF - HALF, z = (e.clientY - r.top) / r.height * 2 * HALF - HALF;
    const ri = rides.info, P0 = ri ? ri.pos : veh.pos; tmpV.set(0, 0, 1).applyQuaternion(veh.q);
    const t = townAt(x, z), name = t ? t.name : 'Dropped pin';
    if (gps.navigate({ name, x, z }, P0, ri ? ri.yaw : Math.atan2(tmpV.x, tmpV.z))) { showMap = false; $('bigmap').hidden = true; }
  });
  function drawArrow(ctx, x, y, yaw, s) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(yaw);
    ctx.fillStyle = '#c8102e'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.65, s * 0.7); ctx.lineTo(0, s * 0.35); ctx.lineTo(-s * 0.65, s * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function drawMinimap(px, pz, yaw, big) {
    const scale = 1024 / (2 * HALF);
    if (big) {
      const S = 1024; bigCtx.drawImage(mapImg, 0, 0, S, S);
      for (const c of traffic.cars) { bigCtx.fillStyle = '#9fd3ff'; bigCtx.fillRect((c.mesh.position.x + HALF) * scale - 2, (c.mesh.position.z + HALF) * scale - 2, 4, 4); }
      { const rg = arena.rogue; if (rg) { bigCtx.fillStyle = '#b04cff'; bigCtx.strokeStyle = '#fff'; bigCtx.lineWidth = 2; bigCtx.beginPath(); bigCtx.arc((rg.x + HALF) * scale, (rg.z + HALF) * scale, 10, 0, Math.PI * 2); bigCtx.fill(); bigCtx.stroke(); bigCtx.fillStyle = '#fff'; bigCtx.font = '700 14px sans-serif'; bigCtx.textAlign = 'center'; bigCtx.fillText('ROGUE MECH', (rg.x + HALF) * scale, (rg.z + HALF) * scale - 14); } }
      if (missions.next) { bigCtx.fillStyle = '#ffc23a'; bigCtx.strokeStyle = '#000'; bigCtx.lineWidth = 2; bigCtx.beginPath(); bigCtx.arc((missions.next.x + HALF) * scale, (missions.next.z + HALF) * scale, 9, 0, Math.PI * 2); bigCtx.fill(); bigCtx.stroke(); }
      const gp1 = gps.points();
      if (gp1) { bigCtx.strokeStyle = '#4c8df6'; bigCtx.lineWidth = 4; bigCtx.lineJoin = bigCtx.lineCap = 'round'; bigCtx.beginPath(); gp1.forEach(([x, z], k) => (k ? bigCtx.lineTo((x + HALF) * scale, (z + HALF) * scale) : bigCtx.moveTo((x + HALF) * scale, (z + HALF) * scale))); bigCtx.stroke();
        const d = gps.route.dest; bigCtx.fillStyle = '#d93025'; bigCtx.beginPath(); bigCtx.arc((d.x + HALF) * scale, (d.z + HALF) * scale, 8, 0, Math.PI * 2); bigCtx.fill(); }
      bigCtx.fillStyle = 'rgba(0,0,0,0.55)'; bigCtx.fillRect(0, 994, 1024, 30); bigCtx.fillStyle = '#fff'; bigCtx.font = '600 18px sans-serif'; bigCtx.textAlign = 'center'; bigCtx.fillText('Click anywhere to set a GPS destination', 512, 1015);
      drawArrow(bigCtx, (px + HALF) * scale, (pz + HALF) * scale, yaw, 12);
      return;
    }
    const S = 352, span = 900; // metres across
    mmCtx.save(); mmCtx.clearRect(0, 0, S, S);
    mmCtx.beginPath(); mmCtx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); mmCtx.clip();
    mmCtx.fillStyle = '#1a3f50'; mmCtx.fillRect(0, 0, S, S);
    const srcW = span * scale;
    mmCtx.drawImage(mapImg, (px + HALF) * scale - srcW / 2, (pz + HALF) * scale - srcW / 2, srcW, srcW, 0, 0, S, S);
    if (trafficOn) for (const c of traffic.cars) {
      const x = (c.mesh.position.x - px) / span * S + S / 2, y = (c.mesh.position.z - pz) / span * S + S / 2;
      mmCtx.fillStyle = '#9fd3ff'; mmCtx.fillRect(x - 3, y - 3, 6, 6);
    }
    { const rg = arena.rogue; if (rg) { let x = (rg.x - px) / span * S + S / 2, y = (rg.z - pz) / span * S + S / 2; const dd = Math.hypot(x - S / 2, y - S / 2); if (dd > S / 2 - 12) { x = S / 2 + (x - S / 2) * (S / 2 - 12) / dd; y = S / 2 + (y - S / 2) * (S / 2 - 12) / dd; } mmCtx.fillStyle = '#b04cff'; mmCtx.strokeStyle = '#fff'; mmCtx.lineWidth = 2; mmCtx.beginPath(); mmCtx.arc(x, y, 8, 0, Math.PI * 2); mmCtx.fill(); mmCtx.stroke(); } }
    const nx = missions.next;
    if (nx) {
      let x = (nx.x - px) / span * S + S / 2, y = (nx.z - pz) / span * S + S / 2;
      const dd = Math.hypot(x - S / 2, y - S / 2); if (dd > S / 2 - 12) { x = S / 2 + (x - S / 2) * (S / 2 - 12) / dd; y = S / 2 + (y - S / 2) * (S / 2 - 12) / dd; }
      mmCtx.fillStyle = '#ffc23a'; mmCtx.strokeStyle = '#000'; mmCtx.lineWidth = 2; mmCtx.beginPath(); mmCtx.arc(x, y, 8, 0, Math.PI * 2); mmCtx.fill(); mmCtx.stroke();
    }
    { const gp2 = gps.points(); if (gp2) { mmCtx.strokeStyle = '#4c8df6'; mmCtx.lineWidth = 5; mmCtx.lineJoin = mmCtx.lineCap = 'round'; mmCtx.beginPath(); gp2.forEach(([x, z], k) => { const X = (x - px) / span * S + S / 2, Y = (z - pz) / span * S + S / 2; k ? mmCtx.lineTo(X, Y) : mmCtx.moveTo(X, Y); }); mmCtx.stroke(); } }
    drawArrow(mmCtx, S / 2, S / 2, yaw, 13);
    mmCtx.restore();
  }

  // ---------------------------------------------------------------- State
  let timeOfDay = 10.5;
  // continue where you left off
  if (settings.save) { const S0 = settings.save; veh.reset(S0.x, groundHeight(S0.x, S0.z) + 0.8, S0.z, S0.h); timeOfDay = S0.t; veh.fuel = S0.fuel; veh.dmg.engine = S0.eng ?? 1; }
  let camMode = 0; // 0 chase, 1 far chase, 2 cockpit
  let showMap = false;
  let simTime = 0;
  let acc = 0;
  const DT = 1 / 600;
  const camPos = new THREE.Vector3().copy(veh.pos).add(new THREE.Vector3(0, 3, -8));
  const camLook = new THREE.Vector3().copy(veh.pos);
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), fwd = new THREE.Vector3(), upV = new THREE.Vector3();
  const colTmp = [];
  const dynCols = [];
  const parkedCols = [{ x: 0, z: 0, y: 0, r: 1.3, owner: null }];
  let shake = 0;
  let calm = 1, calmT = 0;
  let blinkArmed = false, lastBlinkOn = false, mechWas = 0, stepSide = 1;
  const fuelState = { filling: false, was: false, nearest: '' };
  const fuelCtx = $('fuel').getContext('2d');
  function drawFuel() {
    const c = fuelCtx, W = c.canvas.width, H = c.canvas.height, f = veh.fuel / veh.tank;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(10,11,13,0.72)'; c.beginPath(); c.roundRect(0, 0, W, H, 10); c.fill();
    const x = W * 0.3, w = W * 0.4, top = H * 0.14, bh = H * 0.66;
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2; c.strokeRect(x, top, w, bh);
    c.fillStyle = f < 0.14 ? '#ffb020' : '#f3efe6'; c.fillRect(x + 3, top + bh * (1 - f) + 3, w - 6, Math.max(0, bh * f - 6));
    c.fillStyle = '#f3efe6'; c.font = `600 ${Math.round(H * 0.075)}px "Barlow Condensed", sans-serif`; c.textAlign = 'center';
    c.fillText('F', W / 2, top - 6); c.fillText('E', W / 2, top + bh + H * 0.07);
    c.fillText(`${Math.round(veh.fuel)} L`, W / 2, H * 0.97);
  }
  const accW = new THREE.Vector3(), prevVel = new THREE.Vector3(), effL = new THREE.Vector3(), qInvL = new THREE.Quaternion();
  // lights and indicators belong to whatever you're driving: the MX-5, or the ride you've switched to
  const lampState = () => (rides.active ? rides.lamps : car.state);
  let lampRide = null;
  const setBlink = (v) => { const st = lampState(); st.blink = st.blink === v ? 0 : v; st.blinkT = 0; blinkArmed = false; };
  let morphBoat = 0, morphPlane = 0, morphMech = 0;
  let last = performance.now();
  let fpsAcc = 0, fpsN = 0;
  $('help').hidden = false;
  setTimeout(() => { $('help').hidden = true; }, 30000);
  let hudTimer = 0;
  let cullT = 0, terrainLodT = 0, gpsFeedT = 0, rogueMsg = '', washMsg = '', wash = null, washReq = false, evMsg = '', evReq = false;
  const tmpQm = new THREE.Quaternion(), tmpEm = new THREE.Euler(0, 0, 0, 'YXZ');

  // ---------------------------------------------------------------- Radio display
  let radioHideT = null;
  function showRadio(info) {
    const el = $('radio');
    el.hidden = info.station.id === 'off' && !radioHideT;
    $('radioSt').textContent = info.station.id === 'off' ? 'Radio off' : `${info.station.name} ${info.station.freq}`;
    $('radioTr').textContent = info.title;
    $('pRadio').textContent = info.station.id === 'off' ? 'Radio off' : `${info.station.name} ${info.station.freq}`;
    el.classList.remove('dim');
    clearTimeout(radioHideT);
    radioHideT = setTimeout(() => { radioHideT = null; if (info.station.id === 'off') el.hidden = true; else el.classList.add('dim'); }, 5000);
  }
  radio.onChange((info) => { showRadio(info); settings.station = radio.index; saveSettings(); });
  function setRadioVolume(v) { audio.start(); radio.setVolume(v); settings.volume = radio.volume; saveSettings(); $('pVol').value = Math.round(radio.volume * 100); toast(`Radio volume ${Math.round(radio.volume * 100)}%`); }

  // ---------------------------------------------------------------- Pause menu
  const pauseEl = $('pause');
  function refreshMenu() {
    $('pReal').setAttribute('aria-pressed', String(veh.realism)); $('pArcade').setAttribute('aria-pressed', String(!veh.realism));
    $('pRealHint').textContent = veh.realism ? 'Tyres heat up and wear, brakes fade when they overheat.' : 'Constant tyre grip and brakes that never fade. Damage and handling stay the same.';
    for (const q of [0, 1, 2]) $('pQ' + q).setAttribute('aria-pressed', String(postfx.quality === q));
    $('pSndOn').setAttribute('aria-pressed', String(!audio.muted)); $('pSndOff').setAttribute('aria-pressed', String(audio.muted));
    $('pVol').value = Math.round(radio.volume * 100);
    $('pEngVol').value = Math.round(audio.engineVolume * 100);
    for (const w of ['auto', ...SEASONS]) $('pS_' + w).setAttribute('aria-pressed', String(seasons.mode === w));
    for (const w of ['auto', 'clear', 'overcast', 'rain', 'storm', 'fog']) $('pW_' + w).setAttribute('aria-pressed', String(weather.mode === w));
    for (const b of pauseEl.querySelectorAll('[data-paint]')) b.setAttribute('aria-pressed', String((settings.paint || '#b5121b') === b.dataset.paint));
    for (const b of pauseEl.querySelectorAll('[data-opt="wheels"] button')) b.setAttribute('aria-pressed', String((settings.wheels || 'silver') === b.dataset.v));
    $('pJobs').innerHTML = '';
    for (const j of jobs.list) { const b = document.createElement('button'); b.dataset.job = j.id; b.innerHTML = `<b>${j.name}</b><small>${j.desc}</small>`; $('pJobs').appendChild(b); }
    for (const j of career.list()) { const b = document.createElement('button'); b.dataset.career = j.id; b.innerHTML = `<b>${j.name}</b><small>${j.desc}</small>`; $('pJobs').appendChild(b); }
    for (const j of challenges.list()) { const b = document.createElement('button'); b.dataset.chal = j.id; b.innerHTML = `<b>${j.name}</b><small>${j.desc}</small>`; $('pJobs').appendChild(b); }
    for (const j of events.list({ night: timeOfDay < 5.5 || timeOfDay > 20, lighthouse: island.lighthouse })) { const b = document.createElement('button'); b.dataset.evx = j.id; if (j.disabled) b.disabled = true; b.innerHTML = `<b>${j.name}</b><small>${j.desc}</small>`; $('pJobs').appendChild(b); }
    for (const j of [...rally.list(), ...arena.list()]) { const b = document.createElement('button'); b.dataset.event = j.id; b.innerHTML = `<b>${j.name}</b><small>${j.desc}</small>`; $('pJobs').appendChild(b); }
    for (const j of aviation.list()) { const b = document.createElement('button'); b.dataset.avi = j.id; if (j.disabled) b.disabled = true; b.innerHTML = `<b>${j.name}</b><small>${j.desc}</small>`; $('pJobs').appendChild(b); }
    $('pPilot').textContent = `${aviation.licence} · ${aviation.pilot.flights} flight jobs · ${aviation.pilot.landings} landings`;
    $('pAtcOn').setAttribute('aria-pressed', String(settings.atc !== false)); $('pAtcOff').setAttribute('aria-pressed', String(settings.atc === false));
    { const b = document.createElement('button'); b.dataset.freight = '1'; b.innerHTML = transport.driving ? '<b>Leave the freight cab</b><small>Hand the train back and drive off at the nearest station.</small>' : '<b>Freight driver</b><small>Take over the freight train (your car rides on its carrier wagon) and stop it at the named station. Mind the signals.</small>'; $('pJobs').appendChild(b); }
    if (!race.active) { const b = document.createElement('button'); b.dataset.trial = '1'; b.innerHTML = `<b>Time trial · Red Mesa Raceway</b><small>Flying laps on your own against your ghost.${ghosts.best('raceway') ? ` Best ${ghosts.best('raceway').toFixed(2)} s.` : ''}</small>`; $('pJobs').appendChild(b); }
    { const b = document.createElement('button'); b.dataset.race = '1'; b.innerHTML = race.active ? '<b>Abandon the race</b><small>Leave the current race at Red Mesa Raceway.</small>' : '<b>Race · Red Mesa Raceway</b><small>3 laps against five drivers. You start 4th on the grid. Prize money for the top six.</small>'; $('pJobs').appendChild(b); }
    $('pMissions').innerHTML = '';
    for (const m of missions.list()) {
      const b = document.createElement('button'); b.dataset.mission = m.id;
      b.innerHTML = `<b>${m.name}</b><small>${m.desc}${m.best != null ? ` · best ${Math.floor(m.best / 60)}:${(m.best % 60).toFixed(1).padStart(4, '0')}` : ''}</small>`;
      $('pMissions').appendChild(b);
    }
    $('pCancelMission').hidden = !missions.active;
    const info = radio.info(); $('pRadio').textContent = info.station.id === 'off' ? 'Radio off' : `${info.station.name} ${info.station.freq}`;
  }
  function togglePause(force) {
    paused = force ?? !paused;
    pauseEl.hidden = !paused;
    audio.setPaused(paused);
    keys.clear();
    if (garage.open) { postfx.render(dt, 0); onceKeys.clear(); return; }
    if (paused) { refreshMenu(); $('pResume').focus(); }
    else canvas.focus?.();
  }
  pauseEl.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    audio.start();
    const seg = b.parentElement.dataset.opt;
    if (seg === 'realism') { veh.realism = b.dataset.v === 'real'; veh.fuelRate = veh.realism ? 10 : 4; settings.realism = veh.realism; saveSettings(); }
    else if (seg === 'quality') { postfx.setQuality(+b.dataset.v); }
    else if (seg === 'sound') { audio.setMuted(b.dataset.v === 'off'); }
    else if (seg === 'wheels') { car.setWheels(b.dataset.v); settings.wheels = b.dataset.v; saveSettings(); }
    else if (b.dataset.paint) { car.setPaint(b.dataset.paint); settings.paint = b.dataset.paint; saveSettings(); }
    else if (seg === 'season') { seasons.set(b.dataset.v); }
    else if (seg === 'weather') { weather.setMode(b.dataset.v); settings.weather = b.dataset.v; saveSettings(); }
    if (b.dataset.mission) { missions.start(b.dataset.mission); togglePause(false); return; }
    if (b.dataset.job) { jobs.start(b.dataset.job, veh.pos); togglePause(false); return; }
    if (b.dataset.ride) {
      if (b.dataset.ride === 'mx5') { if (rides.active) { const c = rides.stop(); veh.reset(c.pos.x + 3, Math.max(groundHeight(c.pos.x + 3, c.pos.z), 0) + 1, c.pos.z, c.yaw); setMode('car', true); } }
      else if (!transport.ride && !rally.active && !race.active) { if (mode !== 'car') setMode('car', true); tmpV.set(0, 0, 1).applyQuaternion(veh.q); rides.start(b.dataset.ride, veh.pos, Math.atan2(tmpV.x, tmpV.z)); }
      togglePause(false); return;
    }
    if (b.dataset.career) { if (transport.ride) transport.cancel(veh); if (rides.active && b.dataset.career !== 'patrol' && b.dataset.career !== 'buyvan') rides.stop(); missions.cancel(); career.start(b.dataset.career, veh, (m) => setMode(m, true)); togglePause(false); return; }
    if (b.dataset.evx) { if (!b.dataset.evx.startsWith('pc-')) { if (transport.ride) transport.cancel(veh); if (rides.active) rides.stop(); if (mode !== 'car') setMode('car', true); } events.start(b.dataset.evx, { night: timeOfDay < 5.5 || timeOfDay > 20 }); togglePause(false); return; }
    if (b.dataset.chal) { if (transport.ride) transport.cancel(veh); if (rides.active) rides.stop(); challenges.start(b.dataset.chal); togglePause(false); return; }
    if (b.dataset.event) { missions.cancel(); if (transport.ride) transport.cancel(veh); if (b.dataset.event === 'arena') arena.start(veh, (m) => setMode(m)); else { rally.cancel(); setMode('car'); rally.start(b.dataset.event, veh); } togglePause(false); return; }
    if (b.dataset.avi) { aviation.start(b.dataset.avi, { pos: veh.pos, setMode: (m) => setMode(m), spawnPlane }); togglePause(false); return; }
    if (seg === 'atc') { settings.atc = b.dataset.v === 'on'; saveSettings(); if (!settings.atc) try { speechSynthesis.cancel(); } catch { /* none */ } }
    if (b.dataset.freight) { if (transport.driving) transport.cancel(veh); else { missions.cancel(); setMode('car'); transport.startFreight(veh); } togglePause(false); return; }
    if (b.dataset.trial) { missions.cancel(); setMode('car'); race.startTrial(veh); togglePause(false); return; }
    if (b.dataset.race) { if (race.active) race.cancel(); else { missions.cancel(); setMode('car'); race.start(veh); } togglePause(false); return; }
    switch (b.dataset.act) {
      case 'resume': togglePause(false); return;
      case 'cancel-mission': missions.cancel(); break;
      case 'radio-next': radio.next(); break;
      case 'radio-prev': radio.prev(); break;
      case 'files': radio.chooseFiles(); radio.tune(radio.STATIONS.findIndex((s) => s.id === 'mine')); break;
      case 'recover': togglePause(false); onceKeys.add('CharR'); return;
      case 'repair': damage.repair(); toast('Repaired'); break;
      case 'help': $('help').hidden = !$('help').hidden; break;
      case 'photo': setPhoto(true); return;
      case 'stats': stats.show(); return;
      case 'assist': service.call(veh); togglePause(false); return;
      case 'gallery': showGallery(); return;
      case 'home': if (home) { if (rides.active) rides.stop(); if (transport.ride) transport.cancel(veh); const sp = home.spawn; veh.reset(sp.x, sp.h + 1, sp.z, sp.heading); setMode('car', true); togglePause(false); toast('Home'); } return;
    }
    refreshMenu();
  });
  $('pEngVol').addEventListener('input', () => { audio.setEngineVolume($('pEngVol').value / 100); settings.engineVol = audio.engineVolume; saveSettings(); });
  $('pVol').addEventListener('input', () => { radio.setVolume($('pVol').value / 100); settings.volume = radio.volume; saveSettings(); });
  // controller navigation in the menu
  function menuNav(gp) {
    if (!gp.connected) return;
    const items = [...pauseEl.querySelectorAll('button, input')];
    let i = items.indexOf(document.activeElement);
    if (gp.pressed.has(PAD.DOWN)) items[Math.min(items.length - 1, i + 1)].focus();
    if (gp.pressed.has(PAD.UP)) items[Math.max(0, i - 1)].focus();
    const cur = document.activeElement;
    if (gp.pressed.has(PAD.LEFT) || gp.pressed.has(PAD.RIGHT)) {
      const dir = gp.pressed.has(PAD.RIGHT) ? 1 : -1;
      if (cur.type === 'range') { setRadioVolume(radio.volume + dir * 0.1); }
      else if (cur.parentElement.classList.contains('seg') || cur.parentElement.classList.contains('radioCtl')) {
        const sib = [...cur.parentElement.querySelectorAll('button')], j = sib.indexOf(cur), nb = sib[Math.max(0, Math.min(sib.length - 1, j + dir))];
        nb.focus(); if (cur.parentElement.classList.contains('seg')) nb.click();
      }
    }
    if (gp.pressed.has(PAD.A) && cur && cur.tagName === 'BUTTON') cur.click();
    if (gp.pressed.has(PAD.B)) togglePause(false);
  }

  // ---------------------------------------------------------------- Loop
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    fpsAcc += dt; fpsN++;

    if (photo.on) { mirror.render(false); document.getElementById('gps').style.display = 'none'; photoFrame(dt); veg.update(0, camera.position); terrainLodT -= dt; if (terrainLodT <= 0) { terrainLodT = 0.3; scene.userData.terrain.userData.lod(camera.position); } return; }
    // --- controller
    const gp = pad.poll();
    if (gp.pressed.has(PAD.START)) togglePause();
    if (paused) {
      menuNav(gp);
      audio.update({ rpm: veh.rpm, throttle: 0, slip: 0, speed: 0, inWater: false, prop: 0, onGround: true, surface: 'asphalt' });
      onceKeys.clear();
      postfx.render(dt, 0);
      return;
    }
    if (gp.connected) {
      const P = gp.pressed;
      if (P.has(PAD.A)) setMode({ car: 'boat', boat: 'plane', plane: 'mech', mech: 'car' }[mode]);
      if (P.has(PAD.Y)) { const ls = lampState(); ls.lights = !ls.lights; }
      if (P.has(PAD.LS)) { camMode = (camMode + 1) % 3; lookYaw = lookPitch = 0; }
      if (P.has(PAD.BACK)) { showMap = !showMap; $('bigmap').hidden = !showMap; }
      if (P.has(PAD.RS)) onceKeys.add('CharV');
      // D-pad: left/right indicators, down hazards, up next radio station (volume lives in the pause menu)
      if (P.has(PAD.LEFT)) setBlink(1);
      if (P.has(PAD.RIGHT)) setBlink(-1);
      if (P.has(PAD.DOWN)) setBlink(2);
      if (P.has(PAD.UP)) radio.next();
      if (mode !== 'plane' && mode !== 'mech') { if (P.has(PAD.RB) && !veh.auto && veh.gear < 6) veh.gear++; if (P.has(PAD.LB) && !veh.auto && veh.gear > 0) veh.gear--; }
      if (Math.abs(gp.rx) + Math.abs(gp.ry) > 0) { lookYaw -= gp.rx * dt * 2.5; lookPitch = Math.max(-0.4, Math.min(1.2, lookPitch + gp.ry * dt * 1.5)); lastDrag = performance.now(); }
    }
    audio.horn(pressed('KeyY') || gp.held.has(PAD.B));

    // --- discrete keys
    // indicators by key position (Q/E on QWERTY, A/E on AZERTY), O for hazards
    if (mode === 'car' && once('KeyQ')) setBlink(1);
    if (mode === 'car' && once('KeyE')) setBlink(-1);
    if (act('O')) setBlink(2);
    if (once('Digit0') || once('Numpad0')) { setPhoto(true); onceKeys.clear(); return; }
    if (once('Digit6') || once('Numpad6')) gps.toggle();
    if (once('Digit7') || once('Numpad7')) gps.openPicker();
    if (once('Digit8') || once('Numpad8')) toast(mirror.toggle() ? 'Rear-view mirror on' : 'Rear-view mirror off');
    if (custom.state.hardtop && act('V')) toast('The hardtop is fitted (remove it at a garage)');
    if (act('V')) {
      if (veh.vel.length() < 3) { car.state.topUp = !car.state.topUp; toast(car.state.topUp ? 'Raising the top' : 'Lowering the top'); }
      else toast('Slow down below 10 km/h to work the top');
    }
    if (act('K')) radio.next();
    if (act('J')) radio.skip();
    if (act('+') || act('=') || once('NumpadAdd')) setRadioVolume(radio.volume + 0.1);
    if (act('-') || once('NumpadSubtract')) setRadioVolume(radio.volume - 0.1);
    if (rides.active) {
      if (once('Digit1') || act('1')) { const c = rides.stop(); const gh = groundHeight(c.pos.x, c.pos.z); veh.reset(c.pos.x + Math.cos(c.yaw) * 2.5, Math.max(gh, 0) + 1.0, c.pos.z - Math.sin(c.yaw) * 2.5, c.yaw); setMode('car', true); toast('Back in the MX-5'); }
      if (once('Digit2') || once('Digit3') || once('Digit4') || act('2') || act('3') || act('4')) toast('Press 1 to get back in the MX-5 first');
    }
    if (once('Digit5') || act('5')) { if (rides.kind === 'heli') { const c = rides.stop(); veh.reset(c.pos.x + 4, groundHeight(c.pos.x + 4, c.pos.z) + 1, c.pos.z, c.yaw); setMode('car', true); } else if (!transport.ride) { tmpV.set(0, 0, 1).applyQuaternion(veh.q); rides.start('heli', veh.pos, Math.atan2(tmpV.x, tmpV.z)); } }
    if (transport.ride) { if (once('Digit1') || once('Digit2') || once('Digit3') || once('Digit4') || act('1') || act('2') || act('3') || act('4')) toast('Drive off first (F at a stop)'); }
    if (once('Digit1') || act('1')) setMode('car');
    if (once('Digit2') || act('2')) setMode('boat');
    if (once('Digit3') || act('3')) setMode('plane');
    if (once('Digit4') || act('4')) setMode('mech');
    if (act('L')) { const ls = lampState(); ls.lights = !ls.lights; if (mode === 'car' && !rides.active) challenges.flash(veh); }
    if (act('C')) { camMode = (camMode + 1) % 3; lookYaw = lookPitch = 0; }
    if (act('M')) { showMap = !showMap; $('bigmap').hidden = !showMap; }
    if (act('H')) $('help').hidden = !$('help').hidden;
    if (act('N')) timeOfDay = (timeOfDay + 1) % 24;
    if (act('B')) timeOfDay = (timeOfDay + 23) % 24;
    if (act('U')) { audio.setMuted(!audio.muted); toast(audio.muted ? 'Sound off' : 'Sound on'); }
    if (act('T')) { trafficOn = !trafficOn; for (const c of traffic.cars) c.mesh.visible = trafficOn; toast(trafficOn ? 'Traffic on' : 'Traffic off'); }
    // mech weapons: Q (A on AZERTY; pad LB) arm cannon out/in, F (pad RB) fires it when it's out (else punches),
    // E (pad R3) missiles
    const MW = car.mechWeapons;
    if (mode === 'mech' && MW && (once('KeyQ') || (gp.connected && gp.pressed.has(PAD.LB)))) { const on = MW.cannon < 0.5; MW.setCannon(on); toast(on ? 'Arm cannon · F to fire' : 'Arm cannon stowed'); audio.servo(0.8, 0.7); }
    if (mode === 'mech' && MW && (once('KeyE') || (gp.connected && gp.pressed.has(PAD.RS)))) weapons.fireMissile(MW);
    if (mode === 'mech' && (act('F') || (gp.connected && gp.pressed.has(PAD.RB)))) { if (MW && MW.cannon > 0.5) weapons.fireCannon(MW); else car.mechPunch(); }
    else if (act('F')) { if (mode === 'car' || transport.ride) fPress = true; else { flightAssist = !flightAssist; toast(flightAssist ? 'Flight assist on' : 'Flight assist off'); } }
    if (act('I')) $('tyres').hidden = !$('tyres').hidden;
    if (act('P')) { postfx.setQuality(postfx.quality - 1); toast(`Graphics ${QUALITY_NAMES[postfx.quality]}`); }
    if (act('G')) { veh.auto = !veh.auto; toast(veh.auto ? 'Automatic' : 'Manual gearbox'); }
    if (mode === 'mech' && morphMech >= 1 && veh.mech && arena.story.up.dash && (keys.has('ShiftLeft') || keys.has('ShiftRight')) && simTime > dashT) { dashT = simTime + 2.5; veh.mech.u = Math.max(veh.mech.u, 16); onceKeys.delete('ShiftLeft'); onceKeys.delete('ShiftRight'); toast('Dash!'); }
    if (once('ShiftLeft') || once('ShiftRight')) { if (!veh.auto && veh.gear < 6) veh.gear++; }
    if (once('ControlLeft') || once('ControlRight')) { if (!veh.auto && veh.gear > 0) veh.gear--; }
    if (act('X')) { damage.repair(); toast('Repaired'); }
    const recoverKey = act('R');   // read once: act() consumes the key press
    if (recoverKey && rides.active) { const c = rides.stop(); veh.pos.set(c.pos.x, c.pos.y, c.pos.z); }
    if (recoverKey && transport.ride) { transport.cancel(veh); toast('Off the carrier'); }
    else if (recoverKey && rally.active) rally.recover(veh);
    else if (recoverKey) {
      const r = nearestRoadPoint(veh.pos.x, veh.pos.z);
      veh.reset(r.x - Math.cos(r.heading) * 1.9, r.h + 1.2, r.z + Math.sin(r.heading) * 1.9, r.heading);
      setMode('car'); toast('Recovered to ' + r.road.name);
      if (veh.fuel < 1) { veh.fuel = 10; toast('Recovered with a 10 L emergency can · find a fuel station'); }
    }
    onceKeys.clear();

    // --- transformation progress (≈1.5 s)
    // in mid-air the switch between robot and plane is snapped through quickly so it can be caught before landing
    const midAir = (leap && leap.phase === 'air') || (veh.telemetry.altitude > 4 && !veh.telemetry.onGround);
    const rateM = dt / (midAir ? 0.6 : 1.5), rateMech = dt / (midAir ? 0.5 : 2.6);
    const tb = mode === 'boat' ? 1 : 0, tp = mode === 'plane' ? 1 : 0, tmc = mode === 'mech' ? 1 : 0;
    // retract the other kit first
    if (tmc === 0 && morphMech > 0) morphMech = Math.max(0, morphMech - rateMech);
    else if (tb === 1 && morphPlane > 0) morphPlane = Math.max(0, morphPlane - rateM * 1.5);
    else if (tp === 1 && morphBoat > 0) morphBoat = Math.max(0, morphBoat - rateM * 1.5);
    else if (tmc === 1 && (morphBoat > 0 || morphPlane > 0)) { morphBoat = Math.max(0, morphBoat - rateM * 1.5); morphPlane = Math.max(0, morphPlane - rateM * 1.5); }
    else {
      morphBoat += Math.sign(tb - morphBoat) * Math.min(Math.abs(tb - morphBoat), rateM);
      morphPlane += Math.sign(tp - morphPlane) * Math.min(Math.abs(tp - morphPlane), rateM);
      if (tmc === 1 && morphMech === 0 && veh.mech) veh.mech.init = false;   // start walking from the car's heading
      morphMech += Math.sign(tmc - morphMech) * Math.min(Math.abs(tmc - morphMech), rateMech);
    }
    // folded back into a car: put it back on its wheels where the robot stood
    if (morphMech === 0 && mechWas > 0 && mode === 'plane' && midAir) {
      // robot to plane in the air: launch forward so the wings bite
      tmpV.set(0, 0, 1).applyQuaternion(veh.q).setY(0).normalize();
      const v = Math.max(30, veh.vel.length()); veh.vel.set(tmpV.x * v, Math.max(veh.vel.y, -2), tmpV.z * v); veh.throttleLever = Math.max(veh.throttleLever || 0, 0.8);
      toast('Wings out!'); leap = null;
    } else if (morphMech === 0 && mechWas > 0) { const gh = groundHeight(veh.pos.x, veh.pos.z); veh.reset(veh.pos.x, gh + 0.75, veh.pos.z, veh.mech ? veh.mech.yaw : 0); }
    mechWas = morphMech;
    if (aviation.cargoKg !== cargoKg) { veh.baseMass += aviation.cargoKg - cargoKg; cargoKg = aviation.cargoKg; }
    veh.boatT = morphBoat; veh.planeT = morphPlane; veh.updateMassProps();
    car.setMorph(morphBoat, morphPlane, morphMech);
    if (morphBoat + morphPlane + morphMech === 0) car.body.position.y += custom.rideOffset;
    // servos: loud while transforming; when walking they whine with the stride
    const mechU = veh.mech && morphMech >= 1 ? Math.abs(veh.mech.u) : 0;
    audio.servo(morphMech > 0 && morphMech < 1 ? 1 : morphMech >= 1 ? Math.min(0.55, mechU * 0.09) : 0, morphMech < 1 ? morphMech : 0.25 + mechU * 0.08);
    audio.jet(morphMech >= 1 && veh.mech && veh.mech.jet ? 1 : 0);
    const morphing = (morphBoat > 0 && morphBoat < 1) || (morphPlane > 0 && morphPlane < 1) || (morphMech > 0 && morphMech < 1);
    $('morph').textContent = morphing ? 'Transforming…' : '';

    // --- control mapping
    const up = pressed('KeyW', 'ArrowUp') ? 1 : 0, down = pressed('KeyS', 'ArrowDown') ? 1 : 0;
    const l = pressed('KeyA', 'ArrowLeft') ? 1 : 0, r = pressed('KeyD', 'ArrowRight') ? 1 : 0;
    const inp = { throttle: 0, brake: 0, steer: 0, handbrake: false, roll: 0, pitch: 0, yaw: 0 };
    if (mode === 'plane') {
      const thrUp = pressed('KeyW'), thrDn = pressed('KeyS');
      veh.throttleLever = Math.max(0, Math.min(1, veh.throttleLever + (thrUp - thrDn) * dt * 0.6));
      const rollIn = (pressed('KeyD') ? 1 : 0) - (pressed('KeyA') ? 1 : 0);
      inp.roll = rollIn;
      inp.pitch = (pressed('ArrowDown') ? 1 : 0) - (pressed('ArrowUp') ? 1 : 0);
      inp.yaw = (pressed('KeyE') ? 1 : 0) - (pressed('KeyQ') ? 1 : 0) + ((pressed('ArrowRight') ? 1 : 0) - (pressed('ArrowLeft') ? 1 : 0)) * 0.6;
      inp.steer = Math.max(-1, Math.min(1, rollIn + inp.yaw));
      inp.brake = pressed('Space') ? 1 : 0;
      inp.throttle = veh.throttleLever;
      inp.assist = flightAssist;
    } else {
      inp.throttle = up; inp.brake = down; inp.steer = r - l;
      inp.handbrake = pressed('Space');
      if (mode === 'mech') { inp.jump = pressed('Space') || gp.held.has(PAD.X); inp.handbrake = false; }
    }
    if (gp.connected) {
      if (mode === 'plane') {
        veh.throttleLever = Math.max(0, Math.min(1, veh.throttleLever + (gp.rt - gp.lt) * dt * 0.6));
        inp.throttle = veh.throttleLever;
        if (Math.abs(gp.lx) > 0) inp.roll = gp.lx;
        if (Math.abs(gp.ly) > 0) inp.pitch = gp.ly; // stick back = nose up
        const rud = (gp.held.has(PAD.RB) ? 1 : 0) - (gp.held.has(PAD.LB) ? 1 : 0);
        if (rud) inp.yaw = rud;
        inp.steer = Math.max(-1, Math.min(1, inp.roll + inp.yaw));
        if (gp.held.has(PAD.X)) inp.brake = 1;
      } else {
        inp.throttle = Math.max(inp.throttle, gp.rt);
        inp.brake = Math.max(inp.brake, gp.lt);
        if (Math.abs(gp.lx) > Math.abs(inp.steer)) inp.steer = gp.lx;
        inp.handbrake = inp.handbrake || gp.held.has(PAD.X);
      }
    }

    // indicators cancel themselves once a turn in their direction unwinds; relay ticks on every change
    {
      // hand the light switch over when you change vehicle (the MX-5 is parked with its lights off)
      const rk = rides.active ? rides.active.m : null;
      if (rk !== lampRide) {
        if (rk && !lampRide) { rides.lamps.lights = car.state.lights; rides.lamps.blink = 0; car.state.lights = false; car.state.blink = 0; }
        else if (!rk && lampRide) { car.state.lights = rides.lamps.lights; car.state.blink = 0; rides.lamps.blink = 0; }
        lampRide = rk; blinkArmed = false;
      }
      const st = lampState(), dirSteer = st.blink === 1 ? -inp.steer : st.blink === -1 ? inp.steer : 0;
      if (dirSteer > 0.45) blinkArmed = true;
      else if (blinkArmed && Math.abs(inp.steer) < 0.08) { st.blink = 0; blinkArmed = false; }
      if (st.blinkOn !== lastBlinkOn) { audio.relay(st.blinkOn); lastBlinkOn = st.blinkOn; }
      $('blL').classList.toggle('on', st.blinkOn && (st.blink === 1 || st.blink === 2));
      $('blR').classList.toggle('on', st.blinkOn && (st.blink === -1 || st.blink === 2));
    }

    // --- water calmness and air temperature sampled at the vehicle (cheap, per 0.25 s)
    calmT -= dt;
    if (calmT <= 0) {
      calm = waterCalmAt(veh.pos.x, veh.pos.z); calmT = 0.25;
      const nm = biomeName(veh.pos.x, veh.pos.z, groundHeight(veh.pos.x, veh.pos.z));
      const base = nm === 'Desert' ? 33 : nm === 'High mountains' ? -4 : nm === 'Mountains' ? 9 : nm === 'Coast' ? 21 : 18;
      const sunH = Math.sin((timeOfDay - 6) / 12 * Math.PI);
      veh.ambientT += (base + 6 * sunH - veh.ambientT) * 0.02;
    }

    // --- physics
    // moving obstacles around whatever you're driving (a ride, or the MX-5)
    const dynP = rides.info ? rides.info.pos : veh.pos;
    if (trafficOn) traffic.near(dynP, dynCols); else dynCols.length = 0;
    airport.near(dynCols);
    police.near(dynP, dynCols);
    race.near(dynP, dynCols);
    world2.near(dynP, dynCols);
    aviation.near(dynP, dynCols);
    arena.near(dynP, dynCols);
    challenges.near(dynP, dynCols);
    career.near(dynP, dynCols);
    if (race.frozen || rally.frozen) { inp.throttle = 0; inp.brake = 0; inp.handbrake = true; }
    const ice = seasons.iceAt(veh.pos.x, veh.pos.z, veh.pos.y, lastDay);
    if (ice > 0.25 && mode === 'car' && simTime > iceWarn) { iceWarn = simTime + 90; toast('Icy road · take it easy'); }
    const env = { wind: aviation.wind(weather.wind, windV), wet: weather.wet, ice, time: simTime, calm, dynamicColliders: dynCols, onHitDynamic: (col, v, ix, iz) => { col.owner.imp.x += ix; col.owner.imp.z += iz; if (v > 7 && col.owner.road && townAt(veh.pos.x, veh.pos.z)) police.report(1, 'reckless driving'); } };
    acc += dt;
    let steps = 0;
    if (leap && veh.mech) {
      const L = leap, Mm = veh.mech; L.t += dt;
      if (L.phase === 'crouch' && car.mechLeapReady()) {
        // spring: straight up and a little forward, kicking up dust
        Mm.vy = 17; Mm.air = true; Mm.u = Math.max(Mm.u, 5); L.phase = 'air'; L.t = 0;
        const gh = groundHeight(veh.pos.x, veh.pos.z);
        fx.dust(veh.pos.x, gh + 0.1, veh.pos.z, 24); audio.stomp(1, surfaceAt(veh.pos.x, veh.pos.z, gh), false, 1); shake = Math.max(shake, 0.14);
      } else if (L.phase === 'air') {
        const k = Math.min(1, L.t / 0.68);
        Mm.spin = Math.PI * 2 * k * k * (3 - 2 * k);        // one full pirouette, ending on the original heading
        if (L.t > 0.16 && mode !== 'plane') { setMode('plane', true); toast('Launch!'); }
        if (k >= 1) Mm.spin = 0;
        if (L.t > 3) leap = null;
      } else if (L.t > 1.5) leap = null;
    }
    if (veh.mech) veh.mech.lock = !!car.mechBusy;
    if (island.activity(dt, { veh, mode, fPress, rides, econ, toast: (m) => toast(m), stats })) fPress = false;
    if (home && home.update(dt, { veh, mode, night: timeOfDay < 6.5 || timeOfDay > 19, fPress, sleep: goodnight })) fPress = false;
    if (fPress && washMsg) { fPress = false; washReq = true; }
    if (fPress && evMsg.startsWith('F ·')) { fPress = false; evReq = true; }   // hitchhiker / market (prompt from the last frame)   // F at the car wash (prompt from the last frame)
    carried = transport.update(dt, veh, mode, inp, fPress); fPress = false;
    if (rides.active) {
      carried = true;
      // the parked MX-5 is in the way too
      parkedCols[0].x = veh.pos.x; parkedCols[0].z = veh.pos.z; parkedCols[0].y = veh.pos.y;
      rides.update(dt, pressed, dynCols.concat(parkedCols));
    }
    if (carried) { simTime += acc - (acc % DT); acc %= DT; }
    while (acc >= DT && steps < 40) { if (morphMech > 0) veh.stepMech(DT, inp, env, morphMech); else veh.step(DT, inp, env); simTime += DT; acc -= DT; steps++; }
    // fuel: burn, and fill up when stopped beside a pump
    if (!carried) veh.burnFuel(dt, inp.throttle, mode);
    fuelState.filling = false;
    {
      let best = 1e9, bestSt = null;
      for (const st of STATIONS) {
        const dS = Math.hypot(st.x - veh.pos.x, st.z - veh.pos.z);
        if (dS < best) { best = dS; bestSt = st; }
        if (dS < 30 && veh.vel.length() < 1 && veh.fuel < veh.tank && mode !== 'boat' && mode !== 'plane')
          for (const pm of st.pumps) if (Math.hypot(pm.x - veh.pos.x, pm.z - veh.pos.z) < 4.2) { veh.fuel = Math.min(veh.tank, veh.fuel + 1.8 * dt); fuelState.filling = true; break; }
      }
      fuelState.nearest = bestSt ? `${Math.round(best / 10) * 10} m · ${bestSt.name}` : '';
    }
    if (fuelState.filling && !fuelState.was) toast('Refuelling…'); else if (!fuelState.filling && fuelState.was && veh.fuel >= veh.tank - 0.05) toast('Tank full');
    fuelState.was = fuelState.filling;
    // garages: stop inside the workshop (car mode) and the garage screen opens; it won't reopen until you leave
    {
      let near = null;
      for (const gq of GARAGES) if (Math.hypot(gq.x - veh.pos.x, gq.z - veh.pos.z) < 5.5) near = gq;
      if (!near) garageAt = null;
      if (near && near !== garageAt && mode === 'car' && morphBoat === 0 && morphPlane === 0 && morphMech === 0 && veh.vel.length() < 0.8) {
        garageStill += dt;
        if (garageStill > 0.6) { garageAt = near; garageStill = 0; audio.setPaused(true); garage.show(near.name); }
      } else garageStill = 0;
    }
    // nitro (after buying the kit): Z / pad X in the car
    const nl = econ.nitro(dt, mode === 'car' && (pressed('KeyZ') || (gp.connected && veh.auto && gp.held.has(PAD.LB))));
    $('nitro').hidden = nl < 0 || mode !== 'car';
    if (nl >= 0) $('nitro').firstChild.style.transform = `scaleX(${nl})`;
    if (econ.nitroOn && veh.vel.length() > 3) { tmpV.set(0, -0.1, -2.1).applyQuaternion(veh.q).add(veh.pos); fx.sparks(tmpV.x, tmpV.y, tmpV.z, -veh.vel.x * 0.2, -veh.vel.z * 0.2, 2, 0.2); }
    // who traffic pulls over for: police cars in a pursuit, and you with the hazards on
    traffic.yieldTo.length = 0;
    if (police.wanted) for (const pc of police.cars) { const yaw = pc.m.rotation.y; traffic.yieldTo.push({ x: pc.m.position.x, z: pc.m.position.z, vx: Math.sin(yaw) * pc.speed, vz: Math.cos(yaw) * pc.speed }); }
    if (lampState().blink === 2 && mode === 'car') { const ri = rides.info, P0 = ri ? ri.pos : veh.pos, V0 = ri ? ri.vel : veh.vel; traffic.yieldTo.push({ x: P0.x, z: P0.z, vx: V0.x, vz: V0.z }); }
    if (trafficOn) {
      // traffic gives way to whatever you're driving, the parked MX-5 and the street-racing MX-5s
      traffic.extra.length = 0;
      if (rides.info) traffic.extra.push(veh.pos);
      for (const rv of challenges.rivals) if (rv.r) traffic.extra.push(rv.m.position);
      traffic.playerVel = rides.info ? rides.info.vel : veh.vel;
      traffic.update(dt, rides.info ? rides.info.pos : veh.pos, timeOfDay < 6.6 || timeOfDay > 18.6);
    }
    towns.setNight(timeOfDay < 6.2 || timeOfDay > 19.2 ? 1 : timeOfDay < 7.2 ? (7.2 - timeOfDay) : timeOfDay > 18.2 ? (timeOfDay - 18.2) : 0);
    towns.update(dt);
    { const nt = timeOfDay < 6.2 || timeOfDay > 19.2 ? 1 : timeOfDay < 7.2 ? (7.2 - timeOfDay) : timeOfDay > 18.2 ? (timeOfDay - 18.2) : 0; airport.setNight(nt); }
    airport.update(dt, veh.pos);
    aviation.update(dt, { veh, mode, onGround: veh.telemetry.onGround, day: lastDay, weatherWind: weather.wind });
    { const ri3 = rides.info; stats.update(dt, { mode, speed: ri3 ? ri3.kmh / 3.6 : carried ? 0 : veh.vel.length(), onGround: veh.telemetry.onGround, night: timeOfDay < 6.5 || timeOfDay > 19.5, storm: weather.storm > 0.5, riding: !!ri3 });
      if (ri3) stats.ride(rides.kind); if (transport.ride) stats.event(transport.ride.kind === 'freight' ? 'motorail' : transport.ride.kind); }
    { const ri5 = rides.info; challenges.update(dt, { veh: ri5 ? { pos: ri5.pos, vel: ri5.vel, q: veh.q } : veh, mode, onGround: veh.telemetry.onGround, ride: !!ri5, others: trafficOn ? traffic.cars : [], parked: ri5 ? veh.pos : null }); }
    const evC = (() => { const ri6 = rides.info; return career.update(dt, { pos: ri6 ? ri6.pos : veh.pos, vel: ri6 ? ri6.vel : veh.vel }); })();
    if (veh.mech && morphMech >= 1) { const a = veh.mech.air; if (a) poundH = Math.max(poundH, veh.telemetry.altitude); else { if (wasMechAir && poundH > 3) arena.pound(veh.pos.x, veh.pos.z); poundH = 0; } wasMechAir = a; }
    { const ri8 = rides.info; raceway.update(dt, { pos: ri8 ? ri8.pos : veh.pos, night: timeOfDay < 6.3 || timeOfDay > 19.3, cam: camera.position }); }
    { const ri7 = rides.info; island.update(dt, { pos: ri7 ? ri7.pos : veh.pos, night: timeOfDay < 6.3 || timeOfDay > 19.3 ? 1 : 0, onVisit: () => { stats.event('lighthouse'); toast('Gull Island lighthouse'); } }); }
    { const on = mode === 'mech' && arena.story.up.shield && arena.active; shield.flash = Math.max(0, shield.flash - dt * 2.5); shield.m.visible = on || shield.flash > 0.02;
      if (shield.m.visible) { shield.m.position.set(veh.pos.x, veh.pos.y + 1.4, veh.pos.z); shield.m.material.opacity = (on ? 0.07 : 0) + shield.flash * 0.6; shield.m.material.map.offset.x += dt * 0.05; shield.m.scale.setScalar(1 + shield.flash * 0.08); } }
    // dirt: builds up off-road (fastest in mud and rain), a little on wet roads; the car wash at any fuel station
    if (mode === 'car' && !rides.active && !transport.ride) {
      const sp = Math.hypot(veh.vel.x, veh.vel.z), offRoad = veh.wheels.filter((w) => w.contact && w.surface !== 'asphalt').length / 4;
      const add = sp * dt * (offRoad * (0.0012 + weather.wet * 0.002) + weather.wet * 0.00012);
      if (add > 0) custom.setDirt(custom.dirt + add);
      if (wash) { wash.t -= dt; custom.setDirt(custom.dirt - dt * 0.3); for (let k = 0; k < 3; k++) fx.smoke(veh.pos.x + (Math.random() - 0.5) * 3, veh.pos.y + 0.5 + Math.random() * 1.5, veh.pos.z + (Math.random() - 0.5) * 3, 0.6, false); if (wash.t <= 0) { wash = null; custom.setDirt(0); toast('Sparkling clean'); saveSettings(); } }
      washMsg = '';
      if (!wash && custom.dirt > 0.08 && sp < 1) { const st = STATIONS.find((q) => Math.hypot(q.x - veh.pos.x, q.z - veh.pos.z) < 22); if (st) { washMsg = `F · car wash ($15) · the car is ${custom.dirt > 0.6 ? 'filthy' : custom.dirt > 0.3 ? 'dirty' : 'a bit grubby'}`; if (washReq) { washReq = false; if (econ.spend(15)) { wash = { t: 4 }; toast('Car wash…'); } else toast('The car wash is $15'); } } }
    } else washMsg = '';
    washReq = false;
    { const ri9 = rides.info; tmpV.set(0, 0, 1).applyQuaternion(veh.q);
      evMsg = events.update(dt, { pos: ri9 ? ri9.pos : veh.pos, vel: ri9 ? ri9.vel : veh.vel, q: veh.q, yaw: Math.atan2(tmpV.x, tmpV.z), mode: ri9 ? 'ride' : mode, hour: timeOfDay, f: evReq, seasonName: seasons.season,
        busy: !!(missions.active || race.active || rally.active || transport.ride || rides.active || arena.active) }); evReq = false; }
    rogueMsg = arena.roam(dt, veh, mode, !!(missions.active || race.active || rally.active || transport.ride || rides.active));
    const evR = rally.update(dt, veh, mode), evA = arena.update(dt, veh, mode, veh.telemetry.onGround);
    if (meet) meet.update(dt, { veh, mode, hour: timeOfDay, day: Math.floor(Date.now() / 3600000), paint: settings.paint, dmgEngine: veh.dmg.engine, dirt: custom.dirt });
    { const ev = evR || evA || evC; $('eventHud').hidden = !ev;
      if (ev) { $('evTitle').textContent = ev.title; $('evBig').textContent = ev.big || (ev.time != null ? ev.time.toFixed(1) : ''); $('evBig').hidden = !ev.big && ev.time == null;
        $('evNotes').innerHTML = (ev.notes || []).map((n, i) => `<span class="${i ? '' : 'first'}">${n}</span>`).join('');
        $('evLine').textContent = ev.line || (ev.km != null ? `${ev.km} km to the finish` : '');
        $('evBars').hidden = ev.hp == null; if (ev.hp != null) { $('evHp').style.width = Math.max(0, ev.hp) + '%'; $('evBossW').hidden = ev.boss == null; if (ev.boss != null) $('evBoss').style.width = Math.max(0, ev.boss * 100) + '%'; } } }
    world2.update(dt, timeOfDay < 6.2 || timeOfDay > 19.2 ? 1 : timeOfDay < 7.2 ? (7.2 - timeOfDay) : timeOfDay > 18.2 ? (timeOfDay - 18.2) : 0);
    extras.update(dt, timeOfDay < 6.2 || timeOfDay > 19.2 ? 1 : timeOfDay < 7.2 ? (7.2 - timeOfDay) : timeOfDay > 18.2 ? (timeOfDay - 18.2) : 0);
    audio.airliner(airport.sound.level, airport.sound.pitch);

    // --- sync visuals
    car.root.position.copy(veh.pos);
    car.root.quaternion.copy(veh.q);
    const ratioSpin = dt;
    for (let i = 0; i < 4; i++) {
      const w = veh.wheels[i], vw = car.wheels[i];
      vw.mount.position.y = veh.attachY - w.len + morphBoat * 0.18;
      vw.mount.position.x = w.x - (i % 2 === 0 ? 1 : -1) * morphBoat * (car.real ? 0.25 : 0.1); // tuck inside the arches; crashes shove it in
      vw.mount.position.z = w.z;
      // a bent rim wobbles: the wheel plane precesses once per turn
      const wob = veh.dmg.bend[i] * 0.07 + (veh.dmg.loose[i] ? 0.09 : 0);
      if (veh.dmg.loose[i]) vw.mount.position.y -= 0.03;
      vw.steerG.rotation.y = w.angle + wob * Math.sin(w.phase);
      vw.steerG.rotation.z = (veh.dmg.camber[i] + (veh.dmg.loose[i] ? 0.28 : 0)) * (i % 2 === 0 ? 1 : -1) + wob * Math.cos(w.phase);
      if (morphBoat < 0.05) vw.spin.rotation.x += w.omega * ratioSpin; else vw.spin.rotation.x *= 0.9;
    }
    car.state.brake = inp.brake > 0 && mode !== 'plane' && veh.gear !== 0 ? 1 : 0;
    car.state.reverse = mode === 'car' && veh.gear === 0;
    audio.setTop(car.state.topT);
    // what loose panels feel in the car frame: gravity minus the car's acceleration
    if (dt > 0) { accW.subVectors(veh.vel, prevVel).divideScalar(dt); prevVel.copy(veh.vel); }
    effL.set(0, -9.81, 0).sub(accW.clampLength(0, 60)).applyQuaternion(qInvL.copy(veh.q).invert());
    const M = veh.mech;
    car.update(dt, { mech: M && morphMech > 0 ? { u: M.u, yawRate: veh.w.y, air: M.air, jet: M.jet, lights: car.state.lights, limp: veh.mechLimp || 0 } : null, eff: effL, speed: veh.vel.length(), steerAngle: veh.steerAngle, roll: inp.roll, pitch: inp.pitch, yaw: inp.yaw, propSpeed: veh.propSpeed, boatProp: veh.boatProp });

    // mech: footfalls, landings and jump-jet exhaust
    { const MW = car.mechWeapons; if (MW && mode !== 'mech') { MW.setCannon(false); MW.setPod(false); } weapons.update(dt, M && morphMech > 0 ? MW : null, M); }
    if (M && morphMech > 0) {
      const ghM = groundHeight(veh.pos.x, veh.pos.z);
      const surfM = surfaceAt(veh.pos.x, veh.pos.z, ghM), wetM = veh.telemetry.inWater;
      if (car.state.footfall) { stepSide = -stepSide; audio.stomp(0.45 + Math.min(0.4, Math.abs(M.u) * 0.06), roadAt(veh.pos.x, veh.pos.z, 1) ? 'asphalt' : surfM, wetM, stepSide); shake = Math.max(shake, 0.035 + Math.abs(M.u) * 0.006); fx.dust(veh.pos.x, ghM + 0.1, veh.pos.z, 4); }
      if (M.land) {
        audio.stomp(Math.min(1, 0.45 + M.land / 10), surfM, wetM, 1); shake = Math.max(shake, Math.min(0.25, 0.03 * M.land)); fx.dust(veh.pos.x, ghM + 0.1, veh.pos.z, 16);
        // a hard landing flattens the trees around it and shoves traffic away; a very hard one hurts the legs
        if (M.land > 7) {
          const R = 3 + M.land * 0.3;
          veg.knock(veh.pos.x, veh.pos.z, R, 0, 0);
          for (const c of traffic.cars) { const dx = c.mesh.position.x - veh.pos.x, dz = c.mesh.position.z - veh.pos.z, d = Math.hypot(dx, dz); if (trafficOn && d < R + 2 && d > 0.1) { c.imp.x += dx / d * c.mass * M.land * 0.6; c.imp.z += dz / d * c.mass * M.land * 0.6; } }
        }
        // superhero landing: drop to one knee with a fist into the ground, which cracks and crackles with arcs
        if (M.land > 9 && morphMech >= 1) {
          const st = Math.min(1, (M.land - 9) / 14);
          car.mechAction('land', st);
          const cx = veh.pos.x + Math.sin(M.yaw) * 0.7, cz = veh.pos.z + Math.cos(M.yaw) * 0.7, cy = groundHeight(cx, cz);
          if (!wetM) impact.slam(cx, cy, cz, st, groundHeight);
          fx.dust(cx, cy + 0.1, cz, 20 + 30 * st); fx.sparks(cx, cy + 0.2, cz, 0, 0, 16 + 24 * st, 1);
          audio.impact(0.6 + 0.4 * st, false, 'metal'); audio.thump(1); shake = Math.max(shake, 0.2 + 0.15 * st);
        }
        if (M.land > 26) {
          car.deform(tmpV.set(0, 0.35, -1.2), tmpV2.set(0, 1, 0), Math.min(1, (M.land - 26) / 12));
          veh.mechLimp = Math.min(1, (veh.mechLimp || 0) + 0.35); toast(veh.mechLimp >= 1 ? 'Legs badly damaged · press X to repair' : 'Hard landing · leg damaged');
        }
        M.land = 0;
      }
      // punch: whatever is in front of the fist takes it
      if (car.mechTakeHit()) {
        const fx_ = Math.sin(M.yaw), fz_ = Math.cos(M.yaw), px = veh.pos.x + fx_ * 2.3, pz = veh.pos.z + fz_ * 2.3, py = veh.pos.y + 1.4;
        let landed = arena.punch(px, py, pz, fx_, fz_);
        landed = veg.knock(px, pz, 2.4, fx_, fz_) > 0 || landed;
        if (trafficOn) for (const c of traffic.cars) {
          const d = Math.hypot(c.mesh.position.x - px, c.mesh.position.z - pz);
          if (d < 3.5) { c.imp.x += fx_ * c.mass * 9; c.imp.z += fz_ * c.mass * 9; landed = true; fx.sparks(px, py, pz, fx_ * 3, fz_ * 3, 14, 1); }
        }
        if (!landed) for (let k = 0, a = nearbyColliders(px, pz, colTmp); k < a.length; k += 4) if (Math.hypot(a[k] - px, a[k + 1] - pz) < a[k + 2] + 1.2 && a[k + 3] > py - 2) { landed = true; fx.sparks(px, py, pz, -fx_ * 2, -fz_ * 2, 10, 1); car.deform(tmpV.set(0.4, 0.9, 0.9), tmpV2.set(0, 0, -1), 0.15); break; }
        if (landed) { audio.impact(0.5, false, 'metal'); shake = Math.max(shake, 0.12); } else audio.servo(0.6, 0.9);
      }
      if (M.jet) { tmpV.set(0, 2.2, -0.75).applyQuaternion(veh.q).add(veh.pos); fx.sparks(tmpV.x, tmpV.y, tmpV.z, 0, 0, 3, 1.4); }
    }

    // --- sky / time
    timeOfDay = (timeOfDay + dt / 60) % 24; // one in-game hour per real minute
    const day = sky.update(timeOfDay, veh.pos); lastDay = day;
    if (Math.abs(timeOfDay - envTime) > 0.25) { updateEnv(sky.sunDir); envTime = timeOfDay; }
    renderer.toneMappingExposure = (0.55 + 0.35 * day) * (1 - 0.18 * weather.cloud);
    water.uniforms.uSunDir.value.copy(sky.sunDir);
    water.uniforms.uSunColor.value.copy(sky.sunColor);
    water.uniforms.uHorizon.value.copy(sky.horizon);
    water.uniforms.uZenith.value.copy(sky.zenith);
    clouds.update(dt, day, sky.sunColor, weather.cloud);
    veg.update(dt, camera.position);
    terrainLodT -= dt; if (terrainLodT <= 0) { terrainLodT = 0.5; scene.userData.terrain.userData.lod(camera.position); }
    impact.update(dt);

    // --- crashes: damage, effects, camera shake
    const hit = damage.update(dt);
    if (hit > 0.12) { drift.crash(); stats.crash(); }
    if (hit > 0.3 && mode === 'car') service.knock(veh, hit);
    service.roadHazards(dt, veh, mode); service.update(dt, veh);
    missions.hit(hit);
    shake = Math.max(shake * Math.exp(-dt * 6), hit * 0.35);
    fx.update(dt);

    // --- tyre marks and dust
    {
      const lv = tmpV2.set(1, 0, 0).applyQuaternion(veh.q), uv = upV.set(0, 1, 0).applyQuaternion(veh.q);
      const spd = veh.vel.length();
      for (let i = 0; i < 4; i++) {
        const w = veh.wheels[i];
        if (!w.contact || morphBoat > 0.3) { skids.break(i); continue; }
        const cp = tmpV.set(w.x, veh.attachY - w.len - DIMS.wheelR + 0.02, w.z).applyQuaternion(veh.q).add(veh.pos);
        const lat = Math.max(0, Math.abs(w.slipLat) - 0.12) * 4, lon = Math.max(0, Math.abs(w.slip) - 0.2) * 1.6;
        const soft = w.surface === 'sand' || w.surface === 'grass' || w.surface === 'snow';
        // tyre smoke: sliding or spinning on tarmac (thicker the harder it's working, and from a standing burnout too)
        const work = lat + lon;
        if (!soft && w.surface === 'asphalt' && work > 0.35 && weather.wet < 0.5) {
          const rate = (work - 0.25) * dt * 70;
          for (let k = 0; k < Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0); k++) fx.smoke(cp.x + (Math.random() - 0.5) * 0.4, cp.y + 0.3, cp.z + (Math.random() - 0.5) * 0.4, Math.min(1, work * 0.9), false, veh.vel.x * 0.25, veh.vel.z * 0.25);
        }
        let k = Math.min(0.32, (lat + lon) * 0.4), rgb = [0.02, 0.02, 0.02];
        if (soft) { rgb = w.surface === 'snow' ? [0.55, 0.58, 0.62] : w.surface === 'sand' ? [0.42, 0.34, 0.24] : [0.22, 0.18, 0.11]; k = spd > 1.5 ? Math.max(k, 0.22) : 0; }
        skids.add(i, cp, lv, uv, spd > 0.5 ? k : 0, rgb);
        // spray off a wet road
        if (i >= 2 && spd > 8 && w.surface === 'asphalt' && weather.wet > 0.3 && Math.random() < Math.min(1, spd * dt * 2 * weather.wet)) fx.dust(cp.x, cp.y + 0.15, cp.z, 1, [0.78, 0.8, 0.82]);
        if (i >= 2 && spd > 4 && w.surface !== 'asphalt' && Math.random() < Math.min(1, spd * dt * 2.5)) {
          const dc = w.surface === 'gravel' ? [0.62, 0.56, 0.46] : w.surface === 'sand' ? [0.78, 0.68, 0.52] : w.surface === 'snow' ? [0.95, 0.96, 1] : w.surface === 'rock' ? [0.6, 0.58, 0.55] : [0.5, 0.44, 0.34];
          fx.dust(cp.x, cp.y + 0.2, cp.z, 1, dc);
        }
      }
      skids.update();
    }

    // --- camera
    fwd.set(0, 0, 1).applyQuaternion(veh.q);
    upV.set(0, 1, 0).applyQuaternion(veh.q);
    if (!drag && performance.now() - lastDrag > 1500) { lookYaw *= Math.pow(0.1, dt); lookPitch *= Math.pow(0.1, dt); }
    { const show = camMode === 2 && gps.visible && mode === 'car' && !rides.active; gps.setDash(show); phone.g.visible = show;
      if (show) { phone.g.position.copy(car.eye).add(tmpV.set(-0.36, -0.13, 0.52)).applyQuaternion(veh.q).add(veh.pos); phone.g.quaternion.copy(veh.q); phone.g.rotateY(Math.PI - 0.45); phone.g.rotateX(-0.15); phone.t.needsUpdate = true; } }
    if (camMode === 2) {
      tmpV.copy(car.eye).applyQuaternion(veh.q).add(veh.pos);
      camera.position.copy(tmpV);
      tmpV2.set(Math.sin(lookYaw) * 10, 0.2 + lookPitch * 6, Math.cos(lookYaw) * 10).applyQuaternion(veh.q).add(tmpV);
      camera.up.copy(upV);
      camera.lookAt(tmpV2);
    } else {
      const far = camMode === 1;
      const planeView = morphPlane > 0.5;
      const dist = (far ? 11 : 6.2) + morphPlane * (far ? 8 : 6) + morphBoat * 1.5 + morphMech * (far ? 6 : 4);
      const height = (far ? 3.6 : 1.9) + morphPlane * 1.6 + morphMech * 2.4;
      // follow direction: heading for car/boat, velocity for plane
      let dir = tmpV.copy(fwd);
      if (!planeView) { dir.y = 0; if (dir.lengthSq() < 0.01) dir.set(0, 0, 1); dir.normalize(); }
      else if (veh.vel.length() > 15) dir.copy(veh.vel).normalize().lerp(fwd, 0.4).normalize();
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), lookYaw);
      const target = tmpV2.copy(veh.pos).addScaledVector(dir, -dist * Math.cos(lookPitch * 0.8));
      target.y += height + dist * Math.sin(lookPitch * 0.8);
      const k = 1 - Math.pow(planeView ? 0.0004 : 0.0009, dt);
      if (camPos.distanceTo(target) > 80) { camPos.copy(target); camLook.copy(veh.pos); }
      camPos.lerp(target, k);
      const gmin = Math.max(groundHeight(camPos.x, camPos.z), -50) + 0.6;
      if (camPos.y < gmin) camPos.y = gmin;
      camera.position.copy(camPos);
      camLook.lerp(tmpV.copy(veh.pos).addScaledVector(fwd, 1.5).add(new THREE.Vector3(0, 0.7 + morphMech * 1.9, 0)), 1 - Math.pow(0.00001, dt));
      camera.up.set(0, 1, 0);
      if (planeView) camera.up.lerp(upV, 0.35).normalize();
      camera.lookAt(camLook);
      if (shake > 0.002) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; camera.position.z += (Math.random() - 0.5) * shake; }
    }
    transport.camera(camera, camMode, dt);
    rides.camera(camera, dt, lookYaw);
    const fovTarget = 62 + Math.min(14, Math.max(0, veh.vel.length() - 20) * 0.25);
    camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 2); camera.updateProjectionMatrix();

    // underwater?
    const camWater = waveHeight(camera.position.x, camera.position.z, simTime, calm);
    const under = camera.position.y < camWater - 0.05 && terrainHeight(camera.position.x, camera.position.z) < camera.position.y;
    $('underwater').hidden = !under;
    const fogW = weather.update(dt, camera.position, under, day);
    seasons.update(dt, camera.position, day);
    ambience.update(dt, { cam: camera.position, hour: timeOfDay, wet: weather.wet, night: timeOfDay < 6 || timeOfDay > 19.5 ? 1 : 0, horizon: sky.horizon, rain: weather.rain });
    { const ri4 = rides.info; wildlife.update(dt, { pos: ri4 ? ri4.pos : veh.pos, vel: ri4 ? ri4.vel : veh.vel, hour: timeOfDay, mode: ri4 ? 'ride' : mode }); }
    floods.update(dt, weather, veh, mode, fx);
    scene.fog.density = under ? 0.06 : fogW;
    airport.setFog(Math.min(1, Math.max(0, (fogW - 0.0012) / 0.005)));

    water.update(simTime, camera.position);

    // (vegetation distance culling and level of detail live in veg.update)

    // --- audio
    // squeal starts near the tyre's limit (~75% of peak slip), not in ordinary cornering
    const slipMax = Math.max(...veh.wheels.map((w) => (w.contact ? Math.max(Math.abs(w.slip) / 0.1, Math.abs(w.slipLat) / 0.13) * 0.4 - 0.2 : 0)));
    if (rides.active) { const ri2 = rides.info; audio.update({ rpm: ri2.rpm, throttle: inp.throttle, slip: 0, speed: ri2.kmh / 3.6, inWater: rides.kind === 'ski', prop: ri2.heli ? 240 : 0, onGround: !ri2.air, surface: 'asphalt', mech: 0 }); }
    else audio.update({ rpm: veh.rpm, throttle: mode === 'plane' ? veh.throttleLever : inp.throttle, slip: veh.vel.length() > 2 ? slipMax : 0, speed: veh.vel.length(), inWater: veh.telemetry.inWater, prop: veh.propSpeed, onGround: veh.wheels.some((w) => w.contact), surface: veh.wheels[2].surface, mech: morphMech });

    // --- crash feedback

    // --- HUD (throttled to ~20 Hz)
    const rpi = rides.info; const mi = missions.update(dt, rpi ? rpi.pos : veh.pos, mode, simTime, { speed: rpi ? rpi.kmh / 3.6 : veh.vel.length(), time: simTime });   // every frame: it keeps the clock
    jobs.update(dt, veh, mode, veh.telemetry.onGround || veh.telemetry.inWater);
    const ri = race.update(dt, veh);
    // highway lap ghost
    { const A = missions.active;
      if (A && A.def.id === 'lap' && A.running) { if (!lapGhost) { ghosts.start('lap'); lapGhost = true; } ghosts.record(A.t, veh); ghosts.play('lap', A.t); }
      else if (lapGhost && !(A && A.def.id === 'lap')) { ghosts.stop(); lapGhost = false; } }
    // drift scoring
    const ds = drift.update(dt, veh, mode, veh.telemetry.onGround);
    $('driftHud').hidden = !(ds.chain > 50);
    { const ps = !transport.prompt && mode === 'car' && Math.hypot(veh.vel.x, veh.vel.z) < 3 ? photos.near(veh.pos) : null;
      const pr = transport.prompt || island.prompt || rogueMsg || washMsg || evMsg || (home && home.prompt) || (ps ? `Photo spot · ${ps.name}${settings.photos[ps.id] ? ' (captured)' : ''} · press 0 for photo mode, frame it, Enter` : '');
      $('prompt').hidden = !pr || photo.on; if (pr) $('prompt').textContent = pr;
      const th = transport.hud(); $('trainHud').hidden = !th;
      if (th) { $('tSpd').textContent = Math.round(th.speed); $('tSig').className = 'sig ' + th.signal;
        $('tThr').style.background = `linear-gradient(90deg,#3fa9ff ${th.throttle * 100}%,#333 0)`; $('tBrk').style.background = `linear-gradient(90deg,#f44 ${th.brake * 100}%,#333 0)`;
        $('tInfo').textContent = th.emergency ? 'EMERGENCY BRAKE' : `Signal ${th.signal} · train ahead ${Math.round(th.ahead)} m`; } }
    if (ds.chain > 50) { $('dScore').textContent = Math.round(ds.chain * ds.mult).toLocaleString('en-US'); $('dMult').textContent = `${ds.mult > 1 ? `×${ds.mult} · ` : ''}${ds.zone ? 'drift zone' : 'drift'}`; }
    // autosave: where you are (on the ground, in the car), the time of day and fuel, every 10 s
    saveT += dt;
    if (saveT > 10) { saveT = 0; if (mode === 'car' && veh.telemetry.onGround && morphPlane === 0 && morphBoat === 0 && morphMech === 0 && !race.active && !carried) { tmpV.set(0, 0, 1).applyQuaternion(veh.q); settings.save = { x: +veh.pos.x.toFixed(1), z: +veh.pos.z.toFixed(1), h: +Math.atan2(tmpV.x, tmpV.z).toFixed(3), t: +timeOfDay.toFixed(2), fuel: +veh.fuel.toFixed(1), eng: +veh.dmg.engine.toFixed(2) }; saveSettings(); } }
    police.update(dt, veh, mode, !veh.telemetry.onGround && veh.telemetry.altitude > 3);
    pedToastT = Math.max(0, pedToastT - dt);
    city.update(dt, veh.pos, veh.vel, mode, () => police.report(1, 'running a red light'), (v) => { police.report(v > 9 ? 2 : 1, 'hitting a pedestrian'); if (!pedToastT) { toast('Watch out for pedestrians!'); pedToastT = 4; } });
    hudTimer -= dt;
    if (hudTimer <= 0) {
      hudTimer = 0.05;
      const tm = veh.telemetry;
      const kmh = Math.abs(tm.speed) * 3.6;
      const gearLabel = mode === 'car' ? (veh.gear === 0 ? 'R' : veh.gear === 1 ? 'N' : String(veh.gear - 1)) + (veh.auto ? '' : ' M') : mode === 'boat' ? 'OB' : mode === 'mech' ? (veh.mech && veh.mech.jet ? 'JET' : 'MECH') : `${Math.round(veh.throttleLever * 100)}%`;
      const rdi = rides.info;
      if (rdi) { drawGauge(tachCtx, rdi.rpm, rdi.heli ? 8000 : 11000, 1000, 'rpm', 'x1000 r/min', rdi.heli ? 7000 : 10000, rdi.name.toUpperCase().slice(0, 5)); drawGauge(spdCtx, rdi.heli ? rdi.kmh / 1.852 : rdi.kmh, rdi.heli ? 160 : 260, 20, rdi.heli ? 'kt' : 'kmh', rdi.heli ? 'knots' : 'km/h', null, rdi.heli ? `${Math.round(rdi.alt)}m` : `${Math.round(rdi.kmh)}`); }
      else drawGauge(tachCtx, veh.rpm, 8000, 1000, 'rpm', 'x1000 r/min', 7000, gearLabel);
      if (rdi) { /* drawn above */ }
      else if (mode === 'plane') drawGauge(spdCtx, tm.airspeed * 1.944, 180, 20, 'kt', 'knots IAS', null, `${Math.round(tm.altitude)}m`);
      else if (mode === 'boat') drawGauge(spdCtx, Math.abs(tm.speed) * 1.944, 40, 5, 'kt', 'knots', null, `${Math.round(Math.abs(tm.speed) * 1.944)}`);
      else drawGauge(spdCtx, kmh, 220, 20, 'kmh', 'km/h', null, `${Math.round(kmh)}`);
      // plane panel (with the runway 36 ILS) and the mech's HUD
      const showPanel = mode === 'plane' && morphPlane > 0.5;
      $('instr').hidden = !showPanel || photo.on;
      if (showPanel) instruments.drawPlane(veh.q, veh.pos, veh.vel, tm.altitude, 0.05, windV);
      const showMechHud = morphMech >= 1 && veh.mech;
      $('mechHud').hidden = !showMechHud;
      if (showMechHud) {
        const M2 = veh.mech, targets = [];
        if (trafficOn) for (const c of traffic.cars) { const d = c.mesh.position.distanceTo(veh.pos); if (d < 45) targets.push({ x: c.mesh.position.x, y: c.mesh.position.y + 1, z: c.mesh.position.z, d, label: ['HATCH', 'SALOON', 'TRUCK', 'SUV', 'VAN'][c.kind] || 'CAR' }); }
        for (const l of airport.liners) { const d = l.m.position.distanceTo(veh.pos); if (d < 80 && l.onGround) targets.push({ x: l.m.position.x, y: l.m.position.y + 2, z: l.m.position.z, d, label: 'AIRLINER ' + l.name }); }
        instruments.drawMech({ q: veh.q, pos: veh.pos, u: M2.u, fuel: Math.max(0, M2.fuel / 1.5), jet: M2.jet, limp: veh.mechLimp || 0, agl: tm.altitude, targets }, camera);
      }
      $('wanted').hidden = !police.wanted;
      if (police.wanted) { $('wStars').textContent = '★'.repeat(police.wanted) + '☆'.repeat(3 - police.wanted); $('wInfo').textContent = police.busting > 0.3 ? 'Pulled over…' : police.losing > 1 ? 'Losing them…' : mode === 'car' ? 'Police pursuit · stop to pay the fine, or lose them' : 'Police pursuit'; }
      damage.draw(dmgCtx); drawFuel();
      if (!$('tyres').hidden) drawTyres();
      const h = Math.floor(timeOfDay), mnt = Math.floor((timeOfDay - h) * 60);
      $('clock').textContent = `${String(h).padStart(2, '0')}:${String(mnt).padStart(2, '0')}`;
      const hp = rides.info ? rides.info.pos : veh.pos;   // where you are: the ride you're on, or the MX-5
      const gh = groundHeight(hp.x, hp.z);
      const town = townAt(hp.x, hp.z) || (airportAt(hp.x, hp.z) ? AIRPORT : null);
      const wx = (weather.snowing ? ' · Snow' : { clear: '', overcast: ' · Overcast', rain: ' · Rain', storm: ' · Thunderstorm', fog: ' · Fog' }[weather.state]) + (floods.flood > 0.15 && weather.state !== 'clear' ? ' · Flood warning' : '');
      $('biome').textContent = (hp.y - Math.max(gh, 0) > 40 ? `Sky · ${town ? town.name : biomeName(hp.x, hp.z, gh)} below` : town ? town.name : biomeName(hp.x, hp.z, gh)) + wx;
      const rd = roadAt(hp.x, hp.z, 1);
      $('road').textContent = rd ? rd.road.name + (rd.bridge ? ' · bridge' : '') : `${Math.round(hp.y)} m above sea`;
      // live data for the GPS (once a second): crashes and police chases, fuel, weather
      gpsFeedT -= 0.05;
      if (gpsFeedT <= 0) {
        gpsFeedT = 1;
        const inc = [];
        traffic.cars.forEach((c, i) => { if (c.crash && c.crash.t < 30) inc.push({ x: c.mesh.position.x, z: c.mesh.position.z, kind: 'Crash', id: 't' + i }); });
        if (police.wanted) police.cars.forEach((c, i) => { const p = c.m && c.m.visible ? c.m.position : null; if (p) inc.push({ x: p.x, z: p.z, kind: 'Police chase', id: 'p' + i }); });
        gps.setIncidents(inc);
        gps.setFuel({ l: veh.fuel, tank: veh.tank, stations: STATIONS });
        gps.setWeather({ state: weather.state, rain: weather.rain, storm: weather.storm, forecast: weather.forecast, wind: weather.wind });
      }
      { const rdg = rides.info; tmpV.set(0, 0, 1).applyQuaternion(veh.q);
        gps.update(0.05, hp, rdg ? rdg.yaw : Math.atan2(tmpV.x, tmpV.z), rdg ? rdg.kmh / 3.6 : Math.hypot(veh.vel.x, veh.vel.z), rd && rd.road.type !== 'rail' ? rd.road : null); }
      $('mission').hidden = !mi && !ri;
      $('countdown').hidden = !(ri && ri.phase === 'countdown');
      if (ri) {
        if (ri.phase === 'countdown') $('countdown').textContent = ri.count > 0 ? String(ri.count) : '';
        $('mTitle').textContent = 'Red Mesa Raceway';
        $('mInfo').textContent = ri.trial ? `Time trial · lap ${ri.lap}` : ri.done ? 'Finished · waiting for the others' : `Lap ${ri.lap}/${ri.laps} · P${ri.pos} of ${ri.of}`;
        $('mTime').textContent = `${ri.time.toFixed(1)} s${ri.best ? ` · best lap ${ri.best.toFixed(1)} s` : ''}`;
        $('mArrow').style.transform = 'none';
      }
      if (mi) {
        $('mTitle').textContent = mi.title;
        $('mInfo').textContent = `${mi.step} · ${mi.label} · ${mi.dist} m${mi.hint ? ' · ' + mi.hint : ''}`;
        $('mTime').textContent = mi.time + (mi.left ? ` · ${mi.left} left` : '') + (mi.cargo != null ? ` · cargo ${Math.round(mi.cargo)}%` : '') + (mi.best ? ` · best ${mi.best}` : mi.par ? ` · par ${mi.par}` : '');
        camera.getWorldDirection(tmpV);
        $('mArrow').style.transform = `rotate(${(-(mi.bearing - Math.atan2(tmpV.x, tmpV.z))) * 180 / Math.PI}deg)`;
      }
      let warn = '';
      if (mode === 'car' && veh.flood > 0.15) warn = `Cabin flooding ${Math.round(veh.flood * 100)}% · press 2 for boat`;
      else if (mode === 'plane' && tm.stall && !tm.onGround) warn = 'Stall';
      else if (mode === 'plane' && tm.onGround && tm.airspeed < 5 && veh.throttleLever < 0.05) warn = 'Throttle up with W · take off near 100 km/h';
      else if (mode === 'boat' && !tm.inWater && morphBoat > 0.99) warn = 'Boat on land · find water or press 1';
      else if (veh.fuel <= 0) warn = 'Out of fuel · R for an emergency can';
      else if (fuelState.filling) warn = `Refuelling ${veh.fuel.toFixed(1)} / ${veh.tank} L`;
      else if (veh.fuel < 6) warn = `Low fuel · ${veh.fuel.toFixed(1)} L · nearest station ${fuelState.nearest}`;
      else if (veh.dmg.lost.some(Boolean)) warn = 'Wheel missing · press X to repair';
      else if (veh.dmg.engine < 0.3) warn = 'Engine badly damaged · press X to repair';
      $('warn').textContent = warn;
      // the map follows whatever you're in (a ride, or the MX-5)
      const rim = rides.info, mpx = rim ? rim.pos.x : veh.pos.x, mpz = rim ? rim.pos.z : veh.pos.z, myaw = rim ? Math.PI - rim.yaw : Math.atan2(-fwd.x, fwd.z) + Math.PI;
      drawMinimap(mpx, mpz, myaw, showMap);
      if (showMap) drawMinimap(mpx, mpz, myaw, false);
    }
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').style.opacity = 0; }

    postfx.render(dt, veh.vel.length());
    document.getElementById('gps').style.display = '';
    mirror.render(!photo.on && !garage.open && (mode === 'car' || !!rides.active) && !rides.info?.heli && !transport.ride, rides.info ? rides.info.pos : veh.pos, rides.active ? tmpQm.setFromEuler(tmpEm.set(0, rides.info.yaw, 0)) : veh.q);
    if (window.__stats) window.__stats({ fps: fpsN / fpsAcc, steps });
  }

  // first frame, then reveal
  updateEnv(sky.update(timeOfDay, veh.pos) && sky.sunDir);
  setStage('Ready', 1);
  const go = $('go');
  go.hidden = false; go.focus();
  window.__game = { setCam: (m) => { camMode = m; }, events, mirror, roadJoins: ROAD_JOINS, roadsList: roads, gps, weapons, raceway, island, career, challenges, custom, service, ambience, wildlife, stats, home, rides, rally, photos, meet, arena, aviation, spawnPlane, transport, world2x: world2, seasons, floods, drift, ghosts, world2, race, police, city, jobs, missions, econ, GARAGES, garage, exitPhoto: () => setPhoto(false), world: { ROUNDABOUTS, STATION_LOTS, roofAt, JUNCTIONS, TOWNS }, shot: (x, y, z, yaw, pitch, fov = 60) => { if (!photo.on) setPhoto(true); camera.position.set(x, y, z); photo.yaw = yaw; photo.pitch = pitch; photo.fov = fov; }, airport, veg, towns, weather, missions, postfx, audio, groundHeight, veh, car, scene, camera, renderer, setMode: (m) => setMode(m), keys, traffic, setTime: (t) => { timeOfDay = t; }, setLook: (y, p) => { lookYaw = y; lookPitch = p; lastDrag = performance.now() + 1e9; } };
  const begin = () => {
    $('loader').hidden = true; audio.start();
    // resume the last generated station (Your Music needs a fresh file pick, so it isn't restored)
    const st = settings.station; if (st > 0 && radio.STATIONS[st] && radio.STATIONS[st].id !== 'mine') setTimeout(() => radio.tune(st), 400);
  };
  go.addEventListener('click', begin);
  requestAnimationFrame((t) => { last = t; frame(t); });
}

boot().catch((e) => { console.error(e); setStage('Error: ' + e.message, 1); });
