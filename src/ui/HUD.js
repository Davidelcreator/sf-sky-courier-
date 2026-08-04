import { PHASE as MATCH_PHASE } from '../engine/Match.js';

/**
 * The fight HUD. Pure DOM over the canvas — nothing here touches three.js.
 *
 * Written to be cheap to update: every element is created once and only the
 * handful of values that actually changed are written each frame. Setting
 * textContent or a transform on an unchanged value still costs style
 * recalculation, and this runs at 60fps on phones.
 */

const el = (tag, cls, parent) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  parent?.appendChild(n);
  return n;
};

export class HUD {
  constructor(root, { onPause } = {}) {
    this.root = el('div', 'hud-layer', root);
    this.root.style.cssText = 'position:absolute;inset:0;pointer-events:none;';

    const hud = el('div', 'hud', this.root);

    this.sides = [0, 1].map((i) => {
      const side = el('div', `hud-side${i === 1 ? ' is-right' : ''}`, hud);
      const name = el('div', 'hud-name', side);
      const health = el('div', 'health', side);
      const chip = el('div', 'health-chip', health);
      const fill = el('div', 'health-fill', health);
      const meter = el('div', 'meter', side);
      const meterFill = el('div', 'meter-fill', meter);
      const meterLabel = el('div', 'meter-label', side);
      return {
        side, name, health, chip, fill, meter, meterFill, meterLabel,
        _hp: -1, _chip: 1, _cd: -1, _ready: null, _name: '',
      };
    });

    // Insert the centre column between the two sides.
    const centre = el('div', 'hud-centre');
    hud.insertBefore(centre, this.sides[1].side);
    this.timer = el('div', 'timer', centre);
    const pips = el('div', 'pips', centre);
    this.pipGroups = [0, 1].map(() => el('div', 'pip-group', pips));
    this._pips = [[], []];
    this._timerValue = -1;
    this._urgent = null;

    this.combos = [
      el('div', 'combo is-left', this.root),
      el('div', 'combo is-right', this.root),
    ];
    this._comboCount = [0, 0];

    this.banner = el('div', 'banner', this.root);
    this.banner.hidden = true;
    this.bannerText = el('div', 'banner-text', this.banner);
    this.bannerSub = el('div', 'banner-sub', this.banner);
    this._bannerKey = null;

    if (onPause) {
      this.pauseBtn = el('button', 'pause-btn interactive', this.root);
      this.pauseBtn.type = 'button';
      this.pauseBtn.textContent = 'MENU';
      this.pauseBtn.addEventListener('click', onPause);
    }
  }

  /** Build the round pips once we know how many rounds win the match. */
  setup(fighters, match) {
    fighters.forEach((f, i) => {
      const s = this.sides[i];
      s.name.textContent = f.cfg.name;
      s._name = f.cfg.name;
      s.meterLabel.textContent = f.cfg.special?.name ?? '';
      s.fill.style.background = '';
    });

    this._pips = [0, 1].map((i) => {
      this.pipGroups[i].textContent = '';
      return Array.from({ length: match.roundsToWin }, () =>
        el('div', 'pip', this.pipGroups[i]));
    });
  }

  update(fighters, match) {
    fighters.forEach((f, i) => {
      const s = this.sides[i];

      // --- health, with a delayed chip bar behind it
      const hp = f.health / f.maxHealth;
      if (hp !== s._hp) {
        s.fill.style.transform = `scaleX(${hp})`;
        s.health.classList.toggle('is-low', hp <= 0.25);
        s._hp = hp;
      }
      // The chip bar trails the live bar on the way DOWN — its CSS transition
      // has a delay, so the red shows through for a moment after each hit, and
      // that lag is the whole effect. On the way up (a round reset) it must
      // snap, so the transition is suppressed for that one write.
      if (hp !== s._chip) {
        if (hp > s._chip) {
          s.chip.style.transition = 'none';
          s.chip.style.transform = `scaleX(${hp})`;
          void s.chip.offsetWidth;      // flush, so the next write animates
          s.chip.style.transition = '';
        } else {
          s.chip.style.transform = `scaleX(${hp})`;
        }
        s._chip = hp;
      }

      // --- special cooldown
      const cd = f.cfg.special
        ? 1 - (f.specialCooldown / f.cfg.special.cooldown)
        : 0;
      if (cd !== s._cd) {
        s.meterFill.style.transform = `scaleX(${Math.max(0, Math.min(1, cd))})`;
        s._cd = cd;
      }
      const ready = f.specialCooldown === 0;
      if (ready !== s._ready) {
        s.meter.classList.toggle('is-ready', ready);
        s.meterLabel.classList.toggle('is-ready', ready);
        s._ready = ready;
      }

      // --- combo counter
      const c = f.comboCount;
      if (c !== this._comboCount[i]) {
        const node = this.combos[i];
        if (c >= 2) {
          node.innerHTML = `${c}<small>HITS</small>`;
          node.classList.remove('is-live');
          // Restart the pop animation.
          void node.offsetWidth;
          node.classList.add('is-live');
        } else {
          node.classList.remove('is-live');
        }
        this._comboCount[i] = c;
      }
    });

    // --- timer
    const t = match.timeSeconds;
    if (t !== this._timerValue) {
      this.timer.textContent = String(t).padStart(2, '0');
      this._timerValue = t;
    }
    const urgent = t <= 10;
    if (urgent !== this._urgent) {
      this.timer.classList.toggle('is-urgent', urgent);
      this._urgent = urgent;
    }

    // --- round pips
    for (let i = 0; i < 2; i++) {
      this._pips[i].forEach((pip, n) => {
        pip.classList.toggle('is-won', n < match.wins[i]);
      });
    }

    // --- banner
    const b = match.banner;
    const key = b ? `${b.kind}:${b.text}:${b.sub ?? ''}` : null;
    if (key !== this._bannerKey) {
      if (b) {
        this.banner.hidden = false;
        this.banner.dataset.kind = b.kind ?? '';
        this.bannerText.textContent = b.text;
        this.bannerSub.textContent = b.sub ?? '';
        this.bannerSub.hidden = !b.sub;
        // Re-run the entry animation.
        this.bannerText.style.animation = 'none';
        void this.bannerText.offsetWidth;
        this.bannerText.style.animation = '';
      } else {
        this.banner.hidden = true;
      }
      this._bannerKey = key;
    }

    if (this.pauseBtn) {
      this.pauseBtn.hidden = match.phase === MATCH_PHASE.MATCH_END;
    }
  }

  setVisible(on) { this.root.hidden = !on; }

  dispose() { this.root.remove(); }
}
