import { Screen } from './Screen.js';

/**
 * Character select. Reads the roster straight from the loaded configs, so a new
 * character JSON appears here with no UI change.
 */
export class SelectScreen extends Screen {
  /**
   * @param {HTMLElement} root
   * @param {object[]} characters loaded character configs
   * @param {object} handlers { onStart(p1Id, p2Id, vsAI), onSettings, onGenerate }
   */
  constructor(root, characters, handlers = {}) {
    super(root, 'select-screen');
    this.characters = characters;
    this.handlers = handlers;

    this.p1 = characters[0]?.id;
    this.p2 = characters[1]?.id ?? characters[0]?.id;
    this.vsAI = true;
    this.active = 'p1';

    this.add('h1', '', this.el, 'Sky Fighter');
    this.sub = this.add('p', 'subtitle', this.el, '');

    this.rosterEl = this.add('div', 'roster', this.el);

    const modeRow = this.add('div', 'btn-row', this.el);
    this.aiBtn = this.button('', 'is-ghost', modeRow, () => {
      this.vsAI = !this.vsAI;
      this.refresh();
    });

    const row = this.add('div', 'btn-row', this.el);
    this.button('Fight', 'is-primary', row, () => {
      this.handlers.onStart?.(this.p1, this.p2, this.vsAI);
    });
    this.button('Controls', '', row, () => this.handlers.onSettings?.());
    if (this.handlers.onGenerate) {
      this.button('Generate', '', row, () => this.handlers.onGenerate?.());
    }

    this.add('p', 'hint', this.el,
      'Tap a fighter to assign it to the highlighted slot.');
    this.add('p', 'hint', this.el,
      'Hold BLOCK with punch or kick for the low version. Block alone crouches ' +
      '(stops lows); block + away stands (stops highs). Guess wrong and it lands clean.');

    this.rebuild();
  }

  /** Rebuild the card list — called when a generated character is registered. */
  rebuild(characters = this.characters) {
    this.characters = characters;
    this.rosterEl.textContent = '';
    this.cards = new Map();

    for (const cfg of characters) {
      const card = this.add('button', 'char-card', this.rosterEl);
      card.type = 'button';

      const swatch = this.add('div', 'swatch', card);
      swatch.style.background = `linear-gradient(90deg, ${cfg.color}, ${cfg.accent})`;

      this.add('div', 'name', card, cfg.name);
      this.add('div', 'tagline', card, cfg.tagline ?? '');

      const stats = this.add('div', 'stats', card);
      stats.innerHTML =
        `<div>HP <b>${cfg.health}</b> · Weight <b>${cfg.weight}</b></div>` +
        `<div>Jab <b>${cfg.moves.punch.startup}f</b> · Kick <b>${cfg.moves.kick.startup}f</b></div>` +
        `<div>${cfg.special?.name ?? 'No special'} <b>${cfg.special?.type ?? ''}</b></div>`;

      if (cfg.generated) this.add('div', 'badge', card, 'generated');

      card.addEventListener('click', () => {
        this[this.active] = cfg.id;
        // Assigning P1 moves focus to P2, so two taps set up a match.
        this.active = this.active === 'p1' ? 'p2' : 'p1';
        this.refresh();
      });

      this.cards.set(cfg.id, card);
    }
    this.refresh();
  }

  refresh() {
    const nameOf = (id) => this.characters.find((c) => c.id === id)?.name ?? '—';
    this.sub.textContent = this.vsAI
      ? `${nameOf(this.p1)}  vs  ${nameOf(this.p2)} (CPU)`
      : `${nameOf(this.p1)}  vs  ${nameOf(this.p2)} (P2)`;

    this.aiBtn.textContent = this.vsAI ? 'Opponent: CPU' : 'Opponent: Player 2';

    for (const [id, card] of this.cards) {
      const selected = (this.active === 'p1' && id === this.p1) ||
                       (this.active === 'p2' && id === this.p2);
      card.classList.toggle('is-selected', selected);
    }
  }
}
