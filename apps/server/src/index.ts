import { createGameServer } from './server.js';
const server = createGameServer({staticDir:process.env.STATIC_DIR});
const port = await server.listen(Number(process.env.PORT ?? 3001), process.env.HOST ?? '127.0.0.1');
console.info(`Ashfall server started on assigned port ${port}.`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void server.close().then(() => process.exit(0)); });
}
