import { cardRequiresOtherPlayer, type ActionKind, type DayIntent, type ProtectionKind, type RoomView } from '@ashfall/shared';
import { renderActionCard, type TableSelection } from './tabletop-components';
import { CARD_INFO, cardTitle } from './card-info';

const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]!);
const twoTargets = (kind: ActionKind) => kind === 'SCAPEGOAT';
const global = (kind: ActionKind) => kind === 'CONSPIRACY';
const repeatable = (kind: ActionKind) => ['EVIDENCE','ALIBI','MERCY','WHISPER','CINDER_SHIFT'].includes(kind);
const cardCopy = Object.fromEntries(Object.entries(CARD_INFO).map(([kind, info]) => [kind,info.effect])) as Record<ActionKind,string>;
let selectedCards: string[] = [];
let first = '';
let second = '';
let preview = false;
let protection: ProtectionKind | '' = '';
let matchId = '';
let selectionTurn = 0;
let selectionVersion = -1;
let validTargetIds: string[] = [];
let selectedCardKind: ActionKind | null = null;
let currentView: RoomView | null = null;
let currentBlocked = false;
let currentDispatch: (intent: DayIntent) => void = () => {};
let currentRoot: HTMLElement | null = null;
let dismissedPeekKey = '';
const peekKey = (view: RoomView) => `${view.deal?.matchId}:${view.peek?.id ?? view.peek?.expiresAt}`;
let chooseCurrentGroup: (kind: ActionKind, operation: 'add' | 'minus' | 'all') => void = () => {};

export function tapHandCard(cardId: string): void {
  const card = currentView?.hand?.find(item => item.id === cardId);
  if (card) chooseCurrentGroup(card.kind, 'add');
}

