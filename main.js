import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { createRadarStage, createScope } from './radar.js?v=9';

const { gsap, ScrollTrigger, Lenis } = window;
gsap.registerPlugin(ScrollTrigger);

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmall = innerWidth < 760;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const lerpArr = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const smooth = (t) => t * t * (3 - 2 * t);
const range = (v, a, b) => smooth(clamp01((v - a) / (b - a)));

/* ---------- Smooth scroll (Lenis driven by the GSAP ticker) ---------- */
let lenis = null;
if (!reduceMotion) {
  lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop(); // released when the loader finishes
}
document.querySelectorAll('[data-to]').forEach((a) =>
  a.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.querySelector(a.getAttribute('href'));
    lenis ? lenis.scrollTo(target, { duration: 2.2 }) : target.scrollIntoView();
  })
);

/* ---------- Keyframes: one per section (+ footer) ---------- */
// stage = which 3D scene renders; p/r/s = A320 pose (r = [roll, yaw, pitch]); pm = pose on portrait screens
// cy = cloud deck height
const KEYS = [
  { stage: 'sky', pm: [0.3, -4.3, 0], p: [2.7, -0.5, 2.2], r: [-0.12, -2.3, 0.07], s: 1.25, cy: -22, alt: 0, sky: ['#0b1a3a', '#3b4f8a', '#f08a5d'] },
  { stage: 'cockpit', p: [-9, 4, -8], r: [0.2, -2.6, 0.3], s: 1, cy: 6, alt: 400, sky: ['#14214a', '#5b5a8f', '#f3a274'] },
  { stage: 'sky', p: [1.2, 1.8, -10], r: [0.25, 1.1, 0.12], s: 1, cy: -3.2, alt: 5000, sky: ['#2a63b4', '#6aa3dc', '#d6e8f6'] },
  { stage: 'engine', p: [3.8, 0.4, -2], r: [-0.3, -0.5, 0.06], s: 1, cy: -4, alt: 8000, sky: ['#040a17', '#0a1830', '#13284d'] },
  { stage: 'sky', p: [3.5, 0.2, -1.5], r: [-0.08, -0.32, 0.04], s: 1.1, cy: -4.5, alt: 10000, sky: ['#12397a', '#3f7ccb', '#a9cdee'] },
  { stage: 'radar', p: [9, 6, -14], r: [0.3, Math.PI + 0.45, 0.08], s: 1, cy: -7, alt: 14000, sky: ['#0a1230', '#2b2c55', '#b8684a'] },
  { stage: 'sky', p: [5.2, 3.9, -13], r: [0.3, Math.PI + 0.45, 0.08], s: 1, cy: -6.5, alt: 18000, sky: ['#0a2456', '#23559e', '#6f9fd6'] },
  { stage: 'sky', pm: [1.5, 7, -6], p: [3.4, 2.3, -4], r: [0.12, -0.35, 0.05], s: 1.05, cy: -8, alt: 35000, sky: ['#0a1838', '#6b4a7a', '#f3a35a'] },
  { stage: 'sky', p: [10, 5.5, -5], r: [0.1, -0.2, 0.12], s: 1, cy: -8, alt: 35000, sky: ['#071226', '#3a3566', '#d98a4f'] },
];
const sections = [...document.querySelectorAll('main > section'), document.querySelector('.footer')];
let centers = [];
const measure = () => {
  centers = sections.map((el) => el.offsetTop + el.offsetHeight / 2);
  centers[0] = innerHeight / 2;
  centers[centers.length - 1] = document.documentElement.scrollHeight - innerHeight / 2;
};
ScrollTrigger.addEventListener('refresh', measure);
measure();

// Continuous position along KEYS, e.g. 2.4 = 40% of the way from pillars to engine
function keyPosition() {
  const y = scrollY + innerHeight / 2;
  if (y <= centers[0]) return 0;
  for (let i = 0; i < centers.length - 1; i++) {
    if (y < centers[i + 1]) return i + smooth((y - centers[i]) / (centers[i + 1] - centers[i]));
  }
  return centers.length - 1;
}
const colors = KEYS.map((k) => k.sky.map((c) => new THREE.Color(c)));
function sample(k) {
  const i = Math.min(Math.floor(k), KEYS.length - 2);
  const t = k - i, A = KEYS[i], B = KEYS[i + 1];
  const portrait = innerWidth < innerHeight;
  const pa = (portrait && A.pm) || A.p, pb = (portrait && B.pm) || B.p;
  return {
    i, t, A, B,
    p: lerpArr(pa, pb, t), r: lerpArr(A.r, B.r, t), s: lerp(A.s, B.s, t),
    cy: lerp(A.cy, B.cy, t), alt: lerp(A.alt, B.alt, t),
    sky: colors[i].map((c, j) => c.clone().lerp(colors[i + 1][j], t)),
  };
}
// 0..1 progress through a tall sticky section
function stickyProgress(el) {
  const r = el.getBoundingClientRect();
  return clamp01(-r.top / (r.height - innerHeight));
}

