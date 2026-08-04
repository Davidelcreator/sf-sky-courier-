import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Animation retargeting: take a clip authored for one humanoid skeleton and
 * replay it on another whose bones are named differently and proportioned
 * differently.
 *
 * Three facts about `SkeletonUtils.retargetClip` in three r160 drive this file,
 * and getting any of them wrong produces a silently T-posed character:
 *
 *  1. `options.names` maps **target bone name → source bone name**. Backwards
 *     is the single most common mistake and it fails silently, because
 *     unmatched bones are simply skipped.
 *  2. `options.hip` must be the **source-side** name (it is compared after the
 *     name map is applied). Get it wrong and the character animates in place
 *     with no root motion.
 *  3. The emitted tracks are named `.bones[TargetName].quaternion`, which only
 *     resolves when the AnimationMixer is rooted on the **SkinnedMesh** — not
 *     on the scene, the group, or the GLTF root.
 *
 * Rigs that fail here are not fatal: `retargetClip` throws, CharacterLoader
 * catches, and the character falls back to the procedural poser.
 */

/** Strip authoring-tool noise so 'mixamorig:LeftForeArm' and 'L_forearm' meet. */
export function normalizeBoneName(name) {
  return String(name)
    .replace(/^.*[|:]/, '')          // 'Armature|mixamorig:Hips' -> 'Hips'
    .replace(/^mixamorig/i, '')
    .replace(/^bip\d*_?/i, '')
    .replace(/^(bone_|jnt_|jt_|def_|org_)/i, '')
    .replace(/[\s._-]/g, '')
    .toLowerCase();
}

/** Canonical humanoid bone ids, and every spelling we accept for each. */
const SYNONYMS = {
  hips: ['hips', 'hip', 'pelvis', 'root', 'cog'],
  spine: ['spine', 'spine0', 'abdomen', 'waist', 'lowerback'],
  spine1: ['spine1', 'chest', 'torso', 'spine01'],
  spine2: ['spine2', 'upperchest', 'chestupper', 'spine02'],
  neck: ['neck', 'neck1'],
  head: ['head'],

  leftshoulder: ['leftshoulder', 'lshoulder', 'leftclavicle', 'lclavicle', 'shoulderl', 'clavicles_l'],
  leftarm: ['leftarm', 'larm', 'leftupperarm', 'lupperarm', 'upperarml', 'arml'],
  leftforearm: ['leftforearm', 'lforearm', 'leftlowerarm', 'llowerarm', 'lowerarml', 'forearml', 'leftelbow'],
  lefthand: ['lefthand', 'lhand', 'handl', 'leftwrist'],

  rightshoulder: ['rightshoulder', 'rshoulder', 'rightclavicle', 'rclavicle', 'shoulderr', 'clavicles_r'],
  rightarm: ['rightarm', 'rarm', 'rightupperarm', 'rupperarm', 'upperarmr', 'armr'],
  rightforearm: ['rightforearm', 'rforearm', 'rightlowerarm', 'rlowerarm', 'lowerarmr', 'forearmr', 'rightelbow'],
  righthand: ['righthand', 'rhand', 'handr', 'rightwrist'],

  leftupleg: ['leftupleg', 'lupleg', 'leftthigh', 'lthigh', 'leftupperleg', 'upperlegl', 'thighl'],
  leftleg: ['leftleg', 'lleg', 'leftshin', 'lshin', 'leftcalf', 'lcalf', 'leftlowerleg', 'lowerlegl', 'shinl', 'leftknee'],
  leftfoot: ['leftfoot', 'lfoot', 'footl', 'leftankle'],
  lefttoe: ['lefttoebase', 'lefttoe', 'toel', 'ltoe'],

  rightupleg: ['rightupleg', 'rupleg', 'rightthigh', 'rthigh', 'rightupperleg', 'upperlegr', 'thighr'],
  rightleg: ['rightleg', 'rleg', 'rightshin', 'rshin', 'rightcalf', 'rcalf', 'rightlowerleg', 'lowerlegr', 'shinr', 'rightknee'],
  rightfoot: ['rightfoot', 'rfoot', 'footr', 'rightankle'],
  righttoe: ['righttoebase', 'righttoe', 'toer', 'rtoe'],
};

/** Bones that must map or the retarget is not worth doing. */
const REQUIRED = ['hips', 'leftupleg', 'leftleg', 'rightupleg', 'rightleg', 'leftarm', 'rightarm'];

const LOOKUP = (() => {
  const m = new Map();
  for (const [canonical, spellings] of Object.entries(SYNONYMS)) {
    for (const s of spellings) m.set(s, canonical);
  }
  return m;
})();

