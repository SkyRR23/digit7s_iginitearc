# Optional voice provider integration

Milestone 6 uses public text chat (silent at Night; dead players cannot send until game over).
There is no audio capture, provider dependency,
microphone permission prompt, voice UI, token endpoint, or browser secret.
`packages/shared/src/voice.ts` defines provider-neutral server and browser
interfaces plus the pure `deriveVoicePermissions` server policy. No provider
adapter or access-token endpoint is enabled. The core match must
remain playable with text or predefined communication if voice is unavailable.

Use a LiveKit SFU for up to ten participants later, never a ten-person full mesh.
The server authenticates the existing player session and computes channel access
from phase, living status, and historical Witch alignment. A client request
must not supply a trusted role, permission list, or Witch channel selection.

Implemented provider-neutral policy:

- Lobby: seated participants can publish and subscribe in the lobby channel.
- Day/council: living players can speak/hear the shared council.
- Night: ordinary living players have no voice access; living Witch-aligned
  players may join only the authorized private Witch channel. Constable ability
  alone never grants Witch access. Silence precedes each private transition.
- Dead: no publish/subscribe in living or Witch channels; an optional isolated
  dead lounge can be enabled later. Spectators never receive Witch access.
- Game over: seated players may use a shared post-match council channel.

The policy denies access when voice is disabled, the viewer is unseated, the
requested lifetime is invalid, or the current phase grants no channel. Grants
expire within five minutes. These returned permissions are inputs to a future
server-side provider adapter; they are never accepted from a browser request.

Use separate SFU rooms or enforced subscription grants so a browser cannot
subscribe to forbidden tracks. On every phase/death/ownership/reconnect change,
recompute permissions and revoke old subscriptions before issuing new access.
Token expiry alone is not sufficient to remove an already connected participant;
the provider adapter must enforce revocation for active sessions. Account for
old sockets and duplicate tabs. Short-lived tokens contain only required grants;
provider API secrets stay on the server. Never log tokens.

Provider milestone UI includes microphone enable/disable, mute/deafen, device selection,
connection state, denied-permission recovery, and a clear indicator of who can
hear the current channel. Touch controls meet the same 44px target requirement.
If token issuance or the SFU fails, show a text fallback; do not block the game.

Tests before shipping: forged channel/role requests, dead-player restrictions,
phase switch with active tracks, stale tokens, reconnect/duplicate-tab eviction,
Witch+Constable access, ordinary Constable denied Witch audio, SFU outage,
microphone denial, and ten-device bandwidth/latency. Configure the provider's
current SDK and grants from official documentation at implementation time.
