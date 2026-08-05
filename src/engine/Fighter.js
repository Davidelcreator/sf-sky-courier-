import { clamp, sign } from './math.js';

/**
 * Fighter — pure logic. No three.js, no DOM.
 *
 * Every number this class acts on comes from the character JSON (`cfg`) or the
 * global tuning JSON (`game`). There is deliberately no character-specific
 * branch anywhere in here: adding a fighter is adding a file to /config.
 *
 * The visual rig is a separate object (see /src/characters). This class only
 * publishes state — position, facing, current move, phase, progress — and the
 * animator reads that to decide what to draw.
 */

export const STATE = {
  IDLE: 'idle',
  WALK: 'walk',
  AIR: 'air',
  BLOCK: 'block',
  ATTACK: 'attack',
  HITSTUN: 'hitstun',
  BLOCKSTUN: 'blockstun',
  KO: 'ko',
};

export const PHASE = {
  STARTUP: 'startup',
  ACTIVE: 'active',
  RECOVERY: 'recovery',
};

/**
 * Attack and guard heights.
 *
 * A hit only connects with a guard of the SAME height — a low sweep goes under
 * a standing guard, a high strike goes over a crouching one. MID (specials)
 * is blocked by either, so a special is never a coin flip.
 *
 * This is the entire reason low and high variants exist. Without it, "low
 * punch" is a different animation for the same move.
 */
export const HEIGHT = { HIGH: 'high', LOW: 'low', MID: 'mid' };

/** Fallback when a move's config omits `height`. */
const DEFAULT_HEIGHT = {
  punch: HEIGHT.HIGH,
  kick: HEIGHT.HIGH,
  lowPunch: HEIGHT.LOW,
  lowKick: HEIGHT.LOW,
};

/** Which input buffer a move key consumes. */
export const BASE_ACTION = {
  punch: 'punch', lowPunch: 'punch',
  kick: 'kick', lowKick: 'kick',
  special: 'special',
};

export class Fighter {
  /**
   * @param {object} cfg   character config (config/characters/<id>.json)
   * @param {object} game  global config (config/game.json)
   * @param {object} opts  { x, facing, side }
   */
  constructor(cfg, game, opts = {}) {
    this.cfg = cfg;
    this.game = game;
    this.side = opts.side ?? 0; // 0 = P1, 1 = P2 — used only for spawn/HUD

    this.maxHealth = cfg.health;
    this.scale = cfg.scale ?? 1;

    // A fighter's body is a capsule this tall; used for vertical hit overlap
    // and for the push-apart radius.
    this.height = 1.8 * this.scale;
    this.radius = 0.33 * this.scale;

    this.reset(opts.x ?? 0, opts.facing ?? 1);
  }

  /** Full reset — start of a round. */
  reset(x, facing) {
    this.x = x;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;

    this.health = this.maxHealth;
    this.state = STATE.IDLE;
    this.stateFrame = 0;

    this.move = null;        // 'punch' | 'kick' | 'special'
    this.moveData = null;    // resolved frame data for `move`
    this.moveFrame = 0;
    this.hasHit = false;     // one hitbox connects at most once per activation

    this.stunFrames = 0;
    this.specialCooldown = 0;
    this.lungeFrames = 0;    // >0 while a lunge special is driving the body

    this.comboCount = 0;
    this.comboTimer = 0;

    // Cosmetic, read by the animator: alternates lead/rear limb per strike.
    this.strikeParity = 0;
    // Increments on every move activation. The clip animator uses it to tell
    // "the same move again" from "the same move still running", so a repeated
    // jab restarts its clip instead of continuing the old one.
    this.activationId = 0;

    this.blockHeld = false;
    this.inputX = 0;
    this.wasGrounded = true;
  }

  get grounded() { return this.y <= 0.0001; }