/* ---------- Renderer + shared environment ---------- */
const canvas = document.getElementById('webgl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isSmall ? 1.25 : 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const envMap = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const manager = new THREE.LoadingManager();
const loader = new GLTFLoader(manager);   // needed before the page opens
const lazyLoader = new GLTFLoader();      // fetched in the background afterwards

// Centre a glTF scene and scale its largest extent to `size`
function normalise(root, size) {
  const box = new THREE.Box3().setFromObject(root);
  const s = size / box.getSize(new THREE.Vector3()).toArray().reduce((a, b) => Math.max(a, b));
  root.scale.setScalar(s);
  root.position.copy(box.getCenter(new THREE.Vector3()).multiplyScalar(-s));
  return s;
}
function softTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col]) => grd.addColorStop(o, col));
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* =========================================================
   Stage 1: SKY — A320 in AviationSpot360 livery, clouds, G650
   ========================================================= */
const sky = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(35, 1, 0.1, 300) };
sky.scene.environment = envMap;
sky.scene.fog = new THREE.Fog(0x6aa3dc, 14, 60);
sky.camera.position.set(0, 0, 12);
sky.scene.add(new THREE.HemisphereLight(0xe4f0ff, 0x3a4a6a, 1.1));
const sun = new THREE.DirectionalLight(0xffe0b5, 2.6);
sun.position.set(-6, 8, 6);
sky.scene.add(sun);

// Sun glare that the aircraft can pass in front of
const flareLight = new THREE.PointLight(0xffffff, 0, 0);
flareLight.position.set(-38, 22, -70);
const flare = new Lensflare();
flare.addElement(new LensflareElement(softTexture([[0, 'rgba(255,250,235,1)'], [0.2, 'rgba(255,214,150,.55)'], [1, 'rgba(255,180,90,0)']]), 520, 0, new THREE.Color(0xffffff)));
const ring = softTexture([[0, 'rgba(255,255,255,0)'], [0.75, 'rgba(255,220,170,.0)'], [0.85, 'rgba(255,220,170,.16)'], [1, 'rgba(255,220,170,0)']]);
const dot = softTexture([[0, 'rgba(160,210,255,.25)'], [1, 'rgba(160,210,255,0)']]);
flare.addElement(new LensflareElement(dot, 60, 0.4));
flare.addElement(new LensflareElement(ring, 140, 0.6));
flare.addElement(new LensflareElement(dot, 90, 0.85));
flare.addElement(new LensflareElement(ring, 220, 1.05));
flareLight.add(flare);
sky.scene.add(flareLight);

const plane = new THREE.Group();
plane.rotation.order = 'YZX'; // yaw, then pitch, then roll
plane.visible = false;
sky.scene.add(plane);
// engine exhaust positions in the plane's local space (nose +X), for contrails
const EXHAUSTS = [new THREE.Vector3(0.35, -0.48, 0.7), new THREE.Vector3(0.35, -0.48, -0.7)];

loader.load('assests/a320/scene_as360.gltf', (gltf) => {
  const model = gltf.scene;
  model.rotation.y = Math.PI / 2; // source nose points +Z
  model.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    m.color?.setScalar(1);            // the export darkens the livery to 0.588
    if (m.map) m.map.anisotropy = 8;
    if (m.transparent && m.opacity === 0) return;
    m.roughness = 0.32;                // glossy paint instead of a mirror
    m.metalness = 0.12;
    m.envMapIntensity = 0.9;
  });
  const wrap = new THREE.Group();
  wrap.add(model);
  normalise(wrap, 4.6);
  plane.add(wrap);
  plane.visible = true;
});

// Clouds: soft sprite puffs drifting toward the camera
function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = 60 + Math.random() * 136, y = 90 + Math.random() * 80, r = 30 + Math.random() * 60;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const cloudDeck = new THREE.Group();
sky.scene.add(cloudDeck);
const cloudMats = [cloudTexture(), cloudTexture(), cloudTexture()].map(
  (map) => new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0.85, fog: true })
);
const clouds = [];
for (let i = 0; i < (isSmall ? 34 : 70); i++) {
  const s = new THREE.Sprite(cloudMats[i % 3]);
  const k = 5 + Math.random() * 9;
  s.scale.set(k * 1.8, k, 1);
  s.position.set((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 3, -45 + Math.random() * 52);
  s.userData.speed = 2 + Math.random() * 2;
  cloudDeck.add(s);
  clouds.push(s);
}

// Stars that come out at cruise altitude
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(900 * 3);
for (let i = 0; i < 900; i++) {
  const v = new THREE.Vector3().randomDirection();
  v.y = Math.abs(v.y) * 0.9 + 0.05;
  v.z = -Math.abs(v.z);
  v.normalize().multiplyScalar(120);
  starPos.set([v.x, v.y, v.z], i * 3);
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.45, color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false }));
sky.scene.add(stars);

