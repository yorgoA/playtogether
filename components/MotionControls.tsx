"use client";
import {useEffect,useRef,useState} from 'react';
import {allowSensors,observeShake} from '@/lib/controller/motion';
export default function MotionControls({onShake}:{onShake:()=>void}){
 const [enabled,setEnabled]=useState(false),[working,setWorking]=useState(false),[message,setMessage]=useState(''),[open,setOpen]=useState(false),[sensitivity,setSensitivity]=useState(1);
 const level=useRef(sensitivity),callback=useRef(onShake);
 level.current=sensitivity;callback.current=onShake;
 useEffect(()=>{try{const stored=Number(JSON.parse(localStorage.getItem('playtogether.motion')||'{}').sensitivity);if(stored)setSensitivity(stored)}catch{}},[]);
 function adjust(value:number){setSensitivity(value);localStorage.setItem('playtogether.motion',JSON.stringify({sensitivity:value}))}
 useEffect(()=>{
  if(!enabled)return;
  return observeShake(()=>level.current,()=>callback.current(),()=>{setEnabled(false);setMessage('No motion data received. Touch controls are ready.')});
 },[enabled]);
 async function enable(){setWorking(true);try{await allowSensors();setEnabled(true);setMessage('Flick your phone to shoot. Hold it still until the signal.')}catch(e){setMessage(e instanceof Error?e.message:'Motion is unavailable. Touch controls are ready.')}finally{setWorking(false)}}
 return <section className="pt-motion">{!enabled&&!open&&<p>Want to shoot by flicking your phone?</p>}<button className="pt-text" aria-expanded={open} onClick={()=>setOpen(!open)}>Controller settings · {enabled?'Shake + touch':'Touch'}</button>
 {open&&<div className="pt-motion-settings"><button className="pt-secondary" disabled={working} onClick={()=>enabled?(setEnabled(false),setMessage('Touch controls active.')):enable()}>{enabled?'Use touch only':'Enable shake'}</button>
 {enabled&&<label>Sensitivity <input type="range" min=".5" max="2" step=".1" value={sensitivity} onChange={e=>adjust(Number(e.target.value))}/></label>}
 {message&&<p role="status">{message}</p>}</div>}</section>
}
