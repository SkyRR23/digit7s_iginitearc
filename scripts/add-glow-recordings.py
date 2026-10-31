"""Encode verified, downloaded JaggedStone spell SFX; leave existing media bytes untouched."""
import argparse,hashlib,json,re,subprocess,sys
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--sources',type=Path,required=True);p.add_argument('--ffmpeg',required=True);args=p.parse_args()
root=Path(__file__).resolve().parent.parent;out=root/'apps/client/public/audio';manifest=json.loads((out/'asset-manifest.json').read_text())
def run(*options):
 result=subprocess.run([args.ffmpeg,'-hide_banner','-nostdin','-y',*map(str,options)],capture_output=True);assert result.returncode==0,result.stderr.decode(errors='replace');return result.stderr.decode(errors='replace')
def duration(path):
 text=run('-i',path,'-f','null','-');h,m,s=re.search(r'Duration: (\d+):(\d+):([\d.]+)',text).groups();return int(h)*3600+int(m)*60+float(s)
for name,source_id,purpose in [('glow-rise','jagged-magical_2','Tonal magical glow buildup for card/reveal announcements and Resume the Hunt'),('glow-reveal','jagged-magical_4','Tonal shimmer for public Life portrait, magical card activation and position accents')]:
 source=json.loads((args.sources/f'{source_id}.json').read_text());assert source['creator']=='JaggedStone' and source['licence']=='CC0-1.0'
 path=args.sources/source['sourceFile'];assert hashlib.sha256(path.read_bytes()).hexdigest()==source['sha256']
 seconds=min(2.4,duration(path));filters=f'loudnorm=I=-20:TP=-6:LRA=7,afade=t=in:d=0.015,afade=t=out:st={max(0,seconds-.3)}:d=0.3'
 manifest['sources']=[s for s in manifest['sources'] if s['id']!=source_id]+[source]
 manifest['assets']=[a for a in manifest['assets'] if a['filename'].rsplit('.',1)[0]!=name]
 for ext,codec in [('ogg',['-c:a','libvorbis','-q:a','3']),('mp3',['-c:a','libmp3lame','-b:a','96k'])]:
  target=out/f'{name}.{ext}';run('-i',path,'-t',seconds,'-af',filters,'-ar','44100','-ac','1','-map_metadata','-1',*codec,target)
  data=target.read_bytes();manifest['assets'].append({'filename':target.name,'kind':'sfx','purpose':purpose,'sourceId':source_id,'sourceFile':source['sourceFile'],'sourceDurationSeconds':duration(path),'clip':[0,seconds],'processing':filters,'creator':source['creator'],'sourceUrl':source['sourceUrl'],'downloadUrl':source['downloadUrl'],'licence':source['licence'],'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'durationSeconds':duration(target)})
 print(name,'source seconds',duration(path),'edited seconds',seconds)
(out/'asset-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8');subprocess.run([sys.executable,str(root/'scripts/write-audio-credits.py')],check=True)
