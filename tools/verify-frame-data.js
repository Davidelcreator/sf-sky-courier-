/**
 * Headless verification of the ported fight rules.
 *
 * Run: npm run test:frames
 *
 * The engine's logic layer imports no three.js and touches no DOM, which is
 * exactly so this can exist. Every assertion below is a behaviour the brief
 * asked to be ported without regression, checked against the real config files.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Fighter, STATE, PHASE, HEIGHT } from '../src/engine/Fighter.js';
import { resolveCombat, isBlocking, hitstopFrames, shakeMagnitude } from '../src/engine/combat.js';
import { resolveBodies } from '../src/engine/physics.js';
import { Match, PHASE as MATCH_PHASE } from '../src/engine/Match.js';
import { AIController } from '../src/engine/ai.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const readJSON = (p) => JSON.parse(readFileSync(resolve(HERE, '..', p), 'utf8'));

const GAME = readJSON('config/game.json');
const BLAZE = readJSON('config/characters/blaze.json');
const TITAN = readJSON('config/characters/titan.json');

let failures = 0;
let group = '';
const ok = (l) => console.log(`  [32mPASS[0m ${l}`);
const bad = (l, d) => { failures++; console.log(`  [31mFAIL[0m ${l}${d ? ` — ${d}` : ''}`); };
const assert = (c, l, d) => (c ? ok(l) : bad(l, d));
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const section = (name) => { group = name; console.log(`\n${name}`); };

const NEUTRAL = { moveX: 0, jump: false, block: false, punch: false, kick: false, special: false };
const intent = (o) => ({ ...NEUTRAL, ...o });

function pair(cfgA = BLAZE, cfgB = TITAN, gapX = 1.0) {
  const a = new Fighter(cfgA, GAME, { side: 0, x: -gapX / 2, facing: 1 });
  const b = new Fighter(cfgB, GAME, { side: 1, x: gapX / 2, facing: -1 });
  return [a, b];
}

function step(a, b, ia = NEUTRAL, ib = NEUTRAL) {
  const ctx = { events: [], spawnProjectile() {}, spawnBeam() {} };
  a.tick(ia, b, ctx);
  b.tick(ib, a, ctx);
  resolveBodies(a, b, GAME);
  resolveCombat(a, b, GAME, ctx);
  return ctx.events;
}

// ---------------------------------------------------------------------------
section('frame data');

{
  const [a, b] = pair();
  const m = BLAZE.moves.punch;

  step(a, b, intent({ punch: true }));
  assert(a.state === STATE.ATTACK, 'punch enters the attack state');
  assert(a.phase === PHASE.STARTUP, 'starts in startup', a.phase);

  // Advance to the last startup frame — still no hit.
  let hitFrame = -1;
  for (let f = 1; f < m.startup + m.active + m.recovery + 2; f++) {
    const events = step(a, b);
    if (events.some((e) => e.type === 'hit') && hitFrame < 0) hitFrame = f;
  }

  assert(hitFrame >= m.startup && hitFrame <= m.startup + m.active,
    `hitbox is live only during active frames (startup ${m.startup}, active ${m.active})`,
    `connected on frame ${hitFrame}`);

  assert(a.state === STATE.IDLE,
    'returns to idle after startup+active+recovery', a.state);
}

{
  // Frame advantage: the faster jab must win a simultaneous exchange.
  const [a, b] = pair(BLAZE, TITAN, 1.0);
  const events = [];
  for (let f = 0; f < 12; f++) {
    events.push(...step(a, b,
      f === 0 ? intent({ punch: true }) : NEUTRAL,
      f === 0 ? intent({ punch: true }) : NEUTRAL));
  }
  const first = events.find((e) => e.type === 'hit');
  assert(first?.attacker === a,
    'the 4-frame jab beats the 6-frame jab on a simultaneous press',
    first ? `winner was ${first.attacker.cfg.name}` : 'nobody connected');
}

// ---------------------------------------------------------------------------
section('attack heights and guard heights');

// b starts on the right facing left, so "back" (away from a) is +1 for b.
const GUARD_HIGH = intent({ block: true, moveX: 1 });
const GUARD_LOW = intent({ block: true });

/** Fire one attack and return its hit event, if any. */
function runAttack(a, b, attackIntent, defendIntent, maxFrames = 48) {
  let hit = null;
  for (let f = 0; f < maxFrames && !hit; f++) {
    const ev = step(a, b, f === 0 ? attackIntent : NEUTRAL, defendIntent);
    hit = ev.find((e) => e.type === 'hit');
  }
  return hit;
}

