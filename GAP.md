# GAP.md — current game vs the Genie 3 target look

Current baseline: `shots/before.png` (deterministic capture — Embarcadero at
Broadway, satellite basemap, golden-hour lighting, GFX defaults). Target
values: see [STYLE.md](STYLE.md). Current values sampled the same ffmpeg way.

## The headline gaps (view `shots/before.png` beside `ref/frame_088.png`)

| Item | Game now | Genie target | Gap |
|---|---|---|---|
| Sky zenith | `#6590c6` saturated cobalt | `#a4bade` pale gray-blue | way too saturated/dark |
| Sky horizon | `#c5b6a2` warm peach band (golden hour) | `#9698a1`→white haze | wrong hue entirely |
| Aerial haze | none — Bay Bridge crisp at 3 km | 70% contrast loss at 3 km | biggest realism gap |
| Water | `#494f55`→navy, high-sat shader blue | `#a09ea0` overcast / gray-green | too blue, too dark |
| Sunlight | warm golden (deliberate golden-hour) | neutral ~6000 K, ~40° elevation | whole scene reads "sunset postcard" |
| Buildings | height-tinted tans/olives/mauves, saturated | pale desaturated grays `#959ca5`/`#7e7c76` | too colorful |
| Foliage | vivid green HSL(0.29, 0.55) | olive `#5e5e40` (R≈G!) | classic "game green" |
| Global saturation | high everywhere | ~×0.65 of ours | needs a grade |
| Blacks | true darks in shadows | lifted (floor ≈ rgb(50,48,44)) | needs a grade |
| Softness/grain | crisp renderer output | slight video softness, σ≈2 grain | minor polish |

## Ranked plan — visual-impact-per-effort, cheap first

Every knob lands in ONE new config object (`LOOK` in config.js) with a debug
panel + sliders (rule from the brief), so David can override my taste live.

1. **Neutral-day lighting + sky** *(config values only — trivial, huge)*
   Replace golden-hour `map.setLight`/`setSky` colors + three.js sun/ambient
   with neutral ~6000 K, sun elevation ~40°. Sky zenith → `#a4bade`-family,
   horizon → haze gray `#b9bcc4`. Kills the "sunset postcard" signature.
2. **Global color grade via CSS filter on the canvas** *(one line of CSS,
   huge)* — `saturate(0.7) contrast(0.95) brightness(1.04)` approximates
   Genie's desaturation + lifted blacks for the ENTIRE frame (map, three.js
   objects, labels) with zero shader work and zero FPS cost (GPU composite).
   Sliders: saturation / contrast / brightness / blur(softness).
3. **Water color** *(shader constants, big)* — deep navy → neutral gray-green
   sky-mirror (`#8f9496` family), kill the saturated blue + tone down glitter.
4. **Aerial haze, the achievable 80%** *(moderate)*:
   - three.js `scene.fog` (haze gray) on OUR objects (bridges, trees, traffic);
   - horizon haze band via setSky colors (done in item 1);
   - slight global desat (item 2) already flattens distance contrast.
   FLAG: true per-pixel distance fog on MapLibre buildings/terrain is not
   available in 5.6 (no fog API) — that last 20% needs an engine-level
   change; I will NOT attempt it without asking.
5. **Building palette** *(config colors, big)* — swap the 4 height-ramps in
   `BUILDING_COLORS` to the measured desaturated set (white-gray, cream-gray,
   glass-gray, brick-gray hazed).
6. **Foliage olive** *(two HSL constants, medium)* — trees/bushes to olive
   hue ~0.17, sat ~0.30; tree-count untouched.
7. **Sun-angle-consistent fake shadows** *(config, small)* — align the
   fake-shadow direction/length with the new 40° sun; slightly lower opacity
   (soft-shadow illusion).
8. **Grain + softness pass** *(small)* — optional: 0.3px blur in the CSS
   filter + a static noise-texture overlay div at ~4% opacity. Cheap, subtle.
9. **Vector-mode road colors** *(low priority)* — satellite basemap is the
   shipping default and its roads already read photographic; only recolor
   vector roads if David wants map-mode to match too.

## Expensive — flagged, will NOT start without explicit go-ahead
- Real-time soft shadows for map buildings (needs custom deferred pass or
  MapLibre v6 experimental — big rewrite, FPS risk on phones).
- Glass/env reflections on extruded buildings (custom shader on the
  fill-extrusion layer — not exposed in 5.6).
- Motion blur / per-surface auto-exposure / neural-texture look (post
  pipeline; three.js EffectComposer can't wrap MapLibre's shared context
  cleanly — would need a full offscreen-composite rearchitecture).

## Verification loop (already in place)
`npm run shot` → `shots/<name>.png`, deterministic (PSNR 106 dB between
runs), fails non-zero if the game doesn't reach a loaded scene — used as the
launch check before every commit. Results log: PROGRESS.md.
