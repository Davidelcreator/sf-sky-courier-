# VISUAL_METHOD.md — what the fidelity pass learned

**Written 2026-08-25, at the close of the visual pass on the MapLibre
build.** This build is now the mobile product; the console-style version is
a separate Unreal Engine 5 build with no shared code.

This document exists so the Unreal build inherits the **rigour** from a
document instead of from commit archaeology. It is deliberately *not* a
changelog — [PROGRESS.md](PROGRESS.md) has what changed. This is what the
pass **learned**: the target in numbers, the method that made verdicts
trustworthy, the traps that produced false findings, and the engine limits
that were proved rather than assumed.

Almost none of the method is MapLibre-specific. All of it transfers.

---

## 1. The target, in numbers

Measured from 12 frames of Genie 3 Street-View demo footage. Full
derivation and per-frame provenance in [STYLE.md](STYLE.md); this is the
condensed target an engine should be aimed at. **These are engine-agnostic
— they describe photographs, not MapLibre.**

### 1.1 Global grade

| property | target | note |
|---|---|---|
| Saturation (mean, HSV) | **0.157** (range 0.076–0.247) | Nothing is vivid. Ceiling across the whole set is **0.341** |
| Black floor (Y p01) | **21–72**, typically ~50 | Blacks are LIFTED. Never reaches 0 |
| Midtone (Y p50) | **135–185** | Placed high |
| Highlights (Y p95 / p99) | 202–253 / 226–255 | Sun frames genuinely clip |
| Grain | **0.02–0.24 / 255** high-pass σ | Effectively grain-free |
| Chromatic aberration | **0–1 px** | None |
| Vignette | not measurable | See §3.4 |
| Edge softness | 3–12 px 10–90% rise | Soft source, **no sharpening halos** |

### 1.2 Lighting

- **Sun : shade luminance = 2.27 : 1**, measured albedo-free (one surface,
  sunlit vs its own cast shadow, in linear light).
- **Ambient is ~44% of the lit value.** This is why nothing reads contrasty.
- **Ambient is bluer than the sun**: blue retained **+14.6%** more than red
  in shadow. Shadows must never be neutral-dark or black.
- **Colour temperature ~6000 K**, drifting 6500–7000 K under overcast.
  Neutral daylight; nothing golden-hour anywhere in the set.
- **Sun elevation: not determinable** from the footage. Only a **35–55°**
  band is supportable. Do not let anyone quote a precise figure.

### 1.3 Atmosphere — the dominant effect

- Distant objects converge onto the sky: a whole city skyline sits **6–20
  units out of 255** from the sky behind it.
- **The horizon is BRIGHTER than the zenith** (overcast: 220 vs 208). Haze
  scatters light toward the viewer. A fog model that only darkens or greys
  with distance will miss this — the horizon must *brighten and desaturate
  together*.
- Clear sky desaturates downward: **sat 0.34 at top → 0.19 near horizon**,
  while luminance *rises*.

### 1.4 Materials

| material | target |
|---|---|
| Asphalt | B > G > R **always** — road mostly reflects sky. Y 94–121 |
| Lane paint | only **1.14–1.65×** asphalt luminance, gray/blue-gray. Never white, never high contrast |
| Foliage | **R ≈ G** (one sample is exactly 136,136,73). Olive, not green. sat 0.27–0.57 near, 0.11–0.14 hazed |
| Water | **B < R always** (B−R −6 to −37). Never blue. Mirrors sky and surroundings |
| Glass towers | internal face contrast **83–131/255**. Gray-blue overall but NOT flat. No sun-sparkle specular |
| Stone/concrete | matte, sat 0.10–0.21, internal contrast ~135/255 |

**The single most transferable finding:** foliage R≈G and water B<R. A
default game palette gets both backwards, and those two alone read as
"game" from across the room.

---

## 2. The method — this is the part that matters

### 2.1 An instrument that lies is worse than no instrument

Before any visual change, the comparison capture must be proven
deterministic. Ours was not, and we found out only by testing it:

- **First measurement: max channel delta 141/255 across 1,602 px.** Cause:
  24 pedestrians spawning from an unseeded RNG and then walking on
  wall-clock time. Traffic was already excluded for exactly that reason;
  NPCs had been missed.
- **Second failure, on a new capture rig: 151/255 across 40.8% of the
  frame.** Cause: physics kept running during capture. Harmless for a
  camera parked on the ground, ruinous for one posed at 400 m — the
  vehicle simply *fell*, and the frame never settled.

**Rule: every capture preset is named, committed, and has its noise floor
measured once before it is trusted for a verdict.**

#### Current noise floors — check the date before trusting these

| preset | floor | as of | note |
|---|---|---|---|
| `main` (ground, alt 3) | **6/255** on ~115 px (0.0125%) | 2026-08-25 | sub-pixel AA on distant building edges; appears in ~1 run in 6 |
| `sky` (airborne, alt 400) | **1/255** on ~243 px | 2026-08-25 | **was 0/255 (bit-identical) until the backdrop fix**; the CSS gradient dithers very slightly run to run |

