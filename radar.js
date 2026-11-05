// "Radar contact": an airport surveillance radar on its mast at dusk, plus a synced 2D scope.
// The source model ("Radar Turret") is one untextured mesh; we split off the rotating head and
// paint it in vertex colours modelled on real ASR/SSR installations.
import * as THREE from 'three';

const CUT_HEAD = -3.6;  // world-Y: everything above turns (pedestal, yoke, array)
const AXIS = new THREE.Vector2(0.07, 0.05); // pedestal axis in XZ
const SPIN = 1.35; // rad/s, about 13 rpm, in the range of a real ASR (12-15 rpm)
const clamp01 = (v) => Math.min(1, Math.max(0, v));

const C = {
  concrete: new THREE.Color('#8b9098'), concreteTop: new THREE.Color('#a3a8af'),
  ring: new THREE.Color('#3b4149'), hazard: new THREE.Color('#d9a21b'), hazardDark: new THREE.Color('#23272d'),
  pedestal: new THREE.Color('#b9c2cc'), pedestalTop: new THREE.Color('#d3d9df'),
  face: new THREE.Color('#d6dbe1'), back: new THREE.Color('#99a1ab'), frame: new THREE.Color('#646c76'),
  orange: new THREE.Color('#e5602b'), white: new THREE.Color('#f3f2ee'),
};

// Paint each triangle by where it sits and which way it faces, and split base from head.
function splitAndPaint(mesh) {
  mesh.updateWorldMatrix(true, false);
  const geo = mesh.geometry.toNonIndexed();
  // the .glb stores compressed (quantized) vertices; unpack to plain floats before baking the transform
  for (const name of ['position', 'normal']) {
    const attr = geo.getAttribute(name);
    if (!attr || attr.array instanceof Float32Array) continue;
    const f = new Float32Array(attr.count * 3);
    for (let i = 0; i < attr.count; i++) f.set([attr.getX(i), attr.getY(i), attr.getZ(i)], i * 3);
    geo.setAttribute(name, new THREE.BufferAttribute(f, 3));
  }
  geo.applyMatrix4(mesh.matrixWorld);
  geo.computeVertexNormals();
  const pos = geo.attributes.position.array, nor = geo.attributes.normal.array;

  // the array's span direction (principal axis of the head in XZ) and its facing normal
  let sx = 0, sz = 0, sxx = 0, szz = 0, sxz = 0, n = 0;
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i + 1] < -1.5) continue;
    const x = pos[i] - AXIS.x, z = pos[i + 2] - AXIS.y;
    sx += x; sz += z; sxx += x * x; szz += z * z; sxz += x * z; n++;
  }
  const mx = sx / n, mz = sz / n;
  const cxx = sxx / n - mx * mx, czz = szz / n - mz * mz, cxz = sxz / n - mx * mz;
  const ang = 0.5 * Math.atan2(2 * cxz, cxx - czz);
  const span = new THREE.Vector2(Math.cos(ang), Math.sin(ang));
  const facing = new THREE.Vector2(-span.y, span.x);

  const parts = { base: { p: [], n: [], c: [] }, head: { p: [], n: [], c: [] } };
  const col = new THREE.Color();
  for (let t = 0; t < pos.length; t += 9) {
    const cx = (pos[t] + pos[t + 3] + pos[t + 6]) / 3;
    const cy = (pos[t + 1] + pos[t + 4] + pos[t + 7]) / 3;
    const cz = (pos[t + 2] + pos[t + 5] + pos[t + 8]) / 3;
    const nx = nor[t], ny = nor[t + 1], nz = nor[t + 2];
    const up = ny > 0.7;
    if (cy < -4.25) col.copy(up ? C.concreteTop : C.concrete);
    else if (cy < CUT_HEAD) {
      // hazard stripes on the turntable's top ring
      const stripe = Math.floor((Math.atan2(cz - AXIS.y, cx - AXIS.x) + Math.PI) / (Math.PI / 14)) % 2;
      col.copy(up ? (stripe ? C.hazard : C.hazardDark) : C.ring);
    } else if (cy < -1.5) col.copy(up ? C.pedestalTop : C.pedestal);
    else if (cy > 4.35) {
      // orange / white obstruction bands along the array's top edge
      const s = (cx - AXIS.x) * span.x + (cz - AXIS.y) * span.y;
      col.copy(Math.floor(s / 1.3 + 100) % 2 ? C.orange : C.white);
    } else if (Math.abs(ny) > 0.6) col.copy(C.frame);
    else col.copy(nx * facing.x + nz * facing.y > 0 ? C.face : C.back);

    const part = cy < CUT_HEAD ? parts.base : parts.head;
    for (let k = 0; k < 9; k += 3) {
      part.p.push(pos[t + k] - AXIS.x, pos[t + k + 1], pos[t + k + 2] - AXIS.y);
      part.n.push(nor[t + k], nor[t + k + 1], nor[t + k + 2]);
      part.c.push(col.r, col.g, col.b);
    }
  }
  const build = ({ p, n: nn, c }) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    return g;
  };
  return { base: build(parts.base), head: build(parts.head), facing };
}

