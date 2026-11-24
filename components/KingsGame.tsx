'use client';
import {lazy,useState} from 'react';
import type {KingsView} from '@/lib/contract';
import {randomId,useRaceTap,type Room,type useRoom} from '@/lib/controller/room';
import {cupSips,kingsRules} from '@/lib/kings/rules';
import Stage from './drinks/Stage';
import {Card,Drink,list,nameOf,People,Seats,seatColor,sips} from './drinks/parts';
import './drinks/drinks.css';
const KingsScene=lazy(()=>import('./drinks/KingsScene'));
type Props={room:Room,board:KingsView,busy:boolean,command:ReturnType<typeof useRoom>['command']};
const ruleOf=(board:KingsView)=>{
 if(!board.card)return null;
 if(board.card[0]==='K'&&board.kings===4)return {title:'The king’s cup!',rule:'Fourth king. Drink everything in the cup.'};
 return kingsRules[board.card[0]];
};
function drinkers(board:KingsView,room:Room){
 const e=board.event;if(!e?.drinkers.length)return '';
 const all=e.drinkers.length>1&&e.drinkers.length===room.players.length;
 return (e.caught?'Caught! ':'')+(all?'Everyone drinks ':list(e.drinkers.map(id=>nameOf(room,id)))+(e.drinkers.length>1?' drink ':' drinks '))+sips(e.amount)+'.';
}
function matesOf(board:KingsView,id:string){return [...new Set(board.mates.flatMap(pair=>pair.includes(id)?pair.filter(p=>p!==id):[]))]}
export function KingsTV({room,board,busy,command}:Props){
 const who=room.players.find(p=>p.id===board.turn),rule=ruleOf(board),drank=drinkers(board,room);
 return <div className="dr-table kings">
  <Stage flat={<div className="dr-flat">{board.card?<Card card={board.card}/>:<Card/>}</div>}>{fail=><KingsScene board={board} players={room.players} onFail={fail}/>}</Stage>
  <div className="dr-banner" style={seatColor(who)} role="status"><span className="dr-chip">{who?.avatar}</span><div><strong>{who?.name}</strong><span>{board.phase==='draw'?'Pull a card from the vortex':board.phase==='race'?'Everyone, hit your phone!':'Follow the card'}</span></div></div>
  <div className="dr-kings" aria-label={board.kings+' of 4 kings drawn'}>{[1,2,3,4].map(n=><span key={n} className={n<=board.kings?'on':''}>♛</span>)}</div>
  {rule&&<section className="dr-rule" key={board.seq}><h2>{rule.title}</h2><p>{rule.rule}</p>{board.phase==='race'&&<p className="dr-race">{board.racers.map(id=>{const p=room.players.find(p=>p.id===id);return <span key={id} className={board.tapped.includes(id)?'done':''}>{p?.avatar}</span>})}</p>}{drank&&<p className="dr-poured" key={drank}>🍻 {drank}</p>}</section>}
  {!rule&&drank&&<section className="dr-rule"><p className="dr-poured">🍻 {drank}</p></section>}
  {board.rules.length>0&&<section className="dr-laws"><h3>House rules</h3>{board.rules.map((r,i)=><p key={i}>{r.text}<small> {nameOf(room,r.by)}</small></p>)}</section>}
  <Seats room={room} turn={board.turn} badge={p=><small>{board.master===p.id&&<em>❓ Question master</em>}{matesOf(board,p.id).map(m=><em key={m}>🤝 {nameOf(room,m)}</em>)}</small>}/>
  {board.phase!=='draw'&&<button className="dr-next quiet" disabled={busy||room.phase!=='playing'} onClick={()=>command({action:'kingsNext',seq:board.seq})}>Skip to next player</button>}
  {board.phase==='draw'&&<button className="dr-next quiet" disabled={busy||room.phase!=='playing'} onClick={()=>command({action:'kingsNext',seq:board.seq})}>Skip {who?.name}</button>}
 </div>;
}
export function KingsPhone({room,board,busy,command,id}:Props&{id:string}){
 const [text,setText]=useState(''),[catching,setCatching]=useState(false);
 const mine=board.turn===id,rule=ruleOf(board),rank=board.card?.[0];
 const send=(move:string,more:Record<string,unknown>={})=>command({action:'kings',move,seq:board.seq,...more});
 const others=room.players.filter(p=>p.id!==id);
 const left=board.left.flatMap((on,i)=>on?[i]:[]);
 const inRace=board.phase==='race'&&board.racers.includes(id);
 const race=useRaceTap(inRace&&!board.tapped.includes(id)?board.seq:null,command);
 const slam=()=>{navigator.vibrate?.(40);race.tap()};
 // Repeats carry the same press, so a lost reply never costs a second sip.
 async function catchPlayer(target:string){const press=randomId();for(let tries=0;tries<4&&!await send('catch',{target,press});tries++)await new Promise(done=>setTimeout(done,500))}
 return <div className="dr-controller kings">
  {rule&&<div className="dr-now"><Card card={board.card}/><div role="status"><b>{rule.title}</b><span>{rule.rule}</span></div></div>}
  {board.event?.drinkers.includes(id)&&<Drink amount={board.event.amount} why={board.event.caught?'The question master got you':rank==='K'?'The whole cup, '+cupSips+' pours':rule?.title??''}/>}
  {board.phase==='draw'&&(mine?<><h2>Your turn. Pull a card.</h2><div className="dr-fan" role="group" aria-label="Pick any card">{left.map((slot,i)=><button key={slot} aria-label={'Card '+(i+1)} disabled={busy} onClick={()=>{navigator.vibrate?.(25);void send('draw',{slot})}}><Card/></button>)}</div></>:<h2>{nameOf(room,board.turn)} is drawing…</h2>)}
  {inRace&&(board.tapped.includes(id)?<h2>Tapped! The slowest drinks.</h2>:<button className="dr-slam" disabled={race.sending} onPointerDown={slam} onClick={e=>{if(e.detail===0)slam()}}>{rank==='4'?'👇 FLOOR':'☝️ HEAVEN'}</button>)}
  {board.phase==='pick'&&(mine?<><h3>{rank==='8'?'Choose your mate':rank==='2'?'Who drinks?':'Who failed?'}</h3><People label="Choose a player" players={rank==='9'||rank==='T'?room.players:others} disabled={busy} choose={target=>void send('pick',{target})}/></>:<p>{nameOf(room,board.turn)} is choosing.</p>)}
  {board.phase==='honor'&&(board.tapped.includes(id)?null:<button className="dr-slam calm" disabled={busy} onClick={()=>void send('drank')}>🍺 That’s me, I drink</button>)}
  {board.phase==='rule'&&(mine?<form onSubmit={e=>{e.preventDefault();void send('rule',{text:text.trim()})}}><h3>Pour into the cup, then make a rule</h3><input aria-label="House rule" placeholder="No saying names" maxLength={60} value={text} onChange={e=>setText(e.target.value)}/><button className="pt-primary" disabled={busy||!text.trim()}>Make it law</button></form>:<p>{nameOf(room,board.turn)} is writing a house rule.</p>)}
  {mine&&(board.phase==='open'||board.phase==='honor')&&<button className="pt-primary" disabled={busy} onClick={()=>void send('done')}>{board.kings===4?'Cup finished!':'Done, next player'}</button>}
  {board.master===id&&<div className="dr-master">{catching?<><h3>Who answered your question?</h3><People label="Choose who answered" players={others} disabled={busy} choose={target=>{setCatching(false);void catchPlayer(target)}}/><button onClick={()=>setCatching(false)}>Cancel</button></>:<button onClick={()=>setCatching(true)}>❓ Someone answered my question</button>}</div>}
  {(board.rules.length>0||matesOf(board,id).length>0)&&<div className="dr-notes">{matesOf(board,id).map(m=><p key={m}>🤝 {nameOf(room,m)} drinks when you do</p>)}{board.rules.map((r,i)=><p key={i}>📜 {r.text}</p>)}</div>}
 </div>;
}
