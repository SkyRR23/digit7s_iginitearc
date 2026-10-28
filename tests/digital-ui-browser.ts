// Real UI + Socket.IO integration. Deterministic scenarios and the clock are
// injected only into an isolated in-process QA server, never into production UI.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { originalPrototypePreset, type ActionKind, type RoomView } from '@ashfall/shared';
import { createDay } from '@ashfall/shared/day';
import { dealIdentities } from '@ashfall/shared/identities';
import { createGameServer } from '../apps/server/src/server.js';

const origin = 'http://127.0.0.1:5183';
process.env.ALLOWED_ORIGINS = origin;
let offset = 0;
const now = () => Date.now() + offset;
const game = createGameServer({ rateLimit: false, sweepMs: 25, now,
  randomIndex: max => max - 1,
  identityFactory: ids => {
    const witches = ids.length >= 8 ? 3 : 2;
    return dealIdentities(ids, { ...originalPrototypePreset, players: ids.length,
      humanCards: ids.length * 5 - witches - 1, witchCards: witches }, max => max - 1, randomUUID);
  },
  dayFactory: (identity, time) => {
    const result = createDay(identity, { ...originalPrototypePreset, turnTimeoutMs: 180_000 }, max => max - 1, randomUUID, time);
    const state = result.state;
    const available = [...state.deck, ...Object.values(state.hands).flat()];
    for (const id of Object.keys(state.hands)) state.hands[id] = [];
    const kinds: ActionKind[] = ['EVIDENCE','EVIDENCE','EVIDENCE','WITNESS','SCAPEGOAT','CONSPIRACY','PIETY',
      'HEARTHWARD','WHISPER','WHISPER','VOW_OF_HEARTS','VOW_OF_HEARTS','CURSE','STOCKS','MERCY','CINDER_SHIFT','ASYLUM','ALIBI'];
    state.hands[identity.players[0]!.id] = kinds.map(kind => {
      const index = available.findIndex(card => card.kind === kind);
      assert.ok(index >= 0); return available.splice(index,1)[0]!;
    });
    state.deck = available.splice(0,8); state.discard = available;
    return result;
  },
});
const port = await game.listen(0);
const vite = await createViteServer({ configFile: false, root: 'apps/client', server: { host: '127.0.0.1', port: 5183, strictPort: true,
  proxy: { '/socket.io': { target: `http://127.0.0.1:${port}`, ws: true } } } });
