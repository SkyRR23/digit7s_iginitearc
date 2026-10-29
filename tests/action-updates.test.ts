import { describe, expect, it } from 'vitest';
import { originalPrototypePreset, type ActionKind, type DayIntent } from '@ashfall/shared';
import { dealIdentities, hasConstableAbility } from '@ashfall/shared/identities';
import { applyDayAction, createDay, expireDay, publicDay, type DayState } from '@ashfall/shared/day';
import { privateNight } from '@ashfall/shared/night';

function fixture() {
  let n=0;
  const match=dealIdentities(['p0','p1','p2','p3','p4','p5'],originalPrototypePreset,max=>max-1,()=>`id-${n++}`);
  match.players.forEach(p=>p.acknowledged=true);
  return createDay(match,originalPrototypePreset,max=>max-1,()=>`action-${n++}`,0).state;
}
function action(s:DayState,intent:DayIntent,now=1000,actor=s.activePlayerId) {
  return applyDayAction(s,actor,{...intent,matchId:s.identity.id,turnNumber:s.turnNumber,gameVersion:s.version},now,()=>0);
}
function play(s:DayState,kind:ActionKind,targetId='p1',now=1000) {
  const copy=structuredClone(s);
  const pile=kind==='CURSE'?[copy.deck,copy.discard,...Object.values(copy.hands)].find(cards=>cards.some(card=>card.kind==='CURSE')):undefined;
  const card=pile?pile.splice(pile.findIndex(card=>card.kind==='CURSE'),1)[0]!:copy.hands[copy.activePlayerId]![0]!;
  if(pile)copy.hands[copy.activePlayerId]!.unshift(card);card.kind=kind;
  return action(copy,{type:'playCard',cardId:card.id,targetId},now);
}
describe('chosen accusations and revised action cards',()=>{
  it('uses 1/3/7 pressure and one Council Bell per match',()=>{
    const s=fixture();
    expect(play(s,'EVIDENCE').state.doubt.p1).toBe(1);
    expect(play(s,'TESTIMONY').state.doubt.p1).toBe(3);
    expect(play(s,'WITNESS').state.doubt.p1).toBe(7);
    expect([...s.deck,...Object.values(s.hands).flat()].filter(c=>c.kind==='COUNCIL_BELL')).toHaveLength(1);
    expect(Object.values(s.hands).flat().some(c=>c.kind==='CONSPIRACY')).toBe(false);
  });
  it('allows only the accuser to choose, with ten seconds and preserved turn time',()=>{
    const pending=play(fixture(),'WITNESS').state;
    expect(pending.deadline).toBe(11000);expect(pending.reveal?.remainingTurnMs).toBe(59000);
    expect(pending.identity.cards.filter(c=>c.revealed)).toHaveLength(0);
    expect(()=>action(pending,{type:'revealSeal',slot:3},2000,'p1')).toThrow();
    expect(()=>action(pending,{type:'endTurn'},2000)).toThrow();
    const result=action(pending,{type:'revealSeal',slot:3},4000);
    expect(result.state.identity.cards.find(c=>c.ownerId==='p1'&&c.slot===3)?.revealed).toBe(true);
    expect(result.state.deadline).toBe(63000);expect(result.state.doubt.p1).toBe(0);
  });
  it('automatically chooses a valid hidden card at the choice deadline',()=>{
    const pending=play(fixture(),'WITNESS').state;
    expect(expireDay(pending,10999)).toBeNull();
    const result=expireDay(pending,11000)!;
    expect(result.events.find(e=>e.type==='REVEAL')?.slot).toBe(0);
    expect(result.state.deadline).toBe(70000);
  });
  it('queues simultaneous Heart accusations and preserves the original turn remainder',()=>{
    const s=fixture();s.doubt.p1=s.doubt.p2=6;
    s.statuses!.p1=[{kind:'VOW_HEART',sourceId:'p0',consumed:false,duration:'UNTIL_USED'}];
    s.statuses!.p2=[{kind:'VOW_HEART',sourceId:'p0',consumed:false,duration:'UNTIL_USED'}];
    s.vows=[{playerIds:['p1','p2'],sourceId:'p0'}];
    const first=play(s,'EVIDENCE').state;
    expect(first.reveal?.targetId).toBe('p1');
    const second=action(first,{type:'revealSeal',slot:1},3000).state;
    expect(second.reveal?.targetId).toBe('p2');expect(second.deadline).toBe(13000);
    const done=action(second,{type:'revealSeal',slot:2},5000).state;
    expect(done.reveal).toBeNull();expect(done.deadline).toBe(64000);
  });
  it('Dispel identifies and removes Curse, returning the same card to the draw pile',()=>{
    const s=fixture();const curseId=s.deck.find(card=>card.kind==='CURSE')!.id;
    const cursed=play(s,'CURSE').state;
    expect(cursed.discard.some(c=>c.id===curseId)).toBe(false);
    expect(cursed.statuses!.p1!.find(item=>item.kind==='BLACK_CAT')?.cardId).toBe(curseId);
    const done=play(cursed,'DISPEL');
    expect(done.events).toContainEqual(expect.objectContaining({type:'STATUS',statusKind:'BLACK_CAT',count:0}));
    expect(done.state.deck).toContainEqual({id:curseId,kind:'CURSE'});
    expect(Object.values(done.state.hands).flat().some(card=>card.kind==='CURSE')).toBe(false);
    expect(publicDay(done.state).players[1]!.statuses).toEqual([]);
  });
  it('Conspiracy resolves on draw, reveals Curse and remains out of hands',()=>{
    const s=fixture();s.statuses!.p1=[{kind:'BLACK_CAT',sourceId:'p0',consumed:false,duration:'UNTIL_USED'}];
    const event=s.deck.splice(s.deck.findIndex(c=>c.kind==='CONSPIRACY'),1)[0]!;s.deck.unshift(event);
    const result=action(s,{type:'drawCards'});
    expect(result.events.some(e=>e.type==='CONSPIRACY')).toBe(true);
    expect(result.events.some(e=>e.type==='REVEAL'&&e.targetId==='p1')).toBe(true);
    expect(result.state.hands.p0!.some(c=>c.kind==='CONSPIRACY')).toBe(false);
    expect(result.events.find(e=>e.type==='DRAW')?.count).toBe(2);
  });
  it('Lanternkeeper reveal keeps its holder alive and removes night protection',()=>{
    const s=fixture();const seal=s.identity.cards.find(c=>c.kind==='CONSTABLE')!;
    expect(hasConstableAbility(s.identity,seal.ownerId)).toBe(true);
    const pending=play(s,'WITNESS',seal.ownerId).state;
    const done=action(pending,{type:'revealSeal',slot:seal.slot}).state;
    expect(done.identity.players.find(p=>p.id===seal.ownerId)?.alive).toBe(true);
    expect(hasConstableAbility(done.identity,seal.ownerId)).toBe(false);
    done.phase='NIGHT';done.night={number:1,attacks:{},protections:{}};
    expect(privateNight(done,seal.ownerId)?.protection??null).toBeNull();
  });
  it('Council Bell suspends normal actions, expires a split vote and cannot be reused',()=>{
    const called=play(fixture(),'COUNCIL_BELL','p0').state;
    expect(called.council).toMatchObject({used:true,open:true,remainingTurnMs:59000});
    expect(called.discard.some(c=>c.kind==='COUNCIL_BELL')).toBe(false);
    expect(()=>action(called,{type:'drawCards'})).toThrow('vote');
    const done=expireDay(called,31000)!.state;
    expect(done.council?.open).toBe(false);expect(done.deadline).toBe(90000);
    expect(()=>play(done,'COUNCIL_BELL','p0',32000)).toThrow('already been used');
  });
  it('Eavesdrop inspects a private hand snapshot without moving the target cards',()=>{
    const s=fixture(),before=structuredClone(s.hands.p1);
    const done=play(s,'EAVESDROP').state;
    expect(done.privateHands?.p0?.cards).toEqual(before);expect(done.hands.p1).toEqual(before);
    expect(JSON.stringify(publicDay(done))).not.toContain('privateHands');
  });
});
