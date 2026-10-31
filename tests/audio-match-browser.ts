// Real six-seat match and two browser mixers, with deterministic test-only cards/clock.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,type Page} from 'playwright';
import {createServer as createViteServer} from 'vite';
import {originalPrototypePreset,type ActionKind,type DayIntent} from '@ashfall/shared';
import {createDay} from '@ashfall/shared/day';
import {dealIdentities} from '@ashfall/shared/identities';
import {createHarness,type Client,type Input} from './socket-harness';
let clock=Date.now();const origin='http://127.0.0.1:5188';process.env.ALLOWED_ORIGINS=origin;
const game=await createHarness(60_000,{presentations:true,rateLimit:false,now:()=>clock,randomIndex:max=>max-1,
 identityFactory:ids=>dealIdentities(ids,{...originalPrototypePreset,players:6,humanCards:28,witchCards:1},max=>max-1,randomUUID),
 dayFactory:(identity,now)=>{
  const result=createDay(identity,{...originalPrototypePreset,turnTimeoutMs:600_000},max=>max-1,randomUUID,now),s=result.state;
  const cards=[...s.deck,...Object.values(s.hands).flat()];for(const id of Object.keys(s.hands))s.hands[id]=[];
  const take=(kind:ActionKind)=>{const index=cards.findIndex(c=>c.kind===kind);assert.ok(index>=0,kind);return cards.splice(index,1)[0]!;};
  s.hands[identity.players[0]!.id]=(['EVIDENCE','ALIBI','WHISPER','WITNESS'] as const).map(take);
  s.deck=[take('ALIBI'),take('EVIDENCE')];
  s.discard=cards.filter(c=>!['CONSPIRACY','CURSE','COUNCIL_BELL'].includes(c.kind));
  s.hands[identity.players[4]!.id]=cards.filter(c=>['CONSPIRACY','CURSE','COUNCIL_BELL'].includes(c.kind));
  return result;
 }});
