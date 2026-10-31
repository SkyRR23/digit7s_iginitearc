import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {serveStatic} from '../apps/server/src/static';
const root=resolve('apps/client/public');
const server=createServer((req,res)=>void serveStatic(root,req,res));
let origin='';
beforeAll(async()=>{
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
 const address=server.address();if(!address||typeof address==='string')throw new Error('No listener');
 origin=`http://127.0.0.1:${address.port}`;
});
afterAll(async()=>{await new Promise<void>(done=>server.close(()=>done()));});
describe('locally packaged audio',()=>{
 it('ships only the inventoried recordings with matching file hashes and licence records',()=>{
  const manifest=JSON.parse(readFileSync(resolve(root,'audio/asset-manifest.json'),'utf8'));
  expect(manifest.assets).toHaveLength(52);
  for(const asset of manifest.assets){
   const bytes=readFileSync(resolve(root,'audio',asset.filename));
   expect(bytes.length).toBe(asset.bytes);
   expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
   expect(['CC0-1.0','CC-BY-4.0']).toContain(asset.licence);
   expect(asset.creator).toBeTruthy();expect(asset.sourceUrl).toMatch(/^https:\/\//);
   expect(asset.licenceUrl).toMatch(/^https:\/\/creativecommons.org\//);
  }
 });
 it('serves playable audio MIME types and seekable byte ranges',async()=>{
  const bytes=readFileSync(resolve(root,'audio/wood-tap.mp3'));
  const partial=await fetch(`${origin}/audio/wood-tap.mp3`,{headers:{Range:'bytes=0-15'}});
  expect(partial.status).toBe(206);expect(partial.headers.get('content-type')).toBe('audio/mpeg');
  expect(partial.headers.get('accept-ranges')).toBe('bytes');
  expect(partial.headers.get('content-range')).toBe(`bytes 0-15/${bytes.length}`);
  expect(Buffer.from(await partial.arrayBuffer())).toEqual(bytes.subarray(0,16));
  const tail=await fetch(`${origin}/audio/wood-tap.mp3`,{headers:{Range:'bytes=-8'}});
  expect(tail.status).toBe(206);expect(Buffer.from(await tail.arrayBuffer())).toEqual(bytes.subarray(-8));
  const head=await fetch(`${origin}/audio/wood-tap.ogg`,{method:'HEAD'});
  expect(head.status).toBe(200);expect(head.headers.get('content-type')).toBe('audio/ogg');
  expect((await head.arrayBuffer()).byteLength).toBe(0);
 });
 it('handles missing audio and unsatisfiable ranges without returning the game HTML',async()=>{
  const missing=await fetch(`${origin}/audio/not-present.mp3`);expect(missing.status).toBe(404);
  const invalid=await fetch(`${origin}/audio/wood-tap.mp3`,{headers:{Range:'bytes=999999999-'}});
  expect(invalid.status).toBe(416);expect(invalid.headers.get('content-range')).toMatch(/^bytes \*\/\d+$/);
 });
});
