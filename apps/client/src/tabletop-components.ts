import { matchResult } from './match-result';
import { IDENTITY_LABELS, type ActionCard, type PublicPlayer, type RoomView } from '@ashfall/shared';
import { emblem } from './art';
import { cardGlyph } from './card-art';
import { cardArt, CARD_INFO, cardTitle } from './card-info';
import { chainOverlay, statusSymbol } from './status-art';
import { lifeSymbol } from './life-details';
import { teammates } from './team-info';
import { actionPeople } from './action-people';

const escape = (value: string) => value.replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
export const lifeHeart = () => '<svg class="life-heart" viewBox="0 0 80 90" aria-hidden="true"><path d="M40 78 10 48C-7 30 9 3 31 15l9 8 9-8C71 3 87 30 70 48Z"/><path d="M40 32v29m-11-15h22"/></svg>';
const brokenHeart = () => '<svg class="broken-heart" viewBox="0 0 80 90" aria-hidden="true"><path d="M36 80 10 49C-7 29 10 2 31 15l9 8-8 18 9 5-10 14zM45 76l25-27C87 29 70 2 49 15l-7 8 7 22-9 6 5 11z"/></svg>';

export interface TableSelection {
  power?: { name: string; description: string; art: string };
  selectedCardId: string;
  selectedCardKind: ActionCard['kind'] | null;
  selectedTargetId: string;
  secondTargetId: string;
  validTargetIds: readonly string[];
}

export const emptyTableSelection = (): TableSelection => ({
  selectedCardId: '', selectedCardKind: null, selectedTargetId: '', secondTargetId: '', validTargetIds: [],
});

export function renderSeals(view: RoomView, playerId: string): string {
  const dealt = view.deal?.players.find(player => player.playerId === playerId);
  if (!dealt) return '';
  const hidden = dealt.seals.filter(seal => !seal.revealed).length;
  return `<div class="seat-seals">
    <ol class="public-seals" aria-label="Five Life cards">${dealt.seals.map(seal =>
      `<li class="${seal.revealed ? `revealed seal-${seal.kind.toLowerCase()}` : 'seal-back'} ${!dealt.alive ? 'life-broken' : ''}" data-seal-slot="${seal.slot}" ${seal.revealed ? '' : 'title="Hidden Life card. Only its owner may inspect it. Seven Doubt reveals one random hidden Life card."'} aria-label="Life ${seal.slot + 1}: ${seal.revealed ? IDENTITY_LABELS[seal.kind] : 'face down'}">${seal.revealed ? `${!dealt.alive ? brokenHeart() : ''}<button type="button" data-revealed-life="${seal.kind}" data-life-slot="${seal.slot + 1}" aria-label="Inspect revealed Life ${seal.slot + 1}: ${IDENTITY_LABELS[seal.kind]}">${lifeSymbol(seal.kind)}</button>` : playerId === view.you?.playerId ? `<button type="button" data-open-private-seals aria-label="Inspect all your private Life cards">${emblem('lantern')}</button>` : emblem('lantern')}</li>`).join('')}</ol>
    <span class="hidden-seal-count" aria-label="${hidden} hidden Seals"><b>${hidden}</b> hidden</span>
  </div>`;
}
export function renderRevealedLifeSummary(view: RoomView, playerId: string): string {
  const revealed = view.deal?.players.find(player => player.playerId === playerId)?.seals.filter(seal => seal.revealed) ?? [];
  if (!revealed.length) return '';
  const kinds = [...new Set(revealed.map(seal => seal.kind))];
  return `<div class="revealed-life-summary" aria-label="Revealed Life identities">${kinds.map(kind => {
    const count = revealed.filter(seal => seal.kind === kind).length;
    return `<button type="button" class="revealed-life-badge life-${kind.toLowerCase()}" data-revealed-life="${kind}" data-life-count="${count}" aria-label="Inspect ${count} revealed ${IDENTITY_LABELS[kind]} Life card${count === 1 ? '' : 's'}">${lifeSymbol(kind)}<span>${IDENTITY_LABELS[kind]}</span><b>×${count}</b></button>`;
  }).join('')}</div>`;
}