const address=game.server.http.address();assert.ok(address&&typeof address==='object');
const vite=await createViteServer({configFile:false,root:'apps/client',server:{host:'127.0.0.1',port:5188,strictPort:true,hmr:false,watch:{ignored:['**/*']},proxy:{'/socket.io':{target:`http://127.0.0.1:${address.port}`,ws:true}}}});
await vite.listen();await mkdir('test-results/audio',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=user-gesture-required']});
const pages=new Map<Client,Page>(),errors:string[]=[];
async function send(client:Client,input:Input){
 const page=pages.get(client);
 if(!page)return game.accepted(client,input);
 const reply=await page.evaluate(async input=>{const {request,actionId}=await import('/src/connection.ts');return request({...input,actionId:input.actionId??actionId()} as any);},input);
 assert.ok(reply.ok,JSON.stringify(reply));if(reply.ok&&reply.view)client.view=reply.view;return reply;
}
async function sync(client:Client){await send(client,{type:'sync'});return client.view!;}
async function intent(client:Client,input:DayIntent){const v=await sync(client);await send(client,{...input,matchId:v.deal!.matchId,turnNumber:v.day!.turnNumber,gameVersion:v.day!.version});}
async function finish(party:Client[]){for(const client of party){const v=await sync(client);if(v.presentation?.awaitingYou)await send(client,{type:'finishPresentation',matchId:v.deal!.matchId,presentationId:v.presentation.id});}await sync(party[0]!);}
async function mixer(page:Page){return page.evaluate(()=>{const a=(window as any).audio,v=[...a.media].find((v:any)=>v.channel==='music'&&!v.retiring);return {asset:v?.asset,time:v?.element.currentTime,paused:v?.element.paused,copies:[...a.media].filter((v:any)=>v.channel==='music'&&!v.retiring).length,starts:(window as any).sampleStarts};});}
try{
 const party=await game.six();
 for(const [index,width] of [[0,390],[5,1280]]){
  const client=party[index!]!,context=await browser.newContext({viewport:{width:width!,height:844}});
  await context.addInitScript(session=>{sessionStorage.setItem('ashfall.session.v1',JSON.stringify(session));(window as any).sampleStarts=0;const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args:any[]){(window as any).sampleStarts++;return start.apply(this,args as any);};},client.session!);
  const page=await context.newPage();pages.set(client,page);page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);await page.locator('#lobby[data-phase="LOBBY"]').waitFor();
  await page.evaluate(async()=>{const {audio}=await import('/src/audio.ts');(window as any).audio=audio;(window as any).audioCalls=[];const play=audio.play.bind(audio);audio.play=(cue:any,key:any,scope?:string)=>{(window as any).audioCalls.push({cue,kind:document.getElementById('game-moment')?.dataset.kind,stage:document.getElementById('game-moment')?.dataset.revealStage});play(cue,key,scope);};});
  await page.locator('body').click({position:{x:4,y:4}});await page.waitForFunction(()=>[...(window as any).audio.media].some((v:any)=>v.asset==='old-tower-inn'&&!v.element.paused&&v.element.readyState>=2));
 }
 const host=party[0]!,page=pages.get(host)!,evil=party[5]!,evilPage=pages.get(evil)!;
 for(const client of party)await send(client,{type:'ready',ready:true,expectedVersion:(await sync(client)).version});
 await send(host,{type:'start',expectedVersion:(await sync(host)).version});
 for(const client of party){
  const p=pages.get(client);
  if(p){await p.locator('#role-continue').click();if(await p.locator('#role-continue').isVisible())await p.locator('#role-continue').click();await p.locator('#reveal-all').click();await p.locator('#acknowledge').click();}
  else await send(client,{type:'acknowledgeDeal',matchId:(await sync(client)).deal!.matchId});
 }
 await send(evil,{type:'chooseBlackCat',matchId:(await sync(evil)).deal!.matchId,targetId:host.session!.playerId});
 await page.locator('#game-moment[data-kind="event"]').waitFor();
 await finish(party);
 console.log('Audio match: lobby and opening complete.');

 await page.waitForFunction(()=>[...(window as any).audio.media].some((v:any)=>v.asset==='town-in-ruins'&&!v.retiring&&v.element.currentTime>0));
 await page.waitForFunction(()=>(window as any).audio.cache.has('card-cut'));
 const day=await mixer(page);
 for(const kind of ['EVIDENCE','ALIBI','WHISPER'] as const){
  // Select in the real hand to warm the appropriate recording before confirmation.
  await page.locator(`[data-action-kind="${kind}"]`).click();await page.waitForTimeout(500);
  const v=await sync(host);await intent(host,{type:'playCard',cardId:v.hand!.find(c=>c.kind===kind)!.id,targetId:party[1]!.session!.playerId});
  if(kind==='WHISPER')await page.locator('#game-moment[data-card-kind="WHISPER"]').waitFor();
  await finish(party);
  assert.equal((await mixer(page)).asset,'town-in-ruins');
 }
 assert.ok((await mixer(page)).time>day.time,'Card actions do not reset Day music');
 // Reconnect the transport without replacing the page's audio context or voice.
 const before=await mixer(page);await page.evaluate(async()=>{const {socket}=await import('/src/connection.ts');socket.disconnect();socket.connect();});
 await page.waitForFunction(async()=>{const {socket}=await import('/src/connection.ts');return socket.connected;});await page.waitForTimeout(400);await sync(host);
 const reconnected=await mixer(page);assert.equal(reconnected.asset,before.asset);assert.ok(reconnected.time>=before.time);assert.equal(reconnected.starts,before.starts,'Reconnect does not replay old audio cues');
 await intent(host,{type:'endTurn'});const drawer=party.find(c=>c.session!.playerId===host.view!.day!.activePlayerId)!;
 await intent(drawer,{type:'drawCards'});await page.locator('#lobby[data-phase="NIGHT"]').waitFor();await finish(party);
 await page.waitForFunction(()=>[...(window as any).audio.media].some((v:any)=>v.asset==='rising-moon'&&!v.retiring&&v.element.currentTime>0));
 const night=await mixer(page);await page.evaluate(()=>(window as any).audio.set('muted',true));await page.waitForTimeout(180);
 assert.ok(await page.evaluate(()=>[...(window as any).audio.media].every((v:any)=>v.element.paused)));
 assert.equal((await evilPage.evaluate(()=>(window as any).audio.preferences.muted)),false,'Other client remains unmuted');
 await page.evaluate(()=>(window as any).audio.set('muted',false));
 const silentChoice=await mixer(page);
 await send(evil,{type:'nightAttack',matchId:(await sync(evil)).deal!.matchId,nightNumber:1,targetId:party[2]!.session!.playerId});
 if(evil.view!.night?.protection)await send(evil,{type:'nightProtect',matchId:evil.view!.deal!.matchId,nightNumber:1,targetId:null});
 // Changing private Night choices must not announce them to the other mixer.
 assert.equal((await mixer(page)).asset,'rising-moon');
 assert.equal((await mixer(page)).starts,silentChoice.starts,'A secret Night choice emits no cue to the other client');
 clock=(await sync(host)).day!.deadline!;game.server.store.sweep();await finish(party);
 clock=(await sync(host)).day!.deadline!;game.server.store.sweep();await finish(party);
 for(let i=0;i<6;i++){const v=await sync(host);if(v.phase==='DAY'&&v.day!.activePlayerId===host.session!.playerId)break;assert.equal(v.phase,'DAY');await intent(party.find(c=>c.session!.playerId===v.day!.activePlayerId)!,{type:'drawCards'});await finish(party);}
 assert.equal((await sync(host)).day!.activePlayerId,host.session!.playerId);
 await page.locator('[data-action-kind="WITNESS"]').click();await page.waitForTimeout(500);
 const v=await sync(host);await intent(host,{type:'playCard',cardId:v.hand!.find(c=>c.kind==='WITNESS')!.id,targetId:evil.session!.playerId});await finish(party);
 assert.equal((await sync(host)).phase,'REVEAL_RESOLUTION');
 assert.equal((await mixer(page)).asset,'town-in-ruins','Life selection retains Day soundtrack');
 const slot=(await sync(evil)).private!.identities.find(c=>c.kind==='WITCH')!.slot;
 await intent(host,{type:'revealSeal',slot});await page.locator('#game-moment[data-kind="reveal"]').waitFor();
 await page.locator('#game-moment .moment-next').click();
 await page.waitForFunction(()=>(window as any).audioCalls.some((call:any)=>call.cue==='reveal-dark'&&call.stage==='portrait'));
 // Advance existing presentation stages, preserving the real reveal/result cue hooks.
 for(const p of [page,evilPage])for(let i=0;i<24&&await p.locator('#game-moment').count();i++){
  await p.locator('#game-moment .moment-next').click().catch(()=>{});await p.waitForTimeout(50);
 }
 await page.waitForFunction(()=>[...(window as any).audio.media].some((v:any)=>v.asset==='victory-theme'&&!v.retiring&&!v.element.paused&&v.element.readyState>=2));
 await evilPage.waitForFunction(()=>[...(window as any).audio.media].some((v:any)=>v.asset==='defeat-theme'&&!v.retiring&&!v.element.paused&&v.element.readyState>=2));
 assert.equal((await sync(host)).phase,'GAME_OVER');assert.equal((await mixer(page)).copies,1);
 await page.screenshot({path:'test-results/audio/match-results-mobile.png'});
 assert.deepEqual(errors,[]);
 await writeFile('test-results/audio/match.json',JSON.stringify({sixSeats:true,twoBrowserMixers:true,lobby:true,day,ordinaryCards:['EVIDENCE','ALIBI','WHISPER'],reconnected,night,lifeRevealAtPortrait:true,dayDuringLifeChoice:true,victoryAndDefeat:true,pageErrors:errors},null,2));
 console.log('Complete recorded-audio match passed: lobby, cards, reconnect, Night, mute, reveal, victory and defeat.');
}catch(error){await [...pages.values()][0]?.screenshot({path:'test-results/audio/match-failure.png'}).catch(()=>{});throw error;}
finally{await browser.close();await vite.close();await game.close();}
