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
    const party = await h.six();
    const host = party[0]!;
    await h.accepted(host, { type: 'setScapegoat', expectedVersion: (await h.sync(host)).version, enabled: true });
    await begin(party);
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
    expect(scapegoat.view!.feed.some(entry => entry.text.includes('SCAPEGOAT VICTORY'))).toBe(true);
    expect(party.filter(c => c !== scapegoat).every(c => c.view!.personalResult !== 'WIN')).toBe(true);
    const lateVoter = party.slice(4).find(client => client !== scapegoat)!;
    expect(await h.send(lateVoter, { type: 'councilVote', matchId, dayNumber, targetId: id(lateVoter) }))
      .toMatchObject({ code: 'VOTED' });
  });
});
