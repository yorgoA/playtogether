'use client';
import {useEffect,useRef,useState} from 'react';
import type {QuizPower,QuizView} from '@/lib/contract';
import type {Player,Room,useRoom} from '@/lib/controller/room';
import {introMs,powerMs,quizPowers,quizTypes} from '@/lib/quiz/rules';
import {play} from '@/lib/controller/sound';
import {ranked} from './Podium';
import {plays,rivalNames,rivals,roundLabel} from './tiebreak';
import './quiz.css';
type Props={room:Room,quiz:QuizView,now:number};
const icons:Record<string,string>={'General knowledge':'🌍',Books:'📚',Movies:'🎬',Music:'🎵','TV shows':'📺',Games:'🎮','Cartoons & comics':'💥',Science:'🔬',Technology:'💾',Numbers:'🔢',Mythology:'🐉',Sports:'🏆',Geography:'🗺️',History:'🏛️',Art:'🎨',Celebrities:'⭐',Animals:'🦁',Vehicles:'🚗',Food:'🍝'};
const spinning=Object.keys(icons);
const signed=(n:number)=>(n>0?'+':'')+n;
// Time left, stopped while the game is paused.
const left=(room:Room,now:number,until:number)=>Math.max(0,until-(room.phase==='paused'?room.pausedAt:now));
function Theme({room,quiz,now}:Props){
 const age=introMs-left(room,now,room.deadline),landed=quiz.stage!=='intro'||age>1500;
 const theme=landed?quiz.theme:spinning[Math.floor(age/110+room.round*5)%spinning.length];
 const type=quizTypes[quiz.type];
 return <div className="qz-center">{room.tiebreak?<div className="qz-tiebreak"><b>⚔️ Tie-break!</b><span>{rivalNames(room)}</span></div>:<small>ROUND {room.round}</small>}<div className={'qz-theme'+(landed?' landed':'')}><span>{icons[theme]??'❔'}</span><h2>{theme}</h2></div>
  {landed&&<div className="qz-type"><b>{type.icon} {type.name}</b><p>{type.text}</p></div>}</div>;
}
function playText(room:Room,play:QuizView['plays'][number]){
 const name=(id:string|null)=>room.players.find(p=>p.id===id)?.name??'Someone';
 const {icon,name:power}=quizPowers[play.power];
 return icon+' '+name(play.from)+': '+power+(play.to?' → '+name(play.to):'')+(play.bounced?' 🪞 bounced back!':'');
}
function Avatar({p}:{p:Player}){return <span className="pt-avatar" style={{background:p.color}} title={p.name}>{p.avatar}</span>}
// Plays what the TV shows. A screen opened mid-round stays quiet until something changes.
function useQuizSounds(room:Room,quiz:QuizView,now:number){
 const {stage}=quiz,playing=room.phase==='playing';
 const anyRight=Object.values(quiz.picks).some(v=>v===room.correct),locked=room.players.filter(p=>p.answered).length,ready=quiz.chosen.length;
 const remaining=left(room,now,room.deadline),seconds=Math.ceil(remaining/1000);
 const spin=stage==='intro'?Math.min(Math.floor((introMs-remaining)/110),14):-1;
 const key=room.round+stage,was=useRef({key,locked,ready,crossed:quiz.crossed.length,seconds,spin});
 useEffect(()=>{
  const before=was.current;was.current={key,locked,ready,crossed:quiz.crossed.length,seconds,spin};
  if(!playing)return;
  if(before.key!==key){
   if(stage==='question'){play('question');if(quiz.plays.length)play('power')}
   if(stage==='suspense')play('suspense');
   if(stage==='reveal')play(anyRight?'right':'wrong');
   return;
  }
  if(stage==='intro'&&spin!==before.spin&&spin>0)play(spin===14?'landed':'spin');
  if((stage==='power'&&ready>before.ready)||(stage==='question'&&locked>before.locked))play('lock');
  if(stage==='suspense'&&quiz.crossed.length>before.crossed)play('crossed');
  if((stage==='power'||stage==='question')&&seconds<before.seconds&&seconds>0)play(seconds<=3?'hurry':'tick');
 },[key,stage,playing,locked,ready,seconds,spin,anyRight,quiz.crossed.length,quiz.plays.length]);
}
export function QuizTV({room,quiz,now}:Props){
 const type=quizTypes[quiz.type],seconds=Math.ceil(left(room,now,room.deadline)/1000);
 const asking=quiz.stage==='question',reveal=quiz.stage==='reveal';
 useQuizSounds(room,quiz,now);
 const standings=ranked(room.players),before=ranked(room.players.map(p=>({...p,score:p.score-(p.gained??0)})));
 const moved=(id:string)=>(before.find(e=>e.p.id===id)?.rank??0)-(standings.find(e=>e.p.id===id)?.rank??0);
 const showing=quiz.stage==='intro'||quiz.stage==='power';
 return <div className="qz-tv">
  <div className={'qz-stage qz-'+quiz.stage} key={quiz.stage==='intro'||quiz.stage==='power'?'show':'ask'}>
   {showing?<><Theme room={room} quiz={quiz} now={now}/>{quiz.stage==='power'&&<div className="qz-powerbar"><b>Choose your power</b><i style={{width:left(room,now,room.deadline)/powerMs*100+'%'}}/><span>{quiz.chosen.length} / {room.players.length} ready</span></div>}</>
   :<><div className="qz-head"><span>{icons[quiz.theme]??'❔'} {quiz.theme}</span><span>{type.icon} {type.name}</span>{room.tiebreak&&<span>⚔️ Tie-break</span>}{asking&&<b className={seconds<=3?'hot':''}>{seconds}</b>}</div>
    <h2>{room.question?.text}</h2>
    <div className="qz-options">{room.question?.options.map((o,i)=>{
     const out=quiz.crossed.includes(i)||(reveal&&room.correct!==i),right=reveal&&room.correct===i;
     return <div key={i} className={(right?'right':out?'out':'')+(asking?' blank':'')}><b>{'ABCD'[i]}</b><span>{asking?'Look at your phone':o}</span>{reveal&&<em>{room.players.filter(p=>quiz.picks[p.id]===i).map(p=><Avatar key={p.id} p={p}/>)}</em>}</div>;
    })}</div>
    <p className="qz-status" role="status">{asking?rivals(room).filter(p=>p.answered).length+' of '+rivals(room).length+' locked in':reveal?'The answer is '+(room.question?.options[room.correct??-1]??'')+'!':'Answers locked… and the answer is…'}</p>
    {!reveal&&quiz.plays.length>0&&<div className="qz-plays">{quiz.plays.map((p,i)=><span key={i} className={p.bounced?'bounced':''}>{playText(room,p)}</span>)}</div>}</>}
   {room.phase==='paused'&&<div className="qz-paused">Paused</div>}
  </div>
  <div className="qz-scores">{standings.map(({p,rank})=><span key={p.id} className={(plays(room,p.id)?'':'watching ')+(quiz.stage==='power'?quiz.chosen.includes(p.id)?'done':'':asking&&p.answered?'done':'')}><span className="qz-rank">{rank+1}</span><Avatar p={p}/><b>{p.name}</b>{reveal&&moved(p.id)!==0&&<small className={moved(p.id)>0?'up':'down'}>{moved(p.id)>0?'▲':'▼'}{Math.abs(moved(p.id))}</small>}<strong>{p.score}</strong>{reveal&&plays(room,p.id)&&<em className={(p.gained??0)<0?'loss':''}>{signed(p.gained??0)}</em>}</span>)}</div>
 </div>;
}
export function QuizPhone({room,quiz,now,id,busy,command}:Props&{id:string,busy:boolean,command:ReturnType<typeof useRoom>['command']}){
 const [aiming,setAiming]=useState<QuizPower|null>(null);
 useEffect(()=>setAiming(null),[room.round,quiz.stage]);
 const mine=quiz.mine,me=room.players.find(p=>p.id===id),type=quizTypes[quiz.type];
 const watching=!plays(room,id);
 useEffect(()=>{if(quiz.stage==='reveal'&&!watching){navigator.vibrate?.(mine?.right?[40,40,40]:200);play(mine?.right?'right':'wrong')}},[quiz.stage,mine?.right,watching]);
 if(!mine||!me)return null;
 if(watching)return <div className="qz-phone qz-wait"><h2>⚔️ Tie-break</h2><p>{rivalNames(room)}</p><p>You’re watching this one. Cheer them on!</p></div>;
 const time=left(room,now,mine.until),seconds=Math.ceil(time/1000);
 const others=room.players.filter(p=>p.id!==id);
 const choose=(power:QuizPower|null,target?:string)=>{play('power');return command({action:'quizPower',round:room.round,power,...(target?{target}:{})})};
 const head=<div className="qz-chip-row"><span>{icons[quiz.theme]??'❔'} {quiz.theme}</span><span>{type.icon} {type.name}</span></div>;
 const hits=quiz.plays.filter(p=>(p.bounced?p.from:p.to)===id&&p.from!==(p.bounced?'':id));
 if(quiz.stage==='intro')return <div className="qz-phone"><small>{roundLabel(room)}</small><h2>{room.tiebreak?'You’re tied for first!':'Get ready…'}</h2><p>{room.tiebreak?'No powers. The theme is on the TV.':'The theme is on the TV.'}</p></div>;
 if(quiz.stage==='power'){
  if(quiz.chosen.includes(id))return <div className="qz-phone">{head}<h2>{mine.choice?quizPowers[mine.choice].icon+' '+quizPowers[mine.choice].name+' ready':'Powers saved'}</h2><p>{mine.powers.length?'Waiting for the others…':'You have used all your powers.'}</p></div>;
  if(aiming)return <div className="qz-phone">{head}<h2>{quizPowers[aiming].icon} Aim at who? <i>{seconds}s</i></h2><div className="qz-targets">{others.map(p=><button key={p.id} disabled={busy} style={{borderColor:p.color}} onClick={()=>choose(aiming,p.id)}><Avatar p={p}/>{p.name}</button>)}</div><button className="pt-secondary" onClick={()=>setAiming(null)}>Back</button></div>;
  return <div className="qz-phone">{head}<p>{type.text}</p><h2>Choose your power <i>{seconds}s</i></h2><div className="qz-powers">{mine.powers.map(k=>{const p=quizPowers[k],cost=k==='half'?' Now: -'+Math.max(100,Math.round(me.score*.2))+'.':'';return <button key={k} disabled={busy||(p.target&&!others.length)} onClick={()=>p.target?setAiming(k):choose(k)}><span>{p.icon}</span><b>{p.name}</b><small>{p.text}{cost}</small></button>})}</div><button className="pt-secondary" disabled={busy} onClick={()=>choose(null)}>Save my powers</button></div>;
 }
 if(quiz.stage==='question'){
  if(me.answered)return <div className="qz-phone qz-wait"><h2>🔒 Locked in</h2><p>The answer is coming up on the TV.</p></div>;
  if(time<=0)return <div className="qz-phone qz-wait"><h2>⏳ Time’s up</h2><p>Watch the TV.</p></div>;
  return <div className="qz-phone">{head}{hits.map((p,i)=><p key={i} className="qz-hit">{playText(room,p)}</p>)}<h2>{room.question?.text} <i>{seconds}s</i></h2><div className="qz-answers">{room.question?.options.map((o,i)=>{const gone=mine.removed.includes(i),smoke=!gone&&mine.smoked.includes(i);return <button key={i} disabled={busy||gone} className={gone?'gone':smoke?'smoke':''} onClick={async()=>{play('pick');if(await command({action:'input',round:room.round,value:i}))navigator.vibrate?.(25)}}><b>{'ABCD'[i]}</b>{gone?'—':smoke?'🌫️ Hidden':o}</button>})}</div></div>;
 }
 if(quiz.stage==='suspense')return <div className="qz-phone qz-wait"><h2>🥁 Eyes on the TV…</h2></div>;
 return <div className={'qz-phone qz-verdict '+(mine.right?'yes':'no')}><h2>{mine.right?'Correct!':mine.silent?'No answer':'Wrong!'}</h2><p>{signed(me.gained??0)} points</p><p>You are #{(ranked(room.players).find(e=>e.p.id===id)?.rank??0)+1} of {room.players.length}</p></div>;
}
