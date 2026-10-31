import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,type Page} from 'playwright';
import {createServer as createViteServer} from 'vite';
import {createHarness} from './socket-harness';
const origin='http://127.0.0.1:5191';process.env.ALLOWED_ORIGINS=origin;
const game=await createHarness(60_000,{presentations:true,rateLimit:false});
const address=game.server.http.address();assert.ok(address&&typeof address==='object');
const vite=await createViteServer({configFile:false,root:'apps/client',server:{host:'127.0.0.1',port:5191,strictPort:true,hmr:false,watch:{ignored:['**/*']},proxy:{'/socket.io':{target:`http://127.0.0.1:${address.port}`,ws:true}}}});await vite.listen();
const browser=await chromium.launch({channel:'msedge',headless:true});
await mkdir('test-results/tutorial',{recursive:true});let active:Page|undefined;const errors:string[]=[];
async function settle(page:Page){
 for(let n=0;n<16;n++){
  const skip=page.locator('#game-moment .moment-skip');
  if(await skip.isVisible()){await skip.click();await page.waitForTimeout(90);continue;}
  if(await page.locator('body.table-paused').count()){await page.waitForTimeout(150);continue;}
  return;
 }
 throw Error('Training presentation did not settle.');
}
async function begin(page:Page){await page.locator('#how-to-open').click();await page.locator('#tutorial-open').click();await page.locator('#tutorial-begin').click();await page.locator('#role-continue').click();await page.locator('#reveal-all').click();await page.locator('#acknowledge').click();await settle(page);}
async function next(page:Page){await page.locator('[data-tutorial="next"]').click();await settle(page);}
async function evidence(page:Page){
 const card=page.locator('[data-action-kind="EVIDENCE"]');
 if(page.viewportSize()!.width===360)await card.tap({position:{x:30,y:25}});else{await card.focus();await page.keyboard.press('Enter');}
 const target=page.locator('#seats .is-valid-target').filter({has:page.getByRole('heading',{name:'Cinder',exact:true})});
 if(page.viewportSize()!.width===360)await target.tap();else{await target.focus();await page.keyboard.press('Enter');}
 if(page.viewportSize()!.width===360)await page.locator('#confirm-preview').tap();else{await page.locator('#confirm-preview').focus();await page.keyboard.press('Enter');}
 await settle(page);
}
try {
 for(const width of [1280,360]){
  const context=await browser.newContext({viewport:{width,height:width===360?640:720},hasTouch:width===360,reducedMotion:width===360?'reduce':'no-preference'});
  const page=await context.newPage();active=page;page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin);await page.locator('#create:not([disabled])').waitFor();
  // Existing reference closes back into the handbook; in-game ? remains direct.
  await page.locator('#how-to-open').click();await page.locator('#learning-guide').click();await page.locator('#guide-howto[aria-selected="true"]').waitFor();await page.locator('#guide-close').click();await page.locator('#learning-menu[open]').waitFor();
  await page.locator('#learning-cards').click();await page.locator('#guide-cards[aria-selected="true"]').waitFor();await page.locator('#guide-close').click();await page.locator('#learning-back').click();
  await begin(page);await page.locator('#tutorial-tracker').getByText('Add one Doubt',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('ashfall.tutorial.completed')),null);
  await page.locator('#tutorial-tracker summary').click();await page.locator('[data-tutorial="exit"]').click();await page.locator('#entry:not([hidden])').waitFor();assert.equal(await page.locator('.tutorial-focus').count(),0);
  await begin(page);await page.locator('#tutorial-tracker summary').click();await page.locator('[data-tutorial="restart"]').click();await page.locator('#role-continue').click();await page.locator('#reveal-all').click();await page.locator('#acknowledge').click();await settle(page);
  if(width===1280){
   await page.locator('.tutorial-focus.tutorial-strong').waitFor({timeout:7500});
   await page.locator('.tutorial-focus[data-tutorial-arrow]').waitFor({timeout:7500});
   await page.locator('.tutorial-hint').waitFor({timeout:7500});
   await page.locator('[data-tutorial="show"]').waitFor({timeout:12500});
   await page.locator('[data-tutorial="show"]').click();
   assert.ok(await page.locator('[data-action-kind="EVIDENCE"]').evaluate(el=>el===document.activeElement),'Show me focuses without playing');
   assert.equal(await page.locator('[data-reveal-choice]').count(),0,'Hints do not choose a target or play a card');
  } else await page.locator('[data-tutorial="hint"]').click();
  assert.ok(await page.locator('.tutorial-hint').isVisible());
  await page.screenshot({path:`test-results/tutorial/evidence-${width}.png`});
  await evidence(page);assert.equal(await page.locator('.decision-clock').textContent(),'Paused');await page.locator('[data-reveal-choice="2"]').click();await settle(page);
  await page.locator('#tutorial-tracker').getByText('Your turn is still yours',{exact:true}).waitFor();
  await page.screenshot({path:`test-results/tutorial/hand-${width}.png`});
  assert.ok(await page.locator('#draw-cards').isDisabled());
  // Test both the saved-hand branch and the empty-hand branch through actual card controls.
  if(width===1280){
   await page.locator('[data-action-kind="EVIDENCE"]').click();await page.locator('[data-action-kind="EVIDENCE"]').click();
   await page.locator('#seats .is-valid-target').filter({has:page.getByRole('heading',{name:'Cinder',exact:true})}).click();await page.locator('#confirm-preview').click();await settle(page);
   assert.equal(await page.locator('[data-action-kind="EVIDENCE"]').count(),0);assert.ok(await page.locator('#end-turn').isEnabled());
  }
  await page.locator('#end-turn').click();await settle(page);await page.locator('#tutorial-tracker').getByText('A fresh turn: try Draw 2',{exact:true}).waitFor();
  await page.locator('#draw-cards').click();await settle(page);await page.locator('#tutorial-tracker').getByText('Night falls when the pile empties',{exact:true}).waitFor();
  assert.equal(await page.locator('#night-attack').count(),0);await page.screenshot({path:`test-results/tutorial/night-${width}.png`});
  await next(page);await page.locator('#tutorial-tracker').getByText('Dawn reports the public outcome',{exact:true}).waitFor();await next(page);
  await page.locator('#tutorial-tracker').getByText('What actually ends a match?',{exact:true}).waitFor();await next(page);
  await page.locator('#tutorial-dialog[open]').waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('ashfall.tutorial.completed')),'true');
  await page.screenshot({path:`test-results/tutorial/complete-${width}.png`});
  assert.ok(await page.locator('#tutorial-return').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}));
  if(width===360){
   await page.keyboard.press('Escape');assert.ok(await page.locator('#tutorial-dialog').isVisible(),'Completion waits for an explicit choice');
   await page.locator('#tutorial-return').click();await page.locator('#entry:not([hidden])').waitFor();
   await page.locator('#how-to-open').click();assert.equal(await page.locator('#tutorial-open b').textContent(),'Replay tutorial');
   await page.locator('#tutorial-open').click();await page.locator('#tutorial-begin').click();await page.locator('#role-continue').click();await page.locator('#reveal-all').click();await page.locator('#acknowledge').click();await settle(page);
   await evidence(page);await page.locator('[data-reveal-choice="0"]').click();await settle(page);await page.locator('#end-turn').click();await settle(page);await page.locator('#draw-cards').click();await settle(page);await next(page);await next(page);await next(page);
  }
  // Continue must create a real fresh room, rather than unlock the prepared deal.
  await page.locator('#tutorial-continue').click();await page.locator('#role-continue').waitFor();
  const normal=await page.evaluate(async()=>{const {request,actionId}=await import('/src/connection.ts');const reply=await request({type:'sync',actionId:actionId()});if(!reply.ok||!reply.view)throw Error(JSON.stringify(reply));return reply.view;});
  assert.notEqual(normal.code,'TRAINING');assert.equal(normal.players.filter(player=>player.isBot).length,5);assert.equal(normal.phase,'PRIVATE_DEAL');
  assert.ok(!await page.locator('body.tutorial-active').count());assert.equal(await page.locator('#tutorial-tracker').isVisible(),false);
  // Keep the legitimate private acknowledgement flow, then check assistance and direct help.
  await page.locator('#role-continue').click();if(await page.locator('#role-continue').isVisible())await page.locator('#role-continue').click();
  await page.locator('#reveal-all').click();
  // An Ashbound trainee in the new random deal has a genuine opening vote.
  if(await page.locator('#black-cat-target').isVisible()){
   await page.locator('#black-cat-target').selectOption(normal.you!.playerId);await page.locator('#seal-black-cat').click();
  }
  await page.locator('#acknowledge').click();await settle(page);await page.locator('#beginner-assistance').waitFor();
  if(width===360)await page.locator('#mobile-menu-toggle').click();
  await page.locator('#game-help').click();await page.locator('#how-to-dialog[open]').waitFor();assert.equal(await page.locator('#learning-menu').isVisible(),false);await page.locator('#guide-close').click();
  assert.equal(await page.locator('#learning-menu').isVisible(),false);
  // Preferences remain optional and persistent across reloads.
  if(width===360&&!await page.locator('#mobile-menu[open]').count())await page.locator('#mobile-menu-toggle').click();
  await page.getByRole('button',{name:'Audio settings',exact:true}).click();
  await page.locator('#beginner-toggle').uncheck();assert.equal(await page.evaluate(()=>localStorage.getItem('ashfall.beginner-assistance')),'off');await page.locator('#audio-close').click();
  assert.equal(await page.locator('#beginner-assistance').isVisible(),false);
  await page.reload();await page.locator('#lobby:not([hidden])').waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('ashfall.tutorial.completed')),'true');
  assert.equal(await page.locator('#beginner-assistance').isVisible(),false);
  await context.close();console.log(`Tutorial ${width}px: handbook, restart/exit, real accusation, hand management, Draw 2, Night/Dawn and fresh five-bot match passed.`);
 }
 assert.deepEqual(errors,[]);await writeFile('test-results/tutorial/results.json',JSON.stringify({widths:[1280,360],heights:[720,640],fullWalkthrough:true,keyboard:true,nativeTouch:true,reducedMotion:true,timedHints:true,showMeDoesNotPlay:true,savedHand:true,emptyHand:true,restart:true,exit:true,handbook:true,completionReturn:true,replay:true,freshNormalMatch:true,assistancePersistent:true,inGameHelpDirect:true,pageErrors:errors},null,2));
}catch(error){await active?.screenshot({path:'test-results/tutorial/failure.png'}).catch(()=>{});throw error;}
finally{await browser.close();await vite.close();await game.close();}
