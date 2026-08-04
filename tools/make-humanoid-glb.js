/**
 * Generates public/models/humanoid.glb — a rigged, animated humanoid used as
 *   (a) the source rig the shared animation clips are authored against, and
 *   (b) a bundled test model proving the retarget path works end to end.
 *
 * Run: npm run make:humanoid
 *
 * The skeleton is deliberately *canonical*: limbs hang along -Y, the spine
 * stacks along +Y, and the model faces +Z. Bone names follow the Mixamo-style
 * convention that retarget.js already recognises, so this rig is the easiest
 * possible retarget source. Skinning is rigid (one bone per vertex), which is
 * all a blocky test model needs and keeps the file tiny.
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/models/humanoid.glb');

// GLTFExporter's only browser dependency for a texture-less GLB is FileReader,
// which it uses purely to turn a Blob into an ArrayBuffer. Node 22 has Blob
// (with .arrayBuffer()) but no FileReader, so this shim is all that stands
// between us and a headless export.
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReaderShim {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        this.onloadend?.();
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

/** [name, parent, localPosition, boxSize] — box is the geometry for this bone. */
const BONES = [
  ['Hips',          null,           [0, 0.87, 0],     [0.30, 0.16, 0.20]],
  ['Spine',         'Hips',         [0, 0.12, 0],     [0.32, 0.20, 0.21]],
  ['Spine1',        'Spine',        [0, 0.22, 0],     [0.40, 0.26, 0.24]],
  ['Neck',          'Spine1',       [0, 0.26, 0],     [0.10, 0.10, 0.10]],
  ['Head',          'Neck',         [0, 0.12, 0],     [0.24, 0.26, 0.24]],

  ['LeftShoulder',  'Spine1',       [-0.09, 0.19, 0], [0.12, 0.11, 0.13]],
  ['LeftArm',       'LeftShoulder', [-0.15, 0, 0],    [0.11, 0.32, 0.11]],
  ['LeftForeArm',   'LeftArm',      [0, -0.32, 0],    [0.09, 0.30, 0.09]],
  ['LeftHand',      'LeftForeArm',  [0, -0.30, 0],    [0.11, 0.12, 0.11]],

  ['RightShoulder', 'Spine1',       [0.09, 0.19, 0],  [0.12, 0.11, 0.13]],
  ['RightArm',      'RightShoulder',[0.15, 0, 0],     [0.11, 0.32, 0.11]],
  ['RightForeArm',  'RightArm',     [0, -0.32, 0],    [0.09, 0.30, 0.09]],
  ['RightHand',     'RightForeArm', [0, -0.30, 0],    [0.11, 0.12, 0.11]],

  ['LeftUpLeg',     'Hips',         [-0.12, -0.04, 0],[0.15, 0.42, 0.15]],
  ['LeftLeg',       'LeftUpLeg',    [0, -0.42, 0],    [0.13, 0.40, 0.13]],
  ['LeftFoot',      'LeftLeg',      [0, -0.40, 0],    [0.14, 0.09, 0.26]],

  ['RightUpLeg',    'Hips',         [0.12, -0.04, 0], [0.15, 0.42, 0.15]],
  ['RightLeg',      'RightUpLeg',   [0, -0.42, 0],    [0.13, 0.40, 0.13]],
  ['RightFoot',     'RightLeg',     [0, -0.40, 0],    [0.14, 0.09, 0.26]],
];

/** Bones whose box hangs DOWN from the joint rather than centring on it. */
const HANGS_DOWN = new Set([
  'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm',
  'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg',
]);

function buildSkeleton() {
  const bones = new Map();
  const order = [];

  for (const [name, parent, pos] of BONES) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.fromArray(pos);
    if (parent) bones.get(parent).add(b);
    bones.set(name, b);
    order.push(b);
  }
  return { root: bones.get('Hips'), bones, order };
}

function buildGeometry(bones, order) {
  const parts = [];
  const skinIndices = [];
  const skinWeights = [];

  // Bind-pose world matrices, so geometry can be authored in world space.
  bones.get('Hips').updateMatrixWorld(true);

  order.forEach((bone, boneIndex) => {
    const spec = BONES.find((b) => b[0] === bone.name);
    const [, , , size] = spec;

    const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
    // Feet stick forward; limbs hang from the joint; everything else centres.
    if (HANGS_DOWN.has(bone.name)) geo.translate(0, -size[1] / 2, 0);
    else if (bone.name.endsWith('Foot')) geo.translate(0, -size[1] / 2, size[2] * 0.22);

    geo.applyMatrix4(bone.matrixWorld);

    const count = geo.attributes.position.count;
    for (let i = 0; i < count; i++) {
      skinIndices.push(boneIndex, 0, 0, 0);
      skinWeights.push(1, 0, 0, 0);   // rigid skinning: one bone per vertex
    }
    parts.push(geo);
  });

  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  merged.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  merged.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  return merged;
}

// ---------------------------------------------------------------------------
// Animation — authored in the same convention PoseAnimator uses, so the clips
// and the procedural fallback agree on what a punch looks like.
// ---------------------------------------------------------------------------

