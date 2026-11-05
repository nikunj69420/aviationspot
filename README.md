# AviationSpot360 — Airspace of Awareness

Phase 1 brand-reveal and early-access site for AviationSpot360, a learning and career platform for student pilots. The page is one scroll-driven climb from the ground to FL350, built with Three.js, GSAP ScrollTrigger and Lenis.

## Run it

The 3D models have to be served over HTTP (opening `index.html` directly won't load them):

```bash
python tools/serve.py
```

Then open http://localhost:5173. (`tools/serve.py` is a plain static server that turns off browser caching, so edits show up on reload.)

## What's where

- `index.html`, `style.css`, `main.js`: the page, styles and all scroll/3D logic
- `aviationspot-logo.svg`: the official logo (source). `brand/` holds the web versions built from it by `tools/logo_build.py`: `logo.svg` (navy, for light backgrounds), `logo-white.svg` and `logo-white-wordmark.svg` (for the dark site) and `favicon.svg`. The build outlines the logo's text (its fonts are Windows-only) and makes the radar "o" sweep
- Theme: navy `#0b163a` / `#111c44` and sky cyan `#00a2e5`, taken from the logo (`--brand-navy`, `--navy-2`, `--accent` in `style.css`)
- `globe.js`: the exam section's globe: dotted land, VABB → FAOR and VABB → KJFK great-circle routes, flown by a small aircraft; the authority tabs spin it to each route. Land dots are baked from Natural Earth (via world-atlas) by `tools/build_globe_dots.mjs` into `assests/globe/land.json`
- `headset.js`: the transmission scene that opens the brand story (05): the AviationSpot360 pilot headset with radio rings; the radio panel and the tower call are DOM, driven from `main.js`
- `tools/headset_livery.py`: paints the headset in brand navy and cyan with the logo emblem on each ear cup, placed from the mesh's own UV mapping (then rebuild `assests/headphones/headphones.glb` with `tools/compress_models.py`)
- Story, impact and founder sections (05–08) carry the brand story and achievements: the flight log, stats, achievements and the note from the flight deck
- `assests/*/*.glb`: the 3D models the site loads (meshopt-compressed, WebP textures): `a320`, `a320_cockpit`, `jet_engine`, `headphones`, `g650`
- `tools/compress_models.py`: rebuilds those .glb files from the source glTFs (`python -I tools/compress_models.py`, needs Node for npx)
- `tools/convert_jet_engine.py`: converts the jet engine's spec/gloss materials to metal/rough (run before compressing it)
- `assests/atc_tower/delhi_atc_tower.glb`: the Delhi IGI Airport ATC tower (HOK, 101.9 m), modelled procedurally from photographs by `tools/build_delhi_tower.mjs` (`node tools/build_delhi_tower.mjs <node_modules with three@0.169.0>`); 1 unit = 1 m, not yet used on the page
- `tools/model_viewer.html`: orbit any model, e.g. http://localhost:5173/tools/model_viewer.html?src=../assests/atc_tower/delhi_atc_tower.glb (`az`, `focus`, `zoom` set the view)
- `tools/livery.py`: paints the A320 in the logo livery: the official wordmark on both sides of the fuselage, the tower-and-radar emblem on the tail, a cyan wave cheatline over a navy belly (`python -I tools/livery.py`, then rebuild `assests/a320/a320.glb` with `tools/compress_models.py`). The logo images it uses, `brand/livery-title.png` and `brand/livery-emblem.png`, are rendered by `node tools/render_logo.mjs <node_modules with @resvg/resvg-js>`

The early-access form isn't connected to a backend yet; nothing is sent.

The page opens after ~0.7 MB (hero photo, A320); the A320 flight deck, engine, headset and G650 stream in behind it (~8 MB). The large uncompressed sources are git-ignored and only needed to rebuild the .glb files.

## 3D model credits

- "Airbus A320" by OUTPISTON, CC BY-NC-SA 4.0
- A320 flight deck ("(Airbus A320) Airplane Cockpit"): source and licence still to be confirmed before launch
- "Pilot Headphones" by valerij1987, CC BY 4.0 (repainted by `tools/headset_livery.py`)
- "Jet Engine" by Pilot, CC BY 4.0 (converted to metal/rough by `tools/convert_jet_engine.py`)
- "Gulfstream G650ER" by Luca Martina, CC BY 4.0

All via Sketchfab. The A320 exterior (CC BY-NC-SA) does not allow commercial use, and the flight deck's licence is unconfirmed; replace or license both before a commercial launch.
