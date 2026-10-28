import type { ActionKind } from './day-views.js';
import type { PublicDealView } from './identity-views.js';
import type { RoomView } from './index.js';

export const PRESENTATION_DURATION = { card:6500, power:6500, reveal:8000, position:6000, death:7000, phase:6000, victory:8000, verdict:6000 } as const;
export const REVEAL_STAGES = [{ name:'announcement',duration:1600 },{ name:'portrait',duration:6400 }] as const;
export type PublicMomentKind = Exclude<keyof typeof PRESENTATION_DURATION,'power'>;
export interface PresentationEvent { type:string; targetId?:string; actorId?:string; slot?:number; cardKind?:ActionKind; secondTargetId?:string }
export interface PublicMomentStep { kind:PublicMomentKind; duration:number; eventIndex?:number }
const closeupCards: readonly ActionKind[] = ['WITNESS','STOCKS','CURSE','CONSPIRACY','CINDER_SHIFT','SCAPEGOAT','VOW_OF_HEARTS','WHISPER','ASYLUM'];

/** One public plan drives both the authoritative pause and the client's story. */
export function publicPresentationPlan(previousPhase: RoomView['phase'], next: {
  phase:RoomView['phase']; deal:PublicDealView|null; hasOutcome:boolean;
}, events:readonly PresentationEvent[]): PublicMomentStep[] {
  const validReveal = (event:PresentationEvent) => event.type==='REVEAL' && next.deal?.players.find(player=>player.playerId===event.targetId)?.seals.some(seal=>seal.slot===event.slot&&seal.revealed);
  const hasReveals=events.some(validReveal), seen=new Set<string>(), steps:PublicMomentStep[]=[];
  const add=(kind:PublicMomentKind,eventIndex?:number)=>steps.push({kind,duration:PRESENTATION_DURATION[kind],...(eventIndex===undefined?{}:{eventIndex})});
  events.forEach((event,index)=>{
    if(event.type==='PLAY'&&event.cardKind&&closeupCards.includes(event.cardKind)&&!hasReveals) add('card',index);
    if(validReveal(event)) {
      const key=`${event.targetId}:${event.slot}`;
      if(!seen.has(key)) {seen.add(key);add('reveal',index);add('position',index);}
    }
  });
  if(events.some(event=>event.type==='DEATH')) add('death');
  if(hasReveals&&!next.hasOutcome&&!next.deal?.players.some(player=>player.seals.some(seal=>seal.revealed&&seal.kind==='WITCH'))) add('verdict');
  if(previousPhase!==next.phase) {
    if(next.phase==='GAME_OVER') add('victory');
    else if(['DAY','NIGHT','DAWN'].includes(next.phase)) add('phase');
  }
  return steps.slice(-8);
}
