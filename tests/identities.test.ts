import { describe, expect, it } from 'vitest';
import { originalPrototypePreset, referenceSixPlayerFixture } from '@ashfall/shared';
import { acknowledgeIdentities, arrangeIdentities, dealIdentities, hasConstableAbility, privateIdentities,
  publicIdentities, recordWitchHistory, transferIdentities, type IdentityMatch } from '@ashfall/shared/identities';

const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
function fixture(shuffle = false, seed = 42) {
  let n = 0;
  return dealIdentities(ids, originalPrototypePreset, max => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return shuffle ? Math.floor(seed / 2 ** 32 * max) : max - 1;
  }, () => `fixture-${++n}`);
}
function swapOwners(match: IdentityMatch, leftId: string, rightId: string): IdentityMatch {
  const left = match.cards.find(c => c.id === leftId)!;
  const right = match.cards.find(c => c.id === rightId)!;
  return transferIdentities(match, [
    { cardId: left.id, fromId: left.ownerId, toId: right.ownerId, destinationSlot: right.slot },
    { cardId: right.id, fromId: right.ownerId, toId: left.ownerId, destinationSlot: left.slot },
  ]);
}

describe('identity rules and privacy projections', () => {
  it('allows rearranging only the owner’s hidden deal before acknowledgement', () => {
    const match = fixture(), own = privateIdentities(match, 'a')!.identities;
    const order = own.map(card => card.id).reverse();
    const next = arrangeIdentities(match, 'a', order);
    expect(privateIdentities(next, 'a')!.identities.map(card => card.id)).toEqual(order);
    expect(publicIdentities(next)).toEqual(publicIdentities(match));
    expect(next.cards.filter(card => card.ownerId !== 'a')).toEqual(match.cards.filter(card => card.ownerId !== 'a'));
    expect(() => arrangeIdentities(acknowledgeIdentities(next, 'a'), 'a', order)).toThrow('locked');
    expect(() => arrangeIdentities(match, 'a', [...order.slice(1), match.cards.find(card => card.ownerId === 'b')!.id])).toThrow('your complete');
  });
  it.each([referenceSixPlayerFixture, originalPrototypePreset])('deals the exact $id composition into five ordered slots', setup => {
    let next = 0;
    const match = dealIdentities(ids, setup, max => max - 1, () => `id-${next++}`);
    expect(match.cards).toHaveLength(30);
    expect(match.cards.filter(c => c.kind === 'HUMAN')).toHaveLength(27);
    expect(match.cards.filter(c => c.kind === 'WITCH')).toHaveLength(2);
    expect(match.cards.filter(c => c.kind === 'CONSTABLE')).toHaveLength(1);
    expect(new Set(match.cards.map(c => c.id)).size).toBe(30);
    for (const id of ids) expect(match.cards.filter(c => c.ownerId === id).map(c => c.slot)).toEqual([0, 1, 2, 3, 4]);
    expect(match.cards.every(c => !c.revealed)).toBe(true);
  });
  it('uses injected Fisher–Yates entropy without modifying the setup or losing cards', () => {
    const a = fixture(true, 1); const b = fixture(true, 2);
    expect(a.cards.map(c => c.kind)).not.toEqual(b.cards.map(c => c.kind));
    expect(fixture(true, 1)).toEqual(a);
    expect(originalPrototypePreset.humanCards).toBe(27);
    expect(new Set(a.cards.map(c => c.id)).size).toBe(30);
  });
  it('rejects invalid counts, duplicate seats, unsupported counts, invalid RNG and duplicate IDs', () => {
    let n = 0;
    const id = () => `${n++}`;
    expect(() => dealIdentities(ids, { ...originalPrototypePreset, humanCards: 26 }, () => 0, id)).toThrow();
    expect(() => dealIdentities(['a', 'a', 'c', 'd', 'e', 'f'], originalPrototypePreset, () => 0, id)).toThrow();
    expect(() => dealIdentities(ids.slice(1), originalPrototypePreset, () => 0, id)).toThrow();
    for (const bad of [-1, 100, 0.1, NaN]) expect(() => dealIdentities(ids, originalPrototypePreset, () => bad, id)).toThrow();
    expect(() => dealIdentities(ids, originalPrototypePreset, () => 0, () => 'same')).toThrow();
  });
  it('allows configuration of composition without enabling untested seat-count variants', () => {
    let n = 0;
    const match = dealIdentities(ids, { ...originalPrototypePreset, humanCards: 26, witchCards: 3 }, () => 0, () => `${n++}`);
    expect(match.cards.filter(c => c.kind === 'WITCH')).toHaveLength(3);
  });
  it('persists historical Witch allegiance after every Witch card leaves an owner', () => {
    const initial = fixture(); // f owns both Witches and the Constable.
    const witches = initial.cards.filter(c => c.kind === 'WITCH');
    const first = recordWitchHistory(swapOwners(initial, witches[0]!.id, initial.cards[0]!.id));
    const second = recordWitchHistory(swapOwners(first, witches[1]!.id, initial.cards[5]!.id));
    expect(second.cards.some(c => c.ownerId === 'f' && c.kind === 'WITCH')).toBe(false);
    expect(second.players.filter(p => p.everWitch).map(p => p.id)).toEqual(['a', 'b', 'f']);
    expect(recordWitchHistory(second).players).toEqual(second.players);
    expect(privateIdentities(second, 'f')!.everWitch).toBe(true);
    expect(privateIdentities(second, 'f')!.witchTeammateIds).toEqual(['a', 'b']);
    expect(initial.players.filter(p => p.everWitch).map(p => p.id)).toEqual(['f']);
  });
  it('validates a complete ownership exchange before mutating and never duplicates slots', () => {
    const initial = fixture(); const before = structuredClone(initial);
    const left = initial.cards[0]!; const right = initial.cards[5]!;
    expect(() => transferIdentities(initial, [{ cardId: left.id, fromId: left.ownerId,
      toId: right.ownerId, destinationSlot: right.slot }])).toThrow('atomic exchange');
    expect(() => transferIdentities(initial, [
      { cardId: left.id, fromId: 'forged', toId: right.ownerId, destinationSlot: right.slot },
      { cardId: right.id, fromId: right.ownerId, toId: left.ownerId, destinationSlot: left.slot },
    ])).toThrow('current owner');
    const revealed = { ...initial, cards: initial.cards.map(card => card.id === right.id ? { ...card, revealed: true } : card) };
    expect(() => swapOwners(revealed, left.id, right.id)).toThrow('unrevealed');
    expect(initial).toEqual(before);
    const swapped = swapOwners(initial, left.id, right.id);
    expect(new Set(swapped.cards.map(card => `${card.ownerId}:${card.slot}`)).size).toBe(30);
  });
  it('derives Constable authority from current unrevealed ownership, never from history', () => {
    const initial = fixture();
    const card = initial.cards.find(c => c.kind === 'CONSTABLE')!;
    const changed = recordWitchHistory(swapOwners(initial, card.id, initial.cards[0]!.id));
    expect(hasConstableAbility(initial, 'f')).toBe(true);
    expect(hasConstableAbility(changed, 'f')).toBe(false);
    expect(hasConstableAbility(changed, 'a')).toBe(true);
    expect(changed.players.find(p => p.id === 'a')!.everWitch).toBe(false);
    const revealed = { ...changed, cards: changed.cards.map(c => c.id === card.id ? { ...c, revealed: true } : c) };
    expect(hasConstableAbility(revealed, 'a')).toBe(false);
    const dead = { ...changed, players: changed.players.map(p => p.id === 'a' ? { ...p, alive: false } : p) };
    expect(hasConstableAbility(dead, 'a')).toBe(false);
  });
  it('allows Witch+Constable and two Witch cards on the same player without conflating roles', () => {
    const match = fixture();
    expect(privateIdentities(match, 'f')).toMatchObject({ everWitch: true, constableAbility: true, witchTeammateIds: [] });
    expect(match.players.filter(p => p.everWitch)).toHaveLength(1);
    expect(match.cards.filter(c => c.ownerId === 'f' && c.kind === 'WITCH')).toHaveLength(2);
  });
  it('public output is independent of hidden kinds, roles and viewer, with no hidden IDs', () => {
    const match = fixture(true);
    const changedKinds = { ...match, cards: match.cards.map(c => ({ ...c, kind: 'WITCH' as const })),
      players: match.players.map(p => ({ ...p, everWitch: !p.everWitch })) };
    expect(publicIdentities(match)).toEqual(publicIdentities(changedKinds));
    const wire = JSON.stringify(publicIdentities(match));
    for (const card of match.cards) expect(wire).not.toContain(card.id + '"');
    for (const key of ['kind', 'ownerId', 'everWitch', 'constableAbility', 'witchTeammateIds']) expect(wire).not.toContain(key);
  });
  it('exposes only each living owner’s unrevealed identities and authorized living allies', () => {
    const initial = fixture();
    const witch = initial.cards.find(c => c.kind === 'WITCH')!;
    const match = recordWitchHistory(swapOwners(initial, witch.id, initial.cards[0]!.id));
    for (const id of ids) {
      const own = privateIdentities(match, id)!;
      expect(own.identities.map(c => c.id)).toEqual(match.cards.filter(c => c.ownerId === id).sort((a,b) => a.slot-b.slot).map(c => c.id));
      if (id === 'a') expect(own.witchTeammateIds).toEqual(['f']);
      else if (id === 'f') expect(own.witchTeammateIds).toEqual(['a']);
      else expect(own.witchTeammateIds).toEqual([]);
    }
    const deadAlly = { ...match, players: match.players.map(p => p.id === 'f' ? { ...p, alive: false } : p) };
    expect(privateIdentities(deadAlly, 'a')!.witchTeammateIds).toEqual([]);
    expect(privateIdentities(deadAlly, 'f')).toBeNull();
    expect(privateIdentities(match, null)).toBeNull();
    expect(privateIdentities(match, 'spectator')).toBeNull();
  });
  it('publishes explicitly revealed cards while keeping every other card face down', () => {
    const match = fixture();
    const card = match.cards.find(c => c.kind === 'CONSTABLE')!;
    const revealed = { ...match, cards: match.cards.map(c => c.id === card.id ? { ...c, revealed: true } : c) };
    const publicCards = publicIdentities(revealed).players.flatMap(p => p.seals);
    expect(publicCards.filter(c => c.revealed)).toEqual([{ slot: card.slot, revealed: true, kind: 'CONSTABLE' }]);
    expect(privateIdentities(revealed, card.ownerId)!.identities.some(c => c.id === card.id)).toBe(false);
  });
  it('acknowledgement is immutable and idempotent and denies dead or unknown actors', () => {
    const match = fixture(); const next = acknowledgeIdentities(match, 'a');
    expect(match.players[0]!.acknowledged).toBe(false);
    expect(next.players.filter(p => p.acknowledged).map(p => p.id)).toEqual(['a']);
    expect(acknowledgeIdentities(next, 'a')).toBe(next);
    expect(() => acknowledgeIdentities(match, 'spectator')).toThrow();
    expect(() => acknowledgeIdentities({ ...match, players: match.players.map(p => ({ ...p, alive: false })) }, 'a')).toThrow();
  });
  it('a fresh match resets history and inspection without mutating the previous match', () => {
    const initial = fixture();
    const fresh = fixture(true, 7);
    expect(fresh.players.every(p => p.everWitch === fresh.cards.some(c => c.ownerId === p.id && c.kind === 'WITCH'))).toBe(true);
    expect(fresh.players.every(p => !p.acknowledged)).toBe(true);
    expect(initial.players.find(p => p.id === 'f')!.everWitch).toBe(true);
  });
});
