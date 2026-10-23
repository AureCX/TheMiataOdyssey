// Sound: a physically-inspired 4-cylinder engine (firing pulses through an exhaust resonator bank,
// per-cylinder and per-cycle variation, intake noise, overrun burble) plus tyre, road, wind and water noise.
// Everything goes through one master gain so mute is absolute.

// Self-contained so it can run inside an AudioWorklet (via toString) or a ScriptProcessor fallback.
export class EngineSynth {
  constructor(sr) {
    this.sr = sr;
    this.rpm = 850; this.rpmT = 850; this.thr = 0; this.thrT = 0; this.load = 0; this.vol = 0; this.volT = 0;
    this.phase = 0; this.nextFire = 0.5; this.cyl = 0;
    this.cylGain = [1.0, 0.9, 1.07, 0.95];
    this.pulses = []; // active firing pulses {t, a, n}
    this.seed = 12345;
    // exhaust resonators (bandpass biquads): freq, Q, gain
    this.res = [[160, 1.6, 1.0], [410, 2.4, 0.55], [950, 2.0, 0.25], [2300, 1.5, 0.08]].map(([f, q, g]) => {
      const w = 2 * Math.PI * f / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al;
      return { b0: al / a0, b2: -al / a0, a1: -2 * Math.cos(w) / a0, a2: (1 - al) / a0, g, x1: 0, x2: 0, y1: 0, y2: 0 };
    });
    this.lp = 0; this.lp2 = 0; this.hp = 0; this.hpx = 0;
    this.intLP = 0; this.intEnv = 0; this.dc = 0;
  }
  rand() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  set(p) { if (p.rpm !== undefined) this.rpmT = p.rpm; if (p.throttle !== undefined) this.thrT = p.throttle; if (p.vol !== undefined) this.volT = p.vol; }
  render(out, n) {
    const sr = this.sr, dt = 1 / sr;
    const kR = 1 - Math.exp(-dt * 12), kT = 1 - Math.exp(-dt * 18), kV = 1 - Math.exp(-dt * 8);
    for (let i = 0; i < n; i++) {
      this.rpm += (this.rpmT - this.rpm) * kR;
      this.thr += (this.thrT - this.thr) * kT;
      this.vol += (this.volT - this.vol) * kV;
      const thr = this.thr, rpm = Math.max(300, this.rpm);
      // crank: 2 revolutions per 4-stroke cycle, a cylinder fires every half revolution
      this.phase += rpm / 60 * dt;
      if (this.phase >= this.nextFire) {
        const c = this.cyl; this.cyl = (c + 1) & 3;
        const jitter = 1 + (this.rand() - 0.5) * 0.14;
        let a = this.cylGain[c] * jitter * (0.35 + 0.65 * thr) * (0.7 + rpm / 7200 * 0.5);
        // overrun burble: lean misfires and pops when the throttle closes at high rpm
        let noisy = 0.25 + 0.35 * thr;
        if (thr < 0.05 && rpm > 2600 && this.rand() < 0.035) { a *= 2.4; noisy = 1.6; }
        else if (thr < 0.05) a *= 0.55;
        this.pulses.push({ t: 0, a, nz: noisy, tau: 0.00055 + 0.0006 * (1 - rpm / 8000) });
        this.nextFire += 0.5 * (1 + (this.rand() - 0.5) * 0.012);
        if (this.phase > 1e6) { this.phase -= 1e6; this.nextFire -= 1e6; }
      }
      // excitation: sum of active pulses (smooth bump + noise burst)
      let x = 0;
      for (let k = this.pulses.length - 1; k >= 0; k--) {
        const p = this.pulses[k];
        const u = p.t / p.tau;
        x += p.a * (u * Math.exp(1 - u)) + p.a * p.nz * (this.rand() * 2 - 1) * Math.exp(-p.t / 0.0025);
        p.t += dt;
        if (p.t > 0.02) this.pulses.splice(k, 1);
      }
      // exhaust resonator bank
      let y = x * 0.35;
      for (const r of this.res) {
        const o = r.b0 * x + r.b2 * r.x2 - r.a1 * r.y1 - r.a2 * r.y2;
        r.x2 = r.x1; r.x1 = x; r.y2 = r.y1; r.y1 = o;
        y += o * r.g * 2.2;
      }
      // intake roar: noise shaped by the firing envelope, louder with throttle
      this.intEnv += (Math.abs(x) - this.intEnv) * 0.02;
      this.intLP += ((this.rand() * 2 - 1) - this.intLP) * 0.25;
      y += this.intLP * this.intEnv * thr * 0.9;
      // tone: soft saturation, throttle-dependent low-pass, DC block
      y = Math.tanh(y * 1.4);
      const fc = 900 + thr * 2600 + rpm * 0.25;
      const kl = 1 - Math.exp(-2 * Math.PI * fc * dt);
      this.lp += (y - this.lp) * kl; this.lp2 += (this.lp - this.lp2) * kl;
      const hpOut = this.lp2 - this.hpx + 0.995 * this.hp; this.hpx = this.lp2; this.hp = hpOut;
      out[i] = hpOut * this.vol;
    }
  }
}

