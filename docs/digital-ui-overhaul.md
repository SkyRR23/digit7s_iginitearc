# Ashfall Council digital interface

The client uses live DOM components for the menu, lobby, roster, action spotlight, hand, role reveal, Life reveal, Night choices, chat, event log, and results. The supplied concept sheets are references only; no concept screenshot is embedded in an interface component.

## Running and verification

- `npm run dev` starts the existing client and authoritative room server.
- `npm run build` compiles shared rules, server, and client.
- `npm test` runs the existing rules and server integration suite.
- `npx tsx tests/digital-ui-browser.ts` runs real browser and Socket.IO flows with six and ten isolated players. It starts a separate Vite preview on port 5183 and an in-process game server. The test injects a deterministic deal, action-hand scenario, and clock through the existing trusted server test interfaces; none of these are exposed to the browser or production server.

The browser suite covers create/join, chat, ready/start, private role presentation, Life inspection and rearrangement, cover/confirm, card hover and keyboard/touch details, target selection, two-target Scapegoat, global Conspiracy, protective blocks, Heart links, seven-Doubt accuser-selected reveal, Draw 2, Night privacy, Dawn/death, reconnection, voting, results, and rematch. Screenshots are saved under `test-results/digital-ui/`.

## Component responsibilities

- `apps/client/src/main.ts` retains the existing multiplayer command and state paths and composes the screens.
- `apps/client/src/digital-ui.css` defines the current charcoal, ivory, and crimson presentation and responsive layouts.
- `apps/client/src/digital-stage.ts` renders real phase/Day/turn/deadline state, public target spotlights, and the local Life row.
- `apps/client/src/day-panel.ts` retains grouped-hand selection, server validation, two-target/global actions, and contextual confirmation.
- `apps/client/src/card-info.ts` contains explanations checked against `packages/shared/src/day-cards.ts`.
- `apps/client/src/card-details.ts` handles informational hover, keyboard, and touch pop-ups. Opening details does not dispatch a game action.
- `apps/client/src/life-details.ts` presents larger public Life identity details on hover, focus, or tap. It reads only attributes on publicly revealed cards; hidden cards never carry identity attributes.
- `apps/client/src/role-art.ts` maps private roles to individual art and scalable symbols. A role never supplies the player's current allegiance.
- `apps/client/src/role-panel.ts` presents the private role before opening Life cards and preserves abilities, results, and voting.
- `apps/client/src/private-panel.ts` retains private inspection, swapping, shuffle, cover, and acknowledgement.

Public face-down Life markup uses identical generic backs and explanations. Only server-revealed Life cards show their identities publicly. At seven Doubt the accuser chooses a hidden Life position in the close-up decision UI. Only public backs are shown; the server validates the chosen slot. See ACTION_UPDATES.md.

On desktop and tablet, the roster is split into two wings around the centre action spotlight. The spotlight names the actor, card, and target (or both ordered targets), distinguishes a planned action from the latest approved public play, and uses only server-approved events for the public action history. Target buttons occupy their own space and do not cover Life cards. Heart status labels name their partners instead of drawing lines through the roster.

Revealed Life cards use recognizable symbols plus full-name count badges such as “Villager ×2.” Hovering, focusing, or tapping a revealed card or badge opens a larger public explanation. This does not change selection, allegiance, or any game mechanics.

On desktop, chat and events stay beside the action area. On tablet and phone they open in a drawer. A phone match uses a horizontally scrollable single row of larger player tiles, a central action area, a local Life row, and a horizontally scrollable grouped hand. All ten seats remain accessible; busy desktop rosters scroll vertically. Tall role and Life dialogs scroll internally.

The browser suite additionally verifies readable remote-player names at every tested width, players on both sides at desktop/tablet sizes, actor/card labels after approved plays, explicit partner names, public Life inspection without hidden identity attributes, and viewport-safe inspection at the reported 1075 × 884 size.

## Generated assets and prompt set

Generated with the built-in image generation tool. Assets are saved in the project, separately from the reference sheets:

- `apps/client/public/art/digital-village.png`
- `apps/client/public/art/roles/`: `villager.png`, `ashbound.png`, `sleuth.png`, `herbalist.png`, `gossip.png`, `hexer.png`, `scapegoat.png`
- `apps/client/public/art/cards/`: one PNG for each of the fourteen action kinds, using the lowercase action-kind name as its filename.

The browser serves smaller sibling `.webp` assets, generated by `node scripts/optimize-game-art.mjs`. This only resizes and encodes the generated art; source PNGs are retained. Role transparency is preserved.

### Role illustration prompt template

