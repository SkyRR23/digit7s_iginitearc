import { describe, expect, it } from 'vitest';
import { deriveVoicePermissions } from '@ashfall/shared';

const player = { seated: true, alive: true, everWitch: false };
const policy = (phase: Parameters<typeof deriveVoicePermissions>[0]['phase'], overrides = {}) =>
  deriveVoicePermissions({ phase, player, enabled: true, now: 1_000, ttlMs: 60_000, ...overrides });

describe('server-derived voice policy', () => {
  it('denies disabled voice, spectators, dead players, and ordinary players at Night', () => {
    expect(policy('DAY', { enabled: false })).toEqual([]);
    expect(policy('DAY', { player: null })).toEqual([]);
    expect(policy('DAY', { player: { ...player, alive: false } })).toEqual([]);
    expect(policy('NIGHT')).toEqual([]);
  });
  it('grants only the phase-authorized channel with a capped expiry', () => {
    expect(policy('LOBBY')[0]).toMatchObject({ channel: 'lobby', mayPublish: true, maySubscribe: true });
    expect(policy('DAY')[0]!.channel).toBe('council');
    expect(policy('DAWN')[0]!.channel).toBe('council');
    expect(policy('NIGHT', { player: { ...player, everWitch: true } })[0]!.channel).toBe('witch');
    expect(policy('GAME_OVER', { player: { ...player, alive: false }, ttlMs: 9_999_999 })[0])
      .toMatchObject({ channel: 'council', expiresAt: 301_000 });
  });
  it('keeps an optional dead lounge isolated from living and Witch channels', () => {
    expect(policy('NIGHT', { player: { ...player, alive: false, everWitch: true }, deadLoungeEnabled: true }))
      .toEqual([{ channel: 'dead', mayPublish: true, maySubscribe: true, expiresAt: 61_000 }]);
  });
});
