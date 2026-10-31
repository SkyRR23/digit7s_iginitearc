# Ashfall Council

Continuing on another PC/account? Start with [the latest library-PC handover](docs/SCHOOL_LIBRARY_HANDOFF.md).

An original folk-horror social deduction game in development for Digit7 Jam 2026.
**Playable vertical slice:** six to ten mixed human/server-bot seats, secure private Life cards, day turns,
18 action card types, seven-Doubt accusations, accuser-chosen ten-second Life reveals, deaths, and both victory checks.
Server-owned deadlines keep turns, reveals and Night moving. Secret Witch votes,
Constable protection, dawn deaths and the next day now complete the gameplay loop.
Forfeit rules, rematch lobbies, reconnect recovery and mobile controls are now
implemented. Easy and Normal rule-based bots use the same authoritative command
path as humans. Voice chat remains postponed. Optional atmospheric audio uses licensed local recordings with phase crossfades,
card effects and persistent independent volume controls. Physical-device and six-human playtests remain.

This separate workspace preserves the existing Broken Drum prototypes.

See [cinematic and Curse polish](docs/CINEMATIC_POLISH.md) for the glass Life chooser, new artwork, Help quantities and single-Curse lifecycle.

## New players

Open **How to play → Interactive tutorial** from the main menu for an optional guided practice with five bots. Learn private roles/Life cards, Evidence and seven Doubt, choosing a Life to reveal, saving or playing your hand, End turn, Draw 2, and Night/Dawn. There is no reading timer. Training options offer hints, restart and exit.

After completion, **Replay tutorial** is always available in the same handbook. **Continue playing** discards training and creates a fresh normal match with five Easy bots, random roles/Life cards and normal timers. Complete the normal private-card acknowledgement before playing. **Return to main menu** leaves without creating a room.

The handbook also opens the existing eight-step **Game guide** and **Cards & roles** reference. In-game **?** opens the guide directly. Optional **Beginner assistance** adds small turn reminders in normal matches; disable it from **Audio settings** or the reminder’s × button. Tutorial completion and this preference are saved locally; private training deals are not.

See [tutorial implementation and verification](TUTORIAL_IMPLEMENTATION_REPORT.md). Run `npx tsx tests/tutorial-browser.ts` for the isolated desktop/phone walkthrough.

See [latest action changes](docs/ACTION_UPDATES.md) for the 1/3/7 Doubt cards, reusable Curse, Eavesdrop and single-use Council Bell.

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
5. Each player first sees their full role portrait, with red Ashbound or gold
   non-Ashbound glow. Ashbound then see a separate private teammate screen.
   Continue to the Life-card screen, then **Reveal all Seals** privately. Labels are Villager (Human),
   Ashbound (Witch), and Lanternkeeper (Constable). The private summary tracks
   allegiance and ability independently. Living Ashbound players know their living
   allies, but cannot see allies' Seals. Public seats show only face-down slots.
6. Before confirming, tap two Seals to swap their positions, drag them, or choose
   **Shuffle positions**. Ashbound also choose a player for the opening Black Cat
   and select **Seal opening curse** before confirming. Choices are private;
   most votes determines the single cursed player, with earliest seat breaking a
   tie. An Ashbound may choose themselves to disguise their allegiance.
   Choose **Confirm & continue** in every tab. This locks
   the order, covers the private display,
   and shares only acknowledgement status. The final acknowledgement begins
   **Day**, deals three action cards each, publicly places the Black Cat, and
   starts the cursed player's turn.
   **Cover all Seals**, closing the overlay, tab blur, and disconnection
   also cover the display. Covering is a shoulder-surfing aid, not encryption from
   the owner: the owner's authorized private data is already in their browser.
