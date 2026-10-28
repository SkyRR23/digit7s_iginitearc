# Ashfall Council

An original folk-horror social deduction game in development for Digit7 Jam 2026.
**Playable vertical slice:** six to ten mixed human/server-bot seats, secure private Life cards, day turns,
14 playable action cards, seven-Doubt accusations, random server-chosen reveals, deaths, and both victory checks.
Server-owned deadlines keep turns, reveals and Night moving. Secret Witch votes,
Constable protection, dawn deaths and the next day now complete the gameplay loop.
Forfeit rules, rematch lobbies, reconnect recovery and mobile controls are now
implemented. Easy and Normal rule-based bots use the same authoritative command
path as humans. Provider-neutral voice permissions are defined, while audio remains
optional and unconfigured. Physical-device and six-human playtests remain.

This separate workspace preserves the existing Broken Drum prototypes.

## Run locally

Node.js 22.12+ and npm. Tested with Node 24.18.0 / npm 11.16.0.

```powershell
cd D:\digit7\ashfall-council
npm install
npm run play
```

- Client: http://localhost:5173 (fixed port; fails clearly if occupied).
- Socket.IO server/health: http://127.0.0.1:3001/health.
- Vite proxies `/socket.io` and `/health` to the server; browsers use one origin.
- Keep the `npm run play` terminal open while testing. A browser tab can keep its
  last rendered page after the processes stop, but room actions require port 3001.
- Run `npm run doctor` in another terminal to check both local services.
- Stop all three development processes with Ctrl+C. The shared package watcher,
  server watcher, and client hot reload run together. Changes to shared code may
  require a server restart if its dependency watcher does not reload the build.

## Play with bots

1. Create a gathering in one browser tab.
2. In the lobby, choose **Easy** or **Normal**, then select **Fill Empty Seats**.
   You can also add or remove individual bot seats. Bots are labeled **BOT** and
   ready automatically.
3. Select **I'm ready**, then **Deal the Life cards**. Inspect and acknowledge your
   private Seals. Bots acknowledge and take their turns on the server.
4. Play your own Day, reveal, and Night choices normally. Bots act after a short
   delay and may post occasional rate-limited council messages.
5. At game over, the host can open the rematch lobby. Bot seats remain ready;
   the human readies again and starts a fresh shuffled match.

Bots never receive raw room state: their policy sees the same public projection,
their own private cards, and authorized Witch-team IDs that a human in that seat
would receive. A disconnected human retains the normal reconnect/forfeit flow and
is never silently replaced by a bot.

## Test with humans / browser sessions

1. Open **6–10 fresh tabs** at http://localhost:5173, or isolated browser profiles.
   Fresh tabs have separate `sessionStorage`; duplicating an already joined tab
   can copy its credentials and deliberately transfers that same seat. Open a
   fresh tab by typing the URL to create a different person.
2. Enter a name and sigil in tab 1, choose 6–10 seats, then **Create a gathering**.
3. Copy the eight-character room code. In the remaining tabs, choose distinct
   names, enter the code, and **Join**. All selected seats must appear in every tab.
4. Send a message. Everyone in that room should see it. Try **I'm ready** in each
   tab. The host's deal button becomes available only when every seat is ready and
   connected. The server deals five Life cards per player; more than one Witch card
   may land on one person.
5. In each tab, tap your face-down Seals, then **Reveal all Seals** privately. Labels are Villager (Human),
   Ashbound (Witch), and Lanternkeeper (Constable). The private summary tracks
   allegiance and ability independently. Living Ashbound players know their living
   allies, but cannot see allies' Seals. Public seats show only face-down slots.
6. Before confirming, tap two Seals to swap their positions, drag them, or choose
   **Shuffle positions**. Choose **Confirm & continue** in every tab. This locks
   the order, covers the private display,
   and shares only acknowledgement status. The final acknowledgement begins
   **Day**, deals three action cards each, and starts the first seat's turn.
   **Cover all Seals**, closing the overlay, tab blur, and disconnection
   also cover the display. Covering is a shoulder-surfing aid, not encryption from
   the owner: the owner's authorized private data is already in their browser.
