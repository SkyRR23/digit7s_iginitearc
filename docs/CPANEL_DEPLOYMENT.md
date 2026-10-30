# Ashfall Council — cPanel deployment handoff

Prepared 30 October 2026. **Upload-ready; not deployed.** No hosting files or settings were changed. The connected browser exposed only localhost; the supplied screenshot establishes the form fields, hostname and selected Node version, not live SSL or successful app access.

## Release files

- Source/runtime commit: `237bd9dd5621` (prior rollback checkpoint `f653719`). Later documentation/test commits do not change these runtime bytes.
- Upload ZIP: `release/AshfallCouncil-237bd9dd5621-cPanel.zip`.
- Competition ZIP: `release/AshfallCouncil-237bd9dd5621-Competition.zip`.
- Both ZIPs contain the same runtime. Each is **10,663,642 bytes**, under 200 MB. Neither includes node_modules; install the locked dependencies on the target before running.
- Extracted runtime/configuration: **11,206,912 bytes**, 62 files plus `release.json`.
- Layout: `app.js`, `package.json`, `package-lock.json`, `release.json`, `public/`, `server/`, `packages/shared/`.
- Frontend build: `apps/client/dist`; backend: `apps/server/dist`; shared runtime: `packages/shared/dist`.
- `app.js` is the actual included CommonJS Passenger bootstrap, loading the existing compiled ESM server. It sets STATIC_DIR to the package's public folder. No second game server or voice subsystem is created.

## Cleanup and preservation

Inspected 96 public files (153 MB before cleanup). Included 31 runtime artwork files, **10,545,089 bytes**; excluded 65 source-art/concept/screenshot/unused alternative files. The full excluded list is [excluded-assets.txt](deployment/excluded-assets.txt). Original public files remain unchanged and version-controlled. The build copies an explicit dynamic card/role list plus literal artwork references discovered in built CSS/JS/HTML; missing assets fail the build. Development still serves the complete original public directory.

Large source PNGs, rejected portraits, concepts and obsolete walkthrough screenshots are excluded. Current optimized WebP files and the Curse SVG retain their original bytes, dimensions, alpha and quality. Two PNGs still referenced by imported CSS are conservatively retained. CSS minification and JS production minification remain Vite defaults; no source maps are enabled. No test suites or historical records were deleted; no dependencies were removed from source manifests.

The deployment manifest installs only Socket.IO and the local compiled shared package (which requires Zod), with exact installed versions in a standalone production lockfile. Build/test tooling is absent from the deployment. Root development lockfile is preserved.

**Security limitation:** Zod remains 3.25.76. The prior/current advisory affects that branch; no compatible patched 3.x version was established. The advertised fix is a major upgrade. No forced update was made. Server packet limit remains 4096 bytes plus existing schema/rate limits. `npm ci` reports one high advisory; do not describe the dependency audit as clean.

## Exact form values from your screenshot

| cPanel field | Value |
|---|---|
| Node.js Version | **24.22.1**, shown in your screenshot. Runtime declaration remains ≥22.12.0; do not select 14.21.3 |
| Application Mode | **Production** |
| Application Root | **ashfall-council** (relative to account home; expected `/home/ignitearc/ashfall-council` from screenshot account path) |
| Application URL | Select **ambitious-cyan-tortoise.199-188-200-124.cpanel.site** |
| URL path textbox | **Empty**, so application is at `/` |
| Application Startup File | **app.js** |
| Passenger Log File | **/home/ignitearc/ashfall-council/passenger.log**; use an account-writable log path if the form rejects it |
| Environment: NODE_ENV | **production** (Production mode normally adds it) |
| Environment: ALLOWED_ORIGINS | **https://ambitious-cyan-tortoise.199-188-200-124.cpanel.site** — exact origin, no trailing slash |

Use the hostname actually assigned to you if it differs; change ALLOWED_ORIGINS to match. The proposed public URL is `https://ambitious-cyan-tortoise.199-188-200-124.cpanel.site/`. Its certificate/reachability is **not verified**. Do not bypass certificate warnings.

Do not set PORT to a guessed value. Passenger intercepts/assigns the listener; outside Passenger the existing server uses numeric PORT, default 3001. HOST defaults to 127.0.0.1. STATIC_DIR is assigned by app.js. There are no required API tokens, database settings, voice credentials or secrets. The example file `deployment/.env.example` is documentation; startup does not automatically load .env files.

**Root-path deployment required for this build.** Its artwork, compiled assets and Socket.IO use root URLs. If hosting mandates a path such as `/ashfall/`, stop and prepare/test a matching base-path build rather than pasting that path into the form and assuming it works.

## Upload steps

