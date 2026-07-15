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
// GLTFLoader reads .glb 3D-model files. It's a three.js "addon" (not in the
// core), so we import it straight from the CDN; it resolves `three` via the
// import map in index.html.
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

// Load config with the SAME cache-busting version this file was loaded
// with (e.g. "?v=10" from index.html). That way bumping the number in
// ONE place — index.html — forces the browser to fetch fresh copies of
// BOTH main.js and config.js, so an update can never leave you running a
// stale half of the game. (Browsers cache each file separately, which is
// what makes "the new button does nothing" bugs happen.)
const V = new URL(import.meta.url).search;
const { START, BEACONS, PHYSICS, CAMERA, GAME, BRIDGES, TREE_SPOTS, TERRAIN, VEHICLES,
        SATELLITE, BUILDING_COLORS, BUSH_MULT, TRAFFIC, GRAPHICS, OSM_HIDE_IDS, LOOK } =
  await import('./config.js' + V);

// MapLibre was loaded with a plain <script> tag, so it lives on `window`.
const maplibregl = window.maplibregl;

// --- Shot mode (?shot=1) -------------------------------------------------
// A deterministic-screenshot harness for tools/capture.js: same car spot,
// same camera, frozen water/beacon animation, no traffic, no HUD. It ONLY
// activates when the URL contains ?shot — normal play is untouched.
const SHOT = new URLSearchParams(window.location.search).has('shot');

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

// --- Ocean-flattening filter for elevation tiles ---
// The free elevation data includes the sea FLOOR (bathymetry) — the bay
// would render as a 100 m-deep pit and the Golden Gate's towers would
// sink into it. So we register our own "flatdem://" tile protocol: it
// downloads each tile, and any pixel encoding a below-sea-level height
// gets rewritten to exactly sea level before the map ever sees it.
// (Terrarium encoding: height = R*256 + G + B/256 - 32768, so any pixel
// with R < 128 is below sea level, and (128, 0, 0) is exactly 0.)
maplibregl.addProtocol('flatdem', async (params) => {
  const url = params.url.replace('flatdem://', 'https://');
  // When we're KEEPING the sea floor, hand the tile back untouched so
  // the real underwater depth survives.
  if (!TERRAIN.FLATTEN_OCEAN) {
    const buf = await (await fetch(url)).arrayBuffer();
    return { data: buf };
  }
  const blob = await (await fetch(url)).blob();
  const bitmap = await createImageBitmap(blob, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data; // [R,G,B,A, R,G,B,A, ...]
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] < 128) { px[i] = 128; px[i + 1] = 0; px[i + 2] = 0; }
  }
  ctx.putImageData(image, 0, 0);
  const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return { data: await out.arrayBuffer() };
});

// Rotate a hex color's hue by `deg` degrees — used to make several
// tinted variants of the building palette so neighbours differ.
function rotateHue(hex, deg) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h, s, l = (mx + mn) / 2;
  if (mx === mn) { h = s = 0; }
  else {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  h = (h + deg / 360 + 1) % 1;
  const k = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p; };
  let R, G, B;
  if (s === 0) { R = G = B = l; }
  else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    R = k(p, q, h + 1/3); G = k(p, q, h); B = k(p, q, h - 1/3); }
  const to = (x) => ('0' + Math.round(x * 255).toString(16)).slice(-2);
  return '#' + to(R) + to(G) + to(B);
}

// Build the MapLibre color expression for buildings. Each building is
// sorted into one of 4 "buckets" (from its id + height), and each bucket
// uses a hue-shifted copy of the BUILDING_COLORS ramp — so the city is
// colored by height AND neighbouring buildings pick different tints.
function buildingColorExpression() {
  const heightInput = ['coalesce', ['get', 'render_height'], 0];
  const ramp = (pal) => ['interpolate', ['linear'], heightInput, ...pal.flat()];
  const shift = (deg) => BUILDING_COLORS.map(([h, hex]) => [h, rotateHue(hex, deg)]);
  const bucket = ['%', ['+', ['to-number', ['coalesce', ['id'], 0]], ['round', heightInput]], 4];
  return ['match', bucket,
    0, ramp(BUILDING_COLORS),
    1, ramp(shift(12)),
    2, ramp(shift(-12)),
    ramp(shift(26))];
}

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

// Missing sprite icons (office, atm, …) otherwise leave MapLibre's image
// manager "not loaded", which can stop the whole map from ever finishing
// loading. Hand back a blank pixel for any it asks for.
map.on('styleimagemissing', (e) => {
  if (!map.hasImage(e.id)) {
    map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
  }
});

// Set up our layers as soon as the STYLE SPEC is ready — not when every
// tile has downloaded. Gating on the full 'load' event meant one slow
// tile server (it happens) could leave the game blank forever. We run
// once, guarded by a flag, triggered by whichever event fires first.
let didInitGame = false;
function initGame() {
  if (didInitGame || !map.style || !map.style._loaded) return;
  didInitGame = true;
  const style = map.getStyle();

  // The style may already include a 3D-buildings layer. We remove any
  // and add our own so we control its ID (we query it for collisions).
  for (const layer of style.layers.filter((l) => l.type === 'fill-extrusion')) {
    map.removeLayer(layer.id);
  }

  // Declutter: hide shop/restaurant icons and house numbers — great on
  // a map you're reading, distracting in a game you're flying through.
  for (const layer of style.layers) {
    // Also drop the flat "bridge" road lines: the map draped them on the
    // terrain at sea level, so they floated on the water beneath our real
    // 3D bridge decks. Our decks replace them.
    // Also drop road route shields (the little "80" markers) — they were
    // floating on the water and are clutter in a flying game.
    if (layer.id.startsWith('poi') || layer.id.includes('housenumber')
        || layer.id.includes('bridge') || layer.id.includes('shield')) {
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
        // Color by height AND give neighbours variety (see below).
        'fill-extrusion-color': buildingColorExpression(),
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 5],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 1,
      },
    },
    firstSymbolId,
  );

  // Hide the tall gray boxes OSM extrudes for the Bay Bridge towers: we
  // draw nicer towers ourselves, and removing the blocks lets the roadway
  // run clear between/around them. We match by stable OSM feature id
  // because a location-based `within` filter proved unreliable here.
  // ['id'] is each feature's id; hide any whose id is in our list.
  if (OSM_HIDE_IDS && OSM_HIDE_IDS.length) {
    map.setFilter('3d-buildings', ['!', ['in', ['id'], ['literal', OSM_HIDE_IDS]]]);
  }

  // Our three.js layer (car, beacon) is added last so it draws with
  // full knowledge of the buildings' depth — that's what lets a
  // building correctly hide the car when it drives behind one.
  map.addLayer(gameLayer);

  // --- 3D terrain: hills and mountains ---
  if (TERRAIN.ENABLED) {
    map.addSource('terrain-dem', {
      type: 'raster-dem',
      tiles: [TERRAIN.TILES],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 13,
      attribution: 'Terrain: Mapzen/AWS Open Data',
    });
    map.setTerrain({ source: 'terrain-dem', exaggeration: TERRAIN.EXAGGERATION });
  }

  // --- Satellite imagery base ---
  // Add the aerial photo as a raster layer near the BOTTOM of the stack
  // (just above the plain background), so roads, labels and buildings
  // still draw on top of it. It starts hidden; setBasemap() reveals it.
  map.addSource('satellite', {
    type: 'raster',
    tiles: [SATELLITE.TILES],
    tileSize: 256,
    maxzoom: 19,
    attribution: SATELLITE.ATTRIBUTION,
  });
  const firstAboveBackground = map.getStyle().layers.find((l) => l.type !== 'background')?.id;
  map.addLayer(
    { id: 'satellite', type: 'raster', source: 'satellite',
      layout: { visibility: 'none' }, paint: { 'raster-opacity': 1 } },
    firstAboveBackground,
  );

  setBasemap(SATELLITE.ON_AT_START);
  applyGraphics(); // golden-hour light + sky for the whole city
}

// 'styledata' fires when the style JSON is parsed (before tiles finish);
// 'load' is the belt-and-suspenders fallback. Either one runs initGame.
map.on('styledata', initGame);
map.on('load', initGame);

// Switch between the drawn vector map and the satellite photo. In
// satellite mode we hide the flat colored fills (land, water, parks) so
// the photo shows through — but keep roads (lines), labels (symbols) and
// our 3D buildings. Flipping back just makes those fills visible again.
let hiddenForSatellite = [];
function setBasemap(satelliteOn) {
  if (!map.getLayer('satellite')) return;
  state.satellite = satelliteOn;

  if (satelliteOn) {
    map.setLayoutProperty('satellite', 'visibility', 'visible');
    hiddenForSatellite = [];
    for (const layer of map.getStyle().layers) {
      if (layer.id === 'satellite' || layer.id === '3d-buildings') continue;
      if (layer.type === 'background' || layer.type === 'fill') {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
        hiddenForSatellite.push(layer.id);
      }
    }
  } else {
    map.setLayoutProperty('satellite', 'visibility', 'none');
    for (const id of hiddenForSatellite) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
    }
    hiddenForSatellite = [];
  }
}

// Apply the current graphics-quality preset. Cheap, live-toggleable bits
// (light and sky) update immediately via applyLook(); scenery density is
// baked at load, so it uses the quality that was active then.
function applyGraphics() {
  applyLook();
  const chip = document.getElementById('gfx');
  if (chip) chip.textContent = `GFX ${state.quality.toUpperCase()}`;
}