7. On your turn, **Draw 2** to draw and end, or select one or several cards of the
   same kind. Tap a highlighted living player (two for Scapegoat or Vow of Hearts),
   review the short effect preview, and confirm. Conspiracy affects everyone and
   needs no target. Cancel removes the selection without playing. There is no
   repeated Play button. Playing does not end the turn; choose **End turn** when
   done. A batch stops safely if an earlier card makes the target invalid, and
   unplayed cards stay in your hand.

   Evidence adds two Doubt, Witness fills the row, Alibi and Mercy cleanse,
   Stocks binds, Asylum protects at night, Piety blocks Evidence/Witness, Curse
   breaks protection, Scapegoat transfers Doubt, Vow links two players, Whisper
   privately inspects one hidden Life card, Hearthward blocks Whisper, and Cinder
   Shift and Conspiracy move hidden Life cards. Server-controlled random choices
   never expose hidden card identities in public updates. Playable cards return to
   the discard pile after resolving; only portrait effects and red X marks persist.

   At seven Doubt, the server randomly reveals one unrevealed Life card, then
   clears all seven X marks. No blank accusation slots are drawn.
   An Ashbound reveal or exhausting a player's hidden Seals kills them, publicly
   reveals their remaining Seals/history, and removes their hand/private access.
   All Ashbound Seals revealed means village victory; only Ashbound living means
   Ashbound victory. The former takes precedence if both become true together.
8. Turns have 60-second server deadlines: an idle turn draws and ends; a turn
   that played cards simply ends. The seventh X causes an immediate server-chosen
   reveal. An empty action deck reaches Night after the victory check.
9. Night lasts **45 seconds**, with public chat silenced. Living Ashbound players
   secretly choose an attack target outside their team (or abstain). Most votes
   wins; ties use the earliest target in seat order. The living Lanternkeeper
   secretly protects another living player (or abstains), never themselves.
   A Witch+Constable gets both controls. **Seal attack vote / Seal protection**
   is final for that night. No one sees other players' choices or submission progress.
10. The server resolves at the deadline, even when everyone has submitted.
    Missing choices abstain. Protection blocks an attack on the same target;
    otherwise that target dies. Dawn reports only who died or that no one died.
    After five seconds, if no side has won, only the discard pile is securely
    shuffled into a new draw pile. Survivors keep their exact unused hands;
    no new hands are dealt. A smaller discard pile makes the next day shorter.
    Doubt persists. The queued next living player starts the new day.
11. Refresh a tab: the same Seals, hand, turn, pending reveal, sealed night choices and privileges
   return, initially covered. A disconnect reserves the seat for 60 seconds.
   Deadlines continue while offline. After Day starts, expiry or confirmed leaving
   forfeits the seat: a living player dies and reveals their remaining Seals;
   everyone else continues. The departed seat remains public until the next lobby
   and cannot rejoin this match. Before Day, a departure cancels the private deal
   without reveals. Hosting passes immediately when the host disconnects.
12. At game over the host chooses **Open rematch lobby**. Departed seats clear,
   remaining members keep the room code and credentials, and everyone must ready
   again. Invite replacements to bring the lobby back to six. During a match,
   **End match & reopen** remains a confirmed host abort.
   Starting again creates new random cards and a new match ID. Allegiance persists
   within a deal, never across an explicitly ended deal. A second room is isolated.

For phones on the same Wi-Fi, open **http://YOUR-PC-LAN-IP:5173** in each browser,
using the same room code. The dev client binds `0.0.0.0`; the room server stays on
loopback behind the Vite proxy. Allow TCP 5173 in your local firewall if necessary.
`localhost` on a phone points to the phone. LAN HTTP clipboard access may be
unavailable; the Copy button then displays the code for manual copying. Action
IDs use `crypto.getRandomValues`, which works on a plain-HTTP LAN origin.

