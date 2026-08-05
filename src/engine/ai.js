import { STATE, PHASE, HEIGHT } from './Fighter.js';
import { makeRandom, sign } from './math.js';

/**
 * AI opponent — a four-state machine over APPROACH / ATTACK / BLOCK / RETREAT.
 *
 * The interesting part is reaction-blocking. The AI does not read the input
 * buffer; it watches the opponent's *animation*, and only after `reactionFrames`
 * have elapsed since a move started is it allowed to notice. That single rule
 * produces the behaviour you want for free:
 *
 *   - a 4-frame jab is genuinely un-reactable, so pressure works
 *   - a 12-frame special telegraphs, so throwing them out blind gets blocked
 *
 * Lower `reactionFrames` in game.json to make the fight harder.
 */

export const AI_STATE = {
  APPROACH: 'approach',
  ATTACK: 'attack',
  BLOCK: 'block',
  RETREAT: 'retreat',
};

const IDLE_INTENT = {
  moveX: 0, jump: false, block: false, punch: false, kick: false, special: false,
};

export class AIController {
  constructor(game, seed = 1337) {
    this.game = game;
    this.rng = makeRandom(seed);
    this.state = AI_STATE.APPROACH;
    this.stateFrames = 0;
    this.decisionCooldown = 0;

    // How long the opponent's current move has been visible to us.
    this.observedMove = null;
    this.observedFrames = 0;

    this.attackKey = null;
    this.attackLow = false;
    this.attackHold = 0;
    this.guard = HEIGHT.LOW;
  }

  reset() {
    this.state = AI_STATE.APPROACH;
    this.stateFrames = 0;
    this.decisionCooldown = 0;
    this.observedMove = null;
    this.observedFrames = 0;
    this.attackKey = null;
    this.attackLow = false;
    this.attackHold = 0;
    this.guard = HEIGHT.LOW;
  }

  /**
   * @param {Fighter} self
   * @param {Fighter} foe
   * @returns {object} intent, in exactly the shape the input layer produces
   */
  think(self, foe) {
    const ai = this.game.ai;
    if (!ai.enabled || self.state === STATE.KO || foe.state === STATE.KO) {
      return { ...IDLE_INTENT };
    }

    this._observe(foe);

    const intent = { ...IDLE_INTENT };
    const gap = Math.abs(foe.x - self.x);
    const toFoe = sign(foe.x - self.x) || self.facing;

    // Longest reach we have, used to decide whether we are "in range".
    const punch = self.cfg.moves?.punch;
    const kick = self.cfg.moves?.kick;
    const reach = Math.max(punch?.range ?? 0, kick?.range ?? 0) * self.scale;

    // ---- reaction block: highest priority, overrides whatever we were doing.
    if (this._shouldReactBlock(self, foe, gap, reach)) {
      this.guard = this._chooseGuard(foe);
      this.state = AI_STATE.BLOCK;
      this.stateFrames = 0;
      this._applyGuard(intent, toFoe);
      return intent;
    }

    this.stateFrames++;
    if (this.decisionCooldown > 0) this.decisionCooldown--;
    else this._decide(self, foe, gap, reach);

    // ---- act on the current state
    switch (this.state) {
      case AI_STATE.ATTACK: {
        if (gap <= reach + ai.attackRangeSlack) {
          if (this.attackHold > 0) {
            this.attackHold--;
            intent[this.attackKey] = true;
            // The AI has no private path to the low variants — it holds block
            // with the attack exactly like a player does.
            if (this.attackLow) intent.block = true;
          } else {
            this.state = AI_STATE.APPROACH;
          }
        } else {
          // Fell out of range mid-commitment — walk back in.
          intent.moveX = toFoe * ai.approachSpeedScale;
        }
        break;
      }

      case AI_STATE.BLOCK:
        this._applyGuard(intent, toFoe);
        if (this.stateFrames > 30) this.state = AI_STATE.APPROACH;
        break;

      case AI_STATE.RETREAT:
        intent.moveX = -toFoe;
        if (this.stateFrames > ai.retreatFrames) this.state = AI_STATE.APPROACH;
        break;

      case AI_STATE.APPROACH:
      default: {
        // Stop just outside our own reach rather than walking into the body.
        const want = reach * 0.82;
        if (gap > want) intent.moveX = toFoe * ai.approachSpeedScale;
        else if (gap < want * 0.6) intent.moveX = -toFoe * 0.5;
        break;
      }
    }

    return intent;
  }

