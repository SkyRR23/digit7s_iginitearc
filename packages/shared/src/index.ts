import { z } from 'zod';
import type { PrivateIdentityView, PublicDealView } from './identity-views.js';
import type { ActionCard, DayView } from './day-views.js';
import type { DawnView, PrivateNightView } from './night-views.js';
export type { DawnView, PrivateNightView, NightIntent } from './night-views.js';
export type { ActionKind, ActionCard, DayView, DayIntent, Outcome, PlayerStatus, StatusKind, ProtectionKind, VowLink } from './day-views.js';
export { IDENTITY_LABELS } from './identity-views.js';
export type { IdentityKind, PrivateIdentityView, PublicDealView, PublicSeal } from './identity-views.js';
export { deriveVoicePermissions } from './voice.js';
export type { VoiceChannel, VoiceClient, VoicePermission, VoicePolicyContext, VoicePhase, VoiceService } from './voice.js';

export const AVATARS = ['lantern', 'moth', 'reed', 'thorn', 'bell', 'moon'] as const;
export type Avatar = typeof AVATARS[number];
export const BOT_DIFFICULTIES = ['EASY', 'NORMAL'] as const;
export type BotDifficulty = typeof BOT_DIFFICULTIES[number];
export { cardRequiresOtherPlayer } from './card-targeting.js';
export { PRESENTATION_DURATION, REVEAL_STAGES, publicPresentationPlan } from './presentation.js';
export type { PublicMomentStep, PublicMomentKind, PresentationEvent } from './presentation.js';
export type SpecialRole = 'VILLAGER' | 'ASHBOUND' | 'SLEUTH' | 'HERBALIST' | 'GOSSIP' | 'HEXER' | 'SCAPEGOAT';
export interface PrivateRoleView {
  kind: SpecialRole;
  ability: 'AVAILABLE' | 'ACTIVE' | 'USED' | 'UNAVAILABLE';
  result: string | null;
  peek: { targetId: string; expiresAt: number; exposed: boolean } | null;
  notices: string[];
  individualWin: boolean;
}
export const SEATS = 6;
export const MAX_SEATS = 10;
export const RECONNECT_GRACE_MS = 60_000;
export const RoomCode = z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{8}$/);
export const DisplayName = z.string().trim().min(1).max(24)
  .refine(value => !/[\p{Cc}\p{Cf}]/u.test(value), 'Use visible characters only.');
