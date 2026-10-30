import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const out='docs/audit';fs.mkdirSync(out,{recursive:true});
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const csv=(name,rows)=>fs.writeFileSync(`${out}/${name}`,rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n'));
const assets=walk('apps/client/public');
csv('asset-inventory.csv',[['path','bytes','sha256','classification','provenance_limit'],...assets.map(file=>{
 const p=file.replaceAll('\\','/');const known=p.includes('/guide/')?'Derived game screenshot':p.includes('/concepts/')?'User-supplied generated reference; exact tool record unverified':'AI-generated per project records / conversation';
 return [p,fs.statSync(file).size,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),known,'Per-file prompt, model and legal-use confirmation require team review; appearance is not proof'];
})]);
const lock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
const dependencies=[];let notices='# Third-party dependency license evidence\n\nGenerated from installed packages and package-lock.json; preserve upstream notices in distributions. Workspace packages are team code. This does not license artwork.\n';
for(const [location,entry] of Object.entries(lock.packages)){
 if(!location.includes('node_modules/')||entry.link)continue;
 const name=location.split('node_modules/').at(-1);let pkg={};try{pkg=JSON.parse(fs.readFileSync(`${location}/package.json`,'utf8'));}catch{}
 const license=entry.license??pkg.license??pkg.licenses?.map(v=>v.type).join(';')??'UNVERIFIED';
 const proof=fs.existsSync(location)?fs.readdirSync(location).filter(n=>/^(licen[sc]e|copying|notice)(\.|$)/i.test(n)).map(n=>`${location}/${n}`):[];
 dependencies.push([name,entry.version,entry.dev?'development':'runtime/production dependency',license,pkg.repository?.url??pkg.repository??entry.resolved,proof.join(';')]);
 for(const file of proof)if(fs.statSync(file).isFile())notices+=`\n## ${name} ${entry.version} — ${file}\n\n\x60\x60\x60text\n${fs.readFileSync(file,'utf8')}\n\x60\x60\x60\n`;
}
csv('dependency-licenses.csv',[['package','version','scope','license','source','installed_proof'],...dependencies]);fs.writeFileSync(`${out}/THIRD_PARTY_NOTICES.md`,notices);
const sources=['apps/client/src','apps/server/src','packages/shared/src'].flatMap(walk);const hashes=new Map();
for(const file of sources){const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');hashes.set(hash,[...(hashes.get(hash)??[]),file]);}
fs.writeFileSync(`${out}/inventory-summary.json`,JSON.stringify({assets:assets.length,assetBytes:assets.reduce((s,p)=>s+fs.statSync(p).size,0),dependencyRecords:dependencies.length,sourceFiles:sources.length,identicalSourceFiles:[...hashes.values()].filter(group=>group.length>1)},null,2));
console.log(fs.readFileSync(`${out}/inventory-summary.json`,'utf8'));
