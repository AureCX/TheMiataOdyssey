// Missions: town-to-town sprints, a fragile-cargo delivery, a highway lap and a Grand Tour that needs every mode
// (road, sea, sky, a summit only the mech's jets or a landing can reach). Checkpoints are glowing rings with a light
// beam; the clock starts at the first one. Best times are kept in the saved settings.
import * as THREE from 'three';
import { TOWNS, roads, terrainHeight, AIRPORT } from './world.js';
import { STATIONS } from './towns.js';

const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

export function createMissions({ scene, settings, saveSettings, toast, onReward, onDone }) {
  settings.best = settings.best || {};
  let defs = null, active = null, lastTime = null;
  const group = new THREE.Group(); scene.add(group);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffc23a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc23a, transparent: true, opacity: 0.85 });
  const ringMat2 = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });

  function build() {
    if (defs) return defs;
    const town = (n) => TOWNS.find((t) => t.name === n);
    const station = (prefix) => STATIONS.find((s) => s.name.startsWith(prefix));
    const cp = (x, z, r, kind = 'ground', label = '', y = null) => ({ x, z, r, kind, label, y: y ?? terrainHeight(x, z) });
    const tc = (n) => { const t = town(n); return t ? cp(t.x, t.z, 14, 'ground', t.name, t.h) : null; };
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    defs = [];
    const sprint = (id, a, b) => { const A = tc(a), B = tc(b); if (A && B) defs.push({ id, name: `${a} → ${b} sprint`, desc: 'Town centre to town centre, any route.', cps: [A, B], par: dist(A, B) * 1.35 / 26 }); };
    sprint('sprint-fp', 'Fairfield', 'Port Ruby');
    sprint('sprint-mp', 'Mesa', 'Pinewood');
    // fragile delivery between two fuel stations
    { const a = station('Port Ruby'), b = station('Mesa');
      if (a && b) { const A = cp(a.x, a.z, 10, 'ground', 'Pick up at Port Ruby services', a.h), B = cp(b.x, b.z, 10, 'ground', 'Deliver to Mesa services', b.h);
        defs.push({ id: 'delivery', name: 'Fragile delivery', desc: 'Glassware from Port Ruby to Mesa. Every knock breaks some; arrive with any left, in time.', cps: [A, B], cargo: true, limit: dist(A, B) * 1.5 / 18 + 60, par: dist(A, B) * 1.35 / 24 }); } }
    // highway lap from the northern services
    { const hw = roads[0], st = station('Highway services north') || STATIONS[0];
      if (hw && st) {
        let i0 = 0, bd = 1e18; for (let i = 0; i < hw.n; i++) { const d = (hw.pts[i][0] - st.x) ** 2 + (hw.pts[i][1] - st.z) ** 2; if (d < bd) { bd = d; i0 = i; } }
        const cps = []; for (let k = 0; k <= 6; k++) { const i = (i0 + Math.round(hw.n * k / 6)) % hw.n; cps.push(cp(hw.pts[i][0], hw.pts[i][1], 16, 'ground', k === 0 ? 'Start' : k === 6 ? 'Finish' : `Highway ${k}`, hw.h[i])); }
        defs.push({ id: 'lap', name: 'Highway lap', desc: 'One lap of Highway 1, start and finish at the northern services.', cps, par: hw.length / 33 }); } }
    // Pilou International: drive out to the terminal, or fly the approach and land on runway 36
    { const A = AIRPORT, F = tc('Fairfield');
      if (F) defs.push({ id: 'airport-run', name: 'Fairfield → Pilou International', desc: 'Catch your flight: get to the terminal kerb before check-in closes.', cps: [F, cp(-470, 160, 12, 'ground', 'Terminal (airport road)', A.h)], limit: 150, par: 75 });
      defs.push({ id: 'approach', name: 'Pilou approach', desc: 'Plane: fly through the final-approach gate, touch down on runway 36 and taxi to gate 3. Watch the PAPI lights: two white, two red.', par: 120, cps: [
        cp(A.x, 1100, 32, 'air', 'Final approach gate', A.h + 45), cp(A.x, 250, 22, 'ground', 'Touch down on runway 36', A.h), cp(-420, A.gates[2], 12, 'ground', 'Taxi to gate 3', A.h)] }); }
    // Grand Tour: road, sea, sky, summit, home
    { const F = tc('Fairfield');
      let top = null; for (let x = -900; x <= 900; x += 30) for (let z = -1800; z <= -1150; z += 30) { const h = terrainHeight(x, z); if (!top || h > top.h) top = { x, z, h }; }
      const sky = { x: 0, z: -1150 };
      if (F && top) defs.push({ id: 'tour', name: 'Grand Tour', desc: 'Road, sea, sky and summit: switch modes to reach every checkpoint.', par: 600, cps: [
        F, cp(0, 1500, 26, 'sea', 'Sea marker (boat)', 0), cp(sky.x, sky.z, 34, 'air', 'Sky ring (plane)', terrainHeight(sky.x, sky.z) + 140),
        cp(top.x, top.z, 12, 'summit', 'Summit beacon (mech jets or a landing)', top.h), { ...F, label: 'Home to Fairfield' }] }); }
    return defs;
  }

  // ---- markers
  let markers = [];
  function clearMarkers() { for (const m of markers) group.remove(m); markers = []; }
  function marker(c, current) {
    const g = new THREE.Group(); g.position.set(c.x, c.y, c.z);
    if (c.kind === 'air') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(c.r, 1.4, 10, 48), ringMat); g.add(ring);
      g.userData.spin = ring;
    } else {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(c.r, 0.35, 8, 48).rotateX(Math.PI / 2), ringMat); ring.position.y = 0.4; g.add(ring);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(c.r * 0.12, c.r * 0.12, 120, 16, 1, true).translate(0, 60, 0), beamMat); g.add(beam);
    }
    if (!current) g.traverse((o) => { if (o.material === ringMat) o.material = ringMat2; });
    group.add(g); markers.push(g); return g;
  }
  function showMarkers() {
    clearMarkers();
    if (!active) return;
    for (let k = active.k; k < Math.min(active.def.cps.length, active.k + 2); k++) marker(active.def.cps[k], k === active.k);
  }

  return {
    list() { return build().map((d) => ({ id: d.id, name: d.name, desc: d.desc, best: settings.best[d.id] })); },
    get active() { return active; },
    get lastTime() { return lastTime; },
    get next() { return active ? active.def.cps[active.k] : null; },
    start(id) {
      const def = build().find((d) => d.id === id); if (!def) return;
      active = { def, k: 0, t: 0, running: false, cargo: def.cargo ? 100 : null, dwell: 0 };
      showMarkers();
      toast(`${def.name}: head for the first marker`);
    },
    // a generated job: def { id, name, cps: [{ x, z, y, r, kind, label, stop, modes, dwell, msg }], limit, job: true,
    // onReach(k, ctx), pay(t, ctx) -> amount, onEnd(ok) }
    startCustom(def) {
      if (active && active.def.onEnd) active.def.onEnd(false);
      for (const c of def.cps) if (c.y == null) c.y = terrainHeight(c.x, c.z);
      active = { def, k: 0, t: 0, running: !def.startAtFirst, cargo: null, dwell: 0 };
      showMarkers();
    },
    cancel() { if (active) { toast(active.def.job ? 'Job cancelled' : 'Mission cancelled'); if (active.def.onEnd) active.def.onEnd(false); } active = null; clearMarkers(); },
    // a knock while carrying fragile cargo
    hit(sev) {
      if (!active || active.cargo == null || !active.running || sev < 0.08) return;
      active.cargo = Math.max(0, active.cargo - sev * 55);
      if (active.cargo <= 0) { toast('The glassware is all broken · delivery failed'); active = null; clearMarkers(); }
      else toast(`Cargo ${Math.round(active.cargo)}%`);
    },
    update(dt, pos, mode, time, ctx = {}) {
      for (const m of markers) { if (m.userData.spin) { m.lookAt(pos.x, m.position.y, pos.z); } }
      if (!active) return null;
      const def = active.def, c = def.cps[active.k];
      if (active.running) active.t += dt;
      const dx = pos.x - c.x, dz = pos.z - c.z, dh = Math.hypot(dx, dz), dy = pos.y - c.y;
      let inside = c.kind === 'air' ? Math.hypot(dh, dy) < c.r : dh < c.r && dy > -4 && dy < (c.kind === 'summit' ? 6 : 10);
      // job stops: the right vehicle, stopped in the box, for a moment
      let hint = null;
      if (inside && c.modes && !c.modes.includes(mode)) { inside = false; hint = `Needs the ${c.modes.join(' or ')}`; }
      if (inside && c.stop && (ctx.speed || 0) > 1.5) { inside = false; hint = 'Stop in the marker'; }
      if (inside && c.dwell) { active.dwell += dt; if (active.dwell < c.dwell) { inside = false; hint = c.dwellMsg || 'Wait…'; } }
      else if (!inside) active.dwell = 0;
      if (inside) {
        active.dwell = 0;
        if (def.onReach) def.onReach(active.k, ctx);
        if (c.msg) toast(c.msg);
        if (active.k === 0 && (!def.job || def.startAtFirst)) { active.running = true; active.t = 0; toast('Go!'); }
        active.k++;
        if (active.k >= def.cps.length) {
          const t = active.t, best = settings.best[def.id]; lastTime = t;
          const nb = best == null || t < best;
          if (nb) { settings.best[def.id] = t; saveSettings(); }
          toast(`${def.name} complete · ${fmt(t)}${nb ? ' · new best!' : ` · best ${fmt(best)}`}${def.par ? (t <= def.par ? ' · under par' : '') : ''}${active.cargo != null ? ` · cargo ${Math.round(active.cargo)}%` : ''}`);
          if (def.job) {
            const pay = def.pay ? def.pay(t, ctx) : 0;
            if (onReward && pay > 0) onReward(pay, def.name);
            if (def.onEnd) def.onEnd(true);
            active = null; clearMarkers(); return null;
          }
          // pay: a base fee per mission, a bonus under par, and the delivery scaled by what's left of the cargo
          const base = { 'sprint-fp': 450, 'sprint-mp': 500, delivery: 900, lap: 600, tour: 2000, 'airport-run': 350, approach: 900 }[def.id] || 400;
          const pay = base * (def.par && t <= def.par ? 1.5 : 1) * (active.cargo != null ? active.cargo / 100 : 1) + (nb ? 150 : 0);
          if (onReward) onReward(pay, def.name);
          if (onDone) onDone(def, t, nb);
          active = null; clearMarkers(); return null;
        }
        if (active.k > 1 && !def.job) toast(`Checkpoint ${active.k - 1}/${def.cps.length - 2 || 1}`);
        showMarkers();
      }
      if (def.limit && active.running && active.t > def.limit) { toast(`${def.name}: out of time`); if (def.onEnd) def.onEnd(false); active = null; clearMarkers(); return null; }
      const n = def.cps[active.k];
      return {
        title: def.name, label: n.label || (active.k === def.cps.length - 1 ? 'Finish' : `Checkpoint ${active.k}`),
        time: active.running ? fmt(active.t) : 'start at the marker', best: settings.best[def.id] != null ? fmt(settings.best[def.id]) : null,
        par: def.par ? fmt(def.par) : null, left: def.limit && active.running ? fmt(Math.max(0, def.limit - active.t)) : null,
        dist: Math.round(Math.hypot(pos.x - n.x, pos.z - n.z)), bearing: Math.atan2(n.x - pos.x, n.z - pos.z), cargo: active.cargo, kind: n.kind,
        step: `${active.k + 1}/${def.cps.length}`, hint,
      };
    },
  };
}
