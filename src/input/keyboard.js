/**
 * Keyboard source.
 *
 * Holds only the set of physically-held key codes. It never stores which
 * *action* a key maps to — that lookup happens per-frame against the live
 * Bindings object, which is what lets you rebind a key mid-fight and have the
 * next frame already use it.
 */
export class KeyboardSource {
  constructor(target = window) {
    this.target = target;
    this.held = new Set();
    /** Codes pressed since the last poll — used for rebind capture. */
    this.lastCode = null;
    this.enabled = true;

    this._onDown = (e) => {
      if (!this.enabled) return;
      this.lastCode = e.code;
      this.held.add(e.code);
      // Stop the page scrolling / spacebar-clicking the focused button.
      if (SWALLOW.has(e.code)) e.preventDefault();
    };
    this._onUp = (e) => {
      this.held.delete(e.code);
    };
    // A tab switch mid-hold otherwise leaves the key stuck down forever.
    this._onBlur = () => this.held.clear();

    target.addEventListener('keydown', this._onDown, { passive: false });
    target.addEventListener('keyup', this._onUp);
    target.addEventListener('blur', this._onBlur);
  }

  isDown(code) { return !!code && this.held.has(code); }

  /** Read the live binding map — never a cached copy. */
  readProfile(bindings, profile) {
    const out = {};
    for (const action of ['left', 'right', 'jump', 'block', 'punch', 'kick', 'special']) {
      out[action] = this.isDown(bindings.keyFor(profile, action));
    }
    return out;
  }

  dispose() {
    this.target.removeEventListener('keydown', this._onDown);
    this.target.removeEventListener('keyup', this._onUp);
    this.target.removeEventListener('blur', this._onBlur);
    this.held.clear();
  }
}

const SWALLOW = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Tab', 'Slash', 'Quote',
]);
