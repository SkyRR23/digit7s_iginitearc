import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHarness, type Client, type Input } from './socket-harness.js';

let h: Awaited<ReturnType<typeof createHarness>>;
beforeEach(async () => { h = await createHarness(); });
afterEach(async () => { await h.close(); });
function allViews(client: Client) {
  return [...client.events, ...client.replies.flatMap(r => r.ok && r.view ? [r.view] : [])];
}

describe('six-client private deals over real Socket.IO connections', () => {
  it('persists the owner’s arranged positions without broadcasting private cards and locks them after confirmation', async () => {
    const party = await h.six(); await h.start(party);
    const actor = party[0]!, other = party[1]!, matchId = actor.view!.deal!.matchId;
    const ids = actor.view!.private!.identities.map(card => card.id).reverse();
    const publicBefore = actor.view!.deal, revision = actor.view!.version;
    await h.accepted(actor, { type: 'arrangeSeals', matchId, cardIds: ids });
    expect(actor.view!.private!.identities.map(card => card.id)).toEqual(ids);
    expect(actor.view!.deal).toEqual(publicBefore); expect(actor.view!.version).toBe(revision);
    await h.sync(other);
    for (const id of ids) expect(JSON.stringify(other.view)).not.toContain(id);
    expect(await h.send(actor, { type: 'arrangeSeals', matchId, cardIds: [...ids.slice(1), other.view!.private!.identities[0]!.id] })).toMatchObject({ code: 'SEAL' });
    await h.accepted(actor, { type: 'acknowledgeDeal', matchId });
    expect(await h.send(actor, { type: 'arrangeSeals', matchId, cardIds: ids })).toMatchObject({ code: 'SEAL' });
  });
  it('deals exactly 27 Humans, 2 Witches and 1 Constable with owner-only data on every response and broadcast', async () => {
    const party = await h.six(); await h.start(party);
    const cards = party.flatMap(c => c.view!.private!.identities);
    expect(cards).toHaveLength(30); expect(new Set(cards.map(c => c.id)).size).toBe(30);
    expect(cards.filter(c => c.kind === 'HUMAN')).toHaveLength(27);
    expect(cards.filter(c => c.kind === 'WITCH')).toHaveLength(2);
    expect(cards.filter(c => c.kind === 'CONSTABLE')).toHaveLength(1);
    const witches = party.filter(c => c.view!.private!.everWitch).map(c => c.session!.playerId);
    for (const client of party) {
      const own = client.view!.private!;
      expect(own.identities.map(c => c.slot)).toEqual([0, 1, 2, 3, 4]);
      expect(own.everWitch).toBe(own.identities.some(c => c.kind === 'WITCH'));
      expect(own.constableAbility).toBe(own.identities.some(c => c.kind === 'CONSTABLE'));
      expect(own.witchTeammateIds).toEqual(own.everWitch ? witches.filter(id => id !== client.session!.playerId) : []);
      for (const view of allViews(client).filter(v => v.deal)) {
        expect(view.private!.identities).toEqual(own.identities);
        expect(view.deal).toEqual(client.view!.deal);
        expect(view.deal!.players.flatMap(p => p.seals).every(c => Object.keys(c).sort().join(',') === 'revealed,slot')).toBe(true);
        const wire = JSON.stringify(view);
        for (const other of party.filter(c => c !== client)) {
          for (const card of other.view!.private!.identities) expect(wire).not.toContain(card.id);
          expect(wire).not.toContain(other.session!.token);
        }
        expect(Object.keys(view.private!).sort()).toEqual(['constableAbility', 'everWitch', 'identities', 'witchTeammateIds']);
        expect(wire).not.toContain('ownerId'); expect(wire).not.toContain('deck');
      }
    }
  });
  it('acknowledges only the authenticated actor and completes after all six acknowledgements', async () => {
    const party = await h.six(); await h.start(party);
    const matchId = party[0]!.view!.deal!.matchId;
    expect(await h.send(party[0]!, { type: 'acknowledgeDeal', matchId, playerId: party[1]!.session!.playerId } as Input)).toMatchObject({ code: 'INVALID' });
    const action = { type: 'acknowledgeDeal' as const, actionId: randomUUID(), matchId };
    await h.accepted(party[0]!, action); const version = party[0]!.view!.version;
    await h.accepted(party[0]!, action);
    await h.accepted(party[0]!, { ...action, actionId: randomUUID() });
    expect(party[0]!.view!.version).toBe(version);
    expect(party[0]!.view!.deal!.players.filter(p => p.acknowledged).map(p => p.playerId)).toEqual([party[0]!.session!.playerId]);
    await Promise.all(party.slice(1).map(c => h.accepted(c, { type: 'acknowledgeDeal', matchId })));
    await vi.waitFor(() => expect(party.every(c => c.view!.phase === 'DAY')).toBe(true));
    expect(party[0]!.view!.deal!.players.every(p => p.acknowledged)).toBe(true);
  });
  it('rejects role/deck requests, wrong match IDs, unseated viewers and forged credentials during a deal', async () => {
    const party = await h.six(); await h.start(party); const host = party[0]!;
    const stranger = await h.connect(); const matchId = host.view!.deal!.matchId;
    expect(await h.send(stranger, { type: 'sync' })).toMatchObject({ code: 'NO_SESSION' });
    expect(await h.send(stranger, { type: 'acknowledgeDeal', matchId })).toMatchObject({ code: 'NO_SESSION' });
    expect(await h.send(stranger, { type: 'resume', session: { ...host.session!, token: '0'.repeat(64) } })).toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(await h.send(host, { type: 'acknowledgeDeal', matchId: randomUUID() })).toMatchObject({ code: 'MATCH_CHANGED' });
    expect(await h.send(host, { type: 'start', expectedVersion: host.view!.version, deck: [], role: 'WITCH' } as Input)).toMatchObject({ code: 'INVALID' });
    expect(await h.send(host, { type: 'sync', playerId: party[1]!.session!.playerId } as Input)).toMatchObject({ code: 'INVALID' });
    expect(stranger.events).toEqual([]);
    expect(stranger.replies.every(r => !r.ok)).toBe(true);
  });
  it('reconnects after refresh with the same ordered Seals, history, ability and acknowledgement', async () => {
    const party = await h.six(); await h.start(party); const old = party[4]!;
    await h.accepted(old, { type: 'acknowledgeDeal', matchId: old.view!.deal!.matchId });
    const privateBefore = old.view!.private; const matchId = old.view!.deal!.matchId;
    old.socket.disconnect();
    const fresh = await h.connect(); await h.accepted(fresh, { type: 'resume', session: old.session! });
    expect(fresh.view!.private).toEqual(privateBefore);
    expect(fresh.view!.deal!.matchId).toBe(matchId);
    expect(fresh.view!.deal!.players.find(p => p.playerId === old.session!.playerId)!.acknowledged).toBe(true);
  });
  it('does not deal again on duplicate starts or return obsolete private data on replay after reopening', async () => {
    const party = await h.six(); const host = party[0]!; const start = await h.start(party);
    const old = host.view!.private; const oldId = host.view!.deal!.matchId;
    await h.accepted(host, start); expect(host.view!.private).toEqual(old);
    const syncAction = { type: 'sync' as const, actionId: randomUUID() }; await h.accepted(host, syncAction);
    const oldAck = { type: 'acknowledgeDeal' as const, actionId: randomUUID(), matchId: oldId }; await h.accepted(host, oldAck);
    await h.accepted(host, { type: 'reopen', expectedVersion: (await h.sync(host)).version });
    await h.accepted(host, syncAction); expect(host.view!.private).toBeNull();
    await h.accepted(host, start); expect(host.view!.deal).toBeNull();
    await h.start(party);
    expect(host.view!.deal!.matchId).not.toBe(oldId);
    expect(host.view!.private!.identities.every(c => !old!.identities.some(previous => previous.id === c.id))).toBe(true);
    await h.accepted(host, oldAck);
    expect(host.view!.deal!.players.every(p => !p.acknowledged)).toBe(true);
    expect(await h.send(host, { type: 'acknowledgeDeal', matchId: oldId })).toMatchObject({ code: 'MATCH_CHANGED' });
  });
  it('never replays a cached private view or credentials after a player leaves', async () => {
    const party = await h.six(); await h.start(party); const guest = party[5]!;
    const syncAction = { type: 'sync' as const, actionId: randomUUID() }; await h.accepted(guest, syncAction);
    await h.accepted(guest, { type: 'leave', expectedVersion: guest.view!.version });
    expect(await h.send(guest, syncAction)).toMatchObject({ ok: false, code: 'NO_SESSION' });
    expect(await h.send(guest, { type: 'resume', session: guest.session! })).toMatchObject({ code: 'SESSION_EXPIRED' });
    const view = await h.sync(party[0]!); expect(view.phase).toBe('LOBBY'); expect(view.private).toBeNull(); expect(view.deal).toBeNull();
  });
  it('ends an incomplete deal on grace expiry without revealing any identities', async () => {
    const party = await h.six(); await h.start(party); const guest = party[5]!;
    const privateIds = guest.view!.private!.identities.map(c => c.id); guest.socket.disconnect();
    await vi.waitFor(() => expect(party[0]!.view!.phase).toBe('LOBBY'), { timeout: 3000 });
    for (const client of party.slice(0, 5)) {
      await h.sync(client); expect(client.view!.private).toBeNull();
      for (const id of privateIds) expect(JSON.stringify(client.view)).not.toContain(id);
    }
  });
  it('keeps two simultaneous six-player deals isolated, including reconnect credentials and private cards', async () => {
    const a = await h.six(); const b = await h.six(); await h.start(a); await h.start(b);
    expect(a[0]!.view!.deal!.matchId).not.toBe(b[0]!.view!.deal!.matchId);
    for (const client of a) {
      const wire = JSON.stringify(allViews(client));
      for (const other of b) for (const card of other.view!.private!.identities) expect(wire).not.toContain(card.id);
    }
    const forged = { ...a[0]!.session!, roomCode: b[0]!.view!.code };
    expect(await h.send(a[0]!, { type: 'resume', session: forged })).toMatchObject({ code: 'SESSION_EXPIRED' });
    expect((await h.sync(a[0]!)).deal!.matchId).not.toBe(b[0]!.view!.deal!.matchId);
  });
});
