import { STATE } from './Fighter.js';

/**
 * Match flow: best-of-N rounds, the round clock, and the banner state machine.
 *
 * The match owns *when* fighters may act. During INTRO and ROUND_END the
 * fighters are still ticked (so they fall, settle, and finish knockdowns) but
 * their input is zeroed, which is what makes "ROUND 1 / FIGHT!" feel like a
 * real gate rather than a label drawn over a live game.
 */

export const PHASE = {
  INTRO: 'intro',
  FIGHT: 'fight',
  ROUND_END: 'roundEnd',
  MATCH_END: 'matchEnd',
};

const NEUTRAL = Object.freeze({
  moveX: 0, jump: false, block: false, punch: false, kick: false, special: false,
});

export class Match {
  constructor(game, fighters) {
    this.game = game;
    this.fighters = fighters; // [p1, p2]
    this.roundsToWin = game.match.roundsToWin;
    this.roundFrames = Math.round(game.match.roundTimeSeconds * game.timestep.hz);

    this.wins = [0, 0];
    this.round = 0;
    this.banner = null;      // { text, sub, kind }
    this.phase = PHASE.INTRO;
    this.phaseFrame = 0;
    this.timer = this.roundFrames;
    this.winner = -1;        // -1 none, 0/1 fighter index, 2 draw
    this.matchWinner = -1;

    this.startRound();
  }

  get timeSeconds() {
    return Math.max(0, Math.ceil(this.timer / this.game.timestep.hz));
  }

  /** Are fighters allowed to act this frame? */
  get inputEnabled() { return this.phase === PHASE.FIGHT; }

  startRound() {
    this.round++;
    this.timer = this.roundFrames;
    this.phase = PHASE.INTRO;
    this.phaseFrame = 0;
    this.winner = -1;

    const half = this.game.stage.halfWidth;
    const spawn = Math.min(2.6, half * 0.38);
    this.fighters[0].reset(-spawn, 1);
    this.fighters[1].reset(spawn, -1);

    this.banner = { text: `ROUND ${this.round}`, kind: 'round' };
  }

  /**
   * Advance the match clock and phase. Returns the intents the fighters should
   * actually receive this frame — neutral unless the round is live.
   *
   * @param {object[]} intents raw per-fighter intents from the input layer
   */
  tick(intents, ctx) {
    this.phaseFrame++;
    const m = this.game.match;

    switch (this.phase) {
      case PHASE.INTRO: {
        // Show "ROUND n" for the first half, "FIGHT!" for the second.
        if (this.phaseFrame === Math.floor(m.introFrames * 0.6)) {
          this.banner = { text: 'FIGHT!', kind: 'fight' };
        }
        if (this.phaseFrame >= m.introFrames) {
          this.phase = PHASE.FIGHT;
          this.phaseFrame = 0;
          this.banner = null;
          ctx.events.push({ type: 'roundStart', round: this.round });
        }
        return [NEUTRAL, NEUTRAL];
      }

      case PHASE.FIGHT: {
        if (this.timer > 0) this.timer--;

        const koIndex = this.fighters.findIndex((f) => f.state === STATE.KO);
        if (koIndex >= 0) {
          this._endRound(koIndex === 0 ? 1 : 0, 'K.O.');
        } else if (this.timer <= 0) {
          const r0 = this.fighters[0].health / this.fighters[0].maxHealth;
          const r1 = this.fighters[1].health / this.fighters[1].maxHealth;
          if (Math.abs(r0 - r1) < 1e-6) this._endRound(2, 'DRAW');
          else this._endRound(r0 > r1 ? 0 : 1, 'TIME');
        }
        return intents;
      }

      case PHASE.ROUND_END: {
        const hold = this.winner === 2 ? m.roundEndFrames
                   : m.koFreezeFrames + m.roundEndFrames;
        if (this.phaseFrame >= hold) {
          if (this.matchWinner >= 0) {
            this.phase = PHASE.MATCH_END;
            this.phaseFrame = 0;
            const name = this.fighters[this.matchWinner].cfg.name;
            this.banner = { text: `${name.toUpperCase()} WINS`, kind: 'win' };
            ctx.events.push({ type: 'matchEnd', winner: this.matchWinner });
          } else {
            this.startRound();
          }
        }
        return [NEUTRAL, NEUTRAL];
      }

      default:
        return [NEUTRAL, NEUTRAL];
    }
  }

  _endRound(winner, label) {
    this.winner = winner;
    this.phase = PHASE.ROUND_END;
    this.phaseFrame = 0;

    if (winner === 0 || winner === 1) {
      this.wins[winner]++;
      if (this.wins[winner] >= this.roundsToWin) this.matchWinner = winner;
    }
    this.banner = {
      text: label,
      sub: winner === 2 ? null : `${this.fighters[winner].cfg.name} wins the round`,
      kind: label === 'K.O.' ? 'ko' : label === 'DRAW' ? 'draw' : 'time',
    };
  }

  /** Restart the whole match (rematch button). */
  restart() {
    this.wins = [0, 0];
    this.round = 0;
    this.matchWinner = -1;
    this.startRound();
  }
}
