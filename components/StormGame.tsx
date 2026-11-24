'use client';
import {useState} from 'react';
import type {StormView} from '@/lib/contract';
import type {Room,useRoom} from '@/lib/controller/room';
import {elements,fits,isPower,stormLimit,type Element} from '@/lib/storm/rules';
import './storm.css';
type Props={room:Room,board:StormView,now:number};
const powers:Record<string,string>={G:'Gust',C:'Calm'};
const label=(card:string)=>powers[card]??elements[card[0] as Element]+' '+card[1];
const nameOf=(room:Room,id:string)=>room.players.find(p=>p.id===id)?.name??'A player';
const shapes:Record<string,React.ReactNode>={
 E:<path d="M12 2c1 5 7 7 7 13a7 7 0 0 1-14 0c0-3 2-5 3-7 1 2 2 3 3 3 1-3 0-6 1-9Z"/>,
 T:<path d="M2 9c4-6 6 4 10 0s6 4 10 0v4c-4 4-6-4-10 0S6 9 2 13Zm0 8c4-6 6 4 10 0s6 4 10 0v4c-4 4-6-4-10 0s-6-4-10 0Z"/>,
 D:<path d="M15 2a10 10 0 1 0 7 15A9 9 0 0 1 15 2Z"/>,
 F:<path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 3l3 3 3-3M9 21l3-3 3 3"/>,
 G:<path d="M2 8h11a3 3 0 1 0-3-3H8a5 5 0 1 1 5 5H2Zm0 4h16a4 4 0 1 1-4 4h2a2 2 0 1 0 2-2H2Zm0 4h8a3 3 0 1 1-3 3h2a1 1 0 1 0 1-1H2Z"/>,
 C:<path d="M12 7a5 5 0 0 1 5 5h5v2H2v-2h5a5 5 0 0 1 5-5ZM11 1h2v4h-2ZM3 6l1-1 3 3-1 1Zm17-1 1 1-3 3-1-1ZM5 17h14v2H5Zm4 4h6v2H9Z"/>,
};
function Face({card}:{card:string}){
 return <span className={'st-face st-'+card[0]}><svg viewBox="0 0 24 24" aria-hidden="true">{shapes[card[0]]}</svg><b>{powers[card]??card[1]}</b>{!isPower(card)&&<small>{elements[card[0] as Element]}</small>}</span>;
}
function Meter({value}:{value:number}){
 return <div className="st-meter" role="img" aria-label={'Storm '+value+' of '+stormLimit}><span>Storm</span>{Array.from({length:stormLimit},(_,i)=><i key={i} className={i<value?'on':''}/>)}</div>;
}
function news(board:StormView,room:Room):string{
 const e=board.event;
 if(!e)return 'Match an element, or play a neighbouring number.';
 const who=nameOf(room,e.by);
 if(e.hit.length)return 'The storm breaks! '+e.hit.map(id=>nameOf(room,id)).join(' & ')+(e.hit.length===1?' takes':' take')+' two cards.';
 if(e.kind==='draw')return who+' drew a card. The storm grows.';
 if(e.card==='G')return e.to?who+' blew a card over to '+nameOf(room,e.to)+'.':who+' played a Gust.';
 if(e.card==='C')return who+' calmed the storm.';
 return who+' played '+label(e.card!)+'.';
}
const left=(room:Room,now:number)=>Math.max(0,Math.ceil((room.deadline-(room.phase==='paused'?room.pausedAt:now))/1000));
export function StormTV({room,board,now}:Props){
 return <div className="st-table">
  <div className="st-center"><Meter value={board.storm}/>
   <div className="st-piles">{board.piles.map((card,i)=><div key={i} className={board.streak===i?'st-pile streak':'st-pile'}><div key={board.seq} className={board.event?.pile===i?'st-land':''}><Face card={card}/></div><small>{board.streak===i?'Streak!':'Pile '+(i+1)}</small></div>)}</div>
   <h2 aria-live="polite">{news(board,room)}</h2><p>{nameOf(room,board.turn)}’s turn · {left(room,now)}s</p></div>
  <ul className="st-seats">{board.order.map(id=>{const p=room.players.find(p=>p.id===id);return p&&<li key={id} className={board.turn===id?'active':''} style={{borderColor:p.color}}><span className="pt-avatar" style={{background:p.color}}>{p.avatar}</span><b>{p.name}</b><strong>{board.sizes[id]}<small>{board.sizes[id]===1?' card':' cards'}</small></strong></li>})}</ul>
 </div>;
}
export function StormPhone({room,board,now,id,busy,command}:Props&{id:string,busy:boolean,command:ReturnType<typeof useRoom>['command']}){
 const [slot,setSlot]=useState<number|null>(null),[give,setGive]=useState<number|null>(null);
 const hand=(board.hand??[]).map((card,i)=>({card,i})).sort((a,b)=>a.card<b.card?-1:a.card>b.card?1:a.i-b.i);
 const mine=board.turn===id,streak=board.streak!==null,card=slot===null?null:board.hand?.[slot]??null;
 const pilesFor=(c:string)=>[0,1].filter(i=>(!streak||board.streak===i)&&fits(c,board.piles[i],streak));
 const playable=(c:string)=>mine&&(isPower(c)?!streak:pilesFor(c).length>0);
 const send=(move:string,more:Record<string,unknown>={})=>command({action:'storm',move,seq:board.seq,...more});
 const gusting=card==='G'&&hand.length>1;
 function tap(i:number){
  if(gusting&&i!==slot){setGive(i);return}
  setGive(null);setSlot(i===slot?null:i);
 }
 return <div className="st-phone">
  <Meter value={board.storm}/>
  <div className="st-piles">{board.piles.map((top,i)=>{const open=mine&&!!card&&!isPower(card)&&pilesFor(card).includes(i);return <button key={i} className={'st-pile'+(open?' open':'')} aria-label={(open?'Play on ':'')+'pile '+(i+1)+', '+label(top)} disabled={!open||busy} onClick={()=>send('play',{card,pile:i})}><Face card={top}/><small>{open?'Play here':board.streak===i?'Streak!':'Pile '+(i+1)}</small></button>})}</div>
  <h2 aria-live="polite">{mine?gusting?give===null?'Pick a card to blow away':'Who gets it?':streak?'Keep the streak going?':'Your turn':nameOf(room,board.turn)+'’s turn'} <span>{left(room,now)}s</span></h2>
  {!mine&&<p>{news(board,room)}</p>}
  {gusting&&give!==null&&<div className="st-people">{board.order.filter(other=>other!==id).map(other=><button key={other} className="pt-secondary" disabled={busy} onClick={()=>send('play',{card,target:other,give:board.hand![give]})}>{nameOf(room,other)} · {board.sizes[other]}</button>)}</div>}
  {mine&&card&&isPower(card)&&!gusting&&<button className="pt-primary" disabled={busy} onClick={()=>send('play',{card})}>Play {label(card)}</button>}
  <div className="st-hand">{hand.map(({card:c,i})=><button key={i} aria-label={label(c)} aria-pressed={slot===i||give===i} disabled={busy||!mine||(!gusting&&!playable(c))} className={playable(c)?'fits':''} onClick={()=>tap(i)}><Face card={c}/></button>)}</div>
  {mine&&(streak?<button className="pt-secondary" disabled={busy} onClick={()=>send('end')}>End turn</button>:<button className="pt-secondary" disabled={busy} onClick={()=>send('draw')}>Draw a card</button>)}
 </div>;
}
