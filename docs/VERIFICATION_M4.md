# Milestone 4 verification

Historical milestone record. See VERIFICATION.md for current M5 results.

Executed October 15, 2026 on Windows, Node 24.18.0, npm 11.16.0, Vitest 4.1.12.
Existing dependencies were used; no bots, voice providers or new packages.
Earlier milestone evidence is preserved in VERIFICATION_M1.md through
VERIFICATION_M3.md. This record describes the tests actually run, not a human
social-playtest or public deployment claim.

## Commands and results

- `npm test`: **96 passing tests across eight files**. Previous 70 tests retained;
  added 17 pure Night/Dawn tests and nine six-client Night integration tests.
- `npm run build`: passed shared/server/client. Client output: 123.26 kB JS
  (35.62 kB gzip), 14.52 kB CSS (4.10 kB gzip).
- `npm run typecheck`: passed strict server/client TypeScript and shared build.
- `npm run dev`: Vite serves 5173; Node/Socket.IO serves 3001. Client readiness
  HTTP request returned 200; server health is the Milestone 4 endpoint.
- `npm run test:browser:night`: passed with six isolated headless Edge contexts,
  actual UI controls, production random dealing and two real 45-second deadlines.
- `npm run test:browser`: existing six-context regression passed, including
  12 card plays, two selected reveals, a Hearthward and Human victory this run.

There is no separate lint command. Strict TypeScript and unused-symbol checks
are configured. Development services were stopped after verification.

## Rules and protocol evidence

Night has a fixed deadline regardless of submissions. Tests cover missing and
explicitly abstained choices, one sealed submission per ability, deadline/phase/
match/night validation, duplicate packets, changed payload reuse, stale packets,
dead/unseated actors, forged fields, self/unknown/dead/ally targets, and silence
for all public chat during Night. No browser command accepts roles, clock values,
decks, random seeds, or test fixture data.

Living historical Witches vote even if ownership fixtures remove their Witch
cards. Current living unrevealed Constable ownership controls protection. Tests
cover Witch+Constable overlap, loss of the ability on reveal/ownership change,
self-protection rejection, correct and wrong protection targets, and an attacked
Constable. Highest votes decides; target seat order breaks ties independently
of packet arrival. Eligibility/protection freeze before the death transaction.

Night death reveals remaining Seals, clears the hand and private permissions,
and checks victory after the whole reveal batch. Last-Human death yields Witch
victory across six socket clients with correct personal outcomes. Existing M3
tests cover Human victory and multiple Witch reveals; the browser regression
also reached Human victory. Endgame and ownership edge cases use trusted domain
fixtures, not gameplay transfers or a network-accessible debug mode.

Secret commands do not advance public game/room revisions, add feed entries,
change the deadline, or broadcast to other players. Owner-only `privateVersion`
orders private snapshots. All six clients' events and acknowledgements are
checked: no peer ballots/protection, submission counts, or server dictionaries.
An ordinary Witch cannot read a teammate's ballot or Constable choice. The host
has no extra authority. Repeated sync receipts serialize current privileges.

Refresh preserves only the owner's sealed choice. Disconnection within grace
does not delay Night. Death and reconnect yield null identity/hand/Night private
views. Two simultaneous rooms stay isolated. Reopen discards secret choices and
prevents an old deadline or packet from changing the reopened lobby.

Public dawn contains only nightNumber and deceasedId/null. No saved target,
protector, tally, or reason for no death is disclosed. Secret ballots are erased.
Dawn expiry reclaims all action cards, securely reshuffles and deals living
players only, preserving the 36-card total, identity/history and Doubt. It skips
a dead queued actor and starts a new turn/deadline. Tests cover all-draw days
with no discard pile, repeated nights, invalid shuffle entropy, and old-night
packets rejected against the new night.

## Browser evidence

`tests/night-browser.mjs` uses six actual Edge contexts and reads each owner's
authorized network view to coordinate its scripted QA sequence. This is a test
driver, not an installed game bot. It creates a room, joins/readies six clients,
deals/acknowledges, and draws through Day using actual buttons to reach Night.

First Night: all Witches voted for one Human; the Constable protected that Human.
The random production deal happened to combine Witch and Constable on one owner,
so both private controls were exercised in the same browser. A Witch refreshed
after sealing; the final choice persisted and could not be submitted again.
The actual server deadline produced a no-death dawn, then Day 2 with three fresh
cards each. No early resolution or public choice progress occurred.

Second Night: the same target was attacked, with explicit Constable abstention.
The target died at the real deadline; their remaining Seals became public and
private identity/hand/choices disappeared. Day 3 followed with five fresh living
hands and 21 cards in the deck. Dead refresh retained public-only access and chat
silence. Host reopen removed all night controls and returned all clients to lobby.

Night controls fit at 320, 390, 768 and 1440px. Mobile `night-mobile.png` and
`dawn-death-mobile.png` screenshots were visually inspected; survivor dawn and
next-day desktop screenshots are also saved under ignored `test-results/`.
Both browser suites reported no uncaught page errors. They do not replace
physical-phone, browser focus behavior, accessibility, or human social playtests.

## Failures resolved and limits

The first full test run found the M3 public-state allowlist needed the new
`dayNumber` field; it was updated and all 96 tests passed. Initial browser attempts
could not launch Edge or reach a sandboxed loopback server. Running the preview
and browser checks with approved local-network access resolved that environment
restriction; both browser suites then passed. No application test failures remain.

M5 remains: define abandonment/forfeit rules (leave/grace expiry still aborts the
whole prototype match), complete human matches/rematches across devices, broader
Safari/Firefox/iOS/Android compatibility, slow-link/background-tab tests and
accessibility polish. Rooms/history remain memory-only; server restart erases
them. No public hosting, load test, ten-player variant, advanced roles, identity
transfers, bots, private Witch chat, or voice was added.

Run `npm run dev`, then open http://localhost:5173 in six fresh tabs/profiles to
review. Backend: http://127.0.0.1:3001/health. Run the Night browser test with the
server running and allow about two minutes. See README.md for the manual flow.