export function renderDoubt(view: RoomView, playerId: string): string {
  const player = view.day?.players.find(candidate => candidate.playerId === playerId);
  if (!player || !view.day) return '';
  const cards = Array.from({ length: Math.min(player.doubt,view.day.accusationThreshold) }, (_, index) => `<span class="doubt-tile filled" data-doubt-index="${index}" aria-hidden="true">×</span>`).join('');
  return `<div class="attached-status">
    <div class="doubt-track" aria-label="${player.doubt} of seven Doubt">${cards}</div>
  </div>`;
}
const statusInfo = {
  BOUND: ['⛓','Bound: skips the next turn. Mercy removes it.'],
  ASYLUM: ['☾','Asylum: blocks one harmful night effect; expires at Dawn.'],
  PIETY: ['✦','Blessed: blocks the next Evidence or Witness.'],
  HEARTHWARD: ['♨','Warded: blocks the next Whisper.'],
  VOW_HEART: ['♥','Linked Heart: direct Doubt from a played card shares one Doubt with each other Heart holder. Lasts until Dispel removes this Heart or this player dies.'],
  BLACK_CAT: ['◆','Curse: Conspiracy reveals one random hidden Life card on this player before Life cards shift. Scapegoat moves the curse; Dispel removes it.'],
} as const;

export function renderPlayerSeat(view: RoomView, player: PublicPlayer, absoluteIndex: number,
  position: number, selection: TableSelection): string {
  const you = player.id === view.you?.playerId;
  const dealt = view.deal?.players.find(candidate => candidate.playerId === player.id);
  const counters = view.day?.players.find(candidate => candidate.playerId === player.id);
  const alive = dealt?.alive !== false;
  const active = view.phase === 'DAY' && view.day?.activePlayerId === player.id;
  const teammate = teammates(view).some(ally => ally.id === player.id);
  const action = actionPeople(view);
  const actionActor = action.actorId === player.id;
  const actionTarget = action.targetIds.includes(player.id);
  const validTarget = selection.validTargetIds.includes(player.id);
  const selectedTarget = selection.selectedTargetId === player.id;
  const secondTarget = selection.secondTargetId === player.id;
  const state = player.abandoned ? 'Departed · seat forfeited' : !player.connected ? 'Reconnecting' : !alive ? 'Dead' : active ? 'Taking turn' : dealt ? 'Alive' : player.ready ? 'Ready' : 'Waiting';
  const history = dealt?.historicalWitch === undefined ? '' :
    `<span class="history-marker">${dealt.historicalWitch ? 'Was Ashbound' : 'Never Ashbound'}</span>`;
  const targetLabel = validTarget ? `, valid target for ${selection.selectedCardKind === 'CINDER_SHIFT' ? 'Cinder Shift' : 'selected card'}` : '';
  const canRemoveBot = view.phase === 'LOBBY' && view.hostId === view.you?.playerId && player.isBot;
  const statuses = counters?.statuses ?? [];
  const heart = statuses.some(status => status.kind === 'VOW_HEART');
  const vow = view.day?.vows?.find(link => link.playerIds.includes(player.id));
  const partners = [...new Set(view.day?.vows?.filter(link => link.playerIds.includes(player.id)).flatMap(link => link.playerIds.filter(id => id !== player.id)) ?? [])]
    .map(id => view.players.find(other => other.id === id)?.name ?? 'Council member');
  return `<article class="seat table-seat position-${position} ${you ? 'is-you' : ''} ${teammate ? 'is-teammate' : ''} ${player.ready && player.connected ? 'is-ready' : ''} ${alive ? 'is-alive' : 'is-dead'} ${active ? 'is-active' : ''} ${validTarget ? 'is-valid-target' : ''} ${selectedTarget ? 'is-selected-target' : ''} ${secondTarget ? 'is-second-target' : ''} ${statuses.map(status => `has-${status.kind.toLowerCase()}`).join(' ')} ${vow ? 'has-vow' : heart ? 'has-lone-heart' : ''}"
      data-player="${player.id}" data-seat-index="${absoluteIndex}" data-table-position="${position}" ${validTarget ? 'tabindex="0" role="button"' : ''}
      aria-label="Seat ${absoluteIndex + 1}, ${escape(player.name)}, ${state}${teammate ? ', your Ashbound teammate' : ''}${targetLabel}">
    <div class="seat-badges"><span class="seat-number">${String(absoluteIndex + 1).padStart(2, '0')}</span>
      ${player.id === view.hostId ? '<span class="host-tag">HOST</span>' : ''}
      ${player.isBot ? `<span class="bot-tag">BOT · ${player.botDifficulty}</span>` : ''}
      ${teammate ? '<span class="ally-tag">ALLY <span aria-hidden="true">◆</span></span>' : ''}
    </div>
    ${dealt && you && view.private ? `<button class="private-seal-trigger identity-back" type="button" data-open-private-seals aria-label="Open your private Life cards">${emblem('lantern')}</button>` : ''}
    <div class="portrait-wrap"><span class="villager-portrait portrait-${player.avatar}" aria-hidden="true"></span>${emblem(player.avatar)}<span class="speaking-indicator" data-speaking="false" aria-label="Not speaking"></span>${heart ? `<span class="portrait-heart" aria-hidden="true">${statusSymbol('VOW_HEART')}</span>` : ''}${statuses.some(s => s.kind === 'BOUND') ? `<span class="portrait-chain" aria-hidden="true">${chainOverlay}</span>` : ''}${!alive ? '<span class="death-mark" aria-label="Eliminated">×</span>' : ''}</div>
    <div class="seat-name ${actionActor ? 'is-action-actor' : ''} ${actionTarget ? 'is-action-target' : ''}">${active ? '<span class="turn-dust" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>' : ''}<h3>${escape(player.name)}</h3>${you ? '<small>YOU</small>' : ''}${actionActor||actionTarget ? `<span class="action-name-label">${actionActor?'PLAYED': 'TARGET'}</span>` : ''}</div>
    <p class="seat-status">${state}${counters ? ` · ${counters.handCount} cards` : ''}</p>
    ${renderSeals(view, player.id)}
    ${renderDoubt(view, player.id)}
    ${renderRevealedLifeSummary(view, player.id)}
    <div class="status-icons" aria-label="Active statuses">${counters?.remedy ? `<button type="button" class="status-icon status-remedy" title="Herbal remedy: blocks one harmful targeted effect or night attack until Dawn." aria-label="Herbal remedy active">${statusSymbol('REMEDY')}<b>REMEDY</b></button>` : ''}${statuses.map(status => {
      const info = status.kind === 'VOW_HEART' && !vow ? ['♥','Heart waiting: another Vow card must place a Heart on someone else before Doubt is shared. Lasts until Dispel removes it or this player dies.'] : statusInfo[status.kind];
      const explanation = `${status.kind === 'VOW_HEART' && partners.length ? `Heart linked with ${partners.join(', ')}. ` : ''}${info[1]}`;
      return `<button type="button" class="status-icon status-${status.kind.toLowerCase()}" title="${escape(explanation)}" aria-label="${escape(explanation)}">${statusSymbol(status.kind)}<b>${status.kind === 'VOW_HEART' ? vow ? `WITH ${escape(partners.join(', '))}` : 'HEART WAITING' : status.kind === 'HEARTHWARD' ? 'WARDED' : status.kind === 'PIETY' ? 'BLESSED' : status.kind==='BLACK_CAT'?'CURSED':status.kind.replaceAll('_', ' ')}</b></button>`;
    }).join('')}</div>
    ${history}
    ${canRemoveBot ? `<button class="remove-bot small" data-remove-bot="${player.id}">Remove Bot</button>` : ''}
    <button type="button" class="target-callout" data-choose-player="${player.id}" ${!validTarget && !selectedTarget && !secondTarget ? 'hidden' : ''} ${validTarget ? '' : 'disabled'} aria-label="Choose ${escape(player.name)} as target">${selectedTarget ? selection.selectedCardKind === 'SCAPEGOAT' ? 'FIRST' : 'TARGET' : secondTarget ? 'SECOND' : validTarget ? 'CHOOSE' : ''}</button>
  </article>`;
}

