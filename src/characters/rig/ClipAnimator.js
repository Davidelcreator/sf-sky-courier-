import * as THREE from 'three';
import { STATE } from '../../engine/Fighter.js';

/**
 * Plays retargeted animation clips, driven by fighter state.
 *
 * Two things this must get right:
 *
 * 1. **The mixer is rooted on the SkinnedMesh.** Retargeted clips carry tracks
 *    named `.bones[Name].quaternion`, which only resolve against a skeleton.
 *    Root it on the scene or the GLTF group and every track silently binds to
 *    nothing.
 *
 * 2. **Attack clips are time-scaled to the frame data.** A punch clip authored
 *    at 0.8s does not get to decide when the hitbox is live — `config` does. The
 *    clip is stretched so its full length equals startup+active+recovery. Frame
 *    data stays the single source of truth and animation follows it, never the
 *    other way round.
 */

/** Fighter state -> candidate clip names, best first. */
const CLIP_CANDIDATES = {
  [STATE.IDLE]: ['idle', 'stance', 'fightidle'],
  [STATE.WALK]: ['walk', 'walkforward', 'run'],
  [STATE.AIR]: ['jump', 'air', 'jumploop', 'fall'],
  [STATE.BLOCK]: ['block', 'guard', 'blockidle'],
  [STATE.BLOCKSTUN]: ['blockhit', 'blockimpact', 'block', 'guard'],
  [STATE.HITSTUN]: ['hit', 'hurt', 'impact', 'takehit'],
  [STATE.KO]: ['ko', 'knockdown', 'death', 'die'],
};

const ATTACK_CANDIDATES = {
  punch: ['punch', 'jab', 'attackpunch', 'attack1'],
  kick: ['kick', 'attackkick', 'attack2'],
  special: ['special', 'cast', 'attackspecial', 'attack3'],
  // No low clips in the bundled set, so these resolve to nothing and the
  // hybrid animator hands the move to the procedural poser on the same
  // skeleton. Drop a `lowpunch` clip into /animations and it takes over.
  lowPunch: ['lowpunch', 'crouchpunch', 'lowjab'],
  lowKick: ['lowkick', 'sweep', 'crouchkick'],
};

const norm = (s) => String(s).toLowerCase().replace(/[\s._-]/g, '');

export class ClipAnimator {
  /**
   * @param {THREE.SkinnedMesh} skinnedMesh mixer root — must be the mesh
   * @param {THREE.AnimationClip[]} clips already retargeted onto this skeleton
   * @param {object} game global config
   */
  constructor(skinnedMesh, clips, game) {
    this.type = 'clip';
    this.game = game;
    this.mixer = new THREE.AnimationMixer(skinnedMesh);

    /** @type {Map<string, THREE.AnimationAction>} */
    this.actions = new Map();
    for (const clip of clips) {
      const action = this.mixer.clipAction(clip);
      this.actions.set(norm(clip.name), action);
    }

    this.currentKey = null;
    this.currentAction = null;
    this.lastSignature = null;
  }

  /** Names of the clips we actually have. */
  get clipNames() { return [...this.actions.keys()]; }

  /** Resolve the first candidate we have a clip for. */
  _resolve(candidates) {
    for (const c of candidates) {
      const a = this.actions.get(norm(c));
      if (a) return { key: norm(c), action: a };
    }
    return null;
  }

  /**
   * Which states can we actually animate? The loader uses this to decide
   * whether a clip set is complete enough to use at all.
   */
  coverage() {
    const states = Object.keys(CLIP_CANDIDATES).filter((s) =>
      this._resolve(CLIP_CANDIDATES[s]),
    );
    const attacks = Object.keys(ATTACK_CANDIDATES).filter((a) =>
      this._resolve(ATTACK_CANDIDATES[a]),
    );
    return { states, attacks, hasIdle: !!this._resolve(CLIP_CANDIDATES[STATE.IDLE]) };
  }

  /**
   * @param {Fighter} f
   * @param {number} dtFrames logic frames elapsed (0 during hit-stop, which is
   *   exactly what freezes the animation with the fight)
   */
  update(f, dtFrames = 1) {
    const hz = this.game.timestep.hz;
    const target = this._targetFor(f);

    if (target && target.signature !== this.lastSignature) {
      this._play(target, f);
      this.lastSignature = target.signature;
    }

    this.mixer.update((dtFrames / hz));
  }

  _targetFor(f) {
    if (f.state === STATE.ATTACK && f.move) {
      const found = this._resolve(ATTACK_CANDIDATES[f.move] ?? [f.move]);
      if (found) {
        return {
          ...found,
          once: true,
          // activationId changes on every fresh press, so a repeated jab
          // restarts its clip while a jab still in recovery does not.
          signature: `atk:${f.move}:${f.activationId}`,
          fitFrames: f.moveTotal,
        };
      }
      // No attack clip: leave the previous animation running. The hybrid
      // fallback in CharacterLoader handles this case properly.
      return null;
    }

    const found = this._resolve(CLIP_CANDIDATES[f.state] ?? []);
    if (!found) return null;
    return { ...found, once: false, signature: `st:${found.key}`, fitFrames: 0 };
  }

  _play({ key, action, once, fitFrames }, f) {
    const prev = this.currentAction;

    action.reset();
    action.enabled = true;
    action.setEffectiveWeight(1);

    if (once) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      // Stretch or squash the clip so it lasts exactly as long as the move's
      // frame data says it should. Frame data wins, always.
      const wanted = fitFrames / this.game.timestep.hz;
      const natural = action.getClip().duration || wanted;
      action.setEffectiveTimeScale(wanted > 0 ? natural / wanted : 1);
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
      action.setEffectiveTimeScale(1);
    }

    // Short crossfades everywhere except into an attack, which must snap —
    // a blended startup is a startup you cannot read.
    const fade = once ? 0.02 : 0.12;
    if (prev && prev !== action) {
      action.crossFadeFrom(prev, fade, false);
    }
    action.play();

    this.currentKey = key;
    this.currentAction = action;
  }

  reset() {
    this.mixer.stopAllAction();
    this.currentAction = null;
    this.currentKey = null;
    this.lastSignature = null;
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}
