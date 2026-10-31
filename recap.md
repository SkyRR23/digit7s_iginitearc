# Ashfall Council — development recap

Date: October 28, 2026

## Project and purpose

- Private GitHub repository: https://github.com/SkyRR23/digit7s_iginitearc
- Local project folder: `D:\HeinLin\digit7s_iginitearc`
- Browser preview: `http://localhost:5173/`
- Goal: improve the local Digit7s game-jam build, especially animation, readability, teamwork and player controls.
- Online hosting was deferred at the owner's request.

## Controls and game readability

- Added drag-to-play cards with eligible target highlighting and confirmation before spending a card.
- Phone controls support a short hold to drag, quick swipes to browse, and tap-to-select.
- Moved role-power use to a corner icon: select the power, select an eligible player, then review the description and answer Yes or No. Gossip selects two players.
- Added sun and moon symbols with plain Day and Night labels.
- Added clear actor and recipient information to card close-ups, including both Scapegoat transfer endpoints.
- Added glowing green actor/target name tags and PLAYED / TARGET labels on the table.
- Ashbound see their teammates during the private opening and through red ALLY markers during play.
- The current turn uses green name lighting and a drifting dust effect; reduced-motion settings suppress drifting particles.
- Corrected action-panel, target-panel and draw/discard pile overlaps, with phone and landscape layout checks.

## Animation and presentation

- Added illustrated close-ups inspired by Darkest Dungeon's impact and atmosphere, using the project's existing artwork and original ink/glow effects.
- Added colored background auras that fade before the foreground content disappears.
- Card and private-power scenes last 6.5 seconds; phase/verdict scenes 6 seconds; deaths 7 seconds; victories 8 seconds.
- Added Keep open, Next and Back to table controls, plus access to card information during a close-up.
- Opening presentation now uses separate screens: full role portrait, Ashbound teammates where applicable, then private Life cards. Ashbound allegiance uses red glow; others use gold.
- Life reveals first announce the owner's name, then show a full public Life portrait, then identify the exact numbered position in the five-card row.
- Added the “Ashbound still live among us” follow-up when no Ashbound Life has been publicly caught and the match has not ended.
- Added motion and sound preferences.

## Gameplay pauses during close-ups

- Added an authoritative server pause, rather than only a visual browser overlay.
- Player actions and bot actions stop while the presentation is being read.
- The phase timer preserves its remaining time and resumes from that value.
- Players who finish early wait for the other connected readers.
- Private powers show their details only to the owner; others receive a neutral waiting screen.
- Added reconnect/disconnect handling and stale-presentation protection.
- Added an absent-reader safety limit: at least 45 seconds, or the planned sequence plus 15 seconds when longer.
- Sleuth retains its intentional exposure countdown. Whisper insight lifetime is preserved across presentation pauses.

## Rules and deck changes

- Targeted cards generally require another living player, encouraging interaction and teamwork. Scapegoat uses two other players; Conspiracy affects the living council globally.
- Scapegoat now transfers all Doubt and active attached effects, including Hearts, Bound, protections, Black Cat and Herbalist remedy, with duplicate-effect and remedy ownership handling.
- Added private opening Black Cat voting for Ashbound. The selected holder starts Day 1.
- Conspiracy reveals a random hidden Life on the current Black Cat holder before shifting Life cards. Scapegoat moves the marker; Curse removes it.
- Rebalanced the 83-card deck toward pressure: 38 Evidence and 6 Witness, with fewer utility/power cards.
- Preserved the distinction between fixed roles and movable Life cards. Lanternkeeper protection belongs to its hidden Life card.

## In-game help

- Added a corner question-mark field guide with three tabs:
  1. Roles & portraits: all seven roles and their explanations.
  2. Cards & effects: all 14 playable cards, target rules and interactions, plus the opening Black Cat marker.
  3. How to play: eight illustrated steps using demonstration-match screenshots.
- Replaced cluttered guide captures with focused screenshots.
- Kept the guide tabs and close button accessible while scrolling the card library.

## Verification completed

- 176 automated tests passed across 20 files.
- Production build passed.
- Six-player and ten-player browser flows passed, covering cards, powers, reveals, Night, Dawn, deaths, reconnects, voting and rematches.
- Desktop, phone and short-landscape presentation/guide checks passed.
- Teammate privacy, ally/turn colors and ten-seat bot-lobby checks passed.
- 100 bot matches completed with zero stalls/crashes and zero invalid bot actions: 38 Village wins and 62 Ashbound wins.
- Local server and browser health checks passed at the end of implementation.

## GitHub upload

The complete update was committed and pushed to `main`.

- Commit: `25a4a2db9390e11980f4db2831ed09ee79af13e2`
- Title: Improve game presentation, controls, and action readability
- Link: https://github.com/SkyRR23/digit7s_iginitearc/commit/25a4a2db9390e11980f4db2831ed09ee79af13e2
- Upload contained 62 changed files, including code, artwork, guide images, documentation and tests.
- GitHub's branch was verified to match the local commit. The working tree was clean after the push.

## ZIP backup and shared-PC cleanup

- Created an archive named `version 0.2.0.zip` from the committed project.
- Archive root: `digit7s_iginitearc-0.2.0/`.
- Verified 201 files and ZIP integrity; size approximately 117.1 MB.
- Excluded dependencies, build output, Git history, local test results and environment secrets.
- The version number was used for the archive name; package-version changes or a GitHub release were not part of this step.
- Original ZIP location was `D:\HeinLin\version 0.2.0.zip`. When this recap was created, that path no longer contained the ZIP. It may have been moved or removed; check the saved copy before relying on it.
- The owner discussed deleting the local project because this is a school library PC. No project deletion was performed in this conversation. The project folder still exists when this recap was written.
- Before leaving the shared PC, sign out of GitHub and remove saved GitHub credentials.

## Continuing development

Clone or pull the private repository on the next computer using an authorized GitHub account. The latest uploaded work is on `main` at the commit above.

Further implementation notes are in `README.md`, `docs/GAME_FEEL.md` and `docs/ACCOUNT_HANDOFF.md` inside the repository. Hosting remains deferred; continue local gameplay and playtesting work as needed.

This recap was created separately from the repository and has not been committed or uploaded to GitHub.
