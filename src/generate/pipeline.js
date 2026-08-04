import { MockModelProvider, MockConfigProvider } from './providers.js';

/**
 * The generation pipeline: prompt in, selectable fighter out.
 *
 *   prompt -> ModelProvider  -> GLB url
 *          -> ConfigProvider -> character JSON
 *          -> CharacterLoader.loadGenerated -> retargeted, registered, playable
 *
 * Swapping in the real services is a two-line change at the call site:
 *
 *   new GenerationPipeline({
 *     loader,
 *     modelProvider:  new TripoModelProvider(),
 *     configProvider: new ClaudeConfigProvider(),
 *   })
 *
 * Everything downstream — retargeting, the animation ladder, character select —
 * is already provider-agnostic.
 */
export class GenerationPipeline {
  constructor({ loader, modelProvider, configProvider } = {}) {
    this.loader = loader;
    this.modelProvider = modelProvider ?? new MockModelProvider();
    this.configProvider = configProvider ?? new MockConfigProvider();
  }

  get isMock() {
    return this.modelProvider.name === 'mock' || this.configProvider.name === 'mock';
  }

  /**
   * @param {string} prompt
   * @param {object} opts { onProgress({stage, progress, status}), signal }
   * @returns {Promise<{config, visual, meta}>}
   */
  async generate(prompt, { onProgress, signal } = {}) {
    if (!prompt?.trim()) throw new Error('Describe the fighter you want.');

    const report = (stage, progress, status) =>
      onProgress?.({ stage, progress, status });

    // --- 1. model
    report('model', 0, 'starting');
    const { modelUrl, meta } = await this.modelProvider.generate(prompt, {
      signal,
      onProgress: ({ progress, status }) => report('model', progress, status),
    });

    // --- 2. config
    report('config', 0, 'authoring stats');
    const config = await this.configProvider.author(prompt, { modelUrl });
    report('config', 1, 'done');

    // --- 3. register. loadGenerated builds the visual immediately, so a rig
    //        that cannot be used surfaces here rather than at character select.
    report('load', 0, 'retargeting animations');
    const { config: registered, visual } = await this.loader.loadGenerated({
      modelUrl,
      config,
    });
    report('load', 1, 'ready');

    return { config: registered, visual, meta: { ...meta, animation: visual.info } };
  }
}
