import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer as createViteServer} from 'vite';
import {createHarness} from './socket-harness';
const origin='http://127.0.0.1:5193';process.env.ALLOWED_ORIGINS=origin;
let clock=Date.now();
const h=await createHarness(60_000,{now:()=>clock,rateLimit:false,presentations:true,identityFactory:ids=>({id:randomUUID(),players:ids.map((id,i)=>({id,alive:true,acknowledged:false,everWitch:i===0||i===5})),cards:ids.flatMap((ownerId,i)=>Array.from({length:5},(_,slot)=>({id:randomUUID(),ownerId,slot,revealed:false,kind:(i===0||i===5)&&slot===4?'WITCH' as const:'HUMAN' as const})))} )});
const addr=h.server.http.address();assert.ok(addr&&typeof addr==='object');
const vite=await createViteServer({configFile:false,root:'apps/client',server:{host:'127.0.0.1',port:5193,strictPort:true,hmr:false,watch:{ignored:['**/*']},proxy:{'/socket.io':{target:`http://127.0.0.1:${addr.port}`,ws:true}}}});await vite.listen();
const browser=await chromium.launch({channel:'msedge',headless:true});const errors:string[]=[];
try{
 await mkdir('test-results/opening',{recursive:true});
 for(const [width,height] of [[1280,720],[360,640],[740,360]]){
  const p=await h.six();await h.start(p,false);const host=p[0]!,matchId=host.view!.deal!.matchId;
  const context=await browser.newContext({viewport:{width:width!,height:height!},reducedMotion:width===360?'reduce':'no-preference'});
  await context.addInitScript(session=>{sessionStorage.setItem('ashfall.session.v1',JSON.stringify(session));},host.session!);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  await page.locator('#role-continue').waitFor();
  await page.evaluate(async()=>{const {audio}=await import('/src/audio.ts');(window as any).openingSounds=[];const play=audio.play.bind(audio);audio.play=(cue:any,key:any,scope?:string)=>{if(String(key).startsWith('opening-'))(window as any).openingSounds.push({cue,key});play(cue,key,scope);};});
  assert.match(await page.locator('.opening-clock').innerText(),/PRIVATE REVEAL/);
  await page.locator('#role-continue').click();await page.locator('#role-continue').click();await page.locator('#reveal-all').click();
  assert.equal(await page.locator('#private-panel #black-cat-target').count(),0);await page.locator('#acknowledge').click();
  await page.getByRole('heading',{name:'LIFE CARDS SEALED'}).waitFor();assert.equal(await page.locator('.private-seal-card').count(),0);
  for(const c of p.slice(1))await h.accepted(c,{type:'acknowledgeDeal',matchId});
  await page.locator('#curse-target').waitFor();await page.waitForTimeout(350);await page.screenshot({path:`test-results/opening/voting-${width}.png`});await page.locator('#curse-target').selectOption(p[3]!.session!.playerId);
  await page.locator('#curse-seal').click();await page.getByRole('heading',{name:'YOUR VOTE IS SEALED'}).waitFor();
  assert.equal(await page.locator('#game-moment').count(),0);
  await page.evaluate(async()=>{const {request,actionId}=await import('/src/connection.ts');await request({type:'sync',actionId:actionId()});await request({type:'sync',actionId:actionId()});});
  assert.deepEqual(await page.evaluate(()=>(window as any).openingSounds.map((s:any)=>s.cue)),['swell','glow-mystery']);
  await page.screenshot({path:`test-results/opening/sealed-${width}.png`});
  const viewer=await browser.newContext({viewport:{width:width!,height:height!}});await viewer.addInitScript(session=>sessionStorage.setItem('ashfall.session.v1',JSON.stringify(session)),p[1]!.session!);
  const publicPage=await viewer.newPage();publicPage.on('pageerror',e=>errors.push(e.message));await publicPage.goto(origin);await publicPage.locator('#opening-ritual').waitFor();
  assert.equal(await publicPage.locator('#curse-target').count(),0);assert.ok(!(await publicPage.locator('#role-panel').getAttribute('class'))?.includes('is-open'));
  await publicPage.waitForTimeout(350);await publicPage.screenshot({path:`test-results/opening/waiting-${width}.png`});
  await h.accepted(p[5]!,{type:'chooseBlackCat',matchId,targetId:p[3]!.session!.playerId});
  await page.locator('#game-moment[data-kind="event"]').waitFor();assert.equal(await page.locator('#opening-ritual').count(),0);
  assert.ok((await page.locator('#game-moment').innerText()).includes('Curse'));
  await page.screenshot({path:`test-results/opening/public-${width}.png`});
  await page.locator('#game-moment .moment-next').click();await page.locator('#game-moment[data-kind="phase"]').waitFor();
  await context.close();await viewer.close();for(const c of p.slice(2))await h.send(c,{type:'leave',expectedVersion:(await h.sync(c)).version});
 }
 assert.deepEqual(errors,[]);await writeFile('test-results/opening/browser.json',JSON.stringify({viewports:[[1280,720],[360,640],[740,360]],roleLifeWaitingVotePublicDay:true,privateControls:true,reducedMotion:true,pageErrors:errors},null,2));console.log('Opening browser walkthrough passed');
}finally{await browser.close();await vite.close();await h.close();}
