# Cinematic and Curse polish — October 29, 2026

## Behavior

Life reveals that return to active Day play now end with one **RESUME THE HUNT** scene. It lasts 2.8 seconds and uses the existing ink compositor with a crimson aura, streaks, and an ivory text sweep. The shared presentation plan drives both the server pause and the client sequence. A genuine new Day retains its Day announcement. Night, another pending accusation, and game over do not receive the resume scene. Testimony and Vow of Hearts keep their existing artwork, durations, and cinematic infrastructure.

The Life chooser is now a full-screen glass scene over the game, with the same ink geometry and aura as the card close-ups. There is no opaque modal rectangle. Illustrated anonymous backs enter with a stagger, hover/focus lighting, and a short selected-card flip that does not delay the server command. The ten-second authoritative timer, automatic first-hidden-card fallback, and server slot validation remain. Repeated state updates preserve the entrance and selection state; controls lock immediately after a choice. All hidden identities use exactly the same back.

Council Bell uses an etched, cracked bell in a ruined belfry, with chains, muted gold, and crimson light. Ring shockwaves and the bell entrance run within the existing card scene; voting gains no extra delay. Curse uses a black cat in engraved shadows with crimson eyes, smoke, and a target attachment pulse. Actor and target labels remain readable. Motion preferences suppress the new motion effects.

## Duplicate Curse root cause and fix

The old deck generated one Curse while the opening Ashbound choice independently created another card ID for its Black Cat attachment. Those could later coexist as an attachment and a drawable card. The opening now extracts the existing deck instance, even if a controlled setup placed it in a hand or discard, and attaches its original ID. No opening card is minted. Normal opening hands reserve Curse for that attachment.

Dispel removes the active attachment and inserts that same ID at a server-chosen position in the draw pile. It never sends Curse to a player's hand or creates a replacement. Scapegoat transfers the attachment's ID. Death discards the instance, and ordinary discard recycling moves it back into the deck. Deck configuration rejects more than one Curse; draw logic rejects an invalid attempt to draw Curse while attached. Consumed attachment history no longer retains a physical card reference. `curseInstances` counts all physical locations for regression tests and excludes private informational snapshots.

The opening Curse is included in the configured **87 cards**, rather than being an extra card. Council Bell remains unique and permanently spent when used. Help displays initial match quantities derived from the active server rules, including the legacy separate Whisper/Hearthward/Cinder Shift counts. The lobby uses the authoritative default preset until a match supplies its quantities.

## Main implementation files

- Shared rules: `packages/shared/src/curse.ts`, `day.ts`, `day-cards.ts`, `deck-config.ts`, `index.ts`, and `presentation.ts`.
- Server: `apps/server/src/rooms.ts` attaches the existing instance and publishes the active deck quantities.
- Client: `decision-ui.ts`, `cinematic-upgrade.css`, `game-moments.ts`, `moment-script.ts`, `card-info.ts`, `game-guide.ts`, and `main.ts` under `apps/client/src/`.
- Asset transcoding: `scripts/optimize-game-art.mjs` accepts optional PNG basenames so the new assets can be encoded without modifying the existing production art.

## Saved artwork and prompt set

Created with the **built-in imagegen tool**, using the existing Evidence/Testimony and Vow of Hearts illustrations as style references. Each source PNG is retained beside its served WebP in `apps/client/public/art/cards/`:

- `council-bell-v2.png` / `.webp`: square distressed woodcut of an ancient engraved and cracked brass council bell, hanging on iron chains in a ruined Gothic belfry; crimson light through the crack, deep blacks, ivory etching, muted gold, no text or UI.
- `black-cat-v2.png` / `.webp`: square original etched black cat emerging from darkness, crimson eyes, sparse ivory fur crosshatching, smoke and thorn shadows, restrained ritual marks; threatening adult animal, no cartoon styling, text, or UI.
- `hidden-life-v1.png` / `.webp`: portrait 2:3 anonymous Life back with aged-gold Gothic arches and thorn filigree over distressed black leather; a question mark drawn from etched smoke and ribbon, with a crimson wax dot; no identity symbols, names, or UI.

The shared prompt constraints were hand-drawn high-contrast ink, deep black/ivory/crimson, sharp shadows, original art, and readable silhouettes at card size. Assets reference the game's existing visual language; no third-party game art was copied. The three served assets total approximately 0.51 MB after encoding, versus about 9.94 MB for the retained source PNGs.

## Verification

- `npm run typecheck`, `npm test`, and `npm run build`.
- `tests/curse-lifecycle.test.ts`: creation, invalid quantities, attachment, Dispel/draw/replay, Scapegoat, death, recycling, invalid attached draw, identity conservation, and quantity derivation.
- `tests/black-cat.integration.test.ts`: real Socket.IO opening and retried Dispel without another insertion or hand return.
- `tests/game-moments.test.ts`: resume conditions, true Day transitions, unchanged premium scene durations, and distinct card identities.
- `npx tsx tests/cinematic-polish-browser.ts`: actual rendered comparisons for Testimony, Vow of Hearts, Bell, Curse, the glass chooser, and resume text. Controlled public snapshots isolate visual comparison; the full network game flow remains covered separately.
- `npx tsx tests/digital-ui-browser.ts`: six- and ten-player game, actual chosen-slot reveal, timers, privacy, voting, Night/Dawn, reconnect, and rematch.

Browser captures are under ignored `test-results/cinematic-polish/` and `test-results/digital-ui/`. Tests cover desktop, phone, short landscape, and reduced-motion game layouts. Visual review checks text contrast and card-frame sizing as well as functionality. Physical-device and multi-person playtests remain useful for subjective motion and sound tuning.


## Council verdict and victory consistency

A majority Council vote that eliminates a Scapegoat is a terminal public outcome. The server commits the death, named Scapegoat victory, stopped deadlines, and presentation events together. The existing shared presentation plan pauses the death and illustrated portrait victory sequence for all readers; finishing or reconnecting cannot resume the match. All result surfaces use the same public outcome text. The Scapegoat role artwork is public only after this winning verdict.

Council voting reuses the Bell illustration, ink atmosphere, glowing gold accents, condensed heading, public avatar sigils, sealed-ballot feedback, and responsive choices. Keep future phase and result scenes consistent with this compositor and preserve reduced-motion support.

Regression coverage: presentation-enabled Council majority, named outcome and personal results, paused victory events, reconnect and no resumed deadlines; 6/10-player voting captures at desktop, phone and landscape widths, plus Scapegoat portrait victory captures.

## Names and grouped card close-ups

The neutral SCAPEGOAT role is displayed as Outcast and uses a chained portrait. The separate Scapegoat action card retains its name and effect. HUMAN and WITCH Life cards display as Good and Evil, with separate artwork; the Lanternkeeper Life card and its protection remain distinct. Internal identifiers remain unchanged.

The shared presentation plan groups successfully played cards of the same kind, actor, and targets into one counted close-up. A single Evidence card has no close-up. The count comes from approved PLAY events, including partially resolved batches; the server pause and client sequence use the same plan.
