import type { Command, Reply, RoomView } from '@ashfall/shared';
import { openGameGuide } from './game-guide';
import { TutorialSession, type TutorialStage } from './tutorial-session';
import './tutorial.css';

const read=(key:string)=>{try{return localStorage.getItem(key);}catch{return null;}};
const save=(key:string,value:string)=>{try{localStorage.setItem(key,value);}catch{/* Optional local preference. */}};
export const beginnerAssistanceEnabled=()=>read('ashfall.beginner-assistance')!=='off';
export function setBeginnerAssistance(enabled:boolean):void {save('ashfall.beginner-assistance',enabled?'on':'off');document.dispatchEvent(new Event('ashfall:assistance-change'));}
const lessons:Record<TutorialStage,{chapter:number;title:string;text:string;hint:string}>= {
  role:{chapter:1,title:'Meet your private role',text:'You are a Villager. Read your role, then open your Life cards.',hint:'Choose “View your Life cards” on your private portrait.'},
  life:{chapter:2,title:'Inspect your five Lives',text:'Your role stays with you. Life cards determine survival and allegiance. Receiving Evil makes you a Cultist permanently, even if it moves away.',hint:'Reveal your own Life cards, then Confirm & continue. Other players cannot see this inspection.'},
  evidence:{chapter:3,title:'Add one Doubt',text:'Cinder starts with six Doubt in this practice. Select one Evidence, choose Cinder, then confirm. Doubt is suspicion, not proof.',hint:'Tap Evidence once, tap Cinder’s highlighted seat, then confirm the preview.'},
  reveal:{chapter:4,title:'The accuser chooses a Life',text:'Seven Doubt triggers an accusation. Choose any hidden Life on Cinder. This practice pauses for reading; a normal match gives the accuser 10 seconds.',hint:'Choose one of the five numbered hidden Life cards. Watch its actual reveal and position.'},
  hand:{chapter:5,title:'Your turn is still yours',text:'That Good Life did not prove allegiance. Play more Evidence if you wish, or save it with End turn. Even an empty hand does not end the match. Draw 2 is unavailable after playing.',hint:'You can play some or all remaining Evidence. Choose End turn whenever you are ready; unused cards stay in your hand.'},
  draw:{chapter:5,title:'A fresh turn: try Draw 2',text:'Five bots have taken their turns. Your saved cards remain. Draw up to two cards instead of playing; drawing ends your turn.',hint:'Choose Draw 2. This training pile is short, so its exhaustion will also bring Night.'},
  night:{chapter:6,title:'Night falls when the pile empties',text:'Cultist privately choose an attack; a hidden Lanternkeeper can protect. You have no Night ability in this practice. Other players’ choices stay secret.',hint:'Read the Night explanation, then choose “Let Night pass”. Normal matches use the usual Night timer.'},
  dawn:{chapter:6,title:'Dawn reports the public outcome',text:'Nobody died in this practice Night. Unused hand cards survive. The discard pile becomes the next draw pile; a new Day continues the same match.',hint:'Choose “Welcome the next Day” to see the real Day transition.'},
  win:{chapter:7,title:'What actually ends a match?',text:'The Village wins when every Evil Life is revealed. Cultists win when all surviving non-neutral players are Cultist. Outcast has a separate council-vote condition. Empty hands, End turn, Draw 2 and Night do not end a match.',hint:'Read these conditions, then choose “Finish training”. The guide always has the full rules.'},
  complete:{chapter:8,title:'The council awaits',text:'Training complete. Continue into a fresh normal match with five bots, or return to the menu. The new match has random roles, normal timers and no scripted objectives.',hint:'Continue playing creates a new match; your training deal is discarded.'},
};
const objectives:Record<TutorialStage,string>={
  role:'Read your Villager role, then open your private Life cards.',
  life:'Reveal your five Lives privately, then confirm. Your role and Life cards are different.',
  evidence:'Cinder has six Doubt. Play one Evidence on Cinder to reach seven.',
  reveal:'Choose any hidden Life on Cinder. Seven Doubt is suspicion, not proof of guilt.',
  hand:'A Good Life does not prove allegiance. Play more, or save your cards with End turn. Your turn continues even with an empty hand.',
  draw:'Your saved cards remain. On this fresh turn, Draw 2 adds up to two cards and ends your turn.',
  night:'The draw pile emptied. You have no Night ability; other players choose secretly. Read the hint or let Night pass.',
  dawn:'Nobody died. Your unused cards stay. Welcome the next Day to continue the same match.',
  win:lessons.win.text,
  complete:lessons.complete.text,
};

