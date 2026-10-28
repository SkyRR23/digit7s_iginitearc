# Architecture

## Current executable boundary: playable slice with server bots

The client sends intent over Socket.IO. Shared Zod schemas reject extra fields,
invalid names/codes, and malformed action IDs. The server resolves the actor from
its socket binding; the browser cannot choose a player ID for mutations. It
validates membership, phase, host authority, readiness, capacity, and revision.
All room commands execute synchronously, with no await inside a mutation.

`apps/client` contains DOM rendering, original inline SVG sigils, responsive CSS,
transport/recovery logic, and Vite's same-origin socket proxy. `apps/server`
separates transport (`server.ts`), lifecycle (`index.ts`), and room domain
(`rooms.ts`). `deal.ts` and `day-runtime.ts` supply Node crypto entropy and the original preset.
`packages/shared` contains public contracts, validation, pure identity operations
under `/identities`, pure `/day` and `/night` engines, rule presets, and voice interfaces.
The browser imports wire DTOs, not the internal match model. Tests use real
network clients rather than mocking the transport.

The implemented flow is `LOBBY -> PRIVATE_DEAL -> DAY`, with Day pausing in
`REVEAL_RESOLUTION`, then `NIGHT -> DAWN -> DAY` or `GAME_OVER` after a victory.
Host start requires six connected, ready participants. Humans and lobby-created
bots can be mixed. The final owner acknowledgement
creates the action deck and first turn. Before Day, departure cancels the deal
without reveals. After Day begins, departure forfeits that player and the match
continues. The host can explicitly abort, or open a rematch lobby after game over.
No replacement can join a running match. See the lifecycle rules below.

## Server bot boundary

Bots live in `apps/server/src/bots.ts` and are registered as server-owned players
with synthetic bindings. Their decisions pass through `RoomStore.execute`, so they
share Zod validation, receipt deduplication, actor binding, phase/turn revisions,
card ownership and the pure Day/Night reducers with humans. Lobby commands can
only add, remove or fill bots when issued by the current host.

The bot policy receives an owner-specific `RoomView` produced by the normal
allowlist serializer. Legal-action enumeration therefore has public state, that
bot's private Seals/hand, and only authorized Witch-team knowledge; it cannot read
the internal deck, other private identities, tokens or Night ballots. Easy and
Normal use seeded policy randomness. Normal scheduling uses a state key before
dispatch to discard stale callbacks. Simulation mode removes delay but uses the
same command path. See `TESTING_BOTS.md` for behavior and verification commands.

## Identity, authority, and privacy

Three different identifiers: stable public `playerId` (UUID), transient Socket.IO
`socketId`, and a random 32-byte reconnect token. Eight-character room codes use
a cryptographically random 32-symbol alphabet (40 bits) with collision checking.
Tokens are hashed using SHA-256 and compared with timingSafeEqual; raw tokens
are returned only in that player's create/join/resume acknowledgement.

RoomStore's serializer explicitly lists public fields and emits separately to
each bound socket. `you.playerId` identifies the recipient. The public `deal`
contains matchId, participant IDs, living/acknowledgement flags, and ordered Seal
slots. Unrevealed slots have neither kind nor card ID. Revealed-kind projection
exposes only publicly revealed cards. Death reveals all remaining Seals and,
when configured, historical Witch allegiance. Living history stays private.

`privateIdentities` returns only a living owner's unrevealed cards, historical
allegiance, derived Constable ability, and (for living Witches only) IDs of other
living Witch-aligned players. It denies dead, unknown and null viewers. Teammates
do not receive each other's cards or Constable status. Room host has no extra
access. Unbound sockets receive no room broadcasts/read API. Spectator joining
does not exist. Actual death immediately revokes both private identities and
private action hands, including on cached request retries and reconnect.

Receipt caches hold no snapshots. Both acknowledgement retries and broadcasts
regenerate the current view, so old requests cannot return revoked/obsolete
private data. Internal token hashes, socket IDs, caches and deck order are never
serialized. The UI covers private text by omitting it from the DOM until inspected;
cover/blur/disconnect removes it again. This does not erase data already delivered
to an authorized owner, and is not a substitute for server privacy.

Browser text becomes textContent or is escaped before HTML interpolation; no
chat content is interpreted as HTML. No credentials appear in the UI debug panel
or server logs. No external font or art request is required.

## Delivery and lifecycle

Each command has a UUID actionId. A bounded 128-receipt cache detects exact
duplicates and rejects reuse with different payloads. Accepted mutating commands
with expectedVersion cannot apply after a newer revision. The server publishes
fresh snapshots; clients ignore older snapshots. Chat is append-only and also
deduplicated, but does not carry a revision. The duplicate guarantee for chat is
bounded by the receipt cache; persistent cross-process/exactly-once delivery is
not claimed. M2 acknowledgement commands include matchId and derive their actor
from the socket. They are monotonic/idempotent and deliberately independent of
room revision, so concurrent acknowledgements or chat do not conflict. Old
match IDs are rejected; cached duplicates return a fresh view without mutation.
Day commands carry matchId, turnNumber and gameVersion; the server also checks
the current phase. Game revision is separate from room revision so chat and
connectivity changes cannot invalidate an otherwise current turn action.

