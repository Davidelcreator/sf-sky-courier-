import * as THREE from 'three';
import { makeRandom } from '../engine/math.js';

/**
 * Impact sparks — a pooled particle burst at the contact point.
 *
 * Implemented as a single THREE.Points with a fixed-size buffer so there is one
 * draw call no matter how many bursts are live. Phones care about that.
 *
 * Sparks keep animating during hit-stop on purpose: they are spawned on the
 * frame of contact, and freezing them would hide the very thing the freeze is
 * meant to draw attention to.
 */
const MAX_PARTICLES = 220;

export class HitSparks {
  constructor(scene, game) {
    this.game = game;
    this.rng = makeRandom(99);

    this.count = MAX_PARTICLES;
    this.pos = new Float32Array(MAX_PARTICLES * 3);
    this.vel = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.col = new Float32Array(MAX_PARTICLES * 3);      // what gets drawn
    this.baseCol = new Float32Array(MAX_PARTICLES * 3);  // hue at spawn
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    // Everything starts dead and off-screen.
    for (let i = 0; i < MAX_PARTICLES; i++) this.pos[i * 3 + 1] = -999;

    const mat = new THREE.PointsMaterial({
      size: 0.13,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  /**
   * @param {number} x world x
   * @param {number} y world y
   * @param {object} opts { blocked, color, count, dir }
   */
  burst(x, y, opts = {}) {
    const fx = this.game.fx;
    const blocked = !!opts.blocked;
    const n = opts.count ?? (blocked ? fx.blockSparkCount : fx.sparkCount);
    const speed = fx.sparkSpeed * (blocked ? 0.7 : 1);
    const life = fx.sparkLife * (blocked ? 0.7 : 1);

    // Blocked hits spark cold blue-white; clean hits spark hot.
    const c = new THREE.Color(opts.color ?? (blocked ? '#9fd8ff' : '#ffd66b'));
    const dir = opts.dir ?? 0;

    for (let i = 0; i < n; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;

      const a = this.rng() * Math.PI * 2;
      const spread = 0.35 + this.rng() * 0.9;
      const s = speed * (0.45 + this.rng());

      this.pos[idx * 3] = x;
      this.pos[idx * 3 + 1] = y;
      this.pos[idx * 3 + 2] = (this.rng() - 0.5) * 0.35;

      // Bias the spray back along the hit direction so it reads directionally.
      this.vel[idx * 3] = Math.cos(a) * s * spread + dir * s * 0.55;
      this.vel[idx * 3 + 1] = Math.sin(a) * s * spread + s * 0.35;
      this.vel[idx * 3 + 2] = (this.rng() - 0.5) * s * 0.6;

      this.life[idx] = life;
      this.maxLife[idx] = life;
      this.baseCol[idx * 3] = c.r;
      this.baseCol[idx * 3 + 1] = c.g;
      this.baseCol[idx * 3 + 2] = c.b;
      this.col[idx * 3] = c.r;
      this.col[idx * 3 + 1] = c.g;
      this.col[idx * 3 + 2] = c.b;
    }
  }

  /** Ticked on the render clock, normalised to 60Hz. */
  update(dtMs = 16.67) {
    const k = Math.min(4, dtMs / (1000 / 60));
    let any = false;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= k;

      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -999; // park it out of frame
        continue;
      }

      this.pos[i * 3] += this.vel[i * 3] * k;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * k;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * k;
      this.vel[i * 3 + 1] -= 0.004 * k; // gravity on the sparks

      // Fade by dimming toward black against the spawn hue. Additive blending
      // turns "dark" into "invisible", so this doubles as the alpha ramp and
      // costs no extra buffer. Squared so the tail dies fast and the head
      // stays bright — that is what makes it read as a spark, not a puff.
      const t = this.life[i] / this.maxLife[i];
      const f = t * t;
      this.col[i * 3] = this.baseCol[i * 3] * f;
      this.col[i * 3 + 1] = this.baseCol[i * 3 + 1] * f;
      this.col[i * 3 + 2] = this.baseCol[i * 3 + 2] * f;
    }

    if (any) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
    }
  }

  clear() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.life[i] = 0;
      this.pos[i * 3 + 1] = -999;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
