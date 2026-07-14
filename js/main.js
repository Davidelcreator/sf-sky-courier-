// ============================================================
// main.js — the whole game, top to bottom:
//
//   1. MAP SETUP        the real 3D city (MapLibre + OpenStreetMap)
//   2. GAME STATE       one object holding where the car is right now
//   3. KEYBOARD INPUT   which keys are held down this instant
//   4. 3D GRAPHICS      the car, beacon and shadow (three.js)
//   5. PHYSICS          acceleration, gravity, drag — runs every frame
//   6. COLLISIONS       buildings are solid when you're below their roof
//   7. DELIVERIES       score points when you reach the beacon
//   8. CHASE CAMERA     the map camera follows behind the car
//   9. HUD              score, compass, speed readouts
//  10. GAME LOOP        ties it all together, ~60 times per second
// ============================================================

import * as THREE from 'three';
import { START, BEACONS, PHYSICS, CAMERA, GAME } from './config.js';

// MapLibre was loaded with a plain <script> tag, so it lives on `window`.
const maplibregl = window.maplibregl;

// Meters in one degree of latitude, everywhere on Earth. (Longitude
// degrees shrink as you go toward the poles — we correct for that
// with cos(latitude) wherever it matters.)
const METERS_PER_DEG_LAT = 111320;

const DEG = Math.PI / 180; // multiply degrees by this to get radians


// ============================================================
// 1. MAP SETUP
// ============================================================
// OpenFreeMap serves free map tiles built from OpenStreetMap data —
// no API key or account needed. The "style" URL describes colors,
// fonts, and where the street/building data comes from.

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: START.lngLat,
  zoom: 16.8,
  pitch: 60,        // tilt the view so we see buildings in 3D
  maxPitch: 80,     // allow our chase camera to look near the horizon
  interactive: false, // the GAME controls the camera, not the mouse
  centerClampedToGround: false, // let us aim the camera at a FLYING car
  canvasContextAttributes: { antialias: true }, // smoother 3D edges
});

// Once the style has loaded we can add our own layers on top.
map.on('load', () => {
  const style = map.getStyle();

  // The style may already include a 3D-buildings layer. We remove any
  // and add our own so we control its ID (we query it for collisions).
  for (const layer of style.layers.filter((l) => l.type === 'fill-extrusion')) {
    map.removeLayer(layer.id);
  }

  // Declutter: hide shop/restaurant icons and house numbers — great on
  // a map you're reading, distracting in a game you're flying through.
  for (const layer of style.layers) {
    if (layer.id.startsWith('poi') || layer.id.includes('housenumber')) {
      map.removeLayer(layer.id);
    }
  }

  // Find the style's vector data source (usually named "openmaptiles").
  // Saved globally: the collision system reads building shapes from it.
  buildingSourceId = Object.keys(style.sources)
    .find((id) => style.sources[id].type === 'vector');

  // Find the first text layer so we can slide our buildings UNDER the
  // street/place labels — labels stay readable that way.
  const firstSymbolId = style.layers.find((l) => l.type === 'symbol')?.id;

  // "fill-extrusion" = take flat building footprints and pull them up
  // to their real height (OpenStreetMap knows many building heights!).
  map.addLayer(
    {
      id: '3d-buildings',
      source: buildingSourceId,
      'source-layer': 'building',
      type: 'fill-extrusion',
      minzoom: 13,
      paint: {
        // Taller buildings get a slightly cooler color. "coalesce" means
        // "use render_height, or 0 if the building has no height data".
        'fill-extrusion-color': [
          'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 0],
          0, '#dfe4ec',
          60, '#c3cede',
          150, '#a4b3cf',
        ],
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 5],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.95,
      },
    },
    firstSymbolId,
  );

  // Our three.js layer (car, beacon) is added last so it draws with
  // full knowledge of the buildings' depth — that's what lets a
  // building correctly hide the car when it drives behind one.
  map.addLayer(gameLayer);
});


// ============================================================
// 2. GAME STATE
// ============================================================
// Everything about "right now" lives in these small objects.
// The physics step updates them; the graphics and HUD read them.

