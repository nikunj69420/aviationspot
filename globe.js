// The exam section's globe: dotted land, India's home airport and great-circle routes to the other
// authorities, with an aircraft flying the selected route. It renders into its own small canvas and
// only while the section is on screen.
import * as THREE from 'three';

const AIRPORTS = [
  { code: 'VABB', name: 'Mumbai', lat: 19.09, lon: 72.87 },
  { code: 'FAOR', name: 'Johannesburg', lat: -26.14, lon: 28.24 },
  { code: 'KJFK', name: 'New York', lat: 40.64, lon: -73.78 },
];
const ROUTES = [[0, 1], [0, 2]]; // India → South Africa, India → United States
const R = 1;

const vec = (lat, lon, r = R) => {
  const la = THREE.MathUtils.degToRad(lat), lo = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(Math.cos(la) * Math.sin(lo) * r, Math.sin(la) * r, Math.cos(la) * Math.cos(lo) * r);
};
const toLatLon = (v) => {
  const n = v.clone().normalize();
  return { lat: THREE.MathUtils.radToDeg(Math.asin(n.y)), lon: THREE.MathUtils.radToDeg(Math.atan2(n.x, n.z)) };
};

function planeShape() {
  // top-down airliner silhouette, nose toward +Y
  const p = [[0, 1], [0.11, 0.78], [0.11, 0.28], [1, -0.12], [1, -0.3], [0.11, -0.1], [0.09, -0.62], [0.36, -0.82], [0.36, -0.96], [0, -0.86]];
  const s = new THREE.Shape();
  p.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  for (let i = p.length - 2; i > 0; i--) s.lineTo(-p[i][0], p[i][1]);
  s.closePath();
  return s;
}

