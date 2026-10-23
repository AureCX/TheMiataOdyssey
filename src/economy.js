// Money, upgrades and the garage. Cash comes from missions, jobs, races and passenger flights; it is spent in the
// garages (one in Fairfield, Mesa and Port Ruby) on tuning parts, nitro and repairs. Everything persists with the
// other settings.

export const UPGRADES = [
  { id: 'engine', name: 'Engine', levels: [{ name: 'Stage 1 · intake & exhaust', cost: 1500 }, { name: 'Stage 2 · cams & map', cost: 4000 }, { name: 'Stage 3 · built 1.8', cost: 9000 }] },
  { id: 'turbo', name: 'Turbo', levels: [{ name: 'Bolt-on turbo kit', cost: 6500 }] },
  { id: 'tyres', name: 'Tyres', levels: [{ name: 'Sport compound', cost: 1200 }, { name: 'Semi-slicks', cost: 3500 }] },
  { id: 'brakes', name: 'Brakes', levels: [{ name: 'Sport pads & lines', cost: 900 }, { name: 'Big brake kit', cost: 2800 }] },
  { id: 'suspension', name: 'Suspension', levels: [{ name: 'Sport springs', cost: 1400 }, { name: 'Coilovers', cost: 3600 }] },
  { id: 'weight', name: 'Weight', levels: [{ name: 'Stripped interior (−40 kg)', cost: 1000 }, { name: 'Carbon panels (−85 kg)', cost: 3000 }] },
  { id: 'nitro', name: 'Nitro', levels: [{ name: 'Nitrous kit (Z to fire)', cost: 5000 }] },
];

export function createEconomy({ settings, saveSettings, toast, veh }) {
  const e = settings.econ || (settings.econ = { cash: 2500, up: {}, earned: 0 });
  const lvl = (id) => e.up[id] || 0;
  const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');
  let nitro = 1, nitroOn = 0;

  // the tuned car: power, grip, brakes, springs, weight
  function apply() {
    const P = [1, 1.12, 1.25, 1.4][lvl('engine')] * (lvl('turbo') ? 1.3 : 1);
    veh.tune = { power: P, grip: [1, 1.08, 1.16][lvl('tyres')], brake: [1, 1.25, 1.5][lvl('brakes')] };
    veh.k = 26000 * [1, 1.25, 1.5][lvl('suspension')]; veh.c = 2300 * [1, 1.2, 1.4][lvl('suspension')];
    veh.baseMass = 1030 - [0, 40, 85][lvl('weight')]; veh.updateMassProps();
  }
  apply();

  const api = {
    get cash() { return e.cash; },
    get earned() { return e.earned || 0; },
    fmt, level: lvl,
    earn(amount, why) {
      amount = Math.round(amount); if (amount <= 0) return;
      e.cash += amount; e.earned += amount; saveSettings();
      if (why) toast(`+${fmt(amount)} · ${why}`);
      api.onChange && api.onChange();
    },
    spend(amount) { if (e.cash < amount) return false; e.cash -= amount; saveSettings(); api.onChange && api.onChange(); return true; },
    fine(amount, why) { e.cash = Math.max(0, e.cash - amount); saveSettings(); toast(`−${fmt(amount)} · ${why}`); api.onChange && api.onChange(); },
    buy(id) {
      const u = UPGRADES.find((x) => x.id === id), l = lvl(id);
      if (!u || l >= u.levels.length) return false;
      if (!api.spend(u.levels[l].cost)) { toast(`Not enough cash for ${u.levels[l].name}`); return false; }
      e.up[id] = l + 1; saveSettings(); apply(); toast(`${u.name}: ${u.levels[l].name} fitted`);
      return true;
    },
    // nitro: N fires a 3 s shot; it refills over ~20 s
    nitro(dt, firing) {
      if (!lvl('nitro')) { veh.nitro = 0; return -1; }
      if (firing && nitro > 0.05) { nitroOn = 1; nitro = Math.max(0, nitro - dt / 3); } else { nitroOn = 0; nitro = Math.min(1, nitro + dt / 20); }
      veh.nitro = nitroOn;
      return nitro;
    },
    get nitroLevel() { return lvl('nitro') ? nitro : -1; },
    get nitroOn() { return nitroOn; },
    repairCost() {
      const d = veh.dmg; let c = (1 - d.engine) * 1400;
      for (let i = 0; i < 4; i++) c += (d.lost[i] ? 450 : 0) + (d.loose[i] ? 120 : 0) + Math.abs(d.bend[i]) * 300 + Math.abs(d.toe[i]) * 900;
      for (const w of veh.wheels) c += (1 - w.wear) * 160;
      return Math.round(c / 10) * 10;
    },
  };
  return api;
}

