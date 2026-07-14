// ============================================================
// config.js — every "tuning knob" for the game in one place.
//
// Want the car faster? A new delivery spot? A bouncier camera?
// This is the only file you need to edit.
//
// Coordinates are [longitude, latitude] — that's the order map
// libraries use (x first, then y). Longitude = east/west,
// latitude = north/south. You can grab coordinates for any place
// by right-clicking it on Google Maps.
// ============================================================

// Where the car spawns: the middle of The Embarcadero (the wide
// waterfront boulevard), pointing up the road toward the Ferry
// Building. Heading is a compass angle in radians: 0 = north,
// positive = clockwise (so -0.6 ≈ 34° west of north).
export const START = {
  lngLat: [-122.3902, 37.7907],
  heading: -0.6,
};

// Delivery destinations — real Bay Area landmarks, visited in order
// (and looping forever). Add your own! Any [lng, lat] works.
export const BEACONS = [
  { name: 'Ferry Building',        lngLat: [-122.3937, 37.7955] },
  { name: 'Coit Tower',            lngLat: [-122.4058, 37.8024] },
  { name: 'Pier 39',               lngLat: [-122.4098, 37.8087] },
  { name: 'Palace of Fine Arts',   lngLat: [-122.4484, 37.8029] },
  { name: 'Golden Gate Bridge',    lngLat: [-122.4750, 37.8078] },
  { name: 'Painted Ladies',        lngLat: [-122.4330, 37.7764] },
  { name: 'SF City Hall',          lngLat: [-122.4193, 37.7793] },
  { name: 'Salesforce Tower',      lngLat: [-122.3969, 37.7897] },
  { name: 'Oracle Park',           lngLat: [-122.3893, 37.7786] },
  { name: 'Transamerica Pyramid',  lngLat: [-122.4028, 37.7952] },
];

// Physics constants. Units are meters and seconds (m/s, m/s²).
// These are "arcade" values — a real car can't do any of this.
export const PHYSICS = {
  ACCEL: 100,         // forward acceleration when holding W (m/s²)
  BRAKE: 130,         // braking/reverse acceleration when holding S
  MAX_SPEED: 268,     // top forward speed (268 m/s ≈ 600 mph!!)
  MAX_REVERSE: 12,    // top reverse speed
  TURN_RATE: 2.0,     // how fast the car turns (radians per second)

  DRAG: 0.35,         // air resistance along the direction you're facing.
                      // Bigger = the car coasts to a stop sooner.
                      // Physics note: drag grows with speed, so your real
                      // top speed is ACCEL ÷ DRAG (here 100/0.35 ≈ 285) —
                      // keep that above MAX_SPEED or the cap is unreachable.
  GRIP_GROUND: 3.5,   // how strongly sideways sliding is cancelled on the
                      // ground. Bigger = grippier, smaller = drifty.
  GRIP_AIR: 1.0,      // same, but while flying (floatier on purpose)

  GRAVITY: 22,        // downward pull while airborne (m/s²)
  THRUST: 45,         // upward push while holding SPACE (m/s²).
                      // Must beat GRAVITY or you'd never take off!
  VERTICAL_DRAG: 0.9, // air resistance up/down — sets a max climb/fall speed

  // GLIDE mode (toggle with G / the MODE button): forward speed makes
  // lift, like a plane's wings. Lift cancels part of gravity — never
  // more, so gliding always sinks a little and only SPACE can climb.
  GLIDE_LIFT_MAX: 0.94,     // fraction of gravity canceled at full speed
  GLIDE_LIFT_SPEED: 50,     // forward speed (m/s) that earns full lift
  GLIDE_VERTICAL_DRAG: 1.8, // extra air resistance = steadier, floatier feel
};

// Your garage! Switch vehicles in-game with V (or the VEH button).
// Each vehicle can override any PHYSICS value above — anything not
// listed keeps the default. That's the whole vehicle system: same
// physics engine, different numbers, different 3D model.
export const VEHICLES = [
  {
    name: 'SKY CAR',
    model: 'car',
    physics: {}, // the PHYSICS defaults above ARE the car
  },
  {
    name: 'SCOOTER',
    model: 'scooter',
    physics: {
      MAX_SPEED: 34,      // ~76 mph — a zippy delivery scooter
      ACCEL: 42,
      BRAKE: 55,
      TURN_RATE: 2.6,     // nimble
      THRUST: 34,         // it can still hop/fly, just gently
      GRAVITY: 26,
      GRIP_GROUND: 4.5,   // sticks to the road
    },
  },
  {
    name: 'UFO',
    model: 'ufo',
    canDive: true,        // the saucer can descend below sea level
    physics: {
      MAX_SPEED: 420,     // ≈ 940 mph. It is a UFO.
      ACCEL: 170,         // and it gets there absurdly fast
      BRAKE: 220,
      DRAG: 0.4,          // note 170/0.4 ≈ 425 — just above the cap,
                          // so the cap is actually reachable
      TURN_RATE: 2.8,     // saucers corner like nothing on Earth...
      GRIP_AIR: 3.0,      // ...and don't skid sideways through the sky
      THRUST: 75,
      GRAVITY: 18,        // built by someone who dislikes gravity
      VERTICAL_DRAG: 1.2,
    },
  },
];