export function renderEmptySeat(absoluteIndex: number, position: number): string {
  return `<article class="seat table-seat empty position-${position}" data-table-position="${position}">
    <span class="seat-number">${String(absoluteIndex + 1).padStart(2, '0')}</span><span class="empty-sigil">+</span><h3>Empty chair</h3><p>Waiting for a voice</p>
  </article>`;
}

export function renderTableCenter(view: RoomView): string {
  const day = view.day;
  if (!day) {
    const acknowledged = view.deal?.players.filter(player => player.acknowledged).length ?? 0;
    const message = view.phase === 'PRIVATE_DEAL'
      ? `<span class="table-prephase">PRIVATE DEAL</span><b>${acknowledged} / ${view.capacity}</b><p>players have inspected their Seals</p>`
      : `<p>The council awaits ${view.capacity} ready players.</p>`;
    return `<div class="table-crest" aria-hidden="true">${emblem('lantern')}</div><div class="table-message">${message}</div>`;
  }
  const active = view.players.find(player => player.id === day.activePlayerId)?.name ?? 'Council';
  const phase = view.phase.replaceAll('_', ' ');
  const canDraw = view.phase === 'DAY' && day.activePlayerId === view.you?.playerId && !day.playedThisTurn && day.deckCount > 0;
  return `<div class="table-phase"><span>${phase}</span><b>${view.phase === 'DAY' ? `${escape(active)}’s turn` : view.phase === 'REVEAL_RESOLUTION' ? 'A Seal must open' : view.phase === 'GAME_OVER' ? `${escape(matchResult(view).title)}` : `Day ${day.dayNumber}`}</b></div>
    ${day.deadline ? `<div class="table-timer" aria-label="Phase timer"><span aria-hidden="true">◷</span><strong data-deadline="${day.deadline}"></strong></div>` : ''}
    <div class="table-piles" aria-label="Action card piles">
      <button id="table-draw" class="card-pile draw-pile" ${canDraw ? '' : 'disabled'} aria-label="${canDraw ? `Draw ${Math.min(2, day.deckCount)} cards and end turn` : `${day.deckCount} cards in draw deck`}">
        <span class="pile-card pile-card-3"></span><span class="pile-card pile-card-2"></span><span class="pile-card pile-card-1">${emblem('moon')}</span><b>${day.deckCount}</b><small>DRAW</small>
      </button>
      <div class="card-pile discard-pile" aria-label="${day.discardCount} cards discarded"><span class="pile-card discard-face">${day.discardCount ? cardGlyph([...view.effects ?? []].reverse().find(effect => effect.type === 'PLAY')?.cardKind ?? 'WHISPER') : '—'}</span><b>${day.discardCount}</b><small>DISCARD</small></div>
    </div>
    <p class="table-rule">Seven Doubt lets the accuser choose a Life card</p>`;
}

