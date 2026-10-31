import {audio} from './audio';
import { renderDecisionUI, updateDecisionTimers } from './decision-ui';
import './decision-ui.css';
import { AVATARS, canStart, type Avatar, type BotDifficulty, type Command, type DayIntent, type RoomView } from '@ashfall/shared';
import { actionId, readSession, request, saveSession, socket } from './connection';
import { emblem } from './art';
import { coverPrivateIdentities, openPrivatePanel, renderPrivatePanel } from './private-panel';
import { beginCardDrag, clearDaySelection, getDayTableSelection, renderDayPanel, selectDayTableTarget, tapHandCard, updateDayTimers } from './day-panel';
import { installCardDragging } from './card-drag';
import { renderPowerControls, selectRolePowerTarget } from './power-controls';
import { phaseName } from './phase-ui';
import { installGamePreferences } from './game-preferences';
import { clearGameMoments } from './game-moments';
import { installGameGuide, openGameGuide, updateGameGuide } from './game-guide';
import { installPresentationUI, updatePresentationUI } from './presentation-ui';
import { renderNightPanel } from './night-panel';
import { coverRolePanel, renderRolePanel, toggleRolePanel } from './role-panel';
import { renderActionSpotlight, renderLocalLife, renderMatchHud } from './digital-stage';
import { installCardDetails } from './card-details';
import { installLifeDetails } from './life-details';
import { roleSymbol } from './role-art';
import { acceptsView } from './view-order';
import { emptyTableSelection, renderEmptySeat, renderPlayerSeat, renderTableCenter, type TableSelection } from './tabletop-components';
import { animateTableChanges, captureTablePositions } from './table-effects';
import './style.css';
import './tabletop.css';
import './council-scene.css';
import './card-expansion.css';
import './role-panel.css';
import './life-transfer.css';
import './digital-ui.css';
import './game-feel.css';
import './cinematic.css';
import './game-guide.css';
import './presentation.css';
import './cinematic-upgrade.css';

