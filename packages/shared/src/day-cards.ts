import { transferIdentities } from './identities.js';
import { cardRequiresOtherPlayer } from './card-targeting.js';
import type { ActionCard, ActionKind, ProtectionKind, StatusKind, PlayerStatus } from './day-views.js';
import { alive, deny, type DayEvent, type DayState } from './day-model.js';
import { evaluateOutcome, resolveSeal } from './day-resolution.js';

export interface CardTarget { targetId: string; secondTargetId?: string; protection?: ProtectionKind }
const statuses = (s: DayState, id: string): PlayerStatus[] => (s.statuses ??= {})[id] ??= [];
export const hasStatus = (s: DayState, id: string, kind: StatusKind) => statuses(s, id).some(item => item.kind === kind && !item.consumed);
export function removeStatus(s: DayState, id: string, kind: StatusKind, events: DayEvent[]): void {
  const status = statuses(s, id).find(item => item.kind === kind && !item.consumed);
  if (!status) return;
  status.consumed = true;
  delete status.cardId;
  if (kind === 'HEARTHWARD') s.wards[id] = false;
  events.push({ type: 'STATUS', targetId: id, statusKind: kind, count: 0 });
}
function addStatus(s: DayState, id: string, kind: StatusKind, actorId: string, events: DayEvent[]): void {
  if (hasStatus(s, id, kind)) deny('STATUS', 'That protection is already active.');
  statuses(s, id).push({ kind, sourceId: actorId,
    duration: kind === 'BOUND' ? 'NEXT_TURN' : kind === 'ASYLUM' ? 'UNTIL_DAWN' : 'UNTIL_USED', consumed: false });
  if (kind === 'HEARTHWARD') s.wards[id] = true;
  events.push({ type: 'STATUS', actorId, targetId: id, statusKind: kind, count: 1 });
}
function unbind(s: DayState, id: string, events: DayEvent[]): void {
  removeStatus(s, id, 'VOW_HEART', events);
  const links = s.vows?.filter(vow => vow.playerIds.includes(id)) ?? [];
  s.vows = (s.vows ?? []).filter(vow => !vow.playerIds.includes(id));
  for (const link of links) events.push({ type: 'VOW', actorId: link.playerIds[0], targetId: link.playerIds[1], count: 0 });
}
function randomSlot(s: DayState, id: string, randomIndex: (max: number) => number): number {
  const hidden = s.identity.cards.filter(card => card.ownerId === id && !card.revealed);
  if (!hidden.length) deny('SEAL', 'That player has no hidden Life cards.');
  const index = randomIndex(hidden.length);
  if (!Number.isInteger(index) || index < 0 || index >= hidden.length) throw new Error('Invalid server random index.');
  return hidden[index]!.slot;
}
function revealAtSeven(s: DayState, actorId: string, id: string, now: number, events: DayEvent[], _randomIndex: (max: number) => number): void {
  if (s.doubt[id]! < s.rules.accusationThreshold || !alive(s, id)) return;
  events.push({ type: 'REVEAL_PENDING', actorId, targetId: id, count: 7 });
  if (s.reveal?.targetId === id || s.pendingReveals?.some(item => item.targetId === id)) return;
  if (s.reveal) (s.pendingReveals ??= []).push({ chooserId: actorId, targetId: id });
  else {
    s.reveal = { chooserId: actorId, targetId: id, remainingTurnMs: Math.max(0, (s.deadline ?? now) - now) };
    s.phase = 'REVEAL_RESOLUTION'; s.deadline = now + s.rules.revealTimeoutMs;
  }
}
function addDoubt(s: DayState, actorId: string, id: string, amount: number, now: number,
  events: DayEvent[], randomIndex: (max: number) => number, sourceCard?: ActionKind): void {
  const place = (targetId: string, requested: number) => {
    const count = Math.min(requested, Math.max(0, s.rules.accusationThreshold - s.doubt[targetId]!));
    if (count) {
      s.doubt[targetId]! += count;
      events.push({ type: 'DOUBT', actorId, targetId, count });
    }
    return count;
  };
  const added = place(id, amount);
  if (!added) return;
  // A played card triggers its Vow once, irrespective of how many X marks it added.
  const partners = sourceCard && hasStatus(s, id, 'VOW_HEART')
    ? [...new Set((s.vows ?? []).filter(vow => vow.playerIds.includes(id))
      .flatMap(vow => vow.playerIds.filter(playerId => playerId !== id)))].filter(playerId => alive(s, playerId)) : [];
  for (const partner of partners) {
    events.push({ type: 'VOW', actorId: id, targetId: partner, count: 1, cardKind: sourceCard });
    place(partner, 1);
  }
  // Apply every row before revealing; a mirrored mark never mirrors back.
  for (const playerId of [id, ...partners]) revealAtSeven(s, actorId, playerId, now, events, randomIndex);
}
function cleanse(s: DayState, actorId: string, id: string, amount: number, events: DayEvent[]): void {
  const removed = Math.min(amount, s.doubt[id]!);
  if (removed) {
    s.doubt[id]! -= removed;
    events.push({ type: 'CLEANSE', actorId, targetId: id, count: removed });
  }
}
function hidden(s: DayState, id: string) { return s.identity.cards.some(card => card.ownerId === id && !card.revealed); }
export function validateCardTarget(s: DayState, actorId: string, card: ActionCard, target: CardTarget): void {
  const kind = card.kind, id = target.targetId, other = target.secondTargetId;
  if (kind === 'COUNCIL_BELL') {
    if (s.council?.used) deny('COUNCIL_USED', 'The Council Bell has already been used this match.');
    return;
  }
  if (kind === 'CONSPIRACY') {
    if (s.identity.players.filter(p => p.alive).some(p => !hidden(s, p.id))) deny('SEAL', 'Every living player needs a hidden Life card.');
    return;
  }
  if (!alive(s, id)) deny('TARGET', 'Choose a living player.');
  if (cardRequiresOtherPlayer(kind) && id === actorId)
    deny('SELF_TARGET', 'Choose another living player.');
  if (kind === 'SCAPEGOAT') {
    if (!other || !alive(s, other) || other === id || (kind === 'SCAPEGOAT' && other === actorId))
      deny('TARGET', 'Choose two different eligible living players.');
  } else if (other) deny('TARGET', 'That card takes only one target.');
  if (kind === 'SCAPEGOAT' && !s.doubt[id] && !statuses(s, id).some(status => !status.consumed) &&
    !(s.herbalRemedies?.[id] && !s.herbalRemedies[id]!.consumed && s.herbalRemedies[id]!.activeDay === s.dayNumber))
    deny('TARGET', 'The first player needs Doubt or an attached effect to transfer.');
  if (kind === 'VOW_OF_HEARTS' && hasStatus(s, id, 'VOW_HEART'))
    deny('VOW', 'That player already carries a Heart. Choose another player.');
  if (kind === 'CURSE' && s.identity.players.some(player => hasStatus(s, player.id, 'BLACK_CAT')))
    deny('STATUS', 'The single Curse is already attached to a player.');
  if (kind === 'DISPEL') {
    const removable: ProtectionKind[] = ['HEARTHWARD','PIETY','ASYLUM','VOW_OF_HEARTS','BLACK_CAT'];
    const available = removable.filter(item => item === 'VOW_OF_HEARTS'
      ? hasStatus(s, id, 'VOW_HEART') : hasStatus(s, id, item));
    if (!available.length) deny('TARGET', 'That player has no removable protection.');
    if (!target.protection && available.length > 1) deny('PROTECTION', 'Choose which protection to break.');
    if (target.protection && !available.includes(target.protection)) deny('PROTECTION', 'That protection is no longer active.');
  }
  if (['HEARTHWARD','PIETY','ASYLUM','STOCKS'].includes(kind) && hasStatus(s, id, kind === 'STOCKS' ? 'BOUND' : kind as StatusKind))
    deny('STATUS', 'That effect is already active.');
  if (kind === 'CINDER_SHIFT' && (!hidden(s, actorId) || !hidden(s, id))) deny('SEAL', 'Both players need a hidden Life card.');
}