1. Keep any existing unrelated applications/files intact. If `ashfall-council` already contains an older deployment, download/retain it and its settings first; do not extract over an unrelated app.
2. Open **Setup Node.js App → Create Application**. Enter the values above and add ALLOWED_ORIGINS. Review them, then **Create**. Creating/restarting modifies the hosting service; if an agent performs those remote steps it must obtain the approval requested in this deployment task first.
3. In **File Manager**, navigate to `/home/ignitearc/ashfall-council`. Upload `AshfallCouncil-237bd9dd5621-cPanel.zip` there and extract **into that directory**. The ZIP has files at its root: `app.js` and `package.json` must be directly inside the application root, not inside a second nested folder. Replace only the generated placeholder files for this new application.
4. Return to the application's management page and choose **Run NPM Install** / **Enable Dependencies** as offered. The package contains no lifecycle install scripts. If cPanel Terminal is available, use the activation command displayed by that application, `cd /home/ignitearc/ashfall-council`, then `npm ci --omit=dev --ignore-scripts`. Do not copy Windows node_modules. No server-side build is required.
5. Confirm Node.js 24.22.1, Production, app.js and ALLOWED_ORIGINS. Choose **Restart** (or Start where offered).
6. Inspect `/home/ignitearc/ashfall-council/passenger.log`. If startup reports missing modules, dependency installation did not complete. If it reports missing ALLOWED_ORIGINS, add the environment variable and restart. If ESM errors appear, confirm startup is **app.js**, not server/index.js. If cPanel only offers application-manager restart via `tmp/restart.txt`, use the documented restart mechanism or the UI; do not manually start a duplicate Node process.
7. Open the exact HTTPS URL. Verify a trusted certificate, then `/health` returning `{ "ok": true, "milestone": 6 }`. Verify that the menu and all current images load. Server logs must not contain startup errors.
8. In two separate browsers/devices create/join the same room. Test readiness, bots, private reveal, cards, Draw 2, Night, result and rematch. Refresh a participant and confirm seat recovery. Use a second room to confirm isolation. Include a real Android/iOS browser; local emulation does not prove this.
9. In browser Network tools, Socket.IO should start with a polling handshake and may upgrade to WebSocket. A working polling-only local test is recorded; **hosted** polling must also be verified. A 502/403/404, failed upgrade plus failed polling, mixed content or repeated disconnects requires proxy/hosting correction. Do not force transport settings to hide it.
10. Keep one Node application instance/worker for these in-memory rooms. Multiple independent workers without sticky routing/shared state break rooms. Ask the provider to confirm Passenger process count/routing and idle/restart behavior; this cannot be inferred from the form. Restarting the process ends all active matches and invalidates reconnect sessions. Deploy during downtime.

Official operational references: [cPanel Application Manager](https://docs.cpanel.net/cpanel/software/application-manager/), [installing Node.js applications](https://docs.cpanel.net/knowledge-base/web-services/how-to-install-a-node.js-application/), [Passenger restart procedure](https://support.cpanel.net/hc/en-us/articles/1500002443862-How-to-restart-an-application-that-s-using-cPanel-s-Application-Manager), [Passenger Node quickstart](https://www.phusionpassenger.com/docs/tutorials/quickstart/node/). The CloudLinux-style form shown may use different button labels; follow the actual app controls.

## Executed local verification

- Production build and strict TypeScript passed.
- All 202 tests passed. A pre-existing randomized timer test initially chose an Evil Life and ended the match; its fixture now deliberately chooses Good when testing turn resumption. No game rule was changed.
- A clean **npm ci --omit=dev --ignore-scripts** in the generated standalone directory succeeded; one existing high advisory remains.
- `node tests/production-package.mjs release/AshfallCouncil-237bd9dd5621` passed: 62 file hashes checked, all public asset URLs HTTP 200, private package manifest HTTP 404, traversal attempt HTTP 403, real six-seat WebSocket create/join/start/draw/reconnect/isolation, ten-seat polling-only equivalents, production phone guide loads Curse SVG without page errors. Evidence: `test-results/production/package-result.json`, `package-phone.png`.
- These tests used localhost HTTP and installed Edge, **not Passenger, live HTTPS or physical mobile hardware**. They verify the package, not the hosting configuration. Prior audit's extensive Night/results/rematch checks remain documented separately; the package smoke does not claim a fresh full-match browser run.
- No hosting upload, SSL change, remote installation or restart was performed. The upload-ready package has not yet been compared with a live deployment.

## Competition ZIP and final consistency

The Competition ZIP intentionally contains the backend runtime and installation manifests, because static files alone cannot run multiplayer. It excludes development code, source art, docs, tests, credentials and Git history. It needs Node.js and npm dependency installation and is **not an offline/static-only build**. Ask the organizers to confirm how they want this server-dependent backup submitted; do not claim it is a standalone static export. Submit source/history, declarations, screenshots, licenses and demo separately.

Before Final Submit: verify uploaded release.json names source `237bd9dd5621`, verify the live build matches these ZIPs, select the matching source commit in the private repository, grant announced reviewer access, and record live HTTPS and mobile test results. The October 31 23:59:59 Myanmar deadline and outstanding originality/asset-rights review remain as recorded in the audit. No submission/hosting acceptance is implied by these packaging tests.
