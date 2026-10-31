# Timed opening and Curse ritual

Implemented locally 31 October 2026. Not pushed or deployed. The Pyre is not included. Cultist display terminology, recorded audio and isolated tutorial are preserved.

## Authority and flow

Normal matches start PRIVATE_DEAL with an absolute server deadline 90 seconds after start. Roles, teammates and five private Lives use the existing components. Rearrangement is allowed only before acknowledgement. Each manual confirmation locks that player's arrangement. When everyone confirms, or at timeout, OPENING_CURSE begins with a separate 30-second server deadline. Timeout acknowledges remaining players on the server, preserving arrangements; the feed explicitly says these were automatically sealed rather than naming them as manual actions.

Only eligible living Cultists receive blackCatChoice in their owner view. chooseBlackCat now accepts only OPENING_CURSE; acknowledgement no longer requires a vote. Votes are final, private and idempotent. A nonfinal vote changes only its owner's private revision. The last vote publishes the phase transition to everyone, including when cinematic presentation is disabled. No public ballot/progress count or voter IDs are added.

All eligible votes resolve immediately. At timeout only accepted valid ballots count; most votes wins, retaining earliest living seat tie-breaking. Zero ballots select `living[randomIndex(living.length)]`, using the existing injected server RNG (crypto.randomInt in production). No eligible voters use that fallback immediately. resolveOpeningCurse is phase-guarded, clears the opening deadline and ballots and reuses attachOpeningCurse exactly once. The same existing Curse card becomes the Black Cat; no new Curse instance is minted or added to the draw pile. Its holder starts Day 1. Shared presentation planning now recognizes OPENING_CURSE -> DAY and queues the existing public Curse event before the Day announcement, with normal finite presentation expiry.

Sweeps resolve grace expiry, opening deadlines, presentation completion and gameplay deadlines chronologically. Opening deadlines are stored once per deal, never extended by reconnect, host migration, client progress or animation. The room view exposes only the public deadline, server time and whether inspection timed out. Rematch/reopen clears opening state. Pre-Day leaving/grace expiry still cancels the deal without exposing Lives; this now includes OPENING_CURSE because Day has not begun. Thus a disconnected seat's existing 60-second grace can cancel a deal before the 90-second inspection expires. This is preserved policy, not an extra inactivity penalty.

## Client composition and privacy

opening-ui.ts and opening.css reuse the opening-screen/opening-copy composition, existing condensed heading variable, primary buttons, charcoal #05070a, aged gold #e8bc61 and crimson accents. Existing Curse SVG is reused with a CSS crimson tint; no artwork file or border system was replaced. The fixed countdown uses server time plus monotonic elapsed browser time and changes colour subtly at 15 seconds. There is no alarm. No protocol action depends on the client clock.

Role and Life presentations remain unchanged in purpose. Life confirmation covers the private display and opens a secure full-screen waiting state. The shared ritual then replaces that state in place. Only eligible owners receive a target selector, including self-targeting; other players see the same art/title/countdown with a waiting message. Submission replaces controls with a sealed confirmation; failure permits retry. Accepted votes are never revealed as the final target before server resolution. Phase changes cover obsolete private/role panels, including auto-sealed players and the no-eligible-voter fast path. The ritual is removed before the existing public cinematic is appended in the same render cycle. Its entrance animates child content, keeping the opaque charcoal scene stable to avoid a table flash. Keyboard focus stays within mandatory scene controls. Reduced-motion and quiet-motion modes remove the entrance movement.

## Audio and cleanup

No soundtrack or recording is replaced. PRIVATE_DEAL, OPENING_CURSE and Day use the same existing Day scene key, so crossing these stages does not restart the bed. Existing `swell` and `glow-mystery` cues mark ritual entrance and accepted vote; public Curse activation remains in the existing event-effects lifecycle. These cues use the existing gain, mute, loading and deduplication manager and a dedicated opening scope stopped when leaving the event. Sealed feedback is not replayed when reconnecting with an already accepted ballot. Existing recorded assets/source licences remain unchanged; see AUDIO_ASSET_CREDITS.csv and AUDIO_LICENSES.md. No new audio assets require credits.

## Tutorial

The tutorial owns isolated local state with no opening deadline and retains its direct private-inspection -> practice-Day transition. It mentions the normal timed ritual without imposing it on training. Continue Playing creates an ordinary fresh five-bot room and follows the server's timed opening. No tutorial state or prepared identities enter multiplayer.

## Executed verification

- Full unit/integration suite, strict TypeScript and production build: see final run reported in chat. New opening tests cover 90/30-second deadlines, arrangement preservation, auto-acknowledgement, early advance, owner-only voting, no Day action during ritual, accepted ballot retries, reconnect, host migration, partial votes, all six injected zero-vote target indices, no eligible Cultists, one Curse status, correct first turn, late vote rejection, cancellation and fresh rematch deadlines.
- `npm run simulate:bots`: 100 seeded matches, zero stuck/crashed, zero invalid bot actions (60 Village / 40 Witch outcomes).
- `npx tsx tests/opening-browser.ts`: real Edge walkthrough at 1280x720, 360x640 reduced motion and 740x360. Role -> teammate -> Life inspection -> secure confirmation wait -> private vote/sealed state -> public Curse -> Day; non-Cultist waiting has no ballot controls; screenshots visually reviewed. Repeated sync does not repeat entrance/vote sound dispatch.
- `npx tsx tests/tutorial-browser.ts`: complete desktop and phone tutorial, including Night/Dawn, completion/replay and fresh normal match.
- `npx tsx tests/mobile-layout-browser.ts`: six and ten players, phone sizes, targeting/cancellation/confirmation, chat, private views, rotation, reconnect and Night.
- `npx tsx tests/audio-match-browser.ts`: complete recorded-audio match, lobby/cards/reconnect/Night/mute/reveal/victory/defeat.

Evidence is in ignored local test-results/opening, tutorial, mobile-layout and audio output directories. Vite may log reset/aborted proxy sockets when QA browser contexts replace raw test sessions or close; these walkthroughs completed with no browser page errors. Known runtime-copied artwork resolution warnings remain at build time. Physical Android/iOS testing, subjective audio audition and live-host verification were not performed for this change. No new deployment package was generated.
