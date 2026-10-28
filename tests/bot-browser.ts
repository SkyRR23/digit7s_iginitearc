import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import type { RoomView } from '@ashfall/shared';
import { createGameServer } from '../apps/server/src/server.js';

let clock = 50_000;
const game = createGameServer({ now: () => clock, botTickMs: 5, rateLimit: false,
  bots: { fast: true, seed: 2026, messages: false } });
const gamePort = await game.listen(0);
const vite = await createViteServer({ root: 'apps/client', logLevel: 'error', server: {
  host: '127.0.0.1', port: 0,
  proxy: { '/socket.io': { target: `http://127.0.0.1:${gamePort}`, ws: true }, '/health': `http://127.0.0.1:${gamePort}` },
} });
await vite.listen();
const address = vite.httpServer!.address();
if (!address || typeof address === 'string') throw new Error('Vite did not expose a test port.');
const baseURL = `http://127.0.0.1:${address.port}`; process.env.ALLOWED_ORIGINS = baseURL;
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
const page = await context.newPage(); const snapshots: RoomView[] = []; const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
page.on('websocket', socket => socket.on('framereceived', ({ payload }) => {
  const match = String(payload).match(/^4[23]\d*(\[.*)$/s); if (!match) return;
  const packet = JSON.parse(match[1]!); const view = packet[0] === 'state' ? packet[1] : packet[0]?.view;
  if (view?.code) snapshots.push(view);
}));
const wait = (predicate: () => boolean, timeout = 10_000) => page.waitForFunction(predicate, undefined, { timeout });
const latest = () => snapshots.at(-1)!;

try {
  await page.goto(baseURL); await wait(() => !(document.querySelector('#create') as HTMLButtonElement).disabled);
  await page.locator('#name').fill('Solo Player'); await page.locator('#create').click();
  await page.locator('#lobby').waitFor({ state: 'visible' });
  await page.locator('#bot-difficulty').selectOption('NORMAL'); await page.locator('#fill-bots').click();
  await wait(() => document.querySelectorAll('.bot-tag').length === 5);
  assert.equal(await page.locator('.bot-tag').count(), 5); assert.equal(await page.locator('.remove-bot').count(), 5);
  await page.locator('.remove-bot').first().click(); await wait(() => document.querySelectorAll('.bot-tag').length === 4);
  await page.locator('#add-bot').click(); await wait(() => document.querySelectorAll('.bot-tag').length === 5);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#ready').click(); await wait(() => !(document.querySelector('#start') as HTMLButtonElement).disabled);
  await page.locator('#start').click(); await page.locator('#private-panel').waitFor({ state: 'visible' });
  await page.locator('#toggle-seals').click(); await page.locator('#acknowledge').click();
  await wait(() => document.querySelector('#day-panel')?.getAttribute('data-phase') === 'DAY');
  const code = latest().code; const humanId = latest().you!.playerId;

  for (let steps = 0; steps < 20_000; steps++) {
    game.store.tickBots(); await new Promise(resolve => setTimeout(resolve, 0));
    const view = game.store.simulationView(code, 0)!;
    if (view.phase === 'GAME_OVER') break;
    if (view.phase === 'REVEAL_RESOLUTION' && view.day!.reveal!.chooserId === humanId) {
      const version = view.day!.version; await page.locator('[data-reveal]').first().click();
      await page.waitForFunction(previous => Number(document.querySelector('#day-panel')!.getAttribute('data-game-version')) > previous, version);
    } else if (view.phase === 'DAY' && view.day!.activePlayerId === humanId) {
      const version = view.day!.version; await page.locator('#draw-cards').click();
      await page.waitForFunction(previous => Number(document.querySelector('#day-panel')!.getAttribute('data-game-version')) > previous, version);
    } else if (view.phase === 'NIGHT') {
      for (const ability of ['attack', 'protection'] as const) {
        const choice = view.night?.[ability];
        if (choice && !choice.submitted) {
          const select = page.locator(`#night-${ability}`); await select.waitFor();
          const values = await select.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
          await select.selectOption(values[1] ?? ''); await page.locator(`[data-night="${ability}"] button`).click();
          await page.locator(`[data-sealed="${ability}"]`).waitFor();
        }
      }
      const status = game.store.simulationStatus(code)!; clock = status.deadline!; game.store.sweep();
    } else if (view.phase === 'DAWN') {
      const status = game.store.simulationStatus(code)!; clock = status.deadline!; game.store.sweep();
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  await wait(() => document.querySelector('#day-panel')?.getAttribute('data-phase') === 'GAME_OVER');
  const result = latest().personalResult; assert.ok(['WIN', 'LOSS'].includes(result!)); assert.equal(game.store.botFailures.length, 0);
  await page.locator('#reopen').click(); await page.getByRole('button', { name: 'I’m ready', exact: true }).waitFor();
  assert.equal(await page.locator('.bot-tag').count(), 5);
  assert.deepEqual(errors, []);
  console.log(`PASS: one mobile Edge client filled five bot seats, completed a full match (${result}), and opened a bot-preserving rematch lobby.`);
} finally {
  await browser.close(); await vite.close(); await game.close();
}
