// Mech transformation for the detailed model, done the Transformers way: the car's own shell is cut into sections that
// stay connected by hinges and slides, so the car and the robot are two poses of one mechanism.
//   torso  = the cabin (doors, seats, dash, windscreen, top, boot lid); stands up on its tail
//   chest  = the front end (bonnet, wings, front wheels); swings down under the floor and sits into the torso,
//            while the nose (bumper, pop-ups, lamps) tucks in behind it
//   thighs = the rear half split down the middle (rear wheels ride on them)
//   shins  = the tail (lamps, bumper halves), slid out on struts; feet fold out of the bumper
// Arms slide out from behind the opening doors, the doors rise into wings, the boot lid flips onto the back and the
// head rises out of the dashboard. Every joint moves on its own schedule, so it reads as a sequence of mechanisms.
// All positions are car body space (metres, ground y = 0, +z forward, +x = left).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const HIP = new THREE.Vector3(0, 0.4, -0.65);     // torso pivot = hip line (cabin's rear floor)
const KNEE_Z = -1.4, THIGH = 0.75, SHIN0 = 0.64, SLIDE = 0.4, WAIST = 0.5, LEG_AXIS_Y = 0.58, NOSE_Z = 1.42, RECESS = 0.24;
const CHEST_HINGE = new THREE.Vector3(0, 0.3, 0.55);

