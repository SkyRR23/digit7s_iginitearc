# Game feel pass — October 28, 2026

This pass focuses on the local game-jam build: action readability, impact animation,
and direct role-power controls. Hosting and voice-provider integration are outside
this pass.

## Presentation

- Major server-confirmed card plays create an illustrated central close-up with the
  public actor, card, and target. Strong cards use a fast ink slash, impact hold,
  short camera jolt, and recoil. Existing Ashfall illustrations provide the art.
- Close-ups label the actor and each recipient with public avatar symbols and
  green name tags. The table repeats green PLAYED/TARGET tags for the last public
  card action; private role targets never enter the public roster. Red ALLY badges
  remain distinct. Scapegoat labels both transfer endpoints; Conspiracy says all living
  players. Private power recipients are captured only in the confirming browser
  and shown only after server acceptance. Private powers remain invisible to
  other browsers.
- The action spotlight has its own scrolling viewport and adapts to available
  panel height. Draw/discard art occupies a separate, padded row, including its
  rotated edges and counters, so it cannot cover targets or help text.
- Routine plays retain their shorter card flights and portrait feedback. The
  close-up queue is bounded to eight pending scenes, prioritizing Life reveals,
  exact-slot views, deaths, and verdicts over routine cards during bursts.
- Card and private-power close-ups last 6.5 seconds, phases and verdicts 6 seconds,
  deaths 7 seconds, and victories 8 seconds. Quiet Motion preserves reading time.
  Keep open pauses the current scene; Next advances a scene or reveal stage;
  Back to table finishes your presentation queue. The server pauses gameplay,
  bots, and phase timers throughout the complete sequence and waits for connected
  human readers. The saved remaining time resumes without a fresh full turn.
  Readers who finish early see a waiting screen. An absent-reader safety limit
  is the longer of 45 seconds or the planned sequence plus 15 seconds.
- A strong event-colored aura and original ink rays sit behind the artwork.
  The aura holds, fades from 68% to 88% of the scene, and disappears before the
  readable foreground fades at the end. Quiet Motion uses opacity-only fades.
- Public Life reveals, death, Day, Night, Dawn, and victory have distinct moments.
  Sun and moon symbols accompany plain Day/Night labels.
- Animations never choose reveal slots or grant actions. Their server-owned pause
  rejects gameplay commands as well as disabling the UI. Close-ups can be skipped.
- Public close-ups use public events and publicly revealed Life cards. Private
  role art, role names, and power results remain local to the owner. A Sleuth's
  timed investigation opens immediately without waiting behind a cinematic.
- Refresh and seat recovery replay only the current unfinished presentation;
  completed presentations and historical events never replay. Disconnect removes
  a reader from the barrier; hiding the page finishes their current queue. Match
  changes discard old presentation IDs, which cannot unlock a newer scene.
- Private powers pause the table with a neutral waiting screen for other players.
  Only the owner receives role artwork, targets and result. Sleuth keeps its
  deliberate exposure countdown; closing or timing out its investigation resumes
  the table. Whisper insight lifetime is preserved across cinematic pauses.
- Quiet Motion respects the OS reduced-motion setting. Motion and sound
  preferences are available in the top bar and persist locally.

## Role powers

The corner power button is the main action entry point. Select it, select one
highlighted living player (two different players for Gossip), then read the
question and effect before choosing Yes or No. The confirmation initially focuses
No. Escape cancels. No selection spends an ability; only the server-confirmed
command does. Private role information remains accessible through the question
mark next to the power.

Abilities keep their original phases and frequency. Hexer acts at Night;
Sleuth, Herbalist, and Gossip act during Day and do not consume the card turn.
Herbalist cannot target someone who already has a remedy. Death, disconnection,
and phase changes invalidate pending selection. The Sleuth result has a compact
private panel with its existing exposure timer and a prominent close button.

## Separate opening and Life-reveal scenes

The private opening starts with a full role portrait and allegiance glow: red for
Ashbound allegiance (including Hexer), gold for other roles. Ashbound continue to
a separate teammate screen, then to their five Life cards and opening curse
choice. Other players continue directly from their portrait to Life cards. These
are separate screens, not one scrollable role/team/Life reference page. Closing
or blurring still covers private content. The in-game role reference is unchanged.

A public Life reveal first announces the owner's name for 1.6 seconds, then shows
the full authorized Life portrait for 6.4 seconds. Its next scene shows all five
public Life positions for 6 seconds, with the newly revealed numbered slot
highlighted and named left corner, left inner, middle, right inner, or right
corner. Face-down slots never get identity-specific art. The result distinguishes
a revealed Life from an eliminated player. If no Ashbound Life has yet been
publicly caught, a six-second “The Ashbound still live among us” message follows.
It is suppressed when the match already has an outcome. A reveal-producing card
does not insert a competing card close-up ahead of this story.