const car = {
  lng: START.lngLat[0],
  lat: START.lngLat[1],
  alt: 0,               // altitude in meters above the ground
  heading: START.heading, // compass direction in radians (0 = north)
  vx: 0,                // eastward speed, meters/second
  vy: 0,                // northward speed, meters/second
  vAlt: 0,              // vertical speed, meters/second
};

// Where the car was last frame — needed for collision "undo".
const prev = { lng: car.lng, lat: car.lat, alt: car.alt };

const state = {
  running: false,       // false until the player clicks START
  score: 0,
  deliveries: 0,        // how many packages delivered so far
  targetIndex: 0,       // which BEACONS entry we're delivering to
  camHeading: START.heading, // camera direction (lags behind the car)
};

// Handy while learning: open the browser console (F12) and type
// `game.car` or `game.state` to watch the numbers change live.
window.game = { car, state, keys: null, map };


// ============================================================
// 3. KEYBOARD INPUT
// ============================================================
// We don't act when a key is pressed. Instead we remember which keys
// are down, and the physics step reads that 60 times a second.
// That's the standard pattern for smooth game controls.

const keys = { forward: false, back: false, left: false, right: false, thrust: false };
window.game.keys = keys;

// Analog joystick position (touch screens). Each axis runs -1..1;
// 0 = centered. x = steering (right positive), y = throttle (up/forward
// positive). The keyboard sets full-tilt values instead.
const joystick = { x: 0, y: 0 };

// The COMBINED control input, recomputed each physics step from
// keyboard + joystick. steer/throttle are -1..1. Keeping the final
// input in one object lets both the physics and the car's cosmetic
// tilt read the exact same numbers.
const input = { steer: 0, throttle: 0 };
window.game.joystick = joystick;
window.game.input = input;
// Debug hook: lets you single-step the physics from the console, e.g.
// `game.step(0.1)` advances the world 0.1s. (The game normally calls
// this ~60×/sec for you.) Assigned once updatePhysics exists, below.

// Maps physical keys to game actions. e.code names the physical key,
// so this works even on non-QWERTY keyboards.
const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back',    ArrowDown: 'back',
  KeyA: 'left',    ArrowLeft: 'left',
  KeyD: 'right',   ArrowRight: 'right',
  Space: 'thrust',
};

window.addEventListener('keydown', (e) => {
  const action = KEYMAP[e.code];
  if (action) {
    keys[action] = true;
    e.preventDefault(); // stop Space/arrows from scrolling the page
  }
});

window.addEventListener('keyup', (e) => {
  const action = KEYMAP[e.code];
  if (action) keys[action] = false;
});

// --- Touch controls ---
// Phones have no keyboard. The FLY button and the joystick both feed
// the SAME inputs the keyboard does, so the physics code never has to
// know which device you used.

// A "hold button": true while pressed, false when released. "Pointer"
// events cover mouse, finger and pen with one unified API.
function bindHoldButton(id, action) {
  const el = document.getElementById(id);
  const press = (e) => { e.preventDefault(); keys[action] = true; };
  const release = (e) => { e.preventDefault(); keys[action] = false; };
  el.addEventListener('pointerdown', press);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

bindHoldButton('btn-fly', 'thrust');

// The analog joystick. We track one finger from where it presses the
// ring, follow it as it drags (even outside the ring), and turn its
// offset from center into two -1..1 values. setPointerCapture keeps the
// drag glued to this element even when the finger slides past its edge.
function setupJoystick() {
  const base = document.getElementById('joystick');
  const knob = document.getElementById('joystick-knob');
  const MAX = 46;      // how far (pixels) the knob can travel from center
  const DEAD = 0.16;   // ignore tiny wobbles near the middle (a "dead zone")
  let pointerId = null;

  // Past the dead zone, rescale so the remaining travel still reaches a
  // full 1.0 — otherwise you could never quite hit max steering/speed.
  const withDeadzone = (v) => {
    if (Math.abs(v) < DEAD) return 0;
    return (v - Math.sign(v) * DEAD) / (1 - DEAD);
  };

  const moveTo = (e) => {
    const r = base.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    // Keep the knob inside the ring.
    const dist = Math.hypot(dx, dy);
    if (dist > MAX) { dx = (dx / dist) * MAX; dy = (dy / dist) * MAX; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    joystick.x = withDeadzone(dx / MAX);
    joystick.y = withDeadzone(-dy / MAX); // screen y grows downward; flip it
  };

  const end = (e) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    joystick.x = 0;
    joystick.y = 0;
    knob.style.transform = 'translate(0px, 0px)'; // snap knob home
  };

  base.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pointerId = e.pointerId;
    base.setPointerCapture(e.pointerId);
    moveTo(e);
  });
  base.addEventListener('pointermove', (e) => {
    if (e.pointerId === pointerId) moveTo(e);
  });
  base.addEventListener('pointerup', end);
  base.addEventListener('pointercancel', end);
}
setupJoystick();

