// Car radio: generative stations composed live in the browser (metal, synthwave, lo-fi jazz) plus "Your Music",
// which plays audio files the player picks from their own device (they never leave it).
// Instruments are synthesised: Karplus-Strong strings through amp/cab chains, FM electric piano, analogue-style synths,
// and synthesised drums. A lookahead scheduler places notes on the AudioContext clock.

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// ---------------------------------------------------------------- sample synthesis (cached buffers)
function makeKS(ctx, freqs, dur, { decay = 0.996, bright = 0.5, strum = 0.008, pickNoise = 1 } = {}) {
  const sr = ctx.sampleRate, n = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, n, sr), out = buf.getChannelData(0);
  freqs.forEach((f, si) => {
    const p = Math.max(2, Math.round(sr / f)), line = new Float32Array(p);
    let lp = 0;
    for (let i = 0; i < p; i++) { const w = Math.random() * 2 - 1; lp += (w - lp) * (0.3 + bright * 0.7); line[i] = lp * pickNoise; }
    const start = Math.floor(si * strum * sr);
    let idx = 0, prev = 0;
    const amp = 1 / Math.sqrt(freqs.length);
    for (let i = start; i < n; i++) {
      const cur = line[idx];
      const nv = decay * (bright * cur + (1 - bright) * (0.5 * (cur + prev)));
      prev = cur; line[idx] = nv; idx = (idx + 1) % p;
      out[i] += cur * amp;
    }
  });
  // short fade so samples end cleanly
  const fade = Math.min(n, Math.floor(sr * 0.01));
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
  return buf;
}

function makeDrum(ctx, kind) {
  const sr = ctx.sampleRate;
  const len = { kick: 0.45, metalKick: 0.3, snare: 0.35, clap: 0.3, hat: 0.06, ohat: 0.35, crash: 2.2, ride: 1.2, tom: 0.5, rim: 0.08, lofiKick: 0.4, brush: 0.18 }[kind];
  const n = Math.floor(sr * len), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  let ph = 0, hp = 0, hpx = 0, bp1 = 0, bp2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, w = Math.random() * 2 - 1;
    let y = 0;
    if (kind === 'kick' || kind === 'metalKick' || kind === 'lofiKick') {
      const f = (kind === 'metalKick' ? 55 : 48) + (kind === 'metalKick' ? 180 : 120) * Math.exp(-t * (kind === 'metalKick' ? 40 : 28));
      ph += 2 * Math.PI * f / sr;
      y = Math.sin(ph) * Math.exp(-t * (kind === 'metalKick' ? 9 : kind === 'lofiKick' ? 10 : 6));
      if (kind === 'metalKick') y += w * Math.exp(-t * 300) * 0.6 + Math.sin(ph * 7) * Math.exp(-t * 120) * 0.25; // beater click
      y = Math.tanh(y * 1.6);
    } else if (kind === 'snare' || kind === 'clap' || kind === 'rim') {
      ph += 2 * Math.PI * (kind === 'rim' ? 520 : 190) / sr;
      const tone = Math.sin(ph) * Math.exp(-t * (kind === 'rim' ? 60 : 22));
      // band-passed noise for the snare wires
      bp1 += (w - bp1) * 0.45; bp2 += (bp1 - bp2) * 0.45; const band = bp1 - bp2;
      let env = Math.exp(-t * (kind === 'clap' ? 14 : 16));
      if (kind === 'clap') env *= (t < 0.03 ? (Math.floor(t * 100) % 2 ? 1 : 0.4) : 1);
      y = tone * (kind === 'clap' ? 0.2 : 0.7) + band * env * (kind === 'rim' ? 0.3 : 1.6);
    } else if (kind === 'hat' || kind === 'ohat' || kind === 'crash' || kind === 'ride' || kind === 'brush') {
      // metallic: square partials + high-passed noise
      let m = 0;
      for (const f of [317, 467, 593, 761, 913, 1207]) m += Math.sign(Math.sin(2 * Math.PI * f * (kind === 'ride' ? 1.7 : 3.1) * t));
      hp = 0.85 * (hp + w - hpx); hpx = w;
      const decay = { hat: 70, ohat: 9, crash: 1.6, ride: 3.2, brush: 18 }[kind];
      y = (hp * (kind === 'brush' ? 0.8 : 0.6) + m * (kind === 'ride' ? 0.09 : 0.05)) * Math.exp(-t * decay);
      if (kind === 'crash') y *= 1 - Math.exp(-t * 400);
      if (kind === 'brush') y *= 0.6;
    } else if (kind === 'tom') {
      ph += 2 * Math.PI * (110 + 60 * Math.exp(-t * 18)) / sr;
      y = Math.sin(ph) * Math.exp(-t * 7) + w * Math.exp(-t * 60) * 0.2;
    }
    d[i] = y * 0.8;
  }
  return buf;
}

