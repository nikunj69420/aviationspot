"""Repaint the A320 texture in AviationSpot360 livery.

Run: python -I tools/livery.py
Reads  assests/a320/textures/material02_baseColor.jpeg (original paint kit)
Writes assests/a320/textures/as360_livery.jpg
"""
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
from scipy.spatial import ConvexHull

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assests/a320/textures/material02_baseColor.jpeg"
OUT = ROOT / "assests/a320/textures/as360_livery.jpg"
FONT = "C:/Windows/Fonts/ARLRDBD.TTF"  # Arial Rounded MT Bold

# brand colours, from the official logo
NAVY = np.array([17, 28, 68], float)        # #111c44
CYAN = np.array([0, 162, 229], float)       # #00a2e5
CYAN_LIGHT = np.array([120, 210, 246], float)
CYAN_DEEP = np.array([0, 104, 170], float)

img = np.asarray(Image.open(SRC).convert("RGB")).astype(float)
H, W, _ = img.shape
R, G, B = img[..., 0], img[..., 1], img[..., 2]
luma = 0.299 * R + 0.587 * G + 0.114 * B

# UV islands (pixels, original 2048 texture)
FRONT = (slice(0, 641), slice(0, 1314))       # forward fuselage, crown at y=318
REAR = (slice(652, 1293), slice(178, 1548))   # aft fuselage, crown at y=970
FIN_L = (slice(1600, 2048), slice(0, 400))
FIN_R = (slice(1600, 2048), slice(1660, 2048))
NACELLE = (slice(848, 1569), slice(1749, 2046))
CROWN_F, CROWN_R = 318, 970


def region_mask(*regions):
    m = np.zeros((H, W), bool)
    for r in regions:
        m[r] = True
    return m


def tint(mask, color, ref=235.0):
    """Repaint masked pixels with `color`, keeping the original shading."""
    shade = np.clip(luma[mask] / ref, 0.35, 1.15)[:, None]
    img[mask] = np.clip(color * shade, 0, 255)


# navy paint, including its darkest shaded edges, but not the lavender UV background
blue = (B - R > 35) & (B > 45) & (B - G > 20) & (luma < 130)
# the rollout swoosh's warm bands, classified by hue (green/red ratio) so shaded and antialiased
# pixels are caught too, not just the flat band colours
warm = (R - B > 45) & (R > 100) & (R > G)
ratio = G / np.maximum(R, 1)
red = warm & (ratio < 0.42)
orange = warm & (ratio >= 0.42) & (ratio < 0.72)
yellow = warm & (ratio >= 0.72)

# 1. Remove the "A320" / "AIRBUS INDUSTRIE" titles on the forward fuselage
front = region_mask(FRONT)
titles = ndimage.binary_dilation(blue & front, iterations=5)
for y in range(0, 641):
    row = titles[y, :1314]
    if not row.any():
        continue
    clean = img[y, :1314][(~row) & (luma[y, :1314] > 190)]
    if len(clean):
        img[y, :1314][row] = np.median(clean, axis=0)

# small "AIRBUS INDUSTRIE" text by the nose
for y0, y1 in ((120, 150), (492, 530)):
    for y in range(y0, y1):
        img[y, 112:240] = np.median(img[y, 240:300], axis=0)

# restore the cabin windows the old titles covered: stamp a clean window at the measured pitch
# (the windows sit at a 37.8px pitch starting from the untouched one at x=444)
for wy in (193, 452):  # window row centres (mirrored top half, bottom half)
    src = img[wy - 25: wy + 25, 444 - 14: 444 + 15].copy()
    x = 444 + 37.8
    while x < 950:
        xi = int(round(x))
        img[wy - 25: wy + 25, xi - 14: xi + 15] = src
        x += 37.8

luma = img @ np.array([0.299, 0.587, 0.114])  # refresh after the clean-up above

# 2. Belly: navy lower fuselage with an amber pinstripe, sweeping up toward the tail
def belly_top(v):
    """Offset below the crown where the navy starts, along the virtual fuselage (0..2684)."""
    t = np.clip((v - 1500) / 1100, 0, 1)
    return 205 - 95 * t * t


