// ============================================================
// tools/fps.js — measure FPS at the standard capture camera.
//
//   node tools/fps.js [extraQuery]
//
// Loads the game in headless Chrome exactly like tools/capture.js
// (?shot=1 → fixed spot/camera), waits for the scene, then counts
// requestAnimationFrame ticks for 5 seconds. Headless windows are never
// throttled by focus, so runs are comparable run-to-run — use the DELTA
// between a baseline run and an after-my-change run. (Whether Chrome
// picked the real GPU or software GL, both runs share the same fate, so
// the comparison stays honest. The absolute number may differ from the
// focused desktop game.)
// ============================================================

const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const extraQuery = process.argv[2] || '';
// Optional second arg: full base URL (e.g. http://localhost:8081/) so a
// baseline build served from another port can be measured back-to-back.
const base = process.argv[3] || 'http://localhost:8080/';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--window-size=1280,720', '--hide-scrollbars'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    const url = base + '?shot=1' + (extraQuery ? '&' + extraQuery : '');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction('window.__shotReady === true', { timeout: 90000 });
    await new Promise((r) => setTimeout(r, 2000)); // let tiles/labels settle

    const gl = await page.evaluate(() => {
      const dbg = game.map.getCanvas().getContext('webgl2')
        || game.map.getCanvas().getContext('webgl');
      const ext = dbg && dbg.getExtension('WEBGL_debug_renderer_info');
      return ext ? dbg.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });

    const fps = await page.evaluate(() => new Promise((resolve) => {
      let n = 0;
      const t0 = performance.now();
      (function cnt() {
        n++;
        const dt = performance.now() - t0;
        if (dt < 5000) requestAnimationFrame(cnt);
        else resolve(+(n / (dt / 1000)).toFixed(1));
      })();
    }));
    console.log(JSON.stringify({ fps, renderer: gl }));
  } catch (err) {
    console.error('FAIL: ' + err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
