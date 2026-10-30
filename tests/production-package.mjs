import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {io} from 'socket.io-client';
import {chromium} from 'playwright';
const root=path.resolve(process.argv[2]);const origin='http://127.0.0.1:5194';
const manifest=JSON.parse(fs.readFileSync(path.join(root,'release.json'),'utf8'));
const packageLock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
assert.ok(!packageLock.packages['node_modules/@ashfall/shared'].link,'Shared runtime must be installed as a package, not a host-dependent link');
assert.equal(fs.lstatSync(path.join(root,'node_modules/@ashfall/shared')).isSymbolicLink(),false);
assert.equal(JSON.parse(fs.readFileSync(path.join(root,'server/package.json'),'utf8')).type,'module');
for(const file of manifest.files)assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,file.path))).digest('hex'),file.sha256,file.path);
const child=spawn(process.execPath,['app.js'],{cwd:root,env:{...process.env,PORT:'5194',ALLOWED_ORIGINS:origin},stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',d=>{log+=d;});child.stderr.on('data',d=>{log+=d;});const clients=[];let browser;
async function command(c,input){const reply=await new Promise((resolve,reject)=>c.socket.timeout(4000).emit('command',{...input,actionId:randomUUID()},(e,r)=>e?reject(e):resolve(r)));assert.equal(reply.ok,true,JSON.stringify(reply));if(reply.view)c.view=reply.view;if(reply.session)c.session=reply.session;return reply;}
async function connect(transport){const socket=io(origin,{transports:[transport],upgrade:false,forceNew:true,reconnection:false});const c={socket};clients.push(c);socket.on('state',v=>{c.view=v;});await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});return c;}
async function finish(party){for(let round=0;round<3;round++){for(const c of party){await command(c,{type:'sync'});const v=c.view;if(v.presentation?.awaitingYou)await command(c,{type:'finishPresentation',matchId:v.deal.matchId,presentationId:v.presentation.id});}}}
try{
 for(let i=0;i<80;i++){try{if((await fetch(origin+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));if(i===79)throw new Error(log);}
 assert.ok(!log.includes('MODULE_TYPELESS_PACKAGE_JSON'),log);
 const html=await fetch(origin).then(r=>r.text());assert.ok(html.includes('Ashfall Council'));
 for(const file of manifest.files.filter(f=>f.path.startsWith('public/'))){const response=await fetch(origin+'/'+file.path.slice(7));assert.equal(response.status,200,file.path);}
 assert.equal((await fetch(origin+'/package.json')).status,404);assert.equal((await fetch(origin+'/%2e%2e%2fpackage.json')).status,403);
 const results=[];
 for(const [transport,capacity] of [['websocket',6],['polling',10]]){
  const host=await connect(transport);await command(host,{type:'create',name:'Package host',avatar:'moon',capacity});const party=[host];
  for(let i=1;i<capacity;i++){const c=await connect(transport);await command(c,{type:'join',roomCode:host.view.code,name:`Guest ${i}`,avatar:'moth'});party.push(c);}
  for(const c of party){await command(c,{type:'sync'});await command(c,{type:'ready',ready:true,expectedVersion:c.view.version});}
  await command(host,{type:'sync'});await command(host,{type:'start',expectedVersion:host.view.version});
  for(const c of party){await command(c,{type:'sync'});if(c.view.blackCatChoice&&!c.view.blackCatChoice.submitted)await command(c,{type:'chooseBlackCat',matchId:c.view.deal.matchId,targetId:host.session.playerId});}
  for(const c of party)await command(c,{type:'acknowledgeDeal',matchId:c.view.deal.matchId});await finish(party);await command(host,{type:'sync'});assert.equal(host.view.phase,'DAY');
  const actor=party.find(c=>c.session.playerId===host.view.day.activePlayerId);await command(actor,{type:'sync'});const v=actor.view;await command(actor,{type:'drawCards',matchId:v.deal.matchId,turnNumber:v.day.turnNumber,gameVersion:v.day.version});await finish(party);
  const previous=party[1];const session=previous.session;previous.socket.disconnect();const resumed=await connect(transport);await command(resumed,{type:'resume',session});assert.equal(resumed.view.you.playerId,session.playerId);
  const separate=await connect(transport);await command(separate,{type:'create',name:'Other room',avatar:'moon',capacity:6});assert.notEqual(separate.view.code,host.view.code);assert.equal(separate.view.players.length,1);
  results.push({transport,capacity,createJoinStartDrawReconnectIsolation:true});
 }
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:360,height:640}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.locator('#create:not([disabled])').waitFor();await page.click('#how-to-open');await page.click('#guide-cards');
 await page.locator('[data-guide-card="CURSE"] img').evaluate(el=>el.decode());assert.ok((await page.locator('[data-guide-card="CURSE"] img').getAttribute('src')).endsWith('curse-sigil.svg'));assert.equal(await page.locator('#guide-panel').evaluate(el=>el.scrollWidth<=el.clientWidth),true);assert.deepEqual(errors,[]);
 fs.mkdirSync('test-results/production',{recursive:true});await page.screenshot({path:'test-results/production/package-phone.png'});
 fs.writeFileSync('test-results/production/package-result.json',JSON.stringify({sourceCommit:manifest.sourceCommit,verifiedFiles:manifest.files.length,results,browserErrors:errors},null,2));console.log(JSON.stringify({sourceCommit:manifest.sourceCommit,verifiedFiles:manifest.files.length,results,browserErrors:errors},null,2));
}finally{for(const c of clients)c.socket.disconnect();await browser?.close();child.kill();}
