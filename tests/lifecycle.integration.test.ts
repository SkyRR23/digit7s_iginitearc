import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { originalPrototypePreset, type DayIntent } from '@ashfall/shared';
import { createDay, forfeitPlayers, type DayState } from '@ashfall/shared/day';
import { createHarness, type Client, type Input } from './socket-harness.js';

let h: Awaited<ReturnType<typeof createHarness>>;
let clock: number;
let prepare: (s: DayState) => void;
beforeEach(async () => {
  clock = 100_000; prepare = () => {};
  h = await createHarness(60_000, { now: () => clock, dayFactory: (identity, now) => {
    const result = createDay(identity, originalPrototypePreset, max => max - 1, randomUUID, now);
    result.state.activePlayerId = identity.players.find(p => !p.everWitch)!.id;
    prepare(result.state); return result;
  } });
});
afterEach(async () => { await h.close(); });
const id = (c: Client) => c.session!.playerId;
async function begin() {
  const party = await h.six(); await h.start(party,false);
  // These lifecycle fixtures deliberately start with an innocent actor, so the
  // opening curse targets that same seat before synthetic pending states run.
  const first = party.find(client=>!client.view!.private!.everWitch)!;
  await Promise.all(party.map(c => h.accepted(c, { type: 'acknowledgeDeal', matchId: c.view!.deal!.matchId })));
  await h.finishOpening(party,first);
  await Promise.all(party.map(h.sync)); return party;
}
const actor = (party: Client[]) => party.find(c => id(c) === c.view!.day!.activePlayerId)!;
const human = (party: Client[]) => party.find(c => c.view!.private && !c.view.private.everWitch)!;
const witch = (party: Client[]) => party.find(c => c.view!.private?.everWitch)!;
function packet(c: Client, intent: DayIntent): Input { return { ...intent, matchId: c.view!.deal!.matchId, turnNumber: c.view!.day!.turnNumber, gameVersion: c.view!.day!.version }; }
async function leave(c: Client) { await h.accepted(c, { type: 'leave', expectedVersion: (await h.sync(c)).version }); }
async function disconnect(c: Client, observer: Client) {
  await h.sync(observer); // Drain prior resume broadcasts before waiting for a new disconnect.
  c.socket.disconnect();
  await vi.waitFor(() => expect(observer.view!.players.find(p => p.id === id(c))!.connected).toBe(false));
}
async function night(party: Client[]) {
  const c = actor(party); await h.accepted(c, packet(c, { type: 'drawCards' }));
  await Promise.all(party.map(h.sync)); expect(c.view!.phase).toBe('NIGHT');
}

