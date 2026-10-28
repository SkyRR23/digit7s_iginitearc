import { randomInt, randomUUID } from 'node:crypto';
import { originalPrototypePreset } from '@ashfall/shared';
import { dealIdentities } from '@ashfall/shared/identities';

/** Only the server chooses the preset, shuffle entropy and card/match IDs. */
export function createIdentityDeal(playerIds: readonly string[]) {
  const witchCards = playerIds.length >= 8 ? 3 : 2;
  return dealIdentities(playerIds, { ...originalPrototypePreset, players: playerIds.length,
    humanCards: playerIds.length * 5 - witchCards - 1, witchCards }, randomInt, randomUUID);
}