  /**
   * Which height this fighter is currently guarding, or null if not guarding.
   *
   * Holding block alone crouches you into a LOW guard; holding block while
   * pushing away from the opponent stands you up into a HIGH guard. One button
   * and one stick, which is all the touch layout has to give.
   */
  get guardHeight() {
    if (!this.blockHeld || !this.grounded) return null;
    const back = -this.facing;
    const pushingBack = Math.sign(this.inputX) === back && Math.abs(this.inputX) > 0.3;
    return pushingBack ? HEIGHT.HIGH : HEIGHT.LOW;
  }
  get alive() { return this.health > 0; }
  get isAttacking() { return this.state === STATE.ATTACK; }
  get isStunned() { return this.state === STATE.HITSTUN || this.state === STATE.BLOCKSTUN; }

  /** Total frames of the current move. */
  get moveTotal() {
    const m = this.moveData;
    return m ? m.startup + m.active + m.recovery : 0;
  }

  /** Which of the three phases the current move is in. */
  get phase() {
    const m = this.moveData;
    if (!m) return null;
    if (this.moveFrame < m.startup) return PHASE.STARTUP;
    if (this.moveFrame < m.startup + m.active) return PHASE.ACTIVE;
    return PHASE.RECOVERY;
  }

  /** 0..1 progress through the current phase — drives the animation curves. */
  get phaseProgress() {
    const m = this.moveData;
    if (!m) return 0;
    const f = this.moveFrame;
    if (f < m.startup) return m.startup ? f / m.startup : 1;
    if (f < m.startup + m.active) {
      return m.active ? (f - m.startup) / m.active : 1;
    }
    return m.recovery ? (f - m.startup - m.active) / m.recovery : 1;
  }

  /** Can this fighter start a new action right now? */
  get actionable() {
    return this.state !== STATE.ATTACK &&
           this.state !== STATE.HITSTUN &&
           this.state !== STATE.BLOCKSTUN &&
           this.state !== STATE.KO;
  }

  /** Resolve a move key to its frame data. Specials live under `special`. */
  moveDataFor(key) {
    if (key === 'special') {
      const s = this.cfg.special;
      if (!s) return null;
      // A special has no explicit `active` window in the schema — the active
      // frames are implied by the type (a projectile spawns on one frame, a
      // lunge stays live for its whole travel). Normalise to the same shape as
      // a normal move so `phase` logic below has nothing to special-case.
      const active = s.type === 'lunge' ? (s.lunge?.activeFrames ?? 12)
                   : s.type === 'beam'  ? (s.beam?.activeFrames ?? 12)
                   : 1;
      return {
        dmg: s.dmg,
        startup: s.startup,
        active,
        recovery: s.recovery,
        range: s.lunge?.hitRange ?? s.beam?.length ?? 0,
        knock: s.knock,
        stun: s.stun,
        // Specials are MID: blockable by either guard, so they are never a
        // 50/50 guess on top of already costing a cooldown.
        height: HEIGHT.MID,
        isSpecial: true,
        special: s,
      };
    }
    const m = this.cfg.moves?.[key];
    if (!m) return null;
    return {
      ...m,
      height: m.height ?? DEFAULT_HEIGHT[key] ?? HEIGHT.HIGH,
      isSpecial: false,
    };
  }

  // ---------------------------------------------------------------------------
  // Per-frame update. Called once per fixed logic step, and never during hitstop.
  // ---------------------------------------------------------------------------

