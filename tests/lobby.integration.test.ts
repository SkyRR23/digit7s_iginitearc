import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import type { ClientEvents, Command, Reply, RoomView, ServerEvents, Session } from '@ashfall/shared';
import { createGameServer } from '../apps/server/src/server.js';

type Client = { socket: Socket<ServerEvents, ClientEvents>; view?: RoomView; session?: Session; events: RoomView[] };
type Input = Command extends infer C ? C extends Command ? Omit<C, 'actionId'> & { actionId?: string } : never : never;
let server: ReturnType<typeof createGameServer>;
let port: number;
let clients: Client[];
async function connect(): Promise<Client> {
  const socket: Client['socket'] = io(`http://127.0.0.1:${port}`, { transports: ['websocket'], reconnection: false, forceNew: true });
  const client: Client = { socket, events: [] };
  socket.on('state', view => { client.view = view; client.events.push(view); });
  clients.push(client);
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return client;
}
async function send(client: Client, command: Input): Promise<Reply> {
  const result = await new Promise<Reply>((resolve, reject) => client.socket.timeout(2000).emit('command',
    { ...command, actionId: command.actionId ?? randomUUID() } as Command,
    (error: Error | null, reply: Reply) => error ? reject(error) : resolve(reply)));
  if (result.ok) {
    if (result.session) client.session = result.session;
    if (result.view && (!client.view || client.view.code !== result.view.code || result.view.version >= client.view.version))
      client.view = result.view;
  }
  return result;
}
async function create(name = 'Host'): Promise<Client> {
  const client = await connect();
  expect((await send(client, { type: 'create', name, avatar: 'lantern' })).ok).toBe(true);
  return client;
}
async function join(host: Client, name: string): Promise<Client> {
  const client = await connect();
  expect((await send(client, { type: 'join', roomCode: host.view!.code, name, avatar: 'moth' })).ok).toBe(true);
  return client;
}
async function sync(client: Client): Promise<RoomView> {
  expect((await send(client, { type: 'sync' })).ok).toBe(true);
  return client.view!;
}
async function six(): Promise<Client[]> {
  const host = await create();
  const party = [host];
  for (let i = 1; i < 6; i++) party.push(await join(host, `Guest ${i}`));
  return party;
}
async function ready(client: Client): Promise<void> {
  const current = await sync(client);
  expect((await send(client, { type: 'ready', ready: true, expectedVersion: current.version })).ok).toBe(true);
}
beforeEach(async () => {
  clients = [];
  server = createGameServer({ graceMs: 350, sweepMs: 20 });
  port = await server.listen(0);
});
afterEach(async () => { clients.forEach(c => c.socket.disconnect()); await server.close(); });

