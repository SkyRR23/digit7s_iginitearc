const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const save = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* Optional preference. */ } };
let quiet = read('ashfall.motion') === 'quiet';
let muted = read('ashfall.muted') === 'true';
export const reducedGameMotion = () => quiet || matchMedia('(prefers-reduced-motion: reduce)').matches;
export const gameSoundEnabled = () => !muted;
export function installGamePreferences(): void {
  const motion = document.getElementById('motion-toggle');
  const sound = document.getElementById('sound-toggle');
  const update = () => {
    document.body.classList.toggle('quiet-motion', reducedGameMotion());
    if (motion) { motion.textContent = reducedGameMotion() ? 'Motion: Quiet' : 'Motion: Full'; motion.setAttribute('aria-pressed', String(quiet)); }
    if (sound) { sound.textContent = muted ? 'Sound: Off' : 'Sound: On'; sound.setAttribute('aria-pressed', String(!muted)); }
  };
  motion?.addEventListener('click', () => { quiet = !quiet; save('ashfall.motion', quiet ? 'quiet' : 'full'); update(); document.dispatchEvent(new Event('ashfall:motion-change')); });
  sound?.addEventListener('click', () => { muted = !muted; save('ashfall.muted', String(muted)); update(); });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', update);
  update();
}