  /**
   * @param {object} intent  normalised input: { moveX, jump, block, punch, kick, special }
   * @param {Fighter} foe
   * @param {object} ctx     { events: [], spawnProjectile(fn) }
   */
  tick(intent, foe, ctx) {
    if (this.state === STATE.KO) {
      this._integrate();
      return;
    }

    this.stateFrame++;
    if (this.specialCooldown > 0) this.specialCooldown--;
    if (this.comboTimer > 0 && --this.comboTimer === 0) this.comboCount = 0;

    // Face the opponent whenever not committed to an action. Committing to a
    // move locks facing, which is what makes crossing someone up during their
    // recovery a real thing.
    if (this.actionable && foe) {
      const d = foe.x - this.x;
      if (Math.abs(d) > 0.02) this.facing = sign(d);
    }

    this.blockHeld = !!intent.block;
    this.inputX = intent.moveX ?? 0;

    switch (this.state) {
      case STATE.HITSTUN:
      case STATE.BLOCKSTUN:
        this._tickStun();
        break;
      case STATE.ATTACK:
        this._tickAttack(ctx);
        break;
      default:
        this._tickFree(intent, ctx);
        break;
    }

    this._integrate();
  }

  _tickStun() {
    if (--this.stunFrames <= 0) {
      this.state = this.grounded ? STATE.IDLE : STATE.AIR;
      this.stateFrame = 0;
    }
  }

  _tickAttack(ctx) {
    const m = this.moveData;
    const before = this.phase;
    this.moveFrame++;
    const after = this.phase;

    // The frame we cross into `active` is when a projectile leaves the hand and
    // when a lunge starts driving the body forward.
    if (before === PHASE.STARTUP && after === PHASE.ACTIVE && m.isSpecial) {
      this._fireSpecial(ctx);
    }

    // A lunge overrides normal movement while it is live.
    if (this.lungeFrames > 0) {
      this.lungeFrames--;
      this.vx *= m.special?.lunge?.friction ?? 0.93;
    }

    if (this.moveFrame >= this.moveTotal) {
      this.state = this.grounded ? STATE.IDLE : STATE.AIR;
      this.stateFrame = 0;
      this.move = null;
      this.moveData = null;
      this.moveFrame = 0;
      this.hasHit = false;
      this.lungeFrames = 0;
    }
  }

  _fireSpecial(ctx) {
    const s = this.cfg.special;
    if (!s) return;
    if (s.type === 'projectile') {
      ctx.spawnProjectile?.(this, s);
    } else if (s.type === 'lunge') {
      this.vx = this.facing * (s.lunge?.speed ?? 0.25);
      this.lungeFrames = s.lunge?.activeFrames ?? 12;
    } else if (s.type === 'beam') {
      ctx.spawnBeam?.(this, s);
    }
    ctx.events?.push({ type: 'special', fighter: this, special: s });
  }

  /** Free state: idle / walk / air / block, and the gateway into attacks. */
  _tickFree(intent, ctx) {
    const cfg = this.cfg;
    const phys = this.game.physics;

    // --- attacks (ground only; committing in the air is not a prototype move)
    if (this.grounded) {
      const wanted = this._attackKeyFor(intent);
      if (wanted && this._startMove(wanted, ctx)) return;
    }

    // --- block: grounded, holding block, not mid-anything
    if (this.grounded && intent.block) {
      this.state = STATE.BLOCK;
      this.vx *= phys.groundFriction;
      return;
    }

    // --- jump
    if (this.grounded && intent.jump) {
      this.vy = cfg.jumpV;
      this.y += 0.001; // leave the ground this frame so `grounded` flips
      this.state = STATE.AIR;
      this.stateFrame = 0;
      ctx.events?.push({ type: 'jump', fighter: this });
    }

    // --- walk / air drift
    const control = this.grounded ? 1 : phys.airControl;
    const mx = clamp(intent.moveX ?? 0, -1, 1);
    if (Math.abs(mx) > 0.01) {
      this.vx += mx * cfg.speed * control * 0.35;
      const cap = cfg.speed * (this.grounded ? 1 : 1.15);
      this.vx = clamp(this.vx, -cap, cap);
      if (this.grounded) this.state = STATE.WALK;
    } else if (this.grounded) {
      this.vx *= phys.groundFriction;
      this.state = STATE.IDLE;
    }

    if (!this.grounded) this.state = STATE.AIR;
  }

