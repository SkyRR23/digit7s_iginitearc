// Render the real cinematic components with controlled public snapshots, then
// inspect animation states and capture comparisons with the existing benchmarks.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { cardQuantities, originalPrototypePreset, type ActionKind, type RoomView } from '@ashfall/shared';
import { createGameServer } from '../apps/server/src/server.js';

const game=createGameServer({rateLimit:false}),port=await game.listen(0);
const vite=await createViteServer({configFile:false,root:'apps/client',server:{host:'127.0.0.1',port:5184,strictPort:true,hmr:false,watch:{ignored:['**/*']},proxy:{'/socket.io':{target:`http://127.0.0.1:${port}`,ws:true}}}});
await vite.listen();await mkdir('test-results/cinematic-polish',{recursive:true});
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??'msedge',headless:true});
const errors:string[]=[];
function snapshot():RoomView {
  return {code:'ARTCHECK',version:1,privateVersion:0,phase:'DAY',capacity:6,hostId:'p0',serverTime:Date.now(),
    players:Array.from({length:6},(_,i)=>({id:`p${i}`,name:i===0?'Morrow':`Villager ${i}`,avatar:'moon',ready:true,connected:true,abandoned:false,isBot:false,botDifficulty:null,reconnectUntil:null})),
    you:{playerId:'p0'},feed:[],hand:[],private:null,role:null,night:null,dawn:null,personalResult:null,
    cardQuantities:cardQuantities(originalPrototypePreset),
    deal:{matchId:'polish-fixture',players:Array.from({length:6},(_,i)=>({playerId:`p${i}`,alive:true,acknowledged:true,seals:Array.from({length:5},(_,slot)=>({slot,revealed:false}))}))},
    day:{dayNumber:2,version:1,turnNumber:4,activePlayerId:'p0',playedThisTurn:true,deadline:Date.now()+50000,deckCount:50,discardCount:12,accusationThreshold:7,players:[],reveal:null,outcome:null}};
}
async function clear(page:Page) {
  await page.evaluate(async()=>{const {clearGameMoments}=await import('/src/game-moments.ts');clearGameMoments();const {renderDecisionUI}=await import('/src/decision-ui.ts');renderDecisionUI(null,true,()=>{},()=>{});});
}
try {
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5184');await page.locator('#create:not([disabled])').waitFor();
  await page.evaluate(()=>{document.body.classList.add('game-screen');document.getElementById('entry')!.hidden=true;document.getElementById('lobby')!.hidden=false;});
  for(const kind of ['TESTIMONY','VOW_OF_HEARTS','COUNCIL_BELL','CURSE'] as ActionKind[]) {
    await clear(page);const view=snapshot();
    const effect={id:kind,type:'PLAY' as const,cardKind:kind,actorId:'p0',targetId:'p1'};
    const after:RoomView={...view,presentation:{id:kind,scope:'PUBLIC',awaitingYou:true,until:Date.now()+45000,remainingMs:50000,previousPhase:'DAY',events:[effect]}};
    await page.evaluate(async({before,after})=>{const {animateGameMoments}=await import('/src/game-moments.ts');animateGameMoments(before,after,[]);},{before:view,after});
    await page.locator(`#game-moment[data-card-kind="${kind}"]`).waitFor();
    await page.locator('#game-moment img').evaluate((img:HTMLImageElement)=>img.decode());
    await page.waitForTimeout(1000);await page.locator('.moment-hold').click();
    assert.equal(await page.locator('#game-moment .moment-target').count(),1);
    if(kind==='COUNCIL_BELL')assert.equal(await page.locator('.bell-shockwaves i').count(),3);
    if(kind==='CURSE') {assert.equal(await page.locator('.curse-shadows i').count(),3);assert.match(await page.locator('.moment-target').textContent()??'',/Villager 1/);}
    const url=await page.locator('#game-moment img').getAttribute('src');assert.ok(url?.endsWith('.webp'));
    await page.screenshot({path:`test-results/cinematic-polish/${kind.toLowerCase()}-desktop.png`});
    if(['CURSE','COUNCIL_BELL'].includes(kind)){
      await page.setViewportSize({width:390,height:844});await page.screenshot({path:`test-results/cinematic-polish/${kind.toLowerCase()}-phone.png`});
      assert.ok(await page.locator('.moment-controls').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight));
      await page.setViewportSize({width:1440,height:900});
    }
  }
  await clear(page);
  const choice=snapshot();choice.phase='REVEAL_RESOLUTION';choice.day!.reveal={chooserId:'p0',targetId:'p1'};
  choice.deal!.players[1]!.seals[4]={slot:4,revealed:true,kind:'HUMAN'};
  for(const [width,height] of [[1440,900],[390,844],[320,640],[568,320]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(async(view)=>{view.serverTime=Date.now();view.day!.deadline=Date.now()+10000;const {renderDecisionUI}=await import('/src/decision-ui.ts');renderDecisionUI(null,false,()=>{},()=>{});renderDecisionUI(view,false,()=>{},()=>{});},choice);
    await page.locator('.life-card-paint').first().evaluate((img:HTMLImageElement)=>img.decode());await page.waitForTimeout(550);
    assert.equal(await page.locator('.life-card-paint').count(),4);assert.equal(await page.locator('[data-reveal-choice="4"]').isDisabled(),true);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.equal(await page.locator('.decision-atmosphere .moment-ink').count(),1,'Life choice reuses the cinematic ink compositor');
    assert.ok(await page.locator('.decision-content').evaluate(el=>getComputedStyle(el).backgroundColor==='rgba(0, 0, 0, 0)'),'The glass scene has no opaque modal box');
    const faces=await page.locator('.life-card-face').evaluateAll(elements=>elements.map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));
    assert.ok(Math.max(...faces.map(face=>face.width))-Math.min(...faces.map(face=>face.width))<2,'Revealed and hidden cards use the same frame size');
    await page.screenshot({path:`test-results/cinematic-polish/life-choice-${width}.png`});
  }
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(async(view)=>{
    view.serverTime=Date.now();view.day!.deadline=Date.now()+10000;
    const {renderDecisionUI}=await import('/src/decision-ui.ts');renderDecisionUI(null,false,()=>{},()=>{});
    (window as unknown as {chosen:number[]}).chosen=[];
    renderDecisionUI(view,false,intent=>{if(intent.type==='revealSeal')(window as unknown as {chosen:number[]}).chosen.push(intent.slot);},()=>{});
    const button=document.querySelector<HTMLButtonElement>('[data-reveal-choice="2"]')!;button.click();button.click();
  },choice);
  assert.deepEqual(await page.evaluate(()=>(window as unknown as {chosen:number[]}).chosen),[2]);
  await page.waitForTimeout(500);await clear(page);
  // The voting scene shares the illustrated compositor, supports ten public
  // avatars, and keeps the sealed ballot available without hidden role data.
  for(const size of [6,10]) {
    const council=snapshot();
    council.players=Array.from({length:size},(_,i)=>({...council.players[0]!,id:`p${i}`,name:`Councilor ${i+1}`}));
    council.deal!.players=Array.from({length:size},(_,i)=>({...council.deal!.players[0]!,playerId:`p${i}`}));
    council.day!.council={used:true,open:true,deadline:Date.now()+30000};
    council.councilVote={dayNumber:2,votesCast:0,required:Math.floor(size/2)+1,yourTargetId:null};
    for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:844,height:390}]) {
      await clear(page);await page.setViewportSize(viewport);
      await page.evaluate(async view=>{const {renderDecisionUI}=await import('/src/decision-ui.ts');renderDecisionUI(view,false,()=>{},id=>{(window as unknown as {ballot:string}).ballot=id;});},council);
      await page.locator('.council-bell-art img').evaluate((img:HTMLImageElement)=>img.decode());
      assert.equal(await page.locator('[data-council-choice]').count(),size);
      assert.equal(await page.locator('.council-avatar svg').count(),size);
      await page.locator('[data-council-choice="p1"]').click();
      assert.equal(await page.evaluate(()=>(window as unknown as {ballot:string}).ballot),'p1');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.waitForTimeout(1600);
      await page.screenshot({path:`test-results/cinematic-polish/council-${size}-${viewport.width}.png`});
    }
  }
  await clear(page);await page.setViewportSize({width:1440,height:900});
  const verdictBefore=snapshot(),verdictAfter=structuredClone(verdictBefore);
  verdictAfter.phase='GAME_OVER';verdictAfter.day!.outcome={winner:'SCAPEGOAT',reason:'COUNCIL_VOTE',playerId:'p1'};
  verdictAfter.presentation={id:'scapegoat-verdict',scope:'PUBLIC',awaitingYou:true,until:Date.now()+45000,remainingMs:null,previousPhase:'DAY',events:[{id:'death',type:'DEATH',targetId:'p1'},{id:'winner',type:'VOTE_VICTORY',targetId:'p1'}]};
  await page.evaluate(async({before,after})=>{const {animateGameMoments}=await import('/src/game-moments.ts');animateGameMoments(before,after,[]);},{before:verdictBefore,after:verdictAfter});
  await page.locator('#game-moment[data-kind="death"]').waitFor();await page.locator('.moment-next').click();
  await page.locator('#game-moment[data-kind="victory"]').waitFor();
  assert.equal(await page.locator('#game-moment h2').textContent(),'Outcast victory');
  assert.match(await page.locator('#game-moment img').getAttribute('src')??'',/outcast-chained-transparent.webp$/);
  assert.match(await page.locator('.moment-pause-note').textContent()??'',/Match ended/);
  assert.equal(await page.locator('.moment-skip').textContent(),'View results');
  await page.waitForTimeout(1700);await page.locator('.moment-hold').click();
  await page.screenshot({path:'test-results/cinematic-polish/scapegoat-victory-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/cinematic-polish/scapegoat-victory-phone.png'});
  await clear(page);
  const before=snapshot();before.phase='REVEAL_RESOLUTION';const after=structuredClone(before);after.phase='DAY';
  after.deal!.players[1]!.seals[2]={slot:2,revealed:true,kind:'HUMAN'};
  after.presentation={id:'resume',scope:'PUBLIC',awaitingYou:true,until:Date.now()+45000,remainingMs:50000,previousPhase:'REVEAL_RESOLUTION',events:[{id:'life',type:'REVEAL',targetId:'p1',actorId:'p0',slot:2,count:7}]};
  await page.evaluate(async({before,after})=>{const {animateGameMoments}=await import('/src/game-moments.ts');animateGameMoments(before,after,[]);},{before,after});
  for(let i=0;i<6&&await page.locator('#game-moment').getAttribute('data-kind')!=='resume';i++)await page.locator('.moment-next').click();
  await page.locator('#game-moment[data-kind="resume"]').waitFor();await page.waitForTimeout(950);await page.locator('.moment-hold').click();
  assert.equal(await page.locator('#game-moment h2').textContent(),'RESUME THE HUNT');
  await page.screenshot({path:'test-results/cinematic-polish/resume-hunt-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/cinematic-polish/resume-hunt-phone.png'});
  await clear(page);
  await page.evaluate(async(view)=>{const {openGameGuide,updateGameGuide}=await import('/src/game-guide.ts');updateGameGuide(view);openGameGuide('cards');},snapshot());
  for(const [kind,count] of Object.entries(cardQuantities(originalPrototypePreset)))assert.match(await page.locator(`[data-card-quantity="${kind}"]`).textContent()??'',new RegExp(`^${count} Cards?$`));
  assert.doesNotMatch(await page.locator('[data-guide-card="CURSE"]').textContent()??'',/returns.*hand/i);
  await page.locator('[data-guide-card="CURSE"]').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/cinematic-polish/help-quantities-phone.png'});
  await page.evaluate(async(view)=>{const {updateGameGuide}=await import('/src/game-guide.ts');updateGameGuide({...view,cardQuantities:{...view.cardQuantities,EVIDENCE:5}});},snapshot());
  assert.match(await page.locator('[data-card-quantity="EVIDENCE"]').textContent()??'',/^5 Cards$/);
  assert.deepEqual(errors,[]);console.info('Cinematic benchmark captures, Bell/Curse artwork, Life selection, resume scene, responsive views and live Help quantities passed.');
} finally {await browser.close();await vite.close();await game.close();}
