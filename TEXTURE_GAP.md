# TEXTURE_GAP.md — game surfaces vs ref2/ (X-video reference)

Reference: 43 kept frames in `ref2/` — `ferry_*` (Ferry Building arcade +
plaza), `palace_*` (Palace of Fine Arts rotunda + colonnade), `misc_*`
(Embarcadero street, multi-lane racing shots, paths, asphalt).
Game baselines: `shots/tex_ferry_before.png`, `shots/tex_palace_before.png`.

## Ranked gaps (visual-impact-per-FPS-cost)

1. **Landmarks wear office clothes** (zero cost — paint/filters only).
   - Ferry Building renders as a generic gray slab + square office
     windows; reference: warm cream sandstone arcade, arched openings,
     gray roof, clock tower.
   - Palace of Fine Arts rotunda renders as an APARTMENT TOWER — our
     window-grid layer stamps office windows on a classical monument,
     and the height tint paints it concrete-gray. Reference: warm buff
     stone, colonnade, no windows.
   - Fix: a LANDMARKS config (center + radius + color + windows on/off)
     that discovers each landmark's building ids at runtime (same
     mechanism as the Golden Gate tower recolour), recolors them, and
     EXCLUDES them from the window-pattern layer. Ferry gets an
     arch-shaped pattern variant instead; Palace gets none.

2. **Asphalt is untextured flat gray** on ROADS3D ribbons + hand decks;
   reference asphalt has tonal noise, tire-wear tracks, distinct lane
   paint. → Implemented TOGETHER WITH Task 2 (lanes): one code-generated
   asphalt texture that carries the lane markings, tiled along the road.
   (One texture, two tasks.)

3. **Facade monotony**: every building shares ONE window pattern.
   Reference facades vary (window size/spacing/floor height). Fix: 2–3
   generated pattern variants assigned per tint bucket via a match
   expression — zero geometry, one more addImage each.

4. Sidewalk/curb distinction (logged, skipped): sidewalks come from the
   satellite imagery in the shipping basemap; a 3D curb line would be
   new geometry everywhere for marginal read at chase height. Noted as a
   possible later pass; not attempted (geometry stop-line adjacent).

## Landmark palette (sampled from ref2 frames)
- Ferry facade: warm cream sandstone ≈ #cdc3ae (lit) / #a99f8c (shade);
  roof gray ≈ #8e8e8a; arch shadow ≈ #6f6758.
- Palace stone: warm buff ≈ #b9a88f, weathered darker base ≈ #8f8272;
  rotunda dome darker ≈ #7f7668.
