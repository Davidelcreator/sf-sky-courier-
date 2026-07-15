# STYLE.md — Genie 3 reference look, quantified

Source: 12 kept frames from the Genie 3 Street-View demo (see `ref/`), sampled
with ffmpeg (region crop → average → hex). Overlays (webcam, HUD, captions)
were excluded from every sampled region. Frames span two weather modes —
**bright-overcast** (Vegas strip, park, river-boat) and **clear sun ~40°**
(Ferry plaza, riverside path). Values below say which mode they came from.

The single biggest signature across ALL frames: **low saturation, high value,
heavy aerial haze**. Nothing is vivid. Blacks are lifted. The horizon is
always ~10% from white, even under blue sky.

## 1. Palette (measured averages)

| Element | Hex | RGB | Frame/mode |
|---|---|---|---|
| Sky zenith (clear) | `#a4bade` | 164,186,222 | 111 sunny — *desaturated* blue, not azure |
| Sky w/ cloud sheet | `#e8eff9` | 232,239,249 | 088 sunny-cloud |
| Sky overcast | `#e2f0f8` / `#d8d5db` | 226,240,248 / 216,213,219 | 015 / 137 |
| Horizon haze band | `#9698a1` | 150,152,161 | 015 — warm-gray, hides skyline bases |
| Distant skyline (hazed) | `#7d7d7e` | 125,125,126 | 137 — pure neutral gray |
| Asphalt (w/ sky sheen) | `#4b5d78` | 75,93,120 | 015 — road *reflects sky*, blue-gray |
| Pavement/plaza (sun) | `#c2bbb5` | 194,187,181 | 088 — warm pale gray |
| Dirt path (sun) | `#d9b498` | 217,180,152 | 111 — warm tan |
| Path in shadow | `#887468` | 136,116,104 | 111 — ~60% of sunlit value, slightly cool |
| Building, white tower | `#959ca5` | 149,156,165 | 015 — even "white" reads gray-blue |
| Building, cream stone | `#7e7c76` | 126,124,118 | 088 (shaded side) |
| Sandstone monument | `#94745d` | 148,116,93 | 060 |
| Glass tower (day) | `#8a8882` | 138,136,130 | 111 — glass ≈ sky gray, low contrast |
| Foliage, trees (sun) | `#5e5e40` | 94,94,64 | 111 — **olive**, R≈G! not "game green" |
| Foliage, dark tree | `#5f563f` | 95,86,63 | 060 |
| Grass (park) | `#696344` | 105,99,68 | 060 — dry olive-khaki |
| Lake water (overcast) | `#a09ea0` | 160,158,160 | 060 — mirror of sky, neutral |
| River water (overcast) | `#64605e` | 100,96,94 | 137 — brown-gray, NOT blue |

Derived accents:
- Shadow color ≈ multiply sunlit by 0.55–0.65 with slight cool shift (+3 blue).
- Highlight/cloud whites clip around `#f2f6fb`, never pure #fff across a region.

## 2. Lighting

- **Sun elevation:** ~35–45° in sunny frames (shadow of jogger ≈ 1.2× body
  length → ~40°). *Guess ±10°.* Azimuth varies per scene — not a signature;
  pick anything that lights our streets nicely.
- **Color temperature:** neutral noon daylight, ~5800–6500 K. Sunlit tan path
  (217,180,152) vs its shadow (136,116,104) → sun adds roughly +80R +64G +48B:
  warm but *mild*. Nothing golden-hour about it.
- **Intensity/contrast:** sun:shade luminance ratio ≈ 1.7:1 (low for a game;
  real-camera auto-exposure look). Overcast frames are almost shadowless.
- **Shadow softness:** contact-sharp, blurring visibly with distance
  (penumbra ~0.5 m at 5 m). Real-sun behavior.
- **Shadow color:** never black — darkest sampled foliage is rgb(95,86,63);
  ambient/sky fill is strong (ambient ≈ 55–65% of key).
- **Sky contribution:** blue-gray fill from above; horizontal surfaces
  (roads) visibly pick up sky color (asphalt sample is literally blue-gray).

## 3. Atmosphere

- **Haze color:** `#9698a1`→`#c9ccd4` gradient (denser = lighter). Warm-gray,
  NOT blue fog.
- **Density:** strong. Objects ~1 km away lose ≈40% contrast toward haze;
  ~3 km ≈ 70%; skyline at 5 km+ is a flat silhouette 1–2 steps from sky value
  (137: skyline 125,125,126 vs sky 216,213,219).
- **Height falloff:** haze hugs the ground; sky directly overhead stays
  cleaner. *Eyeballed, no direct measurement.*
- **Aerial perspective:** hue converges to the haze gray — distant foliage and
  distant buildings become the SAME color family. This flattening is the
  main "photo" cue.

## 4. Post / camera

- **Exposure:** protect-the-highlights auto-exposure; clouds sit ~0.93–0.97,
  midtones centered ~0.45–0.55.
- **Contrast curve:** gentle S with LIFTED blacks (floor ≈ rgb(28,26,24) in
  the deepest underpass shadows; typical floor rgb(60,55,45)).
- **Saturation:** globally LOW — measured foliage/building/sky samples average
  ~20–35% saturation where a stylized game would run 60–90%. Roughly
  saturation ×0.65 vs our current look. *Estimate.*
- **Bloom:** none visible (tiny veiling glare around clipped cloud cores at
  most). Threshold ~0.95, intensity ~0.1 if implemented at all.
- **Vignette:** none detectable.
- **Grain:** mild luminance noise (video/codec), σ ≈ 2–3/255. Optional.
- **Chromatic aberration:** none visible.
- **Sharpening:** none — the opposite: neural render + 1080p video gives a
  slight overall SOFTNESS (≈0.5 px blur equivalent) and smeared fine detail.
- **Motion blur:** present when moving fast (racing frames); absent standing.

## 5. Materials

- **Asphalt:** mid-gray albedo (~0.35), smooth-worn, weak broad specular from
  sky (roughness ~0.7 acting like sheen); tire-polished lanes slightly darker.
- **Painted lines:** off-white `#c8c8c2`, low contrast vs our pure yellow/white.
- **Glass:** behaves as a sky mirror at grazing angles; facade panels read
  flat gray-blue (138,136,130) with window grid barely 10–15 units darker.
  Specular highlights rare; roughness ~0.15 but env-driven, not sun-sparkle.
- **Painted metal (rails/poles):** desaturated, matte, roughness ~0.6.
- **Vegetation:** olive albedo (see palette), zero specular sparkle, soft
  self-shadowed clumps.
- **Concrete/stone:** albedo 0.5–0.65, fully matte.

## 6. What a real-time MapLibre+three renderer can and can't copy

Achievable cheaply: palette shift, desaturation, haze/aerial perspective,
sky gradient, sun angle/temp, lifted blacks, softer contrast, water color,
foliage olive tint, subtle full-screen grain/softness.
NOT cheaply achievable (flag, don't chase): true soft-penumbra shadows,
neural "melted detail" texture, per-surface auto-exposure, motion blur,
glass env-reflections on extruded boxes. These need custom shaders/post
pipelines — ask before attempting (per the rules).

## 7. Two-mode note

The reference alternates overcast and clear-sun. Both share the haze/desat
signature. Recommendation: target **clear-sun ~40°** as default (closest to
a playable "day" and to frames 088/111), keep values for overcast as a
possible second preset later.
