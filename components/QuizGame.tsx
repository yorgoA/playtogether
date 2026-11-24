'use client';
import {useEffect,useState} from 'react';
import type {QuizPower,QuizView} from '@/lib/contract';
import type {Player,Room,useRoom} from '@/lib/controller/room';
import {introMs,powerMs,quizPowers,quizTypes} from '@/lib/quiz/rules';
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
 return <div className="qz-center"><small>ROUND {room.round}</small><div className={'qz-theme'+(landed?' landed':'')}><span>{icons[theme]??'❔'}</span><h2>{theme}</h2></div>
  {landed&&<div className="qz-type"><b>{type.icon} {type.name}</b><p>{type.text}</p></div>}</div>;
}
function playText(room:Room,play:QuizView['plays'][number]){
 const name=(id:string|null)=>room.players.find(p=>p.id===id)?.name??'Someone';
 const {icon,name:power}=quizPowers[play.power];
 return icon+' '+name(play.from)+': '+power+(play.to?' → '+name(play.to):'')+(play.bounced?' 🪞 bounced back!':'');
}
function Avatar({p}:{p:Player}){return <span className="pt-avatar" style={{background:p.color}} title={p.name}>{p.avatar}</span>}
export function QuizTV({room,quiz,now}:Props){
 const type=quizTypes[quiz.type],seconds=Math.ceil(left(room,now,room.deadline)/1000);
 const asking=quiz.stage==='question',reveal=quiz.stage==='reveal',players=[...room.players].sort((a,b)=>b.score-a.score);
 const showing=quiz.stage==='intro'||quiz.stage==='power';
 return <div className="qz-tv">
  <div className={'qz-stage qz-'+quiz.stage} key={quiz.stage==='intro'||quiz.stage==='power'?'show':'ask'}>
   {showing?<><Theme room={room} quiz={quiz} now={now}/>{quiz.stage==='power'&&<div className="qz-powerbar"><b>Choose your power</b><i style={{width:left(room,now,room.deadline)/powerMs*100+'%'}}/><span>{quiz.chosen.length} / {room.players.length} ready</span></div>}</>
   :<><div className="qz-head"><span>{icons[quiz.theme]??'❔'} {quiz.theme}</span><span>{type.icon} {type.name}</span>{asking&&<b className={seconds<=3?'hot':''}>{seconds}</b>}</div>
    <h2>{room.question?.text}</h2>
    <div className="qz-options">{room.question?.options.map((o,i)=>{
     const out=quiz.crossed.includes(i)||(reveal&&room.correct!==i),right=reveal&&room.correct===i;
     return <div key={i} className={(right?'right':out?'out':'')+(asking?' blank':'')}><b>{'ABCD'[i]}</b><span>{asking?'Look at your phone':o}</span>{reveal&&<em>{room.players.filter(p=>quiz.picks[p.id]===i).map(p=><Avatar key={p.id} p={p}/>)}</em>}</div>;
    })}</div>
    <p className="qz-status" role="status">{asking?room.players.filter(p=>p.answered).length+' of '+room.players.length+' locked in':reveal?'The answer is '+(room.question?.options[room.correct??-1]??'')+'!':'Answers locked… and the answer is…'}</p>
    {!reveal&&quiz.plays.length>0&&<div className="qz-plays">{quiz.plays.map((p,i)=><span key={i} className={p.bounced?'bounced':''}>{playText(room,p)}</span>)}</div>}</>}
   {room.phase==='paused'&&<div className="qz-paused">Paused</div>}
  </div>
  <div className="qz-scores">{players.map(p=><span key={p.id} className={quiz.stage==='power'?quiz.chosen.includes(p.id)?'done':'':asking&&p.answered?'done':''}><Avatar p={p}/><b>{p.name}</b><strong>{p.score}</strong>{reveal&&<em className={(p.gained??0)<0?'loss':''}>{signed(p.gained??0)}</em>}</span>)}</div>
 </div>;
}
export function QuizPhone({room,quiz,now,id,busy,command}:Props&{id:string,busy:boolean,command:ReturnType<typeof useRoom>['command']}){
 const [aiming,setAiming]=useState<QuizPower|null>(null);
 useEffect(()=>setAiming(null),[room.round,quiz.stage]);
 const mine=quiz.mine,me=room.players.find(p=>p.id===id),type=quizTypes[quiz.type];
 useEffect(()=>{if(quiz.stage==='reveal')navigator.vibrate?.(mine?.right?[40,40,40]:200)},[quiz.stage,mine?.right]);
 if(!mine||!me)return null;
 const time=left(room,now,mine.until),seconds=Math.ceil(time/1000);
 const others=room.players.filter(p=>p.id!==id);
 const choose=(power:QuizPower|null,target?:string)=>command({action:'quizPower',round:room.round,power,...(target?{target}:{})});
 const head=<div className="qz-chip-row"><span>{icons[quiz.theme]??'❔'} {quiz.theme}</span><span>{type.icon} {type.name}</span></div>;
 const hits=quiz.plays.filter(p=>(p.bounced?p.from:p.to)===id&&p.from!==(p.bounced?'':id));
 if(quiz.stage==='intro')return <div className="qz-phone"><small>ROUND {room.round} / {room.rounds}</small><h2>Get ready…</h2><p>The theme is on the TV.</p></div>;
 if(quiz.stage==='power'){
  if(quiz.chosen.includes(id))return <div className="qz-phone">{head}<h2>{mine.choice?quizPowers[mine.choice].icon+' '+quizPowers[mine.choice].name+' ready':'Powers saved'}</h2><p>{mine.powers.length?'Waiting for the others…':'You have used all your powers.'}</p></div>;
  if(aiming)return <div className="qz-phone">{head}<h2>{quizPowers[aiming].icon} Aim at who? <i>{seconds}s</i></h2><div className="qz-targets">{others.map(p=><button key={p.id} disabled={busy} style={{borderColor:p.color}} onClick={()=>choose(aiming,p.id)}><Avatar p={p}/>{p.name}</button>)}</div><button className="pt-secondary" onClick={()=>setAiming(null)}>Back</button></div>;
  return <div className="qz-phone">{head}<p>{type.text}</p><h2>Choose your power <i>{seconds}s</i></h2><div className="qz-powers">{mine.powers.map(k=>{const p=quizPowers[k],cost=k==='half'?' Now: -'+Math.max(100,Math.round(me.score*.2))+'.':'';return <button key={k} disabled={busy||(p.target&&!others.length)} onClick={()=>p.target?setAiming(k):choose(k)}><span>{p.icon}</span><b>{p.name}</b><small>{p.text}{cost}</small></button>})}</div><button className="pt-secondary" disabled={busy} onClick={()=>choose(null)}>Save my powers</button></div>;
 }
 if(quiz.stage==='question'){
  if(me.answered)return <div className="qz-phone qz-wait"><h2>🔒 Locked in</h2><p>The answer is coming up on the TV.</p></div>;
  if(time<=0)return <div className="qz-phone qz-wait"><h2>⏳ Time’s up</h2><p>Watch the TV.</p></div>;
  return <div className="qz-phone">{head}{hits.map((p,i)=><p key={i} className="qz-hit">{playText(room,p)}</p>)}<h2>{room.question?.text} <i>{seconds}s</i></h2><div className="qz-answers">{room.question?.options.map((o,i)=>{const gone=mine.removed.includes(i),smoke=!gone&&mine.smoked.includes(i);return <button key={i} disabled={busy||gone} className={gone?'gone':smoke?'smoke':''} onClick={async()=>{if(await command({action:'input',round:room.round,value:i}))navigator.vibrate?.(25)}}><b>{'ABCD'[i]}</b>{gone?'—':smoke?'🌫️ Hidden':o}</button>})}</div></div>;
 }
 if(quiz.stage==='suspense')return <div className="qz-phone qz-wait"><h2>🥁 Eyes on the TV…</h2></div>;
 return <div className={'qz-phone qz-verdict '+(mine.right?'yes':'no')}><h2>{mine.right?'Correct!':mine.silent?'No answer':'Wrong!'}</h2><p>{signed(me.gained??0)} points</p></div>;
}
