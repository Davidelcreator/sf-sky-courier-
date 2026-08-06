import * as THREE from 'three';
import { STATE, PHASE } from '../../engine/Fighter.js';

/**
 * The procedural fighter rig.
 *
 * Three things matter here:
 *
 * 1. **Two-segment limbs.** Arms are shoulder → elbow → hand, legs are hip →
 *    knee → foot. The elbow and knee are real nested groups, so when the
 *    shoulder sweeps while the elbow extends, the hand traces an *arc*. A
 *    single-segment limb can only ever slide in a straight line, and that is
 *    the difference between a punch that lands and a punch that points.
 *
 * 2. **An independent upper-body twist group.** `torso` sits between the hips
 *    and everything above them, so the shoulders can rotate into a punch while
 *    the legs keep their own stance and walk cycle.
 *
 * 3. **Body types.** A dinosaur is not a person with different numbers. A body
 *    type supplies proportions, a resting posture, extra parts (a tail), and a
 *    head shape — but keeps the same joint names, so PoseAnimator drives every
 *    creature with one set of poses and needs no knowledge of any of them.
 *
 * The posture problem, and why `spineBase`/`neckBase` exist: PoseAnimator
 * *assigns* `torso.rotation`, it does not add to it. A rest pitch written there
 * would be overwritten on the first frame. So the static posture lives on a
 * parent group the animator never touches, and the animated rotation composes
 * on top of it. Same for the neck.
 *
 * Local axes, and every pose in PoseAnimator depends on this convention:
 *   +Z = forward, toward the opponent (the root is yaw-rotated by facing)
 *   limbs hang along -Y, so a NEGATIVE x-rotation swings a limb forward
 */

/** Humanoid proportions — the default, and the shape the poses were authored to. */
const HUMANOID = {
  id: 'humanoid',

  hipY: 0.87,       // hip height — chosen so the feet land exactly on y=0
  thigh: 0.42,
  shin: 0.40,
  footHalf: 0.05,
  footLen: 0.30,
  hipHalfWidth: 0.12,
  legRadius: 0.095,
  shinRadius: 0.08,

  chestW: 0.46,
  chestH: 0.60,
  chestD: 0.26,
  spinePitch: 0,    // upright

  shoulderY: 0.52,  // above the hips
  shoulderX: 0.24,
  shoulderZ: 0,
  upperArm: 0.32,
  forearm: 0.30,
  armRadius: 0.075,
  foreRadius: 0.065,
  handR: 0.085,

  headY: 0.74,
  headR: 0.16,
  neckPitch: 0,
  head: 'sphere',

  tail: null,
  /** Added to every pose before it is applied — a permanent posture offset. */
  rest: {},
};

/**
 * Theropod. Body pitched forward over the hips and counterweighted by the tail,
 * digitigrade legs that stay bent, and the famous useless arms.
 */
const DINO = {
  id: 'dino',

  hipY: 1.04,
  thigh: 0.50,
  shin: 0.46,
  footHalf: 0.06,
  footLen: 0.44,     // long bird foot
  hipHalfWidth: 0.16,
  legRadius: 0.155,  // thick drumsticks
  shinRadius: 0.105,

  chestW: 0.46,
  chestH: 0.72,
  chestD: 0.40,
  spinePitch: 1.02,  // ~58° — the body lies along the horizontal

  shoulderY: 0.46,
  shoulderX: 0.21,
  shoulderZ: 0.18,   // on the chest FRONT, or the arms vanish inside the body
  upperArm: 0.20,    // tiny, but they have to be visible to read as tiny
  forearm: 0.17,
  armRadius: 0.058,
  foreRadius: 0.048,
  handR: 0.062,

  headY: 0.86,
  headR: 0.235,
  neckPitch: -0.86,  // lift the head back up out of the pitched body
  neckLen: 0.2,
  head: 'jaws',

  tail: { segments: 5, length: 0.29, radius: 0.155, taper: 0.76, pitch: 1.42 },

  // Digitigrade: the legs never straighten, so the bend is posture rather than
  // something every pose has to remember to include.
  rest: {
    hipLx: -0.30, hipRx: -0.30, kneeL: 0.62, kneeR: 0.62,
    // Arms held forward and folded — the pose a theropod is always in.
    shLx: -0.62, shRx: -0.62, elL: -0.85, elR: -0.85,
  },
};

export const BODY_TYPES = { humanoid: HUMANOID, dino: DINO };

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? 0.65,
    metalness: opts.metalness ?? 0.12,
    ...opts.extra,
  });
}

