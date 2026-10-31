import { cardRequiresOtherPlayer, type BotDifficulty, type DayIntent, type NightIntent, type ProtectionKind, type RoomView } from '@ashfall/shared';

export type BotDecision = DayIntent | NightIntent | { type: 'acknowledgeDeal' } |
  { type: 'chooseBlackCat'; targetId: string } |
  { type: 'useRole'; targetId: string; secondTargetId?: string } | { type: 'closeSleuth' } |
  { type: 'councilVote'; targetId: string };
export interface BotMemory {
  rngState: number;
  doubt: Record<string, number>;
  aggression: Record<string, number>;
  previousActor: string | null;
  lastMessageAt: number;
}

export function createBotMemory(seed: number): BotMemory {
  return { rngState: seed >>> 0 || 0x6d2b79f5, doubt: {}, aggression: {}, previousActor: null, lastMessageAt: -Infinity };
}

/** Mulberry32: reproducible policy randomness. Deals still use cryptographic entropy. */
export function botRandom(memory: BotMemory): number {
  memory.rngState = (memory.rngState + 0x6d2b79f5) >>> 0;
  let value = memory.rngState;
  value = Math.imul(value ^ value >>> 15, value | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}

function updatePublicMemory(view: RoomView, memory: BotMemory): void {
  if (!view.day) return;
  for (const player of view.day.players) {
    const before = memory.doubt[player.playerId] ?? player.doubt;
    if (player.doubt > before && memory.previousActor)
      memory.aggression[memory.previousActor] = (memory.aggression[memory.previousActor] ?? 0) + player.doubt - before;
    memory.doubt[player.playerId] = player.doubt;
  }
  memory.previousActor = view.day.activePlayerId;
}

/** Legal actions are derived only from the same per-player DTO sent to a human client. */
export function enumerateLegalBotActions(view: RoomView): BotDecision[] {
  if(view.presentation)return [];
  const me = view.you?.playerId;
  if (!me) return [];
  if (view.phase === 'PRIVATE_DEAL') {
    const player = view.deal?.players.find(candidate => candidate.playerId === me);
    return player && !player.acknowledged && view.private ? [{ type: 'acknowledgeDeal' }] : [];
  }
  if(view.phase==='OPENING_CURSE'&&view.blackCatChoice&&!view.blackCatChoice.submitted)return view.deal!.players.filter(p=>p.alive).map(p=>({type:'chooseBlackCat',targetId:p.playerId}));
  if (view.phase === 'NIGHT' && view.night && view.deal) {
    const living = view.deal.players.filter(player => player.alive && player.playerId !== me);
    const actions: BotDecision[] = [];
    if (view.night.attack && !view.night.attack.submitted) {
      const allies = new Set(view.private?.witchTeammateIds ?? []);
      actions.push({ type: 'nightAttack', targetId: null });
      for (const player of living) if (!allies.has(player.playerId)) actions.push({ type: 'nightAttack', targetId: player.playerId });
    }
    if (view.night.protection && !view.night.protection.submitted) {
      actions.push({ type: 'nightProtect', targetId: null });
      for (const player of living) actions.push({ type: 'nightProtect', targetId: player.playerId });
    }
    if (view.role?.kind === 'HEXER' && view.role.ability === 'AVAILABLE')
      for (const player of living) actions.push({ type: 'useRole', targetId: player.playerId });
    return actions;
  }
  if (!view.day || !view.deal || !view.hand || !view.private) return [];
  if (view.role?.peek) return [{ type: 'closeSleuth' }];
  if (view.phase === 'REVEAL_RESOLUTION') {
    if (view.day.reveal?.chooserId !== me) return [];
    return view.deal.players.find(player => player.playerId === view.day!.reveal!.targetId)?.seals
      .filter(seal => !seal.revealed).map(seal => ({ type: 'revealSeal', slot: seal.slot })) ?? [];
  }
  if (view.phase !== 'DAY') return [];
  if(view.day.council?.open) return view.councilVote&&!view.councilVote.completed&&!view.councilVote.yourTargetId ? view.deal.players.filter(p=>p.alive).map(p=>({type:'councilVote' as const,targetId:p.playerId})) : [];
  const others = view.deal.players.filter(player => player.alive && player.playerId !== me);
  if (view.role?.ability === 'AVAILABLE') {
    if (view.role.kind === 'SLEUTH' && others.length)
      return others.map(player => ({ type: 'useRole', targetId: player.playerId }));
    if (view.role.kind === 'GOSSIP' && others.length >= 2)
      return others.flatMap(first => others.filter(second => second !== first)
        .map(second => ({ type: 'useRole' as const, targetId: first.playerId, secondTargetId: second.playerId })));
    if (view.role.kind === 'HERBALIST' && others.length)
      return others.filter(player => !view.day!.players.find(p => p.playerId === player.playerId)?.remedy)
        .map(player => ({ type: 'useRole', targetId: player.playerId }));
  }
  const voteActions: BotDecision[] = view.day.council?.open && view.councilVote && !view.councilVote.completed && !view.councilVote.yourTargetId &&
    (view.day.dayNumber >= 2 || view.day.players.some(player => player.doubt >= 3))
    ? view.deal.players.filter(player => player.alive).map(player => ({ type: 'councilVote', targetId: player.playerId })) : [];
  if (view.day.activePlayerId !== me) return voteActions;
  const actions: BotDecision[] = [];
  if (!view.day.playedThisTurn) actions.push({ type: 'drawCards' });
  else actions.push({ type: 'endTurn' });
  const living = view.deal.players.filter(player => player.alive);
  const ownHidden = view.private.identities.length > 0;
  const state = (id: string) => view.day!.players.find(player => player.playerId === id)!;
  const linked = (id: string) => state(id).statuses?.some(status => status.kind === 'VOW_HEART') ?? false;
  for (const card of view.hand) {
    if (['CONSPIRACY','COUNCIL_BELL'].includes(card.kind)) {
      if (living.every(player => player.seals.some(seal => !seal.revealed)))
        actions.push({ type: 'playCard', cardId: card.id, targetId: me });
      continue;
    }
    if (card.kind === 'SCAPEGOAT') {
      for (const first of living) for (const second of living) {
        if (first.playerId === second.playerId || first.playerId === me || second.playerId === me ||
          !(state(first.playerId).doubt || state(first.playerId).statuses?.length || state(first.playerId).remedy)) continue;
        actions.push({ type: 'playCard', cardId: card.id, targetId: first.playerId, secondTargetId: second.playerId });
      }
      continue;
    }
    for (const target of living) {
      const id = target.playerId;
      if (cardRequiresOtherPlayer(card.kind) && id === me) continue;
      if (card.kind === 'VOW_OF_HEARTS' && linked(id)) continue;
      if (card.kind === 'CINDER_SHIFT' && (!ownHidden || !target.seals.some(seal => !seal.revealed))) continue;
      if (['HEARTHWARD','PIETY','ASYLUM','STOCKS'].includes(card.kind) &&
        (state(id).statuses?.some(status => status.kind === (card.kind === 'STOCKS' ? 'BOUND' : card.kind)) ||
          card.kind === 'HEARTHWARD' && state(id).ward)) continue;
      if(card.kind==='CURSE'&&state(id).statuses?.some(status=>status.kind==='BLACK_CAT'))continue;
      if (card.kind === 'DISPEL') {
        const protections: ProtectionKind[] = (state(id).statuses ?? []).filter(status => status.kind !== 'BOUND')
          .map(status => status.kind === 'VOW_HEART' ? 'VOW_OF_HEARTS' : status.kind as ProtectionKind);
        for (const protection of protections) actions.push({ type: 'playCard', cardId: card.id, targetId: id, protection });
        continue;
      }
      actions.push({ type: 'playCard', cardId: card.id, targetId: id });
    }
  }
  return [...actions, ...voteActions];
}

const pick = <T>(values: readonly T[], memory: BotMemory): T | null =>
  values.length ? values[Math.floor(botRandom(memory) * values.length)]! : null;

export function chooseBotDecision(view: RoomView, difficulty: BotDifficulty, memory: BotMemory): BotDecision | null {
  updatePublicMemory(view, memory);
  const legal = enumerateLegalBotActions(view);
  if (!legal.length) return null;
  if (legal[0]!.type === 'chooseBlackCat') {
    const allies = new Set([view.you!.playerId, ...view.private?.witchTeammateIds ?? []]);
    return pick(legal.filter(action => action.type === 'chooseBlackCat' && !allies.has(action.targetId)), memory) ?? pick(legal,memory);
  }
  if (legal[0]!.type === 'closeSleuth' || legal[0]!.type === 'useRole') return pick(legal, memory);
  if (legal[0]!.type === 'acknowledgeDeal' || legal[0]!.type === 'revealSeal') return pick(legal, memory);
  if (difficulty === 'EASY') {
    const types = [...new Set(legal.map(action => action.type))];
    const type = pick(types, memory)!;
    return pick(legal.filter(action => action.type === type), memory);
  }
  const allies = new Set(view.private?.witchTeammateIds ?? []);
  const me = view.you?.playerId;
  const scoreTarget = (targetId: string | null): number => {
    if (!targetId) return -50;
    const player = view.day?.players.find(candidate => candidate.playerId === targetId);
    const publicSeals = view.deal?.players.find(candidate => candidate.playerId === targetId)?.seals ?? [];
    return (player?.doubt ?? memory.doubt[targetId] ?? 0) * 8 +
      (memory.aggression[targetId] ?? 0) * 2 + publicSeals.filter(seal => seal.revealed).length * 3 + botRandom(memory);
  };
  const ballots = legal.filter((action): action is { type: 'councilVote'; targetId: string } => action.type === 'councilVote');
  if (ballots.length && (legal.every(action => action.type === 'councilVote') || botRandom(memory) < .3)) {
    if (view.role?.kind === 'SCAPEGOAT') return ballots.find(action => action.targetId === me)!;
    return ballots.sort((a,b) => {
      const score = (id: string) => scoreTarget(id) + (allies.has(id) ? -50 : 0);
      return score(b.targetId) - score(a.targetId);
    })[0]!;
  }
  const attacks = legal.filter((action): action is { type: 'nightAttack'; targetId: string } => action.type === 'nightAttack' && action.targetId !== null);
  if (attacks.length) return attacks.sort((a, b) => scoreTarget(b.targetId) - scoreTarget(a.targetId))[0]!;
  const protections = legal.filter((action): action is { type: 'nightProtect'; targetId: string } => action.type === 'nightProtect' && action.targetId !== null);
  if (protections.length) {
    return protections.sort((a, b) => {
      const aAlly = allies.has(a.targetId!) ? 20 : 0; const bAlly = allies.has(b.targetId!) ? 20 : 0;
      return bAlly + scoreTarget(b.targetId) - aAlly - scoreTarget(a.targetId);
    })[0]!;
  }
  const end = legal.find(action => action.type === 'endTurn');
  const plays = legal.filter((action): action is Extract<DayIntent, { type: 'playCard' | 'shiftSeal' }> =>
    action.type === 'playCard' || action.type === 'shiftSeal');
  if (end && (plays.length === 0 || botRandom(memory) < 0.38)) return end;
  const handKind = (cardId: string) => view.hand?.find(card => card.id === cardId)?.kind;
  const preferred = plays.filter(action => {
    const kind = handKind(action.cardId);
    const beneficial = ['ALIBI','MERCY','ASYLUM','PIETY','HEARTHWARD'];
    const hostile = ['EVIDENCE','WITNESS','STOCKS','WHISPER','DISPEL'];
    if (beneficial.includes(kind ?? '') && action.targetId !== me && !allies.has(action.targetId)) return false;
    if (hostile.includes(kind ?? '') && allies.has(action.targetId)) return false;
    if (kind === 'SCAPEGOAT' && action.type === 'playCard' && (allies.has(action.secondTargetId ?? '') || !allies.has(action.targetId))) return false;
    return true;
  });
  const candidates = preferred.length ? preferred : plays;
  if (candidates.length) return candidates.sort((a, b) => {
    const score = (action: typeof a) => {
      const kind = handKind(action.cardId);
      const pressure = scoreTarget(action.targetId);
      return ['ALIBI','MERCY','ASYLUM','PIETY','HEARTHWARD'].includes(kind ?? '') ? -pressure + (action.targetId === me ? 9 : 0) : pressure;
    };
    return score(b) - score(a);
  })[0]!;
  return legal.find(action => action.type === 'drawCards') ?? legal[0]!;
}

export function botMessage(view: RoomView, decision: BotDecision, memory: BotMemory, now: number): string | null {
  if (now - memory.lastMessageAt < 8_000 || botRandom(memory) > 0.16) return null;
  const name = (id: string) => view.players.find(player => player.id === id)?.name ?? 'that seat';
  let choices = ['Watch who benefits from the next reveal.', 'Doubt is useful, but it is not proof.', 'The quiet seats deserve attention.'];
  if ('targetId' in decision && decision.targetId) choices = decision.type === 'playCard'
    ? [`I am watching ${name(decision.targetId)}.`, `${name(decision.targetId)} should answer the council.`]
    : decision.type === 'nightAttack' || decision.type === 'nightProtect' ? choices
      : [`The Seals around ${name(decision.targetId)} may change the table.`];
  if ((view.day?.players.find(player => player.playerId === view.you?.playerId)?.doubt ?? 0) >= 3)
    choices.push('I have drawn attention, but Doubt is not proof.');
  memory.lastMessageAt = now;
  return pick(choices, memory);
}
