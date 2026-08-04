import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { ProceduralRig } from './rig/ProceduralRig.js';
import { PoseAnimator } from './rig/PoseAnimator.js';
import { ClipAnimator } from './rig/ClipAnimator.js';
import { SkeletonPoseTarget } from './rig/SkeletonPoseTarget.js';
import { retargetAll, findSkinnedMesh } from './rig/retarget.js';
import { AnimationLibrary } from './AnimationLibrary.js';
import { STATE } from '../engine/Fighter.js';

/**
 * CharacterLoader — config in, fightable character out.
 *
 * The engine never imports this and never learns a character's name. A fighter
 * is a JSON file plus (optionally) a model; everything else is generic.
 *
 * ## The animation ladder
 *
 * Each character walks down this ladder and stops at the first rung that works:
 *
 *   1. **Retargeted clips** — a GLB model plus the shared clip set, retargeted
 *      onto its skeleton. Best fidelity.
 *   2. **Procedural poser on the imported skeleton** — the model loaded fine but
 *      its clips would not retarget. Same three-phase timing and two-segment
 *      arcs, applied directly to its bones.
 *   3. **Procedural poser on the built-in box rig** — no model at all, or the
 *      model failed to load.
 *
 * Every fall is reported in `visual.info`, and the settings screen surfaces it,
 * so a rig that quietly dropped to rung 3 is visible rather than mysterious.
 */

const DEFAULT_HEIGHT = 1.8; // world units a fighter should stand, before cfg.scale

export class CharacterLoader {
  constructor({ basePath = '', configPath = '/config' } = {}) {
    this.basePath = basePath;
    this.configPath = configPath;
    this.gltf = new GLTFLoader();
    this.library = new AnimationLibrary(basePath);
    this.game = null;
    this.characters = new Map(); // id -> config
    this._modelCache = new Map();
  }

  // -------------------------------------------------------------------------
  // Config
  // -------------------------------------------------------------------------

  async loadGameConfig() {
    const res = await fetch(`${this.basePath}${this.configPath}/game.json`, {
      cache: 'no-cache',
    });
    if (!res.ok) throw new Error(`game.json: HTTP ${res.status}`);
    this.game = await res.json();
    return this.game;
  }

  /** Load every character named in game.json's roster, in order. */
  async loadRoster() {
    if (!this.game) await this.loadGameConfig();
    const ids = this.game.roster ?? [];
    const out = [];
    for (const id of ids) {
      try {
        out.push(await this.loadCharacter(id));
      } catch (err) {
        console.error(`[CharacterLoader] skipping "${id}":`, err.message);
      }
    }
    if (!out.length) throw new Error('roster is empty — no characters loaded');
    return out;
  }

  async loadCharacter(id) {
    const res = await fetch(`${this.basePath}${this.configPath}/characters/${id}.json`, {
      cache: 'no-cache',
    });
    if (!res.ok) throw new Error(`${id}.json: HTTP ${res.status}`);
    const cfg = validateCharacter(await res.json(), id);
    this.characters.set(cfg.id, cfg);
    return cfg;
  }

  /** Load the shared animation set once. Safe to call when there is none. */
  async loadAnimations() {
    await this.library.load(`${this.basePath}/animations/manifest.json`);
    return this.library;
  }

  // -------------------------------------------------------------------------
  // Visuals
  // -------------------------------------------------------------------------

  /**
   * Build the renderable + animator for one character.
   * @returns {{root, animator, kind, info, dispose}}
   */
  async createVisual(cfg) {
    const info = { id: cfg.id, rungsTried: [], warnings: [] };

    if (cfg.model) {
      try {
        const built = await this._buildModelVisual(cfg, info);
        if (built) return built;
      } catch (err) {
        info.warnings.push(`model "${cfg.model}" failed: ${err.message}`);
      }
    }

    // Rung 3: the built-in rig.
    info.rungsTried.push('procedural-rig');
    const rig = new ProceduralRig(cfg);
    const animator = new PoseAnimator(rig.createPoseTarget(), this.game);
    return {
      root: rig.root,
      animator,
      kind: 'procedural',
      info: { ...info, rig: 'built-in box rig', animation: 'procedural poser' },
      dispose: () => rig.dispose(),
    };
  }

