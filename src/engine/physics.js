import { sign } from './math.js';

/**
 * Body resolution: keeping two fighters out of each other, and both inside the
 * stage. Runs after every fighter has integrated, once per logic step.
 *
 * Order matters. Push-apart first, then the corner clamp — that ordering is
 * what produces corner pressure: the cornered fighter cannot be pushed through
 * the wall, so the overlap is resolved entirely into the attacker, and the
 * defender stays pinned.
 */

/** Do these two bodies overlap vertically? You can jump over someone. */
function verticallyOverlapping(a, b) {
  return !(a.y > b.y + b.height * 0.72 || b.y > a.y + a.height * 0.72);
}

/** Separate two overlapping bodies, each yielding half the overlap. */
export function pushApart(a, b, game) {
  if (!verticallyOverlapping(a, b)) return;

  const minGap = Math.max(game.physics.pushApartMinGap, a.radius + b.radius);
  const dx = b.x - a.x;
  const dist = Math.abs(dx);
  if (dist >= minGap) return;

  // Exactly co-located: break the tie with side so they never lock up.
  const dir = sign(dx) || (a.side === 0 ? 1 : -1);
  const overlap = (minGap - dist) * game.physics.pushApartStrength;

  a.x -= dir * overlap * 0.5;
  b.x += dir * overlap * 0.5;
}

/** Clamp one fighter inside the stage walls, killing outward velocity. */
export function clampToStage(f, game) {
  const half = game.stage.halfWidth - f.radius;
  if (f.x < -half) {
    f.x = -half;
    if (f.vx < 0) f.vx = 0;
    f.cornered = -1;
  } else if (f.x > half) {
    f.x = half;
    if (f.vx > 0) f.vx = 0;
    f.cornered = 1;
  } else {
    f.cornered = 0;
  }
}

/**
 * Full pass: separate, clamp, then re-separate against the wall.
 *
 * The second separation is the important one. If A got clamped into the corner
 * while still overlapping B, B is the one that has to move — otherwise the two
 * bodies would sit inside each other for as long as the corner pressure lasts.
 */
export function resolveBodies(a, b, game) {
  pushApart(a, b, game);

  if (game.stage.cornerClamp !== false) {
    clampToStage(a, game);
    clampToStage(b, game);

    if (verticallyOverlapping(a, b)) {
      const minGap = Math.max(game.physics.pushApartMinGap, a.radius + b.radius);
      const dx = b.x - a.x;
      const dist = Math.abs(dx);
      if (dist < minGap) {
        const dir = sign(dx) || 1;
        const overlap = minGap - dist;
        // Whoever is against a wall stays put; the other absorbs the overlap.
        if (a.cornered) b.x += dir * overlap;
        else if (b.cornered) a.x -= dir * overlap;
        else { a.x -= dir * overlap * 0.5; b.x += dir * overlap * 0.5; }

        clampToStage(a, game);
        clampToStage(b, game);
      }
    }
  }
}
