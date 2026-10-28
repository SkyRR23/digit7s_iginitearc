import type { RoomView } from '@ashfall/shared';
import { roleArt, roleDescriptions, roleSymbol } from './role-art';
import { openPrivatePanel } from './private-panel';

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
let open = false;
let presentation = false;
let presentedMatch = '';
let interval: ReturnType<typeof setInterval> | null = null;
let shownResult = '';
export function coverRolePanel(): void {
  open = false;
  document.getElementById('role-panel')?.classList.remove('is-open');
  document.getElementById('role-toggle')?.setAttribute('aria-expanded', 'false');
}
export function toggleRolePanel(): void {
  open = !open;
  document.getElementById('role-panel')?.classList.toggle('is-open', open);
  document.getElementById('role-toggle')?.setAttribute('aria-expanded', String(open));
}

export function renderRolePanel(root: HTMLElement, view: RoomView | null, blocked: boolean,
  use: (targetId: string, secondTargetId?: string) => void, close: () => void, vote: (targetId: string) => void): void {
  const role = view?.role;
  if (interval) { clearInterval(interval); interval = null; }
  if (view?.deal && role && view.deal.matchId !== presentedMatch) {
    presentedMatch = view.deal.matchId;
    presentation = view.phase === 'PRIVATE_DEAL' && !view.deal.players.find(p => p.playerId === view.you?.playerId)?.acknowledged;
    open = presentation;
  }
  if (!view?.deal) { presentedMatch = ''; presentation = false; open = false; }
  const resultKey = `${view?.deal?.matchId ?? ''}:${role?.result ?? ''}`;
  if (role?.result && resultKey !== shownResult) { shownResult = resultKey; open = true; }
  if (!view?.deal) shownResult = '';
  root.hidden = !view || !role;
  const toggle = document.getElementById('role-toggle');
  if (toggle) {
    toggle.hidden = root.hidden; toggle.setAttribute('aria-expanded', String(open));
    toggle.innerHTML = role ? `<img src="${roleArt(role.kind)}" alt=""><span>${roleSymbol(role.kind)}<b>My role</b><small>Private view</small></span>` : '';
  }
  root.classList.toggle('is-open', open);
  if (!view || !role) { root.replaceChildren(); return; }
  const me = view.you?.playerId;
  const living = view.deal?.players.filter(p => p.alive).map(p => p.playerId) ?? [];
  const name = (id: string) => escape(view.players.find(p => p.id === id)?.name ?? 'A player');
  const choices = (excludeSelf: boolean) => living.filter(id => !excludeSelf || id !== me)
    .map(id => `<option value="${id}">${name(id)}</option>`).join('');
  const canUse = role.ability === 'AVAILABLE' && !blocked && (role.kind === 'HEXER' ? view.phase === 'NIGHT' : view.phase === 'DAY');
  const targetForm = ['SLEUTH','HERBALIST','GOSSIP','HEXER'].includes(role.kind) && role.ability === 'AVAILABLE'
    ? `<form id="role-action"><label>Target <select name="target" aria-label="Role target">${choices(role.kind !== 'GOSSIP')}</select></label>
       ${role.kind === 'GOSSIP' ? `<label>Second target <select name="second" aria-label="Second role target">${choices(false)}</select></label>` : ''}
       <button class="primary" ${canUse ? '' : 'disabled'}>Use ${escape(role.kind.toLowerCase())}</button></form>` : '';
  const canVote = view.phase === 'DAY' && living.includes(me ?? '') && !view.councilVote?.yourTargetId && !view.councilVote?.completed;
  root.classList.toggle('role-presentation', presentation);
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
  root.innerHTML = `<div class="role-panel-inner role-${role.kind.toLowerCase()}"><div class="role-heading"><span class="eyebrow">${presentation ? 'PRIVATE REVEAL · STEP 1 OF 2' : 'YOUR PRIVATE ROLE'}</span><button id="role-close" type="button" aria-label="Close role panel">×</button></div>
    <div class="role-profile"><div class="role-profile-art"><img src="${roleArt(role.kind)}" alt="${escape(role.kind.toLowerCase())} chibi illustration"></div><div class="role-profile-copy"><div class="role-profile-symbol">${roleSymbol(role.kind)}</div><h2>${escape(role.kind.replaceAll('_', ' '))}</h2><p>${roleDescriptions[role.kind]}</p><p class="role-privacy">This role stays with you. Your Life cards determine your allegiance and survival.</p></div></div>
    ${view.private?.constableAbility ? '<p class="lanternkeeper-note">Lanternkeeper protection is available from your unrevealed Life card. This protection follows that Life card if it moves.</p>' : ''}
    <span class="role-availability">${role.ability.toLowerCase()}</span>
    ${role.result ? `<div class="role-result"><b>${escape(role.result)}</b>${role.peek ? `<small class="role-countdown" data-expires="${role.peek.expiresAt}"></small>` : ''}</div>` : ''}
    ${role.peek ? '<button id="close-peek" type="button">Close investigation now</button>' : ''}
    ${targetForm}
    ${role.notices.length ? `<div class="role-notices" aria-label="Private role notices">${role.notices.slice(-3).map(message => `<p>${escape(message)}</p>`).join('')}</div>` : ''}
    ${role.individualWin ? '<strong class="scapegoat-win">SCAPEGOAT VICTORY</strong>' : ''}
    ${presentation ? '<button id="role-continue" class="primary" type="button">Continue to Life cards <span aria-hidden="true">→</span></button>' : ''}
    ${view.phase === 'DAY' ? `<div class="council-vote"><h3>Council vote</h3><p>${view.councilVote?.votesCast ?? 0} ballots cast · ${view.councilVote?.required ?? 0} matching votes needed to eliminate a player.</p>
      ${canVote ? `<form id="vote-action"><label>Vote to eliminate <select name="target">${choices(false)}</select></label><button ${blocked ? 'disabled' : ''}>Seal vote</button></form>` : `<p>${view.councilVote?.yourTargetId ? `Your vote: ${name(view.councilVote.yourTargetId)}` : 'Voting unavailable.'}</p>`}</div>` : ''}
    </div>`;
  root.querySelector('#role-close')?.addEventListener('click', () => { open = false; root.classList.remove('is-open'); toggle?.setAttribute('aria-expanded', 'false'); });
  root.querySelector('#role-continue')?.addEventListener('click', () => { presentation = false; coverRolePanel(); openPrivatePanel(); });
  root.querySelector('#close-peek')?.addEventListener('click', close);
  root.querySelector<HTMLFormElement>('#role-action')?.addEventListener('submit', event => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement;
    const target = (form.elements.namedItem('target') as HTMLSelectElement).value;
    const second = (form.elements.namedItem('second') as HTMLSelectElement | null)?.value;
    if (second && target === second) return;
    if (target) use(target, second);
  });
  root.querySelector<HTMLFormElement>('#vote-action')?.addEventListener('submit', event => {
    event.preventDefault(); const target = ((event.currentTarget as HTMLFormElement).elements.namedItem('target') as HTMLSelectElement).value;
    if (target) vote(target);
  });
  const countdown = root.querySelector<HTMLElement>('.role-countdown');
  if (countdown) {
    const update = () => { countdown.textContent = `${Math.max(0, Math.ceil((Number(countdown.dataset.expires) - Date.now()) / 1000))}s until exposure`; };
    update(); interval = setInterval(update, 150);
  }
}
window.addEventListener('blur', coverRolePanel);
document.addEventListener('visibilitychange', () => { if (document.hidden) coverRolePanel(); });
