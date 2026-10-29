import { z } from 'zod';
import type { IdentityMatch } from './identities.js';
import type { ActionCard, ActionKind, DayView } from './day-views.js';
import { alive, deny, RuleError, type DayAction, type DayEvent, type DayResult, type DayRules, type DayState } from './day-model.js';
import { advanceTurn, evaluateOutcome, kill, resolveSeal, settle } from './day-resolution.js';
import { hasStatus, resolveCard, validateCardTarget } from './day-cards.js';
export { RuleError } from './day-model.js';
export type { DayAction, DayEvent, DayResult, DayRules, DayState } from './day-model.js';
export { evaluateOutcome } from './day-resolution.js';
export { attachOpeningCurse, curseInstances } from './curse.js';

const configuredKinds: readonly ActionKind[] = ['EVIDENCE','TESTIMONY','CURSE','COUNCIL_BELL','EAVESDROP','WITNESS','ALIBI','STOCKS','ASYLUM','PIETY','DISPEL',
  'MERCY','SCAPEGOAT','VOW_OF_HEARTS','CONSPIRACY'];
const RulesSchema = z.object({
  whisperCards: z.number().int().min(1).max(100), hearthwardCards: z.number().int().min(0).max(100),
  cinderShiftCards: z.number().int().min(0).max(100),
  cardCounts: z.record(z.string(), z.number().int().min(0).max(100))
    .refine(counts => Object.keys(counts).every(kind => configuredKinds.includes(kind as ActionKind)),
      'Configure only the supported expansion cards; legacy card counts have separate fields.')
    .refine(counts => (counts.CURSE ?? 0) <= 1, 'Curse is unique: configure at most one card.').optional(),
  initialHand: z.number().int().min(0).max(10), accusationThreshold: z.literal(7),
  revealHistoryOnDeath: z.boolean(), turnTimeoutMs: z.number().int().positive(), revealTimeoutMs: z.number().int().positive(),
  nightTimeoutMs: z.number().int().positive(), dawnDurationMs: z.number().int().positive(),
});
export function createDay(identity: IdentityMatch, rules: DayRules, randomIndex: (max: number) => number,
  nextId: () => string, now: number): DayResult {
  const config = RulesSchema.parse(rules);
  if (!identity.players.length || !identity.players.every(p => p.acknowledged)) throw new Error('All players must acknowledge before Day.');
  const kinds: ActionKind[] = [...Array<ActionKind>(config.whisperCards).fill('WHISPER'),
    ...Array<ActionKind>(config.hearthwardCards).fill('HEARTHWARD'),
    ...Array<ActionKind>(config.cinderShiftCards).fill('CINDER_SHIFT')];
  for (const [kind, count] of Object.entries(config.cardCounts ?? {}))
    kinds.push(...Array<ActionKind>(count).fill(kind as ActionKind));
  if (kinds.length < config.initialHand * identity.players.length) throw new Error('Action deck cannot fill starting hands.');
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error('Invalid shuffle index.');
    [kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!];
  }
  const deck: ActionCard[] = kinds.map(kind => ({ kind, id: nextId() }));
  if (new Set(deck.map(c => c.id)).size !== deck.length) throw new Error('Action card IDs must be unique.');
  const s: DayState = {
    identity, rules: config, phase: 'DAY', version: 0, turnNumber: 1, dayNumber: 1, night: null, dawn: null,
    activePlayerId: identity.players.find(p => p.alive)!.id, playedThisTurn: false,
    deadline: now + config.turnTimeoutMs, deck, discard: [], hands: {}, doubt: {}, wards: {}, statuses: {}, vows: [],
    privatePeeks: {}, herbalRemedies: {}, reveal: null, outcome: null,
  };
  for (const p of identity.players) {
    s.hands[p.id] = [];
    // Global events are drawn publicly, never trapped in opening hands.
    for (let n=0;n<config.initialHand;n++) {
      const index=s.deck.findIndex(card=>!['CONSPIRACY','CURSE'].includes(card.kind));
      if(index<0) throw new Error('Not enough playable cards for opening hands.');
      s.hands[p.id]!.push(s.deck.splice(index,1)[0]!);
    } s.doubt[p.id] = 0; s.wards[p.id] = false;
    s.statuses![p.id] = []; s.privatePeeks![p.id] = null;
  }
  const events: DayEvent[] = [{ type: 'DAY_STARTED', actorId: s.activePlayerId }];
  settle(s, now, events);
  return { state: s, events };
}