// ============================================================
// THE LOOK — apply every LOOK knob (config.js) to the live scene.
// ============================================================
// Called at init, on quality change, and by every P-panel slider move.
// Each block is guarded so it works no matter how much of the scene has
// been built yet.
function applyLook() {
  // MapLibre sun: shades the extruded building faces.
  try {
    map.setLight({
      anchor: 'map',
      color: LOOK.sunColor,
      intensity: LOOK.sunIntensity,
      position: [1.5, LOOK.sunAzimuth, LOOK.sunPolar],
    });
  } catch (e) { /* style not ready yet */ }

  // MapLibre sky: background gradient + the distance-haze band.
  // Low quality skips the pricey haze keys (same colors, plain sky).
  try {
    const sky = gfx().atmosphere
      ? {
          'sky-color': LOOK.skyColor, 'sky-horizon-blend': LOOK.horizonBlend,
          'horizon-color': LOOK.horizonColor, 'horizon-fog-blend': 0.4,
          'fog-color': LOOK.fogColor, 'fog-ground-blend': LOOK.fogGroundBlend,
          'atmosphere-blend': LOOK.atmosphereBlend,
        }
      : {
          'sky-color': LOOK.skyColor, 'sky-horizon-blend': LOOK.horizonBlend,
          'horizon-color': LOOK.horizonColor,
        };
    map.setSky(sky);
  } catch (e) {}

  // three.js lights (car, bridges, trees, traffic) — match the map sun.
  if (three.sun) {
    three.sun.color.set(LOOK.threeSunColor);
    three.sun.intensity = LOOK.threeSunIntensity;
    three.sun.position.set(LOOK.threeSunDirX, LOOK.threeSunDirY, LOOK.threeSunDirZ);
  }
  if (three.ambient) {
    three.ambient.color.set(LOOK.threeAmbientColor);
    three.ambient.intensity = LOOK.threeAmbientIntensity;
  }

  // Water shader colors (medium/high quality; low's flat plane is set at build).
  if (three.waterMaterial) {
    const u = three.waterMaterial.uniforms;
    u.uDeep.value.set(LOOK.waterDeep);
    u.uShallow.value.set(LOOK.waterShallow);
    u.uSun.value.set(LOOK.waterSun);
    u.uOpacity.value = LOOK.waterOpacity;
    u.uGlint.value = LOOK.waterGlint;
  }

  // Global grade: one CSS filter on the render canvas. The compositor
  // does this for free, and it hits EVERYTHING drawn in the frame —
  // map, buildings, water, our 3D objects, labels.
  const canvas = map.getCanvas && map.getCanvas();
  if (canvas) {
    canvas.style.filter =
      `saturate(${LOOK.gradeSaturate}) contrast(${LOOK.gradeContrast})` +
      ` brightness(${LOOK.gradeBrightness})`;
  }
}

// --- The P-panel: sliders for every LOOK knob, applied live -------------
// Schema drives the UI: [key, label, min, max, step] for numbers, or
// [key, label, 'color'] for color pickers. Extend it as LOOK grows.
const LOOK_PANEL = [
  ['sunAzimuth', 'Sun azimuth °', 0, 360, 1],
  ['sunPolar', 'Sun height ° (90=horizon)', 5, 90, 1],
  ['sunColor', 'Sun color', 'color'],
  ['sunIntensity', 'Sun shading', 0, 1, 0.01],
  ['skyColor', 'Sky color', 'color'],
  ['horizonColor', 'Horizon color', 'color'],
  ['fogColor', 'Haze color', 'color'],
  ['horizonBlend', 'Horizon blend', 0, 1, 0.01],
  ['fogGroundBlend', 'Haze ground blend', 0, 1, 0.01],
  ['atmosphereBlend', 'Haze strength', 0, 1, 0.01],
  ['threeSunColor', '3D sun color', 'color'],
  ['threeSunIntensity', '3D sun strength', 0, 3, 0.05],
  ['threeAmbientColor', '3D fill color', 'color'],
  ['threeAmbientIntensity', '3D fill strength', 0, 2, 0.05],
  ['gradeSaturate', 'Grade: saturation', 0, 2, 0.01],
  ['gradeContrast', 'Grade: contrast', 0.5, 1.5, 0.01],
  ['gradeBrightness', 'Grade: brightness', 0.5, 1.5, 0.01],
  ['waterDeep', 'Water deep', 'color'],
  ['waterShallow', 'Water shallow', 'color'],
  ['waterSun', 'Water glint color', 'color'],
  ['waterOpacity', 'Water opacity', 0, 1, 0.01],
  ['waterGlint', 'Water glint strength', 0, 1, 0.01],
];

let lookPanelEl = null;
function toggleLookPanel() {
  if (lookPanelEl) {
    lookPanelEl.remove();
    lookPanelEl = null;
    return;
  }
  const el = document.createElement('div');
  el.id = 'look-panel';
  el.style.cssText =
    'position:fixed;top:10px;left:10px;z-index:50;background:rgba(10,14,20,.88);' +
    'color:#dde;padding:10px 12px;border-radius:10px;font:12px/1.6 monospace;' +
    'max-height:85vh;overflow-y:auto;width:270px';
  el.innerHTML = '<b>THE LOOK</b> <small>(P to close — values in config.js LOOK)</small><br>';
  for (const row of LOOK_PANEL) {
    const [key, label] = row;
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display:block;margin-top:4px';
    const isColor = row[2] === 'color';
    const val = document.createElement('span');
    val.textContent = ' ' + LOOK[key];
    const input = document.createElement('input');
    if (isColor) {
      input.type = 'color';
      input.value = LOOK[key];
    } else {
      input.type = 'range';
      input.min = row[2]; input.max = row[3]; input.step = row[4];
      input.value = LOOK[key];
      input.style.width = '130px';
    }
    input.style.verticalAlign = 'middle';
    input.addEventListener('input', () => {
      LOOK[key] = isColor ? input.value : parseFloat(input.value);
      val.textContent = ' ' + LOOK[key];
      applyLook();
    });
    wrap.append(label + ' ', input, val);
    el.appendChild(wrap);
  }
  document.body.appendChild(el);
  lookPanelEl = el;
}

function cycleQuality() {
  const order = ['low', 'medium', 'high'];
  state.quality = order[(order.indexOf(state.quality) + 1) % order.length];
  localStorage.setItem('gfxQuality', state.quality); // remember for next visit
  applyGraphics();
  // Scenery density is baked at load, so hint that a reload applies fully.
  flashMessage(`GRAPHICS: ${state.quality.toUpperCase()}`, 1300);
}

// Ground elevation (meters above sea level) at a point. Returns the
// fallback when terrain is off or that area's elevation tiles haven't
// downloaded yet (e.g. right after spawning, or far from the camera).
function groundAt(lng, lat, fallback = 0) {
  if (!TERRAIN.ENABLED || !map.queryTerrainElevation) return fallback;
  const elevation = map.queryTerrainElevation([lng, lat]);
  if (elevation === null || elevation === undefined || Number.isNaN(elevation)) {
    return fallback;
  }
  // Real elevation — NEGATIVE over water now that we keep the sea floor.
  // Callers decide whether they can go below sea level (see updatePhysics).
  return elevation;
}


// ============================================================
// 2. GAME STATE
// ============================================================
// Everything about "right now" lives in these small objects.
// The physics step updates them; the graphics and HUD read them.

const car = {
  lng: START.lngLat[0],
  lat: START.lngLat[1],
  alt: 0,               // altitude in meters above SEA LEVEL
  ground: 0,            // terrain height under the car right now
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
  flightMode: 'hover',  // 'hover' (thrust vs gravity) or 'glide' (wings!)
  cameraMode: 0,        // which CAMERA.MODES preset is active
  camZoom: CAMERA.MODES[0].zoom,   // current zoom/pitch — these chase the
  camPitch: CAMERA.MODES[0].pitch, // preset's values smoothly, no hard cuts
  zoomNudge: 0,         // extra zoom from the mouse wheel, -1..1
  vehicle: 0,           // which VEHICLES entry we're driving
  satellite: SATELLITE.ON_AT_START, // aerial photo base vs drawn map
  health: GAME.MAX_HEALTH, // hearts left
  invulnUntil: 0,       // timestamp (ms) until which crashes don't hurt
  gameOver: false,
  // Graphics quality — remembered across visits (localStorage). First
  // time: phones start on medium, desktops on high.
  quality: (() => {
    const saved = localStorage.getItem('gfxQuality');
    if (saved === 'low' || saved === 'medium' || saved === 'high') return saved;
    return (navigator.maxTouchPoints > 0 || window.innerWidth < 900) ? 'medium' : 'high';
  })(),
};

// Shorthand for the current quality preset's settings.
function gfx() { return GRAPHICS.PRESETS[state.quality]; }

// The ACTIVE physics numbers: the defaults, with the current vehicle's
// overrides spread on top. Rebuilt every time you switch vehicles.
let phys = { ...PHYSICS, ...VEHICLES[0].physics };

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

// --- Flight mode toggle ---
// HOVER: gravity always pulls; feather FLY/SPACE to hold altitude.
// GLIDE: forward speed generates lift — sail across the city, and slow
// down (or switch back to hover) to descend. G key or the MODE button.
function toggleFlightMode() {
  state.flightMode = state.flightMode === 'hover' ? 'glide' : 'hover';
  flashMessage(state.flightMode === 'glide' ? 'GLIDE MODE' : 'HOVER MODE', 1200);
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyG' && state.running) toggleFlightMode();
});

document.getElementById('btn-mode').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (state.running) toggleFlightMode();
});

// --- Camera angle ---
// C key (or the CAM button) cycles through the presets in config.js;
// the mouse wheel nudges the zoom within any preset.
function cycleCamera() {
  state.cameraMode = (state.cameraMode + 1) % CAMERA.MODES.length;
  flashMessage(`CAMERA: ${CAMERA.MODES[state.cameraMode].name}`, 1200);
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyC' && state.running) cycleCamera();
});

