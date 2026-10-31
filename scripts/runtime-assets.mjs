import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
// Explicit dynamic filename families; literal CSS/HTML/JS URLs are discovered too.
export function copyRuntimeAssets(source, output) {
 const paths=new Set(['art/digital-village.webp','art/cards/hidden-life-v1.webp','art/cards/curse-sigil.svg']);
 for(const file of ['software-notices.txt','project-notes.txt'])paths.add(`credits/${file}`);
 const cards=['alibi','asylum','cinder_shift','conspiracy','council-bell-v2','curse','eavesdrop','evidence','hearthward','mercy','piety','scapegoat','stocks','testimony','vow_of_hearts','whisper','witness'];
 for(const name of cards)paths.add(`art/cards/${name}.webp`);
 for(const name of ['villager','ashbound','sleuth','herbalist','gossip','hexer','outcast-chained-transparent','good-life-v2','evil-life'])paths.add(`art/roles/${name}.webp`);
 const audio=JSON.parse(readFileSync(join(source,'audio/asset-manifest.json'),'utf8'));
 for(const asset of audio.assets){
  if(!/^[a-z0-9-]+\.(ogg|mp3)$/.test(asset.filename))throw new Error('Invalid runtime audio filename');
  paths.add(`audio/${asset.filename}`);
 }
 for(const file of ['asset-manifest.json','credits.html','licenses/kenney-casino.txt','licenses/kenney-impacts.txt'])paths.add(`audio/${file}`);
 const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(d,e.name)):[join(d,e.name)]);
 for(const file of walk(output).filter(p=>/\.(css|js|html)$/.test(p)))for(const match of readFileSync(file,'utf8').matchAll(/(?:["'(])\/?(art\/[\w/.-]+\.(?:webp|png|svg|jpg))/g))paths.add(match[1]);
 for(const path of paths){const to=join(output,path);mkdirSync(dirname(to),{recursive:true});copyFileSync(join(source,path),to);}
 return {included:[...paths].sort(),bytes:[...paths].reduce((n,p)=>n+statSync(join(source,p)).size,0)};
}
