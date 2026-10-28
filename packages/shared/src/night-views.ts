export interface NightChoiceView { submitted: boolean; targetId: string | null }
export interface PrivateNightView {
  nightNumber: number;
  attack: NightChoiceView | null;
  protection: NightChoiceView | null;
}
export interface DawnView { nightNumber: number; deceasedId: string | null }
export type NightIntent = { type: 'nightAttack' | 'nightProtect'; targetId: string | null };