function makeReverbIR(ctx, seconds = 1.8, decay = 2.6) {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds), buf = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
  }
  return buf;
}

function distCurve(k) {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return c;
}

// ---------------------------------------------------------------- song titles
const TITLES = {
  metal: [['Pop-Up', 'Iron', 'Lightweight', 'Redline', 'Jinba Ittai', 'Rotary', 'Apex', 'Double Wishbone', 'Midnight', 'Torque', 'B6', 'Hairpin'],
    ['Apocalypse', 'Overdrive', 'Doom', 'Requiem', 'Inferno', 'Of Steel', 'Massacre', 'Ritual', 'Uprising', 'Wrath', 'Crusade', 'Of The Damned']],
  synth: [['Neon', 'Chrome', 'Sunset', 'Night', 'Pacific', 'Miami', 'Laser', 'Velvet', 'Coastal', 'Electric', 'Digital', 'Pastel'],
    ['Drive', 'Horizon', 'Highway', 'Dreams', 'Boulevard', 'Memories', 'Skyline', 'Cruise', 'Runner', 'Paradise', 'Heartbeat', 'Lights']],
  lofi: [['Rainy', 'Late', 'Slow', 'Warm', 'Quiet', 'Sunday', 'Velvet', 'Paper', 'Soft', 'Hazy', 'Golden', 'Midnight'],
    ['Window', 'Coffee', 'Bus Stop', 'Streetlights', 'Notebook', 'Garage', 'Afternoon', 'Tape', 'Room', 'Thoughts', 'Ramen', 'Petrol Station']],
};
const ARTISTS = { metal: ['Pop-Up Doom', 'Torsen Wrath', 'Iron Roadster', 'Hiroshima Steel'], synth: ['Neon Miata', 'Kavinsky Club', 'Chrome Hearts FM', 'Retro Driver'], lofi: ['jinba lo-fi', 'tape & tea', 'slow lane', 'cafe roadster'] };
const songTitle = (kind) => `${pick(TITLES[kind][0])} ${pick(TITLES[kind][1])}`;

