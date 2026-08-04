/**
 * Rebindable controls, persisted to localStorage.
 *
 * Rebinding is Smash-style: pick an action row, press a key, done. If that key
 * already belongs to another action the two **swap** rather than both answering
 * to it — a duplicate binding is never a state you can reach, so there is no
 * broken configuration to get stuck in. Esc cancels.
 */

export const ACTIONS = ['left', 'right', 'jump', 'block', 'punch', 'kick', 'special'];

export const ACTION_LABELS = {
  left: 'Move left',
  right: 'Move right',
  jump: 'Jump',
  block: 'Block',
  punch: 'Punch',
  kick: 'Kick',
  special: 'Special',
};

const STORAGE_KEY = 'skyfighter.bindings.v2';

export const DEFAULT_BINDINGS = Object.freeze({
  keyboard: {
    p1: {
      left: 'KeyA', right: 'KeyD', jump: 'KeyW', block: 'KeyS',
      punch: 'KeyJ', kick: 'KeyK', special: 'KeyL',
    },
    p2: {
      left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', block: 'ArrowDown',
      punch: 'Numpad1', kick: 'Numpad2', special: 'Numpad3',
    },
  },
  // Which action sits in each of the three arc-arranged touch slots. Reordering
  // this array is what "remapping touch buttons" means.
  touch: {
    slots: ['punch', 'kick', 'special'],
  },
  gamepad: {
    // Standard Gamepad API button indices.
    jump: 0,      // A / cross
    block: 1,     // B / circle
    punch: 2,     // X / square
    kick: 3,      // Y / triangle
    special: 7,   // right trigger
  },
});

/** Human-readable name for a KeyboardEvent.code. */
export function keyLabel(code) {
  if (!code) return '—';
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace(/^Numpad/, 'Num ')
    .replace(/^Arrow/, '')
    .replace(/^([A-Z])([a-z])/, '$1$2')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
}

function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

/** Merge stored bindings over the defaults so a new action never comes back undefined. */
function merge(defaults, stored) {
  const out = deepClone(defaults);
  if (!stored || typeof stored !== 'object') return out;

  for (const profile of ['p1', 'p2']) {
    const src = stored.keyboard?.[profile];
    if (!src) continue;
    for (const action of ACTIONS) {
      if (typeof src[action] === 'string') out.keyboard[profile][action] = src[action];
    }
  }

  if (Array.isArray(stored.touch?.slots)) {
    const valid = stored.touch.slots.filter((s) => ACTIONS.includes(s));
    // Only accept a complete, duplicate-free slot list.
    if (valid.length === 3 && new Set(valid).size === 3) out.touch.slots = valid;
  }

  for (const action of ['jump', 'block', 'punch', 'kick', 'special']) {
    const v = stored.gamepad?.[action];
    if (Number.isInteger(v) && v >= 0 && v < 32) out.gamepad[action] = v;
  }

  return out;
}

export class Bindings {
  constructor(storage = safeStorage()) {
    this.storage = storage;
    this.map = merge(DEFAULT_BINDINGS, this._read());
    this.listeners = new Set();
  }

  _read() {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null; // corrupt or unavailable — fall back to defaults
    }
  }

  save() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.map));
    } catch {
      // Private browsing, quota, or no storage at all. The game still runs;
      // the bindings just will not survive a reload.
    }
    this._emit();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    for (const fn of this.listeners) fn(this.map);
  }

  // --- keyboard -----------------------------------------------------------

  keyFor(profile, action) {
    return this.map.keyboard[profile]?.[action] ?? null;
  }

  /** Which action (if any) this key currently drives for a profile. */
  actionForKey(profile, code) {
    const p = this.map.keyboard[profile];
    if (!p) return null;
    return ACTIONS.find((a) => p[a] === code) ?? null;
  }

  /**
   * Bind `code` to `action`. If another action in the same profile already owns
   * that key, the two swap so no key is ever bound twice.
   * @returns {{swappedWith: string|null}}
   */
  bindKey(profile, action, code) {
    const p = this.map.keyboard[profile];
    if (!p) throw new Error(`unknown profile "${profile}"`);

    const previousOwner = this.actionForKey(profile, code);
    const oldCode = p[action];

    p[action] = code;
    let swappedWith = null;
    if (previousOwner && previousOwner !== action) {
      p[previousOwner] = oldCode;
      swappedWith = previousOwner;
    }

    this.save();
    return { swappedWith };
  }

  // --- touch --------------------------------------------------------------

  get touchSlots() { return this.map.touch.slots; }

  /** Swap the actions in two touch button slots. */
  swapTouchSlots(a, b) {
    const s = this.map.touch.slots;
    if (a < 0 || b < 0 || a >= s.length || b >= s.length || a === b) return;
    [s[a], s[b]] = [s[b], s[a]];
    this.save();
  }

  // --- gamepad ------------------------------------------------------------

  gamepadButtonFor(action) { return this.map.gamepad[action]; }

  bindGamepadButton(action, index) {
    const g = this.map.gamepad;
    const previousOwner = Object.keys(g).find((a) => g[a] === index);
    const old = g[action];
    g[action] = index;
    if (previousOwner && previousOwner !== action) g[previousOwner] = old;
    this.save();
  }

  // --- reset --------------------------------------------------------------

  resetToDefaults() {
    this.map = deepClone(DEFAULT_BINDINGS);
    this.save();
  }
}

/** localStorage can throw on access alone in some privacy modes. */
function safeStorage() {
  try {
    const t = '__sf_probe__';
    window.localStorage.setItem(t, '1');
    window.localStorage.removeItem(t);
    return window.localStorage;
  } catch {
    return null;
  }
}
