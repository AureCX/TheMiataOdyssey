// Rally stages on the gravel roads: a timed run from the start arch to the flying finish, with a co-driver reading
// pace notes generated from the road itself (direction and severity 1–6, "long", "into", crests, the water splash),
// shown on screen and spoken. Your best run is saved and comes back as a ghost car.
import * as THREE from 'three';
import { RBox } from './shapes.js';
import { roads } from './world.js';

const STAGES = [
  { id: 'riverside', road: 'Riverside rally stage', name: 'Riverside', desc: 'Fast gravel east of the river, with a water splash at the ford.' },
  { id: 'forest', road: 'Pinewood forest stage', name: 'Pinewood Forest', desc: 'Narrow and twisty through the pines west of the forest lake.' },
];

// corner severity from the tightest radius (6 = nearly flat, 1 = very slow); hairpins by the total turn
function severity(R, turn) { if (turn > 2.2 && R < 40) return 'hairpin'; return R > 220 ? 6 : R > 140 ? 5 : R > 90 ? 4 : R > 55 ? 3 : R > 32 ? 2 : 1; }

function makeNotes(r) {
  const n = r.n, k = new Float32Array(n), notes = [];
  for (let i = 3; i < n - 3; i++) {
    const a = Math.atan2(r.tx[i - 3], r.tz[i - 3]), b = Math.atan2(r.tx[i + 3], r.tz[i + 3]);
    const d = Math.atan2(Math.sin(b - a), Math.cos(b - a)), ds = r.s[i + 3] - r.s[i - 3];
    k[i] = -d / ds;   // + = right turn (x east, z south)
  }
  let i = 3;
  while (i < n - 3) {
    if (Math.abs(k[i]) < 1 / 300) { i++; continue; }
    const sg = Math.sign(k[i]); let j = i, kmax = 0, turn = 0;
    while (j < n - 3 && Math.sign(k[j]) === sg && Math.abs(k[j]) > 1 / 400) { kmax = Math.max(kmax, Math.abs(k[j])); turn += Math.abs(k[j]) * (r.s[j + 1] - r.s[j]); j++; }
    if (turn > 0.18) notes.push({ s: r.s[i], e: r.s[j], dir: sg > 0 ? 'right' : 'left', sev: severity(1 / kmax, turn), long: r.s[j] - r.s[i] > 70 && turn > 0.9 });
    i = j + 1;
  }
  // crests and the water splash
  for (let q = 6; q < n - 6; q += 2) {
    const c = r.h[q] - (r.h[q - 6] + r.h[q + 6]) / 2;
    if (c > 0.9 && !notes.some((x) => Math.abs(x.s - r.s[q]) < 25)) notes.push({ s: r.s[q], e: r.s[q], crest: true });
  }
  let w = -1; for (let q = 0; q < n; q++) if (r.h[q] < 0 && (w < 0 || r.s[q] - r.s[w] > 60)) { notes.push({ s: r.s[q] - 15, e: r.s[q], water: true }); w = q; }
  notes.sort((a, b) => a.s - b.s);
  for (let q = 0; q < notes.length - 1; q++) if (notes[q + 1].s - notes[q].e < 30 && !notes[q + 1].crest) notes[q].into = true;
  return notes;
}
const say = (nt) => nt.water ? 'water splash' : nt.crest ? 'over crest' : `${nt.dir} ${nt.sev === 'hairpin' ? 'hairpin' : nt.sev}${nt.long ? ' long' : ''}`;
const show = (nt) => nt.water ? '≈ SPLASH' : nt.crest ? '⌒ CREST' : `${nt.dir === 'left' ? '↰' : '↱'} ${nt.sev === 'hairpin' ? 'HAIRPIN' : nt.sev}${nt.long ? ' LONG' : ''}`;

