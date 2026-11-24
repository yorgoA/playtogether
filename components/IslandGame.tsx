'use client';
import {useState} from 'react';
import type {Room} from '@/lib/controller/room';
import {affordsDev,covers,toHand,devCards,devCost,goal,playable,roadLength,secretPoints,robberTile,tiles,tradeRate,active,affordable,costs,locations,piecesBuilt,piecesLeft,resources,type DevCard,type Hand,type Resource,type Piece} from '@/lib/island/board';
import IslandMap from './IslandMap';
import IslandStage from './island/IslandStage';
import Dice,{useRolling} from './island/Dice';
import {DevIcon,devLabel,devText,PieceIcon,ResourceIcon,resourceLabel} from './island/icons';
import './island.css';
const captions={order:'Roll to see who starts',discard:'Discard half your hand',robber:'Move the robber',steal:'Choose whom to steal from',settlement:'Place a settlement',road:'Place an adjoining road',roll:'Roll the dice',harvest:'Choose a resource',build:'Build or trade'};
const pieces=Object.keys(costs) as Piece[];
const pieceLabel:Record<Piece,string>={road:'Road',settlement:'Settlement',city:'City'};
type Command=(c:Record<string,unknown>)=>Promise<boolean>;
function Cost({piece,hand}:{piece:Piece|'dev',hand?:Hand}){
 const price:Partial<Hand>=piece==='dev'?devCost:costs[piece];
 return <span className="isl-cost" aria-label={Object.entries(price).map(([k,n])=>n+' '+resourceLabel[k as Resource]).join(', ')}>{Object.entries(price).flatMap(([k,n])=>Array.from({length:n},(_,i)=><span key={k+i} className={hand&&hand[k as Resource]<=i?'missing':''}><ResourceIcon resource={k as Resource}/></span>))}</span>;
}
function HandSize({n}:{n:number}){
 return <span className="isl-cards" aria-label={n+(n===1?' card':' cards')}><i/>{n}</span>;
}
function Stat({label,best,children}:{label:string,best?:boolean,children:React.ReactNode}){
 return <span className={'isl-stat'+(best?' best':'')} aria-label={label+(best?', plus 2 points':'')} title={label}>{children}</span>;
}
function Bundle({cards}:{cards:Hand}){
 return <span className="isl-bundle">{resources.filter(r=>cards[r]).map(r=><span key={r} aria-label={cards[r]+' '+resourceLabel[r]}><ResourceIcon resource={r}/><b>{cards[r]} {resourceLabel[r]}</b></span>)}</span>;
}
function ConstructionCard({deckLeft}:{deckLeft?:number}){
 return <section className="isl-construction" aria-label="Construction costs"><h3>Construction costs</h3>{pieces.map(p=><div key={p}><PieceIcon piece={p} color="#ffb04a"/><b>{pieceLabel[p]}</b><Cost piece={p}/></div>)}<div><DevIcon kind="victory"/><b>Development{deckLeft!==undefined&&<small>{deckLeft} left</small>}</b><Cost piece="dev"/></div>
  <p>{resources.map(r=><span key={r}><ResourceIcon resource={r}/>{resourceLabel[r]}</span>)}</p></section>;
}
// Big tappable resource tiles, used for trading, discarding and harvesting.
function Pick({label,note,disabled,chosen,count,choose}:{label:string,count?:(r:Resource)=>number,note?:(r:Resource)=>string|number,disabled?:(r:Resource)=>boolean,chosen?:Resource,choose:(r:Resource)=>void}){
 return <div className="isl-pick" role="group" aria-label={label}>{resources.map(r=><button key={r} aria-pressed={count?count(r)>0:chosen===undefined?undefined:chosen===r} disabled={disabled?.(r)} onClick={()=>choose(r)}><ResourceIcon resource={r}/><b>{resourceLabel[r]}</b>{note&&<small>{note(r)}</small>}</button>)}</div>;
}
function DevPanel({kind,empty,why,busy,play,close}:{kind:DevCard,empty:Resource[],why:string,busy:boolean,play:(more:Record<string,unknown>)=>void,close:()=>void}){
 const [picked,setPicked]=useState<Resource[]>([]);
 const need=kind==='bounty'?2:kind==='monopoly'?1:0;
 return <section className="isl-dev-panel"><div><DevIcon kind={kind}/><h4>{devLabel[kind]}</h4></div><p>{devText[kind]}</p>
  {need>0&&!why&&<Pick label="Choose resources" disabled={r=>kind==='bounty'&&empty.includes(r)} chosen={need===1?picked[0]:undefined} note={need===2?r=>'+'+picked.filter(k=>k===r).length:undefined} choose={r=>setPicked(need===1?[r]:[...picked,r].slice(-need))}/>}
  {why&&<p><b>{why}</b></p>}
  <div className="isl-buttons"><button onClick={close}>Back</button>{kind!=='victory'&&<button className="pt-primary" disabled={busy||!!why||picked.length<need} onClick={()=>play(kind==='bounty'?{cards:picked}:kind==='monopoly'?{resource:picked[0]}:{})}>Play card</button>}</div></section>;
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
   <div><strong>{room.phase==='paused'?'Game paused':player.name+(player.name.endsWith('s')?'’ turn':'’s turn')}</strong><span>{room.phase==='paused'?'Resume when everyone is ready':owing.length?'Waiting for '+owing.join(', ')+' to discard':b.freeRoads?'Place '+b.freeRoads+' free road'+(b.freeRoads===1?'':'s'):b.offer?'Trade offer open':captions[b.phase]}{setup&&b.phase!=='order'&&room.phase!=='paused'?' · setup':''}</span></div>
  </div>
  <aside className="isl-seats"><p>First to {goal} points</p>{seats.map(p=>{const n=piecesBuilt(b,p.id);return <div key={p.id} className={'isl-seat'+(p.id===turn?' active':'')} style={{'--seat':p.color} as React.CSSProperties}>
   <span className="isl-face-chip" aria-hidden="true">{p.avatar}</span>
   <div className="isl-seat-name"><b>{p.name}</b>{p.standIn?<small>Bot playing</small>:p.id===turn?<small>Playing now</small>:null}{b.longestRoad===p.id&&<small className="isl-award">Longest road +2</small>}{b.strongestArmy===p.id&&<small className="isl-award">Strongest army +2</small>}</div>
   <strong className="isl-points" aria-label={p.score+' points'}>{p.score}<i>★</i></strong>
   {setup&&b.orderRolls?.[p.id]&&<p className="isl-order-roll">Rolled <b>{b.orderRolls[p.id].join(', then ')}</b></p>}
   <div className="isl-built"><Stat label={n.settlement+' settlements'}><PieceIcon piece="settlement" color={p.color}/>{n.settlement}</Stat><Stat label={n.city+' cities'}><PieceIcon piece="city" color={p.color}/>{n.city}</Stat><Stat label={'Longest road '+roadLength(b,p.id)} best={b.longestRoad===p.id}><PieceIcon piece="road" color={p.color}/>{roadLength(b,p.id)}</Stat><Stat label={(b.knights?.[p.id]??0)+' knights played'} best={b.strongestArmy===p.id}><DevIcon kind="knight"/>{b.knights?.[p.id]??0}</Stat>{b.handSizes&&<HandSize n={b.handSizes[p.id]??0}/>}<Stat label={(b.devSizes?.[p.id]??0)+' development cards'}><i className="isl-devback"/>{b.devSizes?.[p.id]??0}</Stat></div>
  </div>})}</aside>
  <ConstructionCard deckLeft={b.deckLeft}/>
  <Dice room={room}/>
  {b.offer?<div className="isl-news isl-offer"><b>{player.name} offers</b><Bundle cards={b.offer.give}/><span>for</span><Bundle cards={b.offer.want}/></div>
  :<p className="isl-news" aria-live="polite">{rolling?'Rolling the dice…':b.event}</p>}
 </section>;
}
export function IslandPhone({room,id,command,busy}:{room:Room,id:string,command:Command,busy:boolean}){
 const b=room.island!,hand=b.hand!,mine=active(b)===id;
 const [mode,setMode]=useState<Piece|'trade'|null>(null),[selected,select]=useState<number>(),[giving,setGiving]=useState<Resource[]>([]),[wanting,setWanting]=useState<Resource[]>([]);
 const [dev,setDev]=useState<DevCard|null>(null);
 const [cards,setCards]=useState<Resource[]>([]);
 const [map,setMap]=useState(()=>localStorage.getItem(mapKey)==='1');
 const showMap=(on:boolean)=>{localStorage.setItem(mapKey,on?'1':'0');setMap(on)};
 if(!hand)return <p>Connecting to your hand…</p>;
 const player=room.players.find(p=>p.id===active(b));
 const me=room.players.find(p=>p.id===id);
 const setup=b.phase==='settlement'||b.phase==='road',piece:Piece|null=mine?(setup?b.phase as Piece:b.freeRoads?'road':mode&&mode!=='trade'?mode:null):null;
 const give=toHand(giving),want=toHand(wanting),single=giving.length>0&&give[giving[0]]===giving.length?giving[0]:null,rate=single?tradeRate(b,id,single):4,owed=b.owed?.[id]??0,held=b.devHand??[],left=piecesLeft(b,id);
 const trading=mine&&b.phase==='build'&&mode==='trade';
 const panel=dev&&held.some(c=>c.kind===dev)&&b.phase!=='discard'?dev:null;
 const reading=!!panel&&!b.offer&&!(mine&&(piece||b.phase==='robber'||b.phase==='steal'));
 const placing=!!piece||(mine&&b.phase==='robber');
 const legal=piece?locations(b,id,piece):[];
 async function act(move:string,more:Record<string,unknown>={}){if(await command({action:'island',move,revision:b.revision,...more})){select(undefined);setMode(null)}}
 const change=(m:typeof mode)=>{setMode(m);select(undefined)};
 return <section className={'isl-controller'+(placing||(map&&!trading&&!reading)?'':' roomy')} style={{'--seat':player?.color} as React.CSSProperties}><small className={mine?'mine':''}>{mine?'YOUR TURN':player?.name+'’s turn'}</small><Dice room={room}/><h2>{b.phase==='discard'?(owed?'Discard '+owed+' cards':'Waiting for discards'):mine?b.offer?'Trade offer open':piece?('Place '+(piece==='road'?'a road':piece==='city'?'a city':'a settlement')):captions[b.phase]:b.offer?'Trade offer':'Watch the island'}</h2>
 {mine&&piece&&<><p>Tap a highlighted {piece==='road'?'edge':'corner'}, then confirm your placement.</p><IslandMap board={b} players={room.players} piece={piece} legal={legal} selected={selected} pick={select}/><button className="pt-primary" disabled={busy||selected===undefined||!legal.includes(selected)} onClick={()=>act('place',{piece,index:selected})}>Confirm {piece}</button>{!setup&&(b.freeRoads?<button disabled={busy} onClick={()=>act('skipRoads')}>Skip the rest ({b.freeRoads} free)</button>:<button onClick={()=>change(null)}>Back</button>)}</>}
 {b.phase==='discard'&&owed>0&&<><Pick label="Cards to discard" note={r=>'−'+cards.filter(k=>k===r).length+' of '+hand[r]} disabled={r=>cards.length>=owed||cards.filter(k=>k===r).length>=hand[r]} choose={r=>setCards([...cards,r])}/><button onClick={()=>setCards([])}>Clear</button><button className="pt-primary" disabled={busy||cards.length!==owed} onClick={()=>act('discard',{cards})}>Discard {cards.length} / {owed}</button></>}
 {mine&&b.phase==='robber'&&<><IslandMap board={b} players={room.players} piece="robber" legal={tiles.flatMap((_,i)=>i===robberTile(b)?[]:[i])} selected={selected} pick={select}/><button className="pt-primary" disabled={busy||selected===undefined} onClick={()=>act('robber',{index:selected})}>Move robber here</button></>}
 {mine&&b.phase==='steal'&&<div className="isl-buttons">{b.victims?.map(target=><button key={target} disabled={busy} onClick={()=>act('steal',{target})}>{room.players.find(p=>p.id===target)?.name}</button>)}</div>}
 {mine&&!reading&&!b.freeRoads&&(b.phase==='roll'||b.phase==='order')&&<button className="pt-primary isl-roll" disabled={busy} onClick={()=>act('roll')}>Roll dice</button>}
 {mine&&b.phase==='harvest'&&<><p>You rolled seven. Pick one resource from the island.</p><Pick label="Resource to collect" disabled={()=>busy} choose={r=>act('harvest',{resource:r})}/></>}
 {b.offer?<><div className="isl-deal"><div><span>{mine?'You give':player?.name+' gives'}</span><Bundle cards={b.offer.give}/></div><div><span>{mine?'You want':player?.name+' wants'}</span><Bundle cards={b.offer.want}/></div></div>{mine?<button disabled={busy} onClick={()=>act('cancel')}>Withdraw offer</button>:<button className="pt-primary" disabled={busy||!covers(hand,b.offer.want)} onClick={()=>act('accept')}>Accept trade</button>}</>:mine&&b.phase==='build'&&!piece&&!reading&&(mode==='trade'?<><div className="isl-trade"><h4>You give{giving.length>0&&<button onClick={()=>setGiving([])}>Clear</button>}</h4><Pick label="You give" count={r=>give[r]} choose={r=>setGiving([...giving,r])} note={r=>give[r]+' of '+hand[r]} disabled={r=>give[r]>=hand[r]||want[r]>0}/><h4>You get{wanting.length>0&&<button onClick={()=>setWanting([])}>Clear</button>}</h4><Pick label="You get" count={r=>want[r]} note={r=>'×'+want[r]} choose={r=>setWanting([...wanting,r])} disabled={r=>give[r]>0||wanting.length>=19}/><p className="isl-hint">{single?resourceLabel[single]+' trades '+rate+':1 with the bank.':'Tap a card once for each one you want to trade.'}</p></div><div className="isl-buttons"><button disabled={busy||!giving.length||!wanting.length} onClick={()=>act('offer',{giveCards:giving,wantCards:wanting})}>Offer to players</button><button disabled={busy||!single||giving.length!==rate||wanting.length!==1||!!b.bankEmpty?.includes(wanting[0])} onClick={()=>act('bank',{give:single,want:wanting[0]})}>{b.bankEmpty?.includes(wanting[0])?'Bank has no '+resourceLabel[wanting[0]]:'Trade '+rate+':1 '+(rate===4?'with bank':'at port')}</button><button onClick={()=>change(null)}>Back</button></div></>:<><div className="isl-shop">{pieces.map(p=>{const paid=affordable(hand,p),spots=locations(b,id,p).length;return <button className={paid&&spots?'ready':''} disabled={busy||!paid||!spots} key={p} onClick={()=>change(p)}><PieceIcon piece={p} color={me?.color??'#fff'}/><span><b>Build {p}</b><small>{left[p]+' left'}{!left[p]?'':' · '+(!spots?'no free spot':paid?spots+(spots===1?' spot':' spots')+' open':'need more cards')}</small></span><Cost piece={p} hand={hand}/></button>})}<button className={affordsDev(hand)&&b.deckLeft?'ready':''} disabled={busy||!affordsDev(hand)||!b.deckLeft} onClick={()=>act('buyDev')}><DevIcon kind="victory"/><span><b>Buy card</b><small>{!b.deckLeft?'No development cards left':'Development · '+b.deckLeft+' left'+(affordsDev(hand)?'':' · need more cards')}</small></span><Cost piece="dev" hand={hand}/></button></div><div className="isl-buttons"><button onClick={()=>{setGiving([]);setWanting([]);change('trade')}}>Trade resources</button><button className="pt-primary" disabled={busy} onClick={()=>act('end')}>End turn</button></div></>)}
 {!mine&&!reading&&!b.offer&&b.phase!=='discard'&&<><p>{b.phase==='order'?player?.name+' is rolling for turn order.':player?.name+' will '+captions[b.phase].toLowerCase()+'.'}</p><div className="isl-costs" aria-label="Construction costs">{pieces.map(p=><div key={p}><PieceIcon piece={p} color={me?.color??'#fff'}/><b>{pieceLabel[p]} <small>{left[p]} left</small></b><Cost piece={p} hand={hand}/></div>)}</div></>}
 {b.phase==='order'&&<div className="isl-rivals" aria-label="Turn order rolls">{b.order.map(pid=>{const p=room.players.find(x=>x.id===pid);return p&&<span key={pid} style={{borderColor:p.color}}><b>{p.name}</b><span>{b.orderRolls?.[pid]?.join(', ')??'–'}</span></span>})}</div>}
 {reading&&panel&&<DevPanel key={panel} kind={panel} empty={b.bankEmpty??[]} busy={busy} why={playable(b,id,held,panel)?'':panel==='victory'?'':!mine?'You can play it on your turn.':b.devPlayed?'You already played a card this turn.':b.phase!=='roll'&&b.phase!=='build'?'Finish the current step first.':held.some(c=>c.kind===panel&&!c.fresh)?'There is nowhere to place a road.':'You bought it this turn. Play it from your next turn.'} close={()=>setDev(null)} play={async more=>{if(await command({action:'island',move:'playDev',revision:b.revision,card:panel,...more}))setDev(null)}}/>}
 {!placing&&!trading&&!reading&&(map?<IslandMap board={b} players={room.players} hide={()=>showMap(false)}/>:<button className="isl-show-map" onClick={()=>showMap(true)}>Show map</button>)}
 {b.handSizes&&!trading&&b.phase!=='order'&&<div className="isl-rivals" aria-label="Cards held by other players">{room.players.filter(p=>p.id!==id&&b.order.includes(p.id)).map(p=><span key={p.id} style={{borderColor:p.color}}><b>{p.name}</b><HandSize n={b.handSizes![p.id]??0}/></span>)}</div>}
 {!placing&&!trading&&held.length>0&&<div className="isl-devs" aria-label="Your development cards">{devCards.filter(k=>held.some(c=>c.kind===k)).map(k=>{const n=held.filter(c=>c.kind===k).length;return <button key={k} className={k==='victory'||playable(b,id,held,k)?'ready':''} aria-pressed={dev===k} onClick={()=>{change(null);setDev(dev===k?null:k)}}><DevIcon kind={k}/><b>{devLabel[k]}{n>1?' ×'+n:''}</b></button>})}</div>}
 <h3>Your cards{secretPoints(held)>0&&<small className="isl-secret">+{secretPoints(held)} secret {secretPoints(held)===1?'point':'points'}</small>}<span className="isl-mine">{pieces.map(k=><span key={k} aria-label={left[k]+' '+k+' left'}><PieceIcon piece={k} color={me?.color??'#fff'}/>{left[k]}</span>)}<em>left</em></span></h3><div className="isl-hand">{resources.map(r=><div key={r} className={'isl-card '+r+(hand[r]?'':' empty')}><ResourceIcon resource={r}/><strong>{hand[r]}</strong><small>{resourceLabel[r]}</small></div>)}</div></section>;
}