// ---------------------------------------------------------------- generative stations
export function metalStation(ctx, out, cache) {
  const bus = ctx.createGain(); bus.gain.value = 0.7; bus.connect(out);
  // two guitars, hard-panned, through amp (highpass -> drive -> cab EQ)
  const guitars = [-0.75, 0.75].map((pan) => {
    const inG = ctx.createGain(); inG.gain.value = 1;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110;
    const pre = ctx.createGain(); pre.gain.value = 8;
    const ws = ctx.createWaveShaper(); ws.curve = distCurve(6); ws.oversample = '4x';
    const scoop = ctx.createBiquadFilter(); scoop.type = 'peaking'; scoop.frequency.value = 450; scoop.Q.value = 1; scoop.gain.value = -5;
    const pres = ctx.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 2200; pres.Q.value = 0.9; pres.gain.value = 4;
    const cab = ctx.createBiquadFilter(); cab.type = 'lowpass'; cab.frequency.value = 5200; cab.Q.value = 0.8;
    const cab2 = ctx.createBiquadFilter(); cab2.type = 'lowpass'; cab2.frequency.value = 6500;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    const g = ctx.createGain(); g.gain.value = 0.16;
    inG.connect(hp); hp.connect(pre); pre.connect(ws); ws.connect(scoop); scoop.connect(pres); pres.connect(cab); cab.connect(cab2); cab2.connect(g); g.connect(p); p.connect(bus);
    return inG;
  });
  const leadIn = ctx.createGain();
  {
    const pre = ctx.createGain(); pre.gain.value = 12;
    const ws = ctx.createWaveShaper(); ws.curve = distCurve(7); ws.oversample = '4x';
    const cab = ctx.createBiquadFilter(); cab.type = 'lowpass'; cab.frequency.value = 4800;
    const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1100; mid.gain.value = 5;
    const g = ctx.createGain(); g.gain.value = 0.11;
    const dl = ctx.createDelay(1); dl.delayTime.value = 0.33; const fb = ctx.createGain(); fb.gain.value = 0.25;
    leadIn.connect(pre); pre.connect(ws); ws.connect(mid); mid.connect(cab); cab.connect(g); g.connect(bus); g.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(bus);
  }
  const bassIn = ctx.createGain();
  { const ws = ctx.createWaveShaper(); ws.curve = distCurve(2); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; const g = ctx.createGain(); g.gain.value = 0.32; bassIn.connect(ws); ws.connect(lp); lp.connect(g); g.connect(bus); }
  const drumBus = ctx.createDynamicsCompressor(); drumBus.threshold.value = -12; drumBus.ratio.value = 4;
  const drumG = ctx.createGain(); drumG.gain.value = 0.55; drumBus.connect(drumG); drumG.connect(bus);
  const verb = ctx.createConvolver(); verb.buffer = makeReverbIR(ctx, 1.2, 3); const vg = ctx.createGain(); vg.gain.value = 0.18; verb.connect(vg); vg.connect(bus);

  const D = (k) => cache(`drum:${k}`, () => makeDrum(ctx, k));
  const chord = (root, mute, len) => cache(`pc:${root}:${mute}:${len}`, () => makeKS(ctx, [midiHz(root), midiHz(root + 7), midiHz(root + 12)], len, mute ? { decay: 0.985, bright: 0.35, strum: 0.003 } : { decay: 0.9975, bright: 0.6, strum: 0.007 }));
  const lead = (m) => cache(`lead:${m}`, () => makeKS(ctx, [midiHz(m)], 1.4, { decay: 0.9985, bright: 0.7 }));
  const bass = (m) => cache(`bass:${m}`, () => makeKS(ctx, [midiHz(m)], 0.9, { decay: 0.995, bright: 0.4 }));
  const play = (buf, dest, t, gain = 1, rate = 1, dur = 0) => {
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = gain; s.connect(g); g.connect(dest);
    s.start(t); if (dur) { g.gain.setValueAtTime(gain, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.03); s.stop(t + dur + 0.05); }
    return s;
  };

  let song;
  function newSong() {
    const E = 40; // E2
    const scale = [0, 1, 3, 5, 7, 8, 10]; // E phrygian
    const riff = (density) => Array.from({ length: 32 }, (_, i) => {
      const r = Math.random();
      if (i % 8 === 0) return { root: 0, mute: false };
      if (r < density) return { root: 0, mute: true };
      if (r < density + 0.18) return { root: pick([1, 3, 5, 7, 8, 10]), mute: Math.random() < 0.3 };
      return null;
    });
    const gallop = Array.from({ length: 32 }, (_, i) => (i % 4 === 1 ? null : { root: i % 16 === 12 ? pick([1, 3]) : 0, mute: i % 8 !== 0 }));
    const chorusChords = Array.from({ length: 4 }, () => pick([0, 3, 5, 8, 10, 1]));
    const parts = [
      { name: 'intro', bars: 4, riff: riff(0.35), drums: 'build' },
      { name: 'verse', bars: 8, riff: Math.random() < 0.5 ? gallop : riff(0.55), drums: 'double' },
      { name: 'chorus', bars: 8, chords: chorusChords, drums: 'chorus' },
      { name: 'verse', bars: 8, riff: riff(0.6), drums: 'double' },
      { name: 'breakdown', bars: 4, riff: riff(0.25), drums: 'half' },
      { name: 'solo', bars: 8, chords: chorusChords, drums: 'chorus', solo: true },
      { name: 'chorus', bars: 8, chords: chorusChords, drums: 'chorus' },
      { name: 'outro', bars: 2, chords: [0], drums: 'end' },
    ];
    song = { bpm: Math.round(rnd(138, 182)), E, scale, parts, part: 0, bar: 0, step: 0, title: songTitle('metal'), artist: pick(ARTISTS.metal) };
  }
  newSong();

  function scheduleStep(t, stepDur) {
    const P = song.parts[song.part], st = song.step, s16 = st % 16, inBar = st % 32;
    const R = (deg) => song.E + deg;
    // guitars
    if (P.riff) {
      const ev = P.riff[inBar];
      if (ev) {
        const len = ev.mute ? stepDur * 0.9 : stepDur * (P.name === 'breakdown' ? 4 : 2);
        guitars.forEach((g, gi) => play(chord(R(ev.root), ev.mute, ev.mute ? 0.25 : 1.2), g, t + gi * 0.006 + rnd(0, 0.004), ev.mute ? 0.9 : 1, 1, len));
        play(bass(R(ev.root) - 12), bassIn, t, 1, 1, len);
      }
    } else if (P.chords) {
      const ch = P.chords[Math.floor(song.bar / 2) % P.chords.length];
      if (s16 === 0 || s16 === 8) guitars.forEach((g, gi) => play(chord(R(ch), false, 2.2), g, t + gi * 0.008, 1, 1, stepDur * 8));
      if (st % 2 === 0) play(bass(R(ch) - 12), bassIn, t, 1, 1, stepDur * 1.8);
      if (P.solo && Math.random() < 0.55) {
        const deg = song.scale[(Math.random() * 7) | 0] + pick([12, 24]);
        const src = play(lead(R(deg) + 12), leadIn, t, 0.9, 1, stepDur * pick([1, 2, 2, 4]));
        if (Math.random() < 0.3) src.playbackRate.setTargetAtTime(Math.pow(2, 2 / 12), t + stepDur * 0.5, 0.03); // bend up a tone
      }
    }
    // drums
    const kick = D('metalKick'), sn = D('snare'), hh = D('hat'), cr = D('crash'), ride = D('ride');
    switch (P.drums) {
      case 'build': if (s16 % 4 === 0) play(kick, drumBus, t); if (s16 === 8) play(sn, drumBus, t, 0.8); if (st % 2 === 0) play(hh, drumBus, t, 0.5); break;
      case 'double': play(kick, drumBus, t, 0.8); if (s16 === 4 || s16 === 12) { play(sn, drumBus, t); play(sn, verb, t, 0.4); } if (st % 2 === 0) play(hh, drumBus, t, 0.45); break;
      case 'chorus': if (s16 % 2 === 0) play(kick, drumBus, t, 0.85); if (s16 === 4 || s16 === 12) { play(sn, drumBus, t); play(sn, verb, t, 0.5); } if (st % 2 === 0) play(ride, drumBus, t, 0.35); if (inBar === 0 && song.bar % 2 === 0) play(cr, drumBus, t, 0.7); break;
      case 'half': if (P.riff[inBar] && P.riff[inBar].mute) play(kick, drumBus, t); if (s16 === 8) { play(sn, drumBus, t); play(sn, verb, t, 0.6); } if (s16 % 4 === 0) play(cr, drumBus, t, 0.25); break;
      case 'end': if (st === 0) { play(cr, drumBus, t, 0.9); play(kick, drumBus, t); } break;
    }
    // advance
    song.step++;
    if (song.step % 16 === 0) song.bar++;
    if (song.bar >= P.bars) { song.bar = 0; song.step = 0; song.part++; if (song.part >= song.parts.length) { newSong(); return 'newsong'; } }
    return null;
  }
  return { get song() { return song; }, stepDur: () => 60 / song.bpm / 4, scheduleStep, output: bus, skip: newSong };
}

