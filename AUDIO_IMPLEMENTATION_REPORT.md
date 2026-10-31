# Ashfall Council — recorded audio implementation

Updated 31 October 2026. This describes the current local source build. The exact previous report, credits, licence notes and procedural source are preserved in [docs/audio-history](docs/audio-history/). Historical statements about sample-free synthesis describe that older version only.

## What changed

The continuous three-sine music and four-second filtered-noise wind beds are retired. Playback now uses acquired local recordings: chamber strings, rural birds, nocturnal crickets/frogs, fireplace, paper/card foley, wood impacts and a recorded church bell. No audio-generation model was used. The team did not compose the imported music.

26 edited assets are supplied as 52 Ogg Vorbis / MP3 files (32,313,867 bytes total for both formats). Exact filenames, byte sizes, durations, SHA-256 hashes, original/archive filenames, creators, observed download URLs, licences, processing filters and purposes are in [AUDIO_ASSET_CREDITS.csv](AUDIO_ASSET_CREDITS.csv) and `apps/client/public/audio/asset-manifest.json`. Source acquisition records are also in `docs/audio-source-records.json`. Kenney download URLs are signed/expiring; use the linked creator page to obtain a fresh URL rather than treating them as permanent download links.

## Scene design

| Scene | Music bus | Ambience bus |
|---|---|---|
| Menu | Scott Buckley, Phoenix (2026), continuous 352.37-second loop | Fireplace #2 |
| Lobby | RandomMind, Medieval: The Old Tower Inn, continuous 103.48-second loop | Quieter fireplace |
| Day | Brandon Morris, Town in ruins loop, continuous 46.88-second loop | Evening Birds |
| Night | RandomMind, Fantasy: Rising Moon, continuous 222.73-second loop | Campaign at Night #4: crickets and rare frogs |
| Results | An eight-second victory or nine-second defeat conclusion by RandomMind, selected by the existing authorized result cue; never loops | Quiet fireplace |

The previous recorded version played short Day/Night excerpts once. This update replaces them with distinct continuous tracks. Ordinary state updates, active-player changes, selection, drawing, card plays, private investigations and Life-card decisions do not recreate the current media voice or reset its playhead. REVEAL_RESOLUTION now remains on the Day soundtrack. The previous track continues through a final Life reveal until the existing result cue starts its conclusion; skipping that presentation ends the old background instead of looping it indefinitely.

Music/ambience crossfade over approximately two seconds, starting the outgoing fade only when the incoming file can play. All four background music loops also receive a two-second offline circular seam edit. The long environmental loops have a two-second circular tail/head crossfade prepared offline; loops are approximately 56, 138 and 178 seconds. Ogg is preferred when reported playable; MP3 is the independent fallback. Actual browser gaplessness and perceived transitions still require listening review.

## Every event cue

Original cue names remain, with additional mappings for card-specific activation and visual event milestones. Event effects now use the animation timeline instead of firing every sound at card entrance. The audio replacement preserved card rules, network commands, prior presentation durations and private-information projections. A later interaction update adds a separate four-second public opening Curse event before Day 1, using the existing synchronized pause; existing card/phase durations stay unchanged.

