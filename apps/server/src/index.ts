import { createGameServer } from './server.js';
const server = createGameServer();
const port = await server.listen(Number(process.env.PORT ?? 3001), process.env.HOST ?? '127.0.0.1');
console.info(`Ashfall room server: http://127.0.0.1:${port} (Milestone 6)`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void server.close().then(() => process.exit(0)); });
}
