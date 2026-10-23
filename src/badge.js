// The MX-5 Odyssey badge: a round emblem drawn on a canvas, used for the car decals and the photo sticker.
export function badgeCanvas(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), m = size / 2;
  g.fillStyle = '#111'; g.beginPath(); g.arc(m, m, m - 2, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#c8102e'; g.lineWidth = size * 0.05; g.beginPath(); g.arc(m, m, m * 0.84, 0, Math.PI * 2); g.stroke();
  // a little roadster silhouette
  g.fillStyle = '#f2f2f2'; g.beginPath(); g.moveTo(m * 0.42, m * 1.02); g.lineTo(m * 0.55, m * 0.86); g.lineTo(m * 0.95, m * 0.82); g.lineTo(m * 1.08, m * 0.7); g.lineTo(m * 1.22, m * 0.82); g.lineTo(m * 1.58, m * 0.88); g.lineTo(m * 1.6, m * 1.02); g.closePath(); g.fill();
  g.fillStyle = '#111'; for (const x of [0.66, 1.36]) { g.beginPath(); g.arc(m * x, m * 1.03, m * 0.11, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#f2f2f2'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${Math.round(size * 0.15)}px "Barlow Condensed", Arial`; g.fillText('MX-5', m, m * 0.5);
  g.font = `600 ${Math.round(size * 0.1)}px "Barlow Condensed", Arial`; g.fillText('ODYSSEY', m, m * 1.42);
  return c;
}
