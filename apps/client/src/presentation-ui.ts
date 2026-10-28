import type { RoomView } from '@ashfall/shared';
import { openGameGuide } from './game-guide';

let wait:HTMLElement;
export function installPresentationUI():void {
  wait=document.createElement('section');wait.id='presentation-wait';wait.hidden=true;wait.setAttribute('role','status');
  wait.innerHTML='<div><span aria-hidden="true">Ⅱ</span><h2>The table is paused</h2><p>Waiting for the close-up to finish.</p><small>Cards, powers, votes and the turn timer are paused.</small><button type="button">Browse cards & roles</button></div>';
  wait.querySelector('button')?.addEventListener('click',()=>openGameGuide('cards'));
  document.body.append(wait);
}
export function updatePresentationUI(view:RoomView|null):void {
  const pause=view?.presentation;
  document.body.classList.toggle('table-paused',!!pause);
  document.body.dataset.presentationRemaining=pause?.remainingMs===null?'':String(pause?.remainingMs??'');
  if(!wait)return;
  wait.hidden=!pause||(pause.scope!=='WAIT'&&pause.awaitingYou);
  const message=wait.querySelector('p');
  if(message)message.textContent=pause?.scope==='WAIT'?'A private action is being read. Its details stay private.':'Waiting for the other players to finish reading.';
}
