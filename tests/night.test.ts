import { describe, expect, it } from 'vitest';
import { originalPrototypePreset, type NightIntent } from '@ashfall/shared';
import { dealIdentities, recordWitchHistory } from '@ashfall/shared/identities';
import { createDay, applyDayAction, privateHand, publicDay, type DayState } from '@ashfall/shared/day';
import { submitNight, privateNight, expireNight } from '@ashfall/shared/night';

function fixture() {
  let id = 0;
  const match = dealIdentities(['p0','p1','p2','p3','p4','p5'], originalPrototypePreset, max => max - 1, () => `id-${id++}`);
  const identity = { ...match, players: match.players.map(p => ({ ...p, acknowledged: true })) };
  const s = createDay(identity, originalPrototypePreset, max => max - 1, () => `id-${id++}`, 0).state;
  s.discard.push(...s.deck.splice(1)); s.doubt.p2 = 3; s.wards.p2 = true;
  return applyDayAction(s, 'p0', { type: 'drawCards', matchId: s.identity.id, turnNumber: s.turnNumber, gameVersion: s.version }, 1).state;
}
function choose(s: DayState, actor: string, intent: NightIntent) {
  return submitNight(s, actor, { ...intent, matchId: s.identity.id, nightNumber: s.night!.number }, 2);
}
const attack = (s: DayState, targetId: string | null, actor = 'p5') => choose(s, actor, { type: 'nightAttack', targetId });
const protect = (s: DayState, targetId: string | null, actor = 'p5') => choose(s, actor, { type: 'nightProtect', targetId });
const resolve = (s: DayState) => expireNight(s, s.deadline!, max => max - 1)!.state;

