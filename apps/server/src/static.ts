import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.ico':'image/x-icon'};
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
  res.setHeader('Content-Length',info.size);res.writeHead(200);
  if(req.method==='HEAD')res.end();else createReadStream(file).on('error',()=>res.destroy()).pipe(res);
 }catch{if(!res.headersSent)res.writeHead(404);res.end();}
}
