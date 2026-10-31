"""Add two small recordings from the already verified laleksic pack; leave BGM bytes untouched."""
import argparse,hashlib,json,re,subprocess,sys,zipfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--sources',type=Path,required=True);p.add_argument('--ffmpeg',required=True);args=p.parse_args()
root=Path(__file__).resolve().parent.parent;out=root/'apps/client/public/audio';manifest=json.loads((out/'asset-manifest.json').read_text())
source=next(s for s in manifest['sources'] if s['id']=='various');pack=args.sources/source['sourceFile']
assert hashlib.sha256(pack.read_bytes()).hexdigest()==source['sha256'],'Verified source pack changed'
processing=args.sources/'processing';processing.mkdir(exist_ok=True)
def run(*options):
 result=subprocess.run([args.ffmpeg,'-hide_banner','-nostdin','-y',*map(str,options)],capture_output=True);assert result.returncode==0,result.stderr.decode(errors='replace');return result.stderr.decode(errors='replace')
def duration(path):
 text=run('-i',path,'-f','null','-');h,m,s=re.search(r'Duration: (\d+):(\d+):([\d.]+)',text).groups();return int(h)*3600+int(m)*60+float(s)
for name,member,purpose in [('metal-lock','lock.wav','Stocks locking, restraint release and successful protection accents'),('metal-resonance','clang_metal.wav','Public reveal, position highlight, verdict and result accents')]:
 path=processing/member;path.write_bytes(zipfile.ZipFile(pack).read(member));seconds=min(1.6,duration(path));filters='loudnorm=I=-23:TP=-8:LRA=5,afade=t=in:d=0.004,afade=t=out:st='+str(max(0,seconds-.15))+':d=0.15'
 manifest['assets']=[a for a in manifest['assets'] if a['filename'].rsplit('.',1)[0]!=name]
 for ext,codec in [('ogg',['-c:a','libvorbis','-q:a','3']),('mp3',['-c:a','libmp3lame','-b:a','96k'])]:
  target=out/f'{name}.{ext}';run('-i',path,'-t',seconds,'-af',filters,'-ar','44100','-ac','1','-map_metadata','-1',*codec,target)
  data=target.read_bytes();manifest['assets'].append({'filename':target.name,'kind':'sfx','purpose':purpose,'sourceId':'various','sourceFile':'various.zip:'+member,'sourceDurationSeconds':duration(path),'clip':[0,seconds],'processing':filters,'creator':source['creator'],'sourceUrl':source['sourceUrl'],'downloadUrl':source['downloadUrl'],'licence':source['licence'],'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'durationSeconds':duration(target)})
 print(name,seconds)
(out/'asset-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8');subprocess.run([sys.executable,str(root/'scripts/write-audio-credits.py')],check=True)
