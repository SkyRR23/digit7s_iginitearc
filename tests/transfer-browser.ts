import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { originalPrototypePreset, type RoomView } from '@ashfall/shared';
import { createDay } from '@ashfall/shared/day';
import { createGameServer } from '../apps/server/src/server.js';

const game = createGameServer({ dayFactory: (identity, now) => {
  const result = createDay(identity, originalPrototypePreset, max => max - 1, randomUUID, now);
  result.state.activePlayerId = identity.players.find(player => !player.everWitch)!.id;
  result.state.hands[result.state.activePlayerId]![0]!.kind = 'CINDER_SHIFT';
  return result;
} });
const gamePort = await game.listen(0);
const vite = await createViteServer({ root: 'apps/client', logLevel: 'error', server: {
  host: '127.0.0.1', port: 0, strictPort: false,
  proxy: {
    '/socket.io': { target: `http://127.0.0.1:${gamePort}`, ws: true },
    '/health': `http://127.0.0.1:${gamePort}`,
  },
} });
await vite.listen();
const address = vite.httpServer!.address();
if (!address || typeof address === 'string') throw new Error('Vite did not expose a test port.');
const baseURL = `http://127.0.0.1:${address.port}`;
process.env.ALLOWED_ORIGINS = baseURL;
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge', headless: true });
const contexts = []; const pages = []; const snapshots: RoomView[][] = Array.from({ length: 6 }, () => []);
const wait = (page: import('playwright').Page, predicate: () => boolean) => page.waitForFunction(predicate, undefined, { timeout: 10_000 });

try {
  for (let i = 0; i < 6; i++) {
    const context = await browser.newContext({ viewport: i === 5 ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: i === 5 });
    contexts.push(context); const page = await context.newPage(); pages.push(page);
    page.on('websocket', socket => socket.on('framereceived', ({ payload }) => {
      const match = String(payload).match(/^4[23]\d*(\[.*)$/s); if (!match) return;
      const packet = JSON.parse(match[1]!); const view = packet[0] === 'state' ? packet[1] : packet[0]?.view;
      if (view?.code) snapshots[i]!.push(view);
    }));
    await page.goto(baseURL); await wait(page, () => !(document.querySelector('#create') as HTMLButtonElement).disabled);
  }
  await pages[0]!.locator('#name').fill('Shift Host'); await pages[0]!.locator('#create').click();
  await pages[0]!.locator('#lobby').waitFor({ state: 'visible' }); const code = await pages[0]!.locator('#code').textContent();
  for (let i = 1; i < 6; i++) {
    await pages[i]!.locator('#name').fill(`Shift Guest ${i}`); await pages[i]!.locator('#room-code').fill(code!);
    await pages[i]!.locator('#join').click(); await pages[i]!.locator('#lobby').waitFor({ state: 'visible' });
  }
  for (const page of pages) { await wait(page, () => document.querySelectorAll('.seat:not(.empty)').length === 6); await page.locator('#ready').click(); }
  await wait(pages[0]!, () => !(document.querySelector('#start') as HTMLButtonElement).disabled); await pages[0]!.locator('#start').click();
  for (const page of pages) {
    await page.locator('#private-panel').waitFor({ state: 'visible' }); await page.locator('#toggle-seals').click();
    await page.locator('#acknowledge').click();
  }
  for (const page of pages) await page.locator('#day-panel').waitFor({ state: 'visible' });
  const latest = (index: number) => snapshots[index]!.at(-1)!;
  const activeId = latest(0).day!.activePlayerId;
  const actorIndex = snapshots.findIndex((_, index) => latest(index).you!.playerId === activeId);
  const actor = latest(actorIndex);
  const targetIndex = snapshots.findIndex((_, index) => index !== actorIndex && latest(index).private!.identities.some(identity => identity.kind === 'WITCH'));
  assert.ok(targetIndex >= 0); const target = latest(targetIndex);
  const source = actor.private!.identities[0]!;
  const destination = target.private!.identities.find(identity => identity.kind === 'WITCH')!;
  const shift = actor.hand!.find(card => card.kind === 'CINDER_SHIFT')!;
  const publicBefore = structuredClone(actor.deal);
  const version = actor.day!.version;
  const page = pages[actorIndex]!;
  await page.locator(`[data-card="${shift.id}"]`).click({ position: { x: 24, y: 22 } });
  await page.locator(`[data-player="${target.you!.playerId}"]`).click();
  await page.locator('#source-seal').selectOption(String(source.slot));
  await page.locator('#target-seal').selectOption(String(destination.slot));
  await page.locator('#play-card').click();
  await page.waitForFunction(previous => Number(document.querySelector('#day-panel')!.getAttribute('data-game-version')) > previous, version);
  for (const peer of pages) await peer.waitForFunction(expected => Number(document.querySelector('#day-panel')!.getAttribute('data-game-version')) >= expected, version + 1);
  assert.deepEqual(latest(actorIndex).private!.identities.find(identity => identity.slot === source.slot),
    { id: destination.id, slot: source.slot, kind: 'WITCH' });
  assert.equal(latest(actorIndex).private!.everWitch, true);
  assert.deepEqual(latest(targetIndex).private!.identities.find(identity => identity.slot === destination.slot),
    { id: source.id, slot: destination.slot, kind: source.kind });
  for (let i = 0; i < 6; i++) assert.deepEqual(latest(i).deal, publicBefore);
  for (let i = 0; i < 6; i++) if (i !== actorIndex && i !== targetIndex) {
    const wire = JSON.stringify(latest(i)); assert.equal(wire.includes(source.id), false); assert.equal(wire.includes(destination.id), false);
  }
  assert.equal(await page.locator('.shift-slots').count(), 0, 'Shift controls close after the card leaves the hand.');
  console.log('PASS: six Edge clients used Cinder Shift through the real UI; ownership, sticky allegiance, and public/observer privacy updated correctly.');
} finally {
  await browser.close(); await vite.close(); await game.close();
}