const POSE_BONE = {
  torso: 'Spine1', neck: 'Neck',
  shL: 'LeftArm', elL: 'LeftForeArm',
  shR: 'RightArm', elR: 'RightForeArm',
  hipL: 'LeftUpLeg', kneeL: 'LeftLeg',
  hipR: 'RightUpLeg', kneeR: 'RightLeg',
};

const STANCE = {
  torso: [0, 0.16, 0], neck: [0, 0, 0],
  shL: [-0.28, 0, 0.16], elL: [-1.15, 0, 0],
  shR: [-0.40, 0, -0.14], elR: [-1.32, 0, 0],
  hipL: [-0.13, 0, 0.05], kneeL: [0.30, 0, 0],
  hipR: [0.15, 0, -0.05], kneeR: [0.24, 0, 0],
  _hips: [0, -0.04, 0],
};

const p = (over) => ({ ...STANCE, ...over });

/** name -> [{ t, pose }] keyframes. Timings mirror the frame data in /config. */
const CLIPS = {
  idle: [
    { t: 0,   pose: p({}) },
    { t: 0.9, pose: p({ _hips: [0, -0.005, 0], torso: [0.02, 0.16, 0] }) },
    { t: 1.8, pose: p({}) },
  ],

  walk: [
    { t: 0,    pose: p({ hipL: [-0.55, 0, 0.05], kneeL: [0.18, 0, 0], hipR: [0.5, 0, -0.05], kneeR: [0.62, 0, 0], shL: [0.1, 0, 0.16], shR: [-0.7, 0, -0.14] }) },
    { t: 0.3,  pose: p({ _hips: [0, -0.08, 0] }) },
    { t: 0.6,  pose: p({ hipL: [0.5, 0, 0.05], kneeL: [0.62, 0, 0], hipR: [-0.55, 0, -0.05], kneeR: [0.18, 0, 0], shL: [-0.7, 0, 0.16], shR: [0.1, 0, -0.14] }) },
    { t: 0.9,  pose: p({ _hips: [0, -0.08, 0] }) },
    { t: 1.2,  pose: p({ hipL: [-0.55, 0, 0.05], kneeL: [0.18, 0, 0], hipR: [0.5, 0, -0.05], kneeR: [0.62, 0, 0], shL: [0.1, 0, 0.16], shR: [-0.7, 0, -0.14] }) },
  ],

  // punch: windup -> strike -> follow, matching the poser's three phases.
  punch: [
    { t: 0,    pose: p({}) },
    { t: 0.07, pose: p({ torso: [0, -0.42, 0], shR: [0.55, 0, 0.2], elR: [-2.0, 0, 0], _hips: [0, -0.06, -0.07] }) },
    { t: 0.12, pose: p({ torso: [0, 0.50, 0], shR: [-1.46, 0, -0.14], elR: [-0.04, 0, 0], neck: [0, 0.12, 0], _hips: [0, -0.02, 0.14] }) },
    { t: 0.25, pose: p({ torso: [0, 0.12, 0], shR: [-0.52, 0, 0.05], elR: [-1.38, 0, 0], _hips: [0, -0.05, 0.03] }) },
    { t: 0.4,  pose: p({}) },
  ],

  kick: [
    { t: 0,    pose: p({}) },
    { t: 0.12, pose: p({ torso: [0.16, -0.22, 0], hipR: [-0.38, 0, -0.05], kneeR: [1.45, 0, 0], _hips: [0, -0.08, -0.05] }) },
    { t: 0.19, pose: p({ torso: [0.36, 0.24, -0.08], hipR: [-1.28, 0, -0.05], kneeR: [0.10, 0, 0], shL: [0.55, 0, 0.55], elL: [-0.65, 0, 0], _hips: [0, -0.03, 0.07] }) },
    { t: 0.36, pose: p({ torso: [0.14, 0.06, 0], hipR: [-0.5, 0, -0.05], kneeR: [0.92, 0, 0] }) },
    { t: 0.5,  pose: p({}) },
  ],

  special: [
    { t: 0,    pose: p({}) },
    { t: 0.17, pose: p({ torso: [0, -0.5, 0], shL: [0.35, 0, 0.45], elL: [-2.2, 0, 0], shR: [0.30, 0, -0.42], elR: [-2.25, 0, 0], _hips: [0, -0.14, -0.10] }) },
    { t: 0.24, pose: p({ torso: [0, 0.05, 0], shL: [-1.52, 0, 0.18], elL: [-0.06, 0, 0], shR: [-1.52, 0, -0.18], elR: [-0.06, 0, 0], _hips: [0, -0.02, 0.18] }) },
    { t: 0.45, pose: p({ torso: [0, 0.14, 0], shL: [-0.6, 0, 0.16], elL: [-1.3, 0, 0], shR: [-0.68, 0, -0.14], elR: [-1.4, 0, 0] }) },
    { t: 0.6,  pose: p({}) },
  ],

  block: [
    { t: 0,   pose: p({ torso: [0.10, 0.52, 0], neck: [0.12, 0, 0], shL: [-0.92, 0, 0.34], elL: [-2.05, 0, 0], shR: [-0.78, 0, -0.30], elR: [-2.15, 0, 0], hipL: [-0.20, 0, 0.05], kneeL: [0.44, 0, 0], hipR: [0.22, 0, -0.05], kneeR: [0.36, 0, 0], _hips: [0, -0.10, -0.06] }) },
    { t: 0.6, pose: p({ torso: [0.10, 0.52, 0], neck: [0.12, 0, 0], shL: [-0.95, 0, 0.34], elL: [-2.08, 0, 0], shR: [-0.80, 0, -0.30], elR: [-2.18, 0, 0], hipL: [-0.20, 0, 0.05], kneeL: [0.44, 0, 0], hipR: [0.22, 0, -0.05], kneeR: [0.36, 0, 0], _hips: [0, -0.10, -0.06] }) },
  ],

  hit: [
    { t: 0,    pose: p({}) },
    { t: 0.08, pose: p({ torso: [-0.30, -0.10, 0], neck: [-0.38, 0, 0], shL: [0.52, 0, 0.5], elL: [-0.55, 0, 0], shR: [0.46, 0, -0.48], elR: [-0.5, 0, 0], _hips: [0, -0.05, -0.13] }) },
    { t: 0.3,  pose: p({}) },
  ],

  jump: [
    { t: 0,   pose: p({ torso: [-0.08, 0.12, 0], shL: [-0.55, 0, 0.3], elL: [-1.5, 0, 0], shR: [-0.65, 0, -0.28], elR: [-1.6, 0, 0], hipL: [-0.55, 0, 0.05], kneeL: [1.05, 0, 0], hipR: [-0.22, 0, -0.05], kneeR: [0.72, 0, 0], _hips: [0, 0.02, 0] }) },
    { t: 0.5, pose: p({ torso: [-0.08, 0.12, 0], shL: [-0.6, 0, 0.3], elL: [-1.55, 0, 0], shR: [-0.7, 0, -0.28], elR: [-1.65, 0, 0], hipL: [-0.6, 0, 0.05], kneeL: [1.1, 0, 0], hipR: [-0.25, 0, -0.05], kneeR: [0.78, 0, 0], _hips: [0, 0.02, 0] }) },
  ],

  ko: [
    { t: 0,   pose: p({}) },
    { t: 0.2, pose: p({ torso: [-0.35, 0, 0], neck: [-0.5, 0, 0], shL: [0.85, 0, 0.7], shR: [0.80, 0, -0.68], _hips: [0, -0.15, -0.2] }) },
    { t: 0.7, pose: p({ torso: [-0.35, 0, 0], neck: [-0.5, 0, 0], shL: [0.85, 0, 0.7], elL: [-0.35, 0, 0], shR: [0.80, 0, -0.68], elR: [-0.30, 0, 0], hipL: [-0.55, 0, 0], kneeL: [0.55, 0, 0], hipR: [-0.30, 0, 0], kneeR: [0.40, 0, 0], _hips: [0, -0.30, -0.35] }) },
  ],
};

