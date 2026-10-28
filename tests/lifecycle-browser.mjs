import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge', headless: true });
const pages = [], contexts = [], snapshots = [], errors = [];
const latest = i => snapshots[i].at(-1);
const id = i => latest(i).you.playerId;
const phase = (page, value) => page.waitForFunction(p => document.querySelector('#phase-label').textContent === p, value);
const accepted = [];
async function deal(host) {
  for (const page of pages) { await page.locator('#ready').click(); await page.getByRole('button', { name: 'Not ready', exact: true }).waitFor(); }
  await pages[host].locator('#start').click();
  for (const page of pages) await phase(page, 'PRIVATE DEAL');
}
async function acknowledge() {
  for (const page of pages) {
    await page.locator('#toggle-seals').click(); await page.locator('#acknowledge').click();
    await page.getByRole('button', { name: 'Seals acknowledged', exact: true }).waitFor();
  }
  for (const page of pages) await phase(page, 'DAY');
}
try {
  await mkdir('test-results', { recursive: true });
  for (let i = 0; i < 6; i++) {
    snapshots.push([]); accepted.push(true);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' }); contexts.push(context);
    const page = await context.newPage(); pages.push(page);
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => accepted[i] ? d.accept() : d.dismiss());
    page.on('websocket', ws => ws.on('framereceived', ({ payload }) => {
      const match = String(payload).match(/^4[23]\d*(\[.*)$/s); if (!match) return;
      const packet = JSON.parse(match[1]); const view = packet[0] === 'state' ? packet[1] : packet[0]?.view;
      if (view?.code) snapshots[i].push(view);
    }));
    await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5173');
    await page.locator('#name').fill(`Returner ${i + 1}`);
    await page.waitForFunction(() => !document.querySelector('#create').disabled);
    if (i === 0) await page.locator('#create').click();
    else { await page.locator('#room-code').fill(latest(0).code); await page.locator('#join').click(); }
    await page.locator('#ready').waitFor();
  }
  const code = latest(0).code; await deal(0); await acknowledge();
  const oldMatch = latest(0).deal.matchId;
  const oldIds = pages.map((_, i) => id(i));
  const oldCards = pages.flatMap((_, i) => latest(i).private.identities.map(c => c.id));
  const human = pages.findIndex((_, i) => !latest(i).private.everWitch);
  const witches = pages.map((_, i) => i).filter(i => latest(i).private.everWitch);
  accepted[human] = false; await pages[human].locator('#leave').click();
  assert.equal(await pages[human].locator('#lobby').isVisible(), true);
  accepted[human] = true; await pages[human].locator('#leave').click();
  await pages[human].locator('#entry').waitFor();
  const observer = pages.findIndex((_, i) => i !== human);
  await pages[observer].waitForFunction(player => document.querySelector(`[data-player="${player}"] .seat-status`).textContent.includes('forfeited'), oldIds[human]);
  assert.equal(latest(observer).phase, 'DAY'); assert.equal(latest(observer).deal.matchId, oldMatch);
  // Departed browser cannot fill a live match's retained seat.
  await pages[human].locator('#room-code').fill(code); await pages[human].locator('#join').click();
  await pages[human].getByRole('status').filter({ hasText: 'has started' }).waitFor();
  const departed = [human, ...witches];
  for (const i of witches) { await pages[i].locator('#leave').click(); await pages[i].locator('#entry').waitFor(); }
  const survivors = pages.map((_, i) => i).filter(i => !departed.includes(i));
  for (const i of survivors) await phase(pages[i], 'GAME OVER');
  const hostId = latest(survivors[0]).hostId; let host = oldIds.indexOf(hostId);
  await pages[host].getByRole('button', { name: 'Open rematch lobby' }).click();
  for (const i of survivors) await pages[i].locator('#ready').waitFor();
  assert.equal(latest(host).players.length, survivors.length);
  assert.ok(latest(host).players.every(p => !p.ready && !p.abandoned));
  for (const i of departed) {
    await pages[i].locator('#name').fill(`Returned ${i + 1}`); await pages[i].locator('#room-code').fill(code); await pages[i].locator('#join').click();
    await pages[i].locator('#ready').waitFor(); assert.notEqual(id(i), oldIds[i]);
  }
  await deal(host);
  const newMatch = latest(host).deal.matchId; assert.notEqual(newMatch, oldMatch);
  for (let i = 0; i < 6; i++) {
    const own = latest(i).private;
    assert.ok(own.identities.every(c => !oldCards.includes(c.id)));
    await pages[i].reload(); await phase(pages[i], 'PRIVATE DEAL');
    assert.deepEqual(latest(i).private, own);
    assert.equal(await pages[i].locator('.private-seal').count(), 0);
  }
  // Refresh moved hosting, but membership and the private deal remain intact.
  host = pages.findIndex((_, i) => id(i) === latest(i).hostId);
  await acknowledge();
  const actor = pages.findIndex((_, i) => id(i) === latest(i).day.activePlayerId);
  const other = pages.findIndex((_, i) => i !== actor);
  const card = latest(actor).hand[0]; await pages[actor].locator(`[data-card="${card.id}"]`).click({ position: { x: 24, y: 22 } });
  await pages[actor].locator('#card-target').selectOption(id(other));
  await pages[actor].locator('#card-target').focus();
  await pages[other].locator('#message').fill('Selection should survive this update.'); await pages[other].locator('#send').click();
  await pages[actor].getByText('Selection should survive this update.', { exact: true }).waitFor();
  assert.equal(await pages[actor].locator('#card-target').inputValue(), id(other));
  assert.equal(await pages[actor].evaluate(() => document.activeElement.id), 'card-target');
  for (const width of [320, 390, 768, 1440]) {
    await pages[actor].setViewportSize({ width, height: 844 });
    assert.equal(await pages[actor].evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const link of await pages[actor].locator('.table-nav a:visible').all()) { const box = await link.boundingBox(); assert.ok(box.height >= 44); }
  }
  await pages[actor].setViewportSize({ width: 390, height: 844 });
  await pages[actor].screenshot({ path: 'test-results/m5-mobile-actions.png', fullPage: true });
  await pages[actor].locator('#actions-link').click();
  assert.ok((await pages[actor].locator('#day-panel').boundingBox()).y >= 50);
  await contexts[other].setOffline(true);
  await pages[other].locator('#recovery-banner').waitFor();
  assert.equal(await pages[other].locator('#private-panel').isHidden(), true);
  assert.equal(await pages[other].locator('[data-card]').count(), 0);
  await contexts[other].setOffline(false); await pages[other].locator('#recovery-banner').waitFor({ state: 'hidden' });
  assert.equal(latest(other).deal.matchId, newMatch);
  assert.equal(await pages[other].locator('#private-panel').isVisible(), true);
  host = pages.findIndex((_, i) => id(i) === latest(i).hostId);
  await pages[host].locator('#reopen').click();
  for (const page of pages) await page.locator('#ready').waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: six Edge clients; cancel/confirm forfeit, continued match, retained departed seats, victory, rematch, replacement admission, six refreshes, new cards, stable selection/focus, offline privacy and mobile navigation.');
} finally { await browser.close(); }
