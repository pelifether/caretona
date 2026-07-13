/* Measures per-style render FPS (worst case: headless = CPU/SwiftShader
 * rendering, real GPUs do better), 3D asset load time, and payload sizes.
 * Also runs a full solo round in 3D style to verify the flow end-to-end.
 */
import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://localhost:5199';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 750 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

let bytes3d = 0;
page.on('response', async (r) => {
  const u = r.url();
  if (/facecap|basis|avatar3d|three/.test(u)) {
    try { bytes3d += (await r.body()).length; } catch { /* ignore */ }
  }
});

await page.goto(`${BASE}/?mock=1`);
await page.waitForTimeout(500);

async function fps(label) {
  const v = await page.evaluate(() => new Promise((res) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => {
      n++;
      if (performance.now() - t0 >= 3000) res((n / (performance.now() - t0)) * 1000);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  console.log(`${label}: ${v.toFixed(1)} fps`);
}

await page.evaluate(() => window.__setFacePose('photo', 'neutral'));
await fps('photo idle (roulette)');

const t0 = Date.now();
await page.evaluate(() => window.__setFacePose('3d', 'neutral'));
await page.waitForSelector('#ref-3d:not(.hidden)', { timeout: 30000 });
console.log(`3D load+first-frame: ${Date.now() - t0} ms, downloaded ${(bytes3d / 1024).toFixed(0)} kB`);
await fps('3d    idle');

// Full solo round with the 3D face active
await page.click('#play-btn');
await page.click('#alone-btn');
await page.waitForSelector('#phase-timer:not(.hidden)', { timeout: 20000 });
await fps('3d + camera + tracking (careta phase)');
await page.waitForSelector('#result-menu:not(.hidden)', { timeout: 25000 });
const score = await page.textContent('#score-self .score-num');
const tag = await page.textContent('#score-self .score-tag');
console.log(`solo round in 3D completed: score ${score} ("${tag}")`);
await page.screenshot({ path: 'scripts/shots/6-results-3d.png' });

await browser.close();
console.log('DONE');