## In-game field guide

The top-corner question mark and menu How to play open a keyboard-accessible
dialog with three tabs. Roles & portraits shows all seven reference roles and
explains fixed roles versus movable Life cards. Cards & effects shows all 14
cards with artwork, target rules, effects and interactions, plus the opening Black
Cat marker. Card info inside a close-up opens this reference and holds the scene
until the guide closes. How to play has eight numbered
steps, navigation buttons, and bundled screenshots from a demonstration match.
The guide never reads current private assignments to populate its role library.

`tests/presentation.integration.test.ts` exercises clock preservation, blocked
actions, fast bots, private-power privacy, Whisper lifetime, stale acknowledgments,
reconnects, disconnects, Sleuth exposure, and absent-reader recovery with production
presentations enabled. Legacy rules-only socket scenarios disable presentation
barriers explicitly so their fake clocks remain focused on rule transitions.

Guide assets live in `apps/client/public/guide/`. Generate them with
`node node_modules/tsx/dist/cli.mjs tests/digital-ui-browser.ts --capture-guide`
after compilation. The isolated QA server uses demonstration players and cards;
do not capture human rooms. The capture dismisses unrelated cinematics and
temporary notices before taking focused shots. In particular, the Night guide
shows only its choice panel, and the victory image shows only the result area.

## Pressure-focused action deck

The deck remains 83 cards. It now contains 38 Evidence and 6 Witness: 44 direct
pressure cards (53%), up from 10. Whisper falls from 24 to 6, Hearthward from 12
to 3, and Cinder Shift from 4 to 2. The remainder is Alibi 6, Stocks 3, Asylum 3,
Piety 3, Curse 3, Mercy 4, Scapegoat 3, Vow of Hearts 2, and Conspiracy 1. Shuffling
still uses the server's existing entropy; this change affects composition rather
than secretly forcing card draws. It applies to newly created matches.

## Teammates and turn cues

Ashbound players see a separate private team section during the opening role
reveal: “Your teammates are:” followed by their living allies' names and avatars.
The same information is available with revealed Life cards and through the role
information button during play. Lanternkeeper protection has its own message and
does not replace the team list. A lone Ashbound gets an explicit solo message.

An authorized teammate has a red name tag and an ALLY badge on the owner's
roster. The current turn uses a green name, a soft green seat edge, and six small
drifting dust particles. An ally taking a turn keeps the red ALLY badge while
their name glows green. The HUD uses the same green turn color. Available powers
and eligible card/power targets have restrained gold glow; phase symbols have
their own warm or cool halo. Quiet Motion and OS reduced motion hide drifting
particles while retaining static turn cues.

Team membership comes exclusively from `private.witchTeammateIds`, gated by the
viewer's private allegiance. It is never inferred from a public Seal or fixed
role name. Markers update with current server snapshots after Life-card shifts,
deaths, and reconnects, and clear on rematch. Village players never receive a
list of disguised Village allies. Neutral Scapegoats remain outside Ashbound
teammate lists even after receiving a Witch Life card.

## Dragging cards

On desktop, drag a card onto a highlighted player. On touch devices, hold briefly
to lift the card; a quick swipe still scrolls the hand. The lifted illustration
follows the pointer and eligible targets receive a drop highlight. The player
list scrolls near its edges while dragging so additional seats remain reachable.

A valid drop opens the existing effect confirmation and does not spend a card.
An invalid/self drop or Escape cancels. For Scapegoat, drop onto the first player,
then select the second player. Drop Conspiracy over the player list or central
action area to review its global effect. Tap selection and keyboard controls remain
available. Turn/phase changes invalidate a stale drag through current selection
state; a drag never bypasses server validation.

## Authorized rule change: help or pressure another player

All targeted action cards now require another living player. This includes
support cards such as Alibi, Mercy, Asylum, Piety, and Hearthward. The shared
targeting policy drives the client, bot enumeration, and authoritative card
validation. Direct or forged self-target commands are rejected without spending
the card. Card explanations reflect this rule.

Conspiracy remains global. Cinder Shift still exchanges the actor's hidden Life
card with another player's card. All activated role powers require other players;
Gossip requires two different other players. Council voting retains its existing
self-vote rule, including Scapegoat's individual win condition.

## Full effect transfer and the opening Black Cat

Scapegoat now moves **all** Doubt and active attached effects from FIRST to
SECOND: Bound, Asylum, Piety, Hearthward, Hearts, Black Cat, and an active remedy.
It can target a source with zero Doubt if an effect is attached. Both selected
players must still be different from the actor and one another. Role abilities,
hidden Life cards, and private investigation results are not attachments.

