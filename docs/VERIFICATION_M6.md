# Milestone 6 verification

Executed October 16, 2026 on Windows with Node 24.18.0, npm 11.16.0,
Vitest 4.1.12, Vite 7.3.7 and installed Microsoft Edge. Historical milestone
evidence is preserved in `VERIFICATION_M1.md` through `VERIFICATION_M5.md`.

## Commands and results

- `npm test`: **119 passing tests in 11 files**.
- `npm run typecheck`: passed the shared build and strict server/client checks.
- `npm run build`: passed all workspaces. Production client output is 127.09 kB
  JavaScript (36.73 kB gzip) and 16.17 kB CSS (4.46 kB gzip).
- `npm run play`: served the client on 5173 and Socket.IO server on 3001;
  `/health` returned `{"ok":true,"milestone":6}`.
- `npm run test:browser`: passed in six isolated Edge contexts; this shuffled run
  exercised 12 action-card plays, two chosen reveals, a ward and Human victory.
- `npm run test:browser:transfer`: passed in six isolated Edge contexts against a
  trusted in-process setup. The active browser selected a Cinder Shift card, both
  players, and both face-down slots through the real UI.
- `npm run test:browser:night`: passed through two real 45-second deadlines,
  protection, attack death, two Dawns, and Days 2/3.
- `npm run test:browser:lifecycle`: passed for forfeit, reconnect, rematch,
  replacement admission, refresh recovery, mobile navigation, and offline privacy.

No separate lint command is configured. Strict TypeScript and unused-symbol
checks are enabled. Development services were stopped after verification.

## Transfer and privacy evidence

`transferIdentities` validates every card, current owner, destination participant,
source/destination uniqueness, unrevealed state and complete slot exchange before
creating new state. Invalid batches leave input unchanged. The Cinder Shift day
action additionally validates the authenticated actor, current turn/revision,
owned action card, living non-self target, and one unrevealed slot from each owner.
Repeated command IDs cannot apply the exchange twice.

Pure tests confirm stable card totals and unique slots, sticky Witch history after
the Witch Seal moves, current-owner Constable authority, forged/revealed/self/dead
rejections, and immediate Witch victory when the exchange aligns every survivor.
The real Socket.IO test verifies that only the two new owners receive their updated
card IDs/kinds. Public Seal projections are byte-for-byte equivalent before and
after the hidden exchange; the other four clients receive neither hidden ID.

The deterministic browser test repeats the privacy assertions after using the
actual responsive controls. It also verifies that the action leaves the hand and
the transfer controls close. No gameplay bot or browser-only mutation path exists.

## Voice boundary

`deriveVoicePermissions` is a pure server policy. Disabled voice, unseated viewers,
dead players without an enabled dead lounge, and ordinary players at Night receive
no grants. Living players receive only the current lobby/council channel; living
historical Witches receive only the Witch channel at Night; game over uses council.
Grant lifetime is capped at five minutes. Tests cover these boundaries, including
Witch death isolation. A future provider adapter must still revoke active sessions.

No LiveKit dependency, provider account, token endpoint, microphone capture, audio
UI, or browser secret was added. Text gameplay remains complete when voice is off.

## Local startup failure resolved

The supplied screenshot showed a rendered Vite page with a disconnected Socket.IO
client. No service was listening on 5173 or 3001 at the initial check: the prior
Milestone 5 verification had intentionally stopped its dev processes, while the
already-loaded tab retained its page. `npm run play` now names the complete local
launcher, and `npm run doctor` checks both endpoints. In development, the client
error explicitly tells the tester to run the launcher and keep its terminal open.

## Review limits

No physical-phone or six-human social playtest was performed. Safari/iOS, Android
Chrome, Firefox, screen readers, real background/slow-link behavior, WAN hosting,
load testing and LiveKit integration remain unverified. The exact Cinder Shift
count and its balance need human playtesting. Rooms remain process-memory state;
server restart loses rooms and reconnect credentials. Only the tested six-player
variant is enabled, and no bots or advanced roles were added.

To review locally, run `npm run play` in `D:\digit7\ashfall-council` and keep that
terminal open, then open http://localhost:5173 in six fresh tabs or browser profiles.
Run `npm run doctor` in a second terminal if either page or room actions fail.
