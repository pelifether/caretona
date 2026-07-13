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
await page.screenshot({ path: 'scripts/shots/1-menu-3d.png' });

// Style toggle now cycles 3d <-> photo only
await page.click('#style-btn');
await page.waitForFunction(() => localStorage.getItem('caretona-face-style') === 'photo', null, { timeout: 15000 });
ok(true, 'toggle 3d -> photo persisted');
await page.click('#style-btn');
await page.waitForFunction(() => localStorage.getItem('caretona-face-style') === '3d', null, { timeout: 20000 });
ok(true, 'toggle photo -> 3d persisted');
await page.screenshot({ path: 'scripts/shots/2-menu-3d.png' });

// Solo round with the 3D face
await page.click('#play-btn');
await page.click('#alone-btn');
await page.waitForTimeout(3900); // countdown done, careta phase, face stretched
await page.screenshot({ path: 'scripts/shots/3-careta-3d.png' });

await page.waitForSelector('#result-menu:not(.hidden)', { timeout: 25000 });
await page.screenshot({ path: 'scripts/shots/4-results-solo.png' });

const tag = await page.textContent('#score-self .score-tag');
const score = await page.textContent('#score-self .score-num');
ok(/^\d+$/.test(score), `solo score shown (${score})`);
ok(tag.length > 2, `solo tag shown ("${tag}")`);
ok(await page.$eval('#cam', (v) => v.classList.contains('bubble')), 'live bubble active at results');
ok(await page.isVisible('#invite-btn-2'), 'solo results show INVITE FRIEND');
ok(await page.isHidden('#bye-btn'), 'solo results hide BYE FRIEND');

// The frozen flash-frame must actually contain the player image (regression:
// canvas was sized while display:none and stayed blank/black).
const freezePixels = await page.$eval('#freeze-self', (c) => {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && (d[i] > 8 || d[i + 1] > 8 || d[i + 2] > 8)) n++;
  return { total: c.width * c.height, lit: n };
});
ok(freezePixels.lit > freezePixels.total * 0.5, `frozen frame has real image content (${freezePixels.lit}/${freezePixels.total} lit px)`);

// Scan mesh must be fully gone at results (no residual dots/lines)
ok(await page.isHidden('#mesh-self'), 'player scan mesh hidden at results');
const refMeshLit = await page.$eval('#ref-mesh', (c) => {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
  return n;
});
ok(refMeshLit === 0, `reference scan mesh cleared (${refMeshLit} lit px)`);

// High score: first round in a fresh profile, so record === score
ok(await page.isVisible('#high-score'), 'high score shown at results');
const hs = await page.textContent('#high-score .hs-num');
ok(hs === score, `high score equals first score (${hs})`);

// Play again resets
await page.click('#again-btn');
await page.waitForTimeout(500);
ok(await page.$eval('#cam', (v) => !v.classList.contains('bubble')), 'bubble removed on new round');
ok(await page.isVisible('#countdown'), 'new round countdown started');

// ---- Photo mode ("real faces") round
console.log('--- Photo mode ---');
await page.waitForSelector('#result-menu:not(.hidden)', { timeout: 25000 }); // let round 2 finish
await page.evaluate(() => window.__setFacePose('photo', 'neutral'));
await page.waitForTimeout(700);
const idx1 = await page.evaluate(() => new Promise((res) => {
  // Sample the canvas twice to confirm the roulette is cycling
  const c = document.getElementById('ref-canvas');
  const snap = () => c.getContext('2d').getImageData(c.width / 2 | 0, c.height / 2 | 0, 1, 1).data.join(',');
  const a = snap();
  setTimeout(() => res([a, snap()]), 400);
}));
ok(idx1[0] !== idx1[1], 'idle roulette is cycling photos');
await page.screenshot({ path: 'scripts/shots/7-photo-menu.png' });

await page.click('#again-btn');
await page.waitForSelector('#phase-timer:not(.hidden)', { timeout: 20000 });
ok(await page.isHidden('#careta-name'), 'photo round shows no careta name');
await page.screenshot({ path: 'scripts/shots/8-photo-careta.png' });
const settled = await page.evaluate(() => new Promise((res) => {
  const c = document.getElementById('ref-canvas');
  const snap = () => c.getContext('2d').getImageData(c.width / 2 | 0, c.height / 2 | 0, 1, 1).data.join(',');
  const a = snap();
  setTimeout(() => res([a, snap()]), 500);
}));
ok(settled[0] === settled[1], 'photo locked (no cycling) during careta phase');

await page.waitForSelector('#result-menu:not(.hidden)', { timeout: 25000 });
const pScore = await page.textContent('#score-self .score-num');
const pTag = await page.textContent('#score-self .score-tag');
ok(/^\d+$/.test(pScore), `photo round score shown (${pScore}, "${pTag}")`);
await page.screenshot({ path: 'scripts/shots/9-photo-results.png' });

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