function buildClip(name, keyframes, bones) {
  const tracks = [];
  const times = keyframes.map((k) => k.t);

  for (const [poseKey, boneName] of Object.entries(POSE_BONE)) {
    const values = [];
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (const k of keyframes) {
      const [x, y, z] = k.pose[poseKey] ?? [0, 0, 0];
      e.set(x, y, z, 'XYZ');
      q.setFromEuler(e);
      values.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values));
  }

  // Hips translation carries the vertical bob and the weight shift.
  const hipsRest = bones.get('Hips').position;
  const hipValues = [];
  for (const k of keyframes) {
    const [dx, dy, dz] = k.pose._hips ?? [0, 0, 0];
    hipValues.push(hipsRest.x + dx, hipsRest.y + dy, hipsRest.z + dz);
  }
  tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, hipValues));

  return new THREE.AnimationClip(name, times[times.length - 1], tracks);
}

// ---------------------------------------------------------------------------

function main() {
  const { root, bones, order } = buildSkeleton();
  const geometry = buildGeometry(bones, order);

  const skeleton = new THREE.Skeleton(order);
  const material = new THREE.MeshStandardMaterial({
    color: 0x9aa4c8, roughness: 0.7, metalness: 0.1,
  });

  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'HumanoidBody';
  mesh.add(root);
  mesh.bind(skeleton);

  const scene = new THREE.Scene();
  scene.name = 'Humanoid';
  scene.add(mesh);

  const animations = Object.entries(CLIPS).map(([name, kf]) => buildClip(name, kf, bones));

  const exporter = new GLTFExporter();
  exporter.parse(
    scene,
    (result) => {
      mkdirSync(dirname(OUT), { recursive: true });
      writeFileSync(OUT, Buffer.from(result));
      const kb = (result.byteLength / 1024).toFixed(1);
      console.log(`wrote ${OUT} (${kb} KB)`);
      console.log(`  bones: ${order.length}`);
      console.log(`  clips: ${animations.map((a) => `${a.name}(${a.duration.toFixed(2)}s)`).join(', ')}`);
    },
    (err) => { console.error('export failed:', err); process.exitCode = 1; },
    { binary: true, animations, onlyVisible: false },
  );
}

main();
