import { STATE, PHASE } from '../../engine/Fighter.js';
import { easeOutCubic, lerp, clamp } from '../../engine/math.js';

/**
 * The procedural phased poser — the fallback animator, and the one that defines
 * how the game feels when no clips are loaded.
 *
 * Every attack is three poses: **windup → strike → follow-through**, mapped
 * one-to-one onto the move's startup / active / recovery frames. Two separate
 * smoothing stages stack, and you need both:
 *
 *   1. Within a phase, the target pose is blended from the previous phase's
 *      pose using `easeOutCubic(phaseProgress)` — fast out of the gate, then
 *      decelerating.
 *   2. The rig then chases that target at a per-phase lerp rate: ~0.9 on active
 *      frames (a snap) and ~0.18 on recovery (a slow settle).
 *
 * The result is a strike that arrives hard on the active frame and unwinds
 * lazily through recovery — which is the whole trick.
 *
 * Poses are flat objects of numbers so blending is a plain loop. Axis
 * convention is ProceduralRig's: +Z forward, limbs hang along -Y, so a negative
 * x-rotation swings a limb forward.
 */

// Every key the poser can drive. Anything missing from a pose falls back to 0.
const KEYS = [
  'bodyY', 'bodyZ', 'bodyTilt',
  'torsoX', 'torsoY', 'torsoZ',
  'neckX', 'neckY',
  'shLx', 'shLy', 'shLz', 'elL',
  'shRx', 'shRy', 'shRz', 'elR',
  'hipLx', 'hipLz', 'kneeL',
  'hipRx', 'hipRz', 'kneeR',
];

const zero = () => Object.fromEntries(KEYS.map((k) => [k, 0]));

function blend(a, b, t) {
  const out = {};
  for (const k of KEYS) out[k] = lerp(a[k] ?? 0, b[k] ?? 0, t);
  return out;
}

function pose(partial) {
  return { ...zero(), ...partial };
}

// ---------------------------------------------------------------------------
// Base poses
// ---------------------------------------------------------------------------

/** Bladed fighting stance: knees bent, guard up, shoulder turned in slightly. */
const STANCE = pose({
  bodyY: -0.04,
  torsoY: 0.16,
  shLx: -0.28, elL: -1.15, shLz: 0.16,
  shRx: -0.40, elR: -1.32, shRz: -0.14,
  hipLx: -0.13, kneeL: 0.30, hipLz: 0.05,
  hipRx: 0.15, kneeR: 0.24, hipRz: -0.05,
});

const BLOCK = pose({
  bodyY: -0.10, bodyZ: -0.06,
  torsoY: 0.52, torsoX: 0.10,
  neckX: 0.12,
  shLx: -0.92, elL: -2.05, shLz: 0.34,
  shRx: -0.78, elR: -2.15, shRz: -0.30,
  hipLx: -0.20, kneeL: 0.44,
  hipRx: 0.22, kneeR: 0.36,
});

const HITSTUN = pose({
  bodyY: -0.05, bodyZ: -0.13,
  torsoX: -0.30, torsoY: -0.10,
  neckX: -0.38,
  shLx: 0.52, elL: -0.55, shLz: 0.5,
  shRx: 0.46, elR: -0.5, shRz: -0.48,
  hipLx: 0.12, kneeL: 0.34,
  hipRx: -0.10, kneeR: 0.30,
});

const AIR = pose({
  bodyY: 0.02,
  torsoY: 0.12, torsoX: -0.08,
  shLx: -0.55, elL: -1.5, shLz: 0.3,
  shRx: -0.65, elR: -1.6, shRz: -0.28,
  hipLx: -0.55, kneeL: 1.05,
  hipRx: -0.22, kneeR: 0.72,
});

const KO = pose({
  bodyY: -0.30, bodyZ: -0.35, bodyTilt: -1.25,
  torsoX: -0.35,
  neckX: -0.5,
  shLx: 0.85, elL: -0.35, shLz: 0.7,
  shRx: 0.80, elR: -0.30, shRz: -0.68,
  hipLx: -0.55, kneeL: 0.55,
  hipRx: -0.30, kneeR: 0.40,
});

// ---------------------------------------------------------------------------
// Attack poses. `side` is 'L' or 'R'; `dir` mirrors the torso twist so a rear
// hand and a lead hand rotate the body opposite ways.
// ---------------------------------------------------------------------------

