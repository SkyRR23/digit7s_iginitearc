# Ashfall Council — account and GitHub handoff

Use this file when continuing development from another Codex account. It records the project state and the design decisions from the original conversation. The repository is the source of truth for implementation details; inspect it before making changes.

## Start here on the new account

1. Clone the GitHub repository and open its root as the workspace.
2. Read this file, `README.md`, `docs/digital-ui-overhaul.md`, and `docs/ARCHITECTURE.md`.
3. Run `npm ci`, then `npm run play`. The client is at `http://localhost:5173`; the server health endpoint is `http://127.0.0.1:3001/health`.
4. For code changes, use `npm run typecheck`, `npm test`, and `npm run build`. The digital UI browser flow is `npx tsx tests/digital-ui-browser.ts` (see `docs/digital-ui-overhaul.md` for its setup and coverage).
5. Preserve the existing game rules and privacy boundaries unless the owner explicitly requests a mechanics change.

Node.js 22.12+ is required. This is an npm workspaces TypeScript project: `apps/client` is the Vite/DOM client, `apps/server` is the Socket.IO room server, and `packages/shared` contains wire contracts and game rules.

## Current project state

October 28 continuation: see `docs/GAME_FEEL.md` for the local animation and
direct role-power pass, including the owner's authorized change that targeted
cards and role powers require other players. The earlier self-targeting rule is
superseded. No online hosting was added.

The follow-up pass adds private Ashbound teammate names at match start and in
private reference panels, red ALLY name tags during play, and green active-turn
names with drifting dust. Available powers and valid targets have subtle glow.
Team markers use only server-authorized living ally IDs and respect converted
allegiances, neutral Scapegoats, deaths, reconnects, and rematches.

The owner's subsequent mechanics change is implemented: Scapegoat transfers all
Doubt and attached effects, including Hearts, Black Cat, protections, Bound, and
remedies. Ashbound seal an opening Black Cat vote in the private Life reveal;
the cursed player starts Day 1. Conspiracy reveals a random Life card on the cat
holder before shifting; Curse removes the marker. See `docs/GAME_FEEL.md` for
the exact digital voting and duplicate-effect rules. Card and private-power
close-ups now label recipients, and the action panel/pile overlap is corrected.

The next readability pass uses 6–8 second cinematic scenes with Keep open, Next,
and Back to table. Life reveals announce the owner, show a full public Life
portrait, and then give the exact five-card position its own six-second scene.
The event aura fades before the foreground. Opening role portrait, Ashbound team,
and Life cards are separate private screens with red/gold allegiance glows.
The corner question mark opens an illustrated three-tab field guide with roles,
all 14 cards and their interactions, and how to play; bundled
screenshots come from demonstration matches and exclude unrelated overlays.
The 83-card deck now has 38 Evidence / 6 Witness and fewer utility cards.

Close-ups now pause the authoritative server: players, bots and phase timers wait
until connected readers finish, then the exact remaining time resumes. Early
finishers see a neutral waiting screen; private powers share no role or target
details with other players. Reconnect replays only an unfinished current scene.
Absent readers have a 45-second minimum safety limit. Green PLAYED/TARGET name
tags identify public card actors and recipients, while red ALLY badges remain.

- A playable 6–10 player vertical slice is implemented, including human and server bot seats, private Life cards, 14 playable action cards, Day turns, Night choices, voting, Dawn, victory checks, reconnect recovery, and rematch lobbies.
- The **digital UI overhaul has already been implemented in code**. It is not only a set of mockups. `docs/digital-ui-overhaul.md` describes the live components, art assets, responsiveness, privacy handling, and browser verification.
- The current role set is Villager, Ashbound, Sleuth, Herbalist, Gossip, Hexer, and Scapegoat. The client has individual role illustrations and symbols in `apps/client/public/art/roles/` and `apps/client/src/role-art.ts`.
- Individual playable card illustrations are in `apps/client/public/art/cards/`. Source PNGs and optimized WebP siblings are tracked. `apps/client/public/art/digital-village.png` is the digital scene background.
- The earlier concept PNGs are retained as design references in `apps/client/public/art/concepts/`. They are not embedded as whole-screen UI backgrounds.
- As checked for this handoff, branch `main` has one local commit, `4483903 Initial Ashfall Council project snapshot`. The working tree was clean before this handoff file was added. Recheck `git status` before committing or pushing.

## Game and UX decisions to preserve

**Roles and Life cards are different layers.** A role is the player's fixed private ability or win condition and has its own humanoid chibi illustration and symbol. Five hidden Life cards determine allegiance and survival and may move between players through existing effects. Lanternkeeper is a special Life card whose protection travels with that card. Do not turn every role into a movable Life card without a new design decision from the owner. Do not infer a player's current allegiance from their role name.