**A stale noise floor is how a real regression gets waved through.** The
`sky` rig qualified at a perfect 0/255, then a later change moved it to
1/255 — small, but a verdict judged against the *old* threshold would
treat a 1-unit regression as impossible rather than as noise. **Re-measure
the floor after any change that touches how a preset is composited, and
update this table with the date.**

**Diagnostic that found the second bug:** screenshot one session at 2/4/6/10
seconds. If the image is still changing, it is not settled. PSNR getting
*worse* over time (22.5 → 18.9 dB) proved motion, and `areTilesLoaded`
staying true the whole time proved it was not asset streaming.

### 2.2 Establish the noise floor, then require verdicts to clear it

Capture the same frame N times, diff pairwise, record the worst channel
delta. That number is the floor. **Any change smaller than the floor is not
a result.** Ours: 6/255 on ~115 px (sub-pixel anti-aliasing on distant
edges). Every accepted change moved tens of thousands of pixels by tens of
units — comfortably clear.

Corollary that saved us: **a "no visible difference" verdict is only
meaningful once you know the floor.**

### 2.3 Audit every sample region against its own label

Hand-picked measurement boxes are the biggest silent error source. **Six of
our first sample regions were measuring something other than their label** —
a box labelled "palm foliage" sat on a building facade; "lake water" sat on
a vehicle; "sky" sat on a rotunda.

**Method:** render a sheet of (crop thumbnail, measured swatch, hex, sat)
per region and *look at it*. Anything whose crop does not show its label
gets re-picked or dropped. Two of ours could not be cleaned and were
**dropped rather than reported**.

### 2.4 Verify a null result before believing it

The most dangerous output is "nothing changed", because it is
indistinguishable from "the probe did not run".

- We hid **all 93 style layers**, terrain, and the entire 3D scene, and the
  band did not move. That was only trustworthy because we *also* confirmed
  52.9% of pixels changed — i.e. the knockouts were live.
- Earlier, an eight-variant fog sweep produced identical output. Before
  concluding "fog does nothing", we ran a control that set the sky to pure
  red: the sky changed, 115,572 pixels moved, the target region stayed
  byte-identical. **Only then** was the null a finding.

**Rule: every null result needs a positive control in the same session.**

### 2.5 Prediction beats elimination

Elimination gives you "it is none of these". Prediction gives you proof.

We identified a mystery element by evaluating a CSS gradient's colour at
the measured band's centre line and comparing: **predicted rgb(114.7,
168.1, 223.8) vs measured rgb(114.8, 168.1, 223.8)** — a delta of 0.1, 0.0,
0.0. That is not a coincidence, and no amount of further elimination would
have been as strong.

**When you think you know the cause, predict a number and check it.**

### 2.6 A knob existing is not evidence it reaches the pixels

Three times, a config value that was correctly wired, visibly present in
the style, and slider-controlled turned out **not to affect the region
being measured**:

- Water colour: forcing the uniforms to magenta *and* hiding the water
  plane left the target region byte-identical.
- Lane paint brightness: 0.85 → 0.55 moved the measured paint/asphalt ratio
  1.81× → 1.82×.
- Fog: see §4.

**Before ranking any item by impact, prove the knob owns those pixels.**
Cheapest test: set it to an absurd value (magenta, red, zero) and diff.

### 2.7 Compare like with like, and check the colour space

- We once compared **linear luminance against gamma-space luma** and
  briefly concluded the scene was 4× too dark. Caught by a sanity check.
  Always state which space a number is in.
- **Lighting ratios must be albedo-free.** Sun-vs-shadow on *one surface*
  cancels albedo; the difference of two surfaces does not. A colour
  temperature computed from the sun/shadow *difference* on a tan path gave
  ~4100 K — an artefact of the path being tan, not a light colour.

### 2.8 Discard confounded metrics instead of reporting them

Two measurements were run, judged confounded, and **thrown away**:

- *Contrast vs depth*: near/far luminance bands measured scene content (an
  empty road vs a detailed skyline), not atmosphere.
- *Vignette*: an 8–9% corner falloff was inseparable from the sky's own
  zenith darkening, because sky pixels only exist at the top of frame.

Reporting either would have produced a confident, wrong target. **A
measurement you cannot de-confound is not a weak finding, it is not a
finding.**

### 2.9 Say what the frames cannot tell you

Sun elevation was not extractable: the one usable cast shadow lay on a
ground plane seen by an uncalibrated camera. The honest output was a
**35–55° band**, not a number. Wide honest ranges beat precise invented
ones — the precise number would have been quoted back forever.

### 2.10 Revert what does not move the needle