The client retries a timed-out acknowledgement once with the same ID and only on
the same transport session. Buttons are disabled while an action is pending or
offline. Mutations are not buffered for delivery on reconnect. A stale revision
causes a friendly retry prompt and snapshot sync. Uncertain network replies also
trigger sync when still connected. Replies from a replaced transport are ignored;
connection epochs invalidate pending work after disconnect/seat removal. Resume
retries on transient failure while controls remain blocked. `view-order.ts`
compares public then private revisions and rejects another seat/room until the
old view is cleared. Offline/recovering views hide identities, hands and choices.

Refreshing resumes via per-tab sessionStorage. A valid token can take over a seat
from an old connection; that connection is explicitly notified/disconnected and
its later disconnect cannot invalidate the new binding. Disconnected seats have
a server-measured 60-second grace period. Hosting passes immediately to a connected
survivor on disconnect; the old host does not reclaim it on return. A periodic
sweep forfeits expired seats and deletes rooms with no remaining members. Browser
countdowns are advisory; client timestamps never decide expiry. The process is
the persistence boundary: restart means room loss and a clear expired-seat error.

### Forfeits and rematches

Public players have an `abandoned` flag. After Day starts, leave/grace expiry
revokes the token and receipts, removes the socket binding and marks the public
seat abandoned. `forfeitPlayers` kills living departures as an atomic batch,
reveals their Seals/history using existing rules, discards hands, clears wards/
Doubt and deletes their Night choices. Dead departures cannot change the winner.
GAME_OVER departures preserve the finished result and surviving hidden Seals.

An active daytime forfeit advances to a living actor. A missing reveal chooser
opens the lowest hidden target slot; a departed target cancels the choice and
restores the turn deadline. Night/Dawn forfeits preserve those phase deadlines;
the queued daytime actor is skipped on next-day entry. All relevant transitions
check victory, including a final Witch forfeiting. Retained seats preserve seat
order, public history and names. They receive no broadcasts and cannot resume.

The sweep compares phase deadlines and reconnect expirations, processing the
earliest due timestamp first. Equal-time departures are one batch and precede
phase expiry. Victory is checked after that batch, with Human precedence.
A delayed sweep therefore cannot invalidate protection before its earlier Night
deadline. Work is bounded to 100 transitions per room per sweep; another sweep
continues an unusually large backlog. Client timestamps never affect ordering.

`rematch` requires host authority, current room revision and GAME_OVER. It clears
day/identity/secret state and feed, prunes abandoned seats, and resets readiness
for retained members. Connected/dead members retain their credentials; departures
must join afresh in the lobby. Starting still requires six connected ready players
and creates new match/card IDs. Receipt retries return current views without
replaying a rematch. Existing `reopen` remains the host's explicit abort command.
Browser confirmations guard abort/forfeit; no confirmation is a server permission.

## Implemented identity domain

`dealIdentities` validates the configured totals and exactly six distinct owners,
then uses Fisher–Yates with an injected bounded random-index function. Production
uses `crypto.randomInt`; IDs use `crypto.randomUUID` after shuffling. No client
seed, requested role, preset, or deck is accepted. Pure tests use controlled
entropy and ownership fixtures. Original and reference presets remain separate.

`IdentityCard { id, kind, ownerId, slot, revealed }` retains stable identity across
future ownership changes. Slots are zero-based, ordered per owner. Participants
store `alive`, `acknowledged`, and monotonic `everWitch`. `recordWitchHistory`
preserves prior truth while marking current Witch owners. `transferIdentities`
validates a complete exchange before applying any ownership change and then
records every new Witch holder. `hasConstableAbility` derives
from current, unrevealed ownership and living status, independently of allegiance.
Two Witch cards can belong to one player, who may also hold the Constable card.

These fields survive browser reconnect because they live in the server's match,
not the socket. They reset only when this deal ends. Server-process persistence
is not implemented. Nothing is written to disk or browser storage except the
browser's per-tab reconnect credential.

## Implemented day engine and next boundaries

`day.ts` exports immutable `applyDayAction`, `expireDay`, and explicit public/owner
projections. `day-model.ts` holds internal state; `day-resolution.ts` handles
death cascades, victory, pending resolution and turn advancement. Wire-only
types live in `day-views.ts`. Browser bundles import DTOs, not the engine.
`day-runtime.ts` supplies secure shuffle/IDs and translates domain events into
public feed messages. RoomStore commits the returned identity/day state together.

The server owns the configurable 83-card starting deck, discards and three-card
initial hands. `day-cards.ts` resolves the 14 supported action kinds. Public
views include counts, 0–7 Doubt, structured active statuses, Vow relationships,
active actor, turn/version/deadline, pending reveal target/chooser, and outcome.
Only a living owner receives their hand IDs
and kinds. Played kinds become public; deck/discard order and hidden card IDs do
not. A personal win/loss is derived from historical allegiance even after death.