// Chase camera: follows behind and above the car, looking forward.
// Press C (or the CAM button) in-game to cycle through MODES.
//   zoom  = how close the camera sits (higher = closer)
//   pitch = camera tilt in degrees (0 = looking straight down,
//           90 = looking flat at the horizon)
export const CAMERA = {
  SMOOTH: 4,    // how quickly the camera swings around when you turn.
                // Bigger = snappier, smaller = lazier.
  MODES: [
    { name: '3RD PERSON', zoom: 18.9, pitch: 60 }, // close behind, over the shoulder
    { name: 'CHASE',    zoom: 17.3, pitch: 72 },  // the classic
    { name: 'SKY VIEW', zoom: 16.4, pitch: 55 },  // high + wide, for navigating
    { name: 'TOP-DOWN', zoom: 16.6, pitch: 15 },  // like the paper map
    { name: 'CINEMA',   zoom: 17.6, pitch: 78 },  // low drama, big horizon
  ],
};

export const GAME = {
  DELIVERY_RADIUS: 45, // how close (meters) you must get to score
  POINTS: 100,         // points per delivery
  CAR_SCALE: 1.8,      // 1 = realistic car size; bigger is easier to see
  MAX_HEALTH: 3,       // hearts you start with
  INVULN_MS: 1400,     // after a crash, you can't be hurt again for this long
                       // (so one bonk doesn't drain every heart at once)
};

// Street traffic: a pool of little cars that drive along the REAL roads
// near you. Purely scenery — you pass through them (for now!).
export const TRAFFIC = {
  COUNT: 24,           // how many cars exist at once
  SPEED: 12,           // meters/second (~27 mph)
  COLORS: [0xffffff, 0x222831, 0xc0392b, 0x2e86de, 0xf1c40f, 0x7f8c8d, 0x27ae60],
};

// ============================================================
// GRAPHICS QUALITY
// ============================================================
// One dial that controls how hard we push the GPU. Each realism feature
// reads these flags, so weak devices (phones) can skip the costly bits.
// Cycle in-game with Q or the GFX chip. New quality features get added
// as flags here.
export const GRAPHICS = {
  // Golden-hour "sun" for the whole city (MapLibre 3D light on buildings).
  // position is [radius, azimuth°, polar°]; polar 78 = sun low in the sky.
  SUN:   { anchor: 'map', color: '#ffe0b0', intensity: 0.35, position: [1.5, 225, 80] },
  // Warm hazy atmosphere at the horizon (MapLibre sky). The "fog-*" keys
  // are haze that thickens with distance — depth cue, not real fog.
  SKY: {
    'sky-color': '#4a86d0', 'sky-horizon-blend': 0.5,
    'horizon-color': '#ffcf92', 'horizon-fog-blend': 0.4,
    'fog-color': '#f3cb9a', 'fog-ground-blend': 0.5, 'atmosphere-blend': 0.45,
  },
  // A plainer sky for Low (skips the pricey distance haze).
  SKY_PLAIN: { 'sky-color': '#9ec1ea', 'sky-horizon-blend': 0.4, 'horizon-color': '#dfeaf7' },

  PRESETS: {
    low:    { atmosphere: false, sceneryMult: 0.4, trafficMax: 8,  shadows: false, waterReflect: false },
    medium: { atmosphere: true,  sceneryMult: 0.8, trafficMax: 16, shadows: false, waterReflect: false },
    high:   { atmosphere: true,  sceneryMult: 1.0, trafficMax: 24, shadows: true,  waterReflect: true },
  },
};

// Satellite imagery base. Free ESRI "World Imagery" tiles (no API key)
// give real aerial detail — rooftops, trees, water color. Toggle in-game
// with B (or the MAP button). When on, we hide the flat vector map fills
// so the photo shows through, keeping roads, labels and 3D buildings.
export const SATELLITE = {
  ON_AT_START: true,
  TILES: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  ATTRIBUTION: 'Imagery © Esri, Maxar, Earthstar Geographics',
};