  /**
   * Pick which attack an input means. Holding block turns an attack into its
   * low variant — no extra button, which matters because the touch layout has
   * exactly three. A character with no low variant configured just gets the
   * high one, so older and generated configs keep working untouched.
   */
  _attackKeyFor(intent) {
    const low = !!intent.block;
    if (intent.punch) return low && this.cfg.moves?.lowPunch ? 'lowPunch' : 'punch';
    if (intent.kick) return low && this.cfg.moves?.lowKick ? 'lowKick' : 'kick';
    if (intent.special) return 'special';
    return null;
  }

  /** Begin a move if it is legal. Returns true if the move started. */
  _startMove(key, ctx) {
    const data = this.moveDataFor(key);
    if (!data) return false;
    if (key === 'special') {
      if (this.specialCooldown > 0) return false;
      this.specialCooldown = this.cfg.special.cooldown;
    }

    this.state = STATE.ATTACK;
    this.stateFrame = 0;
    this.move = key;
    this.moveData = data;
    this.moveFrame = 0;
    this.hasHit = false;
    this.vx *= 0.3; // planting the feet to swing kills most momentum

    // Alternate lead/rear limb so repeated jabs do not look like a loop.
    this.strikeParity ^= 1;
    this.activationId++;

    ctx.events?.push({
      type: 'startMove',
      fighter: this,
      move: key,
      // lowPunch consumes the 'punch' buffer — one press, one move.
      action: BASE_ACTION[key] ?? key,
    });
    return true;
  }

  /** Integrate velocity, gravity and the floor. Corner clamp lives in physics.js
   *  because it needs the stage, and push-apart needs both fighters. */
  _integrate() {
    const phys = this.game.physics;

    this.x += this.vx;
    this.y += this.vy;

    if (this.y > 0) {
      this.vy -= phys.gravity;
      this.vx *= phys.airFriction;
    }

    if (this.y <= 0) {
      const wasAir = !this.wasGrounded;
      this.y = 0;
      if (this.vy < 0) this.vy = 0;
      if (wasAir && this.state === STATE.AIR) {
        this.state = STATE.IDLE;
        this.stateFrame = 0;
      }
    }
    this.wasGrounded = this.grounded;
  }

  // ---------------------------------------------------------------------------
  // Damage entry points — called by combat.js, never by the fighter itself.
  // ---------------------------------------------------------------------------

  /** Take a clean hit. */
  applyHit({ damage, stun, knock, fromX }) {
    this.health = Math.max(0, this.health - damage);
    this.state = STATE.HITSTUN;
    this.stateFrame = 0;
    this.stunFrames = stun;
    this.move = null;
    this.moveData = null;
    this.moveFrame = 0;
    this.lungeFrames = 0;

    const dir = sign(this.x - fromX) || -this.facing;
    this.vx = dir * (knock / (this.cfg.weight || 1));

    if (this.health <= 0) {
      this.state = STATE.KO;
      this.stunFrames = 0;
      // A KO pops the body up a little so the fall reads as a knockout.
      this.vy = 0.18;
      this.vx = dir * (knock / (this.cfg.weight || 1)) * 1.4;
    }
  }

  /** Take a blocked hit: chip damage, shorter stun, reduced pushback. */
  applyBlock({ damage, stun, knock, fromX }) {
    this.health = Math.max(0, this.health - damage);
    this.state = STATE.BLOCKSTUN;
    this.stateFrame = 0;
    this.stunFrames = stun;

    const dir = sign(this.x - fromX) || -this.facing;
    this.vx = dir * (knock / (this.cfg.weight || 1));

    if (this.health <= 0) {
      this.state = STATE.KO;
      this.vy = 0.14;
    }
  }

  /** Register a landed hit on the opponent — drives the combo counter. */
  registerHit() {
    this.comboCount++;
    this.comboTimer = this.game.combat.comboResetFrames;
    this.hasHit = true;
  }
}
