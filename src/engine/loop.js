/**
 * Fixed-timestep game loop.
 *
 * Logic runs at exactly 60Hz no matter what the display does. Render runs as
 * fast as the browser will paint. This is the reason frame data means anything:
 * a 4-frame startup is 4 logic steps on a 60Hz phone, a 144Hz monitor, and a
 * laptop dropping to 30fps alike.
 *
 * The accumulator pattern:
 *   accumulate real elapsed time -> spend it in whole fixed steps -> render the
 *   remainder as an interpolation alpha so motion stays smooth between steps.
 */
export class Loop {
  /**
   * @param {object}   opts
   * @param {function} opts.update  called once per fixed logic step
   * @param {function} opts.render  called once per animation frame, given (alpha, dtMs)
   * @param {number}   [opts.hz]              logic rate, default 60
   * @param {number}   [opts.maxCatchUpSteps] cap on steps per frame
   */
  constructor({ update, render, hz = 60, maxCatchUpSteps = 5 }) {
    this.update = update;
    this.render = render;
    this.stepMs = 1000 / hz;
    this.maxCatchUpSteps = maxCatchUpSteps;

    this.accumulator = 0;
    this.lastTime = 0;
    this.running = false;
    this.frameId = 0;

    // Diagnostics the HUD can surface.
    this.fps = 0;
    this._fpsAccum = 0;
    this._fpsFrames = 0;

    this._tick = this._tick.bind(this);

    // A backgrounded tab stops firing rAF. Without this the first frame back
    // carries a multi-second delta and the accumulator tries to run hundreds of
    // logic steps at once. Dropping the accumulated time is the correct
    // behaviour for a fighting game: resume live, do not simulate the gap.
    this._onVisibility = () => {
      if (!document.hidden) {
        this.lastTime = performance.now();
        this.accumulator = 0;
      }
    };
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.frameId = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  dispose() {
    this.stop();
    document.removeEventListener('visibilitychange', this._onVisibility);
  }

  _tick(now) {
    if (!this.running) return;
    this.frameId = requestAnimationFrame(this._tick);

    let dt = now - this.lastTime;
    this.lastTime = now;

    // Guard against absurd deltas (tab restore, breakpoint in devtools).
    if (dt > 250) dt = this.stepMs;

    this.accumulator += dt;

    let steps = 0;
    while (this.accumulator >= this.stepMs && steps < this.maxCatchUpSteps) {
      this.update();
      this.accumulator -= this.stepMs;
      steps++;
    }

    // If we hit the cap we are running behind. Drop the backlog rather than
    // carrying it into the next frame, which would compound the problem.
    if (steps >= this.maxCatchUpSteps) this.accumulator = 0;

    this._fpsAccum += dt;
    this._fpsFrames++;
    if (this._fpsAccum >= 500) {
      this.fps = Math.round((this._fpsFrames * 1000) / this._fpsAccum);
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }

    this.render(this.accumulator / this.stepMs, dt);
  }
}
