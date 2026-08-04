// Capture a long-sightline shot at a forced speed (proves speed-fog).
//   node tools/fog_shot.js <name> <speed_mps> "<query>"
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://localhost:8082/';
const name = process.argv[2], spd = +process.argv[3] || 0, q = process.argv[4] || '';
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--window-size=1280,720'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 720 });
  await p.goto(BASE + '?shot=1' + (q ? '&' + q : ''), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__shotReady === true', { timeout: 90000 });
  await p.evaluate((s) => { window.__fogSpeed = s; }, spd);
  await new Promise((r) => setTimeout(r, 2500)); // let fog ease to target
  const density = await p.evaluate(() => +game.three.scene.fog.density.toFixed(6));
  await p.screenshot({ path: 'shots/' + name + '.png' });
  console.log(JSON.stringify({ name, forcedSpeed: spd, fogDensity: density }));
  await b.close();
})();
