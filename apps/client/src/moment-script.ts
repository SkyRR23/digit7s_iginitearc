import { IDENTITY_LABELS, PRESENTATION_DURATION, publicPresentationPlan, type Avatar, type IdentityKind, type PublicSeal, type RoomView, type TableEffect } from '@ashfall/shared';
export { REVEAL_STAGES } from '@ashfall/shared';
import { cardArt, cardTitle, CARD_INFO } from './card-info';
import { phaseName } from './phase-ui';

export interface GameMoment {
  kind: 'card' | 'reveal' | 'position' | 'death' | 'phase' | 'victory' | 'power' | 'verdict';
  title: string; eyebrow: string; description: string; route?: string;
  art?: string; sealKind?: IdentityKind; phase?: RoomView['phase']; tone: 'crimson' | 'ivory' | 'blue' | 'sage'; duration: number;
  heavy?: boolean;
  actor?: { name: string; avatar?: Avatar };
  targets?: { name: string; avatar?: Avatar; label: string }[];
  reveal?: { playerId: string; name: string; slot: number; seals: PublicSeal[]; eliminated: boolean; reason: string };
}
export const MOMENT_DURATION = PRESENTATION_DURATION;
/** Public close-ups read public events and publicly revealed Seals only. */
export function publicMoments(previous: RoomView, next: RoomView, effects: TableEffect[]): GameMoment[] {
  const name = (id?: string) => next.players.find(p => p.id === id)?.name ?? 'A player';
  const person = (id?: string) => ({ name: name(id), avatar: next.players.find(p => p.id === id)?.avatar });
  const moments: GameMoment[] = [];
  const reveals = effects.filter(effect => effect.type === 'REVEAL' && next.deal?.players.find(player => player.playerId === effect.targetId)?.seals.some(seal => seal.slot === effect.slot && seal.revealed));
  for (const effect of effects) {
    if (effect.type === 'PLAY' && effect.cardKind && !reveals.length &&
      ['WITNESS','STOCKS','CURSE','CONSPIRACY','CINDER_SHIFT','SCAPEGOAT','VOW_OF_HEARTS','WHISPER','ASYLUM'].includes(effect.cardKind)) {
      const kind = effect.cardKind;
      const supportive = ['ALIBI','MERCY','HEARTHWARD','PIETY','ASYLUM'].includes(kind);
      moments.push({ kind: 'card', eyebrow: `${name(effect.actorId)} plays`, title: cardTitle(kind), art: cardArt(kind),
        route: kind === 'CONSPIRACY' ? 'All living players' : `${name(effect.targetId)}${effect.secondTargetId ? ` → ${name(effect.secondTargetId)}` : ''}`,
        description: CARD_INFO[kind].brief, tone: supportive ? 'sage' : kind === 'WHISPER' ? 'blue' : 'crimson', duration: MOMENT_DURATION.card,
        actor: person(effect.actorId),
        targets: kind === 'CONSPIRACY' ? [{ name: 'All living players', label: 'AFFECTS' }]
          : [{ ...person(effect.targetId), label: kind === 'SCAPEGOAT' ? 'TRANSFER FROM' : 'USED ON' },
            ...(effect.secondTargetId ? [{ ...person(effect.secondTargetId), label: 'TRANSFER TO' }] : [])],
        heavy: ['WITNESS','CURSE','CONSPIRACY','CINDER_SHIFT','STOCKS'].includes(kind) });
    }
    if (effect.type === 'REVEAL') {
      const seal = next.deal?.players.find(p => p.playerId === effect.targetId)?.seals.find(s => s.slot === effect.slot);
      if (seal?.revealed) {
        const player = next.deal!.players.find(player => player.playerId === effect.targetId)!;
        moments.push({ kind: 'reveal', eyebrow: `${name(effect.targetId)} · Life revealed`,
          title: IDENTITY_LABELS[seal.kind], sealKind: seal.kind,
          description: player.alive ? 'One Life card revealed. This player is still alive.' : `${name(effect.targetId)} has been eliminated.`,
          reveal: { playerId: player.playerId, name: name(effect.targetId), slot: seal.slot, seals: player.seals.map(seal => ({ ...seal })), eliminated: !player.alive,
            reason: effects.some(event => event.type === 'REVEAL_PENDING' && event.targetId === effect.targetId) ? 'Seven Doubt' : 'A secret comes to light' },
          tone: seal.kind === 'WITCH' ? 'crimson' : 'ivory', duration: MOMENT_DURATION.reveal, heavy: true });
        moments.push({ ...moments.at(-1)!, kind: 'position', duration: MOMENT_DURATION.position, heavy: false });
      }
    }
  }
  const fallen = [...new Set(effects.filter(e => e.type === 'DEATH').map(e => e.targetId))];
  if (fallen.length) moments.push({ kind: 'death', eyebrow: 'A lantern goes dark', title: fallen.map(name).join(' & '),
    description: fallen.length > 1 ? 'Have fallen. Their remaining Life cards are public.' : 'Has fallen. Their remaining Life cards are public.', tone: 'crimson', duration: MOMENT_DURATION.death, heavy: true });
  if (reveals.length && !next.day?.outcome && !next.deal?.players.some(player => player.seals.some(seal => seal.revealed && seal.kind === 'WITCH')))
    moments.push({ kind: 'verdict', eyebrow: 'The hunt continues', title: 'The Ashbound still live among us.',
      description: 'No Ashbound Life card has been caught yet. A revealed Villager card does not prove its owner’s allegiance.', tone: 'crimson', duration: MOMENT_DURATION.verdict });
  if (previous.phase !== next.phase && next.phase === 'GAME_OVER') {
    moments.push({ kind: 'victory', eyebrow: 'The final verdict', title: next.day?.outcome?.winner === 'HUMAN' ? 'The village survives' : 'The Ashbound prevail',
      description: next.day?.outcome?.winner === 'HUMAN' ? 'Every Ashbound Life card has been revealed.' : 'Every surviving player is Witch-aligned.', tone: next.day?.outcome?.winner === 'HUMAN' ? 'ivory' : 'crimson', duration: MOMENT_DURATION.victory });
  } else if (previous.phase !== next.phase && ['DAY','NIGHT','DAWN'].includes(next.phase)) {
    moments.push({ kind: 'phase', phase: next.phase, eyebrow: next.phase === 'DAY' ? `Day ${next.day?.dayNumber ?? 1}` : 'The village changes',
      title: next.phase === 'NIGHT' ? 'Night falls' : next.phase === 'DAWN' ? 'Dawn breaks' : 'Day begins',
      description: next.phase === 'NIGHT' ? 'Public chat is silent. Check your private night choices.' : next.phase === 'DAWN' ? 'The night is over. The village learns who survived.' : 'Talk, play your cards, and cast your vote.',
      tone: next.phase === 'NIGHT' ? 'blue' : 'ivory', duration: MOMENT_DURATION.phase });
  }
  // A batch can reveal many Seals at once on death. Keep the story readable.
  const story = moments.filter((moment, index, all) => !['reveal','position'].includes(moment.kind) ||
    all.findIndex(other => other.kind === moment.kind && other.reveal?.playerId === moment.reveal?.playerId && other.reveal?.slot === moment.reveal?.slot) === index);
  return publicPresentationPlan(previous.phase,{phase:next.phase,deal:next.deal,hasOutcome:!!next.day?.outcome},effects).flatMap(step=>{
    const event=step.eventIndex===undefined?null:effects[step.eventIndex];
    const index=story.findIndex(moment=>moment.kind===step.kind&&(!event||!['reveal','position'].includes(step.kind)||
      moment.reveal?.playerId===event.targetId&&moment.reveal?.slot===event.slot));
    if(index<0)return [];
    return [{...story.splice(index,1)[0]!,duration:step.duration}];
  });
}
export const readablePhase = phaseName;
