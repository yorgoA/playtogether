"use client";
import {useEffect,useRef,useState} from 'react';
import {api,type Room,type Seat} from '@/lib/controller/room';
import MotionControls from './MotionControls';
type Mode='touch'|'motion'|'assisted';
const neutral={steering:0,accelerate:0,brake:0,powerUp:false};
export default function RaceController({seat,room}:{seat:Seat,room:Room}){
 const [mode,setMode]=useState<Mode>('touch'),[warning,setWarning]=useState(''),[pressed,setPressed]=useState<string[]>([]);
 const keys=useRef(new Set<string>()),steer=useRef(0),boost=useRef(false),modeRef=useRef(mode);
 modeRef.current=mode;
 const car=room.racers?.find(r=>r.id===seat.id);
 const finished=car?.finishedAt!=null;
 useEffect(()=>{
  const active=room.phase==='playing'&&!finished;
  keys.current.clear();boost.current=false;setPressed([]);
  if(!active)return;
  let alive=true,sending=false,lastSent=0,lastValue='';
  function clear(){keys.current.clear();boost.current=false;setPressed([])}
  const send=async()=>{
   if(sending||!alive)return;
   const k=keys.current,hidden=document.hidden;
   const drive=hidden?neutral:{steering:modeRef.current==='touch'?Number(k.has('Right'))-Number(k.has('Left')):Math.round(steer.current*100)/100,accelerate:Number(modeRef.current==='assisted'||k.has('Accelerate')),brake:Number(k.has('Brake')),drift:k.has('Drift'),powerUp:boost.current};
   const value=JSON.stringify(drive),t=Date.now();
   if(value===lastValue&&t-lastSent<500)return;
   sending=true;
   try{await api('/'+seat.code,{action:'drive',...drive},seat.token);lastValue=value;lastSent=t;boost.current=false;if(alive)setWarning('')}catch(e){if(alive)setWarning(e instanceof Error?e.message:'Connection interrupted.')}finally{sending=false}
  };
  const interval=setInterval(send,250);window.addEventListener('blur',clear);document.addEventListener('visibilitychange',clear);
  return ()=>{alive=false;clearInterval(interval);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',clear);keys.current.clear();boost.current=false};
 },[seat,room.phase,finished]);
 function change(key:string,down:boolean){if(down)keys.current.add(key);else keys.current.delete(key);setPressed(Array.from(keys.current))}
 const control=(label:string)=> <button key={label} type="button" data-active={pressed.includes(label)} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);change(label,true)}} onPointerUp={()=>change(label,false)} onPointerCancel={()=>change(label,false)} onLostPointerCapture={()=>change(label,false)} onKeyDown={e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();change(label,true)}}} onKeyUp={e=>{if([' ','Enter'].includes(e.key))change(label,false)}}>{label==='Left'?'◀':label==='Right'?'▶':label}<span className="pt-sr">{label==='Left'||label==='Right'?label:''}</span></button>;
 return <section className="pt-driver">{room.phase==='playing'&&!finished&&<><div className="pt-row"><b>Lap {Math.min(3,Math.floor(car?.progress??0)+1)} / 3</b><small>{mode==='touch'?'TOUCH':mode==='assisted'?'ASSISTED':'MOTION'}</small></div><div className="pt-pedals">{mode==='touch'&&[control('Left'),control('Right')]}{mode!=='assisted'&&control('Accelerate')}{control('Brake')}{control('Drift')}<button onClick={()=>{boost.current=true;navigator.vibrate?.(20)}} disabled={(car?.boostReadyAt??0)>room.serverTime}>Boost</button></div></>}
 {finished&&<p>Finish line crossed! Watch the TV for results.</p>}
 {warning&&<p role="status">{warning}</p>}
 {room.phase==='playing'&&!finished&&<p>{(car?.driftCharge??0)>=800?'Drift charged · release Drift to boost': 'Hold Drift and steer at speed to charge a boost.'}</p>}
 <MotionControls racing onSteer={v=>steer.current=v} onMode={setMode}/></section>
}
