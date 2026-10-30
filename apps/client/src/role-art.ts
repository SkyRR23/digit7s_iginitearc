export const roleDescriptions: Record<string, string> = {
  VILLAGER: 'You have no special ability. Watch the council, play your cards, and use your vote. Your Life cards determine your allegiance.',
  ASHBOUND: 'While Witch-aligned, join the private Ashbound attack vote at Night. Your actual allegiance comes from your Life-card history.',
  SLEUTH: 'Once per match during Day, privately inspect whether one other living player is Witch-aligned. Close the result before its secret timer expires to avoid exposure.',
  HERBALIST: 'During Day, set a remedy on one other living player. It blocks one targeted harmful card or night attack. An unused remedy fades at Dawn.',
  GOSSIP: 'Once per match during Day, privately compare the current allegiance of two different living players.',
  HEXER: 'Once per match during Night, suppress an active protection on one other living player for that night.',
  SCAPEGOAT: 'Win individually only if a completed council vote eliminates you. Your victory ends the match for everyone. Accusation reveals and night deaths do not grant your individual victory.',
};
export const roleName = (kind: string) => kind === 'SCAPEGOAT' ? 'Outcast' : kind.replaceAll('_', ' ');
export const roleArt = (kind: string) => `/art/roles/${kind === 'SCAPEGOAT' ? 'outcast-chained-transparent' : kind.toLowerCase()}.webp`;
export const lifeArt = (kind: string) => kind === 'HUMAN' ? '/art/roles/good-life-v2.webp' : kind === 'WITCH' ? '/art/roles/evil-life.webp' : roleArt('VILLAGER');
const paths: Record<string, string> = {
  VILLAGER: '<path d="M19 12h26l-3 37H22zM16 49h32M22 12V8h20v4M26 8a6 6 0 0 1 12 0M23 22h18M25 39l7-13 7 13z"/>',
  ASHBOUND: '<path d="M39 6a25 25 0 1 0 17 39A25 25 0 0 1 39 6Z"/><path d="M35 49c-13-8 3-15 0-27 16 11 18 22 0 27Z"/>',
  SLEUTH: '<circle cx="35" cy="26" r="19"/><path d="m21 41-14 16M21 26q14-18 28 0-14 18-28 0Z"/><circle cx="35" cy="26" r="5"/>',
  HERBALIST: '<path d="M8 34h48q-4 20-24 20T8 34ZM18 56h28M33 33q-5-19 16-25-1 19-16 25ZM30 34 45 14M44 31l9-16"/>',
  GOSSIP: '<path d="M38 48q-8 12-15 1 0-12 8-14 15-4 9-17-8-13-18-2M24 21q6-9 12 0 5 9-5 12M8 22l9 4M8 39l10-4M11 51l8-8"/><circle cx="51" cy="15" r="5"/>',
  HEXER: '<path d="m32 5 24 14v27L32 59 8 46V19Zm0 0v54M8 19l48 27M8 46l48-27M20 12l24 40M44 12 20 52"/><circle cx="32" cy="32" r="12"/>',
  SCAPEGOAT: '<path d="m21 17 22 30M43 17 21 47M15 53Q0 32 16 10M49 53q15-21-1-43M11 18l9-1M8 28l10-1M8 39l11-2M12 48l10-4M53 18l-9-1M56 28l-10-1M56 39l-11-2M52 48l-10-4"/>',
};
export function roleSymbol(kind: string): string {
  return `<svg class="role-symbol" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind] ?? paths.VILLAGER}</svg>`;
}