const root = document.querySelector<HTMLDivElement>('#app')!;
document.body.classList.add('digital-ui');
installCardDetails();
installLifeDetails();
let view: RoomView | null = null;
let session = readSession();
let busy = false;
let recovering = false;
let connectionEpoch = 0;
let selected: Avatar = 'lantern';
let botDifficulty: BotDifficulty = 'NORMAL';
let powerSelection = emptyTableSelection();
const activeSelection = () => powerSelection.power ? powerSelection : getDayTableSelection();
root.innerHTML = `
  <header class="topbar"><a class="brand" href="/" aria-label="Ashfall Council home">${roleSymbol('SCAPEGOAT')}<span>ASHFALL COUNCIL<small>A GAME OF SECRETS</small></span></a><div class="game-preferences"><button id="motion-toggle" type="button" aria-label="Toggle quieter animations">Motion: Full</button><button id="sound-toggle" type="button" aria-label="Toggle game sounds">Sound: On</button></div><span id="connection" class="connection" role="status">Connecting…</span></header>
  <main>
    <section id="entry" class="entry">
      <div class="intro"><p class="eyebrow">A GAME OF SECRETS</p><h1>ASHFALL<br>COUNCIL</h1><p class="lede">The village has gathered.<br>Someone is hiding in plain sight.</p><div class="intro-menu"><button id="friends-open" type="button" class="primary">Play with friends <span>→</span></button><button id="how-to-open" type="button">How to play <span>→</span></button></div><div class="intro-foot"><span>6–10 PLAYERS</span><span>PRIVATE ROOMS</span><span>PLAY WITH BOTS</span></div></div>
      <section class="entry-card" aria-labelledby="entry-title"><p class="eyebrow">PLAY WITH FRIENDS</p><h2 id="entry-title">Join the council</h2><p>Create a private room or enter a friend’s code.</p>
        <form id="entry-form"><label for="name">Your name <span>public</span></label><input id="name" name="name" required maxlength="24" autocomplete="nickname" placeholder="What should we call you?"><label for="capacity">Seats for new gathering</label><select id="capacity" name="capacity"><option value="6">6 players</option><option value="7">7 players</option><option value="8">8 players</option><option value="9">9 players</option><option value="10">10 players</option></select>
        <fieldset><legend>Your village sigil <span>cosmetic only</span></legend><div class="avatar-picker">${AVATARS.map((avatar, i) => `<label class="avatar-option"><input type="radio" name="avatar" value="${avatar}" ${i === 0 ? 'checked' : ''}>${emblem(avatar)}<span>${avatar}</span></label>`).join('')}</div></fieldset>
        <button id="create" type="submit" class="primary" disabled>Create room <span>→</span></button>
        <div class="divider"><span>or join your friends</span></div>
        <label for="room-code">Room code</label><div class="join-row"><input id="room-code" name="code" maxlength="8" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="8 characters"><button id="join" type="submit" disabled>Join room</button></div></form>
        <p class="scope-note">Hidden lives. Shared suspicion. One council.</p>
      </section>
    </section>
    <section id="lobby" hidden>
      <div class="room-heading"><div><p class="eyebrow"><span id="phase-label">OPEN GATHERING</span></p><h1>Friends lobby</h1><p id="room-summary"></p></div><div class="room-code-box"><span>INVITE CODE</span><div><strong id="code"></strong><button id="copy" class="small">Copy code</button><button id="leave" class="small quiet">Leave</button></div></div></div>
      <nav id="table-nav" class="table-nav" aria-label="Gathering sections"><a href="#tabletop" id="table-link">Table</a><a href="#day-panel" id="actions-link">Hand</a><a href="#private-panel" id="seals-link">My Seals</a><a href="#chat-form">Council</a></nav>
      <p id="recovery-banner" class="recovery-banner" role="status" hidden></p>
      <div class="room-layout game-layout"><div class="play-column">
        <section class="table-panel tabletop-panel" aria-label="Public player roster"><div class="tabletop-frame" id="tabletop"><h2 class="roster-title">Players <small id="roster-count"></small><span class="roster-hint">Choose a highlighted player</span></h2><div id="seats" class="seats tabletop-seats"></div></div><div id="controls" class="controls"></div></section>
        <section id="action-stage" class="action-stage" aria-label="Council action area"><div id="match-hud" class="match-hud"></div><div id="action-spotlight" class="action-spotlight" aria-live="polite"></div><div id="action-confirmation"></div><div id="table-center" class="table-center"></div><section id="night-panel" class="private-panel" aria-label="Private night choices" hidden></section></section>
        <section id="local-life" class="local-life" aria-label="Your public Life row" hidden></section>
        <section id="day-panel" class="day-panel action-dock" aria-label="Your hand and day actions" hidden></section>
        <button id="role-toggle" class="role-toggle" type="button" aria-controls="role-panel" aria-expanded="false" hidden>✦ My role</button>
        <section id="power-dock" class="power-dock" aria-label="Your private role power" hidden></section>
        <section id="role-panel" class="role-panel" aria-label="Your private role" hidden></section>
        <section id="private-panel" class="private-panel" aria-label="Your private identities" hidden></section>
      </div><aside id="council-panel" class="council-panel"><div class="panel-heading"><h2>Council chat</h2><span class="public-label">PUBLIC</span><button id="chat-close" class="chat-close" type="button" aria-label="Close chat">×</button></div><ol id="feed" class="feed" aria-label="Council chat" aria-live="polite" aria-relevant="additions"></ol><form id="chat-form"><label class="sr-only" for="message">Message to the gathering</label><div class="chat-row"><input id="message" maxlength="240" autocomplete="off" placeholder="Speak to the council…"><button id="send" type="submit" aria-label="Send message">Send</button></div></form><div class="event-heading"><h2>Event log</h2><span>COUNCIL RECORD</span></div><ol id="event-feed" class="feed event-feed" aria-label="Public game events" aria-live="polite" aria-relevant="additions"></ol></aside><button id="chat-toggle" class="chat-toggle" type="button" aria-expanded="false" aria-controls="council-panel"><span aria-hidden="true"><svg class="control-icon" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 4h18a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H12l-6 4v-4H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z"/><circle cx="8" cy="13" r="1"/><circle cx="14" cy="13" r="1"/><circle cx="20" cy="13" r="1"/></svg></span><span>Chat &amp; events</span></button></div>
      <div class="room-footer"><p>${emblem('moon')} <span id="scope-footer">Your public sigil carries no ability.</span></p></div>
    </section>
    <p id="notice" class="notice" role="status" aria-live="polite" hidden></p>
    ${import.meta.env.DEV ? '<details class="debug"><summary>Development connection details</summary><pre id="debug"></pre></details>' : ''}
  </main><footer class="page-footer"><span>ASHFALL COUNCIL</span><span>A game of secrets.</span></footer><dialog id="how-to-dialog"><button id="how-to-close" type="button" aria-label="Close how to play">×</button><h2>How to play</h2><p>Your role stays with you. Your five hidden Life cards determine survival and allegiance; some cards can move them.</p><p>On your turn, drag a card onto a highlighted player, or tap a card and choose a player. On phones, hold briefly to drag; swipe quickly to browse your hand. Review and confirm the effect to play. Targeted cards must be played on another living player. Keep playing or end your turn. Drawing two is the alternative and ends the turn.</p><p>Seven Doubt reveals one random hidden Life card. Watch for Night: only players with a private choice can submit one. Tap your corner power icon, choose a highlighted player, then confirm Yes or No. Open role info for the council vote.</p><p>Inspect card details for exact targets, durations, and protections.</p></dialog>`;