document.getElementById('btn-cam').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (state.running) cycleCamera();
});

window.addEventListener('wheel', (e) => {
  // deltaY is positive when scrolling down/away → zoom out.
  state.zoomNudge = Math.max(-1, Math.min(1, state.zoomNudge - e.deltaY * 0.001));
}, { passive: true });

// --- Drag / swipe to look around ---
// Dragging on empty screen (not a button or the steering joystick)
// orbits the camera: horizontal = look left/right, vertical = tilt.
// The listeners live on the map layer, which sits UNDER the HUD; touches
// on controls are caught by those controls (pointer-events: auto) and
// never reach here, so this only fires on open space — and a separate
// finger can look while your left thumb keeps steering.
const look = {
  active: false, id: null, lastX: 0, lastY: 0,
  yaw: 0,    // extra bearing (degrees) added to the chase view
  pitch: 0,  // extra tilt (degrees) added to the chase view
};
window.game.look = look;

function setupLookDrag() {
  const el = document.getElementById('map');

  el.addEventListener('pointerdown', (e) => {
    look.active = true;
    look.id = e.pointerId;
    look.lastX = e.clientX;
    look.lastY = e.clientY;
    el.setPointerCapture(e.pointerId); // keep tracking if the finger
  });                                  // slides over a button mid-drag

  el.addEventListener('pointermove', (e) => {
    if (!look.active || e.pointerId !== look.id) return;
    const dx = e.clientX - look.lastX;
    const dy = e.clientY - look.lastY;
    look.lastX = e.clientX;
    look.lastY = e.clientY;
    // Drag right → look right; drag down → look down at the ground.
    // (Flip either sign here if it feels backwards to you.)
    look.yaw = Math.max(-180, Math.min(180, look.yaw + dx * 0.4));
    look.pitch = Math.max(-45, Math.min(45, look.pitch - dy * 0.3));
  });

  const end = (e) => {
    if (e.pointerId === look.id) { look.active = false; look.id = null; }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}
setupLookDrag();

// --- Vehicle switching ---
// V key (or the VEH button) cycles the garage. Switching swaps both the
// 3D model and the physics numbers (see VEHICLES in config.js).
function applyVehicleVisibility() {
  const modelName = VEHICLES[state.vehicle].model;
  if (three.carModel) three.carModel.visible = modelName === 'car';
  if (three.ufoModel) three.ufoModel.visible = modelName === 'ufo';
  if (three.scooterModel) three.scooterModel.visible = modelName === 'scooter';
}

function switchVehicle() {
  state.vehicle = (state.vehicle + 1) % VEHICLES.length;
  phys = { ...PHYSICS, ...VEHICLES[state.vehicle].physics };
  applyVehicleVisibility();
  flashMessage(`VEHICLE: ${VEHICLES[state.vehicle].name}`, 1400);
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyV' && state.running) switchVehicle();
});

document.getElementById('btn-veh').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (state.running) switchVehicle();
});

// --- Basemap toggle (satellite photo <-> drawn map) ---
function toggleBasemap() {
  setBasemap(!state.satellite);
  flashMessage(state.satellite ? 'SATELLITE' : 'MAP VIEW', 1200);
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyB' && state.running) toggleBasemap();
});

document.getElementById('btn-map').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (state.running) toggleBasemap();
});

// --- Graphics quality toggle (Q key, or tap the GFX chip) ---
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyQ') cycleQuality();
  if (e.code === 'KeyP') toggleLookPanel(); // live sliders for the LOOK config
});
document.getElementById('gfx').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  cycleQuality();
});

// --- Reset key ---
// Stranded in the bay? Press R to teleport back to the start.
function resetCar() {
  car.lng = START.lngLat[0];
  car.lat = START.lngLat[1];
  car.alt = groundAt(car.lng, car.lat, 0);
  car.heading = START.heading;
  car.vx = 0;
  car.vy = 0;
  car.vAlt = 0;
  state.camHeading = START.heading;
  flashMessage('BACK TO START', 1200);
}

window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyR') return;
  if (state.gameOver) restartGame();     // R also revives you after a crash
  else if (state.running) resetCar();
});

document.getElementById('restart-button').addEventListener('click', restartGame);

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
window.game.three = three; // peek at the 3D scene from the console

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

  // The car's meshes live in their own sub-group so the whole model can
  // be hidden when you switch to another vehicle (carBody keeps doing
  // the cosmetic tilting for whichever model is visible).
  const carModel = new THREE.Group();
  carBody.add(carModel);

  // Main chassis (a rounded-ish red wedge). BoxGeometry(width, height, length).
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.6, 4.2),
    new THREE.MeshLambertMaterial({ color: 0xff4757 }),
  );
  chassis.position.y = 0.5;
  carModel.add(chassis);

  // Cabin: a dark glass box on top, slightly toward the back.
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.55, 1.9),
    new THREE.MeshLambertMaterial({ color: 0x18222f }),
  );
  cabin.position.set(0, 1.05, 0.2);
  carModel.add(cabin);

  // Tail fin, because flying cars need one.
  const fin = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.6, 1.0),
    new THREE.MeshLambertMaterial({ color: 0xff4757 }),
  );
  fin.position.set(0, 1.1, 1.8);
  carModel.add(fin);

  // Four glowing thruster pods at the corners. MeshBasicMaterial ignores
  // lighting, so it always looks like it's glowing.
  const thrusterGeo = new THREE.CylinderGeometry(0.3, 0.42, 0.5, 10);
  const thrusterMat = new THREE.MeshBasicMaterial({ color: 0x7df9ff });
  for (const [x, z] of [[-0.95, -1.5], [0.95, -1.5], [-0.95, 1.5], [0.95, 1.5]]) {
    const pod = new THREE.Mesh(thrusterGeo, thrusterMat);
    pod.position.set(x, 0.25, z);
    carModel.add(pod);
    three.thrusters.push(pod);
  }

  // Headlights: two bright dots at the front (front = negative Z).
  const lightGeo = new THREE.BoxGeometry(0.3, 0.15, 0.1);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const x of [-0.6, 0.6]) {
    const headlight = new THREE.Mesh(lightGeo, lightMat);
    headlight.position.set(x, 0.55, -2.1);
    carModel.add(headlight);
  }

  carGroup.scale.setScalar(GAME.CAR_SCALE);
  return { carGroup, carBody, carModel };
}

// The UFO — a garage-built flying saucer in the spirit of a certain
// mad scientist's: squashed metal hull, glass dome, spinning rim
// lights, and a glow that flares when you thrust.
function buildUfoModel() {
  const ufo = new THREE.Group();

  // Hull: a sphere squashed flat into a saucer.
  const hull = new THREE.Mesh(
    new THREE.SphereGeometry(2.8, 24, 12),
    new THREE.MeshLambertMaterial({ color: 0xb9c2cc }),
  );
  hull.scale.y = 0.32;
  hull.position.y = 0.9;
  ufo.add(hull);

  // Glass dome: the top half of a sphere, see-through.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1.35, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0xa8e6ff, transparent: true, opacity: 0.45 }),
  );
  dome.position.y = 1.5;
  ufo.add(dome);

  // Ten rim lights in a circle — the group spins for the classic look.
  const rim = new THREE.Group();
  const bulbGeo = new THREE.SphereGeometry(0.22, 8, 8);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0x7dff9a });
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(Math.cos(angle) * 2.5, 0.9, Math.sin(angle) * 2.5);
    rim.add(bulb);
  }
  ufo.add(rim);

  // Under-glow disc (brightens while thrusting).
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 20),
    new THREE.MeshBasicMaterial({
      color: 0x7dff9a, transparent: true, opacity: 0.35,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.25;
  ufo.add(glow);

  return { ufo, rim, glow };
}

// A kick-scooter with a little rider — for the 3rd-person delivery view.
// Front of the vehicle is -Z (same as the car), so it faces forward.
function buildScooterModel() {
  const scooter = new THREE.Group();
  const frame = new THREE.MeshLambertMaterial({ color: 0xff5a3c });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe0a878 });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2f6fd0 });

  // Deck (you stand on this) and the two wheels.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 2.4), frame);
  deck.position.y = 0.4;
  scooter.add(deck);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.2, 14);
  for (const z of [-1.05, 1.05]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.rotation.z = Math.PI / 2;      // stand the cylinder up like a wheel
    w.position.set(0, 0.36, z);
    scooter.add(w);
  }

  // Steering column + handlebar at the front (-Z).
  const column = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 0.12), frame);
  column.position.set(0, 1.05, -1.05);
  scooter.add(column);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.12), dark);
  bar.position.set(0, 1.6, -1.05);
  scooter.add(bar);

  // The rider: legs, torso, head, helmet.
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.9, 0.45), dark);
  legs.position.set(0, 1.0, 0.25);
  scooter.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.4), shirt);
  torso.position.set(0, 1.75, 0.15);
  scooter.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), skin);
  head.position.set(0, 2.35, 0.1);
  scooter.add(head);
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 14, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    frame,
  );
  helmet.position.set(0, 2.4, 0.1);
  scooter.add(helmet);
  // A delivery box on the back rack.
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.6),
    new THREE.MeshLambertMaterial({ color: 0xcaa46a }));
  box.position.set(0, 1.15, 1.15);
  scooter.add(box);

  scooter.scale.setScalar(1.15);
  return scooter;
}

// --- Real 3D models (glTF) ---
// Load a .glb, normalize it (scale to a target length, sit it on the
// ground, face it forward = -Z), then swap it in for the placeholder box
// model. If the file ever fails to load, we simply keep the placeholder,
// so a bad download can never break the game.
const gltfLoader = new GLTFLoader();

