import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { AVATARS, cardQuantities, canStart, PRESENTATION_DURATION, publicPresentationPlan, RECONNECT_GRACE_MS, SEATS, type BotDifficulty, type Command, type FeedEntry,
  type PublicPlayer, type Reply, type RoomView, type Session, type TableEffect } from '@ashfall/shared';
import { acknowledgeIdentities, arrangeIdentities, privateIdentities, publicIdentities, type IdentityMatch } from '@ashfall/shared/identities';
import { createIdentityDeal } from './deal.js';
import { attachOpeningCurse, applyDayAction, expireDay, forfeitPlayers, privateHand, publicDay, RuleError, type DayResult, type DayState } from '@ashfall/shared/day';
import { createServerDay, describeDayEvent, type DayFactory } from './day-runtime.js';
import { submitNight, expireNight, privateNight } from '@ashfall/shared/night';
import { eliminatePlayer } from '@ashfall/shared/day';
import { ROLE_PRESETS, assignRoles, privateRole, type Roles } from './roles.js';
import { botMessage, botRandom, chooseBotDecision, createBotMemory, enumerateLegalBotActions,
  type BotDecision, type BotMemory } from './bots.js';

type Success = Extract<Reply, { ok: true }>;
// Never cache private views: retries must re-check the CURRENT recipient's access.
type Receipt = { fingerprint: string; session?: Session };
interface Player extends PublicPlayer {
  privateVersion: number;
  tokenHash: Buffer; socketId: string | null; receipts: Map<string, Receipt>;
  bot: { difficulty: BotDifficulty; memory: BotMemory } | null;
}
interface Room {
  effects?: TableEffect[];
  code: string; version: number; phase: RoomView['phase']; hostId: string; capacity: number;
  players: Player[]; feed: FeedEntry[]; match: IdentityMatch | null; day: DayState | null;
  scapegoatEnabled: boolean; roles: Roles | null; votes: Record<string, string>; voteDay: number; voteComplete: boolean;
  blackCatVotes?: Record<string, string>;
  presentation?: {id:string;startedAt:number;until:number;remainingMs:number|null;waiters:Set<string>;completed:Set<string>;
    previousPhase:RoomView['phase'];events:TableEffect[];ownerId?:string;privateAction?:{kind:import('@ashfall/shared').SpecialRole;targetIds:string[]}} | null;
}
type Binding = { room: Room; player: Player };
class RoomError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
function fail(code: string, message: string): never { throw new RoomError(code, message); }
const hash = (value: string) => createHash('sha256').update(value).digest();
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const botNames = ['Cinder', 'Hollow', 'Morrow', 'Tallow', 'Wren', 'Sable', 'Flint', 'Moss', 'Rook', 'Vale'];
export type IdentityFactory = (playerIds: readonly string[]) => IdentityMatch;
export interface BotRuntimeOptions { fast?: boolean; seed?: number; minDelayMs?: number; maxDelayMs?: number; messages?: boolean }

export class RoomStore {
  private rooms = new Map<string, Room>();
  private bindings = new Map<string, Binding>();
  private bootstrap = new Map<string, Map<string, Receipt>>();
  private botTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private botOrdinal = 0;
  readonly botFailures: { roomCode: string; playerId: string; code: string }[] = [];
  constructor(private send: (socketId: string, view: RoomView) => void,
    private replace: (socketId: string) => void,
    private graceMs = RECONNECT_GRACE_MS,
    private now = Date.now,
    private dayFactory: DayFactory = createServerDay,
    private identityFactory: IdentityFactory = createIdentityDeal,
    private randomIndex: (max: number) => number = randomInt,
    private botOptions: BotRuntimeOptions = {}, private presentations = true) {}

  execute(socketId: string, command: Command): Reply {
    try {
      this.sweep();
      const bound = this.bindings.get(socketId);
      const presentationBefore = bound?.room.presentation?.id;
      const cache = bound?.player.receipts ?? this.bootstrap.get(socketId) ?? new Map<string, Receipt>();
      this.bootstrap.set(socketId, cache);
      const fingerprint = JSON.stringify(command);
      const prior = cache.get(command.actionId);
      if (prior) {
        if (prior.fingerprint !== fingerprint) fail('REUSED_ID', 'That action ID was already used. Try again.');
        const current = this.bindings.get(socketId);
        const session = current && prior.session?.playerId === current.player.id &&
          prior.session.roomCode === current.room.code ? prior.session : undefined;
        return { ok: true, ...(session ? { session } : {}),
          ...(current ? { view: this.view(current.room, current.player.id) } : {}) };
      }
      const result = this.apply(socketId, command);
      const receipt: Receipt = { fingerprint, ...(result.session ? { session: result.session } : {}) };
      cache.set(command.actionId, receipt);
      while (cache.size > 128) cache.delete(cache.keys().next().value!);
      const after = this.bindings.get(socketId);
      if (after) {
        // Carry bootstrap receipt into authenticated retries (e.g. lost create acknowledgement).
        if (after.player.receipts !== cache) {
          after.player.receipts.set(command.actionId, receipt);
        }
        if (presentationBefore !== after.room.presentation?.id) this.publish(after.room);
        else if (command.type === 'finishPresentation' || command.type === 'nightAttack' || command.type === 'nightProtect' || command.type === 'arrangeSeals' || command.type === 'chooseBlackCat' ||
          command.type === 'useRole' && after.room.roles?.[after.player.id]?.kind !== 'HERBALIST' || command.type === 'closeSleuth')
          this.send(socketId, this.view(after.room, after.player.id));
        else this.publish(after.room);
      }
      return result;
    } catch (error) {
      if (error instanceof RoomError || error instanceof RuleError) return { ok: false, code: error.code, message: error.message };
      throw error;
    }
  }

