# PERF.md — framerate budget for the detail pass

## Methodology
FPS = requestAnimationFrame count over 5 s, measured in David's real Chrome
(RX 5700 XT) with the game parked at the standard capture camera
(Embarcadero at Broadway, zoom 19.5, pitch 72 — same framing as
`npm run shot`). Headless Chrome is NOT used for FPS (software GL — lies).

## Baseline (2026-07-15, branch detail-start = 470dbd4)
| Run | Quality | FPS |
|---|---|---|
| 1 | medium | 41.3 |
| 2 | medium | 40.6 |
| 3 | high | 40.5 |

Note: medium == high within noise. UPDATE: tools/fps.js (headless, real GPU,
never focus-throttled) measures ~43-44 at the same camera, matching the
in-window 41 - so ~41-44 IS the true scene cost at this camera (satellite +
terrain + extrusions at pitch 72), not a throttle cap as first suspected.

## The floor
**40 fps at the capture camera, same-session methodology.** Any change
that measures below the floor — or measurably below the same-session
baseline beyond noise (±1.5) — gets reverted, per the contract.

## Log (updated after every change)
| Change | FPS after | Verdict |
|---|---|---|
| (baseline) | 41 in-window / 44 headless-GPU | — |
| D1 multi-lobe two-tone canopies (3,564 instanced lobes) | 43.3 | PASS (>= 40 floor; delta within noise) |
