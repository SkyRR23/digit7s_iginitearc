import type { IdentityMatch } from './identities.js';
import type { Outcome } from './day-views.js';
import { alive, type DayEvent, type DayState } from './day-model.js';

/** Evaluate after an entire death/reveal transaction, never midway through it. */
export function evaluateOutcome(identity: IdentityMatch, neutralIds: readonly string[] = []): Outcome | null {
  const witches = identity.cards.filter(c => c.kind === 'WITCH');
  if (witches.length > 0 && witches.every(c => c.revealed))
    return { winner: 'HUMAN', reason: 'ALL_WITCH_SEALS_REVEALED' };
  const living = identity.players.filter(p => p.alive && !neutralIds.includes(p.id));
  if (living.length > 0 && living.every(p => p.everWitch))
    return { winner: 'WITCH', reason: 'ONLY_WITCHES_ALIVE' };
  return null;
}

export function kill(s: DayState, targetId: string, events: DayEvent[]): void {
  if (!alive(s, targetId)) return;
  s.identity = { ...s.identity,
    cards: s.identity.cards.map(c => c.ownerId === targetId ? { ...c, revealed: true } : c),
    players: s.identity.players.map(p => p.id === targetId ? { ...p, alive: false } : p),
  };
  for(const status of s.statuses?.[targetId]??[]) if(status.kind==='BLACK_CAT'&&!status.consumed&&status.cardId) s.discard.push({id:status.cardId,kind:'CURSE'});
  s.discard.push(...s.hands[targetId]!);
  s.hands[targetId] = []; s.doubt[targetId] = 0; s.wards[targetId] = false;
  if (s.statuses) s.statuses[targetId] = [];
  if (s.herbalRemedies) delete s.herbalRemedies[targetId];
  const vows = s.vows ?? [];
  for (const vow of vows.filter(link => link.playerIds.includes(targetId)))
    events.push({ type: 'VOW', actorId: vow.playerIds[0], targetId: vow.playerIds[1], count: 0 });
  s.vows = vows.filter(link => !link.playerIds.includes(targetId));
  events.push({ type: 'DEATH', targetId });
}

export function advanceTurn(s: DayState, now: number, events: DayEvent[]): void {
  const players = s.identity.players;
  const current = players.findIndex(p => p.id === s.activePlayerId);
  for (let step = 1; step <= players.length * 2; step++) {
    const next = players[(current + step) % players.length]!;
    if (next.alive) {
      const bound = s.statuses?.[next.id]?.find(status => status.kind === 'BOUND' && !status.consumed);
      if (bound) {
        bound.consumed = true; s.turnNumber++;
        events.push({ type: 'TURN_SKIPPED', actorId: next.id });
        events.push({ type: 'STATUS', targetId: next.id, statusKind: 'BOUND', count: 0 });
        continue;
      }
      s.activePlayerId = next.id; s.turnNumber++; s.playedThisTurn = false;
      s.deadline = now + s.rules.turnTimeoutMs;
      events.push({ type: 'TURN', actorId: next.id });
      return;
    }
  }
}

/** Validated caller picks a slot. A death exposes all remaining Seals as one batch. */
export function resolveSeal(s: DayState, slot: number, now: number, events: DayEvent[]): void {
  const pending = s.reveal!;
  const card = s.identity.cards.find(c => c.ownerId === pending.targetId && c.slot === slot && !c.revealed)!;
  s.identity = { ...s.identity, cards: s.identity.cards.map(c => c.id === card.id ? { ...c, revealed: true } : c) };
  s.doubt[pending.targetId] = 0; // Clear the complete accumulation, including overflow.
  events.push({ type: 'REVEAL', actorId: pending.chooserId, targetId: pending.targetId, slot, ...(pending.remainingTurnMs===undefined?{}:{count:7}) });
  if (card.kind === 'WITCH' || !s.identity.cards.some(c => c.ownerId === pending.targetId && !c.revealed))
    kill(s, pending.targetId, events);
  s.reveal = null; s.phase = 'DAY'; s.deadline = now + (pending.remainingTurnMs ?? s.rules.turnTimeoutMs);
  const next=s.pendingReveals?.shift();
  if(next) { s.reveal={...next,remainingTurnMs:pending.remainingTurnMs}; s.phase='REVEAL_RESOLUTION'; s.deadline=now+s.rules.revealTimeoutMs; }
}

export function settle(s: DayState, now: number, events: DayEvent[]): void {
  s.outcome = evaluateOutcome(s.identity, s.neutralIds);
  if (s.outcome) {
    s.phase = 'GAME_OVER'; s.pendingReveals=[]; s.reveal = null; s.deadline = null; s.night = null;
    events.push({ type: 'WIN' }); return;
  }
  if (s.reveal && !alive(s, s.reveal.targetId)) {
    const remaining=s.reveal.remainingTurnMs??s.rules.turnTimeoutMs;
    const next=s.pendingReveals?.shift();
    s.reveal=next?{...next,remainingTurnMs:remaining}:null;
    s.phase=next?'REVEAL_RESOLUTION':'DAY';s.deadline=now+(next?s.rules.revealTimeoutMs:remaining);
    if(next){settle(s,now,events);return;}
  }
  if (s.reveal && !alive(s, s.reveal.chooserId)) {
    const first = s.identity.cards.filter(c => c.ownerId === s.reveal!.targetId && !c.revealed).sort((a,b) => a.slot-b.slot)[0];
    if (first) resolveSeal(s, first.slot, now, events);
    else { s.reveal = null; s.phase = 'DAY'; }
    settle(s, now, events); return;
  }
  if (s.reveal) return; // A pending reveal always finishes before Night.
  if (s.phase === 'DAY' && !alive(s, s.activePlayerId)) advanceTurn(s, now, events);
  if (s.deck.length === 0 && s.phase === 'DAY' && !s.council?.open) {
    s.phase = 'NIGHT'; s.deadline = now + s.rules.nightTimeoutMs;
    s.night = { number: s.dayNumber, attacks: {}, protections: {} }; s.dawn = null;
    events.push({ type: 'NIGHT' });
  }
}