  private apply(socketId: string, command: Command): Success {
    if (command.type === 'resume') return this.resume(socketId, command.session);
    if (command.type === 'create' || command.type === 'join') {
      if (this.bindings.has(socketId)) fail('ALREADY_JOINED', 'Leave your current gathering first.');
      let room: Room;
      if (command.type === 'create') {
        if (this.rooms.size >= 100) fail('BUSY', 'The inn is full. Please try again later.');
        let code: string;
        do { code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join(''); }
        while (this.rooms.has(code));
        room = { code, version: 0, phase: 'LOBBY', hostId: '', capacity: command.capacity ?? SEATS,
          players: [], feed: [], match: null, day: null, scapegoatEnabled: false, roles: null, votes: {}, voteDay: 0, voteComplete: false };
        this.rooms.set(code, room);
      } else {
        const found = this.rooms.get(command.roomCode);
        if (!found) fail('NOT_FOUND', 'That gathering was not found. Check all eight characters.');
        room = found;
        if (room.phase !== 'LOBBY') fail('LOCKED', 'This gathering has started. Ask the host to reopen it.');
        if (room.players.length >= room.capacity) fail('FULL', 'All seats are taken.');
        if (room.players.some(p => p.name.toLocaleLowerCase() === command.name.toLocaleLowerCase()))
          fail('NAME_TAKEN', 'Choose a different name so everyone can tell you apart.');
      }
      const token = randomBytes(32).toString('hex');
      const player: Player = {
        id: randomUUID(), name: command.name, avatar: command.avatar, ready: false,
        connected: true, abandoned: false, reconnectUntil: null, isBot: false, botDifficulty: null,
        socketId, tokenHash: hash(token), receipts: new Map(), privateVersion: 0, bot: null,
      };
      room.players.push(player);
      if (!room.hostId || room.players.find(candidate => candidate.id === room.hostId)?.isBot) room.hostId = player.id;
      this.bindings.set(socketId, { room, player });
      this.event(room, `${player.name} took a seat.`);
      return { ok: true, session: { roomCode: room.code, playerId: player.id, token }, view: this.view(room, player.id) };
    }
    const bound = this.bindings.get(socketId);
    if (!bound) fail('NO_SESSION', 'Join a gathering before taking an action.');
    const { room, player } = bound;
    if(room.presentation && ['drawCards','endTurn','playCard','playCards','shiftSeal','revealSeal','nightAttack','nightProtect','useRole','councilVote'].includes(command.type))
      fail('CINEMATIC','The table is paused while players finish the close-up.');
    if ('expectedVersion' in command && command.expectedVersion !== room.version)
      fail('STALE', 'The gathering changed. Review the updated seats and try again.');
    switch (command.type) {
      case 'sync': break;
      case 'finishPresentation': {
        if(room.match?.id!==command.matchId)fail('MATCH_CHANGED','That match has ended.');
        if(!room.presentation)break;
        if(room.presentation.id!==command.presentationId)fail('STALE_PRESENTATION','That close-up has already ended.');
        if(room.presentation.waiters.delete(player.id)) {room.presentation.completed.add(player.id);player.privateVersion++;}
        if(!room.presentation.waiters.size)this.resumePresentation(room,this.now());
        break;
      }
      case 'addBot':
        this.requireHost(room, player); this.requireOpenLobby(room);
        if (room.players.length >= room.capacity) fail('FULL', 'All seats are taken.');
        this.addBot(room, command.difficulty);
        break;
      case 'fillBots':
        this.requireHost(room, player); this.requireOpenLobby(room);
        while (room.players.length < room.capacity) this.addBot(room, command.difficulty);
        break;
      case 'setCapacity':
        this.requireHost(room, player); this.requireOpenLobby(room);
        if (command.capacity < room.players.length) fail('CAPACITY', 'Remove seats before reducing the lobby size.');
        room.capacity = command.capacity;
        this.event(room, `The council now has ${room.capacity} seats.`);
        break;
      case 'setScapegoat':
        this.requireHost(room, player); this.requireOpenLobby(room);
        room.scapegoatEnabled = command.enabled;
        this.event(room, `Optional Outcast ${command.enabled ? 'enabled' : 'disabled'} for the next match.`);
        break;
      case 'removeBot': {
        this.requireHost(room, player); this.requireOpenLobby(room);
        const bot = room.players.find(candidate => candidate.id === command.botId && candidate.isBot);
        if (!bot) fail('BOT', 'Choose a bot currently seated in this lobby.');
        this.removeBot(room, bot); this.event(room, `${bot.name} left the bot seat.`);
        break;
      }
      case 'nightAttack': case 'nightProtect':
        if (!room.day) fail('PHASE', 'Night has not started.');
        room.day = submitNight(room.day, player.id, command, this.now());
        player.privateVersion++;
        break;
      case 'useRole':
        this.useRole(room, player, command.matchId, command.targetId, command.secondTargetId);
        if(!player.isBot)this.beginPresentation(room,room.phase,[],PRESENTATION_DURATION.power,player.id,
          {kind:room.roles![player.id]!.kind,targetIds:[command.targetId,...(command.secondTargetId?[command.secondTargetId]:[])]});
        break;
      case 'closeSleuth': {
        if (room.match?.id !== command.matchId) fail('MATCH_CHANGED', 'That match has ended.');
        const role = room.roles?.[player.id];
        if (!role?.peek?.open) fail('ABILITY', 'No investigation is open.');
        role.peek.open = false; player.privateVersion++;
        if(room.presentation?.ownerId===player.id)this.resumePresentation(room,this.now());
        break;
      }
      case 'councilVote':
        this.councilVote(room, player, command.matchId, command.dayNumber, command.targetId);
        break;
      case 'drawCards': case 'endTurn': case 'playCard': case 'playCards': case 'shiftSeal': case 'revealSeal':
        if (!room.day) fail('PHASE', 'Day has not started.');
        this.commitDay(room, applyDayAction(room.day, player.id, command, this.now(), this.randomIndex));
        break;
      case 'ready':
        if (room.phase !== 'LOBBY') fail('PHASE', 'The gathering is already sealed.');
        player.ready = command.ready;
        this.event(room, `${player.name} is ${command.ready ? 'ready' : 'not ready yet'}.`);
        break;
      case 'start':
        this.requireHost(room, player);
        if (room.phase !== 'LOBBY') fail('PHASE', 'The gathering is already sealed.');
        if (!canStart(room.players, room.capacity)) fail('NOT_READY', `${room.capacity} connected players must all be ready.`);
        room.match = this.identityFactory(room.players.map(p => p.id));
        room.roles = assignRoles(room.match, ROLE_PRESETS[room.capacity]!, room.scapegoatEnabled, this.randomIndex);
        room.votes = {}; room.voteDay = 0; room.voteComplete = false;
        room.blackCatVotes = {};
        room.phase = 'PRIVATE_DEAL';
        this.event(room, 'Five Seals have been dealt to each player. Inspect yours privately, then acknowledge.');
        break;
      case 'arrangeSeals': {
        if (!room.match || room.match.id !== command.matchId) fail('MATCH_CHANGED', 'That deal has ended.');
        if (room.phase !== 'PRIVATE_DEAL') fail('PHASE', 'Seal positions lock when play begins.');
        try { room.match = arrangeIdentities(room.match, player.id, command.cardIds); }
        catch (error) { fail('SEAL', error instanceof Error ? error.message : 'Invalid Seal arrangement.'); }
        player.privateVersion++;
        break;
      }
      case 'chooseBlackCat': {
        if (!room.match || room.match.id !== command.matchId) fail('MATCH_CHANGED', 'That deal has ended.');
        if (room.phase !== 'PRIVATE_DEAL') fail('PHASE', 'The opening curse is already sealed.');
        const actor = room.match.players.find(p => p.id === player.id);
        if (!actor?.alive || !actor.everWitch || room.roles?.[player.id]?.kind === 'SCAPEGOAT')
          fail('ABILITY', 'Only Cultists may choose the opening Black Cat.');
        if (actor.acknowledged || Object.hasOwn(room.blackCatVotes ?? {}, player.id)) fail('LOCKED_CHOICE', 'Your opening choice is already sealed.');
        if (!room.match.players.some(p => p.id === command.targetId && p.alive)) fail('TARGET', 'Choose a living player.');
        (room.blackCatVotes ??= {})[player.id] = command.targetId;
        player.privateVersion++;
        break;
      }
      case 'acknowledgeDeal': {
        if (!room.match || room.match.id !== command.matchId)
          fail('MATCH_CHANGED', 'That deal has ended. Review the current gathering.');
        const actor = room.match.players.find(p => p.id === player.id);
        if (!actor?.alive) fail('NOT_ALIVE', 'Only living players may acknowledge their Seals.');
        if (actor.acknowledged) break;
        if (room.phase !== 'PRIVATE_DEAL') fail('PHASE', 'The private deal has ended.');
        if (actor.everWitch && room.roles?.[player.id]?.kind !== 'SCAPEGOAT' && !Object.hasOwn(room.blackCatVotes ?? {}, player.id))
          fail('BLACK_CAT_REQUIRED', 'Choose the opening Black Cat before confirming your Life cards.');
        const next = acknowledgeIdentities(room.match, player.id);
        if (next !== room.match) {
          room.match = next;
          this.event(room, `${player.name} acknowledged their Seals.`);
          if (next.players.every(p => p.acknowledged)) {
            const initial = this.dayFactory(next, this.now());
            initial.state.neutralIds = Object.entries(room.roles ?? {}).filter(([, role]) => role.kind === 'SCAPEGOAT').map(([id]) => id);
            const votes = Object.values(room.blackCatVotes ?? {});
            const cursed = next.players.filter(p => p.alive).reduce((best, candidate) =>
              votes.filter(id => id === candidate.id).length > votes.filter(id => id === best.id).length ? candidate : best);
            initial.state.activePlayerId = cursed.id;
            attachOpeningCurse(initial.state, cursed.id);
            for (const event of initial.events) if (event.type === 'DAY_STARTED') event.actorId = cursed.id;
            initial.events.unshift({ type: 'STATUS', targetId: cursed.id, statusKind: 'BLACK_CAT', count: 1 });
            room.blackCatVotes = {};
            this.commitDay(room, initial);
          }
        }
        break;
      }
      case 'rematch':
        this.requireHost(room, player);
        if (room.phase !== 'GAME_OVER') fail('PHASE', 'Finish this match before opening a rematch lobby.');
        this.openLobby(room, 'A new gathering awaits. Everyone must ready again for the rematch.');
        break;
      case 'reopen':
        this.requireHost(room, player);
        if (room.phase === 'LOBBY') fail('PHASE', 'The gathering is already open.');
        this.openLobby(room, 'The host ended this match. Everyone must ready again for a fresh deal.');
        break;
      case 'chat':
        if (room.phase === 'NIGHT') fail('NIGHT_SILENCE', 'The council is silent until dawn.');
        if (room.match?.players.find(p => p.id === player.id)?.alive === false && room.phase !== 'GAME_OVER')
          fail('NOT_ALIVE', 'Dead players are silent until the match ends.');
        room.feed.push({ id: randomUUID(), kind: 'chat', name: player.name, text: command.text });
        room.feed = room.feed.slice(-60);
        room.version++;
        break;
      case 'leave':
        this.removeMany(room, [player], this.now());
        this.bindings.delete(socketId);
        this.publish(room);
        return { ok: true };
    }
    return { ok: true, view: this.view(room, player.id) };
  }