“Use case: stylized-concept. Asset type: one individual transparent game role illustration, not a card or mockup. Reference image is style guidance only. Create {subject}. Full body humanoid chibi with large expressive head and compact adult body, all limbs visible, consistent with the reference's intricate hand-cut woodcut and etched ink drawing. Crisp black and ivory crosshatching, rough print edges, one restrained role accent color. Centered upright portrait composition with modest empty transparent margin. No rectangular background, no frame, no UI, no lettering, no captions, no other characters. Genuine transparent background; preserve the colored details on clothing and props. Production illustration for Ashfall Council's private role reveal.”

Subjects:

- Villager: a resolute Puritan village woman in bonnet, cloak, apron and boots, holding a glowing brass lantern, warm ochre accents.
- Ashbound: a mysterious humanoid hooded Puritan witch, visibly human face, flowing dark cloak, cradling a small crimson magical ember, deep red accents.
- Sleuth: a curious young Puritan investigator with curly dark hair, long coat and boots, holding a magnifying glass and closed notebook, blue accents.
- Herbalist: a kind Puritan herbalist woman with hair in a bun, dress and apron, holding a bundle of herbs and a small mortar, olive green accents.
- Gossip: a perceptive Puritan woman with lace bonnet and violet shawl, one hand beside her ear and the other holding a sealed letter, violet accents.
- Hexer: a defiant humanoid Puritan spellcaster with tousled long dark hair and an embroidered black coat, one outstretched hand casting angular indigo sigils, indigo accents.
- Scapegoat: a worried young Puritan villager with tousled hair under a broad brimmed hat, russet cape, waistcoat and boots, clutching the cape at the chest, burnt ochre accents.

The first four used `role-concepts-01-villager-ashbound-sleuth-herbalist.png` as style reference; the last three used `role-concepts-02-gossip-hexer-scapegoat.png`.

### Card illustration prompt template

“Use case: stylized-concept. Asset type: individual square illustration for the art panel of a playable game card. Reference sheet provides ink-print style, not a layout to reproduce. Draw {subject}. Detailed hand-cut woodcut, scratchy black and ivory etching, crosshatching and restrained {accent} accent, high contrast against a near-black background. Fill a square panel with one clear central composition, readable at small card size. Only the illustration: no title, no words or lettering, no descriptions, no border, no card frame, no corner banner, no UI, no mockup, no extra cards except those part of the subject. Match the visual world of a Puritan village social deduction game.”

Subjects and accents, each using its corresponding supplied `playable-cards-v2` reference sheet:

- Evidence: a sealed testimony document crossed by two vivid crimson brush-stroke X marks; crimson.
- Witness: a large intensely watchful human eye, seven small crimson X marks below; crimson.
- Alibi: antique balanced justice scales with two crimson X marks dissolving from one pan; muted blue.
- Mercy: a gentle open human hand above a broken iron shackle and falling chain links; sage green.
- Stocks: old colonial wooden stocks with empty round openings, heavy iron chains and pebbles; crimson.
- Asylum: an anonymous human wrapped in a hooded cloak beneath a silver moon-shaped protective dome; slate blue.
- Piety: two human hands clasped in prayer beneath a radiant circular halo; ochre gold.
- Hearthward: a protective open human hand holding a living flame inside a glowing ember ring; burnt orange.
- Whisper: a human mouth whispering a winding purple smoke trail toward a human ear above one sealed secret card; violet.
- Cinder Shift: two face-down sealed cards swapping along opposing curved arrows and swirling cinders; crimson.
- Scapegoat: two anonymous human silhouettes with two crimson X marks moving from one toward the other along arrows; burnt ochre.
- Curse: an ornate protective glass halo and sigil breaking into angular shards; indigo violet.
- Vow of Hearts: two engraved anatomical human hearts connected by a tied red thread and wax heart seals; crimson.
- Conspiracy: four face-down eye-sealed cards arranged in a circle with clockwise arrows, swirling smoke in centre; ochre gold.

### Background prompt

“Use case: historical-scene. Asset type: text-free full-screen background for a digital social deduction game. A Puritan New England village and timber meetinghouse at night, a large ivory full moon above the church bell tower, bare branches framing the upper corners, damp cobbled lane and distant human silhouettes carrying torches, scattered glowing red embers. Highly detailed hand-cut woodcut illustration and scratchy ink crosshatching, charcoal black, ivory and restrained crimson, a little dark blue-gray sky. Cinematic wide 16:9 scene with building slightly right of centre; leave quiet dark negative space at left and around edges for live UI overlays. No words, no typography, no logo, no cards, no frames, no interface elements. Moody and readable, not photorealistic, match the supplied Ashfall Council digital concept art's ink-print aesthetic.”
