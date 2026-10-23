// In-car navigation, styled after a phone-projection car screen: a dark rounded panel with an app dock (map, search,
// radio, voice), a heading-up map that zooms out with speed, the route in blue, a green manoeuvre card ("In 300 m turn
// left onto Coast road"), the speed limit, and an arrival bar (arrival time on the game clock, minutes, kilometres).
// Routing: A* over the road network (every road sample is a node; roads connect where their centrelines meet at the
// same height, so bridges don't join the roads beneath them). Costs are travel times by road type. Leaving the route
// for a few seconds reroutes. Spoken prompts (speech synthesis) at ~600 m, ~200 m and at the turn; mute in the dock.
// Keys: 6 shows/hides the screen, 7 opens "Where to?" (arrows/Enter/Esc, or click). Click the big map (M) to drive to
// any spot.
import { roads, ROUNDABOUTS, DECKS } from './world.js';

const SPEED = { highway: 30, road: 22, street: 13, gravel: 15, track: 20 };            // m/s for routing
const LIMIT = { highway: 130, road: 90, street: 50, gravel: 60, track: 0 };           // km/h on the sign

export function createGPS({ toast, clock, radio }) {
  // ---------------------------------------------------------------- graph (built on first use)
  let G = null;
  function build() {
    // roads, plus the bridge decks (the raceway's infield bridge) as short roads of their own
    const R = roads.filter((r) => r.type !== 'rail').concat(DECKS.map((d) => ({ name: 'Raceway bridge', type: 'road', hw: d.hw, closed: false, n: d.pts.length, pts: d.pts.map((q) => [q[0], q[1]]), h: Float32Array.from(d.pts.map((q) => q[2])) })));
    let N = 0; const base = []; for (const r of R) { base.push(N); N += r.n; }
    const X = new Float32Array(N), Z = new Float32Array(N), H = new Float32Array(N), road = new Int32Array(N), adj = Array.from({ length: N }, () => []);
    const link = (a, b) => { const d = Math.hypot(X[a] - X[b], Z[a] - Z[b]), v = Math.min(SPEED[R[road[a]].type] || 15, SPEED[R[road[b]].type] || 15); adj[a].push(b, d, d / v); adj[b].push(a, d, d / v); };
    R.forEach((r, ri) => { for (let i = 0; i < r.n; i++) { const id = base[ri] + i; X[id] = r.pts[i][0]; Z[id] = r.pts[i][1]; H[id] = r.h[i]; road[id] = ri; } });
    R.forEach((r, ri) => { for (let i = 1; i < r.n; i++) link(base[ri] + i - 1, base[ri] + i); if (r.closed && r.n > 2) link(base[ri], base[ri] + r.n - 1); });
    const C = 12, hash = new Map(), key = (x, z) => Math.floor(x / C) * 100003 + Math.floor(z / C);
    for (let i = 0; i < N; i++) { const k = key(X[i], Z[i]); let a = hash.get(k); if (!a) hash.set(k, a = []); a.push(i); }
    const near = (x, z, f) => { const cx = Math.floor(x / C), cz = Math.floor(z / C); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = hash.get((cx + a) * 100003 + cz + b); if (l) for (const j of l) f(j); } };
    for (let i = 0; i < N; i++) {
      const best = new Map();
      near(X[i], Z[i], (j) => { if (road[j] === road[i] || Math.abs(H[i] - H[j]) > 2) return; const d = Math.hypot(X[i] - X[j], Z[i] - Z[j]); if (d < Math.max(R[road[i]].hw, R[road[j]].hw) + 1.5 && (!best.has(road[j]) || d < best.get(road[j])[1])) best.set(road[j], [j, d]); });
      for (const [, [j]] of best) if (j > i || !adj[j].includes(i)) link(i, j);
    }
    // bridge decks end on plazas rather than roads: tie each end to the nearest road node within 130 m (across the paddock)
    R.forEach((r, ri) => { if (r.name !== 'Raceway bridge') return; for (const k of [0, r.n - 1]) { const a = base[ri] + k; let best = -1, bd = 130; for (let j = 0; j < N; j++) { if (road[j] === ri || Math.abs(H[j] - H[a]) > 4 || R[road[j]].type === 'track') continue; const d = Math.hypot(X[j] - X[a], Z[j] - Z[a]); if (d < bd) { bd = d; best = j; } } if (best >= 0) link(a, best); } });
    // the main network (the closed race circuit etc. are separate): destinations snap onto it
    const comp = new Int32Array(N).fill(-1), sizes = [];
    for (let i = 0; i < N; i++) if (comp[i] < 0) { const st = [i]; comp[i] = sizes.length; let s = 0; while (st.length) { const u = st.pop(); s++; for (let k = 0; k < adj[u].length; k += 3) { const v = adj[u][k]; if (comp[v] < 0) { comp[v] = comp[i]; st.push(v); } } } sizes.push(s); }
    const main = sizes.indexOf(Math.max(...sizes));
    G = { R, N, X, Z, H, road, adj, comp, main, near, bbox: R.map((r) => { let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const [x, z] of r.pts) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, z); d = Math.max(d, z); } return [a - 10, b + 10, c - 10, d + 10]; }) };
  }
  // nearest road node (optionally only on the main network)
  function snap(x, z, mainOnly) {
    let best = -1, bd = 1e18;
    for (let i = 0; i < G.N; i++) {
      if (mainOnly && G.comp[i] !== G.main) continue;
      const d = (G.X[i] - x) ** 2 + (G.Z[i] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  // A* from a to b; returns node list
  // live traffic: nodes near a crash or a police chase cost seven times as long
  let slow = new Uint8Array(0), incidents = [];
  function markSlow() {
    slow = new Uint8Array(G.N);
    for (const q of incidents) G.near(q.x, q.z, (j) => { if (Math.hypot(G.X[j] - q.x, G.Z[j] - q.z) < 35) slow[j] = 1; });
    // near() only looks one 12 m cell around; widen with the neighbours' neighbours
    for (const q of incidents) for (const [ox, oz] of [[-24, 0], [24, 0], [0, -24], [0, 24]]) G.near(q.x + ox, q.z + oz, (j) => { if (Math.hypot(G.X[j] - q.x, G.Z[j] - q.z) < 35) slow[j] = 1; });
  }
  function astar(a, b) {
    const N = G.N, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const h = (i) => Math.hypot(G.X[i] - G.X[b], G.Z[i] - G.Z[b]) / 30;
    const heap = [], push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    g[a] = 0; push(h(a), a);
    while (heap.length) {
      const [, u] = pop(); if (closed[u]) continue; closed[u] = 1; if (u === b) break;
      const A = G.adj[u];
      for (let k = 0; k < A.length; k += 3) { const v = A[k], ng = g[u] + A[k + 2] * (slow[v] ? 7 : 1); if (ng < g[v]) { g[v] = ng; from[v] = u; push(ng + h(v), v); } }
    }
    if (from[b] < 0 && a !== b) return null;
    const path = []; for (let u = b; u >= 0; u = from[u]) { path.push(u); if (u === a) break; }
    return path.reverse();
  }
  // turn the node list into distances, times and manoeuvres
  function plan(path, dest) {
    const n = path.length, cum = new Float32Array(n), cumT = new Float32Array(n);
    for (let i = 1; i < n; i++) { const a = path[i - 1], b = path[i], d = Math.hypot(G.X[a] - G.X[b], G.Z[a] - G.Z[b]); cum[i] = cum[i - 1] + d; cumT[i] = cumT[i - 1] + d / (SPEED[G.R[G.road[b]].type] || 15); }
    const at = (i) => path[Math.max(0, Math.min(n - 1, i))];
    const back = (i, m) => { let k = i; while (k > 0 && cum[i] - cum[k] < m) k--; return k; }, fwd = (i, m) => { let k = i; while (k < n - 1 && cum[k] - cum[i] < m) k++; return k; };
    // road changes, ignoring brief hops onto a crossing road and straight back
    const raw = []; for (let i = 1; i < n; i++) if (G.road[path[i]] !== G.road[path[i - 1]]) raw.push(i);
    const man = [];
    for (let q = 0; q < raw.length; q++) {
      const i = raw[q], to = G.road[path[i]];
      const nextChange = raw[q + 1];
      if (nextChange != null && cum[nextChange] - cum[i] < 25) {
        if (G.road[path[nextChange]] === G.road[path[i - 1]]) { q++; continue; }   // hopped across and back
        continue;                                                                     // a short link: take the next one
      }
      if (man.length && G.road[path[man[man.length - 1].i - 1]] === to) { man.pop(); continue; }
      const p0 = at(back(i, 18)), p1 = at(i), p2 = at(fwd(i, 18));
      const ax = G.X[p1] - G.X[p0], az = G.Z[p1] - G.Z[p0], bx = G.X[p2] - G.X[p1], bz = G.Z[p2] - G.Z[p1];
      const ang = Math.atan2(ax * bz - az * bx, ax * bx + az * bz) * 180 / Math.PI;   // < 0: left (x east, z south)
      const rb = ROUNDABOUTS.find((r) => Math.hypot(r.x - G.X[p1], r.z - G.Z[p1]) < r.R + 12);
      const a = Math.abs(ang), side = ang < 0 ? 'left' : 'right';
      const type = rb ? 'roundabout' : a < 22 ? 'straight' : a < 60 ? 'slight-' + side : a < 145 ? side : 'uturn';
      man.push({ i, type, road: G.R[to].name, roadType: G.R[to].type });
    }
    man.push({ i: n - 1, type: 'arrive', road: dest.name });
    return { path, cum, cumT, man, dest, length: cum[n - 1] };
  }

  // ---------------------------------------------------------------- state
  let route = null, cur = 0, offT = 0, lastRoute = 0, voice = true, spoken = new Set(), visible = false, picking = false, arrivedT = 0;
  let dash = false, pois = [], cat = 'All', sel = 0, listed = [], radar = false, wx = null, fuel = null, fuelOffered = false, incT = 0;
  const say = (text) => { if (!voice || !window.speechSynthesis) return; try { const u = new SpeechSynthesisUtterance(text); u.rate = 1.05; u.pitch = 1; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { /* no voices */ } };
  const fmtD = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${m >= 200 ? Math.round(m / 50) * 50 : Math.max(10, Math.round(m / 10) * 10)} m`);
  const sayD = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.0', '')} kilometres` : `${m >= 200 ? Math.round(m / 50) * 50 : Math.max(10, Math.round(m / 10) * 10)} metres`);
  const phrase = (m) => ({ straight: `continue onto ${m.road}`, 'slight-left': `bear left onto ${m.road}`, 'slight-right': `bear right onto ${m.road}`, left: `turn left onto ${m.road}`, right: `turn right onto ${m.road}`, uturn: `make a U-turn onto ${m.road}`, roundabout: `at the roundabout, take the exit onto ${m.road}`, arrive: `you have arrived at ${m.road}` })[m.type];
  const ICON = { straight: '↑', 'slight-left': '↖', 'slight-right': '↗', left: '↰', right: '↱', uturn: '↶', roundabout: '⟳', arrive: '⚑' };

  function go(dest, pos, yaw, quiet) {
    if (!G) build();
    const a = snap(pos.x, pos.z, true), b = snap(dest.x, dest.z, true);
    if (a < 0 || b < 0) { toast('No route found'); return false; }
    markSlow();
    const path = astar(a, b);
    if (!path || path.length < 2) { toast(`You're already at ${dest.name}`); return false; }
    const after = route && route.dest === dest ? route.after : (dest.after || null);
    route = plan(path, dest); route.after = after; cur = 0; offT = 0; spoken = new Set(); lastRoute = performance.now(); arrivedT = 0;
    if (!quiet) { const m = route.man[0]; say(`Starting route to ${dest.name}. ${m.type === 'arrive' ? '' : 'In ' + sayD(route.cum[m.i]) + ', ' + phrase(m)}.`); toast(`GPS · ${dest.name} · ${fmtD(route.length)}`); }
    return true;
  }

  // ---------------------------------------------------------------- the screen
  const css = document.createElement('style');
  css.textContent = `
#gps { position: fixed; left: max(16px, env(safe-area-inset-left, 0px)); bottom: calc(16px + env(safe-area-inset-bottom, 0px)); width: min(470px, calc(100vw - 32px)); height: 280px; z-index: 6;
  background: #121416; border-radius: 22px; box-shadow: 0 8px 28px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.07); display: flex; overflow: hidden; font-family: var(--body); color: #e8eaed; }
#gps[hidden] { display: none; }
#gps .dock { width: 54px; background: #1b1d20; display: flex; flex-direction: column; align-items: center; justify-content: space-around; padding: 8px 0; }
#gps .dock button { width: 40px; height: 40px; border-radius: 50%; border: 0; background: #2a2d31; color: #e8eaed; font: 600 17px/1 var(--body); cursor: pointer; display: grid; place-items: center; }
#gps .dock button.on { background: #8ab4f8; color: #0b1a33; }
#gps .dock .clock { font: 600 12px/1 var(--body); color: #bdc1c6; }
#gps .main { position: relative; flex: 1; min-width: 0; }
#gps canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
#gps .card { position: absolute; left: 10px; top: 10px; max-width: calc(100% - 92px); background: #0f6b3a; border-radius: 14px; padding: 8px 12px 8px 10px; display: flex; gap: 10px; align-items: center; box-shadow: 0 3px 10px rgba(0,0,0,0.4); }
#gps .card .ic { font: 700 34px/1 var(--body); width: 36px; text-align: center; }
#gps .card .d { font: 700 22px/1.05 var(--body); }
#gps .card .r { font: 500 13px/1.2 var(--body); opacity: 0.92; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#gps .then { position: absolute; left: 10px; top: 76px; background: #0b4f2a; border-radius: 10px; padding: 3px 9px; font: 600 12px/1.3 var(--body); }
#gps .limit { position: absolute; right: 10px; top: 10px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
#gps .limit .sign { width: 38px; height: 38px; border-radius: 50%; background: #fff; border: 4px solid #d93025; color: #111; font: 700 14px/30px var(--body); text-align: center; }
#gps .limit .spd { background: #202124; border-radius: 8px; padding: 3px 7px; font: 700 14px/1 var(--body); }
#gps .limit .spd.over { background: #d93025; }
#gps .wxchip { position: absolute; right: 10px; bottom: 50px; background: rgba(32,33,36,0.9); border-radius: 10px; padding: 4px 9px; font: 600 12px/1.2 var(--body); }
#gps .bar { position: absolute; left: 0; right: 0; bottom: 0; background: #1b1d20; padding: 8px 12px; display: flex; align-items: center; gap: 12px; }
#gps .bar .eta { font: 700 20px/1 var(--body); color: #81c995; }
#gps .bar .sub { font: 500 13px/1.2 var(--body); color: #bdc1c6; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#gps .bar button { border: 0; background: #2a2d31; color: #e8eaed; border-radius: 16px; padding: 6px 12px; font: 600 13px/1 var(--body); cursor: pointer; }
#gps .search { position: absolute; left: 10px; right: 10px; top: 10px; background: #2a2d31; border-radius: 22px; padding: 10px 14px; font: 500 14px/1 var(--body); color: #bdc1c6; cursor: pointer; }
#gps .pick { position: absolute; inset: 0; background: #121416; display: flex; flex-direction: column; }
#gps .pick[hidden] { display: none; }
#gps .pick .hd { padding: 10px 12px 6px; font: 700 16px/1 var(--body); display: flex; justify-content: space-between; align-items: center; }
#gps .pick .chips { display: flex; gap: 6px; padding: 0 10px 8px; flex-wrap: wrap; }
#gps .pick .chips span { background: #2a2d31; border-radius: 14px; padding: 4px 10px; font: 600 12px/1.2 var(--body); cursor: pointer; }
#gps .pick .chips span.on { background: #8ab4f8; color: #0b1a33; }
#gps .pick ul { list-style: none; margin: 0; padding: 0 6px 8px; overflow-y: auto; flex: 1; }
#gps .pick li { display: flex; justify-content: space-between; gap: 10px; padding: 7px 8px; border-radius: 10px; cursor: pointer; font: 500 14px/1.2 var(--body); }
#gps .pick li small { color: #9aa0a6; font-size: 12px; }
#gps .pick li.sel, #gps .pick li:hover { background: #2a2d31; }
#gps .pick li .dist { color: #9aa0a6; white-space: nowrap; }
@media (max-width: 760px) { #gps { height: 220px; } #gps .card .d { font-size: 18px; } }`;
  document.head.appendChild(css);
  const el = document.createElement('div'); el.id = 'gps'; el.hidden = true;
  el.innerHTML = `<div class="dock"><span class="clock"></span><button data-a="search" title="Where to? (7)">⌕</button><button data-a="radio" title="Radio: next station">♪</button><button data-a="radar" title="Weather radar">☁</button><button data-a="voice" class="on" title="Voice guidance">🔊</button><button data-a="close" title="Hide (6)">✕</button></div>
<div class="main"><canvas></canvas><div class="search">Where to?</div><div class="card" hidden><div class="ic"></div><div><div class="d"></div><div class="r"></div></div></div><div class="then" hidden></div>
<div class="limit"><div class="sign"></div><div class="spd"></div></div><div class="wxchip" hidden></div><div class="bar"><span class="eta"></span><span class="sub"></span><button data-a="end" hidden>Exit</button></div>
<div class="pick" hidden><div class="hd"><span>Where to?</span><button data-a="pickclose" style="border:0;background:#2a2d31;color:#e8eaed;border-radius:14px;padding:4px 10px;cursor:pointer">✕</button></div><div class="chips"></div><ul></ul></div></div>`;
  document.body.appendChild(el);
  const $ = (s) => el.querySelector(s), cv = $('canvas'), ctx = cv.getContext('2d');
  const CATS = ['All', 'Places', 'Fuel', 'Garages', 'Towns', 'Transport'];
  let lastPos = { x: 0, z: 0 }, lastYaw = 0, speedKmh = 0, mapBg = null, HALF = 2048;
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]'); const li = e.target.closest('li[data-i]'); const chip = e.target.closest('.chips span');
    if (li) { pickIndex(+li.dataset.i); return; }
    if (chip) { cat = chip.textContent; sel = 0; renderList(); return; }
    if (e.target.closest('.search')) { api.openPicker(); return; }
    if (!a) return;
    const act = a.dataset.a;
    if (act === 'search') api.openPicker();
    else if (act === 'pickclose') api.closePicker();
    else if (act === 'voice') { voice = !voice; a.classList.toggle('on', voice); a.textContent = voice ? '🔊' : '🔇'; if (!voice && window.speechSynthesis) speechSynthesis.cancel(); }
    else if (act === 'radio') radio && radio.next();
    else if (act === 'radar') { radar = !radar; a.classList.toggle('on', radar); }
    else if (act === 'close') api.toggle(false);
    else if (act === 'end') api.stop();
  });
  function renderList() {
    $('.chips').innerHTML = CATS.map((c) => `<span class="${c === cat ? 'on' : ''}">${c}</span>`).join('');
    listed = pois.filter((p) => cat === 'All' || p.cat === cat).map((p) => ({ ...p, d: Math.hypot(p.x - lastPos.x, p.z - lastPos.z) })).sort((a, b) => (a.top ? -1 : b.top ? 1 : a.d - b.d));
    sel = Math.max(0, Math.min(listed.length - 1, sel));
    $('ul').innerHTML = listed.map((p, i) => `<li data-i="${i}" class="${i === sel ? 'sel' : ''}"><span>${p.name}<br><small>${p.cat}</small></span><span class="dist">${fmtD(p.d)}</span></li>`).join('');
    const s = $('ul').children[sel]; if (s) s.scrollIntoView({ block: 'nearest' });
  }
  function pickIndex(i) { const p = listed[i]; if (!p) return; api.closePicker(); go(p, lastPos, lastYaw); }
  // keyboard while choosing: arrows, Enter, Esc (kept away from the driving controls)
  window.addEventListener('keydown', (e) => {
    if (!picking) return;
    const k = e.code;
    if (k === 'ArrowDown' || k === 'ArrowUp') { sel += k === 'ArrowDown' ? 1 : -1; renderList(); }
    else if (k === 'ArrowLeft' || k === 'ArrowRight') { cat = CATS[(CATS.indexOf(cat) + (k === 'ArrowRight' ? 1 : CATS.length - 1)) % CATS.length]; sel = 0; renderList(); }
    else if (k === 'Enter' || k === 'NumpadEnter') pickIndex(sel);
    else if (k === 'Escape' || k === 'Digit7') api.closePicker();
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);

  function draw() {
    const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mpp = 0.55 + Math.min(1.4, speedKmh / 90);                       // metres per pixel: zoom out with speed
    const cx = W / 2, cy = H * 0.68;
    ctx.fillStyle = '#1e2124'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI + lastYaw); ctx.scale(1 / mpp, 1 / mpp); ctx.translate(-lastPos.x, -lastPos.z);
    // land and sea from the overview map, darkened
    if (mapBg) { const s = (2 * HALF) / mapBg.width; ctx.globalAlpha = 0.32; ctx.drawImage(mapBg, -HALF, -HALF, mapBg.width * s, mapBg.height * s); ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(18,20,22,0.45)'; ctx.fillRect(lastPos.x - 600, lastPos.z - 600, 1200, 1200); }
    if (!G) build();
    const view = 380 * mpp, vx0 = lastPos.x - view, vx1 = lastPos.x + view, vz0 = lastPos.z - view, vz1 = lastPos.z + view;
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const pass of [0, 1]) G.R.forEach((r, i) => {
      const b = G.bbox[i]; if (b[1] < vx0 || b[0] > vx1 || b[3] < vz0 || b[2] > vz1) return;
      ctx.strokeStyle = pass ? (r.type === 'highway' ? '#c5a654' : r.type === 'gravel' ? '#7a6a52' : r.type === 'track' ? '#7d4a4a' : '#6f757c') : '#0d0e10';
      ctx.lineWidth = (r.type === 'highway' ? 11 : r.type === 'street' ? 6 : 8) * (pass ? 1 : 1.5) * Math.max(0.8, mpp * 0.8);
      ctx.beginPath(); r.pts.forEach(([x, z], k) => (k ? ctx.lineTo(x, z) : ctx.moveTo(x, z))); if (r.closed) ctx.closePath(); ctx.stroke();
    });
    // weather radar: rain cells around you now, and the next front coming in upwind
    if (radar && wx) {
      const t = performance.now() / 1000, cells = [];
      const rainNow = Math.max(wx.rain, wx.storm), fc = wx.forecast, wet = (st) => st === 'rain' || st === 'storm';
      for (let k = 0; k < 26; k++) {
        const a = k * 2.4, r = 120 + (k * 53) % 520;
        if (rainNow > 0.15) cells.push([lastPos.x + Math.cos(a + t * 0.02) * r, lastPos.z + Math.sin(a + t * 0.02) * r, 60 + (k * 17) % 90, rainNow + (wx.storm > 0.3 && k % 4 === 0 ? 0.6 : 0)]);
        if (fc && wet(fc.next) && fc.in < 400) { const D = 120 + fc.in * 6, wa = Math.atan2(wx.wind.z, wx.wind.x) + Math.PI, off = ((k * 37) % 600) - 300;
          cells.push([lastPos.x + Math.cos(wa) * (D + (k * 13) % 160) - Math.sin(wa) * off, lastPos.z + Math.sin(wa) * (D + (k * 13) % 160) + Math.cos(wa) * off, 70 + (k * 11) % 80, fc.next === 'storm' ? 1.2 : 0.7]); }
      }
      for (const [x, z, r, it] of cells) { const gr = ctx.createRadialGradient(x, z, 0, x, z, r); const c = it > 1 ? '217,48,37' : it > 0.6 ? '251,188,4' : '52,168,83'; gr.addColorStop(0, `rgba(${c},0.45)`); gr.addColorStop(1, `rgba(${c},0)`); ctx.fillStyle = gr; ctx.fillRect(x - r, z - r, r * 2, r * 2); }
    }
    // incidents
    for (const q of incidents) { ctx.fillStyle = '#d93025'; ctx.beginPath(); ctx.arc(q.x, q.z, 9 * mpp, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * mpp; ctx.stroke(); }
    if (route) {
      ctx.strokeStyle = '#1a56c4'; ctx.lineWidth = 14 * Math.max(0.8, mpp * 0.8); ctx.beginPath();
      for (let k = Math.max(0, cur - 1); k < route.path.length; k++) { const u = route.path[k]; k > cur - 1 ? ctx.lineTo(G.X[u], G.Z[u]) : ctx.moveTo(G.X[u], G.Z[u]); }
      ctx.stroke(); ctx.strokeStyle = '#8ab4f8'; ctx.lineWidth = 8 * Math.max(0.8, mpp * 0.8); ctx.stroke();
      // slow sections in orange
      if (slow.length) { ctx.strokeStyle = '#f29900'; for (let k = Math.max(1, cur); k < route.path.length; k++) { const u = route.path[k], v = route.path[k - 1]; if (slow[u] && slow[v]) { ctx.beginPath(); ctx.moveTo(G.X[v], G.Z[v]); ctx.lineTo(G.X[u], G.Z[u]); ctx.stroke(); } } }
      const d = route.dest; ctx.fillStyle = '#d93025'; ctx.beginPath(); ctx.arc(d.x, d.z, 7 * mpp, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // the car
    ctx.fillStyle = '#8ab4f8'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, cy - 13); ctx.lineTo(cx + 10, cy + 10); ctx.lineTo(cx, cy + 5); ctx.lineTo(cx - 10, cy + 10); ctx.closePath(); ctx.fill(); ctx.stroke();
    // on the phone mount (cockpit view) the card and the arrival line are painted into the map itself
    if (dash) {
      ctx.font = '700 22px sans-serif'; ctx.textBaseline = 'middle';
      if (route) {
        const mi = route.man.findIndex((m) => m.i > cur), m = route.man[mi], dm = route.cum[m.i] - route.cum[cur];
        ctx.fillStyle = '#0f6b3a'; ctx.beginPath(); ctx.roundRect(8, 8, W - 16, 52, 12); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '700 30px sans-serif'; ctx.fillText(ICON[m.type], 18, 35); ctx.font = '700 20px sans-serif'; ctx.fillText(fmtD(dm), 56, 24);
        ctx.font = '500 14px sans-serif'; ctx.fillText((m.type === 'arrive' ? route.dest.name : m.road).slice(0, 34), 56, 46);
        const tLeft = (route.cumT[route.cumT.length - 1] - route.cumT[cur]) * 1.15;
        ctx.fillStyle = 'rgba(27,29,32,0.92)'; ctx.fillRect(0, H - 30, W, 30); ctx.fillStyle = '#81c995'; ctx.font = '700 16px sans-serif'; ctx.fillText(clock(tLeft / 60), 10, H - 15);
        ctx.fillStyle = '#bdc1c6'; ctx.font = '500 13px sans-serif'; ctx.fillText(`${Math.max(1, Math.round(tLeft / 60))} min · ${fmtD(route.length - route.cum[cur])}`, 70, H - 15);
      } else { ctx.fillStyle = 'rgba(27,29,32,0.92)'; ctx.fillRect(0, H - 30, W, 30); ctx.fillStyle = '#bdc1c6'; ctx.font = '500 14px sans-serif'; ctx.fillText('Press 7 for a destination', 10, H - 15); }
    }
  }

  const api = {
    get route() { return route; },
    get canvas() { return cv; },
    // dash mode: the screen lives on a phone mount in the cockpit; the floating panel hides but keeps working
    setDash(on) { if (dash === on) return; dash = on; el.style.opacity = on ? '0' : ''; el.style.pointerEvents = on ? 'none' : ''; },
    get visible() { return visible; },
    get picking() { return picking; },
    setPOIs(list) { pois = list; if (picking) renderList(); },
    // live data from the game: incidents [{ x, z, kind, id }], fuel { l, tank, stations }, weather { state, rain, storm, forecast, wind }
    setIncidents(list) { incidents = list; },
    setFuel(f) { fuel = f; },
    setWeather(w) { wx = w; },
    setMap(img, half) { mapBg = img; HALF = half; },
    toggle(on = !visible) { visible = on; el.hidden = !on; if (!on) api.closePicker(); const mw = document.getElementById('mapWrap'); if (mw) mw.style.visibility = on ? 'hidden' : ''; },
    onOpen: null,   // refresh the destinations (e.g. the current objective) before the list shows
    openPicker() { if (api.onOpen) api.onOpen(); api.toggle(true); picking = true; $('.pick').hidden = false; sel = 0; renderList(); },
    closePicker() { picking = false; $('.pick').hidden = true; },
    navigate(dest, pos, yaw) { api.toggle(true); return go(dest, pos, yaw); },
    stop() { route = null; say('Route ended'); },
    // the route as world points, for the overview map
    points() { if (!route) return null; const out = []; for (let k = cur; k < route.path.length; k += 2) out.push([G.X[route.path[k]], G.Z[route.path[k]]]); return out; },
    update(dt, pos, yaw, speed, roadType) {
      lastPos = { x: pos.x, z: pos.z }; lastYaw = yaw; speedKmh = speed * 3.6;
      // live traffic: a crash or a chase on the road ahead gets a faster route (checked every few seconds)
      incT -= dt;
      if (route && incT <= 0 && incidents.length) {
        incT = 3;
        const hit = incidents.find((q) => { for (let k = cur; k < Math.min(route.path.length, cur + 500); k += 3) { const u = route.path[k]; if (Math.hypot(G.X[u] - q.x, G.Z[u] - q.z) < 35) return !route.seen || !route.seen.has(q.id); } return false; });
        if (hit) { const seen = new Set([...(route.seen || []), ...incidents.map((q) => q.id)]); const old = route.length - route.cum[cur]; go(route.dest, pos, yaw, true); route.seen = seen; const nw = route.length; say(nw > old + 60 ? 'Traffic ahead. Taking a faster route' : 'Traffic ahead. Still the fastest route'); toast(`GPS · ${hit.kind} ahead${nw > old + 60 ? ' · faster route found' : ''}`); }
      }
      // low fuel: add a stop at the fuel station nearest the road ahead
      if (route && fuel && !route.after && !fuelOffered && fuel.l < fuel.tank * 0.18 && fuel.stations.length) {
        fuelOffered = true;
        let best = null, bd = 1e18; for (const st of fuel.stations) for (let k = cur; k < route.path.length; k += 8) { const u = route.path[k], d = Math.hypot(G.X[u] - st.x, G.Z[u] - st.z) + (route.cum[k] - route.cum[cur]) * 0.1; if (d < bd) { bd = d; best = st; } }
        if (best) { const dest = route.dest; go({ name: best.name, x: best.x, z: best.z, after: dest }, pos, yaw, true); say(`Fuel is low. Adding a stop at ${best.name}`); toast(`GPS · low fuel · stop added: ${best.name}`); }
      }
      if (fuel && fuel.l > fuel.tank * 0.5) fuelOffered = false;
      if (route) {
        // progress: the nearest route node a little behind to well ahead of where we were
        let best = cur, bd = 1e18;
        for (let k = Math.max(0, cur - 5); k < Math.min(route.path.length, cur + 120); k++) { const u = route.path[k], d = (G.X[u] - pos.x) ** 2 + (G.Z[u] - pos.z) ** 2; if (d < bd) { bd = d; best = k; } }
        cur = best;
        if (Math.sqrt(bd) > 30) offT += dt; else offT = 0;
        if (offT > 2.5 && performance.now() - lastRoute > 4000) { say('Rerouting'); toast('GPS · rerouting'); go(route.dest, pos, yaw, true); }
        else if (route) {
          const left = route.length - route.cum[cur];
          if (left < 30 || Math.hypot(route.dest.x - pos.x, route.dest.z - pos.z) < 25) {
            const after = route.after;
            if (after) { say(`${route.dest.name}. Fill up, then we'll continue to ${after.name}`); toast(`Stop · ${route.dest.name} · then ${after.name}`); route = null; go({ ...after, after: null }, pos, yaw, true); }
            else { say(`You have arrived at ${route.dest.name}`); toast(`Arrived · ${route.dest.name}`); route = null; arrivedT = 4; }
          }
          else {
            const mi = route.man.findIndex((m) => m.i > cur), m = route.man[mi], dm = route.cum[m.i] - route.cum[cur];
            for (const [th, tag] of [[650, 'far'], [220, 'near'], [45, 'now']]) {
              const key = mi + tag;
              if (dm < th && !spoken.has(key) && (tag !== 'far' || dm > 350) && (tag !== 'near' || dm > 90)) {
                spoken.add(key);
                say(m.type === 'arrive' ? (tag === 'now' ? '' : `In ${sayD(dm)}, ${phrase(m)}`) : tag === 'now' ? `Now ${phrase(m)}` : `In ${sayD(dm)}, ${phrase(m)}`);
              }
            }
          }
        }
      }
      if (!visible) return;
      // the card, the bar, the limit
      $('.clock').textContent = clock();
      const card = $('.card'), then = $('.then'), bar = $('.bar'), search = $('.search');
      search.hidden = !!route;
      if (route) {
        const mi = route.man.findIndex((m) => m.i > cur), m = route.man[mi], dm = route.cum[m.i] - route.cum[cur];
        card.hidden = false; $('.card .ic').textContent = ICON[m.type]; $('.card .d').textContent = fmtD(dm);
        $('.card .r').textContent = m.type === 'arrive' ? route.dest.name : m.type === 'roundabout' ? `Roundabout · ${m.road}` : m.road;
        const n2 = route.man[mi + 1]; then.hidden = !n2 || route.cum[n2.i] - route.cum[m.i] > 150; if (n2) then.textContent = `Then ${ICON[n2.type]}`;
        const tLeft = (route.cumT[route.cumT.length - 1] - route.cumT[cur]) * 1.15;
        $('.bar .eta').textContent = clock(tLeft / 60);
        $('.bar .sub').textContent = `${Math.max(1, Math.round(tLeft / 60))} min · ${fmtD(route.length - route.cum[cur])} · ${route.dest.name}`;
        bar.querySelector('button').hidden = false;
      } else {
        card.hidden = true; then.hidden = true; bar.querySelector('button').hidden = true;
        $('.bar .eta').textContent = arrivedT > 0 ? 'Arrived' : ''; arrivedT -= dt;
        $('.bar .sub').textContent = roadType ? roadType.name : 'Off road';
      }
      { const chip = $('.wxchip'), fc = wx && wx.forecast, wet = fc && (fc.next === 'rain' || fc.next === 'storm');
        chip.hidden = !(radar && wx); if (!chip.hidden) chip.textContent = wx.rain > 0.15 ? (wx.storm > 0.3 ? 'Thunderstorm overhead' : 'Raining here') : wet && fc.in < 400 ? `${fc.next === 'storm' ? 'Storm' : 'Rain'} in ~${Math.max(1, Math.round(fc.in / 60))} min` : 'Dry for now'; }
      const lim = roadType ? LIMIT[roadType.type] : 0, sign = $('.limit .sign'), spd = $('.limit .spd');
      sign.style.visibility = lim ? 'visible' : 'hidden'; sign.textContent = lim || '';
      spd.textContent = Math.round(speedKmh); spd.classList.toggle('over', lim > 0 && speedKmh > lim + 5);
      draw();
    },
  };
  return api;
}
