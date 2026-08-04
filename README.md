# Sky Fighter 🥊

A browser-based 2.5D fighting game — Three.js + Vite, no framework, phone-ready
over HTTPS. Real frame data, three-phase procedural animation with a retargeting
pipeline on top, and every tunable number in JSON.

```bash
npm install
npm run dev      # http://localhost:5173 (also listens on your LAN for phones)
npm test         # 76 headless checks: fight rules + retargeting
npm run build    # -> dist/
```

---

## ⚠️ On the reference prototype

**`fighting-game.jsx` was not present in this repo, in any upload directory, or
anywhere on the session filesystem.** Everything here was built from the written
specification in the task description, which was detailed enough to work from.

That means one thing is *not* guaranteed: the exact numeric constants. Frame
data, damage, speeds, lerp rates and AI weights are my values chosen to match
the described feel and the conventions of the genre — not the artifact's.
Every behaviour described in the brief is implemented and verified (see
`npm test`), but if you still have the artifact, reconciling it is quick,
because **every one of those numbers lives in `/config`** and none of them are
duplicated in code. Diff the JSON, not the engine.

Specifically worth checking against the original:

| Where | What to compare |
| ----- | --------------- |
| `config/characters/*.json` | frame data, damage, ranges, health/speed/weight |
| `config/game.json` → `combat` | chip 25%, blockstun 60%, hitstop 2–6 curve |
| `config/game.json` → `animation.phaseLerp` | 0.34 / 0.90 / 0.18 — the feel |
| `config/game.json` → `ai` | reaction frames, aggression |
| `src/characters/rig/PoseAnimator.js` | the pose constants themselves |

Two places where I made a judgement call the brief did not settle, both easy to
flip:

- **Attacks are edge-triggered with a 4-frame input buffer**
  (`game.json` → `input.bufferFrames`). Level-triggering turns a held key into
  an auto-jab; a strict edge drops inputs pressed just before recovery ends.
  Set it to `0` for frame-perfect input.
- **Attacks are ground-only.** Jumping is a movement tool, not an attack
  platform. Air normals would be an additive change in `Fighter._tickFree`.

---

## Controls

### Keyboard (all rebindable, saved to this device)

| Action | Player 1 | Player 2 |
| ------ | -------- | -------- |
| Move   | `A` / `D` | `←` / `→` |
| Jump   | `W`      | `↑` |
| Block  | `S` (hold) | `↓` (hold) |
| Punch  | `J`      | `Num 1` |
| Kick   | `K`      | `Num 2` |
| Special| `L`      | `Num 3` |
| Menu   | `Esc`    | |

### Touch

A left analog stick and three arc-arranged buttons, both fully multi-touch —
walking while punching is two independent pointer streams, not one contended
one.

- **Stick X** is analog: nudge it to creep, push it to walk.
- **Stick up** jumps, **stick down** blocks. Dead zone 0.3, rescaled so the
  first live input is not a jolt.
- **Button slots** are swappable in Controls → Touch buttons.

Landscape is strongly preferred. Portrait works, but fitting both fighters
horizontally forces a wide FOV, which necessarily makes them small — the game
says so with a hint rather than pretending otherwise.

### Gamepad

Any controller the browser reports in the standard mapping works with no setup.
Left stick and D-pad both steer; A jumps, B blocks, X punches, Y kicks, RT is
special. Button indices are rebindable through the same store as the keyboard.

---

## Tuning guide

Nothing in `/config` is compiled. Edit a number, reload, feel the change.
`/config/README.md` documents the full character schema.

### The five numbers that decide how the game feels

| Knob | File | What it does |
| ---- | ---- | ------------ |
| `moves.*.startup` | character | The whole balance lever. A 4-frame jab beats a 7-frame kick every time you both press at once. |
| `moves.*.recovery` vs opponent `stun` | character | The punish window. The difference between these two is who acts first. |
| `animation.phaseLerp.strike` | `game.json` | `0.9` — how hard the strike pose snaps on active frames. Lower it and punches go limp. |
| `animation.phaseLerp.recovery` | `game.json` | `0.18` — how lazily the fighter unwinds. This is most of the "weight". |
| `combat.hitstop` | `game.json` | 2–6 frame freeze, lerped by damage. The cheapest way to give a hit mass. |

### Common adjustments