| Cue | Current sound / decision |
|---|---|
| hover | Intentionally silent; removes constant interface beeps |
| click | Kenney light wood tap, low level |
| select | Three variations: Kenney card-slide-1 / card-slide-2 and Brian MacIntosh card-cut |
| draw | Same three short physical card-handling variations; avoids a full shuffle for every draw |
| flip | yd page-flip and Brian MacIntosh card-cut / card-contact variations |
| place | Kenney card-place-1 / card-place-2 and Brian MacIntosh card-contact |
| stamp | Kenney medium wood impact |
| cleanse | Three quiet paper variations for Alibi/Mercy and removed Doubt |
| curse | Card placement plus laleksic floor-creak recording, slowed/filtered |
| bell | Joseph SARDIN Church Bell, first 2.6 seconds |
| whisper | Card slide plus JaggedStone tonal glow-rise |
| eavesdrop | Recorded card cut/contact plus JaggedStone tonal glow-reveal |
| death | Recorded wood impact plus floor creak |
| night | Recorded floor creak; scene supplies the environmental change |
| dawn | Soft card-slide-2; Day scene supplies continuous music |
| reveal | JaggedStone tonal glow-reveal plus a quieter recorded wood impact at the public portrait peak; flip stays separate |
| victory | RandomMind victory-theme, Music bus, eight seconds once |
| defeat | RandomMind defeat-theme, Music bus, nine seconds once |
| protect | Card placement plus tonal glow-reveal; successful activation |
| shift | Recorded shuffle plus wood creak for Cinder Shift |
| accuse | Quiet physical placement; individual visible marks own their stamp sounds |
| dispel | Card cut plus faster tonal glow-reveal |
| vow | Card placement plus slower tonal glow-reveal for Vow of Hearts |
| conspiracy | Recorded shuffle plus slowed creak |
| scapegoat | Card slide plus card cut at transfer activation; quiet receiving placement at route arrival |
| swell / release | JaggedStone glow-rise at aura rise; soft physical slide at finite dissolve |
| position | Quiet, raised-rate glow-reveal on the public Life position highlight |
| verdict | Wood impact plus subdued tonal glow-rise |
| resume | Tonal glow-rise plus small wood accent; current BGM playhead continues |
| blocked | Recorded lock plus metal resonance on a successful public protection block |
| fizzle | Dull wood tap and card cut when an attempted card action is publicly blocked; differs from successful protection |
| stocks | Recorded floor creak and lock; no extra musical score |
| result-accent | Brief tonal glow-reveal complementing the existing victory/defeat Music cue |
| threshold / heavy-stamp | Stronger wood impact replacing the final seventh-mark stamp / first Testimony stamp, rather than duplicating it |

The supernatural cues are layered treatments of recorded physical foley (including a reversed shuffle), not claims of literal recordings of magic. Whisper/Eavesdrop sounds identify only the already-public card play; no sound encodes the secret Life identity, hand contents, private role target or Night choice. No oscillator/noise generators remain in the current playback graph. Programmatic gain envelopes, filtering, rate changes, crossfades, limiting and ducking remain.

## Mixing

New-install defaults are Master 70%, Music 18%, Ambience 20% and SFX 65%; saved preferences are not overwritten. Music files target -18 LUFS / -3 dBTP before encoding, ambience -25 LUFS / -5 dBTP and effects -20 LUFS / -6 dBTP. These are processing targets, not measurements of subjective loudness. Scene gains keep lobby music quieter. Common card gains of .45–.55 before the SFX bus give an effective .29–.36; important effects use .8–.9 (effective .52–.59), before Master. The limiter contains summed peaks.

Life reveals, Bell, major accusation cues, Conspiracy, elimination and phase cues duck music/ambience to 30% of their current bus mix. Recovery starts after the longest actually available effect layer ends, plus 150 ms, and ramps smoothly; overlapping major events extend the hold. Sliders remain independent. Victory/defeat conclusions use the Music bus and phase crossfade, rather than ducking their own music with a silent SFX cue. The local browser remembers only its own already-authorized allegiance for the correct conclusion after elimination clears the private projection; no gameplay/network data was added.

## Architecture and resource bounds

`audio.ts` preserves the public API. `audio-recordings.ts` owns a single lazy AudioContext per tab; `audio-catalog.ts` maps scenes/cues to inventoried local assets. Master, Music, Ambience and SFX controls and the `ashfall.audio.v1` / legacy mute migration are preserved. Separate duck nodes mean moving a volume slider no longer overwrites an important-event duck envelope.

Long tracks use HTMLAudioElement → MediaElementAudioSourceNode → per-voice fade → independent bus → duck → Master → limiter. They are not decoded into application-owned AudioBuffers. At most four media voices coexist, allowing two outgoing and two incoming layers. Retired elements are paused, detached and disconnected. Browser-managed media buffering is implementation-dependent; this is not a claim of a fixed total browser RAM limit.

Short effects use an LRU cache capped at sixteen decoded buffers / 6 MiB, two concurrent fetch/decode jobs and 12 active SFX voices. Initial interaction warms click/select; entering active phases warms common card effects, Life reveal and Bell. Already-authorized public events and local card selection warm special layers before their existing visual cues. Other effects load on demand. Nothing downloads before the first interaction or when first unlocked with stored mute enabled. A cold effect is skipped at its cue timestamp; completion of a fetch never causes a late replay. Loading and decoding never block gameplay.

Hidden tabs pause media and suspend the context; return resumes an already-created context. Mute/volume state persists; different tabs/clients mix locally. Scene updates are idempotent. Existing server effect IDs and handled presentation IDs still gate cinematic/table playback, including reconnect snapshots. No audio packets, external streaming service, microphone or voice feature were added.

