# ROADS.md — road-network audit and plan (Phase 1)

## Data source / format / coverage
- Vector tiles: OpenFreeMap "liberty" style → **OpenMapTiles schema**,
  source `openmaptiles`, source-layer **`transportation`**. Whole-world
  coverage; at runtime only tiles loaded around the camera are queryable
  (`querySourceFeatures` — same pattern the collision/building cache uses).
- Elevation: Mapzen terrarium raster-DEM (terrain), real bathymetry kept.

## What the tiles actually carry (measured live at the GG approach)
`tools/roads_audit.js` at (-122.4753, 37.8065), 640 features loaded:
- **`brunnel`**: `bridge` ×67, `tunnel` ×16 — bridge/tunnel tagging IS present.
- **`ramp`**: `1` ×56 — link/ramp ways ARE present (OMT folds `highway=*_link`
  into `class=motorway|trunk|…` + `ramp=1`).
- **`layer`**: 1 ×64, 2 ×1, −1 ×18 — vertical layering present.
- Plus `class`, `subclass`, `oneway`, `toll`, `surface`, `access`, `service`.
- **Nothing is filtered at import** — the data is all there; the game just
  ignores it.

## What the world-builder currently does with these tags
- Roads are only MapLibre **flat line layers draped on the terrain**. Our
  init even *removes* every style layer with `bridge` in its id (they used
  to float over water under the hand-built decks). `tunnel_*` line layers
  still render — as surface-level dashed styling. No 3D, no physics.
- Physics floor = terrain (`groundAt`) + the SIX hand-built `BRIDGES`
  decks (`bridgeDeckHeightAt`). Traffic clamps to the same two.
- `brunnel` / `ramp` / `layer` are used **nowhere**. So: no ramps, no
  overpasses, no tunnels, anywhere except the 6 hand-modelled bridges.

## Golden Gate approach — why the deck is unreachable
- The hand-built GG deck's south end is the config point
  `[-122.4771673, 37.8078108, 65]` — that coordinate charts at the
  **waterline below Fort Point**, not the toll plaza. The deck slab
  terminates there, 65 m in mid-air over the strait (screenshot
  `shots/gg_baseline.png` — the deck visibly ends in a cliff above water).
- The real approach (US-101 through the toll plaza, plus its `ramp=1`
  ways, plus Doyle Drive's `brunnel=tunnel, layer=-1` ways) exists in the
  tiles at ground level but has no 3D/physics representation, and nothing
  connects it to the floating deck end.
- Baseline scripted drive (`tools/drive.js`, waypoints plaza → deck):
  **FAIL — timeout, car never got past the plaza** (and the deck end it
  was heading for floats offshore). Log: `shots/gg_baseline.json`.

## Plan (phases 2–4) — data-driven ROAD3D system
1. **Cache** (refresh ~2.5 s / 400 m, like the building cache): query
   `transportation`, keep drivable classes where `brunnel∈{bridge,tunnel}`
   or `ramp=1`; skip segments within ~30 m of hand-built decks
   (`bridgeDeckHeightAt`) so the six bridges aren't double-built.
2. **Heights via a node graph**: endpoints keyed on rounded coords
   (~1 m). Node lift = `LIFT_PER_LAYER × layer` of the bridge/tunnel ways
   at that node (missing `layer` → +1 bridge / −1 tunnel, logged
   fallback); pure-ground nodes = 0. A way's endpoint lifts come from its
   nodes, interior gets its own full lift, tapered over `min(len/3,
   TAPER_M)` — so an overpass rises from its junctions instead of
   cliffing, and a `ramp=1` way interpolates end-to-end = a real ramp.
   Grade capped ~9% by extending the taper (logged when it engages).
3. **Geometry**: ribbon meshes (width by class: motorway/trunk 9 m,
   primary 8, secondary 7, links 5.5 — defaults, logged), asphalt
   material matching the bridge decks; instanced pillars every ~40 m
   where lift > 4 m. Tunnels render as a *surface-level styled corridor*
   (dark ribbon + portal frames): true underground is architecturally out
   — MapLibre's raster-DEM terrain cannot be clipped/holed, so a car
   below ground would be invisible behind opaque terrain (tradeoff
   documented in QUESTIONS.md).
4. **Physics**: `road3DHeightAt(lng,lat)` mirroring `bridgeDeckHeightAt`
   over the dynamic cache, merged into the floor clamp + traffic height.
5. **Golden Gate fix**: move the deck's south ground point onto the real
   toll plaza and add an intermediate point so the approach grade stays
   reasonable; verify the north end the same way.
6. **Tuning**: every constant in a `ROADS3D` config block + P-panel
   sliders (lift per layer, taper, widths, pillar spacing).

Acceptance: scripted `tools/drive.js` runs — GG surface→deck PASS with
telemetry + screenshots; 3 more overpasses (Phase 3); one tunnel corridor
portal-to-portal (Phase 4). FPS A/B against the roads-start worktree
after each commit.
