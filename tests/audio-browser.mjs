import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
const js=ts.transpileModule(fs.readFileSync('apps/client/src/audio.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/audio.js'?'application/javascript':'text/html');res.end(req.url==='/audio.js'?js:'<button id="start">Start</button><script type="module">import {audio,CUES} from "/audio.js";window.audio=audio;window.cues=CUES;audio.install();</script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try {
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=user-gesture-required']});const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.contextCount=0;const Original=window.AudioContext;window.AudioContext=class extends Original{constructor(...args){super(...args);window.contextCount++;}};});
 const url=`http://127.0.0.1:${server.address().port}`;await page.goto(url);await page.waitForFunction(()=>!!window.audio);
 assert.equal(await page.evaluate(()=>window.contextCount),0,'no context before gesture');
 await page.click('#start');await page.waitForFunction(()=>window.audio.context?.state==='running');
 const result=await page.evaluate(async()=>{const a=window.audio;a.install();await a.unlock();const initial=a.bed;a.setScene('menu');const stable=a.bed===initial;
  for(const scene of ['lobby','day','night','result','menu'])a.setScene(scene);
  for(const cue of window.cues)a.play(cue);const count=a.recent.size;a.play('bell');const dedup=a.recent.size===count;
  a.set('music',.11);a.set('muted',true);a.play('curse','muted-test');return {contexts:window.contextCount,stable,dedup,mutedSkipped:!a.recent.has('muted-test'),saved:JSON.parse(localStorage.getItem('ashfall.audio.v1'))};});
 assert.equal(result.contexts,1);assert.ok(result.stable&&result.dedup&&result.mutedSkipped);assert.equal(result.saved.music,.11);
 await page.reload();await page.waitForFunction(()=>!!window.audio);assert.equal(await page.evaluate(()=>window.audio.preferences.muted),true);
 const second=await browser.newContext();const p2=await second.newPage();await p2.goto(url);await p2.waitForFunction(()=>!!window.audio);assert.equal(await p2.evaluate(()=>window.audio.preferences.muted),false);await second.close();
 // Exercise the actual visibility handler without claiming a physical tab test.
 await page.click('#start');await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>window.audio.context.state==='suspended');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>window.audio.context.state==='running');
 await page.evaluate(()=>{window.audio.set('muted',false);window.audio.set('master',.5);});
 const unavailable=await browser.newContext();const unavailablePage=await unavailable.newPage();unavailablePage.on('pageerror',e=>errors.push(e.message));
 await unavailablePage.addInitScript(()=>{window.AudioContext=class {constructor(){throw new Error('Audio unavailable');}};});
 await unavailablePage.goto(url);await unavailablePage.waitForFunction(()=>!!window.audio);await unavailablePage.click('#start');await unavailablePage.evaluate(()=>window.audio.play('bell'));await unavailable.close();
 await page.waitForTimeout(2600);assert.deepEqual(errors,[]);
 fs.mkdirSync('test-results/audio',{recursive:true});fs.writeFileSync('test-results/audio/browser.json',JSON.stringify({result,visibilityHandler:true,independentContexts:true,pageErrors:errors},null,2));console.log('Audio browser checks passed',result);
} finally {await browser?.close();await new Promise(r=>server.close(r));}
