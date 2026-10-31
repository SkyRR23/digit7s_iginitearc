import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { originalPrototypePreset } from '@ashfall/shared';
import { createDay } from '@ashfall/shared/day';
import { createHarness, type Client } from './socket-harness';
let h: Awaited<ReturnType<typeof createHarness>>,clock:number;
const id=(client:Client)=>client.session!.playerId;
beforeEach(async()=>{
  clock=10_000;
  h=await createHarness(60_000,{presentations:true,now:()=>clock,rateLimit:false,randomIndex:max=>max-1,
    bots:{fast:true,messages:false},botTickMs:100_000,
    dayFactory:(identity,now)=>{
      const result=createDay(identity,originalPrototypePreset,max=>max-1,randomUUID,now);
      for(const kind of ['WHISPER','STOCKS'] as const){
        const pile=[result.state.deck,...Object.values(result.state.hands)].find(cards=>cards.some(card=>card.kind===kind))!;
        const card=pile.splice(pile.findIndex(card=>card.kind===kind),1)[0]!;
        result.state.hands[identity.players[0]!.id]!.push(card);
      }
      return result;
    }});
});
afterEach(async()=>{await h.close();});
async function begin(size=6){
  const party=await h.party(size);await h.start(party);
  for(const client of party)await h.accepted(client,{type:'acknowledgeDeal',matchId:client.view!.deal!.matchId});
  await Promise.all(party.map(h.sync));return party;
}
async function finish(client:Client){
  const view=await h.sync(client);
  if(view.presentation)await h.accepted(client,{type:'finishPresentation',matchId:view.deal!.matchId,presentationId:view.presentation.id});
}
async function finishAll(party:Client[]){for(const client of party)await finish(client);await Promise.all(party.map(h.sync));}
async function play(host:Client,target:Client,kind:'WHISPER'|'STOCKS'){
  const v=await h.sync(host);
  await h.accepted(host,{type:'playCard',matchId:v.deal!.matchId,turnNumber:v.day!.turnNumber,gameVersion:v.day!.version,
    cardId:v.hand!.find(card=>card.kind===kind)!.id,targetId:id(target)});
}
describe('authoritative cinematic pause',()=>{
  it('includes the opening Curse event in the same synchronized Day 1 pause',async()=>{
    const party=await begin(),view=party[0]!.view!,presentation=view.presentation!;
    expect(presentation.previousPhase).toBe('PRIVATE_DEAL');
    expect(presentation.events).toContainEqual(expect.objectContaining({type:'STATUS',statusKind:'BLACK_CAT',targetId:view.day!.activePlayerId,count:1}));
    expect(view.day!.deadline).toBeNull();
    await finishAll(party);expect(party[0]!.view!.presentation).toBeNull();
  });
  it('freezes the clock, rejects gameplay, and resumes only after every reader finishes',async()=>{
    const party=await begin(),host=party[0]!,v=host.view!,remaining=v.presentation!.remainingMs;
    expect(v.day!.deadline).toBeNull();expect(remaining).toBeGreaterThan(0);
    clock+=20_000;h.server.store.sweep();await h.sync(host);
    expect(host.view!.day!.turnNumber).toBe(v.day!.turnNumber);
    expect(host.view!.presentation!.remainingMs).toBe(remaining);
    const inputs=[{type:'endTurn',turnNumber:v.day!.turnNumber,gameVersion:v.day!.version},
      {type:'drawCards',turnNumber:v.day!.turnNumber,gameVersion:v.day!.version},
      {type:'playCard',cardId:v.hand![0]!.id,targetId:id(party[1]!),turnNumber:v.day!.turnNumber,gameVersion:v.day!.version},
      {type:'useRole',targetId:id(party[1]!)},
      {type:'councilVote',dayNumber:v.day!.dayNumber,targetId:id(party[1]!)},
      {type:'nightAttack',nightNumber:1,targetId:id(party[1]!)}] as const;
    for(const input of inputs)expect(await h.send(host,{...input,matchId:v.deal!.matchId})).toMatchObject({ok:false,code:'CINEMATIC'});
    await finish(host);await h.sync(host);
    expect(host.view!.presentation!.awaitingYou).toBe(false);expect(host.view!.day!.deadline).toBeNull();
    await finishAll(party);
    expect(host.view!.presentation).toBeNull();expect(host.view!.day!.deadline).toBe(clock+remaining!);
  });
  it('holds a card story in place, extends private Whisper time, and ignores stale acknowledgements',async()=>{
    const party=await begin(),host=party[0]!,target=party[1]!;await finishAll(party);
    await play(host,target,'WHISPER');await h.sync(host);
    const first=host.view!.presentation!,peek=host.view!.peek!,turn=host.view!.day!.turnNumber;
    expect(first.events?.some(e=>e.cardKind==='WHISPER')).toBe(true);
    clock+=20_000;h.server.store.sweep();await h.sync(host);
    expect(host.view!.peek!.id).toBe(peek.id);expect(host.view!.peek!.expiresAt).toBe(peek.expiresAt+20_000);
    expect(host.view!.day!.turnNumber).toBe(turn);
    await finishAll(party);expect(host.view!.peek!.expiresAt).toBe(peek.expiresAt+20_000);
    await play(host,target,'STOCKS');
    const second=host.view!.presentation!;
    expect(second.id).not.toBe(first.id);
    expect(await h.send(host,{type:'finishPresentation',matchId:host.view!.deal!.matchId,presentationId:first.id})).toMatchObject({ok:false,code:'STALE_PRESENTATION'});
    expect((await h.sync(host)).presentation!.id).toBe(second.id);
  });
  it('replays unfinished presentations on reconnect but remembers readers who finished',async()=>{
    const party=await begin(),host=party[0]!,reader=party[1]!,p=host.view!.presentation!;
    await finish(host);
    const replace=await h.connect();await h.accepted(replace,{type:'resume',session:host.session!});
    expect(replace.view!.presentation).toMatchObject({id:p.id,awaitingYou:false});
    const reconnect=await h.connect();await h.accepted(reconnect,{type:'resume',session:reader.session!});
    expect(reconnect.view!.presentation).toMatchObject({id:p.id,scope:'PUBLIC',awaitingYou:true});
  });
  it('releases absent readers at the safety deadline without consuming turn time',async()=>{
    const party=await begin(),host=party[0]!,p=host.view!.presentation!;
    clock=p.until;h.server.store.sweep();await h.sync(host);
    expect(host.view!.presentation).toBeNull();expect(host.view!.day!.deadline).toBe(clock+p.remainingMs!);
  });
  it('removes disconnected readers so a completed table can resume',async()=>{
    const party=await begin(),host=party[0]!;
    for(const client of party.slice(0,-1))await finish(client);
    party.at(-1)!.socket.disconnect();
    await expect.poll(async()=>{await h.sync(host);return host.view!.presentation;}).toBeNull();
    expect(host.view!.day!.deadline).toBeGreaterThan(clock);
  });
  it('keeps private power details with the owner and pauses every other player neutrally',async()=>{
    const party=await begin(10);await finishAll(party);
    const owner=party.find(c=>c.view!.role!.kind==='GOSSIP')!,others=party.filter(c=>c!==owner);
    const v=owner.view!;
    await h.accepted(owner,{type:'useRole',matchId:v.deal!.matchId,targetId:id(others[0]!),secondTargetId:id(others[1]!)});
    await Promise.all(party.map(h.sync));
    const p=owner.view!.presentation!;
    expect(p).toMatchObject({scope:'PRIVATE',awaitingYou:true,privateAction:{kind:'GOSSIP',targetIds:[id(others[0]!),id(others[1]!)]}});
    for(const peer of others){
      expect(peer.view!.presentation).toMatchObject({scope:'WAIT',awaitingYou:false});
      expect(peer.view!.presentation).not.toHaveProperty('privateAction');expect(peer.view!.presentation).not.toHaveProperty('events');
    }
    await finish(others[0]!);expect((await h.sync(owner)).presentation!.id).toBe(p.id);
    clock+=12_000;await finish(owner);await Promise.all(party.map(h.sync));
    for(const client of party)expect(client.view!.presentation).toBeNull();
    expect(owner.view!.day!.deadline).toBe(clock+p.remainingMs!);
  });
  it('preserves the Sleuth exposure countdown while freezing the turn timer',async()=>{
    const party=await begin();await finishAll(party);
    const sleuth=party.find(c=>c.view!.role!.kind==='SLEUTH')!,target=party.find(c=>c!==sleuth)!;
    await h.accepted(sleuth,{type:'useRole',matchId:sleuth.view!.deal!.matchId,targetId:id(target)});
    const p=sleuth.view!.presentation!,expires=sleuth.view!.role!.peek!.expiresAt;
    clock=expires;h.server.store.sweep();await h.sync(sleuth);
    expect(sleuth.view!.role!.peek).toBeNull();expect(sleuth.view!.role!.notices.join(' ')).toContain('discovered');
    expect(sleuth.view!.presentation).toBeNull();expect(sleuth.view!.day!.deadline).toBe(clock+p.remainingMs!);
  });
  it('prevents fast bots from playing through a human reader’s close-up',async()=>{
    const human=await h.connect();await h.accepted(human,{type:'create',name:'Reader',avatar:'moon'});
    await h.accepted(human,{type:'fillBots',difficulty:'NORMAL',expectedVersion:human.view!.version});
    await h.accepted(human,{type:'ready',ready:true,expectedVersion:human.view!.version});
    await h.accepted(human,{type:'start',expectedVersion:human.view!.version});
    h.server.store.tickBots();await h.sync(human);
    if(human.view!.blackCatChoice)await h.accepted(human,{type:'chooseBlackCat',matchId:human.view!.deal!.matchId,targetId:id(human)});
    await h.accepted(human,{type:'acknowledgeDeal',matchId:human.view!.deal!.matchId});
    h.server.store.tickBots();await h.sync(human);
    expect(human.view!.presentation).toBeTruthy();
    const state=human.view!;
    clock+=20_000;expect(h.server.store.tickBots(100)).toBe(0);await h.sync(human);
    expect(human.view!.day!.version).toBe(state.day!.version);
    expect(human.view!.day!.turnNumber).toBe(state.day!.turnNumber);
    await finish(human);expect((await h.sync(human)).presentation).toBeNull();
  });
});
