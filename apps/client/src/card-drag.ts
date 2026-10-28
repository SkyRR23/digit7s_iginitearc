import type { ActionKind } from '@ashfall/shared';
import { cardArt, cardTitle } from './card-info';
import type { TableSelection } from './tabletop-components';

interface DragActions {
  begin: (cardId: string) => boolean;
  tap: (cardId: string) => void;
  selection: () => TableSelection;
  target: (id: string) => boolean;
  cancel: () => void;
}
interface Gesture {
  pointer: number; kind: ActionKind; cardId: string; touch: boolean;
  x: number; y: number; startX: number; startY: number;
  scrolling: boolean; active: boolean; hand: HTMLElement | null; scrollStart: number;
}

/** Pointer gestures keep drag targeting, touch hand-swiping, and normal clicks distinct. */
export function installCardDragging(root: HTMLElement, actions: DragActions): void {
  // Card art is an image, but the game owns this gesture rather than native image dragging.
  root.addEventListener('dragstart', event => event.preventDefault());
  let gesture: Gesture | null = null;
  let hold: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  let ghost: HTMLElement | null = null;
  let hovered: HTMLElement | null = null;
  let suppressClickUntil = 0;
  let lastTouchTap = { pointer: -1, until: 0 };
  const capture = (pointer: number) => { try { document.body.setPointerCapture(pointer); } catch { /* The pointer may already be released. */ } };
  const cleanup = () => {
    clearTimeout(hold); cancelAnimationFrame(frame);
    hovered?.classList.remove('is-drag-over'); hovered = null;
    ghost?.remove(); ghost = null; document.body.classList.remove('dragging-card');
    if (gesture) { try { document.body.releasePointerCapture(gesture.pointer); } catch { /* No active capture. */ } }
    gesture = null;
  };
  const cancel = () => {
    const wasActive = gesture?.active;
    cleanup(); if (wasActive) actions.cancel();
  };
  const seatAtPointer = () => {
    if (!gesture) return null;
    for (const hit of document.elementsFromPoint(gesture.x, gesture.y)) {
      const seat = hit.closest<HTMLElement>('#seats [data-player]');
      if (seat) return seat;
    }
    return null;
  };
  const overTable = () => !!gesture && document.elementsFromPoint(gesture.x, gesture.y)
    .some(hit => hit.closest('#action-stage, #seats'));
  const tick = () => {
    if (!gesture?.active || !ghost) return;
    const selection = actions.selection();
    if (selection.selectedCardKind !== gesture.kind) { cancel(); return; }
    const roster = document.getElementById('seats');
    if (roster) {
      const box = roster.getBoundingClientRect();
      if (gesture.y >= box.top && gesture.y <= box.bottom && gesture.x >= box.left && gesture.x <= box.right) {
        if (roster.scrollWidth > roster.clientWidth) roster.scrollLeft += gesture.x > box.right - 38 ? 7 : gesture.x < box.left + 38 ? -7 : 0;
        const vertical = roster.closest<HTMLElement>('.tabletop-frame') ?? roster;
        const verticalBox = vertical.getBoundingClientRect();
        if (vertical.scrollHeight > vertical.clientHeight) vertical.scrollTop += gesture.y > verticalBox.bottom - 35 ? 6 : gesture.y < verticalBox.top + 35 ? -6 : 0;
      }
    }
    const seat = seatAtPointer();
    const valid = !!seat && selection.validTargetIds.includes(seat.dataset.player!);
    hovered?.classList.remove('is-drag-over'); hovered = valid ? seat : null;
    hovered?.classList.add('is-drag-over');
    const global = gesture.kind === 'CONSPIRACY' && overTable();
    ghost.classList.toggle('drag-valid', valid || global);
    ghost.style.left = `${Math.max(112,Math.min(innerWidth-112,gesture.x))}px`;
    ghost.style.top = `${Math.max(115,Math.min(innerHeight-35,gesture.y-18))}px`;
    const hint = ghost.querySelector<HTMLElement>('.drag-hint')!;
    const text = valid ? `Release to target ${seat!.querySelector('.seat-name h3')?.textContent ?? 'this player'}`
      : global ? 'Release to review Conspiracy' : 'Drag onto a highlighted player';
    if (hint.textContent !== text) hint.textContent = text;
    frame = requestAnimationFrame(tick);
  };
  const start = () => {
    if (!gesture || gesture.scrolling || gesture.active) return;
    // Capture on a stable ancestor before selection redraws the hand.
    capture(gesture.pointer);
    if (!actions.begin(gesture.cardId)) { cleanup(); return; }
    gesture.active = true; suppressClickUntil = gesture.touch ? 0 : performance.now() + 600;
    ghost = document.createElement('div'); ghost.id = 'dragged-card'; ghost.className = 'dragged-card';
    ghost.innerHTML = `<img src="${cardArt(gesture.kind)}" alt=""><b>${cardTitle(gesture.kind)}</b><span class="drag-hint" role="status" aria-live="polite"></span>`;
    document.body.append(ghost); document.body.classList.add('dragging-card'); tick();
  };
  root.addEventListener('pointerdown', event => {
    const card = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-card]');
    if (!card || event.button !== 0 || !event.isPrimary || card.getAttribute('aria-disabled') === 'true') return;
    cleanup();
    const hand = card.closest<HTMLElement>('.action-hand');
    gesture = { pointer: event.pointerId, kind: card.dataset.actionKind as ActionKind, cardId: card.dataset.card!,
      touch: event.pointerType === 'touch', x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
      scrolling: false, active: false, hand, scrollStart: hand?.scrollLeft ?? 0 };
    if (gesture.touch) hold = setTimeout(start, 190);
  });
  document.addEventListener('pointermove', event => {
    if (!gesture || gesture.pointer !== event.pointerId) return;
    gesture.x = event.clientX; gesture.y = event.clientY;
    const distance = Math.hypot(gesture.x-gesture.startX,gesture.y-gesture.startY);
    if (!gesture.active && distance > 9) {
      clearTimeout(hold);
      if (gesture.touch) { gesture.scrolling = true; capture(gesture.pointer); }
      else start();
    }
    if (!gesture) return;
    if (gesture.scrolling && gesture.hand) gesture.hand.scrollLeft = gesture.scrollStart - (gesture.x-gesture.startX);
    if (gesture.active || gesture.scrolling) event.preventDefault();
  }, { passive: false });
  document.addEventListener('pointerup', event => {
    if (!gesture || gesture.pointer !== event.pointerId) return;
    if (!gesture.active) {
      const tap = gesture.touch && !gesture.scrolling ? gesture.cardId : '';
      if (tap) lastTouchTap = { pointer: gesture.pointer, until: performance.now()+450 };
      if (gesture.scrolling) suppressClickUntil = 0;
      cleanup(); if (tap) actions.tap(tap); return;
    }
    event.preventDefault(); suppressClickUntil = gesture.touch ? 0 : performance.now()+450;
    gesture.x = event.clientX; gesture.y = event.clientY;
    const seat = seatAtPointer();
    const target = seat?.dataset.player;
    const valid = !!target && actions.selection().validTargetIds.includes(target);
    const global = gesture.kind === 'CONSPIRACY' && overTable();
    cleanup();
    if (valid) actions.target(target!);
    else if (!global) actions.cancel();
  });
  document.addEventListener('pointercancel', event => { if (gesture?.pointer === event.pointerId) cancel(); });
  // Suppress the synthetic click after a drag or hand swipe, while preserving keyboard clicks.
  document.addEventListener('click', event => {
    // Touch taps are handled on pointer-up, including browsers that omit a click
    // after a swipe. Ignore only the duplicate click from that same pointer.
    if ((event as PointerEvent).pointerId === lastTouchTap.pointer && performance.now() < lastTouchTap.until) {
      event.preventDefault(); event.stopImmediatePropagation(); return;
    }
    if (event.detail && performance.now() < suppressClickUntil) {
      suppressClickUntil = 0;
      if ((event.target as HTMLElement).closest('[data-card]')) { event.preventDefault(); event.stopImmediatePropagation(); }
    }
  }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') cancel(); });
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
}
