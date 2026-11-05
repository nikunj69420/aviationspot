import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { createHeadsetStage } from './headset.js?v=4';
import { createGlobe } from './globe.js?v=2';

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
  // pillars: the A320 was just seen from the flight deck fly-out, so it stays up out of frame here
  { stage: 'sky', pm: [0, 26, -30], p: [0, 22, -30], r: [0.25, 1.1, 0.12], s: 1, cy: -3.2, alt: 5000, sky: ['#2a63b4', '#6aa3dc', '#d6e8f6'] },
  { stage: 'engine', p: [3.8, 0.4, -2], r: [-0.3, -0.5, 0.06], s: 1, cy: -4, alt: 8000, sky: ['#040a17', '#0a1830', '#13284d'] },
  // exams: the A320 climbs out of frame so the globe has the right side to itself
  { stage: 'sky', pm: [0, 26, -30], p: [2, 22, -30], r: [-0.08, -0.32, 0.04], s: 1.1, cy: -4.5, alt: 10000, sky: ['#12397a', '#3f7ccb', '#a9cdee'] },
  { stage: 'headset', p: [9, 6, -14], r: [0.3, Math.PI + 0.45, 0.08], s: 1, cy: -7, alt: 14000, sky: ['#0a1230', '#2b2c55', '#b8684a'] },
  // story + impact: the A320 climbs out of frame so the reading sections stay clean
  { stage: 'sky', pm: [0, 26, -30], p: [-4, 22, -30], r: [0.3, Math.PI + 0.45, 0.08], s: 1, cy: -6.5, alt: 18000, sky: ['#0a2456', '#23559e', '#6f9fd6'] },
  { stage: 'sky', pm: [0, 26, -30], p: [4, 22, -30], r: [0.18, -0.4, 0.06], s: 1, cy: -9.5, alt: 24000, sky: ['#0a1d48', '#2c4f8f', '#9a9fc4'] },
  // identity: still out of frame, so the logo has the stage
  { stage: 'sky', pm: [0, 26, -30], p: [-4, 22, -30], r: [0.18, -0.4, 0.06], s: 1, cy: -9.8, alt: 27000, sky: ['#0a1a44', '#33508c', '#b29bb8'] },
  // founder: kept out of frame too; the A320 comes back for the boarding pass take-off
  { stage: 'sky', pm: [0, 26, -30], p: [6, 22, -30], r: [0.14, -0.3, 0.05], s: 1, cy: -10, alt: 30000, sky: ['#0a1838', '#40477e', '#d0906a'] },
  { stage: 'sky', pm: [1.5, 7, -6], p: [3.4, 2.3, -4], r: [0.12, -0.35, 0.05], s: 1.05, cy: -8, alt: 35000, sky: ['#0a1838', '#6b4a7a', '#f3a35a'] },
  { stage: 'sky', p: [10, 5.5, -5], r: [0.1, -0.2, 0.12], s: 1, cy: -8, alt: 35000, sky: ['#071226', '#3a3566', '#d98a4f'] },
];
const sections = [...document.querySelectorAll('main > section'), document.querySelector('.footer')];
// Each section owns a span of scroll where its keyframe holds: a normal section is just its midpoint,
// a pinned 3D section holds for the whole time it's pinned. Scene changes happen between spans.
let spans = [];
const measure = () => {
  const H = innerHeight;
  spans = sections.map((el) => {
    const top = el.offsetTop, h = el.offsetHeight;
    // pinned sections and long reading sections (data-hold) keep their scene from edge to edge
    return el.classList.contains('sticky-sec') || el.hasAttribute('data-hold') ? [top + H / 2, top + h - H / 2] : [top + h / 2, top + h / 2];
  });
  spans[0] = [H / 2, Math.max(H / 2, spans[0][1])];
  const end = document.documentElement.scrollHeight - H / 2;
  spans[spans.length - 1] = [end, end];
};
ScrollTrigger.addEventListener('refresh', measure);
measure();

// Continuous position along KEYS, e.g. 2.4 = 40% of the way from pillars to the engine
function keyPosition() {
  const y = scrollY + innerHeight / 2;
  if (y <= spans[0][1]) return 0;
  for (let i = 0; i < spans.length - 1; i++) {
    if (y <= spans[i][1]) return i;
    if (y < spans[i + 1][0]) return i + smooth((y - spans[i][1]) / (spans[i + 1][0] - spans[i][1]));
  }
  return spans.length - 1;
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
// models are meshopt-compressed .glb files with WebP textures (see tools/compress_models.py)
const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder); // needed before the page opens
const lazyLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);    // fetched in the background afterwards

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

