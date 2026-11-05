"""Put AviationSpot360's registration on the A320 flight deck.

Run: python -I tools/cockpit_livery.py
Reads  assests/a320_cockpit/scene.gltf + images/CockpitPanels.jpg
Writes assests/a320_cockpit/images/as360_deck_main.png (2x, sharpened) and scene_as360.gltf
Then:  python -I tools/compress_models.py assests/a320_cockpit/a320_cockpit.glb

The registration placard above the centre instruments read "N108UW | CS-AL"; it now reads
"AS360 | VT-AS360" (the boarding pass's flight number and the registration on the A320's tail).
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "assests/a320_cockpit"
UP = 2  # work at twice the source resolution so the lettering stays crisp

src = Image.open(DIR / "images/CockpitPanels.jpg").convert("RGB")
img = src.resize((src.width * UP, src.height * UP), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.6, percent=70, threshold=2))

# the placard plate (source px): x 381-448, y 136-152; repaint it flat in its own colour, then letter it
x0, y0, x1, y1 = (v * UP for v in (381, 136, 448, 152))
a = np.asarray(img).astype(float)
plate = np.median(a[y0:y1, x0:x1].reshape(-1, 3), axis=0)
noise = np.random.default_rng(3).normal(0, 2.0, (y1 - y0, x1 - x0, 1))  # keep a little paint grain
a[y0:y1, x0:x1] = np.clip(plate + noise, 0, 255)
img = Image.fromarray(a.astype(np.uint8))

d = ImageDraw.Draw(img)
ink = (206, 206, 202)
left, right = "AS360", "VT-AS360"
gap = 6 * UP
# the largest condensed size that fits the plate with a small margin
for size in range(14 * UP, 6 * UP, -1):
    font = ImageFont.truetype("C:/Windows/Fonts/bahnschrift.ttf", size)
    try:
        font.set_variation_by_name(b"SemiBold Condensed")
    except Exception:
        pass
    wl, wr = d.textlength(left, font=font), d.textlength(right, font=font)
    total = wl + gap + wr
    if total <= (x1 - x0) - 6 * UP:
        break
cy = (y0 + y1) / 2 + UP
sx = (x0 + x1) / 2 - total / 2
d.text((sx, cy), left, font=font, fill=ink, anchor="lm")
bar_x = sx + wl + gap / 2
d.line((bar_x, y0 + 3 * UP, bar_x, y1 - 3 * UP), fill=ink, width=UP)
d.text((sx + wl + gap, cy), right, font=font, fill=ink, anchor="lm")
img.save(DIR / "images/as360_deck_main.png")

g = json.loads((DIR / "scene.gltf").read_text())
for im in g["images"]:
    if im["uri"] == "images/CockpitPanels.jpg":
        im["uri"] = "images/as360_deck_main.png"
(DIR / "scene_as360.gltf").write_text(json.dumps(g))
print("wrote", DIR / "images/as360_deck_main.png", img.size)
