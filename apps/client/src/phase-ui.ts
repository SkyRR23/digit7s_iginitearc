import type { RoomView } from '@ashfall/shared';

export function phaseIcon(phase: RoomView['phase']): string {
  const moon = phase === 'NIGHT';
  return `<svg class="phase-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${moon
    ? '<path d="M33 5A19 19 0 1 0 43 32 20 20 0 0 1 33 5Z"/><path d="m13 9 1-4 1 4 4 1-4 1-1 4-1-4-4-1Z"/>'
    : '<circle cx="24" cy="24" r="9"/><path d="M24 2v9m0 26v9M2 24h9m26 0h9M8 8l6 6m20 20 6 6M8 40l6-6m20-20 6-6"/>'}</svg>`;
}

export function phaseName(phase: RoomView['phase']): string {
  return { LOBBY: 'Lobby', PRIVATE_DEAL: 'Private reveal', OPENING_CURSE:'The Curse awakens', DAY: 'Day', REVEAL_RESOLUTION: 'Life reveal', NIGHT: 'Night', DAWN: 'Dawn', GAME_OVER: 'Game over' }[phase];
}
