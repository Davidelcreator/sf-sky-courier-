# GAP.md — current game vs the Genie 3 target look

**Superseded 2026-08-22 (pass 2).** Replaces the 2026-07-16 audit. Old text
is in git history (`git show 0df0e30:GAP.md`). Target values:
[STYLE.md](STYLE.md).

## Read this before the table

**The old GAP.md is not just outdated — it audits a game that no longer
exists.** It compared a golden-hour build against the reference and ranked
nine changes. PROGRESS.md shows steps 1–4 of that plan were implemented and
committed (neutral sun+sky, global grade, water, aerial haze), and later
work added desaturated `BUILDING_COLORS`, olive foliage, facade windows and
fake shadows. So every "way too saturated / wrong hue entirely / biggest
realism gap" row in the old document has already been acted on.

This audit therefore compares the **current** `LOOK` config against the
**re-measured** targets. The remaining gaps are much smaller and more
specific than last time — which is the honest result, not a disappointing
one.

**One caveat on the whole document.** The "game now" column is read from
`js/config.js`, not measured off a render. Config values are exact for
things the config fully determines (a colour, a ratio, a grain opacity),
but for anything the renderer composites — global saturation, black floor,
how far a skyline actually sits from the sky — **config cannot tell you the
answer.** Those rows are marked ⏳ and are the first job of STEP 3, once a
deterministic capture exists to measure. I did not capture one because the
brief says stop before touching code.

**Sliders:** `LOOK_PANEL` in main.js already exposes a slider for every
`LOOK` key plus prefixed keys into `ROADS3D` / `LANES` / `NPCS`. The
brief's "one config object with a debug panel" rule is **already
satisfied** — no new plumbing needed for anything in tier A.

---

## Tier A — config values only. No code, no shaders, no FPS cost.

Ranked by visual-impact-per-effort. Every one of these is a number change
with a slider already attached.

| # | Item | Game now | Target (STYLE.md) | Change | Impact |
|---|---|---|---|---|---|
| A1 | **Film grain** | `grainOpacity 0.25`, commented "≈ σ 2–3/255" | σ **0.02–0.86/255** → effectively grain-free | 0.25 → ~0.04, or 0 | **High.** We are adding a full-frame effect the reference does not have, built on a measurement that was wrong by ~5×. Removing a wrong effect is the cheapest quality win available. |
| A2 | **Water hue** | `waterDeep #7d8b93` (B−R **+22**), `waterShallow #b3bec2` (B−R +15) | B−R **−6 to −37** — water is warm-neutral, never blue | Deep → `#7c7a76` family, shallow → `#a9a59e` family | **High.** Three independent samples agree water is warmer than red. We are still on the blue side of neutral — the one place the old "gray sky-mirror" fix stopped short. Large screen area when flying. |
| A3 | **Sky zenith saturation** | `skyColor #a7bcda` sat **0.234** | zenith `#90b1db` sat **0.341** | Deepen zenith blue | **High.** The old pass sampled mid-sky and called it zenith (STYLE §0.2). Sky is the biggest area on screen in a flying game. |
| A4 | **Lane paint contrast** | `LANES.MARKING_BRIGHTNESS 0.85` | Paint is only **1.14–1.65×** asphalt luminance, and blue-gray not white | 0.85 → ~0.55 | **Medium-high.** Loud white markings are one of the strongest "this is a game" tells, and this is a single slider. |
| A5 | **Sun : ambient ratio** | sun 1.25 / ambient 0.85 → **2.47 : 1**, ambient 40.5% | **2.27 : 1**, ambient **44%** | ambient 0.85 → ~0.93 | **Low-medium.** Already close — the previous pass got this roughly right. Small honest nudge, not a headline. |
| A6 | **Shadow blue tint** | shadow/lit B:R ratio **1.110** | **1.145** | Nudge `threeAmbientColor` slightly bluer | **Low.** Nearly right already. |
| A7 | **Horizon brightening** | horizon is **+5%** brighter than sky | horizon **+14%** brighter (overcast, STYLE §3.2) | Lift `horizonColor` relative to `skyColor` | **Medium.** Correct direction already; under-done. Cheap. |
| A8 | **Foliage saturation** | `treeSat 0.35` | trees **0.27–0.51**, grass **0.48–0.57** | 0.35 → ~0.42 | **Low-medium.** Hue is already right (`treeHue 0.16` ≈ the measured R≈G olive). The old pass over-desaturated; this walks part of it back. |

