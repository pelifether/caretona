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
  const ctx = await browser.newContext();
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

// ---------------------------------------------------------------- ready handshake
console.log('--- Ready handshake ---');
await host.page.click('#again-btn');
await guest.page.waitForSelector('#friend-ready-chip:not(.hidden)', { timeout: 8000 });
ok(true, 'guest sees "friend is ready" chip');
ok((await host.page.textContent('#again-btn')).includes('READY'), 'host button shows READY');
await guest.page.click('#again-btn');

await host.page.waitForSelector('#countdown:not(.hidden)', { timeout: 10000 });
await guest.page.waitForSelector('#countdown:not(.hidden)', { timeout: 10000 });
ok(true, 'both players started round 2');

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

await host2.ctx.close();
await late.ctx.close();
await browser.close();

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
