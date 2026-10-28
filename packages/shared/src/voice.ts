/** Provider-neutral voice contract. The game remains fully playable without an adapter. */
export type VoiceChannel = 'lobby' | 'council' | 'witch' | 'dead';
export interface VoicePermission {
  channel: VoiceChannel;
  mayPublish: boolean;
  maySubscribe: boolean;
  expiresAt: number;
}
/** Server-only implementation must derive permissions from authenticated match state. */
export interface VoiceService {
  issueAccess(playerId: string, roomId: string): Promise<{
    url: string; token: string; permissions: readonly VoicePermission[];
  }>;
  revokeAccess(playerId: string, roomId: string): Promise<void>;
}
/** Future browser adapter; absence of an adapter must leave text play fully functional. */
export interface VoiceClient {
  connect(url: string, shortLivedToken: string): Promise<void>;
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  disconnect(): Promise<void>;
}

export type VoicePhase = 'LOBBY' | 'PRIVATE_DEAL' | 'DAY' | 'REVEAL_RESOLUTION' | 'NIGHT' | 'DAWN' | 'GAME_OVER';
export interface VoicePolicyContext {
  phase: VoicePhase;
  player: { seated: boolean; alive: boolean; everWitch: boolean } | null;
  enabled: boolean;
  deadLoungeEnabled?: boolean;
  now: number;
  ttlMs: number;
}

/**
 * Server policy input only. A browser must never supply trusted alignment,
 * life state, phase, channel, or grants to a provider adapter.
 */
export function deriveVoicePermissions(context: VoicePolicyContext): readonly VoicePermission[] {
  const { player } = context;
  if (!context.enabled || !player?.seated || !Number.isFinite(context.now) ||
    !Number.isInteger(context.ttlMs) || context.ttlMs <= 0) return [];
  const expiresAt = context.now + Math.min(context.ttlMs, 5 * 60_000);
  const grant = (channel: VoiceChannel): VoicePermission => ({ channel, mayPublish: true, maySubscribe: true, expiresAt });
  if (context.phase === 'GAME_OVER') return [grant('council')];
  if (!player.alive) return context.deadLoungeEnabled ? [grant('dead')] : [];
  if (context.phase === 'LOBBY' || context.phase === 'PRIVATE_DEAL') return [grant('lobby')];
  if (context.phase === 'NIGHT') return player.everWitch ? [grant('witch')] : [];
  return [grant('council')];
}
