// Production assets, official viewports, real backend; local evidence, not hosted SLA.
import { preview } from 'vite';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { createGameServer } from '../apps/server/src/server.js';
const origin='http://127.0.0.1:5191';process.env.ALLOWED_ORIGINS=origin;
const server=createGameServer({presentations:false,botTickMs:60000});const port=await server.listen(0);
const web=await preview({root:'apps/client',configFile:false,preview:{host:'127.0.0.1',port:5191,strictPort:true,proxy:{'/socket.io':{target:`http://127.0.0.1:${port}`,ws:true}}}});
const browser=await chromium.launch({channel:'msedge',headless:true});
const results:object[]=[];await mkdir('test-results/audit',{recursive:true});
try{
 for(const [width,height] of [[1280,720],[360,640]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:width===360,reducedMotion:'reduce'});const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const started=Date.now();await page.goto(origin);await page.locator('#create:not([disabled])').waitFor();const interactiveMs=Date.now()-started;
  await page.screenshot({path:`test-results/audit/menu-${width}.png`});await page.fill('#name','Audit player');await page.selectOption('#capacity','10');await page.click('#create');await page.click('#fill-bots');await page.waitForFunction(()=>document.querySelectorAll('#seats .table-seat:not(.empty)').length===10);
  await page.screenshot({path:`test-results/audit/lobby-${width}.png`});await page.click('#ready');await page.click('#start:not([disabled])');await page.locator('#role-continue').waitFor();await page.screenshot({path:`test-results/audit/role-${width}.png`});
  const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,voice:!!document.querySelector('#voice-controls'),requests:performance.getEntriesByType('resource').map(e=>e.name).filter(url=>!url.startsWith(location.origin))}));
  if(layout.scrollWidth>width||layout.voice||errors.length)throw new Error(JSON.stringify({layout,errors}));
  results.push({width,height,interactiveMs,layout,errors,browser:browser.version()});await context.close();
 }
 const health=await fetch(`http://127.0.0.1:${port}/health`).then(r=>r.json());await writeFile('test-results/audit/production-smoke.json',JSON.stringify({results,health},null,2));console.log(JSON.stringify({results,health},null,2));
}finally{await browser.close();await new Promise<void>(resolve=>web.httpServer.close(()=>resolve()));await server.close();}
