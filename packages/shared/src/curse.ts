import type { ActionCard } from './day-views.js';
import type { DayState } from './day-model.js';

/** Move the deck's sole Curse into the opening attachment; never mint a card. */
export function attachOpeningCurse(state: DayState, holderId: string): void {
  const piles = [state.deck, state.discard, ...Object.values(state.hands)];
  const cards = piles.flat().filter(card => card.kind === 'CURSE');
  if (cards.length !== 1 || Object.values(state.statuses ?? {}).some(list => list.some(s => s.kind === 'BLACK_CAT' && !s.consumed)))
    throw new Error('The opening requires exactly one existing Curse card.');
  const card = cards[0]!;
  for (const pile of piles) {
    const index = pile.findIndex(item => item.id === card.id);
    if (index >= 0) pile.splice(index, 1);
  }
  ((state.statuses ??= {})[holderId] ??= []).push({kind:'BLACK_CAT', cardId:card.id, sourceId:holderId, duration:'UNTIL_USED', consumed:false});
}

/** All physical locations, excluding consumed status history and private snapshots. */
export function curseInstances(state: DayState): ActionCard[] {
  return [...state.deck, ...state.discard, ...Object.values(state.hands).flat(),
    ...Object.values(state.statuses ?? {}).flat().filter(s => s.kind === 'BLACK_CAT' && !s.consumed && s.cardId)
      .map(s => ({id:s.cardId!,kind:'CURSE' as const}))].filter(card => card.kind === 'CURSE');
}