**"The CPU is too hard/easy"** — `game.json` → `ai`. `reactionFrames` is how
long the AI takes to *notice* a move before it may react-block, so lower is
harder (below ~5 it blocks even jabs). `attackChance` and
`decisionIntervalFrames` control how relentless it is.

**"Hits feel mushy"** — raise `combat.hitstop.maxFrames`, then
`combat.shake.magnitude`. Check `shake.heavyDamageThreshold`: only hits at or
above it shake the camera, deliberately, so jabs stay readable.

**"Fighters are too small / too far"** — `camera.baseDistance`, and
`camera.comfortSeparation`, which is the gap `baseDistance` already frames.
Only separation *beyond* it pulls the camera back.

**"Blocking is too strong/weak"** — `combat.blockChipMultiplier` (0.25),
`blockStunMultiplier` (0.6), `blockKnockbackMultiplier` (0.45).

**"I want to A/B the animation systems"** — set `animation.useClips: false` to
force the procedural poser even where clips retargeted fine.

### Adding a character

1. Drop `config/characters/rook.json` next to the others.
2. Add `"rook"` to `roster` in `game.json`.

That is the entire process. The engine contains zero character-specific logic —
no name, no switch, nothing. Add `"model": "/models/whatever.glb"` and it loads
the model and retargets the shared clip set onto it instead of using the box rig.

---

## Architecture map

```
config/                     the tuning surface — fetched at runtime, never compiled
  game.json                 physics, match, hitstop/shake, camera, AI, animation
  characters/*.json         one fighter each: stats, frame data, special
animations/
  manifest.json             the shared clip set; retargeted onto every character
public/models/humanoid.glb  generated rigged test humanoid (tools/make-humanoid-glb.js)

src/
  main.js                   boot + screen flow
  Game.js                   the orchestrator; owns the update order

  engine/                   pure logic — no three.js, no DOM, unit-testable
    loop.js                 fixed 60Hz timestep, render decoupled
    Fighter.js              state machine + frame data
    combat.js               hit resolution: blocking, chip, stun, hitstop curves
    physics.js              push-apart, corner clamp
    Match.js                rounds, clock, banners
    camera.js               midpoint follow + separation zoom + shake
    ai.js                   approach/attack/block/retreat, reaction-blocking
    world.js                scene, lights, stage
    math.js                 easing, clamps, seeded PRNG

  characters/               everything character-shaped
    CharacterLoader.js      config -> fightable character; the animation ladder
    AnimationLibrary.js     loads + caches the shared clip set
    rig/
      ProceduralRig.js      the box fighter, two-segment limbs
      PoseAnimator.js       the phased poser (windup -> strike -> follow-through)
      SkeletonPoseTarget.js runs that poser on ANY humanoid GLB skeleton
      ClipAnimator.js       plays retargeted clips, time-scaled to frame data
      retarget.js           SkeletonUtils wrapper + automatic bone mapping

  input/                    keyboard / touch / gamepad -> one intent object
  ui/                       HUD + screens, all DOM overlay
  fx/                       hitstop, screen shake, sparks, projectiles
  generate/                 Phase 2 seam: Tripo + Claude providers (stubbed)

tools/
  make-humanoid-glb.js      regenerates the bundled rig and its 9 clips
  verify-retarget.js        proves retargeting works onto a foreign skeleton
  verify-frame-data.js      proves the fight rules
```

### The update order (and why)

One logic step, in `Game.update()`:

1. **hit-stop** — if frozen, nothing below runs, including the round clock
2. input / AI
3. **match gate** — neutralises input during intro and round-end
4. fighters tick
5. bodies resolve — push-apart, *then* corner clamp
6. combat resolves — melee, then projectiles
7. events applied — hitstop, shake, sparks, input-buffer consumption
8. animators advance, **on the logic clock**

Combat resolving *after* movement is what makes range checks agree with what the
player can see. Push-apart before the corner clamp is what makes corner pressure
pin rather than overlap. Animators on the logic clock is what freezes them
during hit-stop.

### The animation ladder

Each character stops at the first rung that works, and every fall is reported in
the Controls screen's diagnostics — a rig that quietly dropped a rung is visible
rather than mysterious.

1. **Retargeted clips** — a GLB plus the shared clip set, retargeted onto its
   skeleton via `SkeletonUtils.retargetClip`. Attack clips are time-scaled so
   their length equals `startup + active + recovery`: **frame data is the source
   of truth and animation follows it**, so you can retune a move without
   re-exporting anything.
