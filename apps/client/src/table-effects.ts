import {audio, cardSound} from './audio';
import {publicMoments} from './moment-script';
import { type RoomView, type TableEffect } from '@ashfall/shared';
import { emblem } from './art';
import { lifeHeart } from './tabletop-components';
import { cardArt } from './card-info';
import { animateGameMoments } from './game-moments';
import { reducedGameMotion } from './game-preferences';

type Point = { x: number; y: number };
export type TablePositions = Map<string, Point>;
export function captureTablePositions(): TablePositions {
  const positions: TablePositions = new Map();
  document.querySelectorAll<HTMLElement>('[data-player], [data-card], .draw-pile, .discard-pile').forEach(element => {
    const rect = element.getBoundingClientRect();
    positions.set(element.dataset.card ?? element.dataset.player ?? (element.classList.contains('draw-pile') ? 'draw' : 'discard'),
      { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
    if (element.dataset.actionKind) positions.set(`kind:${element.dataset.actionKind}`, { x: rect.x + rect.width/2, y: rect.y + rect.height/2 });
  });
  document.querySelectorAll<HTMLElement>('[data-player] .public-seals').forEach(element => {
    const playerId = element.closest<HTMLElement>('[data-player]')?.dataset.player;
    if (!playerId) return;
    const rect = element.getBoundingClientRect();
    positions.set(`${playerId}:life`, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
  });
  return positions;
}
let seen = new Set<string>();
let currentMatch = '';
const sound = (kind: 'stamp' | 'cleanse') => audio.play(kind);
function label(text: string, targetId?: string, kind = ''): void {
  const seat = targetId ? document.querySelector<HTMLElement>(`[data-player="${targetId}"]`) : null;
  const item = document.createElement('span'); item.className = `effect-label ${kind}`;
  item.textContent = text; item.setAttribute('aria-live', 'polite');
  (seat ?? document.body).append(item);
  setTimeout(() => item.remove(), 1450);
}
function makeTrail(from: Point | undefined, to: Point | undefined, kind: string, delay: number): void {
  if (!from || !to || reducedGameMotion()) return;
  const line = document.createElement('div'); line.className = `effect-trail trail-${kind}`;
  const dx = to.x-from.x, dy = to.y-from.y;
  line.style.left = `${from.x}px`; line.style.top = `${from.y}px`;
  line.style.width = `${Math.hypot(dx,dy)}px`;
  line.style.transform = `rotate(${Math.atan2(dy,dx)}rad)`;
  document.body.append(line);
  const animation = line.animate([{ clipPath:'inset(0 100% 0 0)', opacity:0 }, { clipPath:'inset(0 0 0 0)', opacity:1, offset:.75 }, {opacity:0}],
    {duration:550,delay,fill:'both',easing:'ease-out'});
  animation.finished.then(() => line.remove(), () => line.remove());
}
function fly(from: Point | undefined, via: Point | undefined, to: Point | undefined, effect: TableEffect, delay: number): void {
  if (!from || !to || reducedGameMotion()) return;
  const element = document.createElement('div');
  element.className = `flying-card ${effect.type === 'DRAW' ? 'flying-back' : `flying-${effect.cardKind?.toLowerCase() ?? 'card'}`}`;
  element.setAttribute('aria-hidden', 'true');
  element.innerHTML = effect.type === 'DRAW' ? emblem('moon') : `<img src="${cardArt(effect.cardKind ?? 'WHISPER')}" alt="">`;
  document.body.append(element);
  const at = (p: Point, rotate: number, scale: number) => `translate(${p.x - 30}px, ${p.y - 43}px) rotate(${rotate}deg) scale(${scale})`;
  const frames = [{ transform: at(from, -12, 1), opacity: 0 }, { transform: at(from, -8, 1.08), opacity: 1, offset: .12 },
    ...(via ? [{ transform: at(via, 8, 1.12), opacity: 1, offset: .62 }] : []), { transform: at(to, 3, .8), opacity: 0 }];
  const animation = element.animate(frames, { duration: via ? 950 : 620, delay, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' });
  animation.finished.then(() => element.remove(), () => element.remove());
}
function flyHiddenLife(from: Point | undefined, to: Point | undefined, targetId: string, delay: number): void {
  if (!from || !to) return;
  if (reducedGameMotion()) {
    pulse(targetId, 'life-transfer-arrival');
    return;
  }
  const heart = document.createElement('div');
  heart.className = 'flying-hidden-life';
  heart.setAttribute('aria-hidden', 'true');
  heart.innerHTML = lifeHeart();
  document.body.append(heart);
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - Math.min(90, Math.abs(from.x - to.x) * .12 + 30) };
  const at = (point: Point, scale: number, rotation: number) =>
    `translate(${point.x - 26}px, ${point.y - 30}px) rotate(${rotation}deg) scale(${scale})`;
  const animation = heart.animate([
    { transform: at(from, .7, -12), opacity: 0 },
    { transform: at(from, 1, -8), opacity: 1, offset: .12 },
    { transform: at(middle, 1.25, 5), opacity: 1, offset: .55 },
    { transform: at(to, .8, 12), opacity: 0 },
  ], { duration: 1100, delay, fill: 'both', easing: 'cubic-bezier(.27,.67,.19,1)' });
  animation.finished.then(() => { heart.remove(); pulse(targetId, 'life-transfer-arrival'); }, () => heart.remove());
}
function pulse(playerId: string | undefined, className: string): void {
  const element = document.querySelector<HTMLElement>(`[data-player="${playerId}"]`);
  if (!element) return;
  element.classList.add(className);
  setTimeout(() => element.classList.remove(className), 1300);
}
export function animateTableChanges(previous: RoomView | null, next: RoomView, before: TablePositions): void {
  const match = next.deal?.matchId ?? '';
  if (!previous || match !== currentMatch) { currentMatch = match; seen = new Set(next.effects?.map(effect => effect.id)); animateGameMoments(null, next, []); return; }
  const effects = (next.effects ?? []).filter(effect => !seen.has(effect.id));
  const closeupCards=new Set(publicMoments(previous,next,effects).filter(moment=>moment.kind==='card').map(moment=>moment.cardKind));
  animateGameMoments(previous, next, effects);
  for (const effect of next.effects ?? []) seen.add(effect.id);
  if (seen.size > 200) seen = new Set(next.effects?.map(effect => effect.id));
  const after = captureTablePositions();
  const removed = previous.hand?.filter(card => !next.hand?.some(current => current.id === card.id)) ?? [];
  const doubt = new Map(previous.day?.players.map(player => [player.playerId, player.doubt]) ?? []);
  const curseTargets = new Set(effects.filter(effect => effect.type === 'PLAY' && effect.cardKind === 'DISPEL')
    .map(effect => effect.targetId));
  const blockedTargets = new Set(effects.filter(effect => effect.type === 'BLOCK' || effect.type === 'ROLE_BLOCK').map(effect => effect.targetId));
  if (next.role?.peek && next.role.peek.targetId !== previous.role?.peek?.targetId) {
    makeTrail(before.get(next.you?.playerId ?? ''), after.get(next.role.peek.targetId), 'violet', 0);
    pulse(next.role.peek.targetId, 'sleuth-focus');
  }
  effects.forEach((effect, index) => {
    const delay = Math.min(index * 135, 1800);
    if (effect.type === 'PLAY') {
      if(!closeupCards.has(effect.cardKind))setTimeout(()=>audio.play(cardSound(effect.cardKind)),delay);
      const own = effect.actorId === next.you?.playerId ? removed.find(card => card.kind === effect.cardKind) : undefined;
      if (own) removed.splice(removed.indexOf(own), 1);
      const target = effect.cardKind === 'CONSPIRACY' ? { x: innerWidth/2, y: innerHeight*.4 } : after.get(effect.targetId ?? '');
      const origin = before.get(own?.id ?? '') ?? (own ? before.get(`kind:${own.kind}`) : undefined) ?? before.get(effect.actorId ?? '');
      fly(origin, target, after.get('discard'), effect, delay);
      setTimeout(() => pulse(effect.targetId, 'card-hit'), delay + 500);
      if (['EVIDENCE','TESTIMONY','WITNESS'].includes(effect.cardKind??''))
        makeTrail(before.get(own?.id ?? effect.actorId ?? ''), target, 'red', delay + 320);
      if (effect.cardKind === 'DISPEL') makeTrail(before.get(effect.actorId ?? ''), target, 'violet', delay + 300);
      if (effect.cardKind === 'WITNESS') setTimeout(() => pulse(effect.targetId, 'witness-impact'), delay + 350);
      if (effect.cardKind === 'EVIDENCE') setTimeout(() => pulse(effect.targetId, 'evidence-impact'), delay + 350);
      if (effect.cardKind === 'SCAPEGOAT') makeTrail(after.get(effect.targetId ?? ''), after.get(effect.secondTargetId ?? ''), 'red', delay + 500);
      if (effect.cardKind === 'WITNESS') setTimeout(() => label('WITNESS TESTIFIED', effect.targetId, 'danger'), delay + 580);
      if (effect.cardKind === 'ALIBI') setTimeout(() => label('ALIBI ACCEPTED', effect.targetId, 'clean'), delay + 580);
      if (effect.cardKind === 'MERCY') setTimeout(() => label('MERCY GRANTED', effect.targetId, 'clean'), delay + 580);
      if (effect.cardKind === 'DISPEL' && !blockedTargets.has(effect.targetId)) setTimeout(() => label(`REMOVED: ${effects.filter(item=>item.type==='STATUS'&&item.targetId===effect.targetId&&item.count===0).map(item=>item.statusKind==='BLACK_CAT'?'CURSE':item.statusKind==='VOW_HEART'?'VOW OF HEARTS':item.statusKind?.replaceAll('_',' ')).filter(Boolean).join(', ')}`, effect.targetId, 'danger'), delay + 580);
      if (effect.cardKind === 'SCAPEGOAT') setTimeout(() => label('DOUBT TRANSFERRED', effect.secondTargetId, 'danger'), delay + 700);
    } else if (effect.type === 'DRAW') {
      setTimeout(()=>audio.play('draw'),delay);
      for (let i = 0; i < (effect.count ?? 2); i++) fly(before.get('draw'), undefined,
        effect.actorId === next.you?.playerId ? { x: innerWidth / 2 + i * 24, y: innerHeight - 100 } : after.get(effect.actorId ?? ''), effect, delay + i * 140);
    } else if (effect.type === 'DEATH') {
      if(!next.presentation)audio.play('death');
      pulse(effect.targetId, 'death-impact');
      const notice = document.createElement('div'); notice.className = 'fallen-announcement'; notice.setAttribute('role', 'status');
      const cross = document.createElement('span'); cross.textContent = '×'; cross.setAttribute('aria-hidden', 'true');
      const label = document.createElement('b'); label.textContent = `${next.players.find(player => player.id === effect.targetId)?.name ?? 'A villager'} has fallen`;
      notice.append(cross, label); document.body.append(notice); setTimeout(() => notice.remove(), 2100);
    } else if (effect.type === 'REVEAL') {
      // The central sequence announces, reveals the full portrait, and then
      // points out the exact slot. Do not race it with an instant second reveal.
    } else if (effect.type === 'DOUBT') {
      const old = doubt.get(effect.targetId ?? '') ?? 0;
      doubt.set(effect.targetId ?? '', Math.min(7, old + (effect.count ?? 1)));
      const track = document.querySelector<HTMLElement>(`[data-player="${effect.targetId}"] .doubt-track`);
      const completesRow = effects.some(later => later.type === 'REVEAL_PENDING' && later.targetId === effect.targetId);
      // The authoritative final state has already cleared a completed row. Rebuild only
      // temporary, face-up X marks for its animation; they never become game state.
      if (completesRow && track && !track.querySelector('.seven-ghost')) for (let i = 0; i < old; i++) {
        const ghost = document.createElement('span');
        ghost.className = 'doubt-tile filled seven-ghost'; ghost.textContent = '×';
        ghost.style.left = `${i*100/7}%`; ghost.style.width = `${100/7}%`;
        track.append(ghost);
      }
      for (let amount = 0; amount < (effect.count ?? 1); amount++) {
        let mark = document.querySelector<HTMLElement>(`[data-player="${effect.targetId}"] [data-doubt-index="${old + amount}"]`);
        if (completesRow && track && (!mark || mark.classList.contains('unused'))) {
          mark = document.createElement('span'); mark.className = 'doubt-tile filled seven-ghost'; mark.textContent = '×';
          mark.style.left = `${(old+amount)*100/7}%`; mark.style.width = `${100/7}%`; mark.style.opacity = '0';
          track.append(mark);
        }
        if (mark) setTimeout(() => { mark!.style.removeProperty('opacity'); mark!.classList.add('new-mark'); sound('stamp'); }, delay + 105 * amount);
        else setTimeout(() => sound('stamp'), delay + 105 * amount);
      }
      const amount = effect.count ?? 1;
      setTimeout(() => label(`+${amount} DOUBT`, effect.targetId, 'danger'), delay + 180);
    } else if (effect.type === 'CLEANSE') {
      const old = doubt.get(effect.targetId ?? '') ?? 0;
      doubt.set(effect.targetId ?? '', Math.max(0, old - (effect.count ?? 1)));
      const seat = document.querySelector<HTMLElement>(`[data-player="${effect.targetId}"] .doubt-track`);
      for (let amount = 0; amount < (effect.count ?? 1); amount++) {
        const ghost = document.createElement('span'); ghost.className = 'doubt-tile filled cleansing-ghost'; ghost.textContent = '×';
        if (seat) { ghost.style.position = 'absolute'; ghost.style.left = `${(old-amount-1)*100/7}%`; ghost.style.width = `${100/7}%`; seat.append(ghost); }
        setTimeout(() => { ghost.classList.add('cleansing'); sound('cleanse'); }, delay + amount*110);
        setTimeout(() => ghost.remove(), delay + amount*110 + 700);
      }
      setTimeout(() => label('DOUBT REMOVED', effect.targetId, 'clean'), delay + 130);
    } else if (effect.type === 'REVEAL_PENDING') {
      const seat = document.querySelector<HTMLElement>(`[data-player="${effect.targetId}"]`);
      setTimeout(() => {
        document.body.classList.add('life-reveal-active');
        seat?.classList.add('accusation-seven');
        const track = seat?.querySelector<HTMLElement>('.doubt-track');
        if (track && !track.querySelector('.filled')) for (let i=0;i<7;i++) {
          const ghost = document.createElement('span'); ghost.className = 'doubt-tile filled seven-ghost'; ghost.textContent = '×';
          ghost.style.left = `${i*100/7}%`; ghost.style.width = `${100/7}%`; track.append(ghost);
        }
        setTimeout(() => { seat?.classList.remove('accusation-seven'); seat?.querySelectorAll('.seven-ghost').forEach(mark => mark.remove()); document.body.classList.remove('life-reveal-active'); }, 1200);
      }, delay);
    } else if (effect.type === 'STATUS') {
      if (!effect.count && (curseTargets.has(effect.targetId) || blockedTargets.has(effect.targetId))) return;
      const words = effect.statusKind === 'BLACK_CAT' ? (effect.count ? 'CURSED' : 'CURSE REMOVED') : effect.statusKind === 'VOW_HEART' ? (effect.count ? 'HEART WAITING' : 'HEART BROKEN')
        : effect.statusKind === 'BOUND' ? (effect.count ? 'BOUND' : 'CHAINS BROKEN')
        : effect.statusKind === 'ASYLUM' ? (effect.count ? 'ASYLUM' : 'NIGHT SHIELD GONE')
          : effect.statusKind === 'PIETY' ? (effect.count ? 'BLESSED' : 'PIETY SPENT') : effect.count ? 'WARDED' : 'WARD SPENT';
      setTimeout(() => label(words, effect.targetId), delay + 130);
    } else if (effect.type === 'BLOCK') {
      pulse(effect.targetId, effect.statusKind === 'ASYLUM' ? 'block-asylum'
        : effect.cardKind === 'WHISPER' ? 'block-hearthward' : 'block-piety');
      setTimeout(() => label(effect.statusKind === 'ASYLUM' ? 'NIGHT EFFECT BLOCKED'
        : effect.cardKind === 'WHISPER' ? 'WHISPER BLOCKED' : 'PROTECTED BY PIETY', effect.targetId, 'clean'), delay);
    } else if (effect.type === 'ROLE_BLOCK') {
      pulse(effect.targetId, 'block-herbalist');
      setTimeout(() => label('PROTECTED', effect.targetId, 'clean'), delay);
    } else if (effect.type === 'VOTE_VICTORY') {
      const banner = document.createElement('div'); banner.className = 'scapegoat-announcement';
      banner.setAttribute('role', 'status'); banner.textContent = 'OUTCAST VICTORY';
      document.body.append(banner); setTimeout(() => banner.remove(), 2800);
    } else if (effect.type === 'TURN_SKIPPED') {
      setTimeout(() => label('TURN SKIPPED — BOUND', effect.actorId), delay);
    } else if (effect.type === 'VOW' && effect.count) {
      setTimeout(() => label(effect.cardKind ? 'SHARED SUSPICION' : 'HEARTS BOUND', effect.targetId), delay);
    } else if (effect.type === 'CONSPIRACY') {
      label('CONSPIRACY', undefined, 'global');
      const living = next.deal?.players.filter(p => p.alive) ?? [];
      living.forEach((player, index) => {
        const recipient = living[(index-1+living.length)%living.length]!.playerId;
        flyHiddenLife(before.get(`${player.playerId}:life`), after.get(`${recipient}:life`), recipient, delay + 180);
      });
    } else if (effect.type === 'TRANSFER') {
      // These are anonymous heart silhouettes between rows, never actual hidden slots.
      flyHiddenLife(before.get(`${effect.actorId}:life`), after.get(`${effect.targetId}:life`), effect.targetId ?? '', delay + 120);
      flyHiddenLife(before.get(`${effect.targetId}:life`), after.get(`${effect.actorId}:life`), effect.actorId ?? '', delay + 120);
      setTimeout(() => label('THE CINDERS SHIFT', effect.targetId), delay + 400);
    }
  });
}