export class TutorialDirector {
  private session:TutorialSession|null=null;
  private tracker=document.createElement('section');
  private menu=document.createElement('dialog');
  private modal=document.createElement('dialog');
  private abort:AbortController|null=null;
  private timer:ReturnType<typeof setInterval>|null=null;
  private idle=0;
  private hint=false;
  private rendered='';
  private lastSelection='';
  private error='';
  private launching=false;
  constructor(private hooks:{render:(view:RoomView)=>void;reset:()=>void;normal:()=>Promise<boolean>}) {
    this.tracker.id='tutorial-tracker';this.tracker.hidden=true;this.tracker.setAttribute('aria-label','Training objective');
    document.getElementById('lobby')!.prepend(this.tracker);
    this.menu.id='learning-menu';this.menu.className='learning-dialog';this.menu.setAttribute('aria-labelledby','learning-title');
    this.modal.id='tutorial-dialog';this.modal.className='learning-dialog';
    document.body.append(this.menu,this.modal);
    this.menu.addEventListener('close',()=>document.getElementById('how-to-open')?.focus({preventScroll:true}));
    this.modal.addEventListener('cancel',event=>{if(this.session)event.preventDefault();});
  }
  get active():boolean{return !!this.session;}
  openMenu():void {
    this.menu.innerHTML=`<header><span class="eyebrow">LEARN THE COUNCIL</span><h2 id="learning-title">The council’s handbook</h2><p>Every secret has a beginning. Choose how you wish to learn.</p></header><div class="learning-options"><button id="tutorial-open" class="primary"><b>${read('ashfall.tutorial.completed')==='true'?'Replay tutorial':'Interactive tutorial'}</b><span>Learn the essentials through a short guided mystery.</span><small>ABOUT 3–4 MINUTES · RECOMMENDED FOR NEW PLAYERS</small></button><button id="learning-guide"><b>Game guide</b><span>Browse the eight-step reference at your own pace.</span></button><button id="learning-cards"><b>Cards & roles</b><span>Inspect every card, role and interaction.</span></button></div><button id="learning-back">← Back</button>`;
    this.menu.querySelector('#learning-back')!.addEventListener('click',()=>this.menu.close());
    for(const [id,tab] of [['learning-guide','howto'],['learning-cards','cards']] as const)this.menu.querySelector(`#${id}`)!.addEventListener('click',()=>{
      this.menu.close();document.addEventListener('ashfall:guide-closed',()=>this.openMenu(),{once:true});openGameGuide(tab);
    });
    this.menu.querySelector('#tutorial-open')!.addEventListener('click',()=>{this.menu.close();this.intro();});
    this.menu.showModal();
  }
  private intro():void {
    this.modal.setAttribute('aria-label','The first council');
    this.modal.innerHTML='<span class="eyebrow">A GUIDED MYSTERY · ABOUT 3–4 MINUTES</span><h2>The first council</h2><p>The village has gathered. Someone is hiding in plain sight.</p><p>Learn by playing one short, private practice with five bots. Inspect your role, make an accusation, manage your hand and survive a Night. There is no reading timer.</p><p>You can inspect freely, ask for hints, restart or leave at any time.</p><div class="learning-actions"><button id="tutorial-begin" class="primary">Begin</button><button id="tutorial-intro-back">Back</button></div>';
    this.modal.querySelector('#tutorial-begin')!.addEventListener('click',()=>{this.modal.close();this.start();});
    this.modal.querySelector('#tutorial-intro-back')!.addEventListener('click',()=>{this.modal.close();this.openMenu();});this.modal.showModal();
  }
  start():void {
    this.stop();this.hooks.reset();
    this.session=new TutorialSession(this.hooks.render,()=>this.update());
    this.abort=new AbortController();const signal=this.abort.signal;
    document.body.classList.add('tutorial-active');
    document.addEventListener('click',event=>{
      if((event.target as HTMLElement).closest('#role-continue'))this.session?.inspectRole();
      this.idle=0;this.highlight();
    },{signal});
    document.addEventListener('ashfall:day-selection',()=>{this.idle=0;this.highlight();},{signal});
    this.timer=setInterval(()=>{
      if(!this.session)return;
      if(!document.hidden&&!this.session.view.presentation&&!document.querySelector('dialog[open]'))this.idle++;
      if(this.idle===10||this.idle===20||this.idle===30||this.idle===50){this.hint=this.idle>=30;this.rendered='';this.update();}
      this.highlight();
    },500);
    this.session.start();
  }
  command(command:Command):Reply {const reply=this.session!.command(command);this.error=reply.ok?'':reply.message;this.rendered='';this.idle=0;this.update();return reply;}
  stop():void {
    this.session?.stop();this.session=null;this.abort?.abort();this.abort=null;
    if(this.timer)clearInterval(this.timer);this.timer=null;
    this.tracker.hidden=true;this.tracker.replaceChildren();this.modal.close();this.rendered='';this.error='';this.hint=false;this.idle=0;this.launching=false;
    document.body.classList.remove('tutorial-active');this.clearHighlights();
  }
  exit():void {this.stop();this.hooks.reset();document.getElementById('how-to-open')?.focus({preventScroll:true});}
  private update():void {
    if(!this.session)return;
    const stage=this.session.stage,lesson=lessons[stage];
    if(stage!==this.lastSelection){this.lastSelection=stage;this.hint=false;this.error='';this.idle=0;}
    const key=`${stage}:${this.hint}:${this.error}:${this.idle>=50}:${!!this.session.view.presentation}`;
    this.tracker.hidden=stage==='complete';
    if(key!==this.rendered){
      this.rendered=key;
      this.tracker.innerHTML=`<div class="tutorial-objective" aria-live="polite"><span class="eyebrow">CHAPTER I · ${lesson.chapter}/8${lesson.chapter>1?' · ✓ PREVIOUS OBJECTIVE COMPLETE':''}</span><strong>${lesson.title}</strong><p>${objectives[stage]}</p>${this.error?'<p class="tutorial-correction"></p>':''}${this.hint?`<p class="tutorial-hint">${lesson.text} ${lesson.hint}</p>`:''}</div><div class="tutorial-tools"><button data-tutorial="hint">${this.hint?'Hide hint':'Show hint'}</button>${this.idle>=50?'<button data-tutorial="show">Show me</button>':''}${['night','dawn','win'].includes(stage)?`<button class="primary" data-tutorial="next" ${this.session.view.presentation?'disabled':''}>${stage==='night'?'Let Night pass':stage==='dawn'?'Welcome the next Day':'Finish training'}</button>`:''}<details><summary>Training options</summary><button data-tutorial="restart">Restart</button><button data-tutorial="exit">Skip / exit tutorial</button></details></div>`;
      const error=this.tracker.querySelector('.tutorial-correction');if(error)error.textContent=this.error;
      this.tracker.querySelectorAll<HTMLButtonElement>('[data-tutorial]').forEach(button=>button.onclick=()=>{
        const action=button.dataset.tutorial;
        if(action==='hint'){this.hint=!this.hint;this.rendered='';this.update();}
        if(action==='show'){this.highlight();const target=document.querySelector<HTMLElement>('.tutorial-focus');target?.scrollIntoView({block:'center',behavior:'auto'});target?.focus({preventScroll:true});}
        if(action==='next')this.session?.next();
        if(action==='restart')this.start();
        if(action==='exit')this.exit();
      });
    }
    this.highlight();
    if(stage==='complete'&&!this.modal.open){
      save('ashfall.tutorial.completed','true');
      this.modal.setAttribute('aria-label','Training complete');
      this.modal.innerHTML=`<span class="eyebrow">TRAINING COMPLETE · 8/8</span><h2>The council awaits</h2><p>${lesson.text}</p><label><input id="tutorial-assistance" type="checkbox" ${beginnerAssistanceEnabled()?'checked':''}> Beginner assistance in normal matches</label><p id="tutorial-launch-error" role="status"></p><div class="learning-actions"><button id="tutorial-continue" class="primary">Continue playing</button><button id="tutorial-return">Return to main menu</button><button id="tutorial-replay">Replay tutorial</button></div>`;
      this.modal.querySelector('#tutorial-assistance')!.addEventListener('change',event=>setBeginnerAssistance((event.target as HTMLInputElement).checked));
      this.modal.querySelector('#tutorial-return')!.addEventListener('click',()=>this.exit());
      this.modal.querySelector('#tutorial-replay')!.addEventListener('click',()=>this.start());
      this.modal.querySelector('#tutorial-continue')!.addEventListener('click',async()=>{
        if(this.launching)return;this.launching=true;
        this.modal.querySelectorAll('button').forEach(button=>button.disabled=true);
        this.stop();this.hooks.reset();
        await this.hooks.normal();
      });
      this.modal.showModal();
    }
  }
  private clearHighlights():void {document.querySelectorAll('.tutorial-focus').forEach(el=>{el.classList.remove('tutorial-focus','tutorial-strong');el.removeAttribute('data-tutorial-arrow');});}
  private highlight():void {
    this.clearHighlights();if(!this.session||this.session.view.presentation)return;
    const stage=this.session.stage;
    if(stage==='life') {
      const modal=document.querySelector('#private-panel.is-open .private-modal');
      if(modal&&!modal.querySelector('.tutorial-private-note')){
        const note=document.createElement('p');note.className='tutorial-private-note';note.textContent=lessons.life.text;
        modal.querySelector('.seal-transfer-warning')?.after(note);
      }
    }
    let selector=stage==='role'?'#role-continue':stage==='life'?(document.querySelector<HTMLButtonElement>('#acknowledge')?.disabled?'#reveal-all':'#acknowledge'):stage==='reveal'?'[data-reveal-choice]':stage==='hand'?'#end-turn':stage==='draw'?'#draw-cards':'[data-tutorial="next"]';
    if(stage==='life'&&!document.querySelector('#private-panel.is-open'))selector='[data-open-private-seals]';
    if(stage==='evidence')selector=document.querySelector('#confirm-preview')?'#confirm-preview':document.querySelector('.is-valid-target')?`#seats [data-player="${this.session.target}"]`:'[data-action-kind="EVIDENCE"]';
    document.querySelectorAll<HTMLElement>(selector).forEach(el=>{el.classList.add('tutorial-focus');el.classList.toggle('tutorial-strong',this.idle>=10);if(this.idle>=20)el.dataset.tutorialArrow='↓';});
  }
}

