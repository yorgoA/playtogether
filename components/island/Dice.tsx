'use client';
import {useEffect,useState} from 'react';
import type {Room} from '@/lib/controller/room';
export const ROLL_MS=850;
// True until the latest roll has had time to tumble on this screen.
export function useRolling(room:Room){
 const stamp=room.island?.rolledAt??0;
 const [done,setDone]=useState(stamp);
 const left=ROLL_MS-(room.serverTime-stamp);
 const rolling=done!==stamp&&left>0;
 useEffect(()=>{if(!rolling)return;const timer=setTimeout(()=>setDone(stamp),left);return ()=>clearTimeout(timer)},[rolling,stamp]); // eslint-disable-line react-hooks/exhaustive-deps
 return rolling;
}
const pips:Record<number,number[]>={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
const turns=['','rotateX(0deg)','rotateX(-90deg)','rotateY(90deg)','rotateY(-90deg)','rotateX(90deg)','rotateY(180deg)'];
function Die({value,rolling,coral}:{value:number,rolling:boolean,coral?:boolean}){
 return <span className={'isl-die'+(coral?' coral':'')+(rolling?' rolling':'')}><span className="isl-cube" style={rolling?undefined:{transform:'rotateX(-14deg) rotateY(16deg) '+turns[value]}}>
  {[1,2,3,4,5,6].map(f=><span key={f} className={'isl-face f'+f}>{Array.from({length:9},(_,i)=><i key={i} className={pips[f].includes(i)?'on':''}/>)}</span>)}
 </span></span>;
}
export default function Dice({room}:{room:Room}){
 const b=room.island!,rolling=useRolling(room),waiting=b.phase==='roll';
 if(!b.dice.length)return null;
 const sum=b.dice[0]+b.dice[1];
 return <div className={'isl-dice'+(waiting?' waiting':'')} role="status" aria-label={rolling?'Dice rolling':(waiting?'Last roll: ':'Rolled ')+sum}>
  <Die value={b.dice[0]} rolling={rolling}/><Die value={b.dice[1]} rolling={rolling} coral/>
  <b className={!rolling&&sum===7?'seven':''}>{rolling?'…':sum}</b>{waiting&&<small>Last roll</small>}
 </div>;
}