export function createTransformer(P) {
  const { root, mats } = P;   // root: the car body group everything lives in (realBody)
  const frame = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.45, metalness: 0.65 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0e0f11, roughness: 0.6, metalness: 0.3 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x062a33, emissive: 0x38e8ff, emissiveIntensity: 0, roughness: 0.2 });
  const paint = mats.paintPlain;
  const node = (parent, p) => { const n = new THREE.Group(); n.position.copy(p); parent.add(n); n.updateMatrixWorld(true); return n; };
  const rbox = (w, h, d, mat, r = 0.05) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), mat); m.castShadow = true; m.receiveShadow = true; return m; };
  // "upright" mount: cancels the torso's stand-up pitch, so parts built in robot axes (y up, z forward) end up right
  const upright = (parent, p) => { const n = node(parent, p); n.rotation.x = Math.PI / 2; return n; };

  // ---- joints (car pose = all identity)
  // hips stand the car up on its tail; the torso (cabin) rides above them on a telescoping waist
  const hips = node(root, HIP);
  const torso = node(hips, new THREE.Vector3());
  const chestBase = CHEST_HINGE.clone().sub(HIP);
  const chest = node(torso, chestBase);
  // the nose (bumper, pop-ups, lamps) tucks in behind the chest on its own hinge, just ahead of the pop-ups
  const nose = node(chest, new THREE.Vector3(0, 0, NOSE_Z - CHEST_HINGE.z));
  const thigh = {}, leg = {}, shin = {}, foot = {}, shoulder = {}, elbow = {}, strut = {}, toe = {}, fists = {};
  for (const s of [1, -1]) {
    thigh[s] = node(hips, new THREE.Vector3(s * 0.42, 0, 0));
    // the leg's own axis runs through the middle of the rear bodywork (it twists about this)
    leg[s] = node(thigh[s], new THREE.Vector3(0, LEG_AXIS_Y - HIP.y, 0));
    shin[s] = node(leg[s], new THREE.Vector3(0, 0, KNEE_Z - HIP.z));
    foot[s] = upright(shin[s], new THREE.Vector3(0, 0, -SHIN0));
    shoulder[s] = upright(torso, new THREE.Vector3(s * 0.6, 0.22, 0.95));
    elbow[s] = node(shoulder[s], new THREE.Vector3(0, -0.7, 0));
  }
  const neck = upright(torso, new THREE.Vector3(0, 0.25, 0.85));

  // ---- attach the car's sections (attach() keeps them exactly where they are)
  const put = (n, o) => { if (o) n.attach(o); };
  put(torso, P.chunks.cabin);
  put(chest, P.chunks.front);
  for (const s of [1, -1]) {
    put(leg[s], P.chunks['thigh' + (s > 0 ? 'L' : 'R')]);
    put(shin[s], P.chunks['shin' + (s > 0 ? 'L' : 'R')]);
    put(shin[s], P.bumperRear[s]);
    put(shin[s], P.tails[s]);
    put(torso, P.doors[s] && P.doors[s].grp);
  }
  for (const o of P.toTorso) put(torso, o);
  for (const o of P.toChest) put(chest, o);
  put(nose, P.chunks.nose);
  for (const o of P.toNose) put(nose, o);
  // wheels: stand-ins on the sections (the real wheels hide while transformed)
  const wheelClones = [];
  P.wheelNodes.forEach((wn, i) => {
    if (!wn) return;
    const c = wn.clone(true); c.visible = false;
    c.position.set((i % 2 === 0 ? 1 : -1) * 0.705, 0.29, i < 2 ? 1.1325 : -1.1325);
    root.add(c); (i < 2 ? chest : leg[i % 2 === 0 ? 1 : -1]).attach(c);
    c.userData.x0 = c.position.x; c.userData.front = i < 2;
    wheelClones.push(c);
  });

  // underbody shells and arch liners in the legs are inner structure: they tuck away as the legs twist
  const legInner = [];
  for (const k of ['thighL', 'thighR', 'shinL', 'shinR']) if (P.chunks[k]) for (const m of P.chunks[k].children) if (m.isMesh && /black|interior/.test(m.userData.matName || '')) legInner.push(m);

  // ---- mechanisms revealed by the transformation (hidden inside the car while it's a car)
  const hidden = [];
  const add = (parent, mesh, p, show) => { mesh.position.copy(p); parent.add(mesh); mesh.visible = false; hidden.push({ mesh, show }); return mesh; };
  // pelvis block between the split thighs, and the waist spine the torso slides up on
  add(hips, rbox(0.56, 0.4, 0.46, frame), new THREE.Vector3(0, 0.15, -0.12), 0.2);
  const spine = add(hips, new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1, 14).rotateX(Math.PI / 2).translate(0, 0, 0.5), mats.chrome), new THREE.Vector3(0, 0.25, 0), 0.25);
  for (const s of [1, -1]) add(hips, new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), frame), new THREE.Vector3(s * 0.42, 0.15, -0.05), 0.25);
  for (const s of [1, -1]) {
    // knee struts: telescoping tubes that the shins slide out on
    strut[s] = add(leg[s], new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 14).rotateX(Math.PI / 2).translate(0, 0, -0.5), mats.chrome), new THREE.Vector3(0, 0, KNEE_Z - HIP.z + 0.15), 0.3);
    add(leg[s], new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), frame), new THREE.Vector3(0, 0, KNEE_Z - HIP.z), 0.3);
    // upper-leg frame from the hip ball to the knee, and a shin core the tail bodywork is mounted on
    add(leg[s], rbox(0.3, 0.3, 0.8, frame, 0.05), new THREE.Vector3(0, 0, -0.4), 0.3);
    add(shin[s], rbox(0.36, 0.36, SHIN0 - 0.1, frame, 0.05), new THREE.Vector3(0, 0, -SHIN0 / 2 - 0.02), 0.4);
    add(shin[s], new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), frame), new THREE.Vector3(0, 0, -SHIN0 + 0.02), 0.4);
    // thigh armour stowed inside the rear section; shows once the legs have turned
    add(leg[s], rbox(0.42, 0.42, 0.62, paint, 0.06), new THREE.Vector3(0, 0, -0.38), 0.5);
    // feet: toe plates fold out of the bumper halves
    toe[s] = node(foot[s], new THREE.Vector3(0, 0, 0.12));
    add(toe[s], rbox(0.5, 0.18, 0.62, frame), new THREE.Vector3(0, 0.07, 0.08), 0.55);
    add(toe[s], rbox(0.44, 0.12, 0.2, black), new THREE.Vector3(0, 0.04, 0.44), 0.55);
    // arms (built in robot axes on upright mounts): shoulder ball, upper arm, elbow, forearm, fist
    add(shoulder[s], new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), frame), new THREE.Vector3(0, 0, 0), 0.18);
    add(shoulder[s], rbox(0.32, 0.62, 0.34, paint), new THREE.Vector3(0, -0.36, 0), 0.18);
    add(elbow[s], new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), frame), new THREE.Vector3(0, 0, 0), 0.18);
    add(elbow[s], rbox(0.3, 0.6, 0.32, frame), new THREE.Vector3(0, -0.32, 0.02), 0.18);
    fists[s] = add(elbow[s], rbox(0.24, 0.24, 0.26, black), new THREE.Vector3(0, -0.72, 0.04), 0.18);
  }
  // ---- weapons
  // left arm cannon: the fist retracts into the forearm, two armour flaps swing open, the barrel slides out past
  // where the fist was and the energy coils light up. Built on the elbow (the forearm runs down its -y axis).
  const coilMat = new THREE.MeshStandardMaterial({ color: 0x062a33, emissive: 0x38e8ff, emissiveIntensity: 0, roughness: 0.25 });
  const cannon = new THREE.Group(); elbow[1].add(cannon); cannon.visible = false;
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.46, 18), frame); housing.position.set(0, -0.5, 0.03); cannon.add(housing);
  const barrel = new THREE.Group(); cannon.add(barrel);
  barrel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.8, 16).translate(0, -0.4, 0), mats.chrome));
  const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.14, 16).translate(0, -0.82, 0), black); barrel.add(brake);
  for (let k = 0; k < 3; k++) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.025, 0.03).translate(0, -0.8 + k * 0.04, 0), frame); barrel.add(v); }
  const muzzleGlow = new THREE.Mesh(new THREE.CircleGeometry(0.06, 14).rotateX(Math.PI / 2).translate(0, -0.9, 0), coilMat); barrel.add(muzzleGlow);
  for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 8, 22).rotateX(Math.PI / 2), coilMat); c.position.set(0, -0.36 - k * 0.12, 0.03); cannon.add(c); }
  const flaps = [];
  for (const sd of [1, -1]) { const hinge = new THREE.Group(); hinge.position.set(sd * 0.16, -0.3, 0.03); cannon.add(hinge); const f = rbox(0.05, 0.42, 0.3, paint, 0.02); f.position.set(sd * 0.02, -0.21, 0); hinge.add(f); flaps.push({ hinge, sd }); }
  const muzzleFlash = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  muzzleFlash.position.set(0, -0.98, 0); barrel.add(muzzleFlash);
  // missile pod: stowed inside the back behind the right shoulder; it rises above the shoulder, the cover flips up
  // and six missiles (2 x 3) show their noses. Robot axes (y up, z forward) on an upright mount.
  const podMount = upright(torso, new THREE.Vector3(-0.42, 0.42, 0.72));
  const pod = new THREE.Group(); podMount.add(pod); pod.visible = false;
  pod.add(rbox(0.44, 0.34, 0.52, frame, 0.05));
  const podSide = rbox(0.46, 0.2, 0.5, paint, 0.04); podSide.position.y = -0.1; pod.add(podSide);
  const rail = rbox(0.1, 0.5, 0.12, mats.chrome, 0.03); rail.position.set(0, -0.35, -0.12); pod.add(rail);
  const tubes = [], noseMat = new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.4 });
  for (let i = 0; i < 6; i++) {
    const x = ((i % 3) - 1) * 0.13, y = i < 3 ? 0.07 : -0.07;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 12).rotateX(Math.PI / 2), black); tube.position.set(x, y, 0.25); pod.add(tube);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 10).rotateX(Math.PI / 2), noseMat); tip.position.set(x, y, 0.27); pod.add(tip);
    tubes.push({ x, y, tip });
  }
  const cover = new THREE.Group(); cover.position.set(0, 0.17, 0.27); pod.add(cover);
  { const c = rbox(0.46, 0.04, 0.36, paint, 0.015); c.position.set(0, 0, -0.0); c.rotation.x = -Math.PI / 2; c.position.set(0, -0.17, 0.01); cover.add(c); }
  let cannonT = 0, cannonOn = false, podT = 0, podOn = false, recoil = 0, flash = 0;
  // head
  add(neck, rbox(0.18, 0.2, 0.18, frame), new THREE.Vector3(0, 0.06, 0), 0.45);
  add(neck, rbox(0.42, 0.38, 0.42, paint, 0.1), new THREE.Vector3(0, 0.33, 0), 0.45);
  add(neck, rbox(0.34, 0.16, 0.06, black, 0.03), new THREE.Vector3(0, 0.3, 0.2), 0.45);
  add(neck, rbox(0.28, 0.045, 0.02, glow, 0.01), new THREE.Vector3(0, 0.33, 0.235), 0.45);
  for (const s of [1, -1]) add(neck, rbox(0.05, 0.22, 0.08, paint, 0.02), new THREE.Vector3(s * 0.2, 0.48, -0.04), 0.45);
  // headlight eyes: cyan at rest, headlamp-white with a beam when the lights are on
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0b2a30, emissive: 0x38e8ff, emissiveIntensity: 0 });
  for (const s of [1, -1]) add(neck, new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), eyeMat), new THREE.Vector3(s * 0.085, 0.3, 0.245), 0.45);
  const beam = new THREE.SpotLight(0xfff1d6, 0, 90, 0.42, 0.5, 1.6); beam.position.set(0, 0.3, 0.3); neck.add(beam);
  const beamTarget = new THREE.Object3D(); beamTarget.position.set(0, -2.5, 12); neck.add(beamTarget); beam.target = beamTarget;

  // ---- choreography: each joint's own window within the 0..1 transformation
  let phase = 0, idle = 0, air = 0, punchT = 0, punchHit = false, act = null;
  // scripted poses blended over the gait. land: the superhero landing (left foot planted forward, right knee down,
  // right fist on the ground, left arm raised); leap: the crouch before springing into the air
  const ACTS = {
    land: { th: { 1: -1.45, [-1]: 0.5 }, tk: { 1: 2.44, [-1]: 1.07 }, arm: { 1: -2.3, [-1]: -1.15 }, elb: { 1: 1.5, [-1]: -0.35 }, spread: { 1: 0.45, [-1]: 0 }, lean: 1.25, nod: -1.05 },
    leap: { th: { 1: -0.9, [-1]: -0.9 }, tk: { 1: 1.7, [-1]: 1.7 }, arm: { 1: 0.9, [-1]: 0.9 }, elb: { 1: 0.4, [-1]: 0.4 }, spread: { 1: 0.1, [-1]: 0.1 }, lean: 0.4, nod: -0.3 },
  };
  const actWeight = (type, k) => type === 'land' ? sm(0, 0.06, k) * (1 - sm(0.62, 1, k)) : sm(0, 0.75, k) * (1 - sm(0.8, 1, k));
  const PUNCH = 0.55;
  const tmp = new THREE.Vector3(), _x = new THREE.Vector3(1, 0, 0), _z = new THREE.Vector3(0, 0, 1), _q = new THREE.Quaternion();
  function pose(t, gait) {
    const doorsOut = sm(0.0, 0.2, t), stand = sm(0.08, 0.5, t), split = sm(0.3, 0.5, t), slide = sm(0.36, 0.66, t);
    const fold = sm(0.42, 0.78, t), arms = sm(0.48, 0.82, t), wings = sm(0.55, 0.85, t), boot = sm(0.52, 0.82, t);
    const head = sm(0.62, 0.9, t), feet = sm(0.6, 0.92, t), waist = sm(0.4, 0.72, t), twist = sm(0.32, 0.6, t);
    // torso stands on its tail and walks forward over the rear wheels; legs carry it once it's up
    const pitch = -Math.PI / 2 * stand;
    const legLen = THIGH + SHIN0 + SLIDE * slide;
    hips.rotation.x = pitch;
    const standY = HIP.y + (legLen - HIP.y) * Math.sin(-pitch) + 0.04 * feet;
    hips.position.set(0, gait ? standY + (gait.hipY - standY) * gait.w : standY, HIP.z * (1 - stand));
    torso.position.z = WAIST * waist;
    torso.rotation.x = gait ? gait.lean : 0;
    spine.scale.set(1, 1, 0.05 + WAIST * waist);
    for (const s of [1, -1]) {
      // legs split apart and twist half a turn about their own axis, so the bodywork faces forward and the
      // rear wheels end up on the calves (gait angles are about the robot's lateral axis: positive swings back)
      const th = gait ? gait.th[s] * gait.w : 0, tk = gait ? gait.tk[s] * gait.w : 0;
      thigh[s].position.x = s * (0.42 + 0.1 * split);
      thigh[s].rotation.set(th, 0, 0);
      leg[s].rotation.z = Math.PI * twist * s;
      shin[s].position.z = KNEE_Z - HIP.z - SLIDE * slide;
      shin[s].rotation.x = tk * Math.cos(Math.PI * twist);        // the knee axis flips with the twist
      strut[s].scale.set(1, 1, 0.01 + SLIDE * slide + 0.15);
      // feet: undo the twist, then stay flat on the ground
      foot[s].quaternion.setFromAxisAngle(_z, -Math.PI * twist * s).multiply(_q.setFromAxisAngle(_x, Math.PI / 2 - (th + tk) * 0.9));
      toe[s].rotation.x = -Math.PI / 2 * (1 - feet);
      // doors swing open, then rise into wings (hinge axis is vertical on the car, fore-aft on the robot)
      const d = P.doors[s];
      if (d) { d.robot = 0.45 * doorsOut + 1.35 * wings; }
      // arms slide out of the door apertures and swing down; then they swing with the gait
      shoulder[s].position.x = s * (0.6 + 0.38 * arms);
      // right arm punch: wind up, strike straight out, recover
      let pa = 0, pe = 0;
      if (s === -1 && gait && punchT > 0) { const k = 1 - punchT / PUNCH; pa = k < 0.35 ? 0.6 * (k / 0.35) : k < 0.55 ? 0.6 - 2.2 * ((k - 0.35) / 0.2) : -1.6 * (1 - (k - 0.55) / 0.45); pe = k < 0.35 ? 1.2 * (k / 0.35) : k < 0.55 ? 1.2 * (1 - (k - 0.35) / 0.2) : 0; }
      let armA = Math.PI / 2 + (gait ? gait.arm[s] * gait.w * (pa ? 0 : 1) : 0) + pa, elbA = -0.35 * arms - (gait ? gait.elb[s] * gait.w : 0) - pe;
      if (s === 1 && gait && cannonT > 0) { const a = sm(0, 0.6, cannonT) * gait.w; armA += (Math.PI / 2 - 1.5 + recoil * 0.25 - armA) * a; elbA += (-recoil * 0.3 - elbA) * a; }   // the cannon arm points straight ahead
      shoulder[s].rotation.set(armA, 0, s * (0.1 * arms + (gait ? gait.spread[s] * gait.w : 0)));
      elbow[s].rotation.x = elbA;
    }
    // the front end swings down under the floor to hang in front as the chest
    // ...and settles back into the torso once the nose has tucked away
    const tuck = sm(0.5, 0.82, t);
    chest.rotation.x = Math.PI * fold;
    chest.position.set(chestBase.x, chestBase.y + RECESS * tuck, chestBase.z);
    nose.rotation.x = Math.PI * tuck;
    for (const c of wheelClones) if (c.userData.front) c.position.x = c.userData.x0 * (1 - 0.36 * tuck);   // into the arches
    neck.position.z = 0.55 + 0.42 * head;
    neck.rotation.set(Math.PI / 2 + (gait ? gait.nod : 0), gait ? gait.look : 0, 0);
    if (P.boot) P.boot.robot = 2.9 * boot;
    for (const h of hidden) h.mesh.visible = t > h.show * 0.9;
    for (const m of legInner) m.visible = twist < 0.5;
    for (const c of wheelClones) c.visible = t > 0.01;
    glow.emissiveIntensity = 5 * head;
  }
  pose(0, null);

  return {
    get eye() { neck.updateWorldMatrix(true, false); return tmp.set(0, 0.3, 0.3).applyMatrix4(neck.matrixWorld); },
    // t: 0 car .. 1 robot. motion: { u, yawRate, air } for the gait. Returns true on a footfall.
    // start a scripted pose: 'land' (strength 0..1 sets how deep and how long) or 'leap'
    action(type, strength = 1) {
      if (act && act.type === type && type === 'leap') return;
      act = { type, t: 0, s: type === 'land' ? 0.55 + 0.45 * strength : 1, dur: type === 'land' ? 0.9 + 0.9 * strength : 0.42, ready: false };
    },
    // world position of a fist (s: 1 left, -1 right)
    fist(s, out) { elbow[s].updateWorldMatrix(true, false); return out.set(0, -0.78, 0.04).applyMatrix4(elbow[s].matrixWorld); },
    get busy() { return act ? act.type : null; },
    // the leap crouch is fully loaded: time to spring (once)
    leapReady() { if (act && act.type === 'leap' && act.ready && !act.fired) { act.fired = true; return true; } return false; },
    punch() { if (act) return false; if (punchT <= 0) { punchT = PUNCH; return true; } return false; },
    // weapons: the arm cannon and the shoulder missile pod
    setCannon(on) { cannonOn = !!on; },
    get cannon() { return cannonT; },
    setPod(on) { podOn = !!on; },
    get pod() { return podT; },
    // world position of the cannon's muzzle, and fire it (recoil + flash)
    muzzle(out) { barrel.updateWorldMatrix(true, false); return out.set(0, -0.95, 0).applyMatrix4(barrel.matrixWorld); },
    muzzleDir(out) { barrel.updateWorldMatrix(true, false); return out.set(0, -1, 0).transformDirection(barrel.matrixWorld); },
    fireCannon() { recoil = 1; flash = 1; },
    // tube i (0..5): world position; shown = whether that missile is still in its tube
    tube(i, out) { pod.updateWorldMatrix(true, false); return out.set(tubes[i].x, tubes[i].y, 0.3).applyMatrix4(pod.matrixWorld); },
    podDir(out) { pod.updateWorldMatrix(true, false); return out.set(0, 0, 1).transformDirection(pod.matrixWorld); },
    loaded(i, on) { tubes[i].tip.visible = on; },
    // true once per punch, at the moment the fist is fully out
    takeHit() { const h = punchHit; punchHit = false; return h; },
    update(dt, t, motion) {
      eyeMat.emissive.set(motion.lights ? 0xfff3d8 : 0x38e8ff);
      eyeMat.emissiveIntensity = t > 0.6 ? (motion.lights ? 12 : 4) : 0;
      beam.intensity = t > 0.95 && motion.lights ? 450 : 0;
      if (punchT > 0) { const before = 1 - punchT / PUNCH; punchT = Math.max(0, punchT - dt); const after = 1 - punchT / PUNCH; if (before < 0.55 && after >= 0.55) punchHit = true; }
      // weapons: deploy / stow (only once fully transformed)
      const armed = t > 0.98;
      cannonT += Math.sign((cannonOn && armed ? 1 : 0) - cannonT) * Math.min(Math.abs((cannonOn && armed ? 1 : 0) - cannonT), dt / 0.7);
      podT += Math.sign((podOn && armed ? 1 : 0) - podT) * Math.min(Math.abs((podOn && armed ? 1 : 0) - podT), dt / 0.6);
      recoil = Math.max(0, recoil - dt * 5); flash = Math.max(0, flash - dt * 9);
      { const out = sm(0.35, 1, cannonT), open = sm(0, 0.45, cannonT);
        cannon.visible = cannonT > 0.01; fists[1].scale.setScalar(Math.max(0.01, 1 - sm(0, 0.4, cannonT))); fists[1].visible = cannonT < 0.39;
        housing.scale.set(sm(0, 0.3, cannonT), 1, sm(0, 0.3, cannonT));
        barrel.position.y = -0.2 - 0.32 * out + recoil * 0.12; barrel.scale.setScalar(Math.max(0.01, sm(0.2, 0.6, cannonT)));
        for (const f of flaps) f.hinge.rotation.z = f.sd * 0.75 * open * (1 - 0.6 * out);
        coilMat.emissiveIntensity = 6 * sm(0.7, 1, cannonT) + flash * 12;
        muzzleFlash.material.opacity = flash; muzzleFlash.scale.setScalar(0.6 + flash * 1.8); }
      { const up = sm(0, 0.6, podT), lid = sm(0.5, 1, podT);
        pod.visible = podT > 0.01; pod.position.set(0, -0.45 + 0.78 * up, -0.05 + 0.08 * up); cover.rotation.x = -1.9 * lid; }
      if (t <= 0) { pose(0, null); return false; }
      const w = sm(0.92, 1, t);
      const u = motion.u || 0, amp = Math.min(1.3, Math.abs(u) / 3.2) * w;
      const prev = phase;
      phase += (u * dt / 1.3) * Math.PI; idle += dt;
      air += ((motion.air ? 1 : 0) - air) * Math.min(1, dt * 6);
      const g = { w, th: {}, tk: {}, arm: {}, elb: { 1: 0.25 * amp, [-1]: 0.25 * amp }, spread: { 1: 0, [-1]: 0 }, lean: 0.1 * amp + (punchT > 0 ? 0.08 : 0), nod: -0.08 * amp, look: -(motion.yawRate || 0) * 0.15 };
      let hipY = 0;
      for (const s of [1, -1]) {
        const ph = s === 1 ? 0 : Math.PI;
        // a damaged leg (limp) takes a shorter, stiffer stride
        const lk = s === 1 ? 1 - 0.55 * (motion.limp || 0) : 1;
        let th = -0.5 * amp * lk * Math.sin(phase + ph), tk = 0.1 + 0.7 * amp * lk * Math.max(0, Math.cos(phase + ph)) ** 2;
        th = th * (1 - air) - 0.55 * air; tk = tk * (1 - air) + 1.0 * air;
        g.th[s] = th; g.tk[s] = tk;
        g.arm[s] = 0.45 * amp * Math.sin(phase + ph) - 0.4 * air;   // arms swing against the legs
      }
      let A = null;
      if (act) { act.t += dt; const k = act.t / act.dur; if (k >= 1) act = null; else { A = { type: act.type, c: actWeight(act.type, k) * act.s }; if (act.type === 'leap' && k > 0.8) act.ready = true; } }
      if (motion.act) A = motion.act;          // forced pose (previews)
      if (A) {
        const T = A.T || ACTS[A.type], c = A.c, L = (a, b) => a + (b - a) * c;
        for (const s of [1, -1]) { g.th[s] = L(g.th[s], T.th[s]); g.tk[s] = L(g.tk[s], T.tk[s]); g.arm[s] = L(g.arm[s], T.arm[s]); g.elb[s] = L(g.elb[s], T.elb[s]); g.spread[s] = L(0, T.spread[s]); }
        g.lean = L(g.lean, T.lean); g.nod = L(g.nod, T.nod); g.look *= 1 - c;
      }
      // the hips sit as high as the straighter leg reaches, so the planted foot stays on the ground
      for (const s of [1, -1]) hipY = Math.max(hipY, THIGH * Math.cos(g.th[s]) + (SHIN0 + SLIDE) * Math.cos(g.th[s] + g.tk[s]) + 0.04);
      g.hipY = hipY + (air > 0.5 || A ? 0 : 0.012 * Math.sin(idle * 2) * (1 - amp));
      pose(t, g);
      return t > 0.98 && !motion.air && Math.abs(u) > 0.6 && Math.floor(prev / Math.PI) !== Math.floor(phase / Math.PI);
    },
  };
}
