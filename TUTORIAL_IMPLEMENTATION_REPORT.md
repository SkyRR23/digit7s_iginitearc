# First-player experience and interactive tutorial

Implemented against the current local working tree. Existing music, event effects, credits, mobile hand dock and multiplayer changes are retained. No new media assets, licences or external services were added. Nothing was pushed or deployed.

## Access and navigation

The main menu’s **How to play** opens **The council’s handbook**. It offers a recommended interactive tutorial (labelled **Replay tutorial** after completion), the existing eight-step guide, and the existing Cards & Roles reference. Closing either reference returns to the handbook. The in-game question mark continues to open the guide directly. Credits remains available through the existing entry points.

Training is optional, with a 3–4 minute design target rather than an enforced or measured completion time. Begin opens the existing private role presentation immediately. There is no overall time limit. Normal gameplay is available without completing training.

## Architecture and isolation

- `apps/client/src/tutorial-session.ts`: isolated, in-memory practice state and five scripted bot participants. Imports the same pure identity, Day and Night engines used by the server. Uses their validation, public/private projections, real card IDs, chosen Life slot and presentation plan. It does not create a server training room, add protocol commands, expose a setup API, or change production rules.
- `apps/client/src/tutorial.ts`: `TutorialDirector`, handbook, objectives, progressive hints, highlights, completion/exit/restart and optional beginner assistance.
- `apps/client/src/tutorial.css`: existing Gothic colours/fonts, restrained gold highlights, bounded phone tracker and accessible dialogs.
- `apps/client/src/main.ts`: routes commands/presentation acknowledgements to the local session while training; otherwise keeps the existing socket transport. Treats local practice as usable independently of the room connection. Continue creates a real normal room using existing create/fill-bots/ready/start commands.
- `apps/client/src/game-preferences.ts`: persistent Beginner assistance checkbox alongside existing audio/motion preferences; audio controls remain intact.
- `apps/client/src/table-effects.ts`: explicit cleanup of pending table-effect callbacks, transient nodes and animations when leaving a seat/restarting. Existing effect timing is retained.
- `apps/client/src/decision-ui.ts`: a null decision deadline displays **Paused** instead of a misleading `0s`. Normal ten-second Life decisions retain their authoritative deadline.

The practice state is local and inspectable in developer tools; it is not a secure multiplayer authority. Its UI uses the shared public projection plus only the trainee’s private projection. Bot hidden identities, hands and Night ballots are not rendered or persisted. This boundary does not grant access to any normal room’s secrets.

## Rules and lesson sequence

1. **Role**: existing private portrait, a controlled Villager without a special ability. Role privacy and its distinction from Life cards remain in the normal opening UI.
2. **Lives**: inspect five actual Good Lives, optionally reorder them, then use the existing acknowledgement control. A training note explains that receiving Evil permanently changes allegiance, even if the Life later moves away.
3. **Evidence**: Cinder begins with six Doubt. Select exactly one real Evidence, choose Cinder and confirm. The shared engine spends that card, adds one Doubt and opens the real accusation decision. Wrong commands leave the objective and state unchanged, with a corrective hint.
4. **Reveal**: choose any eligible hidden position. All five of Cinder’s Lives are configured Good before selection, rather than rewriting the chosen outcome. The real announcement, portrait, numbered position, verdict and resume sequence runs. Training provides unlimited reading time; normal games retain ten seconds. Advance to hand management waits for presentation completion or the existing skip flow.
5. **Hand management**: it remains the same human turn after Evidence and the reveal. The player may play additional Evidence, play the whole hand, or save remaining cards and explicitly End turn. Playing does not automatically end the turn or match. The shared engine rejects drawing after a play. Five practice bots then each take a legal Draw 2 turn. On the next fresh human turn, drawing adds up to two cards and ends that turn. Saved cards remain.
6. **Night and Dawn**: the actual short draw pile runs out through those legal draws. The remaining setup cards were moved to the discard pile, not duplicated. The human has no Night ability. Others’ secret choices are explained generically, with no ballots or private identities exposed. **Let Night pass** advances the local engine’s virtual clock to its real Night deadline; with no submitted attack, the actual public outcome is no death. **Welcome the next Day** resolves the actual Dawn deadline and reshuffle. Hands persist. These reading controls do not exist in normal rooms.
7. **End conditions**: Village reveals every Evil Life; Ashbound comprise all surviving non-neutral participants; Outcast has its separate council-vote victory. End turn, empty hands, Draw 2, Night and Dawn do not end the match.
8. **Completion**: **The council awaits** offers Continue playing, Return to main menu and Replay tutorial. Completion is recorded only here. Exit/skip and restart never mark a new tutorial completed.

