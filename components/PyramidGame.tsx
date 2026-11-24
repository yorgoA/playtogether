'use client';
import {lazy,useState} from 'react';
import type {PyramidView} from '@/lib/contract';
import type {Room,useRoom} from '@/lib/controller/room';
import {pyramidLevels} from '@/lib/pyramid/layout';
import Stage from './drinks/Stage';
import {Card,Drink,nameOf,People,Seats,seatColor,sips} from './drinks/parts';
import './drinks/drinks.css';
const PyramidScene=lazy(()=>import('./drinks/PyramidScene'));
type Props={room:Room,board:PyramidView,busy:boolean,command:ReturnType<typeof useRoom>['command']};
function levelOf(index:number){let end=0;return pyramidLevels.findIndex(size=>index<(end+=size))+1}
function news(board:PyramidView,room:Room):[string,string]{
 const {claim,outcome}=board;
 if(claim)return [nameOf(room,claim.from)+' says: you drink!',nameOf(room,claim.to)+', drink '+sips(levelOf(board.index))+' or call the bluff.'];
 if(outcome)return [outcome.verdict==='bluff'?'Bluff caught!':outcome.verdict==='match'?'It was real!':'Bottoms up!',nameOf(room,outcome.loser)+' drinks '+sips(outcome.points)+'.'];
 if(board.index<0)return ['Memorize your four cards','They vanish when the first stone turns.'];
 return ['Got this rank? Make someone drink',sips(levelOf(board.index))+' each. Called bluffs count double.'];
}
function Flat({board}:{board:PyramidView}){
 const rows=pyramidLevels.map((size,row)=>({size,start:pyramidLevels.slice(0,row).reduce<number>((n,k)=>n+k,0)})).reverse();
 return <div className="dr-flat">{rows.map(({size,start})=><div key={size}>{board.cards.slice(start,start+size).map((c,i)=><Card key={i} card={c} active={board.index===start+i}/>)}</div>)}</div>;
}
export function PyramidTV({room,board,busy,command}:Props){
 const [title,text]=news(board,room),who=room.players.find(p=>p.id===(board.claim?.from??board.outcome?.loser));
 const last=board.index===board.cards.length-1;
 return <div className="dr-table pyramid">
  <Stage flat={<Flat board={board}/>}>{fail=><PyramidScene board={board} onFail={fail}/>}</Stage>
  <div className="dr-banner" key={title+text} role="status" style={seatColor(who)}>{who&&<span className="dr-chip">{who.avatar}</span>}<div><strong>{title}</strong><span>{text}</span></div>{board.outcome?.card&&<Card card={board.outcome.card}/>}</div>
  <Seats room={room}/>
  <button className="dr-next" onClick={()=>command({action:'pyramidFlip',index:board.index})} disabled={busy||!!board.claim||room.phase!=='playing'}>{last?'Finish the pyramid':board.index<0?'Turn the first stone':'Turn the next stone'}</button>
 </div>;
}
export function PyramidPhone({board,room,busy,command,id}:Props&{id:string}){
 const [slot,setSlot]=useState<number>();
 const [title,text]=news(board,room);
 const opponents=room.players.filter(p=>p.id!==id&&p.connected),hasCards=board.slots?.some(Boolean);
 const chosen=slot!==undefined&&board.slots?.[slot]?slot:undefined;
 if(board.index<0)return <div className="dr-controller"><h2>Memorize your cards</h2><p>Left to right. They turn face down when the first stone flips.</p><div className="dr-hand big">{board.hand?.map((c,i)=><span key={c}><Card card={c}/><small>Slot {i+1}</small></span>)}</div></div>;
 const level=levelOf(board.index);
 return <div className="dr-controller">
  <div className="dr-now"><Card card={board.cards[board.index]}/><div role="status"><b>{title}</b><span>{text}</span></div></div>
  {board.outcome?.loser===id&&<Drink amount={board.outcome.points} why={board.outcome.verdict==='bluff'?'Your bluff was caught':board.outcome.verdict==='match'?'They really had it':'You took it like a champ'}/>}
  {board.claim?.to===id&&<div className="dr-call"><button disabled={busy} onClick={()=>command({action:'pyramidReply',index:board.index,call:false})}><b>Drink {sips(level)}</b><small>I believe it</small></button><button className="hot" disabled={busy} onClick={()=>command({action:'pyramidReply',index:board.index,call:true})}><b>Bullsh*t!</b><small>Wrong one drinks {level*2}</small></button></div>}
  {!board.claim&&hasCards&&<><h3>{chosen===undefined?'Pick the card you say matches':'Who drinks '+sips(level)+'?'}</h3>
   <div className="dr-hand" role="group" aria-label="Your face-down cards">{board.slots?.map((left,i)=><button key={i} disabled={busy||!left} aria-label={'Slot '+(i+1)} aria-pressed={chosen===i} onClick={()=>setSlot(chosen===i?undefined:i)}>{left?<Card/>:<span className="dr-gone"/>}<small>Slot {i+1}</small></button>)}</div>
   {chosen!==undefined&&<People label="Choose who drinks" players={opponents} disabled={busy} choose={async target=>{if(await command({action:'pyramidClaim',index:board.index,slot:chosen,target}))setSlot(undefined)}}/>}</>}
  {!board.claim&&!hasCards&&<p>You have played all four cards. You can still call bluffs.</p>}
 </div>;
}
