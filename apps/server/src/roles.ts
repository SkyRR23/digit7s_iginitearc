import type { IdentityMatch } from '@ashfall/shared/identities';
import type { SpecialRole, PrivateRoleView } from '@ashfall/shared';

export interface RolePreset {
  innocent: Partial<Record<Extract<SpecialRole, 'SLEUTH' | 'HERBALIST' | 'GOSSIP'>, number>>;
  witch: Partial<Record<Extract<SpecialRole, 'HEXER'>, number>>;
  neutral: Partial<Record<Extract<SpecialRole, 'SCAPEGOAT'>, number>>;
}

/** Server-owned quantities. Duplicate specials can be enabled in a later preset. */
export const ROLE_PRESETS: Record<number, RolePreset> = {
  6: { innocent: { SLEUTH: 1 }, witch: {}, neutral: { SCAPEGOAT: 1 } },
  7: { innocent: { SLEUTH: 1, HERBALIST: 1 }, witch: {}, neutral: { SCAPEGOAT: 1 } },
  8: { innocent: { SLEUTH: 1, HERBALIST: 1, GOSSIP: 1 }, witch: {}, neutral: { SCAPEGOAT: 1 } },
  9: { innocent: { SLEUTH: 1, HERBALIST: 1, GOSSIP: 1 }, witch: { HEXER: 1 }, neutral: { SCAPEGOAT: 1 } },
  10: { innocent: { SLEUTH: 1, HERBALIST: 1, GOSSIP: 1 }, witch: { HEXER: 1 }, neutral: { SCAPEGOAT: 1 } },
};

export interface RoleRecord {
  kind: SpecialRole;
  used: boolean;
  activeTargetId: string | null;
  result: string | null;
  peek: { targetId: string; expiresAt: number; open: boolean; exposed: boolean } | null;
  notices: string[];
  individualWin: boolean;
}
export type Roles = Record<string, RoleRecord>;

function take(pool: string[], randomIndex: (max: number) => number): string {
  if (!pool.length) throw new Error('Role preset exceeds eligible players.');
  const index = randomIndex(pool.length);
  if (!Number.isInteger(index) || index < 0 || index >= pool.length) throw new Error('Invalid role random index.');
  return pool.splice(index, 1)[0]!;
}

export function assignRoles(identity: IdentityMatch, preset: RolePreset, includeScapegoat: boolean,
  randomIndex: (max: number) => number): Roles {
  const innocent = identity.players.filter(p => !p.everWitch).map(p => p.id);
  const witch = identity.players.filter(p => p.everWitch).map(p => p.id);
  const assigned = new Map<string, SpecialRole>();
  if (includeScapegoat) for (let n = 0; n < (preset.neutral.SCAPEGOAT ?? 0); n++)
    assigned.set(take(innocent, randomIndex), 'SCAPEGOAT');
  for (const role of ['SLEUTH', 'HERBALIST', 'GOSSIP'] as const)
    for (let n = 0; n < (preset.innocent[role] ?? 0); n++) assigned.set(take(innocent, randomIndex), role);
  for (const role of ['HEXER'] as const)
    for (let n = 0; n < (preset.witch[role] ?? 0); n++) assigned.set(take(witch, randomIndex), role);
  for (const id of innocent) assigned.set(id, 'VILLAGER');
  for (const id of witch) assigned.set(id, 'ASHBOUND');
  if (assigned.size !== identity.players.length) throw new Error('Every player needs exactly one role.');
  return Object.fromEntries([...assigned].map(([id, kind]) => [id, {
    kind, used: false, activeTargetId: null, result: null, peek: null, notices: [], individualWin: false,
  } satisfies RoleRecord]));
}

export function privateRole(roles: Roles | null, viewerId: string, alive: boolean): PrivateRoleView | null {
  const role = roles?.[viewerId];
  if (!role) return null;
  return { kind: role.kind, ability: !alive || ['VILLAGER','ASHBOUND','SCAPEGOAT'].includes(role.kind)
    ? 'UNAVAILABLE' : role.activeTargetId || role.peek?.open ? 'ACTIVE' : role.used ? 'USED' : 'AVAILABLE',
    result: role.result, peek: role.peek?.open ? { targetId: role.peek.targetId, expiresAt: role.peek.expiresAt, exposed: role.peek.exposed } : null,
    notices: [...role.notices], individualWin: role.individualWin };
}
