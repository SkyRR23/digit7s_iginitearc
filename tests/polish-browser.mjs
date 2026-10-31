import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  await page.locator('#create:not([disabled])').waitFor();
  await page.locator('#name').fill('Council Host');
  await page.locator('#create').click();
  await page.locator('#lobby-capacity').selectOption('10');
  await page.waitForFunction(() => document.querySelector('#seats')?.getAttribute('data-capacity') === '10');
  await page.locator('#fill-bots').click();
  await page.waitForFunction(() => document.querySelectorAll('#seats .table-seat:not(.empty)').length === 10);
  const lobby = await page.evaluate(() => [...document.querySelectorAll('#seats .table-seat')].map(seat => {
    const bounds = seat.getBoundingClientRect();
    return { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
  }));
  assert.equal(lobby.length, 10);
  assert.ok(lobby.every(seat => seat.width > 50 && seat.left > -20 && seat.left < 390), 'Ten lobby seats should be laid out separately');
  for (let i=0;i<lobby.length;i++) for (let j=i+1;j<lobby.length;j++) {
    const a=lobby[i], b=lobby[j];
    assert.ok(a.left+a.width <= b.left+1 || b.left+b.width <= a.left+1 ||
      a.top+a.height <= b.top+1 || b.top+b.height <= a.top+1, `Lobby seats ${i+1} and ${j+1} overlap`);
  }
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({ path: 'test-results/polish-lobby-ten.png' });

  const group = await page.evaluate(async () => {
    const { renderDayPanel } = await import('/src/day-panel.ts');
    const root = document.createElement('section'); document.body.append(root);
    const p0 = '11111111-1111-4111-8111-111111111111';
    const p1 = '22222222-2222-4222-8222-222222222222';
    const make = (id, kind) => ({ id, kind });
    const view = {
      phase: 'DAY', players: [{id:p0,name:'Host'},{id:p1,name:'Guest'}], you:{playerId:p0},
      deal:{matchId:'match-for-card-stack',players:[{playerId:p0,alive:true,seals:[]},{playerId:p1,alive:true,seals:[]}]},
      day:{version:1,turnNumber:1,activePlayerId:p0,deadline:Date.now()+60000,deckCount:20,
        playedThisTurn:false,players:[{playerId:p0,doubt:0,statuses:[]},{playerId:p1,doubt:0,statuses:[]}]},
      private:{identities:[]}, hand:[make('e1','EVIDENCE'),make('e2','EVIDENCE'),make('e3','EVIDENCE'),
        make('v1','VOW_OF_HEARTS'),make('v2','VOW_OF_HEARTS')],
    };
    renderDayPanel(root, view, false, () => {});
    const count = root.querySelectorAll('.card-stack').length;
    const badge = root.querySelector('[data-stack-kind="EVIDENCE"] .card-stack-count')?.textContent;
    root.querySelector('[data-stack-kind="EVIDENCE"] [data-card]').click();
    const one = root.querySelector('.selection-hint b')?.textContent;
    root.querySelector('[data-group-plus="EVIDENCE"]').click();
    root.querySelector('[data-group-plus="EVIDENCE"]').click();
    const all = root.querySelector('.selection-hint b')?.textContent;
    root.querySelector('[data-group-minus="EVIDENCE"]').click();
    const two = root.querySelector('.selection-hint b')?.textContent;
    root.querySelector('[data-stack-kind="VOW_OF_HEARTS"] [data-card]').click();
    const vow = root.querySelector('.selection-hint b')?.textContent;
    const vowBadge = root.querySelector('[data-stack-kind="VOW_OF_HEARTS"] .card-stack-count')?.textContent;
    root.remove();
    return { count, badge, one, all, two, vow, vowBadge };
  });
  assert.deepEqual(group, { count:2, badge:'×3', one:'1 selected', all:'3 selected', two:'2 selected', vow:'1 selected', vowBadge:'1/2' });
  const life = await page.evaluate(async () => {
    const { renderPlayerSeat, emptyTableSelection } = await import('/src/tabletop-components.ts');
    const id = '22222222-2222-4222-8222-222222222222';
    const player = { id, name:'Fallen', avatar:'moth', ready:true, connected:true, abandoned:false, isBot:false, botDifficulty:null };
    const view = { phase:'DAY', hostId:'host', you:{playerId:'host'}, players:[player],
      deal:{players:[{playerId:id,alive:false,seals:Array.from({length:5},(_,slot)=>({slot,kind:'HUMAN',revealed:true}))}]},
      day:{activePlayerId:'host',players:[{playerId:id,doubt:0,handCount:0,statuses:[]}]}};
    const markup = renderPlayerSeat(view,player,1,3,emptyTableSelection());
    const parsed = new DOMParser().parseFromString(markup,'text/html');
    return { broken:parsed.querySelectorAll('.broken-heart').length, hearts:parsed.querySelectorAll('.life-heart').length };
  });
  assert.deepEqual(life, { broken:5, hearts:0 });
  console.log(JSON.stringify({ lobbySeats:lobby.length, group, life }));
} finally {
  await browser.close();
}
