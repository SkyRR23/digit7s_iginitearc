/** Local recordings acquired and credited in AUDIO_ASSET_CREDITS.csv. */
export const CUES = ['hover','click','select','draw','flip','place','stamp','cleanse','curse','bell','whisper','eavesdrop','death','night','dawn','reveal','victory','defeat','protect','shift','accuse','dispel','vow','conspiracy','scapegoat','swell','release','position','verdict','resume','blocked','fizzle','stocks','result-accent','threshold','heavy-stamp','glow-good','glow-bad','glow-mystery','reveal-dark'] as const;
export type Cue = typeof CUES[number];
export type Scene = 'menu' | 'lobby' | 'day' | 'night' | 'result';
export type Sample = 'card-slide-1' | 'card-slide-2' | 'card-place-1' | 'card-place-2' | 'card-cut' | 'card-contact' | 'card-shuffle' | 'wood-tap' | 'wood-impact' | 'church-bell' | 'page-flip' | 'wood-creak' | 'paper-swell' | 'metal-lock' | 'metal-resonance' | 'glow-rise' | 'glow-reveal';
export type BedAsset = 'phoenix-2026' | 'fireplace' | 'evening-birds' | 'night-meadow' | 'town-in-ruins' | 'rising-moon' | 'old-tower-inn' | 'victory-theme' | 'defeat-theme';
export const audioFiles = (name: Sample | BedAsset) => [`/audio/${name}.ogg`, `/audio/${name}.mp3`];
export const SCENES: Record<Scene, {ambience: BedAsset; ambienceLevel: number; music?: BedAsset; musicLevel: number}> = {
  menu:{ambience:'fireplace',ambienceLevel:.65,music:'phoenix-2026',musicLevel:.9},
  lobby:{ambience:'fireplace',ambienceLevel:.5,music:'old-tower-inn',musicLevel:.8},
  day:{ambience:'evening-birds',ambienceLevel:.6,music:'town-in-ruins',musicLevel:.95},
  night:{ambience:'night-meadow',ambienceLevel:.65,music:'rising-moon',musicLevel:.9},
  result:{ambience:'fireplace',ambienceLevel:.35,musicLevel:.95},
};
type Sound = {files: readonly Sample[]; level: number; rate?: number; cutoff?: number; layers?: readonly {file:Sample;level:number;rate?:number;cutoff?:number}[]};
// Every layer is a credited recording. Reversed paper/creaking wood add restrained supernatural accents.
export const SOUNDS: Record<Cue, Sound> = {
  hover:{files:[],level:0}, click:{files:['wood-tap'],level:.16},
  select:{files:['card-slide-1','card-slide-2','card-cut'],level:.45}, draw:{files:['card-slide-1','card-slide-2','card-cut'],level:.55},
  flip:{files:['page-flip','card-cut','card-contact'],level:.5}, place:{files:['card-place-1','card-place-2','card-contact'],level:.55},
  stamp:{files:['wood-impact'],level:.4}, cleanse:{files:['card-slide-1','card-slide-2','card-cut'],level:.45,rate:.95,cutoff:6000},
  curse:{files:['card-place-1','card-place-2'],level:.5,layers:[{file:'wood-creak',level:.5,rate:.8,cutoff:2400}]}, bell:{files:['church-bell'],level:.9},
  whisper:{files:['card-slide-1','card-slide-2'],level:.35,layers:[{file:'glow-rise',level:.25,rate:.9,cutoff:6000}]}, eavesdrop:{files:['card-cut','card-contact'],level:.4,layers:[{file:'glow-reveal',level:.3,rate:.95}]},
  death:{files:['wood-impact'],level:.85,rate:.8,cutoff:2800,layers:[{file:'wood-creak',level:.4,rate:.85}]}, night:{files:['wood-creak'],level:.35,rate:.85,cutoff:2400},
  dawn:{files:['card-slide-2'],level:.25,cutoff:3600}, reveal:{files:['glow-reveal'],level:.55,layers:[{file:'wood-impact',level:.32,rate:.9,cutoff:2800}]},
  victory:{files:[],level:0}, defeat:{files:[],level:0},
  protect:{files:['card-place-1','card-place-2'],level:.5,layers:[{file:'glow-reveal',level:.25,rate:1.15}]}, shift:{files:['card-shuffle'],level:.5,layers:[{file:'wood-creak',level:.3,rate:1.1}]},
  accuse:{files:['card-place-1','card-place-2'],level:.45},
  dispel:{files:['card-cut'],level:.5,layers:[{file:'glow-reveal',level:.38,rate:1.25}]},
  vow:{files:['card-place-2'],level:.5,layers:[{file:'glow-reveal',level:.25,rate:.85}]},
  conspiracy:{files:['card-shuffle'],level:.5,layers:[{file:'wood-creak',level:.4,rate:.8}]},
  scapegoat:{files:['card-slide-1','card-slide-2'],level:.5,layers:[{file:'card-cut',level:.4}]},
  swell:{files:['glow-rise'],level:.3,cutoff:8500}, release:{files:['card-slide-2'],level:.16,rate:1.1},
  position:{files:['glow-reveal'],level:.18,rate:1.35,cutoff:8500},
  verdict:{files:['wood-impact'],level:.4,rate:.85,layers:[{file:'glow-rise',level:.22,rate:.85}]},
  resume:{files:['glow-rise'],level:.32,rate:.9,cutoff:6500,layers:[{file:'wood-tap',level:.16}]},
  blocked:{files:['metal-lock'],level:.4,layers:[{file:'metal-resonance',level:.2,rate:1.2}]},
  fizzle:{files:['wood-tap'],level:.2,rate:.7,cutoff:1800,layers:[{file:'card-cut',level:.14,rate:.8}]},
  stocks:{files:['wood-creak'],level:.35,layers:[{file:'metal-lock',level:.5}]},
  'result-accent':{files:['glow-reveal'],level:.22,rate:.95},
  threshold:{files:['wood-impact'],level:.62,rate:.85},
  'heavy-stamp':{files:['wood-impact'],level:.55,rate:.9},
  'glow-good':{files:['glow-reveal'],level:.28,rate:1.12,cutoff:11000},
  'glow-bad':{files:['glow-rise'],level:.28,rate:.72,cutoff:2600,layers:[{file:'wood-creak',level:.1,rate:.85,cutoff:2200}]},
  'glow-mystery':{files:['glow-rise'],level:.24,rate:.94,cutoff:6500},
  'reveal-dark':{files:['glow-reveal'],level:.5,rate:.76,cutoff:4200,layers:[{file:'wood-impact',level:.32,rate:.8}]},
};
