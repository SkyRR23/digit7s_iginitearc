import { IDENTITY_LABELS } from '@ashfall/shared';
import { emblem } from './art';
import { lifeSymbol } from './life-details';
import { roleArt } from './role-art';
import type { GameMoment } from './moment-script';

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]!);
export const lifePosition = (slot: number) => ['left corner','left inner','middle','right inner','right corner'][slot] ?? `position ${slot + 1}`;

/** This renderer accepts only the public Life snapshot captured by publicMoments. */
export function renderLifeReveal(moment: GameMoment, stage: 'announcement' | 'portrait' | 'position'): string {
  const reveal = moment.reveal, kind = moment.sealKind;
  if (!reveal || !kind) return '';
  const heading = `<p class="moment-eyebrow">${escape(reveal.reason)} · ${escape(reveal.name)}</p>`;
  if (stage === 'announcement') return `${heading}<div class="reveal-announcement"><span aria-hidden="true">✦</span><h2>${escape(reveal.name)}’s Life card<br>is being revealed</h2><p>One hidden Life comes to light…</p></div>`;
  if (stage === 'portrait') return `${heading}<div class="revealed-character-card life-${kind.toLowerCase()}"><img src="${roleArt(kind === 'WITCH' ? 'ASHBOUND' : 'VILLAGER')}" alt="${IDENTITY_LABELS[kind]} Life portrait"><div>${lifeSymbol(kind)}<h2>${IDENTITY_LABELS[kind]}</h2><span>LIFE CARD ${reveal.slot + 1}</span></div></div><p class="moment-description">${escape(moment.description)}</p>`;
  return `${heading}<h2>Life card ${reveal.slot + 1} · ${lifePosition(reveal.slot)}</h2><ol class="reveal-life-row" aria-label="${escape(reveal.name)}’s five Life positions">${reveal.seals.map(seal => `<li class="${seal.revealed ? 'face-up' : 'face-down'} ${seal.slot === reveal.slot ? 'revealed-position' : ''}" data-reveal-slot="${seal.slot}" aria-label="Life ${seal.slot + 1}: ${seal.revealed ? IDENTITY_LABELS[seal.kind] : 'hidden'}${seal.slot === reveal.slot ? ', just revealed' : ''}">${seal.revealed ? lifeSymbol(seal.kind) : emblem('lantern')}<b>${seal.slot + 1}</b>${seal.slot === reveal.slot ? '<span class="reveal-position-cross" aria-hidden="true">×</span>' : ''}</li>`).join('')}</ol><p class="reveal-position-caption">This is the revealed position. It stays face up.</p><p class="moment-description">${escape(moment.description)}</p>`;
}
