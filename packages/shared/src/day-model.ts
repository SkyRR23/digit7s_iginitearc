import type { IdentityMatch } from './identities.js';
import type { ActionCard, ActionKind, DayIntent, Outcome, PlayerStatus, VowLink, StatusKind } from './day-views.js';
import type { DawnView } from './night-views.js';
export interface DayRules {
  whisperCards: number; hearthwardCards: number; cinderShiftCards: number; initialHand: number;
  cardCounts?: Partial<Record<ActionKind, number>>;
  accusationThreshold: number; revealHistoryOnDeath: boolean;
  turnTimeoutMs: number; revealTimeoutMs: number;
  nightTimeoutMs: number; dawnDurationMs: number;
}
export interface DayState {
  identity: IdentityMatch; rules: DayRules;
  neutralIds?: string[];
  phase: 'DAY' | 'REVEAL_RESOLUTION' | 'NIGHT' | 'DAWN' | 'GAME_OVER';
  dayNumber: number;
  night: { number: number; attacks: Record<string, string | null>; protections: Record<string, string | null>; hexes?: Record<string, string> } | null;
  dawn: DawnView | null;
  version: number; turnNumber: number; activePlayerId: string; playedThisTurn: boolean;
  deadline: number | null;
  deck: ActionCard[]; discard: ActionCard[]; hands: Record<string, ActionCard[]>;
  doubt: Record<string, number>; wards: Record<string, boolean>;
  statuses?: Record<string, PlayerStatus[]>; vows?: VowLink[];
  herbalRemedies?: Record<string, { sourceId: string; activeDay: number; consumed: boolean }>;
  privatePeeks?: Record<string, { id?:string; targetId: string; kind: string; expiresAt: number } | null>;
  privateHands?: Record<string, { targetId: string; cards: ActionCard[]; expiresAt: number; id: string } | null>;
  council?: { used: boolean; open: boolean; deadline: number; remainingTurnMs: number };
  pendingReveals?: { chooserId: string; targetId: string }[];
  reveal: { chooserId: string; targetId: string; remainingTurnMs?: number } | null;
  outcome: Outcome | null;
}
export interface DayEvent {
  type: 'DAY_STARTED' | 'DRAW' | 'PLAY' | 'TRANSFER' | 'BLOCK' | 'ROLE_BLOCK' | 'REVEAL_PENDING' | 'REVEAL' | 'DEATH' | 'TURN' | 'TURN_SKIPPED' | 'NIGHT' | 'DAWN' | 'WIN' | 'TIMEOUT' | 'DOUBT' | 'CLEANSE' | 'STATUS' | 'VOW' | 'CONSPIRACY' | 'PEEK';
  actorId?: string; targetId?: string; cardKind?: ActionCard['kind'];
  slot?: number; count?: number; statusKind?: StatusKind; secondTargetId?: string; blocked?: boolean;
}
export interface DayResult { state: DayState; events: DayEvent[] }
export type DayAction = DayIntent & { matchId: string; turnNumber: number; gameVersion: number };
export class RuleError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export function deny(code: string, message: string): never { throw new RuleError(code, message); }
export const alive = (s: DayState, id: string) => s.identity.players.some(p => p.id === id && p.alive);
