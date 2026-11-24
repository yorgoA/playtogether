'use client';
import {useState} from 'react';
import type {Room} from '@/lib/controller/room';
import {robberTile,tiles,tradeRate,active,affordable,costs,locations,resources,type BoardView,type Hand,type Resource,type Piece} from '@/lib/island/board';
import IslandMap from './IslandMap';
import IslandStage from './island/IslandStage';
import Dice,{useRolling} from './island/Dice';
import {PieceIcon,ResourceIcon,resourceLabel} from './island/icons';
import './island.css';
const captions={discard:'Discard half your hand',robber:'Move the robber',steal:'Choose whom to steal from',settlement:'Place a settlement',road:'Place an adjoining road',roll:'Roll the dice',harvest:'Choose a resource',build:'Build or trade'};
const pieces=Object.keys(costs) as Piece[];
const pieceLabel:Record<Piece,string>={road:'Road',settlement:'Settlement',city:'City'};
const goal=6;
function built(b:BoardView,id:string):Record<Piece,number>{
 const homes=Object.values(b.homes).filter(h=>h.id===id);
 return {road:Object.values(b.roads).filter(r=>r===id).length,settlement:homes.filter(h=>!h.city).length,city:homes.filter(h=>h.city).length};
}
type Command=(c:Record<string,unknown>)=>Promise<boolean>;
function Cost({piece,hand}:{piece:Piece,hand?:Hand}){
 return <span className="isl-cost" aria-label={Object.entries(costs[piece]).map(([k,n])=>n+' '+k).join(', ')}>{Object.entries(costs[piece]).flatMap(([k,n])=>Array.from({length:n},(_,i)=><span key={k+i} className={hand&&hand[k as Resource]<=i?'missing':''}><ResourceIcon resource={k as Resource}/></span>))}</span>;
}
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
  <aside className="isl-seats"><p>First to {goal} points</p>{seats.map(p=>{const n=built(b,p.id);return <div key={p.id} className={'isl-seat'+(p.id===turn?' active':'')} style={{'--seat':p.color} as React.CSSProperties}>
   <span className="isl-face-chip" aria-hidden="true">{p.avatar}</span>
   <div className="isl-seat-name"><b>{p.name}</b>{p.standIn?<small>Bot playing</small>:p.id===turn?<small>Playing now</small>:null}</div>
   <strong className="isl-points" aria-label={p.score+' points'}>{p.score}<i>★</i></strong>
   <div className="isl-built">{pieces.map(k=><span key={k} aria-label={n[k]+' '+k}><PieceIcon piece={k} color={p.color}/>{n[k]}</span>)}</div>
  </div>})}</aside>
  <Dice room={room}/>
  {b.offer?<div className="isl-news isl-offer"><b>{player.name} offers</b><ResourceIcon resource={b.offer.give}/><span>{resourceLabel[b.offer.give]} for</span><ResourceIcon resource={b.offer.want}/><span>{resourceLabel[b.offer.want]}</span></div>
  :<p className="isl-news" aria-live="polite">{rolling?'Rolling the dice…':b.event}</p>}
 </section>;
}
export function IslandPhone({room,id,command,busy}:{room:Room,id:string,command:Command,busy:boolean}){
 const b=room.island!,hand=b.hand!,mine=active(b)===id;
 const [mode,setMode]=useState<Piece|'trade'|null>(null),[selected,select]=useState<number>(),[give,setGive]=useState<Resource>('timber'),[want,setWant]=useState<Resource>('grain');
 const [cards,setCards]=useState<Resource[]>([]);
 if(!hand)return <p>Connecting to your hand…</p>;
 const player=room.players.find(p=>p.id===active(b));
 const me=room.players.find(p=>p.id===id);
 const setup=b.phase==='settlement'||b.phase==='road',piece:Piece|null=mine?(setup?b.phase as Piece:mode&&mode!=='trade'?mode:null):null;
 const rate=tradeRate(b,id,give),owed=b.owed?.[id]??0,mineBuilt=built(b,id);
 const legal=piece?locations(b,id,piece):[];
 async function act(move:string,more:Record<string,unknown>={}){if(await command({action:'island',move,revision:b.revision,...more})){select(undefined);setMode(null)}}
 const change=(m:typeof mode)=>{setMode(m);select(undefined)};
 return <section className="isl-controller" style={{'--seat':player?.color} as React.CSSProperties}><small className={mine?'mine':''}>{mine?'YOUR TURN':player?.name+'’s turn'}</small><Dice room={room}/><h2>{b.phase==='discard'?(owed?'Discard '+owed+' cards':'Waiting for discards'):mine?b.offer?'Trade offer open':piece?('Place '+(piece==='road'?'a road':piece==='city'?'a city':'a settlement')):captions[b.phase]:b.offer?'Trade offer':'Watch the island'}</h2>
 {mine&&piece&&<><p>Tap a highlighted {piece==='road'?'edge':'corner'}, then confirm your placement.</p><IslandMap board={b} players={room.players} piece={piece} legal={legal} selected={selected} pick={select}/><button className="pt-primary" disabled={busy||selected===undefined||!legal.includes(selected)} onClick={()=>act('place',{piece,index:selected})}>Confirm {piece}</button>{!setup&&<button onClick={()=>change(null)}>Back</button>}</>}
 {b.phase==='discard'&&owed>0&&<><div className="isl-buttons">{resources.map(r=><button key={r} disabled={cards.length>=owed||cards.filter(k=>k===r).length>=hand[r]} onClick={()=>setCards([...cards,r])}>{r} · {cards.filter(k=>k===r).length}</button>)}<button onClick={()=>setCards([])}>Clear</button></div><button className="pt-primary" disabled={busy||cards.length!==owed} onClick={()=>act('discard',{cards})}>Discard {cards.length} / {owed}</button></>}
 {mine&&b.phase==='robber'&&<><IslandMap board={b} players={room.players} piece="robber" legal={tiles.flatMap((_,i)=>i===robberTile(b)?[]:[i])} selected={selected} pick={select}/><button className="pt-primary" disabled={busy||selected===undefined} onClick={()=>act('robber',{index:selected})}>Move robber here</button></>}
 {mine&&b.phase==='steal'&&<div className="isl-buttons">{b.victims?.map(target=><button key={target} disabled={busy} onClick={()=>act('steal',{target})}>{room.players.find(p=>p.id===target)?.name}</button>)}</div>}
 {mine&&b.phase==='roll'&&<button className="pt-primary isl-roll" disabled={busy} onClick={()=>act('roll')}>Roll dice</button>}
 {mine&&b.phase==='harvest'&&<><p>You rolled seven. Pick one resource from the island.</p><div className="isl-buttons">{resources.map(r=><button key={r} disabled={busy} onClick={()=>act('harvest',{resource:r})}>{r}</button>)}</div></>}
 {b.offer?<><p>{player?.name} offers 1 {b.offer.give} for 1 {b.offer.want}.</p>{mine?<button disabled={busy} onClick={()=>act('cancel')}>Withdraw offer</button>:<button className="pt-primary" disabled={busy||hand[b.offer.want]<1} onClick={()=>act('accept')}>Accept trade</button>}</>:mine&&b.phase==='build'&&!piece&&(mode==='trade'?<><div className="isl-trade">{(['Give','Receive'] as const).map((s,i)=><label key={s}>{s}<select value={i?want:give} onChange={e=>(i?setWant:setGive)(e.target.value as Resource)}>{resources.map(r=><option key={r}>{r}</option>)}</select></label>)}</div><div className="isl-buttons"><button disabled={busy||give===want||hand[give]<1} onClick={()=>act('offer',{give,want})}>Offer 1 for 1 to players</button><button disabled={busy||give===want||hand[give]<rate} onClick={()=>act('bank',{give,want})}>Trade {rate}:1 {rate===4?'at bank':'at port'}</button><button onClick={()=>change(null)}>Back</button></div></>:<><div className="isl-shop">{pieces.map(p=>{const paid=affordable(hand,p),spots=locations(b,id,p).length;return <button className={paid&&spots?'ready':''} disabled={busy||!paid||!spots} key={p} onClick={()=>change(p)}><PieceIcon piece={p} color={me?.color??'#fff'}/><span><b>Build {p}</b><small>{!spots?'No free spot':paid?spots+(spots===1?' spot':' spots')+' open':'Need more cards'}</small></span><Cost piece={p} hand={hand}/></button>})}</div><div className="isl-buttons"><button onClick={()=>change('trade')}>Trade resources</button><button className="pt-primary" disabled={busy} onClick={()=>act('end')}>End turn</button></div></>)}
 {!mine&&!b.offer&&b.phase!=='discard'&&<><p>{player?.name} will {captions[b.phase].toLowerCase()}.</p><div className="isl-costs" aria-label="Construction costs">{pieces.map(p=><div key={p}><PieceIcon piece={p} color={me?.color??'#fff'}/><b>{pieceLabel[p]}</b><Cost piece={p} hand={hand}/></div>)}</div></>}
 {!piece&&!(mine&&b.phase==='robber')&&<IslandMap board={b} players={room.players}/>}
 <h3>Your cards<span className="isl-mine">{pieces.map(k=><span key={k} aria-label={mineBuilt[k]+' '+k+' built'}><PieceIcon piece={k} color={me?.color??'#fff'}/>{mineBuilt[k]}</span>)}</span></h3><div className="isl-hand">{resources.map(r=><div key={r} className={'isl-card '+r+(hand[r]?'':' empty')}><ResourceIcon resource={r}/><strong>{hand[r]}</strong><small>{r}</small></div>)}</div></section>;
}
