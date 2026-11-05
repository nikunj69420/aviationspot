// Rasterise crops of the brand logo for painting onto the A320 livery (used by tools/livery.py).
// Usage: node tools/render_logo.mjs <path-to-node_modules-containing-@resvg/resvg-js>
// Writes brand/livery-title.png (navy wordmark, no tagline) and brand/livery-emblem.png
// (white tower + radar waves + 360) at print-like resolution.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(join(process.argv[2] ?? '.', 'x.js'));
const { Resvg } = require('@resvg/resvg-js');
const crop = (svg, viewBox) => svg.replace(/viewBox="[^"]+"/, `viewBox="${viewBox}"`);
const render = (svg, width, out) => {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: 'rgba(0,0,0,0)' }).render().asPng();
  writeFileSync(out, png);
  console.log(out, png.length, 'bytes');
};

const navy = readFileSync('brand/logo.svg', 'utf8');
const white = readFileSync('brand/logo-white.svg', 'utf8');
render(crop(navy, '0 0 1564.076 406'), 2000, 'brand/livery-title.png');
render(crop(white, '1215 10 335 240'), 800, 'brand/livery-emblem.png');
