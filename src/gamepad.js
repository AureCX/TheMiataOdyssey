// Gamepad support (standard mapping: Xbox / PlayStation layouts in Chrome, Edge, Firefox).
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
export const PAD = B;

const dz = (v, d = 0.12) => (Math.abs(v) < d ? 0 : Math.sign(v) * (Math.abs(v) - d) / (1 - d));

export function createGamepad(onConnect) {
  let prev = [], index = -1;
  window.addEventListener('gamepadconnected', (e) => { index = e.gamepad.index; onConnect && onConnect(e.gamepad.id, true); });
  window.addEventListener('gamepaddisconnected', (e) => { if (e.gamepad.index === index) index = -1; onConnect && onConnect(e.gamepad.id, false); });
  const state = { connected: false, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, held: new Set(), pressed: new Set() };
  return {
    state,
    poll() {
      state.pressed.clear(); state.held.clear();
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let gp = index >= 0 ? pads[index] : null;
      if (!gp) for (const p of pads) if (p && p.connected) { gp = p; index = p.index; break; }
      state.connected = !!gp;
      if (!gp) { prev = []; return state; }
      const ax = gp.axes;
      // steering gets a gentle response curve for fine control around centre
      const curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.5);
      state.lx = curve(dz(ax[0] || 0)); state.ly = dz(ax[1] || 0);
      state.rx = dz(ax[2] || 0); state.ry = dz(ax[3] || 0);
      const val = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
      state.lt = val(B.LT); state.rt = val(B.RT);
      gp.buttons.forEach((b, i) => {
        if (b.pressed) { state.held.add(i); if (!prev[i]) state.pressed.add(i); }
      });
      prev = gp.buttons.map((b) => b.pressed);
      return state;
    },
  };
}