Duplicate effects merge without extra charges. A moved Heart reconnects with
other living Heart holders; a duplicate Heart never makes a self-link. Ward
flags and the Herbalist's active remedy target follow the transfer. Effects keep
their existing duration. A receiving remedy blocks the whole action before
anything moves. Transferred Doubt never triggers Heart sharing; seven or more
reveals one random Life card and clears the full accumulation, including overflow.

During the private Life reveal, each Ashbound must seal an opening Black Cat vote
before confirming. Choices and submission state are owner-only and do not change
public revisions or reveal caster identities. The most-voted player receives the
single public curse when all Life cards are confirmed; ties use earliest seat.
Any living player may be selected, including oneself as a deliberate disguise.
The cursed player takes the first turn. Bots use the same private command.

Conspiracy reveals one random hidden Life card on the current Black Cat holder
before the surviving council's hidden cards shift. Death resolves before the
ring is assembled. Scapegoat moves the curse; Curse can remove it. This build
uses one starting curse marker rather than adding a fifteenth drawable action
card: a removed marker stays out until the next match.

This is an Ashfall adaptation of the setup and Black Cat interactions in the
[Salem 1692 rulebook](https://board-game-rules.com/wp-content/uploads/2025/01/salem-1692_Official-Rules.pdf),
retaining Ashfall's server-selected random Life reveals and digital secret
ballots rather than player-selected reveal slots or physical consensus.

## Verification

The UI review includes compact portrait layouts and short landscape screens.
Portrait hand controls remain within the viewport at 320 × 640, 360 × 640,
390 × 740, and 390 × 844. Landscape uses a scrollable roster and personal controls
on the left, with the action summary and hand on the right. Its compact summary
keeps actor, card, and target readable without the desktop presentation's height.
Night choices can use the hand area while cards are unavailable. Additional
checks cover 568 × 320, 640 × 360, 844 × 390, tablet, and desktop layouts.

Automated checks pass 168 unit/integration tests across 19 files. A 100-game
Normal-bot simulation with the pressure-focused deck completes
with no stuck games or invalid actions (longest 328 transitions). Its
38 village / 62 Ashbound wins remain a balance signal, not a human win-rate
estimate. Human playtests are still needed after these rule changes.

`tests/game-moments.test.ts` checks public close-up privacy and public-reveal
requirements. `tests/day.test.ts` checks all thirteen targeted card kinds reject
self-targeting without state changes. Socket tests also cover role self-target
rejection. `tests/digital-ui-browser.ts` exercises real multi-client role targeting,
No/Yes confirmation, six and ten seats, mobile controls, full-motion impact frames,
public card play, Night, recovery, voting, and rematches.

`tests/team-info.test.ts` checks role-independent allegiance, escaped names,
private-only markers, living allies, and simultaneous ally/turn indicators.
Socket coverage also checks a neutral Scapegoat receiving a Witch Life card.
Browser coverage includes an opening ten-player deal with two Ashbound holders,
one also holding Lanternkeeper, separate Village views, desktop/phone/landscape
team tags, green turn colors, reduced motion, and turn-marker movement.

Black Cat Socket.IO tests cover authorization, secret submission, idempotent
retries, reconnects, tie resolution, one public marker, first turn, and rematches.
The Scapegoat tests cover the complete attachment bundle, overflow, duplicate
Hearts, receiving-remedy blocks, ward flags, and the Herbalist lifecycle after a
remedy moves. Browser assertions check recipient labels and pile separation at
short desktop sizes as well as phones and landscape screens.

`tests/moments-layout-browser.mjs` also checks actor, all recipients, artwork,
and explanations remain inside the viewport at 1440 × 900, 390 × 844,
320 × 640, 568 × 320, and 844 × 390, including the three-person Scapegoat route.

`tests/cinematic-guide-browser.mjs` checks all guide images and role portraits,
separate red/gold openings, mobile/landscape bounds, exact reading times using a
controlled browser clock, Keep open, public slot highlights, and the aura fading
before foreground text. The regular multiplayer browser test also walks through
announcement → full Life portrait → exact slot → still-hidden Ashbound verdict.

The browser scenarios also check desktop invalid/valid drops, phone long-press
dragging, hand swipes, ordinary touch taps, and confirmation before spending.

Use the standard typecheck, unit/integration tests, and build. Run browser checks
after compilation finishes: rebuilding shared output during a Vite browser test
can reload its clients and invalidate the scenario. Browser screenshots live in
ignored `test-results/digital-ui/`.
