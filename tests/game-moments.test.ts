import { describe, expect, it } from 'vitest';
import type { RoomView, TableEffect } from '@ashfall/shared';
import { MOMENT_DURATION, REVEAL_STAGES, publicMoments } from '../apps/client/src/moment-script';
import { lifePosition, renderLifeReveal } from '../apps/client/src/life-reveal';

function snapshot(): RoomView {
  return {
    code: 'ABCDEFGH', version: 1, privateVersion: 0, phase: 'DAY', capacity: 6, hostId: 'a',
    players: ['a','b'].map(id => ({ id, name: id === 'a' ? 'Alex' : 'River', avatar: 'moon', ready: true, connected: true, abandoned: false, reconnectUntil: null })),
    you: { playerId: 'a' }, feed: [], hand: [], private: null, night: null, dawn: null, personalResult: null,
    deal: { matchId: 'match', players: ['a','b'].map(playerId => ({ playerId, alive: true, acknowledged: true, seals: [{ slot: 0, revealed: false }] })) },
    day: { dayNumber: 1, version: 1, turnNumber: 1, activePlayerId: 'a', playedThisTurn: false, deadline: 10000, deckCount: 20, discardCount: 0, accusationThreshold: 7, players: [], reveal: null, outcome: null },
    role: { kind: 'SLEUTH', ability: 'USED', result: 'SECRET INVESTIGATION RESULT', peek: null, notices: [], individualWin: false },
  };
}
describe('public animation story', () => {
  it('shows a public Scapegoat portrait victory through the server presentation plan',()=>{
    const before=snapshot(),after=structuredClone(before);
    after.phase='GAME_OVER';
    after.day!.outcome={winner:'SCAPEGOAT',reason:'COUNCIL_VOTE',playerId:'b'};
    const effects:TableEffect[]=[{id:'death',type:'DEATH',targetId:'b'},{id:'win',type:'VOTE_VICTORY',targetId:'b'}];
    const moments=publicMoments(before,after,effects);
    expect(moments.map(moment=>moment.kind)).toEqual(['death','victory']);
    expect(moments[1]).toMatchObject({title:'Outcast victory',art:'/art/roles/outcast-chained-transparent.webp',duration:8000,heavy:true});
    expect(moments[1]!.description).toContain('River');
    expect(moments[1]!.description).toContain('match has ended');
    expect(JSON.stringify(moments)).not.toContain('SECRET INVESTIGATION');
    expect(publicMoments(after,after,[])).toEqual([]);
  });
  it('groups successfully played Evidence and skips a single Evidence close-up',()=>{
    const view=snapshot();
    const played=(id:string):TableEffect=>({id,type:'PLAY',cardKind:'EVIDENCE',actorId:'a',targetId:'b'});
    expect(publicMoments(view,view,[played('one')])).toEqual([]);
    const moments=publicMoments(view,view,[played('one'),played('two'),played('three')]);
    expect(moments).toHaveLength(1);
    expect(moments[0]).toMatchObject({kind:'card',title:'Evidence \u00d73',duration:6500});
    expect(moments[0]!.description).toContain('3 cards played');
    const five=publicMoments(view,view,Array.from({length:5},(_,i)=>played(String(i))));
    expect(five).toHaveLength(1);
    expect(five[0]!.title).toBe('Evidence ×5');
    const interrupted=structuredClone(view);interrupted.deal!.players[1]!.seals[0]={slot:0,revealed:true,kind:'HUMAN'};
    const partial=publicMoments(view,interrupted,[played('one'),played('two'),{id:'reveal',type:'REVEAL',targetId:'b',slot:0}]);
    expect(partial[0]).toMatchObject({title:'Evidence ×2'});
    expect(partial.some(moment=>moment.kind==='reveal')).toBe(true);
  });
  it('resumes the hunt once after a continuing reveal without announcing a new day',()=>{
    const before=snapshot(),after=structuredClone(before);before.phase='REVEAL_RESOLUTION';
    after.deal!.players[1]!.seals[0]={slot:0,revealed:true,kind:'HUMAN'};
    const effects:TableEffect[]=[{id:'revealed',type:'REVEAL',targetId:'b',slot:0}];
    const moments=publicMoments(before,after,effects);
    expect(moments.filter(moment=>moment.kind==='resume')).toHaveLength(1);
    expect(moments.at(-1)).toMatchObject({kind:'resume',title:'RESUME THE HUNT',duration:2800});
    expect(moments.some(moment=>moment.title==='Day begins')).toBe(false);
    expect(publicMoments(after,after,[])).toEqual([]);
  });
  it('does not resume the hunt into Night, another accusation, or a finished match',()=>{
    for(const phase of ['NIGHT','REVEAL_RESOLUTION','GAME_OVER'] as const) {
      const before=snapshot(),after=structuredClone(before);before.phase='REVEAL_RESOLUTION';after.phase=phase;
      after.deal!.players[1]!.seals[0]={slot:0,revealed:true,kind:'HUMAN'};
      if(phase==='GAME_OVER')after.day!.outcome={winner:'HUMAN',reason:'ALL_WITCH_SEALS_REVEALED'};
      expect(publicMoments(before,after,[{id:'r',type:'REVEAL',targetId:'b',slot:0}]).some(moment=>moment.kind==='resume'||moment.title==='Day begins')).toBe(false);
    }
  });
  it('preserves the real day transition and card-specific cinematic identities',()=>{
    const before=snapshot(),after=structuredClone(before);before.phase='DAWN';after.day!.dayNumber=2;
    expect(publicMoments(before,after,[])).toContainEqual(expect.objectContaining({kind:'phase',title:'Day begins',eyebrow:'Day 2'}));
    for(const cardKind of ['TESTIMONY','VOW_OF_HEARTS','COUNCIL_BELL','CURSE'] as const) {
      expect(publicMoments(after,after,[{id:cardKind,type:'PLAY',cardKind,actorId:'a',targetId:'b'}])[0])
        .toMatchObject({kind:'card',cardKind,duration:6500,actor:{name:'Alex'},targets:[expect.objectContaining({name:cardKind==='COUNCIL_BELL'?'All living players':'River'})]});
    }
  });
  it('gives each close-up 6–8 seconds and divides the Life reveal into a complete eight-second story', () => {
    expect(Object.entries(MOMENT_DURATION).filter(([kind])=>kind!=='resume').every(([,duration])=>duration>=6000&&duration<=8000)).toBe(true);
    expect(MOMENT_DURATION.resume).toBe(2800);
    expect(REVEAL_STAGES.reduce((total,step)=>total+step.duration,0)).toBe(8000);
  });
  it('announces before showing a full public Life portrait, then identifies the exact slot and survival', () => {
    const before=snapshot(), after=structuredClone(before);
    after.deal!.players[1]!.seals=Array.from({length:5},(_,slot)=>slot===2?{slot,revealed:true,kind:'HUMAN'}:{slot,revealed:false});
    const moments=publicMoments(before,after,[{id:'seven',type:'REVEAL_PENDING',targetId:'b',count:7},{id:'reveal',type:'REVEAL',targetId:'b',slot:2}]);
    const reveal=moments[0]!;
    expect(reveal).toMatchObject({kind:'reveal',sealKind:'HUMAN',reveal:{playerId:'b',slot:2,eliminated:false,reason:'Seven Doubt'}});
    expect(renderLifeReveal(reveal,'announcement')).not.toContain('<img');
    expect(renderLifeReveal(reveal,'portrait')).toContain('/art/roles/good-life-v2.webp');
    expect(renderLifeReveal(reveal,'portrait')).toContain('still alive');
    const positions=renderLifeReveal(reveal,'position');
    expect(positions).toContain('Life card 3 · middle');
    expect((positions.match(/data-reveal-slot=/g)??[])).toHaveLength(5);
    expect((positions.match(/just revealed/g)??[])).toHaveLength(1);
    expect(positions).not.toMatch(/SLEUTH|SECRET|ashbound.webp/);
    expect(moments[1]).toMatchObject({kind:'position',duration:6000});
    expect(moments[2]).toMatchObject({kind:'verdict',title:'The Ashbound still live among us.'});
    expect([0,1,2,3,4].map(lifePosition)).toEqual(['left corner','left inner','middle','right inner','right corner']);
  });
  it('does not manufacture a still-hidden Ashbound verdict after the Village has already won', () => {
    const before=snapshot(), after=structuredClone(before);
    after.deal!.players[1]!.seals[0]={slot:0,revealed:true,kind:'WITCH'};
    after.deal!.players[1]!.alive=false; after.phase='GAME_OVER';
    after.day!.outcome={winner:'HUMAN',reason:'ALL_WITCH_SEALS_REVEALED'};
    const moments=publicMoments(before,after,[{id:'reveal',type:'REVEAL',targetId:'b',slot:0},{id:'death',type:'DEATH',targetId:'b'}]);
    expect(moments.some(moment=>moment.kind==='verdict')).toBe(false);
    expect(moments.at(-1)).toMatchObject({kind:'victory'});
  });
  it('shows public card actors and targets without copying private role results', () => {
    const view = snapshot();
    const effect: TableEffect = { id: 'play', type: 'PLAY', actorId: 'a', targetId: 'b', cardKind: 'WHISPER' };
    const moments = publicMoments(view, view, [effect]);
    expect(moments).toHaveLength(1);
    expect(moments[0]).toMatchObject({ title: 'Whisper', eyebrow: 'Alex plays', route: 'River' });
    expect(moments[0]).toMatchObject({ actor: {name:'Alex',avatar:'moon'}, targets:[{name:'River',avatar:'moon',label:'USED ON'}] });
    expect(JSON.stringify(moments)).not.toMatch(/SECRET|SLEUTH|WITCH-ALIGNED/);
  });
  it('never reveals a face-down Life card from an animation event alone', () => {
    const view = snapshot();
    const effect: TableEffect = { id: 'reveal', type: 'REVEAL', targetId: 'b', slot: 0 };
    expect(publicMoments(view, view, [effect])).toEqual([]);
    const revealed = structuredClone(view);
    revealed.deal!.players[1]!.seals[0] = { slot: 0, revealed: true, kind: 'WITCH' };
    expect(publicMoments(view, revealed, [effect])[0]).toMatchObject({ kind: 'reveal', sealKind: 'WITCH' });
  });
  it('keeps private role use and role-block identity out of the public close-up', () => {
    const view = snapshot();
    expect(publicMoments(view, view, [{ id: 'block', type: 'ROLE_BLOCK', actorId: 'a', targetId: 'b' }])).toEqual([]);
  });
  it('announces phase transitions once and explains what to do at Night', () => {
    const day = snapshot(), night = structuredClone(day); night.phase = 'NIGHT';
    expect(publicMoments(day, night, [])[0]).toMatchObject({ kind: 'phase', phase: 'NIGHT', title: 'Night falls' });
    expect(publicMoments(night, night, [])).toEqual([]);
  });
});
