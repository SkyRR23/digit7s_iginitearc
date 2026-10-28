// Run against `npm run dev`. Uses six isolated browser contexts, not mock sockets.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const baseURL = process.env.TEST_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge', headless: true });
const errors = [];
const contexts = [];
const pages = [];
const snapshots = Array.from({ length: 6 }, () => []);
async function waitUntil(page, predicate) { await page.waitForFunction(predicate, undefined, { timeout: 10_000 }); }
try {
  await mkdir('test-results', { recursive: true });
  for (let i = 0; i < 6; i++) {
    const context = await browser.newContext({ viewport: i === 5 ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, hasTouch: i === 5, reducedMotion: 'reduce' });
    contexts.push(context);
    const page = await context.newPage(); pages.push(page);
    page.on('dialog', dialog => dialog.accept());
    page.on('websocket', ws => ws.on('framereceived', ({ payload }) => {
      // Inspect actual Socket.IO event and acknowledgement frames without logging secrets.
      const match = String(payload).match(/^4[23]\d*(\[.*)$/s);
      if (!match) return;
      const packet = JSON.parse(match[1]);
      const view = packet[0] === 'state' ? packet[1] : packet[0]?.view;
      if (view?.code) snapshots[i].push(view);
    }));
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(baseURL);
    await waitUntil(page, () => !document.querySelector('#create').disabled);
  }
  await pages[0].screenshot({ path: 'test-results/entry-desktop.png', fullPage: true });
  await pages[5].screenshot({ path: 'test-results/entry-mobile.png', fullPage: true });
  await pages[5].setViewportSize({ width: 320, height: 740 });
  for (const option of await pages[5].locator('.avatar-option').all()) {
    const box = await option.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, 'Sigil touch target at least 44px');
  }
  await pages[5].setViewportSize({ width: 390, height: 844 });
  await pages[0].locator('#name').fill('Rowan');
  await pages[0].locator('#create').click();
  await pages[0].locator('#lobby').waitFor({ state: 'visible' });
  const code = await pages[0].locator('#code').textContent();
  assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
  for (let i = 1; i < 6; i++) {
    await pages[i].locator('#name').fill(['', 'Elin', 'Mara', 'Aster', 'Briar', 'Hollis'][i]);
    await pages[i].locator(`.avatar-option`).nth(i).click();
    await pages[i].locator('#room-code').fill(code);
    await pages[i].locator('#join').click();
    await pages[i].locator('#lobby').waitFor({ state: 'visible' });
  }
  for (const page of pages) await waitUntil(page, () => document.querySelectorAll('.seat:not(.empty)').length === 6);
  assert.equal(await pages[0].locator('#start').isDisabled(), true);
  await pages[2].locator('#message').fill('<img src=x onerror=alert(1)> Hello council');
  await pages[2].locator('#send').click();
  for (const page of pages) {
    await page.getByText('<img src=x onerror=alert(1)> Hello council', { exact: true }).waitFor();
    assert.equal(await page.locator('#feed img').count(), 0);
  }
  for (const page of pages) {
    await page.locator('#ready').click();
    await page.getByRole('button', { name: 'Not ready', exact: true }).waitFor();
  }
  await waitUntil(pages[0], () => !document.querySelector('#start').disabled);
  await pages[0].screenshot({ path: 'test-results/lobby-desktop.png', fullPage: true });
  await pages[5].screenshot({ path: 'test-results/lobby-mobile.png', fullPage: true });
  for (const width of [320, 390, 768, 1440]) {
    await pages[5].setViewportSize({ width, height: 844 });
    assert.equal(await pages[5].evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal overflow at ${width}px`);
  }
  const before = await pages[5].locator('.is-you h3').textContent();
  await pages[5].reload();
  await pages[5].locator('#lobby').waitFor({ state: 'visible' });
  assert.equal(await pages[5].locator('.is-you h3').textContent(), before);
  await pages[5].getByRole('button', { name: 'Not ready', exact: true }).waitFor();
  await contexts[5].setOffline(true);
  await waitUntil(pages[0], () => document.querySelector('#seats').textContent.includes('Reconnecting'));
  assert.equal(await pages[0].locator('#start').isDisabled(), true);
  await contexts[5].setOffline(false);
  await waitUntil(pages[0], () => !document.querySelector('#start').disabled);
  await pages[0].locator('#start').click();
  await pages[5].setViewportSize({ width: 390, height: 844 });
  for (const page of pages) {
    await page.locator('#private-panel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.private-seal').count(), 0, 'Private kinds absent from covered DOM');
    assert.equal(await page.locator('.public-seals li').count(), 30);
    assert.equal(await page.locator('#seats [data-kind]').count(), 0);
  }
  const dealt = snapshots.map(views => views.filter(v => v.deal).at(-1));
  assert.ok(dealt.every(v => v?.private?.identities.length === 5), 'Every browser received only its five Seals');
  const matchId = dealt[0].deal.matchId;
  const cards = dealt.flatMap(v => v.private.identities);
  assert.equal(new Set(cards.map(c => c.id)).size, 30);
  assert.equal(cards.filter(c => c.kind === 'HUMAN').length, 27);
  assert.equal(cards.filter(c => c.kind === 'WITCH').length, 2);
  assert.equal(cards.filter(c => c.kind === 'CONSTABLE').length, 1);
  for (let i = 0; i < 6; i++) {
    const own = dealt[i].private;
    const others = dealt.filter((_, j) => i !== j).flatMap(v => v.private.identities);
    for (const snapshot of snapshots[i].filter(v => v.deal?.matchId === matchId)) {
      const wire = JSON.stringify(snapshot);
      assert.ok(others.every(c => !wire.includes(c.id)), 'No other owner card IDs in browser network payloads');
      assert.ok(snapshot.deal.players.flatMap(p => p.seals).every(c => Object.keys(c).sort().join(',') === 'revealed,slot'));
      assert.deepEqual(snapshot.private.identities, own.identities);
      assert.equal(wire.includes('ownerId'), false);
      assert.equal(wire.includes('deck'), false);
    }
    const page = pages[i];
    await page.bringToFront();
    await page.locator('#toggle-seals').click();
    assert.equal(await page.locator('.private-seal').count(), 5);
    assert.deepEqual(await page.locator('.private-seal').evaluateAll(elements => elements.map(e => e.dataset.kind)), own.identities.map(c => c.kind));
    if (i === 0 || i === 5) await page.screenshot({ path: `test-results/private-${i === 0 ? 'desktop' : 'mobile'}.png`, fullPage: true });
    // Cover removes private text from the DOM, including the accessibility tree.
    await page.locator('#toggle-seals').click();
    assert.equal(await page.locator('.private-seal').count(), 0);
    await page.locator('#toggle-seals').click();
    await page.locator('#acknowledge').click();
    await page.getByRole('button', { name: 'Seals acknowledged', exact: true }).waitFor();
    assert.equal(await page.locator('.private-seal').count(), 0);
  }
  for (const page of pages) await page.locator('#day-panel').waitFor({ state: 'visible' });
  // Reload after dealing: membership, ordered identities and acknowledgement survive; panel stays covered.
  await pages[5].reload();
  await pages[5].locator('#private-panel').waitFor({ state: 'visible' });
  assert.equal(await pages[5].locator('.private-seal').count(), 0);
  const recovered = snapshots[5].filter(v => v.deal?.matchId === matchId).at(-1);
  assert.deepEqual(recovered.private, dealt[5].private);
  await pages[5].getByRole('button', { name: 'Seals acknowledged', exact: true }).waitFor();
  await pages[5].bringToFront();
  await pages[5].locator('#toggle-seals').click();
  for (const width of [320, 390, 768, 1440]) {
    await pages[5].setViewportSize({ width, height: 844 });
    assert.equal(await pages[5].evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Private view fits ${width}px`);
  }
  await pages[0].bringToFront();
  // Headless isolated contexts do not consistently synthesize OS focus events.
  // Dispatch blur explicitly to verify the privacy handler, not window-manager behavior.
  await pages[5].evaluate(() => window.dispatchEvent(new Event('blur')));
  await waitUntil(pages[5], () => document.querySelectorAll('.private-seal').length === 0);
  await pages[0].screenshot({ path: 'test-results/day-desktop.png', fullPage: true });
  await pages[5].setViewportSize({ width: 390, height: 844 });
  await pages[5].screenshot({ path: 'test-results/day-mobile.png', fullPage: true });
  const fanBoxes = await pages[0].locator('.action-card').evaluateAll(cards => cards.slice(0, 2).map(card => {
    const box = card.getBoundingClientRect(); return { left: box.left, right: box.right };
  }));
  assert.equal(fanBoxes.length, 2, 'Active hand exposes at least two cards');
  assert.ok(fanBoxes[1].left > fanBoxes[0].left && fanBoxes[1].left < fanBoxes[0].right,
    'UNO-like hand advances while overlapping adjacent cards');
  const latest = i => snapshots[i].at(-1);
  let playedCards = 0;
  let reveals = 0;
  let wardPlayed = false;
  // Test driver coordinates six authorized owner views. No bot runtime is installed.
  // Production shuffling remains random, so either victory or Night is a valid boundary.
  for (let step = 0; step < 90; step++) {
    const state = latest(0);
    if (['GAME_OVER', 'NIGHT'].includes(state.phase)) break;
    const i = pages.findIndex((_, index) => latest(index).you.playerId === state.day.activePlayerId);
    const page = pages[i]; await page.bringToFront();
    const own = latest(i); const version = own.day.version;
    const livingWitch = dealt.find(v => v.private.everWitch && v.you.playerId !== own.you.playerId &&
      own.deal.players.find(p => p.playerId === v.you.playerId)?.alive);
    if (own.phase === 'REVEAL_RESOLUTION') {
      const target = own.deal.players.find(p => p.playerId === own.day.reveal.targetId);
      const targetOwner = dealt.find(v => v.you.playerId === target.playerId);
      const slot = targetOwner.private.identities.find(c => c.kind === 'WITCH' && !target.seals.find(s => s.slot === c.slot).revealed)?.slot
        ?? target.seals.find(s => !s.revealed).slot;
      await page.locator(`[data-reveal="${slot}"]`).click(); reveals++;
    } else {
      const ward = !wardPlayed && own.hand.find(c => c.kind === 'HEARTHWARD');
      const whisper = own.hand.find(c => c.kind === 'WHISPER');
      const card = ward || (livingWitch && whisper);
      const target = livingWitch?.you.playerId ?? own.deal.players.find(p => p.alive && p.playerId !== own.you.playerId)?.playerId;
      if (card && target) {
        const cardButton = page.locator(`[data-card="${card.id}"]`);
        const restingBox = await cardButton.boundingBox();
        await cardButton.click({ position: { x: 24, y: 22 } });
        assert.equal(await cardButton.getAttribute('aria-pressed'), 'true');
        assert.equal(await cardButton.evaluate(element => element.classList.contains('selected')), true);
        const raisedBox = await cardButton.boundingBox();
        assert.ok(restingBox && raisedBox && raisedBox.y < restingBox.y, 'Selected card visibly lifts above the hand');
        assert.notEqual(await cardButton.evaluate(element => getComputedStyle(element).boxShadow), 'none', 'Selected card has a visible glow');
        if (playedCards === 0) await page.screenshot({ path: 'test-results/day-selected-desktop.png', fullPage: true });
        await page.locator(`[data-player="${target}"]`).waitFor();
        assert.equal(await page.locator(`[data-player="${target}"]`).getAttribute('role'), 'button');
        await page.locator(`[data-player="${target}"]`).click();
        assert.equal(await page.locator('#card-target').inputValue(), target);
        await page.locator('#play-card').click(); playedCards++;
        if (card.kind === 'HEARTHWARD') wardPlayed = true;
      } else if (own.day.playedThisTurn) await page.locator('#end-turn').click();
      else await page.locator('#draw-cards').click();
    }
    await page.waitForFunction(previous => Number(document.querySelector('#day-panel').dataset.gameVersion) > previous, version);
    // Other browsers must reach the same game revision before the next scripted action.
    const nextVersion = Number(await page.locator('#day-panel').getAttribute('data-game-version'));
    for (const peer of pages) await peer.waitForFunction(expected => Number(document.querySelector('#day-panel').dataset.gameVersion) >= expected, nextVersion);
  }
  const terminal = latest(0);
  assert.ok(['GAME_OVER', 'NIGHT'].includes(terminal.phase), 'Day must finish at victory or the Night boundary');
  assert.ok(playedCards > 0, 'Real card plays exercised');
  for (let i = 0; i < 6; i++) {
    const own = latest(i);
    const living = own.deal.players.find(p => p.playerId === own.you.playerId).alive;
    if (!living) {
      assert.equal(own.private, null); assert.equal(own.hand, null);
      assert.equal(await pages[i].locator('#private-panel').isHidden(), true);
    }
  }
  await pages[0].screenshot({ path: 'test-results/day-terminal-desktop.png', fullPage: true });
  console.log(`Day browser coverage: ${playedCards} card plays, ${reveals} chosen reveals, ward played=${wardPlayed}, terminal=${terminal.phase}.`);
  await pages[0].locator('#reopen').click();
  for (const page of pages) {
    await page.getByRole('button', { name: 'I’m ready', exact: true }).waitFor();
    assert.equal(await page.locator('#private-panel').isHidden(), true);
    assert.equal(await page.locator('.private-seal').count(), 0);
    assert.equal(await page.locator('.public-seals li').count(), 0);
  }
  await pages[5].locator('#leave').click();
  await pages[5].locator('#entry').waitFor({ state: 'visible' });
  await waitUntil(pages[0], () => document.querySelectorAll('.seat.empty').length === 1);
  assert.deepEqual(errors, []);
  console.log('PASS: six isolated Edge clients; lobby, private deal, Day card/target actions, reveal flow, terminal checkpoint, refresh, offline recovery, reopen/leave, and responsive layouts.');
} finally { await browser.close(); }