// Only show the touch controls on devices that actually have a touch screen.
if (navigator.maxTouchPoints > 0) {
  document.body.classList.add('touch');
}

// --- Reset key ---
// Stranded in the bay? Press R to teleport back to the start.
function resetCar() {
  car.lng = START.lngLat[0];
  car.lat = START.lngLat[1];
  car.alt = 0;
  car.heading = START.heading;
  car.vx = 0;
  car.vy = 0;
  car.vAlt = 0;
  state.camHeading = START.heading;
  flashMessage('BACK TO START', 1200);
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && state.running) resetCar();
});

// If the player switches tabs mid-flight, release all keys so the car
// doesn't fly away on its own. (Without this, the browser never tells
// us about a key released while another window had focus — the car
// would drive forever on a "stuck" key.)
// Debug escape hatch: set `game.noBlurReset = true` in the DevTools
// console if you're controlling `game.keys` by hand and don't want
// focus changes to clear them.
window.addEventListener('blur', () => {
  if (window.game.noBlurReset) return;
  for (const k of Object.keys(keys)) keys[k] = false;
  joystick.x = 0;
  joystick.y = 0;
});


// ============================================================
// 4. 3D GRAPHICS — the car, beacon and shadow (three.js)
// ============================================================
// MapLibre lets us add a "custom layer": a hook where we can draw our
// own 3D objects into the map's scene, sharing its camera and depth
// information (depth = which pixel is in front of which).
//
// The tricky part is coordinates. The map works in "Mercator" units
// (tiny numbers covering the whole planet); three.js is happiest with
// meters. So we pick one fixed reference point (the start position)
// and describe everything in meters from there:
//     x = meters east, y = meters up, z = meters south.
// One matrix (originMatrix) converts that world into map space.

const three = {
  renderer: null,
  scene: null,
  camera: null,
  originMatrix: null,
  origin: null,       // Mercator coordinate of the reference point
  metersToMerc: 0,    // how many Mercator units one meter is
  carGroup: null,     // positions/rotates the whole car
  carBody: null,      // inner group for cosmetic tilt (nose up, banking)
  thrusters: [],      // glowing engine cylinders (animated)
  beaconGroup: null,
  beamMaterial: null,
  ring: null,
  shadow: null,
};

// Convert a real-world position into our meters-based scene coordinates.
function toScene(lng, lat, altMeters) {
  const mc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], altMeters);
  return new THREE.Vector3(
    (mc.x - three.origin.x) / three.metersToMerc,  // meters east
    (mc.z - three.origin.z) / three.metersToMerc,  // meters up
    (mc.y - three.origin.y) / three.metersToMerc,  // meters south
  );
}

