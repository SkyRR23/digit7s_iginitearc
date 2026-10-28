// Real six-browser QA driver. Uses production random dealing and actual 45s night deadlines.
// No bot runtime, debug network endpoint, or browser clock override.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge', headless: true });
const baseURL = process.env.TEST_URL ?? 'http://127.0.0.1:5173';
const pages = [], snapshots = [], errors = [];
const latest = i => snapshots[i].at(-1);
const id = i => latest(i).you.playerId;
const phase = async (page, expected, timeout = 10_000) => page.waitForFunction(value => document.querySelector('#day-panel').dataset.phase === value, expected, { timeout });
async function drawUntilNight() {
  for (let count = 0; count < 20; count++) {
    const view = latest(0); if (view.phase === 'NIGHT') break;
    assert.equal(view.phase, 'DAY');
    const actor = pages.findIndex((_, i) => id(i) === view.day.activePlayerId);
    const version = view.day.version;
    await pages[actor].locator('#draw-cards').click();
    for (const page of pages) await page.waitForFunction(v => Number(document.querySelector('#day-panel').dataset.gameVersion) > v, version);
  }
  for (const page of pages) await phase(page, 'NIGHT');
}
async function seal(i, ability, target) {
  await pages[i].locator(`#night-${ability}`).selectOption(target ?? '');
  await pages[i].locator(`[data-night="${ability}"] button`).click();
  await pages[i].locator(`[data-sealed="${ability}"]`).waitFor();
}
try {
  await mkdir('test-results', { recursive: true });
  for (let i = 0; i < 6; i++) {
    snapshots.push([]);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
    const page = await context.newPage(); pages.push(page);
    page.on('dialog', dialog => dialog.accept());
    page.on('pageerror', e => errors.push(e.message));
    page.on('websocket', ws => ws.on('framereceived', ({ payload }) => {
      const match = String(payload).match(/^4[23]\d*(\[.*)$/s); if (!match) return;
      const packet = JSON.parse(match[1]); const view = packet[0] === 'state' ? packet[1] : packet[0]?.view;
      if (view?.code) snapshots[i].push(view);
    }));
    await page.goto(baseURL);
    await page.locator('#name').fill(`Night tester ${i + 1}`);
    await page.waitForFunction(() => !document.querySelector('#create').disabled);
    if (i === 0) await page.locator('#create').click();
    else {
      await page.locator('#room-code').fill(latest(0).code);
      await page.locator('#join').click();
    }
    await page.locator('#ready').waitFor();
  }
  for (const page of pages) { await page.locator('#ready').click(); await page.getByRole('button', { name: 'Not ready', exact: true }).waitFor(); }
  await pages[0].locator('#start').click();
  for (const page of pages) {
    await page.locator('#toggle-seals').click(); await page.locator('#acknowledge').click();
    await page.getByRole('button', { name: 'Seals acknowledged', exact: true }).waitFor();
  }
  for (const page of pages) await phase(page, 'DAY');
  const witches = pages.map((_, i) => i).filter(i => latest(i).private.everWitch);
  const keeper = pages.findIndex((_, i) => latest(i).private.constableAbility);
  const target = pages.findIndex((_, i) => !latest(i).private.everWitch && i !== keeper);
  const targetId = id(target);
  await drawUntilNight();
  for (const [i, page] of pages.entries()) {
    assert.equal(await page.locator('#send').isDisabled(), true);
    assert.equal(await page.locator('#night-panel').isVisible(), witches.includes(i) || i === keeper);
    if (i === keeper) assert.equal(await page.locator(`#night-protection option[value="${id(i)}"]`).count(), 0);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await pages[keeper].screenshot({ path: 'test-results/night-mobile.png', fullPage: true });
  // An unrelated player's refresh broadcasts roster changes; unsealed drafts survive.
  await pages[keeper].locator('#night-protection').selectOption(targetId);
  const peer = pages.findIndex((_, i) => i !== keeper);
  await pages[peer].reload(); await phase(pages[peer], 'NIGHT');
  assert.equal(await pages[keeper].locator('#night-protection').inputValue(), targetId);
  const publicBefore = latest(0).day;
  for (const i of witches) await seal(i, 'attack', targetId);
  await seal(keeper, 'protection', targetId);
  for (let i = 0; i < 6; i++) {
    assert.deepEqual(latest(i).day, publicBefore);
    if (!witches.includes(i)) assert.equal(latest(i).night?.attack ?? null, null);
    if (i !== keeper) assert.equal(latest(i).night?.protection ?? null, null);
  }
  // Refresh a submitted Witch: final choice survives, cannot be submitted again.
  const owner = witches[0]; const saved = latest(owner).night;
  await pages[owner].reload(); await pages[owner].locator('[data-sealed="attack"]').waitFor();
  assert.deepEqual(latest(owner).night, saved);
  assert.equal(await pages[owner].locator('[data-night="attack"]').count(), 0);
  console.log('Six browsers sealed attack/protection; waiting for real first-night deadline.');
  await phase(pages[0], 'DAWN', 55_000);
  for (const page of pages) await phase(page, 'DAWN');
  assert.equal(latest(0).dawn.deceasedId, null);
  assert.ok(latest(0).deal.players.every(p => p.alive));
  await pages[0].screenshot({ path: 'test-results/dawn-survived.png', fullPage: true });
  await phase(pages[0], 'DAY');
  for (const page of pages) await phase(page, 'DAY');
  for (let i = 0; i < 6; i++) { assert.equal(latest(i).day.dayNumber, 2); assert.equal(latest(i).hand.length, 3); assert.equal(latest(i).night, null); }
  await drawUntilNight();
  for (const i of witches) await seal(i, 'attack', targetId);
  await seal(keeper, 'protection', null);
  console.log('Day 2 completed; waiting for unprotected attack at second-night deadline.');
  await phase(pages[0], 'DAWN', 55_000);
  for (const page of pages) await phase(page, 'DAWN');
  assert.equal(latest(0).dawn.deceasedId, targetId);
  assert.equal(latest(target).private, null); assert.equal(latest(target).hand, null); assert.equal(latest(target).night, null);
  assert.equal(await pages[target].locator('#private-panel').isHidden(), true);
  await pages[target].screenshot({ path: 'test-results/dawn-death-mobile.png', fullPage: true });
  await phase(pages[0], 'DAY');
  await pages[target].reload(); await phase(pages[target], 'DAY');
  assert.equal(latest(target).private, null); assert.equal(latest(target).day.dayNumber, 3);
  assert.equal(latest(target).hand, null); assert.equal(latest(target).day.deckCount, 25);
  assert.equal(await pages[target].locator('#send').isDisabled(), true);
  await pages[keeper].setViewportSize({ width: 1440, height: 1000 });
  await pages[keeper].screenshot({ path: 'test-results/next-day-desktop.png', fullPage: true });
  const host = pages.findIndex((_, i) => id(i) === latest(i).hostId);
  await pages[host].locator('#reopen').click();
  for (const page of pages) { await page.locator('#ready').waitFor(); assert.equal(await page.locator('#night-panel').isHidden(), true); }
  assert.deepEqual(errors, []);
  console.log('PASS: six Edge clients; two real Night deadlines, protection save, night death, two Dawns, Days 2/3, private choices, refresh, silence, responsive controls and reopen.');
} finally { await browser.close(); }
