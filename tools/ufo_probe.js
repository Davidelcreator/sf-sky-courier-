// Probe UFO vertical control (fly joystick) + turbo top speed on :8082.
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://localhost:8082/';
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--window-size=1280,720'] });
  const p = await b.newPage();
  await p.goto(BASE + '?shot=1&lng=-122.39&lat=37.82&alt=120', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__shotReady === true', { timeout: 90000 });
  await new Promise((r) => setTimeout(r, 800));
  const out = await p.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // Switch to UFO via the real V key so phys updates (2 presses: car→scooter→UFO).
    for (let k = 0; k < 2; k++) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' }));
    await sleep(50);
    const ufoMax = game.phys.MAX_SPEED;
    game.car.alt = 120; game.car.vAlt = 0;
    const startAlt = game.car.alt;
    // Push UP on the fly stick.
    game.joystickFly.y = 1;
    await sleep(2000);
    const upAlt = game.car.alt;
    // Push DOWN.
    game.joystickFly.y = -1;
    await sleep(2000);
    const downAlt = game.car.alt;
    game.joystickFly.y = 0;
    // Turbo top-speed test: full throttle straight, sample max mph with and without turbo.
    game.car.vx = 0; game.car.vy = 0; game.car.alt = 300; game.car.vAlt = 0;
    game.car.heading = 0; game.state.camHeading = 0;
    game.joystick.y = 1; // forward
    let maxNoTurbo = 0;
    for (let i = 0; i < 30; i++) { await sleep(100); maxNoTurbo = Math.max(maxNoTurbo, Math.hypot(game.car.vx, game.car.vy)); }
    game.keys.turbo = true;
    let maxTurbo = 0;
    for (let i = 0; i < 40; i++) { await sleep(100); maxTurbo = Math.max(maxTurbo, Math.hypot(game.car.vx, game.car.vy)); }
    game.keys.turbo = false; game.joystick.y = 0;
    return {
      vehicle: game.state.vehicle, ufoMaxSpeed: ufoMax,
      startAlt: +startAlt.toFixed(1),
      afterUp: +upAlt.toFixed(1),
      afterDown: +downAlt.toFixed(1),
      mphNoTurbo: Math.round(maxNoTurbo * 2.237),
      mphTurbo: Math.round(maxTurbo * 2.237),
    };
  });
  console.log(JSON.stringify(out));
  await b.close();
})();
