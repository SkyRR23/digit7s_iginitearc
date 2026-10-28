import type { RoomView } from '@ashfall/shared';
type Revision = Pick<RoomView, 'code' | 'you' | 'version' | 'privateVersion'>;

/** A seat change must clear the old view first; late replies cannot resurrect it. */
export function acceptsView(current: Revision | null, next: Revision): boolean {
  if (!current) return true;
  if (current.code !== next.code || current.you?.playerId !== next.you?.playerId) return false;
  return next.version > current.version || (next.version === current.version && next.privateVersion >= current.privateVersion);
}
