"use client";
import {useEffect,useRef,useState} from 'react';
import {countdown,resultText,type Room} from '@/lib/controller/room';
import RaceTrack from './RaceTrack';

export default function KartStage({room,now}:{room:Room,now:number}){
  const mount=useRef<HTMLDivElement>(null);
  const state=useRef({room,received:0});
  const [failed,setFailed]=useState(false);
  useEffect(()=>{state.current={room,received:performance.now()}},[room]);
  useEffect(()=>{
    let active=true,dispose:(()=>void)|undefined;
    import('@/lib/arcade/karts').then(({launchKarts})=>{
      if(active && mount.current) dispose=launchKarts(mount.current,()=>state.current);
    }).catch(()=>{if(active)setFailed(true)});
    return ()=>{active=false;dispose?.()};
  },[room.code]);
  const count=room.phase==='playing'?countdown(room.startsAt,now):null;
  if(failed)return <>{count&&<p className="race-count flat" role="status">{count}</p>}<p>3D graphics unavailable on this display. Showing the race map.</p><RaceTrack room={room}/></>;
  return <div className="kart-stage" aria-label="Pinecrest Raceway chase cameras">
    <div className="kart-canvas" ref={mount}/>
    {room.racers.map((car,i)=>{
      const player=room.players.find(p=>p.id===car.id);
      const right=room.racers.length>=3 && i%2===1;
      const lower=room.racers.length===2?i===1:i>=2;
      return <div className="kart-hud" key={car.id} style={{left:right?'51%':'1%',top:lower?'52%':'2%',borderColor:player?.color}}>
        <b>{player?.name}</b> · {car.finishedAt&&player?'Finished '+resultText(room,player):'Lap '+Math.min(3,1+Math.floor(car.progress))+'/3'}
        {car.boostUntil>room.serverTime?' · BOOST':(car.driftCharge??0)>=800?' · Drift ready':''}
      </div>
    })}
    {count&&<div className="race-count" key={count} role="status">{count}</div>}
    {room.phase==='paused'&&<div className="arc-paused">Paused</div>}
  </div>
}
