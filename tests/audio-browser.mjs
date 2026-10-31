import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {createServer as createViteServer} from 'vite';
const vite=await createViteServer({configFile:false,root:'apps/client',server:{middlewareMode:true,hmr:false,watch:{ignored:['**/*']}}});
const server=createServer((req,res)=>{
 if(req.url==='/') {res.setHeader('Content-Type','text/html');res.end('<button id="start">Start</button><script type="module">import {audio,CUES} from "/src/audio.ts";window.audio=audio;window.cues=CUES;audio.install();</script>');}
 else vite.middlewares(req,res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
let browser;
const errors=[],summaries=[];
async function open(context){
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  window.contextCount=0;window.sampleStarts=0;
  const Original=window.AudioContext;
  window.AudioContext=class extends Original {constructor(...args){super(...args);window.contextCount++;}};
  const start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(...args){window.sampleStarts++;return start.apply(this,args);};
 });
 await page.goto(url);await page.waitForFunction(()=>!!window.audio);return page;
}
try {
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??'msedge',headless:true,args:['--autoplay-policy=user-gesture-required']});
 for(const width of [1280,390]) {
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:width===390});const page=await open(context);
  assert.equal(await page.evaluate(()=>window.contextCount),0,'No context before interaction');
  assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>/\/audio\/.*\.(mp3|ogg)/.test(e.name)).length),0,'No audio downloads before interaction');
  await page.locator('#start').click();
  await page.waitForFunction(()=>window.audio.context?.state==='running'&&window.audio.cache.size>=3);
  await page.waitForFunction(()=>[...window.audio.media].filter(v=>!v.retiring&&v.element.readyState>=2&&!v.element.paused).length===2);
  const initial=await page.evaluate(async()=>{const a=window.audio;a.install();await a.unlock();const bed=a.bed;a.setScene('menu');return {contexts:window.contextCount,stable:bed===a.bed,channels:Object.keys(a.buses)};});
  assert.equal(initial.contexts,1);assert.ok(initial.stable);assert.deepEqual(initial.channels,['master','music','ambience','sfx']);
  for(const scene of ['lobby','day','night','result']) {
   await page.evaluate(scene=>{window.audio.setScene(scene);if(scene==='result'){window.audio.set('sfx',0);window.audio.play('victory');window.audio.set('sfx',.65);}},scene);
   assert.ok(await page.evaluate(()=>window.audio.media.size<=4),'Bounded crossfade voices');
   await page.waitForFunction(scene=>[...window.audio.media].some(v=>!v.retiring&&v.channel==='ambience'&&v.element.readyState>=2),scene);
   await page.waitForFunction(()=>[...window.audio.media].some(v=>!v.retiring&&v.channel==='music'&&v.element.readyState>=2));
   if(scene==='day'||scene==='night') {
    await page.evaluate(()=>{window.phaseVoice=[...window.audio.media].find(v=>!v.retiring&&v.channel==='music');window.phaseVoice.element.currentTime=10;});
    const stable=await page.evaluate(async scene=>{
      const a=window.audio,voice=window.phaseVoice,time=voice.element.currentTime;
      for(let n=0;n<25;n++){a.setScene(scene);a.play(n%2?'select':'draw',`ordinary-${scene}-${n}`);await a.unlock();}
      await new Promise(resolve=>setTimeout(resolve,600));
      return {same:[...a.media].filter(v=>!v.retiring&&v.channel==='music').length===1&&a.media.has(voice),continued:voice.element.currentTime>time,loop:voice.element.loop};
    },scene);
    assert.deepEqual(stable,{same:true,continued:true,loop:true},'Phase music survives repeated gameplay updates and audio unlocks');
    await page.evaluate(()=>{const el=window.phaseVoice.element;el.currentTime=el.duration-.2;});
    await page.waitForFunction(()=>window.phaseVoice.element.currentTime<2&&!window.phaseVoice.element.paused);
    assert.equal(await page.evaluate(()=>window.audio.media.has(window.phaseVoice)),true,'Loop reuses the same media voice');
   }
  }
  await page.waitForFunction(()=>[...window.audio.media].some(v=>v.asset==='victory-theme'&&!v.element.paused));
  await page.evaluate(()=>{const a=window.audio;for(const v of a.media)if(v.asset==='victory-theme')v.element.dispatchEvent(new Event('ended'));});
  await page.evaluate(()=>window.audio.unlock());
  assert.equal(await page.evaluate(()=>[...window.audio.media].filter(v=>!v.retiring&&v.channel==='music').length),0,'Result conclusions do not restart or loop');
  await page.evaluate(()=>{const a=window.audio;a.setScene('day');a.prepare('bell','flip');});
  await page.waitForFunction(()=>window.audio.cache.has('church-bell')&&window.audio.cache.has('page-flip'));
  const dedup=await page.evaluate(()=>{const a=window.audio,before=window.sampleStarts;a.play('bell','event-bell');a.play('bell','event-bell');return window.sampleStarts-before;});
  assert.equal(dedup,1,'Duplicate cue key starts one recorded bell');
  await page.waitForTimeout(100);
  assert.ok(await page.evaluate(()=>window.audio.ducks.music.gain.value<.8),'Important cues duck music');
  await page.evaluate(()=>window.audio.set('music',.23));
  assert.ok(await page.evaluate(()=>window.audio.ducks.music.gain.value<.8),'Slider changes preserve the duck');
  await page.waitForTimeout(4000);
  assert.ok(await page.evaluate(()=>window.audio.ducks.music.gain.value>.9),'Duck recovers smoothly');
  const saved=await page.evaluate(()=>{const a=window.audio;for(const cue of window.cues)a.play(cue);a.set('master',.51);a.set('ambience',.19);a.set('sfx',.44);a.set('muted',true);const before=window.sampleStarts;a.play('curse','muted-check');return {skipped:before===window.sampleStarts,preferences:JSON.parse(localStorage.getItem('ashfall.audio.v1')),cacheBytes:a.cacheBytes,cacheCount:a.cache.size};});
  assert.ok(saved.skipped&&saved.cacheBytes<=6*1024*1024&&saved.cacheCount<=16);
  await page.reload();await page.waitForFunction(()=>!!window.audio);
  assert.deepEqual(await page.evaluate(()=>window.audio.preferences),saved.preferences,'All preferences persist');
  await page.locator('#start').click();
  await page.evaluate(()=>window.audio.set('muted',false));
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>window.audio.context.state==='suspended');
  assert.equal(await page.evaluate(()=>[...window.audio.media].every(v=>v.element.paused)),true,'Background tabs pause file playback too');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>window.audio.context.state==='running');
  summaries.push({width,...initial,...saved,visibilityHandler:true});await context.close();
 }
 const first=await browser.newContext(),second=await browser.newContext();
 const p1=await open(first),p2=await open(second);
 await p1.click('#start');await p2.click('#start');await p1.evaluate(()=>window.audio.set('muted',true));
 assert.equal(await p2.evaluate(()=>window.audio.preferences.muted),false,'Browser clients have independent preferences/contexts');
 await first.close();await second.close();

 // Incoming downloads must not fade the old music into a loading gap.
 const slow=await browser.newContext();let allowMusic;
 const musicGate=new Promise(resolve=>{allowMusic=resolve;});
 await slow.route('**/audio/town-in-ruins.*',async route=>{await musicGate;await route.continue().catch(()=>{});});
 const sp=await open(slow);await sp.click('#start');
 await sp.waitForFunction(()=>[...window.audio.media].some(v=>v.channel==='music'&&!v.element.paused&&v.element.readyState>=2));
 await sp.evaluate(()=>{window.outgoing=[...window.audio.media].find(v=>v.channel==='music');window.audio.setScene('day');});
 await sp.waitForTimeout(2300);
 assert.equal(await sp.evaluate(()=>!window.outgoing.disposed&&!window.outgoing.element.paused),true,'Outgoing music continues while the next file loads');
 allowMusic();await sp.waitForFunction(()=>[...window.audio.media].some(v=>v.asset==='town-in-ruins'&&!v.element.paused&&v.element.readyState>=2));
 await sp.waitForFunction(()=>window.outgoing.disposed);
 await sp.evaluate(()=>{window.phaseVoice=[...window.audio.media].find(v=>v.channel==='music');window.audio.setScene('result');});
 assert.equal(await sp.evaluate(()=>window.audio.media.has(window.phaseVoice)&&!window.phaseVoice.retiring),true,'Final reveal keeps its underlying soundtrack until the result cue');
 await sp.evaluate(()=>{document.dispatchEvent(new CustomEvent('ashfall:presentation-finished'));window.audio.unlock();});
 await sp.waitForFunction(()=>![...window.audio.media].some(v=>v.channel==='music'));
 await slow.close();

 // Every Ogg failure must have an independently usable MP3 fallback.
 const fallback=await browser.newContext();await fallback.route('**/audio/*.ogg',route=>route.fulfill({status:404,body:''}));
 const fp=await open(fallback);await fp.click('#start');
 await fp.waitForFunction(()=>window.audio.cache.has('wood-tap')&&[...window.audio.media].some(v=>v.element.currentSrc.endsWith('.mp3')&&v.element.readyState>=2));
 await fallback.close();
 const missing=await browser.newContext();await missing.route('**/audio/*',route=>route.fulfill({status:404,body:''}));
 const mp=await open(missing);await mp.click('#start');
 await mp.waitForFunction(()=>window.audio.failures.has('wood-tap'));
 assert.equal(await mp.evaluate(()=>window.sampleStarts),0,'Missing files fall back to silence');
 await mp.evaluate(()=>{window.audio.setScene('night');window.audio.play('bell');});await missing.close();

 // A completed asynchronous load must never replay an earlier animation cue.
 const delayed=await browser.newContext();let release;
 const gate=new Promise(resolve=>{release=resolve;});
 await delayed.route('**/audio/wood-tap.*',async route=>{await gate;await route.continue().catch(()=>{});});
 const dp=await open(delayed);await dp.click('#start');
 await dp.evaluate(()=>window.audio.play('click','cold-cue'));
 assert.equal(await dp.evaluate(()=>window.sampleStarts),0);
 release();await dp.waitForFunction(()=>window.audio.cache.has('wood-tap'));
 assert.equal(await dp.evaluate(()=>window.sampleStarts),0,'Decoded audio is not replayed late');
 await dp.evaluate(()=>window.audio.play('click','fresh-cue'));
 assert.equal(await dp.evaluate(()=>window.sampleStarts),1);

 // Exercise the actual cinematic/table hooks, including reconnect snapshots.
 const synchronization=await dp.evaluate(async()=>{
  const a=window.audio;a.setScene('day');a.prepare('bell');
  const {animateTableChanges}=await import('/src/table-effects.ts');
  const {clearGameMoments}=await import('/src/game-moments.ts');
  const calls=[],play=a.play.bind(a);a.play=(cue,key,scope)=>{calls.push({cue,visible:!!document.getElementById('game-moment')});play(cue,key,scope);};
  const base={phase:'DAY',you:{playerId:'a'},deal:{matchId:'audio-sync-fixture',players:[]},day:{dayNumber:1,activePlayerId:'a',players:[]},role:null,players:[{id:'a',name:'Host',avatar:'moon'}],effects:[]};
  const historical={...base,effects:[{id:'old-draw',type:'DRAW',actorId:'a',count:2}]};
  animateTableChanges(null,historical,new Map());
  const before=calls.filter(call=>call.cue==='bell').length;
  const next={...base,effects:[{id:'public-bell',type:'PLAY',actorId:'a',cardKind:'COUNCIL_BELL'}]};
  animateTableChanges(base,next,new Map());await new Promise(resolve=>setTimeout(resolve,800));const after=calls.filter(call=>call.cue==='bell').length;
  animateTableChanges(next,next,new Map());animateTableChanges(null,next,new Map());
  const result={historical:before,delivered:after-before,afterReplay:calls.filter(call=>call.cue==='bell').length,atVisibleStage:calls.find(c=>c.cue==='bell')?.visible};
  clearGameMoments();a.play=play;return result;
 });
 assert.deepEqual(synchronization,{historical:0,delivered:1,afterReplay:1,atVisibleStage:true});
 const neutralCue=await dp.evaluate(async()=>{
  const {animateTableChanges}=await import('/src/table-effects.ts');const {clearGameMoments}=await import('/src/game-moments.ts');const a=window.audio,play=a.play.bind(a),calls=[];a.play=cue=>calls.push(cue);
  const base={phase:'DAY',you:{playerId:'neutral'},private:{everWitch:false},role:{kind:'SCAPEGOAT'},deal:{matchId:'neutral-audio-fixture',players:[]},day:{dayNumber:1,players:[]},players:[{id:'neutral',name:'Outcast'}],effects:[]};
  animateTableChanges(null,base,new Map());animateTableChanges(base,{...base,phase:'GAME_OVER',private:null,role:null,day:{...base.day,outcome:{winner:'HUMAN'}}},new Map());clearGameMoments();a.play=play;return calls;
 });
 assert.deepEqual(neutralCue,['defeat'],'An Outcast receives a conclusion for their own win condition');
 await delayed.close();
 const unavailable=await browser.newContext();await unavailable.addInitScript(()=>{window.AudioContext=class {constructor(){throw new Error('Unavailable');}};});
 const up=await open(unavailable);await up.click('#start');await up.evaluate(()=>window.audio.play('bell'));await unavailable.close();
 assert.deepEqual(errors,[],'No page errors');
 fs.mkdirSync('test-results/audio',{recursive:true});fs.writeFileSync('test-results/audio/browser.json',JSON.stringify({summaries,synchronization,codecFallback:true,missingFiles:true,noLateReplay:true,independentClients:true,pageErrors:errors},null,2));
 console.log('Recorded audio browser lifecycle, crossfades, controls, failures and synchronization checks passed.');
} finally {await browser?.close();await vite.close();await new Promise(resolve=>server.close(resolve));}
