// The transmission stage: an AviationSpot360 pilot headset turning in the dusk, with radio rings
// pulsing out of it while the tower talks. Section 05, where the brand story begins.
import * as THREE from 'three';


export function createHeadsetStage({ envMap, loader }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  scene.environment = envMap;
  scene.add(new THREE.HemisphereLight(0xbfd6ff, 0x1a1530, 0.9));
  const key = new THREE.DirectionalLight(0xfff0e0, 2.4); // warm dusk key from the front left
  key.position.set(-6, 5, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x00a2e5, 3.2); // brand-cyan rim from behind
  rim.position.set(6, 3, -6);
  scene.add(rim);
  const under = new THREE.PointLight(0x4cc3f5, 18, 18);
  under.position.set(0, -3.5, 2);
  scene.add(under);

  const rig = new THREE.Group();   // arrives and leaves
  scene.add(rig);
  const spin = new THREE.Group();  // slow turn with the scroll
  rig.add(spin);

  // radio rings: expanding halos behind the headset, brighter while someone is transmitting
  const rings = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.985, 1, 128),
      new THREE.MeshBasicMaterial({ color: 0x4cc3f5, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    m.position.z = -0.2;
    rig.add(m);
    rings.push(m);
  }

  let loaded = false;
  let appear = 0; // 0 → 1 once the model has arrived, so it never pops in
  let model = null;
  function load() {
    if (loaded) return;
    loaded = true;
    loader.load('assests/headphones/headphones.glb', (gltf) => {
      const m = gltf.scene;
      m.traverse((o) => {
        if (!o.isMesh) return;
        o.material.envMapIntensity = 1.1;
        if (o.material.map) o.material.map.anisotropy = 8;
      });
      const wrap = new THREE.Group();
      wrap.add(m);
      // size and centre on the body (cups and headband), not the cable and boom mic that hang off it
      const box = new THREE.Box3();
      wrap.updateMatrixWorld(true);
      wrap.traverse((o) => { if (o.isMesh && !/cable/i.test(o.material.name)) box.expandByObject(o); });
      if (box.isEmpty()) box.setFromObject(wrap);
      const s = 4.9 / box.getSize(new THREE.Vector3()).toArray().reduce((a, b) => Math.max(a, b));
      wrap.scale.setScalar(s);
      wrap.position.copy(box.getCenter(new THREE.Vector3()).multiplyScalar(-s));
      spin.add(wrap);
      model = wrap;
    });
  }

  function update({ p, dt, time, pointer, reduceMotion, presence = 1, talk = 0 }) {
    if (model) appear = Math.min(1, appear + dt / 1.2);
    const show = presence * appear;
    const e = show * show * (3 - 2 * show); // smoothstep: eases in and out, no snap
    const wide = camera.aspect >= 1;
    // arrive: rise in from below with a half turn; leave: the same in reverse
    rig.position.set(wide ? 4.4 : 0, (wide ? 1.5 : -2.2) - 5 * (1 - e), 0);
    rig.rotation.z = (1 - e) * 0.25;
    rig.scale.setScalar(0.75 + 0.25 * e);
    const drift = reduceMotion ? 0 : Math.sin(time * 0.6) * 0.08;
    // turned so the boom mic comes toward the viewer; the scroll only rocks it gently either side
    spin.rotation.y = Math.PI - 0.75 + (p - 0.5) * 0.8 + (1 - e) * 0.9 + drift + pointer.x * 0.3;
    spin.rotation.x = 0.12 + (reduceMotion ? 0 : Math.sin(time * 0.8) * 0.04) + pointer.y * 0.15;
    spin.position.y = reduceMotion ? 0 : Math.sin(time * 1.1) * 0.12;

    for (let i = 0; i < rings.length; i++) {
      const ph = reduceMotion ? i / rings.length : (time * (0.32 + talk * 0.3) + i / rings.length) % 1;
      rings[i].lookAt(camera.position); // face the camera so the rings stay round and centred on the headset
      rings[i].scale.setScalar(2.4 + ph * 5.5);
      rings[i].material.opacity = (1 - ph) * (1 - ph) * (0.18 + talk * 0.4) * e;
    }
    under.intensity = 10 + talk * 16;

    camera.position.set(pointer.x * 0.6, (wide ? 0.6 : -0.6) - pointer.y * 0.4, wide ? 17 : 24);
    camera.lookAt(0, wide ? 0.4 : -0.8, 0);
  }
  return { scene, camera, update, load };
}
