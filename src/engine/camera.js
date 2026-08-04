import { clamp, lerp } from './math.js';

/**
 * Fight camera: tracks the midpoint of both fighters, pulls back as they
 * separate, and takes an additive shake offset from the FX layer.
 *
 * Smoothing runs on the render clock rather than the logic clock — the camera
 * is presentation, not simulation, so it may move at 144Hz even though the
 * fight is resolved at 60.
 */
export class FightCamera {
  constructor(camera, game) {
    this.camera = camera;
    this.game = game;
    const c = game.camera;

    this.camera.fov = c.fov;
    this.camera.updateProjectionMatrix();

    this.midX = 0;
    this.distance = c.baseDistance;
    this.shakeX = 0;
    this.shakeY = 0;
  }

  /** Snap straight to the framing with no easing — used on round start. */
  snap(a, b) {
    const c = this.game.camera;
    this.midX = clamp((a.x + b.x) / 2, -c.maxMidpointDrift, c.maxMidpointDrift);
    this.distance = this._targetDistance(a, b);
    this.shakeX = this.shakeY = 0;
    this.apply();
  }

  _targetDistance(a, b) {
    const c = this.game.camera;
    const separation = Math.abs(a.x - b.x);
    // Also account for height so a jump-in does not clip out of frame.
    const vertical = Math.max(a.y, b.y) * 0.8;
    return clamp(
      c.baseDistance + (separation + vertical) * c.separationScale,
      c.minDistance,
      c.maxDistance,
    );
  }

  /**
   * @param {Fighter} a
   * @param {Fighter} b
   * @param {number} dtMs      real elapsed ms for this render frame
   * @param {object} shake     { x, y } current shake offset from the FX layer
   */
  update(a, b, dtMs, shake) {
    const c = this.game.camera;

    // Normalise the lerp to a 60Hz reference so smoothing feels identical on a
    // 30Hz phone and a 144Hz monitor.
    const k = clamp(dtMs / (1000 / 60), 0.1, 4);
    const follow = 1 - Math.pow(1 - c.followLerp, k);
    const zoom = 1 - Math.pow(1 - c.zoomLerp, k);

    const targetMid = clamp((a.x + b.x) / 2, -c.maxMidpointDrift, c.maxMidpointDrift);
    this.midX = lerp(this.midX, targetMid, follow);
    this.distance = lerp(this.distance, this._targetDistance(a, b), zoom);

    this.shakeX = shake?.x ?? 0;
    this.shakeY = shake?.y ?? 0;

    this.apply();
  }

  apply() {
    const c = this.game.camera;
    this.camera.position.set(
      this.midX + this.shakeX,
      c.height + this.shakeY,
      this.distance,
    );
    this.camera.lookAt(this.midX + this.shakeX * 0.6, c.lookHeight + this.shakeY * 0.6, 0);
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    // On a tall phone in portrait, a fixed horizontal FOV would push both
    // fighters off the sides. Widen the vertical FOV as the aspect narrows so
    // the horizontal framing is preserved.
    const c = this.game.camera;
    const ref = 16 / 9;
    const aspect = width / height;
    this.camera.fov = aspect < ref
      ? clamp(c.fov * (ref / aspect) * 0.82, c.fov, c.fov * 1.9)
      : c.fov;
    this.camera.updateProjectionMatrix();
  }
}