function loadVehicleModel(url, targetGroup, opts) {
  gltfLoader.load(url, (gltf) => {
    const model = gltf.scene;
    model.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

    // Normalize size + position from the model's bounding box.
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    const s = opts.length / (Math.max(size.x, size.z) || 1);
    model.scale.setScalar(s);
    // Re-center on x/z and drop so the base sits at y = 0.
    model.position.set(-center.x * s, -box.min.y * s, -center.z * s);

    // Wrap so we can spin it to face forward without disturbing the fit.
    const wrap = new THREE.Group();
    wrap.add(model);
    wrap.rotation.set(
      (opts.rotX || 0) * DEG, (opts.rotY || 0) * DEG, (opts.rotZ || 0) * DEG);
    wrap.position.y = opts.lift || 0;

    // Replace the placeholder meshes with the real model.
    while (targetGroup.children.length) targetGroup.remove(targetGroup.children[0]);
    targetGroup.add(wrap);
    if (opts.onLoaded) opts.onLoaded(wrap);
  }, undefined, (err) => {
    console.warn('Could not load model, keeping placeholder:', url, err);
  });
}

function loadVehicleModels() {
  // Car: replace the box car; the glowing thruster pods go away with it.
  loadVehicleModel('assets/car.glb', three.carModel, {
    length: 4.4, rotY: 180, onLoaded: () => { three.thrusters = []; },
  });
  // Scooter: a Vespa, replacing the hand-built kick-scooter.
  loadVehicleModel('assets/scooter.glb', three.scooterModel, {
    length: 2.2, rotY: 180,
  });
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

// Bridge deck segments in lng/lat, each end tagged with its height — used
// by the physics (so you can land on and drive across decks) and traffic
// (so cars ride up onto the bridges). Built once from the config.
const bridgeSegments = (() => {
  const segs = [];
  for (const b of BRIDGES) {
    const pts = b.deck.map((p, i) => ({
      lng: p[0], lat: p[1],
      h: (i === 0 || i === b.deck.length - 1) ? (p[2] ?? 1) : b.deckHeight,
    }));
    for (let i = 0; i < pts.length - 1; i++) segs.push({ a: pts[i], b: pts[i + 1] });
  }
  return segs;
})();
const BRIDGE_HALF_WIDTH = 13; // metres from the centreline that still counts as "on the deck"

// Height of the bridge deck at a point, or null if you're not over one.
// Interpolates along each segment, so ramps give a smooth slope.
function bridgeDeckHeightAt(lng, lat) {
  const mLng = METERS_PER_DEG_LAT * Math.cos(lat * DEG);
  let best = null;
  for (const s of bridgeSegments) {
    const abx = (s.b.lng - s.a.lng) * mLng, aby = (s.b.lat - s.a.lat) * METERS_PER_DEG_LAT;
    const apx = (lng - s.a.lng) * mLng, apy = (lat - s.a.lat) * METERS_PER_DEG_LAT;
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? (apx * abx + apy * aby) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const dx = apx - abx * t, dy = apy - aby * t;
    if (dx * dx + dy * dy < BRIDGE_HALF_WIDTH * BRIDGE_HALF_WIDTH) {
      const h = s.a.h + (s.b.h - s.a.h) * t;
      if (best === null || h > best) best = h;
    }
  }
  return best;
}

// Closest point (horizontally) on a deck polyline to a target scene
// point. Used to snap a central pylon onto the deck centreline so it
// lands inside the fork gap instead of beside the road.
function closestOnPolylineXZ(pts, target) {
  let best = null, bestD = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], c = pts[i + 1];
    const abx = c.x - a.x, abz = c.z - a.z;
    const len2 = abx * abx + abz * abz;
    let t = len2 > 0 ? ((target.x - a.x) * abx + (target.z - a.z) * abz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + abx * t, pz = a.z + abz * t;
    const dx = target.x - px, dz = target.z - pz, d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = { x: px, z: pz }; }
  }
  return best || { x: target.x, z: target.z };
}

// Build a forked deck for a central-tower bridge. Around the tower the
// single roadway opens into two carriageways with a gap in the middle
// (where the pylon stands) and then closes again — the real Bay Bridge
// east span. We walk the centreline in short steps and, at each step,
// work out how wide that central gap should be.
const FORK = { HALF: 120, GAP_MAX: 11 }; // metres: fork reach each side, widest gap
// Where central-tower spans fork: used to nudge traffic onto a carriageway
// (instead of the empty centre gap) as it passes the pylon.
const forkZones = BRIDGES
  .filter((b) => b.towerStyle === 'central' && b.towers)
  .map((b) => ({ lng: b.towers[0][0], lat: b.towers[0][1], half: FORK.HALF, gap: FORK.GAP_MAX }));
function buildForkedDeck(b, deckPts, ctx) {
  const { group, deckMat, medianMat, pierMat, polePositions } = ctx;
  const towerP = toScene(b.towers[0][0], b.towers[0][1], 0); // tower, ground level

  // Total length + per-segment lengths of the centreline.
  const segLen = [];
  let total = 0;
  for (let i = 0; i < deckPts.length - 1; i++) {
    const l = deckPts[i].distanceTo(deckPts[i + 1]);
    segLen.push(l); total += l;
  }

  // Resample the centreline into even ~14 m steps (interpolating height too).
  const STEP = 14;
  const n = Math.max(2, Math.ceil(total / STEP));
  const samples = [];
  for (let k = 0; k <= n; k++) {
    const s = total * k / n;
    let acc = 0, i = 0;
    while (i < segLen.length - 1 && acc + segLen[i] < s) { acc += segLen[i]; i++; }
    const t = segLen[i] > 0 ? (s - acc) / segLen[i] : 0;
    samples.push({ p: deckPts[i].clone().lerp(deckPts[i + 1], t), s });
  }

  // Distance along the deck (arc length) of the point nearest the tower.
  let sTower = 0, bestD = Infinity;
  for (const smp of samples) {
    const dx = smp.p.x - towerP.x, dz = smp.p.z - towerP.z, d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; sTower = smp.s; }
  }

  // Gap width as a function of arc length: widest at the tower, tapering
  // smoothly (raised cosine) to zero FORK.HALF metres to either side.
  const gapAt = (s) => {
    const u = Math.abs(s - sTower) / FORK.HALF;
    return u >= 1 ? 0 : FORK.GAP_MAX * (0.5 + 0.5 * Math.cos(Math.PI * u));
  };

  // A deck slab of the given width, centred at `center`, length along
  // `along`; a little length overlap hides the seams between steps.
  const addSlab = (center, along, width, len) => {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 3, len + 0.6), deckMat);
    slab.position.copy(center);
    slab.lookAt(center.clone().add(along));
    group.add(slab);
  };

  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i].p, c = samples[i + 1].p;
    const len = a.distanceTo(c);
    if (len < 0.001) continue;
    const mid = a.clone().add(c).multiplyScalar(0.5);
    const along = c.clone().sub(a).multiplyScalar(1 / len);
    const across = new THREE.Vector3(-along.z, 0, along.x);
    if (across.length() > 0.001) across.normalize();
    const G = gapAt((samples[i].s + samples[i + 1].s) / 2);

    if (G < 1) {
      // Normal single deck with a yellow centre median.
      addSlab(mid, along, 22, len);
      const median = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, len + 0.6), medianMat);
      median.position.copy(mid); median.position.y += 2.3;
      median.lookAt(mid.clone().add(along));
      group.add(median);
    } else {
      // Two carriageways: outer edges stay at ±11 m, a gap G opens up the
      // middle. Each carriageway is (11 − G/2) wide, centred at ±(5.5+G/4).
      const cwWidth = 11 - G / 2;
      const centerOff = 5.5 + G / 4;
      for (const side of [-1, 1]) {
        addSlab(mid.clone().add(across.clone().multiplyScalar(centerOff * side)),
                along, cwWidth, len);
      }
    }

    // Lamp posts every ~85 m along the outer edges; piers every ~180 m.
    if (i % 6 === 0) {
      for (const side of [-1, 1]) {
        polePositions.push(mid.clone().add(across.clone().multiplyScalar(10.5 * side)));
      }
    }
    if (b.piers && i % 13 === 0 && mid.y > 8) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(5, mid.y, 5), pierMat);
      pier.position.set(mid.x, mid.y / 2, mid.z);
      group.add(pier);
    }
  }
}

