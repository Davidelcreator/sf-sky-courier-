import { Loop } from './engine/loop.js';
import { Fighter } from './engine/Fighter.js';
import { Match, PHASE as MATCH_PHASE } from './engine/Match.js';
import { resolveBodies } from './engine/physics.js';
import { resolveCombat } from './engine/combat.js';
import { createWorld, resizeRenderer } from './engine/world.js';
import { FightCamera } from './engine/camera.js';
import { AIController } from './engine/ai.js';

import { HitStop } from './fx/HitStop.js';
import { ScreenShake } from './fx/ScreenShake.js';
import { HitSparks } from './fx/HitSparks.js';
import { Projectiles } from './fx/Projectiles.js';

import { HUD } from './ui/HUD.js';

/**
 * The orchestrator: owns the loop and wires engine, FX, visuals and HUD.
 *
 * Update order per logic step is deliberate and the game does not feel right if
 * it changes:
 *
 *   1. hit-stop — if frozen, nothing below runs at all
 *   2. read input / AI
 *   3. match gate (neutralises input during intro and round-end)
 *   4. fighters tick
 *   5. bodies resolve (push-apart, then corner clamp)
 *   6. combat resolves (melee, then projectiles)
 *   7. events applied (hit-stop, shake, sparks, buffer consumption)
 *   8. animators advance — on the LOGIC clock, so they freeze with the fight
 *
 * Combat resolving *after* movement is what makes range checks agree with what
 * the player can see; animators last means a hit registered this frame is
 * already reflected in the pose that gets drawn.
 */
export class Game {
  constructor({ canvas, uiRoot, gameConfig, loader, input, characters }) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.config = gameConfig;
    this.loader = loader;
    this.input = input;
    this.characters = characters;

    const { renderer, scene, camera } = createWorld(canvas, gameConfig);
    this.renderer = renderer;
    this.scene = scene;
    this.threeCamera = camera;
    this.camera = new FightCamera(camera, gameConfig);

    this.hitStop = new HitStop();
    this.shake = new ScreenShake(gameConfig);
    this.sparks = new HitSparks(scene, gameConfig);
    this.projectiles = new Projectiles(scene, gameConfig);

    this.fighters = [];
    this.visuals = [];
    this.ai = new AIController(gameConfig);
    this.vsAI = true;
    this.paused = false;
    this.running = false;

    this.hud = new HUD(uiRoot, { onPause: () => this.onPauseRequested?.() });
    this.hud.setVisible(false);

    this._yaw = [0, 0];
    this._lastRound = 0;

