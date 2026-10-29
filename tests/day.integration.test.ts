import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { originalPrototypePreset, type DayIntent } from '@ashfall/shared';
import { createDay, type DayState } from '@ashfall/shared/day';
import { createHarness, type Client, type Input } from './socket-harness.js';

let h: Awaited<ReturnType<typeof createHarness>>;
let prepare: (s: DayState) => void;
beforeEach(async () => {
  prepare = () => {};
  h = await createHarness(1000, { dayFactory: (identity, now) => {
    const result = createDay(identity, originalPrototypePreset, max => max-1, randomUUID, now);
    prepare(result.state); return result;
  } });
});
afterEach(async () => h.close());
async function begin(capacity = 6, safeOpening = false) {
  const party = await h.party(capacity);
  await h.start(party,!safeOpening);
  if(safeOpening) {
    const target=party.find(client=>client.view!.private!.identities.every(card=>card.kind==='HUMAN'))!;
    for(const client of party)if(client.view!.blackCatChoice)await h.accepted(client,{type:'chooseBlackCat',matchId:client.view!.deal!.matchId,targetId:target.session!.playerId});
  }
  await Promise.all(party.map(client => h.accepted(client, { type:'acknowledgeDeal', matchId:client.view!.deal!.matchId })));
  await Promise.all(party.map(h.sync));
  return party;
}
function packet(client: Client, intent: DayIntent): Input {
  return { ...intent, actionId: randomUUID(), matchId: client.view!.deal!.matchId,
    turnNumber: client.view!.day!.turnNumber, gameVersion: client.view!.day!.version };
}
const id = (client: Client) => client.session!.playerId;

