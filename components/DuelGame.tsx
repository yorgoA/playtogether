'use client';
import type {DuelView} from '@/lib/contract';
import type {Player,Room} from '@/lib/controller/room';
import './duel.css';
type Props={room:Room,duel:DuelView,go:boolean};
const why={slow:'too slow',early:'jumped the gun',silent:'never drew'};
const nameOf=(room:Room,id:string|null)=>room.players.find(p=>p.id===id)?.name??'Someone';
function news(room:Room,duel:DuelView,go:boolean):[string,string]{
 if(!room.revealing)return go?['DRAW!','']:[duel.alive.length===2?'Final showdown…':'Steady…','Wait for the signal.'];
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
 const [title,text]=news(room,duel,go),n=room.players.length,reveal=!!room.revealing;
 const fastest=reveal?room.players.filter(p=>p.reactionMs!=null).sort((a,b)=>a.reactionMs!-b.reactionMs!)[0]?.id:undefined;
 return <div className={'du-scene'+(go&&!reveal?' go':'')+(reveal&&duel.fallen.length?' bang':'')} key={duel.draw}>
  <div className="du-sun"/><svg className="du-town" viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden="true"><path d="M0 300V190l90-60 130 80 120-140 140 130h120l150-110 130 120 140-90 180 100v80z" fill="#8f3f3a"/><path d="M0 300V120h70V80h130v40h60v180zM940 300V140h60V70h120v70h80v160z" fill="#4b2226"/><g fill="#ffc46b"><path d="M30 160h26v40H30zM110 120h30v46h-30zM170 180h30v50h-30zM970 180h24v44h-24zM1040 110h32v46h-32zM1120 190h30v46h-30z"/></g></svg>
  <div className="du-ground"/>
  <div className="du-title" role="status"><h2>{title}</h2><p>{text||' '}</p></div>
  {room.players.map((p,i)=>{
   const x=n===1?50:10+i*80/(n-1),alive=duel.alive.includes(p.id),now=reveal&&duel.fallen.some(f=>f.id===p.id);
   const ms=reveal&&p.early?'Misfire':reveal&&p.reactionMs!=null?p.reactionMs+' ms':'';
   return <Cowboy key={p.id} p={p} x={x} size={Math.min(17,78/n)} dead={!alive} now={now} shooting={reveal&&(p.id===fastest||(alive&&p.reactionMs!=null))&&duel.fallen.length>0} flip={x>50} wins={duel.wins[p.id]??0} note={ms}/>;
  })}
  <div className="du-left">{duel.alive.length} standing</div>
  {room.phase==='paused'&&<div className="du-paused">Paused</div>}
 </div>;
}
export function DuelPhone({room,duel,go,id,sending,shoot}:Props&{id:string,sending:boolean,shoot:()=>void}){
 const me=room.players.find(p=>p.id===id),fell=duel.fallen.find(f=>f.id===id),alive=duel.alive.includes(id);
 if(room.revealing){
  const [title,text]=duel.winner===id?['🏆 Last one standing!','You win the round.']:fell?['💀 You’re hit!',(fell.by?nameOf(room,fell.by)+' got you: ':'')+why[fell.why]+'.']:alive?duel.fallen.length?['😮‍💨 You survived',duel.alive.length===2?'One rival left.':'Get ready to draw again.']:['Stalemate','Draw again.']:['💀 Out',duel.winner?nameOf(room,duel.winner)+' wins the round.':'Back next round.'];
  return <div className={'du-phone '+(fell?'hit':alive?'safe':'out')}><h2>{title}</h2><p>{text}</p>{me?.reactionMs!=null&&<b>{me.reactionMs} ms</b>}</div>;
 }
 if(!alive)return <div className="du-phone out"><h2>💀 You’re out</h2><p>You are back in the next round. {duel.alive.length} still standing.</p></div>;
 if(me?.answered)return <div className="du-phone"><h2>{me.early?'Misfire!':'Shot fired'}</h2><p>{me.early?'You drew before the signal.':'Watch the TV…'}</p></div>;
 return <div className="du-phone"><h2>{duel.alive.length===2?'Final showdown':duel.alive.length+' standing'}</h2><button className={'du-trigger'+(go?' go':'')} disabled={sending} onPointerDown={shoot} onClick={e=>{if(e.detail===0)shoot()}}>{sending?'SHOT!':go?'SHOOT!':'STEADY…'}</button><p>The slowest one falls. Too soon is a misfire.</p></div>;
}
