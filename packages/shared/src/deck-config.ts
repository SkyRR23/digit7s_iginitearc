import type { ActionKind } from './day-views.js';
import type { DayRules } from './day-model.js';

/** Initial match quantities, including cards currently attached or permanently spent. */
export function cardQuantities(rules: Pick<DayRules,'cardCounts'|'whisperCards'|'hearthwardCards'|'cinderShiftCards'>): Partial<Record<ActionKind,number>> {
  return {...rules.cardCounts, WHISPER:rules.whisperCards, HEARTHWARD:rules.hearthwardCards, CINDER_SHIFT:rules.cinderShiftCards};
}
