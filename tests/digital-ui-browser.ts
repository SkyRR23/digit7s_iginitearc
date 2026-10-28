// Real UI + Socket.IO integration. Deterministic scenarios and the clock are
// injected only into an isolated in-process QA server, never into production UI.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { originalPrototypePreset, type ActionKind, type RoomView } from '@ashfall/shared';
import { createDay } from '@ashfall/shared/day';
import { dealIdentities, recordWitchHistory } from '@ashfall/shared/identities';
import { createGameServer } from '../apps/server/src/server.js';

const origin = 'http://127.0.0.1:5183';
process.env.ALLOWED_ORIGINS = origin;
let offset = 0;
const now = () => Date.now() + offset;
let teammateScenario = false;
const game = createGameServer({ rateLimit: false, sweepMs: 25, now,
  randomIndex: max => max - 1,
  identityFactory: ids => {
    const witches = ids.length >= 8 ? 3 : 2;
    const match = dealIdentities(ids, { ...originalPrototypePreset, players: ids.length,
      humanCards: ids.length * 5 - witches - 1, witchCards: witches }, max => max - 1, randomUUID);
    if (!teammateScenario) return match;
    // Two Ashbound holders at the opening reveal; the host also has Lanternkeeper.
    const cards = match.cards.map(card => ({ ...card }));
    for (const [kind, slot] of [['WITCH',0],['CONSTABLE',1]] as const) {
      const source = cards.find(card => card.kind === kind)!;
      const destination = cards.find(card => card.ownerId === ids[0] && card.slot === slot)!;
      [source.kind, destination.kind] = [destination.kind, source.kind];
    }
    return recordWitchHistory({ ...match, cards, players: match.players.map(player => ({ ...player, everWitch: false })) });
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
const captureGuide = process.argv.includes('--capture-guide');
async function guideShot(name: string, page: Page, selector?: string) {
  if (!captureGuide) return;
  await mkdir('test-results/guide',{recursive:true});
  if(name!=='revelation') {
    await page.evaluate(async()=>{
      const {clearGameMoments}=await import('/src/game-moments.ts');clearGameMoments();
      document.querySelectorAll('.fallen-announcement,.scapegoat-announcement,.effect-label,.flying-card,.flying-hidden-life,.effect-trail').forEach(element=>element.remove());
    });
    assert.equal(await page.locator('#game-moment').count(),0,'Guide screenshots never capture an unrelated cinematic');
  }
  if (selector) await page.locator(selector).screenshot({path:`test-results/guide/${name}.png`});
  else await page.screenshot({path:`test-results/guide/${name}.png`});
}
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
async function finishPresentations(pages:Page[]) {
  await Promise.all(pages.map(async page=>{
    await page.evaluate(async()=>{const {clearGameMoments}=await import('/src/game-moments.ts');clearGameMoments();});
  }));
  await Promise.all(pages.map(page=>page.waitForFunction(()=>!document.body.classList.contains('table-paused'))));
}
async function noOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({viewport:innerWidth,document:document.documentElement.scrollWidth,height:innerHeight}));
  assert.ok(dimensions.document <= dimensions.viewport, `No document horizontal overflow: ${JSON.stringify(dimensions)}`);
}
async function sealOpeningCurse(page: Page, targetId?: string) {
  const select=page.locator('#black-cat-target');
  if (!await select.count()) return;
  assert.equal(await page.locator('#acknowledge').isDisabled(),true,'Ashbound must choose the opening curse first');
  const target=targetId ?? await select.locator('option').nth(1).getAttribute('value');
  assert.ok(target); await select.selectOption(target);
  await page.locator('#seal-black-cat:not([disabled])').click();
  await page.locator('.opening-curse strong').waitFor();
}
async function noPileOverlap(page: Page) {
  const piles=page.locator('#table-center');
  if (!await piles.isVisible()) return;
  const spotlight=await page.locator('#action-spotlight').boundingBox();
  const cards=await page.locator('#table-center .pile-card').evaluateAll(nodes=>nodes.map(node=>{const rect=node.getBoundingClientRect();return {top:rect.top,bottom:rect.bottom};}));
  assert.ok(spotlight && cards.every(card=>card.top>=spotlight.y+spotlight.height),'Draw/discard art stays below the action viewport');
  const help=page.locator('#action-spotlight .route-help');
  if (await help.count() && await help.isVisible()) {
    await help.scrollIntoViewIfNeeded();
    const box=await help.boundingBox();
    assert.ok(box && cards.every(card=>card.top>=box.y+box.height),'The help text never shares space with the piles');
  }
}
async function teamMarkers(page: Page, snapshot: RoomView) {
  const allies = snapshot.private?.everWitch ? snapshot.private.witchTeammateIds : [];
  const actual = await page.locator('#seats .is-teammate').evaluateAll(seats => seats.map(seat => (seat as HTMLElement).dataset.player).sort());
  assert.deepEqual(actual,[...allies].sort(),'Only privately authorized teammates receive ally names');
  assert.equal(await page.locator('#seats .ally-tag').count(),allies.length);
  if (snapshot.phase === 'DAY') {
    assert.equal(await page.locator('#seats .is-active .turn-dust').count(),1);
    assert.equal(await page.locator('#seats .is-active').getAttribute('data-player'),snapshot.day!.activePlayerId);
    assert.ok(['rgb(180, 246, 203)','rgb(197, 255, 210)'].includes(await page.locator('#seats .is-active .seat-name h3').evaluate(el=>getComputedStyle(el).color)),'The active name is green, even for a red-tagged ally');
    assert.equal(await page.locator('.match-hud .turn-name').evaluate(el=>getComputedStyle(el).color),'rgb(180, 246, 203)','The HUD uses the same green turn color');
  } else assert.equal(await page.locator('#seats .turn-dust').count(),0,'Turn particles disappear outside Day');
}
try {
  for (const capacity of process.argv.includes('--teammates-only')?[]:[6,10]) {
    offset = 0;
    const contexts = [], pages: Page[] = [], views: RoomView[] = [];
    const view = (i = 0) => views[i]!;
    const id = (i: number) => view(i).you!.playerId;
    for (let i = 0; i < capacity; i++) {
      const context = await browser.newContext({ viewport: i === 1 ? {width:390,height:844} : {width:1440,height:900}, hasTouch: i < 2, reducedMotion: 'reduce' });
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
    if (capacity===6) await guideShot('lobby',host);
    for (const page of pages) { await page.locator('#ready').click(); await page.getByRole('button',{name:'Not ready',exact:true}).waitFor(); }
    await host.locator('#start:not([disabled])').click();
    for (const page of pages) {
      await phase(page,'PRIVATE_DEAL');
      if (!await page.locator('#role-panel.is-open').count()) await page.locator('#role-toggle').click();
      await page.locator('#role-continue').waitFor({state:'visible'});
      assert.equal(await page.locator('.role-profile-art img').count(),1);
      assert.equal(await page.locator('.role-profile-symbol svg').count(),1);
      const own = view(pages.indexOf(page)).private!;
      assert.equal(await page.locator('#role-panel').getAttribute('data-opening-step'),'portrait');
      assert.equal(await page.locator('#role-panel .private-team').count(),0,'The opening portrait is its own screen');
      if (capacity===6 && page===host) await guideShot('portrait',page,'#role-panel');
      await page.locator('#role-continue').click();
      if (own.everWitch) {
        assert.equal(await page.locator('#role-panel').getAttribute('data-opening-step'),'team');
        assert.equal(await page.locator('#role-panel .opening-character').count(),0,'Teammates have a separate screen');
        if (!own.witchTeammateIds.length) assert.match(await page.locator('#role-panel .private-team').textContent() ?? '',/no living teammates yet/i);
        await page.locator('#role-continue').click();
      }
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
        if (capacity===6) await guideShot('life',page,'.private-modal');
      }
      await sealOpeningCurse(page,id(0));
      await page.locator('#acknowledge:not([disabled])').click();
    }
    await phase(host,'DAY');
    console.info(`${capacity} seats: create/join, ready, role and Life reveal passed`);
    assert.equal(await host.locator('#seats .public-seals li').count(),capacity*5);
    assert.equal(await host.locator('#seats .doubt-tile').count(),0,'Zero Doubt has no placeholder DOM marks');
    assert.equal(await host.locator('[data-reveal-table]').count(),0,'No client-selected public Life slot');
    assert.equal(await host.locator('.phase-banner[data-phase-icon="sun"]').count(),1);
    for (let i=0;i<pages.length;i++) { await phase(pages[i]!,'DAY'); await teamMarkers(pages[i]!,view(i)); }
    assert.equal(await host.locator('.turn-dust i').first().evaluate(el=>getComputedStyle(el).display),'none','Reduced motion removes drifting particles');
    assert.ok(view().presentation,'Day opening pauses the table');
    const pausedTime=await host.locator('.hud-deadline').textContent();
    const pausedTurn=view().day!.turnNumber;
    assert.equal(await host.locator('#draw-cards').isDisabled(),true);
    await host.locator('.moment-skip').click();
    await host.locator('#presentation-wait:not([hidden])').waitFor();
    assert.equal(await host.locator('#draw-cards').isDisabled(),true,'One reader cannot resume everyone else');
    offset+=5_000;game.store.sweep();
    assert.equal(view().day!.turnNumber,pausedTurn);
    assert.equal(await host.locator('.hud-deadline').textContent(),pausedTime,'The visible turn clock does not count down during a close-up');
    await finishPresentations(pages);
    // Role powers use the player table, with a safe, explicit confirmation.
    for (const kind of ['SLEUTH','HERBALIST','GOSSIP']) {
      const owner = views.findIndex(v => v.role?.kind === kind);
      if (owner < 0) continue;
      const page = pages[owner]!;
      if (kind === 'HERBALIST') await page.setViewportSize({width:390,height:844});
      const other = views.map((_,i)=>i).filter(i=>i!==owner);
      const target = kind === 'HERBALIST' ? capacity-1 : other[0]!;
      await page.locator('#role-power:not([disabled])').click();
      assert.equal(await page.locator(`#seats [data-player="${id(owner)}"].is-valid-target`).count(),0,'Role powers cannot target their owner');
      await page.locator(`#seats [data-player="${id(target)}"] [data-choose-player]`).click();
      if (kind === 'GOSSIP') await page.locator(`#seats [data-player="${id(other.find(i=>i!==target)!)}"] [data-choose-player]`).click();
      await page.locator('#power-confirmation[open]').waitFor();
      if (capacity===6 && kind==='SLEUTH') await guideShot('power',page,'#power-confirmation');
      assert.equal(await page.locator('#power-no').evaluate(el => el === document.activeElement),true,'No is focused before spending a power');
      assert.equal(view(owner).role!.ability,'AVAILABLE','Selecting targets never spends the power');
      if (kind === 'HERBALIST') await page.screenshot({path:`test-results/digital-ui/power-confirmation-phone-${capacity}.png`});
      await page.locator('#power-no').click();
      assert.equal(view(owner).role!.ability,'AVAILABLE','No preserves the power');
      await page.keyboard.press('Escape');
      await page.locator('#role-power').click();
      await page.locator(`#seats [data-player="${id(target)}"] [data-choose-player]`).click();
      if (kind === 'GOSSIP') await page.locator(`#seats [data-player="${id(other.find(i=>i!==target)!)}"] [data-choose-player]`).click();
      await page.locator('#power-yes').click();
      if (kind === 'SLEUTH') {
        await page.locator('#close-peek').click();
      } else await page.waitForFunction(() => (document.querySelector('#role-power') as HTMLButtonElement)?.disabled);
      if (kind !== 'SLEUTH') {
        await page.locator('#game-moment[data-kind="power"]').waitFor();
        assert.equal(await page.locator('#game-moment[data-kind="power"] .moment-target').count(),kind === 'GOSSIP' ? 2 : 1,'Private power close-ups identify their confirmed recipients');
        assert.match(await page.locator('#game-moment .moment-target').first().textContent() ?? '',new RegExp(view(target).players.find(player=>player.id===id(target))!.name));
      }
      assert.notEqual(view(owner).role!.ability,'AVAILABLE');
      for (let i=0;i<capacity;i++) if (i!==owner) assert.equal(await pages[i]!.locator(`#game-moment[data-kind="power"] img[src="/art/roles/${kind.toLowerCase()}.webp"]`).count(),0,'Private role close-ups never appear for another player');
      if (kind === 'HERBALIST') await page.setViewportSize({width:1440,height:900});
      await finishPresentations(pages);
    }
    await host.emulateMedia({reducedMotion:'no-preference'});
    const evidence = host.locator('[data-stack-kind="EVIDENCE"] [data-card]');
    const handBefore = view().hand!.length;
    // Dragging previews an action. Neither an invalid drop nor a valid drop spends it.
    async function dragEvidence(target: number) {
      const from = await evidence.boundingBox();
      const to = await host.locator(`#seats [data-player="${id(target)}"]`).boundingBox();
      assert.ok(from && to);
      await host.mouse.move(from.x+from.width/2,from.y+from.height/2);
      await host.mouse.down();
      await host.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:12});
      if (target !== 0) {
        await host.locator('#dragged-card.drag-valid').waitFor();
        await host.screenshot({path:`test-results/digital-ui/card-drag-desktop-${capacity}.png`});
      }
      await host.mouse.up();
    }
    await dragEvidence(0);
    assert.equal(await host.locator('.play-preview').count(),0,'A self-drop cancels without playing');
    assert.equal(view().hand!.length,handBefore);
    await dragEvidence(1);
    await host.locator('#confirm-preview').waitFor();
    assert.equal(view().hand!.length,handBefore,'A valid drop still waits for confirmation');
    await host.locator('#cancel-preview').click();
    assert.equal(await host.locator('#dragged-card').count(),0,'The lifted card is cleaned up after dropping');
    if (capacity === 6) {
      await host.setViewportSize({width:390,height:844});
      const touch = await host.context().newCDPSession(host);
      await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
      await host.locator('.action-hand').evaluate(el => { el.scrollLeft = 0; });
      const from = await evidence.boundingBox();
      const to = await host.locator(`#seats [data-player="${id(1)}"]`).boundingBox();
      assert.ok(from && to);
      const x = from.x+from.width/2, y = from.y+from.height/2;
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      await host.locator('#dragged-card').waitFor();
      await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:Math.min(360,to.x+to.width/2),y:to.y+to.height/2}]});
      await host.locator('#dragged-card.drag-valid').waitFor();
      await host.screenshot({path:'test-results/digital-ui/card-drag-touch.png'});
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await host.locator('#confirm-preview').waitFor();
      assert.equal(view().hand!.length,handBefore,'Touch dragging also waits for confirmation');
      await host.locator('#cancel-preview').click();
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-55,y}]});
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      assert.ok(await host.locator('.action-hand').evaluate(el=>el.scrollLeft)>0,'A quick touch swipe still scrolls the hand');
      assert.equal(await host.locator('.action-card.selected').count(),0,'Swiping never selects or plays a card');
      await host.locator('.action-hand').evaluate(el=>{el.scrollLeft=0;});
      const tap = await evidence.boundingBox(); assert.ok(tap);
      await host.evaluate(() => {
        const trace = (window as unknown as {gestureTrace: object[]}).gestureTrace = [];
        for (const type of ['pointerdown','pointerup','pointercancel','click','touchstart','touchend']) document.addEventListener(type,event => {
          const pointer = event as PointerEvent;
          trace.push({type,target:(event.target as HTMLElement).outerHTML.slice(0,130),pointer:pointer.pointerId,button:pointer.button,prevented:event.defaultPrevented});
        },{capture:true});
      });
      await host.touchscreen.tap(tap.x+tap.width/2,tap.y+tap.height/2);
      await host.locator('.action-card.selected').waitFor({timeout:2000}).catch(async error => {
        console.error('Touch tap diagnostics',await host.evaluate(()=>(window as unknown as {gestureTrace:object[]}).gestureTrace)); throw error;
      });
      await host.keyboard.press('Escape');
      await touch.send('Emulation.setTouchEmulationEnabled',{enabled:false}); await touch.detach();
      await host.setViewportSize({width:1440,height:900});
    }
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
    assert.equal(await host.locator(`#seats [data-player="${id(0)}"].is-valid-target`).count(),0,'Targeted cards cannot target the local player');
    await host.locator('#cancel-preview').click();
    assert.equal(await host.locator('.action-card.selected').count(),0,'Cancel dispatches no action');
    await evidence.click(); await host.keyboard.press('Escape');
    assert.equal(await host.locator('.action-card.selected').count(),0,'Escape cancels targeting');
    async function play(kind: ActionKind, targets: number[] = [], protection?: string) {
      await finishPresentations(pages);
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
      if (kind === 'EVIDENCE') { await host.screenshot({path:`test-results/digital-ui/target-${capacity}.png`}); if(capacity===6) await guideShot('card-play',host); }
      await host.locator('#confirm-preview').click();
      await host.waitForFunction(previous => Number(document.querySelector('#day-panel')?.getAttribute('data-game-version')) > previous,version);
      assert.equal(await host.locator('.play-preview').count(),0);
      assert.match(await host.locator('.action-route.resolved .action-actor').textContent() ?? '', new RegExp(`Host ${capacity}`), 'The public action names its actor');
      assert.match(await host.locator('.action-route.resolved .route-card-name').textContent() ?? '', new RegExp(kind === 'VOW_OF_HEARTS' ? 'Vow of Hearts' : kind === 'CINDER_SHIFT' ? 'Cinder Shift' : kind.charAt(0) + kind.slice(1).toLowerCase(),'i'), 'The public action names its card');
      assert.equal(await host.locator('#seats .seat-name.is-action-actor').count(),1);
      for(const index of targets){
        assert.equal(await host.locator(`#seats [data-player="${id(index)}"] .is-action-target h3`).evaluate(el=>getComputedStyle(el).color),'rgb(197, 255, 210)','Target name tag is green');
      }
      assert.equal(await host.locator('.action-actor .action-name').evaluate(el=>getComputedStyle(el).color),'rgb(188, 255, 208)');
    }
    await play('EVIDENCE',[1]);
    assert.equal(view().day!.players.find(p=>p.playerId===id(1))!.doubt,2);
    await play('SCAPEGOAT',[1,2]);
    assert.equal(view().day!.players.find(p=>p.playerId===id(1))!.doubt,0);
    if (await host.locator('.moment-skip').count()) await host.locator('.moment-skip').click();
    await play('WITNESS',[2]);
    await host.locator('#game-moment[data-reveal-stage="announcement"]').waitFor();
    assert.equal(await host.locator('#game-moment img').count(),0,'The name announcement precedes the portrait');
    assert.match(await host.locator('#game-moment h2').textContent() ?? '',/Guest 2.*Life card/s);
    assert.equal(await host.locator('#game-moment').evaluate(el=>el.style.getPropertyValue('--moment-duration')),'8000ms');
    await host.locator('#game-moment[data-reveal-stage="portrait"]').waitFor();
    await host.locator('.moment-hold').click();
    assert.equal(await host.locator('.moment-hold').getAttribute('aria-pressed'),'true');
    assert.equal(await host.locator('#game-moment .revealed-character-card img').count(),1);
    await host.screenshot({path:`test-results/digital-ui/impact-desktop-${capacity}.png`});
    if(capacity===6) await guideShot('revelation',host,'.moment-content');
    await host.setViewportSize({width:390,height:844}); await noOverflow(host);
    const targetBox=await host.locator('#game-moment .revealed-character-card').boundingBox();
    assert.ok(targetBox && targetBox.x>=0 && targetBox.x+targetBox.width<=390,'The full Life portrait fits on phones');
    await host.screenshot({path:`test-results/digital-ui/impact-phone-${capacity}.png`});
    await host.setViewportSize({width:1440,height:900});
    await host.locator('.moment-next').click();
    await host.locator('#game-moment[data-reveal-stage="position"]').waitFor();
    assert.equal(await host.locator('.reveal-life-row li').count(),5);
    const revealedSlot=view().effects!.find(effect=>effect.type==='REVEAL'&&effect.targetId===id(2))!.slot!;
    assert.equal(await host.locator('.reveal-life-row .revealed-position').getAttribute('data-reveal-slot'),String(revealedSlot));
    await host.screenshot({path:`test-results/digital-ui/revealed-slot-${capacity}.png`});
    await host.locator('.moment-next').click();
    await host.locator('#game-moment[data-kind="verdict"]').waitFor();
    assert.match(await host.locator('#game-moment h2').textContent() ?? '',/Ashbound still live among us/);
    await host.locator('.moment-skip').click();
    await finishPresentations(pages);
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
    for (let i=0;i<pages.length;i++) {
      await pages[i]!.waitForFunction(version=>Number(document.querySelector('#day-panel')?.getAttribute('data-game-version'))>=version,view().day!.version);
      await teamMarkers(pages[i]!,view(i));
    }
    assert.ok(view().feed.some(e=>e.text==='A conspiracy shifted the council’s hidden lives.'));
    await play('ASYLUM',[2]);
    await finishPresentations(pages);
    console.info(`${capacity} seats: targeting, card details, seven-Doubt reveal, protections and links passed`);
    await pages[1]!.reload(); await phase(pages[1]!,'DAY');
    assert.equal(await pages[1]!.locator('#game-moment').count(),0,'Reconnect never replays old close-ups');
    assert.equal(await pages[1]!.locator('#private-panel:not([hidden])').count(),0,'Reconnect covers private display');
    assert.equal(await pages[1]!.locator('#role-panel.is-open').count(),0);
    await teamMarkers(pages[1]!,view(1));
    assert.equal(await pages[1]!.locator(`#seats [data-player="${id(2)}"] .doubt-tile.filled`).count(),1,'Reconnect restores Doubt');
    if (await host.locator('.moment-skip').count()) await host.locator('.moment-skip').click();
    await host.screenshot({path:`test-results/digital-ui/game-${capacity}.png`});
    for (const [width,height] of [[390,844],[360,640],[320,640],[390,740],[768,1024],[568,320],[640,360],[844,390],[1075,700],[1075,884],[1440,720],[1440,900]]) {
      await host.setViewportSize({width,height}); await noOverflow(host);
      await noPileOverlap(host);
      const nameSizes = await host.locator('#seats .seat-name h3').evaluateAll(names => names.map(name => parseFloat(getComputedStyle(name).fontSize)));
      assert.ok(nameSizes.every(size => size >= 17), 'Every player name remains readable, including remote players');
      if (width > 680 && height > 600) {
        const positions = await host.locator('#seats .table-seat').evaluateAll(seats => seats.map(seat => seat.getBoundingClientRect().x));
        assert.ok(Math.max(...positions) - Math.min(...positions) > width / 3, 'Players are distributed on both sides');
      }
      if (width > height && height <= 600) {
        const roster = await host.locator('.tabletop-panel').boundingBox();
        const stage = await host.locator('#action-stage').boundingBox();
        const dock = await host.locator('#day-panel').boundingBox();
        const life = await host.locator('#local-life').boundingBox();
        assert.ok(roster && stage && dock && life && roster.height > 60 && stage.height > 60,'Landscape preserves a usable roster and action area');
        assert.ok(stage.y+stage.height <= dock.y+1 && roster.y+roster.height <= life.y+1,'Landscape panels do not overlap');
        if (height <= 350) {
          const target = await host.locator('#action-spotlight .spotlight-player h2').first().boundingBox();
          assert.ok(target && target.y >= stage.y && target.y+target.height <= stage.y+stage.height,'The compact landscape summary keeps its target name visible');
          for (const selector of ['.action-actor b','.route-card-name h2']) {
            const box = await host.locator(`#action-spotlight ${selector}`).boundingBox();
            assert.ok(box && box.y >= stage.y && box.y+box.height <= stage.y+stage.height,`Compact landscape keeps ${selector} visible: ${JSON.stringify({box,stage,layout:await host.locator('#action-spotlight').evaluate(el=>({scrollTop:el.scrollTop,height:el.clientHeight,scrollHeight:el.scrollHeight,routeRows:getComputedStyle(el.querySelector('.action-route')!).gridTemplateRows}))})}`);
          }
        }
      }
      const details = host.locator('[data-card-details]').first();
      const bounds = await details.boundingBox();
      const hand = await host.locator('.action-hand').boundingBox();
      assert.ok(bounds && hand && bounds.y + bounds.height <= hand.y + hand.height + 1,`Card details stays reachable at ${width} × ${height}`);
      assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= height,`Hand controls stay inside the viewport at ${width} × ${height}`);
      await details.click(); await host.locator('#card-explanation[role="dialog"]').waitFor();
      const pop = await host.locator('#card-explanation').boundingBox();
      assert.ok(pop && pop.x >= 0 && pop.y >= 0 && pop.x + pop.width <= width && pop.y + pop.height <= height,'Details pop-up remains inside viewport');
      await host.locator('.details-close').click();
      if (width === 390) await host.screenshot({path:`test-results/digital-ui/phone-${capacity}.png`});
      if (width === 320 || width === 360 || height < 500) await host.screenshot({path:`test-results/digital-ui/layout-${width}-${height}-${capacity}.png`});
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
    for (const page of pages) { await phase(page,'NIGHT'); assert.equal(await page.locator('#send').isDisabled(),true); await teamMarkers(page,view(pages.indexOf(page))); }
    await finishPresentations(pages);
    assert.equal(await host.locator('.phase-banner[data-phase-icon="moon"]').count(),1);
    const nightOwner = views.findIndex(v => v.night?.attack || v.night?.protection);
    if (nightOwner >= 0) {
      const page = pages[nightOwner]!;
      await page.setViewportSize({width:640,height:360});
      const panel = await page.locator('#night-panel').boundingBox();
      assert.ok(panel && panel.y >= 0 && panel.y+panel.height <= 360,'Landscape night choices remain on screen');
      await page.locator('#night-panel button').last().scrollIntoViewIfNeeded();
      await page.screenshot({path:`test-results/digital-ui/night-landscape-${capacity}.png`});
      if(capacity===6) await guideShot('night',page,'#night-panel');
      await page.setViewportSize(nightOwner===1 ? {width:390,height:844} : {width:1440,height:900});
    }
    const hexer = views.findIndex(v => v.role?.kind === 'HEXER');
    if (hexer >= 0) {
      const page = pages[hexer]!;
      const target = views.findIndex((_,i)=>i!==hexer && i!==1 && i!==2);
      await page.locator('#role-power:not([disabled])').click();
      assert.equal(await page.locator('#night-panel').isVisible(),false,'Night choices make room for table targeting');
      await page.locator(`#seats [data-player="${id(target)}"] [data-choose-player]`).click();
      await page.locator('#power-yes').click();
      await page.waitForFunction(() => (document.querySelector('#role-power') as HTMLButtonElement)?.disabled);
      assert.equal(view(hexer).role?.ability,'USED');
      for (let i=0;i<capacity;i++) if (i!==hexer) assert.equal(await pages[i]!.locator('#game-moment img[src="/art/roles/hexer.webp"]').count(),0);
      await finishPresentations(pages);
    }
    for (let i=0;i<capacity;i++) {
      const page = pages[i]!;
      if (view(i).night?.attack) { await page.locator('#night-attack').selectOption(id(1)); await page.locator('[data-night="attack"] button').click(); }
      if (view(i).night?.protection) { await page.locator('#night-protection').selectOption(id(2)); await page.locator('[data-night="protection"] button').click(); }
    }
    await host.screenshot({path:`test-results/digital-ui/night-${capacity}.png`});
    offset = view().day!.deadline! - Date.now() + 1; game.store.sweep();
    await phase(host,'DAWN');
    assert.equal(view().dawn!.deceasedId,id(1));
    await finishPresentations(pages);
    offset = view().day!.deadline! - Date.now() + 1; game.store.sweep();
    await phase(host,'DAY');
    await finishPresentations(pages);
    console.info(`${capacity} seats: Draw 2, Night privacy, Dawn and death passed`);
    assert.equal(await host.locator(`#seats [data-player="${id(1)}"] .death-mark`).count(),1);
    for (let i=0;i<pages.length;i++) {
      await phase(pages[i]!,'DAY'); await teamMarkers(pages[i]!,view(i));
      assert.equal(await pages[i]!.locator(`#seats [data-player="${id(1)}"].is-teammate`).count(),0,'Dead players lose their ally marker');
    }
    const witch = capacity-1;
    for (let i=0;i<capacity && view().phase!=='GAME_OVER';i++) {
      if (!view(i).deal!.players.find(p=>p.playerId===id(i))!.alive) continue;
      const page = pages[i]!;
      await page.locator('#power-info').click();
      await page.locator('#vote-action select').selectOption(id(witch));
      await page.locator('#vote-action button').click();
      await page.locator('#role-close').click();
      await new Promise(resolve=>setTimeout(resolve,70));
    }
    await phase(host,'GAME_OVER');
    assert.match(await host.locator('.outcome').textContent() ?? '',/village survives/i);
    await host.screenshot({path:`test-results/digital-ui/result-${capacity}.png`});
    if(capacity===6) { if(await host.locator('.moment-skip').count()) await host.locator('.moment-skip').click(); await guideShot('victory',host,'#action-spotlight'); }
    await host.locator('#reopen').click(); await phase(host,'LOBBY');
    assert.equal(await host.locator('#role-panel img').count(),0,'Rematch clears the private role');
    assert.equal(await host.locator('#seats .public-seals').count(),0);
    assert.equal(await host.locator('#start').isDisabled(),true,'Rematch requires ready again');
    assert.equal(await host.locator('#seats .is-teammate, #seats .turn-dust, .private-team').count(),0,'Rematch clears team and turn presentation');
    summaries.push({capacity,playersJoined:pages.length,draws,roleAndLife:true,hoverKeyboardTouchDetails:true,
      targetedAndGlobal:true,sevenDoubt:true,protectionAndLinks:true,nightDawnDeath:true,reconnect:true,voteResultsRematch:true});
    for (const context of contexts) await context.close();
  }
  // A separate opening deal checks actual teammates at match start without
  // changing the full game scenarios' deterministic victory conditions.
  teammateScenario = true; offset = 0;
  const teamContexts = [], teamPages: Page[] = [], teamViews: RoomView[] = [];
  for (let i=0;i<10;i++) {
    const context = await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
    teamContexts.push(context);
    const page = await context.newPage(); teamPages.push(page); observe(page,next=>{teamViews[i]=next;});
    await page.goto(origin); await page.locator('#create:not([disabled])').waitFor();
    await page.locator('#name').fill(i===0 ? 'Ash & Ember' : `Ally test ${i}`);
    if (!i) { await page.locator('#capacity').selectOption('10'); await page.locator('#create').click(); }
    else { await page.locator('#room-code').fill(teamViews[0]!.code); await page.locator('#join').click(); }
    await phase(page,'LOBBY');
    await page.locator('#ready').click();
  }
  await teamPages[0]!.locator('#start:not([disabled])').click();
  for (let i=0;i<10;i++) {
    const page = teamPages[i]!; await phase(page,'PRIVATE_DEAL');
    if (!await page.locator('#role-panel.is-open').count()) await page.locator('#role-toggle').click();
    await page.locator('#role-continue').waitFor({state:'visible'});
    const own = teamViews[i]!.private!;
    const expected = own.witchTeammateIds;
    assert.equal(await page.locator('#role-panel .private-team').count(),0);
    assert.equal(await page.locator(`.opening-screen.${own.everWitch ? 'opening-ashbound' : 'opening-gold'}`).count(),1);
    if (own.everWitch) await page.screenshot({path:`test-results/digital-ui/ashbound-portrait-${i}.png`});
    await page.locator('#role-continue').click();
    if (own.everWitch) {
      assert.equal(await page.locator('#role-panel').getAttribute('data-opening-step'),'team');
      assert.match(await page.locator('#role-panel .private-team').textContent() ?? '',/Your teammates are:/);
      const ids = await page.locator('#role-panel [data-teammate]').evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).dataset.teammate));
      assert.deepEqual(ids,expected);
      await page.screenshot({path:`test-results/digital-ui/teammates-reveal-${i}.png`});
      if (i===0) {
        for (const width of [390,320]) {
          await page.setViewportSize({width,height:640}); await noOverflow(page);
          const names = await page.locator('#role-panel .team-names').boundingBox();
          assert.ok(names && names.y>=0 && names.y+names.height<=640,'Teammate names are visible immediately on small phones');
          await page.screenshot({path:`test-results/digital-ui/teammates-reveal-${width}.png`});
        }
        await page.setViewportSize({width:1440,height:900});
      }
      await page.locator('#role-continue').click();
    }
    await page.locator('#reveal-all').click();
    assert.equal(await page.locator('#private-panel .private-team').count(),0,'Life cards are a separate opening screen');
    if(i===0) assert.match(await page.locator('.private-allegiance').textContent() ?? '',/Lanternkeeper protection available/);
    await sealOpeningCurse(page,teamViews[0]!.you!.playerId);
    await page.locator('#acknowledge:not([disabled])').click();
  }
  for (let i=0;i<10;i++) { await phase(teamPages[i]!,'DAY'); await teamMarkers(teamPages[i]!,teamViews[i]!); }
  await finishPresentations(teamPages);
  const allyPage = teamPages[9]!;
  if (await allyPage.locator('.moment-skip').count()) await allyPage.locator('.moment-skip').click();
  const activeAlly = allyPage.locator('#seats .is-active.is-teammate');
  await activeAlly.scrollIntoViewIfNeeded();
  assert.equal(await activeAlly.count(),1,'An ally taking a turn keeps both team and turn indicators');
  assert.equal(await activeAlly.locator('.turn-dust i').first().evaluate(el=>getComputedStyle(el).animationName),'turn-mote');
  for (const [width,height] of [[1440,900],[768,1024],[390,844],[320,640],[640,360]]) {
    await allyPage.setViewportSize({width,height}); await noOverflow(allyPage);
    await activeAlly.scrollIntoViewIfNeeded();
    assert.equal(await activeAlly.locator('.ally-tag').isVisible(),true);
    const name = await activeAlly.locator('h3').boundingBox(); assert.ok(name && name.width>30,'The ally badge leaves room for the name');
    await allyPage.screenshot({path:`test-results/digital-ui/teammates-${width}-${height}.png`});
  }
  await allyPage.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await activeAlly.locator('.turn-dust i').first().evaluate(el=>getComputedStyle(el).display),'none');
  await teamPages[0]!.locator('#draw-cards:not([disabled])').click();
  await allyPage.waitForFunction(id=>document.querySelector('#seats .is-active')?.getAttribute('data-player')!==id,teamViews[0]!.you!.playerId);
  await teamMarkers(allyPage,teamViews[9]!);
  assert.equal(await activeAlly.count(),0,'The green dust follows the turn, while the red ally tag remains');
  assert.equal(await allyPage.locator('#seats .is-teammate').count(),1);
  assert.equal(await allyPage.locator('#seats .is-teammate .seat-name h3').evaluate(el=>getComputedStyle(el).color),'rgb(255, 178, 184)','A teammate returns to their red name tag after their turn');
  await allyPage.setViewportSize({width:390,height:844});
  await allyPage.locator('#seats .is-teammate').scrollIntoViewIfNeeded();
  await allyPage.screenshot({path:'test-results/digital-ui/teammates-red-phone.png'});
  for (const context of teamContexts) await context.close();
  teammateScenario = false;
  console.info('Private teammate reveal, Lanternkeeper overlap, ally/turn colors, particles, mobile layouts and privacy passed');
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
  await botPage.locator('#role-continue').click();
  if(await botPage.locator('#role-panel.is-open[data-opening-step="team"]').count()) await botPage.locator('#role-continue').click();
  await botPage.locator('#reveal-all').click();
  await sealOpeningCurse(botPage);
  await botPage.locator('#acknowledge:not([disabled])').click(); await phase(botPage,'DAY');
  await noOverflow(botPage); await botPage.screenshot({path:'test-results/digital-ui/bots-ten-phone.png'});
  await botContext.close();
  console.info('10-seat bot lobby: capacity, difficulty, add/remove/fill and start passed');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({summaries,errors},null,2));
} catch (error) {
  const page = browser.contexts()[0]?.pages()[0];
  if (page) {
    await page.screenshot({path:'test-results/digital-ui/failure.png',fullPage:true});
    console.error(await page.evaluate(() => ({ phase: document.querySelector('#lobby')?.getAttribute('data-phase'), focused: document.activeElement?.outerHTML.slice(0,250), notice: document.querySelector('#notice')?.textContent })));
  }
  throw error;
} finally { await browser.close(); await vite.close(); await game.close(); }
if(captureGuide) {
  await mkdir('apps/client/public/guide',{recursive:true});
  for(const name of ['lobby','portrait','life','card-play','power','revelation','night','victory'])
    await copyFile(`test-results/guide/${name}.png`,`apps/client/public/guide/${name}.png`);
  console.info('Published eight demonstration-match screenshots to the bundled game guide.');
}
