// ============================================================
// npcs.js — pedestrians! Bay Area archetypes on the sidewalks.
//
// How an NPC comes to exist, in one breath: we grab real road
// shapes near the car from the map tiles, compute each road's real
// edge from the lane tables, pick a spot just OUTSIDE that edge
// (that's the sidewalk), check which DISTRICT the spot is in, roll
// an archetype weighted for that district, dress a randomly-chosen
// base character in the archetype's garment colors + props, and
// send them strolling along the road edge.
//
// The cast is 12 CC0 characters from Kenney's "Mini Characters"
// pack (see CREDITS.md) — rigged, animated, 723 triangles each.
// An archetype is ONLY a costume: recolored garments, props and
// behavior. Which base character (and so which skin tone) an NPC
// gets is uniformly random and identical for every archetype.
// ============================================================

import * as THREE from 'three';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'https://unpkg.com/three@0.160.0/examples/jsm/utils/SkeletonUtils.js';

// Loaded with the same cache-busting version as main.js (see the note
// there) so a deploy can never mix old and new halves of the game.
const V = new URL(import.meta.url).search;
const { NPCS, NPC_ARCHETYPES, DISTRICTS, TREE_SPOTS, LANES } =
  await import('./config.js' + V);

const DEG = Math.PI / 180;
const METERS_PER_DEG_LAT = 111320;

// Handles into main.js (toScene, groundAt, …) — filled by initNPCs.
let ctx = null;

// Everything the system owns, in one bag (inspect as game.npcs in console).
const N = {
  group: null,          // the THREE.Group all NPCs live in
  chars: null,          // per-character templates: geometry/clips/baked roles
  charNames: [],
  npcs: [],             // live NPC records
  paths: [],            // walkable road polylines near the car (+ real halfW)
  segs: [],             // EVERY drivable road segment in scene meters (roadway test)
  lastPathRefresh: -Infinity,
  refLng: null, refLat: null,
  rand: Math.random,    // swapped for a seeded generator in shot mode
  shot: null,           // ?npcshot lineup mode (deterministic screenshots)
  spawnCursor: 0,
  frame: 0,
};

// ------------------------------------------------------------
// Districts
// ------------------------------------------------------------
// A district is a set of circles (config.js). 'parks' borrows every
// TREE_SPOTS circle. First match wins; no match = 'residential'.
function districtAt(lng, lat) {
  for (const d of DISTRICTS) {
    const zones = d.fromTreeSpots
      ? TREE_SPOTS.map((t) => [t.center[0], t.center[1], t.radius])
      : d.zones;
    for (const [zlng, zlat, r] of zones) {
      if (ctx.metersBetween(lng, lat, zlng, zlat) < r) return d.id;
    }
  }
  return 'residential';
}

// Weighted archetype roll for a district. If nothing is weighted for
// this district (possible in 'residential'), everyone is equally likely.
function rollArchetype(district) {
  const w = NPC_ARCHETYPES.map((a) => a.weights[district] || 0);
  let total = w.reduce((s, x) => s + x, 0);
  if (total === 0) return NPC_ARCHETYPES[Math.floor(N.rand() * NPC_ARCHETYPES.length)];
  let roll = N.rand() * total;
  for (let i = 0; i < w.length; i++) {
    roll -= w[i];
    if (roll <= 0) return NPC_ARCHETYPES[i];
  }
  return NPC_ARCHETYPES[NPC_ARCHETYPES.length - 1];
}

// ------------------------------------------------------------
// Loading & recoloring the cast
// ------------------------------------------------------------
// npc-data.json (baked by tools/npc_bake.js) tells us, for every vertex
// of every character, whether it's skin/head (hands off!), top garment,
// bottom garment, or shoes — plus each garment's average brightness so
// recolors keep the baked shading (folds stay folds).
const ROLE_KEEP = 0, ROLE_TOP = 1, ROLE_BOTTOM = 2, ROLE_SHOES = 3;

function b64ToBytes(b64) {
  const s = atob(b64);
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}

// One shared material for every NPC: vertex colors carry the outfit, and
// it fogs/lights exactly like the rest of our 3D objects.
const npcMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

// Tie-dye painter: psychedelic rings radiating from the chest, hue
// stepping around the wheel with distance. Pure math, no texture.
function tiedyeColor(x, y, z, shade, out) {
  const r = Math.hypot(x, (y - 0.45) * 1.2, z - 0.05);
  const hue = (r * 5.0) % 1;
  out.setHSL(hue, 0.75, Math.min(0.72, 0.55 * shade));
  return out;
}

