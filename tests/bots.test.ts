import { describe, expect, it } from 'vitest';
import type { RoomView } from '@ashfall/shared';
import { botMessage, chooseBotDecision, createBotMemory, enumerateLegalBotActions } from '../apps/server/src/bots.js';

function dayView(): RoomView {
  const ids = Array.from({ length: 6 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
  return {
    code: 'ABCDEFGH', version: 1, privateVersion: 0, phase: 'DAY', hostId: ids[0]!, capacity: 6,
    players: ids.map((id, index) => ({ id, name: `P${index}`, avatar: 'moon', ready: true, connected: true,
      abandoned: false, reconnectUntil: null, isBot: true, botDifficulty: 'NORMAL' })),
    feed: [], you: { playerId: ids[0]! }, personalResult: null, dawn: null, night: null,
    deal: { matchId: '10000000-0000-4000-8000-000000000000', players: ids.map(id => ({ playerId: id,
      alive: true, acknowledged: true, seals: Array.from({ length: 5 }, (_, slot) => ({ slot, revealed: false as const })) })) },
    private: { identities: [{ id: '20000000-0000-4000-8000-000000000000', slot: 0, kind: 'WITCH' }],
      everWitch: true, constableAbility: false, witchTeammateIds: [ids[1]!] },
    hand: [
      { id: '30000000-0000-4000-8000-000000000000', kind: 'WHISPER' },
      { id: '30000000-0000-4000-8000-000000000001', kind: 'HEARTHWARD' },
      { id: '30000000-0000-4000-8000-000000000002', kind: 'CINDER_SHIFT' },
    ],
    day: { dayNumber: 1, version: 0, turnNumber: 1, activePlayerId: ids[0]!, playedThisTurn: false,
      deadline: 60_000, deckCount: 65, discardCount: 0, accusationThreshold: 7, reveal: null, outcome: null,
      players: ids.map((playerId, index) => ({ playerId, doubt: index, ward: index === 2, handCount: 3 })) },
  };
}

describe('restricted bot policy', () => {
  it('participates in a day-two council vote and lets a Scapegoat seek its vote-only win', () => {
    const view = dayView();
    view.day!.dayNumber = 2; view.day!.activePlayerId = view.players[1]!.id;
    view.day!.council={open:true,used:true,deadline:30000};
    view.councilVote = { dayNumber: 2, votesCast: 0, required: 4, yourTargetId: null, completed: false };
    view.role = { kind: 'SCAPEGOAT', ability: 'UNAVAILABLE', result: null, peek: null, notices: [], individualWin: false };
    expect(enumerateLegalBotActions(view).every(action => action.type === 'councilVote')).toBe(true);
    expect(chooseBotDecision(view, 'NORMAL', createBotMemory(7))).toMatchObject({ type: 'councilVote', targetId: view.you!.playerId });
    view.councilVote.completed = true;
    expect(enumerateLegalBotActions(view)).toEqual([]);
  });
  it('enumerates only actions legal from public and owner-authorized fields', () => {
    const view = dayView(); const legal = enumerateLegalBotActions(view);
    expect(legal.some(action => action.type === 'drawCards')).toBe(true);
    expect(legal.some(action => action.type === 'playCard' && action.targetId === view.you!.playerId)).toBe(false);
    expect(legal.some(action => action.type === 'playCard' && action.cardId === view.hand![0]!.id && action.targetId === view.you!.playerId)).toBe(false);
    expect(legal.some(action => action.type === 'playCard' && action.cardId === view.hand![1]!.id && action.targetId === view.players[2]!.id)).toBe(false);
    expect(legal.some(action => action.type === 'playCard' && action.cardId === view.hand![2]!.id)).toBe(true);
    expect(JSON.stringify(legal)).not.toContain('kind');
  });
  it('is reproducible and Normal Witch strategy avoids Whispering known teammates', () => {
    const a = createBotMemory(77); const b = createBotMemory(77); const view = dayView();
    const first = chooseBotDecision(view, 'NORMAL', a); const second = chooseBotDecision(view, 'NORMAL', b);
    expect(first).toEqual(second);
    if (first?.type === 'playCard' && first.cardId === view.hand![0]!.id)
      expect(first.targetId).not.toBe(view.private!.witchTeammateIds[0]);
  });
  it('exposes only pending authorized Night abilities', () => {
    const view = dayView(); view.phase = 'NIGHT'; view.day!.activePlayerId = view.players[3]!.id;
    view.night = { nightNumber: 1, attack: { submitted: false, targetId: null }, protection: { submitted: false, targetId: null } };
    const legal = enumerateLegalBotActions(view);
    expect(legal.some(action => action.type === 'nightAttack')).toBe(true);
    expect(legal.some(action => action.type === 'nightProtect')).toBe(true);
    expect(legal.some(action => action.type === 'nightAttack' && action.targetId === view.private!.witchTeammateIds[0])).toBe(false);
    view.night.attack!.submitted = true;
    expect(enumerateLegalBotActions(view).every(action => action.type === 'nightProtect')).toBe(true);
  });
  it('rate-limits original public messages without exposing private card data', () => {
    const view = dayView(); const memory = createBotMemory(9); let message: string | null = null; let now = 10_000;
    for (let attempt = 0; attempt < 100 && !message; attempt++, now += 9_000)
      message = botMessage(view, { type: 'drawCards' }, memory, now);
    expect(message).not.toBeNull();
    expect(message).not.toContain(view.private!.identities[0]!.id);
    expect(message).not.toContain('WITCH');
    expect(botMessage(view, { type: 'drawCards' }, memory, now)).toBeNull();
  });
});
