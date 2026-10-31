# Ashfall Council audio implementation

Prepared 30 October 2026. Local source implementation; not yet uploaded to hosting or included in a new release ZIP.

## Architecture

`apps/client/src/audio.ts` owns one lazy AudioContext per tab. Music, ambience and SFX have separate gain buses feeding Master and a dynamics compressor. Pointer or keyboard interaction creates/resumes audio; browser restrictions and unsupported APIs are caught without blocking gameplay. Preference storage failures are harmless. There are no audio downloads, decoding dependencies or loading spinners. Existing packet formats, gameplay, animation timing and private-state rules are unchanged. No microphone or voice functionality is added.

Five scene beds crossfade for two seconds. Old noise/oscillator sources stop after the fade and disconnect their outputs. A four-second mono random buffer is reused. Scene updates are idempotent, so repeated state/reconnect updates do not layer another bed. Music uses quiet sine partials; environment uses filtered noise and slow breath modulation. Night has a lower drone and a darker breath-like texture; it contains no intelligible speech. Results use a quiet bed and an accompanying personal victory/defeat chord. Allegiance comes from authorized private Life history, not the role name; Outcast victory uses the server's winning player ID. Spectator results use a neutral celebratory cue when private allegiance is unavailable.

Defaults: Master 70%, Music 15%, Ambience 20%, SFX 65%. Common UI envelopes are much softer than rare event envelopes. Important cues duck both beds and restore them gradually. Mute and four sliders persist via `ashfall.audio.v1`, migrating the old mute flag. Settings use a native keyboard-accessible modal with labelled sliders. Hidden documents suspend the context and skip cues; return resumes only an already-initialized context. Each browser context mixes locally; no audio packets are transmitted.

## Soundtrack and sound effects list

### Background music

Menu: 73.416 Hz root. Lobby/result: 65.406 Hz. Day: 82.407 Hz. Night: 55 Hz. Each has three restrained harmonic partials. These are continuous synthesized beds, not recorded cinematic scores.

### Environmental ambience

Five scene variants of filtered wind. Lobby remains gentle; Night lowers playback rate, moves the bandpass and speeds breath modulation for distant whisper-like tension. Scene fades affect music and environment separately while preserving their independent controls.

### Interface effects

Hover/keyboard focus, click, card selection, private Life selection and Reveal all use short tonal/parchment cues. Opening details never plays a card. No hidden identities are encoded into public sound selection.

### Gameplay effects

Draw follows the server-approved DRAW animation. Placement and specialized Curse, Council Bell, Whisper, Eavesdrop, protection and shift sounds occur on the card close-up; when there is no close-up, the existing table animation schedules them instead. Public reveal sounds occur at the portrait reveal stage. Elimination and phase transition cues follow their visible close-up. Accusation stamps follow each visible X; cleansing follows removed X marks. Personal result chords follow the victory close-up. SFX duration ranges from 0.18 seconds for common cues through 0.8 seconds for supernatural textures to 1.5 seconds for dramatic cues and 2.5 seconds for the bell. This changes no visual duration or server deadline.

## Deduplication and lifecycle

Existing server event IDs and handled presentation IDs gate table/close-up playback. The manager additionally rate-limits identical cues (hover 120 ms, stamps 75 ms, other cues 220 ms). Historical effect snapshots do not generate table SFX on reconnect. Install is idempotent. Oscillators/noise voices stop and disconnect, and the cooldown map is bounded. Different cues may intentionally overlap, for example a landing and accusation stamp. No recording or external audio file is loaded, so there is no missing-media failure path.

## Verification

`node tests/audio-browser.mjs` passed in real headless Edge with gesture-required autoplay: zero contexts before interaction; one context after repeated unlock/install; idempotent scene updates; all 20 cues exercised; repeated bell suppressed; muted cue skipped; volume/mute persistence on reload; independent browser contexts; visibility-handler suspend/resume; no page errors. The visibility test dispatches a controlled visibility event; it does not claim physical-device background behavior. Evidence: `test-results/audio/browser.json` (local ignored output).

Strict TypeScript, the final production build and all 202 existing tests passed. The first sandboxed Vitest invocation failed before loading any tests because Windows denied temporary-cache renames; the authorized rerun outside that sandbox passed all suites.

`node tests/audio-ui.mjs` passed against the actual compiled client/server at 1280?720 and 360?640: four working sliders, dialog within viewport, mute reflected in the existing toolbar, create room/fill bots/ready/start, no browser page errors. Screenshots and JSON are in `test-results/audio/`. These are UI smoke checks, not a new full-match human audio playtest.

## Limits and release steps

No external recordings are missing: all listed sounds are implemented procedurally. Subjective headphone/speaker listening, real iOS/Android autoplay/background testing, and a fresh full human multiplayer audio session remain necessary. Headless audio execution proves API behavior, not perceived cinematic quality. Optional professionally recorded ambience/music is not claimed as included. This source change does not update the previously uploaded cPanel release; generate and verify a new package before deploying. Existing cPanel vendor-copy workaround and HTTPS certificate issue are separate deployment concerns.
