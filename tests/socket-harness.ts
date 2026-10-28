import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import type { ClientEvents, Command, Reply, RoomView, ServerEvents, Session } from '@ashfall/shared';
import { createGameServer } from '../apps/server/src/server.js';
export type Client = { socket: Socket<ServerEvents, ClientEvents>; view?: RoomView; session?: Session; events: RoomView[]; replies: Reply[] };
export type Input = Command extends infer C ? C extends Command ? Omit<C, 'actionId'> & { actionId?: string } : never : never;

export async function createHarness(graceMs = 1000, options: Parameters<typeof createGameServer>[0] = {}) {
  const server = createGameServer({ graceMs, sweepMs: 20, ...options });
  const port = await server.listen(0);
  const clients: Client[] = [];
  async function connect() {
    const socket: Client['socket'] = io(`http://127.0.0.1:${port}`, { transports: ['websocket'], reconnection: false, forceNew: true });
    const client: Client = { socket, events: [], replies: [] }; clients.push(client);
    socket.on('state', view => { client.view = view; client.events.push(view); });
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    return client;
  }
  async function send(client: Client, input: Input): Promise<Reply> {
    const reply = await new Promise<Reply>((resolve, reject) => client.socket.timeout(2000).emit('command',
      { ...input, actionId: input.actionId ?? randomUUID() } as Command,
      (error: Error | null, result: Reply) => error ? reject(error) : resolve(result)));
    client.replies.push(reply);
    if (reply.ok) {
      if (reply.session) client.session = reply.session;
      if (reply.view && (!client.view || client.view.code !== reply.view.code || reply.view.version >= client.view.version))
        client.view = reply.view;
    }
    return reply;
  }
  async function accepted(client: Client, input: Input) {
    const reply = await send(client, input);
    if (!reply.ok) throw new Error(`Unexpected rejection: ${reply.code}`);
    return reply;
  }
  async function sync(client: Client) { await accepted(client, { type: 'sync' }); return client.view!; }
  async function party(capacity = 6) {
    const host = await connect(); await accepted(host, { type: 'create', name: 'Host', avatar: 'moon', capacity });
    const party = [host];
    for (let i = 1; i < capacity; i++) {
      const client = await connect();
      await accepted(client, { type: 'join', roomCode: host.view!.code, name: `Guest ${i}`, avatar: 'moth' });
      party.push(client);
    }
    return party;
  }
  const six = () => party(6);
  async function start(party: Client[]) {
    for (const client of party) await accepted(client, { type: 'ready', ready: true, expectedVersion: (await sync(client)).version });
    const command = { type: 'start' as const, actionId: randomUUID(), expectedVersion: (await sync(party[0]!)).version };
    await accepted(party[0]!, command);
    await Promise.all(party.map(sync));
    return command;
  }
  return { connect, send, accepted, sync, six, party, start, server,
    close: async () => { clients.forEach(c => c.socket.disconnect()); await server.close(); } };
}
