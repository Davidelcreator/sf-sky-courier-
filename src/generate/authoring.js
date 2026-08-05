/**
 * Character authoring: the JSON contract an LLM must satisfy, plus a
 * keyword-driven mock that satisfies it without one.
 *
 * CHARACTER_SCHEMA_PROMPT is the thing to send to the model. It is written as
 * instructions rather than as a bare schema because the *invariants* are what
 * matter — a config with legal types but nonsense frame data produces a
 * character that is either unplayable or unbeatable.
 */

export const CHARACTER_SCHEMA_PROMPT = `
Return ONLY a JSON object describing a 2.5D fighting-game character. No prose,
no markdown fence.

{
  "id": "lowercase-slug",
  "name": "Display Name",
  "tagline": "four to six words",
  "color": "#rrggbb",   // main body colour
  "accent": "#rrggbb",  // gloves, trim, projectile glow
  "skin": "#rrggbb",
  "health": 90-130,
  "speed": 0.042-0.070,   // world units per frame
  "jumpV": 0.27-0.36,
  "weight": 0.85-1.45,    // divides incoming knockback
  "scale": 0.92-1.15,
  "moves": {
    // Four normals. "height" is the whole point: a LOW attack is only blocked
    // by a crouching guard and a HIGH attack only by a standing one, so the
    // pair is a genuine 50/50 the opponent has to guess.
    "punch":    { "height":"high", "dmg":5-9,  "startup":3-7,  "active":2-4, "recovery":7-13,  "range":1.0-1.35, "knock":0.07-0.13, "stun":10-16 },
    "kick":     { "height":"high", "dmg":9-15, "startup":6-11, "active":3-5, "recovery":12-20, "range":1.35-1.7, "knock":0.14-0.22, "stun":16-22 },
    // The crouching jab is the fastest move you have: least damage, least reach.
    "lowPunch": { "height":"low",  "dmg":4-7,  "startup":3-6,  "active":2-4, "recovery":8-14,  "range":0.95-1.25,"knock":0.03-0.06, "stun":9-14 },
    // The sweep reaches furthest and is the most punishable thing in the kit.
    "lowKick":  { "height":"low",  "dmg":8-13, "startup":8-13, "active":3-5, "recovery":17-26, "range":1.5-1.8,  "knock":0.11-0.18, "stun":15-21 }
  },
  "special": {
    "name": "Move Name",
    "type": "projectile" | "lunge" | "beam",
    "dmg": 12-20, "startup": 8-14, "recovery": 20-30,
    "cooldown": 150-260, "stun": 20-28, "knock": 0.2-0.32,
    // include ONLY the block matching "type":
    "projectile": { "speed":0.13-0.20, "life":120-180, "radius":0.25-0.36, "height":0.9-1.2, "color":"#rrggbb" },
    "lunge":      { "speed":0.22-0.30, "activeFrames":12-20, "hitRange":1.3-1.7, "friction":0.90-0.95 },
    "beam":       { "length":5-7, "activeFrames":10-18, "thickness":0.3-0.45, "color":"#rrggbb" }
  }
}

Balance rules — these matter more than the numbers being "interesting":
- Frame counts are 60Hz logic frames and are the real balance levers.
- Faster startup must be paid for: lower damage, shorter range, or less health.
- A heavy character (weight > 1.2) should have slower startup and more health.
- recovery must exceed the opponent's likely stun on block, or the move is safe
  on block and therefore spammable with no counterplay.
- Keep the total of health + damage output roughly comparable to a character
  with health 100, a 4-frame jab for 6, and a 7-frame kick for 10.
- A low attack must be worse than its high counterpart in damage, and better in
  either speed (lowPunch) or reach (lowKick) — otherwise there is no reason to
  ever press the high one and the mixup collapses.
- lowKick recovery should be the longest in the kit. A sweep that is safe on
  block has no counterplay.
`.trim();

const HUES = {
  fire: ['#ff5a2b', '#ffd166'], flame: ['#ff5a2b', '#ffd166'], burn: ['#ff4d2d', '#ffb347'],
  ice: ['#5fd0ff', '#d9f6ff'], frost: ['#5fd0ff', '#d9f6ff'], water: ['#3aa9d6', '#bfefff'],
  storm: ['#7a5cff', '#c6b8ff'], thunder: ['#ffd93d', '#fff5b8'], lightning: ['#ffd93d', '#fff5b8'],
  shadow: ['#3b2f52', '#9a7fd6'], dark: ['#332b45', '#8e79c8'], void: ['#241f38', '#7f6dd0'],
  nature: ['#4caf62', '#c9f2a8'], leaf: ['#4caf62', '#c9f2a8'], poison: ['#7fbf3f', '#e0ff9a'],
  steel: ['#8d97ad', '#dfe6f3'], iron: ['#7c8598', '#ced7e6'], metal: ['#8d97ad', '#dfe6f3'],
  gold: ['#e0b437', '#ffe9a8'], blood: ['#b3202f', '#ff7a7a'], neon: ['#ff3caa', '#8ffff2'],
};

const has = (text, ...words) => words.some((w) => text.includes(w));

/**
 * Turn a free-text prompt into a schema-valid config.
 *
 * Deliberately simple and readable — it exists so the generation flow is
 * genuinely end-to-end testable before any API key exists, and so there is a
 * reference for what "good output" looks like.
 */
