import { AVATARS, originalPrototypePreset, publicPresentationPlan, type Command, type Reply, type RoomView, type TableEffect } from '@ashfall/shared';
import { acknowledgeIdentities, arrangeIdentities, dealIdentities, privateIdentities, publicIdentities, type IdentityMatch } from '@ashfall/shared/identities';
import { applyDayAction, createDay, privateHand, publicDay, type DayAction, type DayResult, type DayState } from '@ashfall/shared/day';
import { expireNight, privateNight } from '@ashfall/shared/night';

export type TutorialStage = 'role'|'life'|'evidence'|'reveal'|'hand'|'draw'|'night'|'dawn'|'win'|'complete';
const uid = () => {
  // getRandomValues is available on plain-HTTP LAN phones as well as HTTPS.
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]!&15)|64;bytes[8]=(bytes[8]!&63)|128;
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};
/** Local practice only. No transport command, server room, saved deal or normal-match setup hook. */
export class TutorialSession {
  readonly ids = Array.from({length:6},uid);
  readonly human = this.ids[0]!;
  readonly target = this.ids[1]!;
  stage: TutorialStage = 'role';
  private identity: IdentityMatch;
  private state: DayState | null = null;
  private revision = 0;
  private clock = Date.now();
  private effects: TableEffect[] = [];
  private presentation: RoomView['presentation'] = null;
  private afterPresentation: (()=>void) | null = null;
  private stopped = false;
  constructor(private publish: (view:RoomView)=>void, private changed: ()=>void) {
    // No shuffle: the trainee and all five eligible Lives of Cinder are Good.
    // Kinds are configured before selection; revealSeal still chooses the real card.
    this.identity = dealIdentities(this.ids,{players:6,cardsPerPlayer:5,humanCards:27,witchCards:2,constableCards:1},max=>max-1,uid);
    for(const id of this.ids.slice(1))this.identity=acknowledgeIdentities(this.identity,id);
  }
  start():void { this.emit(); }
  stop():void { this.stopped=true; this.afterPresentation=null; this.presentation=null; this.effects=[]; }
  get view(): RoomView {
    const state=this.state, identity=state?.identity??this.identity;
    return {
      code:'TRAINING',version:this.revision,privateVersion:this.revision,serverTime:Date.now(),
      phase:state?.phase??'PRIVATE_DEAL',hostId:this.human,capacity:6,
      players:this.ids.map((id,index)=>({id,name:['Traveller','Cinder','Hollow','Morrow','Tallow','Briar'][index]!,avatar:AVATARS[index]!,ready:true,connected:true,isBot:index>0,botDifficulty:index?'EASY':null,reconnectUntil:null,abandoned:false})),
      feed:[],you:{playerId:this.human},deal:publicIdentities(identity,true),private:privateIdentities(identity,this.human),
      role:{kind:'VILLAGER',ability:'UNAVAILABLE',result:null,peek:null,notices:[],individualWin:false},
      day:state?{...publicDay(state),deadline:null}:null, hand:state?privateHand(state,this.human):null,
      night:state?privateNight(state,this.human):null,dawn:state?.dawn??null,personalResult:null,
      effects:this.effects,presentation:this.presentation,
    };
  }
  private emit():void { if(!this.stopped){this.revision++;this.publish(this.view);this.changed();} }
  private commit(result:DayResult,after?:()=>void):void {
    const previousPhase=this.state?.phase??'PRIVATE_DEAL';
    this.state=result.state;this.identity=result.state.identity;
    const visual=new Set(['PLAY','DRAW','DEATH','REVEAL_PENDING','REVEAL','NIGHT','DAWN','DOUBT','CLEANSE','STATUS','VOW','CONSPIRACY','TRANSFER','BLOCK','ROLE_BLOCK','TURN_SKIPPED']);
    const events=result.events.filter(event=>visual.has(event.type)).map(event=>({...event,id:uid(),type:event.type as TableEffect['type']}));
    this.effects=[...this.effects,...events].slice(-24);
    const plan=publicPresentationPlan(previousPhase,{phase:this.state.phase,deal:publicIdentities(this.identity),hasOutcome:!!this.state.outcome},result.events);
    if(plan.length) {
      this.presentation={id:uid(),scope:'PUBLIC',until:Date.now()+3_600_000,remainingMs:null,awaitingYou:true,previousPhase,events};
      this.afterPresentation=after??null;
    } else after?.();
    this.emit();
  }
  inspectRole():void { if(this.stage==='role'){this.stage='life';this.changed();} }
  command(command:Command):Reply {
    if(this.stopped)return {ok:false,code:'TRAINING_CLOSED',message:'Practice has ended.'};
    try {
      if('matchId'in command&&command.matchId!==this.identity.id)throw Error('That training deal has ended.');
      if(command.type==='finishPresentation') {
        if(command.presentationId!==this.presentation?.id||command.matchId!==this.identity.id)throw Error('That presentation has finished.');
        this.presentation=null;const after=this.afterPresentation;this.afterPresentation=null;after?.();this.emit();
        return {ok:true};
      }
      if(this.presentation)throw Error('Finish or skip the event before continuing.');
      if(command.type==='arrangeSeals'&&!this.state){this.identity=arrangeIdentities(this.identity,this.human,command.cardIds);this.emit();return {ok:true};}
      if(command.type==='acknowledgeDeal'&&!this.state) {
        this.identity=acknowledgeIdentities(this.identity,this.human);
        const result=createDay(this.identity,{...originalPrototypePreset,turnTimeoutMs:86_400_000,revealTimeoutMs:86_400_000},max=>max-1,uid,this.clock);
        const s=result.state;
        // Move actual cards, maintaining IDs and conservation. Short training deck reaches Night in one round.
        const pool=[...s.deck,...Object.values(s.hands).flat()];
        for(const id of this.ids)s.hands[id]=[];
        s.hands[this.human]=Array.from({length:3},()=>pool.splice(pool.findIndex(card=>card.kind==='EVIDENCE'),1)[0]!);
        const ordinary=pool.filter(card=>!['CURSE','CONSPIRACY'].includes(card.kind));
        s.deck=ordinary.slice(0,12);s.discard=pool.filter(card=>!s.deck.includes(card));
        s.doubt[this.target]=6;this.stage='evidence';this.commit(result);return {ok:true};
      }
      if(!this.state)throw Error('Inspect your role and Life cards first.');
      if(this.stage==='evidence') {
        if(command.type!=='playCards'||command.cardIds.length!==1||command.targetId!==this.target||this.state.hands[this.human]!.find(card=>card.id===command.cardIds[0])?.kind!=='EVIDENCE')
          throw Error('For this first example, play one Evidence on Cinder. You can inspect anything else safely.');
      } else if(this.stage==='reveal'&&command.type!=='revealSeal')throw Error('Choose any hidden Life on Cinder. The accuser chooses the position.');
      else if(this.stage==='draw'&&command.type!=='drawCards')throw Error('Try Draw 2 on this fresh turn. It is the alternative to playing cards.');
      else if(!['hand','evidence','reveal','draw'].includes(this.stage))throw Error('Follow the current objective; this is a paused practice table.');
      if(!['playCards','playCard','endTurn','drawCards','revealSeal'].includes(command.type))throw Error('That action is not part of this practice.');
      const result=applyDayAction(this.state,this.human,command as DayAction,this.clock,max=>max-1);
      if(this.stage==='evidence') {this.stage='reveal';this.commit(result);}
      else if(this.stage==='reveal')this.commit(result,()=>{this.stage='hand';});
      else if(this.stage==='hand'&&command.type==='endTurn') {
        // Each bot takes a legal Draw 2 turn. No hidden choices are exposed in the projection.
        let state=result.state;const events=[...result.events];
        for(let i=0;i<5&&state.phase==='DAY'&&state.activePlayerId!==this.human;i++){
          const turn=applyDayAction(state,state.activePlayerId,{type:'drawCards',matchId:this.identity.id,turnNumber:state.turnNumber,gameVersion:state.version},this.clock,max=>max-1);
          state=turn.state;events.push(...turn.events);
        }
        this.stage='draw';this.commit({state,events});
      } else if(this.stage==='draw') {this.stage='night';this.commit(result);}
      else this.commit(result);
      return {ok:true};
    } catch(error) { return {ok:false,code:'TRAINING_HINT',message:error instanceof Error?error.message:'Review the current objective.'}; }
  }
  next():void {
    if(this.presentation||!this.state)return;
    if(this.stage==='night'||this.stage==='dawn') {
      this.clock=this.state.deadline!;
      const result=expireNight(this.state,this.clock,max=>max-1);
      if(!result)return;
      const stage=this.stage==='night'?'dawn':'win';
      this.commit(result,()=>{this.stage=stage;});
    } else if(this.stage==='win'){this.stage='complete';this.emit();}
  }
}
