# Historical Milestone 1 verification

This records the earlier lobby-only delivery. See VERIFICATION.md for current
Milestone 2 results; the limitations below describe the earlier implementation.

Executed October 15, 2026 on Windows, Node 24.18.0, npm 11.16.0.

## Commands and observed results

- `npm install`: the first sandbox attempt stalled; the bounded retry reported
  `ENOTFOUND registry.npmjs.org`. The approved network-enabled installation passed.
- `npm audit --json`: initially reported three test-toolchain vulnerabilities.
  Updated Vitest to the patched `^4.1.11` range (lockfile resolves 4.1.12).
  Final audit passed with **zero known vulnerabilities**.
- `npm test`: **17 tests passed**, across two files. Four pure contract tests and
  thirteen real Socket.IO integration tests. Sandbox-only WebSocket attempts
  failed; the network-enabled run passed, including after the Vitest update.
- `npm run typecheck`: passed strict TypeScript checks for server/client and the
  shared package build.
- `npm run build`: passed all three workspaces. Final client output is about
  110.11 kB JavaScript (31.28 kB gzip) and 10.74 kB CSS (3.27 kB gzip).
- `npm run dev`: launched shared watch, Node server on 3001, and Vite on 5173.
- `npm run test:browser`: passed twice; final run includes the 320px avatar
  touch-target check. Uses installed headless Microsoft Edge, six independent
  browser contexts, actual DOM interactions, and real Socket.IO connections.

## Verified behavior

Six browsers joined the same room, saw the same six seats, exchanged safely
rendered text, became ready, and saw host start/reopen transitions. The host
cannot start with unready/disconnected players. Refresh recovered the same seat
and readiness. Taking one browser offline and back online restored it. Leaving
returned to the entry form and released the seat in the other browsers.

Browser assertions cover no horizontal overflow at 320, 390, 768, and 1440px;
sigil touch targets at least 44px wide/high at 320px; chat HTML escaping; and no
uncaught page errors. Desktop entry/lobby and mobile entry/lobby screenshots
were generated in ignored `test-results/`. Desktop entry and mobile lobby were
visually inspected. The narrow picker was revised to two rows and tested again.

Integration tests additionally cover early/non-host start, full/locked rooms,
duplicate names, unknown rooms, rejected extra fields, per-recipient viewer IDs,
explicit public serialization without credentials, unseated clients denied
state/actions, independent rooms, duplicate create/chat, altered reuse of action
IDs, simultaneous stale actions, refresh with a new socket, duplicate-tab
takeover, deduplication across reconnect, forged tokens, disconnect grace expiry,
host migration, and membership loss reopening a sealed gathering.

## Not verified or not implemented

These were automated browser clients on one machine, not six human participants
or six physical devices. No physical iOS/Android, Safari, Firefox, wide-area
internet, external hosting, load test, or human playtest was performed. LAN
instructions are provided, but phone-to-PC access was not tested here.

No identities are dealt, so hidden-identity privacy and rules coverage remain
Milestone 2+. No turns, accusation resolution, death/victory, night abilities,
night timeouts, rematch, transfers, advanced roles, or voice is implemented or
claimed tested. All remaining required game-rule tests are listed in BUILD_PLAN.

There is no separate lint configuration; strict TypeScript is the static check.
Rooms and credentials disappear when the server restarts. Browser storage must
be available for refresh recovery; if unavailable, the UI reports the limitation.
The development services were stopped after verification; run `npm run dev`
to reopen the local preview.
