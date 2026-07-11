/* Renders both face styles in neutral + a few caretas for visual review. */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

mkdirSync('scripts/shots', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 380 } });
await page.goto('http://localhost:5199/?mock=1');
await page.waitForTimeout(500);

const poses = ['neutral', 'The Scream', 'Stink Detector', 'The Kiss', 'Mega Grin'];
for (const style of ['toon', 'human']) {
  for (const pose of poses) {
    await page.evaluate(([s, p]) => window.__setFacePose(s, p), [style, pose]);
    await page.waitForTimeout(350);
    const el = await page.$('#top-half');
    await el.screenshot({ path: `scripts/shots/face-${style}-${pose.replace(/\s/g, '')}.png` });
  }
}
await browser.close();
console.log('done');