// Build the low-poly flying car out of simple boxes and cylinders —
// same spirit as your original Three.js game.
function buildCar() {
  const carGroup = new THREE.Group();
  const carBody = new THREE.Group();
  carGroup.add(carBody);

  // Main chassis (a rounded-ish red wedge). BoxGeometry(width, height, length).
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.6, 4.2),
    new THREE.MeshLambertMaterial({ color: 0xff4757 }),
  );
  chassis.position.y = 0.5;
  carBody.add(chassis);

  // Cabin: a dark glass box on top, slightly toward the back.
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.55, 1.9),
    new THREE.MeshLambertMaterial({ color: 0x18222f }),
  );
  cabin.position.set(0, 1.05, 0.2);
  carBody.add(cabin);

  // Tail fin, because flying cars need one.
  const fin = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.6, 1.0),
    new THREE.MeshLambertMaterial({ color: 0xff4757 }),
  );
  fin.position.set(0, 1.1, 1.8);
  carBody.add(fin);

  // Four glowing thruster pods at the corners. MeshBasicMaterial ignores
  // lighting, so it always looks like it's glowing.
  const thrusterGeo = new THREE.CylinderGeometry(0.3, 0.42, 0.5, 10);
  const thrusterMat = new THREE.MeshBasicMaterial({ color: 0x7df9ff });
  for (const [x, z] of [[-0.95, -1.5], [0.95, -1.5], [-0.95, 1.5], [0.95, 1.5]]) {
    const pod = new THREE.Mesh(thrusterGeo, thrusterMat);
    pod.position.set(x, 0.25, z);
    carBody.add(pod);
    three.thrusters.push(pod);
  }

  // Headlights: two bright dots at the front (front = negative Z).
  const lightGeo = new THREE.BoxGeometry(0.3, 0.15, 0.1);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const x of [-0.6, 0.6]) {
    const headlight = new THREE.Mesh(lightGeo, lightMat);
    headlight.position.set(x, 0.55, -2.1);
    carBody.add(headlight);
  }

  carGroup.scale.setScalar(GAME.CAR_SCALE);
  return { carGroup, carBody };
}

// The delivery beacon: a tall glowing pillar of light you can see from
// across the city, with a spinning ring at its base.
function buildBeacon() {
  const beaconGroup = new THREE.Group();

  // The light pillar. "additive blending" makes overlapping glow add up
  // brighter, like real light. depthWrite:false keeps the transparent
  // beam from hiding things drawn behind it.
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd166,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(16, 16, 400, 24, 1, true),
    beamMaterial,
  );
  beam.position.y = 200; // cylinder is centered, so lift it half its height
  beaconGroup.add(beam);

  // Bright inner core so the beacon reads clearly at a distance.
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(3.5, 3.5, 400, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff1b8, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  core.position.y = 200;
  beaconGroup.add(core);

  // Spinning ring hovering just above the street.
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(22, 1.6, 10, 40),
    new THREE.MeshBasicMaterial({ color: 0xffd166 }),
  );
  ring.rotation.x = Math.PI / 2; // lay the ring flat
  ring.position.y = 3;
  beaconGroup.add(ring);

  return { beaconGroup, beamMaterial, ring };
}

