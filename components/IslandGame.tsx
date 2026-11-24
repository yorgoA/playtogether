'use client';
import {useEffect,useState} from 'react';
import type {Room} from '@/lib/controller/room';
import {robberTile,tiles,tradeRate,active,affordable,costs,locations,resources,type Resource,type Piece} from '@/lib/island/board';
import IslandMap from './IslandMap';
import './island.css';
const captions={discard:'Discard half your hand',robber:'Move the robber',steal:'Choose whom to steal from',settlement:'Place a settlement',road:'Place an adjoining road',roll:'Roll the dice',harvest:'Choose a resource',build:'Build or trade'};
function Dice({room}:{room:Room}){
 const b=room.island!,stamp=b.rolledAt??0;
 const [until,setUntil]=useState(()=>Date.now()+Math.max(0,850-(room.serverTime-stamp)));
 const [tick,setTick]=useState(0);
 useEffect(()=>{setUntil(Date.now()+Math.max(0,850-(room.serverTime-stamp)))},[stamp]);
 const rolling=Date.now()<until;
 useEffect(()=>{if(!rolling)return;const timer=setInterval(()=>setTick(t=>t+1),85);return ()=>clearInterval(timer)},[rolling]);
 if(!b.dice.length)return null;
 const faces=rolling?[1+tick%6,1+(tick*5+2)%6]:b.dice;
 return <div className={'sea-dice '+(rolling?'rolling':'')} role="status" aria-label={rolling?'Dice rolling':'Rolled '+b.dice.join(' and ')}>
 {faces.map((d,i)=><span key={i}>{'⚀⚁⚂⚃⚄⚅'[d-1]}</span>)}<b>{rolling?'Rolling…':b.dice[0]+b.dice[1]}</b></div>
}
const price=(piece:Piece)=>Object.entries(costs[piece]).map(([k,n])=>n+' '+k).join(' + ');
type Command=(c:Record<string,unknown>)=>Promise<boolean>;
function ConstructionCard(){
 return <section className="isl-construction" aria-label="Construction costs"><h3>Construction costs</h3>
 {(Object.keys(costs) as Piece[]).map(piece=><div className="isl-recipe" key={piece}><div><strong>{piece==='city'?'City upgrade':piece}</strong><small>{piece==='road'?'0 points':piece==='city'?'2 total':'1 point'}</small></div><p>{Object.entries(costs[piece]).map(([resource,count])=><span key={resource}><i style={{backgroundImage:'url(/art/island/'+resource+'.webp)'}}/>{count} {resource}</span>)}</p></div>)}</section>
}
export function IslandTV({room}:{room:Room}){
 const b=room.island;if(!b)return null;
 const player=room.players.find(p=>p.id===active(b))!;
 return <section className="isl-table"><div className="isl-water"><IslandMap board={b} players={room.players}/></div><aside className="isl-rail"><div className="isl-sidebar"><small>{room.phase==='paused'?'PAUSED':b.setup<2*b.order.length?'ISLAND SETUP':'CURRENT TURN'}</small><h2>{player.name}</h2><p>{captions[b.phase]}</p><Dice room={room}/><hr/><h3>Race to 6 points</h3>{room.players.map((p,i)=><div key={p.id} className="isl-score"><i style={{background:p.color}}>{i+1}</i><b>{p.name}{p.standIn?' · bot playing':''}</b><strong>{p.score}</strong></div>)}<hr/><h3>Latest move</h3><p>{b.event}</p>{b.offer&&<p>Offering {b.offer.give} for {b.offer.want}</p>}</div><ConstructionCard/></aside></section>
}
export function IslandPhone({room,id,command,busy}:{room:Room,id:string,command:Command,busy:boolean}){
 const b=room.island!,hand=b.hand!,mine=active(b)===id;
 const [mode,setMode]=useState<Piece|'trade'|null>(null),[selected,select]=useState<number>(),[give,setGive]=useState<Resource>('timber'),[want,setWant]=useState<Resource>('grain');
 const [cards,setCards]=useState<Resource[]>([]);
 if(!hand)return <p>Connecting to your hand…</p>;
 const player=room.players.find(p=>p.id===active(b));
 const setup=b.phase==='settlement'||b.phase==='road',piece:Piece|null=mine?(setup?b.phase as Piece:mode&&mode!=='trade'?mode:null):null;
 const rate=tradeRate(b,id,give),owed=b.owed?.[id]??0;
 const legal=piece?locations(b,id,piece):[];
 async function act(move:string,more:Record<string,unknown>={}){if(await command({action:'island',move,revision:b.revision,...more})){select(undefined);setMode(null)}}
 const change=(m:typeof mode)=>{setMode(m);select(undefined)};
 return <section className="isl-controller"><small>{mine?'YOUR TURN':player?.name+'’s turn'}</small><Dice room={room}/><h2>{b.phase==='discard'?(owed?'Discard '+owed+' cards':'Waiting for discards'):mine?b.offer?'Trade offer open':piece?('Place '+(piece==='road'?'a road':piece==='city'?'a city':'a settlement')):captions[b.phase]:b.offer?'Trade offer':'Watch the island'}</h2>
 {mine&&piece&&<><p>Tap a highlighted {piece==='road'?'edge':'corner'}, then confirm your placement.</p><IslandMap board={b} players={room.players} piece={piece} legal={legal} selected={selected} pick={select}/><button className="pt-primary" disabled={busy||selected===undefined||!legal.includes(selected)} onClick={()=>act('place',{piece,index:selected})}>Confirm {piece}</button>{!setup&&<button onClick={()=>change(null)}>Back</button>}</>}
 {b.phase==='discard'&&owed>0&&<><div className="isl-buttons">{resources.map(r=><button key={r} disabled={cards.length>=owed||cards.filter(k=>k===r).length>=hand[r]} onClick={()=>setCards([...cards,r])}>{r} · {cards.filter(k=>k===r).length}</button>)}<button onClick={()=>setCards([])}>Clear</button></div><button className="pt-primary" disabled={busy||cards.length!==owed} onClick={()=>act('discard',{cards})}>Discard {cards.length} / {owed}</button></>}
 {mine&&b.phase==='robber'&&<><IslandMap board={b} players={room.players} piece="robber" legal={tiles.flatMap((_,i)=>i===robberTile(b)?[]:[i])} selected={selected} pick={select}/><button className="pt-primary" disabled={busy||selected===undefined} onClick={()=>act('robber',{index:selected})}>Move robber here</button></>}
 {mine&&b.phase==='steal'&&<div className="isl-buttons">{b.victims?.map(target=><button key={target} disabled={busy} onClick={()=>act('steal',{target})}>{room.players.find(p=>p.id===target)?.name}</button>)}</div>}
 {mine&&b.phase==='roll'&&<button className="pt-primary" disabled={busy} onClick={()=>act('roll')}>Roll dice</button>}
 {mine&&b.phase==='harvest'&&<><p>You rolled seven. Pick one resource from the island.</p><div className="isl-buttons">{resources.map(r=><button key={r} disabled={busy} onClick={()=>act('harvest',{resource:r})}>{r}</button>)}</div></>}
 {b.offer?<><p>{player?.name} offers 1 {b.offer.give} for 1 {b.offer.want}.</p>{mine?<button disabled={busy} onClick={()=>act('cancel')}>Withdraw offer</button>:<button className="pt-primary" disabled={busy||hand[b.offer.want]<1} onClick={()=>act('accept')}>Accept trade</button>}</>:mine&&b.phase==='build'&&!piece&&(mode==='trade'?<><div className="isl-trade">{(['Give','Receive'] as const).map((s,i)=><label key={s}>{s}<select value={i?want:give} onChange={e=>(i?setWant:setGive)(e.target.value as Resource)}>{resources.map(r=><option key={r}>{r}</option>)}</select></label>)}</div><div className="isl-buttons"><button disabled={busy||give===want||hand[give]<1} onClick={()=>act('offer',{give,want})}>Offer 1 for 1 to players</button><button disabled={busy||give===want||hand[give]<rate} onClick={()=>act('bank',{give,want})}>Trade {rate}:1 {rate===4?'at bank':'at port'}</button><button onClick={()=>change(null)}>Back</button></div></>:<div className="isl-buttons">{(['road','settlement','city'] as const).map(p=><button disabled={busy||!affordable(hand,p)||!locations(b,id,p).length} key={p} onClick={()=>change(p)}>Build {p}<small>{price(p)}</small></button>)}<button onClick={()=>change('trade')}>Trade resources</button><button className="pt-primary" disabled={busy} onClick={()=>act('end')}>End turn</button></div>)}
 {!mine&&!b.offer&&b.phase!=='discard'&&<p>{player?.name} will {captions[b.phase].toLowerCase()}. Your hand is below.</p>}
 <h3>Your cards</h3><div className="isl-hand">{resources.map(r=><div key={r} className={'isl-card '+r}><span className="resource-sample" style={{backgroundImage:'url(/art/island/'+r+'.webp)'}} aria-hidden="true"/><strong>{hand[r]}</strong><small>{r}</small></div>)}</div></section>
}
