import * as THREE from 'three';

/**
 * The stage: renderer, scene, lighting and set dressing.
 *
 * Deliberately cheap. This runs on phones over HTTPS, so: no shadows beyond one
 * low-res directional map, no post-processing, capped pixel ratio, and a fog
 * that hides the back of the box instead of geometry that fills it.
 */
export function createWorld(canvas, game) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: window.devicePixelRatio < 2, // MSAA is wasted on a 3x phone panel
    powerPreference: 'high-performance',
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b0d17');
  scene.fog = new THREE.Fog('#0b0d17', 14, 34);

  const camera = new THREE.PerspectiveCamera(game.camera.fov, 16 / 9, 0.1, 120);

  // --- lighting: one key with shadows, one cool rim, plus ambient fill.
  const key = new THREE.DirectionalLight('#fff3e0', 2.1);
  key.position.set(4, 9, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 30;
  const s = game.stage.halfWidth + 3;
  key.shadow.camera.left = -s;
  key.shadow.camera.right = s;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -2;
  key.shadow.bias = -0.0012;
  scene.add(key);

  const rim = new THREE.DirectionalLight('#5fa8ff', 1.15);
  rim.position.set(-6, 4, -6);
  scene.add(rim);

  scene.add(new THREE.HemisphereLight('#8fb6ff', '#241a2e', 0.75));

  // --- floor
  const half = game.stage.halfWidth;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 8, 26),
    new THREE.MeshStandardMaterial({ color: '#2a2b3d', roughness: 0.92, metalness: 0.05 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = game.stage.floorY;
  floor.receiveShadow = true;
  scene.add(floor);

  // A brighter strip marks the fighting plane so depth reads correctly.
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2, 3.4),
    new THREE.MeshStandardMaterial({ color: '#3b3d55', roughness: 0.8 }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(0, game.stage.floorY + 0.002, 0);
  strip.receiveShadow = true;
  scene.add(strip);

  // --- corner walls: the player must be able to *see* the corner they are in.
  // Kept low and pushed back — tall slabs near the camera read as black bars
  // down the sides of the screen and swallow a third of the frame.
  const wallMat = new THREE.MeshStandardMaterial({
    color: '#2f3350', roughness: 0.62, metalness: 0.3,
  });
  for (const dir of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.1, 4.4), wallMat);
    wall.position.set(dir * (half + 0.25), 1.55, -1.4);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);

    // A lit edge marks exactly where the corner clamp bites.
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 3.0, 0.1),
      new THREE.MeshBasicMaterial({ color: '#5f8cff' }),
    );
    glow.position.set(dir * (half - 0.03), 1.55, 0.75);
    scene.add(glow);
  }

  // --- backdrop: a shallow ring of blocks reads as a skyline for free.
  const backMat = new THREE.MeshStandardMaterial({ color: '#232842', roughness: 1 });
  const back = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const h = 2 + ((i * 7919) % 100) / 100 * 6;
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, h, 1.1), backMat);
    b.position.set(-14 + i * 1.15, h / 2, -9 - ((i * 31) % 5) * 0.7);
    back.add(b);
  }
  scene.add(back);

  // A dim fill aimed at the backdrop keeps it from crushing to black without
  // washing out the key light on the fighters.
  const backFill = new THREE.DirectionalLight('#6f8fd8', 0.8);
  backFill.position.set(0, 5, -6);
  backFill.target.position.set(0, 1, -9);
  scene.add(backFill);
  scene.add(backFill.target);

  return { renderer, scene, camera, floor, key };
}

/** Resize the renderer to the display, honouring device pixel ratio caps. */
export function resizeRenderer(renderer, canvas) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    return true;
  }
  return false;
}
