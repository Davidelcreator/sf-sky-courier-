import * as THREE from 'three';
import { indexSkeleton } from './retarget.js';

/**
 * Drives PoseAnimator's poses onto an arbitrary humanoid GLB skeleton.
 *
 * This is what makes the procedural poser a real fallback rather than a
 * consolation prize: if a rig's clips fail to retarget, it still fights with
 * the same three-phase timing and the same two-segment arcs as the box rig.
 *
 * ## The bone-frame problem
 *
 * Poses are authored in one convention — **limb hangs along -Y, +Z is
 * forward** — but an imported rig's bones point wherever the artist left them.
 * Assigning `bone.rotation.x = poseValue` on a Mixamo arm (whose bone axis runs
 * down the limb, not down -Y) produces a character that folds inside out.
 *
 * The fix is a per-bone change of basis, computed once at bind time:
 *
 *   restDir  = normalize(childBone.position)   // where this limb actually points
 *   qAlign   = rotation taking (0,-1,0) -> restDir
 *   qDelta   = qAlign * qPose * qAlign⁻¹       // qPose, conjugated into bone space
 *   bone.q   = bindQuat * qDelta
 *
 * `child.position` lives in exactly the frame that `bone.quaternion` rotates,
 * which is why the conjugation lands in the right space.
 */

/**
 * The direction each joint points in the authoring convention.
 *
 * Limbs hang DOWN (-Y) but the spine and neck stack UP (+Y). Using one shared
 * canonical direction for both is a real bug and a subtle one: aligning (0,-1,0)
 * onto a spine's (0,+1,0) is the antiparallel case, where `setFromUnitVectors`
 * has to invent an arbitrary perpendicular axis. The torso then twists about an
 * unpredictable axis and the whole upper body reads wrong.
 */
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const CANONICAL_DIR = {
  spine: UP, spine1: UP, spine2: UP, neck: UP, head: UP,
};
const canonicalDirFor = (canonical) => CANONICAL_DIR[canonical] ?? DOWN;

/** Which canonical bone each driven joint follows, for the rest-direction. */
const CHILD_OF = {
  spine1: 'neck',
  spine: 'spine1',
  neck: 'head',
  leftarm: 'leftforearm',
  leftforearm: 'lefthand',
  rightarm: 'rightforearm',
  rightforearm: 'righthand',
  leftupleg: 'leftleg',
  leftleg: 'leftfoot',
  rightupleg: 'rightleg',
  rightleg: 'rightfoot',
};

/** Pose keys -> canonical bone, as (x, y, z) euler triples in canonical space. */
function poseToEulers(p, ctx) {
  return {
    spine1: [p.torsoX, p.torsoY * ctx.twist, p.torsoZ],
    neck: [p.neckX, p.neckY, 0],
    leftarm: [p.shLx, p.shLy, p.shLz],
    leftforearm: [p.elL, 0, 0],
    rightarm: [p.shRx, p.shRy, p.shRz],
    rightforearm: [p.elR, 0, 0],
    leftupleg: [p.hipLx, 0, p.hipLz],
    leftleg: [p.kneeL, 0, 0],
    rightupleg: [p.hipRx, 0, p.hipRz],
    rightleg: [p.kneeR, 0, 0],
    leftfoot: [-(p.hipLx + p.kneeL) * 0.55, 0, 0],
    rightfoot: [-(p.hipRx + p.kneeR) * 0.55, 0, 0],
  };
}

export class SkeletonPoseTarget {
  /**
   * @param {THREE.SkinnedMesh} skinnedMesh
   * @param {THREE.Object3D} bodyGroup wrapper we own, in world units — body
   *   offsets go here rather than onto the hips bone, so a rig authored in
   *   centimetres does not need unit conversion.
   */
  constructor(skinnedMesh, bodyGroup) {
    this.kind = 'skeleton';
    this.mesh = skinnedMesh;
    this.body = bodyGroup;

    const skeleton = skinnedMesh.skeleton;
    skeleton.pose(); // ensure we are reading the bind pose, not a posed one

    const byName = new Map(skeleton.bones.map((b) => [b.name, b]));
    this.index = indexSkeleton(skeleton); // canonical -> bone name

    /** @type {Map<string, {bone, bind: THREE.Quaternion, align: THREE.Quaternion, alignInv: THREE.Quaternion}>} */
    this.joints = new Map();

    for (const [canonical, boneName] of this.index) {
      const bone = byName.get(boneName);
      if (!bone) continue;

      const bind = bone.quaternion.clone();

      // Rest direction: toward the canonical child if we can find it, else the
      // bone's own first child, else straight down (a safe no-op alignment).
      let restDir = null;
      const childCanonical = CHILD_OF[canonical];
      const childName = childCanonical ? this.index.get(childCanonical) : null;
      const childBone = childName ? byName.get(childName) : null;

      if (childBone && childBone.parent === bone && childBone.position.lengthSq() > 1e-10) {
        restDir = childBone.position.clone().normalize();
      } else {
        const anyChild = bone.children.find(
          (c) => c.isBone && c.position.lengthSq() > 1e-10,
        );
        if (anyChild) restDir = anyChild.position.clone().normalize();
      }

      const align = new THREE.Quaternion();
      if (restDir) align.setFromUnitVectors(canonicalDirFor(canonical), restDir);

      this.joints.set(canonical, {
        bone,
        bind,
        align,
        alignInv: align.clone().invert(),
      });
    }

    // Scratch objects — posing runs every frame for every fighter.
    this._e = new THREE.Euler();
    this._qPose = new THREE.Quaternion();
    this._qDelta = new THREE.Quaternion();
  }

  /** True if we found enough of a humanoid to be worth posing. */
  get usable() {
    return ['leftarm', 'rightarm', 'leftupleg', 'rightupleg'].every((b) =>
      this.joints.has(b),
    );
  }

  apply(p, ctx) {
    // Body offsets live on the wrapper, in world units.
    this.body.position.y = p.bodyY + ctx.breath;
    this.body.position.z = p.bodyZ * ctx.weightShift;
    this.body.rotation.x = p.bodyTilt;

    const eulers = poseToEulers(p, ctx);

    // Torso twist falls back to `spine` when a rig has no `spine1`.
    if (!this.joints.has('spine1') && this.joints.has('spine')) {
      eulers.spine = eulers.spine1;
    }

    for (const [canonical, e] of Object.entries(eulers)) {
      const j = this.joints.get(canonical);
      if (!j) continue;

      this._e.set(e[0], e[1], e[2], 'XYZ');
      this._qPose.setFromEuler(this._e);

      // qDelta = align * qPose * align⁻¹ — the pose, expressed in this bone's
      // own frame instead of the authoring frame.
      this._qDelta.copy(j.align).multiply(this._qPose).multiply(j.alignInv);

      j.bone.quaternion.copy(j.bind).multiply(this._qDelta);
    }
  }

  /** Restore the bind pose (used when handing control back to clips). */
  reset() {
    for (const j of this.joints.values()) j.bone.quaternion.copy(j.bind);
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
  }
}
