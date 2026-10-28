import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chooseBotDecision, createBotMemory, type BotDecision } from '../apps/server/src/bots.js';
import { createHarness, type Client, type Input } from './socket-harness.js';

let h: Awaited<ReturnType<typeof createHarness>>; let clock: number;
beforeEach(async () => {
  clock = 10_000;
  h = await createHarness(60_000, { now: () => clock, botTickMs: 10, rateLimit: false,
    bots: { fast: true, seed: 991, messages: false } });
});
afterEach(async () => { await h.close(); });

function input(client: Client, decision: BotDecision): Input {
  const actionId = randomUUID(); const view = client.view!;
  if (decision.type === 'acknowledgeDeal') return { type: decision.type, actionId, matchId: view.deal!.matchId };
  if (decision.type === 'councilVote') return { ...decision, actionId, matchId: view.deal!.matchId,
    dayNumber: view.day!.dayNumber } as Input;
  if (decision.type === 'closeSleuth' || decision.type === 'useRole')
    return { ...decision, actionId, matchId: view.deal!.matchId } as Input;
  if (decision.type === 'nightAttack' || decision.type === 'nightProtect')
    return { ...decision, actionId, matchId: view.deal!.matchId, nightNumber: view.night!.nightNumber };
  return { ...decision, actionId, matchId: view.deal!.matchId,
    turnNumber: view.day!.turnNumber, gameVersion: view.day!.version } as Input;
}