loader.load('assests/a320/a320.glb?v=2', (gltf) => {
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
  cockpitExterior.add(wrap.clone()); // the flight deck's exterior for the fly-out
  miniRoll.add(wrap.clone()); // the flight log's top-down aircraft shares the geometry and livery
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
   Stage 2: COCKPIT — the A320 flight deck, from the captain's seat
   ========================================================= */
// kept in the model's own units (≈ 0.3 m): nose points -Z, captain on the left (-X),
// main panel ≈ z -10, throttle quadrant ≈ (0, -2, -9.5), overhead panel from z -9 back over the seats
const cockpit = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(46, 1, 0.05, 400) };
cockpit.scene.environment = envMap;
// minimal light, like a flight deck before dawn: a dim sky glow, the low sun through the windshield,
// and the panel's own lit displays and annunciators (the model's emissive maps) doing the rest
cockpit.scene.add(new THREE.HemisphereLight(0x9fb4e0, 0x0c1022, 0.35));
const cpKey = new THREE.DirectionalLight(0xffc48e, 1.3);
cpKey.position.set(-6, 10, -40);
cockpit.scene.add(cpKey);
const cpFill = new THREE.DirectionalLight(0x8fb2ff, 0.25);
cpFill.position.set(8, 6, 10);
cockpit.scene.add(cpFill);
const flightDeck = new THREE.Group();
cockpit.scene.add(flightDeck);
// the same AviationSpot360 A320 as the sky scene, scaled to line up round the flight deck, so the
// camera can fly out through the windshield and look back at the nose (its own faces are culled from inside)
const cockpitExterior = new THREE.Group();
cockpitExterior.rotation.y = Math.PI / 2; // the shared model's nose points +X; the flight deck faces -Z
cockpitExterior.position.set(0, 0.6, 37);
cockpitExterior.scale.setScalar(114 / 4.6); // ≈ 37.6 m airliner in the flight deck's ≈ 0.33 m units
cockpitExterior.visible = false;
cockpit.scene.add(cockpitExterior);
const cpHemi = cockpit.scene.children.find((o) => o.isHemisphereLight);
// starts downloading straight away, but the loading screen doesn't wait for it
lazyLoader.load('assests/a320_cockpit/a320_cockpit.glb?v=3', (gltf) => {
  const m = gltf.scene;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  m.traverse((o) => {
    if (!o.isMesh) return;
    const mat = o.material;
    mat.envMapIntensity = 0.25;
    for (const tex of [mat.map, mat.emissiveMap]) if (tex) tex.anisotropy = maxAniso; // crisp at grazing angles
    if (mat.emissiveMap) mat.emissiveIntensity = 1.15; // displays and annunciators
  });
  flightDeck.add(m);
});

// camera beats from the captain's seat: [progress, eye, target]
const CP_PATH = [
  [0.0, [-2.4, 1.3, -5.0], [-0.6, 3.5, -6.4]],     // straight up to the overhead panel from the captain's seat
  [0.45, [-2.3, 1.25, -5.2], [0.4, 3.6, -7.4]],    // drifting slowly across it
  [0.62, [-2.4, 1.3, -5.2], [-1.5, 2.2, -20]],     // then look out through the windshield
  [0.76, [-1.8, 2.8, -14], [-1.5, 2.8, -40]],      // and fly out through the glass...
  [1.0, [-36, 9, -66], [-5, 0, -14]],              // ...swinging round to look back at the AviationSpot360 nose
]
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
const rimA = new THREE.PointLight(0x00a2e5, 40, 16);
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

/* Stage 4: HEADSET — the AviationSpot360 pilot headset, where the story begins (see headset.js) */
const headset = createHeadsetStage({ envMap, loader: lazyLoader });

const stages = { sky, cockpit, engine, headset };

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
  headset.load();
  lazyLoader.load('assests/jet_engine/jet_engine.glb', (gltf) => {
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
  lazyLoader.load('assests/g650/g650.glb', (gltf) => {
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

const departure = { t: 0 }; // 0 = on station, 1 = gone (climbed out after boarding)
const handoff = { x: 0 }; // world-X offset while the A320 decelerates in from the pass hand-off cut
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
  plane.position.x += handoff.x;
  if (departure.t > 0) {
    const d = departure.t * departure.t;
    plane.rotation.z += departure.t * 0.32; // pitch up into the climb
    fwd.set(1, 0, 0).applyEuler(plane.rotation);
    plane.position.addScaledVector(fwd, d * 70);
    plane.position.y += d * 8;
  }
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
  const trailVis = plane.visible ? Math.max(range(k, 1.6, 2.4) * (1 - range(k, 10.4, 11)), departure.t > 0 ? 1 : 0) : 0;
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

  stars.material.opacity = range(k, 9.4, 10.2) * 0.85;
  flareLight.intensity = 1;
  flare.visible = k < 0.9 || k > 9.5;

  // G650 crosses right → left as the flight log hands over to the impact section
  const jt = clamp01((k - 6) / 1);
  jet.visible = jet.children.length > 0 && jt > 0 && jt < 1;
  if (jet.visible) {
    jet.position.set(lerp(13, -13, jt), lerp(-3.4, -1.6, jt) + Math.sin(time) * 0.05, -6);
    jet.rotation.set(0.25 * Math.sin(jt * Math.PI), 0.25, 0.05, 'YZX');
  }
  sky.scene.fog.color.copy(target.sky[1]);
}

function updateCockpit() {
  const p = stickyProgress(cockpitSec);
  cockpitPose(p);
  // outside the glass: show the airliner's skin and bring the daylight up
  const out = range(p, 0.72, 0.84);
  cockpitExterior.visible = p > 0.66;
  flightDeck.visible = p < 0.75; // its shell is bigger than the airliner's nose, so it goes once we're through the glass
  cpHemi.intensity = lerp(0.35, 1.2, out);
  cpKey.intensity = lerp(1.3, 2.8, out);
  const cam = cockpit.camera;
  // pointer parallax: a small head turn from the seat
  cam.position.copy(cpEye).add(tmp.set(pointer.x * 0.3, -pointer.y * 0.15, 0));
  cam.lookAt(cpTarget.x + pointer.x * 0.8, cpTarget.y - pointer.y * 0.5, cpTarget.z);
  // portrait screens: widen the lens so the panel still fits from the seat
  const fov = cam.aspect < 1 ? 68 : 46;
  if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
  // one line over the overhead panel, from the moment we're in the seat until we look out of the windshield
  lines.forEach((l) => {
    const v = range(p, 0, 0.05) * (1 - range(p, 0.56, 0.62));
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
  const off = wide ? 3.4 : 0;
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

// The first transmission: tune from ground to tower, the tower's take-off clearance types out over the radio,
// then our read-back. Everything follows the scroll, so scrolling back rewinds the call.
const txSec = document.getElementById('transmission');
const txFade = [txSec.querySelector('.tx__copy'), document.getElementById('atc')];
const HEADSET_K = KEYS.findIndex((key) => key.stage === 'headset');
const freqActive = document.getElementById('freqActive');
const freqStby = document.getElementById('freqStby');
const freqTag = document.getElementById('freqTag');
const radioRx = document.getElementById('radioRx');
const radioTx = document.getElementById('radioTx');
const atcClear = document.getElementById('atcClear');
const meterBars = [...document.querySelectorAll('#radioMeter i')];
const atcMsgs = [...document.querySelectorAll('.atc__msg')].map((el) => {
  const p = el.querySelector('p');
  const m = { el, p, text: p.textContent, from: +el.dataset.from, to: +el.dataset.to, shown: -1, us: el.classList.contains('atc__msg--us') };
  p.textContent = '';
  return m;
});
const khz = (v) => (Math.round(v * 40) / 40).toFixed(3); // 25 kHz channel steps
let talkLevel = 0;
function updateHeadset(dt, time, k) {
  const p = stickyProgress(txSec);
  // arrives over most of the hand-over from the engine scene, leaves as soon as the flight log scrolls in
  const presence = Math.min(range(k, HEADSET_K - 0.5, HEADSET_K - 0.02), 1 - range(k, HEADSET_K + 0.02, HEADSET_K + 0.32));
  const tune = range(p, 0.03, 0.14);
  freqActive.textContent = khz(lerp(121.9, 118.1, tune));
  freqStby.textContent = khz(lerp(118.1, 121.9, tune));
  freqTag.textContent = tune < 0.5 ? 'GND' : 'TWR';
  let who = null;
  for (const m of atcMsgs) {
    const t = clamp01((p - m.from) / (m.to - m.from));
    const n = reduceMotion ? (t > 0 ? m.text.length : 0) : Math.round(t * m.text.length);
    if (n !== m.shown) { m.p.textContent = m.text.slice(0, n); m.shown = n; }
    m.el.classList.toggle('show', p > m.from - 0.03);
    const typing = t > 0 && t < 1;
    m.el.classList.toggle('typing', typing);
    if (typing) who = m.us ? 'tx' : 'rx';
  }
  radioRx.classList.toggle('on', who === 'rx');
  radioTx.classList.toggle('on', who === 'tx');
  atcClear.classList.toggle('show', p > 0.78);
  talkLevel = lerp(talkLevel, who ? 1 : 0, 1 - Math.exp(-dt * 8));
  meterBars.forEach((bar, i) => {
    const voice = Math.abs(Math.sin(time * 11 + i * 1.7) * Math.sin(time * 6.3 + i * 0.63));
    const idle = 0.05 + 0.05 * Math.abs(Math.sin(time * 1.8 + i));
    bar.style.transform = `scaleY(${(idle + talkLevel * voice * 0.9).toFixed(3)})`;
  });
  headset.update({ p, dt, time, pointer, reduceMotion, presence, talk: talkLevel });
  for (const el of txFade) {
    el.style.opacity = presence;
    el.style.transform = `translateY(${(1 - presence) * 40}px)`;
  }
}

/* ---------- Flight log aircraft: a small A320 seen from above that flies in and follows the rail ----------
   It has its own little canvas above the page, so it flies over the waypoints rather than under them. */
const MINI = 150; // css px box the aircraft is drawn in
const miniCanvas = document.createElement('canvas');
miniCanvas.className = 'mini-plane';
miniCanvas.setAttribute('aria-hidden', 'true');
document.body.appendChild(miniCanvas);
const miniRenderer = new THREE.WebGLRenderer({ canvas: miniCanvas, antialias: true, alpha: true });
miniRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
miniRenderer.setSize(MINI, MINI);
miniRenderer.outputColorSpace = THREE.SRGBColorSpace;
miniRenderer.toneMapping = THREE.ACESFilmicToneMapping;
const mini = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(28, 1, 0.1, 60) };
mini.scene.environment = new THREE.PMREMGenerator(miniRenderer).fromScene(new RoomEnvironment(), 0.04).texture;
mini.scene.add(new THREE.HemisphereLight(0xffffff, 0x223355, 1.1));
const miniSun = new THREE.DirectionalLight(0xffffff, 2.2);
miniSun.position.set(-3, 8, -2);
mini.scene.add(miniSun);
mini.camera.up.set(0, 0, -1); // screen up = -Z, so screen right = +X and screen down = +Z
mini.camera.position.set(0, 14, 0);
mini.camera.lookAt(0, 0, 0);
const miniYaw = new THREE.Group();
const miniRoll = new THREE.Group();
miniYaw.add(miniRoll);
mini.scene.add(miniYaw);
const logEl = document.getElementById('log');
const logRail = document.querySelector('.log__rail');
let miniShown = false;
function drawMiniPlane() {
  const hide = () => { if (miniShown) { miniCanvas.style.visibility = 'hidden'; miniShown = false; } };
  if (!miniRoll.children.length || !railST || !entryST) return hide();
  const r = logEl.getBoundingClientRect();
  if (r.bottom < -MINI || r.top > innerHeight + MINI) return hide();
  const en = smooth(entryST.progress);                      // 0 = off the left edge, 1 = on the rail
  const ax = r.left + 12;                                    // the rail's centre line
  const ay = r.top + 10 + railST.progress * logRail.offsetHeight;
  // comes in level from the left, then banks into one smooth turn onto the rail and flies straight down it
  const turn = range(en, 0.5, 1);
  const x = lerp(-MINI, ax, smooth(clamp01(en / 0.85)));
  const y = ay - (1 - turn) * 70;
  miniYaw.rotation.y = lerp(0, -Math.PI / 2, turn);
  miniRoll.rotation.x = Math.sin(turn * Math.PI) * 0.5;
  if (x + MINI / 2 < 0 || x - MINI / 2 > innerWidth || y + MINI / 2 < 0 || y - MINI / 2 > innerHeight) return hide();
  miniCanvas.style.transform = `translate3d(${(x - MINI / 2).toFixed(1)}px, ${(y - MINI / 2).toFixed(1)}px, 0)`;
  if (!miniShown) { miniCanvas.style.visibility = 'visible'; miniShown = true; }
  miniRenderer.render(mini.scene, mini.camera);
}
let railST = null, entryST = null; // set up with the flight log below

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
  faderEl.style.background = [A.stage, B.stage].some((st) => st === 'engine' || st === 'headset')
    ? 'radial-gradient(circle, #13284d, #040a17)' : '';

  const [top, mid, bot] = target.sky;
  skyEl.style.background = `linear-gradient(#${top.getHexString()}, #${mid.getHexString()} 55%, #${bot.getHexString()})`;
  cur.alt = lerp(cur.alt, target.alt, 1 - Math.exp(-dt * 4));
  altValue.textContent = (Math.round(cur.alt / 10) * 10).toLocaleString('en-US').padStart(6, '0');
  altFill.style.height = `${(cur.alt / 35000) * 100}%`;

  updateSky(dt, time, target, ease); // always runs so the A320 keeps its place
  if (stage === 'cockpit') updateCockpit();
  if (stage === 'headset') updateHeadset(dt, time, target.i + target.t);
  if (stage === 'engine') updateEngine(dt);
  else labels.forEach((el) => (el.style.opacity = 0));

  const st = stages[stage];
  renderer.render(st.scene, st.camera);
  drawMiniPlane();
}

/* ---------- Loader → intro ---------- */
const loaderEl = document.getElementById('loader');
manager.onProgress = (_, loaded, total) => {
  const pct = Math.round((loaded / total) * 100);
  document.getElementById('loaderPct').textContent = `${pct}%`;
  document.getElementById('loaderBar').style.transform = `scaleX(${pct / 100})`;
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
// the logo wipes in left to right, then the copy rises in
gsap.set('.hero__logo', { clipPath: 'inset(0 100% 0 0)', y: 16 });
gsap.set('.hero .eyebrow, .hero .lede, .hero__cta', { y: 30, opacity: 0 });
function intro() {
  const tl = gsap.timeline({ delay: 0.5 });
  tl.to('.hero__logo', { clipPath: 'inset(0 0% 0 0)', y: 0, duration: 1.6, ease: 'expo.inOut' })
    .to('.hero .eyebrow, .hero .lede, .hero__cta', { y: 0, opacity: 1, duration: 1.1, stagger: 0.08, ease: 'power3.out' }, 0.7);
}

// hero photo dissolves as we leave the ground
gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } })
  .to('#heroPhoto', { scale: 1.15, opacity: 0, ease: 'none' }, 0)
  .to('.hero__content', { y: -140, opacity: 0, ease: 'none' }, 0)
  .to('.hero__scroll', { opacity: 0, ease: 'none', duration: 0.3 }, 0);

// Section labels like "04 · Above the clouds": the number becomes a badge before the name
document.querySelectorAll('.eyebrow').forEach((el) => {
  const m = el.childElementCount === 0 && el.textContent.trim().match(/^(\d{2})\s*·\s*(.+)$/);
  if (m) el.innerHTML = `<span class="eyebrow__n">${m[1]}</span><span class="eyebrow__t">${m[2]}</span>`;
});

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
  const render = () => {
    panelEl.style.setProperty('--band', e.band);
    panelEl.style.setProperty('--glow', e.glow);
    panelEl.innerHTML = `<div class="exam__code">${e.code}</div><p>${e.text}</p>`
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
// the globe flies to each authority's route (India: both routes out of Mumbai)
const globe = createGlobe({ host: document.getElementById('globe'), labels: document.querySelector('.globe__labels'), reduceMotion, gsap });
tabs.forEach((t) => t.addEventListener('click', () => { showExam(+t.dataset.i); globe.focus(+t.dataset.i); }));
showExam(0, false);
gsap.from('.auth__item, .auth__more', { y: 30, opacity: 0, duration: 1, stagger: 0.08, ease: 'expo.out', scrollTrigger: { trigger: '.auth', start: 'top 85%' } });
gsap.from(panelEl, { y: 60, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.auth', start: 'top 85%' } });
gsap.from('#globe', { scale: 0.6, opacity: 0, rotate: -20, duration: 1.8, ease: 'expo.out', scrollTrigger: { trigger: '.auth', start: 'top 80%' } });

// Flight log: the rail fills as you read, and the leg in the middle of the screen lights up
const logItems = [...document.querySelectorAll('.log__item')];
railST = gsap.to('#logRail', { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '#log', start: 'top 60%', end: 'bottom 60%', scrub: true } }).scrollTrigger;
entryST = ScrollTrigger.create({ trigger: '#log', start: 'top bottom', end: 'top 60%' }); // the aircraft flies in from the side
logItems.forEach((item) => {
  ScrollTrigger.create({
    trigger: item, start: 'top 62%', end: 'bottom 62%',
    onToggle: (self) => {
      item.classList.toggle('is-on', self.isActive);
    },
  });
  gsap.from(item.querySelector('.log__body'), { x: 40, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: item, start: 'top 85%' } });
});

// Impact: numbers count up, achievement cards rise in
document.querySelectorAll('[data-count]').forEach((el) => {
  const end = +el.dataset.count, n = { v: 0 };
  el.textContent = '0';
  gsap.to(n, {
    v: end, duration: 2.2, ease: 'power3.out',
    scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    onUpdate: () => (el.textContent = Math.round(n.v).toLocaleString('en-IN')),
  });
});
gsap.from('.stat', { y: 40, opacity: 0, duration: 1.1, stagger: 0.08, ease: 'expo.out', scrollTrigger: { trigger: '.stats', start: 'top 85%' } });
gsap.from('.feat', { y: 70, opacity: 0, duration: 1.2, stagger: 0.06, ease: 'expo.out', scrollTrigger: { trigger: '.feats', start: 'top 85%' } });
// achievement cards flip to their brief on click, tap, Enter or Space
document.querySelectorAll('.feat').forEach((card) => {
  const title = card.querySelector('h3').textContent;
  const flip = () => {
    const on = card.classList.toggle('is-flipped');
    card.setAttribute('aria-pressed', String(on));
    card.setAttribute('aria-label', `${title}: ${on ? 'show title' : 'show details'}`);
  };
  card.addEventListener('click', flip);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
  });
});

// Flight deck note: the founder's line brightens word by word as it scrolls past
const quote = document.getElementById('deckQuote');
const words = (s) => s.replace(/(\S+)/g, '<span class="w">$1</span>');
quote.querySelectorAll('em').forEach((em) => (em.innerHTML = words(em.textContent)));
[...quote.childNodes].forEach((node) => {
  if (node.nodeType !== 3) return;
  const tmpEl = document.createElement('span');
  tmpEl.innerHTML = words(node.textContent);
  node.replaceWith(...tmpEl.childNodes);
});
gsap.fromTo(quote.querySelectorAll('.w'), { opacity: 0.16 }, {
  opacity: 1, stagger: 0.1, ease: 'none',
  scrollTrigger: { trigger: quote, start: 'top 80%', end: 'bottom 45%', scrub: true },
});
gsap.from('.deck__letter, .founder__sign', { y: 30, opacity: 0, duration: 1.1, stagger: 0.1, ease: 'expo.out', scrollTrigger: { trigger: '.deck__letter', start: 'top 88%' } });
gsap.from('.values li', { y: 20, opacity: 0, scale: 0.92, duration: 0.8, stagger: 0.06, ease: 'back.out(2)', scrollTrigger: { trigger: '.values', start: 'top 90%' } });

// Founder's sign-off writes itself: a pen traces each letter in turn, and the ink fills in just behind it
const sigLetters = [...document.querySelectorAll('.signature .sig__l')];
if (sigLetters.length && !reduceMotion) {
  const lens = sigLetters.map((p) => p.getTotalLength());
  sigLetters.forEach((p, i) => Object.assign(p.style, { strokeDasharray: lens[i], strokeDashoffset: lens[i], fillOpacity: 0 }));
  const write = gsap.timeline({ paused: true });
  let at = 0;
  sigLetters.forEach((p, i) => {
    if (i === 6) at += 0.35; // the pen lifts after "Yours," before "Flyboy"
    const dur = 0.28 + lens[i] / 5200; // longer strokes take longer, like a real pen
    write.to(p, { strokeDashoffset: 0, duration: dur, ease: 'power1.inOut' }, at)
      .to(p, { fillOpacity: 1, duration: 0.45, ease: 'power1.out' }, at + dur * 0.7);
    at += dur * 0.8 + 0.04;
  });
  ScrollTrigger.create({ trigger: '.founder__sign', start: 'top 80%', once: true, onEnter: () => write.play() });
}

// Founder: profile card, then the journey route draws across its stops
gsap.from('.founder__card', { y: 60, opacity: 0, rotateY: -12, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: '.founder__grid', start: 'top 80%' } });
gsap.from('.founder__story p', { y: 30, opacity: 0, duration: 1.1, stagger: 0.12, ease: 'expo.out', scrollTrigger: { trigger: '.founder__story', start: 'top 75%' } });
gsap.to('.journey__line span', { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '.journey', start: 'top 85%', end: 'bottom 55%', scrub: true } });
gsap.from('.journey li:not(.journey__line)', { y: 30, opacity: 0, duration: 0.9, stagger: 0.12, ease: 'expo.out', scrollTrigger: { trigger: '.journey', start: 'top 82%' } });