// Build (and cache) the recolored geometry for one character mesh in one
// archetype. NPCs sharing (character, archetype) share the result.
const geomCache = new Map();
function archetypeGeometry(charName, meshName, arch) {
  const key = charName + '|' + meshName + '|' + arch.id;
  if (geomCache.has(key)) return geomCache.get(key);

  const char = N.chars[charName];
  const base = char.baseGeom[meshName];
  const baked = char.baked[meshName];
  const geom = base.clone();
  const count = geom.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  const pos = geom.attributes.position;

  const garment = { [ROLE_TOP]: arch.top, [ROLE_BOTTOM]: arch.bottom, [ROLE_SHOES]: arch.shoes };
  for (let i = 0; i < count; i++) {
    const role = baked.roles[i];
    const r = baked.rgb[i * 3] / 255, g = baked.rgb[i * 3 + 1] / 255, b = baked.rgb[i * 3 + 2] / 255;
    const want = garment[role];
    if (!want || role === ROLE_KEEP) {
      c.setRGB(r, g, b);                     // authored color, untouched
    } else {
      // Brightness of this vertex relative to its garment's average —
      // multiplying the new color by it preserves the baked shading.
      const shade = (0.2126 * r + 0.7152 * g + 0.0722 * b) * 255 / baked.meanLum[role];
      if (want === 'tiedye') {
        tiedyeColor(pos.getX(i), pos.getY(i), pos.getZ(i), shade, c);
      } else {
        c.set(want).multiplyScalar(shade);
      }
    }
    colors[i * 3] = Math.min(1, c.r); colors[i * 3 + 1] = Math.min(1, c.g); colors[i * 3 + 2] = Math.min(1, c.b);
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geomCache.set(key, geom);
  return geom;
}

// ------------------------------------------------------------
// Props — simple primitive meshes built right here (plus two tiny CC0
// models from the same pack). Attached to hand/head BONES so they ride
// the animations for free.
// ------------------------------------------------------------
const propMat = (color) => new THREE.MeshLambertMaterial({ color });

const PROPS = {
  laptop(npc) { // an open clamshell, carried at the right hand
    const g = new THREE.Group();
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.015, 0.21), propMat(0xc9ced6));
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.20, 0.012), propMat(0xc9ced6));
    // the glowing display, inset into the lid — reads against dark hoodies
    const display = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.006), propMat(0x9fc4e8));
    display.position.z = 0.006;
    screen.add(display);
    screen.position.set(0, 0.10, -0.105); screen.rotation.x = -0.35;
    g.add(kb, screen);
    attach(npc, 'arm-right', g, [0, -0.30, 0.10], [0, 0, 0]);
  },
  phone(npc) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.012), propMat(0x22262c));
    attach(npc, 'arm-right', g, [0, -0.30, 0.06], [-0.9, 0, 0]);
  },
  sign(npc) { // a peace-sign placard on a stick, held high
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.35, 5), propMat(0x8a6a45));
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.20, 0.012), propMat(0xf2ead8));
    board.position.y = 0.26;
    // the peace symbol: a ring + three spokes, in flower-power purple
    const sym = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.010, 6, 20), propMat(0x8347c2));
    const bar = () => new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.062, 0.01), propMat(0x8347c2));
    const down = bar(); down.scale.y = 2.05; // full vertical stroke
    const dl = bar(); dl.position.set(-0.032, -0.030, 0); dl.rotation.z = 0.78;
    const dr = bar(); dr.position.set(0.032, -0.030, 0); dr.rotation.z = -0.78;
    sym.add(ring, down, dl, dr);
    sym.position.set(0, 0.26, 0.012);
    g.add(stick, board, sym);
    attach(npc, 'arm-right', g, [0, -0.28, 0.02], [0, 0, 0]);
  },
  helmet(npc) { // sized in head units — must out-dome a 0.46-wide head
    const g = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.6), propMat(0xe8542f));
    g.scale.set(1, 0.75, 1.15);
    attachHead(npc, g, [0, 0.22, 0]);
  },
  bike(npc) { // a road bike wheeled along at the left side
    const g = new THREE.Group();
    const wheelG = new THREE.TorusGeometry(0.32, 0.022, 6, 18);
    const dark = propMat(0x23252b);
    const w1 = new THREE.Mesh(wheelG, dark); w1.position.z = 0.54;
    const w2 = new THREE.Mesh(wheelG, dark); w2.position.z = -0.54;
    const tube = (a, b, color) => { // frame tube between two points
      const d = new THREE.Vector3().subVectors(b, a);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, d.length(), 5), propMat(color));
      m.position.copy(a).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
      return m;
    };
    const P = (y, z) => new THREE.Vector3(0, y, z);
    g.add(w1, w2,
      tube(P(0.03, 0.54), P(0.55, 0.32), 0xd94f30),  // fork → handlebars
      tube(P(0.55, 0.32), P(0.48, -0.26), 0xd94f30), // top tube
      tube(P(0.48, -0.26), P(0.03, -0.54), 0xd94f30),// seat stay
      tube(P(0.55, 0.32), P(0.10, 0.03), 0xd94f30),  // down tube
      tube(P(0.10, 0.03), P(0.48, -0.26), 0xd94f30), // seat tube
    );
    const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 5), dark);
    bars.rotation.z = Math.PI / 2; bars.position.set(0, 0.58, 0.32);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.19), dark);
    seat.position.set(0, 0.54, -0.29);
    g.add(bars, seat);
    g.position.set(0.55, 0.32, 0.15); // rolls beside the left hand
    attachAtFeet(npc, g);
    npc.bike = g; // wheels get a little roll in update()
    npc.bikeWheels = [w1, w2];
  },
  sunhat(npc) { // sized in head units — brim wider than the huge head
    const g = new THREE.Group();
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.40, 0.02, 14), propMat(0xf0e3c0));
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.13, 12), propMat(0xf0e3c0));
    crown.position.y = 0.07;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.275, 0.05, 12), propMat(0xb0475a));
    band.position.y = 0.03;
    g.add(brim, crown, band);
    attachHead(npc, g, [0, 0.26, 0], [0, 0, 0.05]);
  },
  wineglass(npc) {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 5), propMat(0xd8dde2));
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.028, 0.08, 8), propMat(0x7a2340));
    bowl.position.y = 0.08;
    g.add(stem, bowl);
    attach(npc, 'arm-right', g, [0, -0.30, 0.04], [0, 0, 0]);
  },
  surfboard(npc) { // carried at the left side, clear of the wide chibi body
    const board = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.95, 4, 8), propMat(0xf4f0e2));
    board.scale.set(1, 1, 0.18);            // squash into a board
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.05, 0.045), propMat(0x2e86de));
    board.add(stripe);
    board.rotation.x = Math.PI / 2;          // long axis forward
    attach(npc, 'arm-left', board, [-0.30, -0.12, 0], [0, 0, 0]);
  },
  dogs(npc) { // 1–3 small dogs on leashes, trotting ahead-left
    npc.dogs = [];
    const nDogs = 1 + Math.floor(N.rand() * 3);
    const furs = [0xd8c49a, 0x6e5137, 0xdedede, 0x3a3532];
    for (let i = 0; i < nDogs; i++) {
      const fur = propMat(furs[Math.floor(N.rand() * furs.length)]);
      const d = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.13, 0.30), fur);
      body.position.y = 0.16;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.13), fur);
      head.position.set(0, 0.26, 0.18);
      const earG = new THREE.BoxGeometry(0.035, 0.06, 0.02);
      const e1 = new THREE.Mesh(earG, fur); e1.position.set(-0.045, 0.34, 0.16);
      const e2 = new THREE.Mesh(earG, fur); e2.position.set(0.045, 0.34, 0.16);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.12), fur);
      tail.position.set(0, 0.22, -0.18); tail.rotation.x = -0.6;
      const legG = new THREE.BoxGeometry(0.035, 0.10, 0.035);
      for (const [lx, lz] of [[-0.05, 0.10], [0.05, 0.10], [-0.05, -0.10], [0.05, -0.10]]) {
        const leg = new THREE.Mesh(legG, fur); leg.position.set(lx, 0.05, lz); d.add(leg);
      }
      d.add(body, head, e1, e2, tail);
      // parked ahead-left of the walker, fanned out if there are several
      d.position.set(0.35 + i * 0.28, 0, 0.55 + (i % 2) * 0.25);
      // the leash: a straight line from hand-height to the dog's collar
      const leash = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0.15, 0.75, 0.1),
          new THREE.Vector3(d.position.x, 0.30, d.position.z + 0.15)]),
        new THREE.LineBasicMaterial({ color: 0x804a2f }));
      attachAtFeet(npc, d);
      attachAtFeet(npc, leash);
      npc.dogs.push({ mesh: d, tail, phase: N.rand() * 7 });
    }
  },
  coffee(npc) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.032, 0.11, 8), propMat(0xf5f2ea));
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.02, 8), propMat(0x5d4a3a));
    lid.position.y = 0.065;
    cup.add(lid);
    attach(npc, 'arm-right', cup, [0, -0.30, 0.04], [0, 0, 0]);
  },
  glasses(npc) { npc.packProps.push('aid-glasses'); },
  sunglasses(npc) { npc.packProps.push('aid-sunglasses'); },
};

