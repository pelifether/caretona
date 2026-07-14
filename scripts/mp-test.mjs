/* Two-player end-to-end test: host invites, guest joins via link, both play a
 * round over real WebRTC (PeerJS cloud signaling), scores exchange, ready
 * handshake restarts, and disconnect/cancel flows show the right popups.
 *
 * Run: node scripts/mp-test.mjs [baseUrl]
 */
import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://localhost:5199';
let failures = 0;

function ok(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function newPlayer(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 750 } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`[${name} console.error] ${m.text()}`);
  });
  page.on('pageerror', (e) => console.log(`[${name} pageerror] ${e.message}`));
  return { ctx, page };
}

// ---------------------------------------------------------------- main flow
console.log('--- Full 2-player round ---');
const host = await newPlayer('host');
const guest = await newPlayer('guest');

await host.page.goto(`${BASE}/?mock=1`);
await host.page.click('#play-btn');
await host.page.click('#invite-btn');
await host.page.waitForFunction(() => window.__caretonaLink, null, { timeout: 20000 });
const link = await host.page.evaluate(() => window.__caretonaLink);
console.log('invite link:', link);
ok(link.includes('join=caretona-'), 'invite link generated');
ok(await host.page.isVisible('#waiting'), 'host shows waiting spinner');
ok(await host.page.isVisible('#cancel-invite-btn'), 'host shows cancel X');

await guest.page.goto(link);
const joinText = await guest.page.textContent('#play-btn');
ok(joinText.replace(/\s/g, '') === 'JOIN', 'guest sees JOIN button');
await guest.page.click('#play-btn');

// Round runs: ~3.4s countdown + 6s careta + ~4.5s scoring
await host.page.waitForSelector('#phase-timer:not(.hidden)', { timeout: 30000 });
await guest.page.waitForSelector('#phase-timer:not(.hidden)', { timeout: 10000 });
ok(true, 'both players entered careta phase');

await host.page.waitForSelector('#result-menu:not(.hidden)', { timeout: 30000 });
await guest.page.waitForSelector('#result-menu:not(.hidden)', { timeout: 15000 });
ok(true, 'both players reached results');

for (const [who, p] of [['host', host.page], ['guest', guest.page]]) {
  const selfScore = await p.textContent('#score-self .score-num');
  const friendScore = await p.textContent('#score-friend .score-num');
  const tag = await p.textContent('#score-self .score-tag');
  ok(/^\d+$/.test(selfScore), `${who} self score shown (${selfScore})`);
  ok(/^\d+$/.test(friendScore), `${who} friend score shown (${friendScore})`);
  ok(tag.length > 2, `${who} score tag shown ("${tag}")`);
  ok(await p.isVisible('#bye-btn'), `${who} sees BYE FRIEND`);
  ok(await p.isHidden('#invite-btn-2'), `${who} does not see INVITE FRIEND`);
  ok(await p.$eval('#cam', (v) => v.classList.contains('bubble')), `${who} live cam bubble active`);
}

// Cross-check scores match
const hostSelf = await host.page.textContent('#score-self .score-num');
const guestFriend = await guest.page.textContent('#score-friend .score-num');
ok(hostSelf === guestFriend, `scores consistent across peers (${hostSelf} = ${guestFriend})`);

// Winner flash: green on the higher pane, yellow on both when tied
const hostFriend = await host.page.textContent('#score-friend .score-num');
if (hostSelf === hostFriend) {
  ok(
    await host.page.$eval('#pane-self', (p) => p.classList.contains('tie-flash')) &&
    await host.page.$eval('#pane-friend', (p) => p.classList.contains('tie-flash')),
    `tie: both panes flash yellow (${hostSelf} = ${hostFriend})`,
  );
} else {
  const winner = Number(hostSelf) > Number(hostFriend) ? '#pane-self' : '#pane-friend';
  ok(
    await host.page.$eval(winner, (p) => p.classList.contains('win-flash')),
    `winner pane flashes green (${hostSelf} vs ${hostFriend})`,
  );
}

// ---------------------------------------------------------------- ready handshake
// Round 2 is a PHOTO round: host switches style, guest stays on toon and must
// still receive and render the same photo (protocol carries the photo index).
console.log('--- Ready handshake (photo round) ---');
await host.page.evaluate(() => window.__setFacePose('photo', 'neutral'));
await host.page.click('#again-btn');
await guest.page.waitForSelector('#friend-ready-chip:not(.hidden)', { timeout: 8000 });
ok(true, 'guest sees "friend is ready" chip');
ok((await host.page.textContent('#again-btn')).includes('READY'), 'host button shows READY');
await guest.page.click('#again-btn');

await host.page.waitForSelector('#countdown:not(.hidden)', { timeout: 10000 });
await guest.page.waitForSelector('#countdown:not(.hidden)', { timeout: 10000 });
ok(true, 'both players started round 2');

await host.page.waitForSelector('#phase-timer:not(.hidden)', { timeout: 15000 });
await guest.page.waitForSelector('#phase-timer:not(.hidden)', { timeout: 10000 });
ok(await host.page.isHidden('#careta-name'), 'host photo round hides careta name');
ok(await guest.page.isHidden('#careta-name'), 'guest photo round hides careta name');
// Both canvases must show the SAME photo (center pixel comparison)
const [hostPx, guestPx] = await Promise.all([host.page, guest.page].map((p) =>
  p.$eval('#ref-canvas', (c) => {
    const d = c.getContext('2d').getImageData(c.width / 2 | 0, c.height / 2 | 0, 1, 1).data;
    return [d[0], d[1], d[2]].join(',');
  }),
));
ok(hostPx === guestPx, `host and guest show the same photo (px ${hostPx} = ${guestPx})`);

