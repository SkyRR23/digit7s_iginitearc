// Mechanical asset transcoding only: retain the generated source PNGs and alpha.
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
const root = resolve('apps/client/public/art');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge', headless: true });
const page = await browser.newPage();
let before = 0, after = 0;
try {
  const assets = [{path:join(root,'digital-village.png'), max:1920}];
  for (const folder of ['roles','cards']) for (const file of await readdir(join(root,folder))) {
    if (file.endsWith('.png')) assets.push({path:join(root,folder,file),max:folder==='roles'?900:640});
  }
  for (const asset of assets) {
    const input = await readFile(asset.path); before += input.length;
    const encoded = await page.evaluate(async ({source,max}) => {
      const image = new Image(); image.src = source; await image.decode();
      const scale = Math.min(1,max/Math.max(image.width,image.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width*scale); canvas.height = Math.round(image.height*scale);
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      return canvas.toDataURL('image/webp',.88).split(',')[1];
    },{source:`data:image/png;base64,${input.toString('base64')}`,max:asset.max});
    const output = asset.path.replace(/\.png$/,'.webp');
    await writeFile(output,Buffer.from(encoded,'base64')); after += (await stat(output)).size;
  }
  console.log(JSON.stringify({sourceBytes:before,servedBytes:after,reductionPercent:Math.round(100*(1-after/before))}));
} finally { await browser.close(); }