// This object is MapLibre's "custom layer" — it has two jobs:
// onAdd() builds the scene once; render() draws it every frame.
const gameLayer = {
  id: 'game-objects',
  type: 'custom',
  renderingMode: '3d', // "please share your depth buffer with me"

  onAdd(mapInstance, gl) {
    // Reference point for our meters-based coordinates (see note above).
    three.origin = maplibregl.MercatorCoordinate.fromLngLat(START.lngLat, 0);
    three.metersToMerc = three.origin.meterInMercatorCoordinateUnits();

    // originMatrix converts "meters from the start point" into the
    // map's Mercator space: move to the origin, scale meters down to
    // Mercator size (flipping Y, since Mercator's Y grows southward),
    // and rotate so three.js's Y-up becomes the map's Z-up.
    three.originMatrix = new THREE.Matrix4()
      .makeTranslation(three.origin.x, three.origin.y, three.origin.z)
      .multiply(new THREE.Matrix4().makeScale(
        three.metersToMerc, -three.metersToMerc, three.metersToMerc))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

    three.camera = new THREE.Camera();
    three.scene = new THREE.Scene();

    // Simple lighting: soft overall light + one "sun" for shading.
    three.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(0.5, 1, 0.4);
    three.scene.add(sun);

    const { carGroup, carBody } = buildCar();
    three.carGroup = carGroup;
    three.carBody = carBody;
    three.scene.add(carGroup);

    const { beaconGroup, beamMaterial, ring } = buildBeacon();
    three.beaconGroup = beaconGroup;
    three.beamMaterial = beamMaterial;
    three.ring = ring;
    three.scene.add(beaconGroup);

    // Fake drop-shadow: a dark circle on the ground under the car.
    // It fades and spreads as you climb — a surprisingly important cue
    // for judging your landing.
    three.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(2.4 * GAME.CAR_SCALE, 24),
      new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false,
      }),
    );
    three.shadow.rotation.x = -Math.PI / 2; // lay it flat
    three.scene.add(three.shadow);

    // Draw into the SAME canvas/GL context as the map, so buildings and
    // car depth-test against each other. autoClear:false = don't erase
    // the map that was just drawn underneath us!
    three.renderer = new THREE.WebGLRenderer({
      canvas: mapInstance.getCanvas(),
      context: gl,
      antialias: true,
    });
    three.renderer.autoClear = false;
  },

  render(gl, matrixOrArgs) {
    // MapLibre v5 passes an object with the projection matrix inside;
    // older versions pass the matrix array directly. Support both.
    const matrixArray =
      matrixOrArgs?.defaultProjectionData?.mainMatrix ?? matrixOrArgs;

    // Map's world→screen matrix, chained with our meters→world matrix.
    three.camera.projectionMatrix = new THREE.Matrix4()
      .fromArray(matrixArray)
      .multiply(three.originMatrix);

    updateSceneObjects(performance.now() / 1000);

    three.renderer.resetState(); // undo any GL settings MapLibre changed
    three.renderer.render(three.scene, three.camera);
    map.triggerRepaint(); // ask for another frame — keeps animation going
  },
};

// Move/animate the 3D objects to match the current game state.
// Runs inside every render, so keep it cheap.
function updateSceneObjects(timeSeconds) {
  // --- Car position & heading ---
  three.carGroup.position.copy(toScene(car.lng, car.lat, car.alt));
  // Heading is clockwise-from-north; three.js rotates counterclockwise,
  // hence the minus sign.
  three.carGroup.rotation.y = -car.heading;

  // --- Cosmetic tilt (juice!) ---
  // Nose up when climbing, down when falling; bank into turns.
  const targetPitch = Math.max(-0.35, Math.min(0.35, car.vAlt * 0.02));
  const targetRoll = -input.steer * 0.3; // bank into the turn
  // Ease 15% of the way there each frame = smooth, not snappy.
  three.carBody.rotation.x += (targetPitch - three.carBody.rotation.x) * 0.15;
  three.carBody.rotation.z += (targetRoll - three.carBody.rotation.z) * 0.15;

  // Thrusters stretch while boosting.
  const podStretch = keys.thrust ? 1.9 : 1;
  for (const pod of three.thrusters) {
    pod.scale.y += (podStretch - pod.scale.y) * 0.2;
  }

  // --- Shadow: on the ground, fading with altitude ---
  three.shadow.position.copy(toScene(car.lng, car.lat, 0.3));
  three.shadow.material.opacity = Math.max(0, 0.4 - car.alt / 400);
  const spread = 1 + car.alt / 180;
  three.shadow.scale.set(spread, spread, 1);

  // --- Beacon at the current target, gently pulsing ---
  const target = BEACONS[state.targetIndex];
  three.beaconGroup.position.copy(toScene(target.lngLat[0], target.lngLat[1], 0));
  three.beamMaterial.opacity = 0.26 + 0.1 * Math.sin(timeSeconds * 3);
  three.ring.rotation.z = timeSeconds * 0.8;
}


// ============================================================
// 5. PHYSICS
// ============================================================
// Called every frame with dt = seconds since the last frame (~0.016).
// Multiplying every change by dt makes the game run at the same speed
// on fast and slow computers — a core game-programming idea.

