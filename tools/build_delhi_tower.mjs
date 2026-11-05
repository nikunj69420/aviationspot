// Procedural model of the air traffic control tower at Indira Gandhi International Airport, New Delhi
// (HOK architects, 2019; 101.9 m, India's tallest). Built from photographs, so proportions are close
// but not survey-accurate. 1 unit = 1 metre, base at y = 0, cab windows of the VCR face every way.
//
// Usage: node tools/build_delhi_tower.mjs <node_modules containing three@0.169.0>
// Writes assests/atc_tower/delhi_atc_tower.glb
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const NM = process.argv[2] ?? 'node_modules';
const THREE = await import(pathToFileURL(join(NM, 'three/build/three.module.js')).href);
const { GLTFExporter } = await import(pathToFileURL(join(NM, 'three/examples/jsm/exporters/GLTFExporter.js')).href);

// GLTFExporter's binary path reads Blobs with FileReader, which Node doesn't have
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); }); }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((r) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(r).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

/* ---------- Materials (taken from the photographs) ---------- */
const mat = {
  cladding: new THREE.MeshStandardMaterial({ name: 'cladding_sandstone', color: 0xd3b483, roughness: 0.7, metalness: 0.04 }),
  white: new THREE.MeshStandardMaterial({ name: 'white_trim', color: 0xf1f1ec, roughness: 0.45, metalness: 0.05 }),
  glass: new THREE.MeshStandardMaterial({ name: 'cab_glass', color: 0x3f8098, roughness: 0.08, metalness: 0.75 }),
  slotGlass: new THREE.MeshStandardMaterial({ name: 'core_glass', color: 0x2a4b5e, roughness: 0.12, metalness: 0.6 }),
  roof: new THREE.MeshStandardMaterial({ name: 'roof', color: 0x8b9399, roughness: 0.8, metalness: 0.1 }),
  steel: new THREE.MeshStandardMaterial({ name: 'steel', color: 0xc3c8cc, roughness: 0.35, metalness: 0.85 }),
  stone: new THREE.MeshStandardMaterial({ name: 'plinth_stone', color: 0x9c8a72, roughness: 0.9, metalness: 0 }),
  beacon: new THREE.MeshStandardMaterial({ name: 'obstruction_light', color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 2, roughness: 0.4 }),
};

const tower = new THREE.Group();
tower.name = 'DelhiATCTower';
const add = (geo, m, name) => { const mesh = new THREE.Mesh(geo, m); mesh.name = name; tower.add(mesh); return mesh; };

/* ---------- Shaft plan: an oval that keeps changing shape as it rises ---------- */
const SHAFT_TOP = 78;
const smooth = (t) => t * t * (3 - 2 * t);
function shaftPlan(y) {
  const t = Math.min(1, Math.max(0, y / SHAFT_TOP));
  const rx = 4.1 + 0.55 * smooth(t) - 0.35 * Math.sin(t * Math.PI) * 0.4; // broad side
  const rz = 3.15 + 0.95 * smooth(t);                                     // narrow side swells toward the cab
  const twist = -0.22 * t;                                                // the oval turns slowly as it rises
  return { rx, rz, twist };
}
function shaftPoint(y, a, out = 0) {
  const { rx, rz, twist } = shaftPlan(y);
  const x = rx * Math.cos(a), z = rz * Math.sin(a);
  // outward normal of the ellipse, so offsets stay perpendicular to the skin
  let nx = Math.cos(a) / rx, nz = Math.sin(a) / rz;
  const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
  const px = x + nx * out, pz = z + nz * out;
  const c = Math.cos(twist), s = Math.sin(twist);
  return new THREE.Vector3(px * c - pz * s, y, px * s + pz * c);
}

// Generic lofted surface: f(u, v) -> Vector3 over a (nu x nv) grid
function loft(f, nu, nv, closeU = false) {
  const pos = [], idx = [];
  const cols = closeU ? nu : nu + 1;
  for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) pos.push(...f(i / nu, j / nv).toArray());
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * cols + i, b = j * cols + ((i + 1) % cols), c = (j + 1) * cols + i, d = (j + 1) * cols + ((i + 1) % cols);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------- Diamond-faceted cladding with the glazed core strip cut out of it ---------- */
const N = 12;                 // diamonds around (about three across a face, like the real cladding)
const DY = 2.6;               // half a diamond's height: long chevron diamonds
const ROWS = Math.round(SHAFT_TOP / DY);
const DEPTH = 0.42;           // how far each diamond's centre folds outward
const SLOT_A = Math.PI / 2 + 0.55; // the glazed strip faces +Z, left of centre
const SLOT_HALF = 0.3;       // its half-width in radians
const half = Math.PI / N;     // half a diamond's angular width
const inSlot = (a) => Math.abs(Math.atan2(Math.sin(a - SLOT_A), Math.cos(a - SLOT_A))) < SLOT_HALF;

const cl = [];
const tri = (p, q, r) => cl.push(...p.toArray(), ...q.toArray(), ...r.toArray());
const V = (j, h, out = 0) => shaftPoint(Math.min(SHAFT_TOP, Math.max(0, j * DY)), h * half, out);
for (let j = 0; j <= ROWS; j++) {
  for (let h = 0; h < 2 * N; h++) {
    if ((j + h) % 2 === 0) continue; // diamond centres sit on the odd lattice points
    if (inSlot(h * half)) continue;
    const c = V(j, h, DEPTH), top = V(j + 1, h), bot = V(j - 1, h), l = V(j, h - 1), r = V(j, h + 1);
    // four folded facets; the clamped rows at the very top/bottom collapse into flat edges
    tri(c, l, bot); tri(c, bot, r); tri(c, r, top); tri(c, top, l);
  }
}
// the lattice leaves half-diamond notches along the bottom and top edges: fill them flat
for (let h = 0; h < 2 * N; h++) {
  if (inSlot(h * half)) continue;
  for (const j of [0, ROWS]) if ((j + h) % 2 === 0) {
    const dir = j === 0 ? 1 : -1;
    tri(V(j, h - 1), V(j, h + 1), V(j + dir, h));
  }
}
{
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(cl, 3));
  g.computeVertexNormals(); // non-indexed: every facet stays flat, so the diamonds catch the light
  add(g, mat.cladding, 'shaft_cladding');
}

