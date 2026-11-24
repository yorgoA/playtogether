'use client';
import {useEffect,useState,type ReactNode} from 'react';
import type {Player,Room} from '@/lib/controller/room';
import {scoreText} from '@/lib/controller/room';
import {play} from '@/lib/controller/sound';
import './podium.css';
const medals=['🥇','🥈','🥉'],confetti=Array.from({length:60},(_,i)=>i);
export const ranked=(players:Player[])=>{const list=[...players].sort((a,b)=>b.score-a.score);return list.map(p=>({p,rank:list.findIndex(o=>o.score===p.score)}))};
// Third place rises first and the winner last.
export default function Podium({room}:{room:Room}){
 const list=ranked(room.players),top=list.slice(0,3),rest=list.slice(3),first=list.filter(e=>e.rank===0);
 useEffect(()=>{
  // Third, second, then the winner, in step with the delays in podium.css.
  const count=Math.min(3,room.players.length);
  const timers=[setTimeout(()=>play('drum'),100),...Array.from({length:count-1},(_,i)=>setTimeout(()=>play('step'),400+(3-count+i)*1100)),setTimeout(()=>play('win'),2700)];
  return ()=>timers.forEach(clearTimeout);
 },[room.players.length]);
 // Seats on stage, left to right: second, first, third.
 const order=[1,0,2].filter(i=>top[i]);
 return <div className="po-stage">
  <div className="po-confetti" aria-hidden="true">{confetti.map(i=><i key={i} style={{left:(i*37)%100+'%',background:['#c3f76a','#bc96ff','#ffae65','#ff83b1','#69dafa','#ffdf75'][i%6],animationDelay:2.8+(i%17)*.17+'s',animationDuration:2.6+(i%7)*.3+'s'}}/>)}</div>
  <h2 className="po-title">{first.map(e=>e.p.name).join(' & ')} {first.length===1?'wins!':'tie!'}</h2>
  <div className="po-podium">{order.map(i=>{const {p,rank}=top[i];return <div key={p.id} className={'po-place p'+rank+' seat'+i}>
   <div className="po-who">{rank===0&&<span className="po-crown">👑</span>}<span className="po-face" style={{background:p.color}}>{p.avatar}</span><b>{p.name}</b><small>{scoreText(room.game,p.score)}</small></div>
   <div className="po-block"><span>{medals[rank]}</span><strong>{rank+1}</strong></div></div>})}</div>
  {rest.length>0&&<ol className="po-rest">{rest.map(({p,rank})=><li key={p.id}><strong>{rank+1}</strong><span className="pt-avatar" style={{background:p.color}}>{p.avatar}</span><b>{p.name}</b><span>{scoreText(room.game,p.score)}</span></li>)}</ol>}
 </div>;
}
// Waits for the TV's podium, so a phone never spoils the winner.
export function PodiumPhone({room,id,children}:{room:Room,id:string,children:ReactNode}){
 const [open,setOpen]=useState(false);
 const mine=ranked(room.players).find(e=>e.p.id===id);
 const won=mine?.rank===0;
 useEffect(()=>{const t=setTimeout(()=>{setOpen(true);navigator.vibrate?.(won?[80,60,80,60,200]:80)},3600);return ()=>clearTimeout(t)},[won]);
 if(!open)return <div className="po-phone"><span>🥁</span><h2>And the winner is…</h2><p>Eyes on the TV!</p></div>;
 if(!mine)return <>{children}</>;
 return <><div className={'po-phone'+(won?' won':'')}><span>{medals[mine.rank]??'🎖️'}</span><h2>{won?'You win!':'You finished #'+(mine.rank+1)}</h2><p>{scoreText(room.game,mine.p.score)}</p></div>{children}</>;
}