/** Resolve one bone name to a canonical humanoid id, or null. */
export function canonicalBone(name) {
  const n = normalizeBoneName(name);
  if (LOOKUP.has(n)) return LOOKUP.get(n);

  // Fall back to a side + part decomposition for names we have not seen,
  // e.g. 'char_arm_upper_left' -> leftarm.
  const side = /^l(?!eg)|left/.test(n) ? 'left' : /^r|right/.test(n) ? 'right' : '';
  if (!side) return null;
  const rest = n.replace(/^(left|right|l|r)/, '');
  const guess = LOOKUP.get(side + rest);
  return guess ?? null;
}

/** Index a skeleton's bones by canonical id. First match wins. */
export function indexSkeleton(skeleton) {
  const byCanonical = new Map();
  for (const bone of skeleton.bones) {
    const c = canonicalBone(bone.name);
    if (c && !byCanonical.has(c)) byCanonical.set(c, bone.name);
  }
  return byCanonical;
}

/**
 * Build the target→source name map SkeletonUtils wants.
 * @returns {{names: object, hip: string|null, coverage: number, missing: string[]}}
 */
export function buildBoneMap(targetSkeleton, sourceSkeleton, overrides = {}) {
  const t = indexSkeleton(targetSkeleton);
  const s = indexSkeleton(sourceSkeleton);

  const names = {};
  let matched = 0;
  for (const [canonical, targetName] of t) {
    const sourceName = s.get(canonical);
    if (sourceName) {
      names[targetName] = sourceName;
      matched++;
    }
  }

  // Explicit overrides from the character JSON always win.
  Object.assign(names, overrides);

  const missing = REQUIRED.filter((c) => !t.has(c) || !s.has(c));
  const hipTarget = t.get('hips');
  const hip = hipTarget ? (names[hipTarget] ?? hipTarget) : null;

  return {
    names,
    hip,
    coverage: t.size ? matched / t.size : 0,
    matched,
    missing,
  };
}

/** Find the first SkinnedMesh in a subtree. */
export function findSkinnedMesh(object) {
  let found = null;
  object.traverse((o) => {
    if (!found && o.isSkinnedMesh && o.skeleton?.bones?.length) found = o;
  });
  return found;
}

export class RetargetError extends Error {}

/**
 * Retarget one clip from a source rig onto a target rig.
 *
 * @param {THREE.SkinnedMesh} targetMesh
 * @param {THREE.SkinnedMesh} sourceMesh
 * @param {THREE.AnimationClip} clip
 * @param {object} opts { boneMap, fps, name }
 * @returns {THREE.AnimationClip}
 */
export function retargetClip(targetMesh, sourceMesh, clip, opts = {}) {
  if (!targetMesh?.isSkinnedMesh) throw new RetargetError('target is not a SkinnedMesh');
  if (!sourceMesh?.isSkinnedMesh) throw new RetargetError('source is not a SkinnedMesh');

  const map = buildBoneMap(targetMesh.skeleton, sourceMesh.skeleton, opts.boneMap);

  if (map.missing.length) {
    throw new RetargetError(
      `bone map incomplete — missing ${map.missing.join(', ')} ` +
      `(matched ${map.matched}/${targetMesh.skeleton.bones.length})`,
    );
  }

  // Retargeting mutates both skeletons' poses as it samples. Restore them after
  // so a failed or partial retarget cannot leave a character bent.
  const targetPose = targetMesh.skeleton.bones.map((b) => b.quaternion.clone());
  const targetPos = targetMesh.skeleton.bones.map((b) => b.position.clone());

  let out;
  try {
    out = SkeletonUtils.retargetClip(targetMesh, sourceMesh, clip, {
      // names maps TARGET bone -> SOURCE bone. See the header note.
      names: map.names,
      // hip is compared against the *mapped* (source-side) name.
      hip: map.hip,
      fps: opts.fps ?? 60,
      useFirstFramePosition: opts.useFirstFramePosition ?? false,
      preserveHipPosition: false,
      preserveMatrix: false,
    });
  } finally {
    targetMesh.skeleton.bones.forEach((b, i) => {
      b.quaternion.copy(targetPose[i]);
      b.position.copy(targetPos[i]);
    });
    targetMesh.skeleton.update?.();
  }

  if (!out || !out.tracks.length) {
    throw new RetargetError(`retarget produced no tracks for "${clip.name}"`);
  }

  out.name = opts.name ?? clip.name;
  // r160 returns duration -1 (meaning "compute from tracks"); resetDuration
  // makes the real length available to callers that need to time-scale it.
  out.resetDuration();
  return out;
}

/** Retarget a whole set, dropping (and reporting) the ones that fail. */
export function retargetAll(targetMesh, sourceMesh, clips, opts = {}) {
  const ok = [];
  const failed = [];
  for (const clip of clips) {
    try {
      ok.push(retargetClip(targetMesh, sourceMesh, clip, opts));
    } catch (err) {
      failed.push({ clip: clip.name, reason: err.message });
    }
  }
  return { clips: ok, failed };
}
