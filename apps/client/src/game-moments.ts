import {audio, cardSound} from './audio';
import type { RoomView, TableEffect } from '@ashfall/shared';
import { MOMENT_DURATION, REVEAL_STAGES, publicMoments, type GameMoment } from './moment-script';
import { renderLifeReveal } from './life-reveal';
import { phaseIcon } from './phase-ui';
import { roleArt } from './role-art';
import { reducedGameMotion } from './game-preferences';
import { lifeSymbol } from './life-details';
import { emblem } from './art';

let queue: GameMoment[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let stage: HTMLElement | null = null;
let match = '';
let activePresentationId='';
let handledPresentationId='';
let heldForGuide=false;
let resultCue: 'victory'|'defeat' = 'victory';
function finishedPresentation():void {
  const id=activePresentationId;activePresentationId='';
  if(id)document.dispatchEvent(new CustomEvent('ashfall:presentation-finished',{detail:{id}}));
}
let paused = false;
let dueAt = 0;
let remaining = 0;
let scheduled: (() => void) | null = null;
function schedule(callback: () => void, delay: number): void {
  clearTimeout(timer); scheduled = callback; remaining = delay; dueAt = Date.now() + delay;
  timer = setTimeout(callback, delay);
}
let privateTargets: { matchId: string; ownerId: string; role: string; targets: NonNullable<GameMoment['targets']> } | null = null;
/** This intent is held only in the browser that confirmed the private power. */
export function rememberPrivatePowerTargets(view: RoomView | null, ids: string[]): void {
  privateTargets = view?.deal && view.role && view.you ? { matchId: view.deal.matchId, ownerId: view.you.playerId, role: view.role.kind,
    targets: ids.map(id => { const player = view.players.find(p => p.id === id); return { name: player?.name ?? 'A player', avatar: player?.avatar, label: 'USED ON' }; }) } : null;
}
export function forgetPrivatePowerTargets(): void { privateTargets = null; }
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]!);
export function inkBurst(): string {
  const rays = Array.from({ length: 12 }, (_, i) => {
    const start = i % 2 ? -70 : 1070;
    const end = i % 2 ? 280 + i * 7 : 720 - i * 7;
    const y = i * 59 - 20;
    return `<path class="ink-ray" d="M${start} ${y} ${end} ${255 + i * 11} ${start} ${y + 3 + i % 4}Z"/>`;
  }).join('');
  return `<div class="moment-ink" aria-hidden="true"><svg viewBox="0 0 1000 650" preserveAspectRatio="none"><path class="ink-slash" d="M-40 280 110 223 86 244 330 168 307 187 710 120 680 140 970 170 938 184 1030 390 810 416 847 399 520 458 548 440 310 480 334 463 30 445Z"/>${rays}</svg></div>`;
}
function resetMoments():void {
  clearTimeout(timer); timer = undefined; queue = []; stage?.remove(); stage = null; privateTargets = null; paused = false; scheduled = null;
  heldForGuide=false;document.body.classList.remove('cinematic-active');
  document.querySelectorAll('.revealed-slot-emphasis').forEach(element => element.classList.remove('revealed-slot-emphasis'));
}
export function clearGameMoments():void {resetMoments();finishedPresentation();}
function showNext(): void {
  stage?.remove(); stage = null; clearTimeout(timer); timer = undefined; paused = false; scheduled = null;
  document.querySelectorAll('.revealed-slot-emphasis').forEach(element => element.classList.remove('revealed-slot-emphasis'));
  if (document.hidden) { queue = [];document.body.classList.remove('cinematic-active');finishedPresentation(); return; }
  const moment = queue.shift(); if (!moment) {document.body.classList.remove('cinematic-active');finishedPresentation();return;}
  document.body.classList.add('cinematic-active');
  const quiet = reducedGameMotion();
  stage = document.createElement('section'); stage.id = 'game-moment';
  stage.className = `game-moment moment-${moment.kind} tone-${moment.tone}${moment.kind === 'position' ? ' moment-reveal' : ''}${quiet ? ' moment-quiet' : ''}${moment.heavy ? ' moment-heavy' : ''}`;
  stage.dataset.kind = moment.kind;
  if(moment.cardKind)stage.dataset.cardKind=moment.cardKind; stage.setAttribute('aria-label', `${moment.title}. ${moment.description}`);
  stage.style.setProperty('--moment-duration', `${moment.duration}ms`);
  const artwork = moment.art ? `<img src="${moment.art}" alt="">` : moment.phase ? phaseIcon(moment.phase)
    : moment.sealKind ? lifeSymbol(moment.sealKind) : moment.kind === 'death'
      ? '<span class="moment-death-sigil" aria-hidden="true">×</span>' : '<span class="moment-verdict" aria-hidden="true">✦</span>';
  const people = moment.actor && moment.targets ? `<div class="moment-people" aria-label="Card actor and targets">
    <div class="moment-person moment-actor">${moment.actor.avatar ? emblem(moment.actor.avatar) : ''}<div><small>${moment.kind === 'power' ? 'USED BY' : 'PLAYED BY'}</small><strong>${escape(moment.actor.name)}</strong></div></div>
    <span class="moment-direction" aria-hidden="true">→</span>
    ${moment.targets.map(target => `<div class="moment-person moment-target">${target.avatar ? emblem(target.avatar) : '<span class="moment-group" aria-hidden="true">✦</span>'}<div><small>${target.label}</small><strong>${escape(target.name)}</strong></div></div>`).join('')}
  </div>` : '';
  stage.innerHTML = `<div class="moment-veil"></div><div class="moment-aura" aria-hidden="true"></div>${inkBurst()}${moment.cardKind==='COUNCIL_BELL'?'<div class="bell-shockwaves" aria-hidden="true"><i></i><i></i><i></i></div>':moment.cardKind==='CURSE'?'<div class="curse-shadows" aria-hidden="true"><i></i><i></i><i></i></div>':''}
    <div class="moment-content"><span class="moment-rule"></span>
      <p class="moment-eyebrow">${escape(moment.eyebrow)}</p><div class="moment-art">${artwork}</div>
      <h2>${escape(moment.title)}</h2>${people || (moment.route ? `<p class="moment-route"><span aria-hidden="true">↓</span> ${escape(moment.route)}</p>` : '')}
      <p class="moment-description">${escape(moment.description)}</p><span class="moment-rule"></span>
    </div><div class="moment-controls"><small class="moment-pause-note">${moment.kind === 'victory' ? 'Match ended. Close the verdict to view results.' : 'Gameplay and timer paused &middot; everyone finishes before play resumes'}</small><button type="button" class="moment-help">Card info ?</button><button type="button" class="moment-hold" aria-pressed="false">Keep open</button><button type="button" class="moment-next">Next <span aria-hidden="true">→</span></button><button type="button" class="moment-skip" aria-label="Dismiss animation">${moment.kind === 'victory' ? 'View results' : 'Back to table'}</button></div>`;
  stage.querySelector('.moment-help')?.addEventListener('click',()=>{
    heldForGuide=!paused;if(heldForGuide)stage?.querySelector<HTMLButtonElement>('.moment-hold')?.click();
    document.dispatchEvent(new Event('ashfall:open-guide'));
  });
  stage.querySelector('.moment-skip')?.addEventListener('click', () => { queue = []; showNext(); });
  stage.querySelector('.moment-next')?.addEventListener('click', () => {
    clearTimeout(timer); paused = false; stage?.classList.remove('moment-paused');
    const hold = stage?.querySelector('.moment-hold'); hold?.setAttribute('aria-pressed','false'); if (hold) hold.textContent = 'Keep open';
    scheduled?.();
  });
  stage.querySelector<HTMLButtonElement>('.moment-hold')?.addEventListener('click', event => {
    const button = event.currentTarget as HTMLButtonElement;
    paused = !paused; stage?.classList.toggle('moment-paused', paused); button.setAttribute('aria-pressed', String(paused));
    button.textContent = paused ? 'Resume' : 'Keep open';
    if (paused) { remaining = Math.max(0, dueAt - Date.now()); clearTimeout(timer); }
    else if (scheduled) schedule(scheduled, remaining);
  });
  document.body.append(stage);
  if(moment.kind==='card')audio.play(cardSound(moment.cardKind));
  else if(moment.kind==='death')audio.play('death');
  else if(moment.kind==='phase')audio.play(moment.phase==='DAY'?'dawn':'night');
  else if(moment.kind==='victory')audio.play(resultCue);
  if (moment.heavy && !quiet) {
    document.getElementById('action-spotlight')?.animate([
      { transform: 'translate(0,0)' }, { transform: 'translate(-3px,1px)', offset: .2 },
      { transform: 'translate(3px,-1px)', offset: .4 }, { transform: 'translate(-1px,1px)', offset: .65 },
      { transform: 'translate(0,0)' },
    ], { duration: 230, delay: 90, easing: 'steps(2,end)' });
  }
  if (moment.kind === 'reveal' && moment.reveal) {
    const renderStep = (index: number) => {
      const step = REVEAL_STAGES[index]; if (!step || !stage) { showNext(); return; }
      stage.dataset.revealStage = step.name;
      if(index===1)audio.play('reveal');
      stage.querySelector('.moment-content')!.innerHTML = renderLifeReveal(moment, step.name);
      schedule(() => renderStep(index + 1), step.duration);
    };
    renderStep(0);
  } else {
    if (moment.kind === 'position' && moment.reveal) {
      stage.dataset.revealStage = 'position';
      stage.querySelector('.moment-content')!.innerHTML = renderLifeReveal(moment,'position');
      document.querySelector(`[data-player="${moment.reveal.playerId}"] [data-seal-slot="${moment.reveal.slot}"]`)?.classList.add('revealed-slot-emphasis');
    }
    schedule(showNext, moment.duration);
  }
}
export function animateGameMoments(previous: RoomView | null, next: RoomView, effects: TableEffect[]): void {
  const outcome=next.day?.outcome;
  resultCue=outcome?.winner==='SCAPEGOAT'?(outcome.playerId===next.you?.playerId?'victory':'defeat')
    : outcome&&next.private?((outcome.winner==='WITCH')===next.private.everWitch?'victory':'defeat'):'victory';
  const id = next.deal?.matchId ?? '';
  if(!previous||!id||id!==match){activePresentationId='';handledPresentationId='';resetMoments();match=id;}
  if(next.presentation!==undefined) {
    const presentation=next.presentation;
    if(!presentation){activePresentationId='';resetMoments();return;}
    if(handledPresentationId===presentation.id) {
      if(!presentation.awaitingYou){activePresentationId='';resetMoments();}
      return;
    }
    activePresentationId='';resetMoments();handledPresentationId=presentation.id;
    if(!presentation.awaitingYou||presentation.scope==='WAIT')return;
    activePresentationId=presentation.id;
    if(document.hidden){finishedPresentation();return;}
    if(presentation.scope==='PUBLIC') {
      queue=publicMoments({...next,phase:presentation.previousPhase??next.phase},next,presentation.events??[]);
    } else {
      const action=presentation.privateAction,role=next.role;
      if(action?.kind==='SLEUTH'&&role?.peek)return;
      if(action&&role&&action.kind===role.kind&&['HERBALIST','GOSSIP','HEXER'].includes(action.kind)) {
        const owner=next.players.find(player=>player.id===next.you?.playerId);
        queue=[{kind:'power',eyebrow:'Your private power',title:role.kind==='HERBALIST'?'Remedy prepared':role.kind==='HEXER'?'Hex sealed':'Whispers compared',
          description:role.result??'Your power is confirmed.',art:roleArt(role.kind),tone:role.kind==='HERBALIST'?'sage':'blue',duration:MOMENT_DURATION.power,
          actor:{name:owner?.name??'You',avatar:owner?.avatar},targets:action.targetIds.map(id=>{const player=next.players.find(player=>player.id===id);return {name:player?.name??'A player',avatar:player?.avatar,label:'USED ON'};})}];
      }
    }
    showNext();return;
  }
  if(!previous||!id)return;
  const moments = publicMoments(previous, next, effects);
  // Role art belongs only to this browser's owner. Never manufacture a public role event.
  if (previous.role?.ability === 'AVAILABLE' && next.role && ['ACTIVE','USED'].includes(next.role.ability) &&
    previous.role.kind === next.role.kind && ['HERBALIST','GOSSIP','HEXER'].includes(next.role.kind)) {
    const confirmed = privateTargets?.matchId === id && privateTargets.role === next.role.kind && privateTargets.ownerId === next.you?.playerId ? privateTargets : null;
    const owner = next.players.find(player => player.id === next.you?.playerId);
    moments.push({ kind: 'power', eyebrow: 'Your private power', title: next.role.kind === 'HERBALIST' ? 'Remedy prepared' : next.role.kind === 'HEXER' ? 'Hex sealed' : 'Whispers compared',
      description: next.role.result ?? 'Your power is confirmed.', art: roleArt(next.role.kind), tone: next.role.kind === 'HERBALIST' ? 'sage' : 'blue', duration: MOMENT_DURATION.power,
      ...(confirmed ? { actor: { name: owner?.name ?? 'You', avatar: owner?.avatar }, targets: confirmed.targets } : {}) });
    privateTargets = null;
  }
  if (!moments.length || document.hidden) return;
  // Preserve a reveal already being read when the live game moves into Night.
  const important = (kind: GameMoment['kind']) => ['reveal','position','verdict','death','victory','resume'].includes(kind);
  if (previous.phase !== next.phase) {
    queue = queue.filter(moment => important(moment.kind));
  }
  queue = [...queue, ...moments];
  while (queue.length > 8) {
    const routine = queue.findIndex(moment => !important(moment.kind));
    queue.splice(routine < 0 ? 0 : routine, 1);
  }
  if (!stage) showNext();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) clearGameMoments(); });
window.addEventListener('blur', clearGameMoments);
document.addEventListener('ashfall:motion-change', clearGameMoments);
document.addEventListener('ashfall:guide-closed',()=>{
  if(heldForGuide&&paused)stage?.querySelector<HTMLButtonElement>('.moment-hold')?.click();
  heldForGuide=false;
});
