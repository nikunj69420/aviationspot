"""Bake the founder's sign-off "Yours, Flyboy" into SVG letter paths, so the page can write it by hand.

Run: python -I tools/signature_svg.py <caveat-latin-600-normal.woff>
     (Caveat, SIL Open Font License; e.g. from the @fontsource/caveat npm package)
Writes brand/signature.svg: one <path class="sig__l"> per letter, in writing order, which main.js
traces stroke by stroke and then inks in.
"""
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
TEXT = "Yours, Flyboy"

font = TTFont(sys.argv[1])
cmap = font.getBestCmap()
glyphs = font.getGlyphSet()
hmtx = font["hmtx"]
upm = font["head"].unitsPerEm
asc = font["hhea"].ascent
desc = font["hhea"].descent  # negative

# optional pair kerning from a simple 'kern' table (Caveat's GPOS kerning is ignored; spacing is close enough)
paths, x = [], 0
for ch in TEXT:
    name = cmap[ord(ch)]
    adv = hmtx[name][0]
    if not ch.isspace():
        pen = SVGPathPen(glyphs)
        # font units have y up; SVG has y down
        glyphs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, asc)))
        d = pen.getCommands()
        if d:
            paths.append(f'<path class="sig__l" d="{d}"/>')
    x += adv

w, h = x, asc - desc
svg = (f'<svg class="signature" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="{TEXT}">'
       + "".join(paths) + "</svg>\n")
(ROOT / "brand/signature.svg").write_text(svg, encoding="utf-8")
print(f"brand/signature.svg: {len(paths)} letters, viewBox {w} x {h}, {len(svg) / 1024:.1f} KB")