// ---------------------------------------------------------------- disconnect mid-game
console.log('--- Disconnect handling ---');
await guest.ctx.close();
await host.page.waitForSelector('#mp-popup[open]', { timeout: 15000 });
const notice = await host.page.textContent('#mp-popup-title');
ok(/disconnected/i.test(notice), `host notified of disconnect ("${notice}")`);
await host.ctx.close();

// ---------------------------------------------------------------- cancel flow
console.log('--- Cancel invite flow ---');
const host2 = await newPlayer('host2');
await host2.page.goto(`${BASE}/?mock=1`);
await host2.page.click('#play-btn');
await host2.page.click('#invite-btn');
await host2.page.waitForFunction(() => window.__caretonaLink, null, { timeout: 20000 });
const link2 = await host2.page.evaluate(() => window.__caretonaLink);
await host2.page.click('#cancel-invite-btn');
ok(await host2.page.isHidden('#pane-friend'), 'host2 back to single pane after cancel');

const late = await newPlayer('late-guest');
await late.page.goto(link2);
await late.page.click('#play-btn');
await late.page.waitForSelector('#mp-popup[open]', { timeout: 30000 });
const cancelTitle = await late.page.textContent('#mp-popup-title');
ok(/cancelled/i.test(cancelTitle), `late guest sees cancelled popup ("${cancelTitle}")`);

// The cancelled popup offers PLAY ALONE — clicking it starts a solo round
ok(await late.page.isVisible('#mp-alone-btn'), 'cancelled popup offers PLAY ALONE');
await late.page.click('#mp-alone-btn');
await late.page.waitForSelector('#countdown:not(.hidden)', { timeout: 15000 });
ok(true, 'late guest started a solo round from the popup');

await host2.ctx.close();
await late.ctx.close();

// ---------------------------------------------------------------- full game (short: 3 rounds)
console.log('--- Full game flow (3-round test game) ---');
const h3 = await newPlayer('host3');
const g3 = await newPlayer('guest3');
await h3.page.goto(`${BASE}/?mock=1&rounds=3`);
await h3.page.click('#play-btn');
await h3.page.click('#invite-btn');
await h3.page.waitForFunction(() => window.__caretonaLink, null, { timeout: 20000 });
const link3 = await h3.page.evaluate(() => window.__caretonaLink);
ok(link3.includes('rounds=3'), 'invite link carries test rounds override');
await g3.page.goto(link3);
await g3.page.click('#play-btn');

const bothNext = async () => {
  await h3.page.click('#again-btn');
  await g3.page.click('#again-btn');
};

// Round 1 results: NEXT ROUND label, no pile yet
await h3.page.waitForSelector('#result-menu:not(.hidden)', { timeout: 40000 });
await g3.page.waitForSelector('#result-menu:not(.hidden)', { timeout: 15000 });
ok((await h3.page.textContent('#again-btn')).includes('NEXT ROUND'), 'mid-game button says NEXT ROUND');
ok(await h3.page.isHidden('#pile-self'), 'no score pile at round 1 results');
await bothNext();

// Round 2 results: round-1 scores piled above both bubbles
await h3.page.waitForSelector('#countdown:not(.hidden)', { timeout: 15000 });
await h3.page.waitForSelector('#result-menu:not(.hidden)', { timeout: 40000 });
ok(
  (await h3.page.$$eval('#pile-self .chip', (c) => c.length)) === 1 &&
  (await h3.page.$$eval('#pile-friend .chip', (c) => c.length)) === 1,
  'round-1 scores piled above both bubbles at round 2 results',
);
await g3.page.waitForSelector('#result-menu:not(.hidden)', { timeout: 15000 });
await bothNext();

// Round 3 = game end: summary rows + decelerating totals + winner flash + PLAY AGAIN
await h3.page.waitForSelector('#countdown:not(.hidden)', { timeout: 15000 });
await h3.page.waitForSelector('#result-menu:not(.hidden)', { timeout: 60000 });
ok(await h3.page.isVisible('#summary-self'), 'game summary shown on own pane');
ok(await h3.page.isVisible('#summary-friend'), 'game summary shown on friend pane');
const rows = await h3.page.$$eval('#summary-self .sum-row', (r) => r.map((x) => Number(x.lastChild.textContent)));
const total = Number(await h3.page.textContent('#summary-self .sum-total'));
ok(rows.length === 3, `summary lists every round (${rows.join('+')})`);
ok(total === rows.reduce((a, b) => a + b, 0), `total equals the sum (${total})`);
const friendTotal = Number(await h3.page.textContent('#summary-friend .sum-total'));
const flashSel = total === friendTotal
  ? await h3.page.$eval('#pane-self', (p) => p.classList.contains('tie-flash'))
  : await h3.page.$eval(total > friendTotal ? '#pane-self' : '#pane-friend', (p) => p.classList.contains('win-flash'));
ok(flashSel, `game winner pane flashed (${total} vs ${friendTotal})`);
ok((await h3.page.textContent('#again-btn')).includes('PLAY AGAIN'), 'game-end button says PLAY AGAIN');
await h3.page.screenshot({ path: 'scripts/shots/13-game-summary.png' });

// PLAY AGAIN starts a fresh game
await bothNext();
await h3.page.waitForSelector('#countdown:not(.hidden)', { timeout: 15000 });
await g3.page.waitForSelector('#countdown:not(.hidden)', { timeout: 15000 });
ok(await h3.page.isHidden('#summary-self'), 'summary cleared for the new game');
ok(true, 'new game started after PLAY AGAIN');

await h3.ctx.close();
await g3.ctx.close();
await browser.close();

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
