import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,type Page} from 'playwright';
import {createServer as createViteServer} from 'vite';
import {originalPrototypePreset,type ActionKind} from '@ashfall/shared';
import {createDay} from '@ashfall/shared/day';
import {createHarness,type Client} from './socket-harness';
const origin='http://127.0.0.1:5189';process.env.ALLOWED_ORIGINS=origin;
const game=await createHarness(60_000,{presentations:true,rateLimit:false,randomIndex:max=>max-1,dayFactory:(identity,now)=>{
 const result=createDay(identity,{...originalPrototypePreset,turnTimeoutMs:600_000},max=>max-1,randomUUID,now),state=result.state;
 const cards=[...state.deck,...Object.values(state.hands).flat()];for(const id of Object.keys(state.hands))state.hands[id]=[];
 state.hands[identity.players[0]!.id]=(['TESTIMONY','TESTIMONY','TESTIMONY','EVIDENCE','EVIDENCE','PIETY','PIETY'] as ActionKind[]).map(kind=>{const index=cards.findIndex(card=>card.kind===kind);assert.ok(index>=0);return cards.splice(index,1)[0]!;});state.deck=cards;return result;
}});
const address=game.server.http.address();assert.ok(address&&typeof address==='object');
const vite=await createViteServer({configFile:false,root:'apps/client',server:{host:'127.0.0.1',port:5189,strictPort:true,hmr:false,watch:{ignored:['**/*']},proxy:{'/socket.io':{target:`http://127.0.0.1:${address.port}`,ws:true}}}});await vite.listen();
await mkdir('test-results/game-interactions',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});const errors:string[]=[],nativeDialogs:string[]=[];
let activePage:Page|undefined;
async function snapshot(page:Page){return page.evaluate(async()=>{const {request,actionId}=await import('/src/connection.ts');const reply=await request({type:'sync',actionId:actionId()});if(!reply.ok||!reply.view)throw new Error(JSON.stringify(reply));return reply.view;});}
async function finishOthers(party:Client[]){for(const client of party.slice(1)){const view=await game.sync(client);if(view.presentation?.awaitingYou)await game.accepted(client,{type:'finishPresentation',matchId:view.deal!.matchId,presentationId:view.presentation.id});}}
async function tools(page:Page,width:number,selector:string){if(width<681)await page.locator('#mobile-menu-toggle').click();await page.locator(selector).click();}
async function count(page:Page,expected:number){assert.equal(await page.locator('[data-stack-kind="TESTIMONY"] .stack-controls span').textContent(),`${expected} / 3`);}
try{
 for(const [width,exit] of [[390,'end'],[1280,'leave']] as const){
  const party=await game.six();await game.start(party);for(const client of party.slice(1))await game.accepted(client,{type:'acknowledgeDeal',matchId:client.view!.deal!.matchId});
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:width===390,reducedMotion:'reduce'});
  await context.addInitScript(session=>sessionStorage.setItem('ashfall.session.v1',JSON.stringify(session)),party[0]!.session!);
  const page=await context.newPage();activePage=page;page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>{nativeDialogs.push(dialog.message());void dialog.dismiss();});
  await page.goto(origin);await page.locator('#role-continue').click();if(await page.locator('#role-continue').isVisible())await page.locator('#role-continue').click();await page.locator('#reveal-all').click();await page.locator('#acknowledge').click();
  await page.locator('#game-moment[data-event="opening-curse"]').waitFor();assert.equal(await page.locator('#game-moment h2').textContent(),'Host');
  assert.equal(await page.locator('#game-moment .moment-actor').count(),0,'The public Curse event does not identify a secret voter');
  assert.equal((await snapshot(page)).day!.deadline,null,'The new event uses the synchronized pause');
  await page.locator('#game-moment .moment-hold').click();
  for(const [w,h] of [[320,640],[390,844],[844,390],[1280,844]]){
   await page.setViewportSize({width:w!,height:h!});
   assert.ok(await page.locator('#game-moment h2').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));
   await page.screenshot({path:`test-results/game-interactions/opening-curse-${w}.png`});
  }
  await page.setViewportSize({width,height:844});await page.locator('#game-moment .moment-next').click();await page.locator('#game-moment[data-kind="phase"]').waitFor();await page.locator('#game-moment .moment-skip').click();await finishOthers(party);await page.locator('body:not(.table-paused)').waitFor();
  assert.ok((await snapshot(page)).day!.deadline);
  const card=page.locator('[data-action-kind="TESTIMONY"]');
  for(let n=1;n<=3;n++){if(width===390)await card.tap({position:{x:50,y:65}});else await card.click();await count(page,n);}
  if(width===390)await card.tap({position:{x:50,y:65}});else await card.click();await count(page,3);assert.ok(await page.locator('[data-group-plus="TESTIMONY"]').isDisabled(),'Further taps stay capped at the available cards');
  await page.locator('[data-group-minus="TESTIMONY"]').click();await count(page,2);
  await page.locator('[data-group-quantity="TESTIMONY"]').click();await page.locator('.game-prompt[data-prompt="quantity"]').waitFor();
  assert.equal(await page.locator('.game-prompt h2').textContent(),'How many cards?');await page.keyboard.press('Escape');await count(page,2);
  await page.locator('[data-group-quantity="TESTIMONY"]').click();await page.locator('#card-quantity').fill('0');assert.ok(await page.locator('.prompt-confirm').isDisabled());
  await page.locator('.prompt-all').click();assert.equal(await page.locator('#card-quantity').inputValue(),'3');await page.locator('[data-step="-1"]').click();
  await page.screenshot({path:`test-results/game-interactions/quantity-${width}.png`});await page.locator('.prompt-confirm').click();await count(page,2);
  assert.equal((await snapshot(page)).hand!.length,7,'Selecting quantities does not spend a card');
  // Non-repeatable protections still obey the existing one-at-a-time rule.
  await page.locator('[data-action-kind="PIETY"]').click();assert.ok(await page.locator('[data-group-quantity="PIETY"]').isDisabled());assert.ok(await page.locator('[data-group-plus="PIETY"]').isDisabled());
  await card.click();await page.locator('[data-group-quantity="TESTIMONY"]').click();await page.locator('#card-quantity').fill('2');await page.locator('.prompt-confirm').click();
  const target=party[1]!.session!.playerId;await page.locator(`#seats [data-player="${target}"]`).click();
  assert.match(await page.locator('#confirm-preview').textContent()??'',/×2/);await page.locator('#confirm-preview').click();
  await page.locator('#game-moment[data-card-kind="TESTIMONY"]').waitFor();assert.match(await page.locator('#game-moment h2').textContent()??'',/×2/);
  await page.locator('#game-moment .moment-skip').click();await finishOthers(party);await page.locator('body:not(.table-paused)').waitFor();
  const played=await snapshot(page);assert.equal(played.hand!.length,5);assert.equal(played.day!.players.find(p=>p.playerId===target)!.doubt,6,'The server receives exactly two selected Testimony cards');
  await tools(page,width,'#leave');await page.locator('.game-prompt[data-prompt="leave"]').waitFor();
  assert.match(await page.locator('.prompt-message').textContent()??'',/forfeits your seat/);await page.locator('.prompt-cancel').click();assert.equal((await snapshot(page)).phase,'DAY');
  if(exit==='end'){
   await tools(page,width,'#reopen');await page.locator('.game-prompt[data-prompt="end"]').waitFor();await page.keyboard.press('Escape');assert.equal((await snapshot(page)).phase,'DAY');
   await tools(page,width,'#reopen');await page.locator('.game-prompt[data-prompt="end"]').waitFor();
  }else {await tools(page,width,'#leave');await page.locator('.game-prompt[data-prompt="leave"]').waitFor();}
  // Live room versions can change while a custom (nonblocking) dialog is open.
  await game.accepted(party[2]!,{type:'chat',text:'A message arrived while the confirmation was open.'});
  await page.waitForTimeout(100);await page.screenshot({path:`test-results/game-interactions/confirm-${exit}-${width}.png`});await page.locator('.prompt-confirm').click();
  await page.locator('#entry:not([hidden])').waitFor();assert.equal(await page.locator('#lobby').isVisible(),false);assert.equal(await page.evaluate(()=>sessionStorage.getItem('ashfall.session.v1')),null);
  const peer=await game.sync(party[1]!);
  if(exit==='end'){assert.equal(peer.phase,'LOBBY');assert.equal(peer.players.length,5);assert.ok(!peer.players.some(p=>p.id===party[0]!.session!.playerId));}
  else{const old=peer.players.find(p=>p.id===party[0]!.session!.playerId)!;assert.ok(old.abandoned);assert.ok(peer.deal!.players.find(p=>p.playerId===old.id)!.seals.every(s=>s.revealed));assert.notEqual(peer.phase,'LOBBY');}
  await page.screenshot({path:`test-results/game-interactions/menu-${exit}-${width}.png`});await context.close();console.log(`${width}px: opening event, repeated taps, quantity dialog, exact stacked play and ${exit} to menu passed.`);
 }
 assert.deepEqual(nativeDialogs,[],'No browser localhost confirmation is used');assert.deepEqual(errors,[]);
 await writeFile('test-results/game-interactions/results.json',JSON.stringify({openingCursePublicOnly:true,synchronizedPause:true,widths:[320,390,844,1280],repeatedTaps:true,quantityPicker:true,exactTwoCardPlay:true,nonRepeatableRules:true,cancelKeepsMatch:true,liveVersionDuringConfirmation:true,leaveToMenu:true,endMatchToMenu:true,nativeDialogs,pageErrors:errors},null,2));
}catch(error){await activePage?.screenshot({path:'test-results/game-interactions/failure.png'}).catch(()=>{});throw error;}
finally{await browser.close();await vite.close();await game.close();}
