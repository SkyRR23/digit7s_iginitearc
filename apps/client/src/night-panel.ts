import type { NightIntent, RoomView } from '@ashfall/shared';

const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
let draftKey = '';
const drafts = { attack: '', protection: '' };

export function renderNightPanel(root: HTMLElement, view: RoomView | null, blocked: boolean,
  dispatch: (intent: NightIntent) => void): void {
  root.hidden = view?.phase !== 'NIGHT' || !view.night;
  if (root.hidden || !view?.night) { root.replaceChildren(); return; }
  const me = view.you!.playerId;
  const key = `${view.deal!.matchId}:${view.night.nightNumber}:${me}`;
  if (key !== draftKey) { draftKey = key; drafts.attack = ''; drafts.protection = ''; }
  const name = (id: string) => escape(view.players.find(p => p.id === id)?.name ?? 'A player');
  const allies = new Set(view.private?.witchTeammateIds ?? []);
  root.innerHTML = '<p class="eyebrow">PRIVATE · YOUR NIGHT CHOICES</p><p>Each choice is final once sealed. Missing choices count as abstaining. Resolution waits for the server deadline, even if everyone has chosen.</p>' +
    (['attack', 'protection'] as const).map(ability => {
      const choice = view.night![ability]; if (!choice) return '';
      const targets = view.deal!.players.filter(p => p.alive && p.playerId !== me && (ability !== 'attack' || !allies.has(p.playerId)));
      if (!targets.some(p => p.playerId === drafts[ability])) drafts[ability] = '';
      return `<section class="night-choice"><h3>${ability === 'attack' ? 'Ashbound attack vote' : 'Lanternkeeper protection'}</h3>
        <p>${ability === 'attack' ? 'Most votes decide the attack. Ties choose the earliest target in seat order. You cannot target an ally.' : 'Protect another living player. You cannot protect yourself. Your allegiance does not change this ability.'}</p>
        ${choice.submitted ? `<p class="sealed-choice" data-sealed="${ability}">Choice sealed: <strong>${choice.targetId ? name(choice.targetId) : 'Abstain'}</strong></p>` :
          `<form data-night="${ability}"><label for="night-${ability}">Your ${ability === 'attack' ? 'vote' : 'protection target'}</label><select id="night-${ability}" ${blocked ? 'disabled' : ''}><option value="">Abstain</option>${targets.map(p => `<option value="${p.playerId}" ${drafts[ability] === p.playerId ? 'selected' : ''}>${name(p.playerId)}</option>`).join('')}</select><button class="primary" ${blocked ? 'disabled' : ''}>Seal ${ability === 'attack' ? 'attack vote' : 'protection'}</button></form>`}</section>`;
    }).join('');
  if (!view.night.attack && !view.night.protection) root.insertAdjacentHTML('beforeend', '<p class="mobile-night-rest">No attack or protection to submit. Wait for Dawn, or check your role power in You.</p>');
  root.querySelectorAll<HTMLFormElement>('[data-night]').forEach(form => form.addEventListener('submit', event => {
    event.preventDefault();
    dispatch({ type: form.dataset.night === 'attack' ? 'nightAttack' : 'nightProtect', targetId: form.querySelector('select')!.value || null });
  }));
  for (const ability of ['attack', 'protection'] as const) root.querySelector<HTMLSelectElement>(`#night-${ability}`)?.addEventListener('change', event => {
    drafts[ability] = (event.target as HTMLSelectElement).value;
  });
}