// glazed core strip: recessed glass, white jambs and a white floor fin every 4.1 m
const slotGlass = loft((u, v) => shaftPoint(v * SHAFT_TOP, SLOT_A - SLOT_HALF + u * 2 * SLOT_HALF, -0.35), 10, 40);
add(slotGlass, mat.slotGlass, 'core_glass');
for (const side of [-1, 1]) {
  const a0 = SLOT_A + side * (SLOT_HALF + 0.02);
  const jamb = loft((u, v) => shaftPoint(v * SHAFT_TOP, a0 + (u - 0.5) * 0.17, 0.12), 2, 40);
  add(jamb, mat.white, `core_jamb_${side < 0 ? 'l' : 'r'}`);
}
const fins = [];
for (let y = 4.1; y < SHAFT_TOP - 1; y += 4.1) {
  const f = loft((u, v) => shaftPoint(y + (v - 0.5) * 0.28, SLOT_A - SLOT_HALF + u * 2 * SLOT_HALF, -0.3 + 0.75 * 0.5), 10, 1);
  const lip = loft((u, v) => shaftPoint(y + 0.14, SLOT_A - SLOT_HALF + u * 2 * SLOT_HALF, -0.35 + v * 0.75), 10, 1);
  const under = loft((u, v) => shaftPoint(y - 0.14, SLOT_A - SLOT_HALF + u * 2 * SLOT_HALF, 0.4 - v * 0.75), 10, 1);
  fins.push(f, lip, under);
}
add(mergeGeometries(fins), mat.white, 'core_floor_fins');

// white collar where the cladding stops under the neck
add(loft((u, v) => shaftPoint(SHAFT_TOP - 1.6 + v * 1.6, u * Math.PI * 2, DEPTH + 0.06), 72, 1, true), mat.white, 'shaft_collar');
add(capDisc((a) => shaftPoint(SHAFT_TOP - 1.6, a, DEPTH + 0.06), 72), mat.white, 'shaft_collar_soffit');

/* ---------- Plinth ---------- */
add(loft((u, v) => shaftPoint(0, u * Math.PI * 2, 1.4).setY(v * 2.2), 48, 1, true), mat.stone, 'plinth');
add(capDisc((a) => shaftPoint(0, a, 1.4).setY(2.2), 48), mat.stone, 'plinth_top');

/* ---------- Neck, sub-cab, VCR cab and roof (circular) ---------- */
const ring = (y0, y1, r0, r1, m, name, seg = 64) =>
  add(loft((u, v) => { const a = u * Math.PI * 2, r = r0 + (r1 - r0) * v; return new THREE.Vector3(Math.cos(a) * r, y0 + (y1 - y0) * v, Math.sin(a) * r); }, seg, 1, true), m, name);
const annulus = (y, rIn, rOut, m, name, down = false, seg = 64) => {
  const g = new THREE.RingGeometry(rIn, rOut, seg, 1);
  g.rotateX(down ? Math.PI / 2 : -Math.PI / 2); g.translate(0, y, 0);
  return add(g, m, name);
};

// neck: the shaft's oval eases into a white circle
add(loft((u, v) => {
  const a = u * Math.PI * 2;
  const p = shaftPoint(SHAFT_TOP, a), r = 3.7;
  const t = smooth(v);
  return new THREE.Vector3(p.x + (Math.cos(a) * r - p.x) * t, SHAFT_TOP + v * 2.6, p.z + (Math.sin(a) * r - p.z) * t);
}, 64, 6, true), mat.white, 'neck');

