import { describe, expect, it } from 'vitest';
import { originalPrototypePreset, type ActionKind, type DayIntent } from '@ashfall/shared';
import { dealIdentities, publicIdentities } from '@ashfall/shared/identities';
import { applyDayAction, createDay, publicDay, type DayState } from '@ashfall/shared/day';
import { expireNight } from '@ashfall/shared/night';

const ids = Array.from({ length: 6 }, (_, i) => `p${i}`);
function fixture(): DayState {
  let next = 0;
  const dealt = dealIdentities(ids, originalPrototypePreset, max => max - 1, () => `seal-${next++}`);
  const identity = { ...dealt, players: dealt.players.map(p => ({ ...p, acknowledged: true })) };
  return createDay(identity, originalPrototypePreset, max => max - 1, () => `action-${next++}`, 0).state;
}
function run(s: DayState, intent: DayIntent, actor = s.activePlayerId, randomIndex = (_max: number) => 0) {
  return applyDayAction(s, actor, { ...intent, matchId: s.identity.id,
    turnNumber: s.turnNumber, gameVersion: s.version }, 1, randomIndex);
}
function play(s: DayState, kind: ActionKind, targetId = 'p1', extra: { secondTargetId?: string; protection?: 'PIETY' | 'ASYLUM' | 'HEARTHWARD' | 'VOW_OF_HEARTS' } = {}) {
  const prepared = structuredClone(s);
  prepared.hands.p0![0]!.kind = kind;
  return run(prepared, { type: 'playCard', cardId: prepared.hands.p0![0]!.id, targetId, ...extra });
}
function finishReveal(result:ReturnType<typeof run>) {
  while(result.state.reveal) {
    const target=result.state.reveal.targetId;
    const next=run(result.state,{type:'revealSeal',slot:result.state.identity.cards.find(card=>card.ownerId===target&&!card.revealed)!.slot});
    result={state:next.state,events:[...result.events,...next.events]};
  }
  return result;
}
function allCards(s: DayState) { return [...s.deck, ...s.discard, ...Object.values(s.hands).flat()]; }

