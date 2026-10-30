// CommonJS Passenger entry. The existing compiled ESM server starts exactly once.
const path = require('node:path');
if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Ashfall Council requires Node.js 22.12 or newer.');
process.env.NODE_ENV = 'production';
process.env.STATIC_DIR = path.join(__dirname, 'public');
if (!process.env.ALLOWED_ORIGINS) throw new Error('Set ALLOWED_ORIGINS to the exact HTTPS game origin before starting.');
import('./server/index.js').catch(error => { console.error('Ashfall startup failed:', error.message); process.exit(1); });
