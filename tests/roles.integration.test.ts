import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IdentityMatch } from '@ashfall/shared/identities';
import { originalPrototypePreset } from '@ashfall/shared';
import { createDay } from '@ashfall/shared/day';
import { ROLE_PRESETS, assignRoles } from '../apps/server/src/roles.js';
import { createHarness, type Client } from './socket-harness.js';

let h: Awaited<ReturnType<typeof createHarness>>;
let clock: number;
beforeEach(async () => { clock = Date.now(); h = await createHarness(60_000, { now: () => clock, randomIndex: max => max - 1 }); });
afterEach(async () => { await h.close(); });
const id = (client: Client) => client.session!.playerId;
async function begin(party: Client[]) {
  await h.start(party);
  for (const client of party) await h.accepted(client, { type: 'acknowledgeDeal', matchId: client.view!.deal!.matchId });
  await Promise.all(party.map(h.sync));
}

describe('server-assigned special roles', () => {
  it('keeps a Herbalist remedy active after Scapegoat moves it, then consumes it on the new holder', async () => {
    await h.close();
    h = await createHarness(60_000,{now:()=>clock,randomIndex:max=>max-1,dayFactory:(identity,now)=>{
      const result=createDay(identity,originalPrototypePreset,max=>max-1,randomUUID,now);
      const index=result.state.deck.findIndex(card=>card.kind==='SCAPEGOAT');
      result.state.hands[identity.players[0]!.id]!.push(result.state.deck.splice(index,1)[0]!);
      return result;
    }});
    const party=await h.party(8); await begin(party);
    const host=party[0]!, herbalist=party.find(client=>client.view!.role!.kind==='HERBALIST')!;
    const matchId=host.view!.deal!.matchId;
    await h.accepted(herbalist,{type:'useRole',matchId,targetId:id(party[1]!)});
    await h.sync(host);
    const scapegoat=host.view!.hand!.find(card=>card.kind==='SCAPEGOAT')!;
    await h.accepted(host,{type:'playCard',matchId,turnNumber:host.view!.day!.turnNumber,gameVersion:host.view!.day!.version,
      cardId:scapegoat.id,targetId:id(party[1]!),secondTargetId:id(party[2]!)});
    await h.sync(herbalist);
    expect(herbalist.view!.role!.ability).toBe('ACTIVE');
    expect(herbalist.view!.role!.notices).toContain('Your remedy moved with Scapegoat.');
    expect(host.view!.day!.players.find(player=>player.playerId===id(party[1]!))!.remedy).toBe(false);
    expect(host.view!.day!.players.find(player=>player.playerId===id(party[2]!))!.remedy).toBe(true);
    const whisper=host.view!.hand!.find(card=>card.kind==='WHISPER')!;
    await h.accepted(host,{type:'playCard',matchId,turnNumber:host.view!.day!.turnNumber,gameVersion:host.view!.day!.version,
      cardId:whisper.id,targetId:id(party[2]!)});
    await h.sync(herbalist);
    expect(herbalist.view!.role!.ability).toBe('USED');
    expect(host.view!.peek).toBeNull();
  });
  it('does not call a neutral Scapegoat an ally after a Witch Life card moves to them', async () => {
    await h.close();
    h = await createHarness(60_000, { now: () => clock, randomIndex: max => max - 1,
      identityFactory: ids => ({ id: randomUUID(),
        players: ids.map((id, i) => ({ id, alive: true, acknowledged: false, everWitch: i === 0 || i === 5 })),
        cards: ids.flatMap((ownerId, i) => Array.from({ length: 5 }, (_, slot) => ({
          id: randomUUID(), ownerId, slot, revealed: false,
          kind: slot === 4 && (i === 0 || i === 5) ? 'WITCH' as const : i === 5 && slot === 3 ? 'CONSTABLE' as const : 'HUMAN' as const,
        }))),
      }),
      dayFactory: (identity, now) => {
        const result = createDay(identity, originalPrototypePreset, max => max - 1, randomUUID, now);
        const pile = [result.state.deck,...Object.values(result.state.hands)].find(pile=>pile.some(card=>card.kind==='CINDER_SHIFT'))!;
        const card = pile.splice(pile.findIndex(card=>card.kind==='CINDER_SHIFT'),1)[0]!;
        result.state.hands[identity.players[0]!.id]!.push(card);
        return result;
      },
    });
    const party = await h.six(), host = party[0]!;
    await h.accepted(host, { type: 'setScapegoat', expectedVersion: (await h.sync(host)).version, enabled: true });
    await begin(party);
    const neutral = party.find(client => client.view!.role!.kind === 'SCAPEGOAT')!;
    const matchId = host.view!.deal!.matchId;
    const card = host.view!.hand!.find(card => card.kind === 'CINDER_SHIFT')!;
    await h.accepted(host, { type: 'playCard', matchId, gameVersion: host.view!.day!.version,
      turnNumber: host.view!.day!.turnNumber, cardId: card.id, targetId: id(neutral) });
    await Promise.all(party.map(h.sync));
    expect(neutral.view!.private!.identities.some(card => card.kind === 'WITCH')).toBe(true);
    expect(neutral.view!.private).toMatchObject({ everWitch: false, witchTeammateIds: [] });
    expect(host.view!.private!.witchTeammateIds).toEqual([id(party[5]!)]);
    expect(party[5]!.view!.private!.witchTeammateIds).toEqual([id(host)]);
    for (const villager of party.filter(client => !client.view!.private!.everWitch))
      expect(villager.view!.private!.witchTeammateIds).toEqual([]);
  });

  it('assigns one role each while keeping multiple Villagers and Ashbound, and supports configurable duplicates', () => {
    const identity: IdentityMatch = { id: randomUUID(), cards: [],
      players: Array.from({ length: 8 }, (_, n) => ({ id: `p${n}`, alive: true, acknowledged: true, everWitch: n >= 6 })) };
    const roles = assignRoles(identity, ROLE_PRESETS[8]!, false, () => 0);
    expect(Object.keys(roles)).toHaveLength(8);
    expect(Object.values(roles).filter(r => r.kind === 'VILLAGER')).toHaveLength(3);
    expect(Object.values(roles).filter(r => r.kind === 'ASHBOUND')).toHaveLength(2);
    expect(Object.values(roles).filter(r => r.kind === 'SLEUTH')).toHaveLength(1);
    const doubled = assignRoles(identity, { innocent: { SLEUTH: 2 }, witch: {}, neutral: {} }, false, () => 0);
    expect(Object.values(doubled).filter(r => r.kind === 'SLEUTH')).toHaveLength(2);
    const neutral = assignRoles(identity, ROLE_PRESETS[8]!, true, () => 0);
    expect(Object.values(neutral).filter(r => r.kind === 'SCAPEGOAT')).toHaveLength(1);
    for (const count of [6,7,8,9,10]) {
      const party: IdentityMatch = { id: randomUUID(), cards: [], players: Array.from({ length: count }, (_, n) => ({
        id: `seat-${n}`, alive: true, acknowledged: true, everWitch: n >= count - (count >= 8 ? 3 : 2),
      })) };
      const assigned = assignRoles(party, ROLE_PRESETS[count]!, false, max => max - 1);
      expect(Object.keys(assigned)).toHaveLength(count);
      expect(Object.values(assigned).filter(r => r.kind === 'SLEUTH')).toHaveLength(1);
      expect(Object.values(assigned).filter(r => r.kind === 'HERBALIST')).toHaveLength(count >= 7 ? 1 : 0);
      expect(Object.values(assigned).filter(r => r.kind === 'GOSSIP')).toHaveLength(count >= 8 ? 1 : 0);
      expect(Object.values(assigned).filter(r => r.kind === 'HEXER')).toHaveLength(count >= 9 ? 1 : 0);
    }
  });

  it('keeps Sleuth results private, preserves the timer across reconnect, and exposes only after expiry', async () => {
    const party = await h.six(); await begin(party);
    const sleuth = party.find(c => c.view!.role?.kind === 'SLEUTH')!;
    const target = party.find(c => c !== sleuth && c.view!.private?.everWitch)!;
    expect(await h.send(sleuth, { type: 'useRole', matchId: sleuth.view!.deal!.matchId, targetId: id(sleuth) }))
      .toMatchObject({ code: 'SELF_TARGET' });
    await h.accepted(sleuth, { type: 'useRole', matchId: sleuth.view!.deal!.matchId, targetId: id(target) });
    expect(sleuth.view!.role?.result).toBe('WITCH-ALIGNED');
    const expiresAt = sleuth.view!.role!.peek!.expiresAt;
    await Promise.all(party.filter(c => c !== sleuth).map(h.sync));
    for (const other of party.filter(c => c !== sleuth)) {
      expect(JSON.stringify(other.view)).not.toContain('WITCH-ALIGNED');
      expect(other.view!.role?.notices).toEqual([]);
    }
    const resumed = await h.connect();
    await h.accepted(resumed, { type: 'resume', session: sleuth.session! });
    expect(resumed.view!.role?.peek?.expiresAt).toBe(expiresAt);
    clock = expiresAt + 1; h.server.store.sweep();
    await Promise.all([h.sync(resumed), ...party.filter(c => c !== sleuth).map(h.sync)]);
    expect(resumed.view!.role?.peek).toBeNull();
    expect(target.view!.role?.notices.join(' ')).toContain('investigated');
    expect(target.view!.role?.notices.join(' ')).not.toContain('WITCH-ALIGNED');
    expect(await h.send(resumed, { type: 'useRole', matchId: resumed.view!.deal!.matchId, targetId: id(target) }))
      .toMatchObject({ code: 'ABILITY' });
  });

  it('closing a Sleuth peek early prevents exposure without refunding its use', async () => {
    const party = await h.six(); await begin(party);
    const sleuth = party.find(c => c.view!.role?.kind === 'SLEUTH')!;
    const target = party.find(c => c !== sleuth)!;
    const matchId = sleuth.view!.deal!.matchId;
    await h.accepted(sleuth, { type: 'useRole', matchId, targetId: id(target) });
    const expiry = sleuth.view!.role!.peek!.expiresAt;
    await h.accepted(sleuth, { type: 'closeSleuth', matchId });
    clock = expiry + 1; h.server.store.sweep(); await h.sync(target);
    expect(target.view!.role?.notices).toEqual([]);
    expect(sleuth.view!.role?.ability).toBe('USED');
    expect(await h.send(sleuth, { type: 'useRole', matchId, targetId: id(target) })).toMatchObject({ code: 'ABILITY' });
  });

  it('keeps Gossip comparison private and exposes only the public target of a Herbalist remedy', async () => {
    const party = await h.party(8); await begin(party);
    const gossip = party.find(c => c.view!.role?.kind === 'GOSSIP')!;
    const herbalist = party.find(c => c.view!.role?.kind === 'HERBALIST')!;
    const targets = party.filter(c => c !== herbalist).slice(0, 2);
    const matchId = gossip.view!.deal!.matchId;
    expect(await h.send(gossip, { type: 'useRole', matchId, targetId: id(targets[0]!) }))
      .toMatchObject({ code: 'TARGET' });
    await h.accepted(gossip, { type: 'useRole', matchId, targetId: id(targets[0]!), secondTargetId: id(targets[1]!) });
    expect(['SAME ALLEGIANCE','DIFFERENT ALLEGIANCE']).toContain(gossip.view!.role?.result);
    await Promise.all(party.filter(c => c !== gossip).map(h.sync));
    for (const other of party.filter(c => c !== gossip)) {
      expect(other.view!.role?.result).toBeNull();
      expect(JSON.stringify(other.view)).not.toContain(gossip.view!.role!.result!);
    }
    expect(await h.send(gossip, { type: 'useRole', matchId, targetId: id(targets[0]!), secondTargetId: id(targets[1]!) }))
      .toMatchObject({ code: 'ABILITY' });
    await h.accepted(herbalist, { type: 'useRole', matchId, targetId: id(targets[0]!) });
    await Promise.all(party.map(h.sync));
    expect(herbalist.view!.role?.ability).toBe('ACTIVE');
    expect(targets[0]!.view!.day!.players.find(p => p.playerId === id(targets[0]!))?.remedy).toBe(true);
    expect(JSON.stringify(targets[0]!.view)).not.toContain('herbalRemedies');
    expect(await h.send(herbalist, { type: 'useRole', matchId, targetId: id(targets[1]!) }))
      .toMatchObject({ code: 'ABILITY' });
  });

  it('accepts a Hexer choice only at Night and keeps its target and success private', async () => {
    await h.close();
    h = await createHarness(60_000, { now: () => clock, randomIndex: max => max - 1,
      dayFactory: (identity, now) => {
        const initial = createDay(identity, originalPrototypePreset, max => max - 1, randomUUID, now);
        initial.state.discard.push(...initial.state.deck.splice(1)); return initial;
      } });
    const party = await h.party(9); await begin(party);
    const hexer = party.find(c => c.view!.role?.kind === 'HEXER')!;
    const victim = party.find(c => c !== hexer && !c.view!.private?.everWitch)!;
    const matchId = hexer.view!.deal!.matchId;
    expect(await h.send(hexer, { type: 'useRole', matchId, targetId: id(victim) }))
      .toMatchObject({ code: 'PHASE' });
    const actor = party.find(c => id(c) === c.view!.day!.activePlayerId)!;
    await h.accepted(actor, { type: 'drawCards', matchId, turnNumber: actor.view!.day!.turnNumber,
      gameVersion: actor.view!.day!.version });
    await Promise.all(party.map(h.sync));
    expect(hexer.view!.phase).toBe('NIGHT');
    expect(await h.send(hexer, { type: 'useRole', matchId, targetId: id(hexer) }))
      .toMatchObject({ code: 'SELF_TARGET' });
    await h.accepted(hexer, { type: 'useRole', matchId, targetId: id(victim) });
    expect(hexer.view!.role?.ability).toBe('USED');
    expect(hexer.view!.role?.result).toContain('unknown');
    await h.sync(victim);
    expect(victim.view!.role?.result).toBeNull();
    expect(JSON.stringify(victim.view)).not.toContain('hexes');
    expect(await h.send(hexer, { type: 'useRole', matchId, targetId: id(victim) }))
      .toMatchObject({ code: 'ABILITY' });
  });

  it('lets Scapegoat win only through a completed server-counted council vote', async () => {
    await h.close();
    h=await createHarness(60000,{presentations:true,rateLimit:false,now:()=>clock,randomIndex:max=>max-1,dayFactory:(identity,now)=>{
      const result=createDay(identity,originalPrototypePreset,max=>max-1,randomUUID,now);
      result.state.hands[result.state.activePlayerId]![0]!.kind='COUNCIL_BELL';return result;
    }});
    const party = await h.six();
    const host = party[0]!;
    await h.accepted(host, { type: 'setScapegoat', expectedVersion: (await h.sync(host)).version, enabled: true });
    const finishAll = async () => { for (const client of party) { const view=await h.sync(client); if(view.presentation) await h.accepted(client,{type:'finishPresentation',matchId:view.deal!.matchId,presentationId:view.presentation.id}); } await Promise.all(party.map(h.sync)); };
    await begin(party);
    await finishAll();
    const actor=party.find(c=>id(c)===c.view!.day!.activePlayerId)!;
    expect(await h.send(actor,{type:'councilVote',matchId:actor.view!.deal!.matchId,dayNumber:1,targetId:id(host)})).toMatchObject({code:'PHASE'});
    await h.accepted(actor,{type:'playCard',matchId:actor.view!.deal!.matchId,turnNumber:actor.view!.day!.turnNumber,gameVersion:actor.view!.day!.version,cardId:actor.view!.hand![0]!.id,targetId:id(actor)});
    await Promise.all(party.map(h.sync));
    await finishAll();
    const scapegoat = party.find(c => c.view!.role?.kind === 'SCAPEGOAT')!;
    expect(scapegoat.view!.personalResult).toBeNull();
    const targetId = id(scapegoat), matchId = scapegoat.view!.deal!.matchId;
    const dayNumber = scapegoat.view!.day!.dayNumber;
    expect(await h.send(party[0]!, { type: 'councilVote', matchId, dayNumber: dayNumber + 1, targetId }))
      .toMatchObject({ code: 'STALE' });
    expect(await h.send(party[0]!, { type: 'councilVote', matchId, dayNumber, targetId: randomUUID() }))
      .toMatchObject({ code: 'TARGET' });
    for (const client of party.slice(0, 3)) await h.accepted(client, { type: 'councilVote', matchId, dayNumber, targetId });
    await h.sync(scapegoat);
    expect(scapegoat.view!.personalResult).toBeNull();
    await h.accepted(party[3]!, { type: 'councilVote', matchId, dayNumber, targetId });
    await Promise.all(party.map(h.sync));
    expect(scapegoat.view!.personalResult).toBe('WIN');
    expect(scapegoat.view!.deal!.players.find(p => p.playerId === targetId)?.alive).toBe(false);
    expect(scapegoat.view!.feed.some(entry => entry.text.includes('OUTCAST VICTORY'))).toBe(true);
    expect(party.filter(c => c !== scapegoat).every(c => c.view!.personalResult !== 'WIN')).toBe(true);
    for (const client of party) {
      expect(client.view!.phase).toBe('GAME_OVER');
      expect(client.view!.day!.outcome).toEqual({winner:'SCAPEGOAT',reason:'COUNCIL_VOTE',playerId:targetId});
      expect(client.view!.day!.deadline).toBeNull();
      expect(client.view!.presentation?.events).toContainEqual(expect.objectContaining({type:'VOTE_VICTORY',targetId}));
    }
    await finishAll();
    const turn=scapegoat.view!.day!.turnNumber;
    clock+=120_000;h.server.store.sweep();
    await Promise.all(party.map(h.sync));
    expect(party.every(client=>client.view!.phase==='GAME_OVER'&&client.view!.day!.deadline===null&&client.view!.day!.turnNumber===turn)).toBe(true);
    const reconnect=await h.connect();
    await h.accepted(reconnect,{type:'resume',session:scapegoat.session!});
    expect(reconnect.view!.day!.outcome).toEqual({winner:'SCAPEGOAT',reason:'COUNCIL_VOTE',playerId:targetId});
    expect(reconnect.view!.personalResult).toBe('WIN');
    const lateVoter = party.slice(4).find(client => client !== scapegoat)!;
    expect(await h.send(lateVoter, { type: 'councilVote', matchId, dayNumber, targetId: id(lateVoter) }))
      .toMatchObject({ code: 'PHASE' });
    expect(await h.send(lateVoter, { type: 'endTurn', matchId, turnNumber: lateVoter.view!.day!.turnNumber, gameVersion: lateVoter.view!.day!.version }))
      .toMatchObject({ code: 'PHASE' });
    const currentHost = id(host) === targetId ? reconnect : host;
    await h.accepted(currentHost, { type: 'rematch', expectedVersion: (await h.sync(currentHost)).version });
    expect(currentHost.view!.phase).toBe('LOBBY');
    expect(currentHost.view!.day).toBeNull();
  });
});
