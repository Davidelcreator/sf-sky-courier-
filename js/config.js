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
  ACCEL: 60,          // forward acceleration when holding W (m/s²)
  BRAKE: 70,          // braking/reverse acceleration when holding S
  MAX_SPEED: 110,     // top forward speed (110 m/s ≈ 246 mph!)
  MAX_REVERSE: 12,    // top reverse speed
  TURN_RATE: 2.0,     // how fast the car turns (radians per second)

  DRAG: 0.5,          // air resistance along the direction you're facing.
                      // Bigger = the car coasts to a stop sooner.
  GRIP_GROUND: 3.5,   // how strongly sideways sliding is cancelled on the
                      // ground. Bigger = grippier, smaller = drifty.
  GRIP_AIR: 1.0,      // same, but while flying (floatier on purpose)

  GRAVITY: 22,        // downward pull while airborne (m/s²)
  THRUST: 45,         // upward push while holding SPACE (m/s²).
                      // Must beat GRAVITY or you'd never take off!
  VERTICAL_DRAG: 0.9, // air resistance up/down — sets a max climb/fall speed
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
