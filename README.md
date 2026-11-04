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
- `walk.js`: the pre-flight walkaround (A320 parked in the hangar, seven camera stops, hotspots, drag-to-look; built-in landing gear because the A320 model is gear-up). Its check/exam-fact copy is a draft for instructor review
- `radar.js`: the radar scene (splits and paints the radar model, rise-in/sink-out transitions) and its 2D scope
- `assests/*/*.glb`: the 3D models the site loads (meshopt-compressed, WebP textures): `a320`, `c182`, `jet_engine`, `radar`, `g650`, `hangar` (the hangar's parked glider is stripped at build time)
- `tools/compress_models.py`: rebuilds those .glb files from the source glTFs (`python -I tools/compress_models.py`, needs Node for npx)
- `tools/convert_jet_engine.py`: converts the jet engine's spec/gloss materials to metal/rough (run before compressing it)
- `tools/livery.py`: repaints the A320 texture (`python -I tools/livery.py`)

The early-access form isn't connected to a backend yet; nothing is sent.

The page opens after ~0.7 MB (hero photo, A320, radar); the Cessna, engine and G650 stream in behind it (~6 MB). The large uncompressed sources are git-ignored and only needed to rebuild the .glb files.

## 3D model credits

- "Airbus A320" by OUTPISTON, CC BY-NC-SA 4.0
- "Cessna 182 Skylane" by VTX, CC BY-NC-SA 4.0
- "Radar Turret" by 1738 Creations, CC BY 4.0
- "Aircraft Hangar" by jimbogies, CC BY 4.0
- "Jet Engine" by Pilot, CC BY 4.0 (converted to metal/rough by `tools/convert_jet_engine.py`)
- "Gulfstream G650ER" by Luca Martina, CC BY 4.0

All via Sketchfab. The two CC BY-NC-SA models don't allow commercial use; replace them or license them before a commercial launch.