7. On your turn, **Draw 2** to draw and end, or select one or several cards of the
   same kind. Tap a highlighted living player (two different other players for Scapegoat),
   review the short effect preview, and confirm. Council Bell opens the only council vote. Conspiracy resolves automatically when drawn and never stays in a hand. Cancel removes the selection without playing. There is no
   repeated Play button. Playing does not end the turn; choose **End turn** when
   done. A batch stops safely if an earlier card makes the target invalid, and
   unplayed cards stay in your hand.

   Evidence adds one Doubt, Testimony adds three, Witness fills the row, Alibi and Mercy cleanse,
   Stocks binds, Asylum protects at night, Piety blocks Evidence/Witness, Curse
   removes protection or Black Cat, Scapegoat transfers all Doubt and attached
   effects, Vow gives one Heart that links with other holders, Whisper
   privately inspects one hidden Life card, Hearthward blocks Whisper, and Cinder
   Shift and Conspiracy move hidden Life cards. Conspiracy first reveals a random
   hidden Life card on the Black Cat holder. Scapegoat moves this curse; Curse
   removes it for the rest of the match. Server-controlled random choices
   never expose hidden card identities in public updates. Playable cards return to
   the discard pile after resolving; only portrait effects and red X marks persist.

   At seven Doubt, the server randomly reveals one unrevealed Life card, then
   clears the accumulation. Its close-up announces the owner, shows the full Life
   portrait, and highlights the exact numbered position in the five-card row.
   Scenes last 6–8 seconds. **Keep open** pauses a scene for reading; **Next**
   advances it and **Back to table** finishes your presentation. Gameplay, bots
   and phase timers pause until all readers finish (with an absence safety limit).
   The corner **?** opens role portraits, all 14 cards and their interactions,
   and an eight-step illustrated how-to-play guide. Green name tags identify
   the card actor and recipients. No blank accusation slots are drawn.
   An Ashbound reveal or exhausting a player's hidden Seals kills them, publicly
   reveals their remaining Seals/history, and removes their hand/private access.
   All Ashbound Seals revealed means village victory; only Ashbound living means
   Ashbound victory. The former takes precedence if both become true together.

   The 83-card deck is now focused on pressure: **38 Evidence and 6 Witness**.
   Utility counts are lower, including 6 Whisper, 3 Hearthward, and 2 Cinder Shift.
   The revised composition applies to new matches.
8. Turns have 60-second server deadlines: an idle turn draws and ends; a turn
   that played cards simply ends. The seventh X opens the ten-second accuser choice. An empty action deck reaches Night after the victory check.
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
   **End match** opens an in-game confirmation. Confirming ends the shared match, returns the other players to the room lobby, and takes the host back to the main menu. **Leave** also uses an in-game confirmation; leaving an active match forfeits the seat.
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
- Phones use Table, You and Chat navigation. Your hand stays docked below the
  Table in a horizontal card row. Select a card, then choose a highlighted player;
  every play still needs confirmation. You contains
  private Life access, role information and powers. Menu contains the room code,
  leave/host controls, sound, motion and Help. The phase and timer stay visible. Hidden chat has an unread badge and a brief, nonblocking public-message preview; historical reconnect snapshots do not create old-message popups.
  The existing gothic artwork, typography and effects are shared with desktop.
  Unsealed Night drafts survive roster updates
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

## Soundscape

Interact once with the page to enable browser audio. Use **Sound: On/Off** for mute or **Audio settings** for Master, Music, Ambience and Sound Effects. Audio suspends in background tabs. No microphone access is used.

