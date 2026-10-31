import type { PublicPlayer, RoomView } from '@ashfall/shared';
import { emblem } from './art';

const escape = (value: string) => value.replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

/** Allegiance comes only from this viewer's private DTO, never a public role or Seal. */
export function teammates(view: RoomView): PublicPlayer[] {
  if (!view.private?.everWitch || view.role?.kind === 'SCAPEGOAT') return [];
  const authorized = new Set(view.private.witchTeammateIds);
  return view.players.filter(player => player.id !== view.you?.playerId && authorized.has(player.id) &&
    view.deal?.players.some(seat => seat.playerId === player.id && seat.alive));
}

export function renderTeamInfo(view: RoomView): string {
  if (!view.private?.everWitch || view.role?.kind === 'SCAPEGOAT') return '';
  const allies = teammates(view);
  return `<section class="private-team" aria-label="Your private Cultist team">
    <div class="team-heading">${emblem('moth')}<div><span>YOUR ALLEGIANCE · ONLY YOU CAN SEE THIS</span><b>You are a Cultist</b></div></div>
    <p>${allies.length ? 'Your teammates are:' : 'You have no living teammates yet.'}</p>
    ${allies.length ? `<ul class="team-names">${allies.map(player => `<li data-teammate="${player.id}">${emblem(player.avatar)}<strong>${escape(player.name)}</strong></li>`).join('')}</ul>` : ''}
    <small>${allies.length ? 'Their names have red ALLY tags on your table. Work together to survive.' : 'If another player becomes Cultist, their red ALLY tag will appear on your table.'} Your team updates when allegiances change.</small>
  </section>`;
}