export function createGlobe({ host, labels, reduceMotion, gsap }) {
  const canvas = host.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
  camera.position.set(0, 0, 4.6);

  const globe = new THREE.Group();
  globe.rotation.order = 'XYZ'; // spin to the longitude first, then tilt to the latitude
  scene.add(globe);

  // ocean: deep navy that brightens to cyan at the rim
  const rimShader = (inner, outer, power, side, alpha) => new THREE.ShaderMaterial({
    side, transparent: alpha < 1, depthWrite: alpha >= 1,
    blending: alpha < 1 ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { inner: { value: new THREE.Color(inner) }, outer: { value: new THREE.Color(outer) } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: `uniform vec3 inner; uniform vec3 outer; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1. - abs(dot(vN, vV)), ${power.toFixed(1)}); gl_FragColor = vec4(mix(inner, outer, f), ${alpha < 1 ? 'f' : '1.'} * ${alpha.toFixed(2)}); }`,
  });
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), rimShader('#0a1838', '#1d78b8', 3, THREE.FrontSide, 1)));
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.14, 64, 48), rimShader('#000000', '#2aa8ee', 2.4, THREE.BackSide, 0.75)));

  // graticule, very faint
  const grat = [];
  for (let lat = -60; lat <= 60; lat += 30) for (let lon = 0; lon < 360; lon += 4) grat.push(vec(lat, lon, R * 1.001), vec(lat, lon + 4, R * 1.001));
  for (let lon = 0; lon < 360; lon += 30) for (let lat = -84; lat < 84; lat += 4) grat.push(vec(lat, lon, R * 1.001), vec(lat + 4, lon, R * 1.001));
  globe.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(grat), new THREE.LineBasicMaterial({ color: 0x4cc3f5, transparent: true, opacity: 0.08 })));

  // land dots (baked by tools/build_globe_dots.mjs)
  fetch('assests/globe/land.json').then((r) => r.json()).then((d) => {
    const pos = new Float32Array((d.length / 2) * 3);
    for (let i = 0; i < d.length; i += 2) vec(d[i], d[i + 1], R * 1.004).toArray(pos, (i / 2) * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    globe.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fdcf7, size: 0.021, transparent: true, opacity: 0.9, depthWrite: false })));
  });

  // airports: a dot and a pulsing ring flat on the surface
  const markers = AIRPORTS.map((a) => {
    const p = vec(a.lat, a.lon, R * 1.006);
    const g = new THREE.Group();
    g.position.copy(p);
    g.lookAt(p.clone().multiplyScalar(2));
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.022, 24), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.038, 40), new THREE.MeshBasicMaterial({ color: 0x00a2e5, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    g.add(dot, ring);
    globe.add(g);
    return { ...a, p, ring };
  });

  // great-circle routes, lifted into an arc; drawn in as the route is selected
  const routes = ROUTES.map(([a, b]) => {
    const A = markers[a].p.clone().normalize(), B = markers[b].p.clone().normalize();
    const angle = A.angleTo(B);
    const pts = [];
    for (let i = 0; i <= 96; i++) {
      const t = i / 96;
      const v = new THREE.Vector3().copy(A).applyAxisAngle(new THREE.Vector3().crossVectors(A, B).normalize(), angle * t);
      pts.push(v.multiplyScalar(R * (1.01 + Math.sin(Math.PI * t) * angle * 0.16)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(curve, 160, 0.0075, 6, false);
    const mat = new THREE.MeshBasicMaterial({ color: 0x4cc3f5, transparent: true, opacity: 0.35, depthWrite: false });
    const mesh = new THREE.Mesh(tube, mat);
    globe.add(mesh);
    const mid = curve.getPointAt(0.5);
    return { curve, mesh, mat, total: tube.index.count, draw: 0, glow: 0, mid };
  });

  const jet = new THREE.Mesh(new THREE.ShapeGeometry(planeShape()), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  jet.geometry.scale(0.045, 0.045, 0.045);
  globe.add(jet);

  // which authority is shown: 0 = India (both routes, centred on India), 1/2 = that route
  let selected = 0, jetT = 0;
  const view = { lat: 18, lon: 72 }, target = { lat: 18, lon: 72 };
  function focus(i) {
    selected = i;
    const c = i === 0 ? { lat: 12, lon: 58 } : toLatLon(routes[i - 1].mid);
    target.lat = THREE.MathUtils.clamp(c.lat, -35, 45);
    target.lon = c.lon;
    jetT = 0;
  }

  const tmp = new THREE.Vector3(), camDir = new THREE.Vector3(), m4 = new THREE.Matrix4();
  const labelEls = AIRPORTS.map((a) => labels.querySelector(`[data-code="${a.code}"]`));
  function resize() {
    const w = host.clientWidth;
    renderer.setSize(w, w, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);

  let active = false, last = performance.now();
  new IntersectionObserver(([e]) => { active = e.isIntersecting; last = performance.now(); }, { rootMargin: '100px' }).observe(host);

  function tick() {
    if (!active) return;
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const time = now / 1000;
    // ease the view toward the selected route (shortest way round), with a slow idle drift
    let dLon = ((target.lon - view.lon + 540) % 360) - 180;
    const k = 1 - Math.exp(-dt * 2.4);
    view.lon += dLon * k;
    view.lat += (target.lat - view.lat) * k;
    const drift = reduceMotion ? 0 : Math.sin(time * 0.25) * 4;
    globe.rotation.set(THREE.MathUtils.degToRad(view.lat), -THREE.MathUtils.degToRad(view.lon + drift), 0);

    routes.forEach((r, i) => {
      const on = selected === 0 || selected === i + 1;
      r.draw += ((on ? 1 : 0.0) - r.draw) * (1 - Math.exp(-dt * 2.2));
      r.glow += ((on ? 1 : 0) - r.glow) * k;
      r.mesh.geometry.setDrawRange(0, Math.floor(r.total * Math.max(0.02, r.draw) / 3) * 3);
      r.mat.opacity = 0.18 + 0.7 * r.glow;
    });
    markers.forEach((m, i) => {
      const s = 1 + ((time * 0.8 + i * 0.33) % 1) * 1.8;
      m.ring.scale.setScalar(reduceMotion ? 1.4 : s);
      m.ring.material.opacity = reduceMotion ? 0.7 : 1 - (s - 1) / 1.8;
    });

    // the aircraft flies the selected route (India: the one to the US, then the one to South Africa)
    const ri = selected === 0 ? Math.floor(time / 4) % 2 : selected - 1;
    jetT = reduceMotion ? 0.5 : (jetT + dt / 3.6) % 1;
    const rr = routes[ri];
    const t = Math.min(jetT, rr.draw);
    rr.curve.getPointAt(t, jet.position);
    const fwd = rr.curve.getTangentAt(t).normalize();
    const up = jet.position.clone().normalize();
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    m4.makeBasis(right, fwd, up); // shape's +Y nose along the route, flat to the surface
    jet.quaternion.setFromRotationMatrix(m4);
    jet.visible = rr.draw > 0.3;

    renderer.render(scene, camera);

    // airport tags follow their markers; hidden round the back of the globe
    camera.getWorldDirection(camDir);
    markers.forEach((m, i) => {
      const el = labelEls[i];
      if (!el) return;
      tmp.copy(m.p).applyMatrix4(globe.matrixWorld);
      const facing = -tmp.clone().normalize().dot(camDir);
      tmp.project(camera);
      el.style.opacity = THREE.MathUtils.clamp((facing - 0.15) * 4, 0, 1);
      el.style.left = `${((tmp.x + 1) / 2) * 100}%`;
      el.style.top = `${((1 - tmp.y) / 2) * 100}%`;
    });
  }
  gsap.ticker.add(tick);
  focus(0);
  return { focus };
}
