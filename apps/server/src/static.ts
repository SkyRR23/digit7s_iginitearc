import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.ico':'image/x-icon','.mp3':'audio/mpeg','.ogg':'audio/ogg','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8'};
export async function serveStatic(root:string,req:IncomingMessage,res:ServerResponse) {
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
 try{
  const pathname=decodeURIComponent(new URL(req.url??'/', 'http://internal').pathname);
  const base=resolve(root);const file=resolve(base,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(base+sep)||pathname.includes('\0')){res.writeHead(403);res.end();return;}
  const info=await stat(file);if(!info.isFile())throw new Error('Not a file');
  res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Cache-Control',pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache');
  let start=0,end=info.size-1,status=200;
  if(/\.(mp3|ogg)$/.test(file)) {
   res.setHeader('Accept-Ranges','bytes');
   if(req.headers.range) {
    const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(match&&(match[1]||match[2])) {
     if(match[1]) {start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;}
     else {const suffix=Number(match[2]);start=Math.max(0,info.size-suffix);}
    }else start=info.size;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=info.size||end<start) {
     res.setHeader('Content-Range',`bytes */${info.size}`);res.setHeader('Content-Length',0);res.writeHead(416);res.end();return;
    }
    status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${info.size}`);
   }
  }
  res.setHeader('Content-Length',status===206?end-start+1:info.size);res.writeHead(status);
  if(req.method==='HEAD')res.end();else createReadStream(file,status===206?{start,end}:undefined).on('error',()=>res.destroy()).pipe(res);
 }catch{if(!res.headersSent)res.writeHead(404);res.end();}
}