// Build the bridges from simple shapes at real OSM coordinates.
// Everything is in scene coordinates (meters), so plain vector math
// works: decks are boxes laid point-to-point, towers are boxes standing
// on the line, cables are tubes bent along curves between tower tops.
function buildBridges() {
  const group = new THREE.Group();
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x454b54 });
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a8f98 });
  const medianMat = new THREE.MeshLambertMaterial({ color: 0xd9c25a }); // yellow divider
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });     // glowing lamp head
  const polePositions = []; // lamp-post bases, collected across every bridge

  for (const b of BRIDGES) {
    const mat = new THREE.MeshLambertMaterial({ color: b.color });

    // --- Deck: one slab per polyline segment. First/last points are on
    // the ground, so the outer segments naturally become the ramps.
    const deckPts = b.deck.map((p, i) => {
      const grounded = i === 0 || i === b.deck.length - 1;
      // Ground points may carry their own elevation (p[2]) — the
      // Golden Gate's ends sit on bluffs, not at sea level.
      return toScene(p[0], p[1], grounded ? (p[2] ?? 1) : b.deckHeight);
    });
    if (b.towerStyle === 'central') {
      // Central-tower spans fork the roadway around the pylon.
      buildForkedDeck(b, deckPts, { group, deckMat, medianMat, pierMat, polePositions });
    } else
    for (let i = 0; i < deckPts.length - 1; i++) {
      const a = deckPts[i];
      const c = deckPts[i + 1];
      const len = a.distanceTo(c);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(22, 3, len), deckMat);
      slab.position.copy(a.clone().add(c).multiplyScalar(0.5));
      // lookAt points the slab's long (Z) axis at the far end — which
      // also tilts the ramp segments to their correct slope for free.
      slab.lookAt(c);
      group.add(slab);

      // Yellow median divider down the centre, sitting on the deck.
      const median = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, len), medianMat);
      median.position.copy(slab.position); median.position.y += 2.3;
      median.rotation.copy(slab.rotation);
      group.add(median);

      // Lamp-post bases along both edges at intervals.
      const along = c.clone().sub(a).normalize();
      const across = new THREE.Vector3(-along.z, 0, along.x);
      const nPoles = Math.floor(len / 85);
      for (let k = 1; k <= nPoles; k++) {
        const base = a.clone().lerp(c, k / (nPoles + 1));
        for (const side of [-1, 1]) {
          polePositions.push(base.clone().add(across.clone().multiplyScalar(10.5 * side)));
        }
      }

      // Support piers under the elevated stretches.
      if (b.piers) {
        for (let d = 90; d < len - 40; d += 180) {
          const pos = a.clone().lerp(c, d / len);
          if (pos.y < 8) continue; // ramp is nearly at the ground here
          const pier = new THREE.Mesh(new THREE.BoxGeometry(5, pos.y, 5), pierMat);
          pier.position.set(pos.x, pos.y / 2, pos.z);
          group.add(pier);
        }
      }
    }

    if (!b.towers) continue; // plain causeway bridges are done here

    // --- Suspension kit: towers + main cables ---
    const towerTops = b.towers.map((p) => toScene(p[0], p[1], b.towerHeight));
    if (b.towerStyle === 'central') {
      // The configured tower coord can sit a little off our simplified deck
      // polyline; snap the pylon onto the centreline so it (and the cables
      // draped over it) land inside the fork gap, not beside the road.
      for (const top of towerTops) {
        const snap = closestOnPolylineXZ(deckPts, top);
        top.x = snap.x; top.z = snap.z;
      }
    }
    const anchorA = toScene(b.cableAnchors[0][0], b.cableAnchors[0][1], b.deckHeight);
    const anchorB = toScene(b.cableAnchors[1][0], b.cableAnchors[1][1], b.deckHeight);

    // Direction along the span, and its 90° sideways partner (used to
    // offset one cable to each edge of the roadway).
    const along = anchorB.clone().sub(anchorA).setY(0).normalize();
    const across = new THREE.Vector3(-along.z, 0, along.x);

    if (b.drawTowers) {
      // Two tower shapes, chosen per bridge in config:
      //  • 'portal'  — two legs that STRADDLE the roadway (suspension
      //                towers like the Bay Bridge west span). Cars drive
      //                between the legs; cross-struts start above traffic.
      //  • 'central' — one slim pylon that sits IN the median (the newer
      //                east span's single tower), so lanes pass either side.
      const style = b.towerStyle || 'portal';

      // Reusable geometry for portal legs/struts (legs sit at ±legX, well
      // outside the 22 m deck, whose half-width is 11 m).
      const legX = 15;
      const legGeo = new THREE.BoxGeometry(6.5, b.towerHeight, 9);
      const strutGeo = new THREE.BoxGeometry(2 * legX + 6.5, 4.5, 10);

      for (const top of towerTops) {
        const tower = new THREE.Group();

        if (style === 'central') {
          // A single tapered column. CylinderGeometry with 4 sides makes a
          // square shaft; a smaller top radius than bottom gives the taper.
          // Kept slim (≈6 m at the base) so it fits between the traffic lanes.
          const pylon = new THREE.Mesh(
            new THREE.CylinderGeometry(2.4, 4.2, b.towerHeight, 4),
            mat,
          );
          pylon.position.y = b.towerHeight / 2;
          tower.add(pylon);
        } else {
          // Portal: two legs straddling the road...
          for (const side of [-1, 1]) {
            const leg = new THREE.Mesh(legGeo, mat);
            leg.position.set(legX * side, b.towerHeight / 2, 0);
            tower.add(leg);
          }
          // ...tied together by cross-struts. The LOWEST sits above the
          // deck (deckHeight + 12) so vehicles pass under it; the rest
          // climb the tower for the classic portal-frame look.
          for (const by of [b.deckHeight + 12, b.towerHeight * 0.55,
                             b.towerHeight * 0.78, b.towerHeight * 0.97]) {
            const strut = new THREE.Mesh(strutGeo, mat);
            strut.position.y = by;
            tower.add(strut);
          }
        }

        tower.position.set(top.x, 0, top.z);
        // Orient the tower so its local Z runs ALONG the bridge (legs then
        // straddle ACROSS the road). atan2(along.x, along.z) does exactly
        // that. (An earlier +90° here turned the legs the wrong way.)
        tower.rotation.y = Math.atan2(along.x, along.z);
        group.add(tower);
      }
    }

    // The cable's path: deck anchor → over every tower top → deck anchor.
    // Between two towers it sags almost to the deck; elsewhere it just
    // droops a little. One cable per side of the roadway.
    const chain = [anchorA, ...towerTops, anchorB];
    // A central pylon carries a single cable plane down the middle; a
    // portal tower carries one cable along each edge of the deck (±11 m).
    const cableSides = b.towerStyle === 'central' ? [0] : [-1, 1];
    const cableOff = b.towerStyle === 'central' ? 0 : 11;
    for (const side of cableSides) {
      const off = across.clone().multiplyScalar(cableOff * side);
      for (let i = 0; i < chain.length - 1; i++) {
        const p = chain[i].clone().add(off);
        const q = chain[i + 1].clone().add(off);
        const isMainSpan = i > 0 && i < chain.length - 2; // tower→tower
        // A bezier curve's middle is pulled toward its control point.
        const controlY = isMainSpan
          ? 2 * (b.deckHeight + 4) - (p.y + q.y) / 2  // sag to deck level
          : (p.y + q.y) / 2 - p.distanceTo(q) * 0.12; // gentle droop
        const control = p.clone().lerp(q, 0.5).setY(controlY);
        const curve = new THREE.QuadraticBezierCurve3(p, control, q);
        group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.8, 6), mat));
      }
    }
  }

  // Lamp posts (one InstancedMesh for the shafts, one for the glowing
  // heads) — cheap even though there are hundreds across all the bridges.
  if (polePositions.length) {
    const poles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.25, 0.35, 9, 6), poleMat, polePositions.length);
    const lamps = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.75, 8, 6), lampMat, polePositions.length);
    const m = new THREE.Matrix4();
    polePositions.forEach((p, i) => {
      m.makeTranslation(p.x, p.y + 4.5, p.z);  // 9 m shaft, centred at +4.5
      poles.setMatrixAt(i, m);
      m.makeTranslation(p.x, p.y + 9.2, p.z);   // glowing head on top
      lamps.setMatrixAt(i, m);
    });
    group.add(poles, lamps);
  }
  return group;
}

// A tiny seeded random-number generator. Unlike Math.random(), the same
// seed always gives the same sequence — so every player's trees grow in
// the same spots, every time the game loads.
function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Scatter simple trees (trunk + leafy blob) across the parks.
// InstancedMesh draws ALL trunks in one GPU call and all canopies in
// another — hundreds of trees for the price of two.
function buildTrees() {
  const mult = gfx().sceneryMult;
  const total = Math.ceil(TREE_SPOTS.reduce((sum, s) => sum + s.count, 0) * mult);

  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.3, 0.5, 3, 6),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2f }),
    total,
  );
  const canopies = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(2.4, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff }), // white × per-tree tint
    total,
  );

  const rand = mulberry32(42);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const color = new THREE.Color();
  let i = 0;

  for (const spot of TREE_SPOTS) {
    // Each park sits at its own elevation now that hills exist.
    const center = toScene(spot.center[0], spot.center[1], spot.baseAlt ?? 0);
    const nTrees = Math.ceil(spot.count * mult);
    for (let n = 0; n < nTrees && i < total; n++, i++) {
      // Random point in a circle. sqrt() makes the spread even —
      // without it trees would crowd the center.
      const ang = rand() * Math.PI * 2;
      const r = spot.radius * Math.sqrt(rand());
      const x = center.x + Math.cos(ang) * r;
      const z = center.z + Math.sin(ang) * r;
      const s = 0.7 + rand() * 0.9; // each tree its own size

      matrix.compose(new THREE.Vector3(x, center.y + 1.5 * s, z), quat,
                     new THREE.Vector3(s, s, s));
      trunks.setMatrixAt(i, matrix);

      matrix.compose(new THREE.Vector3(x, center.y + 4.4 * s, z), quat,
                     new THREE.Vector3(s, s, s));
      canopies.setMatrixAt(i, matrix);
      // Each canopy gets its own shade of green.
      canopies.setColorAt(i, color.setHSL(0.29 + rand() * 0.07, 0.55, 0.28 + rand() * 0.14));
    }
  }
  trunks.count = i; canopies.count = i; // only render the instances we filled

  const group = new THREE.Group();
  group.add(trunks, canopies);
  return group;
}

