# Ashfall Council — current development recap

Updated: 31 October 2026
Repository: https://github.com/SkyRR23/digit7s_iginitearc
Local project: `D:\HeinLin\digit7s_iginitearc`
Branch prepared for delivery: `main`

This recap describes the current local source snapshot, including the mobile, audio, cinematic and tutorial work. The older 28 October recap is preserved in `docs/recaps/2026-10-28.md`; its card counts, timings and upload status describe that older version.

## Latest changes

### Optional tutorial and first-player experience

- Main menu **How to play** now opens **The council’s handbook**, with Interactive tutorial, Game guide, and Cards & roles. The in-game question mark still opens the guide directly.
- Added private, local training with one human and five practice bots using the actual shared game rules and authorized view projections.
- Training covers the private Villager role, five Life cards, Evidence, seven Doubt, choosing the actual Life position, continuing a turn after a reveal, saving cards, empty hands, End turn, fresh-turn Draw 2, Night, Dawn and victory conditions.
- Added compact objectives, gold highlights, timed hints, Show me (focus/scroll only), restart, exit and replay. Reading is untimed; normal match timers are unchanged.
- Completion is saved locally. Continue playing discards training and creates a fresh normal match with five Easy bots, random roles/Lives and the normal private acknowledgement flow.
- Optional persistent Beginner assistance provides small normal-match turn reminders. It can be disabled in Audio settings or dismissed from the reminder.
- See `TUTORIAL_IMPLEMENTATION_REPORT.md` for architecture, stages, privacy, tests and limitations.

### Mobile layout and usability

- Added Table / You / Chat navigation and kept the hand directly below the table instead of a separate Hand tab.
- Improved phone card browsing, tap selection, held drag targeting, rotation and compact controls while retaining the Gothic visual style.
- Added public chat unread badges and a brief, nonblocking message preview so hidden chat is easier to notice. Private information is not included.
- Repeatable card stacks support repeated taps, plus/minus controls and a quantity picker; confirmation sends exactly the selected cards.
- Leave and End match use styled in-game confirmation dialogs. Host End match returns the host to the menu and peers to the lobby.

### Recorded music, ambience and sound effects

- Replaced the procedural continuous soundtrack/noise beds with local, properly credited prerecorded music and environmental recordings.
- Menu, lobby, Day and Night have distinct continuous scenes. Ordinary game-state updates do not restart music; phase transitions crossfade. Victory and defeat use short conclusions.
- Added recorded card/paper handling, physical bell/wood/metal sounds and licensed tonal glow accents for good, bad and mysterious public events.
- Retained Master, Music, Ambience and SFX controls, mute, persistent preferences, autoplay handling, visibility handling, event deduplication, asynchronous loading, bounded memory and ducking.
- Added in-game Credits and local source/licence previews. Runtime audio is included in this archive in Ogg and MP3 formats; no external streaming service is required.
- Imported music/SFX are externally authored, not team-composed or generated AI music. Full filenames, creators, licences, sources and modifications are in `AUDIO_ASSET_CREDITS.csv`, `AUDIO_LICENSES.md`, `AUDIO_IMPLEMENTATION_REPORT.md` and `docs/audio-source-records.json`.
- Historical procedural audio documentation/source is preserved under `docs/audio-history/`.

### Cinematic event effects and fixes

- Added the public opening Curse close-up without exposing the secret voter.
- Connected finite visual/audio milestones to existing card/event presentations, including per-Doubt stamps, neutral reveal announcements, public Good/Evil portraits, position reveals and major events.
- Preserved privacy: unauthorized players do not receive secret-action cues. Skip, hold and reconnect avoid replaying consumed sounds.
- Fixed the Village Survives result overlap and reserved space for its portrait, text and controls on phone/landscape layouts.
- Restored the red Resume the Hunt / Evil still lurks treatment. Card close-up backgrounds use artwork-related accent colours, including white Evidence and red Testimony.
- Added cleanup of pending table effects when leaving/restarting, and a Paused label for untimed tutorial Life decisions.

## Verification available for this snapshot

Most recent completed checks:

- `npm test`: **215 tests passed in 25 files**.
- `npm run typecheck`: passed.
- `npm run build`: passed; existing runtime-copied artwork URLs produce the known Vite resolution warnings.
- Complete tutorial browser walkthrough: desktop **1280×720** and phone **360×640**, with desktop keyboard selection, native touch card selection and reduced motion.
- Tutorial checks include real-time hint escalation, non-playing Show me, restart/exit, saved-hand and empty-hand branches, actual selected Life reveal, Night/Dawn, completion, menu return, replay, fresh five-bot normal match, normal private acknowledgement, assistance persistence and direct in-game help.
- Production phone smoke test: gold handbook, role portrait, private Life inspection, training note and actual Day setup passed.
- Existing event audiovisual browser checks passed, including recorded playback, cue timing, cleanup, privacy and result layouts.
- Existing mobile browser checks passed for six and ten players, targeting, touch, chat, private views, rotation, reconnect and Night.
- Production Credits/audio-settings browser checks passed, including all four sliders, mute, assistance checkbox and missing audio responses.
- Earlier complete-match audio and lifecycle checks are detailed in `AUDIO_IMPLEMENTATION_REPORT.md`.

Automated playback is not a subjective listening audition. Physical phone testing, human usability/completion-time evaluation and final listening/balance review remain. Browser tests use local isolated servers and do not change the running user match.

## Using the source ZIP on another PC

Requirements: Node.js **22.12 or later**, npm, and a modern browser.

1. Extract the ZIP and open its `digit7s_iginitearc/` folder in a terminal.
2. Run `npm ci --include=dev` to install workspace dependencies, including TypeScript. This avoids the missing `tsc` error.
3. Run `npm run play` (equivalent to `npm run dev`). Keep the terminal open.
4. Open `http://localhost:5173/`.
5. Choose **How to play → Interactive tutorial** for the new-player experience.

If ports 5173 or 3001 are already in use, check whether the game is already running. Run `npm run doctor`; avoid launching a second copy on the same ports.

The archive includes source, package lockfile, artwork, edited runtime audio, credits, licence records, tests and documentation. It excludes `node_modules`, build output, Git metadata, environment secrets, test screenshots/results and release staging. Install/build after extraction. External original audio downloads and FFmpeg tooling are not needed to play the included runtime assets; they are only needed to regenerate edited recordings.

## Delivery and continuation

- Source ZIP: `AshfallCouncil-2026-10-31-source.zip`.
- This `recap.md` is included at the project root inside the ZIP and GitHub source.
- The archive is generated from the delivery commit. The final commit, ZIP SHA-256 and verified GitHub upload result are reported alongside the ZIP and in the delivery message.
- GitHub publishing was explicitly requested for this delivery; no hosted-site deployment is included.
- Preserve the existing Gothic design, current audio, card mechanics and private-information boundaries when continuing. The earlier exploratory Myanmar theme remains unapproved.
