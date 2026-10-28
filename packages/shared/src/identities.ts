import { z } from 'zod';
import type { IdentityKind, PrivateIdentityView, PublicDealView, PublicSeal } from './identity-views.js';

/** Pure domain code; import via @ashfall/shared/identities on the server or in tests. */
export interface IdentityCard {
  readonly id: string;
  readonly kind: IdentityKind;
  readonly ownerId: string;
  readonly slot: number;
  readonly revealed: boolean;
}
export interface IdentityParticipant {
  readonly id: string;
  readonly alive: boolean;
  readonly everWitch: boolean;
  readonly acknowledged: boolean;
}
export interface IdentityMatch {
  readonly id: string;
  readonly players: readonly IdentityParticipant[];
  readonly cards: readonly IdentityCard[];
}
export interface IdentityTransfer {
  readonly cardId: string;
  readonly fromId: string;
  readonly toId: string;
  readonly destinationSlot: number;
}
const SetupSchema = z.object({
  players: z.number().int().min(6).max(10), cardsPerPlayer: z.number().int().min(1).max(10),
  humanCards: z.number().int().min(0).max(60), witchCards: z.number().int().min(1).max(60),
  constableCards: z.literal(1),
}).refine(s => s.humanCards + s.witchCards + s.constableCards === s.players * s.cardsPerPlayer,
  'Identity totals must exactly fill every seat.');
export type IdentitySetup = z.infer<typeof SetupSchema>;

/** Caller supplies secure entropy in production and controlled entropy in tests. */
export function dealIdentities(playerIds: readonly string[], setup: IdentitySetup,
  randomIndex: (exclusiveMax: number) => number, nextId: () => string): IdentityMatch {
  const config = SetupSchema.parse(setup);
  if (playerIds.length !== config.players || new Set(playerIds).size !== config.players || playerIds.some(id => !id))
    throw new Error('A deal requires the configured number of distinct seated players.');
  const kinds: IdentityKind[] = [
    ...Array<IdentityKind>(config.humanCards).fill('HUMAN'),
    ...Array<IdentityKind>(config.witchCards).fill('WITCH'),
    ...Array<IdentityKind>(config.constableCards).fill('CONSTABLE'),
  ];
  // Fisher–Yates; randomIndex must be uniform in [0, exclusiveMax).
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error('Invalid shuffle index.');
    [kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!];
  }
  const match: IdentityMatch = {
    id: nextId(),
    players: playerIds.map(id => ({ id, alive: true, everWitch: false, acknowledged: false })),
    // Card IDs are independent of kind and generated AFTER the shuffle.
    cards: kinds.map((kind, i) => ({ id: nextId(), kind,
      ownerId: playerIds[Math.floor(i / config.cardsPerPlayer)]!, slot: i % config.cardsPerPlayer, revealed: false })),
  };
  if (new Set([match.id, ...match.cards.map(c => c.id)]).size !== match.cards.length + 1)
    throw new Error('Match and card identifiers must be unique.');
  return recordWitchHistory(match);
}

/** Monotonic within a match. Call after any future validated ownership transaction. */
export function recordWitchHistory(match: IdentityMatch): IdentityMatch {
  const holders = new Set(match.cards.filter(c => c.kind === 'WITCH').map(c => c.ownerId));
  return { ...match, players: match.players.map(p => ({ ...p, everWitch: p.everWitch || holders.has(p.id) })) };
}

/** Before acknowledgement only: reorder the actor's complete hidden deal. */
export function arrangeIdentities(match: IdentityMatch, actorId: string, cardIds: readonly string[]): IdentityMatch {
  const actor = match.players.find(player => player.id === actorId);
  if (!actor?.alive || actor.acknowledged) throw new Error('Seal positions are already locked.');
  const own = match.cards.filter(card => card.ownerId === actorId && !card.revealed);
  if (own.length !== cardIds.length || new Set(cardIds).size !== own.length || cardIds.some(id => !own.some(card => card.id === id)))
    throw new Error('Arrange only your complete set of hidden Seals.');
  const slots = own.map(card => card.slot).sort((a, b) => a - b);
  return { ...match, cards: match.cards.map(card => card.ownerId === actorId
    ? { ...card, slot: slots[cardIds.indexOf(card.id)]! } : card) };
}

