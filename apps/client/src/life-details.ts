import { IDENTITY_LABELS, type IdentityKind } from '@ashfall/shared';
import { emblem } from './art';

export const lifeSymbol = (kind: IdentityKind) => emblem(kind === 'HUMAN' ? 'reed' : kind === 'WITCH' ? 'moth' : 'lantern');
const descriptions: Record<IdentityKind,string> = {
  HUMAN: 'This Villager Life card is publicly revealed. It does not prove the player’s current allegiance.',
  WITCH: 'This Ashbound Life card is publicly revealed and counts toward revealing all Ashbound Life cards.',
  CONSTABLE: 'This Lanternkeeper Life card is publicly revealed. Its night protection belongs to the Life card and is unavailable once revealed.',
};
let popup: HTMLElement | null = null;
let anchor: HTMLElement | null = null;
let pinned = false;
let skipFocus = false;
function close(): void {
  popup?.remove(); popup = null; pinned = false;
  anchor?.removeAttribute('aria-describedby'); anchor = null;
}
function show(element: HTMLElement, pin: boolean): void {
  const kind = element.dataset.revealedLife as IdentityKind;
  // Only publicly revealed Life controls carry this attribute. Never inspect
  // private state, role assignments, or face-down Life cards for this display.
  if (!(kind in IDENTITY_LABELS) || (pinned && !pin)) return;
  close(); anchor = element; pinned = pin;
  const count = Number(element.dataset.lifeCount ?? 1);
  const slot = element.dataset.lifeSlot;
  popup = document.createElement('section'); popup.id = 'life-inspection'; popup.className = 'life-inspection';
  popup.setAttribute('role', pin ? 'dialog' : 'tooltip');
  popup.setAttribute('aria-label', `${IDENTITY_LABELS[kind]} revealed Life card`);
  popup.innerHTML = `${pin ? '<button type="button" class="life-inspection-close" aria-label="Close Life card details">×</button>' : ''}<p class="eyebrow">PUBLICLY REVEALED LIFE${slot ? ` · CARD ${slot}` : count > 1 ? ` · ${count} CARDS` : ''}</p><div class="life-inspection-identity">${lifeSymbol(kind)}<h3>${IDENTITY_LABELS[kind]}</h3></div><p>${descriptions[kind]}</p><small>Revealed Life cards stay face up and cannot be exchanged.</small>`;
  document.body.append(popup); element.setAttribute('aria-describedby', popup.id);
  const box = element.getBoundingClientRect(), panel = popup.getBoundingClientRect();
  const right = box.right + 12;
  popup.style.left = `${Math.max(10, Math.min(innerWidth - panel.width - 10, right + panel.width < innerWidth ? right : box.left + box.width/2 - panel.width/2))}px`;
  popup.style.top = `${Math.max(10, Math.min(innerHeight - panel.height - 10, box.top - 10))}px`;
  popup.querySelector('button')?.addEventListener('click', () => { const previous = anchor; close(); if (previous?.isConnected) { skipFocus = true; previous.focus(); } });
  if (pin) popup.querySelector('button')?.focus();
}
export function installLifeDetails(): void {
  document.addEventListener('pointerover', event => {
    if ((event as PointerEvent).pointerType === 'touch') return;
    const control = (event.target as HTMLElement).closest<HTMLElement>('[data-revealed-life]');
    if (control) show(control,false);
  });
  document.addEventListener('pointerout', event => {
    if (pinned) return;
    const next = (event as PointerEvent).relatedTarget as Node | null;
    if (!anchor?.contains(next) && !popup?.contains(next)) close();
  });
  document.addEventListener('focusin', event => {
    if (skipFocus) { skipFocus = false; return; }
    const control = (event.target as HTMLElement).closest<HTMLElement>('[data-revealed-life]');
    if (control) show(control,false);
  });
  document.addEventListener('focusout', event => {
    if (!pinned && !popup?.contains((event as FocusEvent).relatedTarget as Node | null)) close();
  });
  document.addEventListener('click', event => {
    const control = (event.target as HTMLElement).closest<HTMLElement>('[data-revealed-life]');
    if (control) show(control,true);
    else if (pinned && !popup?.contains(event.target as Node)) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { const previous = anchor; close(); if (previous?.isConnected) { skipFocus = true; previous.focus(); } }
  });
  document.addEventListener('ashfall:day-selection', () => { if (!document.body.classList.contains('game-screen') || (!pinned && !anchor?.isConnected)) close(); });
  window.addEventListener('resize', close);
  window.addEventListener('blur', close);
}