function punchPoses(side) {
  const A = side;                       // striking arm
  const B = side === 'L' ? 'R' : 'L';   // guard arm
  const dir = side === 'R' ? 1 : -1;

  const windup = pose({
    bodyY: -0.06, bodyZ: -0.07,
    torsoY: -0.42 * dir,
    [`sh${A}x`]: 0.55, [`el${A}`]: -2.0, [`sh${A}z`]: dir * 0.2,
    [`sh${B}x`]: -0.5, [`el${B}`]: -1.5,
    hipLx: -0.16, kneeL: 0.36, hipRx: 0.18, kneeR: 0.30,
  });

  const strike = pose({
    bodyY: -0.02, bodyZ: 0.14,
    torsoY: 0.50 * dir,
    neckY: 0.12 * dir,
    // Shoulder sweeps forward while the elbow extends: the fist travels an arc.
    [`sh${A}x`]: -1.46, [`el${A}`]: -0.04, [`sh${A}z`]: -dir * 0.14,
    [`sh${B}x`]: -0.42, [`el${B}`]: -1.62,
    hipLx: -0.24, kneeL: 0.30, hipRx: 0.26, kneeR: 0.20,
  });

  const follow = pose({
    bodyY: -0.05, bodyZ: 0.03,
    torsoY: 0.12 * dir,
    [`sh${A}x`]: -0.52, [`el${A}`]: -1.38, [`sh${A}z`]: dir * 0.05,
    [`sh${B}x`]: -0.45, [`el${B}`]: -1.4,
    hipLx: -0.15, kneeL: 0.32, hipRx: 0.17, kneeR: 0.26,
  });

  return { windup, strike, follow };
}

function kickPoses(side) {
  const K = side;                        // kicking leg
  const A = side === 'L' ? 'R' : 'L';    // opposite arm counterbalances
  const dir = side === 'R' ? 1 : -1;

  const windup = pose({
    bodyY: -0.08, bodyZ: -0.05,
    torsoX: 0.16, torsoY: -0.22 * dir,
    // Knee chambers high before the shin extends — the arc again.
    [`hip${K}x`]: -0.38, [`knee${K}`]: 1.45,
    [`sh${A}x`]: -0.30, [`el${A}`]: -1.1,
    kneeL: side === 'L' ? 1.45 : 0.42,
  });

  const strike = pose({
    bodyY: -0.03, bodyZ: 0.07,
    torsoX: 0.36, torsoY: 0.24 * dir, torsoZ: -0.08 * dir,
    [`hip${K}x`]: -1.28, [`knee${K}`]: 0.10,
    [`sh${A}x`]: 0.55, [`el${A}`]: -0.65, [`sh${A}z`]: -dir * 0.55,
    neckX: -0.1,
  });

  const follow = pose({
    bodyY: -0.09, bodyZ: 0.0,
    torsoX: 0.14, torsoY: 0.06 * dir,
    [`hip${K}x`]: -0.5, [`knee${K}`]: 0.92,
    [`sh${A}x`]: -0.35, [`el${A}`]: -1.25,
  });

  return { windup, strike, follow };
}

function projectilePoses() {
  const windup = pose({
    bodyY: -0.14, bodyZ: -0.10,
    torsoY: -0.5,
    shLx: 0.35, elL: -2.2, shLz: 0.45,
    shRx: 0.30, elR: -2.25, shRz: -0.42,
    hipLx: -0.22, kneeL: 0.52, hipRx: 0.24, kneeR: 0.46,
  });

  const strike = pose({
    bodyY: -0.02, bodyZ: 0.18,
    torsoY: 0.05,
    shLx: -1.52, elL: -0.06, shLz: 0.18,
    shRx: -1.52, elR: -0.06, shRz: -0.18,
    neckX: -0.05,
    hipLx: -0.30, kneeL: 0.34, hipRx: 0.30, kneeR: 0.28,
  });

  const follow = pose({
    bodyY: -0.06, bodyZ: 0.04,
    torsoY: 0.14,
    shLx: -0.6, elL: -1.3, shRx: -0.68, elR: -1.4,
    hipLx: -0.16, kneeL: 0.34, hipRx: 0.18, kneeR: 0.28,
  });

  return { windup, strike, follow };
}

function lungePoses() {
  const windup = pose({
    bodyY: -0.17, bodyZ: -0.13,
    torsoX: 0.30, torsoY: -0.35,
    shLx: 0.5, elL: -1.85, shRx: 0.42, elR: -1.9,
    hipLx: -0.30, kneeL: 0.72, hipRx: 0.30, kneeR: 0.62,
  });

  const strike = pose({
    bodyY: -0.06, bodyZ: 0.24, bodyTilt: 0.34,
    torsoX: -0.20, torsoY: 0.40,
    shLx: -1.15, elL: -0.7, shLz: 0.5,
    shRx: -0.35, elR: -1.75, shRz: -0.4,
    hipLx: -0.72, kneeL: 0.36, hipRx: 0.55, kneeR: 0.28,
  });

  const follow = pose({
    bodyY: -0.12, bodyZ: 0.05, bodyTilt: 0.1,
    torsoX: 0.14, torsoY: 0.14,
    shLx: -0.5, elL: -1.35, shRx: -0.55, elR: -1.45,
    hipLx: -0.30, kneeL: 0.55, hipRx: 0.28, kneeR: 0.42,
  });

  return { windup, strike, follow };
}

// ---------------------------------------------------------------------------

