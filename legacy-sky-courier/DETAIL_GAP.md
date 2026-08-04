# DETAIL_GAP.md — buildings & trees vs the reference

Shots: `shots/detail_base.png` (street view, buildings + trees),
`shots/detail_trees.png` (park closeup), `shots/detail_facade.png`
(a facade wall, point-blank). Reference: `ref/frame_088.png` (facade
rhythm), `ref/frame_015.png` (window grids), `ref/frame_111.png` +
`ref/frame_060.png` (trees).

## What's missing — BUILDINGS
Ours are single-color extruded slabs: the point-blank facade shot is a
featureless gray wall. The reference shows, in order of visual weight:
1. **Window/floor rhythm** — every facade reads as a grid of dark window
   punches and floor bands, even hazed at distance.
2. **Material/color variety between buildings** — neighbours differ in
   tone and warmth well beyond our 4 subtle buckets.
3. **Ground floor ≠ upper floors** — arcades/storefronts: a darker,
   busier base band on nearly every street-facing building.
4. **Rooflines** — parapets, cornices, mechanical boxes break the flat
   roof plane. (No cheap MapLibre path — flagged, see stop-lines.)
5. Weathering/dirt — subtle; partially covered by grade+grain already.

## What's missing — TREES
Ours are identical gray-olive lollipops (one icosahedron on a stick);
bushes read as gray rocks. The reference shows:
1. **Silhouette variety** — round, tall-oval, spreading; no two alike.
2. **Multi-lobed canopies** — clumps, not spheres; dark under-canopy,
   lit top — light filters through.
3. **Leaf/tree color variation** — olive family but individual trees
   vary in hue and lightness; ours are near-uniform gray-green (the
   grade flattened them more than intended).
4. Trunk/branch presence — thin but visible; ours is a stub.
5. Ground transition — ok already (terrain-planted, no floaters).

## Ranked plan — visual-impact-per-FPS-cost, cheapest first
All knobs go into LOOK (P-panel sliders). FPS re-measured after each.

1. **Multi-lobe two-tone canopies** (three.js, instanced): each tree =
   2–4 low-poly lobes sharing one transform, lit-top/dark-bottom tones,
   non-uniform lobe scales for silhouette variety. ~+2–3k instanced
   low-poly meshes ≈ negligible GPU. Fixes tree items 1–3 in one shot.
2. **Foliage color richness** (zero cost): widen per-tree hue/light
   spread, slight saturation lift (still olive, reference-bounded);
   bushes darker + squashed so they stop reading as rocks.
3. **Building color variety** (zero cost): 4 → 8 tint buckets with wider
   value/warmth spread in the paint expression.
4. **fill-extrusion-vertical-gradient** (zero cost): confirm/enable —
   darkens extrusion bases, grounds the buildings.
5. **Window-grid facade pattern** (near-zero GPU): generate a small
   window-grid texture in code (canvas → map.addImage) and set
   `fill-extrusion-pattern` so every wall gets window rhythm. KNOWN
   RISK: MapLibre scales patterns by zoom, not metres — window size
   will breathe as the camera zooms between modes. Will test and judge
   honestly; if it looks cheesy in motion, revert.
6. **Storefront base band** (small GPU cost — measure): second
   fill-extrusion layer, same source, clamped to ~4 m height, darker
   color → ground-floor differentiation on every building.

## Stop-lines (ask before)
- Real roofline geometry / rooftop clutter (needs new meshes per
  building — polygon cost + new pipeline).
- Imported tree/building models or image textures from files (new
  assets — the plan above only uses code-generated ones).
- Anything neural-fake Genie does that a rasterizer can't: per-window
  interior parallax, organic facade irregularity, true canopy
  translucency. Flagged, not attempted.

## Baseline FPS
41 fps at the capture camera (see PERF.md — likely an unfocused-window
cap, identical at medium and high; floor set at 40, judged vs
same-session baseline).
