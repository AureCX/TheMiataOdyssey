// Rear-view mirror: a strip at the top of the screen showing the road behind, rendered from just behind the car into
// a small render target (every other frame, shadows reused from the main pass) and drawn back flipped left-right
// like a real mirror, inside a rounded frame. Key 8 toggles it.
import * as THREE from 'three';

export function createMirror(renderer, scene) {
  const W = 512, H = 128;
  const rt = new THREE.WebGLRenderTarget(W, H, { samples: 2 });
  const cam = new THREE.PerspectiveCamera(48, W / H, 0.3, 1500);
  const tex = rt.texture; tex.repeat.set(-1, 1); tex.offset.set(1, 0);
  const quadScene = new THREE.Scene(), ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex })));
  const frame = document.createElement('div');
  frame.style.cssText = 'position:fixed;left:50%;top:calc(10px + env(safe-area-inset-top,0px));transform:translateX(-50%);width:min(380px,34vw);aspect-ratio:4/1;border-radius:14px;border:3px solid #15171a;box-shadow:0 4px 14px rgba(0,0,0,.5);pointer-events:none;z-index:5;display:none';
  document.body.appendChild(frame);
  let on = true, odd = false;
  const P = new THREE.Vector3(), D = new THREE.Vector3(), size = new THREE.Vector2();
  return {
    get on() { return on; },
    toggle() { on = !on; return on; },
    // after the main frame: draw the mirror if it should show (car-like vehicles only)
    render(show, pos, q) {
      const vis = on && show; frame.style.display = vis ? 'block' : 'none';
      if (!vis) return;
      odd = !odd;
      if (odd) {
        P.set(0, 1.25, -2.4).applyQuaternion(q).add(pos); D.set(0, 1.05, -30).applyQuaternion(q).add(pos);
        cam.position.copy(P); cam.up.set(0, 1, 0); cam.lookAt(D);
        const su = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
        renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
        renderer.shadowMap.autoUpdate = su;
      }
      // composite into the frame's rectangle
      const r = frame.getBoundingClientRect(); renderer.getSize(size);
      const x = r.left + 3, y = size.y - r.bottom + 3, w = r.width - 6, h = r.height - 6;
      const ac = renderer.autoClear; renderer.autoClear = false;
      renderer.setScissorTest(true); renderer.setScissor(x, y, w, h); renderer.setViewport(x, y, w, h);
      renderer.render(quadScene, ortho);
      renderer.setScissorTest(false); renderer.setViewport(0, 0, size.x, size.y); renderer.autoClear = ac;
    },
  };
}
