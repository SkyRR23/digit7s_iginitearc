import { roleArt, roleDescriptions, roleName } from './role-art';
import { CARD_INFO, cardArt, cardTitle } from './card-info';
import { statusSymbol } from './status-art';
import { renderCredits, installCreditsControls } from './credits';
import { cardQuantities, originalPrototypePreset, type RoomView, type ActionKind } from '@ashfall/shared';
let quantities=cardQuantities(originalPrototypePreset);
export function updateGameGuide(view:RoomView|null):void {
  const next=view?.cardQuantities??cardQuantities(originalPrototypePreset);
  if(JSON.stringify(next)===JSON.stringify(quantities))return;
  quantities=next;if(dialog?.open){const scroll=dialog.scrollTop;render();dialog.scrollTop=scroll;}
}

const roles = ['VILLAGER','ASHBOUND','SLEUTH','HERBALIST','GOSSIP','HEXER','SCAPEGOAT'];
export const GUIDE_STEPS = [
  { title:'Gather your council', image:'lobby', text:'Create a room for 6–10 players. Share its invite code with friends, or fill empty seats with bots. Everyone must be ready before the host deals the cards.' },
  { title:'Meet your role and team', image:'portrait', text:'Your role is private and stays with you. Your Life cards determine your allegiance. If you receive an Evil Life card, you join the Evil team for the rest of the match, even if that card later moves away. Evil teammates are shown privately.' },
  { title:'Inspect your five Lives', image:'life', text:'Reveal your Life cards privately. You may swap their positions before confirming. Ashbound must also seal their opening Curse vote. An opening Curse event effect announces its final holder, who takes the first turn. Conspiracy reveals one of that holder’s hidden Lives; Scapegoat moves the curse and Dispel removes it and returns the same Curse card to the draw pile.' },
  { title:'Play your turn', image:'card-play', text:'Choose a card, then choose a highlighted player other than yourself. For repeatable stacks, tap again to add another copy, or tap the selected count to choose how many. Some cards need two other players, while global cards need no target. Review the effect and confirm. You can play several cards before ending your turn. Alternatively, draw up to two cards and end your turn.' },
  { title:'Use your role power', image:'power', text:'Open You on phones, or tap the role icon in the corner on larger screens. Choose a highlighted player, then read the explanation and answer Yes or No. Gossip needs two other players. Sleuth, Herbalist and Gossip act during Day; Hexer acts at Night. Role powers do not use your card turn. The question mark beside your power opens your private role information.' },
  { title:'Understand a Life reveal', image:'revelation', text:'At seven Doubt, the accuser has 10 seconds to choose a hidden Life card. The main turn clock pauses during this decision. First comes an announcement, then a full Life portrait, then the exact numbered position in the five-card row. A Good Life does not prove the owner’s allegiance. An Evil Life reveal, or revealing every Life on a player, eliminates them. Doubt then clears. Gameplay, bots and the turn timer pause throughout the close-up. Keep open gives you reading time; Back to table finishes your sequence. Play resumes when everyone finishes, with a safety limit for absent players.' },
  { title:'Survive Night and Dawn', image:'night', text:'When the draw pile runs out, Night begins and public chat falls silent. Living Evil players privately vote to attack someone outside their team. A hidden Lanternkeeper Life lets its holder protect another player. Confirm your choices before the timer ends. At Dawn, unused cards stay in your hand and the discard pile becomes the next draw pile.' },
  { title:'Win the hunt', image:'victory', text:'The Village wins when every Evil Life card is revealed. The Ashbound win when every surviving non-neutral player is Ashbound. An Outcast role wins individually only through a completed council vote eliminating them. Voting opens only when the single Council Bell card is played. The host can reopen the room after the match; everyone readies again.' },
] as const;
let active: 'roles' | 'cards' | 'howto' | 'credits' = 'howto';
const tabs=['roles','cards','howto','credits'] as const;
let step = 0;
let dialog: HTMLDialogElement;
let returnFocus: HTMLElement | null = null;

