# LANES.md — lane counts, widths, markings

## The data reality (audit finding #1)
The vector tiles (OpenFreeMap → OpenMapTiles schema) **do not carry the
OSM `lanes` tag at all** — it is not part of the transportation layer's
schema. Full key sweep across every loaded road feature shows only:
`class, subclass, brunnel, ramp, layer, level, oneway, network, surface,
bicycle, foot, horse, access, service, toll, official, expressway`.
So "lane count follows the data" can only mean: **class + oneway drive a
per-class default table** (the contract's fallback), and the fallback is
global, not occasional. Logged here once instead of per-road at runtime.

## Before (8-road audit, nearest drivable way to each probe point)
| Road | class | oneway | real lanes* | rendered before |
|---|---|---|---|---|
| Van Ness Ave | (probe hit service alley; arterial is `primary`) | 0 | 3+3 | vector line, fixed px width; no markings |
| Market St | service (side lane; main is `secondary`) | 1 | 2-3 | same |
| The Embarcadero | primary (+ramp lane) | 1 | 3+3 | same |
| Lombard St (US-101) | (probe hit service; corridor is `primary`) | 0 | 3+3 | same |
| 19th Ave (CA-1) | trunk | 1 | 3 per carriageway | same |
| GG approach US-101 | motorway | 1 | 4 | ROADS3D ribbon, fixed 9 m, no markings |
| I-80 Essex ramp | minor/ramp | 0 | 1-2 | ROADS3D ribbon 5.5 m, no markings |
| Sanchez St (residential) | minor | 0 | 1+1 | vector line |
*real lanes from local knowledge — the tiles cannot express this.

## The pipeline (after)
`LANES` config (P-panel sliders for width/brightness/shoulder):
- Per-class defaults — `oneway` total / per-direction for two-way:
  motorway 4/2 · trunk 3/2 · primary 3/2 · secondary 2/1 · tertiary 2/1
  · minor 1/1 · service 1/1 · ramp always 1. Lane width 3.3 m + 0.5 m
  shoulders.
- **ROADS3D ribbons** (bridges/ramps/tunnel corridors): width =
  lanes × 3.3 + shoulders; painted markings emitted with the geometry —
  dashed white between same-direction lanes, solid yellow centreline on
  two-way ways; slight per-section luminance jitter fakes asphalt wear.
- **Hand-built bridge decks**: instanced dashed strips at the real lane
  offsets (3 lanes per side on GG / Bay decks; the existing yellow
  median stays the direction divider).
- **Vector streets**: liberty's px-width road lines become METER-TRUE by
  class (exponential zoom interpolation pinned to real metres at SF's
  latitude), so a primary paints as ~13 m of asphalt instead of a thin
  ribbon; new marking layers add the yellow centreline (two-way
  majors), white centre dash (one-way majors) and ±3.3 m lane dashes on
  multi-lane classes, all minzoom-gated for cost.

## After (same 8 probes — what now renders)
| Road | lanes used (fallback by class+oneway) | width | markings |
|---|---|---|---|
| Van Ness Ave (primary, 2-way) | 2+2 | 14.2 m | yellow centre + ±3.3 m white dashes |
| Market St (secondary/service mix) | 2 | 7.6 m | yellow centre on 2-way stretches |
| The Embarcadero (primary, oneway pair) | 3/carriageway | 10.9 m each | white centre dash + lane dashes |
| Lombard St (primary, 2-way) | 2+2 | 14.2 m | yellow centre + dashes |
| 19th Ave (trunk, oneway pair) | 3 | 10.9 m | centre + lane dashes |
| GG approach (motorway) | 4 | 14.2 m | lane dashes; deck itself: 6 lanes, 4 dashed dividers + yellow median (instanced strips) |
| I-80 Essex ramp (ramp=1) | 1 | 4.3 m ribbon | none (single lane) |
| Sanchez St (minor, 2-way) | 1+1 | 7.6 m | none — unmarked residential, correct |

Driver-height evidence: `shots/lanes_ggdeck.png` (car spans ONE of six
lanes — dashes + yellow median), `lanes_embarcadero.png` (meter-true
arterial + dashes), `lanes_columbus.png`. FPS: 42.3 capture cam (== 42.6
pre-lanes), 59.8 on the marked GG deck. Traffic still drives the
centreline rather than a lane — logged as a future item.
