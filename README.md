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
- `radar.js`: the radar scene (splits and paints the radar model, rise-in/sink-out transitions) and its 2D scope
- `assests/radar/`: radar model (untextured; coloured in code)
- `assests/a320/`: Airbus A320 with the AviationSpot360 livery (`scene_as360.gltf`)
- `assests/c182/`: Cessna 182 Skylane (textures downscaled for the web)
- `assests/jet_engine/`: airliner engine with cutaway (converted for three.js)
- `assests/src/`: Gulfstream G650ER model
- `tools/livery.py`: repaints the A320 texture (`python -I tools/livery.py`)

The early-access form isn't connected to a backend yet; nothing is sent.

## 3D model credits

- "Airbus A320" by OUTPISTON, CC BY-NC-SA 4.0
- "Cessna 182 Skylane" by VTX, CC BY-NC-SA 4.0
- "Radar Turret" by 1738 Creations, CC BY 4.0
- "Jet Engine" by Pilot, CC BY 4.0 (converted to metal/rough by `tools/convert_jet_engine.py`)
- "Gulfstream G650ER" by Luca Martina, CC BY 4.0

All via Sketchfab. The two CC BY-NC-SA models don't allow commercial use; replace them or license them before a commercial launch.
