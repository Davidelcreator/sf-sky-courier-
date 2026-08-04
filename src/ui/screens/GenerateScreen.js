import { Screen } from './Screen.js';

/**
 * The /generate flow: describe a fighter, get a playable one.
 *
 * Currently backed by mock providers (see src/generate/providers.js) that
 * return the bundled rigged humanoid and derive stats from the prompt's own
 * words. The UI does not know or care — it talks to GenerationPipeline, so
 * wiring the real Tripo + Claude calls changes nothing here.
 */
export class GenerateScreen extends Screen {
  constructor(root, { pipeline, onBack, onGenerated }) {
    super(root, 'generate-screen');
    this.pipeline = pipeline;
    this.onGenerated = onGenerated;
    this.busy = false;
    this.controller = null;

    this.add('h1', '', this.el, 'Generate a fighter');
    this.add('p', 'subtitle', this.el,
      pipeline.isMock
        ? 'Running on the stub pipeline — returns the bundled test rig with prompt-derived stats.'
        : 'Live pipeline.');

    const body = this.add('div', 'screen-body', this.el);

    this.input = this.add('input', 'interactive', body);
    this.input.type = 'text';
    this.input.placeholder = 'a heavy stone golem with a shoulder charge';
    this.input.style.cssText =
      'width:100%;padding:13px 15px;border-radius:10px;font:inherit;' +
      'background:rgba(255,255,255,.07);border:1px solid var(--edge);color:var(--text);';
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // typing must never reach the fight input layer
      if (e.key === 'Enter') this.run();
    });

    const examples = this.add('p', 'hint', body,
      'Try: "nimble neon ninja with a fast projectile" · "iron titan that charges"');
    examples.style.textAlign = 'left';

    const row = this.add('div', 'btn-row', this.el);
    this.goBtn = this.button('Generate', 'is-primary', row, () => this.run());
    this.button('Back', '', row, () => { this.cancel(); onBack?.(); });

    this.status = this.add('div', 'diag', this.el);
    this.status.hidden = true;
  }

  onShow() {
    this.status.hidden = true;
    setTimeout(() => this.input.focus(), 40);
  }

  onHide() { this.cancel(); }

  cancel() {
    this.controller?.abort();
    this.controller = null;
    this.busy = false;
    this.goBtn.disabled = false;
    this.goBtn.textContent = 'Generate';
  }

  log(lines) {
    this.status.hidden = false;
    this.status.innerHTML = lines.join('\n');
  }

  async run() {
    if (this.busy) return;
    const prompt = this.input.value.trim();
    if (!prompt) { this.log(['<span class="warn">Describe the fighter first.</span>']); return; }

    this.busy = true;
    this.goBtn.disabled = true;
    this.goBtn.textContent = 'Working…';
    this.controller = new AbortController();

    const lines = [];
    const bar = (p) => {
      const n = Math.round(p * 22);
      return `[${'#'.repeat(n)}${'.'.repeat(22 - n)}] ${Math.round(p * 100)}%`;
    };

    try {
      const { config, meta } = await this.pipeline.generate(prompt, {
        signal: this.controller.signal,
        onProgress: ({ stage, progress, status }) => {
          const line = `${stage.padEnd(7)} ${bar(progress)}  ${status}`;
          // Replace the last line for the same stage rather than spamming.
          if (lines.length && lines[lines.length - 1].startsWith(stage.padEnd(7))) {
            lines[lines.length - 1] = line;
          } else {
            lines.push(line);
          }
          this.log(lines);
        },
      });

      lines.push('');
      lines.push(`<b>${config.name}</b>  (${config.id})`);
      lines.push(`  ${config.tagline}`);
      lines.push(`  health ${config.health} · weight ${config.weight} · speed ${config.speed}`);
      lines.push(`  jab ${config.moves.punch.startup}f startup / ${config.moves.punch.recovery}f recovery`);
      lines.push(`  special ${config.special.name} (${config.special.type})`);
      lines.push(`  animation: ${meta.animation?.animation ?? 'unknown'}`);
      for (const w of meta.animation?.warnings ?? []) lines.push(`  <span class="warn">${w}</span>`);
      lines.push('');
      lines.push('<b>Added to the roster — it is on the select screen now.</b>');
      this.log(lines);

      this.onGenerated?.(config);
    } catch (err) {
      if (err.name !== 'AbortError') {
        lines.push(`<span class="warn">failed: ${err.message}</span>`);
        this.log(lines);
      }
    } finally {
      this.busy = false;
      this.goBtn.disabled = false;
      this.goBtn.textContent = 'Generate';
      this.controller = null;
    }
  }
}