// Translucent radar beam: a thin vertical fan that fades with range
function makeBeam() {
  const geo = new THREE.PlaneGeometry(46, 16, 1, 1);
  geo.translate(23, 0, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color('#7dffc4') }, uStrength: { value: 0.09 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying vec2 vUv;
      void main(){ float along = pow(1.0 - vUv.x, 1.8); float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
      gl_FragColor = vec4(uColor, along * across * across * uStrength); }`,
  });
  const beam = new THREE.Group();
  for (const tilt of [-0.03, 0, 0.03]) {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.y = tilt;
    beam.add(m);
  }
  return beam;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,90,70,1)');
  grd.addColorStop(0.25, 'rgba(255,40,30,.6)');
  grd.addColorStop(1, 'rgba(255,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createRadarStage({ envMap, loader, isSmall }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400);
  scene.environment = envMap;
  scene.add(new THREE.HemisphereLight(0x8fa6dc, 0x2a1c2e, 0.8));
  const sunset = new THREE.DirectionalLight(0xffb27a, 1.9); // low sun off to one side
  sunset.position.set(-30, 10, -18);
  scene.add(sunset);
  const rim = new THREE.DirectionalLight(0x7fa8ff, 1.1);
  rim.position.set(25, 12, 20);
  scene.add(rim);

  const radar = new THREE.Group();
  radar.scale.setScalar(0.85);
  scene.add(radar);
  const head = new THREE.Group();
  radar.add(head);
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0.25, envMapIntensity: 0.6 });

  // concrete mast with orange/white obstruction bands near the top
  const concrete = new THREE.MeshStandardMaterial({ color: 0x858a92, roughness: 0.92 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 4.1, 16, 40), concrete);
  mast.position.y = -5.15 - 8;
  radar.add(mast);
  const bandMat = [new THREE.MeshStandardMaterial({ color: 0xe5602b, roughness: 0.7 }), new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 0.7 })];
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(3.36 + i * 0.075, 3.43 + i * 0.075, 1.9, 40, 1, true), bandMat[i % 2]);
    band.position.y = -6.1 - i * 1.9;
    radar.add(band);
  }
  // catwalk: grating deck, handrail and posts
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9cfd6, roughness: 0.4, metalness: 0.7 });
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, 0.3, 48), new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.8, metalness: 0.4 }));
  deck.position.y = -5.3;
  radar.add(deck);
  for (const y of [-4.2, -3.3]) {
    const rail = new THREE.Mesh(new THREE.TorusGeometry(7.3, 0.06, 6, 64), steel);
    rail.rotation.x = Math.PI / 2;
    rail.position.y = y;
    radar.add(rail);
  }
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 2.0, 6), steel, 24);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    posts.setMatrixAt(i, mtx.makeTranslation(Math.cos(a) * 7.3, -4.2, Math.sin(a) * 7.3));
  }
  radar.add(posts);

  // red aviation obstruction lights (blinking); two ride on the array, four ring the deck
  const glow = glowTexture();
  const lights = [];
  const addLight = (parent, x, y, z) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.set(x, y, z);
    s.scale.setScalar(2.2);
    parent.add(s);
    lights.push(s);
  };
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    addLight(radar, Math.cos(a) * 7.4, -3.1, Math.sin(a) * 7.4);
  }

  const beam = makeBeam();
  const beamMat = beam.children[0].material;
  head.add(beam);

  // a few early stars
  const starGeo = new THREE.BufferGeometry();
  const sp = new Float32Array((isSmall ? 250 : 500) * 3);
  for (let i = 0; i < sp.length; i += 3) {
    const v = new THREE.Vector3().randomDirection();
    v.y = Math.abs(v.y) * 0.8 + 0.15;
    v.normalize().multiplyScalar(220);
    sp.set([v.x, v.y, v.z], i);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.8, color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false })));

  loader.load('assests/radar/radar.glb', (gltf) => {
    let src = null;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
    const { base, head: headGeo, facing } = splitAndPaint(src);
    radar.add(new THREE.Mesh(base, paint));
    head.add(new THREE.Mesh(headGeo, paint));
    // aim the beam out of the array's face, from mid-array height
    beam.position.y = 1.6;
    beam.rotation.y = -Math.atan2(facing.y, facing.x);
    // obstruction lights at both tips of the array
    const tip = new THREE.Vector2(facing.y, -facing.x).multiplyScalar(7.4);
    addLight(head, tip.x, 4.9, tip.y);
    addLight(head, -tip.x, 4.9, -tip.y);
  });

  let sweep = 0;
  function update({ p, dt, time, pointer, reduceMotion, presence = 1 }) {
    // arrive: rise up the mast with a slight turn, spin up, then lights and beam come on;
    // leave: the same in reverse
    const e = 1 - Math.pow(1 - presence, 3);
    radar.position.y = -30 * (1 - e);
    radar.rotation.y = (1 - e) * 0.9;
    sweep += dt * (reduceMotion ? 0.25 : SPIN) * (0.12 + 0.88 * e);
    head.rotation.y = -sweep; // clockwise seen from above, like the scope
    const power = clamp01((presence - 0.55) / 0.45);
    beamMat.uniforms.uStrength.value = 0.09 * power;
    const on = Math.sin(time * Math.PI * 1.2) > 0.2 ? 1 : 0.15; // ~0.6 s blink
    for (const l of lights) l.material.opacity = on * power;

    // orbit round the radar from slightly above, looking down at it ~17°, steepening to ~19°
    const a = 0.5 + p * 1.9;
    const wide = camera.aspect >= 1;
    const R = wide ? 36 : 56;
    const aimY = wide ? 3 : 13; // portrait: radar sits low, under the copy
    const pitch = THREE.MathUtils.degToRad(17 + p * 2);
    camera.position.set(Math.cos(a) * R + pointer.x * 1.5, aimY + Math.tan(pitch) * R - pointer.y * 1.5, Math.sin(a) * R);
    const left = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)); // screen-left of the radar
    camera.lookAt(left.multiplyScalar(wide ? 7 : 0).add(new THREE.Vector3(0, aimY, 0)));
  }
  return { scene, camera, update, sweepAngle: () => sweep };
}

/* ---------- 2D scope (PPI), sweep synced to the antenna ---------- */
const TARGETS = [{ r: 0.62, a: 0.9 }, { r: 0.4, a: 2.4 }, { r: 0.82, a: 3.6 }, { r: 0.3, a: 4.7 }, { r: 0.7, a: 5.6 }];
export function createScope(canvas) {
  const g = canvas.getContext('2d');
  let size = 0;
  function fit() {
    const dpr = Math.min(devicePixelRatio, 2);
    size = canvas.clientWidth;
    canvas.width = canvas.height = Math.round(size * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const TAU = Math.PI * 2;
  function draw(sweep, time, presence = 1) {
    if (canvas.clientWidth !== size) fit();
    const s = size, c = s / 2, R = c - 6;
    g.clearRect(0, 0, s, s);
    if (presence <= 0) return;
    const contact = presence > 0.85; // our blip tags up once the radar is fully on
    const bg = g.createRadialGradient(c, c, 0, c, c, R);
    bg.addColorStop(0, '#062418');
    bg.addColorStop(1, '#020c08');
    g.fillStyle = bg;
    g.beginPath(); g.arc(c, c, R, 0, TAU); g.fill();

    g.strokeStyle = 'rgba(110, 255, 185, .18)';
    g.lineWidth = 1;
    // range rings power on from the centre outwards
    for (const k of [0.25, 0.5, 0.75, 1]) { if (presence < k * 0.8) continue; g.beginPath(); g.arc(c, c, R * k, 0, TAU); g.stroke(); }
    g.beginPath(); g.moveTo(c - R, c); g.lineTo(c + R, c); g.moveTo(c, c - R); g.lineTo(c, c + R); g.stroke();
    for (let d = 0; d < 360; d += 10) {
      const a = (d * Math.PI) / 180 - Math.PI / 2, len = d % 30 ? 4 : 8;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * R, c + Math.sin(a) * R);
      g.lineTo(c + Math.cos(a) * (R - len), c + Math.sin(a) * (R - len));
      g.stroke();
    }

    // sweep with a fading afterglow trailing behind it
    const head = (sweep % TAU) - Math.PI / 2;
    const trail = g.createConicGradient(head - 1.1, c, c);
    trail.addColorStop(0, 'rgba(110, 255, 185, 0)');
    trail.addColorStop(1.1 / TAU, 'rgba(110, 255, 185, .32)');
    trail.addColorStop(1.1 / TAU + 0.001, 'rgba(110, 255, 185, 0)');
    g.fillStyle = trail;
    g.beginPath(); g.moveTo(c, c); g.arc(c, c, R, head - 1.1, head); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(160, 255, 210, .9)';
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(head) * R, c + Math.sin(head) * R); g.stroke();

    // blips glow when the sweep passes, then fade until the next pass
    const ours = { r: 0.5 + Math.sin(time * 0.05) * 0.08, a: 1.75, label: 'AS360', own: true };
    g.font = `600 ${Math.max(9, s * 0.036)}px "JetBrains Mono", monospace`;
    g.globalAlpha = clamp01((presence - 0.5) / 0.5);
    for (const tg of [...TARGETS, ours]) {
      const since = (((sweep - tg.a) % TAU) + TAU) % TAU; // radians since last painted
      const lit = Math.exp(-since * 0.9);
      const a = tg.a - Math.PI / 2;
      const x = c + Math.cos(a) * R * tg.r, y = c + Math.sin(a) * R * tg.r;
      const isContact = tg.own && contact;
      g.fillStyle = isContact ? `rgba(76, 195, 245, ${0.45 + lit * 0.55})` : `rgba(130, 255, 195, ${0.15 + lit * 0.85})`;
      g.beginPath(); g.arc(x, y, isContact ? 3.6 : 2.6, 0, TAU); g.fill();
      if (!tg.label) continue;
      g.strokeStyle = g.fillStyle;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 12, y - 12); g.stroke();
      g.fillText(tg.label, x + 14, y - 14);
      if (tg.own) g.fillText(isContact ? '350 ↑' : '060 ↑', x + 14, y - 14 + s * 0.045);
    }
    g.globalAlpha = 1;
  }
  return { draw };
}