// Bushes: low, dense shrubs — a single InstancedMesh of small green
// blobs sitting on the ground through the same parks, so the greenery
// reads as full ground cover next to the taller trees.
function buildBushes() {
  const mult = BUSH_MULT * gfx().sceneryMult;
  const total = Math.ceil(
    TREE_SPOTS.reduce((sum, s) => sum + s.count, 0) * mult);

  const bushes = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1.1, 0),  // small + low-poly = cheap
    new THREE.MeshLambertMaterial({ color: 0xffffff }), // white × per-bush tint
    total,
  );

  // A different seed than the trees, so bushes don't stack on trunks.
  const rand = mulberry32(1337);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const color = new THREE.Color();
  let i = 0;

  for (const spot of TREE_SPOTS) {
    const center = toScene(spot.center[0], spot.center[1], spot.baseAlt ?? 0);
    const bushCount = Math.ceil(spot.count * mult);
    for (let n = 0; n < bushCount && i < total; n++, i++) {
      const ang = rand() * Math.PI * 2;
      const r = spot.radius * Math.sqrt(rand());
      const x = center.x + Math.cos(ang) * r;
      const z = center.z + Math.sin(ang) * r;
      const s = 0.6 + rand() * 1.1;
      // Squash slightly so bushes are wider than tall.
      matrix.compose(new THREE.Vector3(x, center.y + 0.8 * s, z), quat,
                     new THREE.Vector3(s * 1.3, s, s * 1.3));
      bushes.setMatrixAt(i, matrix);
      bushes.setColorAt(i, color.setHSL(0.27 + rand() * 0.08, 0.5, 0.25 + rand() * 0.12));
    }
  }
  bushes.count = i; // in case rounding left a few unused slots

  const group = new THREE.Group();
  group.add(bushes);
  return group;
}

// A big translucent blue sheet at sea level (y = 0) — the water surface.
// It shares the map's depth buffer, so LAND (terrain above 0) hides it
// while WATER (sea floor below 0) shows it through as blue. Diving below
// it puts you underwater. It follows the car so it always fills the view.
const WATER_LEVEL = -5; // metres below sea level the water sheet sits at