describe('real Socket.IO lobby clients', () => {
  it('synchronizes six live connections, starts only when ready, then reopens', async () => {
    const party = await six(); const host = party[0]!;
    await vi.waitFor(() => expect(party.every(c => c.view?.players.length === 6)).toBe(true));
    expect(await send(host, { type: 'start', expectedVersion: (await sync(host)).version })).toMatchObject({ ok: false, code: 'NOT_READY' });
    for (const client of party) await ready(client);
    expect((await send(host, { type: 'start', expectedVersion: (await sync(host)).version })).ok).toBe(true);
    await vi.waitFor(() => expect(party.every(c => c.view?.phase === 'PRIVATE_DEAL')).toBe(true));
    expect((await send(host, { type: 'reopen', expectedVersion: (await sync(host)).version })).ok).toBe(true);
    expect(host.view!.players.every(p => !p.ready)).toBe(true);
  });
  it('rejects early starts, non-host controls, excess seats, and locked-room joins', async () => {
    const host = await create();
    expect(await send(host, { type: 'start', expectedVersion: host.view!.version })).toMatchObject({ code: 'NOT_READY' });
    const guest = await join(host, 'Guest');
    expect(await send(guest, { type: 'start', expectedVersion: (await sync(guest)).version })).toMatchObject({ code: 'HOST_ONLY' });
    const party = [host, guest];
    for (let i = 2; i < 6; i++) party.push(await join(host, `Guest ${i}`));
    const extra = await connect();
    expect(await send(extra, { type: 'join', roomCode: host.view!.code, name: 'Extra', avatar: 'moon' })).toMatchObject({ code: 'FULL' });
    for (const client of party) await ready(client);
    await send(host, { type: 'start', expectedVersion: (await sync(host)).version });
    expect(await send(extra, { type: 'join', roomCode: host.view!.code, name: 'Extra', avatar: 'moon' })).toMatchObject({ code: 'LOCKED' });
  });
  it('gives each member their own viewer ID and never serializes credentials or internal fields', async () => {
    const host = await create(); const guest = await join(host, 'Guest');
    const current = await sync(host);
    expect(current.you?.playerId).toBe(host.session!.playerId);
    expect(guest.view!.you?.playerId).toBe(guest.session!.playerId);
    expect(current.private).toBeNull();
    expect(Object.keys(current.players[0]!).sort()).toEqual(['abandoned', 'avatar', 'botDifficulty', 'connected', 'id', 'isBot', 'name', 'ready', 'reconnectUntil'].sort());
    for (const client of [host, guest]) {
      const wire = JSON.stringify(client.events);
      for (const secret of [host.session!.token, guest.session!.token, 'tokenHash', 'socketId', 'receipts', 'deck']) expect(wire).not.toContain(secret);
    }
  });
  it('isolates two concurrent rooms and gives an unseated spectator no state or controls', async () => {
    const a = await create('Host A'); const b = await create('Host B'); const spectator = await connect();
    const before = b.events.length;
    await send(a, { type: 'chat', text: 'Only room A sees this.' });
    await sync(b);
    expect(b.events.slice(before).some(v => v.feed.some(e => e.text.includes('Only room A')))).toBe(false);
    expect(b.view!.code).not.toBe(a.view!.code);
    expect(await send(spectator, { type: 'sync' })).toMatchObject({ code: 'NO_SESSION' });
    expect(await send(spectator, { type: 'ready', ready: true, expectedVersion: 0 })).toMatchObject({ code: 'NO_SESSION' });
    expect(spectator.events).toEqual([]);
  });
  it('deduplicates creation and accepted actions and rejects reused IDs with altered content', async () => {
    const host = await connect(); const id = randomUUID();
    const command = { type: 'create' as const, actionId: id, name: 'Host', avatar: 'moon' as const };
    const first = await send(host, command); const second = await send(host, command);
    expect(second).toEqual(first);
    const chat = { type: 'chat' as const, actionId: randomUUID(), text: 'One message' };
    const version = host.view!.version;
    await Promise.all([send(host, chat), send(host, chat)]);
    expect(host.view!.version).toBe(version + 1);
    expect(host.view!.feed.filter(e => e.text === 'One message')).toHaveLength(1);
    expect(await send(host, { ...chat, text: 'Changed payload' })).toMatchObject({ code: 'REUSED_ID' });
  });
  it('rejects late revisions and resolves simultaneous actions without double mutation', async () => {
    const host = await create(); const guest = await join(host, 'Guest');
    const revision = (await sync(host)).version;
    const replies = await Promise.all([send(host, { type: 'ready', ready: true, expectedVersion: revision }), send(guest, { type: 'ready', ready: true, expectedVersion: revision })]);
    expect(replies.filter(r => r.ok)).toHaveLength(1);
    expect(replies.filter(r => !r.ok && r.code === 'STALE')).toHaveLength(1);
    expect((await sync(host)).players.filter(p => p.ready)).toHaveLength(1);
  });
  it('restores identity and ready status after a browser-style restart with a new socket', async () => {
    const host = await create(); const guest = await join(host, 'Guest'); await ready(guest);
    const session = guest.session!; const oldSocketId = guest.socket.id;
    guest.socket.disconnect();
    await vi.waitFor(() => expect(host.view!.players.find(p => p.id === session.playerId)?.connected).toBe(false));
    const refreshed = await connect();
    expect((await send(refreshed, { type: 'resume', session })).ok).toBe(true);
    expect(refreshed.socket.id).not.toBe(oldSocketId);
    expect(refreshed.view!.you?.playerId).toBe(session.playerId);
    expect(refreshed.view!.players.find(p => p.id === session.playerId)).toMatchObject({ connected: true, ready: true });
  });
  it('survives duplicate-tab takeover without the old socket disconnecting the new seat', async () => {
    const host = await create(); const refreshed = await connect();
    expect((await send(refreshed, { type: 'resume', session: host.session! })).ok).toBe(true);
    await vi.waitFor(() => expect(host.socket.connected).toBe(false));
    expect((await sync(refreshed)).players[0]!.connected).toBe(true);
  });
  it('preserves accepted action receipts across reconnects', async () => {
    const host = await create();
    const command = { type: 'chat' as const, actionId: randomUUID(), text: 'Retried after reconnect' };
    await send(host, command);
    const refreshed = await connect();
    await send(refreshed, { type: 'resume', session: host.session! });
    await send(refreshed, command);
    expect(refreshed.view!.feed.filter(e => e.text === command.text)).toHaveLength(1);
  });
  it('rejects a forged reconnect credential without evicting its owner', async () => {
    const host = await create(); const attacker = await connect();
    expect(await send(attacker, { type: 'resume', session: { ...host.session!, token: 'a'.repeat(64) } })).toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(host.socket.connected).toBe(true);
    expect(attacker.events).toEqual([]);
  });
  it('expires disconnected seats, migrates the host, and invalidates old credentials', async () => {
    const host = await create(); const guest = await join(host, 'Guest'); const session = host.session!;
    host.socket.disconnect();
    await vi.waitFor(() => expect(guest.view!.players).toHaveLength(1), { timeout: 2500 });
    expect(guest.view!.hostId).toBe(guest.session!.playerId);
    const expired = await connect();
    expect(await send(expired, { type: 'resume', session })).toMatchObject({ code: 'SESSION_EXPIRED' });
  });
  it('leaves cleanly, hands over host controls, and reopens a sealed gathering', async () => {
    const party = await six(); const host = party[0]!;
    for (const client of party) await ready(client);
    await send(host, { type: 'start', expectedVersion: (await sync(host)).version });
    await send(host, { type: 'leave', expectedVersion: (await sync(host)).version });
    const remaining = await sync(party[1]!);
    expect(remaining.phase).toBe('LOBBY'); expect(remaining.players).toHaveLength(5);
    expect(remaining.hostId).toBe(party[1]!.session!.playerId);
    expect(remaining.players.every(p => !p.ready)).toBe(true);
    expect(await send(host, { type: 'sync' })).toMatchObject({ code: 'NO_SESSION' });
  });
  it('rejects malformed packets, duplicate names, and unknown rooms', async () => {
    const host = await create(); const guest = await connect();
    expect(await send(guest, { type: 'join', roomCode: host.view!.code, name: 'HOST', avatar: 'moon' })).toMatchObject({ code: 'NAME_TAKEN' });
    expect(await send(guest, { type: 'join', roomCode: 'ABCDEFGH', name: 'Guest', avatar: 'moon' })).toMatchObject({ code: 'NOT_FOUND' });
    expect(await send(guest, { type: 'create', name: 'Guest', avatar: 'moon', role: 'witch' } as Input)).toMatchObject({ code: 'INVALID' });
  });
});
