# STYLE.md — Genie 3 reference look, quantified

**Superseded 2026-08-22 (pass 2).** Replaces the 2026-07-16 pass. The old
text is not lost — it is in git history (`git show 0df0e30:STYLE.md`).
Read [§0](#0-what-changed-versus-the-2026-07-16-pass) first: several numbers
in the old pass were wrong, and one thing you should know about the
reference set itself changed the framing of this whole document.

Method: all 12 frames in `ref/` (1920×1080). Overlays masked out
programmatically (see [§7](#7-method-and-what-is-masked)), sample regions
hand-picked and then **visually audited crop-by-crop** — the first pass of
regions had six contaminated boxes (a "palm" that was a building facade, a
"lake" that was the scooter), all re-picked before any number below was
taken. Colour maths done in **linear light** where physics is involved
(lighting ratios, luminance), sRGB hex quoted for eyeballing.

---

## 0. What changed versus the 2026-07-16 pass

### 0.1 The reference set is the SAME one — it was never replaced

The brief said the old docs came from "an earlier reference set". They did
not. `ref/` holds the same 12 frames the previous pass measured:

- File mtimes are all `2026-07-14 22:40`, **two days before** the old
  STYLE.md (`2026-07-16 09:43`).
- The old doc's own scene list ("Vegas strip, park, river-boat / Ferry
  plaza, riverside path") matches these 12 frames exactly.
- The old doc cites frames 015, 060, 088, 111, 137 by number — all present,
  all showing what it says they show.

There is a **second** set, `ref2/` (17 frames, `ferry_*` + `misc_*`, dated
2026-07-16), which is what DETAIL_GAP.md / TEXTURE_GAP.md were built from.
If "the new reference set" meant `ref2/`, say so and I will redo this
against those frames. **This pass analyses `ref/` as instructed.**

So this document is not "new frames, new numbers". It is **the same frames,
measured more carefully**, and that is where its value is: the old pass got
several things wrong.

### 0.2 Corrections to the old numbers

| Item | Old pass said | Measured now | Why it matters |
|---|---|---|---|
| Sky zenith | `#a4bade`, one value | Strong vertical gradient: true zenith `#90b1db` (sat **0.34**), mid-sky `#a6bddc`, low sky `#b0c2da` (sat **0.19**) | Old value was *mid-sky* labelled as zenith. Sky is **more saturated at top** than we've been building. |
| Sun : shade | 1.7 : 1 | **2.27 : 1** (linear, albedo-free) | We are lighting ~30% flatter than the reference. |
| Grain | σ ≈ 2–3/255 | σ ≈ **0.02–0.86/255** | Overstated ~5×. `LOOK.grainOpacity 0.25` is almost certainly too much. |
| Foliage saturation | ~0.30 | **0.27–0.57** (grass 0.48–0.57) | Old pass over-desaturated foliage. The *hue* finding (R≈G olive) was right. |
| Facade/window contrast | "grid barely 10–15 units darker" | **83–135/255** internal contrast | Badly understated. Facades are not flat. |
| Road markings | `#c8c8c2` off-white | `#8392a8` / `#c0bcc4` / `#8a93a7`, only **1.1–1.7× asphalt** | Bluer and far lower contrast than assumed. |
| Vignette | "none detectable" | ~8–9% corner falloff, **but confounded** — see §4 | Still treat as negligible; now with a number and a caveat. |
| Global saturation | "×0.65 of ours" (relative, estimated) | **absolute mean 0.157**, range 0.076–0.247 | An absolute target beats a relative guess. |

### 0.3 What the old pass got right

Olive foliage with R≈G; water never blue; lifted blacks; heavy aerial
haze; neutral ~6000 K daylight; no chromatic aberration; a genuinely soft
source. Those all survive re-measurement.

---

## 1. Palette

All values are means over hand-picked, visually-audited regions. `sat` is
HSV saturation `(max−min)/max`. Frame number in the last column.

### 1.1 Sky

| Element | Hex | RGB | sat | Frame |
|---|---|---|---|---|
| Clear zenith (top of frame) | `#90b1db` | 144,177,219 | 0.341 | 111 y35–75 |
| Clear sky, upper-mid | `#97b4dd` | 151,180,221 | 0.317 | 111 y85–125 |
| Clear sky, mid | `#a6bddc` | 166,189,220 | 0.247 | 111 y185–225 |
| Clear sky, low (toward horizon) | `#b0c2da` | 176,194,218 | 0.193 | 111 y245–285 |
| Clear blue, other frames | `#b3ceef` / `#c0d5ee` | 179,206,239 / 192,213,238 | 0.25 / 0.19 | 093 / 080 |
| Cloud sheet, lit | `#f5f9fc` | 245,249,252 | 0.030 | 088 y140–180 |
| Bright overcast | `#f1f2f1` / `#efedea` | 241,242,241 / 239,237,234 | 0.03 / 0.04 | 043 / 027 |
| Flat overcast, neutral | `#d0ced1` | 208,206,209 | 0.020 | 137 |
| Overcast, soft | `#e6e5ea` / `#e1e2e8` | 230,229,234 / 225,226,232 | 0.02 / 0.03 | 051 / 066 |

**The sky gradient is the headline.** On a clear day saturation nearly
halves from top of frame to the horizon (0.34 → 0.19) while luminance
*rises* (Ylin 0.424 → 0.530). Overcast skies are almost perfectly neutral
(sat 0.02) — chroma there is a bug, not a feature.

### 1.2 Horizon haze and distance

| Element | Hex | RGB | sat | Frame |
|---|---|---|---|---|
| Horizon haze band | `#979ea2` | 151,158,162 | 0.087 | 015 |
| Horizon band, overcast | `#afb0b2` | 175,176,178 | 0.018 | 137 y360–410 |
| Distant skyline, clear day | `#a2afc0` / `#96a2ab` | 162,175,192 / 150,162,171 | 0.15 / 0.17 | 111 / 124 |
| Distant skyline, hazed out | `#dcdbdd` | 220,219,221 | **0.009** | 137 |
| Distant bridge | `#d2dadd` | 210,218,221 | 0.056 | 088 |

### 1.3 Road, pavement, ground

| Element | Hex | RGB | sat | Frame |
|---|---|---|---|---|
| Asphalt, near, sky-reflecting | `#5e6b82` | 94,107,130 | 0.282 | 015 |
| Asphalt, near | `#6c757b` / `#788193` | 108,117,123 / 120,129,147 | 0.13 / 0.18 | 027 / 043 |
| Asphalt, far | `#798596` | 121,133,150 | 0.194 | 015 |
| Lane paint | `#8392a8` / `#c0bcc4` / `#8a93a7` | — | — | 015 / 027 / 043 |
| Plaza concrete, sunlit | `#b9b4ac` | 185,180,172 | 0.068 | 088 |
| Plaza concrete | `#aaa192` / `#737c82` | 170,161,146 / 115,124,130 | 0.14 / 0.12 | 093 / 080 |
| Concrete path, overcast | `#a39a94` | 163,154,148 | 0.097 | 066 |
| Tan path, sunlit | `#d6b496` | 214,180,150 | 0.301 | 111 |
| Tan path, sunlit | `#c7ad92` | 199,173,146 | 0.266 | 124 |
| **Tan path, in shadow** | `#937c6d` | 147,124,109 | 0.251 | 111 |

**Asphalt is blue.** In every road sample B > G > R — the road is mostly
reflecting sky, not showing its own albedo. Luminance sits in a narrow
94–121 band.

### 1.4 Buildings

| Element | Hex | RGB | sat | Frame |
|---|---|---|---|---|
| "White" tower, overcast | `#b1b6ba` | 177,182,186 | 0.064 | 015 |
| Distant white building | `#e7e9e9` | 231,233,233 | 0.032 | 027 |
| Glass tower, clear day | `#a2afc0` / `#96a2ab` | 162,175,192 / 150,162,171 | 0.15 / 0.17 | 111 / 124 |
| Stone facade, lit | `#948b7c` | 148,139,124 | 0.196 | 080 |
| Stone facade, shaded | `#84796e` | 132,121,110 | 0.200 | 088 |
| Stone facade | `#8d8375` | 141,131,117 | 0.213 | 093 |
| Sandstone, warm | `#6a5743` | 106,87,67 | 0.425 | 060 |
| Dark building mass | `#43453d` | 67,69,61 | 0.183 | 137 |

Note `#b1b6ba`: a white hotel reads **gray-blue**, B > G > R. And `#e7e9e9`
at distance — a building hazed to within 3% of sky value.

### 1.5 Foliage — the strongest single signature

| Element | Hex | RGB | sat | Frame |
|---|---|---|---|---|
| Palm, sunlit | `#5d5949` | 93,89,73 | 0.268 | 088 |
| Trees, sunlit | `#8d8c73` | 141,140,115 | 0.354 | 111 |
| Trees, sunlit | `#6f6c3c` | 111,108,60 | 0.470 | 124 |
| Willow, shaded | `#625a36` | 98,90,54 | 0.513 | 066 |
| Grass, overcast | `#888849` | **136,136,73** | 0.478 | 051 |
| Grass, sunlit | `#848b3d` | 132,139,61 | 0.569 | 066 |
| Foliage, hazed at distance | `#9c9a93` | 156,154,147 | 0.139 | 137 |
| Palm, backlit + hazed | `#88908a` | 136,144,138 | 0.107 | 015 |

**R ≈ G in every single sample** — `136,136,73` is exact. This is olive,
not green. A game's `hsl(0.29, …)` puts G well above R and reads instantly
fake. But note the correction from §0.2: near foliage is **not** low
saturation (0.27–0.57). It is saturated *olive*. Only distance desaturates
it (0.11–0.14), which is haze doing the work, not the material.

### 1.6 Water — never blue

| Element | Hex | RGB | sat | B−R | Frame |
|---|---|---|---|---|---|
| Bay, overcast | `#787672` | 120,118,114 | 0.065 | **−6** | 137 |
| Lagoon, overcast | `#827d73` | 130,125,115 | 0.183 | **−15** | 060 |
| Lagoon w/ reflections | `#7e7259` | 126,114,89 | 0.300 | **−37** | 051 |

B < R in all three. Water takes the colour of what it reflects (gray sky,
warm stone) and none of the "ocean blue" a game reaches for by default.

### 1.7 Shadow and highlight

- **Shadow** is not a colour, it is a *ratio* — see §2.2. On the one clean
  sun/shade pair (`111`, same tan path): `#d6b496` → `#937c6d`.
- **Highlight** ceiling: Y_p99 lands at 226–255 across frames. Sunny frames
  (088, 015) genuinely clip; overcast frames top out ~230.

---

## 2. Lighting

### 2.1 Sun angle — honestly not measurable from these frames

I could not extract a trustworthy sun elevation. The one usable cast shadow
(the runner in `111`) lies on a ground plane receding from an uncalibrated
camera, so image-space shadow length does not convert to a sun angle
without camera intrinsics I do not have. The old pass's "~40°, guess ±10°"
was an eyeball, and I can't improve on it honestly.

What I *can* say: shadows are **short relative to their casters** and
contact-sharp, which rules out low-angle light. Anything in the **35–55°**
band is consistent with the frames. Azimuth varies scene to scene and is
not a signature — pick whatever lights our streets well.

**This is a "frames are ambiguous" item, per the brief. Don't let anyone
quote a precise sun elevation from this document.**

### 2.2 Sun-to-ambient ratio — this one is solid

Measured on a single surface (sunlit tan path vs its own cast shadow),
so **albedo cancels completely**:

```
shadow / sunlit, per channel (linear):   R 0.435   G 0.439   B 0.498
luminance ratio sun : shade          =   2.27 : 1
ambient as fraction of the lit value =   ~44%
```

Two things follow:

1. **Ambient is very strong** — a shadow keeps 44% of the lit value. This
   is why nothing in the reference reads "contrasty".
2. **Ambient is bluer than the sun.** Blue is retained **+14.6%** more than
   red in shadow. Modest, but it is the sky filling the shadow, and it is
   why shadows must never be neutral-dark or black.

### 2.3 Colour temperature

Estimated from near-neutral man-made surfaces (concrete, painted stone).
**Assumes those surfaces are spectrally flat, which is only approximately
true** — treat as ±several hundred K:

| Surface | Hex | CCT |
|---|---|---|
| Sunlit plaza concrete (088) | `#b9b4ac` | ~5900 K |
| Plaza concrete (093) | `#aaa192` | ~5400 K |
| Concrete path, overcast (066) | `#a39a94` | ~5700 K |
| White tower, overcast (015) | `#b1b6ba` | ~7000 K |
| Distant white building (027) | `#e7e9e9` | ~6600 K |

**Target ~6000 K, drifting to 6500–7000 K under overcast.** Neutral
daylight. Nothing golden-hour anywhere in the set.

Do **not** use the direct-sun CCT you might compute from the sun/shadow
difference in `111` (it comes out ~4100 K): that surface is a warm tan
path, and albedo does not cancel in the difference, only in the ratio.
That number is an artefact, not a light colour.

---

## 3. Atmosphere

### 3.1 Aerial perspective — the dominant effect

Distant objects converge onto the sky value. Measured as a distant object
against the sky immediately around it:

| Frame | Distant object | Sky | Luminance delta | Mean RGB delta |
|---|---|---|---|---|
| 137 | `#dcdbdd` skyline | `#d0ced1` | **+14.3%** | 12.3 / 255 |
| 111 | `#a2afc0` skyline | `#96b3dd` | −4.9% | 15.1 / 255 |
| 088 | `#d2dadd` bridge | `#e3edf7` | −17.2% | 20.4 / 255 |
| 124 | `#96a2ab` skyline | `#939aa3` | +10.7% | **6.5 / 255** |

A whole city skyline sits **6–20 units out of 255** from the sky behind it.
That is the number to hit.

### 3.2 The horizon is brighter than the zenith

In the overcast frame `137`, the haze band at the horizon (`#dcdbdd`,
Y 220) is **brighter than the sky above it** (`#d0ced1`, Y 208). Haze
scatters light *toward* you near the horizon. A fog model that only
darkens or greys with distance will miss this; the horizon should
*brighten and desaturate* together.

### 3.3 Height falloff

Still eyeballed, still not directly measurable from these frames: haze
clearly hugs the ground and thins overhead (§1.1 shows the zenith holding
saturation 0.34 while the low sky drops to 0.19). I have a gradient
measurement in the *vertical sky* but no way to separate "haze density vs
altitude" from "sky colour vs viewing angle" in a single-camera frame.
Treat height falloff as a free artistic parameter, not a measured one.

### 3.4 Contrast-vs-depth: measurement attempted, discarded

I measured RMS contrast in near/mid/far horizontal bands and got
*decreasing* contrast toward the viewer (111: far 47.6, mid 38.8, near
22.7). That is **not** an atmospheric result — the near band in that frame
is empty flat path and the far band is full of buildings and trees. The
metric measured scene content, not haze. **Discarded rather than reported
as a finding.** §3.1 is the trustworthy haze number.

---

## 4. Post / camera

| Property | Measured | Confidence |
|---|---|---|
| Black floor (Y p01) | **21–72** — never reaches 0 | high |
| Y p05 | 39–94 | high |
| Midtone (Y p50) | **135–185** — well above 128 | high |
| Y p95 | 202–253 | high |
| Highlight (Y p99) | 226–255 | high |
| Global saturation, mean | **0.157** (range 0.076–0.247) | high |
| Global saturation, median | 0.038–0.287 | high |
| Grain (high-pass σ, r=0.8px) | **0.02–0.86 / 255** → negligible | high |
| Chromatic aberration | **0–1 px** → none | high |
| Edge softness (10–90% rise) | **3–12 px** on hard building/sky edges | medium |
| Vignette | ~8–9% corner falloff — **confounded** | low |
| Bloom | none isolated | low |

**Exposure/curve.** Blacks lifted (floor 21–72, typically ~50), midtones
placed high (135–185), highlights allowed to clip in sun. That is a
protect-nothing, expose-for-the-scene video camera, not a game's neutral
ramp.

**Grain: the correction that matters.** At a 0.8 px high-pass the flattest
sky patches sit at σ 0.02–0.29 and flat sunlit ground at σ 0.04–0.24. The
larger figures in my raw data (σ 2.57–5.77 on water at r=3.0) are *real
image detail* — ripples — not noise. The old pass's σ 2–3 was measuring
texture and calling it grain. **The reference is effectively grain-free.**

**Vignette: why I'm not giving you a number to implement.** Pooling
sky-classified pixels across all 12 frames shows relative luminance falling
from 1.00 near frame centre to 0.915 at r=0.74. But sky pixels only exist
in the *top* of frame, so "large radius" is mostly "high up" — and §1.1
shows the sky genuinely darkens toward the zenith on its own. The falloff I
measured is at least partly the sky's own gradient. **Not separable with
this data. Treat vignette as 0 unless you want it for taste.**

**Softness is real.** Even single-row profiles across a hard building/sky
boundary give a 10–90% rise of 3–12 px. This is a neural render re-encoded
to 1080p video: soft, with smeared fine detail and **no sharpening halos**.

---

## 5. Materials

| Material | Measured behaviour |
|---|---|
| **Asphalt** | Albedo hidden under sky reflection: B > G > R always, Y 94–121. Behaves like a broad rough sheen (roughness ~0.7), not a mirror. |
| **Lane paint** | `#8392a8`–`#c0bcc4`. Only **1.14–1.65×** asphalt luminance. Desaturated, often blue-gray. Never pure white, never high contrast. |
| **Glass towers** | Internal contrast **83–131/255** within a single face (111: 83, 124: 131). Reads as gray-blue overall (`#a2afc0`) but is *not* flat — the window grid is strongly visible. No sun-sparkle specular anywhere in the set. |
| **Stone / concrete** | Internal contrast ~135/255 (093). Matte, no specular. Warm-neutral, sat 0.10–0.21. |
| **Sandstone** | `#6a5743`, sat 0.425 — the most saturated architecture in the set. |
| **Vegetation** | Olive, R≈G, sat 0.27–0.57 near / 0.11–0.14 hazed. Zero specular. Soft self-shadowed clumps. |
| **Water** | sat 0.065–0.300, B < R always. Mirror of sky and surroundings; gentle, near-white glitter only. |

---

## 6. Two weather modes

The set splits cleanly, and both share the low-saturation + heavy-haze
signature:

- **Clear sun** (088, 111, 124, 093, 080): blue sky with a strong vertical
  gradient, real cast shadows at 2.27:1, warm sunlit ground.
- **Bright overcast** (015, 027, 043, 051, 060, 066, 137): near-neutral sky
  (sat 0.02–0.06), almost shadowless, everything converging on gray.

**Recommendation unchanged from the old pass:** target **clear sun** as the
default playable day. Overcast is a plausible second preset later; it is
*easier* to hit (it is mostly "turn saturation and shadows down") but it
makes a driving game look dead.

---

## 7. Method, and what is masked

Every frame carries overlays that must never be sampled. Scene content
occupies `x 52–1850, y 29–1022`; outside that is letterbox and a
**video-editor timeline ruler** down the right edge.

Masked in all frames:
- **Presenter webcam PiP** — `x ≥ 1355, y ≥ 526` (rounded rect, bottom-right)
- **Caption** "Genie 3 / Created using Google Street View imagery" —
  `x 600–1345, y 928–1022`

Masked additionally:
- **Racing HUD** (frames 015, 027, 043): speed readout top-left, lap
  counter top-right, speedometer dial bottom-left
- **Video transport UI** (frames 027, 043, 051): pause button, scrubber,
  timecode

For global statistics, pixels above HSV saturation 0.45 were also dropped
as "vivid foreground game object". **Caveat:** in the two park frames (051,
066) that filter removes ~29% of pixels because the *grass itself* is that
saturated, so those two frames' global stats are biased low. The palette
numbers in §1 come from hand-picked regions and are unaffected.

Every sample region is listed in PROGRESS.md (pass-2 entry) with its exact
pixel box, so any number in this document can be re-derived independently.
The measurement scripts themselves are not committed — they are analysis
tooling, not game code, and the brief said stop before touching the repo's
code. Say the word and I'll add them as `tools/style_measure.py`.

---

## 8. What this engine can and cannot copy

**Cheap and achievable now:** palette, saturation target, black-floor lift,
sky vertical gradient, horizon brightening, aerial-perspective convergence,
sun/ambient ratio and shadow tinting, foliage olive shift, water hue,
lane-paint contrast, global softness.

**Not cheaply achievable — flag, do not start without asking:** true
per-pixel distance fog on MapLibre buildings and terrain (no fog API in
5.6), soft-penumbra shadows, glass environment reflections on
fill-extrusion, per-surface auto-exposure, motion blur, and the neural
"melted detail" texture. These need shader or architecture work.