{
  const [a, b] = pair();
  b.inputX = 1;
  b.blockHeld = true;
  assert(b.guardHeight === HEIGHT.HIGH, 'block + away stands into a high guard', b.guardHeight);
  b.inputX = 0;
  assert(b.guardHeight === HEIGHT.LOW, 'block alone crouches into a low guard', b.guardHeight);
  b.blockHeld = false;
  assert(b.guardHeight === null, 'not blocking means no guard');
  b.blockHeld = true;
  b.y = 1.5;
  assert(b.guardHeight === null, 'no guard in the air');
}

{
  // block + attack selects the low variant, and still spends the punch buffer.
  const [a, b] = pair();
  const ctx = { events: [], spawnProjectile() {}, spawnBeam() {} };
  a.tick(intent({ punch: true, block: true }), b, ctx);
  assert(a.move === 'lowPunch', 'block + punch selects the low punch', String(a.move));
  const ev = ctx.events.find((e) => e.type === 'startMove');
  assert(ev?.action === 'punch',
    'a low punch still consumes the punch input buffer', String(ev?.action));
  assert(a.moveData.height === HEIGHT.LOW, 'low punch carries LOW height');
}

{
  const [a, b] = pair();
  const ctx = { events: [], spawnProjectile() {}, spawnBeam() {} };
  a.tick(intent({ kick: true, block: true }), b, ctx);
  assert(a.move === 'lowKick', 'block + kick selects the low kick', String(a.move));
  assert(a.moveData.height === HEIGHT.LOW, 'low kick carries LOW height');
}

{
  // A character with no low variants keeps working — the high move comes out.
  const noLows = JSON.parse(JSON.stringify(BLAZE));
  delete noLows.moves.lowPunch;
  const a = new Fighter(noLows, GAME, { side: 0, x: -0.5, facing: 1 });
  const b = new Fighter(TITAN, GAME, { side: 1, x: 0.5, facing: -1 });
  const ctx = { events: [], spawnProjectile() {}, spawnBeam() {} };
  a.tick(intent({ punch: true, block: true }), b, ctx);
  assert(a.move === 'punch',
    'a character with no low variant falls back to the high one', String(a.move));
}

// --- the 2x2 that makes heights mean anything -------------------------------
{
  const [a, b] = pair();
  const hit = runAttack(a, b, intent({ punch: true }), GUARD_HIGH);
  assert(hit?.blocked === true, 'HIGH attack vs HIGH guard -> blocked');
}
{
  const [a, b] = pair();
  const hit = runAttack(a, b, intent({ punch: true }), GUARD_LOW);
  assert(hit && hit.blocked === false, 'HIGH attack vs LOW guard -> clean hit');
}
{
  const [a, b] = pair();
  const hit = runAttack(a, b, intent({ punch: true, block: true }), GUARD_LOW);
  assert(hit?.blocked === true, 'LOW attack vs LOW guard -> blocked');
}
{
  const [a, b] = pair();
  const hit = runAttack(a, b, intent({ punch: true, block: true }), GUARD_HIGH);
  assert(hit && hit.blocked === false, 'LOW attack vs HIGH guard -> clean hit');
}
{
  // Specials are MID: never a coin flip on top of a cooldown.
  const [a, b] = pair(TITAN, BLAZE);
  const hitLow = runAttack(a, b, intent({ special: true }), intent({ block: true }), 60);
  assert(hitLow?.blocked === true, 'MID special is blocked by a low guard');

  const [c, d] = pair(TITAN, BLAZE);
  const hitHigh = runAttack(c, d, intent({ special: true }), intent({ block: true, moveX: 1 }), 60);
  assert(hitHigh?.blocked === true, 'MID special is blocked by a high guard');
}