## Automated checks

```powershell
npm test
npm run typecheck
npm run build
# Keep npm run play running in another terminal:
npm run test:browser
npm run test:browser:transfer
npm run test:browser:bots
npm run test:browser:night
npm run test:browser:lifecycle
npm run simulate:bots
node tests/cards-browser.mjs
```

The browser scripts use installed Microsoft Edge and isolated contexts,
including touch-sized viewports; screenshots go to ignored `test-results/`. The
bot browser script drives one mobile human against five server bots through a
complete match and rematch. The simulation command runs 100 seeded six-bot games
without real-time delays. The Night script runs two real 45-second deadlines (allow about two minutes). Set
`BROWSER_CHANNEL=chrome` to use installed Chrome, or `TEST_URL` for another dev
address. It does not install a browser. Vitest integration tests start real
Socket.IO listeners on ephemeral loopback ports. A restrictive execution sandbox
may need permission for loopback connections. There is no separate lint command;
strict TypeScript and unused-symbol checks are configured.

## Scope and limits

- Six through ten players are supported by the room capacity selector. The local
  player stays at bottom centre; compact phone and desktop tables scale the Life
  rows and reserve space for seven X marks.
- Rooms live in one process's memory. Server restarts erase rooms and expire
  reconnect credentials. This is not persistent or horizontally scaled hosting.
- No accounts or public matchmaking. Eight-character room codes are admission
  secrets; reconnect tokens are separate 256-bit bearer credentials, hashed on
  the server and stored per browser tab. Production requires HTTPS.
- Unseated connections receive no room state. Spectator joining is not offered.
- Request size, per-socket rate, connected-client, room, receipt, and chat-history
  bounds are present. Deployment still needs edge/IP abuse controls and a room
  lifecycle/storage strategy; this is a local prototype, not a hardened public service.
- Coverage includes rule/socket/recovery tests and isolated Edge browser clients:
  private dealing/hands, turn validation, reveals, deaths, both victory conditions,
  deadlines, duplicate/late packets, and recovery. See [verification](docs/VERIFICATION.md).
  Night privacy, protection, missing choices, dawn and repeated days are covered.
- Bot coverage includes restricted observations, legal action enumeration, seeded
  decisions, mixed and all-bot matches, privacy, Night choices, stale timer cleanup,
  reconnects, full browser play and bot-preserving rematches. Easy and Normal are
  implemented; Hard is intentionally absent. Simulation results are recorded in
  [verification](docs/VERIFICATION.md) and are engineering evidence, not a balance claim.
- Rematch coverage includes replacement admission, fresh cards/IDs, revoked old
  credentials and refresh during the new deal. Human playtesting, broader platform
  checks, configured voice-provider testing and physical-device testing remain.
- Leaving or exceeding reconnect grace forfeits your seat after Day starts.
  There is no replacement or return to a forfeited seat during that match.
  Dead players can read
  public chat but cannot send until game over. Surviving hidden Seals remain private
  even at game over; there is no automatic all-player role disclosure.
- Mobile section links jump to actions, Seals, table and chat. Covered identities
  are compact after acknowledgement. Unsealed Night drafts survive roster updates
  but are not saved across refresh; sealed choices recover from the server.
  Private panels are hidden while reconnecting. Confirmations guard voluntary
  forfeits and host aborts; rematches always require fresh readiness.
- Identity history is in-memory match state and survives client refresh/reconnect.
  Server restarts still erase it. The browser stores only its reconnect credential;
  no identity cards are saved to browser storage or written to production logs.
- HTML/CSS/SVG are sufficient for this milestone. Phaser can be introduced for
  board effects later; no runtime or asset API is needed for the current art.

See [architecture](docs/ARCHITECTURE.md), [rules provenance](docs/RULES_REFERENCE_VS_ORIGINAL.md),
[build plan](docs/BUILD_PLAN.md), [voice design](docs/VOICE_PHASE2.md), and
[server-controlled bot design](docs/TESTING_BOTS.md).
