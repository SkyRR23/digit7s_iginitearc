import type { RoomView } from '@ashfall/shared';

/** Public action data only; private role targets never enter the roster. */
export function actionPeople(view: RoomView): {actorId?:string;targetIds:string[]} {
  if(!['DAY','REVEAL_RESOLUTION'].includes(view.phase))return {targetIds:[]};
  const last=[...(view.effects??[])].reverse().find(effect=>effect.type==='PLAY'||effect.type==='DRAW');
  if(last?.type!=='PLAY')return {targetIds:[]};
  return {actorId:last.actorId,targetIds:last.cardKind==='CONSPIRACY'
    ? view.deal?.players.filter(player=>player.alive).map(player=>player.playerId)??[]
    : [last.targetId,last.secondTargetId].filter((id):id is string=>!!id)};
}
