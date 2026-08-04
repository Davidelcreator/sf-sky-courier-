// ============================================================
// tools/roads_audit.js — inspect what the vector tiles actually carry
// for roads near a point (default: the Golden Gate south approach).
//
//   node tools/roads_audit.js [lng] [lat]
//
// Loads the game in shot mode at that point, waits for tiles, then dumps:
//  - which style layers touch bridge/tunnel roads
//  - every distinct property key on 'transportation' features
//  - counts of brunnel/ramp/layer values in the loaded tiles
//  - the individual ways near the point (class/brunnel/ramp/layer + extent)
// ============================================================

const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const lng = process.argv[2] || '-122.4753';
const lat = process.argv[3] || '37.8065';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--window-size=1280,720'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`http://localhost:8080/?shot=1&lng=${lng}&lat=${lat}&alt=60&zoom=16&pitch=40`,
      { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction('window.__shotReady === true', { timeout: 90000 });
    await new Promise((r) => setTimeout(r, 2000));

    const audit = await page.evaluate(([qLng, qLat]) => {
      const m = game.map;
      // 1. style layers referencing bridge/tunnel
      const styleLayers = m.getStyle().layers
        .filter((l) => /bridge|tunnel/i.test(l.id))
        .map((l) => l.id);
      // 2/3. transportation features in loaded tiles
      const feats = m.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation' });
      const keys = new Set(); const brunnel = {}; const ramp = {}; const layer = {};
      for (const f of feats) {
        for (const k of Object.keys(f.properties)) keys.add(k);
        const p = f.properties;
        if (p.brunnel) brunnel[p.brunnel] = (brunnel[p.brunnel] || 0) + 1;
        if (p.ramp !== undefined) ramp[p.ramp] = (ramp[p.ramp] || 0) + 1;
        if (p.layer !== undefined) layer[p.layer] = (layer[p.layer] || 0) + 1;
      }
      // 4. ways near the query point (within ~700 m)
      const mLng = 111320 * Math.cos(qLat * Math.PI / 180);
      const near = [];
      for (const f of feats) {
        if (f.geometry.type !== 'LineString' && f.geometry.type !== 'MultiLineString') continue;
        const cs = f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates.flat();
        let best = Infinity;
        for (const [x, y] of cs) {
          const d = Math.hypot((x - qLng) * mLng, (y - qLat) * 111320);
          if (d < best) best = d;
        }
        if (best < 700) {
          const p = f.properties;
          near.push({
            class: p.class, subclass: p.subclass, brunnel: p.brunnel || null,
            ramp: p.ramp !== undefined ? p.ramp : null,
            layer: p.layer !== undefined ? p.layer : null,
            oneway: p.oneway, pts: cs.length, nearestM: Math.round(best),
          });
        }
      }
      near.sort((a, b) => a.nearestM - b.nearestM);
      return {
        styleLayers,
        totalFeats: feats.length,
        propertyKeys: [...keys].sort(),
        brunnelCounts: brunnel, rampCounts: ramp, layerCounts: layer,
        nearWays: near.slice(0, 40),
      };
    }, [parseFloat(lng), parseFloat(lat)]);

    console.log(JSON.stringify(audit, null, 1));
  } catch (e) {
    console.error('FAIL: ' + e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