const redraw = () => currentRoot && renderDayPanel(currentRoot, currentView, currentBlocked, currentDispatch);
export function clearDaySelection(): void {
  selectedCards = []; first = second = ''; preview = false; protection = ''; redraw();
}
export function beginCardDrag(cardId: string): boolean {
  const view = currentView;
  if (currentBlocked || view?.phase !== 'DAY' || view.day?.activePlayerId !== view.you?.playerId ||
    !view.deal?.players.find(p => p.playerId === view.you?.playerId)?.alive || !view.hand?.some(card => card.id === cardId)) return false;
  document.dispatchEvent(new Event('ashfall:choose-card'));
  if (!selectedCards.includes(cardId)) selectedCards = [cardId];
  first = second = ''; preview = false; protection = ''; redraw();
  return true;
}
function announceSelection(): void {
  document.dispatchEvent(new CustomEvent<TableSelection>('ashfall:day-selection', { detail: getDayTableSelection() }));
}
export function getDayTableSelection(): TableSelection {
  return { selectedCardId: selectedCards[0] ?? '', selectedCardKind, selectedTargetId: first,
    secondTargetId: second, validTargetIds };
}
export function selectDayTableTarget(playerId: string): boolean {
  if (!validTargetIds.includes(playerId)) return false;
  if (selectedCardKind && twoTargets(selectedCardKind)) {
    if (!first) first = playerId;
    else if (first !== playerId) { second = playerId; preview = true; }
  } else { first = playerId; preview = true; }
  redraw(); return true;
}
function availableProtections(view: RoomView, targetId: string): ProtectionKind[] {
  const statuses = view.day?.players.find(p => p.playerId === targetId)?.statuses ?? [];
  return statuses.filter(s => s.kind !== 'BOUND').map(s => s.kind === 'VOW_HEART' ? 'VOW_OF_HEARTS' : s.kind as ProtectionKind);
}
function validFor(view: RoomView, me: string, kind: ActionKind, id: string, firstTarget = ''): boolean {
  const player = view.deal?.players.find(p => p.playerId === id);
  if (!player?.alive || (id === me && cardRequiresOtherPlayer(kind)) || id === firstTarget) return false;
  const state = view.day?.players.find(p => p.playerId === id);
  if (kind === 'SCAPEGOAT' && !firstTarget && !(state?.doubt || state?.statuses?.length || state?.remedy)) return false;
  if (kind === 'CURSE' && !availableProtections(view, id).length) return false;
  if (['HEARTHWARD','PIETY','ASYLUM','STOCKS'].includes(kind) && state?.statuses?.some(s => s.kind === (kind === 'STOCKS' ? 'BOUND' : kind))) return false;
  if (kind === 'VOW_OF_HEARTS' && state?.statuses?.some(s => s.kind === 'VOW_HEART')) return false;
  if (kind === 'CINDER_SHIFT' && (!view.deal?.players.find(p => p.playerId === me)?.seals.some(seal => !seal.revealed) || !player.seals.some(seal => !seal.revealed))) return false;
  return true;
}
export function renderDayPanel(root: HTMLElement, view: RoomView | null, blocked: boolean, dispatch: (intent: DayIntent) => void): void {
  currentRoot = root; currentView = view; currentBlocked = blocked; currentDispatch = dispatch;
  const confirmation = document.getElementById('action-confirmation');
  confirmation?.replaceChildren();
  const day = view?.day;
  root.hidden = !day;
  if (!view || !day) { root.replaceChildren(); validTargetIds = []; selectedCards = []; selectedCardKind = null; announceSelection(); return; }
  root.dataset.gameVersion = String(day.version); root.dataset.phase = view.phase;
  if (matchId !== view.deal!.matchId || selectionTurn !== day.turnNumber || selectionVersion !== day.version) {
    matchId = view.deal!.matchId; selectionTurn = day.turnNumber; selectionVersion = day.version;
    selectedCards = []; first = second = ''; preview = false; protection = '';
  }
  const me = view.you!.playerId;
  const active = view.phase === 'DAY' && day.activePlayerId === me && view.deal!.players.find(p => p.playerId === me)?.alive;
  selectedCards = selectedCards.filter(id => view.hand?.some(card => card.id === id));
  if (!selectedCards.length) { first = second = ''; preview = false; }
  const cards = selectedCards.map(id => view.hand!.find(card => card.id === id)!);
  selectedCardKind = cards[0]?.kind ?? null;
  const mode = selectedCardKind && twoTargets(selectedCardKind) ? 'two' : selectedCardKind && global(selectedCardKind) ? 'global' : 'one';
  if (selectedCardKind && mode !== 'global') {
    validTargetIds = active && !blocked && !preview ? view.deal!.players.filter(p =>
      cards.every(card => validFor(view, me, card.kind, p.playerId, first && mode === 'two' ? first : ''))
    ).map(p => p.playerId) : [];
  } else validTargetIds = [];
  const name = (id: string) => escape(view.players.find(p => p.id === id)?.name ?? 'A player');
  const phaseText = view.phase === 'NIGHT' ? `Night ${day.dayNumber} · your cards remain` : view.phase === 'DAWN' ? 'Dawn · discard reshuffles' : active
    ? selectedCardKind ? mode === 'global' ? 'All living players are affected' : mode === 'two' && first ? 'Choose SECOND player' : 'Choose a highlighted player' : 'Drag a card · or tap to select'
    : `${name(day.activePlayerId)}’s turn`;
  let content = `<div class="action-dock-heading"><p class="eyebrow">${phaseText}</p><p class="turn-clock"><strong data-deadline="${day.deadline ?? 0}"></strong></p><div class="day-buttons">${active ? `<button id="select-all" class="quiet" ${blocked || !view.hand?.length ? 'disabled' : ''}>${selectedCards.length ? 'Cancel selection' : 'Select alike'}</button><button id="draw-cards" class="quiet" ${blocked || day.playedThisTurn || !day.deckCount ? 'disabled' : ''}>Draw ${Math.min(2,day.deckCount)}</button><button id="end-turn" class="primary" ${blocked || (!day.playedThisTurn && day.deckCount > 0) ? 'disabled' : ''}>${day.deckCount ? 'End turn' : 'End day'}</button>` : ''}</div></div>`;
  if (view.phase === 'GAME_OVER') content += `<div class="outcome"><h2>${day.outcome?.winner === 'HUMAN' ? 'The village survives.' : 'The Ashbound remain.'}</h2></div>`;
  else if (view.hand) {
    const groups = [...new Set(view.hand.map(card => card.kind))].map(kind => ({ kind, cards: view.hand!.filter(card => card.kind === kind) }));
    content += `<div class="hand-heading"><span class="eyebrow">YOUR HAND · ${view.hand.length} cards / ${groups.length} types</span><span class="hand-help">${active ? 'Tap a stack to choose a card. + and − adjust repeatable cards.' : 'Your cards remain yours through night.'}</span></div>
      <div class="action-hand grouped-hand" role="list" data-hand-size="${groups.length}" style="--hand-columns:${Math.max(1,Math.min(groups.length,5))};--hand-rows:${Math.max(1,Math.ceil(groups.length/5))};--hand-count:${groups.length}" aria-label="Your action card stacks">${groups.map((group,i) => {
        const chosen = group.cards.filter(card => selectedCards.includes(card.id)).length;
        const canRepeat = repeatable(group.kind);
        return `<div class="card-stack" role="listitem" data-stack-kind="${group.kind}">${renderActionCard(group.cards[0]!, chosen > 0, blocked || !active, i, groups.length, group.cards.length, chosen)}<button type="button" class="card-details-button" data-card-details="${group.kind}" aria-label="${cardTitle(group.kind)} card details">Details</button>${group.cards.length > 1 ? `<div class="stack-controls"><button type="button" data-group-minus="${group.kind}" aria-label="Remove one ${group.kind.toLowerCase().replaceAll('_',' ')} from selection" ${!chosen || blocked || !active ? 'disabled' : ''}>−</button><span aria-live="polite">${chosen} / ${group.cards.length}</span><button type="button" data-group-all="${group.kind}" aria-label="Select ${canRepeat ? 'all' : 'one'} ${group.kind.toLowerCase().replaceAll('_',' ')}" ${blocked || !active ? 'disabled' : ''}>${canRepeat ? 'All' : '+1'}</button></div>` : ''}</div>`;
      }).join('') || '<p class="empty-hand">Your hand is empty.</p>'}</div>`;
    content += `<div class="selection-hint" role="status">${cards.length ? `<b>${cards.length} selected</b><span>${escape(cardCopy[selectedCardKind!])}</span>` : ''}</div>`;
  }
  if (active && selectedCardKind && (preview || mode === 'global')) {
    const protections = selectedCardKind === 'CURSE' ? availableProtections(view, first) : [];
    content += `<div class="play-preview" role="region" aria-label="Confirm card effect"><strong>${cardTitle(selectedCardKind)}${first ? ` → ${name(first)}` : ''}${second ? ` → ${name(second)}` : ''}</strong><p>${escape(cardCopy[selectedCardKind])}</p>${protections.length > 1 ? `<label>Remove effect <select id="preview-protection"><option value="">Choose…</option>${protections.map(item => `<option value="${item}" ${protection === item ? 'selected' : ''}>${item.replaceAll('_',' ')}</option>`).join('')}</select></label>` : ''}<div><button id="cancel-preview" class="quiet">Cancel</button><button id="confirm-preview" class="primary" ${blocked || (protections.length > 1 && !protection) ? 'disabled' : ''}>Play ${cardTitle(selectedCardKind)}${cards.length > 1 ? ` ×${cards.length}` : ''}</button></div></div>`;
  }
  if (view.peek && (view.presentation || view.peek.expiresAt > Date.now()) && dismissedPeekKey !== peekKey(view))
    content += `<div class="whisper-peek" role="dialog" aria-label="Private Whisper insight"><span class="eyebrow">YOUR EYES ONLY · ${name(view.peek.targetId)}</span><strong>One hidden Life card: ${escape(view.peek.kind)}</strong><button id="close-peek">Close</button></div>`;
  root.innerHTML = content;
  const chooseGroup = (kind: ActionKind, operation: 'add' | 'minus' | 'all') => {
    if (!active || blocked) return;
    document.dispatchEvent(new Event('ashfall:choose-card'));
    const group = view.hand!.filter(card => card.kind === kind);
    const current = selectedCards.filter(id => group.some(card => card.id === id));
    const same = current.length === selectedCards.length;
    if (operation === 'minus') selectedCards = same ? current.slice(0,-1) : [];
    else if (operation === 'all') selectedCards = group.slice(0, repeatable(kind) ? group.length : 1).map(card => card.id);
    else if (!same || !current.length) selectedCards = [group[0]!.id];
    else if (!repeatable(kind) || current.length === group.length) selectedCards = [];
    else selectedCards = [...current, group.find(card => !current.includes(card.id))!.id];
    first = second = ''; protection = ''; preview = false; redraw();
  };
  chooseCurrentGroup = chooseGroup;
  root.querySelectorAll<HTMLButtonElement>('[data-card]').forEach(button => button.addEventListener('click', event => {
    chooseGroup(button.dataset.actionKind as ActionKind, 'add');
    if (event.detail === 0) (document.getElementById('confirm-preview') ?? document.querySelector<HTMLElement>('#seats .is-valid-target'))?.focus();
  }));
  root.querySelectorAll<HTMLButtonElement>('[data-group-minus]').forEach(button => button.addEventListener('click', () =>
    chooseGroup(button.dataset.groupMinus as ActionKind, 'minus')));
  root.querySelectorAll<HTMLButtonElement>('[data-group-all]').forEach(button => button.addEventListener('click', () =>
    chooseGroup(button.dataset.groupAll as ActionKind, 'all')));
  root.querySelector('#select-all')?.addEventListener('click', () => {
    const firstKind = view.hand?.find(card => card.id === selectedCards[0])?.kind ?? view.hand?.[0]?.kind;
    selectedCards = selectedCards.length || !firstKind ? [] : view.hand!.filter(card => card.kind === firstKind).slice(0, repeatable(firstKind) ? undefined : 1).map(card => card.id);
    first = second = ''; preview = false; redraw();
  });
  root.querySelector<HTMLSelectElement>('#preview-protection')?.addEventListener('change', event => {
    protection = (event.target as HTMLSelectElement).value as ProtectionKind; redraw();
  });
  root.querySelector('#cancel-preview')?.addEventListener('click', () => { selectedCards = []; first = second = ''; preview = false; protection = ''; redraw(); });
  root.querySelector('#confirm-preview')?.addEventListener('click', () => {
    if (!selectedCards.length) return;
    dispatch({ type: 'playCards', cardIds: [...selectedCards], targetId: mode === 'global' ? me : first,
      ...(second ? { secondTargetId: second } : {}), ...(protection ? { protection } : {}) });
    preview = false;
  });
  root.querySelector('#close-peek')?.addEventListener('click', () => { dismissedPeekKey = peekKey(view); redraw(); });
  root.querySelector('#draw-cards')?.addEventListener('click', () => dispatch({ type: 'drawCards' }));
  root.querySelector('#end-turn')?.addEventListener('click', () => dispatch({ type: 'endTurn' }));
  const effectPreview = root.querySelector('.play-preview');
  if (effectPreview && confirmation) confirmation.append(effectPreview);
  updateDayTimers(); announceSelection();
}
export function updateDayTimers(): void {
  document.querySelectorAll<HTMLElement>('[data-deadline]').forEach(el => {
    const deadline = Number(el.dataset.deadline);
    const paused=document.body.classList.contains('table-paused');
    const remaining=document.body.dataset.presentationRemaining;
    el.textContent = paused ? `Ⅱ ${remaining ? `${Math.ceil(Number(remaining)/1000)}s` : 'Paused'}` : deadline ? `${Math.max(0,Math.ceil((deadline-Date.now())/1000))}s` : '';
    el.setAttribute('aria-label',paused?'Timer paused during close-up':'Phase time remaining');
  });
  const peek = document.querySelector<HTMLElement>('.whisper-peek');
  if (peek && currentView?.peek && !currentView.presentation && Date.now() >= currentView.peek.expiresAt) peek.remove();
}
function coverPeek(): void {
  if (currentView?.peek) dismissedPeekKey = peekKey(currentView);
  document.querySelector('.whisper-peek')?.remove();
}
window.addEventListener('blur', coverPeek);
document.addEventListener('visibilitychange', () => { if (document.hidden) coverPeek(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && selectedCards.length) {
    selectedCards = []; first = second = ''; preview = false; protection = ''; redraw();
  }
});
