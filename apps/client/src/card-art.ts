import type { ActionKind } from '@ashfall/shared';

/** Original, scalable card engravings; live text is rendered separately. */
export function cardGlyph(kind: ActionKind): string {
  const additional: Partial<Record<ActionKind, string>> = {
    EVIDENCE: '<path d="M31 19h45l12 13v65H31zM76 19v15h12M40 49h38M40 61h31M40 74h36"/><circle cx="67" cy="84" r="10"/><path d="m62 84 4 4 8-9"/>',
    WITNESS: '<path d="M14 61Q60 13 106 61Q60 108 14 61Z"/><circle cx="60" cy="61" r="21"/><circle cx="60" cy="61" r="8"/>',
    ALIBI: '<path d="M60 21v74M30 37h60M30 37l-13 32h26zM90 37 77 69h26zM38 97h44"/>',
    STOCKS: '<path d="M19 33h82v13H19zM19 73h82v13H19zM28 46v27M92 46v27M49 46v27M71 46v27"/><circle cx="60" cy="60" r="10"/>',
    ASYLUM: '<path d="M72 14A43 43 0 1 0 103 90 39 39 0 0 1 72 14Z"/><path d="m37 35 4-8 4 8 8 4-8 4-4 8-4-8-8-4z"/>',
    PIETY: '<path d="M60 10v100M16 60h88M32 32l56 56M88 32 32 88"/><circle cx="60" cy="60" r="30"/>',
    CURSE: '<path d="M35 16Q60 36 85 16L74 70 90 104H30L46 70Z"/><path d="m47 47 26 26m0-26L47 73"/>',
    MERCY: '<path d="M38 85 19 65q-6-11 3-15l21 12V30q0-9 8-9t8 9v26-34q0-8 7-8t7 8v34-25q0-8 7-8t7 8v25q9-9 15-2 5 5-1 14L80 99H46Z"/>',
    SCAPEGOAT: '<path d="M20 58h70M76 44l14 14-14 14M20 86h70M34 72 20 86l14 14"/><path d="M21 25h18m-9-9v18M81 23h18m-9-9v18"/>',
    VOW_OF_HEARTS: '<path d="M60 98 20 61C-1 36 27 11 48 31l12 12 12-12c21-20 49 5 28 30Z"/><path d="M25 60q35-23 70 0"/>',
    CONSPIRACY: '<circle cx="60" cy="60" r="39" stroke-dasharray="5 6"/><path d="m24 43 5-22 20 12m47 44-5 22-20-12M27 39a39 39 0 0 1 68 15M93 82a39 39 0 0 1-68-15"/>',
  };
  const art = additional[kind] ?? (kind === 'WHISPER'
    ? '<path d="M72 102H28l5-23-10-8 9-11c-3-24 11-40 32-38 23 2 28 23 19 36l-12 9 4 15-13 3v17"/><path d="M37 31c7-12 25-16 37-7M37 41c7-15 30-16 38-3M36 50c9-15 26-16 38-6M48 58l8-3M72 69l12 1M91 59l14-8M92 72h18M91 84l14 8"/><path d="m50 99 6-20 10-9 8 2-11 14-1 17"/><circle cx="59" cy="53" r="2"/>'
    : kind === 'HEARTHWARD'
      ? '<path d="M60 108V31M60 90C25 84 21 62 25 52c20 4 31 17 35 38ZM60 75C91 69 100 50 96 40 77 46 64 57 60 75ZM60 57C38 50 33 33 37 23 51 32 57 43 60 57ZM60 45C77 34 80 20 75 12 64 20 60 32 60 45ZM51 107h18"/><path d="m15 19 5 6 7-1-3 7 4 6-8-1-5 6-1-8-7-4 7-3ZM94 88l3 5 6 1-4 4v6l-5-3-6 2 1-6-4-4 6-1Z"/>'
      : '<path d="M24 49c7-24 40-35 61-17l10 9M95 21v21H73M96 72c-8 24-40 35-62 17l-9-9M25 100V79h22"/><path d="M17 62h28l11 10M103 60H75L64 50"/><circle cx="60" cy="60" r="46" stroke-dasharray="1 7"/>');
  return `<svg class="card-illustration" viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="60" cy="60" r="53" stroke-width=".7"/><path d="M60 1v7M60 112v7M1 60h7M112 60h7M18 18l5 5M97 97l5 5M18 102l5-5M97 23l5-5" stroke-width="1"/>${art}</svg>`;
}