// Glue a prop onto a bone (bones inherit the animation, so a cup in the
// hand swings with the arm). Prop sizes and offsets above are in real
// METERS — but a bone's children live in the character's own tiny chibi
// units, so we counter-divide by the group's scale factor here.
// The characters are CHUNKY chibis — the body is a full meter wide, the
// head wider still. Real-meter props look like doll accessories on them,
// so handheld props get scaled up by this factor to read at a glance.
const CHIBI = 1.7;

function attach(npc, boneName, obj, pos, rot) {
  const bone = npc.group.getObjectByName(boneName);
  if (!bone) return;
  const k = CHIBI / npc.groupScale;
  obj.scale.multiplyScalar(k);
  obj.position.fromArray(pos).multiplyScalar(k);
  if (rot) obj.rotation.set(rot[0], rot[1], rot[2]);
  obj.traverse((o) => { o.frustumCulled = false; }); // see buildNPC note
  bone.add(obj);
}

// Head props (hats, helmets) are sized in the character's OWN units
// instead, because they must wrap that huge head exactly (the head-mesh
// spans ±0.23 wide, up to 0.28 above the head bone, in every character).
function attachHead(npc, obj, pos, rot) {
  const bone = npc.group.getObjectByName('head');
  if (!bone) return;
  obj.position.fromArray(pos);
  if (rot) obj.rotation.set(rot[0], rot[1], rot[2]);
  obj.traverse((o) => { o.frustumCulled = false; });
  bone.add(obj);
}

