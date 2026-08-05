/**
 * Packs the whole game into ONE self-contained HTML file, for hosts that
 * forbid external requests (Claude Artifacts, a pasted file:// page, an email
 * attachment). No network, no server, no build step at the far end.
 *
 * Run: npm run build:artifact   ->  dist-artifact/sky-fighter.html
 *
 * The game normally fetches /config, /animations and /models at runtime — that
 * is the whole point of the tuning surface. Rather than rewrite the loaders for
 * this one target, the page ships a tiny virtual filesystem and patches
 * `fetch` to serve those paths from memory. The engine cannot tell the
 * difference, so there is no artifact-only code path to drift from the real one.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'dist-artifact');
const OUT = join(OUT_DIR, 'sky-fighter.html');

const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// --- 1. build a single-chunk bundle -----------------------------------------
console.log('building single-chunk bundle…');
execFileSync('npx', ['vite', 'build'], {
  cwd: ROOT,
  env: { ...process.env, ARTIFACT_BUILD: '1' },
  stdio: 'inherit',
});

const assetDir = join(OUT_DIR, 'assets');
const assets = readdirSync(assetDir);
const jsName = assets.find((f) => f.endsWith('.js'));
const cssName = assets.find((f) => f.endsWith('.css'));
if (!jsName || !cssName) throw new Error('expected one .js and one .css in the build');
if (assets.filter((f) => f.endsWith('.js')).length > 1) {
  throw new Error('build produced more than one JS chunk — inlineDynamicImports did not apply');
}

const js = readFileSync(join(assetDir, jsName), 'utf8');
const css = readFileSync(join(assetDir, cssName), 'utf8');

// --- 2. the virtual filesystem ----------------------------------------------
const roster = JSON.parse(read('config/game.json')).roster;

const textFiles = {
  '/config/game.json': read('config/game.json'),
  '/animations/manifest.json': read('animations/manifest.json'),
};
for (const id of roster) {
  textFiles[`/config/characters/${id}.json`] = read(`config/characters/${id}.json`);
}

// Binary: the rigged humanoid, base64'd once and decoded in the page. Kept as a
// VFS entry rather than a data: URI inside the JSON so it is stored exactly
// once, no matter how many configs reference it.
const glb = readFileSync(join(ROOT, 'public/models/humanoid.glb')).toString('base64');

const totalKB = (s) => (Buffer.byteLength(s) / 1024).toFixed(0);
console.log(`  js ${totalKB(js)} KB · css ${totalKB(css)} KB · glb ${totalKB(glb)} KB (base64)`);

// --- 3. assemble -------------------------------------------------------------
// No <!doctype>/<html>/<head>/<body>: the artifact host supplies that shell.
const page = `<style>
${css}
/* The artifact host's shell wraps this page, so the game's own full-bleed
   layout needs those ancestors to be full height too. Single theme by
   deliberate choice — the game commits to one dark arcade world, and a light
   variant would be a different game, not a re-skin. */
html, body { height: 100%; margin: 0; background: #0b0d17; }
#stage { position: fixed; inset: 0; }
</style>

<div id="stage">
  <canvas id="game-canvas"></canvas>
  <div id="ui-root"></div>
</div>

<script>
(() => {
  // Virtual filesystem. The engine fetches its tuning surface at runtime by
  // design; here those reads are answered from memory instead of the network.
  const TEXT = ${JSON.stringify(textFiles)};
  const GLB_B64 = ${JSON.stringify(glb)};

  let glbBytes = null;
  const decodeGlb = () => {
    if (!glbBytes) {
      const bin = atob(GLB_B64);
      glbBytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) glbBytes[i] = bin.charCodeAt(i);
    }
    // Fresh copy per request: Response takes ownership of the buffer.
    return glbBytes.slice();
  };

  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input, init) => {
    const raw = typeof input === 'string' ? input : (input && input.url) || '';
    let path;
    try {
      path = new URL(raw, document.baseURI).pathname;
    } catch {
      return nativeFetch(input, init);
    }

    if (Object.prototype.hasOwnProperty.call(TEXT, path)) {
      return Promise.resolve(new Response(TEXT[path], {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    }

    if (path.endsWith('/models/humanoid.glb')) {
      return Promise.resolve(new Response(decodeGlb(), {
        status: 200,
        headers: { 'Content-Type': 'model/gltf-binary' },
      }));
    }

    return nativeFetch(input, init);
  };
})();
</script>

<script type="module">
${js}
</script>
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, page);
console.log(`wrote ${OUT} (${totalKB(page)} KB, one file, zero requests)`);
