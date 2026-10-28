# Milestone 3 verification

Historical milestone record. See VERIFICATION.md for current M4 results.

Executed October 15, 2026 on Windows, Node 24.18.0, npm 11.16.0, Vitest 4.1.12.
Existing dependencies were used. Historical records: VERIFICATION_M1.md and
VERIFICATION_M2.md. No bots or new external services were installed.

## Commands and actual results

- `npm test`: **70 passing tests in six files**: four contract tests, thirteen
  lobby socket tests, thirteen identity tests, eight private-deal socket tests,
  twenty-two day rule tests, and ten day socket integration tests.
- `npm run typecheck`: passed shared build and strict server/client TypeScript.
- `npm run build`: passed all three workspaces. Final client output: 120.46 kB JS
  (34.83 kB gzip), 14.32 kB CSS (4.05 kB gzip).
- `npm run dev`: served Vite on 5173 and Node/Socket.IO on 3001.
- `npm run test:browser`: passed with six independent headless Edge contexts,
  real UI actions and actual WebSocket traffic. The day scenario recorded
  **12 card plays, two chosen reveals, one ward played, and GAME_OVER** with
  Human victory. These counts describe this random production-deck run, not a
  guaranteed sequence for every shuffle. The script also accepts the explicit
  Night checkpoint when the action deck runs out first.

There is no separate lint command; strict TypeScript and unused-symbol checks
are configured. The final production build includes a subsequent copy-only
private-panel correction: hidden-Seal wording and a dynamic covered-slot count.

## Pure rule evidence

Tests verify the original deck composition, three-card starting hands, card
conservation, immutable transitions, draw-two versus play/end, and rejection of
wrong actors, match/turn/version, phases, owned cards, targets and reveal slots.
The default five-Doubt and separate seven-Doubt configuration both work.
Hearthward consumes one future Whisper, preserves prior Doubt, cannot stack,
and expires at Night. Threshold overflow clears after exactly one chosen reveal.

Revealing Constable removes the ability without killing an otherwise valid owner.
Revealing Witch or exhausting hidden cards kills, reveals remaining Seals,
discards the hand and clears Doubt/ward. Death exposing multiple Witch cards is
evaluated as one transaction. Tests cover Human victory, last-Human death/Witch
victory, simultaneous-condition precedence, dead/current-actor advancement,
and a pending chooser dying. These exceptional state combinations use trusted
domain fixtures, not client-accessible cheats or gameplay transfers.

Server deadlines cover idle draw/end, end-after-play, and lowest-hidden-slot
reveal selection. Empty deck draws the final single card, waits for pending
resolution, checks victory before Night, and clears wards. Game over is frozen.

## Network and privacy evidence

Six real Socket.IO clients receive owner-only action hands in both broadcast
and acknowledgement paths. Others receive only hand counts; hidden card IDs,
unplayed kinds and deck order stay off the wire. Existing identity/history/team
privacy tests remain. Unseated connections cannot subscribe to room state or
impersonate actors; spectator admission is still unsupported.

Duplicate play packets mutate once; reused IDs with different payloads fail.
Stale game/turn/match packets fail. Chat does not invalidate a game revision.
Actual Witch death revokes private Seals and hands immediately, including cached
sync retries, dead reconnect and refresh. Dead chat is denied before game over.
Public death history obeys configuration. Socket scenarios verify both victory
conditions and all six personal results using trusted near-end fixtures.

Clock-injected socket tests trigger timeout transitions without any client
timeout command. Refresh during a pending reveal restores the same hand and
choice. Reopen prevents an obsolete deadline from mutating a new lobby. Two
simultaneous rooms remain isolated. Fixture factories and clocks are in-process
test injection only; no network API accepts decks, seeds, roles or timestamps.

## Browser and visual evidence

Six isolated contexts created/joined, readied, inspected/covered/acknowledged
private Seals, entered Day, selected cards and targets, played a ward and
Whispers, chose reveals, and reached a public victory. The automated QA driver
uses each owner's authorized view to choose its test sequence; this is an
external test harness, not a bot feature in the game. It checks all six public
game revisions after each action. Dead browser state has null private/hand
fields and no private inspector. Reopen/leave and prior offline recovery pass.

Public/private layouts fit at 320, 390, 768 and 1440px. Screenshots in ignored
`test-results/day-mobile.png` and `day-terminal-desktop.png` were visually
inspected. No uncaught page errors. The blur test explicitly dispatches the
event; it does not claim OS focus behavior across isolated headless windows.
Private covering cannot revoke data already delivered to its authorized owner.

## Remaining limits and next gate

Night is a visible M3 checkpoint: no attacks, protection input, dawn, next-day
deck replenishment, or complete day/night match yet. M4 must implement those
and connect their death/victory resolution to the tested engine. Constable
eligibility is derived correctly but cannot be activated yet.

Leaving or exceeding the 60-second reconnect grace still aborts the entire
prototype match without a death reveal. Define abandonment before the complete
slice. Host reopen/redeal works, but full match/rematch recovery awaits M4–M5.
Rooms and history live in memory; server restart erases them. No transfers,
advanced roles, bots, voice, public deployment, load test, physical phones,
Safari/Firefox checks, wide-area networking, or six-human social playtest.

Development services are stopped after verification. Run `npm run dev` and open
http://localhost:5173 in six fresh tabs or profiles to review. The backend health
endpoint is http://127.0.0.1:3001/health. See README.md for the complete sequence.