describe('authoritative expanded card protocol', () => {
  it('deals configured cards without sending another player their hand or secret Life kinds', async () => {
    const party = await begin();
    const all = party.flatMap(client => client.view!.hand!);
    expect(all).toHaveLength(18);
    expect(new Set(all.map(card => card.id)).size).toBe(18);
    expect(party[0]!.view!.day!.deckCount).toBe(68);
    expect(party[0]!.view!.day!.accusationThreshold).toBe(7);
    for (const client of party) {
      for (const other of party.filter(item => item !== client)) {
        for (const card of other.view!.hand!) expect(JSON.stringify(client.view)).not.toContain(card.id);
      }
      expect(client.view!.deal!.players.every(player => player.seals.every(seal => !seal.revealed))).toBe(true);
    }
  });
  it('accepts a card group once, discards each card, and emits public effects without card IDs', async () => {
    prepare = s => { s.hands[s.activePlayerId]![0]!.kind='EVIDENCE'; s.hands[s.activePlayerId]![1]!.kind='ALIBI'; };
    const party = await begin(), actor=party[0]!, target=party[1]!;
    const cardIds=actor.view!.hand!.slice(0,2).map(card => card.id);
    const action=packet(actor,{type:'playCards',cardIds,targetId:id(target)});
    await h.accepted(actor,action); await h.accepted(actor,action);
    await h.sync(target);
    expect(actor.view!.hand).toHaveLength(1);
    expect(actor.view!.day!.discardCount).toBe(2);
    expect(actor.view!.day!.players.find(p => p.playerId===id(target))!.doubt).toBe(0);
    expect(target.view!.effects!.filter(effect => effect.type==='PLAY')).toHaveLength(2);
    expect(target.view!.effects!.some(effect => effect.type==='DOUBT')).toBe(true);
    expect(target.view!.effects!.some(effect => effect.type==='CLEANSE')).toBe(true);
    for (const cardId of cardIds) expect(JSON.stringify(target.view)).not.toContain(cardId);
  });
  it('Piety blocks Evidence once; reconnection restores structured status before it is consumed', async () => {
    prepare = s => { s.hands[s.activePlayerId]![0]!.kind='PIETY'; s.hands[s.activePlayerId]![1]!.kind='EVIDENCE'; };
    const party=await begin(), actor=party[0]!, target=party[1]!;
    await h.accepted(actor,packet(actor,{type:'playCard',cardId:actor.view!.hand![0]!.id,targetId:id(target)}));
    const session=target.session!; target.socket.disconnect();
    const resumed=await h.connect(); await h.accepted(resumed,{type:'resume',session});
    expect(resumed.view!.day!.players.find(p => p.playerId===id(target))!.statuses?.map(s => s.kind)).toEqual(['PIETY']);
    await h.sync(actor);
    await h.accepted(actor,packet(actor,{type:'playCard',cardId:actor.view!.hand![0]!.id,targetId:id(target)}));
    await h.sync(resumed);
    expect(resumed.view!.day!.players.find(p => p.playerId===id(target))!.doubt).toBe(0);
    expect(resumed.view!.day!.players.find(p => p.playerId===id(target))!.statuses).toEqual([]);
  });
  it('mirrors direct Evidence once through a Vow and describes shared suspicion without repeating the link announcement', async () => {
    prepare = s => { s.hands[s.activePlayerId]![0]!.kind='VOW_OF_HEARTS'; s.hands[s.activePlayerId]![1]!.kind='VOW_OF_HEARTS'; s.hands[s.activePlayerId]![2]!.kind='EVIDENCE'; };
    const party=await begin(), actor=party[0]!, first=party[1]!, second=party[2]!;
    await h.accepted(actor,packet(actor,{type:'playCard',cardId:actor.view!.hand![0]!.id,targetId:id(first)}));
    await h.accepted(actor,packet(actor,{type:'playCard',cardId:actor.view!.hand![0]!.id,targetId:id(second)}));
    await h.accepted(actor,packet(actor,{type:'playCard',cardId:actor.view!.hand![0]!.id,targetId:id(first)}));
    await h.sync(second);
    expect(second.view!.day!.players.find(p => p.playerId===id(first))!.doubt).toBe(1);
    expect(second.view!.day!.players.find(p => p.playerId===id(second))!.doubt).toBe(1);
    expect(second.view!.feed.some(entry => entry.text.includes('Shared suspicion carried one Doubt'))).toBe(true);
  });
  it('Witness opens a server-validated accuser choice, clears all seven marks, and exposes only the revealed card', async () => {
    let targetId = '';
    prepare = s => {
      s.hands[s.activePlayerId]![0]!.kind='WITNESS';
      // This checks a surviving target's single-card privacy. A random Witch
      // target can instead die and correctly expose all five remaining lives.
      targetId = s.identity.players.find(player => player.id !== s.activePlayerId &&
        s.identity.cards.filter(card => card.ownerId === player.id).every(card => card.kind === 'HUMAN'))!.id;
      s.doubt[targetId]=2;
    };
    const party=await begin(), actor=party[0]!, target=party.find(client => id(client) === targetId)!;
    await h.accepted(actor,packet(actor,{type:'playCard',cardId:actor.view!.hand![0]!.id,targetId:id(target)}));
    expect(actor.view!.phase).toBe('REVEAL_RESOLUTION');
    expect(await h.send(target,packet(target,{type:'revealSeal',slot:2}))).toMatchObject({ok:false});
    await h.accepted(actor,packet(actor,{type:'revealSeal',slot:2}));
    await h.sync(target);
    expect(target.view!.day!.players.find(p => p.playerId===id(target))!.doubt).toBe(0);
    expect(target.view!.deal!.players.find(p => p.playerId===id(target))!.seals.filter(seal => seal.revealed)).toHaveLength(1);
    expect(target.view!.effects!.filter(effect => effect.type==='REVEAL')).toHaveLength(1);
    expect(target.view!.effects!.find(effect => effect.type==='DOUBT')?.count).toBe(5);
  });
  it('Whisper insight reaches only the authorized actor', async () => {
    prepare = s => { s.hands[s.activePlayerId]![0]!.kind='WHISPER'; };
    const party=await begin(), actor=party[0]!, target=party[1]!;
    await h.accepted(actor,packet(actor,{type:'playCard',cardId:actor.view!.hand![0]!.id,targetId:id(target)}));
    await h.sync(target);
    expect(actor.view!.peek).toMatchObject({targetId:id(target)});
    expect(target.view!.peek).toBeNull();
    expect(target.view!.day!.players.find(p => p.playerId===id(target))!.doubt).toBe(0);
    expect(target.view!.feed.at(-1)?.text).not.toContain(actor.view!.peek!.kind);
  });
  it('Conspiracy moves hidden lives atomically and the public feed reveals no Witch transfer', async () => {
    prepare = s => { const actor=s.identity.players.find(p=>s.identity.cards.filter(c=>c.ownerId===p.id).every(c=>c.kind==='HUMAN'))!.id; s.hands[actor]![0]!.kind='CONSPIRACY'; };
    const party=await begin(6,true), actor=party.find(c=>id(c)===c.view!.day!.activePlayerId)!;
    const before=party.map(client => client.view!.private!.identities.map(card => card.id));
    await h.accepted(actor,packet(actor,{type:'playCard',cardId:actor.view!.hand![0]!.id,targetId:id(actor)}));
    await Promise.all(party.map(h.sync));
    for (const client of party) {
      expect(client.view!.feed.some(entry => entry.text==='A conspiracy shifted the council’s hidden lives.')).toBe(true);
      for (const secretId of before.flat()) expect(JSON.stringify(client.view!.deal)).not.toContain(secretId);
    }
    expect(party.every((client,index) => client.view!.private!.identities.some(card => before[(index+1)%6]!.includes(card.id)))).toBe(true);
  });
  it('supports ten seated players with five face-down Life cards each', async () => {
    const party=await begin(10);
    expect(party).toHaveLength(10);
    for (const client of party) {
      expect(client.view!.capacity).toBe(10);
      expect(client.view!.deal!.players).toHaveLength(10);
      expect(client.view!.deal!.players.every(player => player.seals.length===5)).toBe(true);
    }
  });
});
