import { Screen } from './Screen.js';
import { ACTIONS, ACTION_LABELS, keyLabel } from '../../input/bindings.js';

/**
 * Button settings — Smash-style remapping, plus touch slot swapping.
 *
 * Rebind flow: tap a row, press a key. If that key already belongs to another
 * action the two **swap** (the displaced row flashes so you can see where your
 * old key went) — you can never end up with a duplicate binding or an action
 * with no key. Esc cancels.
 *
 * Everything persists to localStorage the moment it changes, so there is no
 * save button to forget to press.
 */
export class SettingsScreen extends Screen {
  /**
   * @param {HTMLElement} root
   * @param {object} opts { bindings, input, onBack, diagnostics() }
   */
  constructor(root, { bindings, input, onBack, diagnostics }) {
    super(root, 'settings-screen');
    this.bindings = bindings;
    this.input = input;
    this.diagnostics = diagnostics;

    this.profile = 'p1';
    this.listening = null;   // { action, row }
    this.pickedSlot = null;

    this.add('h1', '', this.el, 'Controls');
    this.add('p', 'subtitle', this.el, 'Saved automatically to this device.');

    // --- profile tabs
    const tabs = this.add('div', 'btn-row', this.el);
    this.p1Tab = this.button('Player 1', '', tabs, () => this.setProfile('p1'));
    this.p2Tab = this.button('Player 2', '', tabs, () => this.setProfile('p2'));

    // --- keyboard bindings
    this.add('h2', '', this.el, 'Keyboard');
    this.list = this.add('div', 'bind-list', this.el);
    this.rows = new Map();
    for (const action of ACTIONS) {
      const row = this.add('button', 'bind-row', this.list);
      row.type = 'button';
      const label = this.add('span', '', row, ACTION_LABELS[action]);
      const key = this.add('span', 'key', row);
      row.addEventListener('click', () => this.startListening(action, row));
      this.rows.set(action, { row, key, label });
    }
    this.add('p', 'hint', this.el,
      'Tap an action, then press a key. Taken keys swap. Esc cancels.');

    // --- touch slots
    this.add('h2', '', this.el, 'Touch buttons');
    this.slotRow = this.add('div', 'slot-row', this.el);
    this.slotEls = [0, 1, 2].map((i) => {
      const b = this.add('button', 'slot', this.slotRow);
      b.type = 'button';
      b.addEventListener('click', () => this.pickSlot(i));
      return b;
    });
    this.add('p', 'hint', this.el,
      'Tap two buttons to swap which action they fire. Order matches the on-screen arc.');

    // --- gamepad
    this.add('h2', '', this.el, 'Gamepad');
    this.padInfo = this.add('p', 'hint', this.el, '');

    // --- diagnostics
    this.add('h2', '', this.el, 'Diagnostics');
    this.diag = this.add('div', 'diag', this.el);

    const row = this.add('div', 'btn-row', this.el);
    this.button('Back', 'is-primary', row, () => onBack?.());
    this.button('Reset to defaults', 'is-ghost', row, () => {
      this.cancelListening();
      this.bindings.resetToDefaults();
      this.refresh();
    });

    this._onKeyDown = (e) => this.handleKey(e);
    this.refresh();
  }

  onShow() {
    // Capture phase so the binding capture beats every other key handler.
    window.addEventListener('keydown', this._onKeyDown, true);
    this._padTimer = setInterval(() => this.refreshPad(), 400);
    this.refresh();
  }

  onHide() {
    window.removeEventListener('keydown', this._onKeyDown, true);
    clearInterval(this._padTimer);
    this.cancelListening();
  }

  setProfile(p) {
    this.cancelListening();
    this.profile = p;
    this.refresh();
  }

  // --- rebinding ----------------------------------------------------------

  startListening(action, row) {
    this.cancelListening();
    this.listening = { action, row };
    row.classList.add('is-listening');
    this.rows.get(action).key.textContent = 'press…';
    // Stop the game reading keys while we are capturing one.
    this.input.keyboard.enabled = false;
  }

  cancelListening() {
    if (!this.listening) return;
    this.listening.row.classList.remove('is-listening');
    this.listening = null;
    this.input.keyboard.enabled = true;
    this.refreshKeys();
  }

  handleKey(e) {
    if (!this.visible) return;

    if (!this.listening) {
      if (e.key === 'Escape') this.el.querySelector('.btn.is-primary')?.click();
      return;
    }

    // Swallow it entirely — this keypress is a binding, not gameplay.
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') { this.cancelListening(); return; }
    // Tab and modifier-only presses make for terrible bindings.
    if (e.code === 'Tab' || /^(Shift|Control|Alt|Meta)(Left|Right)$/.test(e.code)) return;

    const { action } = this.listening;
    const { swappedWith } = this.bindings.bindKey(this.profile, action, e.code);

    this.cancelListening();

    if (swappedWith) {
      const other = this.rows.get(swappedWith);
      other.row.classList.remove('just-swapped');
      void other.row.offsetWidth;
      other.row.classList.add('just-swapped');
    }
  }

  // --- touch slots --------------------------------------------------------

  pickSlot(i) {
    if (this.pickedSlot === null) {
      this.pickedSlot = i;
    } else if (this.pickedSlot === i) {
      this.pickedSlot = null;
    } else {
      this.bindings.swapTouchSlots(this.pickedSlot, i);
      this.pickedSlot = null;
    }
    this.refreshSlots();
  }

  // --- rendering ----------------------------------------------------------

  refresh() {
    this.p1Tab.classList.toggle('is-primary', this.profile === 'p1');
    this.p2Tab.classList.toggle('is-primary', this.profile === 'p2');
    this.refreshKeys();
    this.refreshSlots();
    this.refreshPad();
    this.refreshDiagnostics();
  }

  refreshKeys() {
    for (const action of ACTIONS) {
      const { key } = this.rows.get(action);
      key.textContent = keyLabel(this.bindings.keyFor(this.profile, action));
    }
  }

  refreshSlots() {
    const slots = this.bindings.touchSlots;
    this.slotEls.forEach((b, i) => {
      const action = slots[i];
      b.innerHTML = `${ACTION_LABELS[action] ?? action}<small>slot ${i + 1}</small>`;
      b.classList.toggle('is-picked', this.pickedSlot === i);
    });
  }

  refreshPad() {
    if (!this.visible) return;
    const g = this.input.gamepad;
    this.padInfo.textContent = g.connected
      ? `Connected: ${g.id || 'gamepad'} — standard mapping, D-pad and left stick both steer.`
      : 'No gamepad detected. Connect one and press a button.';
  }

  refreshDiagnostics() {
    if (!this.diagnostics) { this.diag.hidden = true; return; }
    const d = this.diagnostics();
    const lines = [];

    lines.push(`storage      ${d.storage ? '<b>available</b>' : '<span class="warn">unavailable — bindings will not persist</span>'}`);
    lines.push(`animations   ${d.clipsLoaded ? `<b>${d.clipsLoaded} shared clips</b>` : '<span class="warn">none — procedural poser only</span>'}`);

    for (const f of d.fighters ?? []) {
      lines.push(`${f.id.padEnd(12)} ${f.kind === 'clip' ? '<b>' + f.animation + '</b>' : f.animation}`);
      for (const w of f.warnings ?? []) lines.push(`             <span class="warn">${w}</span>`);
    }
    for (const e of d.libraryErrors ?? []) {
      lines.push(`<span class="warn">library: ${e}</span>`);
    }

    this.diag.innerHTML = lines.join('\n');
  }
}
