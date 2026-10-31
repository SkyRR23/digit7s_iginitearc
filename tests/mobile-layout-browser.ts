// Exercise the real transport and card commands against an isolated QA server.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { originalPrototypePreset, type ActionKind } from '@ashfall/shared';
import { createDay } from '@ashfall/shared/day';
import { dealIdentities, recordWitchHistory } from '@ashfall/shared/identities';
import { createHarness } from './socket-harness.js';

const origin = 'http://127.0.0.1:5187';
process.env.ALLOWED_ORIGINS = origin;
const game = await createHarness(60_000, { rateLimit: false, randomIndex: max => max - 1,
  identityFactory: ids => {
    const witches = ids.length >= 8 ? 3 : 2;
    const match = dealIdentities(ids, {...originalPrototypePreset,players:ids.length,humanCards:ids.length*5-witches-1,witchCards:witches}, max => max - 1, randomUUID);
    const cards = match.cards.map(card => ({...card}));
    const keeper = cards.find(card => card.kind === 'CONSTABLE')!;
    const host = cards.find(card => card.ownerId === ids[0] && card.slot === 0)!;
    [keeper.kind, host.kind] = [host.kind, keeper.kind];
    return recordWitchHistory({...match,cards,players:match.players.map(player => ({...player,everWitch:false}))});
  },
  dayFactory: (identity, now) => {
    const result = createDay(identity, {...originalPrototypePreset, turnTimeoutMs: 600_000}, max => max - 1, randomUUID, now);
    const state = result.state;
    const available = [...state.deck, ...Object.values(state.hands).flat()];
    for (const id of Object.keys(state.hands)) state.hands[id] = [];
    state.hands[identity.players[0]!.id] = (['EVIDENCE','EVIDENCE','SCAPEGOAT','VOW_OF_HEARTS','ALIBI'] as ActionKind[]).map(kind => {
      const index = available.findIndex(card => card.kind === kind);
      assert.ok(index >= 0);
      return available.splice(index, 1)[0]!;
    });
    state.deck = available.splice(0, 3); state.discard = available;
    return result;
  },
});
const address = game.server.http.address();
assert.ok(address && typeof address === 'object');
const vite = await createViteServer({configFile: false, root: 'apps/client', server: {
  host:'127.0.0.1', port:5187, strictPort:true, hmr:false, watch:{ignored:['**/*']},
  proxy:{'/socket.io':{target:`http://127.0.0.1:${address.port}`,ws:true}},
}});
await vite.listen();
await mkdir('test-results/mobile-layout',{recursive:true});
const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL ?? 'msedge',headless:true});
const errors: string[] = [];
let activePage: Page | undefined;
async function fits(page: Page) {
  const size = await page.evaluate(() => ({width:innerWidth,scroll:document.documentElement.scrollWidth,
    nav:document.getElementById('mobile-nav')!.getBoundingClientRect().toJSON(),height:innerHeight}));
  assert.ok(size.scroll <= size.width, `No horizontal overflow: ${JSON.stringify(size)}`);
  assert.ok(size.nav.bottom <= size.height && size.nav.top >= 0, 'Navigation fits the visible viewport');
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const {request, actionId} = await import('/src/connection.ts');
    const reply = await request({type:'sync',actionId:actionId()});
    if (!reply.ok || !reply.view) throw new Error('Cannot sync QA view');
    return reply.view;
  });
}
try {
  for (const capacity of [6,10]) {
    const party = await game.party(capacity);
    await game.start(party);
    for (const client of party.slice(1)) await game.accepted(client,{type:'acknowledgeDeal',matchId:client.view!.deal!.matchId});
    const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
    await context.addInitScript(session => sessionStorage.setItem('ashfall.session.v1',JSON.stringify(session)),party[0]!.session);
    const page = await context.newPage(); activePage = page;
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.locator('#lobby[data-phase="PRIVATE_DEAL"]').waitFor();
    await page.locator('#role-continue').click();
    await page.locator('#reveal-all').click();
    assert.equal(await page.locator('.life-identity-art').count(),5);
    await page.screenshot({path:`test-results/mobile-layout/opening-${capacity}.png`});
    await page.locator('#acknowledge').click();
    await page.locator('#lobby[data-phase="DAY"]').waitFor();
    await page.locator('#mobile-nav').waitFor({state:'visible'});
    assert.equal(await page.locator('#seats .table-seat:visible').count(),capacity);
    assert.equal(await page.locator('#day-panel').isVisible(),true,'The hand is visible at the Table');
    assert.equal(await page.locator('#mobile-nav [data-mobile-view="hand"]').count(),0,'There is no separate Hand tab');
    assert.equal(await page.locator('#local-life').isVisible(),false,'Private controls have their own view');
    assert.ok(await page.locator('#match-hud .mobile-turn-time').textContent(),'Countdown is always available');
    for (const [width,height] of [[390,844],[320,640],[430,932],[844,390]]) {
      await page.setViewportSize({width:width!,height:height!});
      await page.mouse.move(1,1);
      await fits(page);
      await page.screenshot({path:`test-results/mobile-layout/table-${capacity}-${width}.png`});
      await page.locator('#mobile-nav [data-mobile-view="table"]').click();
      await fits(page);
      const hand = (await page.locator('#day-panel').boundingBox())!;
      const navigation = (await page.locator('#mobile-nav').boundingBox())!;
      assert.ok(hand.y + hand.height <= navigation.y + 1,'The docked hand fits above the navigation');
      const draw = await page.locator('#draw-cards').boundingBox();
      assert.ok(draw && draw.height >= 44,'Primary controls have finger-sized targets');
      await page.screenshot({path:`test-results/mobile-layout/hand-${capacity}-${width}.png`});
      await page.locator('#mobile-nav [data-mobile-view="table"]').click();
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('#mobile-menu-toggle').click();
    assert.equal(await page.locator('#mobile-menu #copy').isVisible(),true);
    assert.equal(await page.locator('#mobile-menu #reopen').isVisible(),true);
    await page.locator('#mobile-menu #sound-toggle').click();
    assert.equal(await page.locator('#mobile-menu').evaluate((dialog:HTMLDialogElement)=>dialog.open),true,'Toggling a preference keeps the menu open');
    await page.screenshot({path:`test-results/mobile-layout/menu-${capacity}.png`});
    await page.locator('#mobile-menu-close').click();
    await game.accepted(party[1]!,{type:'chat',text:'Can everyone see the council message?'});
    await page.locator('#mobile-nav .chat-unread-badge:not([hidden])').waitFor();
    assert.equal(await page.locator('#mobile-nav .chat-unread-badge').textContent(),'1');
    await page.locator('#chat-toast').waitFor({state:'visible'});
    assert.match(await page.locator('#chat-toast').textContent() ?? '',/council message/);
    assert.equal(await page.locator('#chat-toast').evaluate(element=>getComputedStyle(element).pointerEvents),'none','Preview does not intercept game controls');
    await game.accepted(party[1]!,{type:'chat',text:'Second message while chat is hidden.'});
    await page.waitForFunction(()=>document.querySelector('#mobile-nav .chat-unread-badge')?.textContent==='2');
    await page.screenshot({path:`test-results/mobile-layout/chat-notification-${capacity}.png`});
    await page.locator('#mobile-nav [data-mobile-view="chat"]').click();
    await page.waitForFunction(()=>document.querySelector('#mobile-nav .chat-unread-badge')?.hasAttribute('hidden'));
    await page.locator('#message').fill('Mobile council check');
    await page.locator('#send').click();
    await page.locator('#feed').getByText('Mobile council check',{exact:true}).waitFor();
    await page.locator('#chat-close').click();
    await page.locator('#mobile-nav [data-mobile-view="you"]').click();
    assert.equal(await page.locator('#local-life').isVisible(),true);
    assert.equal(await page.locator('#seats').isVisible(),false);
    assert.equal(await page.locator('#day-panel').isVisible(),false,'Private controls get the full You view');
    await page.screenshot({path:`test-results/mobile-layout/you-${capacity}.png`});
    await page.locator('#local-life .inspect-life').click();
    await page.locator('#reveal-all').click();
    assert.equal(await page.locator('.life-identity-art').count(),5);
    await game.accepted(party[1]!,{type:'chat',text:'This preview should wait outside the private screen.'});
    await page.waitForFunction(()=>document.querySelector('#mobile-nav .chat-unread-badge')?.textContent==='1');
    assert.equal(await page.locator('#chat-toast').isVisible(),false,'Chat previews do not cover private Life cards');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.life-identity-art').count(),0,'Covering removes private Life art');

    await page.locator('#mobile-nav [data-mobile-view="table"]').click();
    const touch = await context.newCDPSession(page);
    const card = (await page.locator('[data-action-kind="SCAPEGOAT"]').boundingBox())!;
    const touchPoint = {x:card.x+card.width/2,y:card.y+card.height/2};
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touchPoint]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...touchPoint,x:touchPoint.x-100}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>document.querySelector('.action-hand')!.scrollLeft > 0);
    assert.equal(await page.locator('body').getAttribute('data-mobile-view'),'table','A quick horizontal swipe browses the hand without selecting one');
    await page.locator('[data-action-kind="EVIDENCE"]').tap();
    assert.equal(await page.locator('body').getAttribute('data-mobile-view'),'table','A card opens target selection');
    await page.locator('[data-group-plus="EVIDENCE"]').tap();
    assert.equal(await page.locator('[data-stack-kind="EVIDENCE"] .stack-controls span').textContent(),'2 / 2','The tray exposes repeat-card quantity controls');
    await page.locator('[data-group-minus="EVIDENCE"]').tap();
    assert.equal(await page.locator('[data-stack-kind="EVIDENCE"] .stack-controls span').textContent(),'1 / 2');
    await page.locator('#seats .is-valid-target').first().tap();
    await page.locator('#confirm-preview').waitFor({state:'visible'});
    const before = await state(page);
    await page.screenshot({path:`test-results/mobile-layout/confirm-${capacity}.png`});
    await page.locator('#cancel-preview').click();
    assert.equal((await state(page)).hand!.length,before.hand!.length,'Cancel spends no card');
    await page.locator('#mobile-nav [data-mobile-view="table"]').click();
    const dragCard = (await page.locator('[data-action-kind="EVIDENCE"]').boundingBox())!;
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:dragCard.x+dragCard.width/2,y:dragCard.y+dragCard.height/2}]});
    await page.locator('#dragged-card').waitFor({state:'visible'});
    const dragTarget = (await page.locator('#seats .is-valid-target').first().boundingBox())!;
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:dragTarget.x+dragTarget.width/2,y:dragTarget.y+dragTarget.height/2}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.locator('#confirm-preview').waitFor({state:'visible'});
    await page.locator('#cancel-preview').click();
    await page.locator('#mobile-nav [data-mobile-view="table"]').click();
    await page.locator('[data-action-kind="EVIDENCE"]').tap();
    const target = page.locator('#seats .is-valid-target').first();
    const targetId = await target.getAttribute('data-player');
    await target.tap();
    await page.locator('#confirm-preview').tap();
    await page.waitForFunction(() => document.getElementById('day-panel')?.dataset.handCount === '4');
    const after = await state(page);
    assert.equal(after.day!.players.find(player => player.playerId === targetId)!.doubt,1,'Confirmed Evidence reaches the authoritative target');
    await page.screenshot({path:`test-results/mobile-layout/played-${capacity}.png`});

    await page.locator('#mobile-nav [data-mobile-view="table"]').click();
    await page.locator('[data-action-kind="SCAPEGOAT"]').click();
    await page.locator(`#seats [data-player="${targetId}"]`).click();
    assert.match(await page.locator('#mobile-selection small').textContent() ?? '',/SECOND/);
    await page.locator('#seats .is-valid-target').first().click();
    await page.locator('#confirm-preview').waitFor({state:'visible'});
    assert.match(await page.locator('.play-preview strong').textContent() ?? '',/→.*→/,'Two targets appear in confirmation');
    await page.locator('#cancel-preview').click();

    await page.setViewportSize({width:1440,height:900});
    await page.locator('.topbar #sound-toggle').waitFor({state:'visible'});
    assert.equal(await page.locator('#mobile-nav').isVisible(),false,'Desktop restores its original layout');
    assert.equal(await page.locator('#action-stage #match-hud').count(),1);
    assert.equal(await page.locator('#day-panel').isVisible(),true);
    await page.screenshot({path:`test-results/mobile-layout/desktop-${capacity}.png`});
    await page.setViewportSize({width:390,height:844});
    await page.locator('#mobile-nav [data-mobile-view="table"]').click();
    await page.reload();
    await page.locator('#lobby[data-phase="DAY"]').waitFor();
    assert.equal(await page.locator('#chat-toast').isVisible(),false,'Reload does not toast historical chat');
    assert.equal(await page.locator('#mobile-nav .chat-unread-badge').isVisible(),false);
    assert.equal(await page.locator('#seats .table-seat:visible').count(),capacity,'Reconnect restores the roster');
    assert.equal(await page.locator('#day-panel').getAttribute('data-hand-count'),'4');

    // Move to Night using the real draw/end-turn commands.
    await page.locator('#mobile-nav [data-mobile-view="table"]').click();
    await page.locator('#end-turn').click();
    for (const client of party.slice(1)) {
      const snapshot = await game.sync(client);
      if (snapshot.phase !== 'DAY' || snapshot.day?.activePlayerId !== client.session!.playerId) continue;
      await game.accepted(client,{type:'drawCards',matchId:snapshot.deal!.matchId,turnNumber:snapshot.day.turnNumber,gameVersion:snapshot.day.version});
    }
    await page.locator('#lobby[data-phase="NIGHT"]').waitFor();
    assert.equal(await page.locator('body').getAttribute('data-mobile-view'),'table','Night brings private choices into view');
    await page.locator('#night-protection').waitFor({state:'visible'});
    await page.screenshot({path:`test-results/mobile-layout/night-${capacity}.png`});
    await page.locator('[data-night="protection"] button').click();
    await page.locator('[data-sealed="protection"]').waitFor({state:'visible'});
    assert.equal((await state(page)).night!.protection!.submitted,true,'Night controls submit the private choice');
    // A browser reload transfers hosting during its brief disconnection.
    const snapshot = await state(page);
    const currentHost = party.find(client => client.session!.playerId === snapshot.hostId)!;
    await game.accepted(currentHost,{type:'reopen',expectedVersion:(await game.sync(currentHost)).version});
    await page.locator('#lobby[data-phase="LOBBY"]').waitFor();
    await page.locator('#ready').waitFor({state:'visible'});
    assert.equal(await page.locator('#mobile-nav').isVisible(),false,'Lobby controls are restored after reopening');
    console.log(`${capacity} players: phone sizes, targeting, cancellation, confirmation, chat, privacy, rotation, reconnect and Night passed.`);
    await context.close();
  }
  assert.deepEqual(errors,[],'No browser errors');
} catch (error) {
  await activePage?.screenshot({path:'test-results/mobile-layout/failure.png'}).catch(()=>{});
  throw error;
} finally {
  await browser.close(); await vite.close(); await game.close();
}
