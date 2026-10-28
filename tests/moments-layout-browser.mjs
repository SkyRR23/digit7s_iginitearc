import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

await mkdir('test-results/digital-ui',{recursive:true});
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??'msedge',headless:true});
try {
  const page=await browser.newPage({reducedMotion:'reduce'});
  await page.goto(process.env.TEST_URL??'http://127.0.0.1:5173/');
  for(const [width,height] of [[1440,900],[390,844],[320,640],[568,320],[844,390]]) for(const kind of ['WHISPER','SCAPEGOAT']) {
    await page.setViewportSize({width,height});
    await page.evaluate(async kind=>{
      const {animateGameMoments,clearGameMoments}=await import('/src/game-moments.ts');
      clearGameMoments();
      const view={phase:'DAY',you:{playerId:'a'},deal:{matchId:'layout-fixture',players:[]},day:{dayNumber:1},role:null,
        players:[{id:'a',name:'Football Club',avatar:'moon'},{id:'b',name:'Wren',avatar:'reed'},{id:'c',name:'Morrow',avatar:'moth'}]};
      animateGameMoments(null,view,[]);
      animateGameMoments(view,view,[{id:'layout-play',type:'PLAY',actorId:'a',targetId:'b',...(kind==='SCAPEGOAT'?{secondTargetId:'c'}:{}),cardKind:kind}]);
    },kind);
    const people=await page.locator('#game-moment .moment-person').count();
    assert.equal(people,kind==='SCAPEGOAT'?3:2);
    for(const selector of ['.moment-eyebrow','.moment-art','h2','.moment-person','.moment-description','.moment-controls button']) {
      const boxes=await page.locator(`#game-moment ${selector}`).evaluateAll(nodes=>nodes.map(node=>{
        const box=node.getBoundingClientRect();return {x:box.x,y:box.y,width:box.width,height:box.height};
      }));
      assert.ok(boxes.every(box=>box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height),
        `${kind} ${selector} fits at ${width} × ${height}: ${JSON.stringify(boxes)}`);
    }
    assert.ok((await page.locator('.moment-person strong').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).color))).every(color=>color==='rgb(188, 255, 208)'),'Actor and recipient names use green');
    await page.screenshot({path:`test-results/digital-ui/closeup-${kind.toLowerCase()}-${width}-${height}.png`});
  }
  console.log('Actor, recipient(s), card art and explanations fit desktop, phone and short landscape close-ups.');
} finally {await browser.close();}
