"""Convert the Sketchfab "Jet Engine" from spec/gloss materials to metal/rough for three.js.

three.js dropped KHR_materials_pbrSpecularGlossiness, and this model marks it as required,
so it won't load as-is. This rewrites each material as standard PBR:
  base colour <- diffuse
  roughness   <- 1 - glossiness (spec/gloss alpha)
  metalness   <- how bright the specular colour is (bright spec = bare metal)
Textures are re-saved as JPEG (normals stay PNG).

Run: python -I tools/convert_jet_engine.py
Reads  assests/src/jet_engine/   Writes assests/jet_engine/
"""
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assests/src/jet_engine"
DST = ROOT / "assests/jet_engine"
(DST / "textures").mkdir(parents=True, exist_ok=True)

g = json.loads((SRC / "scene.gltf").read_text())
EXT = "KHR_materials_pbrSpecularGlossiness"
new_images = {}  # source image index -> new image index


def add_image(uri):
    g["images"].append({"uri": uri})
    return len(g["images"]) - 1


def add_texture(image_index, like):
    g["textures"].append({"source": image_index, "sampler": g["textures"][like].get("sampler", 0)})
    return len(g["textures"]) - 1


def to_jpg(img_index):
    """Re-save an existing image as JPEG in place of the PNG."""
    if img_index in new_images:
        return
    src = SRC / g["images"][img_index]["uri"]
    out = Path(g["images"][img_index]["uri"]).with_suffix(".jpg")
    Image.open(src).convert("RGB").save(DST / out, quality=88)
    g["images"][img_index]["uri"] = out.as_posix()
    new_images[img_index] = img_index


mr_cache = {}
for m in g["materials"]:
    sg = m.get("extensions", {}).pop(EXT, None)
    if sg is None:
        continue
    pbr = {"baseColorFactor": sg.get("diffuseFactor", [1, 1, 1, 1])}
    if "diffuseTexture" in sg:
        pbr["baseColorTexture"] = sg["diffuseTexture"]
        to_jpg(g["textures"][sg["diffuseTexture"]["index"]]["source"])
    sgt = sg.get("specularGlossinessTexture")
    if sgt:
        tex = sgt["index"]
        if tex not in mr_cache:
            src_img = g["textures"][tex]["source"]
            rgba = np.asarray(Image.open(SRC / g["images"][src_img]["uri"]).convert("RGBA")).astype(np.float32) / 255
            spec = rgba[..., :3].mean(axis=2)
            gloss = rgba[..., 3] * sg.get("glossinessFactor", 1.0)
            mr = np.zeros(rgba.shape[:2] + (3,), np.float32)
            mr[..., 1] = 1 - gloss                                  # roughness (G)
            mr[..., 2] = np.clip((spec - 0.04) / 0.5, 0, 1)        # metalness (B)
            uri = f"textures/{Path(g['images'][src_img]['uri']).stem.replace('specularGlossiness', 'metalRough')}.jpg"
            Image.fromarray((mr * 255).astype(np.uint8)).save(DST / uri, quality=90)
            mr_cache[tex] = add_texture(add_image(uri), tex)
        pbr["metallicRoughnessTexture"] = {"index": mr_cache[tex], **({"texCoord": sgt["texCoord"]} if "texCoord" in sgt else {})}
        pbr["metallicFactor"] = 1.0
        pbr["roughnessFactor"] = 1.0
    else:
        pbr["metallicFactor"] = 0.6
        pbr["roughnessFactor"] = 0.4
    m["pbrMetallicRoughness"] = pbr
    if not m.get("extensions"):
        m.pop("extensions", None)
    if "occlusionTexture" in m:
        to_jpg(g["textures"][m["occlusionTexture"]["index"]]["source"])

for key in ("extensionsUsed", "extensionsRequired"):
    if key in g:
        g[key] = [e for e in g[key] if e != EXT]
        if not g[key]:
            g.pop(key)

# normal maps and anything not yet written are copied as-is
for im in g["images"]:
    out = DST / im["uri"]
    if not out.exists():
        shutil.copy(SRC / im["uri"], out)
shutil.copy(SRC / "scene.bin", DST / "scene.bin")
shutil.copy(SRC / "license.txt", DST / "license.txt")
(DST / "scene.gltf").write_text(json.dumps(g))
print("wrote", DST)
