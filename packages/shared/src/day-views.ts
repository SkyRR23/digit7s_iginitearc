export type ActionKind = 'EVIDENCE' | 'TESTIMONY' | 'WITNESS' | 'ALIBI' | 'STOCKS' | 'ASYLUM' | 'PIETY' | 'DISPEL' | 'CURSE' | 'COUNCIL_BELL' | 'EAVESDROP' | 'MERCY' | 'SCAPEGOAT' | 'VOW_OF_HEARTS' | 'CONSPIRACY' | 'WHISPER' | 'HEARTHWARD' | 'CINDER_SHIFT';
export interface ActionCard { id: string; kind: ActionKind }
export type ProtectionKind = 'HEARTHWARD' | 'PIETY' | 'ASYLUM' | 'VOW_OF_HEARTS' | 'BLACK_CAT';
export type StatusKind = 'BOUND' | 'ASYLUM' | 'PIETY' | 'HEARTHWARD' | 'VOW_HEART' | 'BLACK_CAT';
export interface PlayerStatus { kind: StatusKind; sourceId: string; duration: 'NEXT_TURN' | 'UNTIL_DAWN' | 'UNTIL_USED'; consumed: boolean; cardId?: string }
export interface VowLink { playerIds: [string, string]; sourceId: string }
export type Outcome = { winner: 'HUMAN' | 'WITCH'; reason: 'ALL_WITCH_SEALS_REVEALED' | 'ONLY_WITCHES_ALIVE' }
  | { winner: 'SCAPEGOAT'; reason: 'COUNCIL_VOTE'; playerId: string };
export interface DayView {
  council?: { open: boolean; used: boolean; deadline: number };
  dayNumber: number;
  version: number; turnNumber: number; activePlayerId: string;
  playedThisTurn: boolean; deadline: number | null;
  deckCount: number; discardCount: number; accusationThreshold: number;
  players: { playerId: string; doubt: number; ward: boolean; remedy?: boolean; handCount: number; statuses?: PlayerStatus[] }[];
  vows?: VowLink[];
  reveal: { chooserId: string; targetId: string } | null;
  outcome: Outcome | null;
}
export type DayIntent = { type: 'drawCards' } | { type: 'endTurn' } |
  { type: 'playCards'; cardIds: string[]; targetId: string; secondTargetId?: string; protection?: ProtectionKind; sourceSlot?: number; targetSlot?: number } |
  { type: 'playCard'; cardId: string; targetId: string; secondTargetId?: string; protection?: ProtectionKind } |
  { type: 'shiftSeal'; cardId: string; targetId: string; sourceSlot: number; targetSlot: number } |
  { type: 'revealSeal'; slot: number };