  /**
   * Pick a guard height against the incoming move.
   *
   * `guardReadChance` is the difficulty dial for the high/low mixup: at 1 the
   * AI always guards correctly and lows become pointless, at 0 it always guesses
   * wrong. The default sits near a coin flip so the mixup is real in both
   * directions. MID moves are blocked by either guard, so the choice is free.
   */
  _chooseGuard(foe) {
    const ai = this.game.ai;
    const incoming = foe.moveData?.height ?? HEIGHT.MID;
    if (incoming === HEIGHT.MID) {
      return this.rng() < 0.5 ? HEIGHT.LOW : HEIGHT.HIGH;
    }
    const reads = this.rng() < (ai.guardReadChance ?? 0.5);
    if (reads) return incoming;
    return incoming === HEIGHT.LOW ? HEIGHT.HIGH : HEIGHT.LOW;
  }

  /** Express the chosen guard as input: block, plus back for a high guard. */
  _applyGuard(intent, toFoe) {
    intent.block = true;
    if (this.guard === HEIGHT.HIGH) intent.moveX = -toFoe;
  }

  /** Track how long we have been able to see the opponent's current move. */
  _observe(foe) {
    const live = foe.state === STATE.ATTACK ? foe.move : null;
    if (live && live === this.observedMove) {
      this.observedFrames++;
    } else {
      this.observedMove = live;
      this.observedFrames = live ? 1 : 0;
    }
  }

  _shouldReactBlock(self, foe, gap, reach) {
    const ai = this.game.ai;
    if (!self.actionable || !self.grounded) return false;
    if (!this.observedMove) return false;

    // Only blockable if we have actually had time to see it.
    if (this.observedFrames < ai.reactionFrames) return false;
    // And only if it is still a threat — no point blocking a whiffed recovery.
    if (foe.phase === PHASE.RECOVERY) return false;

    // A projectile special has no melee range at all — its hitbox belongs to
    // the projectile, not the move. Judging it by move.range would score a
    // fireball as harmless from two paces away, so range specials threaten the
    // whole stage and are blocked from anywhere.
    const md = foe.moveData;
    const ranged = md?.isSpecial &&
      (md.special?.type === 'projectile' || md.special?.type === 'beam');

    const threat = ranged
      ? this.game.stage.halfWidth * 2
      : (md?.range ?? 0) * foe.scale + self.radius + 0.35;
    if (gap > threat) return false;

    // One roll per move, held for as long as the move is live.
    return this.rng() < ai.blockChance;
  }

  _decide(self, foe, gap, reach) {
    const ai = this.game.ai;
    this.decisionCooldown = ai.decisionIntervalFrames;
    this.stateFrames = 0;

    if (!self.actionable) return;

    const inRange = gap <= reach + ai.attackRangeSlack;

    // Punish: the opponent is stuck in recovery — take the free hit.
    const punishable = foe.state === STATE.ATTACK && foe.phase === PHASE.RECOVERY;

    if (inRange && (punishable || this.rng() < (ai.attackChance ?? 0.62))) {
      this._chooseAttack(self, gap, reach);
      return;
    }

    if (!inRange && self.specialCooldown === 0 && this.rng() < ai.specialChance) {
      // Specials are the AI's answer to being kept at range.
      this.state = AI_STATE.ATTACK;
      this.attackKey = 'special';
      this.attackLow = false;
      this.attackHold = 2;
      return;
    }

    if (this.rng() < ai.retreatChance) {
      this.state = AI_STATE.RETREAT;
      return;
    }

    this.state = AI_STATE.APPROACH;
  }

  _chooseAttack(self, gap, reach) {
    const ai = this.game.ai;
    this.state = AI_STATE.ATTACK;
    // Input is edge-triggered by the fighter, so holding for 2 frames is enough
    // to guarantee the press lands on an actionable frame.
    this.attackHold = 2;

    const kickRange = (self.cfg.moves?.kick?.range ?? 0) * self.scale;
    const punchRange = (self.cfg.moves?.punch?.range ?? 0) * self.scale;

    if (self.specialCooldown === 0 && this.rng() < ai.specialChance * 0.5) {
      this.attackKey = 'special';
      this.attackLow = false;
      return;
    }

    if (gap > punchRange && gap <= kickRange) {
      this.attackKey = 'kick';           // only the kick reaches from here
    } else {
      this.attackKey = this.rng() < ai.kickBias ? 'kick' : 'punch';
    }

    // Go low only if this character actually has the variant configured.
    const lowKey = this.attackKey === 'kick' ? 'lowKick' : 'lowPunch';
    this.attackLow = !!self.cfg.moves?.[lowKey] &&
      this.rng() < (ai.lowAttackChance ?? 0.4);
  }
}
