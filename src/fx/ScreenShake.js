import { makeRandom } from '../engine/math.js';

/**
 * Camera shake. Heavy hits only — see combat.shakeMagnitude, which returns 0
 * below the configured damage threshold so jabs stay readable.
 *
 * The offset is regenerated per render frame and decays geometrically, giving
 * the sharp attack + fast settle that reads as impact rather than as a wobble.
 */
export class ScreenShake {
  constructor(game, seed = 7) {
    this.game = game;
    this.rng = makeRandom(seed);
    this.magnitude = 0;
    this.x = 0;
    this.y = 0;
  }

  /** Strongest request wins; shakes do not accumulate into nausea. */
  request(magnitude) {
    if (magnitude > this.magnitude) this.magnitude = magnitude;
  }

  update(dtMs = 16.67) {
    if (this.magnitude <= 0.0005) {
      this.magnitude = 0;
      this.x = this.y = 0;
      return;
    }
    this.x = (this.rng() * 2 - 1) * this.magnitude;
    this.y = (this.rng() * 2 - 1) * this.magnitude * 0.7;

    // Normalise decay to 60Hz so the shake lasts the same wall-clock time
    // regardless of refresh rate.
    const k = Math.min(4, dtMs / (1000 / 60));
    this.magnitude *= Math.pow(this.game.combat.shake.decay, k);
  }

  clear() {
    this.magnitude = 0;
    this.x = this.y = 0;
  }
}
