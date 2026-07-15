# PROGRESS.md — Genie-look iteration log

Baseline: `shots/before.png` (branch feature/genie-look, tag safe-start).
Every step: change → `npm run shot` (launch check + capture) → judge vs
`ref/` frames → commit only if closer. Shots kept in `shots/`.

| # | Change | Shot | Verdict |
|---|---|---|---|
| 1 | Neutral-day sun + sky (LOOK config + P-panel sliders) | step1_sky.png | **closer** — sunset-postcard signature gone; sky now pale blue → gray haze band; towers read neutral gray. Launch check OK. |
| 2 | Global grade: saturate 0.72, contrast 0.94, brightness 1.04 (CSS filter on canvas) | step2_grade.png | **closer** — whole frame loses the vivid-game punch; trees/buildings/imagery muted. Water still too navy (item 3). Launch check OK. |
| 3 | Water: navy → neutral gray sky-mirror (deep #5f6a6d, shallow #9aa4a5, glint 0.35 near-white) | step3_water.png | **closer** — far-water sample now rgb(97,99,100) vs reference river rgb(100,96,94): near-exact. First try was too dark, lightened before committing. Launch check OK. |