describe('abandonment, rematch and recovery over real sockets', () => {
  it('living active leave forfeits without aborting, preserves seat order and revokes credentials/old receipts', async () => {
    const party = await begin(); const c = actor(party); const other = party.find(p => p !== c)!;
    const matchId = c.view!.deal!.matchId; const sync = { type: 'sync' as const, actionId: randomUUID() };
    await h.accepted(c, sync); await leave(c); const view = await h.sync(other);
    expect(view.phase).toBe('DAY'); expect(view.deal!.matchId).toBe(matchId); expect(view.players).toHaveLength(6);
    expect(view.players.find(p => p.id === id(c))).toMatchObject({ abandoned: true, connected: false, reconnectUntil: null });
    expect(view.deal!.players.find(p => p.playerId === id(c))!.seals.every(s => s.revealed)).toBe(true);
    expect(view.day!.activePlayerId).not.toBe(id(c));
    expect(await h.send(c, sync)).toMatchObject({ code: 'NO_SESSION' });
    expect(await h.send(c, { type: 'resume', session: c.session! })).toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(await h.send(c, { type: 'join', roomCode: view.code, name: 'Replacement', avatar: 'moon' })).toMatchObject({ code: 'LOCKED' });
  });
  it('disconnect preserves state until exact grace expiry, then forfeits permanently', async () => {
    const party = await begin(); const c = human(party); const other = party.find(p => p !== c)!;
    await disconnect(c, other); clock += 59_999;
    expect((await h.sync(other)).deal!.players.find(p => p.playerId === id(c))!.alive).toBe(true);
    const fresh = await h.connect(); await h.accepted(fresh, { type: 'resume', session: c.session! });
    expect(fresh.view!.private).toEqual(c.view!.private);
    await disconnect(fresh, other); clock += 60_000;
    await vi.waitFor(() => expect(other.view!.players.find(p => p.id === id(c))!.abandoned).toBe(true));
    const late = await h.connect(); expect(await h.send(late, { type: 'resume', session: c.session! })).toMatchObject({ code: 'SESSION_EXPIRED' });
  });
  it('migrates disconnected hosting immediately and returning old host cannot reclaim authority', async () => {
    const party = await begin(); await disconnect(party[0]!, party[1]!);
    expect(party[1]!.view!.hostId).toBe(id(party[1]!));
    const fresh = await h.connect(); await h.accepted(fresh, { type: 'resume', session: party[0]!.session! });
    expect(fresh.view!.hostId).toBe(id(party[1]!));
    expect(await h.send(fresh, { type: 'reopen', expectedVersion: fresh.view!.version })).toMatchObject({ code: 'HOST_ONLY' });
  });
  it('pending chooser forfeit picks lowest hidden target slot and moves to a living actor', async () => {
    prepare = s => {
      const target = s.identity.players.find(p => !p.everWitch && p.id !== s.activePlayerId)!.id;
      s.phase = 'REVEAL_RESOLUTION'; s.reveal = { chooserId: s.activePlayerId, targetId: target };
      s.deadline = clock + 30_000;
    };
    const party = await begin(); const c = actor(party); const target = c.view!.day!.reveal!.targetId;
    await leave(c); const view = await h.sync(party.find(p => p !== c)!);
    expect(view.day!.reveal).toBeNull(); expect(view.deal!.players.find(p => p.playerId === target)!.seals[0]!.revealed).toBe(true);
    expect(view.day!.activePlayerId).not.toBe(id(c));
  });
  it('pending target forfeit cancels selection with no extra reveal on another player', async () => {
    prepare = s => {
      const target = s.identity.players.find(p => !p.everWitch && p.id !== s.activePlayerId)!.id;
      s.phase = 'REVEAL_RESOLUTION'; s.reveal = { chooserId: s.activePlayerId, targetId: target }; s.deadline = clock + 30_000;
    };
    const party = await begin(); const c = actor(party); const target = party.find(p => id(p) === c.view!.day!.reveal!.targetId)!;
    await leave(target); const view = await h.sync(c);
    expect(view.phase).toBe('DAY'); expect(view.day!.reveal).toBeNull(); expect(view.day!.deadline).toBe(clock + 60_000);
    expect(view.deal!.players.filter(p => p.seals.some(s => s.revealed)).map(p => p.playerId)).toEqual([id(target)]);
  });
  it('Night forfeit removes protection, preserves Night deadline and does not prematurely start Day', async () => {
    prepare = s => { s.discard.push(...s.deck.splice(1)); };
    const party = await begin(); await night(party);
    const k = party.find(c => c.view!.private!.constableAbility)!; const target = party.find(c => c !== k && !c.view!.private!.everWitch)!;
    const w = witch(party); const deadline = w.view!.day!.deadline;
    // If the only Witch is also Constable, its forfeit correctly ends in Human victory.
    await h.accepted(k, { type: 'nightProtect', matchId: k.view!.deal!.matchId, nightNumber: 1, targetId: id(target) });
    await h.accepted(w, { type: 'nightAttack', matchId: w.view!.deal!.matchId, nightNumber: 1, targetId: id(target) });
    await leave(k); const view = await h.sync(target);
    if (view.phase === 'GAME_OVER') { expect(view.day!.outcome!.winner).toBe('HUMAN'); return; }
    expect(view.phase).toBe('NIGHT'); expect(view.day!.deadline).toBe(deadline);
    clock = deadline!; await vi.waitFor(() => expect(target.view!.phase).not.toBe('NIGHT'));
    expect(target.view!.dawn!.deceasedId).toBe(w === k ? null : id(target));
  });
  it('delayed sweep resolves earlier Night protection before a later disconnect expiry', async () => {
    prepare = s => { s.discard.push(...s.deck.splice(1)); };
    const party = await begin(); await night(party); const k = party.find(c => c.view!.private!.constableAbility)!;
    const target = party.find(c => c !== k && !c.view!.private!.everWitch)!; const w = witch(party);
    await h.accepted(k, { type: 'nightProtect', matchId: k.view!.deal!.matchId, nightNumber: 1, targetId: id(target) });
    await h.accepted(w, { type: 'nightAttack', matchId: w.view!.deal!.matchId, nightNumber: 1, targetId: id(target) });
    await disconnect(k, target); clock += 65_000;
    const view = await h.sync(target);
    expect(view.dawn!.deceasedId).toBeNull(); expect(view.deal!.players.find(p => p.playerId === id(target))!.alive).toBe(true);
    expect(view.players.find(p => p.id === id(k))!.abandoned).toBe(true);
  });
  it('equal-time final Human and Witch expirations resolve atomically with Human precedence', async () => {
    let finalHuman = '', finalWitch = '';
    prepare = s => {
      finalHuman = s.identity.players.find(p => !p.everWitch)!.id;
      finalWitch = s.identity.players.find(p => p.everWitch)!.id;
      // Retain all Witch holders, and expire them together with the final Human.
      const dead = s.identity.players.filter(p => !p.everWitch && p.id !== finalHuman).map(p => p.id);
      Object.assign(s, forfeitPlayers(s, dead, clock).state);
    };
    const party = await begin(); const observer = party.find(c => id(c) !== finalHuman && !c.view!.private?.everWitch)!;
    const expired = party.filter(c => id(c) === finalHuman || c.view!.private?.everWitch);
    expect(expired.some(c => id(c) === finalWitch)).toBe(true);
    for (const c of expired) await disconnect(c, observer);
    clock += 60_000; const view = await h.sync(observer);
    expect(view.phase).toBe('GAME_OVER'); expect(view.day!.outcome!.winner).toBe('HUMAN');
  });
  it('rematch prunes departures, preserves room/membership, requires six fresh ready players and new match/cards', async () => {
    const party = await begin(); const oldMatch = party[0]!.view!.deal!.matchId;
    const oldCards = party.flatMap(c => c.view!.private!.identities.map(s => s.id));
    const departed = party.filter(c => c.view!.private!.everWitch);
    for (const c of departed) await leave(c);
    const survivors = party.filter(c => !departed.includes(c));
    const host = survivors.find(c => id(c) === c.view!.hostId) ?? survivors.find(c => id(c) === survivors[0]!.view!.hostId)!;
    await h.sync(host); expect(host.view!.phase).toBe('GAME_OVER');
    const rematch = { type: 'rematch' as const, actionId: randomUUID(), expectedVersion: host.view!.version };
    await h.accepted(host, rematch); await h.accepted(host, rematch);
    expect(host.view!.phase).toBe('LOBBY'); expect(host.view!.players.every(p => !p.ready && !p.abandoned)).toBe(true);
    expect(host.view!.deal).toBeNull(); expect(host.view!.day).toBeNull(); expect(host.view!.night).toBeNull();
    expect(await h.send(host, { type: 'start', expectedVersion: host.view!.version })).toMatchObject({ code: 'NOT_READY' });
    const newParty = [host, ...survivors.filter(c => c !== host)];
    for (let i = 0; newParty.length < 6; i++) {
      const c = await h.connect(); await h.accepted(c, { type: 'join', roomCode: host.view!.code, name: `Replacement ${i}`, avatar: 'reed' }); newParty.push(c);
    }
    await h.start(newParty);
    expect(host.view!.deal!.matchId).not.toBe(oldMatch);
    for (const c of newParty) expect(c.view!.private!.identities.every(card => !oldCards.includes(card.id))).toBe(true);
    expect(await h.send(host, { type: 'acknowledgeDeal', matchId: oldMatch })).toMatchObject({ code: 'MATCH_CHANGED' });
    await h.accepted(host, rematch); expect(host.view!.phase).toBe('PRIVATE_DEAL');
    const fresh = await h.connect(); await h.accepted(fresh, { type: 'resume', session: host.session! });
    expect(fresh.view!.deal!.matchId).toBe(host.view!.deal!.matchId);
    for (const c of departed) expect(await h.send(c, { type: 'resume', session: c.session! })).toMatchObject({ code: 'SESSION_EXPIRED' });
  });
  it('rematch rejects non-hosts and unfinished matches; game-over departure preserves result', async () => {
    const party = await begin(); const host = party[0]!;
    expect(await h.send(host, { type: 'rematch', expectedVersion: host.view!.version })).toMatchObject({ code: 'PHASE' });
    expect(await h.send(party[1]!, { type: 'rematch', expectedVersion: party[1]!.view!.version })).toMatchObject({ code: 'HOST_ONLY' });
    for (const c of party.filter(c => c.view!.private!.everWitch)) await leave(c);
    const humanPlayers = party.filter(c => c.view!.private && !c.view!.private!.everWitch);
    const observer = humanPlayers[1]!; const result = (await h.sync(observer)).day!.outcome;
    await leave(humanPlayers[0]!);
    expect((await h.sync(observer)).day!.outcome).toEqual(result);
  });
  it('all expired seats delete the room; a different room remains unaffected', async () => {
    const a = await begin(); const b = await begin(); const before = b[0]!.view!.deal!.matchId;
    for (const c of a) c.socket.disconnect();
    await vi.waitFor(() => expect(a[0]!.socket.connected).toBe(false));
    // Flush server disconnect events before moving the authoritative clock.
    await new Promise(resolve => setTimeout(resolve, 30)); clock += 60_000;
    await h.sync(b[0]!);
    const fresh = await h.connect(); expect(await h.send(fresh, { type: 'resume', session: a[0]!.session! })).toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(await h.send(fresh, { type: 'join', roomCode: a[0]!.view!.code, name: 'No room', avatar: 'moon' })).toMatchObject({ code: 'NOT_FOUND' });
    expect(b[0]!.view!.deal!.matchId).toBe(before);
  });
});
