// Pre-flight walkaround: the A320 parked in a hangar, toured stop by stop like a captain's exterior check.
// World units are metres in the A320 model's own frame: nose +Z, up +Y, pilot's left = +X.
import * as THREE from 'three';

// The model is in flight configuration (gear up, engine bottom at y -2.77), so we build gear and set the
// floor ~0.6 m under the engines, roughly a CFM56's real ground clearance.
const GROUND = -3.37;
const HANGAR_SCALE = 16 / 248; // hangar source units → metres (about 16 m to the roof)

// Draft content: to be reviewed by an instructor before launch.
export const STOPS = [
  {
    title: 'Nose: pitot probes & AoA vanes', at: [-1.7, 0.6, 14.2], eye: [-7.5, 1.4, 22.5],
    check: 'Probe covers removed, pitot and static ports clear, angle-of-attack vanes free and undamaged.',
    fact: 'Airspeed comes from dynamic pressure: pitot (total) pressure minus static pressure.',
  },
  {
    title: 'Nose landing gear', at: [0, GROUND + 0.9, 11.4], eye: [-5, -1.3, 17.5],
    check: 'Tyres and wheels, steering mechanism, no hydraulic leaks, gear safety pin removed.',
    fact: 'On the A320 the nose wheel is steered from the cockpit tillers and, through small angles, the rudder pedals.',
  },
  {
    title: 'Right engine', at: [-6, -1.4, 5], eye: [-13.5, -0.6, 14],
    check: 'Intake and fan blades clear and undamaged, no fluid leaks, cowlings closed and latched.',
    fact: 'A320ceo engines are CFM56-5 or IAE V2500 high-bypass turbofans; most of the thrust comes from the fan.',
  },
  {
    title: 'Right wing & green nav light', at: [-15.5, 0.8, -5.2], eye: [-19, 4.2, 8],
    check: 'Slats and flaps undamaged, static dischargers in place, green navigation light working.',
    fact: 'Slats and flaps raise the wing’s maximum lift, lowering the stall speed for take-off and landing.',
  },
  {
    title: 'Main landing gear & brakes', at: [-3.8, GROUND + 0.8, -1.2], eye: [-10, -1.5, 5],
    check: 'Tyre wear and pressure, brake wear pins, no hydraulic leaks around the gear.',
    fact: 'Brake wear is checked with wear indicator pins: a pin flush with its housing means the brake is worn.',
  },
  {
    title: 'Tail: APU, rudder & elevators', at: [0, 2.6, -20], eye: [-11, 4.5, -31.5],
    check: 'APU inlet and exhaust clear, rudder and elevators undamaged, white tail light working.',
    fact: 'The APU is a small gas turbine in the tail cone that supplies electrical power and bleed air on the ground.',
  },
  {
    title: 'Left wingtip & red nav light', at: [15.5, 0.8, -5.2], eye: [19, 4.2, 8],
    check: 'Wingtip and red navigation light, static dischargers, then the left engine and gear on the way back.',
    fact: 'Navigation lights: red on the left wingtip, green on the right, white at the tail.',
  },
];
// camera positions: every stop, then a final step-back overview
// (each stop's eye is pushed back a little so the whole part and its surroundings read)
const BACK_OFF = 1.35;
const POSES = [
  ...STOPS.map((s) => ({ eye: s.eye.map((v, k) => s.at[k] + (v - s.at[k]) * BACK_OFF), at: s.at })),
  { eye: [18, 8, 36], at: [0, -0.5, -2] },
];
export const POSE_COUNT = POSES.length;

function buildGear() {
  const gear = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xb9bec6, metalness: 0.8, roughness: 0.35 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.92 });
  const hub = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.7, roughness: 0.4 });
  // one gear leg: strut from the airframe down to the axle, twin wheels either side
  const leg = (x, z, top, wheelR, wheelW, spread) => {
    const axleY = GROUND + wheelR;
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, top - axleY, 16), metal);
    strut.position.set(x, (top + axleY) / 2, z);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, spread * 2 + wheelW, 12), metal);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(x, axleY, z);
    gear.add(strut, axle);
    for (const side of [-1, 1]) {
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 32), rubber);
      tyre.rotation.z = Math.PI / 2;
      tyre.position.set(x + side * spread, axleY, z);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, wheelW + 0.02, 24), hub);
      cap.rotation.z = Math.PI / 2;
      cap.position.copy(tyre.position);
      gear.add(tyre, cap);
    }
  };
  leg(0, 11.4, -1.55, 0.38, 0.26, 0.28); // nose gear
  leg(3.8, -1.2, -1.9, 0.58, 0.38, 0.45); // left main
  leg(-3.8, -1.2, -1.9, 0.58, 0.38, 0.45); // right main
  return gear;
}

// soft contact shadow under the airframe (cheaper than a real-time shadow map)
function contactShadow() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
  const group = new THREE.Group();
  for (const [w, l, z] of [[6, 40, -2], [36, 9, -3.5]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, GROUND + 0.02, z);
    group.add(m);
  }
  return group;
}