The Day/reveal training clock is held rather than elapsed in real time. The virtual clock, deterministic setup, short pile, objectives and bot scripts are encapsulated in the local training session and discarded on exit. Production deadlines, networking, card mechanics, hidden-information rules and cinematic durations are unchanged.

## Guidance and accessibility

The tracker states the current chapter/objective and completed progress. Gold highlights follow the existing DOM element, so scrolling/rotation does not require a stale coordinate overlay. Stronger emphasis appears after five idle seconds, an arrow after ten, expanded help after fifteen and **Show me** after twenty-five. Show me scrolls/focuses; it does not play a card or choose a target. Interaction resets idleness. Hidden pages, native dialogs and active presentations suspend hint progression.

Mouse, keyboard selection/confirmation and native touch card selection use the existing controls. Highlights respect the existing quiet-motion setting and system reduced motion. The phone tracker occupies layout space above the table, with a bounded scroll area for expanded hints; it does not overlay hand controls. The table remains independently scrollable. Private setup remains in the existing private dialogs.

Beginner assistance defaults on unless explicitly disabled. Small normal-match reminders cover fresh turns, continuing a turn after playing, saved cards, waiting, Life choices, Night abilities and Dawn. They use only the viewer’s existing authorized view. They do not recommend targets, reveal roles, submit commands, or change deadlines. The setting is available in Audio settings and on completion, and can also be dismissed directly.

Only `ashfall.tutorial.completed` and `ashfall.beginner-assistance` are saved for onboarding. Storage failures are caught. Training deals and progress are not saved; refreshing returns to the ordinary entry/recovery flow. Existing audio and event cue preferences/deduplication continue using their own existing storage.

## Audio and cleanup

Training reuses the existing AudioManager, scene transitions, effect ledger, table sounds and close-up controller. Objectives do not set the music scene, create another mixer or replay presentation cues. Real phase changes use normal crossfades; validated events use the existing synchronized sound milestones. Master/Music/Ambience/SFX, mute, autoplay, visibility handling and reduced motion are retained.

Restart/exit aborts tutorial listeners, clears its interval, drops local state, removes highlights, closes its dialogs, clears card/private/decision/presentation state and pending table effects, and returns the existing audio scene to menu. Continue performs that cleanup first, then uses the normal server command flow to create a fresh six-seat room with five Easy bots. Random roles and Life cards, initial hands, normal timers, opening Curse vote where eligible, and private acknowledgement remain server-authoritative. A failed network step leaves the ordinary notice and recoverable menu/lobby rather than reusing the manipulated practice deal. The completion action is single-use while that launch is underway.

## Verification

- `npm test`: 215 tests in 25 files passed, including three training rule/projection tests.
- `npm run typecheck`: passed.
- `npm run build`: passed. Existing runtime-copied artwork URLs retain the known Vite resolution warnings.
- `npx tsx tests/tutorial-browser.ts`: complete walkthrough at desktop 1280×720 and phone 360×640; desktop keyboard Evidence/target/confirmation, phone native touch Evidence/target/confirmation and reduced motion. Covers handbook/reference return paths, real-time 5/10/15/25-second hint escalation, Show me focusing without playing, restart, exit without completion, real Life choice, paused decision label, saved-hand and empty-hand branches, fresh-turn Draw 2, Night/Dawn, completion requiring an explicit choice, Return to main menu, replay, fresh normal server match with five bots, normal private acknowledgement, assistance dismissal/persistence, direct in-game help and reload recovery. No browser page errors.
- Unit tests confirm rejection of wrong targets, stale context and forged presentation acknowledgement, projection privacy, chosen Good slot, turn persistence after the hand empties, and exact hand retention through Night/Dawn.
- `npx tsx tests/event-effects-browser.ts`: existing event profiles, actual recorded sample playback, synchronized milestones, scope cleanup, privacy and result layouts passed.
- `npx tsx tests/mobile-layout-browser.ts`: existing six- and ten-player phone controls, targeting, touch interactions, chat, private views, rotation, reconnect and Night passed.
- `node tests/audio-ui.mjs`: production Credits/settings and the four audio sliders, mute and new assistance checkbox passed at desktop/phone sizes, including missing audio responses. The existing settings assertion now counts range controls separately from the checkbox.
- Final compiled-production smoke test at 360×640: gold handbook, role portrait, private Life inspection, allegiance note and actual training Day setup passed without page errors.

Browser screenshots/results are written under ignored `test-results/tutorial/`. Automated walkthrough timing is not a usability study or subjective audio-quality assessment. Physical phones and human completion-time/listening sessions remain to be evaluated. Training intentionally teaches essential controls and end conditions; uncommon card/role interactions remain available in the reference and normal bot matches.
