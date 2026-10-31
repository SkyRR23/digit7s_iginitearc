const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const save = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* Optional preference. */ } };
let quiet = read('ashfall.motion') === 'quiet';
import {audio} from './audio';
export const reducedGameMotion = () => quiet || matchMedia('(prefers-reduced-motion: reduce)').matches;
export const gameSoundEnabled = () => !audio.preferences.muted;
export function installGamePreferences(): void {
  const motion = document.getElementById('motion-toggle');
  const sound = document.getElementById('sound-toggle');
  audio.install();
  const panel=document.createElement('dialog');panel.id='audio-settings';panel.setAttribute('aria-label','Sound settings');
  panel.innerHTML='<h2>Soundscape</h2><p>Audio starts after your first interaction. Headphones are optional.</p>'+(['master','music','ambience','sfx'] as const).map(key=>`<label style="display:block;margin:16px 0">${key==='sfx'?'Sound effects':key[0]!.toUpperCase()+key.slice(1)} <input type="range" min="0" max="100" value="${Math.round(audio.preferences[key]*100)}" data-channel="${key}"><output>${Math.round(audio.preferences[key]*100)}%</output></label>`).join('')+'<button type="button" id="audio-mute">Mute</button> <button type="button" id="audio-close">Close</button>';
  document.body.append(panel);
  const settings=document.createElement('button');settings.type='button';settings.textContent='Audio settings';sound?.after(settings);
  settings.onclick=()=>panel.showModal();panel.querySelector('#audio-close')!.addEventListener('click',()=>panel.close());
  panel.querySelector('#audio-mute')!.addEventListener('click',()=>audio.set('muted',!audio.preferences.muted));
  panel.querySelectorAll<HTMLInputElement>('input').forEach(input=>input.addEventListener('input',()=>{audio.set(input.dataset.channel as 'master'|'music'|'ambience'|'sfx',Number(input.value)/100);input.nextElementSibling!.textContent=`${input.value}%`;}));
  const update = () => {
    document.body.classList.toggle('quiet-motion', reducedGameMotion());
    if (motion) { motion.textContent = reducedGameMotion() ? 'Motion: Quiet' : 'Motion: Full'; motion.setAttribute('aria-pressed', String(quiet)); }
    if (sound) { sound.textContent = audio.preferences.muted ? 'Sound: Off' : 'Sound: On'; sound.setAttribute('aria-pressed', String(!audio.preferences.muted)); }
    panel.querySelector('#audio-mute')!.textContent=audio.preferences.muted?'Unmute':'Mute';
  };
  motion?.addEventListener('click', () => { quiet = !quiet; save('ashfall.motion', quiet ? 'quiet' : 'full'); update(); document.dispatchEvent(new Event('ashfall:motion-change')); });
  sound?.addEventListener('click', () => audio.set('muted',!audio.preferences.muted));
  document.addEventListener('ashfall:audio-change',update);
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', update);
  update();
}
