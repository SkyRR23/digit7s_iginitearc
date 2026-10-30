import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { originalPrototypePreset, type ActionKind } from '@ashfall/shared';
import { createDay } from '@ashfall/shared/day';
import { createHarness, type Client } from './socket-harness.js';

let h:Awaited<ReturnType<typeof createHarness>>, clock:number;
beforeEach(async()=>{
  clock=Date.now();
  h=await createHarness(60000,{now:()=>clock,presentations:true,randomIndex:max=>max-1,dayFactory:(identity,now)=>{
    const result=createDay(identity,originalPrototypePreset,max=>max-1,randomUUID,now);
    result.state.hands[result.state.activePlayerId]=(['WITNESS','EAVESDROP','COUNCIL_BELL','DISPEL'] as ActionKind[]).map(kind=>({id:randomUUID(),kind}));
    return result;
  }});
});
afterEach(async()=>h.close());
async function finish(party:Client[]) {
  for(const client of party) {const v=await h.sync(client);if(v.presentation?.awaitingYou)await h.accepted(client,{type:'finishPresentation',matchId:v.deal!.matchId,presentationId:v.presentation.id});}
  await Promise.all(party.map(h.sync));
}
async function begin(){const party=await h.six();await h.start(party);for(const client of party)await h.accepted(client,{type:'acknowledgeDeal',matchId:client.view!.deal!.matchId});await finish(party);return party;}
async function play(actor:Client,kind:ActionKind,target:Client){const v=await h.sync(actor);await h.accepted(actor,{type:'playCard',matchId:v.deal!.matchId,turnNumber:v.day!.turnNumber,gameVersion:v.day!.version,cardId:v.hand!.find(c=>c.kind===kind)!.id,targetId:target.session!.playerId});}
describe('interactive action privacy and presentation synchronization',()=>{
  it('holds the reveal decision until all readers finish and preserves ten choice seconds',async()=>{
    const party=await begin(),actor=party[0]!,target=party[1]!;
    await play(actor,'WITNESS',target);
    expect(actor.view!.presentation?.remainingMs).toBe(10000);expect(actor.view!.day!.deadline).toBeNull();
    clock+=8000;
    await h.accepted(actor,{type:'finishPresentation',matchId:actor.view!.deal!.matchId,presentationId:actor.view!.presentation!.id});
    expect(actor.view!.presentation?.awaitingYou).toBe(false);
    expect(await h.send(actor,{type:'revealSeal',matchId:actor.view!.deal!.matchId,turnNumber:actor.view!.day!.turnNumber,gameVersion:actor.view!.day!.version,slot:3})).toMatchObject({code:'CINEMATIC'});
    await finish(party);expect(actor.view!.day!.deadline).toBe(clock+10000);
    const v=actor.view!;
    const safeSlot=target.view!.private!.identities.find(card=>card.kind==='HUMAN')!.slot;
    await h.accepted(actor,{type:'revealSeal',matchId:v.deal!.matchId,turnNumber:v.day!.turnNumber,gameVersion:v.day!.version,slot:safeSlot});
    expect(actor.view!.deal!.players.find(p=>p.playerId===target.session!.playerId)!.seals[safeSlot]!.revealed).toBe(true);
    expect(actor.view!.presentation?.remainingMs).toBe(60000);
  });
  it('sends a hand inspection only to its owner and revokes the snapshot on death',async()=>{
    const party=await begin(),actor=party[0]!,target=party[1]!;
    const cards=structuredClone(target.view!.hand!);
    await play(actor,'EAVESDROP',target);await Promise.all(party.map(h.sync));
    expect(actor.view!.handPeek?.cards).toEqual(cards);
    for(const other of party.slice(1)) {expect(other.view!.handPeek).toBeNull();for(const card of cards) if(other!==target)expect(JSON.stringify(other.view)).not.toContain(card.id);}
    clock+=5000;await finish(party);expect(actor.view!.handPeek!.expiresAt).toBe(clock+12000);
    await h.accepted(actor,{type:'leave',expectedVersion:(await h.sync(actor)).version});
    for(const other of party.slice(1))expect((await h.sync(other)).handPeek).toBeNull();
  });
  it('blocks voting without the Bell, opens one vote and resumes after a split ballot',async()=>{
    const party=await begin(),actor=party[0]!;
    const ballot=(c:Client,id:string)=>({type:'councilVote' as const,matchId:c.view!.deal!.matchId,dayNumber:1,targetId:id});
    expect(await h.send(actor,ballot(actor,party[1]!.session!.playerId))).toMatchObject({code:'PHASE'});
    await play(actor,'COUNCIL_BELL',actor);await finish(party);
    for(let i=0;i<party.length;i++)await h.accepted(party[i]!,ballot(party[i]!,party[(i+1)%party.length]!.session!.playerId));
    await h.sync(actor);expect(actor.view!.day!.council?.open).toBe(false);expect(actor.view!.councilVote).toBeNull();
    expect(actor.view!.deal!.players.every(p=>p.alive)).toBe(true);
  });
});
