/**
 * Hit-stop: a short global freeze on impact, 2–6 frames scaled to how heavy the
 * hit was. It is the single cheapest thing you can do to make a hit feel like it
 * has mass — the whole simulation stops, so the eye reads the contact frame.
 *
 * Everything freezes: fighters, the round clock, projectiles. Sparks are the one
 * exception (see HitSparks) — they are spawned *by* the impact, so freezing them
 * would just make them invisible for the duration.
 */
export class HitStop {
  constructor() {
    this.frames = 0;
  }

  /** Requests overlap rather than stack — the heaviest hit wins. */
  request(frames) {
    if (frames > this.frames) this.frames = frames;
  }

  /** @returns {boolean} true if the game is frozen this step. */
  tick() {
    if (this.frames > 0) {
      this.frames--;
      return true;
    }
    return false;
  }

  get active() { return this.frames > 0; }

  clear() { this.frames = 0; }
}