export function synthStation(ctx, out, cache) {
  const bus = ctx.createGain(); bus.gain.value = 0.8; bus.connect(out);
  const verb = ctx.createConvolver(); verb.buffer = makeReverbIR(ctx, 2.6, 2.2); const vg = ctx.createGain(); vg.gain.value = 0.35; verb.connect(vg); vg.connect(bus);
  const delay = ctx.createDelay(1.5); const fb = ctx.createGain(); fb.gain.value = 0.35; const dg = ctx.createGain(); dg.gain.value = 0.3;
  delay.connect(fb); fb.connect(delay); delay.connect(dg); dg.connect(bus);
  const D = (k) => cache(`drum:${k}`, () => makeDrum(ctx, k));
  const voice = (type, f, t, dur, { gain = 0.1, cutoff = 2000, env = 0, detune = [0], attack = 0.01, release = 0.2, dest = bus, sends = [] } = {}) => {
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.setTargetAtTime(0, t + dur, release / 3);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(cutoff + env, t); lp.frequency.setTargetAtTime(cutoff, t, 0.08); lp.Q.value = 2;
    lp.connect(g); g.connect(dest); for (const s of sends) g.connect(s);
    for (const dt of detune) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = dt; o.connect(lp); o.start(t); o.stop(t + dur + release + 0.1); }
  };
  const play = (buf, t, gain = 1, dest = bus) => { const s = ctx.createBufferSource(); s.buffer = buf; const g = ctx.createGain(); g.gain.value = gain; s.connect(g); g.connect(dest); s.start(t); };
  let song;
  function newSong() {
    const key = pick([57, 52, 55, 50]); // A, E, G, D (minor)
    const progs = [[0, 8, 3, 10], [0, 5, 8, 7], [0, 10, 8, 10], [0, 3, 8, 7]];
    const prog = pick(progs);
    const minor = [0, 2, 3, 5, 7, 8, 10];
    const melody = Array.from({ length: 32 }, () => (Math.random() < 0.45 ? minor[(Math.random() * 7) | 0] + pick([12, 12, 24]) : null));
    song = { bpm: Math.round(rnd(92, 112)), key, prog, minor, melody, bars: 0, step: 0, length: 64, title: songTitle('synth'), artist: pick(ARTISTS.synth) };
  }
  newSong();
  function chordNotes(root) { const third = [0, 5, 7].includes(((root % 12) + 12) % 12) ? 3 : 4; return [root, root + third, root + 7]; }
  function scheduleStep(t, sd) {
    const s = song, st = s.step, s16 = st % 16, chordRoot = s.key + s.prog[Math.floor(s.bars / 2) % 4];
    const notes = chordNotes(chordRoot);
    const intro = s.bars < 4, breakdown = s.bars >= 40 && s.bars < 44;
    if (s16 === 0 && s.bars % 2 === 0) for (const n of notes) voice('sawtooth', midiHz(n), t, sd * 30, { gain: 0.035, cutoff: 1400, detune: [-12, 0, 12], attack: 0.6, release: 1.2, sends: [verb] });
    if (!intro && st % 2 === 0) voice('sawtooth', midiHz(chordRoot - 24), t, sd * 1.4, { gain: 0.11, cutoff: 300, env: 1400, release: 0.1 });
    if (!breakdown) voice('square', midiHz(notes[st % 3] + 12 + (st % 6 >= 3 ? 12 : 0)), t, sd * 0.6, { gain: 0.03, cutoff: 1800, env: 2500, release: 0.08, sends: [delay] });
    if (!intro && s.bars >= 8 && s.bars % 16 < 12) { const m = s.melody[st % 32]; if (m != null) voice('sawtooth', midiHz(s.key + m), t, sd * 1.8, { gain: 0.045, cutoff: 2600, detune: [-7, 7], release: 0.3, sends: [delay, verb] }); }
    if (!intro) {
      if (s16 === 0 || s16 === 8 || (s16 === 10 && Math.random() < 0.3)) play(D('kick'), t, 0.9);
      if (s16 === 4 || s16 === 12) { play(D('snare'), t, 0.55); play(D('snare'), t, 0.7, verb); play(D('clap'), t, 0.3); }
      if (!breakdown) play(D('hat'), t, s16 % 4 === 2 ? 0.35 : 0.18);
    }
    s.step++; if (s.step % 16 === 0) s.bars++;
    if (s.bars >= s.length) { newSong(); return 'newsong'; }
    return null;
  }
  return { get song() { return song; }, stepDur: () => 60 / song.bpm / 4, scheduleStep, output: bus, skip: newSong, delay };
}

