import type { ActionKind } from './day-views.js';

/** Targeted cards create interaction between players. Global cards affect everyone. */
export const cardRequiresOtherPlayer = (kind: ActionKind): boolean => kind !== 'CONSPIRACY';
