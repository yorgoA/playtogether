"use client";
import {useEffect,useState} from 'react';
type Racer={id:string,progress:number,lane:number,speed:number,boostUntil:number,finishedAt:number|null};
type RaceRoom={racers?:Racer[],hazards?:{at:number,lane:number}[],players:{id:string,name:string,color:string}[],phase:string,serverTime:number};
function point(progress:number,lane:number){
 const t=-2*Math.PI*progress,rx=300+lane*30,ry=122+lane*28;
 return {x:420+Math.cos(t)*rx,y:185+Math.sin(t)*ry,angle:Math.atan2(-Math.cos(t)*ry,Math.sin(t)*rx)*180/Math.PI};
}
export default function RaceTrack({room}:{room:RaceRoom}){
 const [age,setAge]=useState(0);
 useEffect(()=>{let frame=0;const start=performance.now();function update(t:number){setAge(Math.min(.65,(t-start)/1000));frame=requestAnimationFrame(update)}frame=requestAnimationFrame(update);return()=>cancelAnimationFrame(frame)},[room.serverTime]);
 const racers=room.racers||[],leader=Math.max(0,...racers.map(r=>r.progress)),paused=room.phase==='paused';
 return <div style={{border:'1px solid #47507b',borderRadius:16,overflow:'hidden',background:'#12192e'}}><svg viewBox="0 0 840 370" style={{width:'100%',display:'block'}} aria-label="Live oval race circuit">
 <defs><pattern id="racegrid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#273050" strokeWidth="1"/></pattern><pattern id="finish" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#eeedf1"/><path d="M0 0h5v5H0zM5 5h5v5H5z" fill="#141826"/></pattern></defs>
 <rect width="840" height="370" fill="url(#racegrid)"/><ellipse cx="420" cy="185" rx="300" ry="122" fill="#171c31" stroke="#7059bf" strokeWidth="88"/><ellipse cx="420" cy="185" rx="300" ry="122" fill="none" stroke="#b095fc" strokeWidth="81" strokeDasharray="12 12"/><ellipse cx="420" cy="185" rx="300" ry="122" fill="none" stroke="#35384e" strokeWidth="72"/><ellipse cx="420" cy="185" rx="300" ry="122" fill="none" stroke="#85869d" strokeWidth="1.6" strokeDasharray="13 12"/><rect x="683" y="181" width="74" height="9" fill="url(#finish)"/>
 <text x="420" y="175" textAnchor="middle" fill="#cbf77a" fontSize="39" fontWeight="1000" fontStyle="italic">TURBO RACERS</text><text x="420" y="207" textAnchor="middle" fill="#cfcee5" fontFamily="monospace" fontSize="17">{paused?'PAUSED':'LAP '+Math.min(3,1+Math.floor(leader))+' / 3'}</text>
 {(room.hazards||[]).map(h=>{const p=point(h.at,h.lane);return <g key={h.at} transform={`translate(${p.x} ${p.y})`}><path d="M0 -8L8 7H-8Z" fill="#ff9f4e" stroke="#402c29" strokeWidth="2"/><path d="M-4 1h8" stroke="#ffeacf" strokeWidth="2"/></g>})}
 {racers.map((r,i)=>{const p=point(r.progress+(paused||r.finishedAt?0:r.speed*age),r.lane),player=room.players.find(x=>x.id===r.id);return <g key={r.id} transform={`translate(${p.x} ${p.y})`}><g transform={`rotate(${p.angle})`}><rect x="-12" y="-8" width="23" height="16" rx="4" fill="#10111a"/><rect x="-13" y="-6" width="27" height="12" rx="4" fill={player?.color||'#fff'}/><rect x="1" y="-4" width="5" height="8" rx="1.5" fill="#35384f"/>{r.boostUntil>room.serverTime&&<path d="M-13 -4L-27 0L-13 4" fill="#e9ff83"/>}</g><text y="-12" textAnchor="middle" fill="white" stroke="#10111a" strokeWidth="2.5" paintOrder="stroke" fontWeight="800" fontSize="13">{i+1}</text></g>})}</svg><div style={{display:'flex',gap:20,flexWrap:'wrap',padding:'10px 15px'}}>{racers.map((r,i)=><span key={r.id} style={{color:room.players.find(p=>p.id===r.id)?.color}}>{i+1} · {room.players.find(p=>p.id===r.id)?.name}</span>)}</div></div>
}
