import { STATE, PHASE, HEIGHT } from './Fighter.js';
import { clamp, lerp, invLerp, sign } from './math.js';

/**
 * Hit resolution — the rules layer.
 *
 * This module decides *whether* something connected and *what it costs*. It
 * never touches the renderer: it pushes descriptive events onto `ctx.events`
 * and the orchestrator turns those into hitstop, shake and sparks. That split
 * is why the same rules can run headless in a test.
 */

/**
 * Is the defender successfully blocking a hit coming from `att`?
 *
 * Blocking is a held state, not a move — which is what makes blockstrings work:
 * you stay blocking through blockstun as long as you keep holding it. You
 * cannot block in the air, mid-attack, or while already being hit, and you must
 * be facing the attacker.
 */
export function isBlocking(def, att, move) {
  if (!def.blockHeld) return false;
  if (!def.grounded) return false;
  if (def.state === STATE.HITSTUN || def.state === STATE.KO) return false;
  if (def.state === STATE.ATTACK) return false;

  const dir = sign(att.x - def.x);
  if (dir !== 0 && dir !== def.facing) return false;

  // Guard height has to match the attack's. A sweep goes under a standing
  // guard; a high strike goes over a crouching one. MID (specials, projectiles,
  // and anything with no height at all) is blocked by either — a move that
  // already costs a cooldown should not also be a coin flip.
  const guard = def.guardHeight;
  if (!guard) return false;

  const height = move?.height ?? HEIGHT.MID;
  return height === HEIGHT.MID || height === guard;
}

/** Hitstop length in frames: 2..6, lerped by damage. Blocked hits stop less. */
export function hitstopFrames(damage, blocked, game) {
  const h = game.combat.hitstop;
  const t = invLerp(h.damageAtMin, h.damageAtMax, damage);
  let f = lerp(h.minFrames, h.maxFrames, t);
  if (blocked) f *= h.blockedMultiplier ?? 0.6;
  return Math.max(1, Math.round(clamp(f, 1, h.maxFrames)));
}

/** Camera shake magnitude for a hit — 0 for anything below the heavy threshold. */
export function shakeMagnitude(damage, blocked, game) {
  const s = game.combat.shake;
  if (damage < s.heavyDamageThreshold) return 0;
  const over = invLerp(s.heavyDamageThreshold, s.heavyDamageThreshold * 2.2, damage);
  return s.magnitude * (0.75 + 0.45 * over) * (blocked ? (s.blockedMultiplier ?? 0.4) : 1);
}

/**
 * Apply one connection. Shared by melee, lunges, projectiles and beams so that
 * chip damage, blockstun scaling and the combo counter can only ever be
 * implemented once.
 *
 * @param {object} src   { x, registerHit? } — attacker, or a projectile's owner
 * @param {object} move  { dmg, stun, knock }
 */
export function applyDamage(src, def, move, game, ctx, opts = {}) {
  const c = game.combat;
  const blocked = opts.forceUnblockable ? false : isBlocking(def, src, move);

  const damage = blocked ? move.dmg * c.blockChipMultiplier : move.dmg;
  const stun = Math.round(blocked ? move.stun * c.blockStunMultiplier : move.stun);
  const knock = blocked ? move.knock * c.blockKnockbackMultiplier : move.knock;

  if (blocked) {
    def.applyBlock({ damage, stun, knock, fromX: src.x });
  } else {
    def.applyHit({ damage, stun, knock, fromX: src.x });
    src.registerHit?.();
  }

  const contactX = (src.x + def.x) / 2;
  const contactY = def.y + def.height * (blocked ? 0.55 : 0.62);

  ctx.events.push({
    type: 'hit',
    attacker: src,
    defender: def,
    damage,
    blocked,
    x: contactX,
    y: contactY,
    hitstop: hitstopFrames(damage, blocked, game),
    shake: shakeMagnitude(damage, blocked, game),
    ko: def.state === STATE.KO,
    source: opts.source ?? 'melee',
  });

  return { blocked, damage };
}

/**
 * Melee overlap test for one attacker against one defender.
 *
 * A hit connects when the attacker is on an active frame, has not already
 * connected with this activation, the defender is in front, within range, and
 * at a compatible height.
 */
export function tryMeleeHit(att, def, game, ctx) {
  if (att.state !== STATE.ATTACK) return false;
  if (att.phase !== PHASE.ACTIVE) return false;
  if (att.hasHit) return false;
  if (def.state === STATE.KO) return false;

  const m = att.moveData;
  if (!m) return false;
  // Projectile specials do their damage through the projectile entity, not here.
  if (m.isSpecial && m.special.type === 'projectile') return false;
  if (!m.range) return false;

  const dx = def.x - att.x;
  const facingDir = sign(dx);
  if (facingDir !== 0 && facingDir !== att.facing) return false;

  const reach = m.range * att.scale + def.radius;
  if (Math.abs(dx) > reach) return false;

  // Vertical: an attack lands if the two bodies share height. This is what lets
  // a jump clear a low-committed kick.
  if (Math.abs(att.y - def.y) > 1.05 * Math.max(att.scale, def.scale)) return false;

  // A low attack travels along the floor, so it passes harmlessly under anyone
  // who has left it. That makes jumping a real, free answer to a sweep — which
  // is what stops low pressure from being strictly better than high.
  if (m.height === HEIGHT.LOW && def.y > 0.35 * def.scale) return false;

  att.hasHit = true;
  applyDamage(att, def, m, game, ctx, { source: m.isSpecial ? 'special' : att.move });
  return true;
}

/** Both directions, every logic step. */
export function resolveCombat(a, b, game, ctx) {
  tryMeleeHit(a, b, game, ctx);
  tryMeleeHit(b, a, game, ctx);
}
