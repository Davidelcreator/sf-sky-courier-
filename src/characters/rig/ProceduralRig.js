import * as THREE from 'three';

/**
 * The procedural fighter rig.
 *
 * Two things matter here:
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
 * Local axes, and every pose in PoseAnimator depends on this convention:
 *   +Z = forward, toward the opponent (the root is yaw-rotated by facing)
 *   limbs hang along -Y, so a NEGATIVE x-rotation swings a limb forward
 */

const L = {
  hipY: 0.87,       // hip height — chosen so the feet land exactly on y=0
  thigh: 0.42,
  shin: 0.40,
  footHalf: 0.05,
  hipHalfWidth: 0.12,

  chestH: 0.60,
  shoulderY: 0.52,  // above the hips
  shoulderX: 0.24,
  upperArm: 0.32,
  forearm: 0.30,

  headY: 0.74,
  headR: 0.16,
};

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
    this.torso = new THREE.Group(); // the independent twist group
    this.hips.add(this.torso);

    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, L.chestH, 0.26),
      body,
    );
    chest.position.y = L.chestH / 2;
    chest.castShadow = true;
    chest.receiveShadow = true;
    this.torso.add(chest);

    // A belt in the accent colour reads as a waist and sells the twist.
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.09, 0.28), accent);
    belt.position.y = 0.03;
    belt.castShadow = true;
    this.torso.add(belt);

    this.neck = new THREE.Group();
    this.neck.position.y = L.headY;
    this.torso.add(this.neck);

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

    // --- arms: shoulder -> elbow -> hand --------------------------------
    this.arms = {};
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;

      const shoulder = new THREE.Group();
      shoulder.position.set(s * L.shoulderX, L.shoulderY, 0);
      this.torso.add(shoulder);
      shoulder.add(limbSegment(L.upperArm, 0.075, body));

      const elbow = new THREE.Group();
      elbow.position.y = -L.upperArm;
      shoulder.add(elbow);
      elbow.add(limbSegment(L.forearm, 0.065, skin));

      const hand = new THREE.Group();
      hand.position.y = -L.forearm;
      elbow.add(hand);

      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), accent);
      glove.castShadow = true;
      hand.add(glove);

      this.arms[side] = { shoulder, elbow, hand };
    }

    // --- legs: hip -> knee -> foot --------------------------------------
    this.legs = {};
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;

      const hip = new THREE.Group();
      hip.position.set(s * L.hipHalfWidth, 0, 0);
      this.hips.add(hip);
      hip.add(limbSegment(L.thigh, 0.095, body));

      const knee = new THREE.Group();
      knee.position.y = -L.thigh;
      hip.add(knee);
      knee.add(limbSegment(L.shin, 0.08, body));

      const ankle = new THREE.Group();
      ankle.position.y = -L.shin;
      knee.add(ankle);

      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, L.footHalf * 2, 0.3), accent);
      foot.position.set(0, -L.footHalf, 0.06);
      foot.castShadow = true;
      ankle.add(foot);

      this.legs[side] = { hip, knee, ankle };
    }

    const scale = cfg.scale ?? 1;
    this.root.scale.setScalar(scale);
    this.lengths = L;
  }

  /** Where the HUD/FX should place a hit spark for this rig. */
  chestWorldY() {
    return L.hipY * (this.cfg.scale ?? 1) + 0.3;
  }

  /**
   * A pose target for PoseAnimator. Because this rig was authored to the
   * poser's exact axis convention, applying a pose is a direct assignment —
   * no bone-frame correction needed (contrast SkeletonPoseTarget).
   */
  createPoseTarget() {
    const r = this;
    return {
      kind: 'procedural',
      apply(p, ctx) {
        r.body.position.y = p.bodyY + ctx.breath;
        r.body.position.z = p.bodyZ * ctx.weightShift;
        r.body.rotation.x = p.bodyTilt;

        r.torso.rotation.set(p.torsoX, p.torsoY * ctx.twist, p.torsoZ);
        r.neck.rotation.set(p.neckX, p.neckY, 0);

        r.arms.L.shoulder.rotation.set(p.shLx, p.shLy, p.shLz);
        r.arms.R.shoulder.rotation.set(p.shRx, p.shRy, p.shRz);
        r.arms.L.elbow.rotation.x = p.elL;
        r.arms.R.elbow.rotation.x = p.elR;

        r.legs.L.hip.rotation.set(p.hipLx, 0, p.hipLz);
        r.legs.R.hip.rotation.set(p.hipRx, 0, p.hipRz);
        r.legs.L.knee.rotation.x = p.kneeL;
        r.legs.R.knee.rotation.x = p.kneeR;

        // Keep the feet roughly flat rather than pointing wherever the shin went.
        r.legs.L.ankle.rotation.x = -(p.hipLx + p.kneeL) * 0.55;
        r.legs.R.ankle.rotation.x = -(p.hipRx + p.kneeR) * 0.55;
      },
    };
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) o.geometry?.dispose();
    });
    for (const m of Object.values(this.materials)) m.dispose();
  }
}
