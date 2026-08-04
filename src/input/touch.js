/**
 * Touch controls: a left analog stick and a right arc of three buttons.
 *
 * Everything here is Pointer Events with `setPointerCapture`, which is what
 * makes genuine multi-touch work — each control owns its own pointerId, so
 * walking while punching is two independent streams rather than one contended
 * one. `touch-action: none` (see style.css) stops the browser stealing the
 * gesture to scroll or zoom.
 *
 * Stick semantics, matching the prototype:
 *   analog x  -> walk speed (so you can creep or dash)
 *   up        -> jump
 *   down      -> block
 *   dead zone -> 0.3, rescaled so the first live input is not a jolt
 */

const DEAD_ZONE = 0.3;
const VERTICAL_GATE = 0.55; // how far up/down before jump/block trigger

export class TouchSource {
  /**
   * @param {HTMLElement} container overlay element to build controls into
   * @param {Bindings} bindings
   */
  constructor(container, bindings) {
    this.bindings = bindings;
    this.enabled = false;

    this.state = {
      moveX: 0, jump: false, block: false,
      punch: false, kick: false, special: false,
    };

    this.root = document.createElement('div');
    this.root.className = 'touch-controls';
    this.root.hidden = true;
    container.appendChild(this.root);

    this._buildStick();
    this._buildButtons();

    this._unbind = bindings.onChange(() => this.refreshLabels());
  }

  /** Show the controls. Called when a touch is first seen, or forced in settings. */
  setEnabled(on) {
    this.enabled = on;
    this.root.hidden = !on;
    if (!on) this.reset();
  }

  reset() {
    this.state.moveX = 0;
    this.state.jump = false;
    this.state.block = false;
    this.state.punch = false;
    this.state.kick = false;
    this.state.special = false;
    this._knob.style.transform = 'translate(-50%, -50%)';
    this._stickPointer = null;
    for (const b of this._buttons) {
      b.el.classList.remove('is-down');
      b.pointers.clear();
    }
  }

  // --- stick --------------------------------------------------------------

  _buildStick() {
    const base = document.createElement('div');
    base.className = 'touch-stick';
    const knob = document.createElement('div');
    knob.className = 'touch-stick-knob';
    base.appendChild(knob);
    this.root.appendChild(base);

    this._stick = base;
    this._knob = knob;
    this._stickPointer = null;

    const radius = () => base.getBoundingClientRect().width / 2;

    const move = (e) => {
      if (this._stickPointer !== e.pointerId) return;
      const r = base.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const rad = radius();

      let nx = (e.clientX - cx) / rad;
      let ny = (e.clientY - cy) / rad;
      const len = Math.hypot(nx, ny);
      if (len > 1) { nx /= len; ny /= len; }

      // Rescale past the dead zone so movement starts from 0, not from 0.3.
      const ax = Math.abs(nx);
      this.state.moveX = ax > DEAD_ZONE
        ? Math.sign(nx) * ((ax - DEAD_ZONE) / (1 - DEAD_ZONE))
        : 0;

      this.state.jump = ny < -VERTICAL_GATE;
      this.state.block = ny > VERTICAL_GATE;

      knob.style.transform =
        `translate(calc(-50% + ${nx * rad * 0.62}px), calc(-50% + ${ny * rad * 0.62}px))`;
    };

    base.addEventListener('pointerdown', (e) => {
      if (this._stickPointer !== null) return; // already owned by another finger
      this._stickPointer = e.pointerId;
      base.setPointerCapture(e.pointerId);
      base.classList.add('is-active');
      move(e);
      e.preventDefault();
    });

    base.addEventListener('pointermove', (e) => { move(e); e.preventDefault(); });

    const release = (e) => {
      if (this._stickPointer !== e.pointerId) return;
      this._stickPointer = null;
      base.classList.remove('is-active');
      this.state.moveX = 0;
      this.state.jump = false;
      this.state.block = false;
      knob.style.transform = 'translate(-50%, -50%)';
      if (base.hasPointerCapture?.(e.pointerId)) base.releasePointerCapture(e.pointerId);
    };
    base.addEventListener('pointerup', release);
    base.addEventListener('pointercancel', release);
    base.addEventListener('lostpointercapture', release);
  }

  // --- buttons ------------------------------------------------------------

  _buildButtons() {
    const cluster = document.createElement('div');
    cluster.className = 'touch-buttons';
    this.root.appendChild(cluster);
    this._cluster = cluster;

    // Three buttons arranged on an arc sweeping up from the thumb. The arc
    // positions live in CSS (keyed off data-slot) so they can scale with the
    // button size on both axes — hard-coded pixel offsets overlap on a short
    // landscape phone. Slot index matches bindings.touchSlots, so remapping an
    // action is reordering that array.
    this._buttons = [0, 1, 2].map((i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'touch-btn';
      el.dataset.slot = String(i);
      cluster.appendChild(el);

      const entry = { el, slot: i, pointers: new Set() };

      el.addEventListener('pointerdown', (e) => {
        entry.pointers.add(e.pointerId);
        el.setPointerCapture(e.pointerId);
        el.classList.add('is-down');
        this._applyButtons();
        e.preventDefault();
      });

      const up = (e) => {
        if (!entry.pointers.delete(e.pointerId)) return;
        if (!entry.pointers.size) el.classList.remove('is-down');
        this._applyButtons();
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
      // A finger that slides off the button should release it.
      el.addEventListener('pointerleave', up);

      return entry;
    });

    this.refreshLabels();
  }

  /** Push slot -> action assignments into the button labels and state keys. */
  refreshLabels() {
    const slots = this.bindings.touchSlots;
    for (const b of this._buttons) {
      const action = slots[b.slot];
      b.action = action;
      b.el.textContent = SHORT[action] ?? action.slice(0, 1).toUpperCase();
      b.el.dataset.action = action;
      b.el.setAttribute('aria-label', action);
    }
    this._applyButtons();
  }

  _applyButtons() {
    this.state.punch = false;
    this.state.kick = false;
    this.state.special = false;
    for (const b of this._buttons) {
      if (b.pointers.size && b.action) this.state[b.action] = true;
    }
  }

  read() {
    return this.enabled ? this.state : null;
  }

  dispose() {
    this._unbind?.();
    this.root.remove();
  }
}

const SHORT = { punch: 'P', kick: 'K', special: 'SP', jump: 'J', block: 'B' };
