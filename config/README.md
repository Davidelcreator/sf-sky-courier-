# /config — the tuning surface

Nothing in here is compiled. The engine `fetch()`es these files at boot, so
**edit a number, reload the page, feel the change**. No rebuild, no engine edit.

| File                      | Owns                                                       |
| ------------------------- | ---------------------------------------------------------- |
| `game.json`               | physics, match rules, hitstop/shake, camera, AI, animation  |
| `characters/<id>.json`    | one fighter: stats, frame data, special                     |
| `game.json` → `roster`    | which character files load, and their select-screen order   |

Any key whose name is `$comment` is documentation and is ignored by the loader.

## Adding a character

1. Drop `config/characters/rook.json` next to the others.
2. Add `"rook"` to `roster` in `game.json`.

That is the whole process — the engine contains zero character-specific logic.

## Character schema

```jsonc
{
  "id": "rook",              // must match the filename
  "name": "Rook",            // shown on the select screen
  "color":  "#hex",          // torso / limbs
  "accent": "#hex",          // gloves, boots, trim, projectile glow
  "skin":   "#hex",          // head and forearms

  "health": 100,             // starting HP; also the HUD bar's full width
  "speed":  0.062,           // world units per logic frame while walking
  "jumpV":  0.34,            // upward velocity impulse on jump
  "weight": 1.0,             // divides incoming knockback — heavier moves less
  "scale":  1.0,             // rig scale multiplier

  "moves": {
    // Frame data is the contract. startup → active → recovery, in 60Hz frames.
    // The hitbox only exists during `active`; you are helpless during `recovery`.
    //
    // "height" decides which guard stops the move: a LOW attack is blocked only
    // by a crouching guard, a HIGH attack only by a standing one. That is the
    // entire reason low variants exist — without it they are a second animation
    // for the same move. Omit it and a move defaults to HIGH.
    "punch":    { "height": "high", "dmg": 6,  "startup": 4, "active": 3, "recovery": 8,  "range": 1.15, "knock": 0.09, "stun": 12 },
    "kick":     { "height": "high", "dmg": 10, "startup": 7, "active": 4, "recovery": 14, "range": 1.5,  "knock": 0.16, "stun": 18 },

    // Optional. Input as block + the matching button; a character without them
    // simply gets the high version, so older configs keep working.
    "lowPunch": { "height": "low",  "dmg": 4,  "startup": 3, "active": 3, "recovery": 9,  "range": 1.05, "knock": 0.03, "stun": 11 },
    "lowKick":  { "height": "low",  "dmg": 8,  "startup": 9, "active": 4, "recovery": 20, "range": 1.6,  "knock": 0.13, "stun": 18 }
  },

  "special": {
    "name": "Fire Bolt",
    "type": "projectile",    // "projectile" | "lunge" | "beam"
    "dmg": 14,
    "startup": 10,
    "recovery": 22,
    "cooldown": 180,         // frames before it is available again
    "stun": 22,
    "knock": 0.22,

    // One optional block per type, holding only that type's parameters.
    "projectile": { "speed": 0.17, "life": 150, "radius": 0.3, "height": 1.05, "color": "#ff7a29" },
    "lunge":      { "speed": 0.27, "activeFrames": 16, "hitRange": 1.5, "friction": 0.93 },
    "beam":       { "length": 6.0, "activeFrames": 14, "thickness": 0.35, "color": "#9ad6ff" }
  },

  // Optional. Without it you get the procedural rig.
  "model": "/models/humanoid.glb",
  "boneMap": { "Hips": "mixamorigHips" }   // target bone → source bone, for retargeting
}
```

### Attack heights

Four normals, two heights, and a guard that is also a height:

| | crouching guard | standing guard |
| ------------- | --------------- | -------------- |
| **low** attack  | blocked | **clean hit** |
| **high** attack | **clean hit** | blocked |
| **mid** (specials, projectiles) | blocked | blocked |

The defender picks a guard height with the stick — block alone crouches, block
plus away stands — so every attack is a genuine guess. Two rules keep it from
degenerating:

- **Specials are MID.** They already cost a cooldown; making them a coin flip
  too would be punishing twice.
- **Lows pass under an airborne opponent.** Jumping beats a sweep outright,
  which is what stops low pressure from being strictly better than high.

Balance the pair against each other, not in isolation. A low attack should be
worse in damage and better in either speed (`lowPunch`) or reach (`lowKick`),
and `lowKick` should be the most punishable move in the kit — a sweep that is
safe on block has no counterplay.

### Tuning notes

- **`startup` is the whole balance lever.** A 4-frame jab beats a 9-frame kick
  every time you both press at once. Raise it to make a move committal.
- **`recovery` is the punish window.** The difference between the attacker's
  recovery and the defender's `stun` is who gets to act first.
- **`knock` vs `weight`.** Applied knockback is `knock / weight`, so a light
  character is launched further by the same move.
- **`range`** is measured centre-to-centre on X, and is compared against the
  absolute horizontal gap, so it reads the same on both sides of the screen.
