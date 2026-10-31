import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import type { ClientEvents, Command, Reply, RoomView, ServerEvents, Session } from '@ashfall/shared';
import { createGameServer } from '../apps/server/src/server.js';
export type Client = { socket: Socket<ServerEvents, ClientEvents>; view?: RoomView; session?: Session; events: RoomView[]; replies: Reply[] };
export type Input = Command extends infer C ? C extends Command ? Omit<C, 'actionId'> & { actionId?: string } : never : never;

export async function createHarness(graceMs = 1000, options: Parameters<typeof createGameServer>[0] = {}) {
  const server = createGameServer({ graceMs, sweepMs: 20, presentations:false, ...options });
  const port = await server.listen(0);
  const clients: Client[] = [];
  const plannedOpenings=new Map<string,Client[]>();
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
    if(input.type==='acknowledgeDeal'&&client.view?.phase==='OPENING_CURSE') {
      const party=plannedOpenings.get(client.view.deal!.matchId);
      if(party){plannedOpenings.delete(client.view.deal!.matchId);await finishOpening(party,party[0]!);}
    }
    return reply;
  }
  async function finishOpening(party:Client[],target=party[0]!){
    await Promise.all(party.map(sync));
    for(const c of party){if(c.view?.blackCatChoice&&!c.view.blackCatChoice.submitted)await accepted(c,{type:'chooseBlackCat',matchId:c.view.deal!.matchId,targetId:target.session!.playerId});}
    await Promise.all(party.map(sync));
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
  async function start(party: Client[], chooseOpening = true) {
    for (const client of party) await accepted(client, { type: 'ready', ready: true, expectedVersion: (await sync(client)).version });
    const command = { type: 'start' as const, actionId: randomUUID(), expectedVersion: (await sync(party[0]!)).version };
    await accepted(party[0]!, command);
    await Promise.all(party.map(sync));
    if(chooseOpening)plannedOpenings.set(party[0]!.view!.deal!.matchId,party);
    return command;
  }
  return { connect, send, accepted, sync, six, party, start, finishOpening, server,
    close: async () => { clients.forEach(c => c.socket.disconnect()); await server.close(); } };
}