// The animated water shader: layered sine "waves" over the surface make
// it ripple and shimmer, and the brightest crests catch a warm sun
// "glint". It only needs each pixel's world position + a time value, so
// it works fine with our MapLibre-driven camera. (Low quality skips it
// for a plain flat sheet.)
function makeWaterMaterial() {
  if (!gfx().waterReflect) {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(LOOK.waterDeep), transparent: true, opacity: LOOK.waterOpacity,
      side: THREE.DoubleSide, depthWrite: false,
    });
  }
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(LOOK.waterDeep) },
      uShallow: { value: new THREE.Color(LOOK.waterShallow) },
      uSun: { value: new THREE.Color(LOOK.waterSun) },
      uOpacity: { value: LOOK.waterOpacity },
      uGlint: { value: LOOK.waterGlint },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      uniform vec3 uDeep, uShallow, uSun;
      uniform float uOpacity, uGlint;
      varying vec3 vWorld;

      // Precision-stable hash (Dave Hoskins). The classic sin()-based hash
      // goes chaotic at large coordinates, which made the water look
      // glitchy far from the start point / out over the ocean; this one
      // stays stable, so the surface is calm no matter where you fly.
      float hash(vec2 p){
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      float noise(vec2 x){
        vec2 i = floor(x), f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i), b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        vec2 p = vWorld.xz;
        // Gentle broad colour undulation across the bay.
        float broad = noise(p * 0.004 + uTime * 0.05);
        vec3 col = mix(uDeep, uShallow, broad * 0.5);
        // Sun glitter: two drifting NOISE fields, high-passed so only the
        // bright peaks sparkle. Lower frequencies + gentler drift than
        // before, so the glints are larger and don't strobe/alias when you
        // fly over them at speed.
        float s = noise(p * 0.03 + vec2(uTime * 0.22, uTime * 0.13))
                + noise(p * 0.07 - vec2(uTime * 0.18, uTime * 0.11)) * 0.7;
        float glint = smoothstep(1.30, 1.66, s);
        col += uSun * glint * uGlint;
        gl_FragColor = vec4(col, uOpacity);
      }
    `,
  });
  three.waterMaterial = mat; // so the game loop can advance its clock
  return mat;
}

function buildWater() {
  const water = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000), makeWaterMaterial());
  water.rotation.x = -Math.PI / 2; // lay it flat
  water.renderOrder = -1;          // draw beneath the other scene objects
  three.water = water;
  return water;
}

// --- Fake building shadows ---
// MapLibre can't cast real shadows, so we fake them: for each nearby
// building we draw a flat dark shape stretched away from the low sun.
// Shadow shape = the convex hull of the footprint AND the footprint
// pushed along the ground by (height × length) — a proper connected
// streak, longer for taller buildings. High quality only.
const shadowState = { mesh: null, lastBuild: -Infinity };

// 2D convex hull (Andrew's monotone chain) of [x, z] points.
function convexHull(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

function buildShadowLayer() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: 0x0a1018, transparent: true, opacity: 0.36, depthWrite: false,
  }));
  mesh.renderOrder = 0;      // above the water, below the 3D objects
  mesh.frustumCulled = false;
  shadowState.mesh = mesh;
  return mesh;
}

// Rebuild the shadow geometry from the cached building footprints near
// the car. Runs ~once a second, and only on High quality.
function rebuildShadows(nowMs) {
  const mesh = shadowState.mesh;
  if (!mesh) return;
  if (!gfx().shadows) { mesh.visible = false; return; }
  mesh.visible = true;
  if (nowMs - shadowState.lastBuild < 1000) return;
  shadowState.lastBuild = nowMs;

  // Horizontal direction the shadows point (away from the sun).
  const s = three.sun.position;
  const dl = Math.hypot(s.x, s.z) || 1;
  const dirX = -s.x / dl, dirZ = -s.z / dl;

  const positions = [];
  let count = 0;
  for (const b of buildingCache.list) {
    if (count >= 400) break;
    const cLng = (b.minLng + b.maxLng) / 2, cLat = (b.minLat + b.maxLat) / 2;
    if (metersBetween(cLng, cLat, car.lng, car.lat) > 900) continue;

    const disp = Math.min(b.height * 1.7, 130); // shadow length, capped
    const gy = Math.max(0, groundAt(cLng, cLat, 0)) + 0.6; // just above ground
    const dx = dirX * disp, dz = dirZ * disp;

    // Footprint points AND the same points shoved along the ground.
    const pts = [];
    for (const [lng, lat] of b.rings[0]) {
      const p = toScene(lng, lat, gy);
      pts.push([p.x, p.z]);
      pts.push([p.x + dx, p.z + dz]);
    }
    const hull = convexHull(pts);
    if (hull.length < 3) continue;
    for (let k = 1; k < hull.length - 1; k++) {
      positions.push(hull[0][0], gy, hull[0][1]);
      positions.push(hull[k][0], gy, hull[k][1]);
      positions.push(hull[k + 1][0], gy, hull[k + 1][1]);
    }
    count++;
  }
  mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  mesh.geometry.computeBoundingSphere();
}

// --- Street traffic ---
// A pool of little cars that drive along the REAL roads near you. We ask
// MapLibre for road shapes in view, then walk each car along one.
const traffic = { cars: [], roads: [], lastRoadRefresh: -Infinity };

function buildTraffic() {
  const group = new THREE.Group();
  const body = new THREE.BoxGeometry(2, 1.2, 4.3);
  for (let i = 0; i < TRAFFIC.COUNT; i++) {
    const color = TRAFFIC.COLORS[i % TRAFFIC.COLORS.length];
    const mesh = new THREE.Mesh(body, new THREE.MeshLambertMaterial({ color }));
    mesh.visible = false;
    group.add(mesh);
    traffic.cars.push({ mesh, road: null, seg: 0, segT: 0 });
  }
  three.trafficGroup = group;
  return group;
}

// Grab road centrelines from the vector tiles currently in view.
function refreshTrafficRoads(nowMs) {
  if (nowMs - traffic.lastRoadRefresh < 3000 || !buildingSourceId) return;
  traffic.lastRoadRefresh = nowMs;
  const drivable = new Set(['motorway', 'trunk', 'primary', 'secondary',
    'tertiary', 'minor', 'street', 'residential', 'service',
    'motorway_link', 'trunk_link', 'primary_link']);
  const roads = [];
  for (const f of map.querySourceFeatures(buildingSourceId, { sourceLayer: 'transportation' })) {
    if (f.geometry.type !== 'LineString') continue;
    if (!drivable.has(f.properties.class)) continue;
    if (f.geometry.coordinates.length >= 2) roads.push(f.geometry.coordinates);
    if (roads.length >= 600) break;
  }
  if (roads.length) traffic.roads = roads;
}

// Put a car on a random nearby road, ready to drive from its start.
function placeCarOnRoad(c) {
  if (!traffic.roads.length) { c.mesh.visible = false; c.road = null; return; }
  c.road = traffic.roads[Math.floor(Math.random() * traffic.roads.length)];
  c.seg = 0;
  c.segT = Math.random(); // start somewhere along it
}

function updateTraffic(dt, nowMs) {
  if (!three.trafficGroup) return;
  refreshTrafficRoads(nowMs);

  const cap = gfx().trafficMax;
  for (let ci = 0; ci < traffic.cars.length; ci++) {
    const c = traffic.cars[ci];
    if (ci >= cap) { c.mesh.visible = false; c.road = null; continue; } // quality cap
    if (!c.road) { placeCarOnRoad(c); continue; }

    // Walk `SPEED*dt` metres along the polyline, hopping segments.
    let remaining = TRAFFIC.SPEED * dt;
    while (remaining > 0 && c.seg < c.road.length - 1) {
      const a = c.road[c.seg], b = c.road[c.seg + 1];
      const segLen = metersBetween(a[0], a[1], b[0], b[1]) || 0.001;
      const toEnd = segLen * (1 - c.segT);
      if (remaining < toEnd) { c.segT += remaining / segLen; remaining = 0; }
      else { remaining -= toEnd; c.seg++; c.segT = 0; }
    }
    if (c.seg >= c.road.length - 1) { c.road = null; c.mesh.visible = false; continue; }

    // Current lng/lat on the road, and the heading toward the next point.
    const a = c.road[c.seg], b = c.road[c.seg + 1];
    const lng = a[0] + (b[0] - a[0]) * c.segT;
    const lat = a[1] + (b[1] - a[1]) * c.segT;

    // Cars far from the player get recycled onto a nearby road.
    if (metersBetween(lng, lat, car.lng, car.lat) > 1400) { c.road = null; c.mesh.visible = false; continue; }

    // Near a central pylon the deck forks, so shift the car onto the
    // right-hand carriageway — otherwise it would drive through the tower
    // and the empty centre gap. (Opposing directions nudge to opposite
    // sides, which lands them on opposite carriageways, like the real road.)
    let dLng = lng, dLat = lat;
    for (const fz of forkZones) {
      if (metersBetween(lng, lat, fz.lng, fz.lat) < fz.half) {
        const dxm = (b[0] - a[0]) * Math.cos(lat * DEG), dym = b[1] - a[1];
        const L = Math.hypot(dxm, dym) || 1;
        const off = fz.gap / 2 + 3; // metres out onto the carriageway
        dLng = lng + (dym / L * off) / (METERS_PER_DEG_LAT * Math.cos(lat * DEG));
        dLat = lat + (-dxm / L * off) / METERS_PER_DEG_LAT;
        break;
      }
    }

    // Ride up onto a bridge deck if this bit of road crosses one.
    const deckH = bridgeDeckHeightAt(dLng, dLat);
    const y = deckH !== null ? deckH : Math.max(0, groundAt(dLng, dLat, 0));
    const p = toScene(dLng, dLat, y + 1);
    c.mesh.position.copy(p);
    const dx = (b[0] - a[0]) * Math.cos(lat * DEG);
    const dy = b[1] - a[1];
    c.mesh.rotation.y = -Math.atan2(dx, dy); // face along the road
    c.mesh.visible = true;
  }
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

    // Lighting for our 3D objects (car, trees, bridges). The actual
    // colors/angles live in LOOK (config.js) and are applied by
    // applyLook(), so the P-panel sliders update them live.
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    three.scene.add(ambient);
    three.ambient = ambient;
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    three.scene.add(sun);
    three.sun = sun;
    applyLook(); // sets sun/ambient/sky from LOOK now that lights exist

    const { carGroup, carBody, carModel } = buildCar();
    three.carGroup = carGroup;
    three.carBody = carBody;
    three.carModel = carModel;
    three.scene.add(carGroup);

    // The UFO and scooter ride in the same tilt group; only one shows.
    const { ufo, rim, glow } = buildUfoModel();
    three.ufoModel = ufo;
    three.ufoRim = rim;
    three.ufoGlow = glow;
    carBody.add(ufo);

    const scooter = buildScooterModel();
    three.scooterModel = scooter;
    carBody.add(scooter);

    applyVehicleVisibility();
    loadVehicleModels(); // swap in the real glTF car + scooter when ready

    const { beaconGroup, beamMaterial, ring } = buildBeacon();
    three.beaconGroup = beaconGroup;
    three.beamMaterial = beamMaterial;
    three.ring = ring;
    three.scene.add(beaconGroup);

    // Scenery: the bridges, trees and bushes never move, so we build
    // them once here and never touch them again.
    three.scene.add(buildBridges());
    three.scene.add(buildTrees());
    three.scene.add(buildBushes());
    three.scene.add(buildWater());
    three.scene.add(buildTraffic());
    three.scene.add(buildShadowLayer());

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
  // Shot mode: freeze every time-driven animation (water ripples, beacon
  // pulse, thruster flicker) at one instant so captures are repeatable.
  if (SHOT) timeSeconds = 100;
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

  // UFO: rim lights spin, under-glow flares while thrusting.
  if (three.ufoModel && three.ufoModel.visible) {
    three.ufoRim.rotation.y = timeSeconds * 2.2;
    three.ufoGlow.material.opacity =
      keys.thrust ? 0.75 : 0.3 + 0.1 * Math.sin(timeSeconds * 4);
  }

  // --- Shadow: on the ground (wherever the terrain puts it), fading
  // with the car's height above that ground ---
  const heightAboveGround = car.alt - car.ground;
  three.shadow.position.copy(toScene(car.lng, car.lat, car.ground + 0.3));
  three.shadow.material.opacity = Math.max(0, 0.4 - heightAboveGround / 400);
  const spread = 1 + heightAboveGround / 180;
  three.shadow.scale.set(spread, spread, 1);

  // --- Water surface: keep the big sheet centered under the car ---
  // Sits a few metres BELOW sea level so low-lying landfill (SoMa reads
  // as ~0 m in the elevation data) doesn't get flooded blue; the real
  // bay is far deeper, so it's still covered.
  if (three.water) {
    const w = toScene(car.lng, car.lat, 0);
    three.water.position.set(w.x, WATER_LEVEL, w.z);
    if (three.waterMaterial) three.waterMaterial.uniforms.uTime.value = timeSeconds;
  }

  // --- Beacon at the current target, standing on its terrain ---
  const target = BEACONS[state.targetIndex];
  const targetGround = groundAt(target.lngLat[0], target.lngLat[1], 0);
  three.beaconGroup.position.copy(toScene(target.lngLat[0], target.lngLat[1], targetGround));
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

  // How high is the terrain here? (Falls back to last frame's answer
  // while elevation tiles are still downloading.)
  car.ground = groundAt(car.lng, car.lat, car.ground);

  // --- Combine the two input sources into one -1..1 value per axis ---
  // Keyboard keys give a full -1 or +1; the joystick adds its analog
  // amount. clamp() keeps the total within -1..1 if you use both at once.
  const clamp1 = (v) => Math.max(-1, Math.min(1, v));
  input.steer = clamp1((keys.right ? 1 : 0) - (keys.left ? 1 : 0) + joystick.x);
  input.throttle = clamp1((keys.forward ? 1 : 0) - (keys.back ? 1 : 0) + joystick.y);

  // --- Steering ---
  const horizSpeed = Math.hypot(car.vx, car.vy);
  // Low end: ramp up from a floor so you can still rotate while hovering
  // and turn sharply at normal driving speeds.
  const lowEnd = 0.35 + 0.65 * Math.min(1, horizSpeed / 15);
  // High end: ease steering off once you're going fast, so a flick of the
  // wheel at 600 mph doesn't fling you sideways into a building.
  const easeOff = 1 / (1 + Math.max(0, horizSpeed - phys.TURN_EASE_ABOVE) / phys.TURN_EASE_RATE);
  car.heading += input.steer * phys.TURN_RATE * lowEnd * easeOff * dt;

  // --- Thrust forward/backward along our heading ---
  // sin/cos convert "compass angle" into an east/north direction vector.
  const fwdE = Math.sin(car.heading); // east component of "forward"
  const fwdN = Math.cos(car.heading); // north component of "forward"
  // One line handles both: a positive throttle accelerates, a negative
  // one (joystick pulled back, or S held) brakes/reverses.
  if (input.throttle !== 0) {
    const power = input.throttle > 0 ? phys.ACCEL : phys.BRAKE;
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
  fwdSpeed *= Math.exp(-phys.DRAG * dt);
  // The lowest we can go: divers (the UFO) sink to the real sea floor;
  // everything else stops at the water surface (sea level, 0).
  const canDive = VEHICLES[state.vehicle].canDive;
  let floorAlt = canDive ? car.ground : Math.max(0, car.ground);
  // Bridge decks are SOLID: if you're at or above the deck here, it
  // becomes the floor, so you land on it and drive across (instead of
  // falling through to the water). Below the deck you can still fly under.
  const deckH = bridgeDeckHeightAt(car.lng, car.lat);
  if (deckH !== null && car.alt >= deckH - 3) floorAlt = Math.max(floorAlt, deckH);
  const onGround = car.alt < floorAlt + 1;
  const grip = onGround ? phys.GRIP_GROUND : phys.GRIP_AIR;
  sideSpeed *= Math.exp(-grip * dt);

  fwdSpeed = Math.max(-phys.MAX_REVERSE, Math.min(phys.MAX_SPEED, fwdSpeed));

  // Recombine the two parts back into east/north velocity.
  car.vx = fwdE * fwdSpeed + sideE * sideSpeed;
  car.vy = fwdN * fwdSpeed + sideN * sideSpeed;

  // --- Vertical: thrust vs gravity vs drag ---
  if (keys.thrust) car.vAlt += phys.THRUST * dt;

  // In GLIDE mode, forward speed makes lift (like wings) that cancels
  // part of gravity. min() caps the lift: gliding always sinks a
  // little, so it can never replace the thrust button.
  let gravity = phys.GRAVITY;
  if (state.flightMode === 'glide') {
    const lift = Math.min(1, horizSpeed / phys.GLIDE_LIFT_SPEED)
               * phys.GLIDE_LIFT_MAX;
    gravity *= 1 - lift;
  }
  car.vAlt -= gravity * dt;

  const vDrag = state.flightMode === 'glide'
    ? phys.GLIDE_VERTICAL_DRAG : phys.VERTICAL_DRAG;
  car.vAlt *= Math.exp(-vDrag * dt);
  car.alt += car.vAlt * dt;

  // The floor is solid — a hillside, the street, or (for divers) the sea
  // bed. Driving uphill, this clamp carries the car up the slope; off a
  // crest, gravity takes over and you catch air.
  if (car.alt <= floorAlt) {
    car.alt = floorAlt;
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
const buildingCache = { list: [], lastRefresh: -Infinity, lng: null, lat: null };

// --- Bridge-tower recolouring ---------------------------------------------
// Some bridges (the Golden Gate) have towers OSM already models in fine
// detail, but our height-based tint paints them the wrong colour. We repaint
// exactly those buildings the bridge's own colour. We can only do it once
// their map tiles have loaded (i.e. when you fly near), so we DISCOVER the
// tower parts at runtime: any building within `radius` of a tower coordinate
// gets its id remembered, then the fill colour switches to a "these ids →
// bridge colour, everything else → normal" rule.
const recolorTowers = BRIDGES
  .filter((b) => b.recolorTowers && b.towers)
  .map((b) => ({
    css: '#' + (b.color >>> 0).toString(16).padStart(6, '0'),
    towers: b.towers,
    radius: b.recolorRadius || 75, // metres from a tower coord that counts as "tower"
  }));
const recolorTowerIds = new Set();

// Scan freshly-fetched building features for tower parts near a recolour
// bridge; when we find new ones, re-apply the colour rule. Fully guarded so
// a bad expression can never break the render loop.
function updateTowerRecolor(feats) {
  if (!recolorTowers.length) return;
  let grew = false;
  for (const f of feats) {
    if (f.id == null || recolorTowerIds.has(f.id)) continue;
    if ((f.properties.render_height || 0) < 6) continue; // skip ground-level footprints only
    let c = f.geometry.coordinates;
    while (Array.isArray(c[0])) c = c[0];     // first vertex, representative point
    for (const rc of recolorTowers) {
      if (rc.towers.some((t) => metersBetween(c[0], c[1], t[0], t[1]) < rc.radius)) {
        recolorTowerIds.add(f.id);
        grew = true;
        break;
      }
    }
  }
  if (grew) applyTowerRecolor();
}

function applyTowerRecolor() {
  try {
    if (!map.getLayer('3d-buildings') || !recolorTowerIds.size) return;
    map.setPaintProperty('3d-buildings', 'fill-extrusion-color', [
      'case',
      ['in', ['id'], ['literal', [...recolorTowerIds]]],
      recolorTowers[0].css,          // all recolour bridges share one colour today
      buildingColorExpression(),     // everything else keeps its height colour
    ]);
  } catch (e) {
    /* never let a repaint break the frame */
  }
}

function refreshBuildingCache(nowMs) {
  // Refresh once a second — or sooner if the car has covered 150 m,
  // so a 600 mph run can't outfly the collision data.
  const moved = buildingCache.lng === null ? Infinity
    : metersBetween(car.lng, car.lat, buildingCache.lng, buildingCache.lat);
  if (nowMs - buildingCache.lastRefresh < 1000 && moved < 150) return;
  if (!buildingSourceId) return;
  buildingCache.lastRefresh = nowMs;
  buildingCache.lng = car.lng;
  buildingCache.lat = car.lat;

  // All building shapes in the map tiles currently loaded around us.
  const feats = map.querySourceFeatures(buildingSourceId, {
    sourceLayer: 'building',
  });

  // Repaint any bridge towers (e.g. Golden Gate) that just came into view.
  updateTowerRecolor(feats);

  buildingCache.list = [];
  for (const f of feats) {
    // Skip the Bay Bridge tower boxes we hide from the map — otherwise the
    // car would still crash into an invisible 160 m block on the roadway.
    if (OSM_HIDE_IDS && OSM_HIDE_IDS.includes(f.id)) continue;
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

  const height = buildingHeightAt(car.lng, car.lat);
  if (height === 0) return;                  // open ground
  // Building heights are measured from their base, so the roof's real
  // altitude is the terrain under it plus the building's height.
  const roof = car.ground + height;
  if (car.alt >= roof) return;               // flying above it

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
    takeDamage(nowMs);
  }
}

// Lose a heart on a crash — but only once per INVULN_MS, so a single
// scrape along a wall doesn't wipe out all your health in a few frames.
function takeDamage(nowMs) {
  if (nowMs < state.invulnUntil) { flashMessage('BONK!', 500); return; }
  state.invulnUntil = nowMs + GAME.INVULN_MS;
  state.health -= 1;
  if (state.health <= 0) {
    state.health = 0;
    endGame();
  } else {
    flashMessage(`BONK!  -1 ❤  (${state.health} left)`, 1100);
  }
}

// Out of hearts: freeze the game and show the Game Over card.
function endGame() {
  state.gameOver = true;
  state.running = false;
  document.getElementById('final-score').textContent = state.score;
  document.getElementById('gameover').classList.add('show');
}

// Start fresh: full health, back to the spawn point, score reset.
function restartGame() {
  state.health = GAME.MAX_HEALTH;
  state.score = 0;
  state.deliveries = 0;
  state.targetIndex = 0;
  state.invulnUntil = 0;
  state.gameOver = false;
  resetCar();
  document.getElementById('gameover').classList.remove('show');
  state.running = true;
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

  // Glide zoom and pitch toward the active preset (plus any mouse-wheel
  // nudge) instead of jump-cutting — same easing trick as the heading.
  const mode = CAMERA.MODES[state.cameraMode];
  const ease = 1 - Math.exp(-3 * dt);
  state.camZoom += (mode.zoom + state.zoomNudge - state.camZoom) * ease;
  state.camPitch += (mode.pitch - state.camPitch) * ease;

  // Recenter the drag-look offsets — but only while MOVING. Parked or
  // hovering, the rate is ~0 so you can hold a view and sightsee; the
  // faster you fly, the quicker the camera swings back behind you.
  if (!look.active) {
    const speed = Math.hypot(car.vx, car.vy);
    const recenter = Math.exp(-speed * 0.12 * dt);
    look.yaw *= recenter;
    look.pitch *= recenter;
  }

  map.jumpTo({
    center: [car.lng, car.lat],
    elevation: car.alt,               // aim at the car's altitude, not the ground
    bearing: state.camHeading / DEG + look.yaw, // chase heading + your peek
    // Total tilt, clamped to MapLibre's valid 0..85° range.
    pitch: Math.max(0, Math.min(85, state.camPitch + look.pitch)),
    zoom: state.camZoom,
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
  hearts: document.getElementById('hearts'),
  target: document.getElementById('target'),
  arrow: document.getElementById('compass-arrow'),
  distance: document.getElementById('distance'),
  speed: document.getElementById('speed'),
  altitude: document.getElementById('altitude'),
  flightMode: document.getElementById('flight-mode'),
  modeButton: document.getElementById('btn-mode'),
  message: document.getElementById('message'),
  underwater: document.getElementById('underwater'),
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
  // Full hearts for health left, empty hearts for health lost.
  hud.hearts.textContent =
    '❤'.repeat(state.health) + '\u{1F90D}'.repeat(GAME.MAX_HEALTH - state.health);
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

  // Underwater wash: below sea level (alt < 0), fade in with depth,
  // maxing out around 30 m down.
  const depth = Math.max(0, -car.alt);
  hud.underwater.style.opacity = Math.min(0.85, depth / 30);

  // Flight mode chip + touch button label. ✈ = glide, ⬆ = hover.
  const gliding = state.flightMode === 'glide';
  hud.flightMode.textContent = gliding ? '✈ GLIDE' : '⬆ HOVER';
  hud.modeButton.textContent = gliding ? '✈ GLIDE' : '⬆ HOVER';
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
  if (!SHOT) updateTraffic(dt, now); // traffic is random — skip it in shot mode
  rebuildShadows(now);
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

// --- Shot-mode boot: fixed spot, fixed camera, no HUD ---
// Defaults put the car on The Embarcadero facing the city + Bay Bridge —
// one frame that shows sky, buildings, road, water and haze distance.
// Override any of them in the URL: ?shot&lng=..&lat=..&alt=..&heading=..
if (SHOT) {
  const q = new URLSearchParams(window.location.search);
  car.lng = parseFloat(q.get('lng') ?? '-122.39735');  // The Embarcadero at Broadway
  car.lat = parseFloat(q.get('lat') ?? '37.79930');
  car.alt = parseFloat(q.get('alt') ?? '3');
  car.heading = parseFloat(q.get('heading') ?? '2.7'); // looking SE toward the Ferry Building
  car.vx = 0; car.vy = 0; car.vAlt = 0;
  state.camHeading = car.heading;
  state.cameraMode = parseInt(q.get('cam') ?? '1', 10);
  // The chase camera eases zoom/pitch toward the mode preset every frame,
  // so one-time values would be erased. Instead we set the two offsets it
  // respects: zoomNudge (added to the preset) and look.pitch (kept as-is
  // while the car is parked). Both give a stable, repeatable framing.
  const mode = CAMERA.MODES[state.cameraMode];
  state.camZoom = parseFloat(q.get('zoom') ?? '19.5');
  state.camPitch = parseFloat(q.get('pitch') ?? '72');
  state.zoomNudge = state.camZoom - mode.zoom;
  look.pitch = state.camPitch - mode.pitch;
  look.yaw = 0;
  state.invulnUntil = Infinity;          // never lose hearts mid-capture
  document.getElementById('hud').style.display = 'none';
  overlay.style.display = 'none';
  state.running = true;

  // Tell the capture script when the map has actually finished loading
  // tiles (map.loaded() goes true when the map is idle and complete).
  const readyPoll = setInterval(() => {
    if (didInitGame && map.loaded()) {
      window.__shotReady = true;
      clearInterval(readyPoll);
    }
  }, 250);
}