// Contrails: soft particles streaming back from each engine
const TRAIL = 110;
const trailGeo = new THREE.BufferGeometry();
const trailPos = new Float32Array(TRAIL * 2 * 3);
const trailAge = new Float32Array(TRAIL * 2).fill(99);
const trailAlpha = new Float32Array(TRAIL * 2);
const trailSize = new Float32Array(TRAIL * 2);
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
trailGeo.setAttribute('alpha', new THREE.BufferAttribute(trailAlpha, 1));
trailGeo.setAttribute('size', new THREE.BufferAttribute(trailSize, 1));
const trails = new THREE.Points(trailGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  vertexShader: `attribute float alpha; attribute float size; varying float vA;
    void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0);
    gl_PointSize = size * (300.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `varying float vA;
    void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA;
    gl_FragColor = vec4(1.0, 1.0, 1.0, a); }`,
}));
trails.frustumCulled = false;
sky.scene.add(trails);
let trailHead = 0;

// Gulfstream G650 that crosses behind the departure board (loaded lazily)
const jet = new THREE.Group();
jet.visible = false;
sky.scene.add(jet);

/* =========================================================
   Stage 2: COCKPIT — inside the Cessna 182 Skylane
   ========================================================= */
// kept in real metres: nose points -Z, panel ~1 m behind the prop, pilot's eye ≈ (-0.2, 0.56, -0.1)
const cockpit = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(42, 1, 0.02, 200) };
cockpit.scene.environment = envMap;
cockpit.scene.add(new THREE.HemisphereLight(0xffe9d0, 0x1b2140, 1.0));
const cpKey = new THREE.DirectionalLight(0xffc98f, 2.6); // low dawn sun ahead
cpKey.position.set(-4, 6, -8);
cockpit.scene.add(cpKey);
const cpFill = new THREE.DirectionalLight(0x9cc4ff, 0.9);
cpFill.position.set(5, 2, 6);
cockpit.scene.add(cpFill);
const cabinLight = new THREE.PointLight(0xffe2c0, 1.6, 2.5); // so the panel reads from the seat
cabinLight.position.set(-0.1, 0.55, 0.1);
cockpit.scene.add(cabinLight);
const cessna = new THREE.Group();
cockpit.scene.add(cessna);
let propeller = null;
loader.load('assests/c182/scene.gltf', (gltf) => {
  const m = gltf.scene;
  m.updateMatrixWorld(true);
  const prop = m.getObjectByName('Object_192');
  if (prop) {
    // re-pivot the propeller on its hub so it can spin about the nose axis
    propeller = new THREE.Group();
    propeller.position.copy(new THREE.Box3().setFromObject(prop).getCenter(new THREE.Vector3()));
    m.add(propeller);
    propeller.attach(prop);
  }
  // The G1000 PFD and MFD ship as alpha-blended glass, flush with the bezel and with tinted cabin
  // glass drawn over them, so they come out black. Show them as pure emitted light (the display
  // image), drawn after the glass, so the moving map and flight display read.
  const screens = [];
  m.traverse((o) => { if (o.isMesh && ['material', 'material_18'].includes(o.material.name)) screens.push(o); });
  for (const o of screens) {
    const display = o.material.emissiveMap;
    display.colorSpace = THREE.SRGBColorSpace;
    o.material = new THREE.MeshBasicMaterial({ map: display, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, transparent: true, depthWrite: true });
    o.material.color.setScalar(0.92); // a touch under full white so it doesn't glare
    o.renderOrder = 10;
  }
  cessna.add(m);
});

// camera beats, all inside the cabin: [progress, eye, target]
const CP_PATH = [
  [0.0, [-0.17, 0.42, -0.48], [-0.17, 0.37, -1.05]], // nose-to-glass with the G1000 PFD
  [0.18, [-0.17, 0.43, -0.42], [-0.15, 0.37, -1.05]],
  [0.42, [-0.2, 0.56, -0.08], [-0.02, 0.3, -1.1]],    // back into the left seat: the whole panel
  [0.6, [-0.2, 0.56, -0.1], [0.02, 0.31, -1.1]],
  [0.7, [-0.2, 0.58, -0.12], [-0.2, 0.7, -3.0]],     // look up and out through the windshield
  [0.8, [-0.2, 0.58, -0.14], [-0.2, 0.74, -3.0]],
  [1.0, [-0.2, 0.75, -4.5], [-0.2, 1.0, -14]],      // fly out ahead of the aircraft
];
const cpEye = new THREE.Vector3(), cpTarget = new THREE.Vector3();
function cockpitPose(p) {
  let i = 0;
  while (i < CP_PATH.length - 2 && p > CP_PATH[i + 1][0]) i++;
  const [p0, e0, t0] = CP_PATH[i], [p1, e1, t1] = CP_PATH[i + 1];
  const t = smooth(clamp01((p - p0) / (p1 - p0)));
  cpEye.fromArray(lerpArr(e0, e1, t));
  cpTarget.fromArray(lerpArr(t0, t1, t));
}

/* =========================================================
   Stage 3: ENGINE — airliner nacelle that opens into a cutaway
   ========================================================= */
// Source model: axis along X, intake at -X, exhaust at +X; the +Z side is cut away to show the core.
const engine = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(35, 1, 0.1, 100) };
engine.scene.environment = envMap;
engine.scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x0a1020, 0.7));
const enKey = new THREE.DirectionalLight(0xffffff, 2.2);
enKey.position.set(-4, 6, 5);
engine.scene.add(enKey);
const rimA = new THREE.PointLight(0xc8a46a, 40, 16);
rimA.position.set(4, 3, -4);
const rimB = new THREE.PointLight(0x7fb8ff, 30, 16);
rimB.position.set(-5, -2, 3);
engine.scene.add(rimA, rimB);
const turbofan = new THREE.Group();
engine.scene.add(turbofan);
let engineMixer = null;
// label anchors in the source model's units: [x along the axis, y, z toward the cutaway];
// they alternate above and below the core so neighbours don't collide
const PARTS = [[-5.6, 6.1, 1.0], [-2.8, 2.6, 1.2], [0.0, 5.3, 1.2], [2.2, 2.5, 1.2], [5.4, 4.9, 0.6]];
const partAnchors = PARTS.map(() => new THREE.Object3D());

// Airflow streaks drawn in through the intake and out of the exhaust
const FLOW = isSmall ? 260 : 520;
const flowPos = new Float32Array(FLOW * 3);
const flowSpeed = new Float32Array(FLOW);
for (let i = 0; i < FLOW; i++) {
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 1.1;
  flowPos.set([-5 + Math.random() * 10, Math.cos(a) * r, Math.sin(a) * r], i * 3);
  flowSpeed[i] = 2.5 + Math.random() * 3;
}
const flowGeo = new THREE.BufferGeometry();
flowGeo.setAttribute('position', new THREE.BufferAttribute(flowPos, 3));
const flow = new THREE.Points(flowGeo, new THREE.PointsMaterial({
  size: 0.05, color: 0x9fd2ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false,
}));
engine.scene.add(flow);

/* Stage 4: RADAR — surveillance radar on its mast at dusk (see radar.js) */
const radar = createRadarStage({ envMap, loader, isSmall });

const stages = { sky, cockpit, engine, radar };

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  const aspect = innerWidth / innerHeight;
  for (const st of Object.values(stages)) {
    st.camera.aspect = aspect;
    st.camera.updateProjectionMatrix();
  }
  sky.camera.position.z = aspect < 1 ? 18 : 12; // pull back on narrow screens
}
addEventListener('resize', resize);
resize();

/* ---------- Lazy assets (after the page is up) ---------- */
function loadLazy() {
  lazyLoader.load('assests/jet_engine/scene.gltf', (gltf) => {
    const m = gltf.scene;
    m.traverse((o) => { if (o.isMesh) o.material.envMapIntensity = 1.1; });
    PARTS.forEach(([x, y, z], i) => { partAnchors[i].position.set(x, y, z); m.add(partAnchors[i]); });
    // the model's own "idle" clip spins the fan and core
    engineMixer = new THREE.AnimationMixer(m);
    const idle = gltf.animations.find((a) => a.name === 'idle');
    if (idle) engineMixer.clipAction(idle).play();
    // skinned meshes report unreliable bounds before their skeleton updates, so size it from the
    // file's measured extent: 14 units long, centred at (-0.8, 4.0, -0.59)
    const wrap = new THREE.Group();
    wrap.add(m);
    const s = 6.6 / 14;
    wrap.scale.setScalar(s);
    wrap.position.set(0.8 * s, -4.0 * s, 0.59 * s);
    turbofan.add(wrap);
  });
  lazyLoader.load('assests/src/gulfstream_g650er/scene.gltf', (gltf) => {
    const m = gltf.scene;
    m.rotation.y = -Math.PI / 2; // nose +Z in the source → fly toward -X
    m.traverse((o) => { if (o.isMesh) { o.material.roughness = 0.3; o.material.metalness = 0.2; } });
    const wrap = new THREE.Group();
    wrap.add(m);
    normalise(wrap, 3);
    jet.add(wrap);
  });
}

/* ---------- Render loop ---------- */
const skyEl = document.getElementById('sky');
const faderEl = document.getElementById('fader');
const altValue = document.getElementById('altValue');
const altFill = document.getElementById('altFill');
const cockpitSec = document.getElementById('cockpit');
const engineSec = document.getElementById('engine');
const lines = [...document.querySelectorAll('.cockpit .line')];
const labels = [...document.querySelectorAll('#engineLabels span')];
const cur = { ...sample(0), p: [14, 3, -30], r: [0.6, -2.6, 0.2] }; // starts far away: the A320 flies in
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
const fwd = new THREE.Vector3();
const pointer = { x: 0, y: 0 };
addEventListener('pointermove', (e) => {
  pointer.x = e.clientX / innerWidth - 0.5;
  pointer.y = e.clientY / innerHeight - 0.5;
});
let started = false;

function updateSky(dt, time, target, ease) {
  for (let i = 0; i < 3; i++) {
    cur.p[i] = lerp(cur.p[i], target.p[i], ease);
    cur.r[i] = lerp(cur.r[i], target.r[i], ease);
  }
  cur.s = lerp(cur.s, target.s, ease);
  cur.cy = lerp(cur.cy, target.cy, ease);

  const bob = reduceMotion ? 0 : Math.sin(time * 0.9) * 0.08;
  const sway = reduceMotion ? 0 : Math.sin(time * 0.6) * 0.05;
  plane.position.set(cur.p[0] + pointer.x * 0.4, cur.p[1] + bob - pointer.y * 0.3, cur.p[2]);
  plane.rotation.set(cur.r[0] + sway + pointer.x * 0.12, cur.r[1], cur.r[2] + bob * 0.3);
  plane.scale.setScalar(cur.s * (sky.camera.aspect < 1 ? 0.75 : 1));
  sky.camera.position.x = pointer.x * 0.5;
  sky.camera.position.y = -pointer.y * 0.3;
  sky.camera.lookAt(0, 0, 0);

  cloudDeck.position.y = cur.cy;
  for (const c of clouds) {
    if (!reduceMotion) c.position.z += c.userData.speed * dt;
    if (c.position.z > 8) c.position.z -= 53;
  }

  // contrails get thicker the higher we fly
  const k = target.i + target.t;
  const trailVis = plane.visible ? range(k, 1.6, 2.4) * (1 - range(k, 7.4, 8)) : 0;
  fwd.set(1, 0, 0).applyQuaternion(plane.quaternion);
  for (let e = 0; e < 2; e++) {
    const idx = e * TRAIL + trailHead;
    tmp.copy(EXHAUSTS[e]);
    plane.localToWorld(tmp);
    trailPos.set([tmp.x, tmp.y, tmp.z], idx * 3);
    trailAge[idx] = 0;
  }
  trailHead = (trailHead + 1) % TRAIL;
  const drift = 9 * dt * cur.s;
  for (let j = 0; j < TRAIL * 2; j++) {
    trailAge[j] += dt;
    trailPos[j * 3] -= fwd.x * drift;
    trailPos[j * 3 + 1] -= fwd.y * drift;
    trailPos[j * 3 + 2] -= fwd.z * drift;
    const life = clamp01(1 - trailAge[j] / 1.7);
    trailAlpha[j] = life * life * 0.55 * trailVis;
    trailSize[j] = 0.12 + trailAge[j] * 0.5;
  }
  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.attributes.alpha.needsUpdate = true;
  trailGeo.attributes.size.needsUpdate = true;

  stars.material.opacity = range(k, 6.4, 7.2) * 0.85;
  flareLight.intensity = 1;
  flare.visible = k < 0.9 || k > 6.5;

  // G650 crosses right → left behind the departure board
  const jt = clamp01((k - 5.45) / 1.3);
  jet.visible = jet.children.length > 0 && jt > 0 && jt < 1;
  if (jet.visible) {
    jet.position.set(lerp(13, -13, jt), lerp(-3.4, -1.6, jt) + Math.sin(time) * 0.05, -6);
    jet.rotation.set(0.25 * Math.sin(jt * Math.PI), 0.25, 0.05, 'YZX');
  }
  sky.scene.fog.color.copy(target.sky[1]);
}

function updateCockpit(dt) {
  const p = stickyProgress(cockpitSec);
  if (propeller && !reduceMotion) propeller.rotation.z += dt * 28;

  cockpitPose(p);
  const cam = cockpit.camera;
  // pointer parallax: a small head turn from the seat
  cam.position.copy(cpEye).add(tmp.set(pointer.x * 0.12, -pointer.y * 0.06, 0));
  cam.lookAt(cpTarget.x + pointer.x * 0.3, cpTarget.y - pointer.y * 0.2, cpTarget.z);
  // portrait screens: widen the lens so the panel still fits from the seat
  const fov = cam.aspect < 1 ? 62 : 42;
  if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
  lines.forEach((l, i) => {
    const c = 0.12 + i * 0.27;
    const v = range(p, c - 0.1, c) * (1 - range(p, c + 0.14, c + 0.22));
    l.style.opacity = v;
    l.style.transform = `translateY(${(1 - v) * 30}px)`;
  });
}

function updateEngine(dt) {
  const p = stickyProgress(engineSec);
  // a short swing on the open cutaway side: slanted from the front, settling into the side view
  const a = lerp(0.72, 1.5, smooth(p));
  const wide = engine.camera.aspect >= 1;
  const R = wide ? 14 : 18;
  const cam = engine.camera;
  cam.position.set(-Math.cos(a) * R, lerp(2.4, 0.8, p) - pointer.y * 0.6, Math.sin(a) * R);
  // aim off-centre so the engine sits lower-right, clear of the copy
  const fx = -cam.position.x / R, fz = -cam.position.z / R;
  const off = wide ? 2.5 : 0;
  cam.lookAt(fz * off, wide ? 0.5 : 2.2, -fx * off);
  if (engineMixer && !reduceMotion) engineMixer.update(dt * (0.6 + p));

  for (let i = 0; i < FLOW; i++) {
    flowPos[i * 3] += flowSpeed[i] * dt * (reduceMotion ? 0 : 1);
    if (flowPos[i * 3] > 5) flowPos[i * 3] = -5;
  }
  flowGeo.attributes.position.needsUpdate = true;

  // HTML labels pinned to points on the core; they appear once the cutaway side is in view
  labels.forEach((el, i) => {
    partAnchors[i].getWorldPosition(tmp).project(cam);
    const vis = range(p, 0.3 + i * 0.05, 0.42 + i * 0.05) * (1 - range(p, 0.95, 1));
    el.style.opacity = tmp.z < 1 ? vis : 0;
    const below = i % 2 === 1;
    el.classList.toggle('below', below);
    const sx = Math.min(innerWidth - 70, Math.max(70, (tmp.x * 0.5 + 0.5) * innerWidth)); // keep on screen
    el.style.transform = `translate(${sx}px, ${(-tmp.y * 0.5 + 0.5) * innerHeight + (below ? 36 : -36)}px) translate(-50%, ${below ? '0%' : '-100%'})`;
  });
}

const radarSec = document.getElementById('radar');
const radarCopy = radarSec.querySelector('.radar__copy');
const scopeEl = document.getElementById('scope');
const scope = createScope(scopeEl);
const RADAR_K = KEYS.findIndex((key) => key.stage === 'radar');
function updateRadar(dt, time, k) {
  const p = stickyProgress(radarSec);
  // 0 → 1 as the radar arrives and back to 0 as it leaves (the stage swaps in at RADAR_K ± 0.5)
  const presence = Math.min(range(k, RADAR_K - 0.5, RADAR_K - 0.3), 1 - range(k, RADAR_K + 0.3, RADAR_K + 0.5));
  radar.update({ p, dt, time, pointer, reduceMotion, presence });
  radarCopy.style.opacity = presence;
  radarCopy.style.transform = `translateY(${(1 - presence) * 40}px)`;
  scopeEl.style.opacity = presence;
  scopeEl.style.transform = `scale(${0.7 + 0.3 * presence}) rotate(${(1 - presence) * -50}deg)`;
  scope.draw(radar.sweepAngle(), time, presence);
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  const target = sample(keyPosition());
  const ease = reduceMotion ? 1 : 1 - Math.exp(-dt * (started ? 3 : 1.6));
  const { A, B, t } = target;
  const stage = (t < 0.5 ? A : B).stage;

  // flash between stages: white like punching through cloud, dark into the engine
  const flash = A.stage !== B.stage ? clamp01(1 - Math.abs(t - 0.5) * 7) : 0;
  faderEl.style.opacity = flash;
  faderEl.style.background = [A.stage, B.stage].some((st) => st === 'engine' || st === 'radar')
    ? 'radial-gradient(circle, #13284d, #040a17)' : '';

  const [top, mid, bot] = target.sky;
  skyEl.style.background = `linear-gradient(#${top.getHexString()}, #${mid.getHexString()} 55%, #${bot.getHexString()})`;
  cur.alt = lerp(cur.alt, target.alt, 1 - Math.exp(-dt * 4));
  altValue.textContent = (Math.round(cur.alt / 10) * 10).toLocaleString('en-US').padStart(6, '0');
  altFill.style.height = `${(cur.alt / 35000) * 100}%`;

  updateSky(dt, time, target, ease); // always runs so the A320 keeps its place
  if (stage === 'cockpit') updateCockpit(dt);
  if (stage === 'radar') updateRadar(dt, time, target.i + target.t);
  if (stage === 'engine') updateEngine(dt);
  else labels.forEach((el) => (el.style.opacity = 0));

  const st = stages[stage];
  renderer.render(st.scene, st.camera);
}

