# Rules provenance and original design

Read on October 15, 2026: [Salem 1692 Second Edition rulebook](https://gamers-hq.de/media/pdf/fc/7d/89/FINAL_Salem_Rulebook_-2nd_Edition.pdf).
The PDF was accessible. Relevant setup, day, death, win, transfer, and night
sections were read. This is not an official adaptation. No source artwork,
characters, card text, or full action deck is included.

## Verified reference facts

- Printed pp. 2–3: six players receive five cards each from 27 ordinary,
  two Witch, and one Constable cards. Witch and Constable can coincide.
- pp. 4–5: turns offer drawing two or playing cards. Seven accumulated accusations
  trigger a reveal selected by the final accuser; accusations then clear.
  Revealing a Witch, exposing every card, or a night kill causes death.
  Death reveals remaining cards and historical allegiance.
- pp. 6–7: Humans win by revealing every Witch card; Witches win when all living
  players are Witch-aligned. Witch allegiance persists through card transfers;
  Constable authority follows current possession.
- pp. 8–11: Constable protection excludes self; a revealed Constable loses the
  ability. Night includes additional protections/confession omitted here.

These facts are represented by `referenceSixPlayerFixture` only where numeric
values are needed. They do not define the game's identity or visual treatment.

## Ashfall Council: our decisions

The original setting is a fictional village gathering in a lantern house after
an ashfall. Public sigils are Lantern, Moth, Reed, Thorn, Bell, and Moon; all are
cosmetic. The visual language uses flat SVG ink shapes, muted moss, charcoal,
parchment gold, and spacious portrait-friendly seats. All artwork is original
code, with system fonts and no external assets.

Internal Human/Witch/Constable concepts map to Villager, Ashbound, and
Lanternkeeper labels. Identity cards are Seals. Public suspicion is Doubt,
distinct from a temporary defense effect.

`originalPrototypePreset` is a separately named, provisional six-player preset.
It retains the supplied 30-card composition for focused initial tests but sets
the Doubt threshold to **5**, subject to playtesting. Five is our design choice,
not a reference fact. Milestone 3 activates this threshold and the original deck;
Night timing is active in M4. A pure rule test also verifies threshold 7
as a separate configuration, without changing the playable original preset.

Milestone 2 labels are Villager, Ashbound, and Lanternkeeper. The server shuffles
and deals all thirty Seals; cards can combine on one owner, including both Witch
cards and Constable. Only living owners receive their unrevealed card identities.
Historical Witch allegiance remains true for the life of the deal; Constable
ability follows current unrevealed ownership. Cinder Shift exercises these rules
through an atomic server-validated exchange. Living Ashbound
players receive the IDs of their living teammates, never their teammates' Seals.
This digital permission is an original implementation decision.

PRIVATE_DEAL acknowledgements are prototype UX; the final one now starts Day.
Host abort or a departing/expired seat before Day cancels the private deal without
a death reveal; the next deal has new cards and history. M5 replaces the old
whole-match departure abort once Day begins with the original forfeit rules below.

The original action deck uses **Whisper** (add one Doubt to another player),
**Hearthward** (block the next Whisper against another player, expire at Night),
and four **Cinder Shift** cards (atomically exchange one face-down Seal from the
actor with one face-down Seal from another living player without revealing either).
There are 24 Whispers and 12 Hearthwards, with three cards dealt
to each player at Day's start. These values are configurable and await human
playtesting; this is not the source deck. No information card is necessary
yet. The acting player may draw two and finish, or play one or more permitted
cards then end. No self-targets. Reaching the threshold pauses for exactly one
selected unrevealed Seal, then clears Doubt including overflow. Temporary wards
never remove existing Doubt and do not stack. The first living seat starts.
Day turns have 60-second deadlines: idle means draw/end, after playing means end.
Reveal selection has 30 seconds; missing input selects the lowest unrevealed
slot, independent of its kind. Resolving a reveal resets the turn deadline.
Deck exhaustion requests Night after pending resolution and victory. Drawing
the final single card is allowed. M4 now resolves Night and starts the next day.

The implemented M4 agreement rule is secret Witch voting with a fixed 45-second
deadline; most votes wins and ties select the target earliest in seat order.
Each ability accepts one final choice, including explicit abstention. Witches
cannot attack themselves or historical teammates. Missing votes abstain; no valid
votes means no attack. Missing protection means none. Constable protection can
target any other living player regardless of allegiance. Only the owner sees
their own submitted choices. Public chat is silent for everyone during Night.
The deadline never shortens based on submission count. These are original digital
rules, not claims about the reference's discussion or selection procedure.

Protection eligibility and the attack target are frozen before death resolution.
An unprotected attack kills and reveals the victim's remaining Seals as a batch,
then checks victory. Public dawn says only who died or that no one died; a saved
target and the protecting player are not announced. Secret ballots are discarded.
Dawn lasts five seconds unless victory ends the match immediately.

At the next day, securely shuffle only discarded action cards into the new draw
pile. Living players retain their exact hands; there is no dawn re-deal. A small
discard pile creates a shorter next day. If no discards exist, an empty-deck day
can end explicitly without reclaiming anyone's hand. Identity
cards, allegiance, revealed slots and Doubt persist; Hearthwards expire at Night.
The previously queued next actor resumes, skipping anyone killed at Night. The
new day has a fresh turn number and deadline. These recycling/tempo decisions
are original prototype choices, configurable and subject to human playtesting.
Implemented M3 death publishes remaining Seals and historical allegiance in this preset.
Human victory takes precedence if an atomic death/reveal resolution meets both
victory conditions. This ordering is covered by pure rules and socket tests.
Surviving hidden cards are not automatically disclosed at game over. Dead players
cannot chat until game over. Constable and Witch can overlap; eligibility is derived
independently, and the Constable cannot protect self.

Not included: historical characters, special abilities, confession, copied card
sets, advanced roles, or an enabled voice provider. Public chat is available now.
The voice policy is derived from authenticated server state; no browser-selected
channel or role can grant access.

## Original digital abandonment and rematch rules (M5)

- Disconnect reserves a seat for 60 seconds while turn/Night deadlines continue.
  The host lantern immediately passes to an available connected player.
- After Day begins, explicit leave or grace expiry forfeits the player: a living
  player dies, reveals all remaining Seals/history, loses hand/abilities, and
  triggers ordinary victory checks. Their public seat remains until the next lobby.
  No new player takes over hidden information, and no forfeited token can resume.
- A missing reveal chooser defaults to the lowest hidden slot. A departed reveal
  target cancels the choice. Night/Dawn clocks keep their original deadlines.
- Simultaneous expirations resolve as one batch, before any same-time phase
  deadline. Human victory precedence still applies. Overdue events use timestamp
  order so an earlier Night is not rewritten by a later forfeit.
- A departure after game over leaves the result and surviving hidden cards intact.
  The host opens a rematch lobby; departed seats clear and everyone readies again.
  Six connected ready humans are required for a new deal, with fresh cards/history.

These are original online-game lifecycle decisions, not reference rulebook claims.
They prevent stalled matches but cannot prevent deliberate kingmaking by forfeits;
social balance still needs human playtesting. Hosts may add labeled bot seats in
the lobby, but no bot replaces a departed player during a match.
