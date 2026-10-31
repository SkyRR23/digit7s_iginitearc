import { AUDIO_CREDITS } from './credits-data';

const escape = (text:string) => text.replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const link = (url:string,label:string) => `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`;
const title = (text:string) => text.replace(/ — Free Sound Effect Download \| BigSoundBank$/,'');
const details = (item:typeof AUDIO_CREDITS[number]) => `<p>By <strong>${escape(item.creator)}</strong></p><p>${link(item.sourceUrl,'Original source')} · ${link(item.licenceUrl,item.licence)}</p><p>${escape(item.uses.join('; '))}</p><p class="credits-modifications">${escape(item.modifications)}</p><p class="credits-filenames">${item.files.map(escape).join(' · ')}</p>`;
export function creditsText():string {
  return ['ASHFALL COUNCIL — AUDIO CREDITS',...AUDIO_CREDITS.map(item => `${title(item.title)} — ${item.creator}\n${item.required ? item.attribution : 'CC0-1.0; attribution optional.'}\nSource: ${item.sourceUrl}\nLicence: ${item.licenceUrl}\nModifications: ${item.modifications}\nFiles: ${item.files.join(', ')}\nUse: ${item.uses.join('; ')}`)].join('\n\n');
}
export function renderCredits():string {
  return `<div class="credits-intro"><p class="guide-lead">The people and sources behind the council’s soundscape. Imported recordings are credited to their creators.</p><button id="copy-credits" type="button">Copy audio credits</button><p id="credits-status" role="status" aria-live="polite"></p></div>
    <section class="credits-section" aria-labelledby="credits-required"><h3 id="credits-required">Required attribution</h3><p>Keep this credit with distributions. Videos using this music also need the attribution in their description.</p>${AUDIO_CREDITS.filter(item => item.required).map(item => `<article class="credits-required"><h4>${escape(title(item.title))}</h4><blockquote>${escape(item.attribution)}</blockquote>${details(item)}</article>`).join('')}</section>
    <section class="credits-section" aria-labelledby="credits-cc0"><h3 id="credits-cc0">Music, ambience &amp; sound</h3><p>These creators released their listed recordings under CC0. Attribution is optional; we acknowledge them here. Open a source for its links and the files used.</p><div class="credits-sources">${AUDIO_CREDITS.filter(item => !item.required).map(item => `<details class="credits-source"><summary><span>${escape(title(item.title))}<small>${escape(item.creator)}</small></span><span class="credits-licence">CC0</span></summary><div>${details(item)}</div></details>`).join('')}</div></section>
    <section class="credits-section" aria-labelledby="credits-project"><h3 id="credits-project">Project &amp; tools</h3><p>Ashfall Council uses project artwork made with AI image tools, and AI-assisted code and editing. Imported music and recordings are externally sourced; this project did not use an AI audio-generation tool to create them.</p><p>${link('https://socket.io/','Socket.IO / Socket.IO Client')} (MIT), ${link('https://zod.dev/','Zod')} (MIT), ${link('https://vite.dev/','Vite')} (MIT), and ${link('https://www.typescriptlang.org/','TypeScript')} (Apache-2.0). ${link('/credits/software-notices.txt','Dependency licence notices')}.</p><p>${link('/audio/credits.html','Audio previews & full recording inventory')} · ${link('/audio/asset-manifest.json','File hashes & processing record')} · ${link('/credits/project-notes.txt','Artwork & AI use records')}</p></section>`;
}
export function installCreditsControls(container:HTMLElement):void {
  container.querySelector<HTMLButtonElement>('#copy-credits')?.addEventListener('click',async () => {
    const status=container.querySelector<HTMLElement>('#credits-status');
    const text=creditsText();let copied=false;
    try { await navigator.clipboard.writeText(text);copied=true; } catch {
      // LAN HTTP can lack the clipboard API. Keep the same credit available there.
      const field=document.createElement('textarea');field.value=text;field.className='credits-copy-field';field.setAttribute('aria-label','Audio credits to copy');container.querySelector('.credits-intro')?.append(field);field.focus();field.select();
      try {copied=document.execCommand('copy');} catch {}
      if(copied)field.remove();
    }
    if(status)status.textContent=copied?'Audio credits copied.':'Select and copy the credit text below.';
  });
}