describe('secret night and dawn rules', () => {
  it('starts a fixed night deadline and retains unused Hearthward', () => {
    const s = fixture(); expect(s.night).toEqual({ number: 1, attacks: {}, protections: {} });
    expect(s.deadline).toBe(45_001); expect(s.wards.p2).toBe(true);
    expect(expireNight(s, 45_000, () => 0)).toBeNull();
  });
  it('Witch+Constable independently submits both, without public state or input mutation', () => {
    const before = fixture(); const s = protect(attack(before, 'p1'), 'p1');
    expect(before.night!.attacks).toEqual({}); expect(publicDay(s)).toEqual(publicDay(before));
    expect(privateNight(s, 'p5')).toEqual({ nightNumber: 1, attack: { submitted: true, targetId: 'p1' }, protection: { submitted: true, targetId: 'p1' } });
    expect(expireNight(s, 10, () => 0)).toBeNull();
  });
  it('denies spectators, dead players, non-Witches and non-Constables', () => {
    const s = fixture();
    expect(() => attack(s, 'p1', 'unknown')).toThrow('living');
    expect(() => attack(s, 'p1', 'p0')).toThrow('ability');
    expect(() => protect(s, 'p1', 'p0')).toThrow('ability');
    s.identity.players[5]!.alive = false;
    expect(() => attack(s, 'p1')).toThrow('living'); expect(privateNight(s, 'p5')).toBeNull();
  });
  it('rejects self, unknown and dead targets, stale nights/matches, phases and deadlines', () => {
    const s = fixture();
    expect(() => protect(s, 'p5')).toThrow('another'); expect(() => attack(s, 'p5')).toThrow('another');
    expect(() => attack(s, 'unknown')).toThrow('living'); s.identity.players[1]!.alive = false;
    expect(() => protect(s, 'p1')).toThrow('living');
    const action = { type: 'nightAttack' as const, targetId: 'p0', matchId: s.identity.id, nightNumber: 1 };
    expect(() => submitNight(s, 'p5', { ...action, matchId: 'old' }, 2)).toThrow('match');
    expect(() => submitNight(s, 'p5', { ...action, nightNumber: 2 }, 2)).toThrow('night');
    expect(() => submitNight({ ...s, phase: 'DAY' }, 'p5', action, 2)).toThrow('closed');
    expect(() => submitNight(s, 'p5', action, s.deadline!)).toThrow('deadline');
  });
  it('seals a choice once per ability; abstention is explicit and cannot be replaced', () => {
    const s = attack(fixture(), null);
    expect(privateNight(s, 'p5')!.attack).toEqual({ submitted: true, targetId: null });
    expect(() => attack(s, 'p1')).toThrow('already sealed');
    expect(() => attack(s, null)).toThrow('already sealed');
    expect(protect(s, 'p0').night!.protections.p5).toBe('p0');
  });
  it('correct protection saves the target; no irrelevant details appear at dawn', () => {
    const s = resolve(protect(attack(fixture(), 'p1'), 'p1'));
    expect(s.phase).toBe('DAWN'); expect(s.dawn).toEqual({ nightNumber: 1, deceasedId: null });
    expect(s.identity.players.every(p => p.alive)).toBe(true); expect(s.night).toBeNull();
    expect(privateNight(s, 'p5')).toBeNull();
    expect(s.dawn).toEqual(resolve(fixture()).dawn);
  });
  it('wrong or missing protection kills only the selected target and revokes private hands', () => {
    for (const s of [attack(fixture(), 'p1'), protect(attack(fixture(), 'p1'), 'p2')]) {
      const next = resolve(s); expect(next.dawn!.deceasedId).toBe('p1');
      expect(next.identity.cards.filter(c => c.ownerId === 'p1').every(c => c.revealed)).toBe(true);
      expect(next.identity.players.filter(p => !p.alive).map(p => p.id)).toEqual(['p1']);
      expect(privateHand(next, 'p1')).toBeNull(); expect(privateNight(next, 'p1')).toBeNull();
    }
  });
  it('no votes or only abstentions safely produce a survivor dawn', () => {
    expect(resolve(fixture()).dawn!.deceasedId).toBeNull();
    expect(resolve(attack(fixture(), null)).dawn!.deceasedId).toBeNull();
  });
  it('historical Witch votes remain eligible without currently holding a Witch; allies cannot be attacked', () => {
    const s = fixture(); s.identity.players[4]!.everWitch = true;
    expect(attack(s, 'p1', 'p4').night!.attacks.p4).toBe('p1');
    expect(() => attack(s, 'p4')).toThrow('outside your team');
  });
  it('votes tie by earliest target seat, independent of arrival order; majority beats seat order', () => {
    const s = fixture(); s.identity.players[4]!.everWitch = true;
    expect(resolve(attack(attack(s, 'p2'), 'p1', 'p4')).dawn!.deceasedId).toBe('p1');
    expect(resolve(attack(attack(s, 'p1', 'p4'), 'p2')).dawn!.deceasedId).toBe('p1');
    s.identity.players[3]!.everWitch = true;
    expect(resolve(attack(attack(attack(s, 'p2'), 'p1', 'p4'), 'p2', 'p3')).dawn!.deceasedId).toBe('p2');
  });
  it('Constable follows current unrevealed ownership, including loss of an old submission', () => {
    let s = protect(fixture(), 'p1');
    s.identity = recordWitchHistory({ ...s.identity, cards: s.identity.cards.map(c => c.kind === 'CONSTABLE' ? { ...c, ownerId: 'p4', slot: 5 } : c) });
    expect(() => protect(s, 'p2')).toThrow('ability');
    expect(privateNight(s, 'p4')!.protection).toEqual({ submitted: false, targetId: null });
    expect(resolve(attack(s, 'p1')).dawn!.deceasedId).toBe('p1');
    s = protect(s, 'p1', 'p4'); expect(resolve(attack(s, 'p1')).dawn!.deceasedId).toBeNull();
    s.identity.cards.find(c => c.kind === 'CONSTABLE')!.revealed = true;
    expect(privateNight(s, 'p4')).toBeNull(); expect(resolve(attack(s, 'p1')).dawn!.deceasedId).toBe('p1');
  });
  it('attacked Constable cannot self-protect and dies with the remaining Seals revealed', () => {
    const s = fixture(); s.identity.cards.find(c => c.kind === 'CONSTABLE')!.ownerId = 'p1';
    expect(() => protect(s, 'p1', 'p1')).toThrow('another');
    const next = resolve(protect(attack(s, 'p1'), 'p0', 'p1'));
    expect(next.identity.cards.find(c => c.kind === 'CONSTABLE')!.revealed).toBe(true);
    expect(next.identity.players[1]!.alive).toBe(false);
  });
  it('last Human death wins for Witches with no next-day timer', () => {
    const s = fixture();
    for (const p of s.identity.players) if (!['p1','p5'].includes(p.id)) {
      p.alive = false; s.discard.push(...s.hands[p.id]!); s.hands[p.id] = [];
      s.identity.cards.filter(c => c.ownerId === p.id).forEach(c => { c.revealed = true; });
    }
    const next = resolve(attack(s, 'p1'));
    expect(next.phase).toBe('GAME_OVER'); expect(next.outcome!.winner).toBe('WITCH');
    expect(next.deadline).toBeNull(); expect(expireNight(next, 1e9, () => 0)).toBeNull();
  });
  it('next day keeps survivors’ exact hands, recycles only discards, and skips a dead queued actor', () => {
    const dawn = resolve(attack(fixture(), 'p1')); expect(dawn.activePlayerId).toBe('p1');
    const hands = structuredClone(dawn.hands);
    expect(expireNight(dawn, dawn.deadline! - 1, () => 0)).toBeNull();
    const next = resolve(dawn);
    expect(next.phase).toBe('DAY'); expect(next.dayNumber).toBe(2); expect(next.activePlayerId).toBe('p2');
    expect(next.hands).toEqual(hands);
    expect(next.hands.p1).toEqual([]); expect(next.deck).toHaveLength(dawn.discard.length); expect(next.discard).toEqual([]);
    expect(next.doubt.p2).toBe(3); expect(next.playedThisTurn).toBe(false);
    const cards = [...next.deck, ...Object.values(next.hands).flat()];
    expect(cards).toHaveLength(87); expect(new Set(cards.map(c => c.id)).size).toBe(87);
    expect(next.identity).toEqual(dawn.identity); expect(next.deadline).toBe(dawn.deadline! + 60_000);
  });
  it('all-draw days keep every held card and allow an empty-deck day to end without reclaiming hands', () => {
    const first = fixture(); let s = resolve(resolve(first));
    for (let i = 0; i < 100 && s.phase === 'DAY'; i++) s = applyDayAction(s, s.activePlayerId, { type: 'drawCards', matchId: s.identity.id, turnNumber: s.turnNumber, gameVersion: s.version }, s.deadline! - 1).state;
    expect(s.phase).toBe('NIGHT'); expect(s.night!.number).toBe(2);
    expect(() => submitNight(s, 'p5', { type: 'nightAttack', targetId: 'p0', matchId: s.identity.id, nightNumber: 1 }, s.deadline! - 1)).toThrow('ended');
    const next = resolve(resolve(s));
    expect(next.deck).toHaveLength(1); expect(next.deck[0]!.kind).toBe('CONSPIRACY'); expect(next.hands).toEqual(s.hands);
    expect(Object.values(next.hands).flat()).toHaveLength(86);
    const ended = applyDayAction(next, next.activePlayerId, { type: 'drawCards', matchId: next.identity.id, turnNumber: next.turnNumber, gameVersion: next.version }, next.deadline! - 1).state;
    expect(ended.phase).toBe('NIGHT');
  });
  it('private projections expose only own choices, never a teammate ballot or Constable identity', () => {
    const s = protect(attack(fixture(), 'p1'), 'p2'); s.identity.players[4]!.everWitch = true;
    expect(privateNight(s, 'p4')).toEqual({ nightNumber: 1, attack: { submitted: false, targetId: null }, protection: null });
    for (const id of ['p0', 'spectator', null]) expect(privateNight(s, id)).toBeNull();
    expect(JSON.stringify(publicDay(s))).not.toMatch(/attacks|protections|submitted/);
  });
  it('invalid next-day entropy leaves dawn untouched', () => {
    const s = resolve(fixture()); const before = structuredClone(s);
    expect(() => expireNight(s, s.deadline!, max => max)).toThrow('shuffle'); expect(s).toEqual(before);
  });
});
