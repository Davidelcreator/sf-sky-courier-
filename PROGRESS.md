# PROGRESS.md — Genie-look iteration log

Baseline: `shots/before.png` (branch feature/genie-look, tag safe-start).
Every step: change → `npm run shot` (launch check + capture) → judge vs
`ref/` frames → commit only if closer. Shots kept in `shots/`.

| # | Change | Shot | Verdict |
|---|---|---|---|
| 1 | Neutral-day sun + sky (LOOK config + P-panel sliders) | step1_sky.png | **closer** — sunset-postcard signature gone; sky now pale blue → gray haze band; towers read neutral gray. Launch check OK. |
| 2 | Global grade: saturate 0.72, contrast 0.94, brightness 1.04 (CSS filter on canvas) | step2_grade.png | **closer** — whole frame loses the vivid-game punch; trees/buildings/imagery muted. Water still too navy (item 3). Launch check OK. |
| 3 | Water: navy → neutral gray sky-mirror (deep #5f6a6d, shallow #9aa4a5, glint 0.35 near-white) | step3_water.png | **closer** — far-water sample now rgb(97,99,100) vs reference river rgb(100,96,94): near-exact. First try was too dark, lightened before committing. Launch check OK. |
| 4 | Aerial haze: THREE.FogExp2 on our objects (density 0.00028, haze-gray) | step4_haze.png, step4_haze_bridge.png | **closer** — long-sightline shot: bridge deck melts into haze, east span a ghost silhouette at 4-5 km (reference behavior). First density 0.00035 obliterated the far shore, eased to 0.00028. Launch check OK. |
| 5 | Building palette: tan/sage/teal/mauve ramps → desaturated gray family | step5_buildings.png | **closer** — city reads as pale concrete/stone like ref 088; bucket variety kept but subtle. Remaining loud items: vivid trees, bright yellow road lines. Launch check OK. |
| 6 | Foliage: HSL(0.29,0.55) greens → olive LOOK knobs (hue .17, sat .30), live retintFoliage() | step6_foliage.png | **closer** — trees stop glowing; olive blends with imagery like ref frames. Launch check OK. |
| 7 | Shadows: length derived from sun elevation (was hard-coded 1.7 = 30° sun), opacity → LOOK.shadowOpacity 0.30 | step7_shadows.png (q=high) | **no visible difference** in the default frame (satellite imagery's baked shadows dominate; ours are deliberately subtle at 0.30) — kept anyway as a correctness alignment: without it the item-1 sun move would leave 30°-length shadows under a 40° sun, and the P-panel sun slider now moves shadows correctly. Launch check OK. |
| 8 | Camera texture: blur 0.3px + seeded grain overlay (opacity 0.25 ≈ ref σ2-3/255) | step8_grain.png | **closer (subtle by design)** — grain measured ±2 luma on flat surfaces, matching reference video noise; crisp game edge softened sub-pixel. First tries (0.05, 0.15) measured too weak. Launch check OK. |

## Wrap-up (all 8 GAP items done)
- Final shots: `shots/before.png` → `shots/after.png` (`compare_final.png` = stacked).
- Normal play mode verified separately: boots with zero page errors, Enter starts,
  grade + grain active (scratch check script, headless).
- FPS: every change is config values, one CSS filter, and a static overlay div —
  no per-frame CPU/GPU work added; no measurable framerate risk.
- NOT attempted (flagged in GAP.md, need explicit go-ahead): real per-pixel fog on
  MapLibre buildings, true soft shadows, glass reflections, motion blur.
- Every knob is in LOOK (config.js); press P in-game for live sliders.
| 9 | Grain animates per-frame during play (static only in shot mode) | step9_graincheck.png | fix for David's report: static grain smeared like a dirty window at high speed. Verified animating in live tab; captures unchanged. Launch check OK. |
| D1 | Trees: multi-lobe canopies (1-4 lobes, LOOK knobs) + height-toned dappling (lit crown, shadowed under) + silhouette variety | step_d1_trees.png | **closer** — clumpy varied silhouettes, visible light-through-canopy toning (took 3 tries: flat two-tone was invisible; height-based toning reads from all angles). FPS 43.3 headless-GPU >= 40 floor. Also added tools/fps.js (headless real-GPU FPS probe). |
| D2 | Foliage richness: wider hue/light variety, sat 0.35; bushes reshaped (detail-1 icosa, squashed) so they stop reading as rocks | step_d2_foliage.png | **closer** — shrub mounds instead of gray rocks; more tree-to-tree variety. FPS: zero cost proven by back-to-back A/B vs a detail-start worktree on :8081 (machine had drifted ~10% globally — first reading looked like a regression and wasn't). |
| D3 | Building variety: 4 → 8 tint buckets varying warmth AND value (darker concrete, light stucco, glass-dark, near-white) | step_d3_buildings.png | **closer** — neighbouring buildings now differ like real streets; all variants stay in the desaturated family. A/B: baseline 38.4 vs current 39.1 — zero cost. |
| D5 | Facade windows: code-generated window-grid pattern on a second extrusion layer; 0.5m shorter so roofs stay clean (depth trick); LOOK.windowOpacity slider | step_d5_windows.png, step_d5_windows_close.png | **closer (big)** — every facade gains floor/window rhythm; the city stops reading as painted slabs. First attempt patterned the ROOFS too — fixed by shortening the layer. A/B: 39.1 vs 38.35 — -0.75 fps, within noise, floor OK. (D4 vertical-gradient was already MapLibre's default — no change needed.) |
| D6 | Storefront base band (3rd short extrusion layer) | step_d6_storefront.png, step_d6_street2.png | **no visible difference — REVERTED.** Zero FPS cost (A/B 32.5 vs 32.9, machine had drifted again), but across three viewpoints the band never visibly showed: our flying/chase cameras rarely see building bases up close. Contract says no visible improvement = revert; code removed, tree back to D5 state. |

## Detail-pass wrap-up
- Landed: D1 multi-lobe trees, D2 foliage richness + shrub bushes, D3 8-bucket
  building variety, D5 window-grid facades (D4 was already default; D6 reverted).
- Before/after: shots/detail_base.png vs shots/step_d6_reverted.png
  (stacked: shots/detail_compare.png).
- Normal play mode verified: zero page errors, starts, all overlays active.
- FPS: every landed change measured at zero-to-noise cost via alternating A/B
  against a detail-start worktree on :8081 (kept at ../3dflyer-baseline for
  future A/Bs). Absolute numbers drifted with machine load (44 -> 39 -> 33 over
  the session) — the A/B method is the only honest signal on this box.
- New LOOK sliders: tree lobes/spread/top-light/under-dark, facade windows.

## Road network (feature/road-network)
| Phase | Result | Evidence |
|---|---|---|
| 1 audit | tiles carry brunnel/ramp/layer everywhere, game ignored all of it; GG deck south end floated mid-air over the waterline | ROADS.md, shots/gg_baseline.png/json |
| 2 ramps | ROADS3D system: node-graph junction heights, tapered bridge ends, true end-to-end ramp slopes, box-strip ribbons + pillars, physics + traffic ride them. GG deck foot moved onto the real toll-plaza roadway (measured 56 m). GG towers made pass-through (OSM footprint spanned the deck; real road runs between the legs). Acceptance drive PASS 16/16: surface street → parkway → over generated overpasses → ramp → mid-span at alt 67 / 137 mph, no falls (3 earlier fails diagnosed honestly: foot 9 m too high; autopilot too fast for lane; tower collision). FPS A/B 43.95 vs 42.65 — within noise. | shots/gg_accept.png/json, shots/roads_gg_approach.png |
| 3 bridges network-wide | brunnel=bridge ways render elevated with pillars everywhere the system looks. Verified on: US-101 Central Freeway viaduct (over the Duboce street grid), I-280 viaduct over Mission Creek, I-80 Essex/Harrison ramps (curve between towers, taper to street). FPS at the densest spot: 55.2 — floor 40. | shots/roads_central_fwy.png, roads_280_viaduct.png, roads_80_approach.png |
| 4 tunnels | Surface-level styled corridors + portal frames at every data-tagged entrance (true underground impossible: raster-DEM terrain can't be clipped — tradeoff in QUESTIONS.md). MacArthur Tunnel acceptance drive PASS 5/5 portal-to-portal. Play mode boots clean; FPS 43 at capture cam / 55 at Central Fwy. | shots/tunnel_accept.png/json, roads_tunnel_portal.png |
| GG polish (David's report) | (1) phantom second deck: our deck centreline kinked ~50m off the real alignment, so OSM's carriageways escaped the exclusion corridor — deck re-traced from the real tile geometry (6-point curve), phantom gone; (2) floating cut-end viaduct: node keys now 5.5m cells (tile-quantization joins) + lone elevated dead-ends taper to ground unless near the load edge; (3) rails added: thin walls on ROADS3D elevated stretches + both edges of every hand-built deck. Drive re-run PASS 18/18 on the new curve; A/B FPS 41 vs 39.7 (noise); Central Fwy regression clean. | shots/gg_fixed1.png, gg_fixed2.png, gg_accept2.json |

## Textures + lanes + trees (feature/textures-lanes)
| Item | Result | Evidence |
|---|---|---|
| ref2 footage | X video downloaded (28.6s), 53 frames extracted, 43 kept (dups/junk culled) | ref2/ (local) |
| T1 landmarks | Ferry Building: cream sandstone + arched arcade pattern; Palace of Fine Arts: buff stone, office windows REMOVED (rotunda no longer an apartment tower). Runtime id discovery w/ multi-vertex footprint test (first-vertex missed the 200m-long Ferry Building). FPS 41.9. | tex_ferry_before/after.png, tex_palace_before/after.png |
| T2 facade variety | 3 generated window patterns (office/wide/tall) assigned per id+height hash — neighbouring facades differ like ref2. FPS 42.6. | tex_facades.png |
| T3 lanes | Audit: tiles carry NO lanes tag (schema) → class+oneway default table IS the pipeline (LANES config, P-slider-able). ROADS3D ribbons: lane-count widths + emitted markings (dashed white dividers, solid yellow centre on 2-way, position-hashed asphalt luminance jitter); hand decks: instanced dash strips (6 lanes w/ median); vector streets: meter-true widths by class + 4 marking line layers. Car spans one lane on the GG deck. FPS 42.3 (== pre-lanes), 59.8 on deck. | LANES.md, lanes_ggdeck.png, lanes_embarcadero.png, lanes_columbus.png |
| T4 trees | Runtime placement validation: any tree within a road's REAL width (lane table) + TREE_SHOULDER_M (2m, P-slider) is culled; decisions cached per tree, margin change restores + revalidates. Culls measured per area: GG Park east 4/191, Marina Green 2/44, Presidio 12/120, GG Park west 11/200 (~5% — density stays). Park roads render clear (JFK / MLK / Marina Blvd shots); bushes not yet validated (positions not retained at build — logged). | trees_jfk.png, trees_mlk.png, trees_marina.png |

## Textures/lanes/trees wrap-up
- Play mode boots clean (zero page errors). FPS floor verified relatively:
  final A/B baseline 42.3 vs current 41.5 (delta within noise; a lone 35.2
  reading was machine drift, disproven by the same-batch baseline).
- Comparison strips: shots/tex_ferry_compare.png, tex_palace_compare.png.

## NPCs — Bay Area archetypes (feature/npcs, tag npcs-start)
| Item | Result | Evidence |
|---|---|---|
| Assets | Kenney "Mini Characters" v1.0, CC0 (12 rigged chars, 723 tris, 32 anims, GLB) — the only third-party download; every prop is code primitives. Exact source + license in CREDITS.md | assets/npcs/, License.txt |
| Recolors | tools/npc_bake.js classifies every vertex (skin/top/bottom/shoes) offline from the shared palette; archetypes recolor garments as vertex colors with baked shading preserved. Skin/faces NEVER touched — every NPC draws a uniformly random base character regardless of archetype (that is the whole skin-tone policy) | npc-data.json |
| Archetypes | 8 costumes: techie (hoodie+laptop+glasses), Berkeley hippie (procedural tie-dye + peace-sign placard), road cyclist (neon+helmet+code-built bike), wine tourist (linen+sun hat+glass, wobble walk), surfer (wetsuit+board), dog walker (own outfit + 1-3 leashed mini dogs), founder (gray hoodie+phone, gesticulates), marina dad (salmon polo+khakis+sunglasses+coffee) | shots/npc_final_lineup.png + npc_final_*.png |
| Districts | config-editable circles (downtown/Marina/harbors/coast/Marin/Berkeley/Palo Alto + parks reusing TREE_SPOTS); per-archetype spawn weights. Verified live: Berkeley 24/24 hippies, downtown only techies+founders | shots/district_map.png, tools/district_map.html |
| Sidewalks | spawn offset = lane-table half-width + margin (same math as the tree culling and painted lanes); predictive lookahead turns walkers around before crossing streets; any NPC ever caught inside a roadway despawns. Live runs: 0 violations across 24-NPC crowds at two sites (an earlier run caught 1 — fixed by the lookahead) | headless acceptance runs |
| Behavior | wander along road edges, idle, archetype flavor anims, vehicle-scare react (step back + emote when a moving vehicle enters 9 m) — verified end to end headless. No ragdolls, no NPC-vehicle damage (per contract) | headless react run |
| NPC count vs FPS | tools/fps.js A/B (real GPU RX 5700 XT, q=high, downtown cam, 3 alternating rounds): **0 NPCs 42.1 / 24 NPCs 40.3 / 40 NPCs 38.3 / 60 NPCs 36.9 avg fps** ≈ 0.09 fps per NPC. Caps set to hold the 40 floor: high 24, medium 16, low 8. NPCS.DENSITY dial (P panel) scales them; ?npcmax=N overrides for testing | this table |
| Server fix | the "dev server dies silently" mystery: client aborts (headless Chrome closing mid-download) raised unhandled stream errors that killed node. server.js now survives them | server.js |

## Visual style, pass 2 — re-measure of ref/ (feature/visual-style, 2026-08-22)

STEP 1+2 only: analysis and audit. No code touched, no visual change made.
STYLE.md and GAP.md superseded in place (old text preserved in git history
at 0df0e30).

### Headline finding: the reference set was never replaced

The brief assumed STYLE.md/GAP.md came from an earlier reference set. They
did not. `ref/` holds the same 12 frames the 2026-07-16 pass measured —
file mtimes `2026-07-14 22:40`, two days BEFORE the old STYLE.md, and the
old doc's own scene list and frame numbers match these files exactly. The
second set `ref2/` (17 `ferry_*`/`misc_*` frames, 2026-07-16) is what
DETAIL_GAP.md / TEXTURE_GAP.md were built from. Raised at check-in; if
"new reference set" meant ref2/, this pass should be redone against those.

Value delivered is therefore *the same frames measured properly*, not new
frames. Six corrections to the old numbers — see STYLE.md §0.2. The largest:
grain overstated ~5x (σ 2–3 claimed vs 0.02–0.86 measured), sun:shade
understated (1.7:1 vs 2.27:1), sky zenith mislabelled (old value was
mid-sky), facade contrast understated (10–15 units claimed vs 83–135).

### Method notes (so the numbers are auditable)

- Overlays masked, not eyeballed: scene content is `x 52–1850, y 29–1022`;
  presenter PiP `x>=1355, y>=526`; caption `x 600–1345, y 928–1022`; racing
  HUD on 015/027/043; video transport UI on 027/043/051.
- Regions were hand-picked, then **audited crop-by-crop against their own
  label**. The first attempt had six contaminated boxes (015 "palm" was a
  building facade; 051 "water" was the scooter; 060 "sky" was a building;
  111 "path" included the runner). All re-picked before any number was
  taken. Two foliage boxes (051 foliage_tree_dark, 060 foliage_tree) could
  not be cleaned and were **dropped rather than reported**.
- Lighting maths in linear light. The sun/ambient ratio is taken as a
  ratio on ONE surface so albedo cancels; the CCT figures use near-neutral
  surfaces and are flagged as assumption-dependent.
- Two measurements were run, judged confounded, and discarded rather than
  reported as findings: contrast-vs-depth (measured scene content, not
  haze) and vignette (inseparable from the sky's own zenith gradient).

### Sample regions (original 1920x1080 pixel boxes, x0,y0,x1,y1)

| Frame | Region | Box |
|---|---|---|
| 015 | sky_upper / horizon_haze | 620,120,1000,300 / 640,430,1000,485 |
| 015 | asphalt_near / asphalt_far | 150,700,600,880 / 640,520,900,570 |
| 015 | building_white_tower / foliage_palm | 90,130,330,420 / 1370,60,1530,230 |
| 027 | asphalt_near / sky_upper / building_far | 250,720,700,900 / 500,160,900,340 / 1080,170,1260,330 |
| 043 | asphalt_near / sky_upper | 200,700,650,880 / 500,150,850,320 |
| 051 | grass / water_lake / stone_building / sky | 80,600,550,880 / 450,340,1150,440 / 80,80,340,240 / 1150,40,1650,130 |
| 060 | water_lake / stone_rotunda / sky | 350,430,1250,700 / 620,60,980,240 / 1350,30,1750,110 |
| 066 | path_concrete / grass_sun / foliage_willow / sky | 380,780,700,950 / 80,520,480,780 / 120,60,480,280 / 880,40,1080,120 |
| 080 | plaza_pavement / facade_stone / sky | 220,760,800,940 / 120,320,500,600 / 900,70,1300,300 |
| 088 | sky_cloud / facade_shade / plaza_sun | 760,50,1250,200 / 90,300,380,520 / 170,780,560,930 |
| 088 | foliage_palm / distant_bridge | 1420,300,1750,470 / 880,415,1180,455 |
| 093 | stone_facade / sky_upper / plaza_pavement | 220,320,900,700 / 1480,40,1800,180 / 150,870,800,990 |
| 111 | sky_zenith / skyline_far / path_sun | 130,40,620,150 / 1350,90,1800,270 / 420,720,800,930 |
| 111 | **path_shadow** (the sun:ambient pair) / foliage_sun | 1020,840,1130,930 / 220,290,650,430 |
| 124 | path_sun / skyline_far / foliage_sun | 620,730,1050,930 / 700,70,1250,300 / 1150,330,1330,520 |
| 137 | sky / skyline_far / water / foliage / building | 400,60,1000,290 / 880,380,1250,470 / 350,690,900,930 / 1450,440,1800,510 / 100,300,300,430 |

Sky-gradient samples (111, 137, 088) use fixed-x columns at five heights —
listed in STYLE.md §1.1 / §3.

### Audit result

Current `LOOK` config is much closer to the reference than the old GAP.md
implies, because steps 1–4 of that plan already shipped. Remaining gaps
ranked in GAP.md: 8 config-only changes (tier A), 5 that cannot be judged
without a measured capture (tier B, first job of STEP 3), 2 moderate (tier
C), and the unchanged expensive list (tier D, not to be started without
David's go-ahead). Notably `sunPolar 50` (=40 deg elevation) needs NO change
— the frames only support a 35–55 deg band and we are already inside it.

No FPS numbers this entry: nothing was changed, so there is nothing to
measure. Baseline FPS will be taken at the start of STEP 4.

## STEP 3 — capture-loop determinism (feature/visual-style, 2026-08-22)

**Verdict: the loop was NOT deterministic. Fixed before any visual change.**

Measured by capturing repeatedly at the standard shot camera and diffing
pixel-for-pixel (`?shot=1`, port 8082 serving this worktree).

| | before fix | after fix |
|---|---|---|
| PSNR between runs | **41.9 dB** | **83–inf dB** (median 107.8) |
| pixels differing | 1,602 (0.174%) | 1–115 (max 0.0125%) |
| **max channel delta** | **141 / 255** | **6 / 255** |

### Cause: NPCs walk during shot mode

`?shot=1` already skipped traffic ("traffic is random — skip it in shot
mode") but still ran the full NPC crowd: 24 pedestrians spawning from an
UNSEEDED `Math.random` and then walking on real wall-clock `dt`. Two
captures put them in visibly different places — that was the 141/255.
The `?npcshot` lineup mode was already pixel-stable (it pins every frame);
plain `?shot=1` never got that treatment.

**Fix** (`js/npcs.js`, 3 lines): plain `?shot=1` now holds the crowd at
zero, exactly as it already does for traffic. `?npcmax=N` and
`?npcshot=…` still work and are the deliberate way to shoot NPCs.

Regression-checked, all clean, zero page errors:
- play mode (no `?shot`): **24 NPCs** spawn as before, `quiet=false`
- `?shot=1&npcmax=12`: **12 NPCs**, override respected
- `?npcshot=1`: 8-archetype lineup still captures correctly

### Residual noise floor: 6/255 on 114 distant pixels — accepted, not chased

One run in ~5–6 differs from the rest by **≤6/255 across ~114 pixels**
(0.0125%), always sub-pixel anti-aliasing on distant building edges around
y 230–280, averaging **1.19/255** — invisible. The other runs are
identical to within ±1/255, and two runs came out bit-identical.

I tried `raster-fade-duration: 0` in shot mode on the theory that raster
cross-fade was the cause. **It made no measurable difference** (outlier
still ≤6/255 on ~115 px, before and after), so it was **reverted** rather
than kept as an unproven change. `js/main.js` is untouched.

**Treat 6/255 / 115 px as the noise floor.** Any A/B verdict in STEP 4
must clear it — which is trivial, since a grade or sky change moves
tens of thousands of pixels by tens of units.

### Baseline FPS (real GPU: RX 5700 XT via ANGLE D3D11, headless 1280x720)

| condition | fps |
|---|---|
| shot camera, 0 NPCs (what plain `?shot=1` now measures) | **34.9** |
| shot camera, 24 NPCs (`?npcmax=24`, play-representative) | **31.8** |

Two caveats, stated up front:
1. **The NPC fix changed what `fps.js` measures.** It loads `?shot=1`, so
   it now sees an empty crowd. For play-representative numbers use
   `node tools/fps.js "npcmax=24" http://localhost:8082/`. Older FPS
   figures in this file included NPCs and are NOT directly comparable.
2. This is **not** 60 fps, and it is below the ~42 fps this file recorded
   historically. Absolute readings on this machine drift ±25% with load,
   so a single number proves nothing — STEP 4 will A/B alternate against
   a baseline in the same batch rather than trust absolutes. Flagged for
   David: the 60 fps bar in the brief is not currently met at this camera,
   independently of any visual work.

## STEP 4 — working down the corrected GAP.md, tier A

Baseline for this section: `shots/base_v2.png` (commit 97abc3d, the
determinism fix). Noise floor from STEP 3: **6/255 on ~115 px**. Any
verdict below has to clear that to count. FPS baseline **34.9** (0 NPCs)
/ **31.8** (`npcmax=24`), RX 5700 XT, headless 1280x720.

Region audit note: my first attempt at game-shot sample regions was
wrong — at pitch 72 the camera sits ~18 deg above horizontal, so the big
saturated blue mass I first labelled "sky" is actually the **bay water**.
Corrected by vertical-profile audit before any measurement was trusted.
Baseline values now recorded per region (sky #c8ced7 sat 0.079, water_far
#5583be sat 0.549, asphalt #555657 sat 0.064, foliage #71756d sat 0.115,
towers #636361 sat 0.025).

| # | Change | Shot | FPS | Verdict |
|---|---|---|---|---|
| A1 | Film grain `grainOpacity 0.25 → 0.05` (STYLE.md §4: reference flat-area high-pass sigma is 0.02–0.24/255; the old "sigma 2–3" figure was measuring water ripples and pavement texture, not noise) | `a1_grain.png` | 35.9 (base 34.9 — within the ±25% drift noise; it is a CSS opacity, no draw-call change) | **KEEP, but barely visible — and my GAP ranking was wrong.** The change is real and broad: it moved **67.65% of all pixels**, but by a **max of 2/255** (mean 0.78). PNG dropped 954→658 KB, which is the honest tell: removing ±1 of dither compresses far better. Directionally correct — we were adding roughly 5× the fine noise the footage has, and now we are inside the measured band. But at 2/255 it is **below the perceptual threshold**, so nobody will see it. I ranked this "High impact" in GAP.md on the strength of the old sigma 2–3 figure being wrong by 5×; what I missed is that the *effect itself* was always tiny, so correcting it is a correctness win, not a visual one. GAP.md A1 impact rating should read **low**. |
