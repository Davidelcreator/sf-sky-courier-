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
| A2 | Water hue `waterDeep #7d8b93 → warm-neutral` (STYLE.md §1.6: reference water is B−R **−6 to −37**, sat 0.065–0.300; the shot measured B−R **+106**, sat 0.549) | — no shot, change never made | — | **NOT ATTEMPTED — the knob does not control what I measured.** Diagnostic: forcing `uDeep`/`uShallow` to magenta **and** hiding the water plane outright left the far-water region **byte-identical** (rgb 84.6,131.2,190.4 in all three). The three.js plane is only visible in `x[0..466] y[173..719]` — the *near* water — and there it already measures `#b3bbb0`, sat 0.065, B−R −3, i.e. **already on the reference hue**, just light. So the huge blue mass driving my "biggest gap" call is something else. Ruled out by direct test: satellite raster (hiding it changes only `y[193..719]`), `natural_earth` (3 px), every vector fill (`fillLayersVisible` is empty), the `background` layer (already `visibility:none`), and `queryRenderedFeatures` returns `[]` there. Remaining suspect is MapLibre's own terrain/atmosphere render over sub-sea-level bathymetry. **Unresolved — raised at check-in.** |
| A4 | Lane paint `MARKING_BRIGHTNESS 0.85 → 0.55` (STYLE.md §5: reference paint is 1.14–1.65× asphalt; ours measured **1.81×**) | `a4_paint.png` | — | **REVERTED — no measurable effect.** Paint/asphalt ratio went **1.81× → 1.82×**. `MARKING_BRIGHTNESS` *is* wired up (main.js:401 for the vector marking layers, 1711/2231 for ROADS3D), and the four `lane-*` layers report `visibility:visible` — but in the default satellite basemap the bright lines I sampled are not those layers. Reverted rather than kept as an unproven edit. **Needs a proper vector-basemap capture to evaluate** (my satellite-off probe only hid the raster; it did not re-show the vector fills, so it was not a real vector-mode test). |

### Tier B answered from the baseline capture (GAP.md B1–B5)

Measured on `a1_grain.png` with the **identical method** used on the
reference in STYLE.md §4. (First attempt used linear luminance against
the reference's gamma-space luma — not comparable. Caught and redone;
the numbers below are gamma-space both sides.)

| | game | reference target | verdict |
|---|---|---|---|
| **B1** global saturation | **0.080** | 0.076–0.247 (mean 0.157) | **IN BAND — at the very bottom.** We are already as desaturated as the least-saturated reference frame. **Do not desaturate further**; `gradeSaturate 0.72` may already be slightly too aggressive. This kills the "desaturate the basemap" idea before it cost anything. |
| **B2** black floor (Y p01) | **60.8** | 21–72 | **IN BAND** (near the top — blacks well lifted). No change needed. |
| **B3** midtone (Y p50) | **104.6** | 135–185 | **BELOW.** I distrusted this at first as a scene-composition artefact (street-level photos vs a pitched aerial view), so I checked it a second way — material-by-material — and the two agree. It is real. |

**Material-matched (the trustworthy comparison), game vs reference:**

| material | game | reference | gap |
|---|---|---|---|
| distant towers | `#636261` R~99, sat 0.025 | `#a2afc0`/`#b1b6ba` R~162–177, sat 0.064–0.169 | **~65–78 too dark** — the single biggest gap. Distant buildings should wash toward the bright sky; ours stay dark. This is **B4 aerial perspective**, and it is very visible. |
| near buildings | `#6e6b60` R~111, sat 0.131 | `#948b7c`…`#8d8375` R~132–148, sat ~0.20 | ~20–37 too dark |
| asphalt | `#555657` R~85, sat 0.064, B−R **+2.5** | R~94–121, sat 0.130–0.282, B−R **+15…+36** | too dark, too flat, **not sky-blue** — reference roads mostly reflect sky |
| foliage (distant) | `#70756c` sat **0.115** | hazed `#9c9a93`/`#88908a` sat 0.107–0.139 | **saturation is CORRECT** for hazed distance — so **A8 cannot be judged here**; the only trees in frame are far and fogged |
| sky near horizon | `#c7cdd6` R~200, sat 0.079 | `#979ea2`/`#b0c2da` R~151–176 | game sky is **brighter** than reference |

