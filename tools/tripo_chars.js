#!/usr/bin/env node
/*
 * tools/tripo_chars.js — generate a rigged, animated NPC character from a
 * text description via the Tripo3D API.
 *
 *   node tools/tripo_chars.js <name> "<description>"
 *   node tools/tripo_chars.js captain "Low poly stylized sea captain ..."
 *
 * Flow: text_to_model → poll → animate_rig (auto-skeleton) → poll →
 * animate_retarget ×2 (preset walk + idle) → poll → download every GLB
 * into assets/npcs/tripo/<name>/ plus a meta.json describing the task ids
 * (handy for re-downloads and for CREDITS.md bookkeeping).
 *
 * Costs real money (David's pay-as-you-go Tripo wallet, roughly
 * $0.30–0.60 per character all-in) — so it generates ONE character per
 * invocation, never batches on its own.
 *
 * The API key is read from the Spectrum project's git-ignored secrets
 * file (same key the shirt pipeline uses) or the TRIPO_KEY env var —
 * never from anything inside this repo, so it can't be committed.
 * NOTE: response field names based on Tripo's public docs + the shirt
 * pipeline's experience; every poll logs the raw payload on failure.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const TRIPO = 'https://api.tripo3d.ai/v2/openapi';
const SECRETS = 'C:/Users/David/Desktop/Spectrum-Design-Studio/.deploy-secrets.json';
const OUT_ROOT = path.join(__dirname, '..', 'assets', 'npcs', 'tripo');
const POLL_MS = 5000, TIMEOUT_MS = 15 * 60 * 1000;

const name = process.argv[2];
const prompt = process.argv[3];
if (!name || !prompt) {
  console.error('usage: node tools/tripo_chars.js <name> "<description>"');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function req(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = https.request({ method, hostname: u.hostname, path: u.pathname + u.search, headers }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location)
        return resolve(req(method, new URL(res.headers.location, url).href, headers, body));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  // ---- credentials (never stored in this repo) ----
  let key = process.env.TRIPO_KEY;
  if (!key && fs.existsSync(SECRETS)) {
    try { key = JSON.parse(fs.readFileSync(SECRETS, 'utf8')).tripoKey; } catch (e) {}
  }
  if (!key) { console.error('No Tripo key: set TRIPO_KEY or add tripoKey to ' + SECRETS); process.exit(2); }
  const H = { Authorization: 'Bearer ' + key };

  const jreq = async (method, url, obj) => {
    const r = await req(method, url, { ...H, 'Content-Type': 'application/json' },
      obj ? JSON.stringify(obj) : undefined);
    let j = null; try { j = JSON.parse(r.buf.toString()); } catch (e) {}
    return { status: r.status, j, raw: r.buf.toString().slice(0, 400) };
  };

  // start a task, return its id
  async function startTask(payload, label) {
    const r = await jreq('POST', TRIPO + '/task', payload);
    if (r.status !== 200 || !r.j || r.j.code !== 0 || !r.j.data?.task_id) {
      throw new Error(`${label}: task create failed (${r.status}) ${r.raw}`);
    }
    console.log(`${label}: task ${r.j.data.task_id}`);
    return r.j.data.task_id;
  }

  // poll a task to completion, return its output object
  async function waitTask(id, label) {
    const t0 = Date.now();
    for (;;) {
      await sleep(POLL_MS);
      const r = await jreq('GET', `${TRIPO}/task/${id}`);
      const d = r.j?.data;
      if (!d) throw new Error(`${label}: bad poll response ${r.raw}`);
      if (d.status === 'success') {
        console.log(`${label}: success (${Math.round((Date.now() - t0) / 1000)}s)`);
        return d.output || {};
      }
      if (['failed', 'cancelled', 'banned', 'expired'].includes(d.status)) {
        throw new Error(`${label}: ${d.status} — ${JSON.stringify(d).slice(0, 400)}`);
      }
      process.stdout.write(`\r${label}: ${d.status} ${d.progress ?? ''}%  `);
    }
  }

  // pick whichever model url the output carries
  const modelUrl = (out) => out.pbr_model || out.model || out.base_model ||
    (typeof out === 'string' ? out : null);

  async function download(url, file) {
    const r = await req('GET', url, {});
    if (r.status !== 200) throw new Error(`download ${file}: HTTP ${r.status}`);
    fs.writeFileSync(file, r.buf);
    console.log(`saved ${file} (${(r.buf.length / 1e6).toFixed(1)} MB)`);
  }

  const dir = path.join(OUT_ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  const meta = { name, prompt, generated: new Date().toISOString(), tasks: {} };
  // Save after every step — a failure halfway (empty wallet, say) must
  // not lose the task ids we already paid for.
  const saveMeta = () => fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  process.on('exit', saveMeta);

  // ---- 1. text → model ----
  // face_limit keeps the mesh game-sized: the first unlimited run came
  // back at 501k triangles (693× a Kenney character). 15k is plenty for
  // a hero character and ~40× cheaper to draw.
  const faces = +(process.env.TRIPO_FACES || 15000);
  const genId = await startTask({ type: 'text_to_model', prompt, face_limit: faces }, 'generate');
  meta.tasks.generate = genId;
  const genOut = await waitTask(genId, 'generate');
  const rawUrl = modelUrl(genOut);
  if (rawUrl) await download(rawUrl, path.join(dir, name + '_static.glb'));

  // ---- 2. auto-rig (inserts a humanoid skeleton) ----
  const rigId = await startTask(
    { type: 'animate_rig', original_model_task_id: genId, out_format: 'glb' }, 'rig');
  meta.tasks.rig = rigId;
  const rigOut = await waitTask(rigId, 'rig');
  const rigUrl = modelUrl(rigOut);
  if (rigUrl) await download(rigUrl, path.join(dir, name + '_rigged.glb'));

  // ---- 3. retarget preset animations onto the rig ----
  for (const anim of ['preset:walk', 'preset:idle']) {
    const label = anim.split(':')[1];
    try {
      const aId = await startTask(
        { type: 'animate_retarget', original_model_task_id: rigId, animation: anim,
          out_format: 'glb' }, 'anim ' + label);
      meta.tasks[label] = aId;
      const aOut = await waitTask(aId, 'anim ' + label);
      const aUrl = modelUrl(aOut);
      if (aUrl) await download(aUrl, path.join(dir, `${name}_${label}.glb`));
    } catch (e) {
      console.error(`anim ${label} failed (continuing): ${e.message}`);
      meta.tasks[label + '_error'] = String(e.message);
    }
  }

  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log('\ndone → ' + dir);
})().catch((e) => { console.error('\nFAIL: ' + e.message); process.exit(1); });
