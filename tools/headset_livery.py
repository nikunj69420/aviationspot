"""Repaint the pilot headset in AviationSpot360 colours.

Run: python -I tools/headset_livery.py
Reads  assests/headphones/scene.gltf + textures/*_baseColor.png ("Pilot Headphones" by valerij1987, CC BY 4.0)
       brand/livery-emblem.png (logo emblem: node tools/render_logo.mjs)
Writes assests/headphones/textures/as360_*.png and assests/headphones/scene_as360.gltf
Then:  python -I tools/compress_models.py assests/headphones/headphones.glb

- olive ear cups -> brand navy (scuffs and shading kept), with a thin cyan rim on each outer face
- the two stickers are removed and the logo emblem (tower, radar waves, 360) goes on each cup
- the blue cable parts -> brand cyan
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "assests/headphones"
TEX = DIR / "textures"
NAVY = np.array([20, 31, 72], float)    # a touch lighter than #111c44 so the cups read in the dark scene
CYAN = np.array([0, 162, 229], float)   # #00a2e5

EMBLEM = Image.open(ROOT / "brand/livery-emblem.png").convert("RGBA")
# a sliver of the next letter sits in the crop's bottom-right corner
ImageDraw.Draw(EMBLEM).rectangle((int(EMBLEM.width * 0.82), int(EMBLEM.height * 0.86), EMBLEM.width, EMBLEM.height), fill=(0, 0, 0, 0))

# per cup texture, in 4096px texture space: outer-face circle (centre, radius), the sticker box to erase,
# and (one cup) its embossed badge to flatten out of the normal map. Where the emblem goes is worked out
# from the mesh itself (cup_frame): the UV islands are turned, and one is mirrored, relative to the cups.
CUPS = {
    "metal_parts": {"face": (1990, 1010, 950), "sticker": (1680, 540, 2380, 1330)},
    "metal_parts_2": {"face": (1990, 1060, 970), "sticker": (2380, 770, 2760, 1140), "badge": (1911, 890, 430)},
}
SIZE = 4096
EMBLEM_WIDTH = 0.64  # of the cup face's width
EMBLEM_LIFT = 0.45   # cup units above the dome's peak, which sits low on the egg-shaped cup


def gltf_mesh_data(material):
    """World-space positions, normals and UVs of the primitives that use `material`."""
    g = json.loads((DIR / "scene.gltf").read_text())
    blob = (DIR / g["buffers"][0]["uri"]).read_bytes()

    def acc(i):
        a = g["accessors"][i]
        bv = g["bufferViews"][a["bufferView"]]
        n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}[a["componentType"]]
        off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = bv.get("byteStride", 0) or n * np.dtype(dt).itemsize
        raw = np.frombuffer(blob, np.uint8, count=stride * a["count"], offset=off).reshape(a["count"], stride)
        return raw[:, : n * np.dtype(dt).itemsize].copy().view(dt).reshape(a["count"], n).astype(float)

    mat_i = next(i for i, m in enumerate(g["materials"]) if m["name"] == material)
    parent = {c: i for i, n in enumerate(g["nodes"]) for c in n.get("children", [])}

    def world(i):
        m = np.array(g["nodes"][i].get("matrix", np.eye(4).flatten(order="F").tolist())).reshape(4, 4, order="F")
        return world(parent[i]) @ m if i in parent else m

    for ni, node in enumerate(g["nodes"]):
        if "mesh" not in node:
            continue
        for prim in g["meshes"][node["mesh"]]["primitives"]:
            if prim["material"] != mat_i:
                continue
            M = world(ni)
            P = acc(prim["attributes"]["POSITION"]) @ M[:3, :3].T + M[:3, 3]
            Nn = acc(prim["attributes"]["NORMAL"]) @ M[:3, :3].T
            Nn /= np.linalg.norm(Nn, axis=1, keepdims=True)
            return P, Nn, acc(prim["attributes"]["TEXCOORD_0"]) * SIZE


def cup_frame(name, face):
    """Where the cup's outer face peaks in the texture, and how 1 unit right/up on the cup maps to texture px."""
    P, Nn, UV = gltf_mesh_data(name)
    cx, cy, r = face
    on_face = np.hypot(UV[:, 0] - cx, UV[:, 1] - cy) < r * 0.8
    d = Nn[on_face].mean(axis=0)
    d /= np.linalg.norm(d)                                  # the cup's outward direction
    up = np.array([0.0, 1.0, 0.0]) - d * d[1]
    up /= np.linalg.norm(up)
    right = np.cross(-d, up)                                # as seen by someone looking at the cup
    fp = P[on_face]
    apex = fp[np.argmax(fp @ d)]
    sx, sy = (fp - apex) @ right, (fp - apex) @ up
    width = np.ptp(sx[(Nn[on_face] @ d) > 0.6])
    near = np.hypot(sx, sy) < width * 0.3                   # fit the mapping where the face is nearly flat
    A = np.c_[sx[near], sy[near], np.ones(near.sum())]
    coef, *_ = np.linalg.lstsq(A, UV[on_face][near], rcond=None)
    return coef[2], coef[:2], width