function updatePhysics(dt) {
  // Remember last frame's position for the collision system.
  prev.lng = car.lng;
  prev.lat = car.lat;
  prev.alt = car.alt;

  // --- Combine the two input sources into one -1..1 value per axis ---
  // Keyboard keys give a full -1 or +1; the joystick adds its analog
  // amount. clamp() keeps the total within -1..1 if you use both at once.
  const clamp1 = (v) => Math.max(-1, Math.min(1, v));
  input.steer = clamp1((keys.right ? 1 : 0) - (keys.left ? 1 : 0) + joystick.x);
  input.throttle = clamp1((keys.forward ? 1 : 0) - (keys.back ? 1 : 0) + joystick.y);

  // --- Steering ---
  const horizSpeed = Math.hypot(car.vx, car.vy);
  // A real car barely turns when crawling; scale turning with speed
  // (but keep some, so you can rotate while hovering).
  const turnFactor = 0.35 + 0.65 * Math.min(1, horizSpeed / 15);
  car.heading += input.steer * PHYSICS.TURN_RATE * turnFactor * dt;

  // --- Thrust forward/backward along our heading ---
  // sin/cos convert "compass angle" into an east/north direction vector.
  const fwdE = Math.sin(car.heading); // east component of "forward"
  const fwdN = Math.cos(car.heading); // north component of "forward"
  // One line handles both: a positive throttle accelerates, a negative
  // one (joystick pulled back, or S held) brakes/reverses.
  if (input.throttle !== 0) {
    const power = input.throttle > 0 ? PHYSICS.ACCEL : PHYSICS.BRAKE;
    car.vx += fwdE * power * input.throttle * dt;
    car.vy += fwdN * power * input.throttle * dt;
  }

  // --- Drag & grip ---
  // Split velocity into "forward" and "sideways" parts. Forward speed
  // gets gentle air drag; sideways speed gets strong "tire grip" so the
  // car goes where it points instead of sliding like a hockey puck.
  let fwdSpeed = car.vx * fwdE + car.vy * fwdN;
  const sideE = fwdN, sideN = -fwdE; // 90° right of forward
  let sideSpeed = car.vx * sideE + car.vy * sideN;

  // exp(-k·dt) is the frame-rate-independent way to say
  // "lose k-ish fraction of this speed per second".
  fwdSpeed *= Math.exp(-PHYSICS.DRAG * dt);
  const grip = car.alt < 1 ? PHYSICS.GRIP_GROUND : PHYSICS.GRIP_AIR;
  sideSpeed *= Math.exp(-grip * dt);

  fwdSpeed = Math.max(-PHYSICS.MAX_REVERSE, Math.min(PHYSICS.MAX_SPEED, fwdSpeed));

  // Recombine the two parts back into east/north velocity.
  car.vx = fwdE * fwdSpeed + sideE * sideSpeed;
  car.vy = fwdN * fwdSpeed + sideN * sideSpeed;

  // --- Vertical: thrust vs gravity vs drag ---
  if (keys.thrust) car.vAlt += PHYSICS.THRUST * dt;
  car.vAlt -= PHYSICS.GRAVITY * dt;
  car.vAlt *= Math.exp(-PHYSICS.VERTICAL_DRAG * dt);
  car.alt += car.vAlt * dt;

  // The ground is solid.
  if (car.alt <= 0) {
    car.alt = 0;
    car.vAlt = Math.max(0, car.vAlt);
  }

  // --- Finally, move! Convert meters/second into degrees/second. ---
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos(car.lat * DEG);
  car.lng += (car.vx * dt) / metersPerDegLng;
  car.lat += (car.vy * dt) / METERS_PER_DEG_LAT;
}

// Expose the physics step for console debugging (see note near game.input).
window.game.step = updatePhysics;


// ============================================================
// 6. COLLISIONS
// ============================================================
// The question we need answered 60× a second: "is there a building at
// the car's lng/lat, and how tall is it?"
//
// We ask MapLibre for the raw building FOOTPRINTS (the real polygon
// outlines from OpenStreetMap) around the current view, cache them for
// a second, and test "is this point inside this polygon?" ourselves.
// (Asking "which building is drawn at this screen pixel?" sounds
// easier, but in a tilted view a tall tower far ahead can cover the
// car's pixel — we learned that the hard way.)

