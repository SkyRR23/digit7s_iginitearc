# Current audio sources and licences

Verified 31 October 2026 against creator/uploader pages and acquired files. The previous synthesis-only document remains unchanged in [docs/audio-history/AUDIO_LICENSES.md](docs/audio-history/AUDIO_LICENSES.md); its claims do not describe this release.

## Included external recordings

| Creator / source | Actual source files used | Declared licence |
|---|---|---|
| [Scott Buckley — Phoenix (2026)](https://www.scottbuckley.com.au/library/phoenix-2026/) | Phoenix2026.mp3 → phoenix-2026.ogg / .mp3 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| [Brandon Morris — Town in ruins loop](https://opengameart.org/content/town-in-ruins-loop) | n3535n5n335n35nj.ogg → town-in-ruins.ogg / .mp3 (Day) | CC0 1.0 option; source also offers OGA-BY 3.0 as an alternative |
| [RandomMind — Fantasy: Rising Moon](https://opengameart.org/content/fantasy-rising-moon) | Rising_Moon_0.mp3 → rising-moon.ogg / .mp3 (Night) | CC0 1.0 |
| [RandomMind — Medieval: The Old Tower Inn](https://opengameart.org/content/medieval-the-old-tower-inn) | The_Old_Tower_Inn.mp3 → old-tower-inn.ogg / .mp3 (Lobby) | CC0 1.0 |
| [Brian MacIntosh (BMacZero) — Playing card sounds](https://opengameart.org/content/playing-card-sounds) | cut.wav, contact2.wav → card-cut and card-contact codec pairs | CC0 1.0; optional credit name supplied by author |
| [laleksic — Various sound effects](https://opengameart.org/content/various-sound-effects) | sounds_8.zip:floor_creak2.wav → wood-creak.ogg / .mp3; lock.wav → metal-lock.ogg / .mp3; clang_metal.wav → metal-resonance.ogg / .mp3 | CC0 1.0; author describes own phone recordings |
| [RandomMind — Medieval: Victory Theme](https://opengameart.org/content/medieval-victory-theme) | victory_0.mp3 → victory-theme.ogg / .mp3 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [RandomMind — Medieval: Defeat Theme](https://opengameart.org/content/medieval-defeat-theme) | defeat_0.mp3 → defeat-theme.ogg / .mp3 | CC0 1.0 |
| [JaggedStone — Magic spell SFX](https://opengameart.org/content/magic-spell-sfx) | magical_2.ogg → glow-rise.ogg / .mp3; magical_4.ogg → glow-reveal.ogg / .mp3 | CC0 1.0; creator says attribution is not required |
| [yd — Old Pages/Flip with sound](https://opengameart.org/content/old-pagesflip-with-sound) | FlippingPages_0.ogg → page-flip.ogg / .mp3 | CC0 1.0 |
| [Kenney — Casino Audio 1.1](https://kenney.nl/assets/casino-audio) | Audio/card-slide-1.ogg, card-slide-2.ogg, card-place-1.ogg, card-place-2.ogg, card-shuffle.ogg; reversed card-shuffle → paper-swell codec pair | CC0 1.0; original License.txt included |
| [Kenney — Impact Sounds 1.0](https://kenney.nl/assets/impact-sounds) | Audio/impactWood_light_000.ogg → wood-tap; Audio/impactWood_medium_000.ogg → wood-impact | CC0 1.0; original License.txt included |
| [Joseph SARDIN — Fireplace #2](https://bigsoundbank.com/fireplace-2-s0031.html) | 0031.mp3 → fireplace.ogg / .mp3 | CC0 1.0 |
| [Joseph SARDIN — Evening Birds](https://bigsoundbank.com/evening-birds-s1859.html) | 1859.mp3 → evening-birds.ogg / .mp3 | CC0 1.0 |
| [Joseph SARDIN — Campaign at Night #4](https://bigsoundbank.com/campaign-at-night-4-s1880.html) | 1880.mp3 → night-meadow.ogg / .mp3 | CC0 1.0 |
| [Joseph SARDIN — Church Bell](https://bigsoundbank.com/church-bell-s0135.html) | 0135.mp3 → church-bell.ogg / .mp3 | CC0 1.0 |

The [BigSoundBank licence page](https://bigsoundbank.com/licenses.html) explicitly permits editing, redistribution and commercial use for its marked free/royalty-free sounds, under CC0. The Kenney licence texts explicitly permit personal/commercial use. The OpenGameArt pages above list CC0 for the actual selected files. These are source declarations, not a new permission granted by this project.

## Required music attribution and modifications

Phoenix (2026) by Scott Buckley — released under CC-BY 4.0. www.scottbuckley.com.au.

The attribution, source link, licence link and modification notice appear in the game's Credits tab (main menu, header/mobile Menu and guide), Audio settings → Music & sound credits, the packaged `/audio/credits.html`, README and per-file inventory. Changes: loudness adjustment, resampling, codec conversion, a two-second circular tail/head loop crossfade. This is sourced music, not a composition by the Ashfall team. CC BY credit does not imply the composer endorses this game. Scott's site also asks video uploaders to put attribution in their video description; preserve this credit when publishing captured gameplay.

CC0 attribution is optional; creator credits/source links are retained for transparency. Paper/wood recordings are normalized/transcoded; some playback cues apply filtering/rate changes. Environmental extracts have an offline circular crossfade. Result tracks use their closing eight/nine seconds with fades. Exact offsets, processing and output hashes are recorded for every codec file in AUDIO_ASSET_CREDITS.csv.

## Acquisition evidence and rejected candidates

`docs/audio-source-records.json` records the actually observed download URLs, dates, hashes and source pages. Kenney's signed URLs expire; the source pages supply fresh links. Do not invent replacement CDN paths. The inventory maps each archived Kenney entry and each source download to its actual local output filename.

These proposed sources are not shipped:

- [Dark Shrine Loop](https://opengameart.org/content/dark-shrine-loop): CC0; a qubodup remix of yd's Shrine, described as LMMS-made. Different musical direction chosen.
- [Forgoten tomb ambience](https://opengameart.org/content/forgoten-tomb-ambience): kindland, CC0; tomb/labyrinth setting. Different environment chosen.
- [Card Game sounds](https://opengameart.org/content/card-game-sounds): HaelDB, CC0; source metadata reviewed, not imported.
- [Dungeon Ambience](https://opengameart.org/content/dungeon-ambience): yd, CC0; dungeon-exploration track not imported.
- [rain and thunders](https://opengameart.org/content/rain-and-thunders): uploader lists CC0, but describes third-party Best Service plugins in the thunder component. Underlying redistribution provenance not verified; omitted.

The candidate notes are source/metadata decisions, not a claimed subjective audition. No Mixkit music, copyrighted game soundtrack or generated AI music is included. No audio model/service generated any file for this update. Original downloaded recordings are outside the repository's runtime asset folder; only inventoried processed files and attribution are packaged.

## Historical programmatic work

The old 30-row synthesis inventory, report, licence explanation and code are archived in docs/audio-history. Current synthesis generators are retired; retained programmatic elements are DSP/playback code (gain envelopes, filters, rate control, ducking and limiting). They are not new externally composed/recorded assets. Overall project code ownership, competition declaration sign-off and unrelated artwork rights still require the team's existing review.

The synchronized event-effects follow-up reuses these licensed sources. The two additional lock/resonance edits use the already acquired, hash-verified laleksic pack, not a new guessed URL. Both are CC0; no additional attribution obligation or BGM licence change was introduced. They were normalized to -23 LUFS / -8 dBTP, converted to mono 44.1 kHz, faded and encoded as Ogg/MP3. Exact playback events and hashes appear in AUDIO_ASSET_CREDITS.csv and the implementation report. No new subjective audition is claimed.

The tonal glow follow-up includes JaggedStone’s actual downloaded magical_2.ogg and magical_4.ogg (CC0). Original source links and hashes are recorded; edited outputs are glow-rise and glow-reveal codec pairs, normalized/resampled/converted to mono, with short fades and the second file trimmed to 2.4 seconds. The supplied YouTube reference is not an imported asset and has no invented permission or licence entry. Its audio was not auditioned here.
