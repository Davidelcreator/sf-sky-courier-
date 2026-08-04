/**
 * Gamepad API source.
 *
 * Polled, not event-driven — the spec gives no button events, so state is read
 * fresh every logic frame. Any controller the browser reports in the "standard"
 * mapping works without configuration; button indices are rebindable through
 * the same Bindings object as the keyboard.
 */
const DEAD_ZONE = 0.28;
const DPAD_LEFT = 14;
const DPAD_RIGHT = 15;
const DPAD_UP = 12;
const DPAD_DOWN = 13;

export class GamepadSource {
  constructor() {
    this.index = null;
    this.connected = false;
    this.id = '';

    this._onConnect = (e) => {
      // First pad to appear wins; a second player would take the next index.
      if (this.index === null) {
        this.index = e.gamepad.index;
        this.id = e.gamepad.id;
        this.connected = true;
      }
    };
    this._onDisconnect = (e) => {
      if (e.gamepad.index === this.index) {
        this.index = null;
        this.connected = false;
        this.id = '';
      }
    };

    window.addEventListener('gamepadconnected', this._onConnect);
    window.addEventListener('gamepaddisconnected', this._onDisconnect);
  }

  _pad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    if (this.index !== null && pads[this.index]) return pads[this.index];
    // Some browsers only populate pads after the first button press, so adopt
    // whatever shows up rather than waiting for the connect event.
    for (const p of pads) {
      if (p && p.connected) {
        this.index = p.index;
        this.id = p.id;
        this.connected = true;
        return p;
      }
    }
    return null;
  }

  /** @returns {object|null} action map, or null when no pad is present. */
  read(bindings) {
    const pad = this._pad();
    if (!pad) {
      this.connected = false;
      return null;
    }
    this.connected = true;

    const axis = pad.axes?.[0] ?? 0;
    const x = Math.abs(axis) > DEAD_ZONE ? axis : 0;
    const btn = (i) => !!pad.buttons?.[i]?.pressed;

    const g = bindings.map.gamepad;
    return {
      // Analog stick and d-pad both steer; whichever is further wins.
      moveX: x || (btn(DPAD_LEFT) ? -1 : btn(DPAD_RIGHT) ? 1 : 0),
      left: x < -DEAD_ZONE || btn(DPAD_LEFT),
      right: x > DEAD_ZONE || btn(DPAD_RIGHT),
      jump: btn(g.jump) || btn(DPAD_UP),
      block: btn(g.block) || btn(DPAD_DOWN),
      punch: btn(g.punch),
      kick: btn(g.kick),
      special: btn(g.special),
    };
  }

  /** First pressed button index — used by the settings screen to rebind. */
  pressedButton() {
    const pad = this._pad();
    if (!pad) return null;
    for (let i = 0; i < pad.buttons.length; i++) {
      if (pad.buttons[i]?.pressed) return i;
    }
    return null;
  }

  dispose() {
    window.removeEventListener('gamepadconnected', this._onConnect);
    window.removeEventListener('gamepaddisconnected', this._onDisconnect);
  }
}
