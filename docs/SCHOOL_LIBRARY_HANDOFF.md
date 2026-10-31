# Digit7 / Ashfall Council — library PC handover

Prepared **31 October 2026**. Read this first when continuing on another PC or account. This is a continuation of an existing game, not a request to rebuild it.

## Repository and startup

- Repository: https://github.com/SkyRR23/digit7s_iginitearc
- Development branch: `main`.
- This PC: `D:\digit7\ashfall-council`. Use whatever clone path is available on the library PC.
- Requires Node.js **22.12+** and npm. Private repository access requires an authorized GitHub account.

```powershell
git clone https://github.com/SkyRR23/digit7s_iginitearc.git
cd digit7s_iginitearc
npm.cmd ci
npm.cmd run play
```

For an existing clone, first check `git status` and the branch; preserve uncommitted work and local configuration before fetching and using `git pull --ff-only origin main`. Never reset or clean a shared checkout just to synchronize it.

Client: http://localhost:5173. Server health: http://127.0.0.1:3001/health. Keep the development terminal running. `npm.cmd run doctor` checks local services. On non-Windows systems use `npm` instead of `npm.cmd`.

## Latest decisions — especially important

**The Myanmar-inspired theme is exploratory only.** The owner explicitly said it was not confirmed. A concept sheet used the provisional title *The Last Lantern*, village buildings, Assembly Gong, Warding Charm, Shadow Pact, and Pactbound. None of these names or theme changes is approved for implementation. The concept image was generated in chat and is not a production asset in this repository. Continue the current Ashfall Council / Digit7 code and dark gothic visual direction unless the owner explicitly decides otherwise.

Roles and Life cards remain separate. Private role art and abilities must not leak to opponents. Current displayed names include **Outcast** for the neutral `SCAPEGOAT` role, and **Good / Evil** for `HUMAN / WITCH` Life cards. The separate **Scapegoat action card** keeps its name. Internal identifiers are deliberately unchanged. Do not rename identifiers simply to match display text.

Do not implement new features merely because older documents mention concepts. Ask the owner for their next task after reading the handover.

## Completed gameplay and presentation

- Working 6–10 player human/bot multiplayer: private opening roles and Life cards, Day turns, Night actions, Dawn, deaths, victory, reconnect and rematch. Server owns rules, deadlines, commands and privacy.
- Digital village UI, illustrated playable cards, role symbols/chibi art, card explanations on hover/focus/touch, drag or tap targeting, and confirmation before spending targeted cards.
- Doubt appears as animated red X marks only when present; no empty placeholder boxes. Evidence adds 1, Testimony adds 3, Witness raises Doubt to 7.
- At seven Doubt, the accuser chooses a valid hidden Life position during an authoritative ten-second decision. Timeout selects the first remaining hidden position. The chosen slot is the one revealed. Revealing a Life is not always an elimination.
- Life selection uses a **full-screen glass scene**, blurred live background, crimson aura, shared ink effects, illustrated anonymous backs, hover lighting, staggered entrance and a selection flip. Avoid reverting it to a boxed question-mark modal.
- Synchronized close-ups pause normal actions, bots and timers. Early finishers see neutral waiting feedback. Private actions never disclose private role/target information to other readers. Preserve reconnect and absent-reader safeguards.
- Continuing Day play after a Life reveal uses **RESUME THE HUNT**. True Day transitions, Night, another pending accusation and Game Over have separate conditions. No duplicate Day message after an ordinary reveal.
- Testimony and Vow of Hearts are the visual benchmarks. Bell, Curse, Council voting, Life reveals and victory use the established ink/aura presentation. Preserve existing effects and reduced-motion behavior.
- Latest shared durations are in `packages/shared/src/presentation.ts`: card 4s; power, Life reveal, death, phase and victory 5s; position/verdict 3.5s; resume 2s. Older docs describe longer timings and are historical. Server and client must use the same presentation plan.
- Same-kind cards by the same actor against the same targets are grouped into one counted close-up. A single Evidence has no close-up.
- **Exactly one Curse physical card**: opening attachment removes the existing deck instance, rather than minting a second ID. Active Curse cannot also be drawn. Dispel returns that same instance to the draw pile; Scapegoat transfers it; death discards it; normal recycling preserves it. Historical hand-return wording is obsolete.
- Dispel feedback identifies the removed effect. Stocks/chains, Hearts links and protection appear around player portraits rather than persistent cards in front of seats.
- Conspiracy resolves immediately when drawn, reveals on the Curse holder and then shifts hidden Lives under existing victory/survivor rules. It is excluded from opening hands.
- A revealed Lanternkeeper loses night protection and leaves its holder alive unless another elimination rule applies.
- Eavesdrop is a playable card, not a new role. Its private timed hand snapshot must never be serialized to other clients.
- Council Bell is unique and permanently spent when played. Voting opens only through Bell; it has a separate deadline and strict-majority elimination. A winning Outcast verdict is terminal and cannot resume normal timers after presentations/reconnect.
- Help displays initial card quantities derived from active rules. Read configuration rather than hardcoding counts copied from documentation.