Both codecs are packaged with the build. Production static serving includes correct audio MIME types, HEAD and byte-range support for media seeking. Missing, invalid or stalled files try the other format, then become silence with a retry cooldown; they do not delay rules or show a blocking loading screen.

## Acquisition and candidate review

Creator/uploader pages and packaged Kenney licence files were checked before importing. Only files actually acquired and linked in the inventory are shipped. No Mixkit music, commercial game soundtrack or AI-generated music was used by this project.

| Suggested candidate | Verified source facts and disposition |
|---|---|
| Dark Shrine Loop | qubodup, remix of yd's LMMS-made Shrine; page lists CC0. Not included: chose chamber strings rather than another repeated project-rendered shrine bed. |
| Forgoten tomb ambience | kindland, CC0; described for tombs/labyrinths, with a busy insect/rat environment in the author's discussion. Not included for the open village setting. |
| rain and thunders | kindland page lists CC0; author describes personal rain recordings mixed with Best Service plugins. Not included because redistribution provenance of the thunder component was not independently established. |
| Medieval: Defeat Theme | RandomMind, CC0; obtained and edited into the nine-second conclusion. |
| Old Pages/Flip with sound | yd, CC0; obtained FlippingPages_0.ogg and used for Life reveals. |
| Town in ruins loop | Brandon Morris (submitted by HaelDB); page offers CC0 and OGA-BY 3.0 alternatives. Selected the CC0 option; acquired n3535n5n335n35nj.ogg for Day. |
| Fantasy: Rising Moon | RandomMind, CC0; acquired Rising_Moon_0.mp3 for Night. |
| Medieval: The Old Tower Inn | RandomMind, CC0; acquired The_Old_Tower_Inn.mp3 for a distinct lobby track. |
| Playing card sounds | BMacZero; optional credit Brian MacIntosh. CC0; acquired cut.wav and contact2.wav for variations. |
| Various sound effects | laleksic, CC0; source describes phone recordings. Acquired sounds_8.zip, using floor_creak2.wav, lock.wav and clang_metal.wav. |
| Card Game sounds | HaelDB, CC0; reviewed source metadata. Not imported; existing Kenney and recorded playing-card sources selected. |
| Magic spell SFX | JaggedStone, CC0; author describes filtered note sequences. Initially omitted for the physical-foley pass; magical_2.ogg and magical_4.ogg are now included for the user-requested tonal glow/shimmer sounds. |
| Dungeon Ambience | yd, CC0; described for dungeon exploration. Not imported; outdoor natural environments retained. |

Candidate links are retained in AUDIO_LICENSES.md. Candidate metadata/licences were reviewed; selected files also received decoding, signal-level/loop processing and integration checks. These are distinct from subjective listening. This environment did not provide a verified by-ear audition: do not describe the above selection notes or automated tests as a completed listening assessment. Headphone/speaker listening and final approval of the musical fit remain open, including auditioning the rejected candidates if the owner wants to reconsider them.

## Reproduction and verification

`python scripts/prepare-audio.py --sources PATH --ffmpeg PATH` verifies original download hashes and creates the normalized/faded codec pairs. Processing uses FFmpeg 7.1 locally; the processing executable and original download packs are not runtime dependencies. `scripts/write-audio-credits.py` regenerates CSV/browser attribution from the asset manifest.

Checks for this update:

- `node tests/audio-browser.mjs`: lazy autoplay unlock, one context, scene changes, independent buses, crossfade resource bounds, continuous Day/Night playhead and loop-wrap checks, result completion, duck/recovery and slider independence, all cue entry points, persistence, independent clients, simulated visibility, codec fallback, missing files, no late replay, and actual cinematic/reconnect hooks.
- `node tests/audio-ui.mjs`: compiled client settings, four sliders, mute, room creation/bots/start, desktop/mobile sizes and blocked-media gameplay; Credits tab, keyboard navigation, source/notice links and LAN clipboard fallback at 320/360/1280 widths.
- `npx tsx tests/audio-match-browser.ts`: deterministic six-seat match over real transport with two real browser mixers: lobby/opening, repeated Day card actions, reconnect without replay/reset, draw into Night, mute isolation, Night attack, Dawn, Life reveal at portrait stage, Day music through Life choice, and both victory/defeat conclusions.
- `npx tsx tests/mobile-layout-browser.ts`: six/ten-player touch flow, real card commands, private cards, reconnect/Night, and unread chat behavior.
- `npm test`: existing regression suite plus audio file integrity and production MIME/range/missing-file checks.
- `npm run build`: production client/server and runtime audio/credits packaging.

