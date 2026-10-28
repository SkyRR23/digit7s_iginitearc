import { describe, expect, it } from 'vitest';
import { runBotGame } from '../apps/server/src/simulate.js';

describe('fully simulated server bot matches', () => {
  it('completes reproducibly without invalid bot actions or stalls', () => {
    const first = runBotGame(4242, 'NORMAL'); const replay = runBotGame(4242, 'NORMAL');
    expect(first).toEqual(replay);
    expect(first.outcome?.winner).toMatch(/HUMAN|WITCH/);
    expect(first.stuck).toBe(false); expect(first.failures).toBe(0);
  });
  it('completes a spread of Easy and Normal fixed seeds', () => {
    const results = Array.from({ length: 12 }, (_, index) => runBotGame(8000 + index, index % 2 ? 'EASY' : 'NORMAL'));
    expect(results.every(result => result.outcome && !result.stuck && result.failures === 0)).toBe(true);
  });
});
