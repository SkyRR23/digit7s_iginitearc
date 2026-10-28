import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { CommandSchema, type ClientEvents, type ServerEvents } from '@ashfall/shared';
import { RoomStore } from './rooms.js';
import type { BotRuntimeOptions, IdentityFactory } from './rooms.js';
import type { DayFactory } from './day-runtime.js';

// Clock/factory injection is for trusted in-process tests, never a browser setting.
export function createGameServer(options: { graceMs?: number; sweepMs?: number; botTickMs?: number; now?: () => number;
  dayFactory?: DayFactory; identityFactory?: IdentityFactory; randomIndex?: (max: number) => number;
  bots?: BotRuntimeOptions; rateLimit?: boolean; presentations?:boolean } = {}) {
  const http = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.writeHead(req.url === '/health' ? 200 : 404);
    res.end(JSON.stringify(req.url === '/health' ? { ok: true, milestone: 6 } : { error: 'Not found' }));
  });
  const io = new Server<ClientEvents, ServerEvents>(http, {
    maxHttpBufferSize: 4096,
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      // Dev requests are same-origin through Vite. Native clients have no Origin.
      if (!origin) return callback(null, true);
      try {
        const allowed = (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean);
        const requestHost = new URL(`http://${req.headers.host}`).hostname;
        const url = new URL(origin);
        callback(null, allowed.includes(origin) || (process.env.NODE_ENV !== 'production' &&
          url.hostname === requestHost && url.port === '5173'));
      } catch { callback(null, false); }
    },
  });
  const store = new RoomStore((id, view) => io.sockets.sockets.get(id)?.emit('state', view), id => {
    const socket = io.sockets.sockets.get(id);
    socket?.emit('replaced');
    socket?.disconnect(true);
  }, options.graceMs, options.now, options.dayFactory, options.identityFactory, options.randomIndex, options.bots, options.presentations);
  const sweep = setInterval(() => store.sweep(), options.sweepMs ?? 1000);
  sweep.unref();
  const botTick = setInterval(() => store.tickBots(), options.botTickMs ?? 100);
  botTick.unref();
  io.use((_socket, next) => next(io.engine.clientsCount > 200 ? new Error('Server full') : undefined));
  io.on('connection', socket => {
    let tokens = 30;
    let last = Date.now();
    socket.on('command', (raw, ack) => {
      if (typeof ack !== 'function') return;
      const now = Date.now();
      tokens = Math.min(30, tokens + (now - last) / 300);
      last = now;
      if (options.rateLimit !== false) {
        if (tokens < 1) return ack({ ok: false, code: 'RATE_LIMIT', message: 'A little slower, please. Try again in a moment.' });
        tokens--;
      }
      const parsed = CommandSchema.safeParse(raw);
      if (!parsed.success) return ack({ ok: false, code: 'INVALID', message: 'Check your name, room code, and message, then try again.' });
      try { ack(store.execute(socket.id, parsed.data)); }
      catch { ack({ ok: false, code: 'INTERNAL', message: 'The server could not complete that action. Refresh to reconnect.' }); }
    });
    socket.on('disconnect', () => store.disconnect(socket.id));
  });
  return {
    http, io, store,
    listen: (port = 3001, host = '127.0.0.1') => new Promise<number>((resolve, reject) => {
      http.once('error', reject);
      http.listen(port, host, () => {
        http.removeListener('error', reject);
        const address = http.address();
        resolve(typeof address === 'object' && address ? address.port : port);
      });
    }),
    close: () => new Promise<void>(resolve => {
      clearInterval(sweep);
      clearInterval(botTick); store.dispose();
      io.close(() => resolve());
    }),
  };
}