{
  // A sweep travels along the floor, so leaving the floor beats it outright.
  const [a, b] = pair();
  b.y = 1.4;
  b.vy = 0.05;
  let connected = false;
  for (let f = 0; f < 30; f++) {
    b.y = Math.max(0.9, b.y); // hold them airborne for the whole active window
    const ev = step(a, b, f === 0 ? intent({ kick: true, block: true }) : NEUTRAL);
    if (ev.some((e) => e.type === 'hit')) connected = true;
  }
  assert(!connected, 'a low attack passes under an airborne opponent');
}

// ---------------------------------------------------------------------------
section('blocking, chip damage and stun');

{
  const [a, b] = pair();
  const m = BLAZE.moves.punch;
  const startHP = b.health;

  const hit = runAttack(a, b, intent({ punch: true }), GUARD_HIGH);

  assert(!!hit && hit.blocked, 'a matched guard blocks the hit');
  assert(near(startHP - b.health, m.dmg * GAME.combat.blockChipMultiplier, 1e-6),
    `chip damage is ${GAME.combat.blockChipMultiplier * 100}% of raw`,
    `took ${startHP - b.health}, expected ${m.dmg * GAME.combat.blockChipMultiplier}`);
  assert(b.state === STATE.BLOCKSTUN, 'defender enters blockstun', b.state);
  assert(b.stunFrames === Math.round(m.stun * GAME.combat.blockStunMultiplier),
    'blockstun is the configured fraction of hitstun',
    `${b.stunFrames} vs ${Math.round(m.stun * GAME.combat.blockStunMultiplier)}`);
  assert(a.comboCount === 0, 'a blocked hit does not build combo');
}

{
  const [a, b] = pair();
  b.blockHeld = true;
  b.facing = -1;
  assert(isBlocking(b, a), 'blocks when facing the attacker');
  b.facing = 1;
  assert(!isBlocking(b, a), 'cannot block an attacker behind you');
  b.facing = -1;
  b.y = 1.2;
  assert(!isBlocking(b, a), 'cannot block in the air');
}

{
  // Blockstrings: you stay blocking THROUGH blockstun if you keep holding.
  const [a, b] = pair();
  b.state = STATE.BLOCKSTUN;
  b.stunFrames = 6;
  b.blockHeld = true;
  assert(isBlocking(b, a), 'still blocking while in blockstun (blockstrings work)');
}

// ---------------------------------------------------------------------------
section('hitstun, knockback and weight');

{
  const [a, b] = pair();
  const m = BLAZE.moves.punch;
  for (let f = 0; f < 20; f++) {
    const e = step(a, b, f === 0 ? intent({ punch: true }) : NEUTRAL);
    if (e.some((x) => x.type === 'hit')) break;
  }
  assert(b.state === STATE.HITSTUN, 'clean hit causes hitstun');
  assert(b.stunFrames === m.stun, 'hitstun equals the move\'s stun', `${b.stunFrames}/${m.stun}`);
  assert(b.vx > 0, 'knockback pushes away from the attacker', String(b.vx));
  assert(near(b.vx, m.knock / TITAN.weight, 1e-9),
    'knockback is divided by weight', `${b.vx} vs ${m.knock / TITAN.weight}`);
}

{
  // The same move launches a light character further than a heavy one.
  const light = new Fighter(BLAZE, GAME, { side: 1, x: 1, facing: -1 });
  const heavy = new Fighter(TITAN, GAME, { side: 1, x: 1, facing: -1 });
  const hit = { damage: 10, stun: 18, knock: 0.16, fromX: 0 };
  light.applyHit({ ...hit });
  heavy.applyHit({ ...hit });
  assert(light.vx > heavy.vx,
    'lighter fighters are knocked back further by the same move',
    `${light.vx.toFixed(4)} vs ${heavy.vx.toFixed(4)}`);
}

// ---------------------------------------------------------------------------
section('hit-stop and screen shake');

