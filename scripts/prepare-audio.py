"""Rebuild local, credited audio from verified downloads; requires FFmpeg.
Usage: python scripts/prepare-audio.py --sources PATH --ffmpeg PATH
No network access, synthetic audio, or unverified assets are generated here.
"""
import argparse, array, contextlib, hashlib, json, re, subprocess, sys, wave, zipfile
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--sources',type=Path,required=True)
parser.add_argument('--ffmpeg',required=True)
args=parser.parse_args()
repo=Path(__file__).resolve().parent.parent
output=repo/'apps/client/public/audio'
output.mkdir(parents=True,exist_ok=True)
sources={item['id']:item for item in json.loads((args.sources/'sources.json').read_text(encoding='utf-8'))}
for source in sources.values():
    actual=hashlib.sha256((args.sources/source['sourceFile']).read_bytes()).hexdigest()
    assert actual==source['sha256'],f"Source changed: {source['id']}"
def ffmpeg(*options):
    result=subprocess.run([args.ffmpeg,'-hide_banner','-nostdin','-y',*map(str,options)],capture_output=True)
    if result.returncode:raise RuntimeError(result.stderr.decode('utf-8',errors='replace')[-3000:])
    return result
def duration(path):
    text=ffmpeg('-i',path,'-f','null','-').stderr.decode('utf-8',errors='replace')
    h,m,s=re.search(r'Duration: (\d+):(\d+):([\d.]+)',text).groups()
    return int(h)*3600+int(m)*60+float(s)
def quiet_window(path,start,end,length):
    raw=ffmpeg('-i',path,'-ac','1','-ar','8000','-f','f32le','-').stdout
    values=array.array('f');values.frombytes(raw)
    energies=[sum(float(x)*x for x in values[i:i+8000])/8000 for i in range(0,len(values)-8000,8000)]
    candidates=range(int(start),min(int(end-length),len(energies)-length))
    return min(candidates,key=lambda i:sum(energies[i:i+length]))