// Same correction for props parked at the NPC's feet (bike, dogs) —
// they're children of the scaled group, not of a bone.
function attachAtFeet(npc, obj) {
  const k = 1 / npc.groupScale;
  obj.scale.multiplyScalar(k);
  obj.position.multiplyScalar(k);
  obj.traverse((o) => { o.frustumCulled = false; }); // see buildNPC note
  npc.group.add(obj);
}

// ------------------------------------------------------------
// Sidewalk paths from the live map tiles
// ------------------------------------------------------------
// People walk streets, not freeways: no motorway/trunk, no ramps, no
// tunnel corridors. But EVERY drivable road counts for "stay out of the
// roadway" (N.segs) — including the ones we'd never walk along.
const WALKABLE = new Set(['primary', 'secondary', 'tertiary', 'minor', 'street', 'residential', 'service']);
const DRIVABLE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'minor', 'street', 'residential', 'service', 'motorway_link', 'trunk_link', 'primary_link']);

// A road's real half-width from the lane tables — the same math the
// tree-culler and the painted lane markings use, so all three agree.
function roadHalfWidth(props) {
  const li = LANES.BY_CLASS[props.class] || [1, 1];
  const lanes2 = props.ramp === 1 ? LANES.RAMP_LANES : (props.oneway === 1 ? li[0] : li[1] * 2);
  return (lanes2 * LANES.LANE_WIDTH_M) / 2 + LANES.SHOULDER_M;
}

function refreshPaths(nowMs) {
  const car = ctx.getCar();
  const moved = N.refLng === null ? Infinity
    : ctx.metersBetween(car.lng, car.lat, N.refLng, N.refLat);
  if (nowMs - N.lastPathRefresh < 2500 && moved < 250) return;
  const sourceId = ctx.getSourceId();
  if (!sourceId) return;
  N.lastPathRefresh = nowMs; N.refLng = car.lng; N.refLat = car.lat;

  const feats = ctx.getMap().querySourceFeatures(sourceId, { sourceLayer: 'transportation' });
  const paths = [], segs = [];
  for (const f of feats) {
    const p = f.properties;
    if (!DRIVABLE.has(p.class)) continue;
    const halfW = roadHalfWidth(p);
    const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates]
      : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
    for (const pts of lines) {
      if (pts.length < 2) continue;
      if (!pts.some((q) => ctx.metersBetween(q[0], q[1], car.lng, car.lat) < NPCS.DESPAWN_M + 200)) continue;
      // every drivable road joins the "roadway — keep out" segment list
      let prev = null;
      for (const pt of pts) {
        const sp = ctx.toScene(pt[0], pt[1], 0);
        if (prev) segs.push({ ax: prev.x, az: prev.z, bx: sp.x, bz: sp.z, halfW });
        prev = sp;
      }
      // only pleasant streets become walking routes
      if (WALKABLE.has(p.class) && p.ramp !== 1 && p.brunnel !== 'tunnel') {
        paths.push({ pts, halfW });
      }
    }
    if (segs.length > 4000) break; // plenty; keep the refresh cheap
  }
  if (paths.length) { N.paths = paths; N.segs = segs; }
}

