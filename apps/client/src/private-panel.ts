import { IDENTITY_LABELS, type RoomView } from '@ashfall/shared';
import { emblem } from './art';
import { roleArt, roleDescriptions, roleSymbol } from './role-art';
import { renderTeamInfo } from './team-info';
import { statusSymbol } from './status-art';

let open = false;
let revealed = false;
let reviewed = false;
let currentMatch: string | null = null;
let swapFrom = '';
let recentSwaps: string[] = [];
let swapTimer: ReturnType<typeof setTimeout> | null = null;
let refresh: (() => void) | null = null;
const symbols = { HUMAN: 'reed', WITCH: 'moth', CONSTABLE: 'lantern' } as const;
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function coverPrivateIdentities(): void {
  if (!open) return;
  open = false; revealed = false; swapFrom = ''; recentSwaps = []; refresh?.();
}
export function openPrivatePanel(): void {
  if (!refresh) return;
  open = true; revealed = false; swapFrom = ''; refresh();
  document.querySelector<HTMLButtonElement>('#reveal-all')?.focus({ preventScroll: true });
}
export function renderPrivatePanel(root: HTMLElement, view: RoomView | null, blocked: boolean,
  acknowledge: () => void, arrange: (cardIds: string[]) => void = () => {}, chooseBlackCat: (targetId: string) => void = () => {}): void {
  const matchId = view?.deal?.matchId ?? null;
  if (matchId !== currentMatch) {
    open = false; revealed = false; reviewed = false; swapFrom = ''; recentSwaps = []; currentMatch = matchId;
  }
  refresh = () => renderPrivatePanel(root, view, blocked, acknowledge, arrange, chooseBlackCat);
  const own = view?.private;
  root.hidden = !own || !view?.deal || !open;
  root.classList.toggle('is-open', !root.hidden);
  if (root.hidden || !own || !view) { root.replaceChildren(); return; }
  const identities = own.identities;
  const acknowledged = view.deal!.players.find(p => p.playerId === view.you?.playerId)?.acknowledged ?? false;
  const canArrange = view.phase === 'PRIVATE_DEAL' && !acknowledged && revealed && !blocked;
  const needsCurse = !!view.blackCatChoice && !view.blackCatChoice.submitted;
  const roleName = view.role?.kind.replaceAll('_', ' ') ?? 'ROLE PENDING';
  const roleDescription = view.role ? roleDescriptions[view.role.kind] ?? 'No special ability.' : 'Waiting for your private role assignment.';
  const swapHint = swapFrom && canArrange ? `Seal ${identities.find(item => item.id === swapFrom)?.slot! + 1} selected. Tap a green-marked Seal to exchange places.` : '';
  root.innerHTML = `<div class="private-overlay-backdrop" data-private-backdrop></div><section class="private-modal" role="dialog" aria-modal="true" aria-labelledby="private-title">
    <header class="private-modal-heading"><div><p class="eyebrow">PRIVATE REVEAL · ${view.phase === 'PRIVATE_DEAL' ? own.everWitch ? 'STEP 3 OF 3' : 'STEP 2 OF 2' : 'ONLY YOU CAN SEE THIS'}</p><h2 id="private-title">Your Life cards</h2></div><button id="private-close" class="private-close" type="button" aria-label="Close private Seals">×</button></header>
    ${view.phase === 'PRIVATE_DEAL' ? '' : `<div class="private-role-summary"><div class="private-role-portrait"><img src="${roleArt(view.role?.kind ?? 'VILLAGER')}" alt="">${roleSymbol(view.role?.kind ?? 'VILLAGER')}</div><div><span>YOUR ROLE</span><b>${escape(roleName)}</b><small>${escape(roleDescription)}</small></div></div>`}
    <p class="privacy-note" aria-live="polite">${swapHint || (revealed ? canArrange ? 'Tap two Seals to swap their places, or drag a Seal. Confirm when you like the order.' : 'Only you can see these identities. Close to cover them.' : 'Reveal your Seals together when you are ready.')}</p>
    ${view.phase === 'PRIVATE_DEAL' ? '<p class="seal-transfer-warning"><b>Before the council begins:</b> You may reorder these Seals privately now. Later Life-card shifts are visible to everyone as face-down hearts moving between players; other players cannot see which positions or identities moved.</p>' : ''}
    <div class="private-seal-grid ${revealed ? 'all-revealed' : ''}" aria-label="Your private Seal positions">${identities.map(identity => `<button type="button" class="private-seal-card ${revealed ? `face-up seal-${identity.kind.toLowerCase()}` : ''} ${swapFrom === identity.id ? 'swap-selected' : swapFrom && canArrange ? 'swap-target' : ''} ${recentSwaps.includes(identity.id) ? 'swap-changed' : ''}" data-private-seal="${identity.id}" ${canArrange ? 'draggable="true"' : ''} ${blocked ? 'disabled' : ''} aria-pressed="${swapFrom === identity.id}" aria-label="Seal ${identity.slot + 1}${revealed ? `: ${IDENTITY_LABELS[identity.kind]}${canArrange ? '. Select to swap positions.' : ''}` : ': face down'}">${revealed ? `<img class="life-identity-art" src="${roleArt(identity.kind === 'WITCH' ? 'ASHBOUND' : 'VILLAGER')}" alt="">${emblem(symbols[identity.kind])}` : emblem('lantern')}<b>${revealed ? IDENTITY_LABELS[identity.kind] : 'HIDDEN LIFE'}</b><small>SEAL ${identity.slot + 1}</small></button>`).join('')}</div>
    ${revealed ? `<div class="private-allegiance"><b>${view.role?.kind === 'SCAPEGOAT' ? 'Neutral' : own.everWitch ? 'Ashbound' : 'Village'}</b><span>${view.role?.kind === 'SCAPEGOAT' ? 'Your win requires a council vote against you.' : own.everWitch ? 'Keep the Ashbound alive.' : 'Find every hidden Ashbound Seal.'}</span>${own.constableAbility ? '<span>Lanternkeeper protection available at night</span>' : ''}</div>${view.phase === 'PRIVATE_DEAL' ? '' : renderTeamInfo(view)}` : ''}
    ${revealed && view.blackCatChoice ? `<section class="opening-curse" aria-label="Private opening Black Cat choice"><h3>${statusSymbol('BLACK_CAT')}Place the Black Cat</h3><p>Before Day 1, the Ashbound secretly curse one player. Conspiracy reveals one of their hidden Life cards. The cursed player takes the first turn.</p>${needsCurse ? `<label for="black-cat-target">Choose any player, including yourself to disguise your allegiance</label><select id="black-cat-target"><option value="">Choose a player…</option>${view.players.filter(p => view.deal!.players.some(seat => seat.playerId === p.id && seat.alive)).map(p => `<option value="${p.id}">${escape(p.name)}${p.id === view.you?.playerId ? ' (you)' : ''}</option>`).join('')}</select><button id="seal-black-cat" type="button" disabled>Seal opening curse</button><small>Each Ashbound seals one vote. Most votes wins; a tie goes to the earliest seat. Choices stay private.</small>` : `<strong>Choice sealed: ${escape(view.players.find(p => p.id === view.blackCatChoice!.targetId)?.name ?? 'A player')}</strong><small>The final curse is revealed when everyone confirms their Life cards.</small>`}</section>` : ''}
    <div class="seal-toolbar"><button id="reveal-all" type="button" class="${revealed ? 'quiet' : 'primary'}" ${blocked ? 'disabled' : ''}>${revealed ? 'Cover all Seals' : 'Reveal all Seals'}</button>${canArrange ? '<button id="shuffle-seals" type="button" class="quiet">Shuffle positions</button>' : ''}</div>
    ${view.phase === 'PRIVATE_DEAL' ? `<div class="private-confirm"><p class="seal-ready-note">${acknowledged ? 'Your Seals are confirmed. Waiting for the council.' : needsCurse ? 'Seal your opening Black Cat choice before continuing.' : reviewed ? 'Your order locks when you confirm.' : 'View your Seals before continuing.'}</p><button type="button" id="acknowledge" class="primary" ${blocked || acknowledged || !reviewed || needsCurse ? 'disabled' : ''}>${acknowledged ? 'Confirmed' : 'Confirm & continue'}</button></div>` : ''}
  </section>`;
  const swap = (from: string, to: string) => {
    if (!canArrange || from === to) { swapFrom = ''; refresh?.(); return; }
    const ids = identities.map(item => item.id);
    const a = ids.indexOf(from), b = ids.indexOf(to);
    if (a < 0 || b < 0) return;
    [ids[a], ids[b]] = [ids[b]!, ids[a]!]; swapFrom = ''; markChanged([from, to]); arrange(ids);
  };
  const markChanged = (ids: string[]) => {
    recentSwaps = ids;
    if (swapTimer) clearTimeout(swapTimer);
    swapTimer = setTimeout(() => { recentSwaps = []; swapTimer = null; refresh?.(); }, 1100);
  };
  root.querySelector('#private-close')?.addEventListener('click', coverPrivateIdentities);
  root.querySelector('[data-private-backdrop]')?.addEventListener('click', coverPrivateIdentities);
  root.querySelector('#reveal-all')?.addEventListener('click', () => { revealed = !revealed; reviewed ||= revealed; swapFrom = ''; refresh?.(); });
  root.querySelectorAll<HTMLButtonElement>('[data-private-seal]').forEach(button => {
    button.addEventListener('click', () => {
      if (!revealed) { revealed = true; reviewed = true; refresh?.(); return; }
      if (!canArrange) return;
      const id = button.dataset.privateSeal!;
      if (swapFrom) swap(swapFrom, id); else { swapFrom = id; refresh?.(); }
    });
    button.addEventListener('dragstart', event => {
      if (!canArrange) { event.preventDefault(); return; }
      swapFrom = button.dataset.privateSeal!;
      button.classList.add('swap-selected');
      root.querySelectorAll<HTMLElement>('[data-private-seal]').forEach(card => { if (card !== button) card.classList.add('swap-target'); });
      event.dataTransfer?.setData('text/plain', swapFrom);
    });
    button.addEventListener('dragover', event => { if (canArrange && swapFrom !== button.dataset.privateSeal) { event.preventDefault(); button.classList.add('swap-hover'); } });
    button.addEventListener('dragleave', () => button.classList.remove('swap-hover'));
    button.addEventListener('drop', event => { event.preventDefault(); swap(swapFrom, button.dataset.privateSeal!); });
    button.addEventListener('dragend', () => { if (swapFrom) { swapFrom = ''; refresh?.(); } });
  });
  root.querySelector('#shuffle-seals')?.addEventListener('click', () => {
    const ids = identities.map(item => item.id);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j]!, ids[i]!]; }
    swapFrom = ''; markChanged(ids); arrange(ids);
  });
  root.querySelector<HTMLSelectElement>('#black-cat-target')?.addEventListener('change', event => {
    const button = root.querySelector<HTMLButtonElement>('#seal-black-cat');
    if (button) button.disabled = blocked || !(event.target as HTMLSelectElement).value;
  });
  root.querySelector('#seal-black-cat')?.addEventListener('click', () => {
    const target = root.querySelector<HTMLSelectElement>('#black-cat-target')?.value;
    if (!blocked && needsCurse && target) chooseBlackCat(target);
  });
  root.querySelector('#acknowledge')?.addEventListener('click', () => { if (!blocked && !acknowledged && reviewed && !needsCurse) { coverPrivateIdentities(); acknowledge(); } });
}
