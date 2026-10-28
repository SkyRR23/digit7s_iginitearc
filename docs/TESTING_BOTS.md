# Server-controlled bots

Bots are ordinary six-seat participants controlled inside the room server. The
host can add one, remove one, or fill every open lobby seat with Easy or Normal
bots. They are ready immediately, remain in rematch lobbies, count toward room
capacity, and are marked publicly. A human disconnect never creates a bot.

## Authority and information boundary

`RoomStore` gives each bot a synthetic server-owned socket binding, then sends
every decision through the same `execute` command dispatcher, schemas, revisions,
receipt cache, turn checks, ownership rules and reducers used by network players.
No browser may create that binding or choose a bot actor ID.

The policy in `apps/server/src/bots.ts` accepts only an owner-specific `RoomView`.
That allowlisted projection contains public room/game knowledge, the bot's own
unrevealed Seals and hand, its current abilities, and Witch teammate IDs only when
the normal rules authorize them. It never receives the internal room, action deck,
other hidden Seals, reconnect tokens, or another player's secret Night choice.

`enumerateLegalBotActions` derives the complete current choice set from that view.
The policy can acknowledge a deal; draw, play, shift, end a turn; choose a reveal;
vote or abstain at Night; and protect or abstain as Constable. A Witch+Constable
submits both independent choices. The authoritative reducer still makes the final
legality decision.

## Policies and scheduling

Easy selects a random legal action category and legal action. Normal remembers
public Doubt and visible aggression, prioritizes plausible targets, avoids known
Witch allies for harmful actions, moves a known Witch Seal strategically when it
can, and protects plausible targets. Neither policy infers hidden information.

Each policy owns a seeded Mulberry32 random stream for reproducible decisions.
Production deals continue to use cryptographic entropy. Normal play schedules a
decision 500–2000 ms later and verifies a full state key before dispatch, so a
stale callback cannot act after a turn, phase, match, removal or reopen. Tests use
fast mode with no artificial delay. Public bot lines are original, generic,
rate-limited, and disabled during private deal and Night.

## Automated checks

`npm run test:browser:bots` drives a 390×844 Edge client against five bots through
a complete match and into a rematch lobby. `npm run simulate:bots` runs 100 complete
seeded six-bot games and reports team wins, stalls/crashes, rejected bot actions and
the longest transition count. A specific run can be reproduced directly:

```powershell
npx tsx apps/server/src/simulate.ts --games 1 --seed 20261016 --difficulty NORMAL
```

Vitest covers owner-only observations, legal enumeration, deterministic choices,
safe chat, Witch+Constable, one-human/five-bot completion, all-bot completion,
reconnect without replacement, bot-only lobby host recovery, stale callbacks,
privacy, rematch, and deterministic replay. Simulation APIs exist only in process;
there is no public socket command for all-bot room creation or time acceleration.

These bots exercise game plumbing and offer a solo play path. Their win rates are
not a balance verdict, and they do not replace six-human or physical-device tests.