export function lofiStation(ctx, out, cache) {
  const bus = ctx.createGain(); bus.gain.value = 0.85;
  const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 3800;
  const wow = ctx.createOscillator(); wow.frequency.value = 0.5; const wowG = ctx.createGain(); wowG.gain.value = 300; wow.connect(wowG); wowG.connect(warm.frequency); wow.start();
  bus.connect(warm); warm.connect(out);
  const verb = ctx.createConvolver(); verb.buffer = makeReverbIR(ctx, 1.8, 3); const vg = ctx.createGain(); vg.gain.value = 0.25; verb.connect(vg); vg.connect(bus);
  const D = (k) => cache(`drum:${k}`, () => makeDrum(ctx, k));
  // vinyl crackle bed
  const crackle = ctx.createBufferSource();
  crackle.buffer = cache('crackle', () => { const n = ctx.sampleRate * 4, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() < 0.0008 ? (Math.random() - 0.5) * 0.8 : 0) + (Math.random() - 0.5) * 0.004; return b; });
  crackle.loop = true; const cg = ctx.createGain(); cg.gain.value = 0.5; crackle.connect(cg); cg.connect(bus); crackle.start();
  const bass = (m) => cache(`ubass:${m}`, () => makeKS(ctx, [midiHz(m)], 1.2, { decay: 0.994, bright: 0.2 }));
  const play = (buf, t, gain = 1, dest = bus) => { const s = ctx.createBufferSource(); s.buffer = buf; const g = ctx.createGain(); g.gain.value = gain; s.connect(g); g.connect(dest); s.start(t); };
  // FM electric piano voice
  const epiano = (f, t, dur, vel) => {
    const car = ctx.createOscillator(); car.frequency.value = f;
    const mod = ctx.createOscillator(); mod.frequency.value = f; // 1:1 ratio, bell-ish tine
    const mg = ctx.createGain(); mg.gain.setValueAtTime(f * 2.2 * vel, t); mg.gain.setTargetAtTime(f * 0.3, t, 0.25);
    mod.connect(mg); mg.connect(car.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 * vel, t + 0.005); g.gain.setTargetAtTime(0.02 * vel, t + 0.01, 0.5); g.gain.setTargetAtTime(0, t + dur, 0.15);
    const trem = ctx.createStereoPanner(); trem.pan.value = rnd(-0.3, 0.3);
    car.connect(g); g.connect(trem); trem.connect(bus); g.connect(verb);
    car.start(t); mod.start(t); car.stop(t + dur + 0.8); mod.stop(t + dur + 0.8);
  };
  let song;
  function newSong() {
    const key = pick([60, 62, 65, 57, 63]);
    // ii-V-I-vi style progressions with 7th/9th colour (semitones from key; [root, chord tones])
    const progs = [
      [[2, [0, 3, 7, 10, 14]], [7, [0, 4, 7, 10, 14]], [0, [0, 4, 7, 11, 14]], [9, [0, 3, 7, 10]]],
      [[0, [0, 4, 7, 11]], [9, [0, 3, 7, 10, 14]], [5, [0, 4, 7, 11, 14]], [7, [0, 4, 10, 14]]],
      [[9, [0, 3, 7, 10, 14]], [5, [0, 4, 7, 11]], [0, [0, 4, 7, 11, 14]], [4, [0, 3, 7, 10]]],
    ];
    song = { bpm: Math.round(rnd(72, 88)), key, prog: pick(progs), bars: 0, step: 0, length: 48, title: songTitle('lofi'), artist: pick(ARTISTS.lofi) };
  }
  newSong();
  function scheduleStep(t, sd) {
    const s = song, st = s.step, s16 = st % 16, swing = (st % 2) * sd * 0.28; // swung 16ths
    const [root, tones] = s.prog[s.bars % 4];
    const base = s.key + root - 12;
    const tt = t + swing;
    if (s16 === 0 || (s16 === 10 && Math.random() < 0.6)) tones.forEach((iv, k) => epiano(midiHz(base + iv + (k > 2 ? 0 : 0)), tt + k * 0.012, sd * (s16 === 0 ? 9 : 5), s16 === 0 ? 1 : 0.7));
    if (s16 === 0) play(bass(base - 12), tt, 0.9);
    if (s16 === 8 && Math.random() < 0.7) play(bass(base - 12 + pick([7, 5, 3])), tt, 0.7);
    if (s16 === 0 || s16 === 7 || (s16 === 10 && Math.random() < 0.4)) play(D('lofiKick'), tt, 0.7);
    if (s16 === 4 || s16 === 12) { play(D('rim'), tt, 0.5); play(D('snare'), tt, 0.18, verb); }
    if (st % 2 === 0) play(D('brush'), tt, 0.25);
    s.step++; if (s.step % 16 === 0) s.bars++;
    if (s.bars >= s.length) { newSong(); return 'newsong'; }
    return null;
  }
  return { get song() { return song; }, stepDur: () => 60 / song.bpm / 4, scheduleStep, output: bus, skip: newSong };
}

