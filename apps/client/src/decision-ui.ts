import { IDENTITY_LABELS, type DayIntent, type RoomView } from '@ashfall/shared';
import { emblem } from './art';
import { cardArt } from './card-info';
import { cardTitle } from './card-info';
import { cardGlyph } from './card-art';
import { lifeSymbol } from './life-details';
import { inkBurst } from './game-moments';

const esc = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
let panel: HTMLElement | null = null;
let dismissed = '';
let inspected = '';
let clockOffset=0;
let clockView:RoomView|null=null;
let renderKey='';
let pendingChoice=false;
let previousBlocked=false;
export function renderDecisionUI(view: RoomView | null, blocked: boolean, choose: (intent: DayIntent) => void, vote: (id:string)=>void): void {
  if(!panel) { panel=document.createElement('section');panel.id='decision-panel';document.body.append(panel);
    panel.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const buttons=Array.from(panel!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      if(!buttons.length){event.preventDefault();return;}
      const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
      if(event.shiftKey&&index<=0){event.preventDefault();buttons.at(-1)!.focus();}
      else if(!event.shiftKey&&(index<0||index===buttons.length-1)){event.preventDefault();buttons[0]!.focus();}
    }); }

  if(view!==clockView) { clockView=view;clockOffset=view?.serverTime===undefined?0:view.serverTime-Date.now(); }
  const day=view?.day, me=view?.you?.playerId;
  if(!view||!day||!me||view.phase==='GAME_OVER'||view.presentation){panel.replaceChildren();panel.hidden=true;renderKey='';pendingChoice=false;return;}
  const name=(id:string)=>esc(view.players.find(player=>player.id===id)?.name??'A player');
  const lifeKey=view.phase==='REVEAL_RESOLUTION'&&day.reveal?`${view.deal?.matchId}:${day.version}:${day.reveal.targetId}:${day.reveal.chooserId}`:'';
  if(lifeKey&&lifeKey===renderKey&&!panel.hidden) {
    if(previousBlocked&&!blocked)pendingChoice=false;
    previousBlocked=blocked;
    panel.querySelectorAll<HTMLButtonElement>('[data-reveal-choice]').forEach(button=>{
      button.disabled=blocked||pendingChoice||day.reveal!.chooserId!==me||button.dataset.publicRevealed==='true';
      if(!pendingChoice)button.classList.remove('decision-selected');
    });
    const clock=panel.querySelector<HTMLElement>('[data-decision-deadline]');if(clock)clock.dataset.decisionDeadline=String(day.deadline??0);
    updateDecisionTimers();return;
  }
  renderKey=lifeKey;previousBlocked=blocked;pendingChoice=false;
  panel.replaceChildren();panel.hidden=true;panel.classList.toggle('life-decision',!!lifeKey);panel.classList.toggle('council-decision',view.phase==='DAY'&&!!day.council?.open);
  let content='';
  if(view.phase==='REVEAL_RESOLUTION'&&day.reveal) {
    const reveal=day.reveal, own=reveal.chooserId===me;
    const seals=view.deal?.players.find(player=>player.playerId===reveal.targetId)?.seals??[];
    content=`<span class="eyebrow">SEVEN DOUBT · TURN TIMER PAUSED</span><h2>${own?'Choose a Life card':`Waiting for ${name(reveal.chooserId)}`}</h2><p>${own?`Choose which of ${name(reveal.targetId)}’s hidden Life cards to flip.`:'Waiting for another player to finish their action.'}</p><strong class="decision-clock" data-decision-deadline="${day.deadline??0}"></strong><div class="decision-lives">${seals.map((seal,index)=>`<button type="button" class="life-fate-card ${seal.revealed?'life-already-revealed':''}" style="--life-order:${index}" data-reveal-choice="${seal.slot}" data-public-revealed="${seal.revealed}" ${!own||blocked||seal.revealed?'disabled':''} aria-label="${seal.revealed?'Already revealed: '+IDENTITY_LABELS[seal.kind]:'Choose Life card '+(seal.slot+1)}"><span class="life-slot-number">${seal.slot+1}</span><span class="life-card-face">${seal.revealed?`<span class="life-public-face">${lifeSymbol(seal.kind)}</span>`:'<img class="life-card-paint" src="/art/cards/hidden-life-v1.webp" alt="" draggable="false">'}<span class="life-card-gleam" aria-hidden="true"></span></span><small>${seal.revealed?IDENTITY_LABELS[seal.kind]:'Hidden Life'}</small></button>`).join('')}</div><small>If time runs out, the first remaining hidden Life card flips automatically.</small>`;
  } else if(day.council?.open) {
    const canVote=!view.councilVote?.yourTargetId&&view.deal?.players.some(p=>p.playerId===me&&p.alive);
    content=`<header class="council-summons"><div class="council-bell-art"><img src="${cardArt('COUNCIL_BELL')}" alt=""><span aria-hidden="true"></span></div><div><span class="eyebrow">COUNCIL BELL &middot; THE COUNCIL IS CALLED</span><h2>Hear ye, hear ye!</h2><p>${canVote?'Choose who must answer to the council. Your ballot is final.':view.councilVote?.yourTargetId?'Your ballot is sealed. Await the verdict.':'The living council is casting its ballots.'}</p></div></header><div class="council-tally"><strong class="decision-clock" data-decision-deadline="${day.deadline??0}"></strong><span><b>${view.councilVote?.votesCast??0}</b> ballots sealed</span><span><b>${view.councilVote?.required??0}</b> matching votes to condemn</span></div><div class="decision-ballots">${view.deal?.players.filter(p=>p.alive).map(p=>{const player=view.players.find(player=>player.id===p.playerId);const chosen=view.councilVote?.yourTargetId===p.playerId;return `<button type="button" class="council-candidate ${chosen?'ballot-sealed':''}" data-council-choice="${p.playerId}" ${!canVote||blocked?'disabled':''} aria-label="${chosen?'Your sealed vote: ':'Vote to condemn '}${name(p.playerId)}"><span class="council-avatar">${player?emblem(player.avatar):''}</span><strong>${name(p.playerId)}</strong><small>${chosen?'BALLOT SEALED':'CAST BALLOT'}</small></button>`;}).join('')}</div><small class="council-vote-note">A split council condemns no one. The vote closes when all ballots are sealed or time runs out.</small>`;
  } else if(view.handPeek&&view.handPeek.expiresAt>Date.now()+clockOffset) {
    const peek=view.handPeek; inspected=peek.id;
    if(dismissed===inspected)return;
    content=`<span class="eyebrow">EAVESDROP · YOUR EYES ONLY</span><h2>${name(peek.targetId)}’s playable hand</h2><p>This is a snapshot. Their cards remain in their hand.</p><strong class="decision-clock" data-decision-deadline="${peek.expiresAt}"></strong><div class="decision-hand">${peek.cards.map(card=>`<div>${cardGlyph(card.kind)}<b>${esc(cardTitle(card.kind))}</b></div>`).join('')||'<p>Their hand was empty.</p>'}</div><button type="button" id="close-hand-insight">Cover hand</button>`;
  }
  if(!content)return;
  panel.hidden=false;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Current council decision');
  panel.innerHTML=`${lifeKey||day.council?.open?`<div class="decision-atmosphere" aria-hidden="true"><div class="moment-aura"></div>${inkBurst()}<div class="decision-glass-sheen"></div></div>`:''}<div class="decision-content">${content}</div>`;
  panel.querySelectorAll<HTMLButtonElement>('[data-reveal-choice]').forEach(button=>button.onclick=()=>{
    if(pendingChoice||button.disabled)return;
    pendingChoice=true;button.classList.add('decision-selected');
    const box=button.getBoundingClientRect(),echo=button.cloneNode(true) as HTMLButtonElement;
    echo.removeAttribute('data-reveal-choice');echo.disabled=true;echo.tabIndex=-1;echo.setAttribute('aria-hidden','true');echo.className='life-choice-echo';
    Object.assign(echo.style,{left:`${box.left}px`,top:`${box.top}px`,width:`${box.width}px`,height:`${box.height}px`});
    document.body.append(echo);setTimeout(()=>echo.remove(),450);
    panel!.querySelectorAll<HTMLButtonElement>('[data-reveal-choice]').forEach(card=>card.disabled=true);
    choose({type:'revealSeal',slot:Number(button.dataset.revealChoice)});
  });
  panel.querySelectorAll<HTMLButtonElement>('[data-council-choice]').forEach(button=>button.onclick=()=>vote(button.dataset.councilChoice!));
  panel.querySelector('#close-hand-insight')?.addEventListener('click',()=>{dismissed=inspected;panel!.hidden=true;panel!.replaceChildren();});
  updateDecisionTimers();
}
export function updateDecisionTimers():void {
  panel?.querySelectorAll<HTMLElement>('[data-decision-deadline]').forEach(el=>{
    const seconds=Math.max(0,Math.ceil((Number(el.dataset.decisionDeadline)-Date.now()-clockOffset)/1000));el.textContent=`${seconds}s`;
    if(seconds===0&&panel?.querySelector('#close-hand-insight')) {panel.hidden=true;panel.replaceChildren();}
  });
}
window.addEventListener('blur',()=>{if(panel?.querySelector('#close-hand-insight')){dismissed=inspected;panel.hidden=true;panel.replaceChildren();}});
