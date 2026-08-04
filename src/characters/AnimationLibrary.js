import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { findSkinnedMesh } from './rig/retarget.js';

/**
 * The shared animation set.
 *
 * Clips are authored once against one source rig and then retargeted onto every
 * character — that is the whole point of the pipeline, and it is what lets a
 * model generated from a text prompt fight on day one without anybody
 * hand-animating it.
 *
 * Loads /animations/manifest.json. Files are fetched at most once and cached,
 * so twenty clips out of one GLB costs one network request.
 */
export class AnimationLibrary {
  constructor(basePath = '') {
    this.basePath = basePath;
    this.gltf = new GLTFLoader();
    this._fileCache = new Map(); // url -> Promise<{scene, animations}>
    this.clips = [];             // AnimationClip[] in the source rig's space
    this.sourceMesh = null;      // SkinnedMesh the clips were authored against
    this.manifest = null;
    this.errors = [];
  }

  async load(manifestUrl = '/animations/manifest.json') {
    let manifest;
    try {
      const res = await fetch(manifestUrl, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      manifest = await res.json();
    } catch (err) {
      // No manifest is a perfectly valid configuration: every character just
      // uses the procedural poser.
      this.errors.push(`manifest: ${err.message}`);
      return this;
    }
    this.manifest = manifest;

    // The source rig defines the space the clips live in.
    if (manifest.sourceModel) {
      try {
        const file = await this._loadFile(manifest.sourceModel);
        this.sourceMesh = findSkinnedMesh(file.scene);
        if (!this.sourceMesh) {
          this.errors.push(`sourceModel ${manifest.sourceModel} has no SkinnedMesh`);
        }
      } catch (err) {
        this.errors.push(`sourceModel: ${err.message}`);
      }
    }

    for (const entry of manifest.clips ?? []) {
      const url = entry.url ?? manifest.sourceModel;
      if (!url) continue;
      try {
        const file = await this._loadFile(url);
        const clip = entry.clip
          ? THREE.AnimationClip.findByName(file.animations, entry.clip)
          : file.animations[entry.index ?? 0];
        if (!clip) {
          this.errors.push(`clip "${entry.clip ?? entry.index}" not in ${url}`);
          continue;
        }
        const copy = clip.clone();
        copy.name = entry.as ?? clip.name;
        this.clips.push(copy);
      } catch (err) {
        this.errors.push(`${entry.as ?? entry.clip}: ${err.message}`);
      }
    }

    return this;
  }

  get available() {
    return !!this.sourceMesh && this.clips.length > 0;
  }

  _loadFile(url) {
    const full = this.basePath + url;
    if (this._fileCache.has(full)) return this._fileCache.get(full);

    const p = url.toLowerCase().endsWith('.fbx')
      ? this._loadFBX(full)
      : new Promise((resolve, reject) => {
          this.gltf.load(
            full,
            (g) => resolve({ scene: g.scene, animations: g.animations }),
            undefined,
            (e) => reject(new Error(`failed to load ${url}: ${e?.message ?? e}`)),
          );
        });

    this._fileCache.set(full, p);
    return p;
  }

  /** FBXLoader is heavy, so it is only pulled in when an .fbx is requested. */
  async _loadFBX(url) {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
    const loader = new FBXLoader();
    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (group) => resolve({ scene: group, animations: group.animations ?? [] }),
        undefined,
        (e) => reject(new Error(`failed to load ${url}: ${e?.message ?? e}`)),
      );
    });
  }
}
