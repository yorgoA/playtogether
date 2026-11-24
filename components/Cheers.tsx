'use client';
import {useEffect,useRef,useState} from 'react';
import {cheerEmoji} from '@/lib/quiz/rules';
import type {Room,useRoom} from '@/lib/controller/room';
import {play} from '@/lib/controller/sound';
import './podium.css';
// Emoji from the phones, floating up the TV. Each is shown once, however often the room is polled.
export function Cheers({room}:{room:Room}){
 const [shown,setShown]=useState<Room['cheers']>([]),last=useRef(room.cheers.at(-1)?.n??0);
 useEffect(()=>{
  const fresh=room.cheers.filter(c=>c.n>last.current);if(!fresh.length)return;
  last.current=fresh.at(-1)!.n;play('cheer');setShown(was=>[...was,...fresh].slice(-20));
 },[room.cheers]);
 return <div className="cheers" aria-hidden="true">{shown.map(c=><span key={c.n} style={{left:8+(c.n*29)%84+'%'}} onAnimationEnd={()=>setShown(was=>was.filter(o=>o.n!==c.n))}>{c.emoji}<small>{room.players.find(p=>p.id===c.from)?.name}</small></span>)}</div>;
}
export function CheerBar({command}:{command:ReturnType<typeof useRoom>['command']}){
 return <div className="cheer-bar" role="group" aria-label="Send a reaction to the TV">{cheerEmoji.map(e=><button key={e} aria-label={'Send '+e} onClick={()=>{navigator.vibrate?.(15);command({action:'cheer',emoji:e})}}>{e}</button>)}</div>;
}
