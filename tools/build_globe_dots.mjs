// Bake the dotted-earth globe used by the exam section: evenly spread points (a Fibonacci sphere)
// kept only where they fall on land, from Natural Earth's 1:50m land outline (world-atlas, public domain).
//
// Usage: node tools/build_globe_dots.mjs <node_modules containing world-atlas, topojson-client, d3-geo>
// Writes assests/globe/land.json: [lat, lon, lat, lon, ...] rounded to 0.1°
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const NM = process.argv[2] ?? 'node_modules';
const { feature } = await import(pathToFileURL(join(NM, 'topojson-client/src/index.js')).href);
const { geoContains } = await import(pathToFileURL(join(NM, 'd3-geo/src/index.js')).href);

const topo = JSON.parse(readFileSync(join(NM, 'world-atlas/land-50m.json'), 'utf8'));
const land = feature(topo, topo.objects.land);

const N = 16000; // points over the whole sphere; ~29% land
const golden = Math.PI * (3 - Math.sqrt(5));
const out = [];
for (let i = 0; i < N; i++) {
  const y = 1 - (i / (N - 1)) * 2;
  const lat = (Math.asin(y) * 180) / Math.PI;
  const lon = ((((i * golden * 180) / Math.PI) % 360) + 540) % 360 - 180;
  if (lat < -60) continue; // leave Antarctica out; it only clutters the bottom of the globe
  if (geoContains(land, [lon, lat])) out.push(+lat.toFixed(1), +lon.toFixed(1));
}
mkdirSync('assests/globe', { recursive: true });
writeFileSync('assests/globe/land.json', JSON.stringify(out));
console.log(`assests/globe/land.json: ${out.length / 2} land dots`);
