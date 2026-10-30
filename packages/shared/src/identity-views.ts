/** Wire types only. Internal ownership and shuffle state never belong in RoomView. */
export type IdentityKind = 'HUMAN' | 'WITCH' | 'CONSTABLE';
export const IDENTITY_LABELS: Record<IdentityKind, string> = {
  HUMAN: 'Good', WITCH: 'Evil', CONSTABLE: 'Lanternkeeper',
};
export type PublicSeal = { slot: number; revealed: false } |
  { slot: number; revealed: true; kind: IdentityKind };
export interface PublicDealView {
  matchId: string;
  players: { playerId: string; alive: boolean; acknowledged: boolean; seals: PublicSeal[]; historicalWitch?: boolean }[];
}
export interface PrivateIdentityView {
  identities: { id: string; slot: number; kind: IdentityKind }[];
  everWitch: boolean;
  constableAbility: boolean;
  witchTeammateIds: string[];
}
