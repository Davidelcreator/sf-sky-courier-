# /animations — the shared clip set

Clips live here, are authored **once** against one source rig, and get
retargeted onto every character at load time. That is the point of the whole
pipeline: a model that did not exist when the clips were made still fights.

## Adding a clip

1. Drop `uppercut.glb` (or `.fbx`) in this folder.
2. Add an entry to `manifest.json`:
   ```json
   { "as": "uppercut", "url": "/animations/uppercut.glb", "clip": "mixamo.com" }
   ```
3. Add a matching move to a character's `moves` block in `/config`.

`as` is the name the engine looks up. `ClipAnimator` resolves each fighter state
against a candidate list, so `idle`, `stance` and `fightidle` all satisfy the
idle state — check `CLIP_CANDIDATES` in
`src/characters/rig/ClipAnimator.js` for the full list.

## What the engine expects

| Clip name | Used for                    | Looping |
| --------- | --------------------------- | ------- |
| `idle`    | standing (**required**)     | yes     |
| `walk`    | moving on the ground        | yes     |
| `jump`    | airborne                    | yes     |
| `block`   | blocking and blockstun      | yes     |
| `hit`     | hitstun                     | no      |
| `ko`      | knocked out                 | no      |
| `punch`   | the punch move              | no      |
| `kick`    | the kick move               | no      |
| `special` | the special move            | no      |

Only `idle` is genuinely required. Anything missing falls back to the
procedural poser **on the same skeleton**, so a character with two clips is
still fully playable — see the animation ladder in `CharacterLoader.js`.

## Attack clip timing does not matter

Frame data in `/config` is the single source of truth for when a hitbox is
live. Attack clips are time-scaled at playback so their full length equals
`startup + active + recovery`. Author a punch at whatever speed reads well;
the engine will fit it. This means you can retune a move's frame data without
re-exporting anything.

## Retargeting requirements

The source rig and the target rig both need recognisable humanoid bone names.
`retarget.js` normalises away the usual noise (`mixamorig:`, `Armature|`,
`bip01_`, separators, case) and accepts many spellings per bone
(`LeftForeArm` / `L_lowerarm` / `leftElbow` all resolve to the same joint).

If a rig uses names nothing like the conventions, add an explicit map to the
character's JSON — it overrides the automatic mapping bone by bone:

```json
"boneMap": { "spine_02": "Spine1", "upperarm_l": "LeftArm" }
```

Keys are **target** bone names, values are **source** bone names.

These bones must map or the retarget is refused (and the character falls back
to the poser rather than T-posing): hips, both upper legs, both lower legs,
both upper arms.

## Regenerating the bundled rig

`public/models/humanoid.glb` is generated, not hand-made:

```bash
npm run make:humanoid   # rebuild the rig and its 9 clips
npm run test:retarget   # prove clips still retarget onto a foreign skeleton
```