export function installBeginnerAssistance():{update:(view:RoomView|null,training:boolean)=>void} {
  const panel=document.createElement('aside');panel.id='beginner-assistance';panel.hidden=true;panel.setAttribute('aria-label','Beginner assistance');
  document.getElementById('lobby')!.prepend(panel);
  let lastView:RoomView|null=null,training=false;
  function update(view:RoomView|null,isTraining:boolean):void {
    lastView=view;training=isTraining;
    const me=view?.you?.playerId,day=view?.day;
    panel.hidden=!beginnerAssistanceEnabled()||isTraining||!day||!!view?.presentation||view.phase==='GAME_OVER'||!view.deal?.players.find(p=>p.playerId===me)?.alive;
    if(panel.hidden)return;
    const text=view!.phase==='REVEAL_RESOLUTION'?(day!.reveal?.chooserId===me?'Seven Doubt: choose a hidden Life on the accused player.':'Wait while the accuser chooses a hidden Life.'):
      view!.phase==='NIGHT'?(view!.night?'Check You / your private Night panel for your available action.':'You have no private Night action. Wait for Dawn.'):
      view!.phase==='DAWN'?'The public outcome is shown at Dawn. Your unused hand stays with you.':
      day!.activePlayerId!==me?'Waiting for another player. You can inspect your cards and role.':day!.playedThisTurn?'Your turn continues: play more, or save your remaining cards with End turn.':
      'Your turn: play cards, or Draw 2 instead. Drawing ends your turn; unused cards stay in your hand.';
    if(panel.querySelector('span')?.textContent===text)return;
    panel.innerHTML='<span></span><button type="button" aria-label="Turn off beginner assistance">×</button>';panel.querySelector('span')!.textContent=text;
    panel.querySelector('button')!.onclick=()=>setBeginnerAssistance(false);
  }
  document.addEventListener('ashfall:assistance-change',()=>update(lastView,training));
  return {update};
}