**The interface should feel like a digital social deduction game.** The chosen direction is a cinematic Puritan village/meetinghouse scene, scratchy ink illustration, charcoal translucent HUD panels, thin lines, black/ivory/crimson palette, and clear condensed headings. The owner rejected thick board frames, physical seat mats, and a tabletop look for the main menu and lobby. Full-size card objects belong in the hand and private Life reveal; ongoing effects appear on player portraits.

**Gameplay interaction:** select a playable card, highlight eligible players, choose one or two targets where required, review a short effect preview, then confirm. Global Conspiracy needs no target. Playing a card does not end the turn; Draw 2 does. The centre area is an action spotlight, not a place for permanent played cards. Keep real phase and turn labels; the concept image's “Round 2 of 6” is placeholder text, not a rule.

**Card explanations:** hovering, keyboard focus, and touch inspection must explain each playable card using the implemented rules. Hovering must never play a card. Face-down public Life cards have generic details only; private identity must not leak through tooltips, labels, attributes, or art.

**Accusation and effects:** show red X marks beneath a player's Life row only when Doubt exists, with no empty X boxes. At seven Doubt, the server selects a random hidden Life card to reveal and the marks clear. Show Stocks as chains, protection as a shield/holy effect, and Vow of Hearts as a visible relationship between players. These are effects on the player, not persistent cards laid out in front of them.

**Privacy:** role chibi art and role name are private to their owner. Other players see public avatar/sigil and face-down Life cards until the rules reveal them. The role reveal and Life reveal are private screens; Life cards can be inspected, rearranged, covered, and confirmed. Server-side serializers and client UI both enforce the boundary; see `docs/ARCHITECTURE.md`.

## Visual references in the repository

The latest chosen concept screens are:

- `apps/client/public/art/concepts/ui-concept-05-main-menu-digital.png`
- `apps/client/public/art/concepts/ui-concept-06-multiplayer-lobby-digital.png`
- `apps/client/public/art/concepts/ui-concept-07-gameplay-digital.png`
- `apps/client/public/art/concepts/ui-concept-08-private-role-reveal.png`
- `apps/client/public/art/concepts/ui-concept-09-private-life-cards.png`

Role design sheets: `role-concepts-01-villager-ashbound-sleuth-herbalist.png` and `role-concepts-02-gossip-hexer-scapegoat.png` in the same directory. The `playable-cards-v2-*` sheets are the chosen card style: **black outer outline**, thin ivory inset, high-contrast ink illustration, and a clear lower title/effect area. Earlier unversioned playable-card sheets and `ui-concept-01` through `04` are historical explorations.

Production assets and generation notes are documented in `docs/digital-ui-overhaul.md`. The concept images guide the layout and style; actual interface text and mechanics come from the code.

## Where to work

- `apps/client/src/main.ts`: client composition, rendering, and multiplayer commands.
- `apps/client/src/digital-ui.css` and related CSS: current digital presentation and responsive layout.
- `apps/client/src/digital-stage.ts`: phase, turn, spotlight, and local Life area.
- `apps/client/src/day-panel.ts`, `card-info.ts`, `card-details.ts`: hand interaction and card explanations.
- `apps/client/src/role-panel.ts`, `role-art.ts`, `private-panel.ts`: private role and Life UI.
- `packages/shared/src/day*.ts`, `night*.ts`, `identities.ts`: authoritative game mechanics.
- `apps/server/src/`: rooms, transport, bots, deals, and roles.

`README.md` contains the full local play walkthrough and known scope limits. `docs/VERIFICATION.md` and `docs/digital-ui-overhaul.md` record test evidence. The repository has no separate lint command; use typecheck and build.

## GitHub transfer notes

This directory is already a Git repository. At handoff time its `origin` was `https://github.com/SkyRR23/digit7s_iginitearc.git`. **Check that this is the repository you intend to use before pushing.** If you create a different GitHub repository, update the remote URL there. No push was performed as part of creating this file.

The `.gitignore` excludes `node_modules/`, build output, `.env` files, logs, and `test-results/`. Concept PNGs, production art, source code, and docs are tracked. Browser screenshots under `test-results/` will not be included in the GitHub upload. The largest tracked files checked here were about 3.2 MiB, below GitHub's per-file limit.

Current scope limits include in-memory rooms, no accounts or public matchmaking, no configured voice provider, and outstanding physical-device and multi-human playtests. The current code should be reviewed before planning additional features; do not treat the historical concept images as unfinished implementation by themselves.

## Suggested first message on the new account

> Read `docs/ACCOUNT_HANDOFF.md`, `README.md`, and `docs/digital-ui-overhaul.md` in this repository. Inspect the current code and Git status before changing anything. This is the existing Ashfall Council game with a working digital UI overhaul. Preserve its rules, hidden-information boundaries, and 6–10 player support. I will tell you the next specific feature or design change after you have the context.
