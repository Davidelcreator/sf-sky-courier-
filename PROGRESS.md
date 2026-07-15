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