let buildingSourceId = null;
const buildingCache = { list: [], lastRefresh: -Infinity };

function refreshBuildingCache(nowMs) {
  if (nowMs - buildingCache.lastRefresh < 1000) return; // once a second
  if (!buildingSourceId) return;
  buildingCache.lastRefresh = nowMs;

  // All building shapes in the map tiles currently loaded around us.
  const feats = map.querySourceFeatures(buildingSourceId, {
    sourceLayer: 'building',
  });

  buildingCache.list = [];
  for (const f of feats) {
    const height = f.properties.render_height ?? 5;
    // A Polygon is a list of rings (outline + holes); a MultiPolygon is
    // a list of polygons. Flatten both cases into "list of ring-lists".
    const polygons =
      f.geometry.type === 'Polygon' ? [f.geometry.coordinates]
      : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates
      : [];

    for (const rings of polygons) {
      // Precompute a bounding box — a cheap "definitely not inside"
      // test that lets us skip detailed math for 99% of buildings.
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      for (const [lng, lat] of rings[0]) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
      buildingCache.list.push({ rings, height, minLng, minLat, maxLng, maxLat });
    }
  }
}

// The classic "ray casting" point-in-polygon test: shoot an imaginary
// ray from the point off to the east and count how many polygon edges
// it crosses. Odd number of crossings = we're inside. Running it over
// every ring also handles courtyard "holes" correctly.
function pointInRings(lng, lat, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      const crossesRay =
        (yi > lat) !== (yj > lat) &&
        lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (crossesRay) inside = !inside;
    }
  }
  return inside;
}

// Height of the tallest building whose footprint contains this point
// (0 if the point is on open ground).
function buildingHeightAt(lng, lat) {
  let roof = 0;
  for (const b of buildingCache.list) {
    if (b.height <= roof) continue;               // can't beat current max
    if (lng < b.minLng || lng > b.maxLng) continue; // bounding-box reject
    if (lat < b.minLat || lat > b.maxLat) continue;
    if (pointInRings(lng, lat, b.rings)) roof = b.height;
  }
  return roof;
}

function checkCollisions(nowMs) {
  refreshBuildingCache(nowMs);

  const roof = buildingHeightAt(car.lng, car.lat);
  if (roof === 0 || car.alt >= roof) return; // open ground or above it

  if (prev.alt >= roof) {
    // We came from above → touch down on the roof. Rooftop landings
    // are a feature, not a bug!
    car.alt = roof;
    car.vAlt = Math.max(0, car.vAlt);
  } else {
    // We drove into the side → undo the move and bounce off.
    car.lng = prev.lng;
    car.lat = prev.lat;
    car.vx *= -0.3;
    car.vy *= -0.3;
    flashMessage('BONK!', 700);
  }
}


// ============================================================
// 7. DELIVERIES & SCORE
// ============================================================

