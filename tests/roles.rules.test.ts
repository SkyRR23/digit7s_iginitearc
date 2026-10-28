import { describe, expect, it } from 'vitest';
import { originalPrototypePreset } from '@ashfall/shared';
import { dealIdentities } from '@ashfall/shared/identities';
import { applyDayAction, createDay, type DayState } from '@ashfall/shared/day';
import { expireNight, submitNight } from '@ashfall/shared/night';

function fixture(): DayState {
  let n = 0;
  const identity = dealIdentities(['p0','p1','p2','p3','p4','p5'], originalPrototypePreset,
    max => max - 1, () => `id-${n++}`);
  return createDay({ ...identity, players: identity.players.map(p => ({ ...p, acknowledged: true })) },
    originalPrototypePreset, max => max - 1, () => `card-${n++}`, 0).state;
}

describe('special-role protection interactions', () => {
  it('Herbalist remedy blocks one harmful targeted card, but a prior Piety protection takes precedence', () => {
    const s = fixture(); s.herbalRemedies!.p1 = { sourceId: 'p2', activeDay: 1, consumed: false };
    s.hands.p0![0]!.kind = 'EVIDENCE';
    const first = applyDayAction(s, 'p0', { type: 'playCard', cardId: s.hands.p0![0]!.id,
      targetId: 'p1', matchId: s.identity.id, turnNumber: 1, gameVersion: 0 }, 1);
    expect(first.state.doubt.p1).toBe(0);
    expect(first.state.herbalRemedies!.p1!.consumed).toBe(true);
    expect(first.events.some(event => event.type === 'ROLE_BLOCK')).toBe(true);
    const blessed = fixture(); blessed.herbalRemedies!.p1 = { sourceId: 'p2', activeDay: 1, consumed: false };
    blessed.statuses!.p1 = [{ kind: 'PIETY', sourceId: 'p3', duration: 'UNTIL_USED', consumed: false }];
    blessed.hands.p0![0]!.kind = 'EVIDENCE';
    const second = applyDayAction(blessed, 'p0', { type: 'playCard', cardId: blessed.hands.p0![0]!.id,
      targetId: 'p1', matchId: blessed.identity.id, turnNumber: 1, gameVersion: 0 }, 1);
    expect(second.state.herbalRemedies!.p1!.consumed).toBe(false);
    expect(second.events.some(event => event.type === 'ROLE_BLOCK')).toBe(false);
  });

  it('Hexer suppresses the first eligible night protection without a public Hexer event', () => {
    const base = fixture(); base.discard.push(...base.deck.splice(1));
    const night = applyDayAction(base, 'p0', { type: 'drawCards', matchId: base.identity.id,
      turnNumber: 1, gameVersion: 0 }, 1).state;
    night.statuses!.p1 = [{ kind: 'ASYLUM', sourceId: 'p2', duration: 'UNTIL_DAWN', consumed: false }];
    const action = { type: 'nightAttack' as const, targetId: 'p1', matchId: night.identity.id, nightNumber: 1 };
    const voted = submitNight(night, 'p5', action, 2);
    const protectedResult = expireNight(voted, voted.deadline!, max => max - 1)!;
    expect(protectedResult.state.dawn!.deceasedId).toBeNull();
    expect(protectedResult.events.some(event => event.type === 'BLOCK')).toBe(true);
    voted.night!.hexes = { p5: 'p1' };
    const hexedResult = expireNight(voted, voted.deadline!, max => max - 1)!;
    expect(hexedResult.state.dawn!.deceasedId).toBe('p1');
    expect(hexedResult.events.some(event => event.type === 'BLOCK' || event.type === 'ROLE_BLOCK')).toBe(false);
    expect(JSON.stringify(hexedResult.events)).not.toContain('HEXER');
  });
});
