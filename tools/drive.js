// ============================================================
// tools/drive.js — scripted acceptance drive with telemetry.
//
//   node tools/drive.js <name> "<lng,lat;lng,lat;...>" [heading] [maxSec]
//
// Spawns the car at the FIRST waypoint (shot mode: no traffic, fixed
// camera, invulnerable), then drives it with the real physics — throttle
// via game.keys.forward, steering assisted by pointing car.heading at the
// next waypoint each tick. Telemetry (lng/lat/alt/ground/mph) is sampled
// 4×/s and saved to shots/<name>.json; a screenshot lands mid-drive at
// the most interesting waypoint and at the end.
//
// Verdict: PASS if every waypoint is reached with no fall (alt drop
// >15 m between samples) and no teleport (>80 m jump). Exit 1 otherwise.
// ============================================================

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT_DIR = path.join(__dirname, '..', 'shots');

const name = process.argv[2] || 'drive';
const wpArg = process.argv[3];
const heading = parseFloat(process.argv[4] || 'NaN');
const maxSec = parseFloat(process.argv[5] || '90');
const mphCap = parseFloat(process.argv[6] || '150'); // sane test speed — the
// 100 ms steering tick can't hold a 570 mph car inside a 13 m lane corridor
if (!wpArg) { console.error('usage: node tools/drive.js name "lng,lat;lng,lat;..."'); process.exit(2); }
const waypoints = wpArg.split(';').map((s) => s.split(',').map(Number));

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--window-size=1280,720', '--hide-scrollbars'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    const [slng, slat] = waypoints[0];
    const hd = Number.isFinite(heading) ? heading
      : Math.atan2((waypoints[1][0] - slng) * Math.cos(slat * Math.PI / 180), waypoints[1][1] - slat);
    await page.goto(
      `http://localhost:8080/?shot=1&lng=${slng}&lat=${slat}&alt=2&heading=${hd}&zoom=18.5&pitch=68`,
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction('window.__shotReady === true', { timeout: 90000 });
    await new Promise((r) => setTimeout(r, 1500));

    // Install the autopilot + telemetry inside the page.
    await page.evaluate((wps, maxS, cap) => {
      game.noBlurReset = true;
      window.__drive = { wp: 1, log: [], done: false, fail: null, t0: performance.now() };
      const D = window.__drive;
      const mPerLng = (lat) => 111320 * Math.cos(lat * Math.PI / 180);
      const tick = setInterval(() => {
        const c = game.car;
        const t = (performance.now() - D.t0) / 1000;
        if (t > maxS) { D.fail = 'timeout before final waypoint'; D.done = true; }
        if (D.done) { clearInterval(tick); game.keys.forward = false; return; }
        const [wlng, wlat] = wps[D.wp];
        const dx = (wlng - c.lng) * mPerLng(c.lat);
        const dy = (wlat - c.lat) * 111320;
        const dist = Math.hypot(dx, dy);
        if (dist < 18) {
          D.wp++;
          if (D.wp >= wps.length) { D.done = true; game.keys.forward = false; return; }
        }
        // Assisted steering: aim the car at the waypoint (physics still
        // moves it; ground/deck clamps and collisions all stay real).
        c.heading = Math.atan2(dx, dy);
        game.state.camHeading = c.heading;
        // Throttle only below the speed cap — the 100 ms steering tick
        // can't hold a 570 mph car inside a lane; test at sane speed.
        const mph = Math.hypot(c.vx, c.vy) * 2.237;
        game.keys.forward = mph < cap;
        game.keys.back = mph > cap * 1.15;
      }, 100);
      setInterval(() => {
        if (D.done) return;
        const c = game.car;
        D.log.push({
          t: +((performance.now() - D.t0) / 1000).toFixed(2),
          wp: D.wp,
          lng: +c.lng.toFixed(6), lat: +c.lat.toFixed(6),
          alt: +c.alt.toFixed(1), ground: +c.ground.toFixed(1),
          mph: Math.round(Math.hypot(c.vx, c.vy) * 2.237),
        });
      }, 250);
    }, waypoints, maxSec, mphCap);

    await page.waitForFunction('window.__drive.done === true', { timeout: (maxSec + 20) * 1000 });
    const result = await page.evaluate(() => window.__drive);

    // Analyze the log for falls / teleports / water landings.
    let verdict = result.fail ? 'FAIL: ' + result.fail : 'PASS';
    for (let i = 1; i < result.log.length; i++) {
      const a = result.log[i - 1], b = result.log[i];
      const jump = Math.hypot((b.lng - a.lng) * 88000, (b.lat - a.lat) * 111320);
      if (b.alt - a.alt < -15) verdict = `FAIL: fell ${(a.alt - b.alt).toFixed(0)}m at t=${b.t}s (wp ${b.wp})`;
      if (jump > 80) verdict = `FAIL: teleported ${Math.round(jump)}m at t=${b.t}s`;
      // Skimming the sea (alt≈0 with the seabed below) = fell off a road.
      if (b.alt <= 0.5 && b.ground < -2) verdict = `FAIL: landed on water at t=${b.t}s (wp ${b.wp})`;
    }
    const outJson = path.join(OUT_DIR, name + '.json');
    fs.writeFileSync(outJson, JSON.stringify({ verdict, waypoints, log: result.log }, null, 1));
    await page.screenshot({ path: path.join(OUT_DIR, name + '.png') });
    const last = result.log[result.log.length - 1] || {};
    console.log(JSON.stringify({ verdict, samples: result.log.length,
      reachedWp: result.wp + '/' + waypoints.length, final: last }));
    if (verdict !== 'PASS') process.exitCode = 1;
  } catch (e) {
    console.error('FAIL: ' + e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
