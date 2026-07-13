/* Visual check: captures the new-record confetti moment and the trophy card. */
import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://localhost:5199';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 750 } });
await page.goto(`${BASE}/?mock=1`);
await page.click('#play-btn');
await page.click('#alone-btn');

await page.waitForSelector('#high-score.pop', { timeout: 30000 });
await page.waitForTimeout(350); // confetti mid-flight
await page.screenshot({ path: 'scripts/shots/10-confetti.png' });

await page.waitForSelector('#result-menu:not(.hidden)', { timeout: 15000 });
await page.waitForTimeout(400);
await page.screenshot({ path: 'scripts/shots/11-results-layout.png' });

await page.click('#high-score');
await page.waitForSelector('#hs-popup[open]', { timeout: 5000 });
await page.screenshot({ path: 'scripts/shots/12-trophy-card.png' });

await browser.close();
console.log('done');
