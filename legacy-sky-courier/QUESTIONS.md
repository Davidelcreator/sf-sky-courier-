# QUESTIONS.md — decisions taken instead of stalling (road network job)

## Tunnels are surface-level styled corridors, not true underground
True underground is architecturally out of reach in this engine: the
terrain is MapLibre raster-DEM — an opaque heightfield that cannot be
clipped, holed or made locally transparent from a custom layer. A car
below the surface would simply disappear behind terrain (and the
contract's cut-and-cover trench has the same problem: the trench floor
would render below the opaque heightfield).

**Chosen alternative:** tunnel ways render as a dark asphalt corridor AT
surface height with portal frames at each real entrance (where the
tunnel way meets ground in the data). Physics drives it portal to portal
exactly like the real alignment; the "underground" is stylistic rather
than geometric. Cost: zero; honesty: the car visibly drives over the
hill instead of through it. Revisit if the engine ever moves terrain
into three.js.

## Other logged decisions
- Golden Gate towers no longer collide (their OSM footprint spans the
  whole deck; the real road passes between the legs). Matches the
  Bay Bridge towers, which were already pass-through.
- Missing `layer` tags default to +1 (bridge) / −1 (tunnel) — every
  occurrence is counted at runtime in `road3D.fallbacks` and printed
  once to the console as `[roads3d fallback]`.
- Ramp ways whose data is too short for their climb exceed the grade cap
  as-built (we log rather than reroute — rerouting would invent geometry
  the data doesn't have).
- Deck ribbons are box strips without lane markings for now — the lane
  stripe is a possible cheap follow-up.

## Textures/lanes/trees job (feature/textures-lanes)
- Landmark GEOMETRY not attempted (stop line): making the Ferry Building's
  arcade truly arched or the Palace rotunda round-with-columns needs new
  meshes — the texture/recolor treatment gets the tone and rhythm only.
  Option logged: hand-model both as glTF assets (would also need import
  approval).
- Bushes are not road-validated yet: their positions aren't retained at
  build time (only matrices). Retaining them costs a small array; do it
  if bushes-in-roads gets reported.
- Traffic still drives road centrelines rather than a specific lane.

## NPC job (feature/npcs)
- **Downtown archetype ratio runs ~50/50** techie/founder where the
  weights (8 vs 3) predict ~73/27. Berkeley comes out exactly right
  (24/24 hippies), the weights load correctly, and the roll code reads
  textbook-correct — so something subtle in spawn churn is flattening the
  ratio. Cosmetic (the district joke still lands); left as an open
  investigation.
- **character-male-b can't take a top recolor**: his jacket is painted in
  flesh-family palette colors, and the baker protects everything
  flesh-toned so bare arms/legs never get painted over. He keeps his
  authored tan outfit in every archetype (props still apply). Cutting him
  from the pool was rejected — the cast must stay uniform across
  archetypes. Fix would be a per-character exception table in
  tools/npc_bake.js.
- **Hand props swing with the walk animation** (attached to hand bones).
  Looks natural for phone/glass/cup; the hippie's sign dips a bit low
  mid-stride. A 'holding' pose overlay only exists as a full-body clip in
  the pack, so blending it over the walk means masked animation work —
  not attempted this round.
- **Surfboard rides at a fixed offset under the arm** (bone-attached but
  not gripped — no finger bones exist). Reads fine at gameplay distance.
- **Wine-country districts aren't in the map's practical play area** —
  the brief's "north bay if in map" resolved to: wine tourists spawn in
  parks, Marina, harbors and Marin. Napa/Sonoma circles could be added
  to DISTRICTS if anyone ever flies 60 km north.
- **NPCs don't avoid each other or lamp posts** (no NPC-NPC collision) —
  v1 scope cut, matches the brief.
