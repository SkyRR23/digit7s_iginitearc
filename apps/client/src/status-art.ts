const paths: Record<string,string> = {
  BLACK_CAT: '<circle cx="16" cy="16" r="13"/><path d="m16 4 10 18H6Zm0 24L6 10h20ZM16 9l3 5-3 3 2 6"/>',
  BOUND: '<path d="m10 19 9-9m-4 14 9-9"/><rect x="3" y="11" width="16" height="10" rx="5" transform="rotate(-45 11 16)"/><rect x="13" y="1" width="16" height="10" rx="5" transform="rotate(-45 21 6)"/>',
  ASYLUM: '<path d="M21 3A13 13 0 1 0 29 24 13 13 0 0 1 21 3Z"/>',
  PIETY: '<circle cx="16" cy="16" r="8"/><path d="M16 1v4m0 22v4M1 16h4m22 0h4M5 5l3 3m16 16 3 3M5 27l3-3M24 8l3-3"/>',
  HEARTHWARD: '<path d="M17 2C21 11 7 12 12 20c-7-2-6-8-6-8-9 17 20 24 21 7 0-6-5-12-10-17Z"/><path d="M16 20c-6 8 6 11 5 3"/>',
  VOW_HEART: '<path d="M16 28 4 16C-5 5 9-2 16 9 23-2 37 5 28 16Z"/>',
  REMEDY: '<path d="M4 27 26 5M9 23C1 11 15 2 28 3c1 14-6 25-19 20Z"/>',
};
export function statusSymbol(kind: string): string {
  return `<svg class="status-symbol" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind] ?? paths.REMEDY}</svg>`;
}
export const chainOverlay = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M0 8 48 38M0 38 48 8" stroke="#272a2e" stroke-width="6"/><path d="M0 8 48 38M0 38 48 8" stroke-dasharray="6 3"/><path d="M4 34h40v8H4Z" fill="#584636" stroke="#99836a"/></svg>';
