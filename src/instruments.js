// Cockpit instruments for the plane kit (attitude with ILS bars, altimeter, HSI with a runway 36 localizer, vertical
// speed) and a holographic HUD for the mech (heading tape, reticle, jet fuel, leg status, target boxes).
import * as THREE from 'three';

const D = Math.PI / 180;
const FONT = (px, w = 600) => `${w} ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;

export function createInstruments({ panel, hud, airport }) {
  const pc = panel.getContext('2d'), hc = hud.getContext('2d');
  const f = new THREE.Vector3(), u = new THREE.Vector3(), r = new THREE.Vector3(), tmp = new THREE.Vector3();
  let vsSmooth = 0;

  function attitude(q) {
    f.set(0, 0, 1).applyQuaternion(q); u.set(0, 1, 0).applyQuaternion(q); r.set(-1, 0, 0).applyQuaternion(q);
    const pitch = Math.asin(Math.max(-1, Math.min(1, f.y)));
    const roll = Math.atan2(-r.y, u.y);
    const hdg = (Math.atan2(f.x, -f.z) / D + 360) % 360;
    return { pitch, roll, hdg };
  }

  // ILS for runway 36: localizer at the far (north) end, glideslope beside the touchdown zone
  function ils(pos, hdg) {
    const A = airport, gsZ = A.zS - 320;
    const along = pos.z - A.zN, dx = pos.x - A.x;
    const hdgOff = Math.abs(((hdg - 360 + 540) % 360) - 180);
    if (along < 300 || along > 18000 || Math.abs(dx) > 4000 || hdgOff > 100) return null;
    const loc = Math.atan2(dx, along) / D;                       // + = right of the centreline
    const gs = Math.atan2(pos.y - A.h, Math.max(1, pos.z - gsZ)) / D - 3;   // + = above the slope
    return { loc, gs, dme: Math.hypot(dx, pos.z - A.zS) / 1852 };
  }

  const bezel = (c, x, y, R) => {
    c.fillStyle = '#121316'; c.beginPath(); c.arc(x, y, R + 8, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 2; c.stroke();
  };

  function adi(c, x, y, R, att, ilsD) {
    bezel(c, x, y, R);
    c.save(); c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.clip();
    c.translate(x, y); c.rotate(-att.roll);
    const ppd = R / 28;                                           // pixels per degree of pitch
    const off = att.pitch / D * ppd;
    c.fillStyle = '#2f7fd0'; c.fillRect(-R * 2, -R * 3 + off, R * 4, R * 3);
    c.fillStyle = '#7a4a24'; c.fillRect(-R * 2, off, R * 4, R * 3);
    c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(-R * 2, off); c.lineTo(R * 2, off); c.stroke();
    c.fillStyle = '#fff'; c.font = FONT(R * 0.13); c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let p = -30; p <= 30; p += 5) {
      if (!p) continue;
      const yy = off - p * ppd, w = p % 10 ? R * 0.18 : R * 0.36;
      c.beginPath(); c.moveTo(-w, yy); c.lineTo(w, yy); c.stroke();
      if (!(p % 10)) { c.fillText(Math.abs(p), -w - R * 0.13, yy); c.fillText(Math.abs(p), w + R * 0.13, yy); }
    }
    c.restore();
    // bank scale and pointer
    c.strokeStyle = '#fff'; c.lineWidth = 2;
    for (const b of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const a = -Math.PI / 2 + b * D, l = b % 30 ? R * 0.07 : R * 0.13;
      c.beginPath(); c.moveTo(x + Math.cos(a) * R, y + Math.sin(a) * R); c.lineTo(x + Math.cos(a) * (R - l), y + Math.sin(a) * (R - l)); c.stroke();
    }
    const pa = -Math.PI / 2 - att.roll;
    c.fillStyle = '#ffb000'; c.beginPath();
    c.moveTo(x + Math.cos(pa) * (R - R * 0.15), y + Math.sin(pa) * (R - R * 0.15));
    c.lineTo(x + Math.cos(pa + 0.07) * (R - R * 0.28), y + Math.sin(pa + 0.07) * (R - R * 0.28));
    c.lineTo(x + Math.cos(pa - 0.07) * (R - R * 0.28), y + Math.sin(pa - 0.07) * (R - R * 0.28)); c.fill();
    // aircraft symbol
    c.strokeStyle = '#ffb000'; c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - R * 0.55, y); c.lineTo(x - R * 0.2, y); c.lineTo(x - R * 0.1, y + R * 0.1); c.moveTo(x + R * 0.55, y); c.lineTo(x + R * 0.2, y); c.lineTo(x + R * 0.1, y + R * 0.1); c.stroke();
    c.fillStyle = '#ffb000'; c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill();
    // ILS deviation diamonds: localizer along the bottom, glideslope down the right side
    if (ilsD) {
      c.fillStyle = 'rgba(255,255,255,0.8)';
      for (let k = -2; k <= 2; k++) { if (!k) continue; c.beginPath(); c.arc(x + k * R * 0.22, y + R * 0.82, 3, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(x + R * 0.82, y + k * R * 0.22, 3, 0, Math.PI * 2); c.fill(); }
      const lx = x - Math.max(-1, Math.min(1, ilsD.loc / 2.5)) * R * 0.44, gy = y + Math.max(-1, Math.min(1, ilsD.gs / 0.7)) * R * 0.44;
      const dia = (px, py) => { c.beginPath(); c.moveTo(px, py - 9); c.lineTo(px + 7, py); c.lineTo(px, py + 9); c.lineTo(px - 7, py); c.closePath(); c.fill(); };
      c.fillStyle = '#ff3df2'; dia(lx, y + R * 0.82); dia(x + R * 0.82, gy);
    }
  }

  function altimeter(c, x, y, R, altM, agl) {
    bezel(c, x, y, R);
    const ft = altM * 3.281;
    c.strokeStyle = '#eee'; c.fillStyle = '#eee'; c.font = FONT(R * 0.2); c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let k = 0; k < 50; k++) { const a = -Math.PI / 2 + k / 50 * Math.PI * 2, l = k % 5 ? R * 0.07 : R * 0.15; c.lineWidth = k % 5 ? 1.5 : 3; c.beginPath(); c.moveTo(x + Math.cos(a) * R, y + Math.sin(a) * R); c.lineTo(x + Math.cos(a) * (R - l), y + Math.sin(a) * (R - l)); c.stroke(); }
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k / 10 * Math.PI * 2; c.fillText(k, x + Math.cos(a) * R * 0.7, y + Math.sin(a) * R * 0.7); }
    const hand = (v, len, w, col) => { const a = -Math.PI / 2 + v * Math.PI * 2; c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); c.stroke(); };
    hand((ft % 10000) / 10000, R * 0.45, 7, '#ccc');
    hand((ft % 1000) / 1000, R * 0.85, 4, '#fff');
    c.fillStyle = '#000'; c.fillRect(x - R * 0.42, y + R * 0.22, R * 0.84, R * 0.3);
    c.fillStyle = '#fff'; c.font = FONT(R * 0.24, 700); c.fillText(`${Math.round(ft / 10) * 10}`, x, y + R * 0.37);
    c.fillStyle = '#9aa'; c.font = FONT(R * 0.13); c.fillText('ALT FT', x, y - R * 0.3);
    if (agl < 760) { c.fillStyle = agl < 60 ? '#ffb000' : '#7fe08a'; c.font = FONT(R * 0.15, 700); c.fillText(`RA ${Math.round(agl * 3.281)}`, x, y + R * 0.66); }
    c.fillStyle = '#222'; c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill();
  }

  function hsi(c, x, y, R, att, ilsD) {
    bezel(c, x, y, R);
    c.save(); c.translate(x, y); c.rotate(-att.hdg * D);
    c.strokeStyle = '#eee'; c.fillStyle = '#eee'; c.font = FONT(R * 0.16, 700); c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let k = 0; k < 72; k++) { const a = k * 5 * D - Math.PI / 2, l = k % 2 ? R * 0.06 : R * 0.12; c.lineWidth = k % 2 ? 1.5 : 2.5; c.beginPath(); c.moveTo(Math.cos(a) * R, Math.sin(a) * R); c.lineTo(Math.cos(a) * (R - l), Math.sin(a) * (R - l)); c.stroke(); }
    for (let k = 0; k < 12; k++) {
      const a = k * 30 * D; c.save(); c.rotate(a); c.translate(0, -R * 0.74);
      c.fillText(['N', '3', '6', 'E', '12', '15', 'S', '21', '24', 'W', '30', '33'][k], 0, 0); c.restore();
    }
    // course 360 (runway 36): arrow, with the deviation bar offset by the localizer
    c.strokeStyle = '#ff3df2'; c.fillStyle = '#ff3df2'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(0, -R * 0.62); c.lineTo(0, -R * 0.3); c.moveTo(0, R * 0.3); c.lineTo(0, R * 0.62); c.stroke();
    c.beginPath(); c.moveTo(0, -R * 0.66); c.lineTo(-8, -R * 0.52); c.lineTo(8, -R * 0.52); c.fill();
    for (let k = -2; k <= 2; k++) if (k) { c.beginPath(); c.arc(k * R * 0.14, 0, 3, 0, Math.PI * 2); c.fill(); }
    if (ilsD) { const dx = -Math.max(-1, Math.min(1, ilsD.loc / 2.5)) * R * 0.28; c.lineWidth = 5; c.beginPath(); c.moveTo(dx, -R * 0.28); c.lineTo(dx, R * 0.28); c.stroke(); }
    c.restore();
    // lubber line and plane
    c.fillStyle = '#ffb000'; c.beginPath(); c.moveTo(x, y - R - 2); c.lineTo(x - 8, y - R - 14); c.lineTo(x + 8, y - R - 14); c.fill();
    c.strokeStyle = '#ffb000'; c.lineWidth = 4; c.beginPath(); c.moveTo(x - R * 0.2, y); c.lineTo(x + R * 0.2, y); c.moveTo(x, y - R * 0.18); c.lineTo(x, y + R * 0.2); c.moveTo(x - R * 0.08, y + R * 0.16); c.lineTo(x + R * 0.08, y + R * 0.16); c.stroke();
    c.fillStyle = '#000'; c.fillRect(x - R * 0.24, y - R - 2 - R * 0.36, R * 0.48, R * 0.22);
    c.fillStyle = '#fff'; c.font = FONT(R * 0.19, 700); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(Math.round(att.hdg) % 360).padStart(3, '0'), x, y - R - 2 - R * 0.25);
    c.font = FONT(R * 0.13, 600); c.fillStyle = ilsD ? '#ff3df2' : '#777';
    c.fillText(ilsD ? `ILS 36 PIL · ${ilsD.dme.toFixed(1)} NM` : 'ILS 36 PIL · no signal', x, y + R + 22);
  }

  function vsi(c, x, y, R, vs) {
    bezel(c, x, y, R);
    const fpm = vs * 196.85, a0 = Math.PI, span = Math.PI * 0.85;
    const ang = (v) => a0 + Math.max(-1, Math.min(1, v / 2000)) * span;
    c.strokeStyle = '#eee'; c.fillStyle = '#eee'; c.font = FONT(R * 0.17); c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let v = -2000; v <= 2000; v += 250) { const a = ang(v), l = v % 1000 ? R * 0.08 : R * 0.16; c.lineWidth = v % 1000 ? 1.5 : 3; c.beginPath(); c.moveTo(x + Math.cos(a) * R, y + Math.sin(a) * R); c.lineTo(x + Math.cos(a) * (R - l), y + Math.sin(a) * (R - l)); c.stroke(); if (!(v % 1000)) c.fillText(Math.abs(v / 1000), x + Math.cos(a) * R * 0.7, y + Math.sin(a) * R * 0.7); }
    c.fillStyle = '#9aa'; c.font = FONT(R * 0.13); c.fillText('VERT SPEED', x + R * 0.1, y - R * 0.3); c.fillText('×1000 FPM', x + R * 0.1, y + R * 0.3);
    const a = ang(fpm); c.strokeStyle = '#fff'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * R * 0.85, y + Math.sin(a) * R * 0.85); c.stroke();
    c.fillStyle = '#222'; c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill();
  }

  return {
    // plane panel: q attitude, pos, vel, agl (m)
    drawPlane(q, pos, vel, agl, dt, wind) {
      const W = panel.width, H = panel.height, R = H * 0.36;
      pc.clearRect(0, 0, W, H);
      const att = attitude(q);
      vsSmooth += (vel.y - vsSmooth) * Math.min(1, dt * 4);
      const ilsD = ils(pos, att.hdg);
      const xs = [W * 0.125, W * 0.375, W * 0.625, W * 0.875], yy = H * 0.45;
      adi(pc, xs[0], yy, R, att, ilsD); altimeter(pc, xs[1], yy, R, pos.y, agl); hsi(pc, xs[2], yy, R, att, ilsD); vsi(pc, xs[3], yy, R, vsSmooth);
      // wind: an arrow on the HSI (relative to the nose) and the reading under it
      if (wind) {
        const spd = Math.hypot(wind.x, wind.z);
        if (spd > 0.5) {
          const from = ((Math.atan2(-wind.x, wind.z) * 180 / Math.PI) + 360) % 360, rel = (Math.atan2(wind.x, -wind.z) * 180 / Math.PI - att.hdg) * Math.PI / 180;
          pc.save(); pc.translate(xs[2] - R * 0.78, yy - R * 0.78); pc.rotate(rel); pc.strokeStyle = '#7fd4ff'; pc.fillStyle = '#7fd4ff'; pc.lineWidth = 2;
          pc.beginPath(); pc.moveTo(0, R * 0.16); pc.lineTo(0, -R * 0.16); pc.stroke(); pc.beginPath(); pc.moveTo(0, -R * 0.2); pc.lineTo(-R * 0.07, -R * 0.08); pc.lineTo(R * 0.07, -R * 0.08); pc.fill(); pc.restore();
          pc.fillStyle = '#7fd4ff'; pc.font = `600 ${Math.round(R * 0.2)}px "Barlow Condensed", Arial`; pc.textAlign = 'center';
          pc.fillText(`WIND ${String(Math.round(from / 10) * 10 || 360).padStart(3, '0')}/${Math.round(spd * 1.94)}KT`, xs[2], H * 0.97);
        }
      }
      return ilsD;
    },
    // mech HUD over the whole view. st: { q, pos, u, fuel (0..1), jet, limp, punch, targets: [{x,y,z,label}] }, cam
    drawMech(st, cam) {
      const W = hud.width = hud.clientWidth * Math.min(2, devicePixelRatio || 1), H = hud.height = hud.clientHeight * Math.min(2, devicePixelRatio || 1);
      const s = Math.min(W, H) / 900;
      hc.clearRect(0, 0, W, H);
      const G = 'rgba(120,255,190,', line = (a) => `${G}${a})`;
      hc.strokeStyle = line(0.75); hc.fillStyle = line(0.85); hc.lineWidth = 2 * s; hc.font = FONT(20 * s); hc.textAlign = 'center'; hc.textBaseline = 'middle';
      // frame corners
      const m = 40 * s, L = 70 * s;
      for (const [x, y, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) { hc.beginPath(); hc.moveTo(x + dx * L, y); hc.lineTo(x, y); hc.lineTo(x, y + dy * L); hc.stroke(); }
      // heading tape
      const att = attitude(st.q), cx = W / 2, ty = 86 * s;
      hc.save(); hc.beginPath(); hc.rect(cx - 260 * s, ty - 30 * s, 520 * s, 60 * s); hc.clip();
      for (let d = -60; d <= 60; d += 5) {
        const h = Math.round(att.hdg / 5) * 5 + d, x = cx + (h - att.hdg) * 4.2 * s, hh = ((h % 360) + 360) % 360;
        hc.beginPath(); hc.moveTo(x, ty + 12 * s); hc.lineTo(x, ty + (hh % 15 ? 4 : -4) * s); hc.stroke();
        if (!(hh % 30)) hc.fillText(hh === 0 ? 'N' : hh === 90 ? 'E' : hh === 180 ? 'S' : hh === 270 ? 'W' : String(hh), x, ty - 16 * s);
      }
      hc.restore();
      hc.beginPath(); hc.moveTo(cx, ty + 16 * s); hc.lineTo(cx - 7 * s, ty + 28 * s); hc.lineTo(cx + 7 * s, ty + 28 * s); hc.closePath(); hc.fill();
      // reticle
      const cy = H / 2;
      hc.beginPath(); hc.arc(cx, cy, 34 * s, 0, Math.PI * 2); hc.stroke();
      for (const a of [0, 90, 180, 270]) { const r0 = 22 * s, r1 = 46 * s, c0 = Math.cos(a * D), s0 = Math.sin(a * D); hc.beginPath(); hc.moveTo(cx + c0 * r0, cy + s0 * r0); hc.lineTo(cx + c0 * r1, cy + s0 * r1); hc.stroke(); }
      hc.beginPath(); hc.arc(cx, cy, 2.5 * s, 0, Math.PI * 2); hc.fill();
      // bars: jet fuel (left) and speed (right)
      const bar = (x, frac, label, warn) => {
        const h = 220 * s, y0 = cy - h / 2;
        hc.strokeRect(x - 9 * s, y0, 18 * s, h);
        hc.fillStyle = warn ? 'rgba(255,170,60,0.9)' : line(0.6); hc.fillRect(x - 6 * s, y0 + h * (1 - frac) + 3 * s, 12 * s, Math.max(0, h * frac - 6 * s));
        hc.fillStyle = line(0.85); hc.fillText(label, x, y0 + h + 22 * s);
      };
      bar(cx - 300 * s, st.fuel, 'JETS', st.fuel < 0.25);
      bar(cx + 300 * s, Math.min(1, Math.abs(st.u) / 7), `${(Math.abs(st.u) * 3.6).toFixed(0)} KM/H`, false);
      // status block
      hc.textAlign = 'left'; hc.font = FONT(19 * s);
      const legs = Math.round((1 - st.limp) * 100);
      const rows = [['SYS', 'ONLINE'], ['LEGS', `${legs}%`], ['ALT', `${st.agl.toFixed(1)} M`], ['JET', st.jet ? 'FIRING' : 'READY']];
      rows.forEach(([k, v], i) => { hc.fillStyle = line(0.6); hc.fillText(k, m + 14 * s, H - m - 130 * s + i * 26 * s); hc.fillStyle = k === 'LEGS' && legs < 60 ? 'rgba(255,170,60,0.95)' : line(0.95); hc.fillText(v, m + 80 * s, H - m - 130 * s + i * 26 * s); });
      hc.textAlign = 'center';
      // targets: boxes around what the fist can reach, labels on the rest
      for (const t of st.targets) {
        tmp.set(t.x, t.y, t.z).project(cam);
        if (tmp.z > 1 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1) continue;
        const x = (tmp.x + 1) / 2 * W, y = (1 - tmp.y) / 2 * H, b = Math.max(18, 260 / Math.max(2, t.d)) * s;
        const hit = t.d < 3.8;
        hc.strokeStyle = hit ? 'rgba(255,90,70,0.95)' : line(0.7); hc.lineWidth = (hit ? 3 : 2) * s;
        const k = b * 0.35;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { hc.beginPath(); hc.moveTo(x + sx * b, y + sy * (b - k)); hc.lineTo(x + sx * b, y + sy * b); hc.lineTo(x + sx * (b - k), y + sy * b); hc.stroke(); }
        hc.fillStyle = hit ? 'rgba(255,90,70,0.95)' : line(0.85); hc.font = FONT(16 * s);
        hc.fillText(hit ? `${t.label} · PUNCH [F]` : `${t.label} · ${t.d.toFixed(0)} M`, x, y + b + 14 * s);
      }
      hc.strokeStyle = line(0.75); hc.lineWidth = 2 * s;
    },
    clearMech() { hc.clearRect(0, 0, hud.width, hud.height); },
  };
}
