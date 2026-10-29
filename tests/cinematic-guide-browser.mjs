import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
await mkdir('test-results/cinematic-guide',{recursive:true});
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??'msedge',headless:true});
const origin=process.env.TEST_URL??'http://127.0.0.1:5173/';
try {
  const page=await browser.newPage({reducedMotion:'reduce'});
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin); await page.locator('#create:not([disabled])').waitFor();
  // Guide images are captured from an isolated demonstration match, never a user room.
  for(const [width,height] of [[1440,900],[390,844],[320,640],[568,320]]) {
    await page.setViewportSize({width,height}); await page.locator('#game-help').click();
    await page.getByRole('tab',{name:'Roles & portraits'}).click();
    assert.equal(await page.locator('.guide-role').count(),7);
    for(const img of await page.locator('.guide-role img').all()) {await img.scrollIntoViewIfNeeded();await img.evaluate(el=>el.decode());}
    await page.locator('#guide-cards').click();
    assert.equal(await page.locator('.guide-card').count(),18);
    for(const img of await page.locator('.guide-card img').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(el=>el.decode());}
    assert.match(await page.locator('[data-guide-card="SCAPEGOAT"]').textContent(),/all Doubt/);
    assert.match(await page.locator('.guide-life-note').textContent(),/Opening Black Cat/);
    assert.ok(await page.locator('#how-to-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),`Cards library fits ${width} × ${height}`);
    await page.screenshot({path:`test-results/cinematic-guide/cards-${width}-${height}.png`});
    await page.locator('#guide-howto').click();
    for(let step=0;step<8;step++) {
      await page.locator(`[data-guide-step="${step}"]`).click();
      const image=page.locator('.guide-step img'); await image.evaluate(el=>el.decode());
      assert.ok(await image.evaluate(el=>el.naturalWidth>0));
      assert.ok(await page.locator('#how-to-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),`Guide has no horizontal overflow at ${width} × ${height}`);
    }
    await page.screenshot({path:`test-results/cinematic-guide/guide-${width}-${height}.png`});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#game-help').evaluate(el=>el===document.activeElement),true);
  }
  for(const [width,height] of [[1440,900],[390,844],[320,640],[568,320]]) for(const kind of ['ASHBOUND','VILLAGER','HEXER']) {
    await page.setViewportSize({width,height});
    await page.evaluate(async({kind,width})=>{
      document.getElementById('entry').hidden=true;document.getElementById('lobby').hidden=false;document.body.classList.add('game-screen');
      const {renderRolePanel}=await import('/src/role-panel.ts');
      // Follow Vite's canonical dependency URL (including its HMR revision), so
      // the fixture registers the same private-panel instance used by the role UI.
      const source=await (await fetch('/src/role-panel.ts')).text();
      const privateUrl=source.match(/from\s*["']([^"']*private-panel[^"']*)["']/)[1];
      const {renderPrivatePanel}=await import(privateUrl);
      const ashbound=kind!=='VILLAGER';
      const ids=['demo-owner','demo-ally','demo-2','demo-3','demo-4','demo-5'];
      const view={phase:'PRIVATE_DEAL',you:{playerId:ids[0]},players:ids.map((id,i)=>({id,name:i===0?'Demo Player':i===1?'Demo Ally':`Demo ${i}`,avatar:'moon',connected:true})),
        role:{kind,ability:'UNAVAILABLE',peek:null,result:null,notices:[],individualWin:false},
        private:{everWitch:ashbound,constableAbility:false,witchTeammateIds:ashbound?[ids[1]]:[],identities:Array.from({length:5},(_,slot)=>({id:`demo-life-${slot}`,slot,kind:ashbound&&slot===2?'WITCH':'HUMAN'}))},
        deal:{matchId:`demo-${kind}-${width}`,players:ids.map(playerId=>({playerId,alive:true,acknowledged:false,seals:Array.from({length:5},(_,slot)=>({slot,revealed:false}))}))}};
      renderPrivatePanel(document.getElementById('private-panel'),view,false,()=>{});
      renderRolePanel(document.getElementById('role-panel'),view,false,()=>{},()=>{});
    },{kind,width});
    assert.equal(await page.locator('#role-panel .private-team').count(),0);
    const picture=await page.locator('.opening-character img').boundingBox();
    assert.ok(picture&&picture.y>=0&&picture.x>=0&&picture.x+picture.width<=width&&picture.y+picture.height<=height,`Full ${kind} portrait fits ${width} × ${height}: ${JSON.stringify(picture)}`);
    await page.locator('#role-continue').scrollIntoViewIfNeeded();
    const next=await page.locator('#role-continue').boundingBox(); assert.ok(next&&next.y>=-1&&next.y+next.height<=height+1,`${kind} continue fits ${width} × ${height}: ${JSON.stringify(next)}`);
    await page.screenshot({path:`test-results/cinematic-guide/opening-${kind.toLowerCase()}-${width}-${height}.png`});
    await page.locator('#role-continue').click();
    if(kind!=='VILLAGER') {
      assert.equal(await page.locator('#role-panel').getAttribute('data-opening-step'),'team');
      assert.equal(await page.locator('.opening-character').count(),0);
      assert.match(await page.locator('.team-names').textContent(),/Demo Ally/);
      await page.locator('#role-continue').click();
    }
    assert.equal(await page.locator('#private-panel:not([hidden])').count(),1,JSON.stringify(await page.evaluate(()=>({role:document.getElementById('role-panel').outerHTML.slice(0,350),private:document.getElementById('private-panel').outerHTML.slice(0,300)}))));
    assert.equal(await page.locator('#private-panel .private-team,#private-panel .private-role-summary').count(),0);
    await page.locator('#private-close').click();
  }
  await page.reload(); await page.locator('#create:not([disabled])').waitFor(); await page.setViewportSize({width:390,height:844});
  await page.clock.install({time:new Date('2026-10-28T09:00:00Z')});
  await page.clock.pauseAt(new Date('2026-10-28T09:00:01Z'));
  await page.evaluate(async()=>{
    const {animateGameMoments}=await import('/src/game-moments.ts');
    const players=[{id:'a',name:'Demo Actor',avatar:'moon'},{id:'b',name:'Demo Villager',avatar:'reed'}];
    const before={phase:'DAY',you:{playerId:'a'},players,role:null,day:{dayNumber:1,outcome:null},deal:{matchId:'demo-reveal',players:[{playerId:'b',alive:true,seals:Array.from({length:5},(_,slot)=>({slot,revealed:false}))}]}};
    const next=structuredClone(before);next.deal.players[0].seals[2]={slot:2,revealed:true,kind:'HUMAN'};
    animateGameMoments(null,before,[]);animateGameMoments(before,next,[{id:'seven',type:'REVEAL_PENDING',targetId:'b'},{id:'show',type:'REVEAL',targetId:'b',slot:2}]);
  });
  assert.equal(await page.locator('#game-moment').getAttribute('data-reveal-stage'),'announcement');
  assert.equal(await page.locator('#game-moment img').count(),0);
  await page.clock.fastForward(1599);assert.equal(await page.locator('#game-moment').getAttribute('data-reveal-stage'),'announcement');
  await page.clock.fastForward(1);assert.equal(await page.locator('#game-moment').getAttribute('data-reveal-stage'),'portrait');
  await page.locator('.moment-hold').click();await page.clock.fastForward(10000);
  assert.equal(await page.locator('#game-moment').getAttribute('data-reveal-stage'),'portrait','Keep open survives beyond the default lifetime');
  await page.locator('.moment-hold').click();await page.clock.fastForward(6400);
  assert.equal(await page.locator('#game-moment').getAttribute('data-reveal-stage'),'position');
  assert.equal(await page.locator('.revealed-position').getAttribute('data-reveal-slot'),'2');
  await page.clock.fastForward(5999);assert.equal(await page.locator('#game-moment').getAttribute('data-reveal-stage'),'position');
  await page.clock.fastForward(1);assert.equal(await page.locator('#game-moment').getAttribute('data-kind'),'verdict');
  await page.clock.fastForward(5999);assert.equal(await page.locator('#game-moment').count(),1);
  await page.clock.fastForward(1);assert.equal(await page.locator('#game-moment').count(),0);
  const glow=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
  await glow.goto(origin);await glow.locator('#create:not([disabled])').waitFor();
  const fade=await glow.evaluate(async()=>{
    const {animateGameMoments}=await import('/src/game-moments.ts');
    const view={phase:'DAY',you:{playerId:'a'},players:[{id:'a',name:'Demo Actor',avatar:'moon'},{id:'b',name:'Demo Target',avatar:'reed'}],role:null,day:{dayNumber:1,outcome:null},deal:{matchId:'glow-demo',players:[]}};
    animateGameMoments(null,view,[]);animateGameMoments(view,view,[{id:'glow-play',type:'PLAY',actorId:'a',targetId:'b',cardKind:'STOCKS'}]);
    const aura=document.querySelector('.moment-aura'),content=document.querySelector('.moment-content');
    const a=aura.getAnimations()[0],c=content.getAnimations()[0];a.pause();c.pause();
    const duration=Number(a.effect.getTiming().duration);
    a.currentTime=duration*.7;c.currentTime=duration*.7;
    const held={aura:Number(getComputedStyle(aura).opacity),content:Number(getComputedStyle(content).opacity)};
    a.currentTime=duration*.9;c.currentTime=duration*.9;
    const auraGone={aura:Number(getComputedStyle(aura).opacity),content:Number(getComputedStyle(content).opacity)};
    a.currentTime=duration*.98;c.currentTime=duration*.98;
    const leaving={aura:Number(getComputedStyle(aura).opacity),content:Number(getComputedStyle(content).opacity)};
    a.currentTime=duration*.7;c.currentTime=duration*.7;
    return {duration,held,auraGone,leaving};
  });
  assert.equal(fade.duration,6500);assert.ok(fade.held.aura>.5&&fade.held.content>.9);
  assert.ok(fade.auraGone.aura<.01&&fade.auraGone.content>.9,'Glow disappears before the readable content');
  assert.ok(fade.leaving.content<.9&&fade.leaving.content>0,'The remaining content then fades');
  await glow.screenshot({path:'test-results/cinematic-guide/glow-closeup.png'});
  await glow.locator('.moment-help').click();
  assert.equal(await glow.locator('#guide-cards[aria-selected="true"]').count(),1);
  assert.equal(await glow.locator('.moment-hold').getAttribute('aria-pressed'),'true','Opening card reference holds the close-up');
  await glow.locator('#guide-close').click();
  assert.equal(await glow.locator('.moment-hold').getAttribute('aria-pressed'),'false','Closing the reference resumes the close-up');
  if(process.argv.includes('--refresh-result-image')) {
    await glow.evaluate(async()=>{
      const {clearGameMoments}=await import('/src/game-moments.ts');clearGameMoments();
      const {renderActionSpotlight,renderMatchHud}=await import('/src/digital-stage.ts');
      const {emptyTableSelection}=await import('/src/tabletop-components.ts');
      const view={phase:'GAME_OVER',players:[],personalResult:'WIN',you:{playerId:'demo'},day:{dayNumber:2,deckCount:0,discardCount:83,deadline:null,outcome:{winner:'HUMAN',reason:'ALL_WITCH_SEALS_REVEALED'}}};
      document.body.classList.add('game-screen');document.getElementById('entry').hidden=true;
      const lobby=document.getElementById('lobby');lobby.hidden=false;lobby.classList.add('is-in-match');lobby.dataset.phase='GAME_OVER';
      document.getElementById('match-hud').innerHTML=renderMatchHud(view);
      document.getElementById('action-spotlight').innerHTML=renderActionSpotlight(view,emptyTableSelection());
    });
    await glow.locator('#action-spotlight').screenshot({path:'apps/client/public/guide/victory.png'});
  }
  assert.deepEqual(errors,[]);
  console.log('Guide portraits/screenshots, separate red/gold openings, staged public Life reveal, eight-second reading time and Keep open passed.');
} finally {await browser.close();}
