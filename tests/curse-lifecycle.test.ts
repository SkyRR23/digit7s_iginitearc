import { describe, expect, it } from 'vitest';
import { cardQuantities, originalPrototypePreset, type ActionKind, type DayIntent } from '@ashfall/shared';
import { dealIdentities } from '@ashfall/shared/identities';
import { attachOpeningCurse, curseInstances, createDay, applyDayAction, eliminatePlayer, type DayState } from '@ashfall/shared/day';
import { expireNight } from '@ashfall/shared/night';

function fixture() {
  let id=0;
  const match=dealIdentities(['p0','p1','p2','p3','p4','p5'],originalPrototypePreset,max=>max-1,()=>`id-${id++}`);
  match.players.forEach(player=>player.acknowledged=true);
  return createDay(match,originalPrototypePreset,max=>max-1,()=>`card-${id++}`,0).state;
}
function run(s:DayState,intent:DayIntent) {
  return applyDayAction(s,s.activePlayerId,{...intent,matchId:s.identity.id,turnNumber:s.turnNumber,gameVersion:s.version},1,()=>0).state;
}
function give(s:DayState,kind:ActionKind,owner=s.activePlayerId) {
  const pile=[s.deck,s.discard,...Object.values(s.hands)].find(pile=>pile.some(card=>card.kind===kind))!;
  const card=pile.splice(pile.findIndex(card=>card.kind===kind),1)[0]!;s.hands[owner]!.push(card);return card;
}
function one(s:DayState,id:string) { expect(curseInstances(s)).toEqual([{id,kind:'CURSE'}]); }
describe('the single physical Curse',()=>{
  it('moves the generated instance into the opening, without changing other hands or minting an ID',()=>{
    const s=fixture(),id=curseInstances(s)[0]!.id,hands=structuredClone(s.hands),size=s.deck.length;
    attachOpeningCurse(s,'p1');one(s,id);expect(s.deck).toHaveLength(size-1);expect(s.hands).toEqual(hands);
    expect(s.statuses!.p1).toContainEqual(expect.objectContaining({kind:'BLACK_CAT',cardId:id}));
    expect(()=>attachOpeningCurse(s,'p2')).toThrow('exactly one');
  });
  it('rejects a deck configuration with two Curses',()=>{
    const s=fixture();
    expect(()=>createDay(s.identity,{...originalPrototypePreset,cardCounts:{...originalPrototypePreset.cardCounts,CURSE:2}},()=>0,()=>'',0)).toThrow('unique');
  });
  it('cycles the same ID from attachment to draw pile to hand and back to attachment',()=>{
    let s=fixture();const id=curseInstances(s)[0]!.id;attachOpeningCurse(s,'p1');
    const dispel=give(s,'DISPEL');s=run(s,{type:'playCard',cardId:dispel.id,targetId:'p1',protection:'BLACK_CAT'});one(s,id);
    expect(s.deck[0]).toEqual({id,kind:'CURSE'});expect(Object.values(s.hands).flat().some(c=>c.kind==='CURSE')).toBe(false);
    s=run(s,{type:'endTurn'});s=run(s,{type:'drawCards'});one(s,id);
    expect(s.hands.p1).toContainEqual({id,kind:'CURSE'});
    while(s.activePlayerId!=='p1')s=run(s,{type:'drawCards'});
    s=run(s,{type:'playCard',cardId:id,targetId:'p2'});one(s,id);
    expect(s.statuses!.p2).toContainEqual(expect.objectContaining({cardId:id,kind:'BLACK_CAT'}));
    expect(s.deck.some(c=>c.kind==='CURSE')).toBe(false);
  });
  it('preserves the instance through Scapegoat, death and discard recycling',()=>{
    let s=fixture();const id=curseInstances(s)[0]!.id;attachOpeningCurse(s,'p1');
    const transfer=give(s,'SCAPEGOAT');s=run(s,{type:'playCard',cardId:transfer.id,targetId:'p1',secondTargetId:'p2'});one(s,id);
    expect(s.statuses!.p1!.some(item=>!item.consumed&&item.kind==='BLACK_CAT')).toBe(false);
    expect(s.statuses!.p2).toContainEqual(expect.objectContaining({cardId:id}));
    s=eliminatePlayer(s,'p2',2).state;one(s,id);expect(s.discard).toContainEqual({id,kind:'CURSE'});
    s.discard.push(...s.deck.splice(0));s.phase='NIGHT';s.night={number:1,attacks:{},protections:{}};s.deadline=10;
    s=expireNight(s,10,max=>max-1)!.state;one(s,id);
    s=expireNight(s,s.deadline!,max=>max-1)!.state;one(s,id);expect(s.deck).toContainEqual({id,kind:'CURSE'});
  });
  it('keeps the attached Curse outside every recycled draw pile',()=>{
    let s=fixture();const id=curseInstances(s)[0]!.id;attachOpeningCurse(s,'p1');
    s.discard.push(...s.deck.splice(0));s.phase='NIGHT';s.night={number:1,attacks:{},protections:{}};s.deadline=10;
    s=expireNight(s,10,max=>max-1)!.state;s=expireNight(s,s.deadline!,max=>max-1)!.state;one(s,id);
    expect(s.deck.some(card=>card.kind==='CURSE')).toBe(false);
  });
  it('refuses a corrupt draw that would duplicate an attached Curse, without mutating input',()=>{
    const s=fixture(),id=curseInstances(s)[0]!.id;attachOpeningCurse(s,'p1');s.deck.unshift({id,kind:'CURSE'});
    const before=structuredClone(s);expect(()=>run(s,{type:'drawCards'})).toThrow('while attached');expect(s).toEqual(before);
  });
  it('derives Help quantities from the complete active rules, including unique cards',()=>{
    const counts=cardQuantities(originalPrototypePreset);
    expect(counts).toMatchObject({CURSE:1,COUNCIL_BELL:1,EVIDENCE:22,TESTIMONY:16,WHISPER:6});
    expect(Object.values(counts).reduce((sum,n)=>sum+n,0)).toBe(87);
    expect(cardQuantities({...originalPrototypePreset,whisperCards:2,cardCounts:{CURSE:1,COUNCIL_BELL:1,EVIDENCE:5}})).toMatchObject({WHISPER:2,EVIDENCE:5,CURSE:1});
  });
});
