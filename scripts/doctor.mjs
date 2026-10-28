const checks = [
  ['room server', 'http://127.0.0.1:3001/health'],
  ['browser client', 'http://127.0.0.1:5173/'],
];

let healthy = true;
for (const [label, url] of checks) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    console.log(`OK       ${label.padEnd(14)} ${url}`);
  } catch {
    healthy = false;
    console.error(`OFFLINE  ${label.padEnd(14)} ${url}`);
  }
}
if (!healthy) {
  console.error('\nRun "npm run play" from the project root and keep that terminal open while testing.');
  process.exitCode = 1;
}