  private resume(socketId: string, session: Session): Success {
    const room = this.rooms.get(session.roomCode);
    const player = room?.players.find(p => p.id === session.playerId);
    if (!room || !player || player.abandoned || !timingSafeEqual(player.tokenHash, hash(session.token)))
      fail('SESSION_EXPIRED', 'Your seat expired, was forfeited, or the server restarted. Join a lobby again.');
    const existing = this.bindings.get(socketId);
    if (existing && existing.player !== player) fail('ALREADY_JOINED', 'Leave your current gathering first.');
    if (player.socketId === socketId) return { ok: true, session, view: this.view(room, player.id) };
    if (player.socketId) {
      const old = player.socketId;
      this.bindings.delete(old);
      this.replace(old);
    }
    player.socketId = socketId;
    player.connected = true;
    player.reconnectUntil = null;
    if(room.presentation&&!room.presentation.completed.has(player.id)&&(!room.presentation.ownerId||room.presentation.ownerId===player.id))
      room.presentation.waiters.add(player.id);
    this.bindings.set(socketId, { room, player });
    this.event(room, `${player.name} returned to their seat.`);
    this.migrateHost(room);
    return { ok: true, session, view: this.view(room, player.id) };
  }

  disconnect(socketId: string): void {
    this.bootstrap.delete(socketId);
    const bound = this.bindings.get(socketId);
    this.bindings.delete(socketId);
    if (!bound || bound.player.socketId !== socketId) return;
    bound.player.socketId = null;
    bound.player.connected = false;
    bound.player.reconnectUntil = this.now() + this.graceMs;
    if(bound.room.presentation?.waiters.delete(bound.player.id)&&!bound.room.presentation.waiters.size)
      this.resumePresentation(bound.room,this.now());
    this.event(bound.room, `${bound.player.name} disconnected. Their seat is briefly reserved.`);
    this.migrateHost(bound.room);
    this.publish(bound.room);
  }