function draw(s: DayState, actorId: string, now: number, events: DayEvent[], randomIndex: (max:number)=>number): void {
  let count=0;
  while(count<2 && s.deck.length && alive(s,actorId)) {
    const card=s.deck.shift()!;
    if(card.kind==='CURSE'&&s.identity.players.some(p=>hasStatus(s,p.id,'BLACK_CAT'))) deny('UNIQUE_CURSE','Curse cannot be drawn while attached.');
    if(card.kind==='CONSPIRACY') {
      resolveCard(s,actorId,card,{targetId:actorId},now,events,randomIndex);
      s.discard.push(card);
      if(evaluateOutcome(s.identity,s.neutralIds)) break;
    } else { s.hands[actorId]!.push(card); count++; }
  }
  events.push({ type: 'DRAW', actorId, count });
  if(!evaluateOutcome(s.identity,s.neutralIds)) advanceTurn(s, now, events);
}

export function applyDayAction(input: DayState, actorId: string, action: DayAction, now: number,
  randomIndex: (max: number) => number = max => Math.floor(Math.random() * max)): DayResult {
  if (action.matchId !== input.identity.id) deny('MATCH_CHANGED', 'That match has ended.');
  if (action.turnNumber !== input.turnNumber || action.gameVersion !== input.version)
    deny('STALE', 'The turn changed. Review the updated table and try again.');
  if (!alive(input, actorId)) deny('NOT_ALIVE', 'Only living players can take game actions.');
  if (input.phase !== 'DAY' && input.phase !== 'REVEAL_RESOLUTION') deny('PHASE', 'Day actions are closed.');
  if (input.deadline !== null && now >= input.deadline) deny('EXPIRED', 'The server deadline has passed.');
  if (actorId !== input.activePlayerId) deny('TURN', 'Wait for your turn.');
  if (input.council?.open) deny('COUNCIL_OPEN','Wait for the Council Bell vote to finish.');
  if (action.type === 'playCards') {
    if (input.phase !== 'DAY') deny('REVEAL_PENDING', 'Choose the accused player’s Seal before continuing.');
    if (!action.cardIds.length || new Set(action.cardIds).size !== action.cardIds.length)
      deny('CARD', 'Choose each card only once.');
    if (action.cardIds.some(id => !input.hands[actorId]!.some(card => card.id === id)))
      deny('CARD', 'Every selected card must be in your hand.');
    let state = input; const events: DayEvent[] = [];
    for (const cardId of action.cardIds) {
      if (state.phase !== 'DAY' || state.council?.open || state.activePlayerId !== actorId) break;
      const card = state.hands[actorId]!.find(item => item.id === cardId)!;
      // A second Ward cannot stack; leave it in the hand while playing the rest.
      if (card.kind === 'HEARTHWARD' && state.wards[action.targetId]) continue;
      const intent: DayAction = { type: 'playCard', cardId, targetId: action.targetId,
        ...(action.secondTargetId ? { secondTargetId: action.secondTargetId } : {}),
        ...(action.protection ? { protection: action.protection } : {}),
        matchId: action.matchId, turnNumber: state.turnNumber, gameVersion: state.version };
      try {
        const result = applyDayAction(state, actorId, intent, now, randomIndex);
        state = result.state; events.push(...result.events);
      } catch (error) {
        // A prior card may have killed the target or consumed the only valid
        // protection. Keep that successful play and the remaining cards in hand.
        if (state !== input && error instanceof RuleError &&
          ['TARGET','SELF_TARGET','STATUS','VOW','SEAL','PROTECTION'].includes(error.code)) break;
        throw error;
      }
    }
    if (state === input) deny('WARD', 'That player already has a Hearthward. Choose a different target.');
    return { state, events };
  }
  const s = structuredClone(input); const events: DayEvent[] = [];
  if (action.type === 'revealSeal') {
    if (s.phase !== 'REVEAL_RESOLUTION' || !s.reveal || s.reveal.chooserId !== actorId)
      deny('PHASE', 'There is no Seal for you to choose now.');
    if (!s.identity.cards.some(c => c.ownerId === s.reveal!.targetId && c.slot === action.slot && !c.revealed))
      deny('SEAL', 'Choose an unrevealed Seal on the accused player.');
    resolveSeal(s, action.slot, now, events);
  } else {
    if (s.phase !== 'DAY') deny('REVEAL_PENDING', 'Choose the accused player’s Seal before continuing.');
    switch (action.type) {
      case 'drawCards':
        if (s.playedThisTurn) deny('TURN_MODE', 'You already played a card. End your turn instead.');
        draw(s, actorId, now, events, randomIndex); break;
      case 'endTurn':
        if (!s.playedThisTurn && s.deck.length) deny('TURN_MODE', 'Draw two cards or play a card before ending your turn.');
        advanceTurn(s, now, events); break;
      case 'playCard': {
        const index = s.hands[actorId]!.findIndex(c => c.id === action.cardId);
        if (index < 0) deny('CARD', 'That card is not in your hand.');
        const card = s.hands[actorId]![index]!;
        validateCardTarget(s, actorId, card, action);
        s.hands[actorId]!.splice(index, 1);
        resolveCard(s, actorId, card, action, now, events, randomIndex);
        if(card.kind!=='COUNCIL_BELL' && !(card.kind==='CURSE'&&Object.values(s.statuses??{}).some(list=>list.some(status=>!status.consumed&&status.cardId===card.id)))) s.discard.push(card); s.playedThisTurn = true;
        break;
      }
      case 'shiftSeal': {
        const index = s.hands[actorId]!.findIndex(c => c.id === action.cardId);
        if (index < 0) deny('CARD', 'That card is not in your hand.');
        const card = s.hands[actorId]![index]!;
        if (card.kind !== 'CINDER_SHIFT') deny('CARD_MODE', 'That card cannot shift Seals.');
        validateCardTarget(s, actorId, card, action);
        s.hands[actorId]!.splice(index, 1);
        resolveCard(s, actorId, card, action, now, events, randomIndex);
        s.discard.push(card); s.playedThisTurn = true;
        break;
      }
    }
  }
  settle(s, now, events); s.version++;
  return { state: s, events };
}

