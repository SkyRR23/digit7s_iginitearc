import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { originalPrototypePreset, type RoomView } from '@ashfall/shared';
import { createDay, type DayState } from '@ashfall/shared/day';
import { createHarness, type Client, type Input } from './socket-harness.js';

let h: Awaited<ReturnType<typeof createHarness>>;
let clock: number;
let prepare: (s: DayState) => void;
beforeEach(async () => {
  clock = Date.now(); prepare = () => {};
  h = await createHarness(60_000, { now: () => clock, dayFactory: (identity, now) => {
    const result = createDay(identity, originalPrototypePreset, max => max - 1, randomUUID, now);
    result.state.discard.push(...result.state.deck.splice(1)); prepare(result.state); return result;
  } });
});
afterEach(async () => { await h.close(); });
async function begin() {
  const party = await h.six(); await h.start(party);
  await Promise.all(party.map(c => h.accepted(c, { type: 'acknowledgeDeal', matchId: c.view!.deal!.matchId })));
  await Promise.all(party.map(h.sync));
  const actor = party.find(c => c.session!.playerId === c.view!.day!.activePlayerId)!;
  await h.accepted(actor, { type: 'drawCards', matchId: actor.view!.deal!.matchId, turnNumber: actor.view!.day!.turnNumber, gameVersion: actor.view!.day!.version });
  await Promise.all(party.map(h.sync)); return party;
}
function packet(c: Client, type: 'nightAttack' | 'nightProtect', targetId: string | null): Input {
  return { type, actionId: randomUUID(), matchId: c.view!.deal!.matchId, nightNumber: c.view!.day!.dayNumber, targetId };
}
const witch = (party: Client[]) => party.find(c => c.view!.private?.everWitch)!;
const keeper = (party: Client[]) => party.find(c => c.view!.private?.constableAbility)!;
const victim = (party: Client[]) => party.find(c => c.view!.private && !c.view.private.everWitch && !c.view.private.constableAbility)!;
const id = (c: Client) => c.session!.playerId;
async function dawn(party: Client[]) {
  clock = party[0]!.view!.day!.deadline!;
  await vi.waitFor(() => expect(party.every(c => c.view!.phase === 'DAWN' || c.view!.phase === 'GAME_OVER')).toBe(true));
}
function publicFields(v: RoomView) {
  return { version: v.version, phase: v.phase, day: v.day, dawn: v.dawn, feed: v.feed, deal: v.deal };
}

