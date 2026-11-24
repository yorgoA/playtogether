"use client";
import {useEffect,useRef,useState} from 'react';
import {allowSensors,defaults,observeMotion,type Calibration,type MotionFrame} from '@/lib/controller/motion';
export default function MotionControls({onShake,onSteer,onMode,racing=false}:{onShake?:()=>void,onSteer?:(v:number)=>void,onMode?:(v:'touch'|'motion'|'assisted')=>void,racing?:boolean}){
 const [enabled,setEnabled]=useState(false),[working,setWorking]=useState(false),[message,setMessage]=useState(''),[open,setOpen]=useState(false);
 const [frame,setFrame]=useState<MotionFrame>({steering:0,pitch:0,rotation:0,steady:false}),[settings,setSettings]=useState<Calibration>(defaults);
 const [assisted,setAssisted]=useState(false);
 const steer=useRef(onSteer);steer.current=onSteer;const mode=useRef(onMode);mode.current=onMode;
 useEffect(()=>{mode.current?.(enabled?(assisted?'assisted':'motion'):'touch')},[enabled,assisted]);
 const listener=useRef<ReturnType<typeof observeMotion>|null>(null),config=useRef(settings),callback=useRef(onShake);
 config.current=settings;callback.current=onShake;
 useEffect(()=>{try{const stored=localStorage.getItem('playtogether.motion');if(stored)setSettings({...defaults,...JSON.parse(stored)})}catch{}},[]);
 function adjust(value:Partial<Calibration>){const n={...settings,...value};setSettings(n);localStorage.setItem('playtogether.motion',JSON.stringify(n))}
 useEffect(()=>{
  if(!enabled)return;
  listener.current=observeMotion(()=>config.current,f=>{setFrame(f);steer.current?.(f.steering)},()=>callback.current?.(),()=>{setEnabled(false);setMessage('No motion data received. Touch controls are ready.')});
  return ()=>{listener.current?.stop();listener.current=null}
 },[enabled]);
 async function enable(){setWorking(true);try{await allowSensors();setEnabled(true);setMessage('Hold your phone straight, then set center.')}catch(e){setMessage(e instanceof Error?e.message:'Motion is unavailable. Touch controls are ready.')}finally{setWorking(false)}}
 return <section className="pt-motion"><button className="pt-text" aria-expanded={open} onClick={()=>setOpen(!open)}>Controller settings · {enabled?(racing?(assisted?'Assisted motion':'Motion steering'):'Shake + touch'):'Touch'}</button>
 {open&&<div className="pt-motion-settings"><button className="pt-secondary" disabled={working} onClick={()=>enabled?(setEnabled(false),setMessage('Touch controls active.')):enable()}>{enabled?'Use touch only':'Enable motion controls'}</button>
 {enabled&&<>{racing&&<label><input type="checkbox" checked={assisted} onChange={e=>setAssisted(e.target.checked)}/> Assisted motion · automatic acceleration</label>}<label>Sensitivity <input type="range" min=".5" max="2" step=".1" value={settings.sensitivity} onChange={e=>adjust({sensitivity:Number(e.target.value)})}/></label>
 <label>Dead zone <input type="range" min="0" max=".3" step=".01" value={settings.deadZone} onChange={e=>adjust({deadZone:Number(e.target.value)})}/></label>
 <label><input type="checkbox" checked={settings.invert} onChange={e=>adjust({invert:e.target.checked})}/> Invert steering</label>
 <button className="pt-secondary" onClick={()=>{listener.current?.calibrate();setMessage(racing?'Center set. Tilt gently to steer.':'Center set. Give your phone a small shake to react.')}}>Set center</button>
 <label>Live steering <meter min="-1" max="1" value={frame.steering}/><small>{Math.round(frame.steering*100)}%</small></label>
 </>}{message&&<p role="status">{message}</p>}</div>}</section>
}
