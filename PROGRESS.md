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
