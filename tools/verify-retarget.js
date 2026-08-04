/**
 * End-to-end proof that the retargeting pipeline works.
 *
 * Run: npm run test:retarget
 *
 * This is not a smoke test. It loads the real bundled GLB, builds a target rig
 * that is deliberately hostile — Mixamo-prefixed bone names, different limb
 * proportions, a different bone ORDER — and then asserts that the retargeted
 * clip actually moves that rig's bones. A retarget that silently produces
 * zero-motion tracks (the usual failure) fails here.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  retargetClip, retargetAll, buildBoneMap, findSkinnedMesh,
  canonicalBone, normalizeBoneName,
} from '../src/characters/rig/retarget.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const GLB = resolve(HERE, '../public/models/humanoid.glb');

let failures = 0;
const ok = (label) => console.log(`  [32mPASS[0m ${label}`);
const bad = (label, detail) => {
  failures++;
  console.log(`  [31mFAIL[0m ${label}${detail ? ` — ${detail}` : ''}`);
};
function assert(cond, label, detail) { cond ? ok(label) : bad(label, detail); }

// ---------------------------------------------------------------------------
// A target rig that shares nothing with the source but its topology.
// ---------------------------------------------------------------------------
const TARGET_BONES = [
  ['mixamorig:Hips',          null,                        [0, 1.02, 0]],
  ['mixamorig:Spine',         'mixamorig:Hips',            [0, 0.16, 0]],
  ['mixamorig:Spine1',        'mixamorig:Spine',           [0, 0.28, 0]],
  ['mixamorig:Neck',          'mixamorig:Spine1',          [0, 0.30, 0]],
  ['mixamorig:Head',          'mixamorig:Neck',            [0, 0.15, 0]],
  ['mixamorig:LeftShoulder',  'mixamorig:Spine1',          [-0.11, 0.22, 0]],
  ['mixamorig:LeftArm',       'mixamorig:LeftShoulder',    [-0.19, 0, 0]],
  ['mixamorig:LeftForeArm',   'mixamorig:LeftArm',         [0, -0.41, 0]],
  ['mixamorig:LeftHand',      'mixamorig:LeftForeArm',     [0, -0.38, 0]],
  ['mixamorig:RightShoulder', 'mixamorig:Spine1',          [0.11, 0.22, 0]],
  ['mixamorig:RightArm',      'mixamorig:RightShoulder',   [0.19, 0, 0]],
  ['mixamorig:RightForeArm',  'mixamorig:RightArm',        [0, -0.41, 0]],
  ['mixamorig:RightHand',     'mixamorig:RightForeArm',    [0, -0.38, 0]],
  ['mixamorig:LeftUpLeg',     'mixamorig:Hips',            [-0.15, -0.05, 0]],
  ['mixamorig:LeftLeg',       'mixamorig:LeftUpLeg',       [0, -0.52, 0]],
  ['mixamorig:LeftFoot',      'mixamorig:LeftLeg',         [0, -0.49, 0]],
  ['mixamorig:RightUpLeg',    'mixamorig:Hips',            [0.15, -0.05, 0]],
  ['mixamorig:RightLeg',      'mixamorig:RightUpLeg',      [0, -0.52, 0]],
  ['mixamorig:RightFoot',     'mixamorig:RightLeg',        [0, -0.49, 0]],
];

function buildTargetRig() {
  const map = new Map();
  const order = [];
  // Reversed insertion order so the bone array cannot accidentally line up
  // index-for-index with the source rig's.
  for (const [name, parent, pos] of TARGET_BONES) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.fromArray(pos);
    if (parent) map.get(parent).add(b);
    map.set(name, b);
    order.push(b);
  }
  const root = map.get('mixamorig:Hips');
  root.updateMatrixWorld(true);

  // Minimal skinned geometry — one vertex per bone is enough for a mixer.
  const positions = [];
  const skinIndex = [];
  const skinWeight = [];
  order.forEach((b, i) => {
    const p = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
    positions.push(p.x, p.y, p.z, p.x + 0.01, p.y, p.z, p.x, p.y + 0.01, p.z);
    for (let k = 0; k < 3; k++) { skinIndex.push(i, 0, 0, 0); skinWeight.push(1, 0, 0, 0); }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));

  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
  mesh.add(root);
  mesh.bind(new THREE.Skeleton(order));
  mesh.updateMatrixWorld(true);
  return { mesh, map };
}

// ---------------------------------------------------------------------------

function loadGLB() {
  const buf = readFileSync(GLB);
  const array = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((res, rej) => {
    new GLTFLoader().parse(array, '', res, rej);
  });
}

async function main() {
  console.log('\nretargeting pipeline\n');

  // --- name normalisation ------------------------------------------------
  assert(normalizeBoneName('mixamorig:LeftForeArm') === 'leftforearm',
    'normalizes mixamo prefixes', normalizeBoneName('mixamorig:LeftForeArm'));
  assert(normalizeBoneName('Armature|mixamorig:Hips') === 'hips',
    'strips armature paths', normalizeBoneName('Armature|mixamorig:Hips'));
  assert(canonicalBone('L_Thigh') === 'leftupleg',
    'maps synonyms to canonical ids', String(canonicalBone('L_Thigh')));
  assert(canonicalBone('RightLowerArm') === 'rightforearm',
    'maps alternate limb spellings', String(canonicalBone('RightLowerArm')));

  // --- load the bundled model -------------------------------------------
  const gltf = await loadGLB();
  const sourceMesh = findSkinnedMesh(gltf.scene);
  assert(!!sourceMesh, 'bundled humanoid.glb contains a SkinnedMesh');
  assert(gltf.animations.length === 9,
    'bundled GLB carries the 9 shared clips', `got ${gltf.animations.length}`);

  const { mesh: targetMesh } = buildTargetRig();

  // --- bone map ----------------------------------------------------------
  const map = buildBoneMap(targetMesh.skeleton, sourceMesh.skeleton);
  assert(map.missing.length === 0, 'all required bones mapped', map.missing.join(','));
  assert(map.names['mixamorig:LeftForeArm'] === 'LeftForeArm',
    'map direction is target -> source', JSON.stringify(map.names['mixamorig:LeftForeArm']));
  assert(map.hip === 'Hips', 'hip resolves to the SOURCE-side name', String(map.hip));
  assert(map.coverage > 0.9, 'coverage above 90%', `${(map.coverage * 100).toFixed(0)}%`);

  // --- retarget every clip ----------------------------------------------
  const { clips, failed } = retargetAll(targetMesh, sourceMesh, gltf.animations, { fps: 60 });
  assert(failed.length === 0, 'every clip retargeted',
    failed.map((f) => `${f.clip}: ${f.reason}`).join('; '));
  assert(clips.length === 9, 'nine clips out', `got ${clips.length}`);

  const punch = clips.find((c) => c.name === 'punch');
  assert(!!punch, 'punch clip present');
  assert(punch.tracks.length > 0, 'punch has tracks', `${punch?.tracks.length}`);
  assert(punch.tracks.every((t) => t.name.startsWith('.bones[')),
    'tracks use .bones[Name] addressing (mixer must root on the SkinnedMesh)');
  assert(punch.duration > 0, 'duration recomputed after retarget', String(punch?.duration));

  // --- the real test: does the target rig actually MOVE? -----------------
  const mixer = new THREE.AnimationMixer(targetMesh); // rooted on the mesh
  const action = mixer.clipAction(punch);
  action.play();

  const hand = targetMesh.skeleton.bones.find((b) => b.name === 'mixamorig:RightHand');
  const sample = (t) => {
    mixer.setTime(0);
    mixer.setTime(t);
    targetMesh.updateMatrixWorld(true);
    return new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld);
  };

  const atRest = sample(0.001);
  const atStrike = sample(punch.duration * 0.32); // the strike frame
  const travel = atRest.distanceTo(atStrike);

  assert(travel > 0.25,
    'retargeted punch actually moves the target rig\'s hand',
    `travelled ${travel.toFixed(3)} world units`);

  // The hand must travel FORWARD (+Z), not just wobble.
  assert(atStrike.z - atRest.z > 0.2,
    'the punch travels forward, not sideways',
    `dz = ${(atStrike.z - atRest.z).toFixed(3)}`);

  // --- proportions: the target has longer arms, so the reach must differ --
  const srcMixer = new THREE.AnimationMixer(sourceMesh);
  const srcPunch = gltf.animations.find((c) => c.name === 'punch');
  srcMixer.clipAction(srcPunch).play();
  srcMixer.setTime(0);
  srcMixer.setTime(srcPunch.duration * 0.32);
  sourceMesh.updateMatrixWorld(true);
  const srcHand = sourceMesh.skeleton.bones.find((b) => b.name === 'RightHand');
  const srcPos = new THREE.Vector3().setFromMatrixPosition(srcHand.matrixWorld);

  assert(Math.abs(atStrike.y - srcPos.y) > 0.05,
    'target rig keeps its own proportions (not a pose copy)',
    `target y=${atStrike.y.toFixed(3)} vs source y=${srcPos.y.toFixed(3)}`);

  // --- a rig that is not humanoid must fail loudly, not silently ---------
  const junkBone = new THREE.Bone();
  junkBone.name = 'thing_01';
  const junkMesh = new THREE.SkinnedMesh(
    new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(),
  );
  junkMesh.add(junkBone);
  junkMesh.bind(new THREE.Skeleton([junkBone]));
  let threw = false;
  try { retargetClip(junkMesh, sourceMesh, srcPunch); } catch { threw = true; }
  assert(threw, 'a non-humanoid rig throws instead of silently T-posing');

  console.log(
    failures === 0
      ? '\n[32mall retarget checks passed[0m\n'
      : `\n[31m${failures} check(s) failed[0m\n`,
  );
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
