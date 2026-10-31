# Audio provenance and licences

Prepared 30 October 2026. This inventory describes the implemented code, not an asset acquisition plan.

All 30 inventory entries (five scenes with two independently mixed layers, plus 20 cues) are synthesized in `apps/client/src/audio.ts`. There are no downloaded samples, external soundtracks, recorded speech, or AI-generated audio files in this implementation. No audio service/model generated recordings. Codex assisted in writing the synthesis code; the runtime browser creates the waveforms. Creator identity beyond this development record and final project code licensing require team confirmation. Do not describe these assets as CC0, Mixkit, Pixabay, Kenney or Freesound assets.

No third-party audio licence or sample attribution applies to these sample-free waveforms. This does not certify copyright ownership, legal clearance, competition eligibility, or the project's overall licensing. The team must review and sign its declaration. Web Audio is a browser API, not a licensed sound library.

Evidence: generating code in `apps/client/src/audio.ts`, hook changes in `table-effects.ts` and `game-moments.ts`, preferences in `game-preferences.ts`, and the complete row-by-row inventory in `AUDIO_ASSET_CREDITS.csv`. The previous separate bell/stamp generators were removed and consolidated; they are not extra assets used alongside this inventory. No external source/download links exist to supply. Historical visual assets have not been altered.

External recordings added later must include exact creator, download link, licence version, permissions, attribution and modification evidence before release. None are currently required to run the sound system.
