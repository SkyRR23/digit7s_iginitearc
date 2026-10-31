import {createGameServer} from '../apps/server/dist/server.js';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
fs.mkdirSync('test-results/audio',{recursive:true});
const server=createGameServer({staticDir:path.resolve('apps/client/dist')});const port=await server.listen(0);let browser;
try {
 browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
 for(const {width,blocked} of [{width:1280,blocked:false},{width:320,blocked:false},{width:360,blocked:false},{width:360,blocked:true}]) {
  const context=await browser.newContext({viewport:{width,height:width===360?640:720}});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  if(blocked)await context.route(/\/audio\/.*\.(ogg|mp3)$/,route=>route.fulfill({status:404,body:''}));
  await page.goto(`http://127.0.0.1:${port}`);await page.locator('#create:not([disabled])').waitFor();
  await page.locator('#credits-open').click();
  assert.equal(await page.locator('#guide-credits').getAttribute('aria-selected'),'true');
  assert.match(await page.locator('.credits-attribution').textContent(),/Scott Buckley.*CC-BY 4.0/s);
  assert.equal(await page.locator('.credits-source summary').first().locator('span').first().textContent(),'Phoenix (2026)');
  assert.equal(await page.locator('#credits-audio').textContent(),'Music, Ambience & Sound Credits');
  assert.ok(await page.locator('#how-to-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Credits fit phone/desktop without horizontal overflow');
  await page.locator('#guide-credits').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#guide-roles').getAttribute('aria-selected'),'true');await page.keyboard.press('End');
  assert.equal(await page.locator('#guide-credits').getAttribute('aria-selected'),'true');
  await page.locator('.credits-source:not(.credits-attribution) summary').first().click();
  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});document.execCommand=command=>{if(command==='copy'){window.copiedCredits=document.activeElement.value;return true;}return false;};});
  await page.locator('#copy-credits').click();
  assert.match(await page.evaluate(()=>window.copiedCredits),/Town in ruins loop.*Brandon Morris/s);
  assert.match(await page.evaluate(()=>window.copiedCredits),/Brian MacIntosh/);
  assert.equal(await page.locator('#credits-status').textContent(),'Audio credits copied.');
  await page.screenshot({path:`test-results/audio/credits-${width}.png`});
  for(const path of ['/credits/software-notices.txt','/credits/project-notes.txt','/audio/asset-manifest.json'])assert.equal((await page.request.get(`http://127.0.0.1:${port}${path}`)).status(),200);
  await page.locator('#guide-close').click();assert.equal(await page.locator('#credits-open').evaluate(el=>el===document.activeElement),true);
  if(width<=680)await page.locator('#mobile-menu-toggle').click();
  await page.locator('#game-credits').click();assert.equal(await page.locator('#guide-credits').getAttribute('aria-selected'),'true');await page.locator('#guide-close').click();
  if(width<=680)await page.locator('#mobile-menu-toggle').click();
  await page.getByRole('button',{name:'Audio settings',exact:true}).click();assert.equal(await page.locator('#audio-settings input[type="range"]').count(),4);assert.equal(await page.locator('#beginner-toggle').count(),1);
  for(const channel of ['master','music','ambience','sfx']) {
   const slider=page.locator(`#audio-settings input[data-channel="${channel}"]`);await slider.focus();await slider.press('Home');await slider.press('ArrowRight');
   assert.equal(await slider.evaluate(el=>el.nextElementSibling.textContent),'1%');
   assert.equal(await page.evaluate(channel=>JSON.parse(localStorage.getItem('ashfall.audio.v1'))[channel],channel),.01);
  }
  assert.equal(await page.locator('.audio-credits a').getAttribute('href'),'/audio/credits.html');
  assert.ok(await page.locator('#audio-settings').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}));
  await page.locator('#audio-mute').click();assert.equal(await page.locator('#sound-toggle').textContent(),'Sound: Off');
  await page.locator('#audio-close').click();
  if(width<=680)await page.locator('#mobile-menu-toggle').click();
  await page.locator('#sound-toggle').click();
  if(width<=680)await page.locator('#mobile-menu-close').click();
  await page.locator('#name').fill('Audio QA');await page.locator('#create').click();await page.locator('#fill-bots').waitFor();
  await page.locator('#fill-bots').click();await page.locator('#ready').click();await page.locator('#start:not([disabled])').waitFor();
  await page.locator('#start').click();await page.waitForTimeout(800);
  await page.screenshot({path:`test-results/audio/ui-${width}${blocked?'-missing-media':''}.png`});await context.close();
 }
 const previewContext=await browser.newContext();const preview=await previewContext.newPage();
 preview.on('pageerror',e=>errors.push(e.message));
 await preview.goto(`http://127.0.0.1:${port}/audio/credits.html`);
 assert.equal(await preview.locator('audio').count(),26);
 assert.equal(await preview.evaluate(()=>performance.getEntriesByType('resource').filter(e=>/\.(mp3|ogg)$/.test(e.name)).length),0,'Credits previews do not preload the library');
 await preview.locator('audio').first().click({position:{x:18,y:18}});
 await preview.waitForFunction(()=>document.querySelector('audio').currentTime>0&&!document.querySelector('audio').paused);
 await previewContext.close();
 assert.deepEqual(errors,[]);fs.writeFileSync('test-results/audio/ui.json',JSON.stringify({widths:[1280,320,360],creditsTab:true,creditsKeyboardNavigation:true,creditsCopyFallback:true,packagedCreditNotices:true,settingsSliders:4,keyboardSlidersPersist:true,modalWithinViewport:true,muteUI:true,createFillReadyStart:true,missingMediaGameplay:true,localPreviewPlayers:26,previewPreload:false,pageErrors:errors},null,2));console.log('Production audio UI checks passed');
}finally{await browser?.close();await server.close();}