  async _buildModelVisual(cfg, info) {
    const gltf = await this._loadModel(cfg.model);

    // SkeletonUtils.clone is required rather than Object3D.clone: it rebuilds
    // the bone graph so two fighters using the same model do not share (and
    // fight over) one skeleton.
    const model = cloneSkinned(gltf.scene);
    const mesh = findSkinnedMesh(model);
    if (!mesh) throw new Error('no SkinnedMesh in model');

    model.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });

    // root -> body (animation offsets) -> orient (author-space fix) -> model
    const root = new THREE.Group();
    root.name = `rig:${cfg.id}`;
    const body = new THREE.Group();
    const orient = new THREE.Group();
    root.add(body);
    body.add(orient);
    orient.add(model);

    normalizeModel(model, orient, cfg);

    // Rung 1: retarget the shared clip set.
    if (this.library.available && this.game.animation.useClips !== false) {
      info.rungsTried.push('retarget');
      const { clips, failed } = retargetAll(mesh, this.library.sourceMesh, this.library.clips, {
        boneMap: cfg.boneMap,
        fps: this.library.manifest?.fps ?? 60,
      });
      for (const f of failed) info.warnings.push(`clip "${f.clip}": ${f.reason}`);

      if (clips.length) {
        const animator = new ClipAnimator(mesh, clips, this.game);
        const cov = animator.coverage();
        if (cov.hasIdle) {
          // Attacks with no clip fall back to the poser on the same skeleton,
          // so a partial clip set is still worth using.
          const fallbackTarget = new SkeletonPoseTarget(mesh, body);
          const hybrid = new HybridAnimator(
            animator,
            new PoseAnimator(fallbackTarget, this.game),
            fallbackTarget,
            cov,
          );
          return {
            root,
            animator: hybrid,
            kind: 'clip',
            info: {
              ...info,
              rig: cfg.model,
              animation: `retargeted clips (${clips.length}) [${clips.map((c) => c.name).join(', ')}]`,
              coverage: cov,
            },
            dispose: () => animator.dispose(),
          };
        }
        info.warnings.push('clip set has no idle — falling back to the poser');
      } else {
        info.warnings.push('no clips retargeted onto this rig');
      }
    }

    // Rung 2: procedural poser driving the imported skeleton.
    info.rungsTried.push('skeleton-poser');
    const target = new SkeletonPoseTarget(mesh, body);
    if (!target.usable) {
      throw new Error('skeleton is not recognisably humanoid');
    }
    return {
      root,
      animator: new PoseAnimator(target, this.game),
      kind: 'skeleton-fallback',
      info: { ...info, rig: cfg.model, animation: 'procedural poser on imported skeleton' },
      dispose: () => {},
    };
  }

  _loadModel(url) {
    const full = this.basePath + url;
    if (this._modelCache.has(full)) return this._modelCache.get(full);
    const p = new Promise((resolve, reject) => {
      this.gltf.load(
        full,
        resolve,
        undefined,
        (e) => reject(new Error(e?.message ?? 'load error')),
      );
    });
    this._modelCache.set(full, p);
    return p;
  }

  // -------------------------------------------------------------------------
  // Phase 2 seam — generated characters
  // -------------------------------------------------------------------------

  /**
   * Register a character produced by the generation pipeline (Tripo for the
   * model, an LLM for the config) and make it selectable.
   *
   * This is the whole integration surface for Phase 2: hand it any humanoid GLB
   * URL plus a config object and it walks the same animation ladder as a
   * built-in character. Nothing downstream can tell the difference.
   *
   * @param {object}  opts
   * @param {string}  opts.modelUrl  any humanoid GLB (blob: URLs are fine)
   * @param {object}  opts.config    character config, same schema as /config
   * @param {boolean} [opts.register] add to the selectable roster (default true)
   * @returns {Promise<{config, visual}>}
   */
  async loadGenerated({ modelUrl, config, register = true }) {
    if (!modelUrl) throw new Error('loadGenerated: modelUrl is required');
    if (!config) throw new Error('loadGenerated: config is required');

    const cfg = validateCharacter({ ...config, model: modelUrl }, config.id ?? 'generated');
    cfg.generated = true;

    // Build it once up front so failures surface here, at generation time,
    // rather than at the character-select screen.
    const visual = await this.createVisual(cfg);

    if (register) {
      this.characters.set(cfg.id, cfg);
      if (!this.game.roster.includes(cfg.id)) this.game.roster.push(cfg.id);
    }
    return { config: cfg, visual };
  }
}

