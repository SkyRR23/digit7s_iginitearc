import {describe,it,expect} from 'vitest';
import type {Command,RoomView} from '@ashfall/shared';
import {TutorialSession} from '../apps/client/src/tutorial-session';

function practice(){
 let view:RoomView;const session=new TutorialSession(next=>{view=next;},()=>{});session.start();
 const send=(intent:Record<string,unknown>)=>session.command({actionId:crypto.randomUUID(),matchId:view!.deal!.matchId,turnNumber:view!.day?.turnNumber,gameVersion:view!.day?.version,...intent} as Command);
 const finish=()=>{if(view!.presentation)expect(send({type:'finishPresentation',presentationId:view!.presentation.id}).ok).toBe(true);};
 const begin=()=>{session.inspectRole();expect(send({type:'acknowledgeDeal'}).ok).toBe(true);finish();};
 const accuse=()=>{expect(send({type:'playCards',cardIds:[view!.hand![0]!.id],targetId:session.target}).ok).toBe(true);finish();expect(view!.phase).toBe('REVEAL_RESOLUTION');expect(send({type:'revealSeal',slot:3}).ok).toBe(true);finish();};
 return{session,send,finish,begin,accuse,get view(){return view!;}};
}
describe('isolated training with real shared rules',()=>{
 it('projects only the trainee’s secrets, validates the selected Life, preserves cards through Night, and completes',()=>{
  const p=practice();expect(p.view.players.filter(player=>player.isBot)).toHaveLength(5);
  expect(p.view.private!.identities.every(card=>card.kind==='HUMAN')).toBe(true);
  for(const player of p.view.deal!.players)expect(player.seals.every(seal=>!('kind'in seal))).toBe(true);
  p.begin();const original=p.view.hand!.map(card=>card.id);
  expect(p.send({type:'playCards',cardIds:[original[0]],targetId:p.session.ids[2]}).ok).toBe(false);
  expect(p.view.hand!.map(card=>card.id)).toEqual(original);expect(p.session.stage).toBe('evidence');
  p.accuse();expect(p.session.stage).toBe('hand');
  expect(p.view.deal!.players.find(player=>player.playerId===p.session.target)!.seals[3]).toEqual({slot:3,revealed:true,kind:'HUMAN'});
  expect(p.view.day!.activePlayerId).toBe(p.session.human);expect(p.view.day!.playedThisTurn).toBe(true);
  expect(p.send({type:'drawCards'}).ok).toBe(false);expect(p.view.hand!.map(card=>card.id)).toEqual(original.slice(1));
  expect(p.send({type:'endTurn'}).ok).toBe(true);p.finish();expect(p.session.stage).toBe('draw');expect(p.view.day!.deckCount).toBe(2);
  expect(p.view.hand!.map(card=>card.id)).toEqual(original.slice(1));
  expect(p.send({type:'drawCards'}).ok).toBe(true);p.finish();expect(p.session.stage).toBe('night');expect(p.view.phase).toBe('NIGHT');expect(p.view.night).toBe(null);
  const saved=p.view.hand!.map(card=>card.id);expect(saved).toHaveLength(4);
  p.session.next();p.finish();expect(p.session.stage).toBe('dawn');expect(p.view.phase).toBe('DAWN');expect(p.view.dawn!.deceasedId).toBe(null);
  p.session.next();p.finish();expect(p.session.stage).toBe('win');expect(p.view.phase).toBe('DAY');expect(p.view.hand!.map(card=>card.id)).toEqual(saved);
  p.session.next();expect(p.session.stage).toBe('complete');p.session.stop();expect(p.send({type:'drawCards'}).ok).toBe(false);
 });
 it('allows playing all remaining cards without ending the turn or match',()=>{
  const p=practice();p.begin();p.accuse();
  expect(p.send({type:'playCards',cardIds:p.view.hand!.map(card=>card.id),targetId:p.session.target}).ok).toBe(true);p.finish();
  expect(p.view.hand).toHaveLength(0);expect(p.view.day!.activePlayerId).toBe(p.session.human);expect(p.view.phase).toBe('DAY');expect(p.view.day!.outcome).toBe(null);
  expect(p.send({type:'endTurn'}).ok).toBe(true);p.finish();expect(p.session.stage).toBe('draw');
 });
 it('does not mutate state on stale, forged, out-of-phase or wrong presentation commands',()=>{
  const p=practice();p.begin();const before=p.view;
  expect(p.send({type:'playCards',cardIds:[before.hand![0]!.id],targetId:p.session.target,gameVersion:999}).ok).toBe(false);
  expect(p.view).toBe(before);
  expect(p.send({type:'revealSeal',slot:0}).ok).toBe(false);expect(p.session.stage).toBe('evidence');
  expect(p.send({type:'finishPresentation',presentationId:crypto.randomUUID()}).ok).toBe(false);
 });
});
