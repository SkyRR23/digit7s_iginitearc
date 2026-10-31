import {audio,cardSound,type Cue} from './audio';
import type {GameMoment} from './moment-script';
import {eventSoundMood} from './event-sound-mood';

export interface EventEffect {pause():void;resume():void;stop():void}
type Beat={at:number;cue:Cue;tag:string;mark?:number};
const storageKey='ashfall.event-cues.v1';
let heard=new Set<string>();
try{const saved=JSON.parse(sessionStorage.getItem(storageKey)??'[]');if(Array.isArray(saved))heard=new Set(saved.filter(value=>typeof value==='string').slice(-256));}catch{}
function remember(key:string):boolean {
  if(heard.has(key))return false;heard.add(key);if(heard.size>256)heard=new Set([...heard].slice(-256));
  try{sessionStorage.setItem(storageKey,JSON.stringify([...heard]));}catch{}return true;
}
export function playEventOnce(cue:Cue,key:string):void {if(remember(key))audio.play(cue,key);}
const themes:Record<string,string>={CURSE:'curse',COUNCIL_BELL:'bell',CONSPIRACY:'conspiracy',CINDER_SHIFT:'shift',VOW_OF_HEARTS:'vow',WHISPER:'whisper',EAVESDROP:'eavesdrop',DISPEL:'dispel',ASYLUM:'shield',PIETY:'shield',HEARTHWARD:'shield',SCAPEGOAT:'transfer',STOCKS:'stocks',EVIDENCE:'accusation',TESTIMONY:'accusation',WITNESS:'accusation'};
export function eventTheme(moment:GameMoment,revealStage?:string):string {
  if(moment.blocked)return 'blocked';
  if(moment.kind==='reveal')return revealStage==='portrait'?(moment.sealKind==='WITCH'?'reveal-evil':'reveal-good'):'announcement';
  return moment.cardKind?themes[moment.cardKind]??'paper':moment.kind==='phase'?(moment.phase==='DAY'?'day':'night'):moment.kind;
}
export function eventBeats(moment:GameMoment,revealStage?:string):Beat[] {
  const mood=eventSoundMood(moment,revealStage),glow:Cue=mood==='good'?'glow-good':mood==='bad'?'glow-bad':'glow-mystery';
  if(moment.kind==='reveal')return revealStage==='portrait'?[{at:0,cue:'flip',tag:'portrait-flip'},{at:.14,cue:mood==='bad'?'reveal-dark':'reveal',tag:'portrait-impact'},{at:.72,cue:glow,tag:'portrait-decay'}]:[{at:0,cue:'glow-mystery',tag:'announcement'}];
  if(moment.kind==='position')return [{at:.08,cue:'position',tag:'position-highlight'}];
  if(moment.kind==='victory')return [{at:.18,cue:mood==='bad'?'glow-bad':'result-accent',tag:'result-accent'}];
  if(moment.kind==='phase')return [{at:.08,cue:glow,tag:'phase-atmosphere'},{at:.2,cue:moment.phase==='DAY'||moment.phase==='DAWN'?'dawn':'night',tag:'phase-rise'}];
  if(moment.kind==='resume')return [{at:.08,cue:'resume',tag:'hunt-rise'}];
  if(moment.kind==='verdict')return [{at:.12,cue:glow,tag:'verdict-rise'},{at:.3,cue:'verdict',tag:'verdict-impact'}];
  if(moment.kind==='death')return [{at:.06,cue:'glow-bad',tag:'lantern-dim'},{at:.18,cue:'death',tag:'lantern-out'}];
  if(moment.kind==='power')return [{at:.2,cue:'glow-mystery',tag:'private-power'}];
  const beats:Beat[]=[{at:0,cue:'place',tag:'entrance'}];
  const kind=moment.cardKind,physical=['EVIDENCE','TESTIMONY','WITNESS','STOCKS'].includes(kind??'');
  beats.push({at:.09,cue:glow,tag:'aura-rise'});
  if(moment.blocked)beats.push({at:.28,cue:'fizzle',tag:'blocked-impact'});
  else if(kind!=='EVIDENCE'&&kind!=='TESTIMONY'&&kind!=='WITNESS')beats.push({at:kind==='COUNCIL_BELL'?.1:.28,cue:cardSound(kind),tag:'activation'});
  const marks=moment.blocked?0:moment.doubtMarks??0;
  for(let i=0;i<marks;i++)beats.push({at:.28+i*.045,cue:i===marks-1&&moment.reachesSeven?'threshold':i===0&&kind==='TESTIMONY'?'heavy-stamp':'stamp',tag:`doubt-${i}`,mark:i});
  if(kind==='SCAPEGOAT'||kind==='CINDER_SHIFT'||kind==='CONSPIRACY')beats.push({at:.58,cue:'place',tag:'transfer-arrival'});
  if(!physical)beats.push({at:.85,cue:'release',tag:'dissolve'});
  return beats.sort((a,b)=>a.at-b.at);
}

