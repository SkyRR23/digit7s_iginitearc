import { hasConstableAbility } from './identities.js';
import { alive, deny, type DayState, type DayResult, type DayEvent } from './day-model.js';
import { hasStatus, removeStatus } from './day-cards.js';
import { evaluateOutcome, kill, advanceTurn } from './day-resolution.js';
import type { NightIntent, PrivateNightView } from './night-views.js';

export type NightAction = NightIntent & { matchId: string; nightNumber: number };

/** Secret input never changes public revisions, deadlines, or submission counts. */
export function submitNight(input: DayState, actorId: string, action: NightAction, now: number): DayState {
  if (action.matchId !== input.identity.id) deny('MATCH_CHANGED', 'That match has ended.');
  if (input.phase !== 'NIGHT' || !input.night) deny('PHASE', 'Night choices are closed.');
  if (action.nightNumber !== input.night.number) deny('STALE', 'That night has ended.');
  if (now >= input.deadline!) deny('EXPIRED', 'The night deadline has passed.');
  const actor = input.identity.players.find(p => p.id === actorId);
  if (!actor?.alive) deny('NOT_ALIVE', 'Only living players can choose at night.');
  const attack = action.type === 'nightAttack';
  if (attack ? !actor.everWitch || input.neutralIds?.includes(actorId) : !hasConstableAbility(input.identity, actorId))
    deny('ABILITY', 'You do not have that night ability.');
  if (action.targetId !== null) {
    if (action.targetId === actorId) deny('SELF_TARGET', 'Choose another living player.');
    if (!alive(input, action.targetId)) deny('TARGET', 'Choose a living player.');
    if (attack && input.identity.players.find(p => p.id === action.targetId)!.everWitch && !input.neutralIds?.includes(action.targetId))
      deny('ALLY_TARGET', 'Cultist attacks must target someone outside your team.');
  }
  const choices = attack ? input.night.attacks : input.night.protections;
  if (Object.hasOwn(choices, actorId)) deny('LOCKED_CHOICE', 'Your choice is already sealed for this night.');
  const next = structuredClone(input);
  (attack ? next.night!.attacks : next.night!.protections)[actorId] = action.targetId;
  return next;
}

export function privateNight(s: DayState, viewerId: string | null): PrivateNightView | null {
  if (!viewerId || s.phase !== 'NIGHT' || !s.night) return null;
  const player = s.identity.players.find(p => p.id === viewerId && p.alive);
  if (!player) return null;
  const choice = (values: Record<string, string | null>) => ({
    submitted: Object.hasOwn(values, viewerId), targetId: values[viewerId] ?? null,
  });
  const attack = player.everWitch && !s.neutralIds?.includes(viewerId) ? choice(s.night.attacks) : null;
  const protection = hasConstableAbility(s.identity, viewerId) ? choice(s.night.protections) : null;
  return attack || protection ? { nightNumber: s.night.number, attack, protection } : null;
}

/** Fixed deadline, even when everyone submitted: no role/count timing side channel. */
export function expireNight(input: DayState, now: number, randomIndex: (max: number) => number): DayResult | null {
  if (input.deadline === null || now < input.deadline) return null;
  if (input.phase === 'DAWN') return nextDay(input, now, randomIndex);
  if (input.phase !== 'NIGHT' || !input.night) return null;
  const s = structuredClone(input); const events: DayEvent[] = [];
  const votes = new Map<string, number>();
  for (const voter of s.identity.players.filter(p => p.alive && p.everWitch && !s.neutralIds?.includes(p.id))) {
    const target = s.night!.attacks[voter.id];
    if (target && s.identity.players.some(p => p.id === target && p.alive && (!p.everWitch || s.neutralIds?.includes(p.id))))
      votes.set(target, (votes.get(target) ?? 0) + 1);
  }
  // Strictly greater preserves earliest seat on a tie, independent of arrival order.
  let target: string | null = null; let highest = 0;
  for (const p of s.identity.players) {
    const count = votes.get(p.id) ?? 0;
    if (count > highest) { highest = count; target = p.id; }
  }
  const protectedIds = new Set<string>();
  for (const p of s.identity.players) {
    const protectedId = s.night!.protections[p.id];
    if (hasConstableAbility(s.identity, p.id) && protectedId && protectedId !== p.id && alive(s, protectedId))
      protectedIds.add(protectedId);
  }
  // Hexing suppresses one active, non-passive protection for this night only.
  const hexCount = target ? Object.values(s.night!.hexes ?? {}).filter(id => id === target).length : 0;
  const suppressAsylum = hexCount > 0 && !!target && hasStatus(s, target, 'ASYLUM');
  const remedy = target ? s.herbalRemedies?.[target] : undefined;
  const suppressRemedy = hexCount > (suppressAsylum ? 1 : 0) && !!remedy && !remedy.consumed && remedy.activeDay === s.dayNumber;
  if (target && hasStatus(s, target, 'ASYLUM') && !suppressAsylum) {
    removeStatus(s, target, 'ASYLUM', events);
    events.push({ type: 'BLOCK', targetId: target, statusKind: 'ASYLUM', blocked: true });
    target = null;
  }
  if (target && remedy && !remedy.consumed && remedy.activeDay === s.dayNumber && !suppressRemedy && !protectedIds.has(target)) {
    remedy.consumed = true;
    events.push({ type: 'ROLE_BLOCK', targetId: target });
    target = null;
  }
  const deceasedId = target && !protectedIds.has(target) ? target : null;
  // Protection is frozen before death: a Constable attacked tonight still protects.
  s.dawn = { nightNumber: s.night!.number, deceasedId };
  s.night = null; // Do not retain ballots or protection choices after resolution.
  if (deceasedId) kill(s, deceasedId, events);
  for (const id of Object.keys(s.herbalRemedies ?? {})) {
    const current = s.herbalRemedies![id]!;
    if (current.activeDay === s.dayNumber && !current.consumed) delete s.herbalRemedies![id];
  }
  for (const p of s.identity.players) if (hasStatus(s, p.id, 'ASYLUM')) removeStatus(s, p.id, 'ASYLUM', events);
  events.push({ type: 'DAWN' });
  s.outcome = evaluateOutcome(s.identity, s.neutralIds);
  s.phase = s.outcome ? 'GAME_OVER' : 'DAWN';
  s.deadline = s.outcome ? null : now + s.rules.dawnDurationMs;
  if (s.outcome) events.push({ type: 'WIN' });
  s.version++;
  return { state: s, events };
}

function nextDay(input: DayState, now: number, randomIndex: (max: number) => number): DayResult {
  const s = structuredClone(input); const events: DayEvent[] = [];
  // Only discarded cards return to the deck. Survivors retain their exact hands.
  const cards = [...s.deck, ...s.discard];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error('Invalid shuffle index.');
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }
  s.deck = cards; s.discard = [];
  for (const p of s.identity.players) {
    if (!p.alive) s.hands[p.id] = [];
  }
  s.dayNumber++; s.phase = 'DAY'; s.playedThisTurn = false;
  // The queued next actor from the exhausted day resumes; skip if killed at night.
  if (!alive(s, s.activePlayerId)) advanceTurn(s, now, events);
  else s.turnNumber++;
  s.deadline = now + s.rules.turnTimeoutMs; s.version++;
  events.push({ type: 'DAY_STARTED', actorId: s.activePlayerId });
  return { state: s, events };
}
