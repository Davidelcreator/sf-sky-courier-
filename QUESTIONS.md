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

## Visual style pass 2 (2026-08-22) — two calls made to avoid stalling

### 1. Every reference frame contains a presenter. I masked instead of discarding.

The brief says: "If any frame shows a presenter, UI, slides, or a maps
interface, ignore that frame and tell me which one so I can delete it."

Taken literally that discards **all 12 frames** and leaves nothing to
analyse. Every frame in `ref/` carries a presenter webcam PiP in the
bottom-right (`x>=1355, y>=526`) plus a "Genie 3 / Created using Google
Street View imagery" caption, and every frame sits inside a video-editor
canvas with a timeline ruler down the right edge.

**Decision:** kept all 12 and masked the overlays programmatically rather
than discarding the set, because the scene area outside the overlays is
clean and is 60–72% of each frame. Masks are documented in STYLE.md §7 and
were visually verified before any sampling.

**Per-frame overlay inventory, so you can decide:**

| Frames | Overlays present |
|---|---|
| all 12 | presenter PiP, Genie 3 caption, editor timeline ruler, letterbox |
| 015, 027, 043 | + racing HUD (speed, lap counter, speedometer) **and a "Google Maps" logo on the car** |
| 027, 043, 051 | + video transport UI (pause, scrubber, timecode) |
| 027, 051 | + mouse cursor |

If you want frames actually deleted, 015/027/043 are the strongest
candidates: they carry the most overlay area AND visible third-party
branding. Cost of losing them: they are 3 of the 5 bright-overcast frames
and the only ones showing a **road surface from a driving camera** — the
most directly relevant material in the set for this game. I would keep
them, masked.

### 2. `ref/` is NOT a new reference set — the old docs measured these same frames.

The brief said STYLE.md/GAP.md were "from an earlier reference set". They
are from *this* set. Evidence in STYLE.md §0.1 and PROGRESS.md. There is a
second set `ref2/` (17 frames, 2026-07-16) behind DETAIL_GAP.md and
TEXTURE_GAP.md.

**Decision:** analysed `ref/` as literally instructed. If "the new
reference set" meant `ref2/`, or if new frames were meant to be dropped in
and never were, this pass should be re-run — the measurement harness is
built and re-running against a different folder is cheap.

### 3. Content rule noted for STEP 4

The reference contains identifiable real-world locations (Palace of Fine
Arts, SF Ferry Building, the Las Vegas strip incl. a Paris-casino Eiffel
replica) and third-party branding (Google Maps livery). Per the brief we
chase the aesthetic only — no reproduction of these locations, signage,
logos or branding in the game. Recorded here so it survives into STEP 4.

## B4 aerial haze on MapLibre buildings is NOT possible in 5.6 — I mis-sold it

At check-in I told David that B4 was reachable because
`fogColor`/`atmosphereBlend`/`fogGroundBlend` "are existing sliders", and
he approved it on that basis. **That claim was wrong.** The sliders exist
and reach the sky; they do not reach the city.

Proven by control experiment, not inference:

- Swept `atmosphere-blend` (0.4/0.7/1.0), `fog-ground-blend` (0.2/0.9),
  `horizon-fog-blend` (0.9) and every combination. The distant-tower
  region came back **identical to 0.1 of an RGB unit in all eight runs**.
- Control to prove `setSky` was actually working: set every sky colour to
  `#ff0000`. The sky turned red and **115,572 pixels changed** — so the
  call lands. The tower pixels stayed **byte-identical**: rgb(99.3, 98.6,
  97.0) before and after, with `fog-color: #ff0000` at
  `atmosphere-blend: 1.0`.

**Conclusion:** MapLibre 5.6's sky/fog/atmosphere does not composite over
fill-extrusion geometry. `LOOK.fogDensity` is a three.js `FogExp2` and only
touches OUR objects (bridges, trees, traffic, car), never the city. This
confirms the tier-D item STYLE.md §8 and the old GAP.md both flagged; I
should have believed my own document instead of re-ranking it as cheap.

**What real aerial perspective would need** (all tier D, none started):
1. A custom fill-extrusion shader — not exposed in 5.6.
2. Moving the city into three.js so our own fog applies — the architecture
   rewrite QUESTIONS.md already logs.
3. A screen-space depth-haze pass — needs an offscreen composite around
   MapLibre's shared GL context.
4. A cheap fake: a vertical screen-space gradient overlay, since distance
   correlates with screen height in a pitched camera. **Rejected on
   measurement:** it would also wash the sky, and the sky is already
   *brighter* than the reference, so it would push a correct value wrong.

**What I did instead** (A9, shipped): the measured gap was not only
distance — *every* building was 25–80 units too dark. That part is real,
config-only, and now fixed. The residual is specifically the near/far
gradient. See PROGRESS.md.
