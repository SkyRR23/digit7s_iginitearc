import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { canStart, CommandSchema, DisplayName, originalPrototypePreset, referenceSixPlayerFixture } from '@ashfall/shared';

describe('Milestone 1 contracts', () => {
  it('keeps the reference fixture separate from the original proposal', () => {
    expect(referenceSixPlayerFixture.humanCards + referenceSixPlayerFixture.witchCards + referenceSixPlayerFixture.constableCards).toBe(30);
    expect(referenceSixPlayerFixture.accusationThreshold).toBe(7);
    expect(originalPrototypePreset.accusationThreshold).toBe(7);
    expect(originalPrototypePreset.id).not.toBe(referenceSixPlayerFixture.id);
  });
  it('rejects client-specified roles, identity decks, actors, and timestamps', () => {
    const command = { type: 'create', actionId: randomUUID(), name: 'Rowan', avatar: 'moon' };
    for (const field of ['role', 'deck', 'playerId', 'timestamp']) {
      expect(CommandSchema.safeParse({ ...command, [field]: 'forged' }).success).toBe(false);
    }
    expect(CommandSchema.safeParse({ ...command, name: ' ' }).success).toBe(false);
    expect(CommandSchema.safeParse({ ...command, avatar: 'fake' }).success).toBe(false);
  });
  it('accepts only complete, strictly shaped Cinder Shift intents', () => {
    const base = { type: 'shiftSeal', actionId: randomUUID(), matchId: randomUUID(), turnNumber: 1,
      gameVersion: 0, cardId: randomUUID(), targetId: randomUUID(), sourceSlot: 0, targetSlot: 4 };
    expect(CommandSchema.safeParse(base).success).toBe(true);
    expect(CommandSchema.safeParse({ ...base, sourceSlot: -1 }).success).toBe(false);
    expect(CommandSchema.safeParse({ ...base, targetSlot: 10 }).success).toBe(false);
    expect(CommandSchema.safeParse({ ...base, kind: 'WITCH' }).success).toBe(false);
  });
  it('accepts only the supported bot difficulties and rejects injected bot secrets', () => {
    const base = { type: 'addBot', actionId: randomUUID(), expectedVersion: 4, difficulty: 'NORMAL' };
    expect(CommandSchema.safeParse(base).success).toBe(true);
    expect(CommandSchema.safeParse({ ...base, difficulty: 'HARD' }).success).toBe(false);
    expect(CommandSchema.safeParse({ ...base, role: 'WITCH' }).success).toBe(false);
  });
  it('supports visible Unicode names while rejecting control and direction override characters', () => {
    expect(DisplayName.safeParse('မေ').success).toBe(true);
    expect(DisplayName.safeParse('name\n').success).toBe(true); // outer whitespace is trimmed
    expect(DisplayName.safeParse('na\nme').success).toBe(false);
    expect(DisplayName.safeParse('name\u202e').success).toBe(false);
  });
  it('starts only with exactly six connected, ready people', () => {
    const players = Array.from({ length: 6 }, (_, i) => ({ id: `${i}`, name: `Player ${i}`, avatar: 'moon' as const, abandoned: false, ready: true, connected: true, reconnectUntil: null }));
    expect(canStart(players)).toBe(true);
    expect(canStart(players.slice(1))).toBe(false);
    expect(canStart([...players, players[0]!])).toBe(false);
    players[2]!.connected = false;
    expect(canStart(players)).toBe(false);
    players[2]!.connected = true; players[2]!.ready = false;
    expect(canStart(players)).toBe(false);
  });
});
