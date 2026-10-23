// Flight paths for the AI aircraft, as dense polylines with altitude and speed profiles (no three.js, so it can be
// checked against the terrain offline). The airliner circuit: line up at the south end, take off northbound, climbing
// right-hand turn, downwind southbound east of the river, right-hand base turn over the sea, a 3° final from the south,
// landing roll to the north end, then taxi back down the parallel taxiway to the holding point.

const TAU = Math.PI * 2;

// a turtle that lays down 2D points every ~2 m; headings are atan2(dx, dz) (0 = +z/south, PI = -z/north)
function turtle(x, z, hdg) {
  const pts = [];
  let s = 0;
  const marks = {};
  const push = () => pts.push({ x, z, s });
  push();
  return {
    pts, marks,
    get s() { return s; }, get x() { return x; }, get z() { return z; }, get hdg() { return hdg; },
    mark(name) { marks[name] = s; },
    straight(len) {
      const n = Math.max(1, Math.ceil(len / 2));
      for (let i = 0; i < n; i++) { x += Math.sin(hdg) * len / n; z += Math.cos(hdg) * len / n; s += len / n; push(); }
    },
    // turn by `ang` (positive = to the right, i.e. clockwise seen from above) on radius r
    turn(ang, r) {
      const len = Math.abs(ang) * r, n = Math.max(2, Math.ceil(len / 2)), d = ang / n;
      for (let i = 0; i < n; i++) {
        // right turn: heading decreases (atan2(dx,dz) convention with x right-handed... see note below)
        hdg -= d; x += Math.sin(hdg) * len / n; z += Math.cos(hdg) * len / n; s += len / n; push();
      }
    },
    // drive straight to a point (assumes we're roughly facing it)
    to(px, pz) { hdg = Math.atan2(px - x, pz - z); this.straight(Math.hypot(px - x, pz - z)); },
  };
}
// Note on turn direction: with heading h measured as atan2(dx, dz), facing -z (h = PI) the right-hand side is +x.
// Decreasing h from PI swings the direction toward +x, so `turn(+a)` is a right turn.

function interp(keys, s) {
  if (s <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (s <= keys[i][0]) {
    const [s0, v0] = keys[i - 1], [s1, v1] = keys[i];
    const t = (s - s0) / Math.max(1e-6, s1 - s0);
    return v0 + (v1 - v0) * t;
  }
  return keys[keys.length - 1][1];
}

// AP: { x (runway centreline), zN, zS (runway ends), h (elevation), taxiX }
export function airlinerCircuit(AP) {
  const H = AP.h, GEAR = 2.3;           // origin height above the tarmac with the gear down
  const t = turtle(AP.taxiX, AP.zS - 50, 0);       // holding point on the taxiway, facing south
  t.mark('hold');
  t.straight(18);
  t.turn(-Math.PI / 2, 14);                         // left onto the southern connector (east)
  t.to(AP.x - 14, t.z);                             // along the connector
  t.turn(-Math.PI / 2, 14);                         // left again: lined up, facing north
  t.mark('lineup');
  t.straight(6);
  t.mark('roll');
  t.straight(470); t.mark('lift');
  t.straight(Math.max(50, t.z - (AP.zN + 90))); t.mark('turn1');
  t.turn(Math.PI, 470);                             // climbing right turn to the east
  t.mark('downwind');
  t.straight(Math.max(100, AP.finalZ - t.z)); t.mark('base');
  t.turn(Math.PI, 470); t.mark('final');           // right turn over the sea onto final, facing north
  t.to(AP.x, AP.zS - 40); t.mark('touch');
  t.straight(Math.max(50, t.z - AP.zN - 70)); t.mark('slow');
  t.turn(-Math.PI / 2, 16);                         // left (west) onto the northern connector
  t.to(AP.taxiX + 16, t.z);
  t.turn(-Math.PI / 2, 16);                         // left: south down the taxiway
  t.mark('taxi');
  t.to(AP.taxiX, AP.zS - 50);
  const M = t.marks, L = t.s;
  const CRUISE = H + 260;
  const climbEnd = M.lift + (CRUISE - H) / Math.tan(0.13);
  const finalStartY = H + GEAR + (M.touch - M.final) * Math.tan(0.058);
  const yKeys = [[0, H + GEAR], [M.lift, H + GEAR], [climbEnd, CRUISE], [M.base, CRUISE], [M.final, finalStartY], [M.touch, H + GEAR], [L, H + GEAR]];
  const vKeys = [[0, 8], [M.lineup - 20, 8], [M.lineup, 3], [M.roll, 0], [M.roll + 60, 25], [M.roll + 200, 47], [M.lift, 76], [M.turn1, 88], [M.downwind, 100],
    [M.base, 90], [M.final, 75], [M.touch, 68], [M.slow - 40, 12], [M.slow, 8], [L, 9]];
  const pts = t.pts.map((p) => ({ x: p.x, z: p.z, s: p.s, y: interp(yKeys, p.s), v: interp(vKeys, p.s) }));
  return { pts, L, marks: M, H, GEAR, ground: (s) => s < M.lift || s > M.touch };
}

// a light aircraft's sightseeing loop: a big ellipse over the island with gentle altitude changes
export function scenicLoop(cx, cz, rx, rz, alt, phase = 0) {
  const pts = []; let s = 0, px = null, pz = null;
  const n = 900;
  for (let i = 0; i <= n; i++) {
    const a = phase + i / n * TAU;
    const x = cx + Math.cos(a) * rx, z = cz + Math.sin(a) * rz;
    if (px !== null) s += Math.hypot(x - px, z - pz);
    pts.push({ x, z, s, y: 0, v: 52 });
    px = x; pz = z;
  }
  return { pts, L: s, alt };
}