function render(): void {
  const current = GUIDE_STEPS[step]!;
  dialog.innerHTML = `<header class="guide-heading"><div><span class="eyebrow">ASHFALL COUNCIL</span><h2 id="guide-title">${active==='credits'?'Credits & sources':'Know the council'}</h2></div><button id="guide-close" type="button" aria-label="Close game guide">×</button></header>
    <div class="guide-tabs" role="tablist" aria-label="Game guide sections">${tabs.map(tab=>`<button type="button" id="guide-${tab}" role="tab" aria-controls="guide-panel" aria-selected="${active===tab}" tabindex="${active===tab?0:-1}">${tab==='roles'?'Roles & portraits':tab==='cards'?'Cards & effects':tab==='credits'?'Credits':'How to play'}</button>`).join('')}</div>
    <section id="guide-panel" role="tabpanel" aria-labelledby="guide-${active}" tabindex="0">${active === 'roles' ? `<p class="guide-lead">Every role is shown here for reference. This guide never reveals who has which role in your match.</p><div class="guide-roles">${roles.map(role => `<article class="guide-role ${role === 'ASHBOUND' || role === 'HEXER' ? 'guide-ashbound' : ''}"><img src="${roleArt(role)}" alt="${roleName(role).toLowerCase()} portrait" loading="lazy"><div><h3>${roleName(role)}</h3><p>${roleDescriptions[role]}</p></div></article>`).join('')}</div><aside class="guide-life-note"><h3>A role is different from a Life card</h3><p>Five Life cards determine survival and allegiance. Receiving an Evil Life makes you Ashbound for the rest of the match, even if it later moves away. The Lanternkeeper is a Life card, not a fixed role: its night protection moves with the hidden card and ends when that Life is revealed. The neutral Outcast keeps its individual win condition.</p></aside>`
      : active==='cards'?`<p class="guide-lead">All ${Object.keys(CARD_INFO).length} card types, with their exact targets and effects. Counts show the starting match configuration, including the opening Curse. This is a reference library, not anyone’s hand.</p><div class="guide-cards">${(Object.keys(CARD_INFO) as ActionKind[]).map(kind=>{const card=CARD_INFO[kind];return `<article class="guide-card" data-guide-card="${kind}"><img src="${cardArt(kind)}" alt="${cardTitle(kind)} card artwork" loading="lazy"><div><h3>${cardTitle(kind)} <span class="guide-quantity" data-card-quantity="${kind}">${quantities[kind]??0} ${(quantities[kind]??0)===1?'Card':'Cards'}</span></h3><b class="guide-card-brief">${card.brief}</b><dl><dt>Choose</dt><dd>${card.target}</dd><dt>Effect</dt><dd>${card.effect}</dd><dt>Interactions</dt><dd>${card.interaction}</dd></dl></div></article>`;}).join('')}</div><aside class="guide-life-note"><h3>${statusSymbol('BLACK_CAT')} Opening Curse</h3><p>The Evil team secretly chooses who receives the opening Curse. The opening attachment uses the match’s single Curse card. Dispel returns that same card to the draw pile, never to a hand. Ashbound secretly choose its first holder, who starts Day 1. Conspiracy reveals one hidden Life on its current holder; Scapegoat moves it, and Dispel removes it and returns the same Curse card to the draw pile.</p></aside>`
      : active==='credits'?renderCredits(): `<div class="guide-walkthrough"><nav class="guide-step-list" aria-label="How to play steps">${GUIDE_STEPS.map((item,index) => `<button type="button" data-guide-step="${index}" ${index === step ? 'aria-current="step"' : ''}><b>${index + 1}</b><span>${item.title}</span></button>`).join('')}</nav><article class="guide-step"><span class="eyebrow">STEP ${step + 1} OF ${GUIDE_STEPS.length}</span><h3>${current.title}</h3><p>${current.text}</p><footer><button type="button" id="guide-prev" ${step === 0 ? 'disabled' : ''}>← Previous</button><button type="button" id="guide-next">${step === GUIDE_STEPS.length - 1 ? 'Back to step 1' : 'Next step →'}</button></footer></article></div>`}</section>`;
  if(active==='credits')installCreditsControls(dialog);
  dialog.querySelector('#guide-close')?.addEventListener('click', () => dialog.close());
  for (const tab of tabs) dialog.querySelector(`#guide-${tab}`)?.addEventListener('click', () => { active = tab; render(); dialog.querySelector<HTMLButtonElement>(`#guide-${tab}`)?.focus(); });
  dialog.querySelector('.guide-tabs')?.addEventListener('keydown', event => {
    const key = (event as KeyboardEvent).key;
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(key)) return;
    event.preventDefault(); active=key==='Home'?tabs[0]:key==='End'?tabs[tabs.length-1]!:tabs[(tabs.indexOf(active)+(key==='ArrowLeft'?tabs.length-1:1))%tabs.length]!; render(); dialog.querySelector<HTMLButtonElement>(`#guide-${active}`)?.focus();
  });
  const changeStep = (index: number) => { step = index; render(); dialog.querySelector<HTMLHeadingElement>('.guide-step h3')?.scrollIntoView({block:'nearest'}); dialog.querySelector<HTMLButtonElement>('#guide-next')?.focus({preventScroll:true}); };
  dialog.querySelectorAll<HTMLButtonElement>('[data-guide-step]').forEach(button => button.addEventListener('click', () => changeStep(Number(button.dataset.guideStep))));
  dialog.querySelector('#guide-prev')?.addEventListener('click', () => changeStep(Math.max(0,step - 1)));
  dialog.querySelector('#guide-next')?.addEventListener('click', () => changeStep((step + 1) % GUIDE_STEPS.length));
}
export function openGameGuide(tab: 'roles' | 'cards' | 'howto' | 'credits' = 'howto'): void {
  active = tab; returnFocus = document.activeElement?.closest('#mobile-menu') ? document.getElementById('mobile-menu-toggle') : document.activeElement as HTMLElement | null; render();
  if (!dialog.open) dialog.showModal();
  dialog.querySelector<HTMLButtonElement>('#guide-close')?.focus();
}
export function installGameGuide(): void {
  dialog = document.getElementById('how-to-dialog') as HTMLDialogElement;
  dialog.className = 'game-guide'; dialog.setAttribute('aria-labelledby','guide-title');
  dialog.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});document.dispatchEvent(new Event('ashfall:guide-closed')); });
  const button = document.createElement('button'); button.id = 'game-help'; button.type = 'button'; button.textContent = '?'; button.setAttribute('aria-label','Open roles, cards and how to play guide'); button.title = 'Roles, cards & how to play';
  document.querySelector('.game-preferences')?.append(button);
  button.addEventListener('click', () => openGameGuide());
  const credits=document.createElement('button');credits.id='game-credits';credits.type='button';credits.textContent='Credits';credits.addEventListener('click',()=>openGameGuide('credits'));button.before(credits);
  document.addEventListener('ashfall:open-guide',()=>openGameGuide('cards'));
}
