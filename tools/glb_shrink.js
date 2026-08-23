#!/usr/bin/env node
/*
 * tools/glb_shrink.js — shrink an oversized .glb by simplifying its mesh.
 *
 *   node tools/glb_shrink.js <input.glb> [options]
 *   node tools/glb_shrink.js assets/npcs/tripo/captain/captain_static.glb --tris=15000
 *
 * WHY THIS EXISTS
 * ---------------
 * Tripo returns a model at whatever density it feels like unless you pass
 * face_limit. The captain came back at 501k triangles / 15 MB — 13.8 MB of
 * that is raw vertex data, only 0.5 MB is textures. Since RECIPIENTS
 * lazy-loads characters at 2.5 km, a player approaching him pulls the whole
 * 15 MB down; brutal on a phone. Re-generating with face_limit costs Tripo
 * credits, but "decimating" (throwing away triangles we can't see anyway)
 * costs nothing and keeps the exact same textures and shape.
 *
 * HOW IT WORKS (the jargon, defined)
 * ----------------------------------
 *   weld     — merge vertices that sit in the same spot. Exporters often
 *              emit the same corner 3× (once per touching triangle); the
 *              simplifier can only collapse edges if it knows they're joined.
 *   simplify — "decimation": repeatedly collapse the least-noticeable edge
 *              until the triangle budget is met. Uses meshoptimizer, the
 *              same library Unity/Godot lean on.
 *   prune    — delete anything left unreferenced afterwards.
 *   dedup    — collapse identical accessors/textures/materials into one copy.
 *
 * DELIBERATELY NOT USED: Draco and EXT_meshopt_compression. Both shrink the
 * file further, but the game builds a bare `new GLTFLoader()` (js/npcs.js)
 * with no decoder attached, so a compressed .glb would simply fail to load.
 * Adding a decoder means an extra wasm download at runtime to save ~0.3 MB —
 * not worth it once simplification has already done the heavy lifting.
 *
 * OPTIONS
 *   --tris=N     target triangle count (default 15000, matching hippiewoman,
 *                which Tripo generated with face_limit 15000)
 *   --error=E    how far a vertex may drift, as a fraction of the model's
 *                size (default 0.005 = 0.5%, enough to reach a 15k target
 *                on Tripo output). The simplifier STOPS EARLY if it cannot
 *                reach --tris within this budget, so a too-small error
 *                silently leaves the file big. Raise it if you miss.
 *   --out=PATH   where to write (default: alongside input, "<name>.min.glb")
 *   --inplace    overwrite the input file instead (a .orig.glb backup is
 *                written first, unless one already exists)
 *   --dry        report what it would do, write nothing
 */
const fs = require('fs');
const path = require('path');

const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { simplify, weld, dedup, prune } = require('@gltf-transform/functions');
const { MeshoptSimplifier } = require('meshoptimizer');

// ---- tiny argument parser (--key=value / --flag) ----
const argv = process.argv.slice(2);
const input = argv.find((a) => !a.startsWith('--'));
const flag = (name) => argv.includes('--' + name);
const opt = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? dflt : hit.slice(name.length + 3);
};

if (!input) {
  console.error('usage: node tools/glb_shrink.js <input.glb> [--tris=15000] [--error=0.02] [--out=PATH] [--inplace] [--dry]');
  process.exit(2);
}
if (!fs.existsSync(input)) { console.error('no such file: ' + input); process.exit(2); }

const targetTris = Math.max(1, parseInt(opt('tris', '15000'), 10));
const errorTol = parseFloat(opt('error', '0.005'));
const dry = flag('dry');
const inplace = flag('inplace');
const outPath = opt('out', inplace ? input
  : path.join(path.dirname(input), path.basename(input, '.glb') + '.min.glb'));

// Count triangles across every mesh primitive in the document. A primitive
// is one chunk of geometry with a single material; indices come in threes.
function countTris(doc) {
  let tris = 0, verts = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      tris += idx ? idx.getCount() / 3 : (pos ? pos.getCount() / 3 : 0);
      verts += pos ? pos.getCount() : 0;
    }
  }
  return { tris: Math.round(tris), verts };
}

const MB = (b) => (b / 1048576).toFixed(2) + ' MB';

(async () => {
  await MeshoptSimplifier.ready; // the wasm module loads asynchronously

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(input);

  const beforeBytes = fs.statSync(input).size;
  const before = countTris(doc);
  // ratio is what the simplifier actually takes: the fraction of triangles
  // to KEEP. 15000 / 501426 ≈ 0.0299.
  const ratio = Math.min(1, targetTris / before.tris);

  console.log(`in : ${input}`);
  console.log(`     ${MB(beforeBytes)}  ${before.tris.toLocaleString()} tris  ${before.verts.toLocaleString()} verts`);
  console.log(`     target ${targetTris.toLocaleString()} tris -> ratio ${ratio.toFixed(4)}, error tolerance ${errorTol}`);

  if (ratio >= 1) { console.log('already at or under the target — nothing to do.'); return; }

  await doc.transform(
    dedup(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio, error: errorTol }),
    prune(),
  );

  const after = countTris(doc);
  const glb = await io.writeBinary(doc); // Uint8Array of the whole .glb

  console.log(`out: ${dry ? '(dry run, not written)' : outPath}`);
  console.log(`     ${MB(glb.byteLength)}  ${after.tris.toLocaleString()} tris  ${after.verts.toLocaleString()} verts`);
  console.log(`     ${(100 - (glb.byteLength / beforeBytes) * 100).toFixed(1)}% smaller  (${(beforeBytes / glb.byteLength).toFixed(1)}x)`);
  if (after.tris > targetTris * 1.15) {
    console.log(`     NOTE: missed the target — the error tolerance stopped it early.`);
    console.log(`           re-run with a bigger --error (e.g. --error=${(errorTol * 4).toFixed(3)}).`);
  }

  if (dry) return;
  // --inplace keeps one pristine copy of the original so a bad decimation
  // is always undoable without re-downloading from Tripo.
  if (inplace) {
    const backup = path.join(path.dirname(input), path.basename(input, '.glb') + '.orig.glb');
    if (!fs.existsSync(backup)) { fs.copyFileSync(input, backup); console.log(`     backup -> ${backup}`); }
    else console.log(`     backup already exists, kept: ${backup}`);
  }
  fs.writeFileSync(outPath, Buffer.from(glb.buffer, glb.byteOffset, glb.byteLength));
})().catch((e) => { console.error('FAIL: ' + (e && e.stack || e)); process.exit(1); });