// Building colors, by height (meters). MapLibre blends smoothly between
// these stops, so a city block becomes a warm-to-cool gradient instead
// of flat gray. Tweak the hex colors to taste.
export const BUILDING_COLORS = [
  [0,   '#b98d63'],   // low-rise: warm tan
  [15,  '#c2a980'],   // sand
  [35,  '#a8b58e'],   // sage
  [70,  '#8ba9a8'],   // muted teal
  [130, '#8496b4'],   // slate blue
  [250, '#9d8bab'],   // soft mauve for the tallest towers (not vivid)
];

// Real 3D terrain: hills, mountains, valleys. Elevation tiles ("DEM" =
// digital elevation model) are free from AWS's open-data mirror of the
// Mapzen "terrarium" dataset — pixel colors encode ground height.
// The flatdem:// prefix routes tiles through our ocean-flattening
// filter in main.js (the raw data includes the sea FLOOR, which would
// render the bay as a giant pit).
export const TERRAIN = {
  ENABLED: true,       // set false if an older phone struggles
  EXAGGERATION: 1.0,   // 1 = true-to-life; 1.5 = drama-documentary hills
  TILES: 'flatdem://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  // false = KEEP the real sea-floor depth (the bay gets underwater
  // canyons you can dive into). true = flatten everything below sea
  // level so water is a flat plane at height 0.
  FLATTEN_OCEAN: false,
};

// 3D bridges, built from simple shapes at REAL coordinates fetched from
// OpenStreetMap (the same data the map itself is drawn from).
//
// How each bridge works:
//  - "deck" is a polyline: the FIRST and LAST points touch the ground
//    (those segments become the approach RAMPS); every point between
//    rides at deckHeight. Ground points carry their own elevation as a
//    third number — with 3D terrain on, "the ground" isn't always 0
//    (the Golden Gate's ends sit on ~65 m bluffs!).
//  - "piers: true" adds support columns under the elevated deck.
//  - Suspension bridges also get "towers" (+ towerHeight) and
//    "cableAnchors" (where the main cables meet the deck). Set
//    "drawTowers: false" when OpenStreetMap already renders the real
//    towers as gray 3D shapes — like the Golden Gate's! — so we only
//    add the cables, deck, and ramps around them.
export const BRIDGES = [
  {
    name: 'Golden Gate Bridge',
    color: 0xd1451e,            // International Orange, its real paint!
    deckHeight: 67,
    towerHeight: 227,
    drawTowers: false,          // OSM renders the real towers (in gray)
    towers: [[-122.4778921, 37.8140144], [-122.4792343, 37.8255026]],
    cableAnchors: [[-122.4775337, 37.8109470], [-122.4795927, 37.8285700]],
    deck: [
      [-122.4771673, 37.8078108, 65],   // ground, SF side (Presidio bluff)
      [-122.4775337, 37.8109470],
      [-122.4795927, 37.8285700],
      [-122.4799591, 37.8317062, 70],   // ground, Marin headlands
    ],
  },
  {
    name: 'Bay Bridge — west span',
    color: 0xb8bcc4,            // silver-gray steel
    deckHeight: 67,
    towerHeight: 158,
    drawTowers: true,           // no 3D towers in the map data here
    // Centerline from the actual I-80 roadway nodes in OSM (way 8921938).
    // Towers interpolated exactly ALONG that centerline (two per
    // suspension span, straddling the central anchorage at the midpoint)
    // so they line up with the road instead of sitting beside it.
    towers: [
      [-122.3869343, 37.7897352], [-122.3816191, 37.7946986],
      [-122.3760729, 37.7998779], [-122.3707576, 37.8048412],
    ],
    cableAnchors: [[-122.3894763, 37.7873614], [-122.3682156, 37.8072151]],
    deck: [
      [-122.3921339, 37.7848797, 4],    // ground, SoMa
      [-122.3904007, 37.7864982],
      [-122.3672912, 37.8080783],
      [-122.3662513, 37.8090494, 45],   // ground, Yerba Buena tunnel
    ],
  },
  {
    name: 'Bay Bridge — east span',
    color: 0xf2f2f2,            // the new span's white tower
    deckHeight: 25,
    towerHeight: 160,
    drawTowers: true,
    // Centerline from the actual I-80 roadway nodes in OSM (way 237731428).
    towers: [[-122.3579449, 37.8151064]], // single SAS tower
    cableAnchors: [[-122.3606373, 37.8133549], [-122.3552524, 37.8168580]],
    piers: true,
    deck: [
      [-122.3648555, 37.8106108, 45],   // ground, Yerba Buena tunnel
      [-122.3637785, 37.8113114],
      [-122.3548037, 37.8171499],   // the span curves — real OSM points
      [-122.3439900, 37.8200228],
      [-122.3336016, 37.8211781],
      [-122.3277147, 37.8218311],
      [-122.3255000, 37.8220845, 3],    // ground, Oakland
    ],
  },
  {
    name: 'Richmond–San Rafael Bridge',
    color: 0x8a8f98,
    deckHeight: 40,
    piers: true,
    deck: [
      [-122.4800000, 37.9430000],   // ground, San Rafael
      [-122.4778253, 37.9424611],
      [-122.4515209, 37.9357067],
      [-122.4251407, 37.9337395],
      [-122.4053225, 37.9325123],
      [-122.4032000, 37.9324000],   // ground, Richmond
    ],
  },
  {
    name: 'San Mateo–Hayward Bridge',
    color: 0x8a8f98,
    deckHeight: 18,
    piers: true,
    deck: [
      [-122.2652000, 37.5717000],   // ground, San Mateo
      [-122.2632880, 37.5730119],
      [-122.2363066, 37.5926572],
      [-122.2128641, 37.5996363],
      [-122.1812355, 37.6090372],
      [-122.1556619, 37.6166383],
      [-122.1537000, 37.6172000],   // ground, Hayward
    ],
  },
  {
    name: 'Dumbarton Bridge',
    color: 0x8a8f98,
    deckHeight: 16,
    piers: true,
    deck: [
      [-122.1316000, 37.4971000],   // ground, Menlo Park
      [-122.1301512, 37.4980388],
      [-122.1225477, 37.5030369],
      [-122.1151676, 37.5080016],
      [-122.1100472, 37.5120514],
      [-122.1082876, 37.5139984],
      [-122.1070000, 37.5150000],   // ground, Fremont
    ],
  },
];

