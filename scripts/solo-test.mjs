/* Solo round + face style toggle + BYE FRIEND flow. Saves screenshots to scripts/shots/. */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5199';
mkdirSync('scripts/shots', { recursive: true });
let failures = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 750 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

await page.goto(`${BASE}/?mock=1`);
await page.waitForTimeout(800);
await page.screenshot({ path: 'scripts/shots/1-menu-toon.png' });

// Toggle to human face
await page.click('#style-btn');
await page.waitForTimeout(600);
await page.screenshot({ path: 'scripts/shots/2-menu-human.png' });
ok(await page.evaluate(() => localStorage.getItem('caretona-face-style')) === 'human', 'style persisted');

// Solo round with human face
await page.click('#play-btn');
await page.click('#alone-btn');
await page.waitForTimeout(3900); // countdown done, careta phase, face stretched
await page.screenshot({ path: 'scripts/shots/3-careta-human.png' });

await page.waitForSelector('#result-menu:not(.hidden)', { timeout: 25000 });
await page.screenshot({ path: 'scripts/shots/4-results-solo.png' });

const tag = await page.textContent('#score-self .score-tag');
const score = await page.textContent('#score-self .score-num');
ok(/^\d+$/.test(score), `solo score shown (${score})`);
ok(tag.length > 2, `solo tag shown ("${tag}")`);
ok(await page.$eval('#cam', (v) => v.classList.contains('bubble')), 'live bubble active at results');
ok(await page.isVisible('#invite-btn-2'), 'solo results show INVITE FRIEND');
ok(await page.isHidden('#bye-btn'), 'solo results hide BYE FRIEND');

// Play again resets
await page.click('#again-btn');
await page.waitForTimeout(500);
ok(await page.$eval('#cam', (v) => !v.classList.contains('bubble')), 'bubble removed on new round');
ok(await page.isVisible('#countdown'), 'new round countdown started');

// ---- BYE FRIEND flow (host + guest, guest says bye)
await page.close();
console.log('--- BYE FRIEND ---');
const hostCtx = await browser.newContext();
const hostPage = await hostCtx.newPage();
const guestCtx = await browser.newContext();
const guestPage = await guestCtx.newPage();
await hostPage.goto(`${BASE}/?mock=1`);
await hostPage.click('#play-btn');
await hostPage.click('#invite-btn');
await hostPage.waitForFunction(() => window.__caretonaLink, null, { timeout: 20000 });
const link = await hostPage.evaluate(() => window.__caretonaLink);
await guestPage.goto(link);
await guestPage.click('#play-btn');
await hostPage.waitForSelector('#result-menu:not(.hidden)', { timeout: 40000 });
await guestPage.waitForSelector('#result-menu:not(.hidden)', { timeout: 15000 });
await hostPage.screenshot({ path: 'scripts/shots/5-results-multi.png' });
await guestPage.click('#bye-btn');
await hostPage.waitForSelector('#mp-popup[open]', { timeout: 10000 });
const title = await hostPage.textContent('#mp-popup-title');
ok(/friend left/i.test(title), `host sees friend-left popup ("${title}")`);
ok(await hostPage.isHidden('#pane-friend'), 'host back to single pane');
ok(await hostPage.isVisible('#invite-btn-2'), 'host results back to INVITE FRIEND');
await guestPage.waitForSelector('#pane-friend', { state: 'hidden', timeout: 5000 });
ok(true, 'guest back to single pane');

await browser.close();
console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