### Tier A items that need NO change

- **Sun elevation.** `sunPolar 50` = 40° elevation. STYLE §2.1 concludes
  the frames only support a **35–55°** band and cannot pin it tighter.
  We are already inside it. *Changing this would be inventing precision.*
- **Chromatic aberration.** Measured 0–1 px; we implement none. Correct.
- **Vignette.** Measured falloff is confounded by the sky's own gradient
  (STYLE §4); we implement none. Correct.
- **Foliage hue.** `treeHue 0.16` vs measured hue 60° (0.167). Correct.
- **Building palette.** `BUILDING_COLORS` runs `#a2988b`→`#8a9097`;
  measured facades run `#948b7c`/`#84796e`/`#8d8375`/`#b1b6ba`. Same
  family. No change worth the churn.

---

## Tier B — cannot be judged from config. Measure first (STEP 3).

These need a deterministic capture, sampled the same way STYLE.md samples
the reference. **This is the first work of step 3**, and several tier-A
choices should be re-checked after it, because the global grade sits on top
of everything.

| # | Item | Target | Why config can't answer it |
|---|---|---|---|
| B1 | ⏳ **Global saturation** | absolute mean **0.157** (range 0.076–0.247) | `gradeSaturate 0.72` is a *multiplier* on whatever the renderer produced. The absolute result is unknown until measured. |
| B2 | ⏳ **Black floor** | Y_p01 **21–72**, typically ~50 | `gradeContrast 0.94` + `gradeBrightness 1.04` lift blacks by an unknown amount. |
| B3 | ⏳ **Midtone placement** | Y_p50 **135–185** | Same reason. |
| B4 | ⏳ **Aerial perspective** | distant skyline within **6–20/255** of the sky behind it | `fogDensity 0.00028` only affects three.js objects; MapLibre buildings/terrain are handled by `atmosphereBlend`. Net convergence is a render property. |
| B5 | ⏳ **Facade window contrast** | **83–135/255** within one tower face | `windowOpacity 0.38` is a pattern alpha, not a contrast figure. Suspect we are *under* target (STYLE §0.2 says the old pass understated this badly). |

---

## Tier C — real work, moderate risk. Ask before starting.

| # | Item | Gap | Note |
|---|---|---|---|
| C1 | **Sky vertical gradient shape** | Measured sky ramps sat **0.34 → 0.19** top-to-horizon while getting *brighter*. MapLibre `setSky` gives only sky colour + horizon colour + blend. | May not be expressible. Worth one experiment; if `horizonBlend` can't shape it, this needs a custom sky layer — which is tier D. |
| C2 | **Global softness** | `gradeBlur 0.3px` vs measured **3–12px** 10–90% edge rise | Matching the reference literally would smear the HUD and map labels into mush. The CSS filter hits the whole canvas. Any real fix means blurring the map canvas only, leaving DOM HUD sharp — needs checking whether that's separable. **I would not push blur past ~0.5px without you seeing it.** |

---

## Tier D — expensive. I will NOT start these without explicit go-ahead.

Unchanged in substance from the old audit; still architecture-limited.

- **True per-pixel distance fog on MapLibre buildings + terrain.** No fog
  API in MapLibre 5.6. Needs an engine-level change or v6 (ESM-only, would
  break the script-tag load).
- **Soft-penumbra shadows.** Reference shadows are contact-sharp and blur
  with distance; we fake shadows as flat hull blobs at `shadowOpacity 0.30`.
  Real soft shadows need a custom depth pass — FPS risk, phone risk.
- **Glass environment reflections** on fill-extrusion — not exposed in 5.6.
- **Per-surface auto-exposure / a real tonemapping curve.** Our grade is a
  CSS filter: a global, gamma-space, three-knob approximation. A true
  filmic curve needs an offscreen composite; three.js `EffectComposer`
  cannot cleanly wrap MapLibre's shared GL context.
- **Motion blur**, **neural "melted detail" texture.**

---

## Verification loop

`npm run shot` (tools/capture.js, puppeteer-core → real Chrome, headless)
captures `shots/<name>.png` and exits non-zero if the scene never loads —
it doubles as the launch check. STEP 3 must confirm it is still
deterministic (fixed car position, camera, frozen animation time) **before**
any visual change lands. FPS measurement via `tools/fps.js` A/B against the
baseline worktree; PROGRESS.md records the number next to every verdict.

Reference frames stay local: `ref/` and `ref2/` are gitignored and no frame
has ever been committed (verified across all history).