Executed 31 October: all 212 tests in 24 files passed; production build passed; recorded-audio browser checks passed at desktop/phone widths; production audio UI and missing-media gameplay checks passed at 1280/320/360 widths; the complete six-seat match with two browser mixers passed, including secret Night-choice silence and both result themes; six/ten-player mobile/chat checks passed. All 52 production audio hashes and packaged credit records match source. FFmpeg decoded all 26 Ogg recordings with nonzero signal and sample peaks below 0 dBFS; the measured values are in test-results/audio/signal-levels.json. These signal checks do not establish perceived quality. Evidence is in ignored `test-results/audio/` and `test-results/mobile-layout/` output. The new Credits tab is available from the main menu, desktop header/mobile Menu and the game guide. It is generated from the shipped asset manifest; required CC BY attribution is separated from optional CC0 acknowledgements. Copy audio credits includes every source, licence, creator, filename, use and modification. Original software notices and project artwork/AI-use records are packaged alongside it. Browser credits also include optional, non-preloading file previews for human listening. These are browser/API checks, not proof of subjective sound quality, real-device compatibility, or human multiplayer listening.


## Event visual-to-audio timeline — 31 October follow-up

The existing background scene/music implementation and all 18 Music/Ambience codec files are byte-for-byte unchanged by this follow-up. No server deadline, gameplay/card rule, role projection or presentation duration was changed. The tutorial was not modified, and nothing was pushed/deployed.

`event-effects.ts` owns a finite Web Animations timeline for each visible event segment. Its `currentTime` drives both luminance/glow and cue milestones; requestAnimationFrame samples that clock instead of running independent audio timeouts. Ordinary magical events enter with paper, rise at 9%, reach activation/glow peak at 28%, disperse and release at 85%. Bell uses its earlier 10% wave activation. Public Life portrait impact peaks at 14%. Quiet motion keeps finite, low-luminance fades and the same cue timing, without rotating/expanding particles. Any callback over 220 ms late is dropped instead of replayed out of time.

| Visual effect | Local recorded files (Ogg preferred, MP3 fallback) | Playback milestone / source licence |
|---|---|---|
| Curse shadows and opening Curse | card-place variants, paper-swell, wood-creak | entrance, aura rise, activation; Kenney and laleksic, CC0 |
| Council Bell waves | church-bell, physical entrance, paper rise | 10% wave activation; Joseph SARDIN and Kenney, CC0 |
| Eavesdrop eye-shaped arcs | card-cut/contact, paper-swell | rise and 28% listening activation; Brian MacIntosh and Kenney, CC0 |
| Whisper wisps | card-slide variants, paper-swell | rise and 28% activation; Kenney, CC0; no cue depends on private insight identity |
| Conspiracy orbit / Cinder Shift route | card-shuffle, wood-creak, card-place | 28% sweep, 58% receiving arrival; Kenney/laleksic, CC0 |
| Vow intertwined arcs | card-place-2, paper-swell | 28% linkage activation; Kenney, CC0 |
| Dispel dissolving dotted ring | card-cut, paper-swell | 28% activation and 85% release; Brian MacIntosh/Kenney, CC0 |
| Protection shield | card-place variants, metal-resonance | successful activation; failed attempt uses card-cut + wood-tap instead; public block uses metal-lock/resonance; CC0 |
| Evidence/Testimony/Witness physical marks | card-place, wood-impact | each visible mark has one stamp; Testimony first mark is heavier, final seventh mark replaces its ordinary stamp with threshold impact; Kenney, CC0 |
| Stocks restraint | wood-creak, metal-lock | 28% close-up locking; laleksic, CC0 |
| Scapegoat route | card-slide/cut, card-place | 28% sweep then 58% receiving accent; Kenney/Brian MacIntosh, CC0 |
| Alibi/Mercy table cleanup | card slides/cut; metal-lock on Bound release | same callback that animates clearing marks/release; no new full-screen scene; CC0 |
| Life announcement / portrait / position | paper-swell; page-flip + wood-impact + metal-resonance; metal-resonance | neutral announcement; portrait entrance + 14% impact + 72% decay; position at 8%; Kenney/yd/laleksic, CC0 |
| Elimination, public verdict, Resume the Hunt | wood-impact/creak; paper-swell/resonance; paper-swell/wood-tap | lantern fade at 18%; verdict rise/30% impact; hunt rise at 8%; existing CC0 recordings |
| Day/Night | card-slide-2 / wood-creak | atmospheric phase accent at 20%; existing continuous BGM remains; CC0 |
| Victory/defeat | metal-resonance | brief 18% accent; existing authorized result Music cue still starts only once; laleksic, CC0 |

