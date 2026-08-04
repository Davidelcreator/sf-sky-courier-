/**
 * Generation providers — the Phase 2 seam.
 *
 * The pipeline is `prompt -> (model, config) -> playable fighter`. Two provider
 * interfaces, both stubbed with working mocks so the whole flow runs today:
 *
 *   ModelProvider.generate(prompt, { onProgress })  -> { modelUrl, meta }
 *   ConfigProvider.author(prompt, { modelUrl })     -> character config JSON
 *
 * To go live, implement the two marked methods in TripoModelProvider and
 * ClaudeConfigProvider and swap them in — see pipeline.js. Nothing downstream
 * changes: CharacterLoader.loadGenerated takes it from there.
 *
 * Keep API keys out of this bundle. Both real providers should call a serverless
 * function (Netlify Functions live in /netlify/functions) that holds the key
 * server-side; a key shipped in client JS is a key you have published.
 */

import { CHARACTER_SCHEMA_PROMPT, deriveConfigFromPrompt } from './authoring.js';

/** Bundled rig used by the mock, and a fine default for any generated model. */
export const TEST_MODEL_URL = '/models/humanoid.glb';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Mocks — what runs until the real APIs are wired.
// ---------------------------------------------------------------------------

export class MockModelProvider {
  constructor({ modelUrl = TEST_MODEL_URL, latencyMs = 1400 } = {}) {
    this.modelUrl = modelUrl;
    this.latencyMs = latencyMs;
    this.name = 'mock';
  }

  /**
   * Mimics the shape of a real text-to-3D job: queued, progressing, done.
   * Returning the bundled rigged humanoid means the generated character walks
   * the exact same retarget path a real Tripo asset would.
   */
  async generate(prompt, { onProgress, signal } = {}) {
    const steps = [
      [0.12, 'queued'],
      [0.35, 'generating geometry'],
      [0.66, 'texturing'],
      [0.88, 'rigging'],
      [1.0, 'complete'],
    ];
    for (const [progress, status] of steps) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      await sleep(this.latencyMs / steps.length);
      onProgress?.({ progress, status });
    }
    return {
      modelUrl: this.modelUrl,
      meta: { provider: 'mock', prompt, rigged: true },
    };
  }
}

export class MockConfigProvider {
  constructor() { this.name = 'mock'; }

  /**
   * Derives plausible stats and frame data from the prompt's own words. Not an
   * LLM — but it exercises the same contract (prompt in, schema-valid config
   * out) so the seam is genuinely tested rather than merely present.
   */
  async author(prompt, { modelUrl } = {}) {
    await sleep(350);
    return deriveConfigFromPrompt(prompt, { modelUrl });
  }
}

// ---------------------------------------------------------------------------
// Real providers — skeletons. Fill in the two marked methods.
// ---------------------------------------------------------------------------

export class TripoModelProvider {
  /**
   * @param {object} opts
   * @param {string} opts.endpoint your serverless proxy, NOT api.tripo3d.ai
   *   directly — the proxy is what keeps the API key off the client.
   */
  constructor({ endpoint = '/.netlify/functions/tripo', pollMs = 2500, timeoutMs = 300000 } = {}) {
    this.endpoint = endpoint;
    this.pollMs = pollMs;
    this.timeoutMs = timeoutMs;
    this.name = 'tripo';
  }

  /**
   * TODO(phase-2): wire the real Tripo text-to-3D call.
   *
   * The expected flow, which the polling loop below already implements:
   *   1. POST { prompt }              -> { taskId }
   *   2. GET  ?taskId=…  (poll)       -> { status, progress, modelUrl? }
   *   3. resolve once status === 'success' with a GLB URL
   *
   * Ask Tripo for a RIGGED humanoid output. An unrigged mesh has no skeleton,
   * so retargeting has nothing to target and CharacterLoader will drop it to
   * the procedural box rig — it will still fight, it just will not be your model.
   */
  async generate(prompt, { onProgress, signal } = {}) {
    const started = Date.now();

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, rig: true }),
      signal,
    });
    if (!res.ok) throw new Error(`tripo: HTTP ${res.status}`);
    const { taskId } = await res.json();
    if (!taskId) throw new Error('tripo: no taskId in response');

    for (;;) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      if (Date.now() - started > this.timeoutMs) throw new Error('tripo: timed out');

      await sleep(this.pollMs);

      const p = await fetch(`${this.endpoint}?taskId=${encodeURIComponent(taskId)}`, { signal });
      if (!p.ok) throw new Error(`tripo poll: HTTP ${p.status}`);
      const job = await p.json();

      onProgress?.({ progress: job.progress ?? 0, status: job.status ?? 'working' });

      if (job.status === 'success' && job.modelUrl) {
        return { modelUrl: job.modelUrl, meta: { provider: 'tripo', taskId, prompt } };
      }
      if (job.status === 'failed') throw new Error(`tripo: ${job.error ?? 'generation failed'}`);
    }
  }
}

export class ClaudeConfigProvider {
  constructor({ endpoint = '/.netlify/functions/author-character' } = {}) {
    this.endpoint = endpoint;
    this.name = 'claude';
  }

  /**
   * TODO(phase-2): wire the real Claude call.
   *
   * Post the prompt plus CHARACTER_SCHEMA_PROMPT (which documents the exact
   * JSON contract, including the frame-data invariants) and have the function
   * return parsed JSON. Validate before trusting it: `validateCharacter` in
   * CharacterLoader throws on a malformed fighter, and catching that here gives
   * a far better error than a character that turns out to be unplayable.
   */
  async author(prompt, { modelUrl } = {}) {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, modelUrl, schema: CHARACTER_SCHEMA_PROMPT }),
    });
    if (!res.ok) throw new Error(`author: HTTP ${res.status}`);
    const cfg = await res.json();
    return { ...cfg, model: modelUrl };
  }
}
