import { randomInt, randomUUID } from 'node:crypto';
import { IDENTITY_LABELS, originalPrototypePreset } from '@ashfall/shared';
import { createDay, type DayEvent, type DayResult, type DayState } from '@ashfall/shared/day';
import type { IdentityMatch } from '@ashfall/shared/identities';

export type DayFactory = (identity: IdentityMatch, now: number) => DayResult;
export const createServerDay: DayFactory = (identity, now) =>
  createDay(identity, originalPrototypePreset, randomInt, randomUUID, now);

/** Only describe public transitions. Never print hands, card IDs or deck order. */
export function describeDayEvent(event: DayEvent, state: DayState, name: (id: string) => string): string {
  const actor = event.actorId ? name(event.actorId) : '';
  const target = event.targetId ? name(event.targetId) : '';
  switch (event.type) {
    case 'DAY_STARTED': return `Day ${state.dayNumber} begins. ${actor} takes the first turn. ${state.dayNumber === 1 ? 'Starting hands have been dealt.' : 'Unused cards stay in your hand; only the discard pile was shuffled into the draw pile.'}`;
    case 'DRAW': return `${actor} drew ${event.count} action cards and ended their turn.`;
    case 'PLAY': if(event.cardKind==='COUNCIL_BELL')return `${actor} rang the Council Bell. Hear ye, hear ye! Voting is open for 30 seconds.`; return event.cardKind === 'CONSPIRACY' ? '' : `${actor} played ${event.cardKind?.replaceAll('_', ' ').toLowerCase()}${event.secondTargetId ? ` between ${target} and ${name(event.secondTargetId)}` : ` on ${target}`}.`;
    case 'TRANSFER': return `The cinders shifted between ${actor} and ${target}.`;
    case 'BLOCK': return `${target} was protected by ${event.statusKind === 'ASYLUM' ? 'Asylum' : event.cardKind === 'WHISPER' ? 'Hearthward' : 'Piety'}.`;
    case 'ROLE_BLOCK': return `${target} was protected from a harmful effect.`;
    case 'DOUBT': return `${target} gained ${event.count} Doubt.`;
    case 'CLEANSE': return `${target} lost ${event.count} Doubt.`;
    case 'STATUS': return event.statusKind === 'BLACK_CAT' ? `${target}${event.count ? ' carries the Curse. Conspiracy will reveal one of their hidden Life cards.' : ' is free of the Curse.'}`
      : event.statusKind === 'VOW_HEART' ? `${target}'s Heart ${event.count ? 'awaits another' : 'has faded'}.`
      : event.statusKind ? `${target} is ${event.count ? `under ${event.statusKind.toLowerCase()}` : `free of ${event.statusKind.toLowerCase()}`}.` : '';
    case 'VOW': return event.cardKind ? `Shared suspicion carried one Doubt from ${actor} to ${target}.`
      : event.count ? `${actor} and ${target} are bound by a Vow of Hearts.` : `${actor} and ${target} are no longer bound by their Vow.`;
    case 'CONSPIRACY': return 'A conspiracy shifted the council’s hidden lives.';
    case 'PEEK': return event.cardKind==='EAVESDROP'?`${actor} inspected ${target}?s playable hand privately.`:`${actor} whispered near ${target}.`;
    case 'REVEAL_PENDING': return `${target} reached seven Doubt. The accuser has 10 seconds to choose a hidden Life card.`;
    case 'REVEAL': {
      const card = state.identity.cards.find(c => c.ownerId === event.targetId && c.slot === event.slot)!;
      return `${target}’s Seal ${event.slot! + 1} was revealed: ${IDENTITY_LABELS[card.kind]}.`;
    }
    case 'DEATH': return `${target} died. Their remaining Seals are now public.`;
    case 'TURN': return `${actor} takes the next turn.`;
    case 'TURN_SKIPPED': return `${actor}’s turn was skipped — Bound.`;
    case 'NIGHT': return 'Night has arrived. The council is silent; eligible players may seal their secret choices before the deadline.';
    case 'DAWN': return state.dawn?.deceasedId
      ? `Dawn arrives. ${name(state.dawn.deceasedId)} did not survive the night.`
      : 'Dawn arrives. No one died tonight.';
    case 'VOTE_VICTORY': return ''; // WIN publishes the completed verdict once.
    case 'WIN': return state.outcome!.winner === 'SCAPEGOAT' ? `${name(state.outcome!.playerId)} wins as the Outcast. The match has ended.` : state.outcome!.winner === 'HUMAN'
      ? 'The village wins: every Evil Life card has been revealed.' : 'The Ashbound win: every living player is Witch-aligned.';
    case 'TIMEOUT': return `${actor}’s server deadline expired. The default action was resolved.`;
  }
}