  sweep(): void {
    for (const room of this.rooms.values()) {
      this.expireSleuthPeeks(room);
      let changed = false;
      // Resolve overdue events chronologically. Equal-time forfeits take priority
      // and are batched so seat order cannot award a premature victory.
      for (let steps = 0; steps < 100 && this.rooms.has(room.code); steps++) {
        const expiry = Math.min(...room.players.map(p => p.reconnectUntil ?? Infinity));
        const deadline = room.day?.deadline ?? Infinity;
        const presentationEnd=room.presentation?.until??Infinity;
        const due = Math.min(expiry, deadline, presentationEnd);
        if (due > this.now() || !Number.isFinite(due)) break;
        if (expiry <= Math.min(deadline,presentationEnd)) this.removeMany(room, room.players.filter(p => p.reconnectUntil !== null && p.reconnectUntil <= due), due);
        else if(presentationEnd<=deadline)this.resumePresentation(room,due);
        else if (room.day) {
          const result = expireDay(room.day, due, this.randomIndex) ?? expireNight(room.day, due, this.randomIndex);
          if (!result) break;
          this.commitDay(room, result);
        }
        changed = true;
      }
      if (changed) this.publish(room);
    }
  }

  private removeMany(room: Room, players: Player[], now: number): void {
    if(room.presentation)this.resumePresentation(room,now);
    const retained = !!room.day;
    for (const player of players) {
      if (player.abandoned) continue;
      if (player.socketId) this.bindings.delete(player.socketId);
      player.socketId = null; player.connected = false; player.reconnectUntil = null;
      player.abandoned = true; player.ready = false;
      player.tokenHash = randomBytes(32); player.receipts.clear();
      this.event(room, `${player.name} ${retained ? 'forfeited their seat' : 'left the gathering'}.`);
    }
    if (room.players.every(p => p.abandoned)) { this.rooms.delete(room.code); return; }
    if (retained) this.commitDay(room, forfeitPlayers(room.day!, players.map(p => p.id), now));
    else if (room.phase === 'PRIVATE_DEAL') this.openLobby(room, `A seat opened before Day. The deal was cancelled without revealing Life cards. Ready again when ${room.capacity} players are present.`);
    else room.players = room.players.filter(p => !p.abandoned);
    this.migrateHost(room);
  }

  private migrateHost(room: Room): void {
    if (room.players.some(p => p.id === room.hostId && p.connected && !p.abandoned && !p.isBot)) return;
    const next = room.players.find(p => p.connected && !p.abandoned && !p.isBot) ??
      room.players.find(p => !p.abandoned && !p.isBot) ?? room.players.find(p => !p.abandoned);
    if (next && next.id !== room.hostId) {
      room.hostId = next.id;
      this.event(room, 'The host lantern passed to the next available player.');
    }
  }

  private openLobby(room: Room, message: string): void {
    room.presentation=null;
    room.effects = [];
    room.phase = 'LOBBY'; room.match = null; room.day = null; room.blackCatVotes = {};
    room.roles = null; room.votes = {}; room.voteDay = 0; room.voteComplete = false;
    room.players = room.players.filter(p => !p.abandoned);
    room.players.forEach(p => { p.ready = p.isBot; });
    room.feed = []; // Old public death/history messages do not clutter the new deal.
    this.event(room, message);
    this.migrateHost(room);
  }

  private useRole(room: Room, player: Player, matchId: string, targetId: string, secondTargetId?: string): void {
    const day = room.day;
    if(room.day?.council?.open || room.day?.reveal) fail('ACTION_PENDING','Wait for the current decision.');
    if (!day || room.match?.id !== matchId) fail('MATCH_CHANGED', 'That match has ended.');
    const role = room.roles?.[player.id];
    if (!role || role.used || role.activeTargetId || !room.match?.players.find(p => p.id === player.id)?.alive)
      fail('ABILITY', 'This role ability is unavailable.');
    const target = room.match.players.find(p => p.id === targetId && p.alive);
    if (!target) fail('TARGET', 'Choose a living player.');
    if (targetId === player.id || secondTargetId === player.id)
      fail('SELF_TARGET', 'Choose another living player for your role power.');
    if (role.kind === 'HEXER') {
      if (room.phase !== 'NIGHT' || !day.night || this.now() >= day.deadline!) fail('PHASE', 'Hexing is available during Night.');
      if (secondTargetId) fail('TARGET', 'Hexer takes one target.');
      day.night.hexes ??= {}; day.night.hexes[player.id] = targetId;
      role.used = true; role.result = 'Your sigil has been sealed. Its effect remains unknown.';
      player.privateVersion++; return;
    }
    if (room.phase !== 'DAY' || this.now() >= day.deadline!) fail('PHASE', 'This role ability is available during Day.');
    if (role.kind === 'SLEUTH') {
      if (secondTargetId || targetId === player.id) fail('TARGET', 'Investigate one other living player.');
      const expiresAt = this.now() + (2 + this.randomIndex(5)) * 1000;
      const aligned = target.everWitch && room.roles?.[targetId]?.kind !== 'SCAPEGOAT';
      role.peek = { targetId, expiresAt, open: true, exposed: false };
      role.result = aligned ? 'WITCH-ALIGNED' : 'NOT WITCH-ALIGNED';
      role.used = true;
      player.privateVersion++; return;
    }
    if (role.kind === 'GOSSIP') {
      const second = room.match.players.find(p => p.id === secondTargetId && p.alive);
      if (!second || second.id === targetId) fail('TARGET', 'Compare two different living players.');
      const faction = (id: string) => room.roles?.[id]?.kind === 'SCAPEGOAT' ? 'NEUTRAL' :
        room.match!.players.find(p => p.id === id)!.everWitch ? 'WITCH' : 'HUMAN';
      role.result = faction(targetId) === faction(second.id) ? 'SAME ALLEGIANCE' : 'DIFFERENT ALLEGIANCE';
      role.used = true;
      player.privateVersion++; return;
    }
    if (role.kind === 'HERBALIST') {
      if (secondTargetId || targetId === player.id) fail('TARGET', 'Protect one other living player.');
      if (day.herbalRemedies?.[targetId] && !day.herbalRemedies[targetId]!.consumed)
        fail('PROTECTION', 'That player already has a remedy.');
      day.herbalRemedies ??= {};
      day.herbalRemedies[targetId] = { sourceId: player.id, activeDay: day.dayNumber, consumed: false };
      role.activeTargetId = targetId; role.result = 'Remedy set. It fades at Dawn if unused.';
      player.privateVersion++; room.version++; return;
    }
    fail('ABILITY', 'This role has no activated ability.');
  }

