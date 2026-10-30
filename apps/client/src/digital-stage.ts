import { matchResult } from './match-result';
import type { RoomView } from '@ashfall/shared';
import { emblem } from './art';
import { cardTitle } from './card-info';
import { renderSeals, renderDoubt, renderRevealedLifeSummary, type TableSelection } from './tabletop-components';
import { phaseIcon, phaseName } from './phase-ui';
import { teammates } from './team-info';
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]!);
export function renderMatchHud(view: RoomView): string {
  if (!view.day) return `<span class="phase-banner">${view.phase === 'PRIVATE_DEAL' ? 'Private reveal' : 'Council gathering'}</span><p>Only you can inspect your role and Life cards.</p>`;
  const active = view.players.find(p => p.id === view.day!.activePlayerId);
  return `<span class="phase-banner" data-phase-icon="${view.phase === 'NIGHT' ? 'moon' : 'sun'}">${phaseIcon(view.phase)}<span>${phaseName(view.phase)}</span></span><p>${view.phase === 'NIGHT' ? 'Night' : 'Day'} ${view.day.dayNumber} <span>·</span> ${view.phase === 'DAY' ? `Turn: <b class="turn-name">${active?.id === view.you?.playerId ? 'You' : escape(active?.name ?? 'a player')}</b>` : view.phase === 'NIGHT' ? 'Make your private choices' : view.phase === 'DAWN' ? 'See who survived' : view.phase === 'GAME_OVER' ? 'The match has ended' : 'A Life card is revealed'}</p>${view.phase === 'DAY' ? '' : `<strong class="hud-deadline" data-deadline="${view.day.deadline ?? 0}" aria-label="Phase time remaining"></strong>`}<small class="hud-piles">Draw ${view.day.deckCount} · Discard ${view.day.discardCount}</small>`;
}
export function renderLocalLife(view: RoomView): string {
  const me = view.players.find(player => player.id === view.you?.playerId);
  if (!me || !view.deal) return '';
  return `<header>${emblem(me.avatar)}<h2>You · ${escape(me.name)}</h2><span>YOUR LIFE CARDS</span></header>${renderSeals(view, me.id)}${renderDoubt(view,me.id)}<button type="button" data-open-private-seals class="inspect-life">Inspect Life cards</button>`;
}
export function renderActionSpotlight(view: RoomView, selection: TableSelection, hoveredId = ''): string {
  const target = (id: string, label: string) => {
    const player = view.players.find(p => p.id === id);
    if (!player) return '';
    const ally = teammates(view).some(player => player.id === id);
    return `<div class="spotlight-player ${ally ? 'is-teammate' : ''}"><span class="eyebrow">${label}${ally ? ' · YOUR ALLY' : ''}</span><header>${emblem(player.avatar)}<h2 class="action-name">${escape(player.name)}</h2></header>${renderSeals(view,id)}${renderDoubt(view,id)}${renderRevealedLifeSummary(view,id)}</div>`;
  };
  const actor = (id: string | undefined, label: string) => {
    const player = view.players.find(p => p.id === id);
    return `<div class="action-actor"><span class="eyebrow">${label}</span><span>${player ? emblem(player.avatar) : ''}<b class="action-name ${view.phase === 'DAY' && id === view.day?.activePlayerId ? 'turn-name' : ''}">${escape(player?.name ?? 'Council')}</b></span></div>`;
  };
  if (!view.day) return '';
  if (selection.power) {
    const first = selection.selectedTargetId || hoveredId;
    return `<div class="power-aiming"><span class="eyebrow">YOUR PRIVATE POWER · CHOOSE A PLAYER</span><img src="${selection.power.art}" alt=""><h2>${escape(selection.power.name)}</h2><p>${escape(selection.power.description)}</p>${first ? `<strong>${escape(view.players.find(p => p.id === first)?.name ?? '')}${selection.secondTargetId ? ` &amp; ${escape(view.players.find(p => p.id === selection.secondTargetId)?.name ?? '')}` : ''}</strong>` : '<strong>Tap a highlighted player</strong>'}<small>Escape cancels · Nothing is used until you confirm</small></div>`;
  }
  if (view.phase === 'GAME_OVER') { const result = matchResult(view); return `<div class="spotlight-global"><span class="eyebrow">COUNCIL RESULT</span><h2>${escape(result.title)}</h2><p>${escape(result.description)}</p><p>${view.personalResult ? `Your result: ${view.personalResult === 'WIN' ? 'Victory' : 'Defeat'}.` : ''}</p></div>`; }
  if (view.phase === 'DAWN') {
    const name = view.players.find(player => player.id === view.dawn?.deceasedId)?.name;
    return `<div class="spotlight-global"><span class="eyebrow">DAWN BREAKS</span><h2>${name ? `${escape(name)} has fallen.` : 'The village wakes.'}</h2><p>${name ? 'Their remaining Life cards are now public.' : 'No one died tonight.'}</p></div>`;
  }
  if (selection.selectedCardKind) {
    const two = selection.selectedCardKind === 'SCAPEGOAT';
    const first = selection.selectedTargetId || hoveredId;
    const second = selection.secondTargetId || (two && selection.selectedTargetId ? hoveredId : '');
    const destination = ['CONSPIRACY','COUNCIL_BELL'].includes(selection.selectedCardKind)
      ? '<div class="spotlight-global"><span class="eyebrow">GLOBAL TARGET</span><h2>All living players</h2></div>'
      : `${first ? target(first, two ? 'FIRST · EFFECTS LEAVE' : hoveredId && !selection.selectedTargetId ? 'PREVIEW · NOT SELECTED' : 'RECEIVES THE CARD') : '<p class="spotlight-instruction">Choose a gold-highlighted player.</p>'}${two ? `<span class="action-direction" aria-hidden="true">→</span>${second ? target(second,'SECOND · EFFECTS ARRIVE') : '<p class="spotlight-instruction">Then choose who receives all the effects.</p>'}` : ''}`;
    return `<div class="action-route planning"><p class="route-state">PLANNING · CONFIRM TO PLAY</p>${actor(view.you?.playerId,'YOU ARE ACTING')}<div class="route-card-name"><span aria-hidden="true">↓</span><h2>${cardTitle(selection.selectedCardKind)}</h2><span aria-hidden="true">↓</span></div><div class="route-targets">${destination}</div></div>`;
  }
  if (view.phase === 'DAY' || view.phase === 'REVEAL_RESOLUTION') {
    // Approved public events supply the route. Never infer targets from private
    // hands, role results, or hidden Life-card transfers.
    const last = [...view.effects ?? []].reverse().find(effect => effect.type === 'PLAY' || effect.type === 'DRAW');
    if (last) {
      const global = ['CONSPIRACY','COUNCIL_BELL'].includes(last.cardKind??'');
      return `<div class="action-route resolved" data-public-action="${last.id}"><p class="route-state">${last.type === 'DRAW' ? 'LAST DRAW · TURN ENDED' : 'LAST CARD PLAYED'}</p>${actor(last.actorId,'ACTING PLAYER')}<div class="route-card-name"><span aria-hidden="true">↓</span><h2>${last.type === 'DRAW' ? `Drew ${last.count ?? 2} cards` : cardTitle(last.cardKind!)}</h2>${last.type === 'PLAY' ? '<span aria-hidden="true">↓</span>' : ''}</div><div class="route-targets">${last.type === 'DRAW' ? '' : global ? '<div class="spotlight-global"><h2>All living players</h2></div>' : `${last.targetId ? target(last.targetId,last.secondTargetId ? 'FIRST · EFFECTS LEAVE' : 'TARGET PLAYER') : ''}${last.secondTargetId ? `<span class="action-direction" aria-hidden="true">→</span>${target(last.secondTargetId,'SECOND · EFFECTS ARRIVE')}` : ''}`}</div><p class="route-help">${view.day.activePlayerId === view.you?.playerId ? 'Your turn · choose another card or end your turn.' : 'Watch the event log for the effect and any protection.'}</p></div>`;
    }
    return `<div class="action-route waiting"><p class="route-state">CURRENT TURN</p>${actor(view.day.activePlayerId,'ACTING PLAYER')}<h2>${view.day.activePlayerId === view.you?.playerId ? 'Your move.' : 'Choosing an action…'}</h2><p class="route-help">${view.day.activePlayerId === view.you?.playerId ? 'Select a card, then choose its target.' : 'Their next card and target will appear here.'}</p></div>`;
  }
  return `<div class="spotlight-empty"><span class="eyebrow">${view.phase === 'NIGHT' ? 'THE VILLAGE SLEEPS' : 'TRUST IS A FRAGILE THING'}</span><h2>${view.phase === 'NIGHT' ? 'Keep your secrets close.' : 'Watch the council.'}</h2><p>Follow the council record for what happens next.</p></div>`;
}