/* ---------- Loader → intro ---------- */
const loaderEl = document.getElementById('loader');
manager.onProgress = (_, loaded, total) => {
  const pct = Math.round((loaded / total) * 100);
  document.getElementById('loaderPct').textContent = `${pct}%`;
  document.getElementById('loaderRing').style.strokeDasharray = `${pct} 100`;
};
manager.onError = (url) => console.error('failed to load', url);
manager.onLoad = () => {
  gsap.ticker.add(frame);
  gsap.to(loaderEl, {
    opacity: 0, duration: 0.8, delay: 0.2, ease: 'power2.out',
    onComplete: () => { loaderEl.remove(); lenis?.start(); started = true; loadLazy(); },
  });
  intro();
};

/* ---------- DOM motion ---------- */
function splitWords(el) {
  el.innerHTML = el.textContent.trim().split(/\s+/)
    .map((w) => `<span class="w"><span>${w}</span></span>`).join(' ');
  return el.querySelectorAll('.w > span');
}
const heroWords = splitWords(document.getElementById('heroTag'));
gsap.set(heroWords, { yPercent: 115 });
gsap.set('.hero .eyebrow, .hero__brand, .hero .lede, .hero__cta', { y: 30, opacity: 0 });
gsap.set('#heroBack span', { opacity: 0, scale: 0.9 });
function intro() {
  const tl = gsap.timeline({ delay: 0.5 });
  tl.to(heroWords, { yPercent: 0, duration: 1.4, stagger: 0.09, ease: 'expo.out' })
    .to('.hero .eyebrow, .hero__brand, .hero .lede, .hero__cta', { y: 0, opacity: 1, duration: 1.1, stagger: 0.08, ease: 'power3.out' }, 0.3)
    .to('#heroBack span', { opacity: 1, scale: 1, duration: 2.2, ease: 'expo.out' }, 0.2);
}

