import {randomUUID} from 'node:crypto';
import {afterEach,beforeEach,describe,it,expect} from 'vitest';
import {createHarness,type Client} from './socket-harness';
let h:Awaited<ReturnType<typeof createHarness>>,clock:number;
const id=(c:Client)=>c.session!.playerId;
async function setup(witches=true,index=5){
 h=await createHarness(60_000,{now:()=>clock,rateLimit:false,randomIndex:max=>index%max,botTickMs:1_000_000,identityFactory:ids=>({
  id:randomUUID(),players:ids.map((id,i)=>({id,alive:true,acknowledged:false,everWitch:witches&&(i===0||i===5)})),
  cards:ids.flatMap((ownerId,i)=>Array.from({length:5},(_,slot)=>({id:randomUUID(),ownerId,slot,revealed:false,kind:witches&&(i===0||i===5)&&slot===4?'WITCH' as const:'HUMAN' as const})))})});
 const party=await h.six();await h.start(party,false);return party;
}
async function confirm(party:Client[]){for(const c of party)await h.accepted(c,{type:'acknowledgeDeal',matchId:c.view!.deal!.matchId});await Promise.all(party.map(h.sync));}
beforeEach(()=>{clock=100_000;});afterEach(async()=>h?.close());
describe('timed private deal and opening Curse',()=>{
 it('starts at 90 seconds, seals unchanged arrangements automatically and gives the ritual its own 30 seconds',async()=>{
  const p=await setup(),host=p[0]!,matchId=host.view!.deal!.matchId;
  expect(host.view!.opening?.deadline).toBe(clock+90_000);expect(host.view!.blackCatChoice).toBeNull();
  expect(await h.send(host,{type:'chooseBlackCat',matchId,targetId:id(host)})).toMatchObject({code:'PHASE'});
  const ids=host.view!.private!.identities.map(c=>c.id).reverse();await h.accepted(host,{type:'arrangeSeals',matchId,cardIds:ids});
  clock+=90_000;h.server.store.sweep();await Promise.all(p.map(h.sync));
  expect(host.view!.phase).toBe('OPENING_CURSE');expect(host.view!.opening).toEqual({deadline:clock+30_000,inspectionTimedOut:true});
  expect(host.view!.deal!.players.every(p=>p.acknowledged)).toBe(true);expect(host.view!.private!.identities.map(c=>c.id)).toEqual(ids);
  expect(host.view!.feed.some(e=>e.text.includes('automatically sealed'))).toBe(true);
  expect(await h.send(host,{type:'arrangeSeals',matchId,cardIds:ids})).toMatchObject({code:'PHASE'});
  expect(await h.send(host,{type:'drawCards',matchId,turnNumber:1,gameVersion:0})).toMatchObject({ok:false});
 });
 it('advances early, keeps eligibility private, preserves secret ballots and deadline on reconnect, and resolves ties once',async()=>{
  const p=await setup();await confirm(p);const matchId=p[0]!.view!.deal!.matchId,deadline=p[0]!.view!.opening!.deadline;
  expect(deadline).toBe(clock+30_000);expect(p[1]!.view!.blackCatChoice).toBeNull();
  expect(await h.send(p[1]!,{type:'chooseBlackCat',matchId,targetId:id(p[2]!)})).toMatchObject({code:'ABILITY'});
  const packet={type:'chooseBlackCat' as const,actionId:randomUUID(),matchId,targetId:id(p[3]!)};await h.accepted(p[0]!,packet);await h.accepted(p[0]!,packet);
  const resumed=await h.connect();await h.accepted(resumed,{type:'resume',session:p[0]!.session!});
  expect(resumed.view!.opening!.deadline).toBe(deadline);expect(resumed.view!.blackCatChoice?.targetId).toBe(id(p[3]!));
  await h.sync(p[1]!);expect(p[1]!.view!.blackCatChoice).toBeNull();expect(p[1]!.view!.feed).toEqual(resumed.view!.feed);
  await h.accepted(p[5]!,{type:'chooseBlackCat',matchId,targetId:id(p[2]!)});await h.sync(resumed);
  expect(resumed.view!.phase).toBe('DAY');expect(resumed.view!.day!.activePlayerId).toBe(id(p[2]!));
  expect(resumed.view!.day!.players.filter(p=>p.statuses?.some(s=>s.kind==='BLACK_CAT'))).toHaveLength(1);
  expect(await h.send(resumed,{type:'chooseBlackCat',matchId,targetId:id(p[4]!)})).toMatchObject({code:'PHASE'});
  const count=resumed.view!.effects!.filter(e=>e.statusKind==='BLACK_CAT').length;await h.accepted(resumed,packet);expect(resumed.view!.effects!.filter(e=>e.statusKind==='BLACK_CAT')).toHaveLength(count);
 });
 it('uses only accepted partial votes and does not invent abstaining votes',async()=>{
  const p=await setup();await confirm(p);const matchId=p[0]!.view!.deal!.matchId;
  await h.accepted(p[5]!,{type:'chooseBlackCat',matchId,targetId:id(p[4]!)});expect(p[5]!.view!.phase).toBe('OPENING_CURSE');
  clock+=30_000;h.server.store.sweep();await h.sync(p[1]!);expect(p[1]!.view!.day!.activePlayerId).toBe(id(p[4]!));
 });
 it.each([0,1,2,3,4,5])('uses the server random selection for zero votes (index %i)',async index=>{
  const p=await setup(true,index);await confirm(p);clock+=30_000;h.server.store.sweep();await h.sync(p[0]!);
  expect(p[0]!.view!.day!.activePlayerId).toBe(id(p[index]!));expect(p[0]!.view!.opening).toBeNull();
 });
 it('falls back immediately with no eligible Cultists',async()=>{
  const p=await setup(false);await confirm(p);expect(p[0]!.view!.phase).toBe('DAY');expect(p[0]!.view!.day!.activePlayerId).toBe(id(p[5]!));
 });
 it('preserves the pre-Day cancellation policy and starts fresh deadlines after reopening',async()=>{
  const p=await setup();await confirm(p);clock+=100;
  await h.accepted(p[1]!,{type:'leave',expectedVersion:(await h.sync(p[1]!)).version});await h.sync(p[0]!);
  expect(p[0]!.view!.phase).toBe('LOBBY');expect(p[0]!.view!.deal).toBeNull();expect(p[0]!.view!.opening).toBeNull();
  const c=await h.connect();await h.accepted(c,{type:'join',roomCode:p[0]!.view!.code,name:'Replacement',avatar:'moon'});const party=[p[0]!,...p.slice(2),c];await h.start(party,false);
  expect(p[0]!.view!.opening!.deadline).toBe(clock+90_000);
 });
 it('keeps the ritual deadline across disconnect and host migration',async()=>{
  const p=await setup();await confirm(p);const deadline=p[1]!.view!.opening!.deadline;
  p[0]!.socket.disconnect();await new Promise(r=>setTimeout(r,25));await h.sync(p[1]!);
  expect(p[1]!.view!.hostId).not.toBe(id(p[0]!));expect(p[1]!.view!.opening!.deadline).toBe(deadline);
  clock=deadline;h.server.store.sweep();await h.sync(p[1]!);expect(p[1]!.view!.phase).toBe('DAY');
 });
 it('cancels the private deal when the existing 60-second reconnect grace expires',async()=>{
  const p=await setup();p[0]!.socket.disconnect();await new Promise(r=>setTimeout(r,25));clock+=60_000;h.server.store.sweep();await h.sync(p[1]!);
  expect(p[1]!.view!.phase).toBe('LOBBY');expect(p[1]!.view!.deal).toBeNull();expect(p[1]!.view!.opening).toBeNull();
 });
 it('rematches reset opening state and create a fresh private deadline',async()=>{
  const p=await setup();await confirm(p);await h.finishOpening(p,p[0]!);
  for(const c of p.slice(1)){await h.accepted(c,{type:'leave',expectedVersion:(await h.sync(c)).version});await h.sync(p[0]!);if(p[0]!.view!.phase==='GAME_OVER')break;}
  expect(p[0]!.view!.phase).toBe('GAME_OVER');clock+=2000;
  await h.accepted(p[0]!,{type:'rematch',expectedVersion:p[0]!.view!.version});expect(p[0]!.view!.opening).toBeNull();
  const remaining=p.filter(c=>p[0]!.view!.players.some(v=>v.id===id(c)));
  for(const c of remaining)await h.accepted(c,{type:'ready',ready:true,expectedVersion:(await h.sync(c)).version});
  await h.accepted(p[0]!,{type:'fillBots',difficulty:'EASY',expectedVersion:(await h.sync(p[0]!)).version});
  await h.accepted(p[0]!,{type:'start',expectedVersion:p[0]!.view!.version});expect(p[0]!.view!.opening!.deadline).toBe(clock+90_000);expect(p[0]!.view!.blackCatChoice).toBeNull();
 });
});
