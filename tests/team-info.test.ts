import { describe, expect, it } from 'vitest';
import type { RoomView } from '@ashfall/shared';
import { renderTeamInfo, teammates } from '../apps/client/src/team-info';
import { emptyTableSelection, renderPlayerSeat } from '../apps/client/src/tabletop-components';

function snapshot(): RoomView {
  return {
    code: 'ABCDEFGH', version: 1, privateVersion: 0, phase: 'DAY', capacity: 6, hostId: 'a',
    players: ['a','b','c'].map(id => ({ id, name: id === 'b' ? '<River & Ash>' : id, avatar: 'moon', ready: true, connected: true, abandoned: false, reconnectUntil: null })),
    you: { playerId: 'a' }, feed: [], hand: [], night: null, dawn: null, personalResult: null,
    private: { identities: [], everWitch: true, constableAbility: true, witchTeammateIds: ['b'] },
    deal: { matchId: 'match', players: ['a','b','c'].map(playerId => ({ playerId, alive: true, acknowledged: true, seals: [{ slot: 0, revealed: false }] })) },
    day: { dayNumber: 1, version: 1, turnNumber: 1, activePlayerId: 'b', playedThisTurn: false, deadline: 10000, deckCount: 20, discardCount: 0, accusationThreshold: 7, players: [], reveal: null, outcome: null },
    role: { kind: 'VILLAGER', ability: 'UNAVAILABLE', result: null, peek: null, notices: [], individualWin: false },
  };
}

describe('private teammate presentation', () => {
  it('shows authorized allies for converted roles, including a Lanternkeeper holder', () => {
    const view = snapshot();
    expect(teammates(view).map(player => player.id)).toEqual(['b']);
    expect(renderTeamInfo(view)).toContain('Your teammates are:');
    expect(renderTeamInfo(view)).toContain('&lt;River &amp; Ash&gt;');
    expect(renderTeamInfo(view)).not.toContain('<River & Ash>');
  });
  it('never derives allies from public revealed identities or role names', () => {
    const view = snapshot();
    view.private = null;
    view.role!.kind = 'ASHBOUND';
    view.deal!.players[1]!.seals[0] = { slot: 0, revealed: true, kind: 'WITCH' };
    expect(teammates(view)).toEqual([]);
    expect(renderTeamInfo(view)).toBe('');
    expect(renderPlayerSeat(view, view.players[1]!, 1, 1, emptyTableSelection())).not.toContain('is-teammate');
  });
  it('withholds team information from Village and neutral viewers', () => {
    const view = snapshot();
    view.private!.everWitch = false;
    expect(teammates(view)).toEqual([]);
    expect(renderTeamInfo(view)).toBe('');
    view.private!.everWitch = true;
    view.role!.kind = 'SCAPEGOAT';
    expect(renderTeamInfo(view)).toBe('');
  });
  it('removes dead, unknown and self IDs, but keeps a reconnecting living ally', () => {
    const view = snapshot();
    view.private!.witchTeammateIds = ['a','b','c','unknown'];
    view.deal!.players[2]!.alive = false;
    view.players[1]!.connected = false;
    expect(teammates(view).map(player => player.id)).toEqual(['b']);
    view.private!.witchTeammateIds = [];
    expect(renderTeamInfo(view)).toContain('You have no living teammates yet.');
  });
  it('keeps the private ally badge while marking that same player as the active turn', () => {
    const view = snapshot();
    const seat = renderPlayerSeat(view, view.players[1]!, 1, 1, emptyTableSelection());
    expect(seat).toContain('is-teammate');
    expect(seat).toContain('is-active');
    expect(seat).toContain('your Ashbound teammate');
    expect(seat).toContain('class="ally-tag"');
    expect(seat).toContain('class="turn-dust" aria-hidden="true"');
    view.phase = 'NIGHT';
    expect(renderPlayerSeat(view, view.players[1]!, 1, 1, emptyTableSelection())).not.toContain('turn-dust');
  });
});