const actionId = z.string().uuid();
const expectedVersion = z.number().int().nonnegative();
const gameContext = { actionId, matchId: z.string().uuid(), turnNumber: z.number().int().positive(), gameVersion: z.number().int().nonnegative() };
const nightContext = { actionId, matchId: z.string().uuid(), nightNumber: z.number().int().positive(), targetId: z.string().uuid().nullable() };
const profile = { name: DisplayName, avatar: z.enum(AVATARS) };
export const SessionSchema = z.object({
  roomCode: RoomCode, playerId: z.string().uuid(), token: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type Session = z.infer<typeof SessionSchema>;
export const CommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create'), actionId, ...profile, capacity: z.number().int().min(6).max(10).optional() }).strict(),
  z.object({ type: z.literal('join'), actionId, roomCode: RoomCode, ...profile }).strict(),
  z.object({ type: z.literal('resume'), actionId, session: SessionSchema }).strict(),
  z.object({ type: z.literal('ready'), actionId, expectedVersion, ready: z.boolean() }).strict(),
  z.object({ type: z.literal('start'), actionId, expectedVersion }).strict(),
  z.object({ type: z.literal('reopen'), actionId, expectedVersion }).strict(),
  z.object({ type: z.literal('rematch'), actionId, expectedVersion }).strict(),
  z.object({ type: z.literal('addBot'), actionId, expectedVersion, difficulty: z.enum(BOT_DIFFICULTIES) }).strict(),
  z.object({ type: z.literal('removeBot'), actionId, expectedVersion, botId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('fillBots'), actionId, expectedVersion, difficulty: z.enum(BOT_DIFFICULTIES) }).strict(),
  z.object({ type: z.literal('setCapacity'), actionId, expectedVersion, capacity: z.number().int().min(6).max(10) }).strict(),
  z.object({ type: z.literal('setScapegoat'), actionId, expectedVersion, enabled: z.boolean() }).strict(),
  z.object({ type: z.literal('acknowledgeDeal'), actionId, matchId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('chooseBlackCat'), actionId, matchId: z.string().uuid(), targetId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('arrangeSeals'), actionId, matchId: z.string().uuid(), cardIds: z.array(z.string().uuid()).min(1).max(10) }).strict(),
  z.object({ type: z.literal('leave'), actionId, expectedVersion }).strict(),
  z.object({ type: z.literal('chat'), actionId, text: z.string().trim().min(1).max(240)
    .refine(value => !/[\p{Cc}\p{Cf}]/u.test(value), 'Use visible characters only.') }).strict(),
  z.object({ type: z.literal('sync'), actionId }).strict(),
  z.object({ type: z.literal('finishPresentation'), actionId, matchId:z.string().uuid(), presentationId:z.string().uuid() }).strict(),
  z.object({ type: z.literal('drawCards'), ...gameContext }).strict(),
  z.object({ type: z.literal('endTurn'), ...gameContext }).strict(),
  z.object({ type: z.literal('playCard'), ...gameContext, cardId: z.string().uuid(), targetId: z.string().uuid(),
    secondTargetId: z.string().uuid().optional(), protection: z.enum(['HEARTHWARD','PIETY','ASYLUM','VOW_OF_HEARTS','BLACK_CAT']).optional() }).strict(),
  z.object({ type: z.literal('playCards'), ...gameContext, cardIds: z.array(z.string().uuid()).min(1).max(100), targetId: z.string().uuid(),
    secondTargetId: z.string().uuid().optional(), protection: z.enum(['HEARTHWARD','PIETY','ASYLUM','VOW_OF_HEARTS','BLACK_CAT']).optional(),
    sourceSlot: z.number().int().min(0).max(9).optional(), targetSlot: z.number().int().min(0).max(9).optional() }).strict(),
  z.object({ type: z.literal('shiftSeal'), ...gameContext, cardId: z.string().uuid(), targetId: z.string().uuid(),
    sourceSlot: z.number().int().min(0).max(9), targetSlot: z.number().int().min(0).max(9) }).strict(),
  z.object({ type: z.literal('revealSeal'), ...gameContext, slot: z.number().int().min(0).max(9) }).strict(),
  z.object({ type: z.literal('nightAttack'), ...nightContext }).strict(),
  z.object({ type: z.literal('nightProtect'), ...nightContext }).strict(),
  z.object({ type: z.literal('useRole'), actionId, matchId: z.string().uuid(), targetId: z.string().uuid(), secondTargetId: z.string().uuid().optional() }).strict(),
  z.object({ type: z.literal('closeSleuth'), actionId, matchId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('councilVote'), actionId, matchId: z.string().uuid(), dayNumber: z.number().int().positive(), targetId: z.string().uuid() }).strict(),
]);
export type Command = z.infer<typeof CommandSchema>;
export interface PublicPlayer {
  abandoned: boolean;
  id: string; name: string; avatar: Avatar; ready: boolean; connected: boolean;
  isBot: boolean; botDifficulty: BotDifficulty | null;
  reconnectUntil: number | null;
}
export interface FeedEntry { id: string; kind: 'system' | 'chat'; text: string; name?: string }
export interface TableEffect {
  id: string; type: 'PLAY' | 'DRAW' | 'DEATH' | 'REVEAL' | 'REVEAL_PENDING' | 'NIGHT' | 'DAWN' | 'DOUBT' | 'CLEANSE' | 'STATUS' | 'VOW' | 'CONSPIRACY' | 'TRANSFER' | 'BLOCK' | 'ROLE_BLOCK' | 'VOTE_VICTORY' | 'TURN_SKIPPED';
  actorId?: string; targetId?: string; secondTargetId?: string; cardKind?: ActionCard['kind']; count?: number; slot?: number;
  statusKind?: import('./day-views.js').StatusKind; blocked?: boolean;
}
export interface RoomView {
  effects?: TableEffect[];
  code: string; version: number; privateVersion: number; phase: 'LOBBY' | 'PRIVATE_DEAL' | 'DAY' | 'REVEAL_RESOLUTION' | 'NIGHT' | 'DAWN' | 'GAME_OVER'; hostId: string;
  capacity: number; players: PublicPlayer[]; feed: FeedEntry[];
  scapegoatEnabled?: boolean;
  blackCatChoice?: { submitted: boolean; targetId: string | null } | null;
  presentation?: { id:string; scope:'PUBLIC'|'PRIVATE'|'WAIT'; until:number; remainingMs:number|null; awaitingYou:boolean;
    previousPhase?:RoomView['phase']; events?:TableEffect[]; privateAction?:{kind:SpecialRole;targetIds:string[]} } | null;
  councilVote?: { dayNumber: number; votesCast: number; required: number; yourTargetId: string | null; completed: boolean } | null;
  you: { playerId: string } | null;
  deal: PublicDealView | null;
  private: PrivateIdentityView | null;
  role?: PrivateRoleView | null;
  day: DayView | null;
  hand: ActionCard[] | null;
  night: PrivateNightView | null;
  peek?: { id?:string; targetId: string; kind: string; expiresAt: number } | null;
  dawn: DawnView | null;
  personalResult: 'WIN' | 'LOSS' | null;
}
export type Reply = { ok: true; view?: RoomView; session?: Session } |
  { ok: false; code: string; message: string };
export interface ServerEvents { state: (view: RoomView) => void; replaced: () => void }
export interface ClientEvents { command: (command: Command, ack: (reply: Reply) => void) => void }

export function canStart(players: readonly PublicPlayer[], capacity = SEATS): boolean {
  return players.length === capacity && players.every(p => p.connected && p.ready && !p.abandoned);
}

// Separate presets. Only the six-player variant is enabled and tested.
export const referenceSixPlayerFixture = Object.freeze({
  id: 'reference-second-edition-6', players: 6, cardsPerPlayer: 5,
  humanCards: 27, witchCards: 2, constableCards: 1, accusationThreshold: 7,
});
export const originalPrototypePreset = Object.freeze({
  ...referenceSixPlayerFixture, id: 'ashfall-v03-pressure', accusationThreshold: 7,
  revealHistoryOnDeath: true, nightTimeoutMs: 45_000, dawnDurationMs: 5_000,
  whisperCards: 6, hearthwardCards: 3, cinderShiftCards: 2, initialHand: 3,
  cardCounts: { EVIDENCE: 38, WITNESS: 6, ALIBI: 6, STOCKS: 3, ASYLUM: 3, PIETY: 3,
    CURSE: 3, MERCY: 4, SCAPEGOAT: 3, VOW_OF_HEARTS: 2, CONSPIRACY: 1 },
  turnTimeoutMs: 60_000, revealTimeoutMs: 30_000,
});