/**
 * Runs a ClipAnimator, but hands any state the clip set does not cover to the
 * procedural poser on the same skeleton. Lets a two-clip character (idle+walk)
 * still throw a properly timed punch.
 */
class HybridAnimator {
  constructor(clipAnimator, poseAnimator, poseTarget, coverage) {
    this.type = 'hybrid';
    this.clips = clipAnimator;
    this.poser = poseAnimator;
    this.target = poseTarget;
    this.coverage = coverage;
    this.usingPoser = false;
  }

  _covered(f) {
    if (f.state === STATE.ATTACK) return this.coverage.attacks.includes(f.move);
    return this.coverage.states.includes(f.state);
  }

  update(f, dtFrames) {
    const covered = this._covered(f);

    if (covered) {
      if (this.usingPoser) {
        // Handing control back: restore bind so the mixer starts from a clean
        // pose rather than blending out of a procedurally bent skeleton.
        this.target.reset();
        this.clips.reset();
        this.usingPoser = false;
      }
      this.clips.update(f, dtFrames);
    } else {
      if (!this.usingPoser) {
        this.clips.reset();
        this.usingPoser = true;
      }
      this.poser.update(f, dtFrames);
    }
  }

  reset() {
    this.clips.reset();
    this.poser.reset();
    this.target.reset();
    this.usingPoser = false;
  }
}

/** Scale to a consistent fighting height and face +Z, whatever the author did. */
function normalizeModel(model, orient, cfg) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);

  if (size.y > 1e-4) {
    const wanted = DEFAULT_HEIGHT * (cfg.scale ?? 1);
    const s = wanted / size.y;
    model.scale.multiplyScalar(s);
    model.updateMatrixWorld(true);
  }

  // Re-measure after scaling and drop the model so its feet sit on y=0.
  const box2 = new THREE.Box3().setFromObject(model);
  model.position.y -= box2.min.y;
  model.position.x -= (box2.min.x + box2.max.x) / 2;

  // The engine yaws the root by facing and assumes the model looks down +Z.
  const forward = (cfg.modelForward ?? '+z').toLowerCase();
  const yaw = { '+z': 0, '-z': Math.PI, '+x': -Math.PI / 2, '-x': Math.PI / 2 }[forward] ?? 0;
  orient.rotation.y = yaw;
}

/** Fail loudly on a malformed character rather than mid-fight. */
export function validateCharacter(cfg, id) {
  const missing = [];
  for (const k of ['name', 'health', 'speed', 'jumpV', 'weight']) {
    if (cfg[k] === undefined) missing.push(k);
  }
  if (!cfg.moves?.punch || !cfg.moves?.kick) missing.push('moves.punch/moves.kick');
  if (missing.length) {
    throw new Error(`character "${id}" is missing: ${missing.join(', ')}`);
  }

  for (const [key, m] of Object.entries(cfg.moves)) {
    for (const k of ['dmg', 'startup', 'active', 'recovery', 'range', 'knock', 'stun']) {
      if (typeof m[k] !== 'number') {
        throw new Error(`character "${id}" move "${key}" is missing ${k}`);
      }
    }
  }

  return { ...cfg, id: cfg.id ?? id, scale: cfg.scale ?? 1 };
}
