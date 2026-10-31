import type {RoomView} from '@ashfall/shared';
import {cardArt} from './card-info';
import {audio} from './audio';
let scene:HTMLElement|undefined,timer:HTMLElement|undefined;
let deadline=0,receivedAt=0,serverTime=0,key='',selected='',entered='';
const sealed=new Set<string>();
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
export function updateOpeningTimer():void {
  if(!timer||!deadline)return;
  const seconds=Math.max(0,Math.ceil((deadline-serverTime-(performance.now()-receivedAt))/1000));
  timer.textContent=`${timer.dataset.label} — ${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  timer.classList.toggle('opening-urgent',seconds<=15);
}
export function renderOpening(view:RoomView|null,blocked:boolean,vote:(id:string)=>Promise<boolean>):void {
  const opening=view?.opening,match=view?.deal?.matchId;
  if(!view||!opening||!match){if(scene)audio.stopScope(`opening:${entered}`);scene?.remove();scene=undefined;timer?.remove();timer=undefined;key='';deadline=0;document.body.classList.remove('opening-active');return;}
  audio.prepare('swell','glow-mystery');
  deadline=opening.deadline;serverTime=view.serverTime??Date.now();receivedAt=performance.now();
  const acknowledged=!!view.deal?.players.find(p=>p.playerId===view.you?.playerId)?.acknowledged;
  const ritual=view.phase==='OPENING_CURSE';
  const stageKey=`${match}:${view.phase}:${acknowledged}:${view.blackCatChoice?.submitted??false}:${blocked}`;
  if(key===stageKey){updateOpeningTimer();return;}key=stageKey;
  if(!timer){timer=document.createElement('div');timer.className='opening-clock';timer.setAttribute('role','timer');document.body.append(timer);}
  timer.dataset.label=ritual?'CURSE RITUAL':'PRIVATE REVEAL';
  if(!ritual&&!acknowledged){scene?.remove();scene=undefined;document.body.classList.remove('opening-active');updateOpeningTimer();return;}
  document.body.classList.add('opening-active');
  if(!scene){scene=document.createElement('section');scene.id='opening-ritual';scene.tabIndex=-1;scene.setAttribute('role','dialog');scene.setAttribute('aria-modal','true');scene.setAttribute('aria-labelledby','opening-title');document.body.append(scene);
    scene.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const controls=Array.from(scene!.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled)'));if(!controls.length){e.preventDefault();scene!.focus();}else if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls.at(-1)!.focus();}else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0]!.focus();}});
    scene.focus({preventScroll:true});}
  const choice=view.blackCatChoice;
  const living=view.players.filter(p=>view.deal?.players.some(seat=>seat.playerId===p.id&&seat.alive));
  scene.innerHTML=`<div class="opening-screen opening-ashbound"><header><span>THE OPENING COUNCIL</span></header><div class="ritual-art"><img src="${cardArt('CURSE')}" alt="Curse artwork"></div><div class="opening-copy"><span class="opening-allegiance">${ritual?'AN ANCIENT DARKNESS STIRS':'YOUR SECRETS ARE SAFE'}</span><h2 id="opening-title">${ritual?'THE CURSE AWAKENS':'LIFE CARDS SEALED'}</h2><p>${ritual?'Before the council gathers, an ancient darkness must choose its bearer.':'Your Life Card positions are confirmed. Waiting for the council to finish its private inspection.'}</p>${ritual&&opening.inspectionTimedOut?'<p class="seal-transfer-warning">THE COUNCIL CAN WAIT NO LONGER.<br>Your Life Card positions have been sealed.</p>':''}</div><div class="ritual-choice">${ritual&&choice&&!choice.submitted?`<label for="curse-target">CHOOSE WHO BEARS THE CURSE</label><select id="curse-target" ${blocked?'disabled':''}><option value="">Select Council Member</option>${living.map(p=>`<option value="${p.id}" ${selected===p.id?'selected':''}>${escape(p.name)}${p.id===view.you?.playerId?' (you)':''}</option>`).join('')}</select><button id="curse-seal" class="primary" ${blocked||!selected?'disabled':''}>SEAL YOUR VOTE</button><small>Each Cultist submits one secret vote. The player with the most votes receives the Curse. You may target yourself.</small>`:ritual?`<h3>${choice?.submitted?'YOUR VOTE IS SEALED':'SOMEONE WILL BEAR ITS MARK'}</h3><p>${choice?.submitted?'The council will soon discover who bears the Curse.':'An ancient darkness stirs before the first council.'}</p>`:'<p>Confirmed players wait together. No private identities are visible here.</p>'}<p class="ritual-error" role="status">${blocked?'Connecting to the council…':''}</p></div></div>`;
  scene.querySelector<HTMLSelectElement>('#curse-target')?.addEventListener('change',e=>{selected=(e.target as HTMLSelectElement).value;scene!.querySelector<HTMLButtonElement>('#curse-seal')!.disabled=blocked||!selected;});
  scene.querySelector<HTMLButtonElement>('#curse-seal')?.addEventListener('click',async e=>{const target=selected,button=e.currentTarget as HTMLButtonElement;button.disabled=true;const ok=await vote(target);if(!ok&&scene){scene.querySelector('.ritual-error')!.textContent='Your vote was not accepted. Check your connection and try again while time remains.';button.disabled=false;}});
  const firstEntry=entered!==match;
  if(ritual&&entered!==match){entered=match;selected='';audio.play('swell',`opening-enter:${match}`,`opening:${match}`);}
  if(choice?.submitted&&!sealed.has(match)){sealed.add(match);if(sealed.size>30)sealed.delete(sealed.values().next().value!);scene.classList.add('vote-sealed');if(!firstEntry)audio.play('glow-mystery',`opening-sealed:${match}`,`opening:${match}`);}
  updateOpeningTimer();
}