export function createRally({ scene, toast, settings, saveSettings, econ, ghosts, audio }) {
  settings.rally = settings.rally || {};
  const group = new THREE.Group(); scene.add(group);
  const stages = STAGES.map((d) => ({ ...d, r: roads.find((q) => q.name === d.road) })).filter((d) => d.r);
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
  const banner = (text, bg) => { const c = document.createElement('canvas'); c.width = 1024; c.height = 128; const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 1024, 128); g.fillStyle = '#fff'; let fs = 84; do { g.font = `700 ${fs}px "Barlow Condensed", Arial`; fs -= 4; } while (g.measureText(text).width > 960 && fs > 30); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 512, 68); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshStandardMaterial({ map: t }); };
  const arch = (r, i, text, bg) => {
    const [x, z] = r.pts[i], g = new THREE.Group(); g.position.set(x, r.h[i], z); g.rotation.y = Math.atan2(r.tx[i], r.tz[i]); group.add(g);
    for (const s of [1, -1]) { const p = new THREE.Mesh(new RBox(0.5, 5.5, 0.5), M(0x1b1d20)); p.position.set(s * (r.hw + 1), 2.75, 0); g.add(p); }
    const b = new THREE.Mesh(new RBox(r.hw * 2 + 2.5, 1.3, 0.2), [M(0x1b1d20), M(0x1b1d20), M(0x1b1d20), M(0x1b1d20), banner(text, bg), banner(text, bg)]); b.position.y = 5.2; g.add(b);
  };
  const post = new THREE.CylinderGeometry(0.04, 0.04, 1, 5), tapeM = new THREE.MeshBasicMaterial({ color: 0xe8392e });
  const people = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.25, 1.1, 3, 6).translate(0, 0.8, 0), M(0xffffff), 160); let np = 0;
  const pc = new THREE.Color(), PM = new THREE.Matrix4();
  for (const st of stages) {
    const r = st.r; st.notes = makeNotes(r); st.i0 = 4; st.i1 = r.n - 8;
    arch(r, st.i0, `STAGE START · ${st.name.toUpperCase()}`, '#c8102e'); arch(r, st.i1, `FLYING FINISH · ${st.name.toUpperCase()}`, '#1f4fb4');
    // tape lines and spectators at the start, the finish and the bigger corners
    const spots = [st.i0 + 6, st.i1 - 6, ...st.notes.filter((x) => x.sev === 2 || x.sev === 1 || x.sev === 'hairpin' || x.water).map((x) => { let q = 0; while (q < r.n - 1 && r.s[q] < x.s) q++; return q; })].slice(0, 9);
    for (const q of spots) {
      for (const sd of [1, -1]) {
        const ox = -r.tz[q] * sd * (r.hw + 6), oz = r.tx[q] * sd * (r.hw + 6);
        for (let k = -3; k <= 3; k++) { const px = r.pts[q][0] + ox + r.tx[q] * k * 3, pz = r.pts[q][1] + oz + r.tz[q] * k * 3, h = r.h[q]; const p = new THREE.Mesh(post, M(0xdddddd)); p.position.set(px, h + 0.5, pz); group.add(p);
          if (k > -3) { const t = new THREE.Mesh(new RBox(0.02, 0.06, 3), tapeM); t.position.set(px - r.tx[q] * 1.5, h + 0.9, pz - r.tz[q] * 1.5); t.rotation.y = Math.atan2(r.tx[q], r.tz[q]); group.add(t); } }
        for (let k = 0; k < 7 && np < 160; k++) { const px = r.pts[q][0] + ox * (1.15 + Math.random() * 0.4) + r.tx[q] * (Math.random() - 0.5) * 18, pz = r.pts[q][1] + oz * (1.15 + Math.random() * 0.4) + r.tz[q] * (Math.random() - 0.5) * 18;
          PM.makeTranslation(px, r.h[q], pz); people.setMatrixAt(np, PM); people.setColorAt(np, pc.setHSL(Math.random(), 0.6, 0.45)); np++; }
      }
    }
  }
  people.count = np; group.add(people);

  let run = null, idx = 0;
  const V = new THREE.Vector3();
  const speak = (text) => {
    if (settings.atc === false || audio.muted) return;
    try { const u = new SpeechSynthesisUtterance(text); u.rate = 1.35; u.pitch = 1.1; u.volume = 0.9; const vs = speechSynthesis.getVoices(); const v = vs.find((q) => /en-AU|en-IE|en-GB/i.test(q.lang)) || vs.find((q) => /^en/i.test(q.lang)); if (v) u.voice = v; speechSynthesis.speak(u); } catch { /* no speech */ }
  };
  const along = (r, pos) => { let b = idx, bd = 1e18; for (let q = Math.max(0, idx - 30); q < Math.min(r.n, idx + 60); q++) { const d = (r.pts[q][0] - pos.x) ** 2 + (r.pts[q][1] - pos.z) ** 2; if (d < bd) { bd = d; b = q; } } idx = b; return Math.sqrt(bd); };

  const api = {
    stages,
    get active() { return !!run; },
    get frozen() { return run && run.phase === 'count'; },
    list() { return stages.map((st) => ({ id: st.id, name: `Rally stage · ${st.name}`, desc: `${st.desc} ${(st.r.length / 1000).toFixed(1)} km.${settings.rally[st.id] ? ` Best ${settings.rally[st.id].toFixed(2)} s.` : ''}` })); },
    start(id, veh) {
      const st = stages.find((q) => q.id === id); if (!st) return;
      const r = st.r, i = st.i0 - 3;
      veh.reset(r.pts[i][0], r.h[i] + 1.0, r.pts[i][1], Math.atan2(r.tx[i], r.tz[i]));
      run = { st, phase: 'count', t: 0, count: 3.5, next: 0, split: false, off: 0, pen: 0 }; idx = i;
      ghosts.start('rally-' + id);
      toast(`${st.name}: ${(r.length / 1000).toFixed(1)} km of gravel · your co-driver calls the notes`);
      speak('Stage start. Three, two, one');
    },
    cancel() { if (run) { toast('Stage abandoned'); ghosts.stop(); } run = null; },
    // R during a stage: back on the road a little further on, 5 s penalty
    recover(veh) {
      if (!run) return false; const r = run.st.r, i = Math.min(r.n - 2, idx + 2);
      veh.reset(r.pts[i][0], r.h[i] + 1.0, r.pts[i][1], Math.atan2(r.tx[i], r.tz[i])); run.pen += 5; toast('Recovered · +5 s'); return true;
    },
    update(dt, veh, mode) {
      if (!run) return null;
      const r = run.st.r;
      if (mode !== 'car') { api.cancel(); return null; }
      if (run.phase === 'count') {
        run.count -= dt; if (run.count <= 0) { run.phase = 'go'; toast('GO!'); }
        return { title: `Rally · ${run.st.name}`, big: run.count > 0.5 ? String(Math.ceil(run.count - 0.5)) : 'GO', notes: run.st.notes.slice(0, 2).map(show) };
      }
      run.t += dt;
      const off = along(r, veh.pos), s = r.s[idx], spd = Math.hypot(veh.vel.x, veh.vel.z);
      ghosts.record(run.t, veh); ghosts.play('rally-' + run.st.id, run.t);
      // pace notes: called a few seconds ahead
      const lead = Math.max(55, Math.min(170, spd * 3.2));
      let line = '';
      while (run.next < run.st.notes.length && run.st.notes[run.next].s - s < lead) {
        const nt = run.st.notes[run.next]; line += (line ? ', ' : '') + say(nt) + (nt.into ? ', into' : ''); run.next++;
      }
      if (line) speak(line);
      // off the road for too long
      if (off > 28) { run.off += dt; if (run.off > 4) { api.recover(veh); run.off = 0; } } else run.off = 0;
      if (!run.split && idx > r.n / 2) { run.split = true; toast(`Split: ${run.t.toFixed(1)} s`); }
      if (idx >= run.st.i1) {
        const time = run.t + run.pen, best = settings.rally[run.st.id], nb = !best || time < best;
        if (nb) { settings.rally[run.st.id] = time; saveSettings(); }
        ghosts.lap(time); ghosts.stop();
        toast(`${run.st.name}: ${time.toFixed(2)} s${run.pen ? ` (incl. ${run.pen} s penalties)` : ''}${nb ? ' · new best!' : ` · best ${best.toFixed(2)} s`}`);
        speak(nb ? 'Stage end. Brilliant, new best time!' : 'Stage end. Nice driving.');
        econ && econ.earn(Math.max(150, 900 - time * 3) + (nb ? 250 : 0), `Rally ${run.st.name}`);
        run = null; return null;
      }
      const upcoming = run.st.notes.slice(run.next - (run.next > 0 ? 1 : 0), run.next + 2).filter((x) => x.s > s - 20).slice(0, 3).map(show);
      return { title: `Rally · ${run.st.name}`, time: run.t + run.pen, notes: upcoming, km: ((r.length - s) / 1000).toFixed(2) };
    },
  };
  return api;
}