describe('six-client Night protocol', () => {
  it('submissions are owner-only with no public revision, progress, feed or broadcast side channel', async () => {
    const party = await begin(); const w = witch(party); const k = keeper(party); const target = victim(party);
    const before = party.map(c => ({ view: structuredClone(c.view!), count: c.events.length }));
    await h.accepted(w, packet(w, 'nightAttack', id(target)));
    await h.accepted(k, packet(k, 'nightProtect', id(target)));
    for (const [i, c] of party.entries()) {
      if (c !== w && c !== k) expect(c.events).toHaveLength(before[i]!.count);
      expect(publicFields(c.view!)).toEqual(publicFields(before[i]!.view));
      expect(c.view!.privateVersion).toBe(before[i]!.view.privateVersion + Number(c === w) + Number(c === k));
    }
    await Promise.all(party.map(h.sync));
    for (const c of party) {
      expect(c.view!.night?.attack?.submitted ?? false).toBe(c === w);
      expect(c.view!.night?.protection?.submitted ?? false).toBe(c === k);
      for (const view of [...c.events, ...c.replies.flatMap(r => r.ok && r.view ? [r.view] : [])]) {
        expect(JSON.stringify(view)).not.toMatch(/"attacks"|"protections"/);
        if (c !== w) expect(view.night?.attack?.targetId ?? null).toBeNull();
        if (c !== k) expect(view.night?.protection?.targetId ?? null).toBeNull();
      }
    }
    expect(party.every(c => c.view!.phase === 'NIGHT')).toBe(true);
  });
  it('validates roles, target restrictions, strict payloads, spectator admission, and Night chat silence', async () => {
    const party = await begin(); const w = witch(party); const k = keeper(party); const target = victim(party);
    expect(await h.send(target, packet(target, 'nightAttack', id(w)))).toMatchObject({ code: 'ABILITY' });
    expect(await h.send(target, packet(target, 'nightProtect', id(w)))).toMatchObject({ code: 'ABILITY' });
    expect(await h.send(k, packet(k, 'nightProtect', id(k)))).toMatchObject({ code: 'SELF_TARGET' });
    expect(await h.send(w, packet(w, 'nightAttack', randomUUID()))).toMatchObject({ code: 'TARGET' });
    expect(await h.send(w, { ...packet(w, 'nightAttack', id(target)), actorId: id(target) } as Input)).toMatchObject({ code: 'INVALID' });
    expect(await h.send(w, { ...packet(w, 'nightAttack', id(target)), timestamp: clock - 1 } as Input)).toMatchObject({ code: 'INVALID' });
    const stranger = await h.connect();
    expect(await h.send(stranger, packet(w, 'nightAttack', id(target)))).toMatchObject({ code: 'NO_SESSION' });
    expect(stranger.events).toEqual([]);
    for (const c of party) expect(await h.send(c, { type: 'chat', text: 'Can you hear me?' })).toMatchObject({ code: 'NIGHT_SILENCE' });
  });
  it('duplicate packets apply once; conflicting replacement and reused IDs fail', async () => {
    const party = await begin(); const w = witch(party); const command = packet(w, 'nightAttack', id(victim(party)));
    const privateBefore = w.view!.privateVersion;
    const replies = await Promise.all([h.send(w, command), h.send(w, command)]);
    expect(replies.every(r => r.ok)).toBe(true); expect(w.view!.privateVersion).toBe(privateBefore + 1);
    expect(await h.send(w, { ...command, targetId: null })).toMatchObject({ code: 'REUSED_ID' });
    expect(await h.send(w, { ...command, actionId: randomUUID(), targetId: null })).toMatchObject({ code: 'LOCKED_CHOICE' });
  });
  it('correct protection saves through Dawn and next Day, retaining private hands and clearing old ballots', async () => {
    const party = await begin(); const w = witch(party); const k = keeper(party); const target = victim(party);
    const hands = party.map(c => c.view!.hand);
    const recycled = party[0]!.view!.day!.discardCount;
    await Promise.all([h.accepted(w, packet(w, 'nightAttack', id(target))), h.accepted(k, packet(k, 'nightProtect', id(target)))]);
    await dawn(party);
    for (const c of party) { expect(c.view!.dawn).toEqual({ nightNumber: 1, deceasedId: null }); expect(c.view!.night).toBeNull(); }
    clock += 5000;
    await vi.waitFor(() => expect(party.every(c => c.view!.phase === 'DAY')).toBe(true));
    for (const c of party) {
      expect(c.view!.day!.dayNumber).toBe(2); expect(c.view!.hand).toEqual(hands[party.indexOf(c)]); expect(c.view!.day!.deckCount).toBe(recycled);
      for (const other of party.filter(p => p !== c)) for (const card of other.view!.hand!) expect(JSON.stringify(c.view)).not.toContain(card.id);
    }
  });
  it('missing protection kills, clears private data even on old cached sync, and dead refresh remains public-only', async () => {
    const party = await begin(); const w = witch(party); const target = victim(party);
    const sync = { type: 'sync' as const, actionId: randomUUID() }; await h.accepted(target, sync);
    await h.accepted(w, packet(w, 'nightAttack', id(target))); await dawn(party);
    await h.accepted(target, sync);
    expect(target.view!.dawn!.deceasedId).toBe(id(target));
    expect(target.view!.private).toBeNull(); expect(target.view!.hand).toBeNull(); expect(target.view!.night).toBeNull();
    const fresh = await h.connect(); await h.accepted(fresh, { type: 'resume', session: target.session! });
    expect(fresh.view!.private).toBeNull(); expect(fresh.view!.night).toBeNull();
    expect(fresh.view!.deal!.players.find(p => p.playerId === id(target))!.seals.every(c => c.revealed)).toBe(true);
  });
  it('Night refresh preserves own sealed choices and disconnection never delays deadline', async () => {
    const party = await begin(); const w = witch(party); const target = victim(party);
    const privateBefore = w.view!.privateVersion;
    const command = packet(w, 'nightAttack', id(target)); await h.accepted(w, command);
    const own = w.view!.night; w.socket.disconnect(); const fresh = await h.connect();
    await h.accepted(fresh, { type: 'resume', session: w.session! }); expect(fresh.view!.night).toEqual(own);
    await h.accepted(fresh, command); expect(fresh.view!.privateVersion).toBe(privateBefore + 1);
    fresh.socket.disconnect();
    const connected = party.filter(c => c !== w); await dawn(connected);
    expect(target.view!.dawn!.deceasedId).toBe(id(target));
  });
  it('all missing choices reach Dawn then Day without client input, and late choices cannot change dawn', async () => {
    const party = await begin(); const w = witch(party); const late = packet(w, 'nightAttack', id(victim(party)));
    await dawn(party); expect(party[0]!.view!.dawn!.deceasedId).toBeNull();
    expect(await h.send(w, late)).toMatchObject({ code: 'PHASE' });
    clock += 5000; await vi.waitFor(() => expect(party[0]!.view!.phase).toBe('DAY'));
  });
  it('night death of last Human yields Witch victory across six clients and correct personal results', async () => {
    prepare = s => {
      const last = s.identity.players.find(p => !p.everWitch)!.id;
      s.activePlayerId = s.identity.players.find(p => p.everWitch)!.id;
      for (const p of s.identity.players) if (!p.everWitch && p.id !== last) {
        p.alive = false; s.identity.cards.filter(c => c.ownerId === p.id).forEach(c => { c.revealed = true; });
        s.discard.push(...s.hands[p.id]!); s.hands[p.id] = [];
      }
    };
    const party = await begin(); const w = witch(party); const target = party.find(c => c.view!.private && !c.view.private.everWitch)!;
    await h.accepted(w, packet(w, 'nightAttack', id(target))); await dawn(party);
    for (const c of party) {
      expect(c.view!.phase).toBe('GAME_OVER'); expect(c.view!.day!.outcome!.winner).toBe('WITCH');
      expect(c.view!.personalResult).toBe(c.view!.private?.everWitch ? 'WIN' : 'LOSS'); expect(c.view!.night).toBeNull();
    }
  });
  it('rooms remain isolated; reopening during Night cancels choices and deadlines', async () => {
    const a = await begin(); const b = await begin(); const w = witch(a); const target = victim(a);
    const before = b.map(c => structuredClone(c.view!)); const command = packet(w, 'nightAttack', id(target));
    await h.accepted(w, command);
    for (const [i, c] of b.entries()) expect(c.view).toEqual(before[i]);
    await h.accepted(a[0]!, { type: 'reopen', expectedVersion: (await h.sync(a[0]!)).version });
    clock += 45_000;
    await vi.waitFor(() => expect(b[0]!.view!.phase).toBe('DAWN'));
    expect((await h.sync(a[0]!)).phase).toBe('LOBBY');
    await h.accepted(w, command); expect(w.view!.night).toBeNull(); expect(w.view!.day).toBeNull();
    expect(await h.send(w, { ...command, actionId: randomUUID() })).toMatchObject({ code: 'PHASE' });
  });
});
