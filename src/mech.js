// Mech mode: a ~3.8 m walking robot kit-bashed from the roadster's own panels (bonnet chest plate, door wings,
// boot-lid hip armour, pop-up shoulder lamps, wheels on shoulders and shins). Each piece flies from where it sits on
// the car to its place on the skeleton while the body folds away; then a procedural gait drives the joints.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const G0 = -0.46;                 // ground in car-root space (root sits at the centre of mass)
const THIGH = 0.95, SHIN = 0.95, FOOT = 0.15;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createMech(mats) {
  const paint = mats.paintPlain;
  const frame = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.45, metalness: 0.65 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0e0f11, roughness: 0.6, metalness: 0.3 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x062a33, emissive: 0x38e8ff, emissiveIntensity: 5, roughness: 0.2 });
  const group = new THREE.Group(); group.name = 'mech'; group.visible = false;
  const pieces = [];
  const bone = (parent, x, y, z) => { const b = new THREE.Group(); b.position.set(x, y, z); parent.add(b); return b; };
  // procedural armour piece; grows out of the pelvis during the transformation window [a, b]
  const box = (parent, w, h, d, mat, x, y, z, a = 0.2, b = 0.8, r = 0.05) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), mat);
    m.castShadow = true; m.receiveShadow = true; parent.add(m);
    pieces.push({ obj: m, bone: parent, end: { p: new THREE.Vector3(x, y, z), q: new THREE.Quaternion(), s: new THREE.Vector3(1, 1, 1) }, src: null, a, b });
    return m;
  };
  const ball = (parent, r, x, y, z, a, b) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), frame); m.castShadow = true; parent.add(m);
    pieces.push({ obj: m, bone: parent, end: { p: new THREE.Vector3(x, y, z), q: new THREE.Quaternion(), s: new THREE.Vector3(1, 1, 1) }, src: null, a, b });
  };

  // ---- skeleton
  const pelvis = bone(group, 0, G0 + 2.05, 0);
  const torso = bone(pelvis, 0, 0.12, 0);
  const neck = bone(torso, 0, 1.38, 0.02);
  const sh = {}, el = {}, hip = {}, knee = {}, ankle = {}, fists = {};
  for (const s of [1, -1]) {
    sh[s] = bone(torso, s * 0.8, 1.12, 0);
    el[s] = bone(sh[s], 0, -0.74, 0);
    hip[s] = bone(pelvis, s * 0.38, -0.08, 0);
    knee[s] = bone(hip[s], 0, -THIGH, 0);
    ankle[s] = bone(knee[s], 0, -SHIN, 0);
  }
  // ---- procedural armour and frame
  box(pelvis, 0.82, 0.34, 0.5, frame, 0, 0, 0, 0.05, 0.45);
  box(torso, 0.62, 0.42, 0.46, frame, 0, 0.25, 0, 0.1, 0.5);               // abdomen
  box(torso, 1.28, 0.95, 0.72, paint, 0, 0.88, -0.02, 0.15, 0.6, 0.09);    // chest
  box(torso, 0.9, 0.5, 0.42, frame, 0, 0.95, -0.42, 0.2, 0.65);            // back pack (jump jets)
  box(neck, 0.18, 0.16, 0.18, frame, 0, 0.05, 0, 0.45, 0.85);
  box(neck, 0.42, 0.38, 0.42, paint, 0, 0.3, 0, 0.5, 0.95, 0.1);           // helmet
  box(neck, 0.34, 0.16, 0.06, black, 0, 0.27, 0.2, 0.55, 0.95, 0.03);       // face
  box(neck, 0.28, 0.045, 0.02, glow, 0, 0.3, 0.235, 0.6, 1.0, 0.01);        // visor
  for (const s of [1, -1]) box(neck, 0.05, 0.22, 0.08, paint, s * 0.2, 0.45, -0.04, 0.6, 0.98, 0.02); // helmet fins
  for (const s of [1, -1]) {
    ball(sh[s], 0.2, 0, 0, 0, 0.3, 0.7);
    box(sh[s], 0.34, 0.66, 0.34, paint, 0, -0.38, 0, 0.3, 0.75);
    ball(el[s], 0.15, 0, 0, 0, 0.35, 0.75);
    box(el[s], 0.32, 0.62, 0.32, frame, 0, -0.34, 0.02, 0.35, 0.8);
    fists[s] = box(el[s], 0.24, 0.24, 0.26, black, 0, -0.74, 0.04, 0.4, 0.85);         // fist
    ball(hip[s], 0.19, 0, 0, 0, 0.1, 0.5);
    box(hip[s], 0.38, 0.8, 0.42, paint, 0, -0.47, 0, 0.12, 0.55);
    ball(knee[s], 0.17, 0, 0, 0.05, 0.15, 0.55);
    box(knee[s], 0.44, 0.82, 0.5, paint, 0, -0.47, -0.02, 0.15, 0.6);
    box(knee[s], 0.3, 0.3, 0.12, frame, 0, -0.1, 0.27, 0.2, 0.62);          // knee guard
    box(ankle[s], 0.42, FOOT, 0.78, frame, 0, -FOOT / 2, 0.12, 0.05, 0.4);   // foot
  }
  // ---- weapons (the same as on the detailed model): the left forearm opens into a cannon, a six-missile pod rises
  // behind the right shoulder
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc4c8cc, roughness: 0.25, metalness: 0.9 });
  const coilMat = new THREE.MeshStandardMaterial({ color: 0x062a33, emissive: 0x38e8ff, emissiveIntensity: 0, roughness: 0.25 });
  const cannon = new THREE.Group(); el[1].add(cannon); cannon.visible = false;
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.5, 18), frame); housing.position.set(0, -0.5, 0.03); cannon.add(housing);
  const barrel = new THREE.Group(); cannon.add(barrel);
  barrel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.85, 16).translate(0, -0.42, 0), chrome));
  barrel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.15, 16).translate(0, -0.86, 0), black));
  for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.024, 8, 22).rotateX(Math.PI / 2), coilMat); c.position.set(0, -0.36 - k * 0.13, 0.03); cannon.add(c); }
  const flashM = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  flashM.position.set(0, -1.0, 0); barrel.add(flashM);
  const pod = new THREE.Group(); torso.add(pod); pod.visible = false;
  pod.add(new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.36, 0.54, 2, 0.05), frame));
  const tubes = [], noseMat = new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.4 });
  for (let i = 0; i < 6; i++) { const x = ((i % 3) - 1) * 0.13, y = i < 3 ? 0.07 : -0.07; const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12).rotateX(Math.PI / 2), black); tb.position.set(x, y, 0.27); pod.add(tb); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 10).rotateX(Math.PI / 2), noseMat); tip.position.set(x, y, 0.29); pod.add(tip); tubes.push({ x, y, tip }); }
  const cover = new THREE.Group(); cover.position.set(0, 0.18, 0.28); pod.add(cover);
  { const c = new THREE.Mesh(new RoundedBoxGeometry(0.48, 0.36, 0.04, 2, 0.015), paint); c.position.set(0, -0.18, 0.01); cover.add(c); }
  let cannonT = 0, cannonOn = false, podT = 0, podOn = false, recoil = 0, flash = 0;
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  const rootInv = new THREE.Matrix4(), m1 = new THREE.Matrix4(), m2 = new THREE.Matrix4();
  const tp = new THREE.Vector3(), tq = new THREE.Quaternion(), ts = new THREE.Vector3();
  let phase = 0, idle = 0, air = 0;

  // Car parts become armour: clones (sharing geometry, so dents carry over) attached to bones.
  // srcObj: the part on the car, whose pose at transformation time is the start of the flight.
  function addKit(srcObj, boneObj, p, q, s, a, b) {
    const c = srcObj.clone(true);
    c.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.visible = true; } });
    c.visible = true;
    boneObj.add(c);
    pieces.push({ obj: c, bone: boneObj, end: { p, q, s: new THREE.Vector3(s, s, s) }, src: srcObj, start: new THREE.Matrix4(), a, b });
  }
  const qx = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
  const qy = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
  const basis = (x, z) => { const X = x.clone().normalize(), Z = z.clone().normalize(); const Y = new THREE.Vector3().crossVectors(Z, X).normalize(); X.crossVectors(Y, Z).normalize(); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z)); };

  return {
    group,
    get eye() { return tp.set(0, 0.3, 0.3).applyMatrix4(neck.matrixWorld).applyMatrix4(rootInv.copy(group.parent.matrixWorld).invert()); },
    // parts from the detailed model (any may be missing)
    setKit({ hood, doors, boot, pods, wheels }) {
      if (hood) addKit(hood, torso, new THREE.Vector3(0, 1.36, 0.36), qx(Math.PI / 2), 0.98, 0.15, 0.72);
      for (const s of [1, -1]) {
        const d = doors && doors[s];
        // door wings: length pointing up, out and back; outer skin facing backwards
        if (d) addKit(d, torso, new THREE.Vector3(s * 0.42, 1.05, -0.4), basis(new THREE.Vector3(0, -0.25, -1).multiplyScalar(s), new THREE.Vector3(-s * 0.62, -0.62, 0.42)), 0.95, 0.25, 0.85);
        const pd = pods && pods[s];
        if (pd) addKit(pd, sh[s], new THREE.Vector3(s * 0.02, 0.16, 0.04), new THREE.Quaternion(), 1.1, 0.35, 0.9);
        const wf = wheels && wheels[s === 1 ? 0 : 1], wr = wheels && wheels[s === 1 ? 2 : 3];
        if (wf) addKit(wf, sh[s], new THREE.Vector3(s * 0.3, -0.05, 0), new THREE.Quaternion(), 0.8, 0.3, 0.9);
        if (wr) addKit(wr, knee[s], new THREE.Vector3(s * 0.3, -0.45, -0.06), new THREE.Quaternion(), 0.85, 0.1, 0.6);
      }
      if (boot) addKit(boot, pelvis, new THREE.Vector3(0, 0.16, 0.3), qx(Math.PI / 2).multiply(qy(Math.PI)), 0.8, 0.2, 0.7);
    },
    // weapons (same API as the detailed model's transformer)
    setCannon(on) { cannonOn = !!on; }, get cannon() { return cannonT; }, setPod(on) { podOn = !!on; }, get pod() { return podT; },
    muzzle(out) { barrel.updateWorldMatrix(true, false); return out.set(0, -0.95, 0).applyMatrix4(barrel.matrixWorld); },
    muzzleDir(out) { barrel.updateWorldMatrix(true, false); return out.set(0, -1, 0).transformDirection(barrel.matrixWorld); },
    fireCannon() { recoil = 1; flash = 1; },
    tube(i, out) { pod.updateWorldMatrix(true, false); return out.set(tubes[i].x, tubes[i].y, 0.32).applyMatrix4(pod.matrixWorld); },
    podDir(out) { pod.updateWorldMatrix(true, false); return out.set(0, 0, 1).transformDirection(pod.matrixWorld); },
    loaded(i, on) { tubes[i].tip.visible = on; },
    // t: transformation 0 (car) .. 1 (mech); motion: { u, yawRate, air, jet }; returns true on a footfall
    update(dt, t, motion) {
      group.visible = t > 0.01;
      if (!group.visible) return false;
      const stand = smooth(0.2, 0.95, t);
      const u = motion.u || 0, amp = Math.min(1.3, Math.abs(u) / 3.2) * stand;
      const prevPhase = phase;
      phase += (u * dt / 1.25) * Math.PI;
      idle += dt;
      air += ((motion.air ? 1 : 0) - air) * Math.min(1, dt * 6);
      const sw = Math.sin(phase), cw = Math.cos(phase);
      // legs: crouched while folding, gait while walking, tucked in the air
      const legs = {};
      for (const s of [1, -1]) {
        const ph = s === 1 ? 0 : Math.PI;
        const swing = Math.sin(phase + ph), lift = Math.max(0, Math.cos(phase + ph));
        let th = -0.5 * amp * swing, tk = 0.12 + 0.75 * amp * lift * lift;
        th = th * (1 - air) - 0.6 * air; tk = tk * (1 - air) + 1.1 * air;
        th = th * stand - 1.25 * (1 - stand); tk = tk * stand + 2.3 * (1 - stand);
        hip[s].rotation.set(th, 0, -s * 0.04);
        knee[s].rotation.x = tk;
        ankle[s].rotation.x = -(th + tk) * 0.9;
        legs[s] = THIGH * Math.cos(th) + SHIN * Math.cos(th + tk) + FOOT;
      }
      // pelvis rides on the longer (stance) leg
      pelvis.position.y = G0 + Math.max(legs[1], legs[-1]) + (air > 0.5 ? 0 : 0.015 * Math.sin(idle * 2) * (1 - amp));
      torso.rotation.set(0.12 * amp + 0.06 * (1 - stand), 0.12 * amp * sw, 0);
      neck.rotation.set(-0.1 * amp, -0.12 * amp * sw - (motion.yawRate || 0) * 0.15, 0);
      for (const s of [1, -1]) {
        const ph = s === 1 ? Math.PI : 0;
        sh[s].rotation.set(0.5 * amp * Math.sin(phase + ph) - 0.5 * air + 0.9 * (1 - stand), 0, s * (0.12 + 0.25 * air + 0.5 * (1 - stand)));
        el[s].rotation.x = -0.35 - 0.35 * amp - 0.9 * (1 - stand);
      }
      // weapons
      { const armed = t > 0.98, k1 = armed && cannonOn ? 1 : 0, k2 = armed && podOn ? 1 : 0;
        cannonT += Math.sign(k1 - cannonT) * Math.min(Math.abs(k1 - cannonT), dt / 0.7); podT += Math.sign(k2 - podT) * Math.min(Math.abs(k2 - podT), dt / 0.6);
        recoil = Math.max(0, recoil - dt * 5); flash = Math.max(0, flash - dt * 9);
        const a = smooth(0, 0.6, cannonT); sh[1].rotation.x += (-Math.PI / 2 + recoil * 0.25 - sh[1].rotation.x) * a; el[1].rotation.x += (-recoil * 0.3 - el[1].rotation.x) * a;
        cannon.visible = cannonT > 0.01; housing.scale.set(smooth(0, 0.3, cannonT), 1, smooth(0, 0.3, cannonT));
        barrel.position.y = -0.2 - 0.34 * smooth(0.35, 1, cannonT) + recoil * 0.12; barrel.scale.setScalar(Math.max(0.01, smooth(0.2, 0.6, cannonT)));
        coilMat.emissiveIntensity = 6 * smooth(0.7, 1, cannonT) + flash * 12; flashM.material.opacity = flash; flashM.scale.setScalar(0.6 + flash * 1.8);
        const up = smooth(0, 0.6, podT); pod.visible = podT > 0.01; pod.position.set(-0.45, 1.05 + 0.75 * up, -0.38 + 0.06 * up); cover.rotation.x = -1.9 * smooth(0.5, 1, podT); }
      // place armour: in flight between the car and the skeleton during the transformation
      group.parent.updateWorldMatrix(true, false);
      group.updateMatrixWorld(true);
      rootInv.copy(group.parent.matrixWorld).invert();
      const early = t <= 0.08;   // the car body hasn't started folding yet: its parts are where they belong
      for (const pc of pieces) {
        const f = smooth(pc.a, pc.b, t);
        if (pc.src && early) { pc.src.updateWorldMatrix(true, false); pc.start.copy(rootInv).multiply(pc.src.matrixWorld); }   // where it sits on the car
        if (f >= 1) { pc.obj.position.copy(pc.end.p); pc.obj.quaternion.copy(pc.end.q); pc.obj.scale.copy(pc.end.s); pc.obj.visible = true; continue; }
        // start pose in the bone's frame
        if (pc.src) m1.copy(rootInv).multiply(pc.bone.matrixWorld).invert().multiply(pc.start);
        else m1.compose(pc.end.p, pc.end.q, ts.set(0.01, 0.01, 0.01));
        m1.decompose(tp, tq, ts);
        // arc the flight upwards a little so pieces don't cut through each other
        pc.obj.position.lerpVectors(tp, pc.end.p, f); pc.obj.position.y += Math.sin(f * Math.PI) * 0.35;
        pc.obj.quaternion.slerpQuaternions(tq, pc.end.q, f);
        pc.obj.scale.lerpVectors(ts, pc.end.s, f);
        pc.obj.visible = f > 0 || !!pc.src;
      }
      if (cannonT > 0) { const k = Math.max(0.01, 1 - smooth(0, 0.4, cannonT)); fists[1].scale.setScalar(k); fists[1].visible = cannonT < 0.39; }
      glow.emissiveIntensity = 5 * stand;
      // footfall each half stride
      return t > 0.98 && !motion.air && Math.abs(u) > 0.6 && Math.floor(prevPhase / Math.PI) !== Math.floor(phase / Math.PI);
    },
  };
}
