# Ashfall Council ? submission and release instructions

Prepared 31 October 2026. This repository is the source project. Production archives are generated separately; the source ZIP is not a static-only playable export.

## Play and review

Browser multiplayer supports 6?10 seats with human players and bots. Create a room, share its code, fill empty seats with bots if desired, ready up and start. The optional main-menu handbook includes an interactive tutorial. Normal matches have a 90-second private inspection and a separate 30-second opening Curse ritual. Gameplay, identities and multiplayer actions are server authoritative. Audio unlocks after interaction; sound, motion and help controls are available in the menu. No installation is needed for players using a hosted game.

## Run the source

Use Node.js 22.12 or newer (Node 24 recommended) and npm. From the repository root:

```text
npm ci --include=dev
npm run play
```

Open http://localhost:5173/. Keep the process running. For verification use `npm run typecheck`, `npm test` and `npm run build`. Source build outputs are apps/client/dist, apps/server/dist and packages/shared/dist.

## Production / cPanel

Use the freshly generated AshfallCouncil-<commit>-cPanel.zip from release/. The matching Competition.zip contains the same runtime. Extract into the application root without a nested directory. Install production dependencies, select Production mode and Node 24, use app.js as startup file, and set ALLOWED_ORIGINS to the exact HTTPS origin without a trailing slash. Deploy at the domain root; this build is not configured for a URL subdirectory.

The package contains compiled public/server/shared files, vendor/ashfall-shared-0.1.0.tgz, manifests and release.json. Do not upload Windows node_modules. This CloudLinux cPanel account resolves local npm archives relative to /home/ignitearc/nodevenv/ashfall-council/24/lib: copy the extracted vendor folder into that directory before Run NPM Install. Keep the original application-root vendor folder. Restart afterward. Check /health for {"ok":true,"milestone":6}, then test actual room creation/joining, private opening, cards, Night, results and reconnect.

Runtime rooms are in memory. Restarting clears matches; use a single application instance. A trusted HTTPS certificate and working Socket.IO polling/WebSocket transport must be verified on the host. A successful build or /health response does not prove complete hosted gameplay or certificate validity. This task does not automatically deploy the new ZIP.

## Submission materials and credits

Preserve the complete required Scott Buckley attribution and modification notice in README.md, in-game Credits and AUDIO_LICENSES.md. AUDIO_ASSET_CREDITS.csv inventories the shipped recordings. Imported music is externally authored. AI use is documented in docs/AI_USE_DECLARATION_DRAFT.md and requires team review/sign-off. Historical recaps, tests and design records remain in the repository as development evidence but are excluded from runtime archives.

Consult docs/FINAL_SUBMISSION_AUDIT.md for outstanding originality/licensing and competition-review findings. Documentation cleanup is not legal clearance or a guarantee of eligibility. Confirm organizer requirements for the Node-dependent competition ZIP: static files alone cannot run multiplayer. Supply the live HTTPS URL and any requested declaration, demo, screenshots and reviewer access separately. Verify the submitted archive and deployed version match release.json before final submission.