// Straight-line distance in meters between two lng/lat points.
// (An approximation that's plenty accurate at city scale.)
function metersBetween(lng1, lat1, lng2, lat2) {
  const dx = (lng2 - lng1) * METERS_PER_DEG_LAT * Math.cos(lat1 * DEG);
  const dy = (lat2 - lat1) * METERS_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

function checkDelivery() {
  const target = BEACONS[state.targetIndex];
  const dist = metersBetween(car.lng, car.lat, target.lngLat[0], target.lngLat[1]);

  if (dist < GAME.DELIVERY_RADIUS && car.alt < 300) {
    state.score += GAME.POINTS;
    state.deliveries += 1;
    flashMessage(`DELIVERED! +${GAME.POINTS}`, 1800);
    // "% BEACONS.length" wraps back to 0 after the last one — the
    // delivery route loops forever.
    state.targetIndex = (state.targetIndex + 1) % BEACONS.length;
  }
}


// ============================================================
// 8. CHASE CAMERA
// ============================================================
// We tell MapLibre: "aim at the car (at its real altitude), from this
// compass direction, tilted this much, this close" — and it works out
// where to put the camera. The result: a camera hanging behind and
// above the car, i.e. a classic chase cam.

function updateChaseCamera(dt) {
  // The camera's heading chases the car's heading smoothly instead of
  // copying it instantly — that little lag is what makes turns feel good.
  let diff = car.heading - state.camHeading;
  // Keep the difference in the range -180°..180° so the camera turns
  // the short way around, never a wild 350° spin.
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  state.camHeading += diff * (1 - Math.exp(-CAMERA.SMOOTH * dt));

  map.jumpTo({
    center: [car.lng, car.lat],
    elevation: car.alt,               // aim at the car's altitude, not the ground
    bearing: state.camHeading / DEG,  // radians → degrees
    pitch: CAMERA.PITCH,
    zoom: CAMERA.ZOOM,
    // Reserving screen space at the top nudges the car toward the
    // bottom third of the screen, so you see the road AHEAD of you.
    padding: { top: Math.round(window.innerHeight * 0.45) },
  });
}


// ============================================================
// 9. HUD
// ============================================================

// Grab the HTML elements once — searching the page every frame is slow.
const hud = {
  score: document.getElementById('score'),
  packages: document.getElementById('packages'),
  target: document.getElementById('target'),
  arrow: document.getElementById('compass-arrow'),
  distance: document.getElementById('distance'),
  speed: document.getElementById('speed'),
  altitude: document.getElementById('altitude'),
  message: document.getElementById('message'),
};

let messageTimer = null;
function flashMessage(text, ms) {
  hud.message.textContent = text;
  hud.message.classList.add('show');
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => hud.message.classList.remove('show'), ms);
}

function updateHUD() {
  const target = BEACONS[state.targetIndex];

  hud.score.textContent = state.score;
  hud.packages.textContent = `\u{1F4E6} ${state.deliveries}`;
  hud.target.textContent = target.name;

  // Compass arrow: angle to the target, relative to where the camera
  // is facing (so "up" on screen means "straight ahead").
  const dx = (target.lngLat[0] - car.lng) * Math.cos(car.lat * DEG);
  const dy = target.lngLat[1] - car.lat;
  const bearingToTarget = Math.atan2(dx, dy); // radians, clockwise from north
  const arrowAngle = (bearingToTarget - state.camHeading) / DEG;
  hud.arrow.style.transform = `rotate(${arrowAngle}deg)`;

  const dist = metersBetween(car.lng, car.lat, target.lngLat[0], target.lngLat[1]);
  hud.distance.textContent =
    dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`;

  // Convert metric units to mph/feet for that American-dashboard feel.
  const mph = Math.hypot(car.vx, car.vy) * 2.23694;
  hud.speed.textContent = `${Math.round(mph)} mph`;
  hud.altitude.textContent = `${Math.round(car.alt * 3.28084)} ft`;
}


// ============================================================
// 10. GAME LOOP
// ============================================================
// requestAnimationFrame asks the browser: "call this function right
// before you paint the next frame" — usually 60 times per second.
// Each tick: physics → collisions → deliveries → camera → HUD.

let lastTime = null;

function tick(now) {
  requestAnimationFrame(tick); // always book the next frame first

  if (!state.running) { lastTime = now; return; }

  // dt = seconds since last frame, capped so a laggy frame (or waking
  // from a background tab) can't teleport the car through a building.
  const dt = Math.min((now - lastTime) / 1000 || 0, 0.05);
  lastTime = now;

  updatePhysics(dt);
  checkCollisions(now);
  checkDelivery();
  updateChaseCamera(dt);
  updateHUD();
}

requestAnimationFrame(tick);

// --- Start screen wiring ---
const overlay = document.getElementById('start-overlay');

function startGame() {
  if (state.running) return;
  state.running = true;
  overlay.classList.add('hidden');
  flashMessage(`Deliver to: ${BEACONS[state.targetIndex].name}`, 2500);
}

document.getElementById('start-button').addEventListener('click', startGame);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter') startGame();
});