  private expireSleuthPeeks(room: Room): void {
    if (!room.roles || !room.match) return;
    let changed = false;
    for (const [sleuthId, role] of Object.entries(room.roles)) {
      const peek = role.peek;
      if (!peek?.open || peek.exposed || this.now() < peek.expiresAt) continue;
      peek.open = false; peek.exposed = true;
      role.notices.push('You were discovered while investigating.');
      const sleuth = room.players.find(p => p.id === sleuthId);
      if (sleuth) sleuth.privateVersion++;
      const target = room.match.players.find(p => p.id === peek.targetId);
      const recipientIds = new Set([peek.targetId]);
      if (target?.everWitch && room.roles[peek.targetId]?.kind !== 'SCAPEGOAT')
        for (const teammate of room.match.players.filter(p => p.alive && p.everWitch && room.roles?.[p.id]?.kind !== 'SCAPEGOAT'))
          recipientIds.add(teammate.id);
      for (const id of recipientIds) {
        if (id === sleuthId || !room.match.players.find(p => p.id === id)?.alive) continue;
        room.roles[id]!.notices.push(`${sleuth?.name ?? 'A Sleuth'} investigated ${room.players.find(p => p.id === peek.targetId)?.name ?? 'a player'}.`);
        const recipient = room.players.find(p => p.id === id); if (recipient) recipient.privateVersion++;
      }
      changed = true;
    }
    if(room.presentation?.privateAction?.kind==='SLEUTH'&&!room.roles[room.presentation.ownerId!]?.peek?.open)
      this.resumePresentation(room,this.now());
    if (changed) this.publish(room);
  }

  private councilVote(room: Room, player: Player, matchId: string, dayNumber: number, targetId: string): void {
    if (!room.day || room.match?.id !== matchId) fail('MATCH_CHANGED', 'That match has ended.');
    if (dayNumber !== room.day.dayNumber) fail('STALE', 'That council vote belongs to an earlier day.');
    if (room.phase !== 'DAY' || !room.day.council?.open || this.now() >= room.day.deadline!) fail('PHASE', 'Play Council Bell to open voting.');
    if (!room.match.players.some(p => p.id === player.id && p.alive)) fail('NOT_ALIVE', 'Only living players can vote.');
    if (!room.match.players.some(p => p.id === targetId && p.alive)) fail('TARGET', 'Vote for a living player.');
    if (room.voteDay !== room.day.dayNumber) { room.voteDay = room.day.dayNumber; room.votes = {}; room.voteComplete = false; }
    if (room.voteComplete) fail('VOTED', 'The council has completed its vote today.');
    if (room.votes[player.id]) fail('VOTED', 'You have already voted today.');
    room.votes[player.id] = targetId; room.version++;
    const living = room.match.players.filter(p => p.alive).length;
    const count = Object.values(room.votes).filter(id => id === targetId).length;
    if (count < Math.floor(living / 2) + 1) {
      if(Object.keys(room.votes).length>=living) {
        room.voteComplete=true; room.day.council!.open=false;
        room.day.deadline=this.now()+room.day.council!.remainingTurnMs;
        this.event(room,'Council Bell vote ended without a majority. Nobody was eliminated.');
      }
      return;
    }
    room.day.council!.open=false;
    room.day.deadline=this.now()+room.day.council!.remainingTurnMs;
    const scapegoat = room.roles?.[targetId]?.kind === 'SCAPEGOAT';
    const result = eliminatePlayer(room.day, targetId, this.now());
    if (scapegoat) {
      room.roles![targetId]!.individualWin = true;
      result.state.outcome = { winner: 'SCAPEGOAT', reason: 'COUNCIL_VOTE', playerId: targetId };
      result.state.phase = 'GAME_OVER';
      result.state.deadline = null;
      result.state.reveal = null;
      result.state.pendingReveals = [];
      result.state.night = null;
      // The council verdict takes precedence over faction victory from this death.
      result.events = result.events.filter(event => !['TURN', 'TURN_SKIPPED', 'NIGHT', 'WIN'].includes(event.type));
      result.events.push({ type: 'VOTE_VICTORY', targetId }, { type: 'WIN' });
    }
    this.commitDay(room, result);
    this.event(room, `${room.players.find(p => p.id === targetId)?.name ?? 'A player'} was ${scapegoat ? 'voted out — OUTCAST VICTORY.' : 'eliminated by council vote.'}`);
    room.voteComplete = true;
  }

