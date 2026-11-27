'use client';
import {useEffect,useRef} from 'react';
import type {DuelView} from '@/lib/contract';
import type {Player,Room} from '@/lib/controller/room';
import {play} from '@/lib/controller/sound';
import DuelGun from './DuelGun';
import {plays,rivalNames,rivals} from './tiebreak';
import './duel.css';
type Props={room:Room,duel:DuelView,go:boolean};
const why={slow:'too slow',early:'jumped the gun',silent:'never drew'};
const nameOf=(room:Room,id:string|null)=>room.players.find(p=>p.id===id)?.name??'Someone';
function news(room:Room,duel:DuelView,go:boolean):[string,string]{
 if(!room.revealing)return go?['DRAW!','']:room.tiebreak?['Tie-break…',rivalNames(room)]:[duel.alive.length===2?'Final showdown…':'Steady…','Wait for the signal.'];
 const fell=duel.fallen.map(f=>nameOf(room,f.id)+' ('+why[f.why]+')').join(', ');
 if(duel.winner)return [nameOf(room,duel.winner)+' wins the round!',fell];
 if(duel.over)return ['Nobody wins this round','Too many misfires.'];
 return duel.fallen.length?['BANG!',fell]:['Stalemate!','Nobody falls. Draw again.'];
}
function Cowboy({p,x,size,dead,now,shooting,flip,wins,note}:{p:Player,x:number,size:number,dead:boolean,now:boolean,shooting:boolean,flip:boolean,wins:number,note:string}){
 return <div className={'du-gun'+(dead?' dead':'')+(now?' falling':'')+(shooting?' shooting':'')} style={{left:x+'%',width:size+'%'}}>
  <div className="du-label"><b>{p.name}</b><small>{note||'★'.repeat(wins)||' '}</small></div>
  <div className="du-body"><svg viewBox="0 0 120 190" aria-hidden="true" style={flip?{transform:'scaleX(-1)'}:undefined}>
   <ellipse cx="60" cy="183" rx="44" ry="6" fill="#0005"/>
   <path d="M42 120 34 180h20l6-42 6 42h20l-8-60z" fill="#39251f"/><path d="M30 178h24v7H26zM66 178h24l4 7H66z" fill="#1c1210"/>
   <path d="M34 76q26-14 52 0l6 52q-32 12-64 0z" fill={p.color}/><path d="M52 72l8 40 8-40z" fill="#0003"/>
   <path d="M30 118h60v9H30z" fill="#2a1712"/><rect x="54" y="116" width="12" height="13" rx="2" fill="#e8b64c"/>
   <path className="du-arm" d={shooting?'M84 84 116 82v9L84 98z':'M86 80l14 34-9 5-14-28z'} fill={p.color} stroke="#0004"/>
   {shooting&&<><path d="M108 78h18v5h-12v10h-6z" fill="#16161b"/><path className="du-flash" d="M124 80l16-9-5 9 9 2-10 3 4 8z" fill="#ffe27a"/></>}
   <path d="M40 66q20 16 40 0l-6 16H46z" fill="#c7362f"/>
   <path d="M16 38q44-14 88 0-44 12-88 0z" fill="#4a2d1d"/><path d="M38 36q2-28 22-24 20-4 22 24-22 6-44 0z" fill="#6b4328"/><path d="M38 31q22 6 44 0v6q-22 5-44 0z" fill="#c7362f"/>
  </svg><span className="du-face" style={{background:p.color}}>{p.avatar}</span></div>
 </div>;
}
export function DuelTV({room,duel,go}:Props){
 useDuelSounds(room,duel,go);
 const [title,text]=news(room,duel,go),shown=rivals(room),n=shown.length,reveal=!!room.revealing;
 const fastest=reveal?room.players.filter(p=>p.reactionMs!=null).sort((a,b)=>a.reactionMs!-b.reactionMs!)[0]?.id:undefined;
 return <div className={'du-scene'+(go&&!reveal?' go':'')+(reveal&&duel.fallen.length?' bang':'')} key={duel.draw}>
  <div className="du-sun"/><svg className="du-town" viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden="true"><path d="M0 300V190l90-60 130 80 120-140 140 130h120l150-110 130 120 140-90 180 100v80z" fill="#8f3f3a"/><path d="M0 300V120h70V80h130v40h60v180zM940 300V140h60V70h120v70h80v160z" fill="#4b2226"/><g fill="#ffc46b"><path d="M30 160h26v40H30zM110 120h30v46h-30zM170 180h30v50h-30zM970 180h24v44h-24zM1040 110h32v46h-32zM1120 190h30v46h-30z"/></g></svg>
  <div className="du-ground"/>
  <div className="du-title" role="status"><h2>{title}</h2><p>{text||' '}</p></div>
  {shown.map((p,i)=>{
   const x=n===1?50:10+i*80/(n-1),alive=duel.alive.includes(p.id),now=reveal&&duel.fallen.some(f=>f.id===p.id);
   const ms=reveal&&p.early?'Misfire':reveal&&p.reactionMs!=null?p.reactionMs+' ms':'';
   return <Cowboy key={p.id} p={p} x={x} size={Math.min(17,78/n)} dead={!alive} now={now} shooting={reveal&&(p.id===fastest||(alive&&p.reactionMs!=null))&&duel.fallen.length>0} flip={x>50} wins={duel.wins[p.id]??0} note={ms}/>;
  })}
  <div className="du-left">{duel.alive.length} standing</div>
  {room.phase==='paused'&&<div className="du-paused">Paused</div>}
 </div>;
}
// A shot rings out on the TV once the signal is out. Early ones wait for the smoke to clear, so nobody is
// fooled into drawing.
function useDuelSounds(room:Room,duel:DuelView,go:boolean){
 const reveal=!!room.revealing,playing=room.phase==='playing';
 const shots=rivals(room).filter(p=>reveal?p.reactionMs!=null:go&&p.answered).length;
 const early=reveal?rivals(room).filter(p=>p.early).length:0,fallen=reveal?duel.fallen.length:0;
 const was=useRef({draw:duel.draw,shots,reveal,go});
 useEffect(()=>{
  const before=was.current;was.current={draw:duel.draw,shots,reveal,go};
  if(!playing)return;
  const same=before.draw===duel.draw;
  if(go&&!reveal&&!(same&&before.go))play('draw');
  const heard=same?before.shots:0,fresh=Math.max(0,shots-heard),misfires=reveal&&!(same&&before.reveal)?early:0;
  const timers=Array.from({length:Math.min(4,fresh+misfires)},(_,i)=>setTimeout(()=>play('gunshot'),i*130));
  if(reveal&&fallen&&!(same&&before.reveal))timers.push(setTimeout(()=>play('fall'),550));
  // Left running: a shot already fired still rings out when the next one arrives.
 },[duel.draw,shots,early,fallen,reveal,go,playing]);
}
export function DuelPhone({room,duel,go,id,sending,shoot}:Props&{id:string,sending:boolean,shoot:()=>void}){
 const me=room.players.find(p=>p.id===id),fell=duel.fallen.find(f=>f.id===id),alive=duel.alive.includes(id);
 const watching=!plays(room,id),reveal=!!room.revealing,fired=!watching&&(sending||!!me?.answered);
 const key=duel.draw+(fired?'shot':''),was=useRef(key);
 // Covers a tap and a shake. A phone opened after its shot stays quiet.
 useEffect(()=>{const before=was.current;was.current=key;if(before!==key&&fired){play('gunshot');navigator.vibrate?.([70,30,40])}},[key,fired]);
 const raised=go&&!fired&&!reveal;
 useEffect(()=>{if(raised&&alive&&!watching){play('draw');navigator.vibrate?.(30)}},[raised,alive,watching]);
 useEffect(()=>{if(reveal&&fell){play('hit');navigator.vibrate?.([200,80,200])}},[reveal,fell?.id]);// eslint-disable-line react-hooks/exhaustive-deps
 if(watching)return <div className="du-phone out"><h2>⚔️ Tie-break</h2><p>{rivalNames(room)}</p><p>You’re watching this one. Cheer them on!</p></div>;
 if(!alive&&!fell)return <div className="du-phone out"><h2>💀 You’re out</h2><p>{reveal&&duel.winner?nameOf(room,duel.winner)+' wins the round.':(room.tiebreak?'':'You are back in the next round. ')+duel.alive.length+' still standing.'}</p></div>;
 const [title,text]=reveal?duel.winner===id?['Last one standing!','You win the round.']:fell?['You’re hit!',(fell.by?nameOf(room,fell.by)+' got you: ':'')+why[fell.why]+'.']:duel.fallen.length?['You survived',duel.alive.length===2?'One rival left.':'Get ready to draw again.']:['Stalemate','Draw again.']
  :fired?me?.early?['Misfire!','You drew before the signal.']:['Shot fired','Watch the TV…']:go?['DRAW!','']:[room.tiebreak?'Tie-break…':duel.alive.length===2?'Final showdown…':'Steady…',duel.alive.length+' standing. Wait for the signal.'];
 const open=!reveal&&!fired;
 return <button type="button" className={'dg'+(reveal?fell?' hit':' safe':fired?' fired':go?' go':'')} key={duel.draw} aria-disabled={!open} aria-label={open?go?'Shoot now':'Wait, then shoot':title} onPointerDown={()=>{if(open)shoot()}} onClick={e=>{if(open&&e.detail===0)shoot()}}>
  <span className="dg-text" role="status"><b>{title}</b><span>{text}</span>{reveal&&me?.reactionMs!=null&&<em>{me.reactionMs} ms</em>}</span>
  <DuelGun spent={fired}/>
  {reveal&&fell&&<svg className="dg-hole" viewBox="0 0 200 200" aria-hidden="true"><g stroke="#fff" strokeWidth="2" opacity=".8" fill="none"><path d="M100 100 20 40M100 100 70 5M100 100 150 12M100 100 196 70M100 100 180 150M100 100 120 195M100 100 50 185M100 100 5 120M58 70 72 50 128 46 152 84 146 126 112 148 66 140 50 106Z"/></g><circle cx="100" cy="100" r="17" fill="#080306" stroke="#fff" strokeWidth="3"/></svg>}
 </button>;
}