2. **The procedural poser on the imported skeleton** — the model loaded but its
   clips would not retarget. Same three-phase timing, same two-segment arcs,
   applied directly to its bones.
3. **The procedural poser on the built-in box rig** — no model, or it failed.

Rung 2 is what makes the fallback real rather than a consolation prize, and it
needs one non-obvious thing: poses are authored in one convention (limbs hang
along −Y, +Z is forward) but an imported rig's bones point wherever the artist
left them. Each bone gets a change of basis computed once at bind time:

```
restDir = normalize(childBone.position)
qAlign  = rotation taking canonicalDir -> restDir
bone.q  = bindQuat * (qAlign * qPose * qAlign⁻¹)
```

Spines point **+Y** while limbs point **−Y**, so the canonical direction is
per-bone. Sharing one direction makes the torso alignment antiparallel and
`setFromUnitVectors` has to invent an arbitrary axis — the upper body then
twists about something random.

### Retargeting gotchas (all three fail silently)

Documented at the top of `src/characters/rig/retarget.js`, and each one produces
a character that T-poses with no error:

1. `options.names` maps **target bone → source bone**. Backwards, and unmatched
   bones are simply skipped.
2. `options.hip` must be the **source-side** name — it is compared *after* the
   name map is applied.
3. Emitted tracks are named `.bones[Name].quaternion`, which only resolve when
   the `AnimationMixer` is rooted on the **SkinnedMesh** — not the scene, not
   the group, not the GLTF root.

`retarget.js` refuses rather than half-working: if hips, both upper legs, both
lower legs or both upper arms fail to map, it throws and the character drops a
rung.

---

## Phase 2 — generated characters

The seam is built and running on mocks. `Generate` on the title screen takes a
text prompt and returns a playable fighter today: the mock model provider
returns the bundled rigged humanoid (so it exercises the real retarget path),
and the mock config provider derives schema-valid stats from the prompt's words.

To go live, implement the two methods marked `TODO(phase-2)` and swap the
providers in — nothing downstream changes:

```js
new GenerationPipeline({
  loader,
  modelProvider:  new TripoModelProvider(),   // src/generate/providers.js
  configProvider: new ClaudeConfigProvider(),
})
```

- `TripoModelProvider` already implements the submit → poll → resolve loop; only
  the HTTP call is stubbed. **Ask Tripo for a rigged humanoid** — an unrigged
  mesh has no skeleton, so retargeting has nothing to target.
- `CHARACTER_SCHEMA_PROMPT` in `src/generate/authoring.js` is what to send to
  Claude. It states the balance *invariants*, not just the types: a config with
  legal types but nonsense frame data is unplayable or unbeatable.
- Both providers default to a serverless endpoint (`/.netlify/functions/…`)
  rather than the vendor API directly. **An API key in client JS is a published
  key.**

The whole integration surface is one call:

```js
await loader.loadGenerated({ modelUrl, config });   // retargets + registers
```

---

## Deploying to Netlify

`netlify.toml` is committed and needs no dashboard configuration: build
`npm run build`, publish `dist`, SPA fallback, and cache headers that keep
`/config` revalidating (it is the tuning surface) while hashed assets are
immutable.

```bash
netlify deploy --prod      # or connect the repo and push
```

`base: './'` in `vite.config.js` keeps every asset URL relative, so deploy
previews on a subpath work identically to the production root.

---

## Tests

```bash
npm test              # both suites
npm run test:frames   # 56 checks — the fight rules
npm run test:retarget # 20 checks — the retargeting pipeline
```

The engine's logic layer imports no three.js and touches no DOM specifically so
`test:frames` can run in Node against the real config files.

`test:retarget` is not a smoke test: it retargets onto a deliberately hostile
rig (`mixamorig:` prefixes, longer limbs, different bone order) and asserts the
hand actually **travels** 0.25+ units forward — the usual retargeting failure is
silently producing zero-motion tracks, which a "did it return a clip" check
would happily pass. It also asserts the target keeps its own proportions rather
than copying poses, and that a non-humanoid rig throws instead of T-posing.

---

## What happened to SF Sky Courier

The previous game in this repo is intact in `legacy-sky-courier/`, and the tag
**`pre-fighter`** on `main` is the exact commit before any of this. The
fighting game needs the repo root — Vite wants `index.html` there, and `/src`,
`/config` and `/animations` are top-level by design. Nothing was deleted:

```bash
git checkout pre-fighter        # the courier, exactly as it was
```