## Latest local work included with this handover

Procedural audio was pending when this handover started and is being committed with it:

- `apps/client/src/audio.ts`: one lazy Web Audio context per tab, music/ambience/SFX buses, scene crossfades and 20 event cues.
- Integrated with `main.ts`, `game-moments.ts`, `table-effects.ts`, `game-preferences.ts` and `style.css`.
- Independent Master/Music/Ambience/SFX sliders, mute persistence, first-interaction unlock and hidden-tab suspension. No microphone or voice chat, downloaded samples or generated audio recordings.
- Audio provenance/inventory: root `AUDIO_IMPLEMENTATION_REPORT.md`, `AUDIO_ASSET_CREDITS.csv`, `AUDIO_LICENSES.md`; AI declaration updated in `docs/AI_USE_DECLARATION_DRAFT.md`.
- `recap.md` is an older October 28 library-PC record retained for context. Its paths, commit and deferred-hosting statements are historical, not current instructions.

## Where to work and what to read

Read narrowly to avoid repeating completed work:

1. This file, then relevant README sections.
2. `docs/ACTION_UPDATES.md` for mechanics; `docs/CINEMATIC_POLISH.md` for visuals/Curse and later result/name updates. Exact current code supersedes historical timings and art filenames.
3. `docs/ARCHITECTURE.md` for privacy and transport; `docs/GAME_FEEL.md` / `docs/digital-ui-overhaul.md` only when needed for their area.
4. Audio report for audio changes; `docs/CPANEL_DEPLOYMENT.md` for production packaging; `docs/FINAL_SUBMISSION_AUDIT.md` and provenance/declaration files for submission questions.

Main entry points:

- Client composition: `apps/client/src/main.ts`.
- Cinematics: `game-moments.ts`, `moment-script.ts`, `life-reveal.ts`, `cinematic-upgrade.css`.
- Choices/voting/private hand inspection: `decision-ui.ts` and related CSS.
- Card data/Help: `card-info.ts`, `game-guide.ts`; production art under `apps/client/public/art/`.
- Rules: `packages/shared/src/day*.ts`, `night*.ts`, `curse.ts`, `deck-config.ts`, `presentation.ts`, identity modules.
- Server integration: `apps/server/src/rooms.ts`, `day-runtime.ts`, bots and serializers.

## Production and limitations

Later work prepared same-origin Node/Passenger cPanel packaging and runtime-only assets. Pre-handover HEAD was `f96a0f0` (shared runtime dependency packaging fix). Do not treat the older recap's 'no hosting added' statement as current. Follow the deployment documentation and current scripts if packaging is requested.

**This GitHub source push does not upload or restart the hosted game and does not rebuild a release ZIP.** Existing release artifacts can predate audio. Deployment docs also retain historical package hashes and previously observed hosting/HTTPS concerns; recheck live state before claiming it is current. No hosting action is authorized by this handover alone.

Rooms remain in memory, voice chat is postponed, and physical-device/multi-human listening/playtests remain. The deployment audit records an existing dependency advisory and unresolved submission/provenance review; this handover does not certify those resolved. Avoid unrequested upgrades or changes to gameplay.

## Verification for this handover

Rechecked on 31 October 2026:

- `npm.cmd test`: **202 tests passed across 23 files**.
- `npm.cmd run build`: passed (server TypeScript plus client TypeScript/Vite). Vite reports unresolved-at-build CSS references for meeting-hall, villagers and digital-village art; these source assets are tracked. This is not a fresh full asset/deployment audit.
- `node tests/audio-browser.mjs`: passed lifecycle, autoplay unlock, deduplication, persistence and independent-context checks in headless Edge.
- `node tests/audio-ui.mjs`: passed built-client settings/mute/room-start checks at desktop and phone widths, no page errors.

Previous cinematic and six/ten-player full-flow checks are recorded in the relevant docs; they were not rerun as part of this documentation/audio push. `test-results/` is ignored and screenshots do not transfer through GitHub. Browser scripts currently use installed Edge; another PC may need an appropriate Playwright browser setup. `node_modules/`, build/release output, `.env` secrets and the local `version 0.2.0.zip` backup are excluded from this push.

## Suggested opening message on the next account

> Continue the existing Digit7 / Ashfall Council repository on main. Read docs/SCHOOL_LIBRARY_HANDOFF.md first, inspect git status and the relevant code, and wait for my next specific change. Preserve current mechanics, private information, multiplayer and cinematic effects. The Myanmar theme and The Last Lantern title were exploration only, not an approved redesign. Avoid rebuilding or re-auditing unrelated completed systems.

The final commit hash is intentionally not embedded in this file (it is part of that commit). Use `git log -1 --oneline` and compare `HEAD` with `origin/main` to verify the transferred version. On a shared PC, sign out of GitHub/Codex and avoid leaving credentials behind when finished.
