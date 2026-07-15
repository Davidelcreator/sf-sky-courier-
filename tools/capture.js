// ============================================================
// tools/capture.js — deterministic screenshot of the running game.
//
//   node tools/capture.js [outName] [extraQuery]
//   e.g.  node tools/capture.js before
//         node tools/capture.js goldengate "lng=-122.4770&lat=37.8095&heading=6.0"
//
// Loads http://localhost:8080/?shot=1 in headless Chrome (the game's own
// shot mode pins the car, camera and animation time — see main.js), waits
// until the map reports fully loaded, and saves shots/<name>.png.
// Same inputs → same picture, so two shots are honestly comparable.
//
// This doubles as the "does the game still launch?" check: if the scene
// never becomes ready, this script exits non-zero.
// ============================================================

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:8080/';
const OUT_DIR = path.join(__dirname, '..', 'shots');

const outName = process.argv[2] || 'current';
const extraQuery = process.argv[3] || '';

(async () => {
  if (!fs.existsSync(CHROME)) {
    console.error('Chrome not found at ' + CHROME);
    process.exit(2);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',                       // headless Chrome still does WebGL (SwiftShader)
    args: ['--window-size=1280,720', '--hide-scrollbars'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

    const url = BASE_URL + '?shot=1' + (extraQuery ? '&' + extraQuery : '');
    console.log('loading ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // The game sets window.__shotReady once the style is initialised AND
    // every visible tile has loaded. 90 s budget: tile servers can be slow.
    await page.waitForFunction('window.__shotReady === true', { timeout: 90000 });

    // Small settle so label fade-ins and the last terrain meshes finish.
    await new Promise((r) => setTimeout(r, 2000));

    // Log the actual camera/car state — makes bad framing easy to diagnose.
    const st = await page.evaluate(() => ({
      zoom: +game.map.getZoom().toFixed(2),
      pitch: +game.map.getPitch().toFixed(1),
      bearing: +game.map.getBearing().toFixed(1),
      lng: +game.car.lng.toFixed(5),
      lat: +game.car.lat.toFixed(5),
      alt: +game.car.alt.toFixed(1),
    }));
    console.log('state: ' + JSON.stringify(st));

    const outPath = path.join(OUT_DIR, outName + '.png');
    await page.screenshot({ path: outPath });

    // Blank-canvas guard: a uniform/empty frame compresses to almost
    // nothing. A real city frame at 1280x720 is comfortably > 60 KB.
    const size = fs.statSync(outPath).size;
    if (size < 60 * 1024) {
      console.error(`FAIL: ${outPath} is only ${size} bytes — looks blank.`);
      process.exit(1);
    }
    console.log(`OK: ${outPath} (${Math.round(size / 1024)} KB)`);
  } catch (err) {
    console.error('FAIL: ' + err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