// Trees! Each spot scatters `count` simple trees within `radius` meters
// of a real park's center. baseAlt is the park's ground elevation in
// meters (trees are placed once at load, before we can ask the terrain).
// Add your favorite park — any [lng, lat] works.
export const TREE_SPOTS = [
  { name: 'Rincon Park',            center: [-122.3905, 37.7901], radius: 90,  count: 20,  baseAlt: 3 },
  { name: 'Sue Bierman Park',       center: [-122.3952, 37.7957], radius: 100, count: 35,  baseAlt: 3 },
  { name: 'Washington Square',      center: [-122.4103, 37.8005], radius: 80,  count: 30,  baseAlt: 10 },
  { name: 'Alamo Square',           center: [-122.4345, 37.7764], radius: 100, count: 40,  baseAlt: 68 },
  { name: 'Marina Green',           center: [-122.4430, 37.8055], radius: 120, count: 25,  baseAlt: 3 },
  { name: 'Palace of Fine Arts',    center: [-122.4484, 37.8029], radius: 90,  count: 30,  baseAlt: 4 },
  { name: 'Presidio forest',        center: [-122.4640, 37.7945], radius: 350, count: 150, baseAlt: 60 },
  { name: 'Golden Gate Park east',  center: [-122.4700, 37.7695], radius: 300, count: 130, baseAlt: 70 },
  { name: 'Golden Gate Park mid',   center: [-122.4830, 37.7690], radius: 300, count: 130, baseAlt: 55 },
  { name: 'Golden Gate Park west',  center: [-122.4950, 37.7690], radius: 300, count: 130, baseAlt: 15 },
  { name: 'Lincoln Park',           center: [-122.4990, 37.7830], radius: 220, count: 80,  baseAlt: 60 },
  { name: 'Buena Vista Park',       center: [-122.4410, 37.7690], radius: 150, count: 70,  baseAlt: 100 },
  { name: 'Dolores Park',           center: [-122.4270, 37.7596], radius: 120, count: 40,  baseAlt: 20 },
  { name: 'McLaren Park',           center: [-122.4200, 37.7190], radius: 350, count: 130, baseAlt: 90 },
  { name: 'Mount Sutro forest',     center: [-122.4570, 37.7580], radius: 300, count: 160, baseAlt: 200 },
  { name: 'Glen Canyon',            center: [-122.4430, 37.7400], radius: 200, count: 90,  baseAlt: 100 },
  { name: 'Sutro Heights',          center: [-122.5100, 37.7780], radius: 120, count: 45,  baseAlt: 45 },
  { name: 'Yerba Buena Island',     center: [-122.3640, 37.8080], radius: 250, count: 90,  baseAlt: 40 },
  { name: 'Treasure Island',        center: [-122.3720, 37.8230], radius: 250, count: 60,  baseAlt: 3 },
];

// Bushes: low, dense shrubs scattered through the same parks (and any
// extra green patches). They read as ground cover next to the trees.
// `mult` scales how many bushes per tree-spot count.
export const BUSH_MULT = 1.6;