// Is this scene-space point inside ANY roadway (with a safety margin)?
function inRoadway(x, z, margin) {
  for (const s of N.segs) {
    const abx = s.bx - s.ax, abz = s.bz - s.az;
    const len2 = abx * abx + abz * abz;
    let t = len2 > 0 ? ((x - s.ax) * abx + (z - s.az) * abz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const dx = x - (s.ax + abx * t), dz = z - (s.az + abz * t);
    const keep = s.halfW + margin;
    if (dx * dx + dz * dz < keep * keep) return true;
  }
  return false;
}

// ------------------------------------------------------------
// Spawning
// ------------------------------------------------------------
// Where is an NPC along its road, in the real world? Walk the polyline
// to (seg, segT), then step sideways past the road edge.
function pathPoint(npc, out) {
  const a = npc.path.pts[npc.seg], b = npc.path.pts[npc.seg + 1];
  const lng = a[0] + (b[0] - a[0]) * npc.segT;
  const lat = a[1] + (b[1] - a[1]) * npc.segT;
  // unit vector along the road, in meters
  const dxm = (b[0] - a[0]) * Math.cos(lat * DEG), dym = b[1] - a[1];
  const L = Math.hypot(dxm, dym) || 1e-9;
  const ux = dxm / L, uy = dym / L;
  // sideways = rotate the along-vector 90°; which side is npc.side
  const off = npc.offset * npc.side;
  out.lng = lng + (-uy * off) / (METERS_PER_DEG_LAT * Math.cos(lat * DEG));
  out.lat = lat + (ux * off) / METERS_PER_DEG_LAT;
  out.heading = Math.atan2(ux, uy); // compass radians of the road direction
  return out;
}

const scratch = { lng: 0, lat: 0, heading: 0 };
const scratch2 = { lng: 0, lat: 0, heading: 0 }; // for lookahead probes

// Walk `meters` along the polyline (in walker.dir), bouncing at the ends.
// Mutates walker's {seg, segT, dir} — pass a copy for what-if lookahead.
function advanceAlongPath(walker, meters) {
  let remaining = meters;
  while (remaining > 0) {
    const a = walker.path.pts[walker.seg], b = walker.path.pts[walker.seg + 1];
    const segLen = ctx.metersBetween(a[0], a[1], b[0], b[1]) || 0.001;
    if (walker.dir > 0) {
      const toEnd = segLen * (1 - walker.segT);
      if (remaining < toEnd) { walker.segT += remaining / segLen; remaining = 0; }
      else if (walker.seg < walker.path.pts.length - 2) { remaining -= toEnd; walker.seg++; walker.segT = 0; }
      else { walker.segT = 1; walker.dir = -1; remaining = 0; }
    } else {
      const toStart = segLen * walker.segT;
      if (remaining < toStart) { walker.segT -= remaining / segLen; remaining = 0; }
      else if (walker.seg > 0) { remaining -= toStart; walker.seg--; walker.segT = 1; }
      else { walker.segT = 0; walker.dir = 1; remaining = 0; }
    }
  }
}

function trySpawnOne(nowMs) {
  if (!N.paths.length) return false;
  const car = ctx.getCar();
  const path = N.paths[Math.floor(N.rand() * N.paths.length)];
  const seg = Math.floor(N.rand() * (path.pts.length - 1));
  const offset = path.halfW + NPCS.SIDEWALK_M * (0.6 + N.rand() * 0.9);
  const npc = {
    path, seg, segT: N.rand(), side: N.rand() < 0.5 ? -1 : 1,
    offset, baseOffset: offset,
    dir: N.rand() < 0.5 ? -1 : 1,
  };
  pathPoint(npc, scratch);

  const dCar = ctx.metersBetween(scratch.lng, scratch.lat, car.lng, car.lat);
  if (dCar < NPCS.SPAWN_MIN_M || dCar > NPCS.SPAWN_RADIUS_M) return false;
  // never inside a building, never underwater/beach-wet
  if (ctx.buildingHeightAt(scratch.lng, scratch.lat) > 0) return false;
  if (ctx.groundAt(scratch.lng, scratch.lat, 0) < -0.5) return false;
  // never in ANY roadway (a sidewalk spot can still fall inside a nearby
  // crossing street — same trap the trees fell into)
  const sp = ctx.toScene(scratch.lng, scratch.lat, 0);
  if (inRoadway(sp.x, sp.z, 0.4)) return false;

  const district = districtAt(scratch.lng, scratch.lat);
  const arch = rollArchetype(district);
  npc.district = district; // kept for debugging (game.npcs.npcs[i].district)
  buildNPC(npc, arch, nowMs);
  return true;
}

// Dress and rig one NPC. Everything visual happens here.
function buildNPC(npc, arch, nowMs) {
  const charName = N.charNames[Math.floor(N.rand() * N.charNames.length)];
  const char = N.chars[charName];

  // Clone shares geometry & bones structure; the skeleton is per-clone so
  // each NPC animates independently.
  const group = cloneSkeleton(char.template);
  group.traverse((o) => {
    if (o.isSkinnedMesh) {
      o.geometry = archetypeGeometry(charName, o.name, arch);
      o.material = npcMaterial;
    }
    // skinned bounds lag the pose, and bone-attached props inherit
    // animated matrices the culler doesn't track — never cull NPC parts
    o.frustumCulled = false;
  });
  npc.groupScale = NPCS.HEIGHT_M / char.rawHeight;
  group.scale.setScalar(npc.groupScale);

  npc.group = group;
  npc.arch = arch;
  npc.char = charName;
  npc.packProps = [];
  npc.speed = NPCS.WALK_SPEED * (0.85 + N.rand() * 0.3) * (arch.wobble ? 0.7 : 1);
  npc.state = 'walk';
  npc.stateUntil = nowMs + 3000 + N.rand() * 6000;
  npc.reactCooldown = 0;
  npc.checkAt = nowMs + N.rand() * 600;
  npc.phase = N.rand() * 10;

  // animation: every character carries the same 32 clips
  npc.mixer = new THREE.AnimationMixer(group);
  npc.actions = {};
  for (const name of ['idle', 'walk', 'emote-yes', 'emote-no', 'pick-up', 'interact-right', 'sit',
                      'holding-right', 'holding-left', 'holding-both']) {
    const clip = THREE.AnimationClip.findByName(char.clips, name);
    if (clip) npc.actions[name] = npc.mixer.clipAction(clip);
  }
  npc.actions.walk.timeScale = npc.speed / NPCS.WALK_SPEED * (arch.wobble ? 0.85 : 1);
  npc.actions.walk.play();
  npc.mixer.update(N.rand() * 2); // don't march in lockstep

  for (const p of arch.props || []) PROPS[p] && PROPS[p](npc);
  for (const packName of npc.packProps) {
    const prop = N.packModels[packName];
    if (prop) {
      const inst = prop.clone();
      const bone = group.getObjectByName('head');
      if (bone) { inst.position.set(0, 0.0, 0); bone.add(inst); }
    }
  }

  N.group.add(group);
  N.npcs.push(npc);
}

function despawn(npc) {
  N.group.remove(npc.group);
  npc.mixer.stopAllAction();
  const i = N.npcs.indexOf(npc);
  if (i >= 0) N.npcs.splice(i, 1);
}

// ------------------------------------------------------------
// Per-frame update
// ------------------------------------------------------------
function switchAnim(npc, name, { once = false, fade = 0.25 } = {}) {
  const to = npc.actions[name];
  if (!to || npc.current === name) return;
  const from = npc.actions[npc.current || 'walk'];
  to.reset();
  if (once) { to.setLoop(THREE.LoopOnce); to.clampWhenFinished = true; }
  else to.setLoop(THREE.LoopRepeat);
  to.play();
  if (from && from !== to) from.crossFadeTo(to, fade, false);
  npc.current = name;
}

function updateNPC(npc, dt, nowMs) {
  const car = ctx.getCar();

  // --- state machine ---
  if (npc.state === 'walk') {
    advanceAlongPath(npc, npc.speed * dt);
    if (nowMs > npc.stateUntil) {
      npc.state = 'idle'; npc.stateUntil = nowMs + 1500 + N.rand() * 4000;
      switchAnim(npc, 'idle');
    }
  } else if (npc.state === 'idle') {
    if (nowMs > npc.stateUntil) {
      // sometimes do the archetype's party trick, usually walk on
      if (N.rand() < (npc.arch.id === 'founder' ? 0.6 : 0.3)) {
        npc.state = 'flavor';
        npc.stateUntil = nowMs + 2400;
        const anim = npc.arch.flavor === 'gesticulate'
          ? (N.rand() < 0.5 ? 'emote-yes' : 'emote-no') : npc.arch.flavor;
        switchAnim(npc, anim, { once: true });
      } else {
        npc.state = 'walk'; npc.stateUntil = nowMs + 4000 + N.rand() * 8000;
        switchAnim(npc, 'walk');
      }
    }
  } else if (npc.state === 'flavor') {
    if (nowMs > npc.stateUntil) {
      npc.state = 'walk'; npc.stateUntil = nowMs + 4000 + N.rand() * 8000;
      switchAnim(npc, 'walk');
    }
  } else if (npc.state === 'react') {
    if (nowMs > npc.stateUntil) {
      npc.state = 'walk'; npc.stateUntil = nowMs + 4000 + N.rand() * 8000;
      npc.reactCooldown = nowMs + 4000;
      switchAnim(npc, 'walk');
    }
  }

  // --- place in the world ---
  pathPoint(npc, scratch);
  const deckH = ctx.bridgeDeckHeightAt(scratch.lng, scratch.lat);
  const r3H = deckH === null ? ctx.road3DHeightAt(scratch.lng, scratch.lat) : null;
  const y = deckH !== null ? deckH : r3H !== null ? r3H
    : Math.max(0, ctx.groundAt(scratch.lng, scratch.lat, 0));
  const p = ctx.toScene(scratch.lng, scratch.lat, y);
  npc.group.position.copy(p);
  npc.y = y;

  // face along the walk (or square up to whatever you're reacting to)
  let face = npc.dir > 0 ? scratch.heading : scratch.heading + Math.PI;
  if (npc.state === 'react' && npc.faceScene) {
    face = Math.atan2(npc.faceScene.x - p.x, -(npc.faceScene.z - p.z));
  }
  npc.group.rotation.y = -face + Math.PI; // model faces +Z; compass → scene yaw
  if (npc.arch.wobble) npc.group.rotation.z = Math.sin(nowMs / 450 + npc.phase) * 0.06;

  // --- staggered safety checks (every ~0.5 s, not every frame) ---
  if (nowMs > npc.checkAt) {
    npc.checkAt = nowMs + 500;
    // Hard rule: an NPC may NEVER stand in a roadway. If one slipped in
    // anyway (usually: spawned before a crossing road's tile streamed
    // in), recycle it — better a quiet respawn than a road-blocker.
    if (inRoadway(p.x, p.z, 0)) { npc.dead = true; return 0; }
    if (npc.state === 'walk') {
      // LOOK AHEAD: if the spot we'll reach in ~1.5 s is inside any
      // roadway (a crossing street, say), turn around BEFORE stepping in.
      const probe = { path: npc.path, seg: npc.seg, segT: npc.segT, dir: npc.dir,
                      side: npc.side, offset: npc.offset };
      advanceAlongPath(probe, npc.speed * 1.5);
      pathPoint(probe, scratch2);
      const ahead = ctx.toScene(scratch2.lng, scratch2.lat, 0);
      if (inRoadway(ahead.x, ahead.z, 0.3)) npc.dir *= -1;
      // walked into a building footprint (bad data)? Turn around.
      else if (ctx.buildingHeightAt(scratch.lng, scratch.lat) > 0) npc.dir *= -1;
    }
    // vehicle scare: the player (or any traffic car) barreling past
    if (npc.state !== 'react' && nowMs > npc.reactCooldown) {
      for (const v of ctx.getVehicles()) {
        const dx = v.x - p.x, dz = v.z - p.z, dy = (v.y ?? p.y) - p.y;
        if (dx * dx + dz * dz < NPCS.REACT_RADIUS_M ** 2 && Math.abs(dy) < 6 && v.speed > NPCS.REACT_SPEED) {
          npc.state = 'react';
          npc.stateUntil = nowMs + 1400;
          npc.faceScene = { x: v.x, z: v.z };
          // step back: shuffle a bit further from the road edge
          npc.offset += 0.7;
          // wag a finger or point — the classic startled pedestrian
          switchAnim(npc, N.rand() < 0.5 ? 'emote-no' : 'interact-right', { once: true, fade: 0.12 });
          break;
        }
      }
    } else if (npc.state !== 'react' && npc.offset > npc.baseOffset) {
      npc.offset = Math.max(npc.baseOffset, npc.offset - 0.35); // drift back
    }
  }

  // --- props with a life of their own ---
  if (npc.dogs) {
    for (const d of npc.dogs) {
      const wag = Math.sin(nowMs / 90 + d.phase);
      d.tail.rotation.z = wag * 0.5;
      d.mesh.position.y = npc.state === 'walk' ? Math.abs(Math.sin(nowMs / 130 + d.phase)) * 0.06 : 0;
    }
  }
  if (npc.bikeWheels && npc.state === 'walk') {
    for (const w of npc.bikeWheels) w.rotation.x += (npc.speed / 0.2) * dt; // v = ωr
  }

  // --- animation, with a distance discount ---
  const dCar = ctx.metersBetween(scratch.lng, scratch.lat, car.lng, car.lat);
  npc.distToCar = dCar;
  if (dCar < NPCS.ANIM_FREEZE_M || (N.frame + (npc.phase | 0)) % 4 === 0) {
    npc.mixer.update(dCar < NPCS.ANIM_FREEZE_M ? dt : dt * 4);
  }
  return dCar;
}

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------
export async function initNPCs(context) {
  ctx = context;
  N.group = new THREE.Group();

  // Shot mode? (?npcshot=1 → deterministic archetype lineup for captures)
  const q = new URLSearchParams(window.location.search);
  if (q.has('npcshot')) {
    // ?npcshot=<archetype id> shoots 6 characters of one archetype;
    // anything else (?npcshot=1) lines up all 8 archetypes.
    const want = q.get('npcshot');
    N.shot = { arch: NPC_ARCHETYPES.some((a) => a.id === want) ? want : 'lineup' };
    // seeded random → the same lineup every run
    let s = 1234567;
    N.rand = () => ((s = Math.imul(s ^ (s >>> 15), s | 1) ^ s, (s >>> 16) & 0xffff) / 0x10000);
  }

  // Load the baked recolor data + every character + the two pack props.
  const loader = new GLTFLoader();
  const loadGLB = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));
  const dataP = fetch('assets/npcs/npc-data.json').then((r) => r.json());

  const charNames = [
    'character-female-a', 'character-female-b', 'character-female-c',
    'character-female-d', 'character-female-e', 'character-female-f',
    'character-male-a', 'character-male-b', 'character-male-c',
    'character-male-d', 'character-male-e', 'character-male-f'];
  const [data, ...gltfs] = await Promise.all([
    dataP,
    ...charNames.map((c) => loadGLB(`assets/npcs/glb/${c}.glb`)),
    loadGLB('assets/npcs/glb/aid-glasses.glb'),
    loadGLB('assets/npcs/glb/aid-sunglasses.glb'),
  ]);

  N.charNames = charNames;
  N.chars = {};
  const bbox = new THREE.Box3();
  charNames.forEach((name, i) => {
    const gltf = gltfs[i];
    const baseGeom = {}, baked = {};
    gltf.scene.traverse((o) => {
      if (o.isSkinnedMesh) {
        baseGeom[o.name] = o.geometry;
        const m = data.chars[name][o.name];
        baked[o.name] = {
          roles: b64ToBytes(m.roles), rgb: b64ToBytes(m.rgb),
          meanLum: { 1: m.meanLum[1], 2: m.meanLum[2], 3: m.meanLum[3] },
        };
      }
    });
    bbox.setFromObject(gltf.scene);
    N.chars[name] = {
      template: gltf.scene, clips: gltf.animations, baseGeom, baked,
      rawHeight: bbox.max.y - bbox.min.y,
    };
  });
  // pack props: strip their materials down to Lambert so they match
  N.packModels = {};
  ['aid-glasses', 'aid-sunglasses'].forEach((nm, i) => {
    const scene = gltfs[charNames.length + i].scene;
    scene.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshLambertMaterial({ color: 0x24262b }); });
    N.packModels[nm] = scene;
  });

  if (N.shot) buildShotLineup();
  N.inRoadway = inRoadway; // exposed for the acceptance tests
  window.game && (window.game.npcs = N); // console peek
  return N.group;
}