/** Called by the room sweep with authoritative time; no client timeout command. */
export function expireDay(input: DayState, now: number, randomIndex:(max:number)=>number=max=>Math.floor(Math.random()*max)): DayResult | null {
  if (input.deadline === null || now < input.deadline || (input.phase !== 'DAY' && input.phase !== 'REVEAL_RESOLUTION')) return null;
  const s = structuredClone(input); const events: DayEvent[] = [{ type: 'TIMEOUT', actorId: s.activePlayerId }];
  if(s.council?.open) { s.council.open=false; s.deadline=now+s.council.remainingTurnMs; settle(s,now,events); s.version++; return {state:s,events}; }
  if (s.reveal) {
    const first = s.identity.cards.filter(c => c.ownerId === s.reveal!.targetId && !c.revealed).sort((a,b) => a.slot-b.slot)[0]!;
    resolveSeal(s, first.slot, now, events);
  } else if (s.playedThisTurn || !alive(s, s.activePlayerId)) advanceTurn(s, now, events);
  else draw(s, s.activePlayerId, now, events, randomIndex);
  settle(s, now, events); s.version++;
  return { state: s, events };
}

/** Domain hook for future Night/other effects, not a client-selectable action. */
export function eliminatePlayer(input: DayState, targetId: string, now: number): DayResult {
  if (!alive(input, targetId)) deny('TARGET', 'Player is already dead or unknown.');
  if (input.phase === 'GAME_OVER') deny('PHASE', 'The match is over.');
  const s = structuredClone(input); const events: DayEvent[] = [];
  kill(s, targetId, events); settle(s, now, events); s.version++;
  return { state: s, events };
}

/** Server-only forfeits. Simultaneous expirations resolve as one death batch. */
export function forfeitPlayers(input: DayState, ids: string[], now: number): DayResult {
  if (input.phase === 'GAME_OVER') return { state: input, events: [] };
  const s = structuredClone(input); const events: DayEvent[] = [];
  for (const id of new Set(ids)) {
    kill(s, id, events);
    if (s.night) { delete s.night.attacks[id]; delete s.night.protections[id]; }
  }
  settle(s, now, events); s.version++;
  return { state: s, events };
}

export function publicDay(s: DayState): DayView {
  return {
    council:s.council ? {used:s.council.used,open:s.council.open,deadline:s.deadline??s.council.deadline}:undefined,
    dayNumber: s.dayNumber,
    version: s.version, turnNumber: s.turnNumber, activePlayerId: s.activePlayerId,
    playedThisTurn: s.playedThisTurn, deadline: s.deadline,
    deckCount: s.deck.length, discardCount: s.discard.length, accusationThreshold: s.rules.accusationThreshold,
    players: s.identity.players.map(p => ({ playerId: p.id, doubt: s.doubt[p.id]!, ward: s.wards[p.id]!,
      remedy: !!s.herbalRemedies?.[p.id] && !s.herbalRemedies[p.id]!.consumed && s.herbalRemedies[p.id]!.activeDay === s.dayNumber,
      handCount: s.hands[p.id]!.length,
      statuses: (s.statuses?.[p.id] ?? []).filter(status => !status.consumed).map(status => ({kind:status.kind,sourceId:status.sourceId,duration:status.duration,consumed:false})) })),
    vows: (s.vows ?? []).map(vow => ({ ...vow, playerIds: [...vow.playerIds] as [string, string] })),
    reveal: s.reveal ? {chooserId:s.reveal.chooserId,targetId:s.reveal.targetId} : null, outcome: s.outcome ? { ...s.outcome } : null,
  };
}
export function privateHand(s: DayState, viewerId: string | null): ActionCard[] | null {
  return viewerId && alive(s, viewerId) ? s.hands[viewerId]!.map(c => ({ ...c })) : null;
}
