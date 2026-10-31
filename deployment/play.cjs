// Local production preview; cPanel continues to use app.js directly.
const port=process.env.ASHFALL_PLAY_PORT || '3010';
if(!/^\d+$/.test(port)||Number(port)<1024||Number(port)>65535)throw new Error('ASHFALL_PLAY_PORT must be a port between 1024 and 65535.');
process.env.PORT=port;
process.env.HOST='127.0.0.1';
process.env.ALLOWED_ORIGINS=`http://localhost:${port},http://127.0.0.1:${port}`;
console.info(`Ashfall Council local preview: http://localhost:${port}/\nKeep this terminal open. Press Ctrl+C to stop.\nIf the port is occupied, stop the previous preview or set ASHFALL_PLAY_PORT to another port.`);
require('./app.js');
