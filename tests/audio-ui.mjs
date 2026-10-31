import {createGameServer} from '../apps/server/dist/server.js';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const server=createGameServer({staticDir:path.resolve('apps/client/dist')});const port=await server.listen(0);let browser;
try {
 browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
 for(const width of [1280,360]) {
  const context=await browser.newContext({viewport:{width,height:width===360?640:720}});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}`);await page.locator('#create:not([disabled])').waitFor();
  await page.getByRole('button',{name:'Audio settings',exact:true}).click();assert.equal(await page.locator('#audio-settings input').count(),4);
  assert.ok(await page.locator('#audio-settings').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}));
  await page.locator('#audio-mute').click();assert.equal(await page.locator('#sound-toggle').textContent(),'Sound: Off');
  await page.locator('#audio-close').click();await page.locator('#name').fill('Audio QA');await page.locator('#create').click();await page.locator('#fill-bots').waitFor();
  await page.locator('#fill-bots').click();await page.locator('#ready').click();await page.locator('#start:not([disabled])').waitFor();
  await page.locator('#start').click();await page.waitForTimeout(800);
  await page.screenshot({path:`test-results/audio/ui-${width}.png`});await context.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync('test-results/audio/ui.json',JSON.stringify({widths:[1280,360],settingsSliders:4,modalWithinViewport:true,muteUI:true,createFillReadyStart:true,pageErrors:errors},null,2));console.log('Production audio UI checks passed');
}finally{await browser?.close();await server.close();}