def emblem_layer(size, centre, J, width_units):
    """The emblem drawn into texture space through the cup's surface frame (handles turn and mirror)."""
    ew, eh = EMBLEM.size
    k = width_units / ew                                    # surface units per emblem pixel
    Jinv = np.linalg.inv(J)                                 # texture px offset -> (right, up) units
    # emblem px:  ex = sx / k + ew/2,  ey = -sy / k + eh/2,  with [sx, sy] = [X - cx, Y - cy] @ Jinv
    a, b = Jinv[0, 0] / k, Jinv[1, 0] / k
    d_, e = -Jinv[0, 1] / k, -Jinv[1, 1] / k
    c = ew / 2 - a * centre[0] - b * centre[1]
    f = eh / 2 - d_ * centre[0] - e * centre[1]
    return EMBLEM.transform(size, Image.AFFINE, (a, b, c, d_, e, f), resample=Image.BICUBIC)


def luma(a):
    return a @ np.array([0.299, 0.587, 0.114])


def repaint_cup(name, face, sticker, badge=None):
    img = np.asarray(Image.open(TEX / f"{name}_baseColor.png").convert("RGB")).astype(float)
    R, G, B = img[..., 0], img[..., 1], img[..., 2]

    # 1. erase the sticker: every non-green pixel in its box takes the nearest cup-green pixel
    x0, y0, x1, y1 = sticker
    box = np.zeros(R.shape, bool)
    box[y0:y1, x0:x1] = True
    # the cup's paint colour, sampled from its face around the sticker
    ring = np.zeros(R.shape, bool)
    ring[max(0, y0 - 120):y1 + 120, max(0, x0 - 120):x1 + 120] = True
    ring &= ~box & (G > R + 8) & (G > B + 8)
    paint = np.median(img[ring], axis=0)
    hole = box & (np.linalg.norm(img - paint, axis=2) > 38)
    hole = ndimage.binary_dilation(hole, iterations=6) & box
    _, (iy, ix) = ndimage.distance_transform_edt(hole, return_indices=True)
    img[hole] = img[iy[hole], ix[hole]]
    img = ndimage.gaussian_filter(img, sigma=(3, 3, 0)) * hole[..., None] + img * ~hole[..., None]
    R, G, B = img[..., 0], img[..., 1], img[..., 2]

    # 2. olive -> navy, keeping the paint's light and dark (scratches, dirt, shading)
    green = (G > R + 6) & (G > B + 6)
    shade = np.clip(luma(img[green]) / 150.0, 0.45, 1.5)[:, None]
    img[green] = np.clip(NAVY * shade, 0, 255)

    out = Image.fromarray(img.astype(np.uint8))
    # 3. thin cyan rim near the edge of the outer face
    cx, cy, r = face
    rim = Image.new("L", out.size, 0)
    d = ImageDraw.Draw(rim)
    d.ellipse((cx - r * 0.86, cy - r * 0.86, cx + r * 0.86, cy + r * 0.86), outline=255, width=26)
    out.paste(Image.new("RGB", out.size, tuple(CYAN.astype(int))), (0, 0), rim)
    # 4. the emblem, upright and centred on the cup's outer face
    centre, J, width = cup_frame(name, face)
    centre = centre + np.array([0.0, EMBLEM_LIFT]) @ J
    layer = emblem_layer(out.size, centre, J, width * EMBLEM_WIDTH)
    out = Image.alpha_composite(out.convert("RGBA"), layer).convert("RGB")
    print(f"{name}: emblem at {centre.round()}, {width:.1f} units wide face")
    out.save(TEX / f"as360_{name}_baseColor.png")

    # 5. flatten the cup's embossed badge out of the normal map so it doesn't show through the emblem
    if badge:
        bx, by, br = badge
        nrm = np.asarray(Image.open(TEX / f"{name}_normal.png").convert("RGB")).astype(float)
        yy, xx = np.mgrid[0:nrm.shape[0], 0:nrm.shape[1]]
        d = np.hypot(xx - bx, yy - by) / br
        k = np.clip((1.15 - d) / 0.3, 0, 1)[..., None]  # 1 inside, feathered edge
        nrm = nrm * (1 - k) + np.array([128, 128, 255], float) * k
        Image.fromarray(nrm.astype(np.uint8)).save(TEX / f"as360_{name}_normal.png")


def repaint_cables():
    img = np.asarray(Image.open(TEX / "cables_small_parts_baseColor.png").convert("RGB")).astype(float)
    R, G, B = img[..., 0], img[..., 1], img[..., 2]
    blue = (B > R + 40) & (B > G + 10)
    shade = np.clip(luma(img[blue]) / 120.0, 0.4, 1.4)[:, None]
    img[blue] = np.clip(CYAN * shade, 0, 255)
    Image.fromarray(img.astype(np.uint8)).save(TEX / "as360_cables_small_parts_baseColor.png")


for name, spec in CUPS.items():
    repaint_cup(name, **spec)
repaint_cables()

g = json.loads((DIR / "scene.gltf").read_text())
for img in g["images"]:
    for name in (*CUPS, "cables_small_parts"):
        if img["uri"] == f"textures/{name}_baseColor.png":
            img["uri"] = f"textures/as360_{name}_baseColor.png"
    for name, spec in CUPS.items():
        if spec.get("badge") and img["uri"] == f"textures/{name}_normal.png":
            img["uri"] = f"textures/as360_{name}_normal.png"
(DIR / "scene_as360.gltf").write_text(json.dumps(g))
print("wrote", DIR / "scene_as360.gltf")
