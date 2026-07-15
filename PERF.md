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

Note: medium ≡ high within noise → at this camera we are NOT GPU-bound;
the ~41 ceiling is most likely Chrome throttling a visible-but-unfocused
window (the game runs full-speed when the window has focus). The numbers
are still valid as a *relative* budget: any detail change is measured the
same way in the same session and compared against a fresh same-session
baseline.

## The floor
**40 fps at the capture camera, same-session methodology.** Any change
that measures below the floor — or measurably below the same-session
baseline beyond noise (±1.5) — gets reverted, per the contract.

## Log (updated after every change)
| Change | FPS after | Verdict |
|---|---|---|
| (baseline) | 41 | — |