/** This animation's currentTime drives both the glow and its audio milestones. */
export function startEventEffect(stage:HTMLElement,moment:GameMoment,quiet:boolean,revealStage?:string,duration=moment.duration):EventEffect {
  const theme=eventTheme(moment,revealStage),scope=moment.soundKey??`${moment.kind}:${moment.cardKind??''}:${moment.title}`;
  const segment=revealStage??moment.kind,key=`${scope}:${segment}`;
  stage.dataset.effect=theme;
  stage.dataset.soundMood=eventSoundMood(moment,revealStage);
  const layer=document.createElement('div');layer.className=`event-fx-layer fx-${theme}`;layer.setAttribute('aria-hidden','true');
  layer.innerHTML='<i class="event-orbit orbit-one"></i><i class="event-orbit orbit-two"></i><i class="event-ripple"></i><i class="event-veil-thread"></i>'+Array.from({length:quiet?4:10},(_,i)=>`<i class="event-mote" style="--mote:${i}"></i>`).join('');stage.prepend(layer);
  const animations:Animation[]=[];
  // Even reduced motion retains a quiet finite luminance timeline for cue timing.
  const peak=revealStage==='portrait'?.14:moment.cardKind==='COUNCIL_BELL'?.1:.28;
  const clock=layer.animate([{opacity:.02,offset:0},{opacity:quiet?.2:.45,offset:Math.min(.09,peak/2)},{opacity:quiet?.35:1,offset:peak},{opacity:.45,offset:.6},{opacity:0,offset:1}],{duration,fill:'both',easing:'linear'});animations.push(clock);
  const hero=stage.querySelector<HTMLElement>('.revealed-character-card,.moment-art');
  if(hero&&!['resume','verdict'].includes(moment.kind))animations.push(hero.animate([{filter:'brightness(1)',offset:0},{filter:`brightness(${quiet?1.05:1.18}) drop-shadow(0 0 ${quiet?8:24}px var(--event-light))`,offset:peak},{filter:'brightness(1)',offset:1}],{duration,fill:'both'}));
  if(!quiet){
    const route=stage.querySelector<HTMLElement>('.moment-direction');
    if(route&&['shift','transfer','conspiracy','vow'].includes(theme))animations.push(route.animate([{transform:'translateX(-18px)',opacity:0,offset:0},{transform:'translateX(0)',opacity:1,offset:.28},{transform:'translateX(18px)',opacity:.2,offset:.58},{transform:'translateX(0)',opacity:1,offset:1}],{duration,fill:'both'}));
    layer.querySelectorAll<HTMLElement>('.event-orbit,.event-ripple').forEach((node,index)=>animations.push(node.animate([{transform:`scale(.65) rotate(${index*30}deg)`,opacity:0,offset:0},{transform:`scale(1) rotate(${index*30+35}deg)`,opacity:1,offset:.28},{transform:`scale(${1.3+index*.25}) rotate(${index*30+100}deg)`,opacity:0,offset:1}],{duration,fill:'both'})));
    layer.querySelectorAll<HTMLElement>('.event-mote').forEach((node,index)=>animations.push(node.animate([{transform:'translate(0,20px) scale(.4)',opacity:0},{transform:`translate(${(index%2?1:-1)*(12+index*4)}px,${-15-index*5}px) scale(1)`,opacity:.8,offset:.35},{transform:`translate(${(index%2?1:-1)*(40+index*4)}px,${-80-index*8}px) scale(.2)`,opacity:0}],{duration,delay:index*13,fill:'both'})));
  }
  const beats=eventBeats(moment,revealStage),done=new Set<number>();let frame=0,stopped=false;
  const marks:HTMLElement[]=[];
  if((moment.doubtMarks??0)>0&&!moment.blocked){const track=document.createElement('div');track.className='event-doubt-marks';track.setAttribute('aria-label',`${moment.doubtMarks} Doubt added`);for(let i=0;i<moment.doubtMarks!;i++){const mark=document.createElement('i');mark.textContent='×';track.append(mark);marks.push(mark);}stage.querySelector('.moment-people')?.after(track);}
  const tick=()=>{
    if(stopped)return;const elapsed=Number(clock.currentTime??0),progress=elapsed/duration;
    for(let index=0;index<beats.length;index++){
      const beat=beats[index]!;if(done.has(index)||progress<beat.at)continue;done.add(index);
      if(beat.mark!==undefined){const mark=marks[beat.mark];if(mark){mark.classList.add('mark-visible');if(!quiet){const pop=mark.animate([{transform:'scale(1.8)',opacity:.2},{transform:'scale(1)',opacity:1}],{duration:220,fill:'both'});animations.push(pop);}}}
      // A suspended/late browser frame must not replay an obsolete activation.
      if(elapsed-beat.at*duration>220||!remember(`${key}:${beat.tag}`))continue;
      audio.play(beat.cue,`${key}:${beat.tag}`,scope);
      stage.dispatchEvent(new CustomEvent('ashfall:event-cue',{bubbles:true,detail:{scope,cue:beat.cue,milestone:beat.tag,time:elapsed,scheduled:beat.at*duration}}));
    }
    if(clock.playState!=='finished')frame=requestAnimationFrame(tick);
  };
  audio.prepare(...beats.map(beat=>beat.cue));tick();
  return {pause(){cancelAnimationFrame(frame);animations.forEach(animation=>animation.pause());audio.stopScope(scope);},resume(){animations.forEach(animation=>{if(animation.playState==='paused')animation.play();});tick();},stop(){stopped=true;cancelAnimationFrame(frame);animations.forEach(animation=>animation.cancel());audio.stopScope(scope);layer.remove();stage.querySelector('.event-doubt-marks')?.remove();}};
}
