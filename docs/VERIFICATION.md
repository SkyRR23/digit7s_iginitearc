# Current verification

## October 22, 2026 — 14-card expansion and 6–10 seats

- `npm test`: **122 passed across 14 files**. New domain and real-socket cases
  cover configured cards, seven-Doubt server-random reveals, Piety/Hearthward
  blocking, Bound and Mercy, Asylum at Night, Vow mirroring, Scapegoat transfer,
  atomic Conspiracy/Cinder Shift, private Whisper peeks, and batch discard rules.
- `npm run typecheck` and `npm run build`: passed strict shared/server/client
  checks; production client builds at 155.92 kB JavaScript (46.35 kB gzip) and
  119.27 kB CSS (24.73 kB gzip).
- `node tests/cards-browser.mjs`: passed one live phone UI play/cancel/confirm
  interaction, checked 6/7/8/9/10-seat phone tables, 6/10 desktop tables, and a
  ten-seat landscape phone table,
  verified five Life cards per seat, invisible unused X positions, no document
  overflow, and no page errors. Screenshots are in ignored `test-results/`.
- `npm run simulate:bots`: **100/100 completed**, zero stuck/crashed games and
  zero invalid bot actions. Human 11, Witch 89; balance still needs playtesting.
- Native in-app browser control was unavailable in this environment; the live
  layout check used the project's Playwright/Edge runner instead. Physical
  phones and ten human players are not yet verified.

The sections below retain historical milestone results; their former deck size,
six-seat limit and chosen-reveal behavior no longer describe the current build.

## October 21, 2026 — animated council table and retained hands

- `npm test`: 137 tests pass across 14 files. Added coverage for grouped plays,
  reveal interruption, duplicate/forged batch rejection, redundant Wards,
  private Seal arrangement and lock-in, and unchanged hands after Night/Dawn.
- `npm run typecheck`: passed strict shared/server/client checks.
- `npm run build`: passed all workspaces. Client output: 141.75 kB JavaScript
  (41.52 kB gzip), 103.17 kB CSS (21.50 kB gzip), plus the two generated artwork assets.
- Live browser checks used one player and five server bots at 360×640,
  1280×720, 1254×884 and 844×390. Match document dimensions stayed within the
  viewport. A fourteen-card landscape hand remained inside the viewport.
- Revealed all five private Seals together and swapped the first and last;
  the owner view returned the swapped card IDs in their new slots.
- Selected two action cards, tapped a player, observed two flight elements and
  both cards leave the hand. There was no separate Play button.
- A Cinder Shift played automatically after choosing its two slots.
- A seven-card selected group paused for a public Seal choice, left five unused
  cards selected, and resumed the same turn after the reveal.
- Recorded eight hand card IDs at Night and compared them after Dawn: exact
  order and IDs retained. A fallen bot displayed the large red X.

## Earlier server bot verification

Executed October 16, 2026 on Windows with Node 24.18.0, npm 11.16.0,
Vitest 4.1.12, Vite 7.3.7, installed Chrome and Microsoft Edge. Historical
milestone evidence is preserved in `VERIFICATION_M1.md` through
`VERIFICATION_M6.md`.

## Commands and results

- `npm test`: **130 passing tests in 14 files**.
- `npm run typecheck`: passed the shared build and strict server/client checks.
- `npm run build`: passed all workspaces. Production output is 128.64 kB
  JavaScript (37.10 kB gzip) and 16.59 kB CSS (4.56 kB gzip).
- `npm run test:browser:bots`: passed with one 390×844 browser client and five
  server bots; the human filled seats, removed/re-added a bot, played to a real
  winning screen, and opened a bot-preserving rematch lobby.
- `npm run simulate:bots`: completed **100/100** Normal six-bot games from seed
  20261016 with **0 stuck/crashed games and 0 rejected bot actions**. Results were
  Human 1, Witch 99; the longest game took 382 automated transitions.
- `npm run test:browser`: passed six isolated browser clients through lobby,
  private deal, Day actions, reveal, game over, refresh and responsive layouts.
- `npm run test:browser:transfer`: passed six clients through Cinder Shift with
  sticky allegiance, current ownership and observer privacy checks.
- `npm run test:browser:night`: passed two real 45-second deadlines, protection,
  death, two Dawns, Days 2/3, private choices and refresh.
- `npm run test:browser:lifecycle`: passed forfeit, reconnect, rematch,
  replacement admission, six refreshes, offline privacy and mobile navigation.

The pre-existing Edge runner was initially launched concurrently and Edge closed
its temporary profiles; the transfer runner also correctly refused to bind 5173
while the shared dev server owned it. The suites were rerun sequentially with
Chrome where applicable and all passed. The dedicated bot and transfer runners
also completed their own isolated Edge wording/output path. No separate lint
command exists; strict TypeScript includes unused-symbol checks.

## Bot authority and privacy evidence

Host-only lobby commands add, remove or fill Easy/Normal bot seats. Each bot has
a server-owned synthetic binding and sends a normal validated command through
`RoomStore.execute`; it cannot mutate a reducer directly. The bot policy accepts
only that seat's serialized `RoomView`. Tests assert another bot's private card
IDs do not appear in the human snapshot and that legal action enumeration lacks
raw identity kinds or self/forbidden targets.

Coverage includes deal acknowledgement, draws, card play, Cinder Shift, end turn,
chosen reveal, Witch voting, Constable protection/abstention, Witch+Constable dual
abilities, deaths, victory and rematch. Fixed seeds reproduce policy choices and
complete match traces. A stale delayed callback is discarded after host reopen.
Reconnect restores the human seat without changing the five bots, and leaving a
bot-only lobby lets the next joining human become host. Generic public bot lines
are rate-limited and cannot contain private card IDs or role disclosures.

## Limits and balance signal

The 99–1 Witch result is a strong signal that Normal policy and/or the current
Cinder Shift rules heavily favor Witch alignment in automated self-play. It does
not affect match completion correctness, but balance and policy tuning remain.
The bot strategy is intentionally simple; Hard difficulty, bot voice, LLMs and
external services are absent. Deals use secure randomness during normal play;
only test/simulation factories use seeded entropy.

Only the six-seat configuration is enabled. Physical phones, Safari/iOS, Android
Chrome, Firefox, screen readers, WAN hosting, load testing and six-human social
balance remain unverified. Rooms and bots are in process memory, so a server
restart loses the room. Bots are never substituted for disconnected humans.
