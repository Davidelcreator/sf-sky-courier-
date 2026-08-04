import { defineConfig } from 'vite';
import { cp, mkdir } from 'node:fs/promises';
import { existsSync, createReadStream, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';

// The brief calls for /config and /animations to live at the REPO ROOT, not
// inside /public — they are authoring surfaces, not build inputs. Vite only
// supports a single publicDir, so this plugin does two things:
//   dev   — serve GET /config/* and /animations/* straight off disk
//   build — copy both trees into dist/ verbatim
// The upshot: tuning a character is a JSON edit plus a page reload. No rebuild,
// no engine change, and the same URLs work in dev and in production.
const ROOT_STATIC_DIRS = ['config', 'animations'];

const MIME = {
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.fbx': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.md': 'text/markdown; charset=utf-8',
};

function rootStaticDirs() {
  return {
    name: 'root-static-dirs',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];
        const dir = ROOT_STATIC_DIRS.find((d) => url.startsWith(`/${d}/`));
        if (!dir) return next();

        // normalize() collapses any ../ before we touch the filesystem, and the
        // prefix check below rejects anything that escaped the served folder.
        const base = join(process.cwd(), dir);
        const file = normalize(join(process.cwd(), decodeURIComponent(url)));
        if (!file.startsWith(base) || !existsSync(file) || !statSync(file).isFile()) {
          return next();
        }

        res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(file).pipe(res);
      });
    },

    async closeBundle() {
      for (const dir of ROOT_STATIC_DIRS) {
        const from = join(process.cwd(), dir);
        if (!existsSync(from)) continue;
        const to = join(process.cwd(), 'dist', dir);
        await mkdir(to, { recursive: true });
        await cp(from, to, { recursive: true });
      }
    },
  };
}

// `base: './'` keeps every asset URL relative, so the build works whether
// Netlify serves it from the domain root or a deploy-preview subpath.
export default defineConfig({
  base: './',
  plugins: [rootStaticDirs()],
  server: {
    host: true, // listen on the LAN so you can open it on a phone
    port: 5173,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    assetsInlineLimit: 0, // never inline .glb — keep models as real files
  },
  publicDir: 'public',
});
