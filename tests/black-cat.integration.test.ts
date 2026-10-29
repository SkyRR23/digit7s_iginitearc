import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Client } from './socket-harness.js';
import { createDay, curseInstances } from '@ashfall/shared/day';
import { originalPrototypePreset } from '@ashfall/shared';

let h: Awaited<ReturnType<typeof createHarness>>;
const id = (client: Client) => client.session!.playerId;
beforeEach(async () => {
  h = await createHarness(60_000,{randomIndex:max=>max-1,identityFactory:ids=>({
    id:randomUUID(),players:ids.map((id,i)=>({id,alive:true,acknowledged:false,everWitch:i===0||i===5})),
    cards:ids.flatMap((ownerId,i)=>Array.from({length:5},(_,slot)=>({id:randomUUID(),ownerId,slot,revealed:false,
      kind:slot===4&&(i===0||i===5)?'WITCH' as const:i===5&&slot===3?'CONSTABLE' as const:'HUMAN' as const}))),
  })});
});
afterEach(async()=>{await h.close();});

describe('opening Black Cat curse',()=>{
  it('uses the deck instance and returns it to the draw pile exactly once on a retried Dispel',async()=>{
    await h.close();let curseId='';
    h=await createHarness(60000,{randomIndex:max=>max-1,dayFactory:(identity,now)=>{
      const result=createDay(identity,originalPrototypePreset,max=>max-1,randomUUID,now),s=result.state;
      curseId=curseInstances(s)[0]!.id;
      const pile=[s.deck,...Object.values(s.hands)].find(cards=>cards.some(c=>c.kind==='DISPEL'))!;
      s.hands[identity.players[1]!.id]!.push(pile.splice(pile.findIndex(c=>c.kind==='DISPEL'),1)[0]!);
      return result;
    }});
    const party=await h.six();await h.start(party);
    for(const client of party)await h.accepted(client,{type:'acknowledgeDeal',matchId:client.view!.deal!.matchId});
    await Promise.all(party.map(h.sync));
    expect(party.every(c=>c.view!.cardQuantities?.CURSE===1&&!c.view!.hand!.some(card=>card.kind==='CURSE'))).toBe(true);
    const host=party[0]!,actor=party[1]!;
    await h.accepted(host,{type:'drawCards',matchId:host.view!.deal!.matchId,turnNumber:host.view!.day!.turnNumber,gameVersion:host.view!.day!.version});
    await Promise.all(party.map(h.sync));
    const before=actor.view!,handSize=host.view!.hand!.length;
    const command={type:'playCard' as const,actionId:randomUUID(),matchId:before.deal!.matchId,turnNumber:before.day!.turnNumber,gameVersion:before.day!.version,cardId:before.hand!.find(c=>c.kind==='DISPEL')!.id,targetId:id(host),protection:'BLACK_CAT' as const};
    await h.accepted(actor,command);await h.accepted(actor,command);await Promise.all(party.map(h.sync));
    expect(actor.view!.day!.deckCount).toBe(before.day!.deckCount+1);expect(host.view!.hand).toHaveLength(handSize);
    expect(actor.view!.day!.players.some(p=>p.statuses?.some(s=>s.kind==='BLACK_CAT'))).toBe(false);
    for(const client of party)expect(JSON.stringify(client.view)).not.toContain(curseId);
  });
  it('requires an Ashbound choice, keeps ballots private, and restores a sealed choice on reconnect',async()=>{
    const party=await h.six(); await h.start(party,false);
    const witch=party[0]!, villager=party[1]!, matchId=witch.view!.deal!.matchId;
    expect(await h.send(witch,{type:'acknowledgeDeal',matchId})).toMatchObject({code:'BLACK_CAT_REQUIRED'});
    expect(await h.send(villager,{type:'chooseBlackCat',matchId,targetId:id(witch)})).toMatchObject({code:'ABILITY'});
    expect(await h.send(witch,{type:'chooseBlackCat',matchId:randomUUID(),targetId:id(villager)})).toMatchObject({code:'MATCH_CHANGED'});
    expect(await h.send(witch,{type:'chooseBlackCat',matchId,targetId:randomUUID()})).toMatchObject({code:'TARGET'});
    const version=witch.view!.version, otherPrivate=party[5]!.view!.privateVersion;
    const action={type:'chooseBlackCat' as const,actionId:randomUUID(),matchId,targetId:id(villager)};
    await h.accepted(witch,action); await h.accepted(witch,action);
    expect(witch.view!.version).toBe(version);
    expect(witch.view!.blackCatChoice).toEqual({submitted:true,targetId:id(villager)});
    await Promise.all(party.slice(1).map(h.sync));
    expect(villager.view!.blackCatChoice).toBeNull();
    expect(party[5]!.view!.blackCatChoice).toEqual({submitted:false,targetId:null});
    expect(party[5]!.view!.privateVersion).toBe(otherPrivate);
    expect(villager.view!.feed).toEqual(witch.view!.feed);
    expect(await h.send(witch,{type:'chooseBlackCat',matchId,targetId:id(party[2]!)})).toMatchObject({code:'LOCKED_CHOICE'});
    const resumed=await h.connect(); await h.accepted(resumed,{type:'resume',session:witch.session!});
    expect(resumed.view!.blackCatChoice).toEqual({submitted:true,targetId:id(villager)});
  });
  it('creates one public curse after confirmation, resolves tied votes by seat, and starts with the cursed player',async()=>{
    const party=await h.six(); await h.start(party,false); const matchId=party[0]!.view!.deal!.matchId;
    await h.accepted(party[0]!,{type:'chooseBlackCat',matchId,targetId:id(party[3]!)});
    await h.accepted(party[5]!,{type:'chooseBlackCat',matchId,targetId:id(party[2]!)});
    for(const client of party) await h.accepted(client,{type:'acknowledgeDeal',matchId});
    await Promise.all(party.map(h.sync));
    for(const client of party){
      expect(client.view!.phase).toBe('DAY'); expect(client.view!.blackCatChoice).toBeNull();
      expect(client.view!.day!.activePlayerId).toBe(id(party[2]!));
      const cursed=client.view!.day!.players.filter(player=>player.statuses?.some(status=>status.kind==='BLACK_CAT'));
      expect(cursed.map(player=>player.playerId)).toEqual([id(party[2]!)]);
      expect(cursed[0]!.statuses![0]!.sourceId).toBe(id(party[2]!)); // no Ashbound caster leak
      expect(client.view!.effects!.find(effect=>effect.statusKind==='BLACK_CAT')!.actorId).toBeUndefined();
    }
    expect(await h.send(party[0]!,{type:'chooseBlackCat',matchId,targetId:id(party[0]!)})).toMatchObject({code:'PHASE'});
  });
  it('allows an opening self-curse as a deliberate disguise and clears choices on reopening',async()=>{
    const party=await h.six(); await h.start(party,false); const host=party[0]!, matchId=host.view!.deal!.matchId;
    await h.accepted(host,{type:'chooseBlackCat',matchId,targetId:id(host)});
    await h.accepted(party[5]!,{type:'chooseBlackCat',matchId,targetId:id(host)});
    for(const client of party) await h.accepted(client,{type:'acknowledgeDeal',matchId});
    expect(host.view!.day!.players[0]!.statuses!.some(status=>status.kind==='BLACK_CAT')).toBe(true);
    await h.accepted(host,{type:'reopen',expectedVersion:(await h.sync(host)).version});
    expect(host.view!.blackCatChoice).toBeNull(); expect(host.view!.day).toBeNull();
    expect(await h.send(host,{type:'chooseBlackCat',matchId,targetId:id(host)})).toMatchObject({code:'MATCH_CHANGED'});
  });
});