// A deterministic photo call: all 8 archetypes (or one, many characters)
// standing in a row near the shot camera, mid-stride, frozen.
function buildShotLineup() {
  const car = ctx.getCar();
  const list = N.shot.arch === 'lineup'
    ? NPC_ARCHETYPES
    : NPC_ARCHETYPES.filter((a) => a.id === N.shot.arch);
  const across = list.length === 1 ? 6 : list.length; // one archetype → 6 characters
  for (let i = 0; i < across; i++) {
    const arch = list.length === 1 ? list[0] : list[i];
    // a row abreast, 2.2 m apart, ~10 m ahead of the camera position
    const aheadM = 12, sideM = (i - (across - 1) / 2) * 2.2;
    const hx = Math.sin(car.heading), hy = Math.cos(car.heading);
    const lng = car.lng + ((hx * aheadM + hy * sideM) / (METERS_PER_DEG_LAT * Math.cos(car.lat * DEG)));
    const lat = car.lat + ((hy * aheadM - hx * sideM) / METERS_PER_DEG_LAT);
    const npc = {
      path: { pts: [[lng, lat], [lng, lat + 0.0001]], halfW: 0 },
      seg: 0, segT: 0, side: 1, offset: 0, dir: 1,
    };
    buildNPC(npc, arch, 0);
    npc.shotLngLat = [lng, lat];
    // face the camera (walkers face -yaw+π, so facing heading+π is plain
    // -heading), turned ~30° so side-carried props (bike, board) show
    npc.shotYaw = -car.heading + 0.5;
    npc.frozen = true;
    // photo pose: hand-prop archetypes hold their prop out; others stride
    const pose = { techie: 'holding-both', hippie: 'holding-right',
      winetourist: 'holding-right', founder: 'holding-right',
      marinadad: 'holding-right' }[arch.id];
    if (pose && npc.actions[pose]) {
      npc.actions.walk.stop();
      npc.actions[pose].play();
    }
    npc.mixer.setTime(0.45); // mid-stride (or settled into the hold)
  }
  window.__npcShotCount = N.npcs.length;
}