/**
 * Atomically moves unrevealed identities between occupied slots. Every
 * destination must be vacated by another transfer in the same batch, which
 * makes swaps safe and prevents a partial update from duplicating a slot.
 */
export function transferIdentities(match: IdentityMatch, transfers: readonly IdentityTransfer[]): IdentityMatch {
  if (transfers.length < 2) throw new Error('An identity transfer requires an atomic exchange.');
  const players = new Set(match.players.map(player => player.id));
  const cards = new Map(match.cards.map(card => [card.id, card]));
  const movingIds = new Set<string>();
  const sources = new Set<string>();
  const destinations = new Set<string>();
  for (const transfer of transfers) {
    const card = cards.get(transfer.cardId);
    if (!card || card.revealed || card.ownerId !== transfer.fromId)
      throw new Error('Only a card’s current owner can move an unrevealed identity.');
    if (!players.has(transfer.toId) || !Number.isInteger(transfer.destinationSlot) || transfer.destinationSlot < 0)
      throw new Error('Identity transfer destination is invalid.');
    const source = `${transfer.fromId}:${card.slot}`;
    const destination = `${transfer.toId}:${transfer.destinationSlot}`;
    if (movingIds.has(card.id) || sources.has(source) || destinations.has(destination))
      throw new Error('Identity transfers cannot reuse a card or slot.');
    movingIds.add(card.id); sources.add(source); destinations.add(destination);
  }
  if ([...destinations].some(destination => !sources.has(destination)))
    throw new Error('Every transfer destination must be vacated in the same exchange.');
  const byId = new Map(transfers.map(transfer => [transfer.cardId, transfer]));
  const next = {
    ...match,
    cards: match.cards.map(card => {
      const transfer = byId.get(card.id);
      return transfer ? { ...card, ownerId: transfer.toId, slot: transfer.destinationSlot } : card;
    }),
  };
  const locations = next.cards.map(card => `${card.ownerId}:${card.slot}`);
  if (new Set(locations).size !== locations.length) throw new Error('Identity transfer produced duplicate slots.');
  return recordWitchHistory(next);
}

export function hasConstableAbility(match: IdentityMatch, playerId: string): boolean {
  return match.players.some(p => p.id === playerId && p.alive) &&
    match.cards.some(c => c.ownerId === playerId && c.kind === 'CONSTABLE' && !c.revealed);
}

export function acknowledgeIdentities(match: IdentityMatch, playerId: string): IdentityMatch {
  const actor = match.players.find(p => p.id === playerId);
  if (!actor?.alive) throw new Error('Only a living participant can acknowledge their Seals.');
  if (actor.acknowledged) return match;
  return { ...match, players: match.players.map(p => p.id === playerId ? { ...p, acknowledged: true } : p) };
}

/** Public projection has no hidden kinds, hidden card IDs, history, abilities or teams. */
export function publicIdentities(match: IdentityMatch, revealHistoryOnDeath = false): PublicDealView {
  return {
    matchId: match.id,
    players: match.players.map(p => ({
      playerId: p.id, alive: p.alive, acknowledged: p.acknowledged,
      ...(!p.alive && revealHistoryOnDeath ? { historicalWitch: p.everWitch } : {}),
      seals: match.cards.filter(c => c.ownerId === p.id).sort((a, b) => a.slot - b.slot)
        .map((c): PublicSeal => c.revealed ? { slot: c.slot, revealed: true, kind: c.kind } : { slot: c.slot, revealed: false }),
    })),
  };
}

/** Deny by default, including dead players, spectators and unknown viewers. */
export function privateIdentities(match: IdentityMatch, viewerId: string | null): PrivateIdentityView | null {
  const viewer = match.players.find(p => p.id === viewerId);
  if (!viewer?.alive) return null;
  return {
    identities: match.cards.filter(c => c.ownerId === viewer.id && !c.revealed)
      .sort((a, b) => a.slot - b.slot).map(c => ({ id: c.id, slot: c.slot, kind: c.kind })),
    everWitch: viewer.everWitch,
    constableAbility: hasConstableAbility(match, viewer.id),
    witchTeammateIds: viewer.everWitch
      ? match.players.filter(p => p.id !== viewer.id && p.alive && p.everWitch).map(p => p.id) : [],
  };
}
