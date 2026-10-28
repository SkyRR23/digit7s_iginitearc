import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  await page.locator('#create:not([disabled])').waitFor();
  await page.locator('#name').fill('Role Host');
  await page.locator('#create').click();
  await page.locator('#scapegoat-setting').check();
  await page.waitForFunction(() => document.querySelector('#scapegoat-setting')?.checked);
  await page.locator('#fill-bots').click();
  await page.waitForFunction(() => document.querySelectorAll('#seats .table-seat:not(.empty)').length === 6);
  await page.locator('#ready').click();
  await page.locator('#start:not([disabled])').click();
  await page.locator('#role-toggle:not([hidden])').waitFor();
  if (!await page.locator('#role-panel.is-open').count()) await page.locator('#role-toggle').click();
  const role = await page.locator('#role-panel h2').textContent();
  assert.ok(role && role.trim().length > 0);
  const bounds = await page.locator('#role-panel').boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390, 'Private role drawer fits the mobile viewport');
  await page.screenshot({ path: 'test-results/roles-mobile.png' });
  await page.locator('#role-continue').click();
  if(await page.locator('#role-panel.is-open[data-opening-step="team"]').count()) await page.locator('#role-continue').click();
  assert.equal(await page.locator('.private-role-summary').count(),0,'Opening Life cards have their own screen');
  assert.match(await page.locator('.seal-transfer-warning').textContent() ?? '', /face-down hearts moving between players/);
  await page.screenshot({ path: 'test-results/seals-mobile.png' });
  await page.locator('#reveal-all').click();
  await page.locator('[data-private-seal]').first().click();
  assert.equal(await page.locator('.private-seal-card.swap-selected').count(), 1);
  assert.equal(await page.locator('.private-seal-card.swap-target').count(), 4);
  await page.waitForTimeout(550);
  await page.screenshot({ path: 'test-results/seals-swap-mobile.png' });
  await page.locator('[data-private-seal]').nth(1).click();
  await page.waitForFunction(() => document.querySelectorAll('.private-seal-card.swap-changed').length === 2);
  if (await page.locator('#black-cat-target').count()) {
    const target=await page.locator('#black-cat-target option').nth(1).getAttribute('value');
    await page.locator('#black-cat-target').selectOption(target);
    await page.locator('#seal-black-cat:not([disabled])').click();
    await page.locator('.opening-curse strong').waitFor();
  }
  await page.locator('#acknowledge:not([disabled])').click();
  await page.waitForFunction(() => document.querySelector('#lobby')?.dataset.phase === 'DAY', { timeout: 15000 });
  const transfer = await page.evaluate(async () => {
    const effects = await import('/src/table-effects.ts');
    const ids = [...document.querySelectorAll('#seats [data-player]')].map(seat => seat.getAttribute('data-player')).filter(Boolean);
    const base = { deal: { matchId: 'visual-transfer-check', players: ids.map(playerId => ({ playerId, alive: true })) },
      effects: [], hand: [], players: [], day: { players: [] } };
    effects.animateTableChanges(null, base, effects.captureTablePositions());
    const before = effects.captureTablePositions();
    effects.animateTableChanges(base, { ...base, effects: [{ id: 'shift-check', type: 'TRANSFER', actorId: ids[0], targetId: ids[1] }] }, before);
    const shifted = document.querySelectorAll('.flying-hidden-life').length;
    effects.animateTableChanges({ ...base, effects: [{ id: 'shift-check', type: 'TRANSFER', actorId: ids[0], targetId: ids[1] }] },
      { ...base, effects: [{ id: 'shift-check', type: 'TRANSFER', actorId: ids[0], targetId: ids[1] }, { id: 'conspiracy-check', type: 'CONSPIRACY' }] }, before);
    return { shifted, total: document.querySelectorAll('.flying-hidden-life').length,
      anonymous: [...document.querySelectorAll('.flying-hidden-life')].every(heart => !/WITCH|INNOCENT|SEAL [1-5]/.test(heart.textContent ?? '')),
      players: ids.length };
  });
  assert.equal(transfer.shifted, 2);
  assert.equal(transfer.total, transfer.players + 2);
  assert.equal(transfer.anonymous, true);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/hearts-transfer-mobile.png' });
  await page.locator('#power-info').click();
  assert.equal(await page.locator('#vote-action').count(), 1);
  await page.setViewportSize({ width: 1280, height: 800 });
  const desktop = await page.locator('#role-panel').boundingBox();
  assert.ok(desktop && desktop.x >= 0 && desktop.x + desktop.width <= 1280);
  await page.screenshot({ path: 'test-results/roles-desktop.png' });
  console.log(JSON.stringify({ role, mobile: bounds, desktop }));
} finally { await browser.close(); }
