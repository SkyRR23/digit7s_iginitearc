import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,type Page} from 'playwright';
import {createServer as createViteServer} from 'vite';
import {createGameServer} from '../apps/server/src/server';
import {cardQuantities,originalPrototypePreset,type RoomView,type ActionKind,type TableEffect} from '@ashfall/shared';
const game=createGameServer({rateLimit:false}),port=await game.listen(0);
const vite=await createViteServer({configFile:false,root:'apps/client',server:{host:'127.0.0.1',port:5190,strictPort:true,hmr:false,watch:{ignored:['**/*']},proxy:{'/socket.io':{target:`http://127.0.0.1:${port}`,ws:true}}}});await vite.listen();
await mkdir('test-results/event-effects',{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true});
const errors:string[]=[],results:any[]=[];let page:Page;
function base():RoomView{return {code:'EVENTQA1',version:1,privateVersion:0,phase:'DAY',capacity:6,hostId:'p0',players:Array.from({length:6},(_,i)=>({id:`p${i}`,name:i?'Cinder':'Morrow',avatar:'moon',ready:true,connected:true,abandoned:false,reconnectUntil:null})),you:{playerId:'p0'},feed:[],hand:[],private:null,role:null,night:null,dawn:null,personalResult:null,cardQuantities:cardQuantities(originalPrototypePreset),deal:{matchId:'event-effects-qa',players:Array.from({length:6},(_,i)=>({playerId:`p${i}`,alive:true,acknowledged:true,seals:Array.from({length:5},(_,slot)=>({slot,revealed:false}))}))},day:{dayNumber:1,version:1,turnNumber:1,activePlayerId:'p0',playedThisTurn:false,deadline:Date.now()+60000,deckCount:50,discardCount:0,accusationThreshold:7,players:Array.from({length:6},(_,i)=>({playerId:`p${i}`,doubt:0,ward:false,handCount:0})),reveal:null,outcome:null}};}
async function initialize(){
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{(window as any).sampleStarts=0;(window as any).playedFiles=[];const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args:any[]){(window as any).sampleStarts++;const cache=(window as any).audio?.cache;if(cache)(window as any).playedFiles.push([...cache].find((entry:any)=>entry[1]===this.buffer)?.[0]);return start.apply(this,args as any);};});
 await page.goto('http://127.0.0.1:5190');await page.locator('#create:not([disabled])').waitFor();await page.locator('#friends-open').click();
 await page.evaluate(async()=>{const {audio,CUES}=await import('/src/audio.ts');(window as any).audio=audio;(window as any).cues=[];(window as any).calls=[];const play=audio.play.bind(audio);audio.play=(cue:any,key:any,scope:any)=>{(window as any).calls.push({cue,key,scope,stage:document.getElementById('game-moment')?.dataset.revealStage});play(cue,key,scope);};document.addEventListener('ashfall:event-cue',(event:any)=>(window as any).cues.push(event.detail));audio.setScene('day');audio.prepare(...CUES);document.body.classList.add('game-screen');document.getElementById('entry')!.hidden=true;document.getElementById('lobby')!.hidden=false;});
 try{await page.waitForFunction(()=>(window as any).audio.cache.size>=15&&(window as any).audio.cache.has('glow-rise')&&(window as any).audio.cache.has('glow-reveal'));}catch(error){console.log(await page.evaluate(()=>({state:(window as any).audio.context?.state,cache:[...(window as any).audio.cache.keys()],pending:[...(window as any).audio.pending],failures:[...(window as any).audio.failures.keys()]})));throw error;}
}
async function show(before:RoomView,after:RoomView){await page.evaluate(async({before,after})=>{const {clearGameMoments,animateGameMoments}=await import('/src/game-moments.ts');clearGameMoments();animateGameMoments(before,after,[]);},{before,after});await page.locator('#game-moment').waitFor();}
async function seek(time:number){await page.locator('.event-fx-layer').evaluate(async(el,time)=>{for(const animation of el.getAnimations({subtree:true})){animation.pause();animation.currentTime=time;}await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));},time);}
async function clear(){await page.evaluate(async()=>{const {clearGameMoments}=await import('/src/game-moments.ts');clearGameMoments();});await page.waitForTimeout(90);}
try{
 page=await browser.newPage({viewport:{width:1280,height:844}});await initialize();
 const kinds:ActionKind[]=['CURSE','COUNCIL_BELL','CONSPIRACY','CINDER_SHIFT','VOW_OF_HEARTS','WHISPER','EAVESDROP','DISPEL','ASYLUM','TESTIMONY','WITNESS','STOCKS','SCAPEGOAT'];
 for(const quiet of [false,true])for(const kind of kinds){
  await page.emulateMedia({reducedMotion:quiet?'reduce':'no-preference'});await page.setViewportSize({width:quiet?390:1280,height:844});
  const before=base(),effect:TableEffect={id:`play-${kind}-${quiet}`,type:'PLAY',cardKind:kind,actorId:'p0',targetId:'p1',...(kind==='SCAPEGOAT'?{secondTargetId:'p2'}:{})};
  const events:TableEffect[]=[effect];if(kind==='TESTIMONY'||kind==='WITNESS')events.push({id:`doubt-${quiet}-${kind}`,type:'DOUBT',actorId:'p0',targetId:'p1',count:kind==='WITNESS'?7:3});if(kind==='WITNESS')events.push({id:`seven-${quiet}`,type:'REVEAL_PENDING',actorId:'p0',targetId:'p1',count:7});
  const after={...before,presentation:{id:`event-${kind}-${quiet}`,scope:'PUBLIC' as const,awaitingYou:true,until:Date.now()+45000,remainingMs:50000,previousPhase:'DAY' as const,events}};
  const start=await page.evaluate(()=>(window as any).sampleStarts);await show(before,after);
  const beats=await page.evaluate(async({before,after})=>{const {publicMoments}=await import('/src/moment-script.ts');const {eventBeats}=await import('/src/event-effects.ts');return eventBeats(publicMoments(before,after,after.presentation.events)[0]!);},{before,after});
  for(const beat of beats)if(beat.at>0)await seek(beat.at*4000+3);
  const calls=await page.evaluate(id=>(window as any).cues.filter((cue:any)=>cue.scope.includes(id)),`event-${kind}-${quiet}`);
  assert.ok(await page.locator('.event-fx-layer').count());assert.ok((await page.evaluate(()=>(window as any).sampleStarts))>start,'Decoded recorded effects actually start');
  if(kind==='TESTIMONY'||kind==='WITNESS'){assert.equal(await page.locator('.event-doubt-marks .mark-visible').count(),kind==='WITNESS'?7:3);const markCues=calls.filter((cue:any)=>cue.milestone.startsWith('doubt-'));assert.equal(markCues.length,kind==='WITNESS'?7:3,'One cue per visible mark');if(kind==='WITNESS')assert.equal(markCues.at(-1).cue,'threshold');}
  if(kind==='CURSE'||kind==='ASYLUM'||kind==='EAVESDROP'){const mood=kind==='CURSE'?'bad':kind==='ASYLUM'?'good':'mystery';assert.equal(await page.locator('#game-moment').getAttribute('data-sound-mood'),mood);assert.ok(calls.some((call:any)=>call.cue===`glow-${mood}`),`Each event gets the appropriate recorded atmosphere accent: ${kind}/${quiet}: ${JSON.stringify(calls)}`);}
  const beforeReplay=await page.evaluate(()=>(window as any).calls.length);await page.evaluate(async({before,after})=>{const {animateGameMoments}=await import('/src/game-moments.ts');animateGameMoments(before,after,[]);},{before,after});assert.equal(await page.evaluate(()=>(window as any).calls.length),beforeReplay,'Rerenders do not restart event audio');
  results.push({kind,quiet,theme:await page.locator('#game-moment').getAttribute('data-effect'),beats:beats.map(beat=>beat.tag)});await clear();
 }
 // Verify the actual running clock too, without seeking or holding its animation.
 for(const [kind,mood] of [['CURSE','bad'],['ASYLUM','good']] as const){
  const before=base(),next={...before,presentation:{id:`realtime-${kind}`,scope:'PUBLIC' as const,awaitingYou:true,until:Date.now()+45000,remainingMs:50000,previousPhase:'DAY' as const,events:[{id:`realtime-play-${kind}`,type:'PLAY' as const,cardKind:kind,actorId:'p0',targetId:'p1'}]}};
  await show(before,next);await page.waitForFunction(({id,cue})=>(window as any).cues.some((event:any)=>event.scope.includes(id)&&event.cue===cue),{id:`realtime-${kind}`,cue:`glow-${mood}`},{timeout:5000});await clear();
 }
 // Inspect full-motion magic on narrow phones as well as the quiet mode above.
 for(const kind of ['EAVESDROP','CINDER_SHIFT','DISPEL','VOW_OF_HEARTS','EVIDENCE','TESTIMONY'] as const){
  await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:390,height:844});
  const before=base(),next={...before,presentation:{id:`phone-full-${kind}`,scope:'PUBLIC' as const,awaitingYou:true,until:Date.now()+45000,remainingMs:50000,previousPhase:'DAY' as const,events:[{id:`phone-${kind}`,type:'PLAY' as const,cardKind:kind,actorId:'p0',targetId:'p1'}]}};
  if(kind==='EVIDENCE')next.presentation.events.push({...next.presentation.events[0]!,id:'phone-evidence-second'});
  await show(before,next);await seek(1125);await page.locator('.moment-hold').click();
  assert.ok(await page.locator('.moment-controls').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}));
  assert.ok(await page.locator('.moment-content').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  if(kind==='EVIDENCE'||kind==='TESTIMONY')assert.equal(await page.locator('#game-moment').evaluate(el=>getComputedStyle(el).getPropertyValue('--accent').trim()),kind==='EVIDENCE'?'#f0e9df':'#d94b57');
  await page.screenshot({path:`test-results/event-effects/${kind.toLowerCase()}-phone.png`});await clear();
 }
 // Table-only support cards stay at the table, with separate public block sounds.
 const table=await page.evaluate(async view=>{
  const {animateTableChanges}=await import('/src/table-effects.ts');const {audio}=await import('/src/audio.ts');
  const seats=document.getElementById('seats')!;seats.innerHTML='<article data-player="p1"><div class="doubt-track"><i data-doubt-index="0"></i></div></article>';
  const play=audio.play.bind(audio),calls:string[]=[];audio.play=((cue:any)=>{calls.push(cue);}) as any;
  animateTableChanges(null,view,new Map());
  const alibi={...view,effects:[{id:'table-alibi',type:'PLAY',actorId:'p0',targetId:'p1',cardKind:'ALIBI'},{id:'table-clear',type:'CLEANSE',actorId:'p0',targetId:'p1',count:1}]};
  animateTableChanges(view,alibi as any,new Map());await new Promise(resolve=>setTimeout(resolve,650));
  const closeup=!!document.getElementById('game-moment');
  const evidence={...view,effects:[{id:'table-evidence',type:'PLAY',actorId:'p0',targetId:'p1',cardKind:'EVIDENCE'},{id:'table-doubt',type:'DOUBT',actorId:'p0',targetId:'p1',count:1}]};
  animateTableChanges(alibi as any,evidence as any,new Map());await new Promise(resolve=>setTimeout(resolve,650));
  const stamps=calls.filter(cue=>cue==='stamp').length;
  const blocked={...view,effects:[{id:'table-block',type:'BLOCK',actorId:'p0',targetId:'p1',cardKind:'EVIDENCE'}]};
  animateTableChanges(evidence as any,blocked as any,new Map());animateTableChanges(blocked as any,blocked as any,new Map());
  audio.play=play;return {closeup,stamps,blockCues:calls.filter(cue=>cue==='blocked').length,cleanse:calls.includes('cleanse')};
 },base());assert.deepEqual(table,{closeup:false,stamps:1,blockCues:1,cleanse:true});
 for(const kind of ['death','verdict','resume','day','night','defeat'] as const){
  const before=base(),next=base();const events:TableEffect[]=[];
  if(kind==='death')events.push({id:'eliminated',type:'DEATH',targetId:'p1'});
  else if(kind==='day'||kind==='night'){before.phase=kind==='day'?'DAWN':'DAY';next.phase=kind==='day'?'DAY':'NIGHT';}
  else if(kind==='defeat'){next.phase='GAME_OVER';next.day!.outcome={winner:'WITCH',reason:'ONLY_WITCHES_ALIVE'};next.private={identities:[],everWitch:false,constableAbility:false,witchTeammateIds:[]};}
  else {before.phase='REVEAL_RESOLUTION';next.deal!.players[1]!.seals[0]={slot:0,revealed:true,kind:'HUMAN'};events.push({id:'verdict-life',type:'REVEAL',targetId:'p1',slot:0});}
  next.presentation={id:`other-${kind}`,scope:'PUBLIC',awaitingYou:true,until:Date.now()+45000,remainingMs:50000,previousPhase:before.phase,events};await show(before,next);
  const wanted=kind==='day'||kind==='night'?'phase':kind==='defeat'?'victory':kind;
  for(let n=0;n<10&&await page.locator('#game-moment').getAttribute('data-kind')!==wanted;n++)await page.locator('.moment-next').click();
  assert.equal(await page.locator('#game-moment').getAttribute('data-kind'),wanted);
  const cues=await page.evaluate(async({before,next,wanted})=>{const {publicMoments}=await import('/src/moment-script.ts');const {eventBeats}=await import('/src/event-effects.ts');const moment=publicMoments(before,next,next.presentation!.events! as any).find(moment=>moment.kind===wanted)!;return {duration:moment.duration,beats:eventBeats(moment)};},{before,next,wanted});
  for(const beat of cues.beats)await seek(beat.at*cues.duration+4);
  if(kind==='resume'||kind==='verdict'){
   assert.equal(await page.locator('#game-moment').evaluate(el=>getComputedStyle(el).getPropertyValue('--accent').trim()),'#d62f3c','Hunt and evil verdict retain the established red styling');
   assert.equal(await page.locator('.event-orbit').first().isVisible(),false,'These scenes retain the earlier ink design');
   await page.locator('.moment-hold').click();if(kind==='resume')assert.equal(await page.locator('#game-moment h2').evaluate(el=>getComputedStyle(el).opacity),'1');await page.screenshot({path:`test-results/event-effects/${kind}-red-phone.png`});
  }
  assert.ok(await page.evaluate(id=>(window as any).cues.some((cue:any)=>cue.scope.includes(id)),`other-${kind}`));await clear();
 }
 // Successful and blocked protection use different recordings/cues and visual state.
 for(const blocked of [false,true]){const before=base(),events:TableEffect[]=[{id:'asylum-play',type:'PLAY',cardKind:'ASYLUM',actorId:'p0',targetId:'p1'}];if(blocked)events.push({id:'asylum-block',type:'ROLE_BLOCK',cardKind:'ASYLUM',actorId:'p0',targetId:'p1'});const after={...before,presentation:{id:`protection-${blocked}`,scope:'PUBLIC' as const,awaitingYou:true,until:Date.now()+45000,remainingMs:50000,previousPhase:'DAY' as const,events}};await show(before,after);await seek(1125);assert.equal(await page.locator('#game-moment').getAttribute('data-effect'),blocked?'blocked':'shield');assert.ok(await page.evaluate(cue=>(window as any).calls.some((call:any)=>call.cue===cue&&call.scope?.includes(`protection-${cue==='fizzle'}`)),blocked?'fizzle':'protect'));await clear();}
 // Real Keep open / skip lifecycle fades scoped voices and cancels remaining cues.
 await page.emulateMedia({reducedMotion:'no-preference'});const before=base(),after={...before,presentation:{id:'lifecycle-eavesdrop',scope:'PUBLIC' as const,awaitingYou:true,until:Date.now()+45000,remainingMs:50000,previousPhase:'DAY' as const,events:[{id:'lifecycle',type:'PLAY' as const,cardKind:'EAVESDROP' as const,actorId:'p0',targetId:'p1'}]}};
 await show(before,after);await seek(365);await page.locator('.moment-hold').click();await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>[...(window as any).audio.scopedSfx.values()].every((voice:any)=>!voice.scope?.includes('lifecycle-eavesdrop'))));const held=await page.evaluate(()=>(window as any).cues.length);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>(window as any).cues.length),held);
 await page.locator('.moment-hold').click();await seek(1125);await page.locator('.moment-skip').click();await page.waitForTimeout(110);assert.ok(await page.evaluate(()=>[...(window as any).audio.scopedSfx.values()].every((voice:any)=>!voice.scope?.includes('lifecycle-eavesdrop'))));
 const consumed=await page.evaluate(()=>(window as any).cues.length);await page.evaluate(async after=>{const {animateGameMoments}=await import('/src/game-moments.ts');animateGameMoments(null,after,[]);},after);await seek(1125);assert.equal(await page.evaluate(()=>(window as any).cues.length),consumed,'Reconnecting to an unfinished presentation does not replay consumed cues');await clear();
 await page.evaluate(()=>(window as any).audio.set('muted',true));assert.equal(await page.evaluate(()=>(window as any).audio.buses.master.gain.value),0,'Mute silences the mixer immediately');await page.evaluate(()=>(window as any).audio.set('muted',false));
 // Public reveal stages: neutral announcement, portrait impact, then position glow.
 const revealed=base();revealed.deal!.players[1]!.seals[2]={slot:2,revealed:true,kind:'HUMAN'};revealed.presentation={id:'public-reveal-stages',scope:'PUBLIC',awaitingYou:true,until:Date.now()+45000,remainingMs:50000,previousPhase:'DAY',events:[{id:'public-reveal',type:'REVEAL',targetId:'p1',slot:2}]};await show(base(),revealed);assert.equal(await page.locator('#game-moment').getAttribute('data-effect'),'announcement');await page.locator('.moment-next').click();assert.equal(await page.locator('#game-moment').getAttribute('data-effect'),'reveal-good');await seek(565);assert.ok(await page.evaluate(()=>(window as any).calls.some((call:any)=>call.cue==='reveal'&&call.stage==='portrait')));await page.locator('.moment-next').click();await seek(285);assert.equal(await page.locator('#game-moment').getAttribute('data-kind'),'position');await clear();
 for(const [width,height] of [[1280,844],[537,672],[390,844],[320,640],[844,390],[568,320]]){
  await page.setViewportSize({width:width!,height:height!});const result=base();result.phase='GAME_OVER';result.day!.outcome={winner:'HUMAN',reason:'ALL_WITCH_SEALS_REVEALED'};result.presentation={id:`result-${width}`,scope:'PUBLIC',awaitingYou:true,until:Date.now()+45000,remainingMs:null,previousPhase:'DAY',events:[]};await show(base(),result);await page.locator('.moment-art img').evaluate((img:HTMLImageElement)=>img.decode());await seek(1000);await page.locator('.moment-hold').click();
  assert.ok(await page.locator('#game-moment').evaluate(stage=>{const content=stage.querySelector('.moment-content')!.getBoundingClientRect(),controls=stage.querySelector('.moment-controls')!.getBoundingClientRect(),art=stage.querySelector('.moment-art')!.getBoundingClientRect(),title=stage.querySelector('h2')!.getBoundingClientRect();const overlap=art.left<title.right&&art.right>title.left&&art.top<title.bottom&&art.bottom>title.top;return !overlap&&content.bottom<=controls.top&&controls.bottom<=innerHeight&&controls.left>=0&&controls.right<=innerWidth;}),'Victory art, title and controls do not overlap');
  await page.screenshot({path:`test-results/event-effects/victory-${width}.png`});await clear();
 }
 assert.ok(await page.evaluate(()=>(window as any).playedFiles.includes('glow-rise')&&(window as any).playedFiles.includes('glow-reveal')),'Both prerecorded tonal glow samples actually play');
 assert.deepEqual(errors,[]);await writeFile('test-results/event-effects/results.json',JSON.stringify({profiles:results,realDecodedPlayback:true,tonalGlowSamples:true,restoredRedScenes:true,oneCuePerMark:true,keepOpenCleanup:true,skipCleanup:true,reconnectDedup:true,immediateMute:true,publicRevealStages:true,resultLayouts:[1280,537,390,320,844,568],pageErrors:errors},null,2));console.log('Event profiles, recorded playback, animation milestones, cleanup, privacy and result layouts passed.');
}catch(error){console.log('BROWSER ERRORS',errors);console.log(await page!?.evaluate(()=>({calls:(window as any).calls?.slice(-15),animations:document.querySelector('.event-fx-layer')?.getAnimations().map(a=>({time:a.currentTime,state:a.playState})),phase:document.querySelector('#game-moment')?.className})).catch(()=>({})));await page!?.screenshot({path:'test-results/event-effects/failure.png'}).catch(()=>{});throw error;}
finally{await browser.close();await vite.close();await game.close();}
