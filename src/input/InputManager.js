import { KeyboardSource } from './keyboard.js';
import { TouchSource } from './touch.js';
import { GamepadSource } from './gamepad.js';
import { clamp } from '../engine/math.js';

/**
 * Unifies keyboard, touch and gamepad into one intent object per player.
 *
 * ## Edge-triggering and the buffer
 *
 * Attacks fire on the *press*, not while held — otherwise leaning on the punch
 * key produces an unstoppable auto-jab. But a strict edge is unfair: press
 * punch two frames before your recovery ends and nothing happens at all.
 *
 * So a press opens a short buffer (default 4 frames). The fighter consumes it
 * when the move actually starts. That is the difference between "the game
 * dropped my input" and a combo that links.
 *
 * Movement and block stay level-triggered — they are held states.
 */

const ATTACKS = ['punch', 'kick', 'special'];

const EMPTY = () => ({
  moveX: 0, jump: false, block: false, punch: false, kick: false, special: false,
});

export class InputManager {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.container overlay root for touch controls
   * @param {Bindings} opts.bindings
   * @param {object} opts.game global config
   */
  constructor({ container, bindings, game }) {
    this.bindings = bindings;
    this.game = game;
    this.bufferFrames = game.input?.bufferFrames ?? 4;

    this.keyboard = new KeyboardSource();
    this.touch = new TouchSource(container, bindings);
    this.gamepad = new GamepadSource();

    // Per-profile edge/buffer state.
    this._prev = { p1: EMPTY(), p2: EMPTY() };
    this._buffer = { p1: {}, p2: {} };

    this._autoDetectTouch();
  }

  /**
   * Touch controls appear the moment a touch is seen, and on any device whose
   * primary pointer is coarse. Checking `ontouchstart` alone would show them on
   * touch-capable laptops that are being used with a mouse.
   */
  _autoDetectTouch() {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    if (coarse) this.touch.setEnabled(true);

    const onFirstTouch = () => {
      this.touch.setEnabled(true);
      window.removeEventListener('touchstart', onFirstTouch);
    };
    window.addEventListener('touchstart', onFirstTouch, { passive: true });
  }

  setTouchEnabled(on) { this.touch.setEnabled(on); }

  /**
   * Read one profile's intent for this logic frame.
   * @param {'p1'|'p2'} profile
   */
  poll(profile) {
    const raw = EMPTY();

    // --- keyboard (always read; the live binding map is consulted per frame)
    const kb = this.keyboard.readProfile(this.bindings, profile);
    if (kb.left) raw.moveX -= 1;
    if (kb.right) raw.moveX += 1;
    raw.jump = kb.jump;
    raw.block = kb.block;
    for (const a of ATTACKS) raw[a] = kb[a];

    // --- touch and gamepad drive player 1 only
    if (profile === 'p1') {
      const t = this.touch.read();
      if (t) {
        if (t.moveX) raw.moveX = t.moveX;   // analog wins over digital
        raw.jump = raw.jump || t.jump;
        raw.block = raw.block || t.block;
        for (const a of ATTACKS) raw[a] = raw[a] || t[a];
      }

      const g = this.gamepad.read(this.bindings);
      if (g) {
        if (g.moveX) raw.moveX = g.moveX;
        raw.jump = raw.jump || g.jump;
        raw.block = raw.block || g.block;
        for (const a of ATTACKS) raw[a] = raw[a] || g[a];
      }
    }

    raw.moveX = clamp(raw.moveX, -1, 1);

    // --- edge-trigger the attacks into a short buffer
    const prev = this._prev[profile];
    const buf = this._buffer[profile];

    for (const a of ATTACKS) {
      if (raw[a] && !prev[a]) buf[a] = this.bufferFrames;
      else if (buf[a] > 0) buf[a]--;
    }

    this._prev[profile] = { ...raw };

    return {
      moveX: raw.moveX,
      jump: raw.jump,        // held: gated by `grounded`, so it bounces
      block: raw.block,      // held
      punch: (buf.punch ?? 0) > 0,
      kick: (buf.kick ?? 0) > 0,
      special: (buf.special ?? 0) > 0,
    };
  }

  /** The fighter started a move — clear its buffer so it fires exactly once. */
  consume(profile, action) {
    if (this._buffer[profile]) this._buffer[profile][action] = 0;
  }

  /** Drop every buffered input (round transitions, pausing, menus). */
  flush() {
    for (const p of ['p1', 'p2']) {
      this._buffer[p] = {};
      this._prev[p] = EMPTY();
    }
    this.touch.reset();
  }

  dispose() {
    this.keyboard.dispose();
    this.touch.dispose();
    this.gamepad.dispose();
  }
}