export function updateNPCs(dt, nowMs) {
  if (!N.chars || !NPCS.ENABLED) return;
  N.frame++;
  if (N.shot) { // lineup stays frozen for pixel-stable captures — but we
    // re-pin positions every frame: terrain height streams in AFTER load,
    // and a one-time placement would leave everyone buried or floating.
    for (const npc of N.npcs) {
      const [lng, lat] = npc.shotLngLat;
      npc.group.position.copy(ctx.toScene(lng, lat, Math.max(0, ctx.groundAt(lng, lat, 0))));
      npc.group.rotation.y = npc.shotYaw;
      if (npc.dogs) for (const d of npc.dogs) d.tail.rotation.z = 0.3;
    }
    return;
  }
  refreshPaths(nowMs);

  const target = Math.round((ctx.gfx().npcMax || 0) * NPCS.DENSITY);
  // spawn gently (a couple per frame) so a quality change doesn't hitch
  let attempts = 0;
  while (N.npcs.length < target && attempts < 6) { trySpawnOne(nowMs); attempts++; }

  for (let i = N.npcs.length - 1; i >= 0; i--) {
    const npc = N.npcs[i];
    if (N.npcs.length > target) { despawn(npc); continue; } // density dial turned down
    const d = updateNPC(npc, dt, nowMs);
    if (npc.dead || d > NPCS.DESPAWN_M) despawn(npc); // recycled next frame
  }
  window.__npcCount = N.npcs.length;
}