    this.loop = new Loop({
      hz: gameConfig.timestep.hz,
      maxCatchUpSteps: gameConfig.timestep.maxCatchUpSteps,
      update: () => this.update(),
      render: (alpha, dt) => this.render(alpha, dt),
    });

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    this.resize();
  }

  // -------------------------------------------------------------------------

  /** Build (or rebuild) a match between two character ids. */
  async start(p1Id, p2Id, vsAI = true) {
    // Loading a model is async, and the loop keeps running across the await.
    // Without stopping first, update() ticks a live match whose fighters have
    // already been torn down. Belt and braces: update/render also guard on the
    // fighter count, since `running` alone is a single point of failure.
    this.running = false;
    this.match = null;
    this.teardownFighters();
    this.vsAI = vsAI;

    const cfgs = [p1Id, p2Id].map((id) => {
      const c = this.characters.find((x) => x.id === id) ?? this.characters[0];
      if (!c) throw new Error('no characters available');
      return c;
    });

    for (let i = 0; i < 2; i++) {
      const visual = await this.loader.createVisual(cfgs[i]);
      this.scene.add(visual.root);
      this.visuals.push(visual);

      const f = new Fighter(cfgs[i], this.config, { side: i, x: 0, facing: i === 0 ? 1 : -1 });
      f.profile = i === 0 ? 'p1' : 'p2';
      this.fighters.push(f);
    }

    this.match = new Match(this.config, this.fighters);
    this.ai.reset();
    this.hud.setup(this.fighters, this.match);
    this.hud.setVisible(true);
    this._lastRound = this.match.round;

    this.camera.snap(this.fighters[0], this.fighters[1]);
    this.input.flush();
    this.paused = false;
    this.running = true;
    this.loop.start();
  }

  teardownFighters() {
    for (const v of this.visuals) {
      this.scene.remove(v.root);
      v.dispose?.();
    }
    this.visuals = [];
    this.fighters = [];
    this.projectiles.clear();
    this.sparks.clear();
    this.hitStop.clear();
    this.shake.clear();
  }

  setPaused(on) {
    this.paused = on;
    this.hud.setVisible(!on);
    if (on) this.input.flush();
  }

  stop() {
    this.running = false;
    this.loop.stop();
    this.hud.setVisible(false);
  }

  // -------------------------------------------------------------------------
  // Logic
  // -------------------------------------------------------------------------

  update() {
    if (!this.running || this.paused || !this.match) return;
    if (this.fighters.length < 2 || this.visuals.length < 2) return;

    // 1. Hit-stop freezes everything below, including the round clock.
    if (this.hitStop.tick()) return;

    const [a, b] = this.fighters;
    const ctx = {
      events: [],
      spawnProjectile: (owner, special) => this.projectiles.spawn(owner, special),
      spawnBeam: (owner, special) => this.projectiles.spawnBeam(owner, special),
    };

    // 2. Input / AI
    const raw = [
      this.input.poll('p1'),
      this.vsAI ? this.ai.think(b, a) : this.input.poll('p2'),
    ];

    // 3. Match gate
    const intents = this.match.tick(raw, ctx);

    // 4. Fighters
    a.tick(intents[0], b, ctx);
    b.tick(intents[1], a, ctx);

    // 5. Bodies
    resolveBodies(a, b, this.config);

    // 6. Combat
    resolveCombat(a, b, this.config, ctx);
    this.projectiles.tick(this.fighters, ctx);

    // 7. Events
    this.applyEvents(ctx.events);

    // Round transitions: the match may have reset positions this frame.
    if (this.match.round !== this._lastRound) {
      this._lastRound = this.match.round;
      this.onRoundStart();
    }

    // 8. Animators, on the logic clock so hit-stop freezes them too.
    for (let i = 0; i < 2; i++) {
      this.visuals[i]?.animator.update(this.fighters[i], 1);
    }
  }

  applyEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          this.hitStop.request(e.hitstop);
          if (e.shake > 0) this.shake.request(e.shake);
          this.sparks.burst(e.x, e.y, {
            blocked: e.blocked,
            dir: Math.sign(e.defender.x - e.attacker.x) || 1,
            color: e.blocked ? null : e.attacker.cfg?.accent,
          });
          break;
        }
        case 'startMove': {
          // The fighter consumed a buffered press — clear it so one press is
          // one move, however long the buffer window was.
          const profile = e.fighter.profile;
          if (profile && !(this.vsAI && profile === 'p2')) {
            this.input.consume(profile, e.move);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  onRoundStart() {
    this.projectiles.clear();
    this.sparks.clear();
    this.hitStop.clear();
    this.shake.clear();
    this.ai.reset();
    this.input.flush();
    for (const v of this.visuals) v.animator.reset?.();
    for (let i = 0; i < 2; i++) {
      this._yaw[i] = this.fighters[i].facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    this.camera.snap(this.fighters[0], this.fighters[1]);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  render(alpha, dtMs) {
    if (!this.match || this.fighters.length < 2) return;
    resizeRenderer(this.renderer, this.canvas);

    const k = Math.min(1, dtMs / (1000 / 60));

    for (let i = 0; i < 2; i++) {
      const f = this.fighters[i];
      const v = this.visuals[i];
      if (!f || !v) continue;

      v.root.position.set(f.x, f.y, 0);

      // Turning is smoothed rather than snapped, so crossing someone up reads
      // as a pivot. The shortest-arc walk keeps it from spinning the long way.
      const want = f.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
      let delta = want - this._yaw[i];
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this._yaw[i] += delta * Math.min(1, 0.35 * k);
      v.root.rotation.y = this._yaw[i];
    }

    this.shake.update(dtMs);
    this.camera.update(this.fighters[0], this.fighters[1], dtMs, this.shake);
    this.sparks.update(dtMs);
    this.projectiles.render(performance.now());
    this.hud.update(this.fighters, this.match);

    this.renderer.render(this.scene, this.threeCamera);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.resize(w, h);
  }

  get matchOver() {
    return this.match?.phase === MATCH_PHASE.MATCH_END;
  }

  dispose() {
    this.loop.dispose();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    this.teardownFighters();
    this.hud.dispose();
    this.renderer.dispose();
  }
}