for strip, crown, x_start, v_off in ((FRONT, CROWN_F, 0, 0), (REAR, CROWN_R, 178, 1314)):
    ys = np.arange(strip[0].start, strip[0].stop)
    for x in range(strip[1].start, strip[1].stop):
        v = x - x_start + v_off
        if v < 140:  # leave the radome alone
            continue
        top = belly_top(v)
        for half in (1, -1):  # bottom half and its mirrored twin
            offs = (ys - crown) * half
            col = img[ys, x]
            fuselage = (luma[ys, x] > 120) & (np.abs(col[:, 2] - col[:, 0]) < 22)
            nav = (offs >= top) & fuselage
            stripe = (offs >= top - 14) & (offs < top - 6) & fuselage
            if nav.any():
                shade = np.clip(luma[ys[nav], x] / 235, 0.4, 1.1)[:, None]
                img[ys[nav], x] = NAVY * shade
            if stripe.any():
                img[ys[stripe], x] = CYAN

# 3. Tail swoosh and fins: rebrand the rollout colours
tail = region_mask(REAR, FIN_L, FIN_R)
tint(blue & tail, NAVY, 140)
tint(red & tail, CYAN_DEEP, 160)
tint(orange & tail, CYAN, 190)
tint(yellow & tail, CYAN_LIGHT, 200)

# 4. Nacelles: deep navy cowlings
nac = region_mask(NACELLE) & (luma > 60) & (np.abs(B - R) < 40)
tint(nac, NAVY, 230)

out = Image.fromarray(img.astype(np.uint8))
draw = ImageDraw.Draw(out)

# 5. Fins: fill the old "A320" lettering and paint "360"
for region, centre, angle in ((FIN_L, (191, 1844), -50), (FIN_R, (1876, 1844), 52)):
    # the navy band is convex: fill its hull to wipe out the old "A320" letters inside it
    m = np.zeros((H, W), bool)
    m[region] = blue[region]
    m = ndimage.binary_opening(m, iterations=2)
    pts = np.argwhere(m)[:, ::-1]
    hull = ConvexHull(pts)
    hull_img = Image.new("L", (W, H), 0)
    ImageDraw.Draw(hull_img).polygon([tuple(p) for p in pts[hull.vertices]], fill=255)
    band = np.asarray(hull_img) > 0
    arr = np.asarray(out).astype(float)
    stripes = ndimage.binary_dilation(red | orange | yellow, iterations=1)
    arr[band & ~stripes] = NAVY * 0.95
    out = Image.fromarray(arr.astype(np.uint8))
    draw = ImageDraw.Draw(out)
    font = ImageFont.truetype(FONT, 118)
    layer = Image.new("RGBA", (520, 200), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.text((260, 100), "360", font=font, fill=(255, 255, 255, 255), anchor="mm")
    layer = layer.rotate(angle, resample=Image.BICUBIC, expand=True)
    out.paste(layer, (centre[0] - layer.width // 2, centre[1] - layer.height // 2), layer)

# 6. Titles: "AviationSpot360" above the windows, both sides (top half is rotated 180°)
def title_layer():
    font = ImageFont.truetype(FONT, 82)
    w = 900
    layer = Image.new("RGBA", (w, 120), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    a, b = "AviationSpot", "360"
    wa = ld.textlength(a, font=font)
    wb = ld.textlength(b, font=font)
    x = (w - wa - wb) / 2
    ld.text((x, 60), a, font=font, fill=(17, 28, 68, 255), anchor="lm")
    ld.text((x + wa, 60), b, font=font, fill=(0, 162, 229, 255), anchor="lm")
    return layer


t = title_layer()
cx, off = 790, 60  # centre x on the forward fuselage, offset below crown
out.paste(t, (cx - t.width // 2, CROWN_F + off - t.height // 2), t)
tm = t.transpose(Image.ROTATE_180)  # the other side's UV island is rotated 180°
out.paste(tm, (cx - t.width // 2, CROWN_F - off - t.height // 2), tm)

# 7. Registration on the aft fuselage
small = ImageFont.truetype(FONT, 22)
for (x0, y0, x1, y1), flip in (((742, 1046, 862, 1074), False), ((742, 866, 862, 894), True)):
    patch = np.asarray(out)[y0:y1, x0:x1].astype(float)
    pl = patch.mean(axis=2)
    patch[pl < 200] = np.median(patch[pl >= 200], axis=0)
    out.paste(Image.fromarray(patch.astype(np.uint8)), (x0, y0))
    reg = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
    ImageDraw.Draw(reg).text(((x1 - x0) / 2, (y1 - y0) / 2), "VT-AS360", font=small, fill=(17, 28, 68, 255), anchor="mm")
    if flip:
        reg = reg.transpose(Image.ROTATE_180)
    out.paste(reg, (x0, y0), reg)

out.save(OUT, quality=90)
print("wrote", OUT)