// ---------------------------------------------------------------- the radio
export const STATIONS = [
  { id: 'off', name: 'Radio off', freq: '' },
  { id: 'metal', name: 'MX Metal', freq: '66.6' },
  { id: 'synth', name: 'Neon', freq: '89.1' },
  { id: 'lofi', name: 'Late Night', freq: '101.3' },
  { id: 'mine', name: 'Your Music', freq: 'AUX' },
];

export function createRadio(getCtx, getDest) {
  let ctx = null, out = null, staticG = null, volume = 0.6, index = 0, current = null, gen = null, timer = null, nextT = 0;
  const caches = new Map();
  const cache = (k, f) => { let v = caches.get(k); if (!v) caches.set(k, v = f()); return v; };
  let listeners = [];
  const emit = () => listeners.forEach((f) => f(info()));
  // your music
  const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'audio/*'; fileInput.multiple = true; fileInput.hidden = true;
  document.body.appendChild(fileInput);
  let playlist = [], plIndex = 0, audioEl = null, mediaSrc = null;
  fileInput.addEventListener('change', () => {
    for (const u of playlist) URL.revokeObjectURL(u.url);
    playlist = [...fileInput.files].map((f) => ({ name: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f) }));
    for (let i = playlist.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [playlist[i], playlist[j]] = [playlist[j], playlist[i]]; }
    plIndex = 0;
    if (STATIONS[index].id === 'mine') startMine();
  });

  function ensure() {
    if (ctx) return true;
    ctx = getCtx(); if (!ctx) return false;
    // car speaker voicing: limited bass and treble, slight presence
    out = ctx.createGain(); out.gain.value = volume;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 11000;
    const pres = ctx.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 2800; pres.gain.value = 1.5;
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -10; lim.ratio.value = 6;
    out.connect(hp); hp.connect(pres); pres.connect(lp); lp.connect(lim); lim.connect(getDest());
    staticG = ctx.createGain(); staticG.gain.value = 0;
    const sn = ctx.createBufferSource(); const n = ctx.sampleRate; const b = ctx.createBuffer(1, n, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    sn.buffer = b; sn.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2500; bp.Q.value = 0.5;
    sn.connect(bp); bp.connect(staticG); staticG.connect(out); sn.start();
    return true;
  }

  function stopCurrent() {
    if (timer) { clearInterval(timer); timer = null; }
    if (current) { const g = current; g.gain.setTargetAtTime(0, ctx.currentTime, 0.08); setTimeout(() => g.disconnect(), 600); current = null; }
    gen = null;
    if (audioEl) { audioEl.pause(); }
  }

  function startMine() {
    stopCurrent();
    if (!playlist.length) { emit(); return; }
    if (!audioEl) {
      audioEl = new Audio(); audioEl.crossOrigin = 'anonymous';
      mediaSrc = ctx.createMediaElementSource(audioEl);
      audioEl.addEventListener('ended', () => { plIndex = (plIndex + 1) % playlist.length; playMine(); });
    }
    const g = ctx.createGain(); g.gain.value = 1; mediaSrc.disconnect(); mediaSrc.connect(g); g.connect(out); current = g;
    playMine();
  }
  function playMine() { if (!playlist.length) return; audioEl.src = playlist[plIndex].url; audioEl.play().catch(() => {}); emit(); }

  function tune(i) {
    if (!ensure()) { index = i; return; }
    index = (i + STATIONS.length) % STATIONS.length;
    // tuning static
    staticG.gain.cancelScheduledValues(ctx.currentTime);
    staticG.gain.setValueAtTime(0.08, ctx.currentTime); staticG.gain.setTargetAtTime(0, ctx.currentTime + 0.25, 0.08);
    stopCurrent();
    const st = STATIONS[index];
    if (st.id === 'off') { emit(); return; }
    if (st.id === 'mine') { if (!playlist.length) fileInput.click(); else startMine(); emit(); return; }
    const g = ctx.createGain(); g.gain.value = 0; g.connect(out); g.gain.setTargetAtTime(1, ctx.currentTime + 0.2, 0.1); current = g;
    gen = (st.id === 'metal' ? metalStation : st.id === 'synth' ? synthStation : lofiStation)(ctx, g, cache);
    nextT = ctx.currentTime + 0.3;
    timer = setInterval(pump, 25);
    emit();
  }
  function pump() {
    if (!gen) return;
    const ahead = ctx.currentTime + 0.18;
    while (nextT < ahead) {
      const sd = gen.stepDur();
      const r = gen.scheduleStep(nextT, sd);
      nextT += sd;
      if (r === 'newsong') { nextT += 0.6; emit(); }
    }
  }
  function info() {
    const st = STATIONS[index];
    let title = '';
    if (gen) title = `${gen.song.artist} · ${gen.song.title}`;
    else if (st.id === 'mine') title = playlist.length ? playlist[plIndex].name : 'Choose music files from your computer';
    return { station: st, title, volume };
  }
  return {
    STATIONS,
    get index() { return index; },
    info,
    onChange(f) { listeners.push(f); },
    next() { tune(index + 1); },
    prev() { tune(index - 1); },
    tune,
    skip() { if (gen) { gen.skip(); emit(); } else if (STATIONS[index].id === 'mine' && playlist.length) { plIndex = (plIndex + 1) % playlist.length; playMine(); } },
    chooseFiles() { fileInput.click(); },
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); if (out) out.gain.setTargetAtTime(volume, ctx.currentTime, 0.05); emit(); },
    get volume() { return volume; },
    // top up: cabin is quieter so the radio sounds clearer
    setCabin(topUp) { if (out) out.gain.setTargetAtTime(volume * (topUp ? 1 : 0.85), ctx.currentTime, 0.3); },
  };
}