const Y = { neck: SHAFT_TOP + 2.6, sub0: 80.6, sub1: 86.0, band1: 87.6, vcr1: 94.2, fascia1: 95.3 };
// sub-cab: equipment level, glass leaning out slightly, with a white mid rail
annulus(Y.sub0, 0, 4.95, mat.white, 'subcab_floor');
ring(Y.sub0, Y.sub1, 4.9, 5.2, mat.glass, 'subcab_glass', 48);
ring(83.2, 83.5, 5.06, 5.1, mat.white, 'subcab_rail');
mullions(Y.sub0, Y.sub1, 4.92, 5.22, 24, 0.12, 'subcab_mullions');
// white floor band under the control room, with its soffit
ring(Y.sub1, Y.band1, 5.45, 5.5, mat.white, 'cab_floor_band');
annulus(Y.sub1, 5.2, 5.45, mat.white, 'cab_soffit', true);
// visual control room: 360° glass, raked outward like every tower cab so the glare falls away
annulus(Y.band1, 5.0, 5.5, mat.white, 'vcr_sill');
ring(Y.band1, Y.vcr1, 5.4, 5.95, mat.glass, 'vcr_glass', 64);
mullions(Y.band1, Y.vcr1, 5.42, 5.97, 20, 0.14, 'vcr_mullions');
ring(90.9, 91.15, 5.68, 5.7, mat.white, 'vcr_rail');
// roof: deep white fascia with an overhang, flat roof, plant and masts
ring(Y.vcr1, Y.fascia1, 6.2, 6.15, mat.white, 'roof_fascia');
annulus(Y.vcr1, 5.95, 6.2, mat.white, 'roof_soffit', true);
annulus(Y.fascia1, 0, 6.15, mat.roof, 'roof_deck');
ring(Y.fascia1, Y.fascia1 + 0.5, 6.15, 6.15, mat.white, 'roof_parapet');
annulus(Y.fascia1 + 0.5, 5.85, 6.15, mat.white, 'roof_parapet_top');
box(3.4, 1.6, 2.6, 0, Y.fascia1 + 0.8, -1.2, mat.roof, 'roof_plant');
box(1.6, 1.1, 1.6, 2.4, Y.fascia1 + 0.55, 1.6, mat.roof, 'roof_hatch');
mast(0.6, 0.6, Y.fascia1, 101.9, 0.07, 'lightning_mast');
mast(-3.2, 1.8, Y.fascia1, 99.6, 0.06, 'antenna_a');
mast(3.6, -1.9, Y.fascia1, 99.0, 0.06, 'antenna_b');
mast(-2.2, -3.8, Y.fascia1, 98.4, 0.05, 'antenna_c');
const beacon = new THREE.SphereGeometry(0.22, 12, 8); beacon.translate(0.6, 101.95, 0.6);
add(beacon, mat.beacon, 'obstruction_light');

/* ---------- helpers that add meshes ---------- */
function mullions(y0, y1, r0, r1, count, w, name) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    // a radial fin for depth...
    const g = loft((u, v) => {
      const r = r0 + (r1 - r0) * v + 0.04 + u * 0.18;
      return new THREE.Vector3(Math.cos(a) * r, y0 + (y1 - y0) * v, Math.sin(a) * r);
    }, 1, 1);
    // ...and a face strip for width
    const side = loft((u, v) => {
      const r = r0 + (r1 - r0) * v + 0.06;
      const aa = a + (u - 0.5) * (w / r);
      return new THREE.Vector3(Math.cos(aa) * r, y0 + (y1 - y0) * v, Math.sin(aa) * r);
    }, 1, 1);
    parts.push(g, side);
  }
  add(mergeGeometries(parts), mat.white, name);
}
function box(w, h, d, x, y, z, m, name) {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return add(g, m, name);
}
function mast(x, z, y0, y1, r, name) {
  const g = new THREE.CylinderGeometry(r, r * 1.6, y1 - y0, 8); g.translate(x, (y0 + y1) / 2, z); return add(g, mat.steel, name);
}
function capDisc(edge, seg) {
  const pos = [], idx = [];
  const c = new THREE.Vector3();
  for (let i = 0; i < seg; i++) c.add(edge((i / seg) * Math.PI * 2));
  c.divideScalar(seg);
  pos.push(...c.toArray());
  for (let i = 0; i < seg; i++) pos.push(...edge((i / seg) * Math.PI * 2).toArray());
  for (let i = 0; i < seg; i++) idx.push(0, 1 + ((i + 1) % seg), 1 + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function mergeGeometries(list) {
  const pos = [], idx = []; let base = 0;
  for (const g of list) {
    const p = g.attributes.position.array;
    pos.push(...p);
    const ix = g.index ? g.index.array : [...Array(p.length / 3).keys()];
    for (const i of ix) idx.push(i + base);
    base += p.length / 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// thin parts (fins, soffits, rings) are seen from both sides
for (const m of [mat.white, mat.glass, mat.slotGlass, mat.roof, mat.stone]) m.side = THREE.DoubleSide;

/* ---------- Export ---------- */
const scene = new THREE.Scene();
scene.add(tower);
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
mkdirSync('assests/atc_tower', { recursive: true });
writeFileSync('assests/atc_tower/delhi_atc_tower.glb', Buffer.from(glb));
let tris = 0;
tower.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
console.log(`assests/atc_tower/delhi_atc_tower.glb  ${(glb.byteLength / 1024).toFixed(0)} KB, ${tower.children.length} meshes, ${Math.round(tris)} triangles`);
