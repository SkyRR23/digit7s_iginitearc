import { io, type Socket } from 'socket.io-client';
import { SessionSchema, type ClientEvents, type Command, type Reply, type ServerEvents, type Session } from '@ashfall/shared';
export const socket: Socket<ServerEvents, ClientEvents> = io({ autoConnect: false });
const key = 'ashfall.session.v1';
export function readSession(): Session | null {
  try { const result = SessionSchema.safeParse(JSON.parse(sessionStorage.getItem(key) ?? 'null')); return result.success ? result.data : null; }
  catch { return null; }
}
export function saveSession(session: Session | null): boolean {
  try { if (session) sessionStorage.setItem(key, JSON.stringify(session)); else sessionStorage.removeItem(key); return true; }
  catch { return false; }
}
export function actionId(): string {
  // getRandomValues also works on a phone's plain-HTTP LAN development origin.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export async function request(command: Command): Promise<Reply> {
  // Retry the SAME action ID only on the SAME transport session. No buffered offline actions.
  const originalSocket = socket.id;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!socket.connected || socket.id !== originalSocket) break;
    try {
      const reply = await new Promise<Reply>((resolve, reject) => {
        socket.timeout(4000).emit('command', command, (error: Error | null, reply: Reply) => {
          if (error) reject(error); else resolve(reply);
        });
      });
      if (socket.connected && socket.id === originalSocket) return reply;
      break; // A reply from a replaced transport must not restore an obsolete seat.
    } catch { /* Retry is safe because the server caches accepted action IDs. */ }
  }
  return { ok: false, code: 'NETWORK', message: 'Connection interrupted. Reconnect, then check the gathering before trying again.' };
}
