/** Original, sample-free Web Audio soundscape. No gameplay state is modified. */
export const CUES = ['hover','click','select','draw','flip','place','stamp','cleanse','curse','bell','whisper','eavesdrop','death','night','dawn','reveal','victory','defeat','protect','shift'] as const;
export type Cue = typeof CUES[number];
type Channel = 'master'|'music'|'ambience'|'sfx';
type Scene = 'menu'|'lobby'|'day'|'night'|'result';
const defaults = {master:.7,music:.15,ambience:.2,sfx:.65,muted:false};
export class CouncilAudio {
  preferences = {...defaults};
  private context?: AudioContext;
  private buses?: Record<Channel,GainNode>;
  private scene: Scene = 'menu';
  private bed?: {gain:GainNode; sources:AudioScheduledSourceNode[]; fades:GainNode[]};
  private noise?: AudioBuffer;
  private recent = new Map<string,number>();
  private installed = false;
  constructor() { try { const data=JSON.parse(localStorage.getItem('ashfall.audio.v1')??'null');
    if(data) { for(const key of ['master','music','ambience','sfx'] as const) if(Number.isFinite(data[key]))this.preferences[key]=Math.max(0,Math.min(1,data[key]));this.preferences.muted=data.muted===true; }
    else this.preferences.muted=localStorage.getItem('ashfall.muted')==='true';
  } catch { /* Storage is optional. */ } }
  async unlock(): Promise<void> {
    try {
      if(!this.context) {
        const c=this.context=new AudioContext();this.buses={master:c.createGain(),music:c.createGain(),ambience:c.createGain(),sfx:c.createGain()};
        const limiter=c.createDynamicsCompressor();limiter.threshold.value=-14;limiter.ratio.value=8;
        this.buses.master.connect(limiter).connect(c.destination);
        for(const key of ['music','ambience','sfx'] as const)this.buses[key].connect(this.buses.master);
        this.noise=c.createBuffer(1,c.sampleRate*4,c.sampleRate);const samples=this.noise.getChannelData(0);
        for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
        this.mix();this.startBed();
      }
      if(!document.hidden&&this.context.state==='suspended')await this.context.resume();
    } catch { /* Unsupported/blocked audio must never interrupt play. */ }
  }
  set(key:Channel|'muted',value:number|boolean):void {
    if(key==='muted')this.preferences.muted=value===true;
    else if(typeof value==='number'&&Number.isFinite(value))this.preferences[key]=Math.max(0,Math.min(1,value));
    try {localStorage.setItem('ashfall.audio.v1',JSON.stringify(this.preferences));localStorage.setItem('ashfall.muted',String(this.preferences.muted));}catch{}
    this.mix();document.dispatchEvent(new Event('ashfall:audio-change'));
  }
  private mix():void {
    if(!this.context||!this.buses)return;
    for(const key of ['master','music','ambience','sfx'] as const) {
      const gain=this.buses[key].gain;gain.cancelScheduledValues(this.context.currentTime);
      gain.setTargetAtTime(key==='master'&&this.preferences.muted?0:this.preferences[key],this.context.currentTime,.08);
    }
  }
  setScene(scene:Scene):void {if(this.scene===scene)return;this.scene=scene;if(this.context)this.startBed();}
  private startBed():void {
    const c=this.context,b=this.buses;if(!c||!b||!this.noise)return;
    const old=this.bed;const gain=c.createGain();gain.gain.value=0;gain.gain.linearRampToValueAtTime(1,c.currentTime+2);
    const sources:AudioScheduledSourceNode[]=[],fades:GainNode[]=[gain];this.bed={gain,sources,fades};
    if(old){for(const fade of old.fades){fade.gain.cancelScheduledValues(c.currentTime);fade.gain.setTargetAtTime(0,c.currentTime,.35);}for(const s of old.sources)s.stop(c.currentTime+2);setTimeout(()=>old.gain.disconnect(),2200);}
    // Separate ambience and music routes share the scene fade, never their volume bus.
    const wind=c.createBufferSource();wind.buffer=this.noise;wind.loop=true;wind.playbackRate.value=this.scene==='night'?.65:.85;
    const filter=c.createBiquadFilter();filter.type='bandpass';filter.frequency.value=this.scene==='night'?720:330;filter.Q.value=.65;
    const windGain=c.createGain();windGain.gain.value=this.scene==='lobby'?.12:.08;
    // Fade ambience with the same scene gain automation via a second output route.
    wind.connect(filter).connect(windGain).connect(gain);gain.connect(b.ambience);wind.start();sources.push(wind);
    const breath=c.createOscillator(),depth=c.createGain();breath.frequency.value=this.scene==='night'?.19:.065;depth.gain.value=.025;
    breath.connect(depth).connect(windGain.gain);breath.start();sources.push(breath);breath.onended=()=>{breath.disconnect();depth.disconnect();};
    const base=this.scene==='night'?55:this.scene==='menu'?73.416:this.scene==='day'?82.407:65.406;
    for(const ratio of [1,1.5,2.003]) {
      const osc=c.createOscillator(),level=c.createGain();osc.type='sine';osc.frequency.value=base*ratio;level.gain.value=.035;
      const musicFade=c.createGain();musicFade.gain.value=0;musicFade.gain.linearRampToValueAtTime(1,c.currentTime+2);
      fades.push(musicFade);
      osc.connect(level).connect(musicFade).connect(b.music);osc.start();sources.push(osc);
      // Each source cleans up its own output; the old scene receives a fade on stop.
      osc.onended=()=>{osc.disconnect();level.disconnect();musicFade.disconnect();};
    }
    wind.onended=()=>{wind.disconnect();filter.disconnect();windGain.disconnect();};
  }
  play(cue:Cue,key=cue):void {
    const c=this.context,b=this.buses;if(!c||!b||c.state!=='running'||document.hidden||this.preferences.muted)return;
    const now=c.currentTime;const last=this.recent.get(key)??-100;
    if(now-last<(cue==='hover'?.12:cue==='stamp'?.075:.22))return;
    this.recent.set(key,now);if(this.recent.size>256)this.recent=new Map([[key,now]]);
    const important=['death','reveal','bell','victory','defeat','night','dawn'].includes(cue);
    if(important)for(const bus of [b.music,b.ambience]){bus.gain.cancelScheduledValues(now);bus.gain.setTargetAtTime(this.preferences[bus===b.music?'music':'ambience']*.3,now,.03);bus.gain.setTargetAtTime(this.preferences[bus===b.music?'music':'ambience'],now+1.3,.4);}
    const duration=cue==='bell'?2.5:important?1.5:['whisper','eavesdrop','curse','shift'].includes(cue)?.8:.18;
    const voice=c.createGain();voice.connect(b.sfx);voice.gain.setValueAtTime(.0001,now);voice.gain.exponentialRampToValueAtTime(important?.28:cue==='hover'?.025:.09,now+.015);voice.gain.exponentialRampToValueAtTime(.0001,now+duration);
    const tones=cue==='bell'?[220,587,901]:cue==='victory'?[196,246.94,293.66,392]:cue==='defeat'?[130.81,155.56,185]:[cue==='stamp'?110:cue==='death'?65:cue==='curse'?92:cue==='night'?98:cue==='dawn'?294:cue==='protect'?440:cue==='reveal'?196:cue==='select'?520:cue==='hover'?760:330];
    for(const f of tones){const o=c.createOscillator();o.type=['stamp','death','curse'].includes(cue)?'triangle':'sine';o.frequency.setValueAtTime(f,now);o.frequency.exponentialRampToValueAtTime(f*(['death','curse','night'].includes(cue)?.5:1.08),now+duration);const level=c.createGain();level.gain.value=1/tones.length;o.connect(level).connect(voice);o.start(now);o.stop(now+duration+.05);o.onended=()=>{o.disconnect();level.disconnect();};}
    if(['draw','flip','place','cleanse','whisper','eavesdrop','shift','curse','night','dawn'].includes(cue)&&this.noise){const n=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();n.buffer=this.noise;f.type='bandpass';f.frequency.value=cue==='eavesdrop'?1600:cue==='whisper'?950:2200;g.gain.value=.35;n.connect(f).connect(g).connect(voice);n.start(now);n.stop(now+duration);n.onended=()=>{n.disconnect();f.disconnect();g.disconnect();};}
    setTimeout(()=>voice.disconnect(),(duration+.2)*1000);
  }
  install():void {
    if(this.installed)return;this.installed=true;
    document.addEventListener('pointerdown',()=>void this.unlock(),{passive:true});
    document.addEventListener('keydown',()=>void this.unlock());
    document.addEventListener('visibilitychange',()=>{this.recent.clear();if(document.hidden)void this.context?.suspend().catch(()=>{});else if(this.context)void this.unlock();});
    document.addEventListener('click',e=>{const el=(e.target as Element).closest('button');if(!el||el.disabled)return;this.play(el.matches('.action-card')?'select':el.matches('[data-seal-slot],[data-private-seal],#reveal-all')?'flip':'click');});
    document.addEventListener('pointerover',e=>{const el=(e.target as Element).closest('button');if(el&&!el.disabled&&!el.contains((e as PointerEvent).relatedTarget as Node|null))this.play('hover');});
    document.addEventListener('focusin',e=>{if((e.target as Element).matches('button'))this.play('hover');});
  }
}
export const audio = new CouncilAudio();
export function cardSound(kind?:string):Cue {return kind==='COUNCIL_BELL'?'bell':kind==='CURSE'?'curse':kind==='WHISPER'?'whisper':kind==='EAVESDROP'?'eavesdrop':kind==='CINDER_SHIFT'||kind==='CONSPIRACY'?'shift':['PIETY','ASYLUM','HEARTHWARD'].includes(kind??'')?'protect':'place';}