export function resolveCard(s: DayState, actorId: string, card: ActionCard, target: CardTarget, now: number,
  events: DayEvent[], randomIndex: (max: number) => number): void {
  validateCardTarget(s, actorId, card, target);
  const id = target.targetId, kind = card.kind;
  events.push({ type: 'PLAY', actorId, targetId: id, secondTargetId: target.secondTargetId, cardKind: kind });
  if ((['EVIDENCE','TESTIMONY','WITNESS'].includes(kind)) && hasStatus(s, id, 'PIETY')) {
    removeStatus(s, id, 'PIETY', events);
    events.push({ type: 'BLOCK', actorId, targetId: id, cardKind: kind, blocked: true });
    return;
  }
  if (kind === 'WHISPER' && hasStatus(s, id, 'HEARTHWARD')) {
    removeStatus(s, id, 'HEARTHWARD', events);
    events.push({ type: 'BLOCK', actorId, targetId: id, cardKind: kind, blocked: true });
    return;
  }
  const harmful = ['EVIDENCE', 'TESTIMONY', 'WITNESS', 'CURSE', 'EAVESDROP', 'STOCKS', 'DISPEL', 'WHISPER', 'CINDER_SHIFT', 'SCAPEGOAT'].includes(kind);
  const protectedId = kind === 'SCAPEGOAT' ? target.secondTargetId : id;
  const remedy = protectedId ? s.herbalRemedies?.[protectedId] : undefined;
  if (harmful && remedy && !remedy.consumed && remedy.activeDay === s.dayNumber) {
    remedy.consumed = true;
    events.push({ type: 'ROLE_BLOCK', actorId, targetId: protectedId, cardKind: kind });
    return;
  }
  switch (kind) {
    case 'EVIDENCE': addDoubt(s, actorId, id, 1, now, events, randomIndex, 'EVIDENCE'); break;
    case 'TESTIMONY': addDoubt(s, actorId, id, 3, now, events, randomIndex, 'TESTIMONY'); break;
    case 'WITNESS': addDoubt(s, actorId, id, s.rules.accusationThreshold - s.doubt[id]!, now, events, randomIndex, 'WITNESS'); break;
    case 'ALIBI': cleanse(s, actorId, id, 2, events); break;
    case 'MERCY': cleanse(s, actorId, id, 2, events); removeStatus(s, id, 'BOUND', events); break;
    case 'STOCKS': addStatus(s, id, 'BOUND', actorId, events); break;
    case 'ASYLUM': addStatus(s, id, 'ASYLUM', actorId, events); break;
    case 'PIETY': addStatus(s, id, 'PIETY', actorId, events); break;
    case 'HEARTHWARD': addStatus(s, id, 'HEARTHWARD', actorId, events); break;
    case 'DISPEL': {
      const chosen = target.protection ?? (['HEARTHWARD','PIETY','ASYLUM','VOW_OF_HEARTS','BLACK_CAT'] as const).find(item =>
        item === 'VOW_OF_HEARTS' ? hasStatus(s, id, 'VOW_HEART') : hasStatus(s, id, item))!;
      if (chosen === 'VOW_OF_HEARTS') unbind(s, id, events);
      else {
        const attached = statuses(s,id).find(item => item.kind === chosen && !item.consumed);
        if (chosen === 'BLACK_CAT' && attached?.cardId) {
          const position = randomIndex(s.deck.length + 1);
          if (!Number.isInteger(position) || position < 0 || position > s.deck.length) deny('RANDOM', 'Invalid draw-pile insertion.');
          s.deck.splice(position, 0, { id: attached.cardId, kind: 'CURSE' });
        }
        removeStatus(s, id, chosen, events);
      }
      break;
    }
    case 'CURSE':
      statuses(s,id).push({ kind:'BLACK_CAT', sourceId:actorId, duration:'UNTIL_USED', consumed:false, cardId:card.id });
      events.push({ type:'STATUS', targetId:id, statusKind:'BLACK_CAT', count:1 }); break;
    case 'COUNCIL_BELL':
      s.council = { used:true, open:true, deadline:now+30_000, remainingTurnMs:Math.max(0,(s.deadline??now)-now) };
      s.deadline=s.council.deadline; break;
    case 'EAVESDROP':
      (s.privateHands ??= {})[actorId] = { id:card.id, targetId:id, cards:s.hands[id]!.map(item=>({...item})), expiresAt:now+12_000 };
      events.push({type:'PEEK',actorId,targetId:id,cardKind:kind}); break;
    case 'SCAPEGOAT': {
      const other = target.secondTargetId!;
      const moved = s.doubt[id]!;
      // Move the complete attachment transaction before resolving seven Doubt.
      // Duplicate effects merge rather than gaining extra charges or duration.
      const movedHeart = hasStatus(s, id, 'VOW_HEART');
      if (movedHeart) unbind(s, id, events);
      for (const status of statuses(s, id).filter(status => !status.consumed)) {
        if (!hasStatus(s, other, status.kind)) {
          statuses(s, other).push({ ...status });
          events.push({ type: 'STATUS', targetId: other, statusKind: status.kind, count: 1 });
        }
        if(status.kind==='BLACK_CAT'&&status.cardId&&statuses(s,other).some(item=>item.kind==='BLACK_CAT'&&!item.consumed&&item.cardId!==status.cardId))s.discard.push({id:status.cardId,kind:'CURSE'});
        removeStatus(s, id, status.kind, events);
      }
      if (movedHeart && !hasStatus(s, other, 'VOW_HEART')) addStatus(s, other, 'VOW_HEART', actorId, events);
      if (movedHeart) for (const holder of s.identity.players.filter(player => player.alive && player.id !== other && hasStatus(s, player.id, 'VOW_HEART'))) {
        if (!(s.vows ?? []).some(link => link.playerIds.includes(other) && link.playerIds.includes(holder.id))) {
          (s.vows ??= []).push({ playerIds: [holder.id, other], sourceId: actorId });
          events.push({ type: 'VOW', actorId: holder.id, targetId: other, count: 1 });
        }
      }
      s.wards[id] = hasStatus(s, id, 'HEARTHWARD');
      s.wards[other] = hasStatus(s, other, 'HEARTHWARD');
      const remedy = s.herbalRemedies?.[id];
      if (remedy && !remedy.consumed && remedy.activeDay === s.dayNumber) {
        (s.herbalRemedies ??= {})[other] = { ...remedy };
        delete s.herbalRemedies[id];
      }
      cleanse(s, actorId, id, moved, events);
      if (moved) {
        s.doubt[other]! += moved;
        events.push({ type: 'DOUBT', actorId, targetId: other, count: moved });
        revealAtSeven(s, actorId, other, now, events, randomIndex);
      }
      break;
    }
    case 'VOW_OF_HEARTS': {
      const others = s.identity.players.filter(player => player.alive && player.id !== id && hasStatus(s, player.id, 'VOW_HEART'));
      addStatus(s, id, 'VOW_HEART', actorId, events);
      for (const other of others) {
        (s.vows ??= []).push({ playerIds: [other.id, id], sourceId: actorId });
        events.push({ type: 'VOW', actorId: other.id, targetId: id, count: 1 });
      }
      break;
    }
    case 'CONSPIRACY': {
      // Black Cat reveals before the ring moves; death removes that seat first.
      for (const cursed of s.identity.players.filter(player => player.alive && hasStatus(s, player.id, 'BLACK_CAT'))) {
        const slot = randomSlot(s, cursed.id, randomIndex);
        s.reveal = { chooserId: actorId, targetId: cursed.id };
        resolveSeal(s, slot, now, events);
      }
      const living = s.identity.players.filter(player => player.alive);
      if(living.length<2 || evaluateOutcome(s.identity,s.neutralIds)) {events.push({type:'CONSPIRACY'});break;}
      const moves = living.map((player, index) => {
        const slot = randomSlot(s, player.id, randomIndex);
        const selected = s.identity.cards.find(c => c.ownerId === player.id && c.slot === slot)!;
        // Seats increase toward the actor's right on screen; the left-hand
        // neighbor is the previous living seat, wrapping around the table.
        const recipient = living[(index - 1 + living.length) % living.length]!;
        const destination = s.identity.cards.filter(c => c.ownerId === recipient.id && !c.revealed);
        return { cardId: selected.id, fromId: player.id, toId: recipient.id,
          destinationSlot: destination[0]!.slot };
      });
      // A full ring must use the selected occupied slots as destinations.
      moves.forEach((move, index) => { move.destinationSlot = s.identity.cards.find(c => c.id === moves[(index - 1 + moves.length) % moves.length]!.cardId)!.slot; });
      s.identity = transferIdentities(s.identity, moves);
      events.push({ type: 'CONSPIRACY' });
      break;
    }
    case 'WHISPER': {
      const slot = randomSlot(s, id, randomIndex);
      const selected = s.identity.cards.find(c => c.ownerId === id && c.slot === slot)!;
      (s.privatePeeks ??= {})[actorId] = { id:card.id, targetId: id, kind: selected.kind, expiresAt: now + 12_000 };
      events.push({ type: 'PEEK', actorId, targetId: id });
      break;
    }
    case 'CINDER_SHIFT': {
      const ownSlot = randomSlot(s, actorId, randomIndex), theirSlot = randomSlot(s, id, randomIndex);
      const own = s.identity.cards.find(c => c.ownerId === actorId && c.slot === ownSlot)!;
      const theirs = s.identity.cards.find(c => c.ownerId === id && c.slot === theirSlot)!;
      s.identity = transferIdentities(s.identity, [
        { cardId: own.id, fromId: actorId, toId: id, destinationSlot: theirs.slot },
        { cardId: theirs.id, fromId: id, toId: actorId, destinationSlot: own.slot },
      ]);
      events.push({ type: 'TRANSFER', actorId, targetId: id });
      break;
    }
  }
}