// Identity: each symbol of the logo, picked from the tabs or the hotspots, gets a glowing ring
const anatomy = document.getElementById('anatomy');
const RINGS = JSON.parse(anatomy.dataset.rings);
const ringEl = anatomy.querySelector('.anatomy__ring');
const aTabs = [...anatomy.querySelectorAll('.anatomy__tab')];
const aSpots = [...anatomy.querySelectorAll('.anatomy__spot')];
const aTexts = [...anatomy.querySelectorAll('.anatomy__text')];
let anatomyI = 0, anatomyTouched = false;
function showSymbol(i) {
  anatomyI = i;
  const [x, y, w, h] = RINGS[i];
  Object.assign(ringEl.style, { left: `${(x / 1564) * 100}%`, top: `${(y / 473) * 100}%`, width: `${(w / 1564) * 100}%`, height: `${(h / 473) * 100}%` });
  aTabs.forEach((t, j) => t.setAttribute('aria-selected', String(i === j)));
  aSpots.forEach((s, j) => s.setAttribute('aria-current', String(i === j)));
  aTexts.forEach((p, j) => { p.hidden = i !== j; });
  if (!reduceMotion) gsap.fromTo(aTexts[i], { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' });
}
[...aTabs, ...aSpots].forEach((el) => el.addEventListener('click', () => { anatomyTouched = true; showSymbol(+el.dataset.i); }));
showSymbol(0);
// walks through the symbols on its own while on screen, until the visitor picks one
let anatomyVisible = false;
new IntersectionObserver(([e]) => { anatomyVisible = e.isIntersecting; }, { threshold: 0.4 }).observe(anatomy);
setInterval(() => { if (anatomyVisible && !anatomyTouched && !reduceMotion) showSymbol((anatomyI + 1) % RINGS.length); }, 4200);
gsap.from('.anatomy__stage', { y: 60, opacity: 0, scale: 0.96, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: anatomy, start: 'top 82%' } });
gsap.from('.anatomy__tab', { y: 24, opacity: 0, duration: 0.9, stagger: 0.07, ease: 'expo.out', scrollTrigger: { trigger: '.anatomy__tabs', start: 'top 90%' } });
gsap.from('.meaning > div', { y: 50, opacity: 0, duration: 1.2, stagger: 0.1, ease: 'expo.out', scrollTrigger: { trigger: '.meaning', start: 'top 85%' } });
gsap.from('.ideas li', { y: 30, opacity: 0, duration: 1, stagger: 0.08, ease: 'expo.out', scrollTrigger: { trigger: '.ideas', start: 'top 85%' } });

// Boarding pass: 3D tilt, glare and holographic foil that follow the pointer
function tiltPass(card) {
  if (!matchMedia('(hover: hover)').matches) return;
  const rx = gsap.quickTo(card, 'rotateX', { duration: 0.8, ease: 'power3' });
  const ry = gsap.quickTo(card, 'rotateY', { duration: 0.8, ease: 'power3' });
  card.addEventListener('pointermove', (e) => {
    if (card.classList.contains('is-boarding')) return;
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

// Boarding: check in → stamp → stub tears off → the pass whip-cuts into the A320 → take-off
const CHECKIN_MS = 5000; // how long "Checking in…" holds before the pass tears away
const passMain = form.querySelector('.pass__main');
const passStub = form.querySelector('.pass__stub');
const passBtn = form.querySelector('.btn--stub');
const passStatus = form.querySelector('.pass__status');
const passStamp = form.querySelector('.pass__stamp');
const passBar = form.querySelector('.pass__progress span');
const clearance = document.getElementById('clearance');
const BTN_LABEL = passBtn.innerHTML;

// jagged edge where the stub rips off along the perforation
function tornEdge(el) {
  const h = el.offsetHeight, steps = Math.round(h / 9), pts = ['100% 0', '100% 100%'];
  for (let i = steps; i >= 0; i--) pts.push(`${i % 2 ? 0 : 7}px ${((i / steps) * 100).toFixed(1)}%`);
  return `polygon(${pts.join(', ')})`;
}

// Pass → plane hand-off, ported from the HyperFrames "cut-the-curve" primitive: a velocity-matched
// hard cut. The pass accelerates right (power4.in) and blurs; at peak speed it swaps for the A320,
// which arrives from the far side of the same vector at the same blur and decelerates (power4.out).
// Distances keep the primitive's split, so the speed at the seam matches.
const CUT = { duration: 1.1, cutFraction: 0.33, blurPx: 12, seamOpacity: 0.72, outDistance: 0.34 };
function cutTheCurve() {
  const T = CUT.duration, cutAt = T * CUT.cutFraction, entry = T - cutAt;
  const outPx = innerWidth * CUT.outDistance;
  const inPx = outPx * (entry / cutAt);
  // screen pixels → world units at the plane's depth, so the A320 crosses the same screen distance
  const depth = sky.camera.position.distanceTo(plane.position);
  const worldPerPx = (2 * depth * Math.tan(THREE.MathUtils.degToRad(sky.camera.fov / 2))) / innerHeight;
  const seam = `blur(${CUT.blurPx}px)`;
  return gsap.timeline()
    .to(passMain, { x: outPx, opacity: CUT.seamOpacity, filter: seam, duration: cutAt, ease: 'power4.in' })
    // the cut: one owner of visibility, matched blur and opacity on both sides
    .set(passMain, { opacity: 0 })
    .set(canvas, { filter: seam })
    .set(handoff, { x: -inPx * worldPerPx })
    .to(handoff, { x: 0, duration: entry, ease: 'power4.out' })
    .to(canvas, { filter: 'blur(0px)', duration: entry, ease: 'power4.out', clearProps: 'filter' }, '<');
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (form.classList.contains('is-boarding')) return;
  const data = Object.fromEntries(new FormData(form));
  const err = document.getElementById('passErr');
  if (!data.name.trim() || !/^\S+@\S+\.\S+$/.test(data.email) || !data.pathway || !data.country) {
    err.textContent = 'Please add your name, a valid email, a pathway and a country.';
    gsap.fromTo(form, { x: -10 }, { x: 0, duration: 0.6, ease: 'elastic.out(1, 0.3)' });
    return;
  }
  err.textContent = '';
  // TODO: send `data` to the registration backend once it exists.
  const passNo = `AS360-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  document.getElementById('cName').textContent = data.name.trim().split(/\s+/)[0];
  document.getElementById('cNo').textContent = passNo;
  board(passNo);
});

function board(passNo) {
  form.classList.add('is-boarding', 'is-checking');
  form.querySelectorAll('input, select').forEach((el) => (el.disabled = true));
  passBtn.innerHTML = '<span class="spin" aria-hidden="true"></span>Checking in…';
  gsap.to(form, { rotateX: 0, rotateY: 0, duration: 0.4 });

  const secs = CHECKIN_MS / 1000;
  const tl = gsap.timeline();
  tl.to(passBar, { scaleX: 1, duration: secs, ease: 'none' }, 0);
  ['Verifying passenger', 'Assigning seat 1A', 'Printing boarding pass'].forEach((s, i, all) =>
    tl.call(() => (passStatus.textContent = s), null, (i * secs) / all.length));
  tl.add(() => {
    form.classList.remove('is-checking');
    passBtn.textContent = 'Boarded';
    passStatus.textContent = `Pass ${passNo}`;
  }, secs);
  // CHECKED IN stamp lands with a thud
  tl.fromTo(passStamp, { scale: 2.6, opacity: 0, rotate: -28 }, { scale: 1, opacity: 0.92, rotate: -12, duration: 0.32, ease: 'power4.in' });
  tl.to(form, { y: 3, duration: 0.05, yoyo: true, repeat: 3, ease: 'none' });

  if (reduceMotion) {
    tl.add(showClearance, '+=0.8');
    return;
  }
  // the stub rips along the perforation and falls away
  const wide = innerWidth > 600;
  tl.add(() => {
    form.classList.add('is-torn');
    if (wide) passStub.style.clipPath = tornEdge(passStub);
  }, '+=0.7');
  tl.to(passStub, { x: wide ? 10 : 0, y: wide ? 0 : 10, rotate: wide ? 3 : -2, duration: 0.14, ease: 'power2.out' });
  tl.to(passStub, { x: wide ? 70 : 30, y: 320, rotate: wide ? 26 : -18, opacity: 0, duration: 1, ease: 'power2.in', transformOrigin: 'top left' });

  // the pass whips off and comes back as the A320, which then holds a beat and climbs out
  tl.add(cutTheCurve(), '-=0.55');
  tl.to(departure, { t: 1, duration: 2.8, ease: 'power2.in', onComplete: showClearance }, '+=0.35');
}

function showClearance() {
  form.style.display = 'none';
  clearance.classList.add('is-on');
  ScrollTrigger.refresh();
  gsap.from(clearance.children, { y: 40, opacity: 0, duration: 1, stagger: 0.1, ease: 'expo.out' });
}

document.getElementById('passAgain').addEventListener('click', () => {
  clearance.classList.remove('is-on');
  gsap.set([form, passMain, passStub, passStamp, passBar], { clearProps: 'all' });
  form.classList.remove('is-boarding', 'is-checking', 'is-torn');
  form.reset();
  form.querySelectorAll('input, select').forEach((el) => (el.disabled = false));
  passBtn.innerHTML = BTN_LABEL;
  passStatus.textContent = '';
  // bring the A320 back: it flies in from far away like the opening
  departure.t = 0;
  handoff.x = 0;
  cur.p = [-16, 7, -34];
  gsap.from(form, { y: 60, opacity: 0, duration: 0.9, ease: 'expo.out' });
});
