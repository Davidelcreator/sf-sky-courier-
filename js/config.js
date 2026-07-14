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

// 3D suspension bridges, built from simple shapes at real coordinates
// (the map data only draws bridges as flat roads — no towers/cables).
// "ends" are the two shore points of the span; towers and cable anchors
// sit at fractions (0..1) along that line, so everything stays straight.
export const BRIDGES = [
  {
    name: 'Golden Gate Bridge',
    color: 0xd1451e,            // International Orange, its real paint!
    ends: [[-122.4760, 37.8070], [-122.4800, 37.8300]],
    towerPositions: [0.28, 0.72],
    anchorPositions: [0.05, 0.95],
    towerHeight: 227,           // real: 227 m above the water
    deckHeight: 67,             // real: the roadway is ~67 m up
  },
  {
    name: 'Bay Bridge (west span)',
    color: 0xb8bcc4,            // silver-gray steel
    ends: [[-122.3872, 37.7866], [-122.3655, 37.8107]],
    towerPositions: [0.3, 0.7],
    anchorPositions: [0.05, 0.95],
    towerHeight: 158,
    deckHeight: 67,
  },
];

// Trees! Each spot scatters `count` simple trees within `radius` meters
// of a real park's center. Add your favorite park — any [lng, lat] works.
export const TREE_SPOTS = [
  { name: 'Rincon Park',            center: [-122.3905, 37.7901], radius: 90,  count: 20 },
  { name: 'Sue Bierman Park',       center: [-122.3952, 37.7957], radius: 100, count: 35 },
  { name: 'Washington Square',      center: [-122.4103, 37.8005], radius: 80,  count: 30 },
  { name: 'Alamo Square',           center: [-122.4345, 37.7764], radius: 100, count: 40 },
  { name: 'Marina Green',           center: [-122.4430, 37.8055], radius: 120, count: 25 },
  { name: 'Palace of Fine Arts',    center: [-122.4484, 37.8029], radius: 90,  count: 30 },
  { name: 'Presidio forest',        center: [-122.4640, 37.7945], radius: 350, count: 150 },
  { name: 'Golden Gate Park east',  center: [-122.4700, 37.7695], radius: 300, count: 130 },
  { name: 'Golden Gate Park west',  center: [-122.4950, 37.7690], radius: 300, count: 130 },
];