records=[]
def emit(name,source_id,source_file,kind,purpose,filters,clip=None):
    path=args.sources/source_file
    source=sources[source_id]
    if '.zip:' in source_file:
        pack,entry=source_file.split(':',1)
        raw=zipfile.ZipFile(args.sources/pack).read(entry)
        path=Path(temp_path)/Path(entry).name;path.write_bytes(raw)
    original_duration=duration(path)
    options=['-ss',clip[0]] if clip else []
    options+=['-i',path]
    if clip: options+=['-t',clip[1]]
    options+=['-af',filters,'-ar','44100','-ac','1' if kind=='sfx' else '2','-map_metadata','-1']
    for extension,codec in [('ogg',['-c:a','libvorbis','-q:a','3']),('mp3',['-c:a','libmp3lame','-b:a','96k' if kind!='music' else '128k'])]:
        target=output/f'{name}.{extension}'
        ffmpeg(*options,*codec,target)
        data=target.read_bytes()
        records.append({'filename':target.name,'kind':kind,'purpose':purpose,'sourceId':source_id,'sourceFile':source_file,
            'sourceDurationSeconds':original_duration,'clip':clip,'processing':filters,'creator':source['creator'],
            'sourceUrl':source['sourceUrl'],'downloadUrl':source['downloadUrl'],'licence':source['licence'],
            'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'durationSeconds':round(duration(target),3)})
    print('Prepared',name,flush=True)

def music_loop(name,source_id,purpose):
    source_file=sources[source_id]['sourceFile']
    source=args.sources/source_file
    pcm=Path(temp_path)/f'{name}-music.wav'
    filters='loudnorm=I=-18:TP=-3:LRA=9'
    ffmpeg('-i',source,'-af',filters,'-ar','44100','-ac','2','-c:a','pcm_s16le',pcm)
    with wave.open(str(pcm),'rb') as file:
        params=file.getparams();samples=array.array('h');samples.frombytes(file.readframes(file.getnframes()))
    frames=2*params.framerate;count=frames*params.nchannels
    seam=array.array('h')
    for index in range(count):
        weight=(index//params.nchannels)/(frames-1)
        seam.append(round(samples[-count+index]*(1-weight)+samples[index]*weight))
    with wave.open(str(pcm),'wb') as file:
        file.setparams(params);file.writeframes((samples[count:-count]+seam).tobytes())
    relative=f'{name}-music-loop.wav';(args.sources/relative).write_bytes(pcm.read_bytes())
    before=len(records)
    emit(name,source_id,relative,'music',purpose,'anull')
    for record in records[before:]:
        record['sourceFile']=source_file;record['sourceDurationSeconds']=duration(source)
        record['processing']=filters+'; resample 44100 Hz stereo PCM16; circular two-second tail/head crossfade (Python)'

with contextlib.nullcontext(args.sources.resolve()/'processing') as temp_path:
    temp_path.mkdir(exist_ok=True)
    assert Path(temp_path).resolve().is_relative_to(args.sources.resolve())
    music_loop('phoenix-2026','phoenix','Continuous main-menu chamber strings')
    music_loop('old-tower-inn','lobby','Continuous multiplayer-lobby instrumental music')
    music_loop('town-in-ruins','town','Continuous Day Phase soundtrack; retains playhead through ordinary actions')
    music_loop('rising-moon','rising-moon','Continuous Night Phase soundtrack; crossfades from Day')
    for name,seconds in [('victory',8),('defeat',9)]:
        source_path=args.sources/f'{name}.mp3';start=max(0,duration(source_path)-seconds)
        emit(f'{name}-theme',name,f'{name}.mp3','music',f'One {seconds}-second {name} conclusion; never loops',f'loudnorm=I=-18:TP=-3:LRA=9,afade=t=in:d=0.15,afade=t=out:st={seconds-1}:d=1',(round(start,2),seconds))
    for name,seconds,purpose in [('fireplace',58,'Menu/lobby/result hearth'),('evening-birds',140,'Day woodland/countryside environment'),('night-meadow',180,'Night crickets and rare frogs')]:
        source=args.sources/f'{name}.mp3';pcm=Path(temp_path)/f'{name}.wav'
        filters=f'atrim=0:{seconds},asetpts=PTS-STARTPTS,highpass=f=80,lowpass=f=9500,loudnorm=I=-25:TP=-5:LRA=9'
        ffmpeg('-i',source,'-af',filters,'-ar','44100','-ac','2','-c:a','pcm_s16le',pcm)
        with wave.open(str(pcm),'rb') as file:
            params=file.getparams();samples=array.array('h');samples.frombytes(file.readframes(file.getnframes()))
        fade_frames=2*params.framerate;fade_samples=fade_frames*params.nchannels
        seam=array.array('h')
        for index in range(fade_samples):
            weight=(index//params.nchannels)/(fade_frames-1)
            seam.append(round(samples[len(samples)-fade_samples+index]*(1-weight)+samples[index]*weight))
        loop=samples[fade_samples:-fade_samples]+seam
        with wave.open(str(pcm),'wb') as file:
            file.setparams(params);file.writeframes(loop.tobytes())
        assert len(loop)==len(samples)-fade_samples
        graph=filters+'; resample 44100 Hz stereo PCM16; circular two-second linear tail/head crossfade (Python)'
        # emit reads the prepared PCM locally; metadata still records the actual source.
        relative=f'{name}-loop.wav';target=args.sources/relative
        target.write_bytes(pcm.read_bytes())
        before=len(records)
        emit(name,name,relative,'ambience',purpose,'anull')
        for record in records[before:]:
            record['sourceFile']=f'{name}.mp3';record['clip']=[0,seconds];record['processing']=graph;record['sourceDurationSeconds']=duration(source)
    sample_sources={
        'card-slide-1':('casino','casino.zip:Audio/card-slide-1.ogg'),
        'card-slide-2':('casino','casino.zip:Audio/card-slide-2.ogg'),
        'card-place-1':('casino','casino.zip:Audio/card-place-1.ogg'),
        'card-place-2':('casino','casino.zip:Audio/card-place-2.ogg'),
        'card-shuffle':('casino','casino.zip:Audio/card-shuffle.ogg'),
        'wood-tap':('impacts','impacts.zip:Audio/impactWood_light_000.ogg'),
        'wood-impact':('impacts','impacts.zip:Audio/impactWood_medium_000.ogg'),
        'page-flip':('pages','pages.ogg'),
        'church-bell':('church-bell','church-bell.mp3'),
        'card-cut':('playing-cut','playing-cut.wav'),
        'card-contact':('playing-contact2','playing-contact2.wav'),
        'wood-creak':('various','various.zip:floor_creak2.wav'),
        'paper-swell':('casino','casino.zip:Audio/card-shuffle.ogg'),
    }
    for name,(source_id,source_file) in sample_sources.items():
        clip=(0,2.6) if name=='church-bell' else None
        filters=('areverse,' if name=='paper-swell' else '')+'loudnorm=I=-20:TP=-6:LRA=8,afade=t=in:d=0.004'
        emit(name,source_id,source_file,'sfx','Reversed recorded card shuffle for supernatural layers' if name=='paper-swell' else 'See cue mapping in AUDIO_IMPLEMENTATION_REPORT.md',filters,clip)
    licences=output/'licenses';licences.mkdir(exist_ok=True)
    for pack in ['casino','impacts']:
        text=zipfile.ZipFile(args.sources/f'{pack}.zip').read('License.txt')
        (licences/f'kenney-{pack}.txt').write_bytes(text)
    used={r['sourceId'] for r in records}
    (output/'asset-manifest.json').write_text(json.dumps({'verified':'2026-10-31','sources':[s for k,s in sources.items() if k in used],'assets':records},indent=2),encoding='utf-8')
    subprocess.run([sys.executable,str(repo/'scripts/write-audio-credits.py')],check=True)
    subprocess.run([sys.executable,str(repo/'scripts/add-event-recordings.py'),'--sources',str(args.sources),'--ffmpeg',args.ffmpeg],check=True)
    if (args.sources/'jagged-magical_2.json').exists() and (args.sources/'jagged-magical_4.json').exists():
        subprocess.run([sys.executable,str(repo/'scripts/add-glow-recordings.py'),'--sources',str(args.sources),'--ffmpeg',args.ffmpeg],check=True)
    final=json.loads((output/'asset-manifest.json').read_text(encoding='utf-8'))['assets']
    print('TOTAL',len(final),'files',sum(r['bytes'] for r in final),'bytes',flush=True)