**Captures still needed** (per David's instruction to propose before building):
- **B4 / aerial perspective** — answerable *now* from the standard shot; no new capture needed. Biggest measured gap, and `fogColor`/`atmosphereBlend`/`fogGroundBlend` are existing sliders. Proposed next item.
- **A3 sky zenith + A7 horizon** — the standard camera is pitched 72° (≈18° above horizontal), so it sees **only near-horizon sky**. Needs a shot with a raised camera, e.g. `?shot=1&pitch=35&alt=400`, to put real zenith in frame.
- **A8 foliage saturation** — needs a **near-tree** capture (a park spot: Palace of Fine Arts or GG Park) so foliage is unfogged.
- **A4 lane paint** — needs a genuine **vector-basemap** capture (`setBasemap(false)`, not just hiding the raster).
- **B5 facade window contrast** — needs a close building crop; the standard shot's towers are too distant.

### FPS: reference number and the amended rule (David's ruling, 2026-08-23)

**Reference FPS for this pass: `34.9`** (shot camera, 0 NPCs, RX 5700 XT
via ANGLE D3D11, headless 1280x720). Play-representative companion figure
is 31.8 at `?npcmax=24`.

**Rule for every accepted visual change: it may not cost more than
1 fps against 34.9.** Anything worse gets the cheap version or gets
reverted.

The 60 fps figure in the original brief was aspiration, not measurement.
The 34.9 → 60 gap, and the regression from the ~42 this file recorded
historically, are their own workstream to be taken up **after** the
visual pass: both predate this work and styling is not where they get
fixed. Not chased here.
| B4 | **Aerial haze on MapLibre buildings — BLOCKED, not attempted.** | `haze_*.png`, `sky_red.png` | — | **NOT POSSIBLE IN 5.6, and I mis-sold this at check-in.** Eight-variant sweep of `atmosphere-blend`/`fog-ground-blend`/`horizon-fog-blend` moved the tower pixels by **less than 0.1 of an RGB unit**. Control: setting every sky colour to `#ff0000` turned the sky red and changed 115,572 px, while the tower region stayed **byte-identical** — so `setSky` lands, it just does not composite over fill-extrusion. Full write-up + the four tier-D routes in QUESTIONS.md. |
| A9 | **Building tone** (the achievable half of B4): `sunIntensity 0.30 → 0.22` + `BUILDING_COLORS` lightened +28/channel. Chosen by a 5-candidate sweep scored against the reference bands. | `a9_buildings.png` | **37.3** (base 34.9 — no cost; it is a colour ramp, no new draw work) | **KEEP — closer, and the first change you can actually see.** Building total abs error **83.7 → 31.2** (−63%). `building_right` 110.9 → **140.8**, landing *inside* the 132–148 target band (error **0.0**). `towers_far` 99.3 → **130.8** (target 162–177, still 31 short). Global midtone p50 **104.6 → 129.0**, closing most of the B3 gap (band 135–185). Saturation 0.079 and black floor 60.8 both unchanged and still in band; asphalt and sky untouched, so the change is targeted rather than a global wash. 36.27% of pixels moved, max delta **39/255** — far clear of the 6/255 floor. **Honest limit:** the sweep error plateaued at ~39 for *every* lightened candidate. That plateau is the near/far gradient we cannot make — the reference's distant buildings are BRIGHTER than its near ones because haze washes them skyward, so one flat ramp can match near or far, never both. I tuned it to nail near buildings exactly and take the improvement on distant ones. |

### Capture presets: named + committed (David's condition, 2026-08-23)

`SHOT_PRESETS` in config.js; used as `node tools/capture.js <out> "preset=<name>"`.
Individual URL params still override for one-off probing. `main` reproduces
the original hardcoded shot **exactly** — verified at 3–6 px / delta 1,
inside its own 6/255 floor, so the whole comparison history above stays
valid. Built one at a time, as instructed.

**Correction to what I proposed at check-in:** I said the sky rig should be
`pitch 35 / alt 400`, and David approved that. **The pitch was backwards.**
MapLibre pitch is 0 = straight down, 90 = horizontal, so 35 is nearly
top-down and would have shown *less* sky than the standard shot. The repo's
own camera table proves it — TOP-DOWN is pitch 15, CINEMA (pitch 78) is
"low drama, big horizon". The rig uses **pitch 80** (the map's `maxPitch`).

**Determinism bug found and fixed while qualifying the sky preset.**
Its first three captures came back at **max delta 151/255 across 376,273 px
(40.8%)** — catastrophically worse than `main`. Cause: **physics keeps
running in shot mode.** For a preset parked on the road that is harmless
(the car just settles onto the ground), but the sky rig is posed at 400 m,
so the car *fell* — the capture logged `alt: 311.5` against a requested 400,
and the frame was still moving when the shutter fired. Diagnosed by
screenshotting one session at 2/4/6/10 s: the image never converged, PSNR
got steadily *worse* (22.5 → 20.8 → 18.9 dB), while `map.loaded()`
oscillated false→true→false and `areTilesLoaded` stayed true the whole
time — so it was never tile streaming.

Fix: presets may set `hover: true`, and shot mode re-pins that altitude
every frame. Ground presets are untouched (`shotHover` stays null).

| preset | camera | noise floor |
|---|---|---|
| `main` | Embarcadero @ Broadway, alt 3, pitch 72, zoom 19.5 | 6/255, ~115 px (0.0125%) |
| `sky` | same spot, alt 400 **hover**, heading 0.9 (NE over the bay), pitch 80, zoom 15.5 | **0/255 — all three runs BIT-IDENTICAL** |

### A3 sky: measured on the new rig (change not yet made)

| | game | reference |
|---|---|---|
| top of sky | `#b0bfd4` sat **0.170** | zenith `#90b1db` sat **0.341** |
| descending | sat 0.164 → 0.147 → 0.118 → **0.077** | 0.317 → 0.247 → **0.193** |
| below y188 | **hard seam**, then sat **0.386 → 0.508 → 0.442** | nothing like it |

Two distinct problems, not one. (1) Our MapLibre sky is **half the
reference's saturation** and desaturates far too fast toward the horizon.
(2) There is a **hard horizontal seam** at y≈188 where the sky meets an
over-saturated blue band (sat up to 0.508 — *more* saturated than anything
in the entire reference set, whose ceiling is 0.341). That band is the same
unidentified blue from the A2 investigation, now seen full-width. Fixing
the sky colour alone will not help while the seam is there.
