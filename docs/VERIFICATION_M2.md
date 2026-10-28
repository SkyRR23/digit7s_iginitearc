# Milestone 2 verification

Historical milestone record. See VERIFICATION.md for the current M3 results.

Executed October 15, 2026 on Windows, Node 24.18.0, npm 11.16.0, Vitest 4.1.12.
Existing dependencies were used; no new package installation was needed.
The prior milestone's record is preserved in VERIFICATION_M1.md.

## Commands and actual results

- `npm run build`: passed shared, server, and Vite client production builds.
  Client output: 114.30 kB JS (32.81 kB gzip), 12.71 kB CSS (3.67 kB gzip).
- `npm run typecheck`: passed strict client/server TypeScript and shared build.
- `npm test`: **38 passing tests in four files**: four contract checks, thirteen
  lobby socket tests, thirteen pure identity tests, and eight private-deal socket
  tests. Local socket access ran with the approved network-enabled command.
- `npm run dev`: successfully served Vite on 5173 and Node/Socket.IO on 3001.
- `npm run test:browser`: passed in six independent headless Edge contexts using
  actual UI input and real WebSocket frames. Screenshots are in ignored
  `test-results/`. Desktop and 390px private inspection were visually inspected.

## Rules and networking evidence

Each of six owners receives five ordered cards, totaling 27 Human, two Witch,
and one Constable. The pure deal uses injected entropy; production supplies
Node crypto. Tests cover both separately named presets, varied deterministic
shuffles, malformed totals, invalid entropy/IDs, and unsupported seat counts.

Ownership-change fixtures remove all Witch cards from a former owner while
retaining historical allegiance. Constable authority moves with ownership and
ends on reveal or death fixtures. A single player can hold both Witch cards and
the Constable card. No playable transfer or death event was added.

Pure projections deny dead, unknown, and null viewers private data. Public output
is identical when only hidden kinds or allegiance flags change. Revealed-card
fixtures expose only those revealed kinds. Witch-private teammate lists include
only other living historically aligned players, without their card contents or
ability status. No spectator joining exists; an unseated network connection gets
no room state and cannot impersonate another viewer.

Socket tests inspect all received state events and acknowledgement views, not
just the final screen. Other owners' private card IDs, deck order and credentials
are absent. Tests cover actor spoofing, forged reconnect tokens, wrong match IDs,
concurrent and duplicate acknowledgements, duplicate starts, old-deal packets,
receipt replay after leave/reopen, grace expiry, refresh recovery, and two
simultaneous six-player deals. Retries never return a cached private snapshot.

## Browser evidence

Six isolated Edge contexts created/joined a room, readied, received the private
deal, inspected and covered their own Seals, acknowledged, reached DEAL_COMPLETE,
and reopened/left. Actual inbound WebSocket events and acknowledgement frames
were parsed in memory to verify owner-only card IDs, public slot shapes and the
exact composition across the six authorized owner views. Frames/credentials were
not printed or saved. Screenshots contain only synthetic test-player UI.

Covered private card text is absent from the DOM. Inspection displays the same
ordered kinds delivered to that owner. Acknowledgement covers the panel. Refresh
after dealing restores the same private state and acknowledgement, initially
covered. Explicit blur-handler dispatch removes private text. Earlier lobby
offline/reconnect coverage remains. Public and private layouts fit at 320, 390,
768 and 1440px; the 320px sigil target assertion remains. No uncaught page errors.

## Failures resolved during development

The first simultaneous-acknowledgement test let an older acknowledgement promise
overwrite a newer broadcast in its test helper. Helpers now apply the same
revision guard already present in the browser. All 38 tests then passed.

The first browser run expected switching between headless isolated contexts to
emit OS blur. That is not reliable in this environment. The test now explicitly
dispatches blur and verifies the real privacy handler, rather than claiming to
verify window-manager behavior. The full browser suite then passed.

## Remaining limits

No six-human playtest, physical phones, Safari/Firefox, wide-area internet,
public hosting, load test, or OS-level shoulder-surfing assessment was performed.
The test checks the blur event handler, not OS focus behavior on every platform.
Covering cannot revoke data already delivered to its authorized owner.

Historical allegiance persists for the current in-memory match across client
refresh/reconnect, not across server restarts or an explicitly ended deal.
Leaving/grace expiry aborts this M2 test deal without reveals; this policy must
be replaced by defined abandonment rules before full gameplay.

No day turns, actions, accusation/death resolution, win conditions, Night,
rematch gameplay, transfers, bots or voice are implemented. Dead/revealed and
ownership-change cases use pure fixtures. Constable ability is correctly derived
but cannot be activated until Night is implemented. Static checks use strict
TypeScript; no separate lint command is configured.

Development services were stopped after checks. Run `npm run dev` to review.
