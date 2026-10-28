# Build plan and acceptance gates

## Milestone 1 — completed foundation

Separate npm workspace; Vite/TypeScript DOM client; Node/Socket.IO server; shared
Zod contracts. Six live seats, names, cosmetic sigils, room create/join, ready,
host start to an explicitly labeled lobby checkpoint, reopen, public chat, leave,
60-second reconnect grace, host migration, and per-recipient state views.
Original responsive CSS/SVG; no paid assets or services. The original lobby-only
checkpoint has now been superseded by the Milestone 2 private deal.

Acceptance checks: six browser sessions agree on seats/readiness/phase; no start
with fewer than six ready connected players; reconnect preserves identity;
unauthorized controls and leaked internal fields are rejected; repeat packets
do not reapply; rooms are isolated; chat cannot execute markup. See
`VERIFICATION.md` for actual executed results and limitations.

## Milestone 2 — completed

Secure server shuffle and pure controlled-entropy test deal logic, five ordered
Seals per person, original public/private labels, and owner-only inspection.
Monotonic Witch history and current-owner Constable derivation. PRIVATE_DEAL
with owner acknowledgements originally advanced to DEAL_COMPLETE, now replaced
by M3 Day. Host reopen, leave, or expired seat still ends the match without
revealing identities. No bots or gameplay transfers.

Implemented tests: exact six-player totals, shuffled ownership, no other owner's
private identities or deck order in any snapshot, authorized Witch teammate
visibility, no privileges for dead/spectating clients, Witch+Constable, historical
allegiance independent of current ownership. Ownership changes use test fixtures,
not a gameplay transfer API. Six actual browser contexts also inspect inbound
socket frames, privately inspect/cover/acknowledge Seals, and recover after refresh.
See VERIFICATION_M2.md for the historical results and platform limitations.

## Milestone 3 — completed

Pure rule reducer, secure small original action deck, match/turn/game revisions,
draw-two versus play/end, target/hand/actor validation, Doubt and temporary ward
semantics, one-card threshold reveal, deterministic death cascade, victory.
Deck exhaustion safely reaches Night. Server deadlines resolve idle turns and
missing reveal choices. The original M3 Night checkpoint was replaced in M4.

Implemented tests: illegal turn, dead actor, forged card, self target, threshold
overflow, one reveal only, unrevealed selection, exhausted identities, Witch
death revealing additional Witch cards, all-Witch-cards victory, last living
Human death, active-player death, empty deck, repeated and late packets, owner-only
hands, dead-player reconnect/cache privacy, timeouts, and two-room isolation.
All 70 tests pass. Six isolated Edge clients exercised 12 card plays, two chosen
reveals, a ward and Human victory through actual UI controls. See VERIFICATION_M3.md.

## Milestone 4 — completed

Private living-Witch voting and eligible Constable protection, safe missing-input
defaults, 45-second deadline, deterministic tie rule, atomic death/win evaluation,
minimal public dawn result, and integration with the existing M3 game-over and
personal-outcome views. Five-second dawn then full action-card recycling, three
cards per living player and queued living turn continuation. Doubt persists.
Choices are sealed once per ability, owner-only, with no public progress count.
Public chat is blocked at Night. No bots or private team chat/voice added.

Implemented tests: correct protected target survives, self-protection rejected,
Witch+Constable may use both abilities, dead/missing/expired inputs, all possible
timeouts, obsolete timer cannot resolve a new phase, no irrelevant secret leak,
and six-client victory scenarios for both winning sides. The suite has 96 tests;
real browser Night coverage uses actual deadlines. See VERIFICATION_M4.md for results.

## Milestone 5 — implementation complete, stopped for review

Implemented forfeit deaths/retained departed seats, token revocation, batched
expiry/victory, chronological deadlines, immediate host migration, validated
rematch lobbies, fresh readiness and replacement admission. Reconnect rejects
stale transport replies and restores current permissions. Mobile actions come
first, covered identities are compact, navigation targets are touch-sized, and
long action hands scroll in two columns. Night drafts survive unrelated updates.
The suite contains 110 tests; browser scripts exercise Day, Night and lifecycle.
See VERIFICATION.md for executed checks and actual platform coverage.

Remaining acceptance work: full six-human matches/rematches across devices,
Safari/iOS, Android Chrome, desktop Firefox, real background/slow-link behavior,
screen readers and broader keyboard testing. Automated Edge contexts are not
human or physical-device testing. Do not enable untested 5–10-player variants.

## Milestone 6 — implementation complete, stopped for review

Added the original Cinder Shift action and atomic identity-transfer API, including
sticky Witch history, current-owner Constable authority, strict slot/owner checks,
duplicate-action protection, per-owner serialization and responsive controls.
Added a pure server-authoritative voice policy for lobby, council, Witch Night,
optional dead lounge and game-over access. Voice stays disabled until a provider
adapter is configured; no browser secrets, microphone prompt, fake controls, or
audio dependency were added. Advanced roles remain outside this vertical slice.

## Server bot extension — completed

Added Easy/Normal server-owned seats, host lobby controls, restricted owner views,
legal action enumeration, seeded policies, human-like scheduling, safe public
messages, full Day/reveal/Night/Cinder Shift support, rematch retention and fast
simulation. Bots traverse the authenticated command/reducer boundary and cannot
read raw match state. Coverage includes one-human/five-bot and six-bot completion,
100-game simulation, reconnect and privacy checks. See TESTING_BOTS.md.