export function createWalkaround({ envMap }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
  scene.environment = envMap;
  scene.background = new THREE.Color(0x1a1612);
  scene.add(new THREE.HemisphereLight(0xfff3e2, 0x3a3024, 0.7));
  const daylight = new THREE.DirectionalLight(0xcfe0ff, 1.3); // through the open doors ahead of the nose
  daylight.position.set(6, 12, 60);
  scene.add(daylight);
  for (const x of [-11, 11]) {
    for (const z of [-28, -4, 20]) {
      const lamp = new THREE.PointLight(0xffdcae, 55, 34, 1.6);
      lamp.position.set(x, GROUND + 13.5, z);
      scene.add(lamp);
    }
  }

  const aircraft = new THREE.Group();
  aircraft.add(buildGear(), contactShadow());
  scene.add(aircraft);
  const hangar = new THREE.Group();
  hangar.rotation.y = Math.PI; // its doors end up ahead of the nose
  hangar.scale.setScalar(HANGAR_SCALE);
  // the hangar's own floor centre is at (17.55, 4.9, -92.3) in its units; after the half-turn that lands at
  // (-17.55, 4.9, 92.3) × scale, so shift it back to sit centred under the aircraft with the slab top on GROUND
  hangar.position.set(17.55 * HANGAR_SCALE, GROUND - 4.9 * HANGAR_SCALE, -2 - 92.3 * HANGAR_SCALE);
  scene.add(hangar);

  const anchors = STOPS.map((s) => new THREE.Vector3(...s.at));
  const center = new THREE.Vector3(0, 0, -2);
  const eye = new THREE.Vector3(), at = new THREE.Vector3(), tmp = new THREE.Vector3();
  const drag = { yaw: 0, pitch: 0, active: false };
  const cyl = (v) => ({ a: Math.atan2(v[2] - center.z, v[0] - center.x), r: Math.hypot(v[0] - center.x, v[2] - center.z), h: v[1] });
  const smooth = (t) => t * t * (3 - 2 * t);

  function update({ p, dt, pointer, wide }) {
    // each stop holds for the first 55% of its stretch of scroll, then moves to the next
    const seg = Math.min(p, 0.9999) * (POSES.length - 1);
    const i = Math.floor(seg), f = seg - i;
    const move = smooth(Math.min(1, Math.max(0, (f - 0.55) / 0.45)));
    const A = POSES[i], B = POSES[Math.min(i + 1, POSES.length - 1)];
    // move round the aircraft on a cylinder (so we never cut through it), lifting over the wings mid-way
    const ca = cyl(A.eye), cb = cyl(B.eye);
    let da = cb.a - ca.a;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    const a = ca.a + da * move, r = ca.r + (cb.r - ca.r) * move;
    const h = ca.h + (cb.h - ca.h) * move + Math.sin(move * Math.PI) * 4;
    eye.set(center.x + Math.cos(a) * r, h, center.z + Math.sin(a) * r);
    at.fromArray(A.at).lerp(tmp.fromArray(B.at), move);

    // drag to look around the current stop; it eases back when released
    if (!drag.active) {
      drag.yaw *= Math.exp(-dt * 2);
      drag.pitch *= Math.exp(-dt * 2);
    }
    eye.sub(at).applyAxisAngle(THREE.Object3D.DEFAULT_UP, drag.yaw + pointer.x * 0.08).add(at);
    eye.y += drag.pitch * 6 - pointer.y * 0.4;
    // stay inside the hangar: walls ~24 m either side, doors/back wall ~45 m away, roof ~16 m up
    eye.x = Math.max(-22, Math.min(22, eye.x));
    eye.z = Math.max(-45, Math.min(41, eye.z));
    eye.y = Math.max(GROUND + 0.6, Math.min(GROUND + 14, eye.y));
    camera.position.copy(eye);
    camera.lookAt(at);
    // nudge the framing right on wide screens so the copy column stays clear; widen the lens in portrait
    const offset = wide ? -9 : 0, fov = wide ? 48 : 64;
    if (camera.filmOffset !== offset || camera.fov !== fov) { camera.filmOffset = offset; camera.fov = fov; camera.updateProjectionMatrix(); }
    return { stop: move < 0.5 ? i : Math.min(i + 1, POSES.length - 1), moving: move > 0.02 && move < 0.98 };
  }

  // screen position of each hotspot (for the HTML markers); z > 1 means behind the camera
  function hotspots(width, height) {
    return anchors.map((v) => {
      tmp.copy(v).project(camera);
      return { x: (tmp.x * 0.5 + 0.5) * width, y: (-tmp.y * 0.5 + 0.5) * height, visible: tmp.z < 1 };
    });
  }

  return {
    scene, camera, update, hotspots, drag,
    setAircraft(model) { aircraft.add(model); },
    setHangar(model) { hangar.add(model); },
  };
}
