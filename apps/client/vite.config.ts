import { defineConfig } from 'vite';
import { copyRuntimeAssets } from '../../scripts/runtime-assets.mjs';
import { fileURLToPath } from 'node:url';
export default defineConfig(({command})=>({
  publicDir: command==='build' ? false : 'public',
  plugins: [{ name:'runtime-art-only', apply:'build', closeBundle() {
    copyRuntimeAssets(fileURLToPath(new URL('./public',import.meta.url)),fileURLToPath(new URL('./dist',import.meta.url)));
  } }],
  server: { port: 5173, strictPort: true, proxy: {
    '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
    '/health': 'http://127.0.0.1:3001',
  } },
}));
