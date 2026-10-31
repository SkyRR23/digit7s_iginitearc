import type {GameMoment} from './moment-script';
export type EventSoundMood='good'|'bad'|'mystery';
/** Inputs are the authorized presentation, never a peek, hidden role or Night ballot. */
export function eventSoundMood(moment:GameMoment,revealStage?:string):EventSoundMood {
  if(moment.kind==='reveal')return revealStage==='portrait'?(moment.sealKind==='WITCH'?'bad':'good'):'mystery';
  if(moment.kind==='position')return moment.sealKind==='WITCH'?'bad':'good';
  if(moment.blocked)return 'bad';
  if(moment.soundMood)return moment.soundMood;
  if(moment.kind==='death')return 'bad';
  if(moment.kind==='phase')return moment.phase==='DAY'||moment.phase==='DAWN'?'good':'bad';
  if(moment.kind==='verdict')return moment.title==='Evil found.'?'good':'bad';
  if(['PIETY','HEARTHWARD','ASYLUM','ALIBI','MERCY'].includes(moment.cardKind??''))return 'good';
  if(['CURSE','EVIDENCE','TESTIMONY','WITNESS','STOCKS'].includes(moment.cardKind??''))return 'bad';
  return 'mystery';
}
