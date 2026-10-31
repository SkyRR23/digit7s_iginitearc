import { audioFiles, SCENES, SOUNDS, type BedAsset, type Cue, type Sample, type Scene } from './audio-catalog';
export { CUES, type Cue } from './audio-catalog';
type Channel = 'master' | 'music' | 'ambience' | 'sfx';
type Layer = 'music' | 'ambience';
type MediaVoice = {asset:BedAsset;channel:Layer;element:HTMLAudioElement;source:MediaElementAudioSourceNode;gain:GainNode;retiring:boolean;fading?:boolean;disposed:boolean;level:number;version:number;needsLoad?:boolean;reload?:()=>void;loadingTimer?:ReturnType<typeof setTimeout>};
const defaults = {master:.7,music:.18,ambience:.2,sfx:.65,muted:false};
const MAX_CACHE_BYTES = 6*1024*1024;
const important = new Set<Cue>(['death','reveal','bell','night','dawn','accuse','conspiracy','verdict','threshold','heavy-stamp','reveal-dark']);

/** Same local mixer and event API; long recordings use browser-managed streaming. */
export class CouncilAudio {
  preferences = {...defaults};
  private context?: AudioContext;
  private buses?: Record<Channel,GainNode>;
  private ducks?: Record<Layer,GainNode>;
  private scene: Scene = 'menu';
  private bed?: {scene:Scene;musicFinished:boolean};
  private resultAsset?: BedAsset;
  private media = new Set<MediaVoice>();
  private activeSfx = new Set<AudioBufferSourceNode>();
  private scopedSfx = new Map<AudioBufferSourceNode,{gain:GainNode;scope?:string;important:boolean}>();
  private cache = new Map<Sample,AudioBuffer>();
  private cacheBytes = 0;
  private pending = new Set<Sample>();
  private queue: Sample[] = [];
  private fetching = 0;
  private failures = new Map<string,number>();
  private recent = new Map<string,number>();
  private variation = new Map<Cue,number>();
  private installed = false;
  private duckUntil = 0;
  private probe = document.createElement('audio');
  constructor() {
    try {
      const data = JSON.parse(localStorage.getItem('ashfall.audio.v1') ?? 'null');
      if (data) {
        for (const key of ['master','music','ambience','sfx'] as const)
          if (Number.isFinite(data[key])) this.preferences[key] = Math.max(0,Math.min(1,data[key]));
        this.preferences.muted = data.muted === true;
      } else this.preferences.muted = localStorage.getItem('ashfall.muted') === 'true';
    } catch { /* Storage is optional. */ }
  }
  async unlock(): Promise<void> {
    try {
      const created = !this.context;
      if (!this.context) {
        const c = this.context = new AudioContext();
        this.buses = {master:c.createGain(),music:c.createGain(),ambience:c.createGain(),sfx:c.createGain()};
        this.ducks = {music:c.createGain(),ambience:c.createGain()};
        const limiter = c.createDynamicsCompressor(); limiter.threshold.value = -14; limiter.ratio.value = 8;
        this.buses.master.connect(limiter).connect(c.destination);
        for (const key of ['music','ambience'] as const) this.buses[key].connect(this.ducks[key]).connect(this.buses.master);
        this.buses.sfx.connect(this.buses.master); this.mix();
      }
      if (document.hidden) return;
      if (this.context.state === 'suspended') await this.context.resume();
      this.startBed(); this.prepare('click','select'); this.pump();
      if (created && (this.scene === 'day' || this.scene === 'night')) this.prepare('draw','place','stamp','bell','flip','reveal');
    } catch { /* Unsupported/blocked audio never interrupts gameplay. */ }
  }
  set(key:Channel|'muted',value:number|boolean):void {
    if (key === 'muted') this.preferences.muted = value === true;
    else if (typeof value === 'number' && Number.isFinite(value)) this.preferences[key] = Math.max(0,Math.min(1,value));
    try { localStorage.setItem('ashfall.audio.v1',JSON.stringify(this.preferences)); localStorage.setItem('ashfall.muted',String(this.preferences.muted)); } catch {}
    this.mix();
    if (this.context) {
      if (!this.preferences.muted) { this.startBed(); this.prepare('click','select'); this.pump(); }
      else setTimeout(() => { if (this.preferences.muted) for (const voice of this.media) voice.element.pause(); },120);
    }
    document.dispatchEvent(new Event('ashfall:audio-change'));
  }
  private mix():void {
    if (!this.context || !this.buses) return;
    for (const key of ['master','music','ambience','sfx'] as const) {
      const gain = this.buses[key].gain; gain.cancelScheduledValues(this.context.currentTime);
      if(key==='master'&&this.preferences.muted)gain.value=0;
      else gain.setTargetAtTime(this.preferences[key],this.context.currentTime,.08);
    }
    // Separate duck gains preserve ducking when a volume slider changes.
  }
  setScene(scene:Scene):void {
    if (this.scene === scene) return;
    this.scene = scene;
    this.resultAsset = undefined;
    if (this.context) this.startBed();
    if (scene === 'day' || scene === 'night') this.prepare('draw','place','stamp','bell','flip','reveal');
  }
  private formats(asset:Sample|BedAsset):string[] {
    const files = audioFiles(asset);
    return this.probe.canPlayType('audio/ogg; codecs="vorbis"') ? files : files.slice().reverse();
  }
  private startBed():void {
    if (!this.context || !this.buses || document.hidden || this.preferences.muted || this.context.state !== 'running') return;
    if (this.bed?.scene !== this.scene) this.bed = {scene:this.scene,musicFinished:false};
    const settings = SCENES[this.scene];
    this.layer('ambience',settings.ambience,settings.ambienceLevel);
    // A final Life reveal/death can precede the result cue. Keep its underlying
    // soundtrack until that authorized cinematic cue chooses the conclusion.
    if (this.scene === 'result' && !this.resultAsset && !this.bed.musicFinished) return;
    const music = this.scene === 'result' ? this.resultAsset : settings.music;
    this.layer('music',!this.bed.musicFinished ? music ?? null : null,settings.musicLevel);
  }
  private layer(channel:Layer,asset:BedAsset|null,level:number):void {
    const c = this.context!;
    const current = [...this.media].find(voice => voice.channel === channel && !voice.retiring && !voice.disposed);
    if (current && current.asset === asset) {
      current.level = level; current.gain.gain.setTargetAtTime(level,c.currentTime,.65);
      if (this.preferences[channel] > 0) {
        if (current.needsLoad) current.reload?.();
        else void current.element.play().catch(() => {});
      } else current.element.pause();
      return;
    }
    const loading = !!asset && this.preferences[channel] > 0 && (this.failures.get(asset) ?? 0) <= Date.now();
    if (current) this.retire(current,loading);
    if (!loading || !asset) { this.fadeRetiring(channel); return; }
    if (this.media.size >= 4) this.dispose([...this.media].find(voice => voice.retiring) ?? [...this.media][0]!);
    const element = document.createElement('audio'); element.preload = 'none'; element.loop = channel === 'ambience' || this.scene !== 'result';
    const source = c.createMediaElementSource(element), gain = c.createGain();
    gain.gain.value = 0; source.connect(gain).connect(this.buses![channel]);
    const voice:MediaVoice = {asset,channel,element,source,gain,retiring:false,disposed:false,level,version:0};
    this.media.add(voice);
    const formats = this.formats(asset); let format = 0;
    const load = () => {
      if (voice.disposed || voice.retiring) return;
      if (document.hidden || this.preferences.muted) { voice.needsLoad = true; return; }
      voice.needsLoad = false;
      const url = formats[format++];
      if (!url) { this.failures.set(asset,Date.now()+30_000); this.fadeRetiring(channel); this.dispose(voice); return; }
      const version = ++voice.version;
      const fail = () => { if (!voice.disposed && !voice.retiring && voice.version === version) { voice.version++; load(); } };
      clearTimeout(voice.loadingTimer); element.onerror = fail; element.src = url;
      voice.loadingTimer = setTimeout(fail,12_000);
      void element.play().catch(error => {
        if (error?.name === 'NotAllowedError') clearTimeout(voice.loadingTimer);
        else fail();
      });
    };
    element.addEventListener('playing',() => {
      clearTimeout(voice.loadingTimer);
      if (voice.disposed || voice.retiring || document.hidden || this.preferences.muted) { element.pause(); return; }
      this.fadeRetiring(channel);
      gain.gain.cancelScheduledValues(c.currentTime); gain.gain.setTargetAtTime(voice.level,c.currentTime,2/3);
    });
    element.addEventListener('ended',() => {
      if (voice.disposed || voice.retiring || channel !== 'music') return;
      this.dispose(voice);
      if (this.scene === 'result' && this.bed) this.bed.musicFinished = true;
      else this.startBed(); // Defensive recovery; normal looping never emits ended.
    });
    voice.reload = load;
    load();
  }
  private retire(voice:MediaVoice,waitForIncoming=false):void {
    if (voice.disposed || voice.retiring) return;
    voice.retiring = true; clearTimeout(voice.loadingTimer);
    // Keep the old audible layer until the incoming file can actually play.
    if (waitForIncoming && voice.element.readyState >= 2 && !voice.element.paused) return;
    this.fadeOut(voice);
  }
  private fadeRetiring(channel:Layer):void {
    for (const voice of this.media) if (voice.channel === channel && voice.retiring) this.fadeOut(voice);
  }
  private fadeOut(voice:MediaVoice):void {
    if (voice.disposed || voice.fading) return;
    voice.fading = true;
    voice.gain.gain.cancelScheduledValues(this.context!.currentTime);
    voice.gain.gain.setTargetAtTime(0,this.context!.currentTime,.5);
    setTimeout(() => this.dispose(voice),2000);
  }
  private dispose(voice:MediaVoice):void {
    if (voice.disposed) return;
    voice.disposed = true; clearTimeout(voice.loadingTimer); voice.element.pause();
    voice.element.removeAttribute('src'); voice.element.load(); voice.source.disconnect(); voice.gain.disconnect(); this.media.delete(voice);
  }
  prepare(...cues:Cue[]):void {
    if (!this.context || document.hidden || this.preferences.muted || this.preferences.sfx === 0) return;
    for (const cue of cues) for (const file of [...SOUNDS[cue].files,...(SOUNDS[cue].layers ?? []).map(layer => layer.file)]) {
      if (this.cache.has(file) || this.pending.has(file) || (this.failures.get(file) ?? 0) > Date.now()) continue;
      this.pending.add(file); this.queue.push(file);
    }
    this.pump();
  }
  private pump():void {
    while (this.fetching < 2 && this.queue.length && !document.hidden && !this.preferences.muted) {
      const file = this.queue.shift()!; this.fetching++;
      void this.loadSample(file).finally(() => { this.pending.delete(file); this.fetching--; this.pump(); });
    }
  }
  private async loadSample(file:Sample):Promise<void> {
    for (const url of this.formats(file)) {
      const abort = new AbortController(), timer = setTimeout(() => abort.abort(),8000);
      try {
        const response = await fetch(url,{signal:abort.signal}); if (!response.ok) continue;
        const data = await response.arrayBuffer(); if (data.byteLength > 512*1024) continue;
        const buffer = await this.context!.decodeAudioData(data), bytes = buffer.length*buffer.numberOfChannels*4;
        if (bytes > MAX_CACHE_BYTES || document.hidden) return;
        while (this.cache.size && (this.cache.size >= 16 || this.cacheBytes+bytes > MAX_CACHE_BYTES)) {
          const first = this.cache.keys().next().value!, old = this.cache.get(first)!;
          this.cacheBytes -= old.length*old.numberOfChannels*4; this.cache.delete(first);
        }
        this.cache.set(file,buffer); this.cacheBytes += bytes; return;
      } catch { /* Try another format, then silence; never delay a visual cue. */ }
      finally { clearTimeout(timer); }
    }
    this.failures.set(file,Date.now()+30_000);
  }
  play(cue:Cue,key:string=cue,scope?:string):void {
    const c = this.context, b = this.buses;
    if (!c || !b || c.state !== 'running' || document.hidden || this.preferences.muted) return;
    if ((cue === 'victory' || cue === 'defeat') && this.scene === 'result' && !this.resultAsset) {
      this.resultAsset = cue === 'victory' ? 'victory-theme' : 'defeat-theme'; this.startBed();
    }
    if (this.preferences.sfx === 0) return;
    const now = c.currentTime, last = this.recent.get(key) ?? -100;
    if (now-last < (cue === 'hover' ? .12 : cue === 'stamp' ? .075 : .22)) return;
    this.recent.set(key,now); if (this.recent.size > 256) this.recent = new Map([[key,now]]);
    const sound = SOUNDS[cue]; if (!sound.files.length) return;
    const index = this.variation.get(cue) ?? 0; this.variation.set(cue,index+1);
    const file = sound.files[index % sound.files.length]!; this.prepare(cue);
    const layers = [{file,level:sound.level,rate:sound.rate,cutoff:sound.cutoff},...(sound.layers ?? [])];
    const duration = Math.max(0,...layers.map(layer => (this.cache.get(layer.file)?.duration ?? 0)/(layer.rate ?? 1)));
    if (important.has(cue) && duration > 0) {
      this.duckUntil = Math.max(this.duckUntil,now+duration+.15);
      for (const duck of Object.values(this.ducks!)) {
        duck.gain.cancelScheduledValues(now); duck.gain.setTargetAtTime(.3,now,.03); duck.gain.setTargetAtTime(1,this.duckUntil,.4);
      }
    }
    for (const layer of layers) this.sample(layer.file,layer.level,layer.rate ?? 1,layer.cutoff ?? 16000,scope,important.has(cue));
  }
  stopScope(scope:string):void {
    const now=this.context?.currentTime;if(now===undefined)return;
    for(const [source,voice] of this.scopedSfx)if(voice.scope===scope){voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setTargetAtTime(0,now,.015);try{source.stop(now+.07);}catch{}}
    if(![...this.scopedSfx.values()].some(voice=>voice.important&&voice.scope!==scope)) {
      this.duckUntil=now;for(const duck of Object.values(this.ducks??{})){duck.gain.cancelScheduledValues(now);duck.gain.setTargetAtTime(1,now,.2);}
    }
  }
  private sample(file:Sample,level:number,rate:number,cutoff:number,scope?:string,isImportant=false):void {
    const c = this.context!, now = c.currentTime, buffer = this.cache.get(file);
    // A cold/missing recording is skipped now. It is never replayed late.
    if (!buffer || this.activeSfx.size >= 12) return;
    this.cache.delete(file); this.cache.set(file,buffer);
    const source = c.createBufferSource(), gain = c.createGain(), filter = c.createBiquadFilter();
    source.buffer = buffer; source.playbackRate.value = rate;
    filter.type = 'lowpass'; filter.frequency.value = cutoff;
    const duration = buffer.duration/source.playbackRate.value;
    gain.gain.setValueAtTime(0,now); gain.gain.linearRampToValueAtTime(level,now+.006);
    gain.gain.setValueAtTime(level,now+Math.max(.01,duration-.04)); gain.gain.linearRampToValueAtTime(0,now+duration);
    source.connect(filter).connect(gain).connect(this.buses!.sfx); this.activeSfx.add(source);
    this.scopedSfx.set(source,{gain,scope,important:isImportant});
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); this.activeSfx.delete(source);this.scopedSfx.delete(source); };
    source.start(now); source.stop(now+duration+.02);
  }
  install():void {
    if (this.installed) return; this.installed = true;
    document.addEventListener('pointerdown',() => void this.unlock(),{passive:true});
    document.addEventListener('keydown',() => void this.unlock());
    document.addEventListener('ashfall:presentation-finished',() => {
      if (this.scene === 'result' && !this.resultAsset && this.bed) {
        this.bed.musicFinished = true; this.startBed();
      }
    });
    document.addEventListener('visibilitychange',() => {
      this.recent.clear();
      if (document.hidden) {
        for (const voice of this.media) voice.element.pause();
        for (const source of this.activeSfx) { try { source.stop(); } catch {} }
        void this.context?.suspend().catch(() => {});
      } else if (this.context) void this.unlock();
    });
    document.addEventListener('click',event => {
      const el = (event.target as Element).closest<HTMLButtonElement>('button'); if (!el || el.disabled) return;
      const kind = el.dataset.actionKind ?? el.dataset.cardDetails; if (kind) this.prepare(cardSound(kind));
      this.play(el.matches('.action-card') ? 'select' : el.matches('[data-seal-slot],[data-private-seal],#reveal-all') ? 'flip' : 'click');
    });
  }
}
export const audio = new CouncilAudio();
export function cardSound(kind?:string):Cue {
  return kind === 'COUNCIL_BELL' ? 'bell' : kind === 'CURSE' ? 'curse' : kind === 'WHISPER' ? 'whisper' : kind === 'EAVESDROP' ? 'eavesdrop' : kind === 'CINDER_SHIFT' ? 'shift' : kind === 'CONSPIRACY' ? 'conspiracy' : kind === 'SCAPEGOAT' ? 'scapegoat' : kind === 'DISPEL' ? 'dispel' : kind === 'VOW_OF_HEARTS' ? 'vow' : kind==='STOCKS'?'stocks':['TESTIMONY','WITNESS'].includes(kind ?? '') ? 'accuse' : ['ALIBI','MERCY'].includes(kind ?? '') ? 'cleanse' : ['PIETY','ASYLUM','HEARTHWARD'].includes(kind ?? '') ? 'protect' : 'place';
}
