# PROGRESS.md — Genie-look iteration log

Baseline: `shots/before.png` (branch feature/genie-look, tag safe-start).
Every step: change → `npm run shot` (launch check + capture) → judge vs
`ref/` frames → commit only if closer. Shots kept in `shots/`.

| # | Change | Shot | Verdict |
|---|---|---|---|
| 1 | Neutral-day sun + sky (LOOK config + P-panel sliders) | step1_sky.png | **closer** — sunset-postcard signature gone; sky now pale blue → gray haze band; towers read neutral gray. Launch check OK. |
| 2 | Global grade: saturate 0.72, contrast 0.94, brightness 1.04 (CSS filter on canvas) | step2_grade.png | **closer** — whole frame loses the vivid-game punch; trees/buildings/imagery muted. Water still too navy (item 3). Launch check OK. |
