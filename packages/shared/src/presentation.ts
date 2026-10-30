import type { ActionKind } from './day-views.js';
import type { PublicDealView } from './identity-views.js';
import type { RoomView } from './index.js';

export const PRESENTATION_DURATION = { card:4000, power:5000, reveal:5000, position:3500, death:5000, phase:5000, victory:5000, verdict:3500, resume:2000 } as const;
export const REVEAL_STAGES = [{ name:'announcement',duration:1000 },{ name:'portrait',duration:4000 }] as const;
export type PublicMomentKind = Exclude<keyof typeof PRESENTATION_DURATION,'power'>;
export interface PresentationEvent { type:string; targetId?:string; actorId?:string; slot?:number; cardKind?:ActionKind; secondTargetId?:string }
export interface PublicMomentStep { kind:PublicMomentKind; duration:number; eventIndex?:number; count?:number }
const closeupCards: readonly ActionKind[] = ['EVIDENCE','TESTIMONY','CURSE','COUNCIL_BELL','EAVESDROP','WITNESS','STOCKS','DISPEL','CONSPIRACY','CINDER_SHIFT','SCAPEGOAT','VOW_OF_HEARTS','WHISPER','ASYLUM'];

/** One public plan drives both the authoritative pause and the client's story. */
export function publicPresentationPlan(previousPhase: RoomView['phase'], next: {
  phase:RoomView['phase']; deal:PublicDealView|null; hasOutcome:boolean;
}, events:readonly PresentationEvent[]): PublicMomentStep[] {
  const validReveal = (event:PresentationEvent) => event.type==='REVEAL' && next.deal?.players.find(player=>player.playerId===event.targetId)?.seals.some(seal=>seal.slot===event.slot&&seal.revealed);
  const hasReveals=events.some(validReveal), seen=new Set<string>(), steps:PublicMomentStep[]=[];
  const add=(kind:PublicMomentKind,eventIndex?:number)=>steps.push({kind,duration:PRESENTATION_DURATION[kind],...(eventIndex===undefined?{}:{eventIndex})});
  const grouped = new Set<string>();
  events.forEach((event,index)=>{
    if(event.type==='PLAY'&&event.cardKind&&closeupCards.includes(event.cardKind)) {
      const key = JSON.stringify([event.cardKind,event.actorId,event.targetId,event.secondTargetId]);
      const count = events.filter(item=>item.type==='PLAY'&&JSON.stringify([item.cardKind,item.actorId,item.targetId,item.secondTargetId])===key).length;
      if (!grouped.has(key) && (event.cardKind==='EVIDENCE' ? count>1 : !hasReveals)) {
        steps.push({kind:'card',duration:PRESENTATION_DURATION.card,eventIndex:index,count});
      }
      grouped.add(key);
    }
    if(validReveal(event)) {
      const key=`${event.targetId}:${event.slot}`;
      if(!seen.has(key)) {seen.add(key);add('reveal',index);add('position',index);}
    }
  });
  if(events.some(event=>event.type==='DEATH')) add('death');
  const foundEvil = events.some(event => validReveal(event) && next.deal?.players.find(player => player.playerId === event.targetId)?.seals.some(seal => seal.slot === event.slot && seal.revealed && seal.kind === 'WITCH'));
  if(hasReveals&&!next.hasOutcome&&(foundEvil || !next.deal?.players.some(player=>player.seals.some(seal=>seal.revealed&&seal.kind==='WITCH')))) add('verdict');
  if(hasReveals && next.phase==='DAY' && !next.hasOutcome) add('resume');
  if(previousPhase!==next.phase) {
    if(next.phase==='GAME_OVER') add('victory');
    else if(next.phase==='NIGHT'||next.phase==='DAWN'||next.phase==='DAY'&&
      (events.some(event=>event.type==='DAY_STARTED')||previousPhase==='DAWN'||previousPhase==='PRIVATE_DEAL'||previousPhase==='LOBBY')) add('phase');
  }
  return steps.slice(-8);
}