// hero photo + giant 360° dissolve as we leave the ground
gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } })
  .to('#heroPhoto', { scale: 1.15, opacity: 0, ease: 'none' }, 0)
  .to('#heroBack', { yPercent: -40, opacity: 0, ease: 'none' }, 0)
  .to('.hero__content', { y: -140, opacity: 0, ease: 'none' }, 0)
  .to('.hero__scroll', { opacity: 0, ease: 'none', duration: 0.3 }, 0);

// Headings and cards
gsap.utils.toArray('.reveal, section:not(.hero):not(.sticky-sec) .eyebrow').forEach((el) =>
  gsap.from(el, { y: 60, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 88%' } })
);
gsap.from('.card', {
  y: 120, opacity: 0, rotateX: -35, rotateY: (i) => (i % 3 - 1) * 12, z: -200, duration: 1.4, stagger: 0.07, ease: 'expo.out',
  scrollTrigger: { trigger: '.grid', start: 'top 82%' },
});
if (matchMedia('(hover: hover)').matches) {
  document.querySelectorAll('.card').forEach((card) => {
    const rx = gsap.quickTo(card, 'rotateX', { duration: 0.6, ease: 'power3' });
    const ry = gsap.quickTo(card, 'rotateY', { duration: 0.6, ease: 'power3' });
    card.addEventListener('pointermove', (e) => {
      const b = card.getBoundingClientRect();
      const x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
      ry((x - 0.5) * 16);
      rx(-(y - 0.5) * 16);
      card.style.setProperty('--mx', `${x * 100}%`);
      card.style.setProperty('--my', `${y * 100}%`);
    });
    card.addEventListener('pointerleave', () => { rx(0); ry(0); });
  });
  // magnetic buttons
  document.querySelectorAll('.magnet').forEach((btn) => {
    const mx = gsap.quickTo(btn, 'x', { duration: 0.5, ease: 'power3' });
    const my = gsap.quickTo(btn, 'y', { duration: 0.5, ease: 'power3' });
    btn.addEventListener('pointermove', (e) => {
      const b = btn.getBoundingClientRect();
      mx((e.clientX - b.left - b.width / 2) * 0.3);
      my((e.clientY - b.top - b.height / 2) * 0.4);
    });
    btn.addEventListener('pointerleave', () => { mx(0); my(0); });
  });
}

// Marquee: drifts on its own, speeds up and skews with scroll velocity
const marquee = document.getElementById('marquee');
let mqX = 0;
const mqSkew = gsap.quickTo(marquee, 'skewX', { duration: 0.4, ease: 'power3' });
gsap.ticker.add((_, dt) => {
  const v = lenis ? lenis.velocity : 0;
  mqX -= (0.05 + Math.abs(v) * 0.04) * dt;
  const half = marquee.scrollWidth / 2;
  if (-mqX > half) mqX += half;
  gsap.set(marquee, { x: mqX });
  mqSkew(gsap.utils.clamp(-12, 12, -v * 0.6));
});

// Exams: authority switcher (each authority carries its flag colours into the UI)
const EXAMS = [
  {
    code: 'DGCA · VABB', name: 'India', glow: 'rgba(255, 153, 51, .35)',
    band: 'linear-gradient(90deg, #FF9933 0 33%, #ffffff 33% 66%, #138808 66%)',
    text: 'CPL and ATPL subject-wise practice in a DGCA-oriented interface: timer, question palette, mark-for-review and negative marking where it applies.',
    chips: ['CPL', 'ATPL', 'A320 / B737 type', 'RTR Part II'],
  },
  {
    code: 'SACAA · FAOR', name: 'South Africa', glow: 'rgba(0, 119, 73, .4)',
    band: 'linear-gradient(90deg, #DE3831 0 25%, #FFB612 25% 50%, #007749 50% 75%, #002395 75%)',
    text: 'A dedicated preparation area for candidates on the South African licensing pathway, with its own layout, settings and in-country FTO discovery.',
    chips: ['CPL', 'ATPL', 'FTO directory'],
  },
  {
    code: 'FAA · KJFK', name: 'United States', glow: 'rgba(60, 59, 110, .6)',
    band: 'linear-gradient(90deg, #B22234 0 33%, #ffffff 33% 66%, #3C3B6E 66%)',
    text: 'A separate space for students studying under the US system, with knowledge-test style practice, results and explanations.',
    chips: ['Private', 'Commercial', 'ATP knowledge'],
  },
];
const panelEl = document.getElementById('examPanel');
const tabs = document.querySelectorAll('.auth__item');
tabs.forEach((t, i) => t.style.setProperty('--band', EXAMS[i].band));
const ARROW = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function showExam(i, animate = true) {
  tabs.forEach((t, j) => t.setAttribute('aria-selected', String(i === j)));
  const e = EXAMS[i];
  const flag = tabs[i].querySelector('.auth__flag').outerHTML;
  const render = () => {
    panelEl.style.setProperty('--band', e.band);
    panelEl.style.setProperty('--glow', e.glow);
    panelEl.innerHTML = `<div class="exam__code">${e.code}</div>`
      + `<div class="exam__head">${flag}<h3>${e.name}</h3></div><p>${e.text}</p>`
      + `<ul class="exam__chips">${e.chips.map((c) => `<li>${c}</li>`).join('')}</ul>`
      + `<div class="exam__foot"><span class="exam__status"><i></i>Opens in Phase 2</span>`
      + `<a class="exam__cta" href="#board">Get notified ${ARROW}</a></div>`;
    panelEl.querySelector('.exam__cta').addEventListener('click', (ev) => {
      ev.preventDefault();
      lenis ? lenis.scrollTo('#board', { duration: 2.2 }) : document.getElementById('board').scrollIntoView();
    });
  };
  if (!animate) return render();
  gsap.timeline()
    .to(panelEl.children, { opacity: 0, y: -10, duration: 0.2, stagger: 0.02, ease: 'power2.in', onComplete: render })
    .add(() => gsap.from(panelEl.children, { opacity: 0, y: 18, duration: 0.6, stagger: 0.05, ease: 'expo.out' }));
}
tabs.forEach((t) => t.addEventListener('click', () => showExam(+t.dataset.i)));
showExam(0, false);
gsap.from('.auth__item, .auth__more', { y: 30, opacity: 0, duration: 1, stagger: 0.08, ease: 'expo.out', scrollTrigger: { trigger: '.auth', start: 'top 85%' } });
gsap.from(panelEl, { y: 60, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.auth', start: 'top 85%' } });

// Departure board with split-flap characters
const DEPARTURES = [
  ['14 NOV', '19:00', 'DGCA Air Navigation: live doubt session', 'WEBINAR', 'ON TIME'],
  ['21 NOV', '18:30', 'Cadet pilot selection: what to expect', 'ONLINE', 'BOARDING'],
  ['05 DEC', '20:00', 'SACAA pathway Q&A', 'WEBINAR', 'SCHEDULED'],
  ['12 DEC', '19:00', '1:1 mentorship slots open', 'BOOKING', 'OPEN'],
];
const flap = (s) => `<span class="flap">${[...s].map((c) => `<i>${c === ' ' ? '&nbsp;' : c}</i>`).join('')}</span>`;
document.getElementById('departures').innerHTML =
  `<div class="dep dep--head"><span>DATE</span><span>IST</span><span>SESSION</span><span>FORMAT</span><span>STATUS</span></div>` +
  DEPARTURES.map(([d, tm, title, f, s]) =>
    `<div class="dep">${flap(d)}${flap(tm)}<span class="dep__title">${title}</span><span>${flap(f)}</span><span class="dep__status">${s}</span></div>`).join('');
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:';
ScrollTrigger.create({
  trigger: '.departures', start: 'top 80%', once: true,
  onEnter: () => {
    gsap.from('.dep:not(.dep--head)', { opacity: 0, x: -40, duration: 0.9, stagger: 0.12, ease: 'expo.out' });
    document.querySelectorAll('.flap i').forEach((cell, n) => {
      const final = cell.textContent;
      if (final.trim() === '' || reduceMotion) return;
      let flips = 6 + (n % 7);
      const tick = () => {
        if (flips-- <= 0) { cell.textContent = final; return; }
        cell.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        gsap.fromTo(cell, { rotateX: -90 }, { rotateX: 0, duration: 0.07, ease: 'none', onComplete: tick });
      };
      gsap.delayedCall(n * 0.02, tick);
    });
  },
});

// Boarding pass: 3D tilt, glare and holographic foil that follow the pointer
function tiltPass(card) {
  if (!matchMedia('(hover: hover)').matches) return;
  const rx = gsap.quickTo(card, 'rotateX', { duration: 0.8, ease: 'power3' });
  const ry = gsap.quickTo(card, 'rotateY', { duration: 0.8, ease: 'power3' });
  card.addEventListener('pointermove', (e) => {
    const b = card.getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
    ry((x - 0.5) * 10);
    rx(-(y - 0.5) * 10);
    card.style.setProperty('--gx', `${x * 100}%`);
    card.style.setProperty('--gy', `${y * 100}%`);
    card.style.setProperty('--hx', `${x * 100}%`);
  });
  card.addEventListener('pointerleave', () => { rx(0); ry(0); });
}
const form = document.getElementById('passForm');
tiltPass(form);
tiltPass(document.getElementById('printedPass'));
gsap.from(form, { y: 140, rotateX: 40, opacity: 0, duration: 1.6, ease: 'expo.out', scrollTrigger: { trigger: form, start: 'top 90%' } });
// The little plane flies the dotted arc: same quadratic curve as the SVG path (M4 36 Q100 -10 196 36
// in a 200×40 box stretched to the arc's size), nose turned along the tangent.
const arcEl = document.querySelector('.pass__arc');
const passPlane = document.querySelector('.pass__plane');
const flight = { t: 0 };
gsap.to(flight, {
  t: 1, duration: 4.5, repeat: -1, repeatDelay: 0.5, ease: 'sine.inOut',
  onUpdate: () => {
    const { t } = flight, u = 1 - t;
    const sx = arcEl.clientWidth / 200, sy = arcEl.clientHeight / 40;
    const x = (u * u * 4 + 2 * u * t * 100 + t * t * 196) * sx;
    const y = (u * u * 36 + 2 * u * t * -10 + t * t * 36) * sy;
    const dx = (2 * u * (100 - 4) + 2 * t * (196 - 100)) * sx;
    const dy = (2 * u * (-10 - 36) + 2 * t * (36 + 10)) * sy;
    passPlane.style.transform = `translate(${x - 12}px, ${y - 12}px) rotate(${Math.atan2(dy, dx)}rad)`;
    passPlane.style.opacity = Math.min(1, t * 8, (1 - t) * 8);
  },
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const err = document.getElementById('passErr');
  if (!data.name.trim() || !/^\S+@\S+\.\S+$/.test(data.email) || !data.pathway || !data.country) {
    err.textContent = 'Please add your name, a valid email, a pathway and a country.';
    gsap.fromTo(form, { x: -10 }, { x: 0, duration: 0.6, ease: 'elastic.out(1, 0.3)' });
    return;
  }
  err.textContent = '';
  // TODO: send `data` to the registration backend once it exists.
  document.getElementById('pName').textContent = data.name.trim();
  document.getElementById('pPath').textContent = data.pathway;
  document.getElementById('pCountry').textContent = data.country;
  document.getElementById('pNo').textContent = `AS360-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  document.getElementById('pBar').innerHTML = Array.from({ length: 56 }, () =>
    `<i style="flex:${1 + Math.floor(Math.random() * 3)};opacity:${Math.random() > 0.25 ? 1 : 0}"></i>`).join('');

  const printed = document.getElementById('printed');
  gsap.timeline()
    .to(form, { rotateX: -70, y: 80, opacity: 0, duration: 0.6, ease: 'power3.in' })
    .add(() => { form.style.display = 'none'; printed.style.display = 'block'; ScrollTrigger.refresh(); })
    .fromTo('#printedPass', { clipPath: 'inset(0 0 100% 0)', y: -50, rotateZ: -2 },
      { clipPath: 'inset(0 0 0% 0)', y: 0, rotateZ: 0, duration: 1.6, ease: 'steps(16)' })
    .to('#printedPass', { rotateZ: 1.5, duration: 1, ease: 'elastic.out(1, 0.4)' })
    .from('.printed .note', { opacity: 0, y: 10, duration: 0.6 }, '-=0.6');
});
