// Normal-mode boot + turbo button toggle + touch layout screenshot (:8082).
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://localhost:8082/';
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--window-size=1280,720'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 720 });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('typeof game !== "undefined" && game.map.loaded()', { timeout: 90000 });
  await p.keyboard.press('Enter');
  await p.evaluate(() => document.body.classList.add('touch')); // reveal touch UI
  await new Promise((r) => setTimeout(r, 800));
  // Tap the TURBO button.
  const before = await p.evaluate(() => ({ latched: game.state && undefined, active: document.getElementById('btn-turbo').classList.contains('active') }));
  await p.evaluate(() => document.getElementById('btn-turbo').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await new Promise((r) => setTimeout(r, 200));
  const afterOn = await p.evaluate(() => document.getElementById('btn-turbo').classList.contains('active'));
  await p.evaluate(() => document.getElementById('btn-turbo').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await new Promise((r) => setTimeout(r, 200));
  const afterOff = await p.evaluate(() => document.getElementById('btn-turbo').classList.contains('active'));
  // Leave it ON for the screenshot so the glow shows.
  await p.evaluate(() => document.getElementById('btn-turbo').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await new Promise((r) => setTimeout(r, 300));
  await p.screenshot({ path: 'shots/turbo_layout.png' });
  console.log(JSON.stringify({ errors, turboBtnActivatesOnTap: afterOn, deactivatesOnSecondTap: afterOff }));
  await b.close();
  process.exit(errors.length ? 1 : 0);
})();
