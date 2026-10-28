# Milestone 5 verification

Executed October 15, 2026 on Windows, Node 24.18.0, npm 11.16.0, Vitest 4.1.12.
No new dependencies, bots, voice, deployment or identity-transfer event. Previous
milestone evidence is preserved in VERIFICATION_M1.md through VERIFICATION_M4.md.

## Commands and results

- `npm test`: **110 passing tests in ten files**. All previous 96 tests retained;
  added eleven multiplayer lifecycle tests and three client revision-order tests.
- `npm run typecheck`: passed shared build and strict client/server TypeScript.
- `npm run build`: passed all workspaces. Client: 125.52 kB JS (36.37 kB gzip),
  15.99 kB CSS (4.42 kB gzip).
- `npm run dev`: served client on 5173 and server on 3001. HTTP readiness returned
  200; `/health` returned `{"ok":true,"milestone":5}`.
- `npm run test:browser:lifecycle`: passed in six isolated headless Edge contexts.
- `npm run test:browser:night`: passed in six isolated Edge contexts, including
  two real 45-second Night deadlines and the new draft-preservation assertion.
- `npm run test:browser`: passed; this random-deck run exercised 12 card plays,
  two chosen reveals, a ward and Human victory.

No separate lint task is configured; strict TypeScript and unused-symbol checks
are enabled. Preview services are stopped after verification.

## Abandonment and rematch evidence

Living active-player leave kills/reveals that player, advances the turn, retains
the public seat and continues the same match. Old reconnect credentials and
private-view receipts fail. In-match joining cannot replace a departed player.
Reconnect before the exact grace cutoff restores the seat; expiry revokes it.
Host disconnect immediately hands authority to a connected player; the returning
host cannot reclaim controls. Existing pre-Day departure/cancel tests still pass.

Pending reveal chooser departure picks the lowest hidden slot; target departure
cancels the selection without an extra reveal. Night forfeit removes protection/
votes and preserves the phase deadline unless victory ends the match. Delayed
sweeps resolve an earlier Night before later reconnect expiry, so valid protection
is not retroactively removed. Simultaneous final-Human/Witch expirations are
batched and award Human victory according to the documented precedence.

Rematch rejects non-hosts and unfinished games. Departures after GAME_OVER retain
the winner. A rematch removes departed seats, preserves room code and retained
membership, clears game/secret state and readiness, and requires six connected
ready players again. Replacement players join afresh. New deals have new match
and card IDs; old match commands cannot apply, and rematch receipt retries cannot
reset a later deal. Refresh restores the new match. All-expired rooms are deleted
while another active room remains isolated.

Client snapshot tests reject older public revisions, older private acknowledgements,
another room and another seat; newer phase/death/rematch revisions are accepted.
Transport replies are also checked against the current connection, and pending
client operations are invalidated by disconnect/seat cleanup. Private panels are
hidden during offline/recovery until the server restores current permissions.

## Browser and mobile evidence

The new lifecycle script uses real UI controls, production random dealing, and
six separate sessionStorage contexts. It cancels a forfeit confirmation, confirms
one, observes the match continue with a departed public seat, and verifies that
the departed browser cannot rejoin the running match. Witch forfeits then reach
victory; the host opens the rematch lobby and former players join with new IDs.
All six refresh during the new private deal, retaining their new cards and keeping
them covered. Fresh acknowledgements start Day. No game bot is installed: the
external test driver coordinates the six authorized owner views for QA.

The lifecycle run also verifies card/target selection and keyboard focus survive
an unrelated chat update, layouts fit 320/390/768/1440px, navigation links meet
44px height, and the Actions link scrolls clear of the sticky navigation. Offline
mode hides identity and hand DOM; recovery restores the same new match. Host abort
returns everyone to the lobby. No uncaught page errors were reported.

The Night regression additionally confirms an unsealed Constable target survives
another player's refresh. It still covers sealed Witch refresh, protection save,
death, dawn, Day 2/3 dealing, dead refresh, silence and cleanup. The Day regression
retains private payload inspection, reveal controls and victory coverage.

The mobile screenshot `test-results/m5-mobile-actions.png` was visually inspected.
Actions precede the private inspector, acknowledged covered Seals are compact,
long hands use a scrollable two-column grid, inputs use 16px mobile text, and
section navigation includes touch targets. Screenshots are ignored artifacts.
Automated focus checks and reduced-motion contexts are limited coverage, not a
claim of complete accessibility testing.

## Failures resolved during development

The first sandboxed test attempt failed before loading tests because Windows
denied Vitest temporary-file renames. The approved non-sandbox run worked. Two
old assertions then needed intentional contract updates: public `abandoned` and
rejection of cached private requests after leave. A reconnect test initially
mistook a stale pre-resume broadcast for the next disconnect; its harness now
drains resume state before advancing the fake clock. All 110 tests then passed.
No unresolved application build/typecheck/test failure remains.

## Review limits and next acceptance work

No physical-phone or six-human social playtest was performed. Safari/iOS,
Android Chrome, Firefox, screen readers, real background behavior, slow networks,
wide-area hosting and load testing remain unverified. Rematch/forfeit behavior
needs human balance review: a voluntary Witch forfeit can end a match, as dictated
by the chosen public-death/victory rules. No bots substitute for departed humans.

Rooms/history remain process-memory state and disappear on server restart. No
return to a forfeited seat is allowed during its match, even for a genuine outage
beyond grace. Finished-game departures do not expose surviving hidden cards.
Human acceptance and broader compatibility checks should precede optional M6
roles, transfer events or voice. Keep untested player-count variants disabled.

To review locally: run `npm run dev` in `D:\digit7\ashfall-council`, then open
http://localhost:5173 in six fresh tabs/profiles. Backend health is on port 3001.
See README.md for the manual flow and all three browser test commands.