describe('mixed human and server bot match', () => {
  it('lets the host expand an open bot lobby to ten seats and fill the new seats', async () => {
    const human = await h.connect();
    await h.accepted(human, { type: 'create', name: 'Ten Seat Host', avatar: 'lantern' });
    await h.accepted(human, { type: 'setCapacity', expectedVersion: human.view!.version, capacity: 10 });
    expect(human.view!.capacity).toBe(10);
    await h.accepted(human, { type: 'fillBots', expectedVersion: human.view!.version, difficulty: 'EASY' });
    expect(human.view!.players).toHaveLength(10);
    expect(human.view!.players.filter(player => player.isBot)).toHaveLength(9);
    await h.accepted(human, { type: 'ready', expectedVersion: human.view!.version, ready: true });
    await h.accepted(human, { type: 'start', expectedVersion: human.view!.version });
    expect(human.view!.deal?.players).toHaveLength(10);
    await h.accepted(human, { type: 'acknowledgeDeal', matchId: human.view!.deal!.matchId });
    h.server.store.tickBots(); await h.sync(human);
    const assigned = [human.view!, ...Array.from({ length: 9 }, (_, index) =>
      h.server.store.simulationView(human.view!.code, index + 1)!)];
    expect(assigned.map(view => view.role?.kind)).toHaveLength(10);
    expect(assigned.filter(view => view.role?.kind === 'HEXER')).toHaveLength(1);
    expect(assigned.filter(view => view.role?.kind === 'SLEUTH')).toHaveLength(1);
    expect(h.server.store.botFailures).toEqual([]);
  });
  it('plays one human with five bots through game over and opens a bot-preserving rematch', async () => {
    const human = await h.connect();
    await h.accepted(human, { type: 'create', name: 'Solo Human', avatar: 'lantern' });
    await h.accepted(human, { type: 'fillBots', expectedVersion: human.view!.version, difficulty: 'NORMAL' });
    expect(human.view!.players).toHaveLength(6);
    expect(human.view!.players.filter(player => player.isBot)).toHaveLength(5);
    expect(human.view!.players.filter(player => player.isBot).every(player => player.ready && player.connected)).toBe(true);
    const removed = human.view!.players.find(player => player.isBot)!;
    await h.accepted(human, { type: 'removeBot', expectedVersion: human.view!.version, botId: removed.id });
    expect(human.view!.players).toHaveLength(5);
    await h.accepted(human, { type: 'addBot', expectedVersion: human.view!.version, difficulty: 'EASY' });
    await h.accepted(human, { type: 'ready', expectedVersion: human.view!.version, ready: true });
    await h.accepted(human, { type: 'start', expectedVersion: human.view!.version });
    await h.accepted(human, { type: 'acknowledgeDeal', matchId: human.view!.deal!.matchId });
    h.server.store.tickBots();
    await h.sync(human);
    expect(human.view!.phase).toBe('DAY');

    const botViews = Array.from({ length: 5 }, (_, index) => h.server.store.simulationView(human.view!.code, index + 1)!);
    const botSecrets = botViews.flatMap(view => view.private!.identities.map(identity => identity.id));
    for (const secret of botSecrets) expect(JSON.stringify(human.view)).not.toContain(secret);

    const memory = createBotMemory(12345);
    for (let transitions = 0; transitions < 20_000 && human.view!.phase !== 'GAME_OVER'; transitions++) {
      const botActions = h.server.store.tickBots();
      await h.sync(human);
      if (human.view!.phase === 'GAME_OVER') break;
      const decision = chooseBotDecision(human.view!, 'NORMAL', memory);
      if (decision) await h.accepted(human, input(human, decision));
      else if (botActions === 0) {
        const status = h.server.store.simulationStatus(human.view!.code)!;
        if (status.deadline === null) throw new Error(`Stuck without a deadline in ${status.phase}`);
        clock = Math.max(clock, status.deadline); h.server.store.sweep();
      }
    }
    await h.sync(human);
    expect(human.view!.phase).toBe('GAME_OVER');
    expect(['HUMAN', 'WITCH']).toContain(human.view!.day!.outcome!.winner);
    expect(h.server.store.botFailures).toEqual([]);

    await h.accepted(human, { type: 'rematch', expectedVersion: human.view!.version });
    expect(human.view!.phase).toBe('LOBBY');
    expect(human.view!.players.filter(player => player.isBot)).toHaveLength(5);
    expect(human.view!.players.filter(player => player.isBot).every(player => player.ready)).toBe(true);
    await h.accepted(human, { type: 'ready', expectedVersion: human.view!.version, ready: true });
    await h.accepted(human, { type: 'start', expectedVersion: human.view!.version });
    await h.accepted(human, { type: 'acknowledgeDeal', matchId: human.view!.deal!.matchId });
    h.server.store.tickBots(); await h.sync(human);
    expect(human.view!.phase).toBe('DAY');
  }, 20_000);

  it('retains bots when the human disconnects and restores the human seat without replacement', async () => {
    const human = await h.connect(); await h.accepted(human, { type: 'create', name: 'Reconnect Human', avatar: 'moon' });
    await h.accepted(human, { type: 'fillBots', expectedVersion: human.view!.version, difficulty: 'EASY' });
    const session = human.session!; human.socket.disconnect();
    await new Promise(resolve => setTimeout(resolve, 30));
    const resumed = await h.connect(); await h.accepted(resumed, { type: 'resume', session });
    expect(resumed.view!.players.filter(player => player.isBot)).toHaveLength(5);
    expect(resumed.view!.players).toHaveLength(6);
    expect(resumed.view!.hostId).toBe(session.playerId);
  });
  it('hands a bot-only lobby back to the next joining human host', async () => {
    const human = await h.connect(); await h.accepted(human, { type: 'create', name: 'Leaving Host', avatar: 'thorn' });
    await h.accepted(human, { type: 'fillBots', expectedVersion: human.view!.version, difficulty: 'NORMAL' });
    const code = human.view!.code;
    await h.accepted(human, { type: 'leave', expectedVersion: human.view!.version });
    const replacement = await h.connect();
    await h.accepted(replacement, { type: 'join', roomCode: code, name: 'New Host', avatar: 'reed' });
    expect(replacement.view!.hostId).toBe(replacement.session!.playerId);
    expect(replacement.view!.players.filter(player => player.isBot)).toHaveLength(5);
  });
  it('cancels delayed bot decisions when the host changes the match state', async () => {
    await h.close();
    h = await createHarness(60_000, { botTickMs: 5, bots: { seed: 7, minDelayMs: 100, maxDelayMs: 100, messages: false } });
    const human = await h.connect(); await h.accepted(human, { type: 'create', name: 'Abort Host', avatar: 'bell' });
    await h.accepted(human, { type: 'fillBots', expectedVersion: human.view!.version, difficulty: 'NORMAL' });
    await h.accepted(human, { type: 'ready', expectedVersion: human.view!.version, ready: true });
    await h.accepted(human, { type: 'start', expectedVersion: human.view!.version });
    await new Promise(resolve => setTimeout(resolve, 25));
    await h.accepted(human, { type: 'reopen', expectedVersion: human.view!.version });
    await new Promise(resolve => setTimeout(resolve, 150)); await h.sync(human);
    expect(human.view!.phase).toBe('LOBBY'); expect(human.view!.deal).toBeNull();
    expect(h.server.store.botFailures).toEqual([]);
  });
});