Main-menu music: [Phoenix (2026) by Scott Buckley](https://www.scottbuckley.com.au/library/phoenix-2026/), released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribution: “Phoenix (2026) by Scott Buckley — released under CC-BY 4.0. www.scottbuckley.com.au”. Modified with loudness adjustment, resampling, Ogg/MP3 encoding and a two-second circular loop crossfade. Preserve this attribution with the game and in video descriptions.

Continuous lobby music: [Medieval: The Old Tower Inn by RandomMind](https://opengameart.org/content/medieval-the-old-tower-inn). Continuous Day music: [Town in ruins loop by Brandon Morris](https://opengameart.org/content/town-in-ruins-loop). Continuous Night music: [Fantasy: Rising Moon by RandomMind](https://opengameart.org/content/fantasy-rising-moon). Short results: [Medieval: Victory Theme](https://opengameart.org/content/medieval-victory-theme) and [Medieval: Defeat Theme](https://opengameart.org/content/medieval-defeat-theme), RandomMind. These use CC0 1.0; Town offers CC0 as one of its alternative licences. Background tracks have normalized levels and edited loop seams; result tracks are trimmed/faded.

Card/wood foley: [Kenney Casino Audio](https://kenney.nl/assets/casino-audio), [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds), [Brian MacIntosh (BMacZero) playing cards](https://opengameart.org/content/playing-card-sounds), [yd page flip](https://opengameart.org/content/old-pagesflip-with-sound) and [laleksic wood creak](https://opengameart.org/content/various-sound-effects), CC0. Some supernatural accents reverse a recorded shuffle and apply playback filters/rate changes. Environments/bell: Joseph SARDIN / BigSoundBank, [Fireplace #2](https://bigsoundbank.com/fireplace-2-s0031.html), [Evening Birds](https://bigsoundbank.com/evening-birds-s1859.html), [Campaign at Night #4](https://bigsoundbank.com/campaign-at-night-4-s1880.html), [Church Bell](https://bigsoundbank.com/church-bell-s0135.html), CC0.

Open **Credits** from the main menu, the header/mobile **Menu**, or the game guide. The new tab provides required attribution, optional CC0 acknowledgements, original source/licence links, filenames, modifications, a copy-credits button and packaged software/project notices. Audio settings also links to optional, non-preloading recording previews. Imported music is not composed by our team.

The continuous three-sine soundtrack and filtered-noise environment are retired. The previous sample-free implementation is preserved in [docs/audio-history](docs/audio-history/). Long local tracks use browser-managed streaming; short effects load asynchronously into a bounded cache. Missing files become silence and never block gameplay. No external audio streaming service is required.

See [audio implementation](AUDIO_IMPLEMENTATION_REPORT.md), [every filename and modification](AUDIO_ASSET_CREDITS.csv), and [licence/source evidence](AUDIO_LICENSES.md). Run `node tests/audio-browser.mjs` for lifecycle, codec/failure, crossfade and synchronization checks. Automated playback is not proof of subjective audio quality; real-device listening remains necessary. Run `npx tsx tests/audio-match-browser.ts` for a six-seat complete match with two browser mixers, or `node tests/audio-ui.mjs` for production Credits/settings checks.

Run `npx tsx tests/mobile-layout-browser.ts` for six/ten-player mobile layout,
touch gestures, card confirmation, private opening, chat, rotation, reconnect and
Night checks in an isolated QA server. Screenshots go to `test-results/mobile-layout/`.


### Event effects and stacked cards

The opening Curse event effect publicly names the cursed player before the Day 1 announcement. It uses the existing synchronized presentation pause, Keep open/Next/Back to table controls and reduced-motion preference. Secret voters, roles and Life identities remain private.

Tap a repeatable card stack once to select one card, twice for two, three times for three, up to the available count. The badge shows selected/available. Use −/+ for adjustments or tap the count to open “How many cards?”. Choose a quantity or Use all, then choose a target and confirm the combined effect. Non-repeatable cards retain their existing one-at-a-time rule. Selecting a quantity spends no cards; a turn/state change cancels an outdated picker.

`npx tsx tests/game-interactions-browser.ts` checks the public opening event, synchronized pause, phone/desktop quantities and exact two-card play, cancellation, live updates during confirmation, and both Leave and End match returning to the main menu without browser confirmation prompts. Evidence is written to `test-results/game-interactions/`.

### Event visuals and sound

Event effects pair finite glow, particles and route accents with recorded audio at shared animation milestones. Public Life reveals have separate announcement, portrait and position accents. Skip/hold cleans up event sounds; reconnects do not replay consumed cues. Failed actions use a different treatment from successful protection, and each visible Doubt mark has one stamp. Alibi/Mercy stay at table level. The existing continuous background music is preserved. The result scene reserves space for portrait, text and controls on mobile and landscape.

Run `npx tsx tests/event-effects-browser.ts` for event lifecycle, recorded playback, public-only cue mapping and result-layout checks at desktop/phone sizes. Per-file credits/triggers remain in AUDIO_ASSET_CREDITS.csv; additional lock/resonance edits are by laleksic, CC0, from the already credited Various sound effects pack. Automated playback is not a human listening assessment.

Tonal glow/reveal accents use [Magic spell SFX by JaggedStone](https://opengameart.org/content/magic-spell-sfx), CC0, edited into local glow-rise/glow-reveal Ogg/MP3 pairs. These supplement physical card sounds at the existing authorized animation milestones. “Resume the Hunt” and the evil verdict retain the earlier red styling. All source filenames, modifications and playback triggers are in the audio inventory and report.

Card event backgrounds now follow the card artwork palette: Evidence white, Testimony/Witness red, spell cards purple, Asylum blue, Piety/Scapegoat gold and other card-specific accents. The hunt/evil-verdict scenes stay red. This colour change preserves the existing animations, timing and card rules.

Event sound moods use warm shimmer for helpful protection, lower dark swells for harmful/ominous public effects, and mysterious tones for investigation/transfer effects. Reveal announcements stay neutral until the public portrait. Hidden roles, peek contents, ownership changes and Night votes never determine a public sound. These short accents preserve the continuing BGM.
