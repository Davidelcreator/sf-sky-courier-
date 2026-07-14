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

// Chase camera: follows behind and above the car, looking forward.
export const CAMERA = {
  ZOOM: 17.3,   // how close the camera sits (higher = closer)
  PITCH: 72,    // camera tilt in degrees (0 = looking straight down,
                // 90 = looking flat at the horizon)
  SMOOTH: 4,    // how quickly the camera swings around when you turn.
                // Bigger = snappier, smaller = lazier.
};

export const GAME = {
  DELIVERY_RADIUS: 45, // how close (meters) you must get to score
  POINTS: 100,         // points per delivery
  CAR_SCALE: 1.8,      // 1 = realistic car size; bigger is easier to see
};

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
    towers: [
      [-122.3864117, 37.7903444], [-122.3810007, 37.7953129],
      [-122.3760816, 37.7998298], [-122.3706706, 37.8047983],
    ],
    cableAnchors: [[-122.3898551, 37.7871827], [-122.3672272, 37.8079600]],
    deck: [
      [-122.3926836, 37.7845855, 4],    // ground, SoMa
      [-122.3908389, 37.7862793],
      [-122.3662434, 37.8088634],
      [-122.3651366, 37.8098797, 45],   // ground, Yerba Buena tunnel
    ],
  },
  {
    name: 'Bay Bridge — east span',
    color: 0xf2f2f2,            // the new span's white tower
    deckHeight: 25,
    towerHeight: 160,
    drawTowers: true,
    towers: [[-122.3576000, 37.8158500]], // single SAS tower
    cableAnchors: [[-122.3596043, 37.8148222], [-122.3558151, 37.8167770]],
    piers: true,
    deck: [
      [-122.3612000, 37.8140200, 45],   // ground, Yerba Buena tunnel
      [-122.3604463, 37.8143878],
      [-122.3520259, 37.8187318],   // the span curves — real OSM points
      [-122.3436055, 37.8215495],
      [-122.3335850, 37.8216347],
      [-122.3277570, 37.8221892],
      [-122.3258000, 37.8223500, 3],    // ground, Oakland
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
  { name: 'Golden Gate Park west',  center: [-122.4950, 37.7690], radius: 300, count: 130, baseAlt: 15 },
];