Two changes were made, measured, found ineffective, and reverted rather
than kept as "probably harmless": a raster fade-duration tweak (no
measurable effect on the drift it targeted) and the lane-paint change
(1.81× → 1.82×). Unproven edits accumulate into a codebase nobody can
reason about.

---

## 3. Engine limits proved (MapLibre GL JS 5.6)

These are specific to the retiring engine, but each was established by
**experiment with a positive control**, and the *shape* of each lesson
transfers.

### 3.1 Fog/atmosphere does not touch fill-extrusion geometry

An eight-variant sweep of `atmosphere-blend`, `fog-ground-blend` and
`horizon-fog-blend` moved building pixels by **less than 0.1 of an RGB
unit**. Control: setting every sky colour to `#ff0000` turned the sky red
and changed 115,572 pixels while the buildings stayed **byte-identical**.

**Consequence:** true aerial perspective — the single largest measured gap,
and the most photographic quality in the reference — is unreachable in this
engine. Distant buildings cannot be washed toward the sky. We closed part
of the gap by lightening buildings globally, and the residual error
plateaued at ~39 units for *every* candidate, because one flat colour ramp
can match near buildings or far ones but never both.

**For Unreal:** this is free. Exponential height fog with a sky-coloured
inscattering term does exactly what the reference shows, including the
horizon-brighter-than-zenith behaviour. It should be among the first things
turned on, and §1.3 gives the numbers to hit.

### 3.2 A grade applied to one element silently excludes everything behind it

The colour grade was `canvas.style.filter = saturate() contrast()
brightness()`. The backdrop gradient was painted on `html, body` — *behind*
the canvas — so it never received the grade. It measured saturation
0.49–0.55 while every rendered surface graded down to ~0.08, making it the
most out-of-band element on screen, against a reference ceiling of 0.341.

It went unnoticed for the whole project because it is only visible where
the canvas is transparent — a band between the sky and the far edge of the
terrain mesh, 5.8% of the frame at street level and 19.1% from altitude.

**The general lesson, which is engine-independent:** *know every element
that contributes pixels, and confirm each one is inside the grade.* Compositing
layers outside the tonemapper is a bug that hides until a camera angle
exposes it. In Unreal the analogue is anything drawn after post-processing —
UMG widgets, custom overlays, editor-only proxies.

### 3.3 The second limit I could not source

The handoff request named two limits: fog-vs-fill-extrusion, and *"a
catalogue line's title is silently discarded"*. **I can only source the
first.** Nothing in this pass involved a catalogue, a listing, or a
discarded title, and I would rather leave a gap here than invent a finding
to fit the label. If it came from another workstream, it belongs in that
project's document; if it is something from this one under a name I do not
recognise, tell me and I will write it up properly.

Other limits this pass *did* establish, in case one of them was meant:

- **A style's `background` layer cannot fill the terrain gap.** Re-enabling
  it changed transparency not at all, because with terrain on it is draped
  on the terrain mesh — it cannot fill a hole caused by that mesh ending.
- **`light.intensity` darkens rather than brightens** the building faces a
  chase camera sees, because they point away from the sun. Raising it to
  0.9 drove distant towers to R=20.
- **Ground materials in satellite mode are photography, not styling.** Water
  colour, road surface and lane paint knobs slide past aerial imagery
  without touching it.

---

## 4. What to carry into the Unreal build

1. **Build the instrument first.** A named, committed, deterministic capture
   rig with a measured noise floor, before the first visual change. Both of
   our determinism bugs would have silently corrupted every verdict.
2. **Take §1 as the target and re-derive nothing.** The numbers are
   measured, provenance is in STYLE.md, and the corrections in its §0 are
   there because a first pass got six of them wrong.
3. **Turn on real height fog early** (§3.1). It is the largest gap here and
   free there.
4. **Audit the post-process chain for anything drawn outside it** (§3.2).
5. **Keep the honest-verdict discipline.** "No visible difference", "this
   made it worse" and "the knob does not reach these pixels" are results.
   Every one of them in this pass prevented a wrong change from shipping —
   most valuably the measurement showing global saturation was *already* at
   the bottom of the reference band, which killed a desaturation pass that
   would have been approved on eyeball and been wrong.

---

## 5. Where the numbers live

| file | contents |
|---|---|
| [STYLE.md](STYLE.md) | The reference measured: full palette, lighting, atmosphere, post, materials, per-frame provenance, and §0's corrections to the first pass |
| [GAP.md](GAP.md) | Game-vs-target audit, ranked, plus the knob-disconnect lesson in its header |
| [PROGRESS.md](PROGRESS.md) | Every change with its shot, FPS and honest verdict — including the reverted and not-attempted ones |
| [QUESTIONS.md](QUESTIONS.md) | Decisions taken instead of stalling, and the blocked-item write-ups |
| `js/config.js` → `LOOK` | Every visual knob, each with a P-panel slider |
| `js/config.js` → `SHOT_PRESETS` | The named capture rigs and their rules |