const WORKLET_SRC = `${EngineSynth.toString().replace(/^export /, "")}
class EngineProc extends AudioWorkletProcessor {
  constructor() { super(); this.s = new EngineSynth(sampleRate); this.port.onmessage = (e) => this.s.set(e.data); }
  process(inputs, outputs) { const o = outputs[0][0]; if (o) this.s.render(o, o.length); return true; }
}
registerProcessor('mx5-engine', EngineProc);`;

export function createAudio() {
  let compNode = null;
  let ctx = null, nodes = null, starting = false, muted = false, paused = false, topUp = 0, hornOn = false;
  let engineVol = 1;

  function noiseBuffer(c, kind, seconds = 9) {
    const len = Math.floor(c.sampleRate * seconds);
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'pink') { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.05) * 2.2; }
      else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else d[i] = w;
    }
    // crossfade the loop seam
    const fade = Math.floor(c.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) { const t = i / fade; d[len - fade + i] = d[len - fade + i] * (1 - t) + d[i] * t; }
    return b;
  }

  async function start() {
    if (ctx) { if (ctx.state === 'suspended' && !muted) ctx.resume(); return; }
    if (starting) return;
    starting = true;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    const master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor(); compNode = comp;
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(master); master.connect(ctx.destination);

    // engine
    const engGain = ctx.createGain(); engGain.gain.value = 1;
    const engEQ = ctx.createBiquadFilter(); engEQ.type = 'lowshelf'; engEQ.frequency.value = 180; engEQ.gain.value = 5;
    engGain.connect(engEQ); engEQ.connect(comp);
    let engine;
    try {
      const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      const node = new AudioWorkletNode(ctx, 'mx5-engine', { outputChannelCount: [1] });
      node.connect(engGain);
      engine = { set: (p) => node.port.postMessage(p) };
    } catch {
      // fallback for browsers or sandboxes without AudioWorklet
      const synth = new EngineSynth(ctx.sampleRate);
      const sp = ctx.createScriptProcessor(1024, 0, 1);
      sp.onaudioprocess = (e) => synth.render(e.outputBuffer.getChannelData(0), e.outputBuffer.length);
      sp.connect(engGain);
      engine = { set: (p) => synth.set(p) };
    }

    const mkNoise = (buf, type, f, q) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(fl); fl.connect(g); g.connect(comp); s.start(0, Math.random() * buf.duration); // random offsets so loops never line up
      return { g, fl };
    };
    const white = noiseBuffer(ctx, 'white'), pink = noiseBuffer(ctx, 'pink'), brown = noiseBuffer(ctx, 'brown');
    const squeal = mkNoise(white, 'bandpass', 900, 14);
    const squeal2 = mkNoise(pink, 'bandpass', 1400, 9);
    const road = mkNoise(brown, 'lowpass', 140, 0.7);
    const gravel = mkNoise(pink, 'bandpass', 2500, 0.8);
    const wind = mkNoise(pink, 'lowpass', 400, 0.4);
    const water = mkNoise(pink, 'bandpass', 500, 0.7);
    // slow wobble on the squeal so it isn't a steady whistle
    const lfo = ctx.createOscillator(); lfo.frequency.value = 6.5;
    const lfoG = ctx.createGain(); lfoG.gain.value = 60;
    lfo.connect(lfoG); lfoG.connect(squeal.fl.frequency); lfo.start();
    const scrape = mkNoise(white, 'bandpass', 1700, 1.6);
    const scrapeLow = mkNoise(pink, 'bandpass', 320, 1.2);
    // horn: a pair of electromagnetic disc horns (low ~410 Hz, high ~505 Hz). The diaphragm slaps its stop every
    // cycle, so the tone is a hard-clipped buzz; the steel tone disc rings at ~2.4 kHz and gives the brassy edge,
    // and the grille and bumper take the top off. The pitch settles in the first few ms as the diaphragm gets going.
    const hornG = ctx.createGain(); hornG.gain.value = 0;
    const hornMix = ctx.createGain(); hornMix.gain.value = 0.55;
    const hornOsc = [];
    for (const [f, a] of [[410, 1], [505, 0.8]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = a; o.connect(og); og.connect(hornMix); o.start(); hornOsc.push({ o, f });
    }
    // a little supply ripple: horns aren't perfectly steady
    const hornLfo = ctx.createOscillator(); hornLfo.frequency.value = 7.3; const hornLfoG = ctx.createGain(); hornLfoG.gain.value = 1.4;
    hornLfo.connect(hornLfoG); for (const h of hornOsc) hornLfoG.connect(h.o.frequency); hornLfo.start();
    const hornClip = ctx.createWaveShaper(); { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * 4) * 0.8; } hornClip.curve = c; hornClip.oversample = '2x'; }
    const hornHP = ctx.createBiquadFilter(); hornHP.type = 'highpass'; hornHP.frequency.value = 330; hornHP.Q.value = 0.7;
    const hornDisc = ctx.createBiquadFilter(); hornDisc.type = 'peaking'; hornDisc.frequency.value = 2400; hornDisc.Q.value = 3; hornDisc.gain.value = 9;
    const hornBody = ctx.createBiquadFilter(); hornBody.type = 'peaking'; hornBody.frequency.value = 1050; hornBody.Q.value = 1.4; hornBody.gain.value = 5;
    const hornLP = ctx.createBiquadFilter(); hornLP.type = 'lowpass'; hornLP.frequency.value = 5200; hornLP.Q.value = 0.5;
    hornMix.connect(hornClip); hornClip.connect(hornHP); hornHP.connect(hornDisc); hornDisc.connect(hornBody); hornBody.connect(hornLP); hornLP.connect(hornG); hornG.connect(comp);
    // mech servos: a geared whine that tracks the transformation
    const servoG = ctx.createGain(); servoG.gain.value = 0;
    const servoO = ctx.createOscillator(); servoO.type = 'sawtooth'; servoO.frequency.value = 160;
    const servoBP = ctx.createBiquadFilter(); servoBP.type = 'bandpass'; servoBP.frequency.value = 1100; servoBP.Q.value = 2.5;
    const servoLfo = ctx.createOscillator(); servoLfo.frequency.value = 23; const servoLfoG = ctx.createGain(); servoLfoG.gain.value = 40;
    servoLfo.connect(servoLfoG); servoLfoG.connect(servoO.frequency); servoLfo.start();
    servoO.connect(servoBP); servoBP.connect(servoG); servoG.connect(comp); servoO.start();
    // mech jump-jets: a rough low roar
    const jet = mkNoise(brown, 'lowpass', 420, 0.8);
    // rain hiss
    const rainN = mkNoise(pink, 'highpass', 900, 0.4);
    // AI airliners: a distant turbofan (rumble + roar + a thin fan whine)
    const fanR = mkNoise(brown, 'lowpass', 260, 0.7), fanN = mkNoise(pink, 'bandpass', 900, 0.6);
    const fanG = ctx.createGain(); fanG.gain.value = 0;
    const fanO = ctx.createOscillator(); fanO.type = 'sine'; fanO.frequency.value = 2600; fanO.connect(fanG); fanG.connect(comp); fanO.start();
    // police siren: a two-tone wail from a pair of square waves through a horn-ish band-pass
    const sirenG = ctx.createGain(); sirenG.gain.value = 0;
    const sirenO = ctx.createOscillator(); sirenO.type = 'square'; sirenO.frequency.value = 700;
    const sirenBP = ctx.createBiquadFilter(); sirenBP.type = 'bandpass'; sirenBP.frequency.value = 1100; sirenBP.Q.value = 0.9;
    const sirenLfo = ctx.createOscillator(); sirenLfo.frequency.value = 0.35; const sirenLfoG = ctx.createGain(); sirenLfoG.gain.value = 380;
    sirenLfo.connect(sirenLfoG); sirenLfoG.connect(sirenO.frequency); sirenO.connect(sirenBP); sirenBP.connect(sirenG); sirenG.connect(comp); sirenO.start(); sirenLfo.start();
    nodes = { hornOsc, sirenG, master, engine, squeal, squeal2, road, gravel, wind, water, scrape, scrapeLow, comp, white, hornG, servoG, servoO, jet, rainN, fanR, fanN, fanG, fanO };
    if (muted) ctx.suspend();
  }

  const set = (p, v, t = 0.06) => p.setTargetAtTime(v, ctx.currentTime, t);
  return {
    start,
    get muted() { return muted; },
    get ctx() { return ctx; },
    get dest() { return compNode; },
    setPaused(p) { paused = p; },
    setTop(t) { topUp = t; },
    // mech: servo whine level 0..1 (pitch rises with progress), and a heavy footfall
    servo(level, pitch = 0.5) {
      if (!ctx || !nodes) return;
      set(nodes.servoG.gain, paused ? 0 : level * 0.09, 0.05);
      set(nodes.servoO.frequency, 120 + pitch * 260, 0.1);
    },
    // a mech footfall: deep impact, a metallic clank from the leg, and the hydraulics venting just after.
    // Soft ground swallows the clank; water splashes.
    stomp(strength = 0.6, surface = 'asphalt', wet = false, side = 1) {
      if (!ctx || !nodes || muted || paused) return;
      const t = ctx.currentTime, out = nodes.comp, hard = surface === 'asphalt' || surface === 'rock' ? 1 : surface === 'snow' ? 0.4 : 0.55;
      const env = (g, a, peak, dec) => { g.gain.setValueAtTime(0.0001, t + a); g.gain.exponentialRampToValueAtTime(peak, t + a + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); };
      // impact: pitch-dropping sine + lowpassed noise
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.3);
      env(og, 0, 0.7 * strength + 0.1, 0.45); o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.5);
      const n = ctx.createBufferSource(); n.buffer = nodes.white; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380 + 300 * hard;
      const ng = ctx.createGain(); env(ng, 0, 0.45 * strength, 0.18); n.connect(lp); lp.connect(ng); ng.connect(out); n.start(t); n.stop(t + 0.25);
      // clank: inharmonic metal partials, slightly different per leg
      for (const [f, a, d] of [[310, 0.12, 0.25], [740, 0.09, 0.18], [1290, 0.06, 0.12], [2110, 0.035, 0.08]]) {
        const m = ctx.createOscillator(), mg = ctx.createGain(); m.type = 'triangle'; m.frequency.value = f * (side > 0 ? 1 : 1.06);
        env(mg, 0.004, a * strength * hard + 0.0002, d); m.connect(mg); mg.connect(out); m.start(t); m.stop(t + d + 0.05);
      }
      // hydraulic hiss
      const h = ctx.createBufferSource(); h.buffer = nodes.white; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 1.4;
      const hg = ctx.createGain(); env(hg, 0.07, 0.06 * strength + 0.0002, 0.22); h.connect(bp); bp.connect(hg); hg.connect(out); h.start(t + 0.06); h.stop(t + 0.35);
      if (wet) { const w = ctx.createBufferSource(); w.buffer = nodes.white; const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 900; wf.Q.value = 0.7;
        const wg = ctx.createGain(); env(wg, 0.01, 0.35 * strength, 0.45); w.connect(wf); wf.connect(wg); wg.connect(out); w.start(t); w.stop(t + 0.5); }
    },
    rain(level) { if (ctx && nodes) set(nodes.rainN.g.gain, paused ? 0 : level * (0.14 + 0.1 * topUp), 0.5); },
    thunder(strength = 0.8) {
      if (!ctx || !nodes || muted || paused) return;
      const t = ctx.currentTime, n = ctx.createBufferSource(); n.buffer = nodes.white;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(90, t + 3);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9 * strength, t + 0.08);
      g.gain.setValueAtTime(0.6 * strength, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
      n.loop = true; n.connect(lp); lp.connect(g); g.connect(nodes.comp); n.start(t); n.stop(t + 4.2);
    },
    // level 0..1 (distance and thrust), pitch 0..1 (spool)
    airliner(level, pitch = 0.5) {
      if (!ctx || !nodes) return;
      const l = paused ? 0 : level;
      set(nodes.fanR.g.gain, l * 0.7, 0.2); set(nodes.fanN.g.gain, l * 0.35, 0.2); set(nodes.fanG.gain, l * 0.012, 0.2);
      set(nodes.fanO.frequency, 1800 + 1600 * pitch, 0.3); set(nodes.fanN.fl.frequency, 500 + 700 * pitch, 0.3);
    },
    siren(level) { if (ctx && nodes) set(nodes.sirenG.gain, paused ? 0 : level * 0.05, 0.1); },
    jet(level) { if (ctx && nodes) set(nodes.jet.g.gain, paused ? 0 : level * 0.5, 0.08); },
    thump(strength = 0.5) {
      if (!ctx || !nodes || muted || paused) return;
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * strength + 0.1, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      const n = ctx.createBufferSource(); n.buffer = nodes.white; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.25 * strength, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g); g.connect(nodes.comp); n.connect(lp); lp.connect(ng); ng.connect(nodes.comp);
      o.start(t); o.stop(t + 0.45); n.start(t); n.stop(t + 0.2);
    },
    // indicator relay: a short damped click, higher on "on" than on "off" (tick-tock)
    relay(on) {
      if (!ctx || !nodes || paused) return;
      const t = ctx.currentTime, src = ctx.createBufferSource(); src.buffer = nodes.white;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = on ? 2600 : 1800; bp.Q.value = 3;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      src.connect(bp); bp.connect(g); g.connect(nodes.comp); src.start(t); src.stop(t + 0.05);
    },
    horn(on) {
      if (!ctx || !nodes || hornOn === on) return; hornOn = on;
      const t = ctx.currentTime, gn = nodes.hornG.gain;
      gn.cancelScheduledValues(t); gn.setValueAtTime(gn.value, t);
      if (on && !paused) {
        // quick attack with a slight overshoot as the diaphragm starts; the pitch comes up to note
        gn.linearRampToValueAtTime(0.16, t + 0.012); gn.setTargetAtTime(0.12, t + 0.012, 0.05);
        for (const h of nodes.hornOsc) { h.o.frequency.cancelScheduledValues(t); h.o.frequency.setValueAtTime(h.f * 0.94, t); h.o.frequency.setTargetAtTime(h.f, t, 0.012); }
      } else gn.setTargetAtTime(0, t, 0.018);   // the disc rings on for a moment
    },
    setMuted(m) {
      muted = m;
      if (!ctx || !nodes) return;
      set(nodes.master.gain, m ? 0 : 0.8, 0.03);
      if (m) setTimeout(() => { if (muted) ctx.suspend(); }, 150); else ctx.resume();
    },
    // one-shot crash: thump + crumpling metal (damped inharmonic modes) + optional breaking glass
    impact(sev, glass, kind) {
      if (!ctx || !nodes || muted || sev <= 0) return;
      const sr = ctx.sampleRate, len = Math.floor(sr * (0.5 + sev * 0.7));
      const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
      const modes = [];
      const metal = kind === 'tree' ? 0.35 : 1;
      for (let i = 0; i < 9; i++) modes.push([180 + Math.random() * 1500, 0.04 + Math.random() * 0.25, (Math.random() * 0.6 + 0.4) * metal]);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const n = Math.random() * 2 - 1;
        lp += (n - lp) * 0.08;
        let y = lp * Math.exp(-t / 0.05) * 2.2;                                  // body thump
        y += Math.sin(2 * Math.PI * (55 + 30 * Math.exp(-t * 20)) * t) * Math.exp(-t / 0.09) * 0.9;
        y += n * Math.exp(-t / (0.03 + 0.1 * sev)) * 0.35;                      // crunch
        for (const [f, tau, a] of modes) y += Math.sin(2 * Math.PI * f * t + a) * Math.exp(-t / tau) * a * 0.12;
        if (glass && t > 0.01) {                                                 // glass: bright tinkles
          if (Math.random() < 0.0009 * Math.exp(-t * 3)) for (let k = 0; k < 300 && i + k < len; k++) d[i + k] += Math.sin(k * (0.6 + Math.random() * 0.02)) * Math.exp(-k / 60) * 0.25;
          y += n * Math.exp(-t / 0.08) * 0.12;
        }
        d[i] += Math.tanh(y * (0.6 + sev * 0.6)) * 0.9;
      }
      const src = ctx.createBufferSource(); src.buffer = buf;
      const g = ctx.createGain(); g.gain.value = Math.min(1, 0.35 + sev * 0.5);
      src.connect(g); g.connect(nodes.comp); src.start();
    },
    setScrape(level) {
      if (!ctx || !nodes || muted) return;
      set(nodes.scrape.g.gain, level * 0.35, 0.04);
      set(nodes.scrapeLow.g.gain, level * 0.4, 0.04);
      set(nodes.scrape.fl.frequency, 1400 + level * 1500, 0.05);
    },
    setEngineVolume(v) { engineVol = Math.max(0, Math.min(1.5, v)); },
    get engineVolume() { return engineVol; },
    update({ rpm, throttle, slip, speed, inWater, prop, onGround, surface, mech = 0 }) {
      if (!ctx || !nodes || muted) return;
      const n = nodes;
      if (paused) { rpm = 850; throttle = 0; slip = 0; speed = 0; inWater = false; prop = 0; onGround = false; }
      // as a robot the engine drops to a low power-plant hum and there are no tyres on the road
      n.engine.set({ rpm, throttle, vol: (paused ? 0.12 : 0.55) * (1 - 0.8 * mech) * engineVol });
      if (mech > 0) { onGround = onGround && mech < 0.5; slip = 0; }
      const sq = Math.min(1, Math.max(0, slip - 0.1) * 2.5) * (onGround ? 1 : 0) * (surface === 'asphalt' ? 1 : 0.15);
      set(n.squeal.g.gain, sq * 0.22, 0.04);
      set(n.squeal2.g.gain, sq * 0.12, 0.04);
      set(n.squeal.fl.frequency, 750 + Math.min(speed, 30) * 12);
      const roll = onGround ? Math.min(1, speed / 30) : 0;
      set(n.road.g.gain, roll * (surface === 'asphalt' ? 0.35 : 0.55));
      set(n.gravel.g.gain, onGround && surface !== 'asphalt' ? Math.min(0.18, speed * 0.012) : 0);
      set(n.wind.g.gain, Math.min(0.45, speed * speed * 0.00022 + prop * 0.0006) * (1 - 0.6 * topUp));
      set(n.wind.fl.frequency, 250 + speed * 14 + prop * 3);
      set(n.water.g.gain, inWater ? Math.min(0.35, 0.04 + speed * 0.025) : 0, 0.15);
    },
  };
}
