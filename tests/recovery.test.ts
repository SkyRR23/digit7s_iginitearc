import { describe, expect, it } from 'vitest';
import { acceptsView } from '../apps/client/src/view-order.js';

const current = { code: 'ROOM', you: { playerId: 'owner' }, version: 20, privateVersion: 3 };
describe('client snapshot recovery ordering', () => {
  it('rejects stale public snapshots even when they carry a higher private revision', () => {
    expect(acceptsView(current, { ...current, version: 19, privateVersion: 4 })).toBe(false);
  });
  it('does not overwrite sealed choices with older acknowledgements at the same public revision', () => {
    expect(acceptsView(current, { ...current, privateVersion: 2 })).toBe(false);
    expect(acceptsView(current, { ...current, privateVersion: 4 })).toBe(true);
    expect(acceptsView(current, current)).toBe(true);
  });
  it('accepts newer phase/death/rematch snapshots and rejects another room or seat until cleared', () => {
    expect(acceptsView(current, { ...current, version: 21, privateVersion: 0 })).toBe(true);
    const other = { ...current, you: { playerId: 'replacement' } };
    expect(acceptsView(current, other)).toBe(false); expect(acceptsView(null, other)).toBe(true);
    expect(acceptsView(current, { ...current, code: 'OTHER' })).toBe(false);
  });
});
