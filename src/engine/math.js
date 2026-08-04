/** Small numeric helpers shared across the engine. Deliberately dependency-free
 *  so the logic layer can be unit-tested in Node without three.js. */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

/** Inverse lerp, clamped — maps `v` in [a,b] onto [0,1]. */
export const invLerp = (a, b, v) => (b === a ? 0 : clamp01((v - a) / (b - a)));

/**
 * The prototype's easing curve, used by every attack phase. Fast out of the
 * gate then decelerating — it is what makes a strike read as a strike rather
 * than a linear slide.
 */
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInCubic = (t) => Math.pow(clamp01(t), 3);
export const easeInOutCubic = (t) =>
  clamp01(t) < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Frame-rate-independent-ish exponential approach. The engine runs at a fixed
 * 60Hz so a plain lerp factor is already deterministic; this exists for the
 * render-rate-driven bits (camera smoothing) where dt genuinely varies.
 */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

/** Deterministic PRNG so AI and FX are reproducible when seeded. */
export function makeRandom(seed = 1) {
  let s = seed >>> 0 || 1;
  return function random() {
    // xorshift32
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}