Commands validate the bound actor, living state, match/turn/version, phase and
deadline, card ownership, card-specific target rules, and protective effects.
Invalid commands leave state unchanged. Draw-two ends the turn; after any card
play, only further plays or end-turn are allowed. A seven-Doubt row triggers
one immediate server-random unrevealed Life-card reveal and then clears. Dead
seats are skipped. Empty deck waits for victory before Night. Grouped plays
resolve sequentially and leave later cards in hand if an earlier card invalidates
their target.

The existing server sweep resolves current expired turns/reveals, using server
time. Idle turns draw/end; played turns end. No per-match timer closure can mutate an old
match after reopen. Tests inject `now` and a trusted in-process `dayFactory` for
rare endgame fixtures; neither is a socket command, browser option, or production
environment seed. The six-browser test uses the real shuffled deck.

**Cinder Shift** calls the atomic ownership API with two opposite transfers.
The server randomly selects one unrevealed Life card from the actor and one
from another living player. **Conspiracy** uses the same API for one simultaneous
transfer per living seat, skipping eliminated players. All destinations are
vacated in the same transaction.
The public event names the two players but discloses neither card ID nor kind.
Fresh per-recipient views show each new owner only their own updated identities.
Duplicate packets use the ordinary receipt cache and cannot repeat the exchange.
Tests cover invalid/revealed/forged inputs, unique slots, no partial mutation,
sticky Witch history, current Constable authority, and wire privacy.

Each reveal/death resolves as an atomic transaction. Revealing a Witch or
exhausting unrevealed slots kills a player; an unprotected night attack uses the
same death rules. Remaining cards reveal together, the hand is discarded,
Doubt/ward clear, and victory is checked after the full batch. Human victory
if all Witch cards are revealed takes precedence over Witch victory if every
living player is everWitch. Both conditions and their simultaneous case are tested.
`eliminatePlayer` is a domain-only hook for future effects/tests, not a client API.

## Night, dawn and repeated days

`night.ts` implements immutable `submitNight`, `privateNight`, and `expireNight`.
The server's current-state sweep handles Day, reveal, Night and Dawn deadlines.
There are no scheduled closures holding obsolete match objects. Night commands
include matchId/nightNumber, not the shared game revision: concurrent secret
choices cannot invalidate each other or reveal a submission count. Each ability
locks after one submission. Receipt deduplication still handles packet retries.

Only living historical Witches can attack; only a living current holder of an
unrevealed Constable can protect. Self targets, dead/unknown targets and allied
attack targets are rejected. A Witch+Constable can submit once for each ability.
Eligibility is rechecked at resolution. Explicit null and missing choices both
mean abstain, but only the owner can distinguish those before resolution.

Secret submissions update no public revision/feed/deadline. Only the actor gets
an acknowledgement and private snapshot. Per-player `privateVersion` orders
equal-public-revision snapshots, preventing an older acknowledgement from hiding
a newly sealed choice in the UI. No other player's privateVersion is serialized.
The client compares public revision first, then its private revision. Reconnect
restores current permissions/choices; dead and unseated viewers get no private
Night data. The host has no additional access. Public chat is blocked during Night.

At the fixed 45-second deadline, count eligible living Witch votes; most votes
wins and ties use earliest target seat order. No valid votes means no attack.
Freeze eligible Constable protection before killing an unprotected target.
Resolve death/remaining reveals/hand disposal and victory atomically. Discard
secret ballots and publish only deceasedId (or null) and nightNumber. Never
announce the saved target, protecting actor, ballot tally, or reason for no death.
Game over returns immediately if a side wins; otherwise DAWN lasts five seconds.

At Dawn expiry, Fisher–Yates shuffle discarded cards with Node `crypto.randomInt`
into the new draw pile. Surviving hands are untouched, including card IDs and order;
no cards are re-dealt. This preserves the configured card total while allowing shorter days.
An empty draw pile permits End day and does not reclaim held cards.
Dead hands stay empty. Identity state and Doubt persist. Asylum expires at Dawn;
Hearthward, Piety, Bound, and Vow follow their own consumption rules. Resume
the queued next living actor (skip a night victim), clear
playedThisTurn, increment day/turn/game revision and start a fresh 60-second turn.
The last public dawn result remains available until the next Night begins.

The 60-second reconnect grace bounds seat recovery. A disconnected player's
already sealed choice remains valid while they are alive. Forfeit revokes the
ability and removes the choice; missing or ineligible input cannot block Night.

## Deployment later

Production client files are in `apps/client/dist`; Node output is in
`apps/server/dist`. `npm run build` builds shared first. Serve static content and
proxy `/socket.io` through one TLS origin. Set `NODE_ENV=production`, exact
comma-separated `ALLOWED_ORIGINS`, and `HOST`/`PORT` for the environment. Origins
are an additional browser control, not authentication. Current originless native
clients still require room/session admission. Add IP-level admission limits,
persistent room storage, monitoring without secrets, and coordinated timers
before public deployment or multiple server processes.