installGamePreferences();
installGameGuide();
installPresentationUI();
document.addEventListener('ashfall:presentation-finished',event=>{
  const id=(event as CustomEvent<{id:string}>).detail.id;
  if(!socket.connected||!view?.deal||view.presentation?.id!==id)return;
  const matchId=view.deal.matchId;
  void request({type:'finishPresentation',actionId:actionId(),matchId,presentationId:id}).then(reply=>{
    if(reply.ok&&reply.view&&view?.deal?.matchId===matchId)render(reply.view);
  });
});
installCardDragging(document.getElementById('day-panel')!, { begin: beginCardDrag, tap: tapHandCard, selection: getDayTableSelection, target: selectDayTableTarget, cancel: clearDaySelection });
function element<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id) as T; }
function notice(text: string): void { element('notice').textContent = text; element('notice').hidden = !text; }
function dispatchDay(intent: DayIntent): void {
  if (view?.day && view.deal) void act({ ...intent, actionId: actionId(), matchId: view.deal.matchId,
    turnNumber: view.day.turnNumber, gameVersion: view.day.version });
}
function applyTableSelection(selection: TableSelection = emptyTableSelection()): void {
  const targeting = !!selection.selectedCardKind || !!selection.power;
  element('action-stage').classList.toggle('is-targeting', targeting);
  document.body.classList.toggle('power-targeting', !!selection.power);
  const hint = document.querySelector('.roster-hint');
  if (hint) hint.textContent = targeting ? 'Choose a highlighted player' : 'Players';
  element('seats').classList.toggle('targeting', targeting && selection.selectedCardKind !== 'CONSPIRACY');
  element('seats')?.querySelectorAll<HTMLElement>('[data-player]').forEach(seat => {
    const playerId = seat.dataset.player!;
    const valid = selection.validTargetIds.includes(playerId);
    const selectedTarget = selection.selectedTargetId === playerId;
    const secondTarget = selection.secondTargetId === playerId;
    seat.classList.toggle('is-valid-target', valid);
    seat.classList.toggle('is-selected-target', selectedTarget);
    seat.classList.toggle('is-second-target', secondTarget);
    if (valid) { seat.tabIndex = 0; seat.setAttribute('role', 'button'); }
    else { seat.removeAttribute('tabindex'); seat.removeAttribute('role'); }
    const callout = seat.querySelector<HTMLElement>('.target-callout');
    if (callout) {
      callout.textContent = selectedTarget ? selection.selectedCardKind === 'SCAPEGOAT' ? 'FIRST' : 'TARGET' : secondTarget ? 'SECOND' : valid ? 'CHOOSE' : '';
      callout.hidden = !valid && !selectedTarget && !secondTarget;
      (callout as HTMLButtonElement).disabled = !valid;
    }
  });
  if (view) element('action-spotlight').innerHTML = renderActionSpotlight(view, selection);
}
function previewTarget(seat: HTMLElement): void {
  if (!seat.classList.contains('is-valid-target')) return;
  const selection = activeSelection();
  if (view) element('action-spotlight').innerHTML = renderActionSpotlight(view, selection, seat.dataset.player);
}
document.addEventListener('ashfall:day-selection', event => { if (!powerSelection.power) applyTableSelection((event as CustomEvent<TableSelection>).detail); });
document.addEventListener('ashfall:power-selection', event => {
  powerSelection = (event as CustomEvent<TableSelection>).detail;
  applyTableSelection(activeSelection());
});
function connection(): void {
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement.id : '';
  const connected = socket.connected && !recovering;
  const safeView = view && !connected ? { ...view, private: null, hand: null, night: null, peek: null, handPeek: null, role: null } : view;
  updatePresentationUI(safeView); updateGameGuide(safeView);
  const gameplayBlocked=!connected||busy||!!view?.presentation;
  renderDecisionUI(safeView,gameplayBlocked,dispatchDay,targetId=>{
    if(view?.deal&&view.day)void act({type:'councilVote',actionId:actionId(),matchId:view.deal.matchId,dayNumber:view.day.dayNumber,targetId});
  });
  element('recovery-banner').hidden = connected || !view;
  element('recovery-banner').textContent = recovering ? 'Restoring your seat and current permissions…' : 'Connection lost. Reconnecting automatically. Your seat is reserved for 60 seconds; match deadlines continue.';
  element('actions-link').hidden = !view?.day;
  element('seals-link').hidden = !safeView?.private;
  element('connection').textContent = recovering ? 'Recovering your seat…' : connected ? 'Connected' : 'Reconnecting…';
  element('connection').classList.toggle('online', connected);
  for (const id of ['create', 'join', 'send', 'leave']) element<HTMLButtonElement>(id).disabled = !connected || busy;
  const silent = view?.phase === 'NIGHT' || (view?.deal?.players.find(p => p.playerId === view?.you?.playerId)?.alive === false && view?.phase !== 'GAME_OVER');
  element<HTMLButtonElement>('send').disabled = !connected || busy || !!silent;
  element<HTMLInputElement>('message').disabled = !!silent;
  if (view) renderControls();
  renderPrivatePanel(element('private-panel'), safeView, !connected || busy, () => {
    if (view?.deal) void act({ type: 'acknowledgeDeal', actionId: actionId(), matchId: view.deal.matchId });
  }, cardIds => {
    if (view?.deal) void act({ type: 'arrangeSeals', actionId: actionId(), matchId: view.deal.matchId, cardIds });
  }, targetId => {
    if (view?.deal) void act({ type: 'chooseBlackCat', actionId: actionId(), matchId: view.deal.matchId, targetId });
  });
  renderDayPanel(element('day-panel'), safeView, gameplayBlocked, dispatchDay);
  renderNightPanel(element('night-panel'), safeView, gameplayBlocked, intent => {
    if (view?.night && view.deal) void act({ ...intent, actionId: actionId(), matchId: view.deal.matchId, nightNumber: view.night.nightNumber });
  });
  renderRolePanel(element('role-panel'), safeView, gameplayBlocked,
    () => { if (view?.deal) void act({ type: 'closeSleuth', actionId: actionId(), matchId: view.deal.matchId }); },
    targetId => { if (view?.deal && view.day) void act({ type: 'councilVote', actionId: actionId(), matchId: view.deal.matchId,
      dayNumber: view.day.dayNumber, targetId }); });
  renderPowerControls(safeView, gameplayBlocked, (targetId, secondTargetId) => view?.deal
    ? act({ type: 'useRole', actionId: actionId(), matchId: view.deal.matchId, targetId, ...(secondTargetId ? { secondTargetId } : {}) })
    : Promise.resolve(false));
  if (!connected) clearGameMoments();
  if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
  if (import.meta.env.DEV) element('debug').textContent = `Transport: ${socket.io.engine?.transport.name ?? 'offline'}\nRoom revision: ${view?.version ?? '—'}\nPhase: ${view?.phase ?? 'entry'}\nReconnect grace: 60 seconds\nNo credentials or private game state shown.`;
}
function renderControls(): void {
  if (!view) return;
  const me = view.players.find(p => p.id === view!.you?.playerId);
  const host = view.hostId === me?.id;
  const blocked = busy || recovering || !socket.connected;
  element('controls').innerHTML = view.phase === 'LOBBY'
    ? `<div><p class="eyebrow">${view.players.filter(p => p.ready && p.connected).length} OF ${view.capacity} READY</p><p>Settle in, then let the host know you’re ready. Bots are server-controlled and ready immediately.</p></div><div class="control-buttons"><button id="ready" ${blocked ? 'disabled' : ''} class="${me?.ready ? '' : 'primary'}">${me?.ready ? 'Not ready' : 'I’m ready'}</button>${host ? `<button id="start" class="primary" ${blocked || !canStart(view.players, view.capacity) ? 'disabled' : ''}>Deal the Life cards</button><div class="bot-controls"><label for="lobby-capacity">Players</label><select id="lobby-capacity" ${blocked ? 'disabled' : ''}>${[6,7,8,9,10].map(count => `<option value="${count}" ${count === view!.capacity ? 'selected' : ''} ${count < view!.players.length ? 'disabled' : ''}>${count} seats</option>`).join('')}</select><label for="bot-difficulty">Bot difficulty</label><select id="bot-difficulty" ${blocked ? 'disabled' : ''}><option value="NORMAL" ${botDifficulty === 'NORMAL' ? 'selected' : ''}>Normal</option><option value="EASY" ${botDifficulty === 'EASY' ? 'selected' : ''}>Easy</option></select><button id="add-bot" ${blocked || view.players.length >= view.capacity ? 'disabled' : ''}>Add Bot</button><button id="fill-bots" ${blocked || view.players.length >= view.capacity ? 'disabled' : ''}>Fill Empty Seats</button></div>` : `<span class="host-wait">The host will deal when all ${view.capacity} are ready.</span>`}</div>`
    : `<div class="sealed">${view.phase === 'PRIVATE_DEAL' ? `<p class="eyebrow">${view.deal?.players.filter(p => p.acknowledged).length ?? 0} OF ${view.capacity} PLAYERS ACKNOWLEDGED</p><h3>Inspect your Life cards privately.</h3><p>Acknowledge above. Day starts when all ${view.capacity} are ready.</p>` : '<p class="eyebrow">PUBLIC TABLE</p>'}${host ? `<button id="reopen" ${blocked ? 'disabled' : ''}>End match &amp; reopen</button>` : ''}</div>`;
  if (view.phase === 'LOBBY' && host) element('controls').insertAdjacentHTML('beforeend',
    `<label class="scapegoat-setting"><input id="scapegoat-setting" type="checkbox" ${view.scapegoatEnabled ? 'checked' : ''} ${blocked ? 'disabled' : ''}> Include one optional Outcast</label>`);
  element('ready')?.addEventListener('click', () => void act({ type: 'ready', actionId: actionId(), expectedVersion: view!.version, ready: !me?.ready }));
  element('start')?.addEventListener('click', () => void act({ type: 'start', actionId: actionId(), expectedVersion: view!.version }));
  element<HTMLSelectElement>('bot-difficulty')?.addEventListener('change', event => { botDifficulty = (event.target as HTMLSelectElement).value as BotDifficulty; });
  element<HTMLSelectElement>('lobby-capacity')?.addEventListener('change', event => void act({ type: 'setCapacity', actionId: actionId(), expectedVersion: view!.version, capacity: Number((event.target as HTMLSelectElement).value) }));
  element<HTMLInputElement>('scapegoat-setting')?.addEventListener('change', event => void act({ type: 'setScapegoat', actionId: actionId(), expectedVersion: view!.version, enabled: (event.target as HTMLInputElement).checked }));
  element('add-bot')?.addEventListener('click', () => void act({ type: 'addBot', actionId: actionId(), expectedVersion: view!.version, difficulty: botDifficulty }));
  element('fill-bots')?.addEventListener('click', () => void act({ type: 'fillBots', actionId: actionId(), expectedVersion: view!.version, difficulty: botDifficulty }));
  const reopening = element('reopen');
  if (reopening) {
    if (view.phase === 'GAME_OVER') reopening.textContent = 'Open rematch lobby';
    reopening.addEventListener('click', () => void act({ type: view!.phase === 'GAME_OVER' ? 'rematch' : 'reopen', actionId: actionId(), expectedVersion: view!.version }));
  }
}
function render(next: RoomView): void {
  if (!acceptsView(view, next)) return;
  const previous = view;
  const positions = captureTablePositions();
  view = next;
  audio.setScene(next.phase==='GAME_OVER'?'result':next.phase==='LOBBY'?'lobby':next.phase==='DAY'||next.phase==='PRIVATE_DEAL'?'day':'night');
  element('entry').hidden = true;
  element('lobby').hidden = false;
  const inGame = !!next.deal || !!next.day;
  element('lobby').classList.toggle('is-in-match', inGame);
  document.body.classList.toggle('game-screen', inGame);
  element('lobby').dataset.phase = next.phase;
  element('code').textContent = next.code;
  element('phase-label').textContent = phaseName(next.phase);
  element('scope-footer').textContent = next.day && next.phase !== 'GAME_OVER' ? 'Leaving forfeits your seat and reveals your remaining Seals. A disconnect has 60 seconds of grace.' : next.phase === 'PRIVATE_DEAL' ? 'Leaving cancels this private deal. No Seals are revealed.' : 'Your public sigil carries no ability.';
  element('room-summary').textContent = `${next.players.length} of ${next.capacity} seats filled · ${next.players.filter(p => p.connected).length} connected · Invite friends with the room code.`;
  const viewerIndex = Math.max(0, next.players.findIndex(player => player.id === next.you?.playerId));
  const selection = activeSelection();
  element('seats').dataset.capacity = String(next.capacity);
  element('seats').style.setProperty('--roster-rows', String(Math.ceil(next.capacity / 2)));
  element('seats').innerHTML = Array.from({ length: next.capacity }, (_, index) => {
    const position = (index - viewerIndex + next.capacity) % next.capacity;
    const player = next.players[index];
    const markup = player ? renderPlayerSeat(next, player, index, position, selection) : renderEmptySeat(index, position);
    const rows = Math.ceil(next.capacity / 2);
    return markup.replace('<article ', `<article style="--seat-wing:${index < rows ? 1 : 3};--seat-row:${index % rows + 1}" `);
  }).join('');
  element('table-center').innerHTML = renderTableCenter(next);
  element('match-hud').innerHTML = renderMatchHud(next);
  element('local-life').hidden = !next.deal;
  element('local-life').innerHTML = renderLocalLife(next);
  element('roster-count').textContent = `${next.players.length} / ${next.capacity}`;
  element('seats').querySelectorAll<HTMLButtonElement>('[data-remove-bot]').forEach(button => button.addEventListener('click', () => {
    void act({ type: 'removeBot', actionId: actionId(), expectedVersion: next.version, botId: button.dataset.removeBot! });
  }));
  element('seats').querySelectorAll<HTMLElement>('[data-player]').forEach(seat => {
    const choose = () => { if (selectRolePowerTarget(seat.dataset.player!)) return; if (selectDayTableTarget(seat.dataset.player!)) applyTableSelection(getDayTableSelection()); };
    seat.querySelector('[data-choose-player]')?.addEventListener('click', choose);
    seat.addEventListener('click', event => { if (!(event.target as HTMLElement).closest('button')) choose(); });
    seat.addEventListener('keydown', event => {
      if ((event.target as HTMLElement).closest('button')) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); choose();
        if (!document.getElementById('power-confirmation')) (document.getElementById('confirm-preview') ?? document.querySelector<HTMLElement>('#seats .is-valid-target'))?.focus();
      }
    });
    seat.addEventListener('pointerenter', () => previewTarget(seat));
    seat.addEventListener('pointerleave', () => { if (view) element('action-spotlight').innerHTML = renderActionSpotlight(view, activeSelection()); });
    seat.addEventListener('focus', () => previewTarget(seat));
    seat.querySelectorAll<HTMLButtonElement>('.status-icon').forEach(icon => icon.addEventListener('click', () => notice(icon.title)));
  });
  element('table-draw')?.addEventListener('click', () => dispatchDay({ type: 'drawCards' }));
  for (const feedId of ['feed','event-feed']) {
    const feed = element(feedId);
    const entries = next.feed.filter(entry => (entry.kind === 'chat') === (feedId === 'feed'));
    const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
    const existing = new Set(Array.from(feed.children, child => (child as HTMLElement).dataset.id));
    for (const child of Array.from(feed.children)) if (!entries.some(e => e.id === (child as HTMLElement).dataset.id)) child.remove();
    for (const entry of entries) {
      if (existing.has(entry.id)) continue;
      const li = document.createElement('li'); li.dataset.id = entry.id; li.className = entry.kind;
      if (entry.name) { const name = document.createElement('b'); name.textContent = entry.name; li.append(name); }
      const text = document.createElement('span'); text.textContent = entry.text; li.append(text); feed.append(li);
    }
    if (atBottom) feed.scrollTop = feed.scrollHeight;
  }
  connection();
  animateTableChanges(recovering ? null : previous, next, positions);
}
function clearSeat(): void {
  connectionEpoch++; busy = false; recovering = false;
  coverPrivateIdentities();
  document.body.classList.remove('game-screen');
  audio.setScene('menu');
  session = null; saveSession(null); view = null;
  updatePresentationUI(null); renderDecisionUI(null,true,()=>{},()=>{});
  element('entry').hidden = false; element('lobby').hidden = true; element('feed').replaceChildren(); element('event-feed').replaceChildren();
  toggleChat(false);
  renderPrivatePanel(element('private-panel'), null, true, () => {});
  renderDayPanel(element('day-panel'), null, true, () => {});
  renderNightPanel(element('night-panel'), null, true, () => {});
  renderRolePanel(element('role-panel'), null, true, () => {}, () => {});
  renderPowerControls(null, true, async () => false); clearGameMoments();
}
async function act(command: Command): Promise<boolean> {
  if(view?.presentation&&['drawCards','endTurn','playCard','playCards','shiftSeal','revealSeal','nightAttack','nightProtect','useRole','councilVote'].includes(command.type))return false;
  if (busy || recovering || !socket.connected) return false;
  if (command.type === 'reopen' && !window.confirm('End this match for everyone and return to the lobby?')) return false;
  if (command.type === 'leave' && view?.day && view.phase !== 'GAME_OVER' && !window.confirm('Forfeit your seat? Your remaining Seals will be revealed and you cannot return to this match.')) return false;
  const epoch = connectionEpoch;
  busy = true; notice(''); connection();
  const reply = await request(command);
  if (epoch !== connectionEpoch) return false;
  if (reply.ok) {
    if (reply.session) {
      session = reply.session;
      if (!saveSession(session)) notice('Browser storage is unavailable. Refresh recovery will not work in this session.');
    }
    if (reply.view) render(reply.view);
    if (command.type === 'leave') clearSeat();
    if (command.type === 'chat') element<HTMLInputElement>('message').value = '';
  } else {
    notice(reply.message);
    if (reply.code === 'SESSION_EXPIRED' || reply.code === 'NO_SESSION') clearSeat();
    if (reply.code === 'STALE' || reply.code === 'NETWORK') {
      const synced = await request({ type: 'sync', actionId: actionId() });
      if (epoch !== connectionEpoch) return false;
      if (synced.ok && synced.view) render(synced.view);
      else if (!synced.ok && synced.code === 'NO_SESSION') clearSeat();
    }
  }
  busy = false; connection();
  return reply.ok;
}