  private requireHost(room: Room, player: Player): void {
    if (room.hostId !== player.id) fail('HOST_ONLY', 'Only the host can do that.');
  }
  private requireOpenLobby(room: Room): void {
    if (room.phase !== 'LOBBY') fail('PHASE', 'Bots can only be changed in the open lobby.');
  }
  private addBot(room: Room, difficulty: BotDifficulty): Player {
    const ordinal = this.botOrdinal++;
    const used = new Set(room.players.map(player => player.name));
    const base = botNames[ordinal % botNames.length]!;
    let name = base; let suffix = 2;
    while (used.has(name)) name = `${base} ${suffix++}`;
    const id = randomUUID(); const socketId = `bot:${id}`;
    const seed = ((this.botOptions.seed ?? 0x51f15e) + Math.imul(ordinal + 1, 0x9e3779b1)) >>> 0;
    const bot: Player = {
      id, name, avatar: AVATARS[ordinal % AVATARS.length]!, ready: true, connected: true,
      abandoned: false, reconnectUntil: null, isBot: true, botDifficulty: difficulty,
      privateVersion: 0, tokenHash: Buffer.alloc(32), socketId, receipts: new Map(),
      bot: { difficulty, memory: createBotMemory(seed) },
    };
    room.players.push(bot); this.bindings.set(socketId, { room, player: bot });
    this.event(room, `${name} joined as a ${difficulty.toLowerCase()} bot.`);
    return bot;
  }
  private removeBot(room: Room, bot: Player): void {
    if (bot.socketId) {
      this.bindings.delete(bot.socketId);
      this.bootstrap.delete(bot.socketId);
      this.cancelBotTimer(bot.socketId);
    }
    room.players = room.players.filter(player => player !== bot);
  }
  private beginPresentation(room:Room, previousPhase:RoomView['phase'], events:TableEffect[], duration:number,
    ownerId?:string, privateAction?:NonNullable<Room['presentation']>['privateAction']):void {
    if(!this.presentations||!room.day||!duration)return;
    if(room.presentation)this.resumePresentation(room,this.now());
    const now=this.now();
    const waiters=new Set(room.players.filter(player=>!player.isBot&&player.connected&&!player.abandoned&&(!ownerId||ownerId===player.id)).map(player=>player.id));
    room.presentation={id:randomUUID(),startedAt:now,until:now+(waiters.size?Math.max(45_000,duration+15_000):duration),
      remainingMs:room.day.deadline===null?null:Math.max(0,room.day.deadline-now),waiters,completed:new Set(),previousPhase,events,
      ...(ownerId?{ownerId,privateAction}:{} )};
    room.day.deadline=null;
    room.version++;
  }
  private resumePresentation(room:Room, now:number):void {
    const presentation=room.presentation;if(!presentation)return;
    const elapsed=Math.max(0,now-presentation.startedAt);
    if(room.day) {
      if(room.day.phase!=='GAME_OVER'&&presentation.remainingMs!==null)room.day.deadline=now+presentation.remainingMs;
      for(const peek of Object.values(room.day.privateHands??{}))
        if(peek&&peek.expiresAt>presentation.startedAt)peek.expiresAt+=elapsed;
      for(const peek of Object.values(room.day.privatePeeks??{}))
        if(peek&&peek.expiresAt>presentation.startedAt)peek.expiresAt+=elapsed;
    }
    room.presentation=null;room.version++;
  }
  private commitDay(room: Room, result: DayResult): void {
    const previousPhase=room.phase;
    if(result.events.some(event=>event.type==='PLAY'&&event.cardKind==='COUNCIL_BELL')) {room.votes={};room.voteDay=result.state.dayNumber;room.voteComplete=false;}
    room.day = result.state;
    room.match = result.state.identity;
    room.phase = result.state.phase;
    for (const event of result.events.filter(item => item.type === 'ROLE_BLOCK' && item.targetId)) {
      const targetId = event.targetId!;
      const sourceId = room.day.herbalRemedies?.[targetId]?.sourceId;
      if (sourceId && room.roles?.[sourceId]) {
        room.roles[sourceId]!.used = true; room.roles[sourceId]!.activeTargetId = null;
        room.roles[sourceId]!.notices.push('Your remedy blocked an effect.');
        const source = room.players.find(p => p.id === sourceId); if (source) source.privateVersion++;
      }
      if (room.roles?.[targetId]) {
        room.roles[targetId]!.notices.push('A remedy protected you.');
        const target = room.players.find(p => p.id === targetId); if (target) target.privateVersion++;
      }
    }
    for (const [id, role] of Object.entries(room.roles ?? {})) if (role.kind === 'HERBALIST' && role.activeTargetId) {
      const movedTo = Object.entries(room.day.herbalRemedies ?? {}).find(([, remedy]) => remedy.sourceId === id && !remedy.consumed)?.[0];
      if (movedTo && movedTo !== role.activeTargetId) {
        role.activeTargetId = movedTo;
        role.notices.push('Your remedy moved with Scapegoat.');
        const owner = room.players.find(p => p.id === id); if (owner) owner.privateVersion++;
      }
    }
    for (const [id, role] of Object.entries(room.roles ?? {})) if (role.kind === 'HERBALIST' && role.activeTargetId &&
      !room.day.herbalRemedies?.[role.activeTargetId]) {
      role.activeTargetId = null;
      if (!role.used) role.notices.push('Your unused remedy faded; it remains available.');
      const owner = room.players.find(p => p.id === id); if (owner) owner.privateVersion++;
    }
    if (room.day && room.voteDay !== room.day.dayNumber) { room.votes = {}; room.voteDay = room.day.dayNumber; room.voteComplete = false; }
    const visualTypes = new Set(['PLAY', 'DRAW', 'DEATH', 'REVEAL_PENDING', 'REVEAL', 'NIGHT', 'DAWN', 'DOUBT', 'CLEANSE', 'STATUS', 'VOW', 'CONSPIRACY', 'TRANSFER', 'BLOCK', 'ROLE_BLOCK', 'TURN_SKIPPED', 'VOTE_VICTORY']);
    const newEffects:TableEffect[]=result.events.filter(event => visualTypes.has(event.type)).map(event => ({
      id: randomUUID(), type: event.type as TableEffect['type'],
      ...(event.actorId ? { actorId: event.actorId } : {}), ...(event.targetId ? { targetId: event.targetId } : {}),
      ...(event.cardKind ? { cardKind: event.cardKind } : {}), ...(event.count !== undefined ? { count: event.count } : {}),
      ...(event.slot !== undefined ? { slot: event.slot } : {}),
      ...(event.secondTargetId ? { secondTargetId: event.secondTargetId } : {}),
      ...(event.statusKind ? { statusKind: event.statusKind } : {}),
      ...(event.blocked !== undefined ? { blocked: event.blocked } : {}),
    }));
    room.effects = [...(room.effects ?? []), ...newEffects].slice(-24);
    const name = (id: string) => room.players.find(p => p.id === id)?.name ?? 'A player';
    for (const event of result.events) {
      const message = describeDayEvent(event, result.state, name);
      if (message) this.event(room, message);
    }
    const plan=publicPresentationPlan(previousPhase,{phase:room.phase,deal:publicIdentities(room.match!),hasOutcome:!!room.day.outcome},result.events);
    this.beginPresentation(room,previousPhase,newEffects,plan.reduce((total,step)=>total+step.duration,0));
  }
  private event(room: Room, text: string): void {
    room.version++;
    room.feed.push({ id: randomUUID(), kind: 'system', text });
    room.feed = room.feed.slice(-60);
  }
  private view(room: Room, viewerId: string): RoomView {
    // Explicit allowlist. Never spread internal player or room objects into a DTO.
    return {
      ...(room.day?.reveal || room.day?.council?.open || room.day?.privateHands?.[viewerId] ? {serverTime:this.now()} : {}),
      ...(room.day?{cardQuantities:cardQuantities(room.day.rules)}:{}),
      effects: (room.effects ?? []).map(effect => ({ ...effect })),
      presentation:room.presentation?{
        id:room.presentation.id,scope:room.presentation.ownerId?room.presentation.ownerId===viewerId?'PRIVATE':'WAIT':'PUBLIC',
        until:room.presentation.until,remainingMs:room.presentation.remainingMs,awaitingYou:room.presentation.waiters.has(viewerId),
        ...(!room.presentation.ownerId?{previousPhase:room.presentation.previousPhase,events:room.presentation.events.map(event=>({...event}))}:{}),
        ...(room.presentation.ownerId===viewerId&&room.presentation.privateAction?{privateAction:{...room.presentation.privateAction,targetIds:[...room.presentation.privateAction.targetIds]}}:{})
      }:null,
      code: room.code, version: room.version, privateVersion: room.players.find(p => p.id === viewerId)!.privateVersion,
      phase: room.phase, hostId: room.hostId, capacity: room.capacity,
      scapegoatEnabled: room.scapegoatEnabled,
      blackCatChoice: room.phase === 'PRIVATE_DEAL' && room.match?.players.some(p => p.id === viewerId && p.alive && p.everWitch) && room.roles?.[viewerId]?.kind !== 'SCAPEGOAT'
        ? { submitted: Object.hasOwn(room.blackCatVotes ?? {}, viewerId), targetId: room.blackCatVotes?.[viewerId] ?? null } : null,
      councilVote: room.day?.council?.open ? { dayNumber: room.day.dayNumber, votesCast: Object.keys(room.votes).length,
        required: Math.floor(room.match!.players.filter(p => p.alive).length / 2) + 1,
        yourTargetId: room.votes[viewerId] ?? null, completed: room.voteComplete } : null,
      players: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar,
        ready: p.ready, connected: p.connected, abandoned: p.abandoned, reconnectUntil: p.reconnectUntil,
        isBot: p.isBot, botDifficulty: p.botDifficulty })),
      feed: room.feed.map(entry => ({ ...entry })), you: { playerId: viewerId },
      deal: room.match ? publicIdentities(room.match, room.day?.rules.revealHistoryOnDeath) : null,
      private: room.match ? (() => {
        const own = privateIdentities(room.match!, viewerId);
        return own && room.roles?.[viewerId]?.kind === 'SCAPEGOAT'
          ? { ...own, everWitch: false, witchTeammateIds: [] }
          : own ? { ...own, witchTeammateIds: own.witchTeammateIds.filter(id => room.roles?.[id]?.kind !== 'SCAPEGOAT') } : null;
      })() : null,
      role: room.roles ? privateRole(room.roles, viewerId, room.match?.players.find(p => p.id === viewerId)?.alive ?? false) : null,
      day: room.day ? publicDay(room.day) : null,
      hand: room.day ? privateHand(room.day, viewerId) : null,
      night: room.day ? privateNight(room.day, viewerId) : null,
      peek: room.match?.players.some(player=>player.id===viewerId&&player.alive)&&room.day?.privatePeeks?.[viewerId] && room.day.privatePeeks[viewerId]!.expiresAt > (room.presentation?.startedAt??this.now())
        ? { ...room.day.privatePeeks[viewerId]!,expiresAt:room.day.privatePeeks[viewerId]!.expiresAt+(room.presentation?Math.max(0,this.now()-room.presentation.startedAt):0) } : null,
      handPeek: room.match?.players.some(p=>p.id===viewerId&&p.alive) && room.day?.privateHands?.[viewerId] && room.day.privateHands[viewerId]!.expiresAt>(room.presentation?.startedAt??this.now())
        ? {...room.day.privateHands[viewerId]!,cards:room.day.privateHands[viewerId]!.cards.map(card=>({...card})),expiresAt:room.day.privateHands[viewerId]!.expiresAt+(room.presentation?Math.max(0,this.now()-room.presentation.startedAt):0)} : null,
      dawn: room.day?.dawn ? { ...room.day.dawn } : null,
      personalResult: room.roles?.[viewerId]?.individualWin ? 'WIN' : room.day?.outcome
        ? (room.roles?.[viewerId]?.kind === 'SCAPEGOAT' ? 'LOSS'
          : (room.match!.players.find(p => p.id === viewerId)!.everWitch ? 'WITCH' : 'HUMAN') === room.day.outcome.winner ? 'WIN' : 'LOSS') : null,
    };
  }
  /** Called by the server scheduler. Policies receive only the serialized owner view. */
  tickBots(maxActions = 500): number {
    this.sweep();
    if (!this.botOptions.fast) {
      for (const room of this.rooms.values()) for (const player of room.players) {
        if (!player.bot || !player.socketId || this.botTimers.has(player.socketId)) continue;
        const view = this.view(room, player.id);
        if (!enumerateLegalBotActions(view).length) continue;
        const key = this.botActionKey(view);
        const min = this.botOptions.minDelayMs ?? 500; const max = this.botOptions.maxDelayMs ?? 2_000;
        const delay = min + Math.floor(botRandom(player.bot.memory) * Math.max(1, max - min + 1));
        const timer = setTimeout(() => {
          this.botTimers.delete(player.socketId!); this.sweep();
          const current = player.socketId ? this.bindings.get(player.socketId) : null;
          if (!current || current.room !== room || this.botActionKey(this.view(room, player.id)) !== key) return;
          this.performBot(room, player);
        }, delay);
        timer.unref(); this.botTimers.set(player.socketId, timer);
      }
      return 0;
    }
    let actions = 0;
    while (actions < maxActions) {
      let candidate: { room: Room; player: Player } | null = null;
      for (const room of this.rooms.values()) {
        const player = room.players.find(item => item.bot && enumerateLegalBotActions(this.view(room, item.id)).length);
        if (player) { candidate = { room, player }; break; }
      }
      if (!candidate) break;
      if (!this.performBot(candidate.room, candidate.player)) break;
      actions++;
    }
    return actions;
  }

  private performBot(room: Room, player: Player): boolean {
    if (!player.bot || !player.socketId || player.abandoned) return false;
    const view = this.view(room, player.id);
    const decision = chooseBotDecision(view, player.bot.difficulty, player.bot.memory);
    if (!decision) return false;
    const command = this.botCommand(view, decision);
    const reply = this.execute(player.socketId, command);
    if (!reply.ok) {
      this.botFailures.push({ roomCode: room.code, playerId: player.id, code: reply.code });
      return false;
    }
    if (!this.botOptions.fast && this.botOptions.messages !== false) {
      const current = this.bindings.get(player.socketId);
      if (current && current.room.phase !== 'NIGHT' && current.room.phase !== 'PRIVATE_DEAL' &&
        current.room.match?.players.find(item => item.id === player.id)?.alive !== false) {
        const text = botMessage(view, decision, player.bot.memory, this.now());
        if (text) this.execute(player.socketId, { type: 'chat', actionId: randomUUID(), text });
      }
    }
    return true;
  }

  private botCommand(view: RoomView, decision: BotDecision): Command {
    const actionId = randomUUID();
    if (decision.type === 'acknowledgeDeal') return { type: decision.type, actionId, matchId: view.deal!.matchId };
    if (decision.type === 'chooseBlackCat') return { ...decision, actionId, matchId: view.deal!.matchId };
    if (decision.type === 'closeSleuth') return { type: decision.type, actionId, matchId: view.deal!.matchId };
    if (decision.type === 'councilVote') return { ...decision, actionId, matchId: view.deal!.matchId, dayNumber: view.day!.dayNumber };
    if (decision.type === 'useRole')
      return { ...decision, actionId, matchId: view.deal!.matchId };
    if (decision.type === 'nightAttack' || decision.type === 'nightProtect')
      return { ...decision, actionId, matchId: view.deal!.matchId, nightNumber: view.night!.nightNumber };
    return { ...decision, actionId, matchId: view.deal!.matchId,
      turnNumber: view.day!.turnNumber, gameVersion: view.day!.version } as Command;
  }

  private botActionKey(view: RoomView): string {
    return JSON.stringify([view.code, view.version, view.privateVersion, view.phase, view.deal?.matchId,
      view.day?.turnNumber, view.day?.version, view.night?.nightNumber,
      view.night?.attack?.submitted, view.night?.protection?.submitted]);
  }

  private cancelBotTimer(socketId: string): void {
    const timer = this.botTimers.get(socketId);
    if (timer) clearTimeout(timer);
    this.botTimers.delete(socketId);
  }

  /** Development/test-only entry point. It is never exposed as a socket command. */
  createBotSimulation(difficulty: BotDifficulty = 'NORMAL'): string {
    let code: string;
    do { code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join(''); }
    while (this.rooms.has(code));
    const room: Room = { code, version: 0, phase: 'LOBBY', hostId: '', capacity: SEATS, players: [], feed: [], match: null, day: null,
      scapegoatEnabled: false, roles: null, votes: {}, voteDay: 0, voteComplete: false };
    this.rooms.set(code, room);
    for (let index = 0; index < SEATS; index++) this.addBot(room, difficulty);
    room.hostId = room.players[0]!.id;
    const reply = this.execute(room.players[0]!.socketId!, { type: 'start', actionId: randomUUID(), expectedVersion: room.version });
    if (!reply.ok) throw new Error(`Simulation could not start: ${reply.code}`);
    return code;
  }

  simulationStatus(code: string): { phase: RoomView['phase']; deadline: number | null; outcome: DayState['outcome']; turnNumber: number; matchId: string | null } | null {
    const room = this.rooms.get(code);
    return room ? { phase: room.phase, deadline: room.presentation?.until??room.day?.deadline ?? null, outcome: room.day?.outcome ?? null,
      turnNumber: room.day?.turnNumber ?? 0, matchId: room.match?.id ?? null } : null;
  }

  simulationView(code: string, playerIndex = 0): RoomView | null {
    const room = this.rooms.get(code); const player = room?.players[playerIndex];
    return room && player ? this.view(room, player.id) : null;
  }

  removeSimulation(code: string): void {
    const room = this.rooms.get(code); if (!room) return;
    for (const player of room.players) if (player.socketId) {
      this.cancelBotTimer(player.socketId);
      this.bindings.delete(player.socketId);
      this.bootstrap.delete(player.socketId);
    }
    this.rooms.delete(code);
  }

  dispose(): void {
    for (const timer of this.botTimers.values()) clearTimeout(timer);
    this.botTimers.clear();
  }

  private publish(room: Room): void {
    for (const player of room.players) {
      if (player.socketId && !player.isBot) this.send(player.socketId, this.view(room, player.id));
    }
  }
}