Sources and per-file processing/licence links are in AUDIO_ASSET_CREDITS.csv (including its `playbackTrigger` column), AUDIO_LICENSES.md, the local manifest and Credits tab. Two small files were newly derived from the previously downloaded, SHA-256-verified `sounds_8.zip`: `lock.wav` → `metal-lock.ogg/.mp3` (0.93 s), `clang_metal.wav` → `metal-resonance.ogg/.mp3` (0.68 s). Creator: laleksic. Source: https://opengameart.org/content/various-sound-effects. Licence: CC0 1.0. Processing: mono 44.1 kHz, loudness target -23 LUFS / -8 dBTP, 4 ms entrance and 150 ms tail fade, metadata removal, Ogg/MP3 encoding. Total added payload: 42,132 bytes. Reproduce only these additions with `scripts/add-event-recordings.py`; it does not re-encode the soundtrack. Exact original durations, hashes and clip lengths remain in the manifest.

Each presentation/segment/milestone has a bounded session-local dedup key. Rerenders do not recreate active scenes. Reconnecting can restore the visible unfinished presentation while already-consumed cues stay silent. No public sound uses private role targets, hidden Life kind/slot or Night ballots; announcement effects stay neutral until the existing public portrait stage. Public block metadata determines a failed-action treatment, including correctly handling partially blocked stacks.

Each event owns its short audio voices. Skip, Next, scene reset, visibility/blur and hold stop or fade those scoped sources and cancel their remaining timeline callbacks. Resume continues the finite visual clock without replaying consumed cues; holding never loops sound. Master mute sets gain to zero immediately. Existing volume preferences, SFX bus, limiter, cache/voice limits and independent duck nodes remain. Table stamps that are represented by central visible marks are suppressed, so they are not heard twice.

The result layout reserves a separate controls row, constrains the portrait frame, wraps long headings and switches to a two-column layout on short landscape screens. Result scenes have a stronger veil and hide the underlying mobile navigation while visible. This fixes the portrait/title/controls overlap in “The village survives”.

`npx tsx tests/event-effects-browser.ts` covers the listed card profiles in normal desktop/reduced-motion phone modes; actual decoded sample starts; per-mark cues; successful/blocked protection; table-only Alibi; public reveal stages; death/verdict/hunt/phase/result accents; mute; skip/hold cleanup; reconnect dedup; and result geometry at 1280×844, 537×672, 390×844, 320×640, 844×390 and 568×320. Screenshots/results are in ignored `test-results/event-effects/`. These tests do not constitute a by-ear audition or physical iOS/Android verification.


## Tonal glow sound correction — 31 October

The user clarified that “glowing” means the sound of a magical rise/shimmer, not a request for more visual effects. Two actual prerecorded tonal spell files by JaggedStone were downloaded after checking the source page's creator and CC0 declaration: [Magic spell SFX](https://opengameart.org/content/magic-spell-sfx). These are author-created filtered note sequences from 2014, not a claim of natural acoustic foley, original team composition or generated AI audio.

- Original `magical_2.ogg` → `glow-rise.ogg` / `glow-rise.mp3`: 1.38-second rise, used for magical buildup, public reveal announcement, Whisper, verdict and Resume the Hunt accents.
- Original `magical_4.ogg` → `glow-reveal.ogg` / `glow-reveal.mp3`: first 2.4 seconds, used for the public Life portrait impact, Eavesdrop/Dispel/Vow/protection activation, position highlight and result accent.
- Both use mono 44.1 kHz, loudness target -20 LUFS / -6 dBTP, 15 ms entrance and 300 ms tail fades; Ogg Vorbis q3 / MP3 96 kbps. Added payload across four files: 78,782 bytes. Original and edited hashes, observed URLs and exact triggers are in the manifest/CSV.
- Local card selection and drag selection warm the relevant recording before target confirmation, including the touch path whose synthetic click is suppressed. Cold/missing sounds are still skipped rather than played late.
- Existing continuous Music/Ambience files and scene logic remain unchanged. Physical card movement and Doubt stamps stay physical. Successful protection retains a different cue from a failed/blocked action.
- “Resume the Hunt” and the “Evil still lurks among us” verdict use the earlier red ink/aura styling. Their added geometric layers and hero glow are disabled; this correction does not redesign the other event effects.