element('seats').addEventListener('click', event => {
  if ((event.target as HTMLElement).closest('[data-open-private-seals]')) openPrivatePanel();
});
function toggleChat(open: boolean): void {
  const panel = element('council-panel');
  panel.classList.toggle('is-chat-open', open);
  element<HTMLButtonElement>('chat-toggle').setAttribute('aria-expanded', String(open));
  if (open) element<HTMLInputElement>('message').focus({ preventScroll: true });
}
element('chat-toggle').addEventListener('click', () => toggleChat(!element('council-panel').classList.contains('is-chat-open')));
element('chat-toggle').setAttribute('aria-label', 'Open council chat and event log');
element('local-life').addEventListener('click', event => { if ((event.target as HTMLElement).closest('[data-open-private-seals]')) openPrivatePanel(); });
element('role-toggle').addEventListener('click', toggleRolePanel);
element('chat-close').addEventListener('click', () => toggleChat(false));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if(element<HTMLDialogElement>('how-to-dialog').open)return;
    coverPrivateIdentities();
    coverRolePanel();
    toggleChat(false);
  }
});
element('friends-open').addEventListener('click', () => element<HTMLInputElement>('name').focus());
element('how-to-open').addEventListener('click', () => openGameGuide('howto'));
document.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  if(element<HTMLDialogElement>('how-to-dialog').open)return;
  const modal = document.querySelector<HTMLElement>('#private-panel:not([hidden]) [aria-modal="true"], #role-panel.is-open:not([hidden])');
  if (!modal) return;
  const items = Array.from(modal.querySelectorAll<HTMLElement>('button:not([disabled]),select:not([disabled]),input:not([disabled]),[tabindex="0"]')).filter(item => item.getClientRects().length);
  const first = items[0], last = items.at(-1);
  if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
});
element('entry-form').addEventListener('change', () => { selected = (document.querySelector<HTMLInputElement>('input[name="avatar"]:checked')!.value) as Avatar; });
element('entry-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = element<HTMLInputElement>('name').value.trim();
  const type = (event as SubmitEvent).submitter?.id === 'join' ? 'join' : 'create';
  if (type === 'join') void act({ type, actionId: actionId(), name, avatar: selected, roomCode: element<HTMLInputElement>('room-code').value.trim().toUpperCase() });
  else void act({ type, actionId: actionId(), name, avatar: selected, capacity: Number(element<HTMLSelectElement>('capacity').value) });
});
element('chat-form').addEventListener('submit', event => {
  event.preventDefault();
  const text = element<HTMLInputElement>('message').value.trim();
  if (text) void act({ type: 'chat', actionId: actionId(), text });
});
element('leave').addEventListener('click', () => { if (view) void act({ type: 'leave', actionId: actionId(), expectedVersion: view.version }); });
element('copy').addEventListener('click', () => {
  if (!view) return;
  if (!navigator.clipboard) { notice(`Share this room code: ${view.code}`); return; }
  void navigator.clipboard.writeText(view.code).then(() => notice('Room code copied. Send it to your friends.'), () => notice(`Share this room code: ${view!.code}`));
});
socket.on('state', render);
async function recoverSeat(): Promise<void> {
  const epoch = connectionEpoch;
  notice('');
  recovering = !!session; connection();
  if (session) {
    const reply = await request({ type: 'resume', actionId: actionId(), session });
    if (epoch !== connectionEpoch) return;
    if (reply.ok && reply.view) render(reply.view);
    else if (!reply.ok) {
      notice(reply.message);
      if (reply.code === 'SESSION_EXPIRED') clearSeat();
      else { setTimeout(() => { if (epoch === connectionEpoch && socket.connected) void recoverSeat(); }, 1500); return; }
    }
  }
  recovering = false; connection();
}
socket.on('connect', () => { void recoverSeat(); });
socket.on('disconnect', () => { connectionEpoch++; busy = false; coverPrivateIdentities(); coverRolePanel(); connection(); });
window.addEventListener('blur', coverPrivateIdentities);
window.addEventListener('pagehide', coverPrivateIdentities);
document.addEventListener('visibilitychange', () => { if (document.hidden) coverPrivateIdentities(); });
socket.on('connect_error', () => { connection(); notice(import.meta.env.DEV
  ? 'Room server is offline. From the project root, run npm run play and keep that terminal open; this tab will reconnect.'
  : 'Cannot reach the room server. Keep this tab open; reconnecting automatically.'); });
socket.on('replaced', () => {
  socket.disconnect(); clearSeat(); connection();
  element('connection').textContent = 'Seat opened elsewhere';
  notice('Your seat is now open in another tab. Reload this tab to join as a different player.');
});
setInterval(() => {
  updateDayTimers(); updateDecisionTimers();
  document.querySelectorAll<HTMLElement>('[data-until]').forEach(el => {
    const seconds = Math.max(0, Math.ceil((Number(el.dataset.until) - Date.now()) / 1000));
    el.textContent = `Reconnecting · about ${seconds}s reserved`;
  });
}, 1000);
socket.connect();