{
  const h = GAME.combat.hitstop;
  const jab = hitstopFrames(BLAZE.moves.punch.dmg, false, GAME);
  const kick = hitstopFrames(BLAZE.moves.kick.dmg, false, GAME);
  const spec = hitstopFrames(TITAN.special.dmg, false, GAME);

  assert(jab >= h.minFrames && spec <= h.maxFrames,
    `hit-stop stays within ${h.minFrames}-${h.maxFrames} frames`, `${jab}..${spec}`);
  assert(jab < kick && kick < spec,
    'hit-stop scales with hit weight', `jab ${jab}, kick ${kick}, special ${spec}`);
  assert(hitstopFrames(BLAZE.moves.kick.dmg, true, GAME) < kick,
    'blocked hits freeze less than clean ones');

  assert(shakeMagnitude(BLAZE.moves.punch.dmg, false, GAME) === 0,
    'light jabs do not shake the camera');
  assert(shakeMagnitude(BLAZE.moves.kick.dmg, false, GAME) > 0,
    'heavy hits do shake the camera');
  assert(shakeMagnitude(TITAN.special.dmg, false, GAME) >
         shakeMagnitude(BLAZE.moves.kick.dmg, false, GAME),
    'heavier hits shake harder');
}

// ---------------------------------------------------------------------------
section('combo counter');

{
  const [a, b] = pair();
  a.registerHit();
  assert(a.comboCount === 1, 'first hit starts the combo');
  a.registerHit();
  assert(a.comboCount === 2, 'second hit continues it');

  for (let i = 0; i < GAME.combat.comboResetFrames; i++) step(a, b);
  assert(a.comboCount === 0, 'combo resets after the configured window',
    `still ${a.comboCount}`);
}

// ---------------------------------------------------------------------------
section('corner clamp and push-apart');

{
  const [a, b] = pair();
  a.x = -GAME.stage.halfWidth - 3;
  a.vx = -1;
  resolveBodies(a, b, GAME);
  assert(a.x >= -GAME.stage.halfWidth, 'clamped inside the left wall', String(a.x));
  assert(a.vx === 0, 'outward velocity is killed at the wall');
  assert(a.cornered === -1, 'cornered flag is set');
}

{
  // Cornered fighter must not be pushed through the wall.
  const [a, b] = pair();
  a.x = -GAME.stage.halfWidth + 0.1;
  b.x = a.x + 0.05;
  resolveBodies(a, b, GAME);
  const gap = Math.abs(b.x - a.x);
  const minGap = Math.max(GAME.physics.pushApartMinGap, a.radius + b.radius);
  assert(a.x >= -GAME.stage.halfWidth - 1e-9,
    'the cornered fighter stays inside the wall', String(a.x));
  assert(gap >= minGap - 1e-6,
    'bodies are fully separated even in the corner', `gap ${gap.toFixed(3)} < ${minGap}`);
}

{
  // You can jump over someone: no push-apart when vertically clear.
  const [a, b] = pair();
  a.x = 0; b.x = 0.05; a.y = 2.5;
  const beforeA = a.x, beforeB = b.x;
  resolveBodies(a, b, GAME);
  assert(near(a.x, beforeA) && near(b.x, beforeB),
    'no push-apart when one fighter is overhead');
}

// ---------------------------------------------------------------------------
section('specials');

{
  const [a, b] = pair(TITAN, BLAZE);
  step(a, b, intent({ special: true }));
  assert(a.state === STATE.ATTACK && a.move === 'special', 'special starts');
  assert(a.specialCooldown === TITAN.special.cooldown, 'cooldown is set on use');

  // Lunge drives the body forward once it reaches active frames.
  for (let f = 0; f < TITAN.special.startup; f++) step(a, b);
  assert(a.phase === PHASE.ACTIVE, 'reaches active frames', a.phase);
  assert(Math.abs(a.vx) > 0.1, 'the lunge drives the body forward', String(a.vx));

  // Cannot special again while on cooldown.
  const c = new Fighter(TITAN, GAME, { side: 0, x: 0, facing: 1 });
  c.specialCooldown = 50;
  const ctx = { events: [], spawnProjectile() {}, spawnBeam() {} };
  c.tick(intent({ special: true }), b, ctx);
  assert(c.state !== STATE.ATTACK, 'special is refused while on cooldown');
}

// ---------------------------------------------------------------------------
section('match flow');

