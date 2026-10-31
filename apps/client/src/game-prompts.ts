let quantityDialog:HTMLDialogElement|null=null;
let activeDialog:HTMLDialogElement|null=null;
let serial=0;

function prompt(title:string,message:string):HTMLDialogElement {
  const dialog=document.createElement('dialog');dialog.className='game-prompt';
  const heading=`game-prompt-${++serial}`;dialog.setAttribute('aria-labelledby',heading);dialog.setAttribute('aria-describedby',`${heading}-message`);
  dialog.innerHTML=`<form><header><span class="eyebrow">ASHFALL COUNCIL</span><button type="button" class="prompt-close" aria-label="Close dialog">×</button></header><h2 id="${heading}"></h2><p class="prompt-message"></p><div class="prompt-content"></div><footer><button type="button" class="prompt-cancel" autofocus>Cancel</button><button type="submit" class="prompt-confirm primary"></button></footer></form>`;
  dialog.querySelector('h2')!.textContent=title;dialog.querySelector('.prompt-message')!.textContent=message;dialog.querySelector('.prompt-message')!.id=`${heading}-message`;
  dialog.querySelector('.prompt-cancel')!.addEventListener('click',()=>dialog.close('cancel'));
  dialog.querySelector('.prompt-close')!.addEventListener('click',()=>dialog.close('cancel'));
  dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close('cancel');}});
  return dialog;
}
function show<T>(dialog:HTMLDialogElement,result:()=>T):Promise<T> {
  activeDialog?.close('cancel');const focus=document.activeElement?.closest('#mobile-menu')?document.getElementById('mobile-menu-toggle'):document.activeElement as HTMLElement|null;
  activeDialog=dialog;document.body.append(dialog);dialog.showModal();
  return new Promise(resolve=>dialog.addEventListener('close',()=>{
    const value=result();dialog.remove();if(activeDialog===dialog)activeDialog=null;
    if(focus?.isConnected)focus.focus({preventScroll:true});resolve(value);
  },{once:true}));
}
export function dismissGamePrompt():void {activeDialog?.close('cancel');}
export function cancelCardQuantity():void {quantityDialog?.close('cancel');quantityDialog=null;}
export function confirmGameAction(kind:'leave'|'end',forfeit:boolean):Promise<boolean> {
  const dialog=prompt(kind==='end'?'End this match?':'Leave the council?',kind==='end'
    ? 'This ends the match for everyone. The other players return to the room lobby, and you return to the main menu.'
    : forfeit?'Leaving forfeits your seat and reveals your remaining Life cards. You cannot rejoin this match. Return to the main menu?':'You will leave this room and return to the main menu.');
  dialog.dataset.prompt=kind;dialog.classList.add('prompt-destructive');
  dialog.querySelector('.prompt-cancel')!.textContent=kind==='end'?'Keep playing':'Stay here';
  dialog.querySelector('.prompt-confirm')!.textContent=kind==='end'?'End match & leave':'Leave to menu';
  dialog.querySelector('form')!.addEventListener('submit',event=>{event.preventDefault();dialog.close('confirm');});
  return show(dialog,()=>dialog.returnValue==='confirm');
}
export function askCardQuantity(title:string,available:number,selected:number):Promise<number|null> {
  cancelCardQuantity();const dialog=prompt('How many cards?',`${title} · ${available} in your hand`);quantityDialog=dialog;dialog.dataset.prompt='quantity';
  dialog.querySelector('.prompt-content')!.innerHTML=`<label for="card-quantity">Cards to play together</label><div class="prompt-quantity"><button type="button" data-step="-1" aria-label="One fewer card">−</button><input id="card-quantity" type="number" inputmode="numeric" min="1" max="${available}" step="1" value="${Math.max(1,selected)}"><button type="button" data-step="1" aria-label="One more card">+</button></div><button type="button" class="prompt-all">Use all ${available}</button><p class="prompt-note">Choose the number, then choose a player at the table. You will review the effect before playing.</p>`;
  const input=dialog.querySelector<HTMLInputElement>('input')!,button=dialog.querySelector<HTMLButtonElement>('.prompt-confirm')!;
  const update=()=>{const value=Number(input.value),valid=Number.isInteger(value)&&value>=1&&value<=available;button.disabled=!valid;button.textContent=`Select ${valid?value:''} ${value===1?'card':'cards'}`;dialog.querySelector<HTMLButtonElement>('[data-step="-1"]')!.disabled=valid&&value===1;dialog.querySelector<HTMLButtonElement>('[data-step="1"]')!.disabled=valid&&value===available;};
  input.addEventListener('input',update);
  dialog.querySelectorAll<HTMLButtonElement>('[data-step]').forEach(step=>step.addEventListener('click',()=>{input.value=String(Math.max(1,Math.min(available,(Number(input.value)||1)+Number(step.dataset.step))));update();}));
  dialog.querySelector('.prompt-all')!.addEventListener('click',()=>{input.value=String(available);update();});
  dialog.querySelector('form')!.addEventListener('submit',event=>{event.preventDefault();if(!button.disabled&&input.checkValidity())dialog.close('confirm');});update();
  return show(dialog,()=>{if(quantityDialog===dialog)quantityDialog=null;return dialog.returnValue==='confirm'?Number(input.value):null;});
}