await vite.listen();
await mkdir('test-results/digital-ui', { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge', headless: true });
const errors: string[] = [];
const summaries: object[] = [];
function observe(page: Page, receive: (view: RoomView) => void) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => void dialog.accept());
  page.on('websocket', socket => socket.on('framereceived', ({payload}) => {
    const frame = String(payload).match(/^4[23]\d*(\[.*)$/s); if (!frame) return;
    const data = JSON.parse(frame[1]!); const view = data[0] === 'state' ? data[1] : data[0]?.view;
    if (view?.code) receive(view);
  }));
}
async function phase(page: Page, value: string) { await page.locator(`#lobby[data-phase="${value}"]`).waitFor(); }
async function noOverflow(page: Page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No document horizontal overflow');
}
try {
  for (const capacity of [6,10]) {
    offset = 0;
    const contexts = [], pages: Page[] = [], views: RoomView[] = [];
    const view = (i = 0) => views[i]!;
    const id = (i: number) => view(i).you!.playerId;
    for (let i = 0; i < capacity; i++) {
      const context = await browser.newContext({ viewport: i === 1 ? {width:390,height:844} : {width:1440,height:900}, reducedMotion: 'reduce' });
      contexts.push(context); const page = await context.newPage(); pages.push(page);
      observe(page, next => { views[i] = next; });
      await page.goto(origin); await page.locator('#create:not([disabled])').waitFor();
      await page.locator('#name').fill(i === 0 ? `Host ${capacity}` : `Guest ${i}`);
      if (!i) { await page.locator('#capacity').selectOption(String(capacity)); await page.locator('#create').click(); }
      else { await page.locator('#room-code').fill(view().code); await page.locator('#join').click(); }
      await phase(page,'LOBBY');
    }
    const host = pages[0]!;
    await host.locator('#message').fill('Ready for the council.'); await host.locator('#send').click();
    await pages[1]!.locator('#chat-toggle').click(); await pages[1]!.getByText('Ready for the council.',{exact:true}).waitFor();
    await pages[1]!.locator('#chat-close').click();
    assert.equal(await host.locator('#seats .table-seat:not(.empty)').count(), capacity);
    assert.equal(await host.locator('#seats .public-seals').count(),0,'No Life identities in the lobby');
    assert.equal(await host.locator('#role-panel img').count(),0,'No private role in lobby DOM');
    await host.screenshot({path:`test-results/digital-ui/lobby-${capacity}.png`,fullPage:true});
    for (const page of pages) { await page.locator('#ready').click(); await page.getByRole('button',{name:'Not ready',exact:true}).waitFor(); }
    await host.locator('#start:not([disabled])').click();
    for (const page of pages) {
      await phase(page,'PRIVATE_DEAL');
      if (!await page.locator('#role-panel.is-open').count()) await page.locator('#role-toggle').click();
      await page.locator('#role-continue').waitFor({state:'visible'});
      assert.equal(await page.locator('.role-profile-art img').count(),1);
      assert.equal(await page.locator('.role-profile-symbol svg').count(),1);
      await page.locator('#role-continue').click();
      assert.equal(await page.locator('.life-identity-art').count(),0,'Covered private cards have no identity art');
      await page.locator('#reveal-all').click();
      assert.equal(await page.locator('.life-identity-art').count(),5);
      if (page === host) {
        const before = view().private!.identities.map(card => card.id);
        await page.locator('[data-private-seal]').nth(0).click();
        assert.equal(await page.locator('.swap-target').count(),4);
        await page.locator('[data-private-seal]').nth(1).click();
        await page.waitForFunction(previous => {
          const ids = Array.from(document.querySelectorAll('[data-private-seal]'), el => (el as HTMLElement).dataset.privateSeal);
          return ids[0] === previous[1] && ids[1] === previous[0];
        },before);
        await page.locator('#shuffle-seals').click();
        await page.locator('#reveal-all').click();
        assert.equal(await page.locator('.life-identity-art').count(),0);
        await page.locator('#reveal-all').click();
        await page.screenshot({path:`test-results/digital-ui/life-${capacity}.png`});
      }
      await page.locator('#acknowledge:not([disabled])').click();
    }
    await phase(host,'DAY');
    console.info(`${capacity} seats: create/join, ready, role and Life reveal passed`);
    assert.equal(await host.locator('#seats .public-seals li').count(),capacity*5);
    assert.equal(await host.locator('#seats .doubt-tile').count(),0,'Zero Doubt has no placeholder DOM marks');
    assert.equal(await host.locator('[data-reveal-table]').count(),0,'No client-selected public Life slot');
    const evidence = host.locator('[data-stack-kind="EVIDENCE"] [data-card]');
    const handBefore = view().hand!.length;
    await evidence.hover(); await host.locator('#card-explanation').waitFor();
    assert.match(await host.locator('#card-explanation').textContent() ?? '',/Piety/);
    assert.equal(await host.locator('.action-card.selected').count(),0,'Hover never selects or plays');
    await host.locator('.brand').hover(); await evidence.focus(); await host.locator('#card-explanation').waitFor();
    await host.keyboard.press('Escape');
    await host.locator('[data-card-details="EVIDENCE"]').click();
    assert.equal(await host.locator('#card-explanation[role="dialog"]').count(),1);
    assert.equal(view().hand!.length, handBefore,'Details never plays');
    await host.locator('.details-close').click();
    await evidence.click(); await host.locator(`#seats [data-player="${id(1)}"]`).click();
    await host.locator('#cancel-preview').click();
    assert.equal(await host.locator('.action-card.selected').count(),0,'Cancel dispatches no action');
    await evidence.click(); await host.keyboard.press('Escape');
    assert.equal(await host.locator('.action-card.selected').count(),0,'Escape cancels targeting');
    async function play(kind: ActionKind, targets: number[] = [], protection?: string) {
      const version = view().day!.version;
      await host.locator(`[data-stack-kind="${kind}"] [data-card]`).click();
      for (const index of targets) {
        const seat = host.locator(`#seats [data-player="${id(index)}"]`);
        assert.equal(await seat.getAttribute('tabindex'),'0', `${kind} target ${index} is eligible`);
        await seat.locator('[data-choose-player]').click();
      }
      if (protection) await host.locator('#preview-protection').selectOption(protection);
      await host.locator('#confirm-preview:not([disabled])').waitFor();
      assert.match(await host.locator('#confirm-preview').textContent() ?? '',/^Play /);
      if (kind === 'SCAPEGOAT') assert.equal(await host.locator('.spotlight-player').count(),2);
      if (kind === 'CONSPIRACY') assert.equal(await host.locator('#seats .is-valid-target').count(),0);
      if (kind === 'EVIDENCE') await host.screenshot({path:`test-results/digital-ui/target-${capacity}.png`});
      await host.locator('#confirm-preview').click();
      await host.waitForFunction(previous => Number(document.querySelector('#day-panel')?.getAttribute('data-game-version')) > previous,version);
      assert.equal(await host.locator('.play-preview').count(),0);
      assert.match(await host.locator('.action-route.resolved .action-actor').textContent() ?? '', new RegExp(`Host ${capacity}`), 'The public action names its actor');
      assert.match(await host.locator('.action-route.resolved .route-card-name').textContent() ?? '', new RegExp(kind === 'VOW_OF_HEARTS' ? 'Vow of Hearts' : kind === 'CINDER_SHIFT' ? 'Cinder Shift' : kind.charAt(0) + kind.slice(1).toLowerCase(),'i'), 'The public action names its card');
    }
    await play('EVIDENCE',[1]);
    assert.equal(view().day!.players.find(p=>p.playerId===id(1))!.doubt,2);
    await play('SCAPEGOAT',[1,2]);
    assert.equal(view().day!.players.find(p=>p.playerId===id(1))!.doubt,0);
    await play('WITNESS',[2]);
    assert.equal(view().deal!.players[2]!.seals.filter(card=>card.revealed).length,1);
    assert.equal(view().day!.players.find(p=>p.playerId===id(2))!.doubt,0);
    const revealedBadge = host.locator(`#seats [data-player="${id(2)}"] .revealed-life-badge`).first();
    await revealedBadge.focus(); await host.locator('#life-inspection[role="tooltip"]').waitFor();
    assert.match(await host.locator('#life-inspection h3').textContent() ?? '', /Villager|Ashbound|Lanternkeeper/);
    await host.keyboard.press('Escape'); await revealedBadge.click();
    await host.locator('#life-inspection[role="dialog"]').waitFor();
    await host.locator('.life-inspection-close').click();
    assert.equal(await host.locator('#seats .seal-back [data-revealed-life]').count(),0,'Hidden cards expose no identity inspection attributes');
    await play('PIETY',[1]); await play('EVIDENCE',[1]);
    assert.equal(view().day!.players.find(p=>p.playerId===id(1))!.doubt,0,'Piety blocked Evidence');
    await play('HEARTHWARD',[1]); await play('WHISPER',[1]);
    assert.equal(view().peek,null,'Hearthward blocked private peek');
    await play('WHISPER',[2]);
    await host.locator('.whisper-peek').waitFor();
    assert.equal(await pages[1]!.locator('.whisper-peek').count(),0,'Only the acting player sees the peek');
    await host.locator('#close-peek').click();
    await play('VOW_OF_HEARTS',[1]); await play('VOW_OF_HEARTS',[2]);
    assert.match(await host.locator(`#seats [data-player="${id(1)}"] .status-vow_heart`).textContent() ?? '', /Guest 2/, 'A Heart names its partner');
    assert.equal(await host.locator('#vow-threads, #targeting-arrow').count(),0,'No ambiguous lines cross the roster');
    await play('EVIDENCE',[1]);
    assert.equal(view().day!.players.find(p=>p.playerId===id(2))!.doubt,1,'Heart mirrors one Doubt once');
    await play('CURSE',[1]); assert.equal(view().day!.vows!.length,0);
    await play('STOCKS',[1]); await play('MERCY',[1]);
    assert.ok(!view().day!.players.find(p=>p.playerId===id(1))!.statuses!.some(s=>s.kind==='BOUND'));
    await play('CINDER_SHIFT',[2]); await play('CONSPIRACY');
    assert.ok(view().feed.some(e=>e.text==='A conspiracy shifted the council’s hidden lives.'));
    await play('ASYLUM',[0]);
    console.info(`${capacity} seats: targeting, card details, seven-Doubt reveal, protections and links passed`);
    await pages[1]!.reload(); await phase(pages[1]!,'DAY');
    assert.equal(await pages[1]!.locator('#private-panel:not([hidden])').count(),0,'Reconnect covers private display');
    assert.equal(await pages[1]!.locator('#role-panel.is-open').count(),0);
    assert.equal(await pages[1]!.locator(`#seats [data-player="${id(2)}"] .doubt-tile.filled`).count(),1,'Reconnect restores Doubt');
    await host.screenshot({path:`test-results/digital-ui/game-${capacity}.png`});
    for (const [width,height] of [[390,844],[360,640],[768,1024],[844,390],[1075,884],[1440,900]]) {
      await host.setViewportSize({width,height}); await noOverflow(host);
      const nameSizes = await host.locator('#seats .seat-name h3').evaluateAll(names => names.map(name => parseFloat(getComputedStyle(name).fontSize)));
      assert.ok(nameSizes.every(size => size >= 17), 'Every player name remains readable, including remote players');
      if (width > 680) {
        const positions = await host.locator('#seats .table-seat').evaluateAll(seats => seats.map(seat => seat.getBoundingClientRect().x));
        assert.ok(Math.max(...positions) - Math.min(...positions) > width / 3, 'Players are distributed on both sides');
      }
      const details = host.locator('[data-card-details]').first();
      const bounds = await details.boundingBox();
      const hand = await host.locator('.action-hand').boundingBox();
      assert.ok(bounds && hand && bounds.y + bounds.height <= hand.y + hand.height + 1,`Card details stays reachable at ${width} × ${height}`);
      await details.click(); await host.locator('#card-explanation[role="dialog"]').waitFor();
      const pop = await host.locator('#card-explanation').boundingBox();
      assert.ok(pop && pop.x >= 0 && pop.y >= 0 && pop.x + pop.width <= width && pop.y + pop.height <= height,'Details pop-up remains inside viewport');
      await host.locator('.details-close').click();
      if (width === 390) await host.screenshot({path:`test-results/digital-ui/phone-${capacity}.png`});
      if (width === 1075) {
        await revealedBadge.click();
        const pop = await host.locator('#life-inspection').boundingBox();
        assert.ok(pop && pop.x >= 0 && pop.y >= 0 && pop.x + pop.width <= width && pop.y + pop.height <= height,'Public Life inspection stays within viewport');
        await host.screenshot({path:`test-results/digital-ui/readable-life-${capacity}.png`});
        await host.locator('.life-inspection-close').click();
      }
    }
    const beforeEnd = view().day!.version;
    await host.locator('#end-turn').click();
    await host.waitForFunction(previous => Number(document.querySelector('#day-panel')?.getAttribute('data-game-version')) > previous,beforeEnd);
    let draws = 0;
    while (view().phase === 'DAY' && draws < 8) {
      const index = views.findIndex(v=>v.you!.playerId===view().day!.activePlayerId);
      const actor = pages[index]!, version = view().day!.version;
      await actor.locator('#draw-cards:not([disabled])').click(); draws++;
      await host.waitForFunction(previous => Number(document.querySelector('#day-panel')?.getAttribute('data-game-version')) > previous,version);
    }
    for (const page of pages) { await phase(page,'NIGHT'); assert.equal(await page.locator('#send').isDisabled(),true); }
    for (let i=0;i<capacity;i++) {
      const page = pages[i]!;
      if (view(i).night?.attack) { await page.locator('#night-attack').selectOption(id(1)); await page.locator('[data-night="attack"] button').click(); }
      if (view(i).night?.protection) { await page.locator('#night-protection').selectOption(id(2)); await page.locator('[data-night="protection"] button').click(); }
    }
    await host.screenshot({path:`test-results/digital-ui/night-${capacity}.png`});
    offset = view().day!.deadline! - Date.now() + 1; game.store.sweep();
    await phase(host,'DAWN');
    assert.equal(view().dawn!.deceasedId,id(1));
    offset = view().day!.deadline! - Date.now() + 1; game.store.sweep();
    await phase(host,'DAY');
    console.info(`${capacity} seats: Draw 2, Night privacy, Dawn and death passed`);
    assert.equal(await host.locator(`#seats [data-player="${id(1)}"] .death-mark`).count(),1);
    const witch = capacity-1;
    for (let i=0;i<capacity && view().phase!=='GAME_OVER';i++) {
      if (!view(i).deal!.players.find(p=>p.playerId===id(i))!.alive) continue;
      const page = pages[i]!;
      await page.locator('#role-toggle').click();
      await page.locator('#vote-action select').selectOption(id(witch));
      await page.locator('#vote-action button').click();
      await page.locator('#role-close').click();
      await new Promise(resolve=>setTimeout(resolve,70));
    }
    await phase(host,'GAME_OVER');
    assert.match(await host.locator('.outcome').textContent() ?? '',/village survives/i);
    await host.screenshot({path:`test-results/digital-ui/result-${capacity}.png`});
    await host.locator('#reopen').click(); await phase(host,'LOBBY');
    assert.equal(await host.locator('#role-panel img').count(),0,'Rematch clears the private role');
    assert.equal(await host.locator('#seats .public-seals').count(),0);
    assert.equal(await host.locator('#start').isDisabled(),true,'Rematch requires ready again');
    summaries.push({capacity,playersJoined:pages.length,draws,roleAndLife:true,hoverKeyboardTouchDetails:true,
      targetedAndGlobal:true,sevenDoubt:true,protectionAndLinks:true,nightDawnDeath:true,reconnect:true,voteResultsRematch:true});
    for (const context of contexts) await context.close();
  }
  const botContext = await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const botPage = await botContext.newPage(); observe(botPage,()=>{});
  await botPage.goto(origin); await botPage.locator('#create:not([disabled])').waitFor();
  await botPage.locator('#name').fill('Bot host'); await botPage.locator('#create').click();
  await botPage.locator('#lobby-capacity').selectOption('10');
  await botPage.waitForFunction(()=>document.querySelector('#seats')?.getAttribute('data-capacity')==='10');
  await botPage.locator('#bot-difficulty').selectOption('EASY'); await botPage.locator('#add-bot').click();
  await botPage.waitForFunction(()=>document.querySelectorAll('#seats .table-seat:not(.empty)').length===2);
  assert.match(await botPage.locator('#seats .bot-tag').textContent() ?? '',/EASY/);
  await botPage.locator('[data-remove-bot]').click();
  await botPage.waitForFunction(()=>document.querySelectorAll('#seats .table-seat:not(.empty)').length===1);
  await botPage.locator('#fill-bots').click();
  await botPage.waitForFunction(()=>document.querySelectorAll('#seats .table-seat:not(.empty)').length===10);
  await botPage.locator('#ready').click(); await botPage.locator('#start:not([disabled])').click();
  await botPage.locator('#role-continue').click(); await botPage.locator('#reveal-all').click();
  await botPage.locator('#acknowledge:not([disabled])').click(); await phase(botPage,'DAY');
  await noOverflow(botPage); await botPage.screenshot({path:'test-results/digital-ui/bots-ten-phone.png'});
  await botContext.close();
  console.info('10-seat bot lobby: capacity, difficulty, add/remove/fill and start passed');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({summaries,errors},null,2));
} finally { await browser.close(); await vite.close(); await game.close(); }
