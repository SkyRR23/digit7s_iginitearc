import type { RoomView } from '@ashfall/shared';

/** Public match result; never derives allegiance from a private role. */
export function matchResult(view: RoomView): { title: string; description: string; roleArt: string } {
  const outcome = view.day?.outcome;
  if (outcome?.winner === 'SCAPEGOAT') {
    const name = view.players.find(player => player.id === outcome.playerId)?.name ?? 'The condemned player';
    return { title: 'Outcast victory', description: `${name} was condemned by the council. Their secret aim is fulfilled. The match has ended.`, roleArt: 'SCAPEGOAT' };
  }
  return outcome?.winner === 'HUMAN'
    ? { title: 'The village survives', description: 'Every Evil Life card has been revealed.', roleArt: 'VILLAGER' }
    : { title: 'The Ashbound prevail', description: 'Every surviving player is Witch-aligned.', roleArt: 'ASHBOUND' };
}
