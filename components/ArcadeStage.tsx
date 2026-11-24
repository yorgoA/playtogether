"use client";
import {useEffect,useRef,useState} from 'react';
import type {Room} from '@/lib/controller/room';
import RaceTrack from './RaceTrack';
export default function ArcadeStage({room,go}:{room:Room,go:boolean}){
 const mount=useRef<HTMLDivElement>(null),state=useRef({room,received:0}),[failed,setFailed]=useState(false);
 if(state.current.room!==room || !state.current.received)state.current={room,received:performance.now()};
 useEffect(()=>{let active=true,game:ReturnType<typeof import('@/lib/arcade/engine').launch>|undefined;
  setFailed(false);
  import('@/lib/arcade/engine').then(({launch})=>{if(active&&mount.current)game=launch(mount.current,()=>state.current)}).catch(()=>{if(active)setFailed(true)});
  return()=>{active=false;game?.destroy(true)};
 },[room.code,room.game]);
 const quiz=room.game==='quiz',race=room.game==='turbo',paused=room.phase==='paused';
 if(failed&&race)return <RaceTrack room={room}/>;
 const fastest=[...room.players].filter(p=>p.reactionMs!=null).sort((a,b)=>a.reactionMs!-b.reactionMs!)[0];
 return <><div className={'arc-stage arc-'+room.game}>
 <div className="arc-canvas" ref={mount} aria-hidden="true"/>
 {race?<div className="arc-race-title">Pinecrest Raceway <b>LAP {Math.min(3,Math.floor(Math.max(0,...room.racers.map(c=>c.progress)))+1)} / 3</b></div>
 :quiz?<div className="arc-question"><strong>{room.revealing?'ANSWER REVEAL':'QUIZ VOLT'}</strong><h2>{room.question?.text}</h2><div className="arc-options">{room.question?.options.map((o,i)=><div key={i} className={room.revealing?(room.correct===i?'right':'dim'):''}><b>{'ABCD'[i]}</b>{o}</div>)}</div></div>
 :<h2 className={'arc-signal '+(go?'go':'')}>{room.revealing?(fastest?fastest.name+' · '+fastest.reactionMs+' ms':'Time’s up'):go?'LAUNCH!':'HOLD…'}</h2>}
 {paused&&<div className="arc-paused">Paused</div>}</div>
 <div className="arc-standings">{[...room.players].sort((a,b)=>b.score-a.score).map((p,i)=><span key={p.id}><i style={{background:p.color}}/>{race?(i+1)+'. ':''}{p.name} <b>{race?(room.racers.find(c=>c.id===p.id)?.finishedAt?'Finished':Math.floor((room.racers.find(c=>c.id===p.id)?.progress??0)*100/3)+'%'):room.game==='reaction'&&p.early?'Too soon':room.game==='reaction'&&p.reactionMs!=null?p.reactionMs+' ms':p.score+' pts'}</b>{!race&&p.answered?' ✓':''}</span>)}</div></>
}
