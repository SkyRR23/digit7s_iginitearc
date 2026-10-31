ASHFALL COUNCIL - PRODUCTION GAME

LOCAL PLAY (Windows, macOS or Linux)
1. Install Node.js 22.12 or newer (Node 24 recommended).
2. Extract this ZIP completely. Open a terminal in the folder containing package.json.
3. Run: npm install
4. Run: npm run play
5. Open http://localhost:3010/ in your browser. Keep the terminal open.

This starts BOTH the production web page and multiplayer server.
No build command or manual environment variables are needed for local play.
Port 3010 avoids the source project's development backend on port 3001.
To stop, press Ctrl+C. This local launcher listens only on this computer.
For local multiplayer tests, use separate browser profiles/contexts and the same URL.
Hosted access from other devices requires deployment with a trusted HTTPS domain.

CPANEL
Use app.js as the startup file, Production mode and Node 24.
Set ALLOWED_ORIGINS to your exact HTTPS origin. Extract into the application root.
Install production dependencies and restart. Do not use play.cjs for hosting.
On the supplied CloudLinux account, copy vendor/ into
/home/ignitearc/nodevenv/ashfall-council/24/lib/ before Run NPM Install,
because its installer resolves the local tarball from that directory.

This game requires a Node backend. Opening public/index.html directly or using
static-only hosting does not provide multiplayer. Rooms are held in memory;
restarting the server ends active matches.

CREDITS
Preserve the in-game Credits and bundled public/audio/credits.html and notices.
Required attribution: Phoenix (2026) by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au
Modified with loudness adjustment, resampling, Ogg/MP3 encoding and a two-second circular loop crossfade.
See the included recording inventory and licence links for all other sources.

Dependency audit warnings remain documented in the source repository. Do not
use npm audit fix --force without compatibility testing. Packaging does not
guarantee competition eligibility or resolve the separate originality review.