// the garage screen: upgrades, repair, paint and wheels
export function garageUI({ root, econ, onRepair, onPaint, onWheels, onClose, custom }) {
  const el = document.createElement('div'); el.id = 'garageUI'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  root.appendChild(el);
  let name = '';
  function render() {
    const rc = econ.repairCost();
    el.innerHTML = `<div class="panel">
      <h2>${name}</h2>
      <p class="cash">Cash <b>${econ.fmt(econ.cash)}</b></p>
      <div class="list">${UPGRADES.map((u) => {
        const l = econ.level(u.id), next = u.levels[l];
        const pips = u.levels.map((_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('');
        return `<div class="item"><div><b>${u.name}</b><span class="pips">${pips}</span><small>${next ? next.name : 'Fully upgraded'}</small></div>
          ${next ? `<button data-buy="${u.id}" ${econ.cash < next.cost ? 'disabled' : ''}>${econ.fmt(next.cost)}</button>` : '<span class="done">Max</span>'}</div>`;
      }).join('')}</div>
      <div class="item"><div><b>Service & repair</b><small>${rc ? 'Bodywork, wheels, engine and fresh tyres' : 'Nothing to fix'}</small></div><button data-act="repair" ${rc && econ.cash >= rc ? '' : 'disabled'}>${rc ? econ.fmt(rc) : 'OK'}</button></div>
      <div class="item"><div><b>Paint</b><small>Free respray</small></div><div class="swatches">${['#b5121b', '#1d3f7a', '#eeece6', '#0d0d0f', '#e8b923', '#1f4d36', '#a7abb0', '#e5641c', '#6b2d5c'].map((c) => `<button data-paint="${c}" style="background:${c}" aria-label="Paint ${c}"></button>`).join('')}</div></div>
      <div class="item"><div><b>Wheels</b><small>Free</small></div><div class="seg">${['silver', 'gunmetal', 'gold', 'white', 'black'].map((w) => `<button data-wheels="${w}">${w}</button>`).join('')}</div></div>
      ${custom ? (() => { const c = custom.state, own = (k, name, price) => `<div class="item"><div><b>${name}</b><small>${c.owned[k] ? (c[k] ? 'Fitted' : 'In the garage') : 'Not fitted'}</small></div><button data-kit="${k}" ${!c.owned[k] && econ.cash < price ? 'disabled' : ''}>${c.owned[k] ? (c[k] ? 'Remove' : 'Fit') : econ.fmt(price)}</button></div>`;
        const seg = (key, opts, labels) => `<div class="seg">${opts.map((o, i) => `<button data-set="${key}" data-v="${o}" aria-pressed="${String(c[key]) === String(o)}">${labels[i]}</button>`).join('')}</div>`;
        return `<h3>Style</h3>${own('kit', 'Body kit (lip, skirts, diffuser, ducktail)', 1800)}${own('rollbar', 'Roll bar', 600)}${own('hardtop', 'Hardtop', 1500)}
        <div class="item"><div><b>Ride height</b><small>Free</small></div>${seg('height', [-1, 0, 1], ['Low', 'Standard', 'High'])}</div>
        <div class="item"><div><b>Wheel width</b><small>Free</small></div>${seg('width', [0, 1, 2], ['Narrow', 'Standard', 'Wide'])}</div>
        <div class="item"><div><b>Racing stripes</b><small>Free</small></div>${seg('stripes', ['off', 'white', 'black', 'red', 'gold', 'blue'], ['Off', 'White', 'Black', 'Red', 'Gold', 'Blue'])}</div>
        <div class="item"><div><b>Door roundels</b><small>Number ${c.number} · <button data-renumber>new number</button></small></div>${seg('roundel', [false, true], ['Off', 'On'])}</div>
        <div class="item"><div><b>MX-5 Odyssey badges</b><small>Rear fenders</small></div>${seg('logo', [false, true], ['Off', 'On'])}</div>`; })() : ''}
      <button class="primary" data-act="close">Drive out</button>
    </div>`;
  }
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.buy) econ.buy(b.dataset.buy);
    else if (b.dataset.act === 'repair') { const rc = econ.repairCost(); if (econ.spend(rc)) onRepair(); }
    else if (b.dataset.paint) onPaint(b.dataset.paint);
    else if (b.dataset.wheels) onWheels(b.dataset.wheels);
    else if (b.dataset.kit && custom) { if (!custom.buy(b.dataset.kit, econ)) return; }
    else if (b.dataset.set && custom) { const v = b.dataset.v; custom.set(b.dataset.set, v === 'true' ? true : v === 'false' ? false : /^-?\d+$/.test(v) ? +v : v); }
    else if (b.hasAttribute('data-renumber') && custom) custom.set('number', 1 + Math.floor(Math.random() * 98));
    else if (b.dataset.act === 'close') { api.close(); return; }
    render();
  });
  const api = {
    get open() { return !el.hidden; },
    show(n) { name = n; render(); el.hidden = false; const f = el.querySelector('button'); f && f.focus(); },
    close() { if (el.hidden) return; el.hidden = true; onClose && onClose(); },
  };
  return api;
}
