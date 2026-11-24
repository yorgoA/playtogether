'use client';
import {useState} from 'react';
import {portsOf,robberTile,tilesOf,edges,tiles,vertices,type Piece,type BoardView,type Resource} from '@/lib/island/board';
import type {Player} from '@/lib/controller/room';
import {resourceArt,resourceLabel} from './island/icons';
const fills={timber:'#5fa35a',grain:'#f0c658',wool:'#a5d866',clay:'#d98257',ore:'#9aa6b6',sand:'#f1dca2'};
// Tiles sit inside their hexes so the sand between them reads as the road network.
const inset=(t:(typeof tiles)[number],k:number)=>t.vs.map(v=>(t.x+(vertices[v].x-t.x)*k).toFixed(1)+','+(t.y+(vertices[v].y-t.y)*k).toFixed(1)).join(' ');
const full=tiles.map(t=>inset(t,1)),land=tiles.map(t=>inset(t,.86));
function Art({resource,x,y,size}:{resource:Resource,x:number,y:number,size:number}){
 return <g transform={`translate(${x-size/2} ${y-size/2}) scale(${size/24})`}>{resourceArt[resource].map(([d,c],i)=><path key={i} d={d} fill={c}/>)}</g>;
}
function Coast({board}:{board:BoardView}){
 return <>
  {[[46,'#2fb0cb'],[32,'#6bd9d8'],[20,'#eefbf3'],[16,'#f3dfae']].map(([width,color])=><g key={width}>{full.map((points,i)=><polygon key={i} points={points} stroke={String(color)} strokeWidth={width} strokeLinejoin="round" fill={String(color)}/>)}</g>)}
  {full.map((points,i)=><polygon key={i} points={points} fill="#ecd29b"/>)}
  {portsOf(board).map((p,i)=>{const a=vertices[p.a],b=vertices[p.b],mx=(a.x+b.x)/2,my=(a.y+b.y)/2,len=Math.hypot(mx,my),x=mx+mx/len*36,y=my+my/len*36;return <g key={i}><title>{p.kind==='any'?'General port 3:1':resourceLabel[p.kind]+' port 2:1'}</title>
   {[a,b].map((c,j)=><g key={j}><line x1={c.x} y1={c.y} x2={x} y2={y} stroke="#7d5735" strokeWidth="6"/><line x1={c.x} y1={c.y} x2={x} y2={y} stroke="#c99a63" strokeWidth="4.5" strokeDasharray="2.5 1.3"/></g>)}
   <path d={`M${x-19} ${y+9}q19 4 38 0l-7 10h-24z`} fill="#8d4f33"/><rect x={x-15} y={y-19} width="30" height="30" rx="5" fill="#fffaf0" stroke={p.kind==='any'?'#ef5b4c':'#1b8db0'} strokeWidth="1.8"/>
   <text x={x} y={y-7} textAnchor="middle" fill="#12394a" fontSize="11" fontWeight="900">{p.kind==='any'?'3:1':'2:1'}</text>
   {p.kind==='any'?<text x={x} y={y+6} textAnchor="middle" fill="#d8402f" fontSize="10" fontWeight="900">ANY</text>:<><rect x={x-11} y={y-5} width="22" height="14" rx="3" fill="#bfe0e4"/><Art resource={p.kind} x={x} y={y+2} size={13}/></>}</g>})}
 </>;
}
export default function IslandMap({board,players,piece,legal=[],pick,selected,hide}:{board:BoardView,players:Player[],piece?:Piece|'robber',legal?:number[],pick?:(n:number)=>void,selected?:number,hide?:()=>void}){
 const [zoom,setZoom]=useState(false);
 const owner=(id:string)=>players.find(p=>p.id===id)?.color||'#fff';
 const blocked=robberTile(board);
 const house=(v:number,color:string,city:boolean)=>{const p=vertices[v];return <g key={v} transform={`translate(${p.x} ${p.y})`} fill={color} stroke="#12303c" strokeWidth="2.2" strokeLinejoin="round"><path d={city?'M-12 9v-15l6-6 6 6v3h11v12z':'M-8 8v-9l8-8 8 8v9z'}/></g>};
 return <div className="isl-atlas">{hide&&<button className="isl-zoom isl-hide" onClick={hide}>Hide map</button>}{pick&&<button className="isl-zoom" aria-pressed={zoom} onClick={()=>setZoom(!zoom)}>{zoom?'Fit island':'Zoom in'}</button>}<div className="isl-pan"><svg style={{width:zoom?'175%':'100%'}} viewBox="-278 -258 556 516" aria-label="Island board" role="group">
  <Coast board={board}/>
  {tilesOf(board).map((t,i)=><g key={i}><title>{t.resource==='sand'?'Dunes':resourceLabel[t.resource]}</title><polygon points={land[i]} fill={fills[t.resource]} stroke={fills[t.resource]} strokeWidth="5" strokeLinejoin="round"/>
   {t.resource!=='sand'&&<><circle cx={t.x} cy={t.y-18} r="16" fill="#fffaf0" opacity=".72"/><Art resource={t.resource} x={t.x} y={t.y-18} size={25}/></>}
   {!!t.number&&<g transform={`translate(${t.x} ${t.y+14})`}><circle r="14.5" fill={[6,8].includes(t.number)?'#ef5b4c':'#fffaf0'} stroke="#12394a" strokeOpacity=".35" strokeWidth="1.5"/><text y="6" textAnchor="middle" fontWeight="900" fontSize="17" fill={[6,8].includes(t.number)?'#fff':'#12394a'}>{t.number}</text></g>}
   {i===blocked&&<g transform={`translate(${t.x+(t.number?21:0)} ${t.y+(t.number?2:0)})`}><title>Robber · production blocked</title><path d="M0-17v-14h12v7H0" fill="#e5484d" stroke="#12303c" strokeWidth="1.5"/><path d="M0-19L14 10h-28z" fill="#2b2533" stroke="#fff4d8" strokeWidth="1.8" strokeLinejoin="round"/><path d="M0-3L5 10H-5z" fill="#e5484d"/></g>}</g>)}
  {Object.entries(board.roads).map(([i,id])=>{const e=edges[+i],a=vertices[e.a],b=vertices[e.b],k=.17,x1=a.x+(b.x-a.x)*k,x2=b.x+(a.x-b.x)*k,y1=a.y+(b.y-a.y)*k,y2=b.y+(a.y-b.y)*k;return <g key={i}>{['#12303c',owner(id)].map((c,j)=><line key={j} x1={x1} x2={x2} y1={y1} y2={y2} stroke={c} strokeWidth={j?6:10} strokeLinecap="round"/>)}</g>})}
  {Object.entries(board.homes).map(([i,h])=>house(+i,owner(h.id),h.city))}
  {legal.map(i=>{const edge=edges[i],p=piece==='robber'?tiles[i]:piece==='road'?{x:(vertices[edge.a].x+vertices[edge.b].x)/2,y:(vertices[edge.a].y+vertices[edge.b].y)/2}:vertices[i];return <g key={i} className="isl-target" role="button" tabIndex={0} aria-label={piece+' location '+(i+1)} onClick={()=>pick?.(i)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick?.(i)}}}><circle cx={p.x} cy={p.y} r={piece==='robber'?32:18} fill="transparent"/><circle className="isl-spot" cx={p.x} cy={p.y} r={selected===i?11:7.5} fill={selected===i?'#12303c':'#fff'} stroke={selected===i?'#fff':'#12303c'} strokeWidth="2.5"/>{selected===i&&<text x={p.x} y={p.y+5} textAnchor="middle" fill="white" fontSize="14">✓</text>}</g>})}
 </svg></div></div>;
}
