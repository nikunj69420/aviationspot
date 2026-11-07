"""Build web-ready variants of the official AviationSpot360 logo.

Source: aviationspot-logo.svg (project root). Writes to brand/:
  logo.svg                 original colours (navy + cyan), for light backgrounds
  logo-white.svg           navy -> white (incl. the embedded artwork), for the dark site
  logo-white-wordmark.svg  logo-white without the tagline, for small sizes (nav)
  favicon.svg              the radar "o" on its own

All variants:
  - the "360" and the tagline are converted from live text (Windows-only fonts: Tw Cen MT Condensed
    Extra Bold, Sylfaen) to vector outlines, so they look identical on every device
  - the cyan sweep inside the "o" rotates around the centre dot like a radar (CSS inside the SVG,
    so it also animates in <img> tags; it stops for prefers-reduced-motion)

Run from the project root:  python -I tools/logo_build.py   (needs fontTools and Pillow)
"""
import base64
import io
import re
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "aviationspot-logo.svg"
OUT = ROOT / "brand"
FONTS = "C:/Windows/Fonts/"
NAVY = ("#111c44", "#0b163a", "#231f20")
DOT = (1383.524, 328.402)          # centre of the radar "o" (the navy dot)
SWEEP_STARTS = ("M1448.964,291.527", "M1451.123,290.266")  # the two cyan sweep-wedge paths
WORDMARK_HEIGHT = 406              # crop that drops the tagline (its caps start ~410)


def outline(font_file: str, text: str, size: float, spacing_em: float, x0: float = 0.0) -> str:
    """SVG path data for `text` set in `font_file`, baseline at y=0, letter-spacing in em."""
    font = TTFont(FONTS + font_file)
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    scale = size / font["head"].unitsPerEm
    pen, x = SVGPathPen(glyphs), x0
    for ch in text:
        glyph = glyphs[cmap[ord(ch)]]
        glyph.draw(TransformPen(pen, (scale, 0, 0, -scale, x, 0)))  # font y-up -> SVG y-down
        x += glyph.width * scale + spacing_em * size
    return pen.getCommands()


def outline_text(svg: str) -> str:
    # tagline: Sylfaen 25px (+ a 26px final "S"), letter-spacing .8em, in the source's own transform
    tagline = outline("sylfaen.ttf", "THE AIRSPACE OF AWARENES", 25, 0.8) + outline("sylfaen.ttf", "S", 26, 0.8, 835.04)
    # "360": Tw Cen MT Condensed Extra Bold 125.217px, letter-spacing -.1em
    three60 = outline("TCCEB.TTF", "360", 125.217, -0.1)
    svg = re.sub(r'<text class="cls-9" transform="([^"]+)">.*?</text>',
                 lambda m: f'<path class="cls-10" transform="{m.group(1)}" d="{tagline}"/>', svg, flags=re.S)
    svg = re.sub(r'<text class="cls-8" transform="([^"]+)">.*?</text>',
                 lambda m: f'<path class="cls-10" transform="{m.group(1)}" d="{three60}"/>', svg, flags=re.S)
    svg = svg.replace("<text/>", "")
    assert "<text" not in svg, "unexpected text element left in the logo"
    return svg


def add_radar_sweep(svg: str) -> str:
    paths = [re.search(r'<path class="cls-10" d="' + re.escape(start) + r'[^"]*"\s*/>', svg) for start in SWEEP_STARTS]
    assert all(paths), "radar sweep paths not found"
    # the beam is clipped to the inside of the ring so it never spills over it as it turns
    clip = f'<clipPath id="as360-sweep-clip"><circle cx="{DOT[0]}" cy="{DOT[1]}" r="47"/></clipPath>'
    group = (f'<g clip-path="url(#as360-sweep-clip)"><g class="radar-sweep">'
             + "".join(p.group(0) for p in paths) + "</g></g>")
    svg = svg.replace("</defs>", clip + "</defs>", 1)
    for p in paths:
        svg = svg.replace(p.group(0), "", 1)
    # put the sweep back just before the centre dot so the dot stays on top
    svg = svg.replace("<ellipse class=\"cls-1\" cx=\"1383.524\"", group + "<ellipse class=\"cls-1\" cx=\"1383.524\"", 1)
    css = (
        f".radar-sweep {{ transform-box: view-box; transform-origin: {DOT[0]}px {DOT[1]}px; "
        "animation: as360-sweep 4s linear infinite; }\n"
        "@keyframes as360-sweep { to { transform: rotate(360deg); } }\n"
        "@media (prefers-reduced-motion: reduce) { .radar-sweep { animation: none; } }\n"
    )
    return svg.replace("</style>", css + "</style>", 1)


def recolour_png(b64: str) -> str:
    """Navy pixels -> white, cyan kept (dark ones are recoloured, bright blue ones left alone)."""
    im = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and (0.299 * r + 0.587 * g + 0.114 * b) < 95:
                px[x, y] = (255, 255, 255, a)
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


def white(svg: str) -> str:
    for c in NAVY:
        svg = svg.replace(c, "#ffffff")
    return re.sub(r'(data:image/png;base64,)([^"]+)', lambda m: m.group(1) + recolour_png(m.group(2)), svg)


def with_viewbox(svg: str, vb: str) -> str:
    return re.sub(r'viewBox="[^"]+"', f'viewBox="{vb}"', svg, count=1)


src = SRC.read_text(encoding="utf-8")
base = outline_text(src)  # the logo stays still: the radar sweep in the "o" is the static original
# (add_radar_sweep() animates it, if that is ever wanted again)
OUT.mkdir(exist_ok=True)
(OUT / "logo.svg").write_text(base, encoding="utf-8")
light = white(base)
(OUT / "logo-white.svg").write_text(light, encoding="utf-8")
(OUT / "logo-white-wordmark.svg").write_text(with_viewbox(light, f"0 0 1564.076 {WORDMARK_HEIGHT}"), encoding="utf-8")
# favicon: a tight square around the radar "o" on a white disc (so it reads on dark browser tabs)
disc = f'<circle cx="{DOT[0]}" cy="{DOT[1]}" r="80" fill="#ffffff"/>'
(OUT / "favicon.svg").write_text(with_viewbox(base.replace("</defs>", "</defs>" + disc, 1), f"{DOT[0] - 80:.1f} {DOT[1] - 80:.1f} 160 160"), encoding="utf-8")
for f in sorted(OUT.glob("*.svg")):
    print(f.name, f"{f.stat().st_size / 1024:.0f} KB")