{
  const [a, b] = pair();
  const match = new Match(GAME, [a, b]);
  const ctx = { events: [] };

  assert(match.phase === MATCH_PHASE.INTRO, 'starts in the intro phase');
  assert(match.banner?.text === 'ROUND 1', 'shows the round banner', match.banner?.text);
  assert(match.roundsToWin === 2, 'best of three');
  assert(match.timeSeconds === GAME.match.roundTimeSeconds,
    '60 second round clock', String(match.timeSeconds));

  const gated = match.tick([intent({ punch: true }), NEUTRAL], ctx);
  assert(gated[0].punch === false, 'input is neutralised during the intro');

  for (let f = 0; f < GAME.match.introFrames + 2; f++) match.tick([NEUTRAL, NEUTRAL], ctx);
  assert(match.phase === MATCH_PHASE.FIGHT, 'intro ends and the round starts');
  assert(match.banner === null, 'banner clears when the fight starts');

  // KO ends the round and awards it.
  b.health = 0;
  b.state = STATE.KO;
  match.tick([NEUTRAL, NEUTRAL], ctx);
  assert(match.phase === MATCH_PHASE.ROUND_END, 'a KO ends the round');
  assert(match.banner?.text === 'K.O.', 'KO banner', match.banner?.text);
  assert(match.wins[0] === 1, 'the surviving fighter takes the round');
}

{
  // Time-out awards the round on remaining health fraction.
  const [a, b] = pair();
  const match = new Match(GAME, [a, b]);
  const ctx = { events: [] };
  match.phase = MATCH_PHASE.FIGHT;
  match.timer = 1;
  a.health = a.maxHealth * 0.8;
  b.health = b.maxHealth * 0.4;
  match.tick([NEUTRAL, NEUTRAL], ctx);
  assert(match.banner?.text === 'TIME', 'time-out banner', match.banner?.text);
  assert(match.wins[0] === 1, 'higher health fraction wins on time');
}

{
  // Winning roundsToWin rounds ends the match.
  const [a, b] = pair();
  const match = new Match(GAME, [a, b]);
  const ctx = { events: [] };
  match.wins = [1, 0];
  match.phase = MATCH_PHASE.FIGHT;
  b.health = 0; b.state = STATE.KO;
  match.tick([NEUTRAL, NEUTRAL], ctx);
  assert(match.matchWinner === 0, 'second round win ends the match');
}

// ---------------------------------------------------------------------------
section('AI');

{
  const [a, b] = pair(BLAZE, TITAN, 6.0);
  const ai = new AIController(GAME, 4242);
  let approached = false;
  for (let f = 0; f < 90; f++) {
    const ib = ai.think(b, a);
    if (ib.moveX !== 0 && Math.sign(ib.moveX) === Math.sign(a.x - b.x)) approached = true;
    step(a, b, NEUTRAL, ib);
  }
  assert(approached, 'the AI closes distance when far away');
  assert(Math.abs(a.x - b.x) < 6.0, 'the gap actually shrank',
    `gap ${Math.abs(a.x - b.x).toFixed(2)}`);
}

{
  // Reaction-blocking: a slow telegraphed move is blockable, a 4-frame jab is not.
  const ai = new AIController(GAME, 99);
  const [a, b] = pair(BLAZE, TITAN, 1.0);

  // Simulate a long startup being visible for longer than reactionFrames.
  a.state = STATE.ATTACK;
  a.move = 'special';
  a.moveData = a.moveDataFor('special');
  a.moveFrame = 2;

  let blocked = false;
  for (let f = 0; f < GAME.ai.reactionFrames + 6; f++) {
    const i = ai.think(b, a);
    if (i.block) blocked = true;
  }
  assert(blocked, 'the AI reaction-blocks a telegraphed special');

  const ai2 = new AIController(GAME, 99);
  const [c, d] = pair(BLAZE, TITAN, 1.0);
  c.state = STATE.ATTACK;
  c.move = 'punch';
  c.moveData = c.moveDataFor('punch');
  let earlyBlock = false;
  // Only as many frames as the jab actually lasts before it connects.
  for (let f = 0; f < BLAZE.moves.punch.startup; f++) {
    if (ai2.think(d, c).block) earlyBlock = true;
    c.moveFrame++;
  }
  assert(!earlyBlock,
    'a 4-frame jab lands before the AI can react (fast moves stay un-reactable)');
}

// ---------------------------------------------------------------------------
console.log(
  failures === 0
    ? '\n[32mall fight-rule checks passed[0m\n'
    : `\n[31m${failures} check(s) failed[0m\n`,
);
process.exitCode = failures ? 1 : 0;
