import { CharacterLoader } from './characters/CharacterLoader.js';
import { Bindings } from './input/bindings.js';
import { InputManager } from './input/InputManager.js';
import { Game } from './Game.js';
import { SelectScreen } from './ui/screens/SelectScreen.js';
import { SettingsScreen } from './ui/screens/SettingsScreen.js';
import { GenerateScreen } from './ui/screens/GenerateScreen.js';
import { GenerationPipeline } from './generate/pipeline.js';
import { PHASE as MATCH_PHASE } from './engine/Match.js';

/**
 * Boot. Loads config, builds the game, and manages which screen is showing.
 *
 * Screen flow:
 *   select -> fight -> (match end) -> select
 *   select <-> settings
 *   select <-> generate
 */

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');

function fatal(message, detail) {
  uiRoot.innerHTML =
    `<div class="screen"><h1>Could not start</h1>` +
    `<p class="subtitle">${message}</p>` +
    (detail ? `<div class="diag">${detail}</div>` : '') +
    `</div>`;
  console.error(message, detail);
}

function loadingScreen(text) {
  const el = document.createElement('div');
  el.className = 'screen';
  el.innerHTML = `<h1>Sky Fighter</h1><p class="subtitle">${text}</p>`;
  uiRoot.appendChild(el);
  return el;
}

async function boot() {
  const splash = loadingScreen('Loading…');

  const loader = new CharacterLoader();

  let gameConfig;
  let characters;
  try {
    gameConfig = await loader.loadGameConfig();
    characters = await loader.loadRoster();
  } catch (err) {
    fatal('Configuration failed to load.', err.message);
    return;
  }

  // The shared animation set is optional: without it every character simply
  // uses the procedural poser, which is a complete experience on its own.
  await loader.loadAnimations();

  const bindings = new Bindings();
  const input = new InputManager({ container: uiRoot, bindings, game: gameConfig });

  let game;
  try {
    game = new Game({ canvas, uiRoot, gameConfig, loader, input, characters });
  } catch (err) {
    fatal('WebGL could not start.', err.message);
    return;
  }

  const pipeline = new GenerationPipeline({ loader });

  // --- screens ------------------------------------------------------------

  const screens = {};
  let current = null;

  // Does this device want on-screen controls? True for coarse pointers up
  // front, and for anyone who touches the screen at any point after.
  let touchWanted = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  window.addEventListener('touchstart', () => {
    touchWanted = true;
    input.setTouchEnabled(current === null);
  }, { passive: true, once: true });

  /** `null` means the fight itself; any other name is an overlay screen. */
  function show(name) {
    if (current && screens[current]) screens[current].hide();
    current = name;
    if (name && screens[name]) screens[name].show();

    const inFight = name === null;
    game.setPaused(!inFight);
    // Touch controls belong to the fight, never to the menus.
    input.setTouchEnabled(inFight && touchWanted);
  }

  screens.select = new SelectScreen(uiRoot, characters, {
    onStart: async (p1, p2, vsAI) => {
      show(null);
      try {
        await game.start(p1, p2, vsAI);
      } catch (err) {
        fatal('Could not start the match.', err.message);
      }
    },
    onSettings: () => show('settings'),
    onGenerate: () => show('generate'),
  });

  screens.settings = new SettingsScreen(uiRoot, {
    bindings,
    input,
    onBack: () => show('select'),
    diagnostics: () => ({
      storage: !!bindings.storage,
      clipsLoaded: loader.library.clips.length,
      libraryErrors: loader.library.errors,
      fighters: game.visuals.map((v) => ({
        id: v.info.id,
        kind: v.kind,
        animation: v.info.animation,
        warnings: v.info.warnings,
      })),
    }),
  });

  screens.generate = new GenerateScreen(uiRoot, {
    pipeline,
    onBack: () => show('select'),
    onGenerated: () => {
      characters = gameConfig.roster
        .map((id) => loader.characters.get(id))
        .filter(Boolean);
      game.characters = characters;
      screens.select.rebuild(characters);
    },
  });

  // Pause / menu button on the HUD, and Escape on desktop.
  game.onPauseRequested = () => show('select');
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current === null) show('select');
  });

  // When a match ends, fall back to the select screen after the win banner.
  let endTimer = 0;
  setInterval(() => {
    if (current !== null || !game.match) { endTimer = 0; return; }
    if (game.match.phase === MATCH_PHASE.MATCH_END) {
      if (++endTimer > 12) { endTimer = 0; show('select'); }
    } else {
      endTimer = 0;
    }
  }, 250);

  splash.remove();
  show('select');

  // Handy for tuning from the console.
  window.skyfighter = { game, loader, bindings, input, pipeline, config: gameConfig };
}

boot().catch((err) => fatal('Unexpected startup error.', err?.stack ?? String(err)));
