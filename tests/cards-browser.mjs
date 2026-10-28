import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge', headless: true });
const errors = [];
async function newPage(width,height) {
  const context = await browser.newContext({ viewport: { width,height }, hasTouch: width <= 400 });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.TEST_URL ?? 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
  await page.locator('#create:not([disabled])').waitFor();
  return {context,page};
}
async function council(page,capacity) {
  await page.locator('#name').fill(`Tester ${capacity}`);
  await page.locator('#capacity').selectOption(String(capacity));
  await page.locator('#create').click();
  await page.locator('#lobby').waitFor({state:'visible'});
  await page.locator('#fill-bots').click();
  await page.waitForFunction(expected => document.querySelectorAll('#seats .table-seat:not(.empty)').length === expected,capacity);
  await page.locator('#ready').click();
  await page.locator('#start:not([disabled])').click();
  await page.locator('#seats .is-you .identity-back').click();
  await page.locator('#reveal-all').click();
  await page.locator('#acknowledge:not([disabled])').click();
  await page.locator('#lobby[data-phase="DAY"]').waitFor({timeout:15000});
  return page.evaluate(() => ({
    capacity: document.querySelectorAll('#seats .table-seat:not(.empty)').length,
    life: document.querySelectorAll('#seats .public-seals li').length,
    marks: document.querySelectorAll('#seats .doubt-tile.filled').length,
    emptyMarksVisible: [...document.querySelectorAll('#seats .doubt-tile.unused')].some(el => getComputedStyle(el).visibility !== 'hidden'),
    scroll: [document.documentElement.scrollWidth,document.documentElement.scrollHeight,innerWidth,innerHeight],
    hand: document.querySelectorAll('.action-hand [data-card]').length,
    seatBounds: [...document.querySelectorAll('#seats .table-seat:not(.empty)')].map(el => {
      const r=el.getBoundingClientRect(); return [r.left,r.right,r.top,r.bottom];
    }),
  }));
}
try {
  const phone=await newPage(360,640);
  const six=await council(phone.page,6);
  assert.equal(six.capacity,6); assert.equal(six.life,30); assert.equal(six.marks,0);
  assert.equal(six.emptyMarksVisible,false);
  assert.ok(six.scroll[0] <= six.scroll[2],`phone horizontal overflow: ${six.scroll}`);
  assert.ok(six.scroll[1] <= six.scroll[3],`phone vertical overflow: ${six.scroll}`);
  await phone.page.screenshot({path:'test-results/cards-phone.png'});
  const playable = phone.page.locator('.action-hand [data-card]:not([data-action-kind="CURSE"]):not([data-action-kind="SCAPEGOAT"])').first();
  if (await playable.count()) {
    await playable.click();
    if (!await phone.page.locator('.play-preview').count()) {
      await phone.page.locator('.table-seat.is-valid-target .portrait-wrap').first().click();
      if (await phone.page.locator('.table-seat.is-valid-target').count())
        await phone.page.locator('.table-seat.is-valid-target .portrait-wrap').first().click();
    }
    await phone.page.locator('.play-preview').waitFor();
    await phone.page.locator('#cancel-preview').click();
    assert.equal(await phone.page.locator('.play-preview').count(),0);
    await playable.click();
    if (!await phone.page.locator('.play-preview').count()) {
      await phone.page.locator('.table-seat.is-valid-target .portrait-wrap').first().click();
      if (await phone.page.locator('.table-seat.is-valid-target').count())
        await phone.page.locator('.table-seat.is-valid-target .portrait-wrap').first().click();
    }
    await phone.page.locator('#confirm-preview:not([disabled])').click();
    await phone.page.waitForFunction(() => Number(document.querySelector('.discard-pile b')?.textContent) >= 1);
  }
  await phone.page.setViewportSize({width:1280,height:720});
  await phone.page.screenshot({path:'test-results/cards-desktop.png'});
  const desktop=await phone.page.evaluate(() => [document.documentElement.scrollWidth,document.documentElement.scrollHeight,innerWidth,innerHeight]);
  assert.ok(desktop[0]<=desktop[2] && desktop[1]<=desktop[3],`desktop overflow: ${desktop}`);
  const larger=await newPage(1280,720);
  const ten=await council(larger.page,10);
  assert.equal(ten.capacity,10); assert.equal(ten.life,50); assert.equal(ten.marks,0);
  assert.equal(ten.emptyMarksVisible,false);
  assert.ok(ten.scroll[0]<=ten.scroll[2] && ten.scroll[1]<=ten.scroll[3],`ten-seat overflow: ${ten.scroll}`);
  await larger.page.screenshot({path:'test-results/cards-ten.png'});
  await larger.page.setViewportSize({width:360,height:640});
  const smallTen=await larger.page.evaluate(() => [document.documentElement.scrollWidth,document.documentElement.scrollHeight,innerWidth,innerHeight]);
  assert.ok(smallTen[0]<=smallTen[2] && smallTen[1]<=smallTen[3],`ten-seat phone overflow: ${smallTen}`);
  await larger.page.screenshot({path:'test-results/cards-ten-phone.png'});
  await larger.page.setViewportSize({width:844,height:390});
  const landscapeTen=await larger.page.evaluate(() => [document.documentElement.scrollWidth,document.documentElement.scrollHeight,innerWidth,innerHeight]);
  assert.ok(landscapeTen[0]<=landscapeTen[2] && landscapeTen[1]<=landscapeTen[3],`ten-seat landscape overflow: ${landscapeTen}`);
  await larger.page.screenshot({path:'test-results/cards-ten-landscape.png'});
  const intermediate = [];
  for (const capacity of [7,8,9]) {
    const run = await newPage(360,640);
    const result = await council(run.page,capacity);
    assert.equal(result.capacity,capacity);
    assert.equal(result.life,capacity*5);
    assert.equal(result.marks,0);
    assert.equal(result.emptyMarksVisible,false);
    assert.ok(result.scroll[0]<=result.scroll[2] && result.scroll[1]<=result.scroll[3],`${capacity}-seat phone overflow: ${result.scroll}`);
    intermediate.push({capacity,seatBounds:result.seatBounds});
    await run.page.screenshot({path:`test-results/cards-${capacity}-phone.png`});
    await run.context.close();
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({six,ten,desktop,smallTen,landscapeTen,intermediate,errors},null,2));
  await phone.context.close(); await larger.context.close();
} finally { await browser.close(); }
