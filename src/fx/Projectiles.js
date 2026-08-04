import * as THREE from 'three';
import { applyDamage } from '../engine/combat.js';
import { STATE } from '../engine/Fighter.js';

/**
 * Projectile and beam specials.
 *
 * These are FX objects that carry a hitbox, so the entity lives here but the
 * damage rules stay in engine/combat.js — a projectile hit goes through exactly
 * the same block / chip / stun / combo path as a punch.
 *
 * Positions are stepped on the logic clock (60Hz, frozen by hit-stop) and only
 * copied onto meshes at render time.
 */

const MAX_TRAIL = 8;

export class Projectiles {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.list = [];
    this.beams = [];

    this.geo = new THREE.IcosahedronGeometry(1, 1);
    this.trailGeo = new THREE.IcosahedronGeometry(1, 0);
    this.beamGeo = new THREE.BoxGeometry(1, 1, 1);
  }

  /** Spawn from a fighter's special block. Called on the first active frame. */
  spawn(owner, special) {
    const p = special.projectile ?? {};
    const radius = p.radius ?? 0.3;
    const color = new THREE.Color(p.color ?? owner.cfg.accent ?? '#ffaa33');

    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.scale.setScalar(radius);
    mesh.renderOrder = 4;
    this.scene.add(mesh);

    // A short trail of shrinking ghosts. Cheap, and it sells the speed.
    const trail = [];
    for (let i = 0; i < Math.min(MAX_TRAIL, this.game.fx.projectileTrailLength); i++) {
      const tm = new THREE.Mesh(
        this.trailGeo,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.4 * (1 - i / MAX_TRAIL),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      tm.renderOrder = 3;
      tm.visible = false;
      this.scene.add(tm);
      trail.push(tm);
    }

    const light = new THREE.PointLight(color, 2.2, 4.5);
    this.scene.add(light);

    this.list.push({
      owner,
      special,
      x: owner.x + owner.facing * 0.55 * owner.scale,
      y: owner.y + (p.height ?? 1.05) * owner.scale,
      vx: owner.facing * (p.speed ?? 0.16),
      radius,
      life: p.life ?? 150,
      dir: owner.facing,
      mesh,
      light,
      trail,
      history: [],
      dead: false,
    });
  }

  /** Instant-ish beam: a fixed-length hitbox live for `activeFrames`. */
  spawnBeam(owner, special) {
    const b = special.beam ?? {};
    const length = b.length ?? 6;
    const thickness = b.thickness ?? 0.35;
    const color = new THREE.Color(b.color ?? owner.cfg.accent ?? '#9ad6ff');

    const mesh = new THREE.Mesh(
      this.beamGeo,
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    mesh.renderOrder = 4;
    this.scene.add(mesh);

    this.beams.push({
      owner, special, mesh, length, thickness,
      x: owner.x, y: owner.y + 1.05 * owner.scale, dir: owner.facing,
      frames: b.activeFrames ?? 14,
      maxFrames: b.activeFrames ?? 14,
      hasHit: false,
      dead: false,
    });
  }

  /** One logic step. Frozen during hit-stop because the caller skips it. */
  tick(fighters, ctx) {
    for (const p of this.list) {
      if (p.dead) continue;

      p.history.unshift({ x: p.x, y: p.y });
      if (p.history.length > p.trail.length) p.history.pop();

      p.x += p.vx;
      p.life--;

      // Leaving the stage kills it — no off-screen hitboxes.
      const bound = this.game.stage.halfWidth + 1.5;
      if (p.life <= 0 || p.x < -bound || p.x > bound) {
        p.dead = true;
        continue;
      }

      for (const f of fighters) {
        if (f === p.owner || f.state === STATE.KO) continue;
        const dx = Math.abs(f.x - p.x);
        const dy = Math.abs((f.y + f.height * 0.55) - p.y);
        if (dx > p.radius + f.radius + 0.1) continue;
        if (dy > f.height * 0.55) continue;

        // The projectile is the damage source, so blocks resolve against where
        // the fireball is — not where the character who threw it now stands.
        const src = {
          x: p.x,
          registerHit: () => p.owner.registerHit(),
        };
        applyDamage(src, f, this._moveFrom(p.special), this.game, ctx, {
          source: 'projectile',
        });
        p.dead = true;
        break;
      }
    }

    for (const b of this.beams) {
      if (b.dead) continue;
      b.frames--;
      if (b.frames <= 0) { b.dead = true; continue; }
      if (b.hasHit) continue;

      for (const f of fighters) {
        if (f === b.owner || f.state === STATE.KO) continue;
        const rel = (f.x - b.x) * b.dir;
        if (rel < 0 || rel > b.length) continue;
        if (Math.abs((f.y + f.height * 0.55) - b.y) > f.height * 0.6) continue;

        const src = { x: b.x, registerHit: () => b.owner.registerHit() };
        applyDamage(src, f, this._moveFrom(b.special), this.game, ctx, { source: 'beam' });
        b.hasHit = true;
        break;
      }
    }

    this._sweep();
  }

  _moveFrom(special) {
    return { dmg: special.dmg, stun: special.stun, knock: special.knock };
  }

  _sweep() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (!p.dead) continue;
      this.scene.remove(p.mesh);
      this.scene.remove(p.light);
      p.mesh.material.dispose();
      p.light.dispose?.();
      for (const t of p.trail) { this.scene.remove(t); t.material.dispose(); }
      this.list.splice(i, 1);
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      if (!b.dead) continue;
      this.scene.remove(b.mesh);
      b.mesh.material.dispose();
      this.beams.splice(i, 1);
    }
  }

  /** Copy logic state onto meshes. Render clock. */
  render(timeMs) {
    for (const p of this.list) {
      p.mesh.position.set(p.x, p.y, 0);
      // Spin so the shape reads as energy rather than a ball.
      p.mesh.rotation.x = timeMs * 0.006;
      p.mesh.rotation.y = timeMs * 0.009;
      const pulse = 1 + Math.sin(timeMs * 0.02) * 0.12;
      p.mesh.scale.setScalar(p.radius * pulse);
      p.light.position.set(p.x, p.y, 0.4);

      for (let i = 0; i < p.trail.length; i++) {
        const h = p.history[i];
        const t = p.trail[i];
        if (!h) { t.visible = false; continue; }
        t.visible = true;
        t.position.set(h.x, h.y, 0);
        t.scale.setScalar(p.radius * (1 - i / (p.trail.length + 1)) * 0.85);
      }
    }

    for (const b of this.beams) {
      const t = b.frames / b.maxFrames;
      // Snap open, taper closed.
      const grow = Math.min(1, (1 - t) * 6);
      b.mesh.scale.set(b.length * grow, b.thickness * (0.4 + t * 0.6), b.thickness);
      b.mesh.position.set(b.x + b.dir * (b.length * grow) / 2, b.y, 0);
      b.mesh.material.opacity = 0.85 * t;
    }
  }

  clear() {
    for (const p of this.list) p.dead = true;
    for (const b of this.beams) b.dead = true;
    this._sweep();
  }
}