describe('expanded council card rules', () => {
  it('builds the configured deck, retains cards only in deck, hand or discard, and uses seven Doubt', () => {
    const s = fixture(), all = allCards(s);
    expect(all).toHaveLength(87);
    expect(new Set(all.map(card => card.id)).size).toBe(all.length);
    expect(s.rules.accusationThreshold).toBe(7);
    for (const [kind, count] of Object.entries(originalPrototypePreset.cardCounts))
      expect(all.filter(card => card.kind === kind)).toHaveLength(count);
    expect(all.filter(card => card.kind === 'WHISPER')).toHaveLength(6);
    expect(all.filter(card => card.kind === 'HEARTHWARD')).toHaveLength(3);
    expect(all.filter(card => card.kind === 'CINDER_SHIFT')).toHaveLength(2);
    expect(all.filter(card => ['EVIDENCE','TESTIMONY','WITNESS'].includes(card.kind))).toHaveLength(44);
    expect(all.filter(card => card.kind === 'EVIDENCE').length / all.length).toBeGreaterThan(.2);
  });
  it('Evidence adds one, caps at seven, and waits for the accuser to choose', () => {
    const s = fixture(); s.doubt.p1 = 6;
    const before = structuredClone(s);
    const pending=play(s,'EVIDENCE');
    expect(pending.state.phase).toBe('REVEAL_RESOLUTION');
    expect(pending.events.some(e=>e.type==='REVEAL')).toBe(false);
    const result=finishReveal(pending);
    expect(s).toEqual(before); // card kind was set before the action
    expect(result.events.filter(event => event.type === 'DOUBT')).toEqual([expect.objectContaining({ count: 1, targetId: 'p1' })]);
    expect(result.events.filter(event => event.type === 'REVEAL')).toHaveLength(1);
    expect(result.state.identity.cards.filter(card => card.ownerId === 'p1' && card.revealed)).toHaveLength(1);
    expect(result.state.doubt.p1).toBe(0);
    expect(result.state.discard.at(-1)?.kind).toBe('EVIDENCE');
  });
  it('Witness fills only the missing marks, then reveals once', () => {
    const s = fixture(); s.doubt.p1 = 3;
    const result = finishReveal(play(s, 'WITNESS'));
    expect(result.events.find(event => event.type === 'DOUBT')?.count).toBe(4);
    expect(result.events.filter(event => event.type === 'REVEAL')).toHaveLength(1);
    expect(result.state.doubt.p1).toBe(0);
  });
  it('Piety consumes one Evidence or Witness without adding Doubt, and does not block Whisper', () => {
    let s = fixture(); s = play(s, 'PIETY').state;
    expect(publicDay(s).players[1]!.statuses?.map(item => item.kind)).toEqual(['PIETY']);
    const blocked = play(s, 'EVIDENCE');
    expect(blocked.state.doubt.p1).toBe(0);
    expect(blocked.events.some(event => event.type === 'BLOCK')).toBe(true);
    expect(publicDay(blocked.state).players[1]!.statuses).toEqual([]);
    const whispered = play(blocked.state, 'WHISPER');
    expect(whispered.state.privatePeeks?.p0?.targetId).toBe('p1');
    expect(JSON.stringify(publicDay(whispered.state))).not.toContain('privatePeeks');
  });
  it('Hearthward stops Whisper once and leaves its hidden insight private', () => {
    let s = fixture(); s = play(s, 'HEARTHWARD').state;
    const blocked = play(s, 'WHISPER');
    expect(blocked.state.privatePeeks?.p0).toBeNull();
    expect(blocked.state.wards.p1).toBe(false);
    expect(blocked.events.some(event => event.type === 'BLOCK')).toBe(true);
  });
  it('Alibi and Mercy remove newest Doubt up to two; Mercy also frees Bound', () => {
    const s = fixture(); s.doubt.p1 = 3;
    const alibi = play(s, 'ALIBI').state;
    expect(alibi.doubt.p1).toBe(1);
    const stock = play(alibi, 'STOCKS').state;
    expect(publicDay(stock).players[1]!.statuses?.map(item => item.kind)).toEqual(['BOUND']);
    const mercy = play(stock, 'MERCY').state;
    expect(mercy.doubt.p1).toBe(0);
    expect(publicDay(mercy).players[1]!.statuses).toEqual([]);
  });
  it('Bound skips exactly the next turn and then disappears', () => {
    const s = play(fixture(), 'STOCKS').state;
    const ended = run(s, { type: 'endTurn' });
    expect(ended.state.activePlayerId).toBe('p2');
    expect(ended.events.some(event => event.type === 'TURN_SKIPPED' && event.actorId === 'p1')).toBe(true);
    expect(publicDay(ended.state).players[1]!.statuses).toEqual([]);
  });
  it('Asylum blocks one harmful night attack, then expires by Dawn', () => {
    const s = fixture(); s.deck.splice(0); // Playing the last card starts Night.
    const night = play(s, 'ASYLUM').state;
    expect(night.phase).toBe('NIGHT');
    night.night!.attacks.p5 = 'p1';
    const dawn = expireNight(night, night.deadline!, () => 0)!;
    expect(dawn.state.dawn?.deceasedId).toBeNull();
    expect(publicDay(dawn.state).players[1]!.statuses).toEqual([]);
    expect(dawn.events.some(event => event.type === 'BLOCK' && event.statusKind === 'ASYLUM')).toBe(true);
  });
  it('Dispel chooses one protection and rejects an unprotected target', () => {
    let s = fixture();
    expect(() => play(s, 'DISPEL')).toThrow('no removable protection');
    s = play(s, 'PIETY').state; s = play(s, 'ASYLUM').state;
    expect(() => play(s, 'DISPEL')).toThrow('Choose which protection');
    const cursed = play(s, 'DISPEL', 'p1', { protection: 'PIETY' }).state;
    expect(publicDay(cursed).players[1]!.statuses?.map(item => item.kind)).toEqual(['ASYLUM']);
  });
  it('Scapegoat transfers all Doubt, clears overflow at seven, and does not mirror transferred marks', () => {
    const s = fixture(); s.doubt.p1 = 3; s.doubt.p2 = 5;
    s.vows = [{ playerIds: ['p2','p3'], sourceId: 'p0' }];
    s.statuses = { p2: [{ kind:'VOW_HEART', sourceId:'p0', duration:'UNTIL_USED', consumed:false }],
      p3: [{ kind:'VOW_HEART', sourceId:'p0', duration:'UNTIL_USED', consumed:false }] };
    const result = finishReveal(play(s, 'SCAPEGOAT', 'p1', { secondTargetId: 'p2' }));
    expect(result.state.doubt.p1).toBe(0);
    expect(result.state.doubt.p2).toBe(0); // seventh mark revealed and row cleared
    expect(result.state.doubt.p3).toBe(0);
    expect(result.events.filter(event => event.type === 'REVEAL')).toHaveLength(1);
  });
  it('moves the complete effect bundle, reconnects Hearts, preserves remedy expiry, and synchronizes wards', () => {
    const s = fixture(); s.doubt.p1 = 4; s.doubt.p2 = 1;
    s.statuses!.p1 = ['BOUND','ASYLUM','PIETY','HEARTHWARD','VOW_HEART','BLACK_CAT'].map(kind => ({
      kind: kind as import('@ashfall/shared').StatusKind, sourceId: 'p0', duration: 'UNTIL_USED', consumed: false,
    }));
    s.statuses!.p3 = [{ kind: 'VOW_HEART', sourceId: 'p0', duration: 'UNTIL_USED', consumed: false }];
    s.vows = [{ playerIds: ['p1','p3'], sourceId: 'p0' }]; s.wards.p1 = true;
    s.herbalRemedies!.p1 = { sourceId: 'p4', activeDay: 1, consumed: false };
    const result = play(s,'SCAPEGOAT','p1',{secondTargetId:'p2'});
    expect(publicDay(result.state).players[1]!.statuses).toEqual([]);
    expect(publicDay(result.state).players[2]!.statuses?.map(status=>status.kind).sort())
      .toEqual(['BOUND','ASYLUM','PIETY','HEARTHWARD','VOW_HEART','BLACK_CAT'].sort());
    expect(result.state.doubt).toMatchObject({p1:0,p2:5,p3:0});
    expect(result.state.vows).toEqual([{playerIds:['p3','p2'],sourceId:'p0'}]);
    expect(result.state.wards).toMatchObject({p1:false,p2:true});
    expect(result.state.herbalRemedies?.p1).toBeUndefined();
    expect(result.state.herbalRemedies?.p2).toEqual({sourceId:'p4',activeDay:1,consumed:false});
    expect(result.state.identity).toEqual(s.identity);
  });
  it('allows a zero-Doubt source carrying only the Black Cat and merges duplicate Hearts without self-links', () => {
    const s = fixture();
    s.statuses!.p1 = [{kind:'BLACK_CAT',sourceId:'p1',duration:'UNTIL_USED',consumed:false}, {kind:'VOW_HEART',sourceId:'p0',duration:'UNTIL_USED',consumed:false}];
    s.statuses!.p2 = [{kind:'VOW_HEART',sourceId:'p0',duration:'UNTIL_USED',consumed:false}];
    s.vows = [{playerIds:['p1','p2'],sourceId:'p0'}];
    const result = play(s,'SCAPEGOAT','p1',{secondTargetId:'p2'});
    expect(result.state.vows).toEqual([]);
    expect(publicDay(result.state).players[2]!.statuses?.map(status=>status.kind).sort()).toEqual(['BLACK_CAT','VOW_HEART']);
    expect(publicDay(result.state).players[1]!.statuses).toEqual([]);
  });
  it('a receiving remedy blocks the entire Scapegoat bundle before anything moves', () => {
    const s = fixture(); s.doubt.p1 = 5;
    s.statuses!.p1 = [{kind:'BLACK_CAT',sourceId:'p1',duration:'UNTIL_USED',consumed:false}];
    s.herbalRemedies!.p2 = {sourceId:'p4',activeDay:1,consumed:false};
    const result = play(s,'SCAPEGOAT','p1',{secondTargetId:'p2'});
    expect(result.state.doubt.p1).toBe(5); expect(result.state.doubt.p2).toBe(0);
    expect(publicDay(result.state).players[1]!.statuses?.[0]?.kind).toBe('BLACK_CAT');
    expect(result.events.some(event=>event.type==='ROLE_BLOCK')).toBe(true);
  });
  it('Dispel removes Black Cat, and Conspiracy reveals only its current holder before shifting', () => {
    let s = fixture(); s.statuses!.p1 = [{kind:'BLACK_CAT',sourceId:'p1',duration:'UNTIL_USED',consumed:false}];
    s = play(s,'SCAPEGOAT','p1',{secondTargetId:'p2'}).state;
    const result = play(s,'CONSPIRACY');
    expect(result.events.filter(event=>event.type==='REVEAL').map(event=>event.targetId)).toEqual(['p2']);
    expect(result.events.findIndex(event=>event.type==='REVEAL')).toBeLessThan(result.events.findIndex(event=>event.type==='CONSPIRACY'));
    const removed = play(s,'DISPEL','p2').state;
    expect(publicDay(removed).players[2]!.statuses).toEqual([]);
    expect(play(removed,'CONSPIRACY').events.some(event=>event.type==='REVEAL')).toBe(false);
  });
  it('Black Cat death resolves before the Conspiracy ring and never shifts a dead player’s cards', () => {
    const s = fixture(); s.statuses!.p5 = [{kind:'BLACK_CAT',sourceId:'p5',duration:'UNTIL_USED',consumed:false}];
    s.hands.p0![0]!.kind = 'CONSPIRACY';
    const result = run(s,{type:'playCard',cardId:s.hands.p0![0]!.id,targetId:'p0'},'p0',max=>Math.min(2,max-1));
    expect(result.state.identity.players.find(player=>player.id==='p5')!.alive).toBe(false);
    expect(result.state.identity.cards.filter(card=>card.ownerId==='p5')).toEqual(s.identity.cards.filter(card=>card.ownerId==='p5').map(card=>({...card,revealed:true})));
  });
  it('Vow mirrors direct Doubt once per card, never recursively', () => {
    let s = fixture(); s = play(s, 'VOW_OF_HEARTS', 'p1').state;
    expect(s.vows).toEqual([]);
    expect(publicDay(s).players[1]!.statuses?.map(item => item.kind)).toContain('VOW_HEART');
    s = play(s, 'VOW_OF_HEARTS', 'p2').state;
    const result = play(s, 'EVIDENCE');
    expect(result.state.doubt.p1).toBe(1);
    expect(result.state.doubt.p2).toBe(1);
    expect(result.events.filter(event => event.type === 'VOW' && event.count === 1)).toHaveLength(1);
    result.state.hands.p0!.push(result.state.deck.pop()!);
    expect(() => play(result.state, 'VOW_OF_HEARTS', 'p2')).toThrow('already carries a Heart');
  });
  it('a third Heart joins the existing network, and Dispel removes only that holder', () => {
    let s = fixture();
    s = play(s, 'VOW_OF_HEARTS', 'p1').state;
    s = play(s, 'VOW_OF_HEARTS', 'p2').state;
    s = play(s, 'VOW_OF_HEARTS', 'p3').state;
    expect(s.vows).toHaveLength(3);
    s.hands.p0!.push(s.deck.pop()!);
    const hit = play(s, 'EVIDENCE', 'p1');
    expect(hit.state.doubt.p1).toBe(1);
    expect(hit.state.doubt.p2).toBe(1);
    expect(hit.state.doubt.p3).toBe(1);
    hit.state.hands.p0!.push(hit.state.deck.pop()!);
    const cursed = play(hit.state, 'DISPEL', 'p2', { protection: 'VOW_OF_HEARTS' }).state;
    expect(cursed.vows).toHaveLength(1);
    expect(publicDay(cursed).players[2]!.statuses).toEqual([]);
  });
  it('applies linked Doubt before revealing either completed row, with the card target first', () => {
    const s = fixture(); s.vows = [{ playerIds: ['p1','p2'], sourceId: 'p0' }];
    s.statuses = { p1: [{ kind:'VOW_HEART', sourceId:'p0', duration:'UNTIL_USED', consumed:false }],
      p2: [{ kind:'VOW_HEART', sourceId:'p0', duration:'UNTIL_USED', consumed:false }] };
    s.doubt.p1 = 6; s.doubt.p2 = 6;
    const result = finishReveal(play(s, 'EVIDENCE'));
    const order = result.events.filter(event => event.type === 'DOUBT' || event.type === 'REVEAL');
    expect(order.map(event => `${event.type}:${event.targetId}`)).toEqual([
      'DOUBT:p1', 'DOUBT:p2', 'REVEAL:p1', 'REVEAL:p2',
    ]);
    expect(result.state.doubt.p1).toBe(0);
    expect(result.state.doubt.p2).toBe(0);
  });
  it.each<ActionKind>(['EVIDENCE','WITNESS','ALIBI','MERCY','STOCKS','ASYLUM','PIETY','HEARTHWARD','WHISPER','CINDER_SHIFT','SCAPEGOAT','DISPEL','VOW_OF_HEARTS'])(
    '%s rejects self-targeting without spending the card or changing match state', kind => {
      const s = fixture(); const before = structuredClone(s);
      expect(() => play(s, kind, 'p0', kind === 'SCAPEGOAT' ? { secondTargetId: 'p1' } : {})).toThrow('another living player');
      expect(s).toEqual(before);
    });
  it('Dispel breaks a Vow for both linked players', () => {
    let s = fixture(); s = play(s, 'VOW_OF_HEARTS', 'p1').state;
    s = play(s, 'VOW_OF_HEARTS', 'p2').state;
    s = play(s, 'DISPEL', 'p1', { protection: 'VOW_OF_HEARTS' }).state;
    expect(publicDay(s).vows).toEqual([]);
    expect(publicDay(s).players[2]!.statuses?.map(item => item.kind)).toContain('VOW_HEART');
  });
  it('Dispel can remove a waiting Heart before any connection exists', () => {
    let s = fixture(); s = play(s, 'VOW_OF_HEARTS', 'p1').state;
    s = play(s, 'DISPEL', 'p1', { protection: 'VOW_OF_HEARTS' }).state;
    expect(publicDay(s).players[1]!.statuses).toEqual([]);
    expect(s.vows).toEqual([]);
  });
  it('Conspiracy atomically moves one unrevealed card from every living seat without public identities', () => {
    const s = fixture(); const original = s.identity.cards.filter(c => c.slot === 0).map(c => c.id);
    const result = play(s, 'CONSPIRACY', 'p0');
    const moved = result.state.identity.cards;
    for (let i=0;i<6;i++) expect(moved.find(c => c.id === original[i])?.ownerId).toBe(ids[(i-1+6)%6]);
    expect(result.events.filter(event => event.type === 'CONSPIRACY')).toHaveLength(1);
    expect(JSON.stringify(publicIdentities(result.state.identity))).not.toContain(original[0]);
    expect(allCards(result.state)).toHaveLength(87);
  });
  it('Cinder Shift chooses both hidden cards on the server and keeps their kinds private', () => {
    const s = fixture(); const own = s.identity.cards.find(c => c.ownerId === 'p0' && c.slot === 0)!;
    const other = s.identity.cards.find(c => c.ownerId === 'p1' && c.slot === 0)!;
    const result = play(s, 'CINDER_SHIFT');
    expect(result.state.identity.cards.find(c => c.id === own.id)?.ownerId).toBe('p1');
    expect(result.state.identity.cards.find(c => c.id === other.id)?.ownerId).toBe('p0');
    expect(result.events.find(event => event.type === 'TRANSFER')).toMatchObject({ actorId:'p0', targetId:'p1' });
  });
  it('plays grouped cards in order and rejects forged duplicate or foreign cards without mutation', () => {
    const s = fixture(); s.hands.p0![0]!.kind = 'EVIDENCE'; s.hands.p0![1]!.kind = 'ALIBI';
    const before = structuredClone(s), selected = s.hands.p0!.slice(0,2).map(c => c.id);
    expect(() => run(s, { type:'playCards', cardIds:[selected[0]!,selected[0]!], targetId:'p1' })).toThrow('only once');
    expect(() => run(s, { type:'playCards', cardIds:['forged'], targetId:'p1' })).toThrow('your hand');
    expect(s).toEqual(before);
    const result = run(s, { type:'playCards', cardIds:selected, targetId:'p1' });
    expect(result.state.doubt.p1).toBe(0);
    expect(result.state.discard.at(-2)?.kind).toBe('EVIDENCE');
    expect(result.state.discard.at(-1)?.kind).toBe('ALIBI');
    expect(result.state.hands.p0).toHaveLength(1);
  });
  it('keeps unplayed batch cards while an accusation choice interrupts the batch', () => {
    const s = fixture(); s.doubt.p1 = 6;
    s.identity = { ...s.identity, cards: s.identity.cards.map(card => card.ownerId === 'p1' && card.slot < 4
      ? { ...card, revealed: true } : card) };
    s.hands.p0![0]!.kind = 'EVIDENCE'; s.hands.p0![1]!.kind = 'EVIDENCE';
    const selected = s.hands.p0!.slice(0,2).map(card => card.id);
    const pending = run(s, { type: 'playCards', cardIds: selected, targetId: 'p1' });
    expect(pending.state.reveal?.targetId).toBe('p1');
    const result=finishReveal(pending);
    expect(result.state.identity.players.find(player => player.id === 'p1')?.alive).toBe(false);
    expect(result.state.discard.filter(card => selected.includes(card.id))).toHaveLength(1);
    expect(result.state.hands.p0?.some(card => card.id === selected[1])).toBe(true);
  });
});