export function renderActionCard(card: ActionCard, selected: boolean, disabled: boolean,
  index: number, handSize: number, copies = 1, selectedCopies = 0): string {
  const title = cardTitle(card.kind);
  const detail: Record<ActionCard['kind'], string> = {
    EVIDENCE: '+1 Doubt', TESTIMONY:'+3 Doubt', CURSE:'Place a Curse', COUNCIL_BELL:'Call council vote', EAVESDROP:'Inspect a player’s hand', WITNESS: 'Reveal a Life card', ALIBI: 'Remove 2 Doubt', STOCKS: 'Skip next turn',
    ASYLUM: 'Night shield', PIETY: 'Bless one player', DISPEL: 'Break protection', MERCY: 'Cleanse and unbind',
    SCAPEGOAT: 'Transfer all Doubt & effects', VOW_OF_HEARTS: 'Give one Heart', CONSPIRACY: 'Shift hidden lives',
    WHISPER: 'Secret insight', HEARTHWARD: 'Block one Whisper', CINDER_SHIFT: 'Random Life swap',
  };
  const sigil = ({ TESTIMONY:'3',CURSE:'C',COUNCIL_BELL:'B',EAVESDROP:'H', EVIDENCE:'1',WITNESS:'7',ALIBI:'⚖',STOCKS:'⛓',ASYLUM:'☾',PIETY:'✦',DISPEL:'☠',MERCY:'✧',SCAPEGOAT:'↝',VOW_OF_HEARTS:'♥',CONSPIRACY:'◌',WHISPER:'!',HEARTHWARD:'◇',CINDER_SHIFT:'↭' } as const)[card.kind];
  const shortTitle = ({ VOW_OF_HEARTS:'Vow', CINDER_SHIFT:'Shift' } as Partial<Record<ActionCard['kind'],string>>)[card.kind] ?? title;
  const middle = (handSize - 1) / 2;
  const angle = Math.max(-7, Math.min(7, (index - middle) * 1.35));
  const rise = Math.abs(index - middle) * 2.4;
  return `<button type="button" data-card="${card.id}" data-action-kind="${card.kind}" aria-pressed="${selected}" aria-disabled="${disabled}" aria-label="${title}, ${copies} in hand, ${selectedCopies} selected. ${detail[card.kind]}. ${disabled ? 'Not available to play now. Focus or open details to read this card.' : 'Select this card.'}" class="action-card card-${card.kind.toLowerCase()} ${selected ? 'selected' : ''}" style="--card-index:${index};--fan-angle:${angle}deg;--fan-rise:${rise}px">
    <span class="action-card-corner" aria-hidden="true"><i>${sigil}</i><em>${shortTitle}</em></span>
      ${copies > 1 ? `<span class="card-stack-count" aria-hidden="true">${selectedCopies?`${selectedCopies}/${copies}`:`×${copies}`}</span>` : ''}<span class="action-card-sigil" aria-hidden="true"><img src="${cardArt(card.kind)}" alt="" loading="eager"></span><b><span class="card-title-full">${title}</span><span class="card-title-short">${shortTitle}</span></b><span>${CARD_INFO[card.kind].brief}</span><small>${card.kind.replaceAll('_', ' ')}</small>
  </button>`;
}
