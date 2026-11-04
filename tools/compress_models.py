"""Shrink the site's 3D models for faster loading.

Two passes per model:
  1. textures -> WebP (Pillow), resized to what is actually visible, registered via EXT_texture_webp
  2. geometry -> meshopt-compressed single .glb (gltf-transform, run by npx)
Node and material names are kept, because main.js looks some of them up by name
(the Cessna's propeller "Object_192" and its G1000 screen materials).

Run from the project root:  python -I tools/compress_models.py [output.glb ...]
Needs Node (npx) for gltf-transform. Writes the .glb files listed in MODELS.
"""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
GT = ["npx", "-y", "@gltf-transform/cli@4.2.1"]
# source glTF, output glb, max texture size (keeps the cockpit panel/instruments sharp), extra flags
MODELS = [
    ("assests/c182/scene.gltf", "assests/c182/c182.glb", {"int1": 2048, "gauge": 2048, "*": 1024},
     ["--join", "false", "--flatten", "false", "--instance", "false", "--palette", "false", "--simplify", "false"]),
    ("assests/jet_engine/scene.gltf", "assests/jet_engine/jet_engine.glb", {"*": 1024}, ["--simplify", "false"]),
    # only ever seen small and far away, so it can lose most of its triangles
    ("assests/src/gulfstream_g650er/scene.gltf", "assests/g650/g650.glb", {"*": 1024},
     ["--simplify-ratio", "0.2", "--simplify-error", "0.002"]),
    ("assests/a320/scene_as360.gltf", "assests/a320/a320.glb", {"*": 2048}, ["--simplify", "false"]),
    ("assests/radar/scene.gltf", "assests/radar/radar.glb", {"*": 1024}, ["--simplify", "false"]),
    ("assests/src/hangar/scene.gltf", "assests/hangar/hangar.glb", {"*": 1024}, ["--simplify", "false"]),
]
# materials to strip before compressing (the hangar ships with a motor-glider parked inside)
DROP = {"assests/hangar/hangar.glb": {"Plane_Body", "Body_Plane", "Plane_Body02", "Translucent_Glass_Gray",
                                     "edge_color000255", "edge_color255245238255"}}


def drop_materials(g: dict, names: set) -> None:
    """Remove primitives using the named materials; meshes left empty are removed and indices remapped."""
    drop = {i for i, m in enumerate(g.get("materials", [])) if m.get("name") in names}
    keep_mesh = []
    for mesh in g["meshes"]:
        mesh["primitives"] = [p for p in mesh["primitives"] if p.get("material") not in drop]
        keep_mesh.append(bool(mesh["primitives"]))
    remap = {old: new for new, old in enumerate(i for i, k in enumerate(keep_mesh) if k)}
    g["meshes"] = [m for m, k in zip(g["meshes"], keep_mesh) if k]
    for node in g["nodes"]:
        if "mesh" in node:
            if node["mesh"] in remap:
                node["mesh"] = remap[node["mesh"]]
            else:
                del node["mesh"]


def webp_pass(src: Path, work: Path, sizes: dict, drop: set) -> Path:
    g = json.loads(src.read_text())
    if drop:
        drop_materials(g, drop)
    normal_imgs = {g["textures"][m["normalTexture"]["index"]]["source"] for m in g.get("materials", []) if "normalTexture" in m}
    for i, img in enumerate(g.get("images", [])):
        im = Image.open(src.parent / img["uri"].split("?")[0])
        limit = next((v for k, v in sizes.items() if k != "*" and k in img["uri"]), sizes["*"])
        if max(im.size) > limit:
            im = im.resize((limit * im.width // max(im.size), limit * im.height // max(im.size)), Image.LANCZOS)
        has_alpha = im.mode in ("RGBA", "LA", "P") and im.convert("RGBA").getextrema()[3][0] < 250
        im = im.convert("RGBA" if has_alpha else "RGB")
        name = f"tex_{i}.webp"
        # normal maps need more precision than colour maps
        im.save(work / name, "WEBP", quality=92 if i in normal_imgs else 82, method=6)
        g["images"][i] = {"uri": name, "mimeType": "image/webp"}
    for t in g.get("textures", []):
        t.setdefault("extensions", {})["EXT_texture_webp"] = {"source": t.pop("source")}
    for key in ("extensionsUsed", "extensionsRequired"):
        g[key] = sorted(set(g.get(key, [])) | {"EXT_texture_webp"})
    for b in g["buffers"]:
        shutil.copy(src.parent / b["uri"], work / b["uri"])
    out = work / "scene.gltf"
    out.write_text(json.dumps(g))
    return out


# optional args: only rebuild the listed outputs, e.g. assests/radar/radar.glb
for src_rel, out_rel, sizes, flags in [m for m in MODELS if len(sys.argv) < 2 or m[1] in sys.argv[1:]]:
    src, out = ROOT / src_rel, ROOT / out_rel
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        staged = webp_pass(src, Path(tmp), sizes, DROP.get(out_rel, set()))
        subprocess.run([*GT, "optimize", str(staged), str(out), "--compress", "meshopt",
                        "--texture-compress", "false", *flags], check=True, shell=True)
    print(f"{src_rel} -> {out_rel}: {out.stat().st_size / 1e6:.2f} MB")
