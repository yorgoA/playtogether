'use client';
import {useState} from 'react';
import type {Room} from '@/lib/controller/room';
import {robberTile,tiles,tradeRate,active,affordable,costs,locations,piecesBuilt,piecesLeft,resources,type Hand,type Resource,type Piece} from '@/lib/island/board';
import IslandMap from './IslandMap';
import IslandStage from './island/IslandStage';
import Dice,{useRolling} from './island/Dice';
import {PieceIcon,ResourceIcon,resourceLabel} from './island/icons';
import './island.css';
const captions={discard:'Discard half your hand',robber:'Move the robber',steal:'Choose whom to steal from',settlement:'Place a settlement',road:'Place an adjoining road',roll:'Roll the dice',harvest:'Choose a resource',build:'Build or trade'};
const pieces=Object.keys(costs) as Piece[];
const pieceLabel:Record<Piece,string>={road:'Road',settlement:'Settlement',city:'City'};
const goal=6;
type Command=(c:Record<string,unknown>)=>Promise<boolean>;
function Cost({piece,hand}:{piece:Piece,hand?:Hand}){
 return <span className="isl-cost" aria-label={Object.entries(costs[piece]).map(([k,n])=>n+' '+resourceLabel[k as Resource]).join(', ')}>{Object.entries(costs[piece]).flatMap(([k,n])=>Array.from({length:n},(_,i)=><span key={k+i} className={hand&&hand[k as Resource]<=i?'missing':''}><ResourceIcon resource={k as Resource}/></span>))}</span>;
}
function HandSize({n}:{n:number}){
 return <span className="isl-cards" aria-label={n+(n===1?' card':' cards')}><i/>{n}</span>;
}
function ConstructionCard(){
 return <section className="isl-construction" aria-label="Construction costs"><h3>Construction costs</h3>{pieces.map(p=><div key={p}><PieceIcon piece={p} color="#ffb04a"/><b>{pieceLabel[p]}</b><small>{p==='road'?'0 pts':p==='city'?'2 pts':'1 pt'}</small><Cost piece={p}/></div>)}
  <p>{resources.map(r=><span key={r}><ResourceIcon resource={r}/>{resourceLabel[r]}</span>)}</p></section>;
}
// Big tappable resource tiles, used for trading, discarding and harvesting.
function Pick({label,note,disabled,chosen,choose}:{label:string,note?:(r:Resource)=>string|number,disabled?:(r:Resource)=>boolean,chosen?:Resource,choose:(r:Resource)=>void}){
 return <div className="isl-pick" role="group" aria-label={label}>{resources.map(r=><button key={r} aria-pressed={chosen===undefined?undefined:chosen===r} disabled={disabled?.(r)} onClick={()=>choose(r)}><ResourceIcon resource={r}/><b>{resourceLabel[r]}</b>{note&&<small>{note(r)}</small>}</button>)}</div>;
}
const mapKey='playtogether.islandMap';
export function IslandTV({room}:{room:Room}){
 const rolling=useRolling(room);
 const b=room.island;if(!b)return null;
 const turn=active(b),player=room.players.find(p=>p.id===turn)!;
 const seats=b.order.flatMap(id=>room.players.filter(p=>p.id===id));
 const owing=b.phase==='discard'?seats.filter(p=>b.owed?.[p.id]).map(p=>p.name):[];
 const setup=b.setup<2*b.order.length;
 return <section className="isl-table">
  <div className="isl-stage"><IslandStage board={b} players={room.players} settled={!rolling}/></div>
  <div className="isl-banner" role="status" style={{'--seat':player.color} as React.CSSProperties}>
   <span className="isl-face-chip" aria-hidden="true">{player.avatar}</span>
   <div><strong>{room.phase==='paused'?'Game paused':player.name+(player.name.endsWith('s')?'’ turn':'’s turn')}</strong><span>{room.phase==='paused'?'Resume when everyone is ready':owing.length?'Waiting for '+owing.join(', ')+' to discard':b.offer?'Trade offer open':captions[b.phase]}{setup&&room.phase!=='paused'?' · setup':''}</span></div>
  </div>
  <aside className="isl-seats"><p>First to {goal} points</p>{seats.map(p=>{const n=piecesBuilt(b,p.id);return <div key={p.id} className={'isl-seat'+(p.id===turn?' active':'')} style={{'--seat':p.color} as React.CSSProperties}>
   <span className="isl-face-chip" aria-hidden="true">{p.avatar}</span>
   <div className="isl-seat-name"><b>{p.name}</b>{p.standIn?<small>Bot playing</small>:p.id===turn?<small>Playing now</small>:null}</div>
   <strong className="isl-points" aria-label={p.score+' points'}>{p.score}<i>★</i></strong>
   <div className="isl-built">{pieces.map(k=><span key={k} aria-label={n[k]+' '+k}><PieceIcon piece={k} color={p.color}/>{n[k]}</span>)}{b.handSizes&&<HandSize n={b.handSizes[p.id]??0}/>}</div>
  </div>})}</aside>
  <ConstructionCard/>
  <Dice room={room}/>
  {b.offer?<div className="isl-news isl-offer"><b>{player.name} offers</b><ResourceIcon resource={b.offer.give}/><span>{resourceLabel[b.offer.give]} for</span><ResourceIcon resource={b.offer.want}/><span>{resourceLabel[b.offer.want]}</span></div>
  :<p className="isl-news" aria-live="polite">{rolling?'Rolling the dice…':b.event}</p>}
 </section>;
}
export function IslandPhone({room,id,command,busy}:{room:Room,id:string,command:Command,busy:boolean}){
 const b=room.island!,hand=b.hand!,mine=active(b)===id;
 const [mode,setMode]=useState<Piece|'trade'|null>(null),[selected,select]=useState<number>(),[give,setGive]=useState<Resource>('timber'),[want,setWant]=useState<Resource>('grain');
 const [cards,setCards]=useState<Resource[]>([]);
 const [map,setMap]=useState(()=>localStorage.getItem(mapKey)==='1');
 const showMap=(on:boolean)=>{localStorage.setItem(mapKey,on?'1':'0');setMap(on)};
 if(!hand)return <p>Connecting to your hand…</p>;
 const player=room.players.find(p=>p.id===active(b));
 const me=room.players.find(p=>p.id===id);
 const setup=b.phase==='settlement'||b.phase==='road',piece:Piece|null=mine?(setup?b.phase as Piece:mode&&mode!=='trade'?mode:null):null;
 const rate=tradeRate(b,id,give),owed=b.owed?.[id]??0,left=piecesLeft(b,id);
 const trading=mine&&b.phase==='build'&&mode==='trade';
 const placing=!!piece||(mine&&b.phase==='robber');
 const legal=piece?locations(b,id,piece):[];
 async function act(move:string,more:Record<string,unknown>={}){if(await command({action:'island',move,revision:b.revision,...more})){select(undefined);setMode(null)}}
 const change=(m:typeof mode)=>{setMode(m);select(undefined)};
 return <section className={'isl-controller'+(placing||(map&&!trading)?'':' roomy')} style={{'--seat':player?.color} as React.CSSProperties}><small className={mine?'mine':''}>{mine?'YOUR TURN':player?.name+'’s turn'}</small><Dice room={room}/><h2>{b.phase==='discard'?(owed?'Discard '+owed+' cards':'Waiting for discards'):mine?b.offer?'Trade offer open':piece?('Place '+(piece==='road'?'a road':piece==='city'?'a city':'a settlement')):captions[b.phase]:b.offer?'Trade offer':'Watch the island'}</h2>
 {mine&&piece&&<><p>Tap a highlighted {piece==='road'?'edge':'corner'}, then confirm your placement.</p><IslandMap board={b} players={room.players} piece={piece} legal={legal} selected={selected} pick={select}/><button className="pt-primary" disabled={busy||selected===undefined||!legal.includes(selected)} onClick={()=>act('place',{piece,index:selected})}>Confirm {piece}</button>{!setup&&<button onClick={()=>change(null)}>Back</button>}</>}
 {b.phase==='discard'&&owed>0&&<><Pick label="Cards to discard" note={r=>'−'+cards.filter(k=>k===r).length+' of '+hand[r]} disabled={r=>cards.length>=owed||cards.filter(k=>k===r).length>=hand[r]} choose={r=>setCards([...cards,r])}/><button onClick={()=>setCards([])}>Clear</button><button className="pt-primary" disabled={busy||cards.length!==owed} onClick={()=>act('discard',{cards})}>Discard {cards.length} / {owed}</button></>}
 {mine&&b.phase==='robber'&&<><IslandMap board={b} players={room.players} piece="robber" legal={tiles.flatMap((_,i)=>i===robberTile(b)?[]:[i])} selected={selected} pick={select}/><button className="pt-primary" disabled={busy||selected===undefined} onClick={()=>act('robber',{index:selected})}>Move robber here</button></>}
 {mine&&b.phase==='steal'&&<div className="isl-buttons">{b.victims?.map(target=><button key={target} disabled={busy} onClick={()=>act('steal',{target})}>{room.players.find(p=>p.id===target)?.name}</button>)}</div>}
 {mine&&b.phase==='roll'&&<button className="pt-primary isl-roll" disabled={busy} onClick={()=>act('roll')}>Roll dice</button>}
 {mine&&b.phase==='harvest'&&<><p>You rolled seven. Pick one resource from the island.</p><Pick label="Resource to collect" disabled={()=>busy} choose={r=>act('harvest',{resource:r})}/></>}
 {b.offer?<><div className="isl-deal"><p>{mine?'You give':player?.name+' gives'}<ResourceIcon resource={b.offer.give}/><b>1 {resourceLabel[b.offer.give]}</b></p><p>{mine?'You want':player?.name+' wants'}<ResourceIcon resource={b.offer.want}/><b>1 {resourceLabel[b.offer.want]}</b></p></div>{mine?<button disabled={busy} onClick={()=>act('cancel')}>Withdraw offer</button>:<button className="pt-primary" disabled={busy||hand[b.offer.want]<1} onClick={()=>act('accept')}>Accept trade</button>}</>:mine&&b.phase==='build'&&!piece&&(mode==='trade'?<><div className="isl-trade"><h4>You give</h4><Pick label="You give" chosen={give} choose={setGive} note={r=>'have '+hand[r]} disabled={r=>hand[r]<1}/><h4>You get</h4><Pick label="You get" chosen={want} choose={setWant} disabled={r=>r===give}/></div><div className="isl-buttons"><button disabled={busy||give===want||hand[give]<1} onClick={()=>act('offer',{give,want})}>Offer 1 for 1 to players</button><button disabled={busy||give===want||hand[give]<rate} onClick={()=>act('bank',{give,want})}>Trade {rate}:1 {rate===4?'at bank':'at port'}</button><button onClick={()=>change(null)}>Back</button></div></>:<><div className="isl-shop">{pieces.map(p=>{const paid=affordable(hand,p),spots=locations(b,id,p).length;return <button className={paid&&spots?'ready':''} disabled={busy||!paid||!spots} key={p} onClick={()=>change(p)}><PieceIcon piece={p} color={me?.color??'#fff'}/><span><b>Build {p}</b><small>{left[p]+' left'}{!left[p]?'':' · '+(!spots?'no free spot':paid?spots+(spots===1?' spot':' spots')+' open':'need more cards')}</small></span><Cost piece={p} hand={hand}/></button>})}</div><div className="isl-buttons"><button onClick={()=>{if(hand[give]<1){const first=resources.find(r=>hand[r]>0);if(first)setGive(first)}change('trade')}}>Trade resources</button><button className="pt-primary" disabled={busy} onClick={()=>act('end')}>End turn</button></div></>)}
 {!mine&&!b.offer&&b.phase!=='discard'&&<><p>{player?.name} will {captions[b.phase].toLowerCase()}.</p><div className="isl-costs" aria-label="Construction costs">{pieces.map(p=><div key={p}><PieceIcon piece={p} color={me?.color??'#fff'}/><b>{pieceLabel[p]} <small>{left[p]} left</small></b><Cost piece={p} hand={hand}/></div>)}</div></>}
 {!placing&&!trading&&(map?<IslandMap board={b} players={room.players} hide={()=>showMap(false)}/>:<button className="isl-show-map" onClick={()=>showMap(true)}>Show map</button>)}
 {b.handSizes&&<div className="isl-rivals" aria-label="Cards held by other players">{room.players.filter(p=>p.id!==id&&b.order.includes(p.id)).map(p=><span key={p.id} style={{borderColor:p.color}}><b>{p.name}</b><HandSize n={b.handSizes![p.id]??0}/></span>)}</div>}
 <h3>Your cards<span className="isl-mine">{pieces.map(k=><span key={k} aria-label={left[k]+' '+k+' left'}><PieceIcon piece={k} color={me?.color??'#fff'}/>{left[k]}</span>)}<em>left</em></span></h3><div className="isl-hand">{resources.map(r=><div key={r} className={'isl-card '+r+(hand[r]?'':' empty')}><ResourceIcon resource={r}/><strong>{hand[r]}</strong><small>{resourceLabel[r]}</small></div>)}</div></section>;
}
