// Stats and achievements. Distances per vehicle, top speeds, airtime, jumps, crashes, money and time played are
// tracked and saved; achievements unlock from them (and from events like wins and licences) with a toast, and
// show as trophies on the shelf at home. The panel opens from the pause menu.

export const ACHIEVEMENTS = [
  { id: 'km100', name: 'Road trip', desc: 'Drive 100 km in the MX-5', test: (s) => s.dist.car >= 100000 },
  { id: 'km1000', name: 'Marathon', desc: 'Drive 1,000 km in the MX-5', test: (s) => s.dist.car >= 1e6 },
  { id: 'ton', name: 'Ton-up', desc: 'Reach 160 km/h', test: (s) => s.top.car >= 160 / 3.6 },
  { id: 'twoton', name: 'Double ton', desc: 'Reach 200 km/h in the MX-5', test: (s) => s.top.car >= 200 / 3.6 },
  { id: 'air3', name: 'Airborne', desc: '3 seconds of airtime in the car', test: (s) => s.airBest >= 3 },
  { id: 'jumps', name: 'Stunt driver', desc: '25 jumps (over a second in the air)', test: (s) => s.jumps >= 25 },
  { id: 'flyer', name: 'Frequent flyer', desc: 'Fly 100 km', test: (s) => s.dist.plane >= 100000 },
  { id: 'sailor', name: 'Sailor', desc: 'Sail 20 km in the boat', test: (s) => s.dist.boat >= 20000 },
  { id: 'walker', name: 'Giant steps', desc: 'Walk 5 km in the mech', test: (s) => s.dist.mech >= 5000 },
  { id: 'night', name: 'Night owl', desc: 'Drive 20 km after dark', test: (s) => s.night >= 20000 },
  { id: 'storm', name: 'Storm chaser', desc: 'Drive 5 km in a thunderstorm', test: (s) => s.storm >= 5000 },
  { id: 'drift', name: 'Drift king', desc: 'Bank a 10,000 point drift', test: (s, x) => (x.settings.drift && x.settings.drift.best) >= 10000 },
  { id: 'rally', name: 'Rally driver', desc: 'Finish both rally stages', test: (s, x) => Object.keys(x.settings.rally || {}).length >= 2 },
  { id: 'winner', name: 'Race winner', desc: 'Win a race at Red Mesa Raceway', test: (s) => s.ev.win },
  { id: 'arena', name: 'Golem slayer', desc: 'Beat the Iron Golem', test: (s, x) => !!x.settings.arenaBest },
  { id: 'photos', name: 'Photographer', desc: 'Capture every photo spot', test: (s, x) => x.photos && x.photos.count >= x.photos.spots.length },
  { id: 'ppl', name: 'Wings', desc: 'Earn a private pilot licence', test: (s, x) => x.pilot && x.pilot.lic >= 1 },
  { id: 'atpl', name: 'Captain', desc: 'Earn an airline transport licence', test: (s, x) => x.pilot && x.pilot.lic >= 3 },
  { id: 'rich', name: 'High roller', desc: 'Earn $50,000 in total', test: (s, x) => x.econ && x.econ.earned >= 50000 },
  { id: 'rides', name: 'Collector', desc: 'Ride the motorbike, GT, jet ski and helicopter', test: (s) => ['bike', 'gt', 'ski', 'heli'].every((k) => s.rides[k]) },
  { id: 'home', name: 'Home sweet home', desc: 'Sleep at home', test: (s) => s.ev.slept },
  { id: 'travel', name: 'Passenger', desc: 'Take the Motorail, the ferry and the cable car', test: (s) => s.ev.motorail && s.ev.ferry && s.ev.cablecar },
  { id: 'police', name: 'Clean getaway', desc: 'Lose a 3-star police pursuit', test: (s) => s.ev.escape3 },
  { id: 'cop', name: 'On duty', desc: 'Make 10 arrests in the police car', test: (s) => (s.ev.arrests || 0) >= 10 },
  { id: 'boss', name: 'Mogul', desc: 'Own three delivery vans', test: (s) => (s.ev.vans || 0) >= 3 },
  { id: 'island', name: 'Islander', desc: 'Visit the lighthouse on Gull Island', test: (s) => s.ev.lighthouse },
];

const fmtKm = (m) => (m / 1000).toFixed(1) + ' km';
const fmtT = (t) => `${Math.floor(t / 3600)}h ${String(Math.floor(t / 60) % 60).padStart(2, '0')}m`;