/** A capsule whose top sits at the origin and which hangs down `len`. */
function limbSegment(len, radius, material) {
  const g = new THREE.CapsuleGeometry(radius, Math.max(0.01, len - radius * 2), 4, 8);
  const m = new THREE.Mesh(g, material);
  m.position.y = -len / 2;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class ProceduralRig {
  /** @param {object} cfg character config */
  constructor(cfg) {
    this.cfg = cfg;
    this.type = 'procedural';

    const L = BODY_TYPES[cfg.bodyType] ?? HUMANOID;
    this.lengths = L;
    this.bodyType = L.id;
    this.restPose = L.rest;

    const body = mat(cfg.color ?? '#cc4422');
    const accent = mat(cfg.accent ?? '#ffcc55', { metalness: 0.35, roughness: 0.45 });
    const skin = mat(cfg.skin ?? '#e8b48c', { roughness: 0.8, metalness: 0.02 });

    this.materials = { body, accent, skin };

    this.root = new THREE.Group();
    this.root.name = `rig:${cfg.id}`;

    // `body` carries the weight shift (z) and vertical bob (y). Keeping it
    // separate from `root` means the fighter's logical position is never
    // polluted by animation.
    this.body = new THREE.Group();
    this.root.add(this.body);

    this.hips = new THREE.Group();
    this.hips.position.y = L.hipY;
    this.body.add(this.hips);

    // --- upper body -----------------------------------------------------
    // Static posture, never touched by the animator (see the header note).
    this.spineBase = new THREE.Group();
    this.spineBase.rotation.x = L.spinePitch;
    this.hips.add(this.spineBase);

    this.torso = new THREE.Group(); // the independent twist group
    this.spineBase.add(this.torso);

    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(L.chestW, L.chestH, L.chestD),
      body,
    );
    chest.position.y = L.chestH / 2;
    chest.castShadow = true;
    chest.receiveShadow = true;
    this.torso.add(chest);

    // A belt in the accent colour reads as a waist and sells the twist.
    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(L.chestW * 1.04, 0.09, L.chestD * 1.08),
      accent,
    );
    belt.position.y = 0.03;
    belt.castShadow = true;
    this.torso.add(belt);

    this.neckBase = new THREE.Group();
    this.neckBase.position.y = L.headY;
    this.neckBase.rotation.x = L.neckPitch;
    this.torso.add(this.neckBase);

    this.neck = new THREE.Group();
    this.neckBase.add(this.neck);

    if (L.head === 'jaws') this._buildJaws(L, body, accent, skin);
    else this._buildHead(L, accent, skin);

    // --- arms: shoulder -> elbow -> hand --------------------------------
    this.arms = {};
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;

      const shoulder = new THREE.Group();
      shoulder.position.set(s * L.shoulderX, L.shoulderY, L.shoulderZ ?? 0);
      this.torso.add(shoulder);
      shoulder.add(limbSegment(L.upperArm, L.armRadius, body));

      const elbow = new THREE.Group();
      elbow.position.y = -L.upperArm;
      shoulder.add(elbow);
      elbow.add(limbSegment(L.forearm, L.foreRadius, skin));

      const hand = new THREE.Group();
      hand.position.y = -L.forearm;
      elbow.add(hand);

      const glove = new THREE.Mesh(new THREE.SphereGeometry(L.handR, 10, 8), accent);
      glove.castShadow = true;
      hand.add(glove);

      // Claws instead of gloves for anything with jaws.
      if (L.head === 'jaws') {
        for (let i = -1; i <= 1; i++) {
          const claw = new THREE.Mesh(
            new THREE.ConeGeometry(L.handR * 0.3, L.handR * 1.5, 5),
            accent,
          );
          claw.position.set(i * L.handR * 0.55, -L.handR * 0.7, L.handR * 0.3);
          claw.rotation.x = Math.PI;
          claw.castShadow = true;
          hand.add(claw);
        }
      }

      this.arms[side] = { shoulder, elbow, hand };
    }

    // --- legs: hip -> knee -> foot --------------------------------------
    this.legs = {};
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;

      const hip = new THREE.Group();
      hip.position.set(s * L.hipHalfWidth, 0, 0);
      this.hips.add(hip);
      hip.add(limbSegment(L.thigh, L.legRadius, body));

      const knee = new THREE.Group();
      knee.position.y = -L.thigh;
      hip.add(knee);
      knee.add(limbSegment(L.shin, L.shinRadius, body));

      const ankle = new THREE.Group();
      ankle.position.y = -L.shin;
      knee.add(ankle);

      const foot = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, L.footHalf * 2, L.footLen),
        accent,
      );
      foot.position.set(0, -L.footHalf, L.footLen * 0.2);
      foot.castShadow = true;
      ankle.add(foot);

      if (L.head === 'jaws') {
        for (let i = -1; i <= 1; i++) {
          const toe = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.11, 5), accent);
          toe.position.set(i * 0.055, -L.footHalf, L.footLen * 0.62);
          toe.rotation.x = Math.PI / 2;
          toe.castShadow = true;
          ankle.add(toe);
        }
      }

      this.legs[side] = { hip, knee, ankle };
    }

    // --- tail -----------------------------------------------------------
    this.tail = [];
    if (L.tail) this._buildTail(L, body, accent);

    const scale = cfg.scale ?? 1;
    this.root.scale.setScalar(scale);
  }

  _buildHead(L, accent, skin) {
    const head = new THREE.Mesh(new THREE.SphereGeometry(L.headR, 16, 12), skin);
    head.castShadow = true;
    this.neck.add(head);

    // A brow band gives the head a facing direction at a glance.
    const brow = new THREE.Mesh(
      new THREE.BoxGeometry(L.headR * 1.85, 0.05, 0.06),
      accent,
    );
    brow.position.set(0, 0.045, L.headR * 0.86);
    this.neck.add(brow);
  }

  /** A skull with a hinged lower jaw, so a bite can actually open its mouth. */
  _buildJaws(L, body, accent, skin) {
    const R = L.headR;

    // A short neck stalk so the head reads as separate from the chest.
    const stalk = new THREE.Mesh(
      new THREE.CapsuleGeometry(R * 0.42, L.neckLen ?? 0.16, 4, 8),
      body,
    );
    stalk.position.y = -(L.neckLen ?? 0.16) * 0.5;
    stalk.castShadow = true;
    this.neck.add(stalk);

    // Skull and snout overlap deliberately: authored as two boxes but read as
    // one tapering head, which a single box cannot do.
    const skull = new THREE.Mesh(new THREE.BoxGeometry(R * 1.5, R * 1.3, R * 1.4), skin);
    skull.position.set(0, R * 0.18, R * 0.25);
    skull.castShadow = true;
    this.neck.add(skull);

    const snout = new THREE.Mesh(new THREE.BoxGeometry(R * 1.12, R * 0.78, R * 1.35), skin);
    snout.position.set(0, R * 0.02, R * 1.25);
    snout.castShadow = true;
    this.neck.add(snout);

    const nostril = new THREE.Mesh(new THREE.BoxGeometry(R * 1.16, R * 0.16, R * 0.3), body);
    nostril.position.set(0, R * 0.38, R * 1.7);
    this.neck.add(nostril);

    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(R * 0.15, 8, 6), accent);
      eye.position.set(s * R * 0.7, R * 0.42, R * 0.68);
      this.neck.add(eye);

      const brow = new THREE.Mesh(new THREE.BoxGeometry(R * 0.46, R * 0.2, R * 0.62), body);
      brow.position.set(s * R * 0.6, R * 0.72, R * 0.6);
      brow.castShadow = true;
      this.neck.add(brow);
    }

    // Teeth hang from the underside of the snout, pointing DOWN.
    this._teeth(snout, R, -R * 0.39, R * 1.35, -1);

    // Hinged lower jaw — opened by the pose target on a bite.
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, -R * 0.42, R * 0.32);
    this.neck.add(this.jaw);

    const lower = new THREE.Mesh(new THREE.BoxGeometry(R * 1.0, R * 0.42, R * 1.5), skin);
    lower.position.set(0, -R * 0.2, R * 0.72);
    lower.castShadow = true;
    this.jaw.add(lower);

    // ...and up from the top of the lower jaw.
    this._teeth(lower, R, R * 0.21, R * 1.5, 1);
  }

  /**
   * A row of little cones along one jaw.
   *
   * `depth` is the parent mesh's own Z extent: teeth are spread across it and
   * clamped inside. Spacing them past the mesh leaves cones floating in the air
   * in front of the face, which is exactly what the first version did.
   */
  _teeth(parent, R, y, depth, dir) {
    const toothMat = this._toothMat ??= new THREE.MeshStandardMaterial({
      color: '#fdf6e3', roughness: 0.5,
    });
    const n = 4;
    const half = depth * 0.5;
    for (let i = 0; i < n; i++) {
      // Evenly spaced across the mesh, inset so none pokes out of the ends.
      const z = -half * 0.62 + (i / (n - 1)) * half * 1.24;
      for (const s of [-1, 1]) {
        const t = new THREE.Mesh(new THREE.ConeGeometry(R * 0.085, R * 0.3, 4), toothMat);
        t.position.set(s * R * 0.38, y, z);
        // dir -1 points the cone down (upper jaw), +1 leaves it up (lower jaw).
        if (dir < 0) t.rotation.x = Math.PI;
        parent.add(t);
      }
    }
  }

  /** A tapering chain of segments hanging off the hips, angled back. */
  _buildTail(L, body, accent) {
    const spec = L.tail;
    const base = new THREE.Group();
    base.rotation.x = spec.pitch; // +x swings the chain backward (-Z)
    this.hips.add(base);
    this.tailBase = base;

    let parent = base;
    let radius = spec.radius;
    for (let i = 0; i < spec.segments; i++) {
      const joint = new THREE.Group();
      if (i > 0) joint.position.y = -spec.length;
      parent.add(joint);

      const seg = limbSegment(spec.length, radius, body);
      joint.add(seg);

      this.tail.push(joint);
      parent = joint;
      radius *= spec.taper;
    }
  }

  /** Where the HUD/FX should place a hit spark for this rig. */
  chestWorldY() {
    return this.lengths.hipY * (this.cfg.scale ?? 1) + 0.3;
  }

  /**
   * A pose target for PoseAnimator. Because this rig was authored to the
   * poser's exact axis convention, applying a pose is a direct assignment —
   * no bone-frame correction needed (contrast SkeletonPoseTarget).
   *
   * `restPose` is added on top, which is what lets a body type hold a posture
   * (a dinosaur's permanently bent legs) without every pose having to know
   * about it.
   */
  createPoseTarget() {
    const r = this;
    const rest = this.restPose;
    // Tail follow-through state: the tail lags the body rather than being
    // rigidly parented to it, which is most of what sells it as a tail.
    let tailSwing = 0;
    let tailLift = 0;

    return {
      kind: 'procedural',
      apply(p, ctx) {
        r.body.position.y = p.bodyY + ctx.breath;
        r.body.position.z = p.bodyZ * ctx.weightShift;
        r.body.rotation.x = p.bodyTilt;

        r.torso.rotation.set(p.torsoX, p.torsoY * ctx.twist, p.torsoZ);
        r.neck.rotation.set(p.neckX, p.neckY, 0);

        r.arms.L.shoulder.rotation.set(p.shLx + (rest.shLx ?? 0), p.shLy, p.shLz);
        r.arms.R.shoulder.rotation.set(p.shRx + (rest.shRx ?? 0), p.shRy, p.shRz);
        r.arms.L.elbow.rotation.x = p.elL + (rest.elL ?? 0);
        r.arms.R.elbow.rotation.x = p.elR + (rest.elR ?? 0);

        const hipL = p.hipLx + (rest.hipLx ?? 0);
        const hipR = p.hipRx + (rest.hipRx ?? 0);
        const kneeL = p.kneeL + (rest.kneeL ?? 0);
        const kneeR = p.kneeR + (rest.kneeR ?? 0);

        r.legs.L.hip.rotation.set(hipL, 0, p.hipLz);
        r.legs.R.hip.rotation.set(hipR, 0, p.hipRz);
        r.legs.L.knee.rotation.x = kneeL;
        r.legs.R.knee.rotation.x = kneeR;

        // Keep the feet roughly flat rather than pointing wherever the shin went.
        r.legs.L.ankle.rotation.x = -(hipL + kneeL) * 0.55;
        r.legs.R.ankle.rotation.x = -(hipR + kneeR) * 0.55;

        // Jaws. A creature with a mouth should use it, so the jaw snaps open
        // through the wind-up and SHUTS on the strike — the bite lands with
        // the teeth, which is the opposite of easing the mouth open as the
        // move finishes. Generic over moves: the rig knows it has jaws, it
        // does not need to know which move is a bite.
        const f = ctx.fighter;
        if (r.jaw) {
          let bite = Math.max(0, -p.neckX) * 1.2;
          if (f && f.state === STATE.ATTACK) {
            const t = f.phase === PHASE.STARTUP ? f.phaseProgress
                    : f.phase === PHASE.ACTIVE ? 1 - f.phaseProgress * 0.85
                    : 0.15 * (1 - f.phaseProgress);
            bite = Math.max(bite, t * 0.85);
          }
          r.jaw.rotation.x = Math.min(0.9, bite);
        }

        if (r.tail.length) {
          // Chase the body's twist and lean, then distribute the result down
          // the chain so each segment trails the one before it.
          tailSwing += ((-p.torsoY * 0.55) - tailSwing) * 0.18;
          tailLift += ((-p.bodyZ * 0.9 - p.bodyTilt * 0.5) - tailLift) * 0.15;
          for (let i = 0; i < r.tail.length; i++) {
            const f = (i + 1) / r.tail.length;
            r.tail[i].rotation.y = tailSwing * f * 0.75;
            r.tail[i].rotation.x = tailLift * f * 0.8;
          }
        }
      },
    };
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) o.geometry?.dispose();
    });
    for (const m of Object.values(this.materials)) m.dispose();
    this._toothMat?.dispose();
  }
}
