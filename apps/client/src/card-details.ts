import type { ActionKind } from '@ashfall/shared';
import { CARD_INFO, cardTitle } from './card-info';
let popup: HTMLElement | null = null;
let pinned = false;
let anchor: HTMLElement | null = null;
function close(): void { popup?.remove(); popup = null; pinned = false; anchor?.removeAttribute('aria-describedby'); anchor = null; }
function show(element: HTMLElement, kind: ActionKind, pin: boolean): void {
  if (pinned && !pin) return;
  close(); anchor = element; pinned = pin;
  const info = CARD_INFO[kind];
  if (!info) return;
  popup = document.createElement('section'); popup.id = 'card-explanation'; popup.className = 'card-explanation';
  popup.setAttribute('role', pin ? 'dialog' : 'tooltip'); popup.setAttribute('aria-label', `${cardTitle(kind)} details`);
  popup.innerHTML = `${pin ? '<button type="button" class="details-close" aria-label="Close card details">×</button>' : ''}<h3>${cardTitle(kind)}</h3><p class="details-target">${info.target}</p><p>${info.effect}</p><p class="details-interaction">${info.interaction}</p>`;
  document.body.append(popup); element.setAttribute('aria-describedby', popup.id);
  const box = (element.closest('.card-stack') ?? element).getBoundingClientRect(), panel = popup.getBoundingClientRect();
  popup.style.left = `${Math.max(10, Math.min(innerWidth - panel.width - 10, box.left + box.width / 2 - panel.width / 2))}px`;
  popup.style.top = `${Math.max(10, Math.min(innerHeight - panel.height - 10, box.top - panel.height - 12))}px`;
  popup.querySelector('button')?.addEventListener('click', () => { const previous = anchor; close(); previous?.focus(); });
  if (pin) popup.querySelector('button')?.focus();
}
export function installCardDetails(): void {
  document.addEventListener('pointerover', event => {
    if ((event as PointerEvent).pointerType === 'touch') return;
    const card = (event.target as HTMLElement).closest<HTMLElement>('[data-action-kind]');
    if (card) show(card, card.dataset.actionKind as ActionKind, false);
  });
  document.addEventListener('pointerout', event => {
    if (pinned) return;
    const next = (event as PointerEvent).relatedTarget as Node | null;
    if (anchor?.contains(next) || popup?.contains(next)) return;
    close();
  });
  document.addEventListener('focusin', event => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('[data-action-kind]');
    if (card) show(card, card.dataset.actionKind as ActionKind, false);
  });
  document.addEventListener('focusout', event => {
    if (!pinned && !popup?.contains((event as FocusEvent).relatedTarget as Node | null)) close();
  });
  document.addEventListener('click', event => {
    const details = (event.target as HTMLElement).closest<HTMLElement>('[data-card-details]');
    if (details) { event.stopPropagation(); show(details, details.dataset.cardDetails as ActionKind, true); }
    else if (pinned && !popup?.contains(event.target as Node)) close();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  window.addEventListener('resize', close);
  window.addEventListener('blur', close);
  document.addEventListener('ashfall:day-selection', () => { if (!pinned) close(); });
}