export function deriveConfigFromPrompt(prompt, { modelUrl } = {}) {
  const t = String(prompt || '').toLowerCase();

  // --- archetype
  const heavy = has(t, 'heavy', 'giant', 'tank', 'golem', 'brute', 'titan', 'armour', 'armor', 'stone');
  const light = has(t, 'fast', 'quick', 'nimble', 'ninja', 'assassin', 'agile', 'swift', 'shadow');

  const weight = heavy ? 1.38 : light ? 0.88 : 1.05;
  const health = heavy ? 126 : light ? 92 : 104;
  const speed = heavy ? 0.046 : light ? 0.068 : 0.058;
  const scale = heavy ? 1.14 : light ? 0.95 : 1.02;

  // --- palette
  let color = '#8d97ad';
  let accent = '#dfe6f3';
  for (const [word, [c, a]] of Object.entries(HUES)) {
    if (t.includes(word)) { color = c; accent = a; break; }
  }

  // --- special type: what the prompt actually implies
  const type = has(t, 'beam', 'laser', 'ray', 'blast')
    ? 'beam'
    : has(t, 'charge', 'rush', 'dash', 'lunge', 'tackle', 'ram', 'shoulder')
      ? 'lunge'
      : 'projectile';

  const specialName = titleCase(
    firstMatch(t, ['fire', 'ice', 'frost', 'storm', 'thunder', 'shadow', 'void', 'steel', 'poison', 'neon']) ?? 'Force',
  ) + ' ' + (type === 'beam' ? 'Beam' : type === 'lunge' ? 'Rush' : 'Bolt');

  // Heavier characters pay for their health with slower startup.
  const punchStartup = heavy ? 6 : light ? 3 : 5;
  const kickStartup = heavy ? 10 : light ? 6 : 8;

  const special = {
    name: specialName,
    type,
    dmg: heavy ? 19 : light ? 13 : 16,
    startup: heavy ? 13 : light ? 9 : 11,
    recovery: heavy ? 28 : light ? 21 : 24,
    cooldown: heavy ? 250 : light ? 165 : 200,
    stun: heavy ? 27 : light ? 21 : 24,
    knock: heavy ? 0.31 : light ? 0.21 : 0.26,
  };

  if (type === 'projectile') {
    special.projectile = {
      speed: light ? 0.19 : 0.15, life: 150, radius: 0.3, height: 1.05, color: accent,
    };
  } else if (type === 'lunge') {
    special.lunge = {
      speed: heavy ? 0.29 : 0.25, activeFrames: heavy ? 18 : 14,
      hitRange: 1.5, friction: 0.93,
    };
  } else {
    special.beam = { length: 6, activeFrames: 14, thickness: 0.36, color: accent };
  }

  const name = deriveName(prompt);

  return {
    id: slug(name),
    name,
    tagline: heavy ? 'Slow, heavy, hits like a wall'
           : light ? 'Fast hands, thin margins'
           : 'Balanced pressure',
    color,
    accent,
    skin: '#e0b48c',
    health,
    speed,
    jumpV: heavy ? 0.29 : light ? 0.35 : 0.32,
    weight,
    scale,
    moves: {
      punch: {
        height: 'high',
        dmg: heavy ? 8 : light ? 5 : 6,
        startup: punchStartup, active: 3,
        recovery: heavy ? 12 : light ? 8 : 10,
        range: heavy ? 1.28 : 1.15,
        knock: heavy ? 0.12 : 0.09,
        stun: heavy ? 15 : 12,
      },
      kick: {
        height: 'high',
        dmg: heavy ? 14 : light ? 9 : 11,
        startup: kickStartup, active: 4,
        recovery: heavy ? 18 : light ? 13 : 15,
        range: heavy ? 1.62 : 1.48,
        knock: heavy ? 0.21 : 0.16,
        stun: heavy ? 21 : 18,
      },
      // Lows are derived from the highs rather than authored independently, so
      // a generated character keeps its archetype: the crouching jab trades
      // damage for speed, the sweep trades recovery for reach.
      lowPunch: {
        height: 'low',
        dmg: heavy ? 6 : light ? 4 : 5,
        startup: Math.max(3, punchStartup - 1), active: 3,
        recovery: heavy ? 13 : light ? 9 : 11,
        range: heavy ? 1.2 : 1.06,
        knock: heavy ? 0.05 : 0.04,
        stun: heavy ? 13 : 11,
      },
      lowKick: {
        height: 'low',
        dmg: heavy ? 12 : light ? 8 : 10,
        startup: kickStartup + 1, active: 4,
        recovery: heavy ? 24 : light ? 18 : 20,
        range: heavy ? 1.74 : 1.6,
        knock: heavy ? 0.17 : 0.13,
        stun: heavy ? 20 : 17,
      },
    },
    special,
    ...(modelUrl ? { model: modelUrl } : {}),
    generated: true,
    prompt: String(prompt || ''),
  };
}

function deriveName(prompt) {
  const words = String(prompt || '')
    .replace(/[^a-zA-Z\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w.toLowerCase()));
  if (!words.length) return 'Recruit';
  const pick = words.slice(0, 2).map(titleCase).join(' ');
  return pick.length > 18 ? titleCase(words[0]) : pick;
}

const STOP = new Set([
  'the', 'and', 'with', 'that', 'this', 'from', 'who', 'has', 'for', 'a', 'an',
  'character', 'fighter', 'make', 'create', 'generate', 'give', 'please',
]);

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'generated';
const firstMatch = (t, list) => list.find((w) => t.includes(w));