export class PoseAnimator {
  /**
   * @param {object} target a pose target — anything with `.apply(pose, ctx)`.
   *   ProceduralRig supplies one for the box rig; SkeletonPoseTarget supplies
   *   one for any humanoid GLB skeleton, which is what lets this poser act as
   *   the fallback for imported rigs whose clips failed to retarget.
   * @param {object} game global config
   */
  constructor(target, game) {
    this.target = target;
    this.game = game;
    this.current = { ...STANCE };
    this.walkPhase = 0;
    this.breathT = 0;
    this.type = 'procedural';
  }

  /**
   * @param {Fighter} f
   * @param {number} dtFrames elapsed logic frames (1 per fixed step)
   */
  update(f, dtFrames = 1) {
    const { target, speed } = this._targetFor(f);

    // Chase the target at the phase's rate. Normalised so a render-driven
    // caller at a different rate still settles over the same wall-clock time.
    const k = clamp(dtFrames, 0, 4);
    const rate = 1 - Math.pow(1 - clamp(speed, 0.001, 0.999), k);

    for (const key of KEYS) {
      this.current[key] = lerp(this.current[key], target[key] ?? 0, rate);
    }

    this._apply(f, dtFrames);
  }

  /** Pick the pose to chase and how fast to chase it. */
  _targetFor(f) {
    const lerps = this.game.animation.phaseLerp;

    switch (f.state) {
      case STATE.KO:
        return { target: KO, speed: 0.14 };

      case STATE.HITSTUN:
        return { target: HITSTUN, speed: 0.55 };

      case STATE.BLOCKSTUN:
      case STATE.BLOCK:
        return { target: BLOCK, speed: 0.45 };

      case STATE.AIR:
        return { target: AIR, speed: 0.22 };

      case STATE.ATTACK: {
        const poses = this._attackPoses(f);
        const t = easeOutCubic(f.phaseProgress);
        switch (f.phase) {
          case PHASE.STARTUP:
            return { target: blend(STANCE, poses.windup, t), speed: lerps.windup };
          case PHASE.ACTIVE:
            return { target: blend(poses.windup, poses.strike, t), speed: lerps.strike };
          default:
            return { target: blend(poses.strike, poses.follow, t), speed: lerps.recovery };
        }
      }

      case STATE.WALK:
        return { target: this._walkPose(f), speed: lerps.idle * 1.6 };

      default:
        return { target: STANCE, speed: lerps.idle };
    }
  }

  /** Which limb strikes. `strikeParity` alternates on every move. */
  _attackPoses(f) {
    const side = f.strikeParity === 0 ? 'R' : 'L';
    if (f.move === 'punch') return punchPoses(side);
    if (f.move === 'kick') return kickPoses(side);

    const type = f.cfg.special?.type;
    if (type === 'lunge') return lungePoses();
    return projectilePoses(); // projectile and beam share the thrust
  }

  /** Walk cycle driven by actual velocity, so it never foot-slides badly. */
  _walkPose(f) {
    const anim = this.game.animation;
    const speedRatio = clamp(Math.abs(f.vx) / (f.cfg.speed || 1), 0, 1.4);
    this.walkPhase += anim.walkCycleSpeed * speedRatio;

    const s = Math.sin(this.walkPhase) * anim.walkSwing * speedRatio;
    const c = Math.cos(this.walkPhase * 2) * 0.06 * speedRatio;

    // Walking backwards should look like backing off, not marching.
    const backing = Math.sign(f.vx) !== f.facing ? 0.6 : 1;

    return pose({
      ...STANCE,
      bodyY: STANCE.bodyY - Math.abs(c),
      hipLx: STANCE.hipLx - s * backing,
      hipRx: STANCE.hipRx + s * backing,
      kneeL: STANCE.kneeL + Math.max(0, s) * 0.85,
      kneeR: STANCE.kneeR + Math.max(0, -s) * 0.85,
      // Arms counter-swing but never drop the guard.
      shLx: STANCE.shLx + s * 0.22,
      shRx: STANCE.shRx - s * 0.22,
      torsoY: STANCE.torsoY - s * 0.1,
    });
  }

  /** Hand the blended pose to whatever rig is attached. */
  _apply(f, dtFrames) {
    const anim = this.game.animation;

    // Idle breathing — only when there is nothing more important happening.
    this.breathT += anim.breathSpeed * dtFrames;
    const calm = f.state === STATE.IDLE || f.state === STATE.WALK;
    const breath = calm ? Math.sin(this.breathT) * anim.breathAmplitude : 0;

    // Poses are authored against the default weightShift/twistAmount, so the
    // config values act as multipliers on the authored amount rather than
    // replacing it. Turn weightShift to 0 and the fighter stops leaning.
    this.target.apply(this.current, {
      breath,
      weightShift: anim.weightShift / 0.17,
      twist: anim.twistAmount / 0.55,
      fighter: f,
    });
  }

  reset() {
    this.current = { ...STANCE };
    this.walkPhase = 0;
  }
}