The linked YouTube example's oEmbed metadata identifies a sun-lighting green-screen clip. Its audio could not be auditioned in this environment, its reuse licence was not independently verified, and no audio from it was imported. The new tonal accents are a source-verified interpretation of the requested sound direction, not a claimed exact match or completed subjective audition. Optional local previews are available in Credits.

Rebuild just these two additions with `python scripts/add-glow-recordings.py --sources PATH --ffmpeg PATH`; source records and hashes are checked before encoding. The main preparation script invokes this step when those verified source records are available.

## Card artwork colour follow-up

After the sound correction was completed, the user separately requested card-coloured event backgrounds. The existing event light/ink accent now uses an explicit artwork palette: Evidence ivory-white; Testimony/Witness/Stocks red; Curse/Dispel/Whisper/Eavesdrop purple; Cinder Shift red; Conspiracy bronze; Vow rose-red; Council Bell/Scapegoat/Piety gold; Hearthward orange; Asylum/Alibi blue; Mercy sage. Only accent/background colour variables change; event shape, typography, audio milestones and durations remain intact. The user-requested red Resume the Hunt and evil verdict remain red, and blocked attempts retain their subdued grey treatment. Alibi/Mercy still have no new full-screen close-up. Phone screenshots for Evidence and Testimony are included in the event-effects browser checks.

## Public event sound moods

Each event effect now has a finite contextual atmosphere accent in addition to its physical movement/impact. Helpful protection uses a warmer shimmer (`glow-good`: glow-reveal, playback rate 1.12, low-pass 11 kHz). Curses, accusations, restraint, elimination and ominous verdicts use a lower, darker swell (`glow-bad`: glow-rise at .72 rate / 2.6 kHz, with a very quiet wood-creak layer). Investigations, hidden-card transfers and ambiguous events use a restrained mysterious tone (`glow-mystery`: glow-rise at .94 rate / 6.5 kHz). These are local playback treatments of the same credited JaggedStone files, not extra music streams or new synthesized audio. Each remains scoped to the event and fades/stops on skip/hold/exit.

Mood comes only from authorized presentation information. Life announcements remain mysterious for every identity; the public portrait can use a warm Good/Lanternkeeper accent or the darker `reveal-dark` Evil accent. Whisper, Eavesdrop, Cinder Shift and Conspiracy remain mysterious regardless of any private insight or allegiance changes. Dispel mood uses its publicly removed attachment: Curse removal is helpful, removal of protection is harmful. Failed actions use the failed treatment. Day/Dawn use a brighter accent, Night a darker one. Victory/defeat accents follow only this client's already-authorized personal result. Existing BGM and card-colour visuals are unchanged by this sound-mood addition.

Unit checks cover neutral reveal announcements, public portrait mood, unchanged investigation mood despite hidden-result fields, public Dispel outcomes, and personal result mood. Browser checks assert that the corresponding good/bad/mystery recorded cue actually fires at the event's aura milestone. These are functional checks, not a claim of human subjective listening approval.

## Remaining limitations

Actual iOS/Android background/autoplay behavior, human listening/balance on phones/headphones, and a fresh multi-human sound playtest remain. Slow/cold/missing SFX intentionally produce silence rather than delayed audio. The recorded bell excerpt and edited result cadences require listening approval. No hosted game was redeployed by this source update. Historical submission/provenance issues unrelated to the imported audio are not certified resolved.

## Timed opening ritual integration ? 31 October 2026

The dedicated OPENING_CURSE scene reuses `swell` for entrance and `glow-mystery` for the accepted private vote, both in a cancellable opening scope. Public Curse reveal retains its existing event cues. Inspection, ritual and Day share the existing Day audio scene key so beds are not restarted between them. No recorded files, licences, source credits or global mix values changed. Repeated owner sync is tested not to repeat entrance/sealed feedback. See docs/OPENING_EXPERIENCE.md for flow and verification.