export function createStats({ settings, saveSettings, toast, ctx, root }) {
  const s = settings.stats || (settings.stats = {});
  for (const [k, v] of Object.entries({ dist: { car: 0, boat: 0, plane: 0, mech: 0, ride: 0 }, top: { car: 0, plane: 0, ride: 0 }, airBest: 0, jumps: 0, crashes: 0, time: 0, night: 0, storm: 0, ev: {}, rides: {}, got: {} })) if (s[k] == null) s[k] = v;
  let air = 0, checkT = 0, saveT = 0;
  const got = s.got;

  // the panel
  const el = document.createElement('div'); el.id = 'statsUI'; el.hidden = true; el.setAttribute('role', 'dialog'); root.appendChild(el);
  el.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === el) el.hidden = true; });
  function render() {
    const rows = [
      ['Time played', fmtT(s.time)], ['Driven (MX-5)', fmtKm(s.dist.car)], ['Flown', fmtKm(s.dist.plane)], ['Sailed', fmtKm(s.dist.boat)], ['Walked (mech)', fmtKm(s.dist.mech)], ['Other rides', fmtKm(s.dist.ride)],
      ['Top speed (car)', `${Math.round(s.top.car * 3.6)} km/h`], ['Top speed (plane)', `${Math.round(s.top.plane * 1.944)} kt`], ['Best airtime', `${s.airBest.toFixed(1)} s`], ['Jumps', s.jumps], ['Crashes', s.crashes],
      ['Best drift', (settings.drift && settings.drift.best || 0).toLocaleString('en-US')], ['Money earned', '$' + Math.round(ctx.econ ? ctx.econ.earned : 0).toLocaleString('en-US')],
      ['Pilot licence', ctx.pilotName ? ctx.pilotName() : '—'], ['Photo spots', ctx.photos ? `${ctx.photos.count}/${ctx.photos.spots.length}` : '—'],
      ...Object.entries(settings.rally || {}).map(([k, v]) => [`Rally ${k}`, v.toFixed(2) + ' s']),
      ...(settings.arenaBest ? [['Iron Golem', settings.arenaBest.toFixed(1) + ' s']] : []),
    ];
    const n = ACHIEVEMENTS.filter((a) => got[a.id]).length;
    el.innerHTML = `<div class="panel"><h2>Stats & achievements</h2>
      <table>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>
      <h3>Achievements ${n}/${ACHIEVEMENTS.length}</h3>
      <div class="ach">${ACHIEVEMENTS.map((a) => `<div class="${got[a.id] ? 'on' : ''}"><b>${got[a.id] ? '🏆' : '🔒'} ${a.name}</b><small>${a.desc}</small></div>`).join('')}</div>
      <button class="primary" data-close>Close</button></div>`;
  }

  const api = {
    ACHIEVEMENTS,
    get unlocked() { return ACHIEVEMENTS.filter((a) => got[a.id]); },
    show() { render(); el.hidden = false; },
    get open() { return !el.hidden; },
    close() { el.hidden = true; },
    event(name, value = true) { if (typeof value === 'number') s.ev[name] = (s.ev[name] || 0) + value; else s.ev[name] = value; },
    crash() { s.crashes++; },
    ride(kind) { s.rides[kind] = true; },
    // per frame
    update(dt, { mode, speed, onGround, night, storm, riding }) {
      s.time += dt;
      const d = speed * dt;
      if (riding) { s.dist.ride += d; s.top.ride = Math.max(s.top.ride, speed); }
      else {
        s.dist[mode] = (s.dist[mode] || 0) + d;
        if (mode === 'car') { s.top.car = Math.max(s.top.car, speed); if (night) s.night += d; if (storm) s.storm += d; }
        if (mode === 'plane') s.top.plane = Math.max(s.top.plane, speed);
        // airtime: the car off the ground
        if (mode === 'car' && !onGround && speed > 5) air += dt;
        else { if (air > 1) { s.jumps++; if (air > s.airBest) { s.airBest = air; if (air > 1.5) toast(`Airtime ${air.toFixed(1)} s · best!`); } } air = 0; }
      }
      checkT -= dt;
      if (checkT <= 0) {
        checkT = 2;
        for (const a of ACHIEVEMENTS) if (!got[a.id]) { let ok = false; try { ok = a.test(s, { ...ctx, settings }); } catch { /* not ready */ } if (ok) { got[a.id] = Date.now(); toast(`🏆 Achievement: ${a.name}`); saveSettings(); ctx.onUnlock && ctx.onUnlock(a); } }
      }
      saveT += dt; if (saveT > 15) { saveT = 0; saveSettings(); }
    },
  };
  return api;
}
